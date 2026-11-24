import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import {
  useAcceptFarmInvitation,
  useFarmInvitations,
  useFarmMembers,
  useInviteFarmMember,
  useResendFarmInvitation,
  useRevokeFarmMember,
  useUpdateFarmMemberRole,
} from "@/features/farms/hooks";
import type { FarmMembership, FarmRole } from "@/features/farms/types";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type InviteRole = Exclude<FarmRole, "owner">;

const memberRoles: InviteRole[] = ["manager", "worker"];

function SectionHeading({
  icon,
  title,
  detail,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.sectionHeading}>
      <View
        style={[
          styles.sectionIcon,
          { backgroundColor: `${theme.primary}18` },
        ]}
      >
        <Ionicons name={icon} size={19} color={theme.primary} />
      </View>
      <View style={styles.sectionCopy}>
        <AppText size="body" weight="semibold">
          {title}
        </AppText>
        <AppText size="small" tone="secondary">
          {detail}
        </AppText>
      </View>
    </View>
  );
}

function RoleLabel({ role }: { role: FarmRole }) {
  const { theme } = useTheme();
  const isManager = role === "manager";
  return (
    <View
      style={[
        styles.rolePill,
        {
          backgroundColor: isManager
            ? `${theme.primary}16`
            : theme.backgroundSelected,
        },
      ]}
    >
      <Ionicons
        name={isManager ? "shield-checkmark-outline" : "leaf-outline"}
        size={14}
        color={isManager ? theme.primary : theme.textSecondary}
      />
      <AppText
        size="small"
        weight="semibold"
        style={{ color: isManager ? theme.primary : theme.text }}
      >
        {role === "owner" ? "Owner" : isManager ? "Manager" : "Worker"}
      </AppText>
    </View>
  );
}

function DeliveryNotice({ membership }: { membership: FarmMembership }) {
  const { theme } = useTheme();
  const status = membership.invitation_email_status;
  const details = {
    sent: {
      icon: "checkmark-circle-outline" as const,
      color: theme.success,
      text: "Invitation email sent",
    },
    queued: {
      icon: "time-outline" as const,
      color: theme.secondary,
      text: "Invitation email is queued for delivery",
    },
    failed: {
      icon: "alert-circle-outline" as const,
      color: theme.danger,
      text: "Invitation email could not be delivered",
    },
    not_configured: {
      icon: "mail-unread-outline" as const,
      color: theme.secondary,
      text: "Email delivery is not configured",
    },
    cancelled: {
      icon: "remove-circle-outline" as const,
      color: theme.textSecondary,
      text: "Invitation email was cancelled",
    },
  }[status];
  return (
    <View style={styles.deliveryNotice}>
      <Ionicons name={details.icon} size={16} color={details.color} />
      <AppText
        size="small"
        style={[styles.deliveryText, { color: details.color }]}
      >
        {details.text}
      </AppText>
    </View>
  );
}

function MemberCard({
  membership,
  isOwner,
  canManage,
  pending,
  onResend,
  onChangeRole,
  onRevoke,
}: {
  membership: FarmMembership;
  isOwner: boolean;
  canManage: boolean;
  pending: boolean;
  onResend: () => void;
  onChangeRole: () => void;
  onRevoke: () => void;
}) {
  const { theme } = useTheme();
  const invited = membership.status === "invited";
  return (
    <Card style={styles.memberCard}>
      <View style={styles.memberHeader}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <AppText weight="semibold" style={{ color: theme.primary }}>
            {(membership.email ?? "F").slice(0, 1).toUpperCase()}
          </AppText>
        </View>
        <View style={styles.memberIdentity}>
          <AppText weight="semibold" numberOfLines={2}>
            {membership.email ??
              (membership.role === "owner" ? "Farm owner" : "Email unavailable")}
          </AppText>
          <View style={styles.memberMeta}>
            <RoleLabel role={membership.role} />
            {invited ? (
              <View
                style={[
                  styles.invitedPill,
                  { backgroundColor: `${theme.secondary}18` },
                ]}
              >
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: theme.secondary }}
                >
                  Invitation pending
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {invited ? <DeliveryNotice membership={membership} /> : null}

      {canManage && membership.role !== "owner" ? (
        <View style={styles.memberActions}>
          {invited ? (
            <Pressable
              accessibilityRole="button"
              disabled={pending}
              onPress={onResend}
              style={({ pressed }) => [
                styles.memberAction,
                {
                  borderColor: theme.border,
                  backgroundColor: pressed
                    ? theme.backgroundSelected
                    : theme.background,
                  opacity: pending ? 0.55 : 1,
                },
              ]}
            >
              {pending ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Ionicons name="mail-outline" size={16} color={theme.primary} />
              )}
              <AppText size="small" weight="semibold">
                Resend invite
              </AppText>
            </Pressable>
          ) : null}
          {isOwner ? (
            <Pressable
              accessibilityRole="button"
              disabled={pending}
              onPress={onChangeRole}
              style={({ pressed }) => [
                styles.memberAction,
                {
                  borderColor: theme.border,
                  backgroundColor: pressed
                    ? theme.backgroundSelected
                    : theme.background,
                  opacity: pending ? 0.55 : 1,
                },
              ]}
            >
              <Ionicons
                name="swap-horizontal-outline"
                size={16}
                color={theme.textSecondary}
              />
              <AppText size="small" weight="semibold">
                Change role
              </AppText>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={pending}
            onPress={onRevoke}
            style={({ pressed }) => [
              styles.memberAction,
              {
                borderColor: `${theme.danger}55`,
                backgroundColor: `${theme.danger}0C`,
                opacity: pending ? 0.55 : pressed ? 0.75 : 1,
              },
            ]}
          >
            <Ionicons name="person-remove-outline" size={16} color={theme.danger} />
            <AppText
              size="small"
              weight="semibold"
              style={{ color: theme.danger }}
            >
              Remove
            </AppText>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

function IncomingInvitationCard({
  membership,
  pending,
  onAccept,
}: {
  membership: FarmMembership;
  pending: boolean;
  onAccept: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Card
      style={[
        styles.invitationCard,
        {
          borderColor: `${theme.primary}55`,
          borderLeftColor: theme.primary,
        },
      ]}
    >
      <View style={styles.invitationTop}>
        <View
          style={[
            styles.invitationIcon,
            { backgroundColor: `${theme.primary}18` },
          ]}
        >
          <Ionicons name="mail-open-outline" size={20} color={theme.primary} />
        </View>
        <View style={styles.invitationCopy}>
          <AppText weight="semibold" numberOfLines={2}>
            {membership.farm_name ?? "Farm invitation"}
          </AppText>
          <AppText size="small" tone="secondary" numberOfLines={2}>
            You’ve been invited as a {membership.role}.
          </AppText>
        </View>
        <RoleLabel role={membership.role} />
      </View>
      <DeliveryNotice membership={membership} />
      <Button
        label="Accept invitation"
        loading={pending}
        onPress={onAccept}
      />
    </Card>
  );
}

export default function FarmTeamScreen() {
  const auth = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("worker");
  const [createAccount, setCreateAccount] = useState(false);
  const [initialPassword, setInitialPassword] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingMembershipId, setPendingMembershipId] = useState<string | null>(
    null,
  );

  const userId = auth.user?.id;
  const farmId = farm.selectedFarm?.id;
  const isOwner = Boolean(userId && farm.selectedFarm?.owner_id === userId);
  const members = useFarmMembers(userId, farmId);
  const incomingInvitations = useFarmInvitations(userId);
  const invite = useInviteFarmMember(userId ?? "", farmId ?? "");
  const accept = useAcceptFarmInvitation(userId ?? "");
  const resend = useResendFarmInvitation(userId ?? "", farmId ?? "");
  const updateRole = useUpdateFarmMemberRole(userId ?? "", farmId ?? "");
  const revoke = useRevokeFarmMember(userId ?? "", farmId ?? "");
  const myMembership = members.data?.find(
    (membership) => membership.user_id === userId,
  );
  const canManage = isOwner || myMembership?.role === "manager";
  const teamMembers = members.data ?? [];
  const memberCount = members.data
    ? new Set([
        ...members.data.map((membership) => membership.user_id),
        farm.selectedFarm?.owner_id,
      ].filter((id): id is string => Boolean(id))).size
    : 0;
  const receivedInvitations =
    incomingInvitations.data?.filter(
      (membership) => membership.status === "invited",
    ) ?? [];

  if (auth.status === "loading") return <LoadingState />;
  if (auth.status === "anonymous") return <Redirect href="/(auth)/login" />;
  if (auth.status === "blocked") return <Redirect href="/device-blocked" />;
  if (auth.status === "error") {
    return <Redirect href="/(auth)/login" />;
  }

  async function submitInvitation() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setPageError("Enter a valid email address for the person you’re inviting.");
      return;
    }
    if (createAccount && initialPassword.length < 8) {
      setPageError("Use at least 8 characters for the initial password.");
      return;
    }
    setPageError(null);
    setFeedback(null);
    try {
      const membership = await invite.mutateAsync({
        email,
        role: inviteRole,
        createAccount,
        ...(createAccount ? { initialPassword } : {}),
      });
      setInviteEmail("");
      setInitialPassword("");
      setCreateAccount(false);
      setInviteOpen(false);
      const status = membership.invitation_email_status;
      setFeedback(
        status === "sent"
          ? `Invitation sent to ${membership.email}.`
          : status === "queued"
            ? `Invitation saved. Email to ${membership.email} is queued for delivery.`
            : status === "not_configured"
              ? `Invitation saved, but email delivery is not configured for ${membership.email}.`
              : `Invitation saved for ${membership.email}. Check its email status below.`,
      );
    } catch (error: unknown) {
      setPageError(normalizeApiError(error).message);
    }
  }

  async function acceptInvitation(membership: FarmMembership) {
    setPendingMembershipId(membership.id);
    setPageError(null);
    try {
      await accept.mutateAsync(membership.id);
      setFeedback(
        `You’ve joined ${membership.farm_name ?? "the farm"}. It will appear in your farm switcher.`,
      );
    } catch (error: unknown) {
      setPageError(normalizeApiError(error).message);
    } finally {
      setPendingMembershipId(null);
    }
  }

  async function resendInvitation(membership: FarmMembership) {
    setPendingMembershipId(membership.id);
    setPageError(null);
    try {
      const updated = await resend.mutateAsync(membership.id);
      setFeedback(
        updated.invitation_email_status === "sent"
          ? `Invitation email resent to ${updated.email}.`
          : updated.invitation_email_status === "queued"
            ? `A new invitation email to ${updated.email} is queued for delivery.`
            : `The invitation was kept, but its email could not be sent. Review the delivery status below.`,
      );
    } catch (error: unknown) {
      setPageError(normalizeApiError(error).message);
    } finally {
      setPendingMembershipId(null);
    }
  }

  async function changeMemberRole(membership: FarmMembership) {
    const nextRole: InviteRole =
      membership.role === "manager" ? "worker" : "manager";
    const confirmed = await dialog.confirmDialog({
      title: nextRole === "manager" ? "Make this person a manager?" : "Change to worker?",
      message:
        nextRole === "manager"
          ? `${membership.email} will be able to manage this farm’s team, including inviting workers and changing worker access.`
          : `${membership.email} will lose manager access and remain a worker on this farm.`,
      confirmLabel: nextRole === "manager" ? "Make manager" : "Change role",
    });
    if (!confirmed) return;
    setPendingMembershipId(membership.id);
    setPageError(null);
    try {
      await updateRole.mutateAsync({
        membershipId: membership.id,
        role: nextRole,
      });
      setFeedback(`${membership.email} is now a ${nextRole}.`);
    } catch (error: unknown) {
      setPageError(normalizeApiError(error).message);
    } finally {
      setPendingMembershipId(null);
    }
  }

  async function removeMember(membership: FarmMembership) {
    const confirmed = await dialog.confirmDialog({
      title:
        membership.status === "invited"
          ? "Cancel this invitation?"
          : "Remove this person from the farm?",
      message:
        membership.status === "invited"
          ? `${membership.email} will no longer be able to accept this invitation.`
          : `${membership.email} will lose access to this farm and its shared records.`,
      confirmLabel: membership.status === "invited" ? "Cancel invitation" : "Remove access",
      destructive: true,
    });
    if (!confirmed) return;
    setPendingMembershipId(membership.id);
    setPageError(null);
    try {
      await revoke.mutateAsync(membership.id);
      setFeedback(
        membership.status === "invited"
          ? `The invitation for ${membership.email} was cancelled.`
          : `${membership.email} no longer has access to this farm.`,
      );
    } catch (error: unknown) {
      setPageError(normalizeApiError(error).message);
    } finally {
      setPendingMembershipId(null);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <SafeAreaView
        style={[styles.screen, { backgroundColor: theme.background }]}
        edges={["top", "bottom"]}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <FarmPageHeader title="Team & invitations" showBack />

          <View
            style={[
              styles.hero,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <View
              style={[
                styles.heroIcon,
                { backgroundColor: `${theme.primary}18` },
              ]}
            >
              <Ionicons name="people-outline" size={25} color={theme.primary} />
            </View>
            <View style={styles.heroCopy}>
              <AppText size="heading" weight="semibold">
                Work better, together.
              </AppText>
              <AppText size="small" tone="secondary">
                Invite people to this farm and choose what level of access they
                need.
              </AppText>
            </View>
            {farm.selectedFarm ? (
              <View
                style={[
                  styles.farmPill,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons name="leaf-outline" size={14} color={theme.primary} />
                <AppText size="small" weight="semibold" numberOfLines={1}>
                  {farm.selectedFarm.name}
                </AppText>
              </View>
            ) : null}
          </View>

          {pageError ? (
            <View
              accessibilityRole="alert"
              style={[
                styles.feedback,
                {
                  backgroundColor: `${theme.danger}10`,
                  borderColor: `${theme.danger}44`,
                },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={theme.danger}
              />
              <AppText
                size="small"
                style={[styles.feedbackCopy, { color: theme.danger }]}
              >
                {pageError}
              </AppText>
            </View>
          ) : null}
          {feedback ? (
            <View
              accessibilityLiveRegion="polite"
              style={[
                styles.feedback,
                {
                  backgroundColor: `${theme.success}12`,
                  borderColor: `${theme.success}44`,
                },
              ]}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={18}
                color={theme.success}
              />
              <AppText
                size="small"
                style={[styles.feedbackCopy, { color: theme.success }]}
              >
                {feedback}
              </AppText>
            </View>
          ) : null}

          {farmId ? (
            <>
              <View style={styles.sectionHeaderRow}>
                <SectionHeading
                  icon="people-circle-outline"
                  title="People on this farm"
                  detail={
                    members.data
                      ? `${memberCount} member${memberCount === 1 ? "" : "s"}`
                      : "Farm access and roles"
                  }
                />
                {canManage ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setInviteOpen((open) => !open);
                      setPageError(null);
                    }}
                    style={({ pressed }) => [
                      styles.inviteToggle,
                      {
                        backgroundColor: pressed
                          ? theme.backgroundSelected
                          : theme.primary,
                      },
                    ]}
                  >
                    <Ionicons
                      name={inviteOpen ? "close" : "person-add-outline"}
                      size={17}
                      color={inviteOpen ? theme.text : theme.onPrimary}
                    />
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{
                        color: inviteOpen ? theme.text : theme.onPrimary,
                      }}
                    >
                      {inviteOpen ? "Close" : "Invite"}
                    </AppText>
                  </Pressable>
                ) : null}
              </View>

              {inviteOpen && canManage ? (
                <Card style={styles.inviteCard}>
                  <View style={styles.formIntro}>
                    <AppText size="body" weight="semibold">
                      Add someone to {farm.selectedFarm?.name}
                    </AppText>
                    <AppText size="small" tone="secondary">
                      They’ll receive an email with instructions to join this
                      farm.
                    </AppText>
                  </View>
                  <TextField
                    label="Their email address"
                    placeholder="name@example.com"
                    value={inviteEmail}
                    onChangeText={setInviteEmail}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    returnKeyType="next"
                  />
                  <View style={styles.formGroup}>
                    <AppText size="small" weight="semibold">
                      Farm role
                    </AppText>
                    <View style={styles.roleOptions}>
                      {memberRoles
                        .filter((role) => isOwner || role === "worker")
                        .map((role) => {
                          const selected = inviteRole === role;
                          return (
                            <Pressable
                              key={role}
                              accessibilityRole="radio"
                              accessibilityState={{ checked: selected }}
                              onPress={() => setInviteRole(role)}
                              style={[
                                styles.roleOption,
                                {
                                  backgroundColor: selected
                                    ? `${theme.primary}12`
                                    : theme.background,
                                  borderColor: selected
                                    ? theme.primary
                                    : theme.border,
                                },
                              ]}
                            >
                              <View style={styles.roleOptionTop}>
                                <RoleLabel role={role} />
                                {selected ? (
                                  <Ionicons
                                    name="checkmark-circle"
                                    size={18}
                                    color={theme.primary}
                                  />
                                ) : null}
                              </View>
                              <AppText size="small" tone="secondary">
                                {role === "manager"
                                  ? "Can manage farm team access and invite workers."
                                  : "Can use the farm workspace with worker access."}
                              </AppText>
                            </Pressable>
                          );
                        })}
                    </View>
                    {!isOwner ? (
                      <AppText size="small" tone="secondary">
                        Managers can invite workers. Only the farm owner can
                        assign or change manager access.
                      </AppText>
                    ) : null}
                  </View>

                  {isOwner ? (
                    <View style={styles.formGroup}>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: createAccount }}
                        onPress={() => {
                          setCreateAccount((value) => !value);
                          setInitialPassword("");
                        }}
                        style={styles.createAccountToggle}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            {
                              backgroundColor: createAccount
                                ? theme.primary
                                : "transparent",
                              borderColor: createAccount
                                ? theme.primary
                                : theme.border,
                            },
                          ]}
                        >
                          {createAccount ? (
                            <Ionicons
                              name="checkmark"
                              size={14}
                              color={theme.onPrimary}
                            />
                          ) : null}
                        </View>
                        <View style={styles.createAccountCopy}>
                          <AppText size="small" weight="semibold">
                            Create a FarmTrack account for them
                          </AppText>
                          <AppText size="small" tone="secondary">
                            Only select this if they do not already have an
                            account.
                          </AppText>
                        </View>
                      </Pressable>
                      {createAccount ? (
                        <View
                          style={[
                            styles.passwordNote,
                            {
                              backgroundColor: `${theme.secondary}12`,
                              borderColor: `${theme.secondary}44`,
                            },
                          ]}
                        >
                          <Ionicons
                            name="lock-closed-outline"
                            size={17}
                            color={theme.secondary}
                          />
                          <AppText
                            size="small"
                            style={styles.passwordNoteCopy}
                          >
                            Set an initial password and share it with them
                            privately. FarmTrack will not include it in their
                            invitation email.
                          </AppText>
                        </View>
                      ) : null}
                      {createAccount ? (
                        <TextField
                          label="Initial password"
                          value={initialPassword}
                          onChangeText={setInitialPassword}
                          secureTextEntry
                          autoCapitalize="none"
                          autoComplete="new-password"
                          textContentType="newPassword"
                        />
                      ) : null}
                    </View>
                  ) : null}

                  <Button
                    label="Send farm invitation"
                    loading={invite.isPending}
                    disabled={
                      !inviteEmail.trim() ||
                      (createAccount && initialPassword.length < 8)
                    }
                    onPress={() => void submitInvitation()}
                  />
                </Card>
              ) : null}

              {members.isLoading ? (
                <LoadingState label="Loading farm team" />
              ) : null}
              {members.isError ? (
                <Card style={styles.stateCard}>
                  <View
                    style={[
                      styles.stateIcon,
                      { backgroundColor: `${theme.secondary}18` },
                    ]}
                  >
                    <Ionicons
                      name="people-outline"
                      size={22}
                      color={theme.secondary}
                    />
                  </View>
                  <View style={styles.stateCopy}>
                    <AppText weight="semibold">
                      {normalizeApiError(members.error).status === 403
                        ? "Team management needs a manager role"
                        : "Couldn’t load this farm’s team"}
                    </AppText>
                    <AppText size="small" tone="secondary">
                      {normalizeApiError(members.error).status === 403
                        ? "Only the farm owner and managers can view the member list. You can still review invitations sent to you below."
                        : normalizeApiError(members.error).message}
                    </AppText>
                  </View>
                  {normalizeApiError(members.error).status !== 403 ? (
                    <Button
                      label="Retry"
                      variant="secondary"
                      onPress={() => void members.refetch()}
                    />
                  ) : null}
                </Card>
              ) : null}

              {members.data && teamMembers.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <View
                    style={[
                      styles.emptyIcon,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <Ionicons
                      name="people-outline"
                      size={25}
                      color={theme.primary}
                    />
                  </View>
                  <AppText weight="semibold">No other team members yet</AppText>
                  <AppText size="small" tone="secondary" style={styles.centered}>
                    Your farm is ready for its next member. Invite a trusted
                    person to share responsibilities and they’ll appear here.
                  </AppText>
                  {canManage ? (
                    <Button
                      label="Invite the first person"
                      onPress={() => setInviteOpen(true)}
                    />
                  ) : null}
                </Card>
              ) : null}

              {teamMembers.map((membership) => (
                <MemberCard
                  key={membership.id}
                  membership={membership}
                  isOwner={isOwner}
                  canManage={
                    canManage &&
                    (isOwner || membership.role === "worker")
                  }
                  pending={pendingMembershipId === membership.id}
                  onResend={() => void resendInvitation(membership)}
                  onChangeRole={() => void changeMemberRole(membership)}
                  onRevoke={() => void removeMember(membership)}
                />
              ))}
            </>
          ) : (
            <Card style={styles.stateCard}>
              <View
                style={[
                  styles.stateIcon,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons
                  name="leaf-outline"
                  size={22}
                  color={theme.primary}
                />
              </View>
              <View style={styles.stateCopy}>
                <AppText weight="semibold">Choose an active farm</AppText>
                <AppText size="small" tone="secondary">
                  Select a farm to manage its team. Invitations addressed to
                  you are still available below.
                </AppText>
              </View>
            </Card>
          )}

          <SectionHeading
            icon="mail-unread-outline"
            title="Invitations for you"
            detail="Invites sent to your FarmTrack account"
          />
          {incomingInvitations.isLoading ? (
            <LoadingState label="Checking your invitations" />
          ) : null}
          {incomingInvitations.isError ? (
            <Card style={styles.stateCard}>
              <View style={styles.stateCopy}>
                <AppText weight="semibold">
                  Couldn’t load your invitations
                </AppText>
                <AppText size="small" tone="secondary">
                  {normalizeApiError(incomingInvitations.error).message}
                </AppText>
              </View>
              <Button
                label="Retry"
                variant="secondary"
                onPress={() => void incomingInvitations.refetch()}
              />
            </Card>
          ) : null}
          {receivedInvitations.map((membership) => (
            <IncomingInvitationCard
              key={membership.id}
              membership={membership}
              pending={pendingMembershipId === membership.id}
              onAccept={() => void acceptInvitation(membership)}
            />
          ))}
          {!incomingInvitations.isLoading &&
          !incomingInvitations.isError &&
          receivedInvitations.length === 0 ? (
            <View style={styles.noInvitations}>
              <Ionicons
                name="checkmark-circle-outline"
                size={18}
                color={theme.textSecondary}
              />
              <AppText size="small" tone="secondary">
                You’re all caught up. New farm invitations will appear here.
              </AppText>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 42,
    gap: 14,
  },
  hero: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  heroIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  heroCopy: { flex: 1, minWidth: 180, gap: 4 },
  farmPill: {
    maxWidth: "100%",
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  sectionHeading: {
    flex: 1,
    minWidth: 190,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  sectionCopy: { flex: 1, minWidth: 0, gap: 2 },
  inviteToggle: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 12,
    paddingHorizontal: 13,
  },
  inviteCard: { gap: 16, borderRadius: 17, padding: 16 },
  formIntro: { gap: 4 },
  formGroup: { gap: 9 },
  roleOptions: { gap: 8 },
  roleOption: { gap: 8, borderWidth: 1, borderRadius: 13, padding: 12 },
  roleOptionTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rolePill: {
    alignSelf: "flex-start",
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  createAccountToggle: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 2,
  },
  checkbox: {
    width: 21,
    height: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 6,
    marginTop: 1,
  },
  createAccountCopy: { flex: 1, minWidth: 0, gap: 3 },
  passwordNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 11,
    padding: 11,
  },
  passwordNoteCopy: { flex: 1, minWidth: 0 },
  memberCard: { gap: 12, borderRadius: 15, padding: 14 },
  memberHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  avatar: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  memberIdentity: { flex: 1, minWidth: 0, gap: 6 },
  memberMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  invitedPill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  deliveryNotice: { flexDirection: "row", alignItems: "center", gap: 7 },
  deliveryText: { flex: 1, minWidth: 0 },
  memberActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(120,120,120,0.24)",
    paddingTop: 10,
  },
  memberAction: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  invitationCard: {
    gap: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 16,
    padding: 15,
  },
  invitationTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  invitationIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  invitationCopy: { flex: 1, minWidth: 0, gap: 3 },
  stateCard: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    borderRadius: 15,
    padding: 15,
  },
  stateIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  stateCopy: { flex: 1, minWidth: 180, gap: 4 },
  emptyCard: {
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    padding: 20,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
  },
  centered: { textAlign: "center" },
  feedback: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  feedbackCopy: { flex: 1, minWidth: 0 },
  noInvitations: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
});
