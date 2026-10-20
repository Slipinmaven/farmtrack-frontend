import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { LoadingState } from "@/components/feedback/loading-state";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import type { LoginSession, SessionStatusFilter } from "@/features/auth/api";
import {
  useBlockLoginSession,
  useLoginSessions,
  useRevokeLoginSession,
  useUnblockDevice,
} from "@/features/auth/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { formatRelativeDate } from "@/lib/date/format-relative-date";
import { useTheme } from "@/providers/theme-provider";

const pageSize = 20;
const filters: { value: SessionStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
];

export function SessionHistoryPanel({
  userId,
}: {
  userId: string | undefined;
}) {
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const [showAll, setShowAll] = useState(false);
  const [status, setStatus] = useState<SessionStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [blockingSessionId, setBlockingSessionId] = useState<string | null>(
    null,
  );
  const sessions = useLoginSessions(userId, {
    limit: showAll ? pageSize : 5,
    offset: showAll ? offset : 0,
    status: showAll ? status : "all",
    search: showAll ? search : "",
  });
  const revoke = useRevokeLoginSession(userId ?? "");
  const block = useBlockLoginSession(userId ?? "");
  const unblock = useUnblockDevice(userId ?? "");

  async function endSession(session: LoginSession) {
    const confirmed = await dialog.confirmDialog({
      title: "End this session?",
      message: `${session.device_name} will be signed out and need to sign in again.`,
      confirmLabel: "End session",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await revoke.mutateAsync(session.id);
    } catch (error: unknown) {
      await dialog.showDialog({
        title: "Couldn’t end session",
        message: normalizeApiError(error).message,
        tone: "error",
      });
    }
  }

  async function blockInstallation(session: LoginSession, permanent: boolean) {
    const confirmed = await dialog.confirmDialog({
      title: permanent
        ? "Block this device permanently?"
        : "Block this device for 30 days?",
      message: `Sessions from ${session.device_name} will end. Reinstalling the app may be treated as a new device.`,
      confirmLabel: permanent ? "Block device" : "Block 30 days",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await block.mutateAsync({
        sessionId: session.id,
        permanent,
        durationDays: permanent ? undefined : 30,
      });
      setBlockingSessionId(null);
    } catch (error: unknown) {
      await dialog.showDialog({
        title: "Couldn’t block device",
        message: normalizeApiError(error).message,
        tone: "error",
      });
    }
  }

  async function unblockInstallation(deviceId: string, name: string) {
    const confirmed = await dialog.confirmDialog({
      title: "Allow this device again?",
      message: `${name} will be able to sign in with valid credentials.`,
      confirmLabel: "Unblock",
    });
    if (!confirmed) return;
    try {
      await unblock.mutateAsync(deviceId);
    } catch (error: unknown) {
      await dialog.showDialog({
        title: "Couldn’t unblock installation",
        message: normalizeApiError(error).message,
        tone: "error",
      });
    }
  }

  const result = sessions.data;
  const pageStart = result && result.total > 0 ? offset + 1 : 0;
  const pageEnd = result
    ? Math.min(offset + result.sessions.length, result.total)
    : 0;

  return (
    <View style={styles.container}>
      {sessions.isLoading ? (
        <LoadingState label="Loading sign-in activity" />
      ) : null}
      {sessions.isError ? (
        <Card style={styles.state}>
          <AppText weight="semibold">Couldn’t load sign-in activity</AppText>
          <AppText size="small" tone="secondary">
            {normalizeApiError(sessions.error).message}
          </AppText>
          <Button
            label="Retry"
            variant="secondary"
            onPress={() => void sessions.refetch()}
          />
        </Card>
      ) : null}

      {showAll ? (
        <>
          <View style={styles.filterRow}>
            {filters.map((filter) => {
              const selected = status === filter.value;
              return (
                <Pressable
                  key={filter.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => {
                    setStatus(filter.value);
                    setOffset(0);
                  }}
                  style={[
                    styles.filter,
                    {
                      backgroundColor: selected
                        ? theme.primary
                        : theme.backgroundElement,
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: selected ? theme.onPrimary : theme.text }}
                  >
                    {filter.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <TextField
            label="Search sign-ins"
            placeholder="Device, system, or network address"
            value={search}
            onChangeText={(value) => {
              setSearch(value);
              setOffset(0);
            }}
            returnKeyType="search"
          />
        </>
      ) : null}

      {!sessions.isLoading &&
      !sessions.isError &&
      result?.sessions.length === 0 ? (
        <Card style={styles.state}>
          <AppText weight="semibold">
            {search ? "No matching sign-ins" : "No sign-ins in this view"}
          </AppText>
          <AppText size="small" tone="secondary">
            Try another filter or search.
          </AppText>
        </Card>
      ) : null}

      {result?.sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          blocking={blockingSessionId === session.id}
          actionPending={revoke.isPending || block.isPending}
          onEnd={() => void endSession(session)}
          onActivity={() =>
            router.push(`/sessions/${session.id}/activity` as Href)
          }
          onToggleBlock={() =>
            setBlockingSessionId((current) =>
              current === session.id ? null : session.id,
            )
          }
          onBlock={(permanent) => void blockInstallation(session, permanent)}
        />
      ))}

      {!showAll && result && result.total > result.sessions.length ? (
        <Button
          label={`View all ${result.total} sign-ins`}
          variant="secondary"
          onPress={() => {
            setShowAll(true);
            setOffset(0);
          }}
        />
      ) : null}
      {showAll && result && result.total > 0 ? (
        <View style={styles.pagination}>
          <Button
            label="Previous"
            variant="secondary"
            disabled={offset === 0}
            onPress={() => setOffset(Math.max(0, offset - pageSize))}
          />
          <AppText size="small" tone="secondary" style={styles.pageCount}>
            {pageStart}–{pageEnd} of {result.total}
          </AppText>
          <Button
            label="Next"
            variant="secondary"
            disabled={pageEnd >= result.total}
            onPress={() => setOffset(offset + pageSize)}
          />
        </View>
      ) : null}
      {showAll ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setShowAll(false);
            setOffset(0);
            setSearch("");
            setStatus("all");
          }}
          style={styles.recentLink}
        >
          <AppText size="small" tone="muted" weight="semibold">
            Show recent sign-ins only
          </AppText>
        </Pressable>
      ) : null}

      {result?.blocked_devices.length ? (
        <>
          <AppText size="body" weight="semibold" style={styles.blockedTitle}>
            Blocked devices
          </AppText>
          {result.blocked_devices.map((device) => (
            <Card
              key={device.id}
              style={[
                styles.blockedRow,
                device.is_active && {
                  borderColor: `${theme.danger}66`,
                  backgroundColor: `${theme.danger}08`,
                },
              ]}
            >
              <View
                style={[
                  styles.blockedIndicator,
                  {
                    backgroundColor: device.is_active
                      ? `${theme.danger}18`
                      : theme.backgroundSelected,
                  },
                ]}
              >
                <Ionicons
                  name="ban-outline"
                  size={17}
                  color={device.is_active ? theme.danger : theme.textSecondary}
                />
              </View>
              <View style={styles.sessionCopy}>
                <AppText weight="semibold" numberOfLines={1}>
                  {device.device_name}
                </AppText>
                <AppText size="small" tone="secondary">
                  {!device.is_active
                    ? "Block expired"
                    : device.is_permanent
                      ? "Blocked permanently"
                      : `Blocked until ${formatDateTime(device.blocked_until!)}`}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Unblock ${device.device_name}`}
                disabled={unblock.isPending}
                onPress={() =>
                  void unblockInstallation(device.id, device.device_name)
                }
                style={({ pressed }) => [
                  styles.unblock,
                  { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <AppText size="small" weight="semibold">
                  Unblock
                </AppText>
              </Pressable>
            </Card>
          ))}
        </>
      ) : null}
    </View>
  );
}

function SessionCard({
  session,
  blocking,
  actionPending,
  onEnd,
  onActivity,
  onToggleBlock,
  onBlock,
}: {
  session: LoginSession;
  blocking: boolean;
  actionPending: boolean;
  onEnd: () => void;
  onActivity: () => void;
  onToggleBlock: () => void;
  onBlock: (permanent: boolean) => void;
}) {
  const { theme } = useTheme();
  const device = getDevicePresentation(session);
  const statusColor = session.device_is_blocked
    ? theme.danger
    : session.revoked_at
      ? theme.textSecondary
      : theme.success;
  const statusBackground = session.device_is_blocked
    ? `${theme.danger}18`
    : session.revoked_at
      ? theme.backgroundSelected
      : `${theme.success}1A`;

  return (
    <Card style={styles.sessionCard}>
      <View style={styles.sessionHeading}>
        <View
          style={[
            styles.deviceIcon,
            { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <Ionicons name={device.icon} size={19} color={theme.primary} />
        </View>
        <View style={styles.sessionCopy}>
          <AppText weight="semibold" numberOfLines={1}>
            {session.device_name}
          </AppText>
          <AppText size="small" tone="secondary" numberOfLines={2}>
            {device.description}
          </AppText>
        </View>
        <View
          style={[
            styles.status,
            {
              backgroundColor: statusBackground,
            },
          ]}
        >
          <AppText
            size="small"
            style={{
              color: statusColor,
            }}
          >
            {session.device_is_blocked
              ? "Blocked"
              : session.revoked_at
                ? "Ended"
                : session.is_current
                  ? "Current"
                  : "Active"}
          </AppText>
        </View>
      </View>
      <View style={styles.sessionFacts}>
        <SessionFact
          label="Signed in"
          value={formatDateTime(session.created_at)}
        />
        <SessionFact
          label="Last active"
          value={formatRelativeDate(session.last_seen_at)}
        />
        <SessionFact
          label="Network IP"
          value={session.ip_address ?? "Unavailable"}
        />
      </View>
      {session.revoked_at ? (
        <AppText size="small" tone="secondary">
          Ended {formatRelativeDate(session.revoked_at)}
          {session.revocation_reason === "device_blocked"
            ? " · device blocked"
            : session.revocation_reason === "password_changed"
              ? " · password changed"
              : ""}
        </AppText>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={onActivity}
          style={styles.activityLink}
        >
          <Ionicons name="list-outline" size={17} color={theme.primary} />
          <AppText size="small" weight="semibold" tone="muted">
            View activity
          </AppText>
        </Pressable>
        {!session.revoked_at && !session.is_current ? (
          <Pressable
            accessibilityRole="button"
            disabled={actionPending}
            onPress={onEnd}
            style={({ pressed }) => [
              styles.endButton,
              {
                backgroundColor: `${theme.danger}12`,
                borderColor: `${theme.danger}55`,
                opacity: pressed ? 0.72 : actionPending ? 0.55 : 1,
              },
            ]}
          >
            <Ionicons name="log-out-outline" size={16} color={theme.danger} />
            <AppText
              size="small"
              weight="semibold"
              style={{ color: theme.danger }}
            >
              End session
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {!session.revoked_at &&
      !session.is_current &&
      !session.is_current_device ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: blocking }}
            onPress={onToggleBlock}
            style={styles.blockLink}
          >
            <AppText size="small" tone="secondary">
              {blocking ? "Cancel device block" : "Block this device…"}
            </AppText>
            <Ionicons
              name={blocking ? "chevron-up" : "chevron-down"}
              size={16}
              color={theme.textSecondary}
            />
          </Pressable>
          {blocking ? (
            <View style={styles.blockChoices}>
              <Button
                label="30 days"
                variant="secondary"
                disabled={actionPending}
                onPress={() => onBlock(false)}
              />
              <Button
                label="Permanently"
                variant="secondary"
                disabled={actionPending}
                style={{ borderColor: `${theme.danger}66` }}
                onPress={() => onBlock(true)}
              />
            </View>
          ) : null}
        </>
      ) : null}
      {session.is_current_device && !session.is_current ? (
        <AppText size="small" tone="secondary">
          Another sign-in from this device; blocking it would also block this
          device.
        </AppText>
      ) : null}
    </Card>
  );
}

function SessionFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <AppText size="small" tone="secondary">
        {label}
      </AppText>
      <AppText size="small" weight="semibold">
        {value}
      </AppText>
    </View>
  );
}

function getDevicePresentation(session: LoginSession): {
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
} {
  const source =
    `${session.platform} ${session.user_agent ?? ""}`.toLowerCase();
  const computer = ["windows", "macintosh", "mac os", "linux", "x11"].some(
    (part) => source.includes(part),
  );
  const browser = source.includes("edg/")
    ? "Microsoft Edge"
    : source.includes("firefox/")
      ? "Firefox"
      : source.includes("chrome/") || source.includes("chromium/")
        ? "Chrome"
        : source.includes("safari/")
          ? "Safari"
          : null;
  const system = source.includes("windows")
    ? "Windows computer"
    : source.includes("macintosh") || source.includes("mac os")
      ? "Mac computer"
      : source.includes("linux") || source.includes("x11")
        ? "Linux computer"
        : source.includes("android")
          ? "Android device"
          : source.includes("iphone") ||
              source.includes("ipad") ||
              source.includes("ios")
            ? "Apple device"
            : source.includes("web") || source.includes("browser")
              ? "Web browser"
              : session.platform || "Unknown device";
  return {
    icon: computer
      ? "laptop-outline"
      : system === "Web browser"
        ? "globe-outline"
        : "phone-portrait-outline",
    description: browser ? `${system} · ${browser}` : system,
  };
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  state: { gap: 10 },
  filterRow: { flexDirection: "row", gap: 6 },
  filter: {
    minWidth: 62,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
  },
  sessionCard: { gap: 10 },
  sessionHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  deviceIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  sessionCopy: { flex: 1, gap: 2 },
  status: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  sessionFacts: { gap: 4 },
  fact: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(120, 120, 120, 0.25)",
    paddingTop: 8,
  },
  activityLink: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  endButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 11,
  },
  blockLink: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  blockChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  pageCount: { flex: 1, textAlign: "center" },
  recentLink: { alignSelf: "center", paddingVertical: 5 },
  blockedTitle: { marginTop: 9 },
  blockedRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  blockedIndicator: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  unblock: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
  },
});
