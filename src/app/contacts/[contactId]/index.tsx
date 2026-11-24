import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ContactTransactionHistoryItem } from "@/features/management/api";
import { ContactRoleBadge } from "@/features/management/components/contact-role-badge";
import {
  useContact,
  useContactTransactionHistory,
  useDeleteContact,
} from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function ContactDetailsRoute() {
  const { contactId } = useLocalSearchParams<{ contactId: string }>();
  return (
    <SessionGate>
      <ContactDetailsContent key={contactId} contactId={contactId} />
    </SessionGate>
  );
}

function ContactDetailsContent({ contactId }: { contactId: string }) {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const [historyOffset, setHistoryOffset] = useState(0);
  const contactQuery = useContact(user?.id, farm.selectedFarm?.id, contactId);
  const historyQuery = useContactTransactionHistory(
    user?.id,
    farm.selectedFarm?.id,
    contactId,
    historyOffset,
  );
  const remove = useDeleteContact(user?.id ?? "", farm.selectedFarm?.id ?? "");
  const contact = contactQuery.data;
  const history = historyQuery.data?.items ?? [];
  const totalTransactions = historyQuery.data?.total_count ?? 0;
  const pageSize = historyQuery.data?.limit ?? 25;
  const currentPage = Math.floor(historyOffset / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(totalTransactions / pageSize));
  const rangeStart = history.length ? historyOffset + 1 : 0;
  const rangeEnd = historyOffset + history.length;

  async function confirmDelete() {
    if (!contact) return;
    const confirmed = await dialog.confirmDialog({
      title: "Delete contact?",
      message: `“${contact.name}” will be permanently removed.`,
      confirmLabel: "Delete contact",
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await remove.mutateAsync(contact.id);
      await dialog.showDialog({
        title: "Contact deleted",
        message: `${contact.name} has been removed.`,
        tone: "success",
      });
      router.replace("/contacts");
    } catch (error: unknown) {
      await dialog.showDialog({
        title: "Couldn’t delete contact",
        message: normalizeApiError(error).message,
        tone: "error",
      });
    }
  }

  async function openContactLink(url: string, target: string) {
    try {
      if (!(await Linking.canOpenURL(url))) {
        throw new Error(`No compatible ${target} app is available.`);
      }
      await Linking.openURL(url);
    } catch (error: unknown) {
      await dialog.showDialog({
        title: `Couldn’t open ${target}`,
        message:
          error instanceof Error
            ? error.message
            : `No compatible ${target} app could open this link.`,
        tone: "error",
      });
    }
  }

  if (contactQuery.isLoading) return <LoadingState label="Loading contact" />;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={contactQuery.isRefetching || historyQuery.isRefetching}
            onRefresh={() =>
              void Promise.all([contactQuery.refetch(), historyQuery.refetch()])
            }
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader title="Contact details" showBack backHref="/contacts" />
        {contactQuery.isError ? (
          <Card style={styles.state}>
            <AppText weight="semibold">Could not load this contact</AppText>
            <AppText size="small" tone="secondary">
              {normalizeApiError(contactQuery.error).message}
            </AppText>
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => void contactQuery.refetch()}
            />
          </Card>
        ) : null}
        {contact ? (
          <>
            <Card
              style={[
                styles.profileCard,
                { borderColor: theme.border, backgroundColor: theme.backgroundElement },
              ]}
            >
              <View
                style={[
                  styles.profileAccent,
                  { backgroundColor: theme.primary },
                ]}
              />
              <View style={styles.profileContent}>
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <AppText
                    size="heading"
                    weight="semibold"
                    style={{ color: theme.primary }}
                  >
                    {contactInitials(contact.name)}
                  </AppText>
                </View>
                <View style={styles.titleCopy}>
                  <AppText size="small" tone="secondary">
                    {farm.selectedFarm?.name ?? "Farm"} · Contact
                  </AppText>
                  <AppText
                    size="heading"
                    weight="semibold"
                    style={styles.contactName}
                  >
                    {contact.name}
                  </AppText>
                  <View style={styles.roles}>
                    {contact.roles.map((role) => (
                      <ContactRoleBadge key={role} role={role} />
                    ))}
                  </View>
                </View>
              </View>
            </Card>

            <Card style={[styles.section, styles.informationCard]}>
              <View style={styles.sectionHeading}>
                <View style={styles.sectionHeadingCopy}>
                  <AppText size="body" weight="semibold">
                    Contact information
                  </AppText>
                  <AppText size="small" tone="secondary">
                    Ways to reach this contact.
                  </AppText>
                </View>
                <View
                  style={[
                    styles.sectionIcon,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color={theme.primary}
                  />
                </View>
              </View>
              {contact.phone?.trim() ? (
                <InfoRow
                  icon="call-outline"
                  label="Phone"
                  value={contact.phone}
                  onPress={() =>
                    void openContactLink(
                      `tel:${contact.phone!.replace(/[^\d+]/g, "")}`,
                      "phone app",
                    )
                  }
                />
              ) : null}
              {contact.email?.trim() ? (
                <InfoRow
                  icon="mail-outline"
                  label="Email"
                  value={contact.email}
                  onPress={() =>
                    void openContactLink(
                      `mailto:${encodeURIComponent(contact.email!.trim())}`,
                      "email app",
                    )
                  }
                />
              ) : null}
              {contact.address?.trim() ? (
                <InfoRow
                  icon="location-outline"
                  label="Address"
                  value={contact.address}
                />
              ) : null}
              {!contact.phone?.trim() &&
              !contact.email?.trim() &&
              !contact.address?.trim() &&
              !contact.notes?.trim() ? (
                <AppText size="small" tone="secondary">
                  No contact details have been added yet.
                </AppText>
              ) : null}
              {contact.notes?.trim() ? (
                <View
                  style={[
                    styles.notes,
                    { backgroundColor: theme.background },
                  ]}
                >
                  <AppText size="small" weight="semibold" tone="secondary">
                    Notes
                  </AppText>
                  <AppText>{contact.notes}</AppText>
                </View>
              ) : null}
            </Card>

            <Card style={styles.section}>
              <View style={styles.historyHeading}>
                <View style={styles.historyHeadingCopy}>
                  <AppText
                    size="body"
                    weight="semibold"
                    style={styles.historyTitle}
                  >
                    Transactions
                  </AppText>
                  <AppText size="small" tone="secondary">
                    Sales and purchases with this contact.
                  </AppText>
                </View>
                {historyQuery.data ? (
                  <AppText
                    size="small"
                    tone="secondary"
                    style={styles.recordCount}
                  >
                    {rangeStart}–{rangeEnd} of {totalTransactions}
                  </AppText>
                ) : null}
              </View>
              {historyQuery.isLoading ? (
                <AppText size="small" tone="secondary">
                  Loading transaction history…
                </AppText>
              ) : null}
              {historyQuery.isError ? (
                <View style={styles.historyError}>
                  <AppText size="small">
                    Could not load transaction history.{" "}
                    {normalizeApiError(historyQuery.error).message}
                  </AppText>
                  <Button
                    label="Retry history"
                    variant="secondary"
                    onPress={() => void historyQuery.refetch()}
                  />
                </View>
              ) : null}
              {!historyQuery.isLoading &&
              !historyQuery.isError &&
              totalTransactions === 0 ? (
                <AppText size="small" tone="secondary">
                  No sales or purchases have been recorded for this contact.
                </AppText>
              ) : null}
              {history.map((item) => (
                <TransactionHistoryRow key={item.id} item={item} />
              ))}
              {totalTransactions > pageSize ? (
                <View style={styles.pagination}>
                  <Button
                    label="Previous"
                    variant="secondary"
                    disabled={historyOffset === 0 || historyQuery.isFetching}
                    onPress={() =>
                      setHistoryOffset((current) =>
                        Math.max(0, current - pageSize),
                      )
                    }
                  />
                  <AppText
                    size="small"
                    tone="secondary"
                    style={styles.pageNumber}
                  >
                    Page {currentPage} of {totalPages}
                  </AppText>
                  <Button
                    label="Next"
                    variant="secondary"
                    disabled={
                      historyOffset + history.length >= totalTransactions ||
                      historyQuery.isFetching
                    }
                    onPress={() => setHistoryOffset((current) => current + pageSize)}
                  />
                </View>
              ) : null}
            </Card>
          </>
        ) : null}
      </ScrollView>
      {contact && !contactQuery.isError ? (
        <View
          style={[
            styles.actionBar,
            {
              borderTopColor: theme.border,
              backgroundColor: theme.background,
            },
          ]}
        >
          <View style={styles.actions}>
            <Button
              label="Edit contact"
              style={styles.editAction}
              onPress={() =>
                router.push({
                  pathname: "/contacts/[contactId]/edit",
                  params: { contactId: contact.id },
                })
              }
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete contact"
              accessibilityState={{ disabled: remove.isPending }}
              disabled={remove.isPending}
              onPress={() => void confirmDelete()}
              style={({ pressed }) => [
                styles.deleteAction,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.backgroundElement,
                  opacity: pressed || remove.isPending ? 0.7 : 1,
                },
              ]}
            >
              {remove.isPending ? (
                <AppText size="small" style={{ color: theme.danger }}>
                  Deleting…
                </AppText>
              ) : (
                <>
                  <Ionicons
                    name="trash-outline"
                    size={17}
                    color={theme.danger}
                  />
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: theme.danger }}
                  >
                    Delete
                  </AppText>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function TransactionHistoryRow({
  item,
}: {
  item: ContactTransactionHistoryItem;
}) {
  const { theme } = useTheme();
  const isSale = item.transaction_type === "sale";
  const balanceDue = Number(item.balance_due);
  const creditBalance = Number(item.credit_balance);
  const balanceLabel =
    balanceDue > 0
      ? isSale
        ? `Customer owes ${formatMoney(balanceDue, theme.currency)}`
        : `You owe supplier ${formatMoney(balanceDue, theme.currency)}`
      : creditBalance > 0
        ? isSale
          ? `Customer credit ${formatMoney(creditBalance, theme.currency)}`
          : `Supplier credit ${formatMoney(creditBalance, theme.currency)}`
        : item.status === "cancelled"
          ? "Cancelled"
          : "Settled";
  const balanceColor =
    balanceDue > 0
      ? theme.danger
      : creditBalance > 0
        ? theme.success
        : theme.textSecondary;
  const transactionHref = (
    isSale ? `/sales/${item.id}` : `/purchases/${item.id}`
  ) as Href;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${isSale ? "Sale" : "Purchase"} ${item.reference_number ?? ""}, ${balanceLabel}`}
      onPress={() => router.push(transactionHref)}
      style={({ pressed }) => [
        styles.transactionRow,
        { borderColor: theme.border, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <View
        style={[
          styles.transactionIcon,
          { backgroundColor: theme.background },
        ]}
      >
        <Ionicons
          name={isSale ? "trending-up-outline" : "trending-down-outline"}
          size={18}
          color={theme.primary}
        />
      </View>
      <View style={styles.transactionCopy}>
        <View style={styles.transactionTitleLine}>
          <AppText weight="semibold">
            {isSale ? "Sale" : "Purchase"}
          </AppText>
          <AppText
            size="small"
            weight="semibold"
            style={styles.transactionAmount}
          >
            {formatMoney(item.transaction_total, theme.currency)}
          </AppText>
        </View>
        <AppText
          size="small"
          tone="secondary"
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {item.reference_number ?? "No reference"}
        </AppText>
        <AppText size="small" tone="secondary">
          {formatTransactionDate(item.transaction_date)} · {item.item_count}{" "}
          {item.item_count === 1 ? "item" : "items"}
        </AppText>
        <AppText
          size="small"
          weight="semibold"
          style={[styles.balanceLabel, { color: balanceColor }]}
        >
          {balanceLabel}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

function InfoRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `${label}: ${value}` : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.infoRow,
        { borderBottomColor: theme.border, opacity: pressed ? 0.68 : 1 },
      ]}
    >
      <View
        style={[
          styles.infoIcon,
          { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <Ionicons name={icon} size={17} color={theme.primary} />
      </View>
      <View style={styles.infoCopy}>
        <AppText size="small" tone="secondary">
          {label}
        </AppText>
        <AppText style={styles.wrappingText}>{value}</AppText>
      </View>
      {onPress ? (
        <Ionicons
          name="open-outline"
          size={16}
          color={theme.textSecondary}
        />
      ) : null}
    </Pressable>
  );
}

function formatMoney(value: number | string, currency: string): string {
  return `${currency} ${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value))}`;
}

function formatTransactionDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function contactInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 16,
    paddingBottom: 20,
    gap: 12,
  },
  state: { gap: 10 },
  profileCard: {
    padding: 0,
    overflow: "hidden",
    borderRadius: 16,
  },
  profileAccent: { height: 5 },
  profileContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    minWidth: 0,
  },
  avatar: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  titleCopy: { flex: 1, gap: 5, minWidth: 0 },
  contactName: { flexShrink: 1 },
  roles: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 2 },
  section: { gap: 12, borderRadius: 14 },
  informationCard: { paddingVertical: 15 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 1,
  },
  sectionHeadingCopy: { flex: 1, gap: 3, minWidth: 0 },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  infoRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCopy: { flex: 1, gap: 2, minWidth: 0 },
  wrappingText: { flexShrink: 1 },
  notes: { gap: 5, padding: 12, borderRadius: 10, minWidth: 0 },
  historyHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  historyHeadingCopy: { flex: 1, gap: 3, minWidth: 0 },
  historyTitle: { flexShrink: 1 },
  recordCount: { flexShrink: 0, textAlign: "right" },
  historyError: { gap: 8 },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pageNumber: { flex: 1, textAlign: "center" },
  transactionRow: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    minWidth: 0,
  },
  transactionIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  transactionCopy: { flex: 1, gap: 2, minWidth: 0 },
  transactionTitleLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  transactionAmount: { flexShrink: 1, textAlign: "right" },
  balanceLabel: { flexShrink: 1 },
  actionBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  actions: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  editAction: { flex: 1 },
  deleteAction: {
    minHeight: 48,
    minWidth: 102,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 8,
  },
});
