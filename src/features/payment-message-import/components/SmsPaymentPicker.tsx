import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { usePaymentMessageImport } from "@/features/payment-message-import/PaymentMessageImportProvider";
import { useTheme } from "@/providers/theme-provider";

import { parsePaymentMessage } from "../parser";
import type {
  NormalizedPaymentMessage,
  PaymentDirection,
} from "../types";

const MAX_NEW_SELECTIONS = 10;

type PastedPaymentMessage = {
  id: string;
  body: string;
  date: number;
};

export type SelectedSmsPayment = {
  messageId: string;
  payment: NormalizedPaymentMessage;
};

type SmsPaymentPickerProps = {
  visible: boolean;
  fromDate: string;
  currency: string;
  existingReferences: string[];
  existingSmsMessageIds: string[];
  excludedSmsMessageIds?: string[];
  maxSelections?: number;
  hasExistingPayments: boolean;
  selectIntoExistingPayment?: boolean;
  transactionLabel?: string;
  expectedDirection?: PaymentDirection;
  overpaymentMessage?: string;
  purchaseTotalCents: string;
  currentPaidCents: string;
  sharedMessage?: { id: string; text: string } | null;
  onClose: () => void;
  onSelect: (
    payments: SelectedSmsPayment[],
    mode: "add" | "replace",
  ) => void;
};

type PaymentCandidate = SelectedSmsPayment & {
  displayDate: string;
  displayTime: string | null;
};

const channelLabels: Record<string, string> = {
  BUY_GOODS: "Buy Goods / Till / Pochi",
  PAYBILL: "PayBill",
  SEND_MONEY: "Send Money",
};

function receivedDateTime(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

function candidateFromSms(
  message: PastedPaymentMessage,
  expectedDirection: PaymentDirection,
): PaymentCandidate | null {
  let payment: NormalizedPaymentMessage;
  try {
    payment = parsePaymentMessage(message.body);
  } catch {
    return null;
  }
  if (
    payment.transactionStatus !== "SUCCESS" ||
    payment.direction !== expectedDirection ||
    (expectedDirection === "OUTGOING" &&
      !["BUY_GOODS", "PAYBILL", "SEND_MONEY"].includes(
        payment.paymentChannel,
      )) ||
    (expectedDirection === "INCOMING" &&
      payment.paymentChannel !== "RECEIVED_MONEY") ||
    !payment.amount ||
    (payment.currency && payment.currency !== "KES")
  ) {
    return null;
  }
  const received = receivedDateTime(message.date);
  return {
    messageId: message.id,
    payment: {
      ...payment,
      transactionDate: payment.transactionDate ?? received.date,
      transactionTime: payment.transactionTime ?? received.time,
    },
    displayDate: payment.transactionDate ?? received.date,
    displayTime: payment.transactionTime ?? received.time,
  };
}

function normalizedReference(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function amountCents(amount: string | null | undefined) {
  const [whole, fraction = ""] = (amount ?? "0").split(".");
  return (
    BigInt(whole.replace(/,/g, "")) * 100n +
    BigInt(fraction.padEnd(2, "0").slice(0, 2))
  );
}

function formatCents(amount: bigint) {
  return `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`;
}

export function SmsPaymentPicker({
  visible,
  fromDate,
  currency,
  existingReferences,
  existingSmsMessageIds,
  excludedSmsMessageIds = [],
  maxSelections = MAX_NEW_SELECTIONS,
  hasExistingPayments,
  selectIntoExistingPayment = false,
  transactionLabel = "purchase",
  expectedDirection = "OUTGOING",
  overpaymentMessage = "The amount above the purchase total becomes supplier credit.",
  purchaseTotalCents,
  currentPaidCents,
  sharedMessage = null,
  onClose,
  onSelect,
}: SmsPaymentPickerProps) {
  const { theme } = useTheme();
  const { clearSharedMessage, openMessagesApp } = usePaymentMessageImport();
  const [messages, setMessages] = useState<PastedPaymentMessage[]>([]);
  const [pastedMessage, setPastedMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchFromDate, setSearchFromDate] = useState(fromDate);
  const [searchFocused, setSearchFocused] = useState(false);
  const previousExcludedSmsIds = useRef(excludedSmsMessageIds);
  const excludedSmsKey = excludedSmsMessageIds.join("|");

  useEffect(() => {
    const previousIds = new Set(previousExcludedSmsIds.current);
    const currentIds = new Set(excludedSmsKey ? excludedSmsKey.split("|") : []);
    const newlyExcluded = new Set(
      [...currentIds].filter((id) => !previousIds.has(id)),
    );
    if (newlyExcluded.size > 0) {
      setSelectedIds((selected) =>
        selected.filter((id) => !newlyExcluded.has(id)),
      );
    }
    previousExcludedSmsIds.current = excludedSmsKey
      ? excludedSmsKey.split("|")
      : [];
  }, [excludedSmsKey]);

  const allMessages = useMemo(() => {
    if (
      !visible ||
      !sharedMessage ||
      messages.some((message) => message.id === sharedMessage.id)
    ) {
      return messages;
    }
    return [
      ...messages,
      {
        id: sharedMessage.id,
        body: sharedMessage.text,
        date: new Date(`${searchFromDate}T12:00:00`).getTime(),
      },
    ];
  }, [messages, searchFromDate, sharedMessage, visible]);

  const candidates = useMemo(
    () =>
      allMessages
        .map((message) => candidateFromSms(message, expectedDirection))
        .filter((candidate): candidate is PaymentCandidate => candidate !== null),
    [allMessages, expectedDirection],
  );
  const existingReferenceSet = useMemo(
    () => new Set(existingReferences.map(normalizedReference).filter(Boolean)),
    [existingReferences],
  );
  const existingSmsIdSet = useMemo(
    () => new Set(existingSmsMessageIds),
    [existingSmsMessageIds],
  );
  const excludedSmsIdSet = useMemo(
    () => new Set(excludedSmsMessageIds),
    [excludedSmsMessageIds],
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const query = search.trim().toLowerCase();
  const phoneQuery = query.replace(/\D/g, "");
  const candidatesById = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.messageId, candidate])),
    [candidates],
  );
  const filteredCandidates = useMemo(
    () =>
      candidates
        .filter((candidate) => {
          const payment = candidate.payment;
          const searchableText = [
            expectedDirection === "INCOMING"
              ? payment.senderName
              : payment.recipientName,
            expectedDirection === "INCOMING"
              ? payment.senderPhone
              : payment.recipientPhone,
            payment.transactionReference,
            payment.businessNumber,
            payment.accountNumber,
            payment.amount,
            payment.paymentChannel,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return (
            !query ||
            searchableText.includes(query) ||
            (phoneQuery.length > 0 &&
              (expectedDirection === "INCOMING"
                ? payment.senderPhone ?? ""
                : payment.recipientPhone ?? "")
                .replace(/\D/g, "")
                .includes(phoneQuery))
          );
        })
        .sort(
          (left, right) =>
            Number(selectedIdSet.has(right.messageId)) -
            Number(selectedIdSet.has(left.messageId)),
        ),
    [candidates, expectedDirection, phoneQuery, query, selectedIdSet],
  );
  const selectedCandidates = selectedIds
    .map((id) => candidatesById.get(id))
    .filter((candidate): candidate is PaymentCandidate => candidate !== undefined);
  const selectedReferenceSet = new Set(
    selectedCandidates
      .map((candidate) =>
        normalizedReference(candidate.payment.transactionReference),
      )
      .filter(Boolean),
  );
  const selectedTotalCents = selectedCandidates.reduce(
    (total, candidate) => total + amountCents(candidate.payment.amount),
    0n,
  );
  const newSelectedCount = selectedCandidates.filter(
    (candidate) => !existingSmsIdSet.has(candidate.messageId),
  ).length;
  const addTotalCents =
    BigInt(currentPaidCents) +
    selectedCandidates.reduce(
      (total, candidate) =>
        existingSmsIdSet.has(candidate.messageId)
          ? total
          : total + amountCents(candidate.payment.amount),
      0n,
    );
  const replaceTotalCents = selectedTotalCents;
  const totalCents = BigInt(purchaseTotalCents);
  const missingSelectedCandidates = selectedIds.length !== selectedCandidates.length;
  const paymentDirectionLabel =
    expectedDirection === "INCOMING" ? "incoming" : "outgoing";

  function addPastedMessage() {
    const body = pastedMessage.trim();
    if (!body) {
      setError("Paste an M-Pesa confirmation message first.");
      return;
    }

    const message = {
      id: `manual-pending-${Date.now()}`,
      body,
      date: new Date(`${searchFromDate}T12:00:00`).getTime(),
    };
    const candidate = candidateFromSms(message, expectedDirection);
    if (!candidate) {
      setError(
        `This is not a successful ${paymentDirectionLabel} M-Pesa payment confirmation.`,
      );
      return;
    }
    const reference = normalizedReference(
      candidate.payment.transactionReference,
    );
    const id = `manual-${reference || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    if (messages.some((item) => item.id === id)) {
      setError("That payment message has already been added.");
      return;
    }
    setMessages((current) => [...current, { ...message, id }]);
    setPastedMessage("");
    setError(null);
  }

  function selectPayments(mode: "add" | "replace") {
    if (sharedMessage) {
      void clearSharedMessage(sharedMessage.id).catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "FarmTrack could not clear the shared message.",
        );
      });
    }
    onSelect(selectedCandidates, mode);
  }

  function closePicker() {
    if (sharedMessage) {
      void clearSharedMessage(sharedMessage.id).catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "FarmTrack could not clear the shared message.",
        );
      });
    }
    onClose();
  }

  function toggleCandidate(candidate: PaymentCandidate) {
    const reference = normalizedReference(
      candidate.payment.transactionReference,
    );
    if (
      reference &&
      existingReferenceSet.has(reference) &&
      !existingSmsIdSet.has(candidate.messageId)
    ) {
      return;
    }
    if (
      excludedSmsIdSet.has(candidate.messageId) &&
      !selectedIdSet.has(candidate.messageId)
    ) {
      return;
    }
    if (
      reference &&
      selectedCandidates.some(
        (selected) =>
          selected.messageId !== candidate.messageId &&
          normalizedReference(selected.payment.transactionReference) ===
            reference,
      )
    ) {
      return;
    }
    setSelectedIds((current) => {
      if (current.includes(candidate.messageId)) {
        return current.filter((id) => id !== candidate.messageId);
      }
      const newSelectionCount = current.filter(
        (id) => !existingSmsIdSet.has(id),
      ).length;
      if (newSelectionCount >= maxSelections) return current;
      return [...current, candidate.messageId];
    });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={closePicker}
    >
      <View style={styles.overlay}>
        <SafeAreaView
          edges={["top", "bottom"]}
          style={[
            styles.sheet,
              {
                backgroundColor: theme.background,
                borderColor: theme.border,
                borderTopColor: theme.primary,
              },
          ]}
        >
        <View style={styles.header}>
          <View
            style={[
              styles.headerIcon,
              { backgroundColor: `${theme.primary}18` },
            ]}
          >
            <Ionicons name="wallet-outline" size={22} color={theme.primary} />
          </View>
          <View style={styles.flex}>
            <AppText size="heading" weight="semibold">
              Add M-Pesa payment
            </AppText>
            <AppText size="small" tone="secondary">
              Use only the confirmation you want to record. FarmTrack does not read your inbox.
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close M-Pesa payment picker"
            onPress={closePicker}
            hitSlop={8}
          >
            <Ionicons name="close" size={23} color={theme.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.resultsScroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View
            style={[
              styles.datePanel,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.datePanelHeading}>
              <View
                style={[
                  styles.dateIcon,
                  { backgroundColor: `${theme.secondary}18` },
                ]}
              >
                <Ionicons
                  name="calendar-outline"
                  size={17}
                  color={theme.secondary}
                />
              </View>
              <View style={styles.flex}>
                <AppText size="small" weight="semibold">
                  Use this date if the message has no date
                </AppText>
                <AppText size="small" tone="secondary">
                  Shared text or a pasted message is only processed here
                </AppText>
              </View>
            </View>
            <DatePickerField
              label="Fallback payment date"
              value={searchFromDate}
              onChange={(date) => {
                if (date !== searchFromDate) {
                  setSearchFromDate(date);
                  setError(null);
                }
              }}
              maximumDate={new Date()}
            />
            {Platform.OS === "android" ? (
              <Button
                label="Open Messages"
                variant="secondary"
                onPress={() =>
                  void openMessagesApp().catch((cause: unknown) => {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "FarmTrack could not open the Messages app.",
                    );
                  })
                }
              />
            ) : null}
            <TextInput
              value={pastedMessage}
              onChangeText={setPastedMessage}
              placeholder="Paste an M-Pesa confirmation message"
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="Paste M-Pesa confirmation message"
              multiline
              textAlignVertical="top"
              maxLength={3000}
              style={[
                styles.messageInput,
                {
                  color: theme.text,
                  borderColor: theme.border,
                  backgroundColor: theme.background,
                },
              ]}
            />
            <Button
              label="Add payment message"
              variant="secondary"
              onPress={addPastedMessage}
            />
          </View>

          {allMessages.length > 0 ? (
            <View
              style={[
                styles.searchContainer,
                {
                  borderColor: searchFocused ? theme.primary : theme.border,
                  backgroundColor: theme.backgroundElement,
                  borderWidth: searchFocused ? 2 : 1,
                },
              ]}
            >
              <Ionicons name="search" size={19} color={theme.textSecondary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Name, phone, reference, amount…"
                placeholderTextColor={theme.textSecondary}
                accessibilityLabel="Search M-Pesa payments"
                returnKeyType="search"
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                style={[styles.search, { color: theme.text }]}
              />
              {search ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear payment search"
                  onPress={() => setSearch("")}
                  hitSlop={8}
                >
                  <Ionicons
                    name="close-circle"
                    size={19}
                    color={theme.textSecondary}
                  />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {error ? (
            <View style={styles.error}>
              <AppText size="small" style={{ color: theme.danger }}>
                {error}
              </AppText>
            </View>
          ) : null}

          {allMessages.length === 0 &&
          !error ? (
            <Card style={styles.empty}>
              <AppText weight="semibold">No payment messages added</AppText>
              <AppText size="small" tone="secondary">
                Open Messages, copy a confirmation and paste it here, or use Share and choose FarmTrack. If FarmTrack is not listed, copy and paste instead. You can add multiple confirmations one at a time. FarmTrack does not read your inbox.
              </AppText>
            </Card>
          ) : null}

          {allMessages.length > 0 &&
          (candidates.length === 0 || filteredCandidates.length === 0) &&
          !error ? (
            <Card style={styles.empty}>
              <AppText weight="semibold">
                {candidates.length === 0
                  ? `No ${paymentDirectionLabel} payments found`
                  : "No payments match this search"}
              </AppText>
              <AppText size="small" tone="secondary">
                {candidates.length === 0
                  ? `Only successful ${paymentDirectionLabel} M-Pesa confirmations are shown. Balances, failed transfers and unrelated messages are hidden.`
                  : "Try another name, phone number, reference, or amount."}
              </AppText>
            </Card>
          ) : null}

          {candidates.length > 0 ? (
            <View style={styles.resultsHeading}>
              <AppText weight="semibold">
                {search ? "Search results" : "Recent payments"}
              </AppText>
              <View
                style={[
                  styles.countBadge,
                  { backgroundColor: `${theme.primary}18` },
                ]}
              >
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: theme.primary }}
                >
                  {filteredCandidates.length}
                </AppText>
              </View>
              <AppText size="small" tone="secondary" style={styles.resultsHint}>
                Select up to {maxSelections}
              </AppText>
            </View>
          ) : null}

          {filteredCandidates.map((candidate) => {
            const payment = candidate.payment;
            const selected = selectedIdSet.has(candidate.messageId);
            const reference = normalizedReference(payment.transactionReference);
            const alreadyEntered = Boolean(
              reference &&
                existingReferenceSet.has(reference) &&
                !existingSmsIdSet.has(candidate.messageId),
            );
            const duplicateSelected = Boolean(
              reference &&
                selectedReferenceSet.has(reference) &&
                !selected,
            );
            const duplicate = alreadyEntered || duplicateSelected;
            const alreadyRecorded = excludedSmsIdSet.has(candidate.messageId);
            const currencyMismatch = Boolean(
              payment.currency &&
                payment.currency.toUpperCase() !== currency.toUpperCase(),
            );
            const disabled =
              duplicate ||
              alreadyRecorded ||
              currencyMismatch ||
              (!selected &&
                !existingSmsIdSet.has(candidate.messageId) &&
                newSelectedCount >= maxSelections);
            return (
              <View
                key={candidate.messageId}
              >
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled }}
                  disabled={disabled}
                  onPress={() => toggleCandidate(candidate)}
                  style={({ pressed }) => [
                    styles.messageCard,
                    {
                      borderColor: selected ? theme.primary : theme.border,
                      backgroundColor: selected
                        ? theme.backgroundSelected
                        : theme.backgroundElement,
                      opacity: duplicate || alreadyRecorded || currencyMismatch ? 0.62 : 1,
                      transform: [{ scale: pressed ? 0.99 : 1 }],
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.selectionMark,
                      {
                        backgroundColor: selected
                          ? theme.primary
                          : theme.background,
                        borderColor: selected ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    {selected ? (
                      <View>
                        <Ionicons
                          name="checkmark"
                          size={14}
                          color={theme.onPrimary}
                        />
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.flex}>
                    <View style={styles.cardHeading}>
                      <AppText weight="semibold" style={styles.flex}>
                        {(expectedDirection === "INCOMING"
                          ? payment.senderName
                          : payment.recipientName) ??
                          payment.businessNumber ??
                          channelLabels[payment.paymentChannel] ??
                          "M-Pesa payment"}
                      </AppText>
                      <AppText weight="semibold" style={styles.amount}>
                        {payment.currency ?? currency} {payment.amount}
                      </AppText>
                    </View>
                    <View style={styles.cardMeta}>
                      <AppText size="small" tone="secondary">
                        {channelLabels[payment.paymentChannel] ?? "M-Pesa"}
                      </AppText>
                      <View
                        style={[
                          styles.metaDot,
                          { backgroundColor: theme.textSecondary },
                        ]}
                      />
                      <AppText size="small" tone="secondary">
                        {candidate.displayDate}
                        {candidate.displayTime ? ` · ${candidate.displayTime}` : ""}
                      </AppText>
                    </View>
                    {payment.transactionReference ? (
                      <AppText size="small" tone="secondary" style={styles.detail}>
                        Ref · {payment.transactionReference}
                      </AppText>
                    ) : null}
                    {payment.accountNumber ? (
                      <AppText size="small" tone="secondary" style={styles.detail}>
                        Account · {payment.accountNumber}
                      </AppText>
                    ) : null}
                    {(expectedDirection === "INCOMING"
                      ? payment.senderPhone
                      : payment.recipientPhone) ? (
                      <AppText size="small" tone="secondary" style={styles.detail}>
                        {expectedDirection === "INCOMING" ? "From" : "Recipient"} ·{" "}
                        {expectedDirection === "INCOMING"
                          ? payment.senderPhone
                          : payment.recipientPhone}
                      </AppText>
                    ) : null}
                    {duplicate ? (
                      <AppText size="small" style={styles.detail}>
                        {alreadyEntered
                          ? `Already added to this ${transactionLabel}`
                          : "Same transaction reference is already selected"}
                      </AppText>
                    ) : null}
                    {alreadyRecorded ? (
                      <AppText size="small" style={styles.detail}>
                        Already recorded for this {transactionLabel}
                      </AppText>
                    ) : null}
                    {currencyMismatch ? (
                      <AppText
                        size="small"
                        style={[styles.detail, { color: theme.danger }]}
                      >
                        This message uses a different currency
                      </AppText>
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          })}

        </ScrollView>

        {selectedCandidates.length > 0 ? (
          <Card
            style={[
              styles.selectionSummary,
              { borderColor: `${theme.primary}66` },
            ]}
          >
            <View style={styles.summaryHeading}>
              <View
                style={[
                  styles.summaryIcon,
                  { backgroundColor: `${theme.primary}18` },
                ]}
              >
                <Ionicons name="checkmark" size={17} color={theme.primary} />
              </View>
              <AppText weight="semibold" style={styles.flex}>
                {selectedCandidates.length} selected
              </AppText>
              <AppText weight="semibold" style={{ color: theme.primary }}>
                {currency} {formatCents(selectedTotalCents)}
              </AppText>
            </View>
            {hasExistingPayments ? (
              <AppText size="small" tone="secondary">
                Add: {currency} {formatCents(addTotalCents)} · Replace:{" "}
                {currency} {formatCents(replaceTotalCents)}
              </AppText>
            ) : null}
            {(hasExistingPayments ? addTotalCents : selectedTotalCents) >
            totalCents ? (
              <AppText size="small" style={{ color: theme.secondary }}>
                {overpaymentMessage}
              </AppText>
            ) : null}
            {missingSelectedCandidates ? (
              <AppText size="small" style={{ color: theme.danger }}>
                Some selected messages are outside this search. Search from an
                earlier date before replacing.
              </AppText>
            ) : null}
          </Card>
        ) : null}

        <View style={styles.actions}>
          <MotionActionButton
            label={
              selectedCandidates.length
                ? selectIntoExistingPayment
                  ? newSelectedCount === 0
                    ? "Select a new payment"
                    : newSelectedCount === 1
                      ? "Use for this payment"
                      : `Use first + add ${newSelectedCount - 1}`
                  : hasExistingPayments
                    ? `Add ${newSelectedCount} new payment${newSelectedCount === 1 ? "" : "s"}`
                  : `Use ${selectedCandidates.length} selected`
                : "Select payments to continue"
            }
            detail={
              selectedCandidates.length
                ? `${currency} ${formatCents(selectedTotalCents)} selected`
                : "Choose payments above"
            }
            trailingIcon="arrow-forward"
            backgroundColor={
              selectedCandidates.length ? theme.primary : theme.backgroundSelected
            }
            foregroundColor={
              selectedCandidates.length ? theme.onPrimary : theme.textSecondary
            }
            onPress={() =>
              selectPayments(
                selectIntoExistingPayment || hasExistingPayments
                  ? "add"
                  : "replace",
              )
            }
            disabled={
              selectedCandidates.length === 0 ||
              (hasExistingPayments && newSelectedCount === 0)
            }
          />
          {hasExistingPayments &&
          !selectIntoExistingPayment &&
          selectedCandidates.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              disabled={missingSelectedCandidates}
              onPress={() => selectPayments("replace")}
              style={styles.replaceAction}
            >
              <AppText
                size="small"
                weight="semibold"
                style={{
                  color: missingSelectedCandidates
                    ? theme.textSecondary
                    : theme.primary,
                }}
              >
                {missingSelectedCandidates
                  ? "Search earlier before replacing"
                  : "Replace current payment list"}
              </AppText>
            </Pressable>
          ) : null}
        </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function MotionActionButton({
  icon,
  label,
  detail,
  trailingIcon,
  loading = false,
  backgroundColor,
  foregroundColor,
  disabled = false,
  onPress,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  backgroundColor: string;
  foregroundColor: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Animated.View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: loading }}
        disabled={disabled || loading}
        onPress={onPress}
        android_ripple={{
          color: `${foregroundColor}24`,
          borderless: false,
        }}
        style={({ pressed }) => [
          styles.actionButton,
          {
            backgroundColor,
            opacity: disabled ? 0.58 : pressed ? 0.94 : 1,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={foregroundColor} />
        ) : icon ? (
          <View style={styles.actionIcon}>
            <Ionicons name={icon} size={22} color={foregroundColor} />
          </View>
        ) : null}
        <View style={styles.actionCopy}>
          <AppText
            weight="semibold"
            style={{ color: foregroundColor, textAlign: "left" }}
          >
            {label}
          </AppText>
          <AppText
            size="small"
            style={{ color: foregroundColor, opacity: 0.78 }}
          >
            {detail}
          </AppText>
        </View>
        {trailingIcon ? (
          <View style={styles.actionTrailing}>
            <Ionicons name={trailingIcon} size={19} color={foregroundColor} />
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  sheet: {
    height: "94%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 3,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1 },
  resultsScroll: { flex: 1 },
  content: { gap: 12, paddingBottom: 12 },
  datePanel: {
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderRadius: 14,
  },
  datePanelHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  dateIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  messageInput: {
    minHeight: 112,
    maxHeight: 220,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    lineHeight: 21,
  },
  searchContainer: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  search: {
    flex: 1,
    minHeight: 48,
    fontSize: 15,
  },
  error: { gap: 8 },
  empty: { gap: 8, padding: 14 },
  resultsHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 2,
  },
  countBadge: {
    minWidth: 25,
    height: 25,
    paddingHorizontal: 7,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  resultsHint: { marginLeft: "auto" },
  messageCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    minHeight: 76,
  },
  selectionMark: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  cardHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 5,
  },
  amount: { fontVariant: ["tabular-nums"] },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  },
  metaDot: { width: 3, height: 3, borderRadius: 2 },
  detail: { marginTop: 5 },
  selectionSummary: { gap: 8, padding: 14, borderRadius: 14 },
  summaryHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  summaryIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    flexDirection: "column",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#CEDDD9",
  },
  actionButton: {
    minHeight: 62,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  actionCopy: { flex: 1, gap: 2 },
  actionTrailing: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  replaceAction: { alignItems: "center", paddingVertical: 6 },
});
