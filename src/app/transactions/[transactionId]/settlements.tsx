import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TextField } from "@/components/ui/text-field";
import {
  useChickenSettlementOptions,
} from "@/features/chickens/hooks";
import type {
  ChickenType,
  ChickenAgeUnit,
  ChickenSettlementSelection,
} from "@/features/chickens/api";
import {
  useCreateTransactionSettlement,
  useProducts,
  useTransactionSettlements,
} from "@/features/management/hooks";
import type {
  Product,
  SettlementDirection,
  SettlementLineInput,
  SettlementPaymentMethod,
} from "@/features/management/api";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type LineKind = "cash" | "goods" | "service";
type CashDraft = {
  key: string;
  kind: "cash";
  amount: string;
  payment_method: SettlementPaymentMethod;
  reference_number: string;
};
type ChickenAllocationDraft = {
  key: string;
  batch_id: string;
  batch_name: string;
  batch_type: ChickenType | "";
  batch_hatch_date: string;
  batch_quantity: number;
  block_id: string;
  block_name: string;
  block_quantity: number;
  quantity: string;
};
type GoodsDraft = {
  key: string;
  kind: "goods";
  product_id: string;
  unit_id: string;
  quantity: string;
  agreed_unit_value: string;
  discount_type: "fixed" | "percentage" | "";
  discount_value: string;
  discount_reason: string;
  chicken_mode: "receive_existing" | "receive_new" | "issue";
  chicken_batch_id: string;
  chicken_batch_name: string;
  chicken_batch_type: ChickenType | "";
  chicken_batch_hatch_date: string;
  chicken_batch_quantity: number;
  chicken_batch_custom_name: string;
  chicken_type: ChickenType;
  chicken_age: string;
  chicken_age_unit: ChickenAgeUnit;
  chicken_allocations: ChickenAllocationDraft[];
};
type ServiceDraft = {
  key: string;
  kind: "service";
  description: string;
  value: string;
};
type DraftLine = CashDraft | GoodsDraft | ServiceDraft;
type TransactionKind = "sale" | "purchase";
type ChickenPickerOption = {
  id: string;
  name: string;
  quantity: number;
  chicken_type?: ChickenType;
  hatch_date?: string | null;
};
type SettlementValidation = {
  message: string;
  fieldKey?: string;
  lineKey?: string;
};

const paymentMethods: SettlementPaymentMethod[] = [
  "cash",
  "mpesa",
  "bank_transfer",
  "card",
  "other",
];

export default function TransactionSettlementsRoute() {
  return (
    <SessionGate>
      <SettlementContent />
    </SessionGate>
  );
}

function SettlementContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const params = useLocalSearchParams<{
    transactionId: string;
    transactionType: TransactionKind;
    balanceDue: string;
    creditBalance: string;
    contactName?: string;
    referenceNumber?: string;
  }>();
  const farmId = farm.selectedFarm?.id;
  const transactionId = params.transactionId;
  const transactionType = params.transactionType;
  const [balanceSnapshot, setBalanceSnapshot] = useState<{
    balance_due: string;
    credit_balance: string;
  } | null>(null);
  const balanceDue = Number(balanceSnapshot?.balance_due ?? params.balanceDue ?? 0);
  const creditBalance = Number(
    balanceSnapshot?.credit_balance ?? params.creditBalance ?? 0,
  );
  const available = balanceDue > 0 ? balanceDue : creditBalance;
  const direction: SettlementDirection =
    (transactionType === "sale" && balanceDue > 0) ||
    (transactionType === "purchase" && creditBalance > 0)
      ? "contact_to_farm"
      : "farm_to_contact";
  const products = useProducts(user?.id, farmId);
  const settlements = useTransactionSettlements(user?.id, farmId, transactionId);
  const createSettlement = useCreateTransactionSettlement(
    user?.id ?? "",
    farmId ?? "",
    transactionId ?? "",
  );
  const [settlementDate, setSettlementDate] = useState(today());
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(() => [
    newDraft("cash", direction),
  ]);
  const [expandedLineKey, setExpandedLineKey] = useState(lines[0].key);
  const [recordExpanded, setRecordExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [validationError, setValidationError] =
    useState<SettlementValidation | null>(null);
  const inputRefs = useRef(new Map<string, TextInput>());
  const [autofillFullAmount, setAutofillFullAmount] = useState(true);
  const autoCashKey = lines.find((line) => line.kind === "cash")?.key;
  const autoCashAmount = Math.max(
    0,
    available -
      lines.reduce((sum, line) => {
        if (autofillFullAmount && line.key === autoCashKey) return sum;
        return sum + draftLineValue(line);
      }, 0),
  );
  const total = useMemo(
    () =>
      lines.reduce(
        (sum, line) =>
          sum +
          (autofillFullAmount && line.key === autoCashKey
            ? autoCashAmount
            : draftLineValue(line)),
        0,
      ),
    [lines, autofillFullAmount, autoCashKey, autoCashAmount],
  );
  const isAvailable = Number.isFinite(available) && available > 0;
  const contactLabel =
    params.contactName ||
    (transactionType === "sale" ? "Customer" : "Supplier");
  const payer =
    direction === "contact_to_farm" ? contactLabel : "Farm Track";
  const payee =
    direction === "contact_to_farm" ? "Farm Track" : contactLabel;
  const directionColor =
    direction === "contact_to_farm" ? theme.success : theme.danger;

  useEffect(() => {
    if (!validationError?.fieldKey) return;
    requestAnimationFrame(() => {
      inputRefs.current.get(validationError.fieldKey!)?.focus();
    });
  }, [validationError, expandedLineKey]);

  const registerInput = useCallback(
    (fieldKey: string, instance: TextInput | null) => {
      if (instance) inputRefs.current.set(fieldKey, instance);
      else inputRefs.current.delete(fieldKey);
    },
    [],
  );

  function inputRef(fieldKey: string) {
    return (instance: TextInput | null) => registerInput(fieldKey, instance);
  }

  function invalidate(message: string, fieldKey?: string, lineKey?: string) {
    setValidationError({ message, fieldKey, lineKey });
    if (lineKey) setExpandedLineKey(lineKey);
    if (fieldKey === "settlement:date" || fieldKey === "settlement:reason") {
      setRecordExpanded(true);
    }
  }

  async function submit() {
    if (!user?.id || !farmId || !transactionId || !isAvailable) return;
    if (!reason.trim()) {
      invalidate("Enter a reason for this settlement.", "settlement:reason");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(settlementDate)) {
      invalidate("Choose a valid settlement date.", "settlement:date");
      return;
    }
    const payloadLines: SettlementLineInput[] = [];
    for (const line of lines) {
      if (line.kind === "cash") {
        const amount =
          autofillFullAmount && line.key === autoCashKey
            ? autoCashAmount
            : positive(line.amount);
        if (amount <= 0) {
          if (autofillFullAmount && line.key === autoCashKey) continue;
          invalidate(
            "Enter a cash amount greater than zero.",
            `${line.key}:amount`,
            line.key,
          );
          return;
        }
        payloadLines.push({
          kind: "cash",
          amount: amount.toFixed(2),
          payment_method: line.payment_method,
          reference_number: line.reference_number.trim() || undefined,
        });
      } else if (line.kind === "service") {
        if (!line.description.trim() || positive(line.value) <= 0) {
          const fieldKey = !line.description.trim()
            ? `${line.key}:description`
            : `${line.key}:value`;
          invalidate(
            "Describe the service and enter its agreed value.",
            fieldKey,
            line.key,
          );
          return;
        }
        payloadLines.push({
          kind: "service",
          description: line.description.trim(),
          value: line.value,
        });
      } else {
        if (
          !line.product_id ||
          !line.unit_id ||
          positive(line.quantity) <= 0 ||
          positive(line.agreed_unit_value) <= 0
        ) {
          const fieldKey = !line.product_id
            ? `${line.key}:product`
            : !line.unit_id
              ? `${line.key}:product`
              : positive(line.quantity) <= 0
                ? `${line.key}:quantity`
                : `${line.key}:unit-value`;
          invalidate(
            "Choose a product and unit, then enter a positive quantity and agreed unit value.",
            fieldKey,
            line.key,
          );
          return;
        }
        const grossValue = roundMoney(
          positive(line.quantity) * positive(line.agreed_unit_value),
        );
        if (
          line.discount_type === "percentage" &&
          positive(line.discount_value) > 100
        ) {
          invalidate(
            "A percentage discount cannot exceed 100%.",
            `${line.key}:discount`,
            line.key,
          );
          return;
        }
        if (
          line.discount_type === "fixed" &&
          positive(line.discount_value) > grossValue
        ) {
          invalidate(
            "A fixed discount cannot exceed the goods line value.",
            `${line.key}:discount`,
            line.key,
          );
          return;
        }
        if (draftLineValue(line) <= 0) {
          invalidate(
            "The discount must leave a positive value for this goods line.",
            `${line.key}:discount`,
            line.key,
          );
          return;
        }
        const product = products.data?.find(
          (candidate) => candidate.id === line.product_id,
        );
        if (!product) {
          invalidate("Choose an active product from this farm.", `${line.key}:product`, line.key);
          return;
        }
        if (product.product_type === "chickens") {
          const unit = product.product_units.find(
            (candidate) => candidate.unit_id === line.unit_id,
          );
          const baseQuantity = positive(line.quantity) * Number(unit?.conversion_factor ?? 0);
          const allocatedQuantity = line.chicken_allocations.reduce(
            (sum, allocation) => sum + positive(allocation.quantity),
            0,
          );
          const allocationKeys = line.chicken_allocations.map((allocation) =>
            line.chicken_mode === "issue"
              ? `${allocation.batch_id}:${allocation.block_id}`
              : allocation.block_id,
          );
          if (!Number.isInteger(baseQuantity)) {
            invalidate(
              "Chicken quantity must convert to a whole number of chickens.",
              `${line.key}:quantity`,
              line.key,
            );
            return;
          }
          if (
            allocatedQuantity !== baseQuantity ||
            new Set(allocationKeys).size !== allocationKeys.length ||
            line.chicken_allocations.some(
              (allocation) =>
                !allocation.block_id ||
                !Number.isInteger(positive(allocation.quantity)) ||
                positive(allocation.quantity) <= 0 ||
                (line.chicken_mode === "issue" && !allocation.batch_id),
            )
          ) {
            const incomplete = line.chicken_allocations.find(
              (allocation) =>
                !allocation.block_id ||
                (line.chicken_mode === "issue" && !allocation.batch_id) ||
                !Number.isInteger(positive(allocation.quantity)) ||
                positive(allocation.quantity) <= 0,
            );
            const focusField = incomplete
              ? !incomplete.block_id
                ? `${line.key}:allocation:${incomplete.key}:block`
                : line.chicken_mode === "issue" && !incomplete.batch_id
                  ? `${line.key}:allocation:${incomplete.key}:batch`
                  : `${line.key}:allocation:${incomplete.key}:quantity`
              : `${line.key}:allocation:${line.chicken_allocations[0]?.key}:quantity`;
            invalidate(
              `Allocate exactly ${formatNumber(baseQuantity)} chickens to batches and housing blocks.`,
              focusField,
              line.key,
            );
            return;
          }
          if (
            direction === "contact_to_farm" &&
            line.chicken_mode === "receive_existing" &&
            !line.chicken_batch_id
          ) {
            invalidate(
              "Choose the batch receiving these chickens.",
              `${line.key}:batch`,
              line.key,
            );
            return;
          }
          if (
            direction === "contact_to_farm" &&
            line.chicken_mode === "receive_new" &&
            (!/^\d+$/.test(line.chicken_age.trim()) ||
              !Number.isSafeInteger(Number(line.chicken_age)))
          ) {
            invalidate(
              "Enter the whole-number age of the new chicken batch when received.",
              `${line.key}:age`,
              line.key,
            );
            return;
          }
          if (
            (direction === "contact_to_farm" &&
              !["receive_existing", "receive_new"].includes(line.chicken_mode)) ||
            (direction === "farm_to_contact" && line.chicken_mode !== "issue")
          ) {
            invalidate(
              "Choose how to place the chickens for this settlement.",
              `${line.key}:allocation:${line.chicken_allocations[0]?.key}:block`,
              line.key,
            );
            return;
          }
        }
        payloadLines.push({
          kind: "goods",
          product_id: line.product_id,
          unit_id: line.unit_id,
          quantity: line.quantity,
          agreed_unit_value: line.agreed_unit_value,
          ...(line.discount_type
            ? {
                discount_type: line.discount_type,
                discount_value: line.discount_value || "0",
              }
            : {}),
          discount_reason: line.discount_reason.trim() || undefined,
          ...(products.data?.find((product) => product.id === line.product_id)
            ?.product_type === "chickens"
            ? {
                chicken_placement: {
                  mode: line.chicken_mode,
                  ...(line.chicken_mode === "receive_existing"
                    ? { batch_id: line.chicken_batch_id }
                    : {}),
                  ...(line.chicken_mode === "receive_new"
                    ? {
                        new_batch: {
                          name: line.chicken_batch_custom_name.trim() || undefined,
                          chicken_type: line.chicken_type,
                          age: Number(line.chicken_age),
                          age_unit: line.chicken_age_unit,
                        },
                      }
                    : {}),
                  allocations: line.chicken_allocations.map((allocation) => ({
                    ...(line.chicken_mode === "issue"
                      ? { batch_id: allocation.batch_id }
                      : {}),
                    block_id: allocation.block_id,
                    quantity: Number(allocation.quantity),
                  })),
                },
              }
            : {}),
        });
      }
    }
    if (payloadLines.length === 0 || total <= 0) {
      invalidate("Add at least one valued settlement line.");
      return;
    }
    if (total > available) {
      const cashLine = lines.find(
        (line) =>
          line.kind === "cash" &&
          !(autofillFullAmount && line.key === autoCashKey),
      );
      const lastValuedLine = [...lines]
        .reverse()
        .find((line) => line.kind === "goods" || line.kind === "service");
      const focusLine = cashLine ?? lastValuedLine;
      const fieldKey =
        focusLine?.kind === "cash"
          ? `${focusLine.key}:amount`
          : focusLine?.kind === "service"
            ? `${focusLine.key}:value`
            : focusLine?.kind === "goods"
              ? `${focusLine.key}:unit-value`
              : undefined;
      invalidate(
        "Settlement total exceeds the available balance. Reduce an item amount.",
        fieldKey,
        focusLine?.key,
      );
      return;
    }
    try {
      const result = await createSettlement.mutateAsync({
        direction,
        settlement_date: settlementDate,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        lines: payloadLines,
      });
      setBalanceSnapshot({
        balance_due: result.balance_due,
        credit_balance: result.credit_balance,
      });
      const firstLine = newDraft("cash", direction);
      setLines([firstLine]);
      setExpandedLineKey(firstLine.key);
      setReason("");
      setNotes("");
      setAutofillFullAmount(true);
      await dialog.showDialog({
        title: "Settlement recorded",
        message: `${formatMoney(result.settlement.total_value, theme.currency)} recorded. Remaining balance: ${formatMoney(Math.max(Number(result.balance_due), Number(result.credit_balance)), theme.currency)}.`,
        tone: "success",
      });
    } catch (error: unknown) {
      await dialog.showDialog({
        title: "Couldn’t record settlement",
        message: normalizeApiError(error).message,
        tone: "error",
      });
    }
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <FarmPageHeader title="Settle balance" showBack />
        <View
          style={[
            styles.directionCard,
            { backgroundColor: `${directionColor}18`, borderLeftColor: directionColor },
          ]}
        >
          <AppText size="small" weight="semibold" style={{ color: directionColor }}>
            {direction === "contact_to_farm"
              ? "PAYMENT COMING IN"
              : "PAYMENT GOING OUT"}
          </AppText>
          <View style={styles.directionFlow}>
            <View style={styles.directionParty}>
              <AppText size="small" tone="secondary">FROM</AppText>
              <AppText weight="semibold">{payer}</AppText>
            </View>
            <Ionicons name="arrow-forward" size={20} color={directionColor} />
            <View style={styles.directionParty}>
              <AppText size="small" tone="secondary">TO</AppText>
              <AppText weight="semibold">{payee}</AppText>
            </View>
          </View>
          <AppText size="heading" weight="semibold" style={{ color: directionColor }}>
            {isAvailable
              ? formatMoney(available, theme.currency)
              : "No balance to settle"}
          </AppText>
          {params.referenceNumber ? (
            <AppText size="small" tone="secondary">
              {`${titleCase(transactionType)} · ${params.referenceNumber}`}
            </AppText>
          ) : null}
        </View>

        {products.isError ? (
          <Card style={[styles.section, { borderColor: theme.border }]}>
            <AppText weight="semibold">Some settlement options could not load</AppText>
            {products.isError ? (
              <AppText size="small" style={{ color: theme.danger }}>
                {normalizeApiError(products.error).message}
              </AppText>
            ) : null}
            <Button
              label="Retry loading options"
              variant="secondary"
              onPress={() => {
                if (products.isError) void products.refetch();
              }}
            />
          </Card>
        ) : null}

        {!isAvailable ? (
          <Card style={styles.section}>
            <AppText weight="semibold">Nothing is outstanding</AppText>
            <AppText size="small" tone="secondary">
              This transaction currently has no due amount or credit balance.
            </AppText>
          </Card>
        ) : (
          <>
            <Card style={styles.section}>
              <View style={styles.sectionHeading}>
                <View style={[styles.sectionIcon, { backgroundColor: `${theme.primary}18` }]}>
                  <Ionicons name="list-outline" size={20} color={theme.primary} />
                </View>
                <View style={styles.grow}>
                  <AppText weight="semibold">Settlement items</AppText>
                </View>
              </View>
              <View style={styles.autofillRow}>
                <View style={styles.grow}>
                  <AppText weight="semibold">Use remaining balance as cash</AppText>
                  <AppText size="small" tone="secondary">
                    {formatMoney(autoCashAmount, theme.currency)}
                  </AppText>
                </View>
                <Choice
                  label={autofillFullAmount ? "On" : "Off"}
                  selected={autofillFullAmount}
                  onPress={() => {
                    if (autofillFullAmount) {
                      setLines((current) =>
                        current.map((candidate) =>
                          candidate.kind === "cash" && candidate.key === autoCashKey
                            ? { ...candidate, amount: autoCashAmount.toFixed(2) }
                            : candidate,
                        ),
                      );
                    }
                    setAutofillFullAmount((current) => !current);
                  }}
                />
              </View>
              {lines.map((line, index) => (
                <View
                  key={line.key}
                  style={[
                    styles.lineCard,
                    { borderTopColor: theme.border },
                    index > 0 && styles.lineDivider,
                  ]}
                >
                  <View style={styles.lineHeader}>
                    <View style={styles.lineTitle}>
                      <View style={[styles.lineNumber, { backgroundColor: `${theme.primary}18` }]}>
                        <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                          {index + 1}
                        </AppText>
                      </View>
                      <View style={styles.grow}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{
                            expanded: expandedLineKey === line.key,
                          }}
                          onPress={() =>
                            setExpandedLineKey((current) =>
                              current === line.key ? "" : line.key,
                            )
                          }
                          style={styles.expandLine}
                        >
                          <View style={styles.grow}>
                            <AppText weight="semibold">
                              {line.kind === "goods"
                                ? products.data?.find((product) => product.id === line.product_id)?.name ?? "Goods"
                                : titleCase(line.kind)}
                            </AppText>
                            <AppText size="small" tone="secondary">
                              {formatMoney(draftLineValue(line), theme.currency)}
                            </AppText>
                          </View>
                          <Ionicons
                            name={
                              expandedLineKey === line.key
                                ? "chevron-up"
                                : "chevron-down"
                            }
                            size={18}
                            color={theme.textSecondary}
                          />
                        </Pressable>
                      </View>
                    </View>
                    {lines.length > 1 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove settlement item ${index + 1}`}
                        hitSlop={8}
                        onPress={() => {
                          setLines((current) =>
                            current.filter((candidate) => candidate.key !== line.key),
                          )
                          if (expandedLineKey === line.key) {
                            setExpandedLineKey(
                              lines.find((candidate) => candidate.key !== line.key)?.key ??
                                "",
                            );
                          }
                        }}
                      >
                        <Ionicons name="trash-outline" size={20} color={theme.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                  {expandedLineKey === line.key ? (
                    <View style={styles.lineEditor}>
                      <View style={styles.pills}>
                        {(["cash", "goods", "service"] as const).map((kind) => (
                          <Choice
                            key={kind}
                            label={titleCase(kind)}
                            selected={line.kind === kind}
                            onPress={() =>
                              setLines((current) =>
                                current.map((candidate) =>
                                  candidate.key === line.key
                                    ? {
                                        ...newDraft(kind, direction),
                                        key: candidate.key,
                                      }
                                    : candidate,
                                ),
                              )
                            }
                          />
                        ))}
                      </View>
                      {line.kind === "cash" ? (
                        <>
                          <TextField
                            label="Cash amount"
                            style={styles.fieldInput}
                            ref={inputRef(`${line.key}:amount`)}
                            error={
                              validationError?.fieldKey === `${line.key}:amount`
                                ? validationError.message
                                : undefined
                            }
                            value={
                              autofillFullAmount && line.key === autoCashKey
                                ? autoCashAmount.toFixed(2)
                                : line.amount
                            }
                            onChangeText={(amount) => {
                              setValidationError(null);
                              updateLine(line.key, (draft) => ({ ...draft, amount }))
                            }}
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                            editable={!(autofillFullAmount && line.key === autoCashKey)}
                          />
                          <AppText size="small" weight="semibold">
                            Payment method
                          </AppText>
                          <View style={styles.pills}>
                            {paymentMethods.map((method) => (
                              <Choice
                                key={method}
                                label={titleCase(method.replace("_", " "))}
                                selected={line.payment_method === method}
                                onPress={() =>
                                  updateLine(line.key, (draft) =>
                                    draft.kind === "cash"
                                      ? { ...draft, payment_method: method }
                                      : draft,
                                  )
                                }
                              />
                            ))}
                          </View>
                          <TextField
                            label="Payment reference (optional)"
                            style={styles.fieldInput}
                            value={line.reference_number}
                            onChangeText={(reference_number) =>
                              updateLine(line.key, (draft) =>
                                draft.kind === "cash"
                                  ? { ...draft, reference_number }
                                  : draft,
                              )
                            }
                            placeholder="Receipt, M-Pesa code, etc."
                          />
                        </>
                      ) : null}
                      {line.kind === "service" ? (
                        <>
                          <TextField
                            label="Service description"
                            style={styles.fieldInput}
                            ref={inputRef(`${line.key}:description`)}
                            error={
                              validationError?.fieldKey === `${line.key}:description`
                                ? validationError.message
                                : undefined
                            }
                            value={line.description}
                            onChangeText={(description) =>
                              {
                                setValidationError(null);
                                updateLine(line.key, (draft) =>
                                draft.kind === "service"
                                  ? { ...draft, description }
                                  : draft,
                                );
                              }
                            }
                            placeholder="e.g. veterinary visit"
                          />
                          <TextField
                            label="Agreed service value"
                            style={styles.fieldInput}
                            ref={inputRef(`${line.key}:value`)}
                            error={
                              validationError?.fieldKey === `${line.key}:value`
                                ? validationError.message
                                : undefined
                            }
                            value={line.value}
                            onChangeText={(value) =>
                              {
                                setValidationError(null);
                                updateLine(line.key, (draft) =>
                                draft.kind === "service"
                                  ? { ...draft, value }
                                  : draft,
                                );
                              }
                            }
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                          />
                        </>
                      ) : null}
                      {line.kind === "goods" ? (
                        <GoodsFields
                          line={line}
                          products={products.data ?? []}
                          userId={user?.id}
                          farmId={farmId}
                          direction={direction}
                          settlementDate={settlementDate}
                          currency={theme.currency}
                          validationError={
                            validationError?.lineKey === line.key
                              ? validationError
                              : null
                          }
                          registerInput={registerInput}
                          onChange={(patch) =>
                            {
                              setValidationError(null);
                              updateLine(line.key, (draft) =>
                              draft.kind === "goods" ? { ...draft, ...patch } : draft,
                              );
                            }
                          }
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ))}
              <Button
                label="Add another item"
                variant="secondary"
                onPress={() => {
                  const draft = newDraft("cash", direction);
                  setLines((current) => [...current, draft]);
                  setExpandedLineKey(draft.key);
                }}
              />
            </Card>

            <Card style={styles.section}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: recordExpanded }}
                onPress={() => setRecordExpanded((current) => !current)}
                style={styles.accordionHeader}
              >
                <View style={[styles.sectionIcon, { backgroundColor: `${theme.primary}18` }]}>
                  <Ionicons name="document-text-outline" size={20} color={theme.primary} />
                </View>
                <View style={styles.grow}>
                  <AppText weight="semibold">Settlement record</AppText>
                </View>
                <Ionicons
                  name={recordExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color={theme.textSecondary}
                />
              </Pressable>
              {recordExpanded ? (
                <View style={styles.sectionBody}>
                  <DatePickerField
                    label="Settlement date"
                    value={settlementDate}
                    onChange={(value) => {
                      setSettlementDate(value);
                      setValidationError(null);
                    }}
                  />
                  {validationError?.fieldKey === "settlement:date" ? (
                    <AppText size="small" style={{ color: theme.danger }}>
                      {validationError.message}
                    </AppText>
                  ) : null}
                  <TextField
                    label="Reason"
                    style={styles.fieldInput}
                    ref={inputRef("settlement:reason")}
                    error={
                      validationError?.fieldKey === "settlement:reason"
                        ? validationError.message
                        : undefined
                    }
                    value={reason}
                    onChangeText={(value) => {
                      setReason(value);
                      setValidationError(null);
                    }}
                    placeholder="Reason for settlement"
                  />
                  <TextField
                    label="Notes (optional)"
                    style={styles.fieldInput}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Additional details"
                    multiline
                    numberOfLines={3}
                  />
                </View>
              ) : null}
            </Card>

            <Card style={[styles.totalCard, { borderColor: theme.border }]}>
              <View style={styles.totalRow}>
                <View style={styles.grow}>
                  <AppText size="small" tone="secondary">Settlement total</AppText>
                  <AppText
                    size="heading"
                    weight="semibold"
                    style={total > available ? { color: theme.danger } : undefined}
                  >
                    {formatMoney(total, theme.currency)}
                  </AppText>
                </View>
                <View style={styles.grow}>
                  <AppText size="small" tone="secondary">Balance after settlement</AppText>
                  <AppText
                    size="heading"
                    weight="semibold"
                    style={
                      total === available
                        ? { color: theme.success }
                        : undefined
                    }
                  >
                    {formatMoney(Math.max(available - total, 0), theme.currency)}
                  </AppText>
                </View>
              </View>
              {total > available ? (
                <AppText size="small" style={{ color: theme.danger }}>
                  Total is greater than the available balance.
                </AppText>
              ) : null}
              <Button
                label="Record settlement"
                loading={createSettlement.isPending}
                disabled={!isAvailable || total <= 0}
                onPress={() => void submit()}
              />
            </Card>
          </>
        )}

        <Card style={styles.section}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: historyExpanded }}
            onPress={() => setHistoryExpanded((current) => !current)}
            style={styles.accordionHeader}
          >
            <View style={styles.grow}>
              <AppText weight="semibold">Settlement history</AppText>
              {!historyExpanded && settlements.data?.length ? (
                <AppText size="small" tone="secondary">
                  {settlements.data.length} previous {settlements.data.length === 1 ? "entry" : "entries"}
                </AppText>
              ) : null}
            </View>
            <Ionicons
              name={historyExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={theme.textSecondary}
            />
          </Pressable>
          {historyExpanded ? (
            settlements.isLoading ? (
              <ActivityIndicator color={theme.primary} />
            ) : settlements.isError ? (
              <>
                <AppText size="small" style={{ color: theme.danger }}>
                  {normalizeApiError(settlements.error).message}
                </AppText>
                <Button
                  label="Retry"
                  variant="secondary"
                  onPress={() => void settlements.refetch()}
                />
              </>
            ) : settlements.data?.length ? (
              settlements.data.map((record) => (
                <View
                  key={record.id}
                  style={[styles.historyItem, { borderColor: theme.border }]}
                >
                  <View style={styles.historyTop}>
                    <AppText weight="semibold">
                      {formatMoney(record.total_value, theme.currency)}
                    </AppText>
                    <AppText size="small" tone="secondary">
                      {record.settlement_date}
                    </AppText>
                  </View>
                  <AppText size="small">{record.reason}</AppText>
                  {record.lines.map((item) => (
                    <AppText key={item.id} size="small" tone="secondary">
                      {describeLine(item)}
                    </AppText>
                  ))}
                </View>
              ))
            ) : (
              <AppText size="small" tone="secondary">
                No settlements have been recorded for this transaction.
              </AppText>
            )
          ) : null}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );

  function updateLine(key: string, update: (line: DraftLine) => DraftLine) {
    setValidationError(null);
    setLines((current) =>
      current.map((line) => (line.key === key ? update(line) : line)),
    );
  }
}

function GoodsFields({
  line,
  products,
  userId,
  farmId,
  direction,
  settlementDate,
  currency,
  validationError,
  registerInput,
  onChange,
}: {
  line: GoodsDraft;
  products: Product[];
  userId: string | undefined;
  farmId: string | undefined;
  direction: SettlementDirection;
  settlementDate: string;
  currency: string;
  validationError: SettlementValidation | null;
  registerInput: (fieldKey: string, instance: TextInput | null) => void;
  onChange: (patch: Partial<GoodsDraft>) => void;
}) {
  const { theme } = useTheme();
  const [productSearch, setProductSearch] = useState("");
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [batchSectionOpen, setBatchSectionOpen] = useState(false);
  const [placementSectionOpen, setPlacementSectionOpen] = useState(false);
  const productSearchRef = useRef<TextInput>(null);
  const activeProducts = products.filter((product) => product.is_active);
  const selectedProduct = activeProducts.find(
    (product) => product.id === line.product_id,
  );
  const matchingProducts = activeProducts.filter((product) =>
    product.name.toLowerCase().includes(productSearch.trim().toLowerCase()),
  );
  const filteredProducts = matchingProducts.slice(0, 30);
  const matchingProductCount = matchingProducts.length;
  const units = selectedProduct?.product_units ?? [];
  const selectedUnit = units.find((unit) => unit.unit_id === line.unit_id);
  const baseUnit = units.find((unit) => unit.is_base_unit);
  const conversionFactor = Number(selectedUnit?.conversion_factor ?? 0);
  const baseQuantity = positive(line.quantity) * conversionFactor;
  const chicken = selectedProduct?.product_type === "chickens";
  const allocated = line.chicken_allocations.reduce(
    (sum, allocation) => sum + positive(allocation.quantity),
    0,
  );
  const received = direction === "contact_to_farm";
  const batchSummary =
    line.chicken_mode === "receive_new"
      ? [
          line.chicken_batch_custom_name.trim() || "New batch",
          titleCase(line.chicken_type),
          positive(line.chicken_age)
            ? `${formatNumber(positive(line.chicken_age))} ${line.chicken_age_unit} old`
            : null,
        ]
            .filter(Boolean)
            .join(" · ")
      : line.chicken_batch_name
        ? [
            line.chicken_batch_name,
            titleCase(line.chicken_batch_type || "other"),
            line.chicken_batch_hatch_date
              ? `${formatBatchAge(line.chicken_batch_hatch_date, settlementDate)} old`
              : "Age unknown",
          ].join(" · ")
        : "Choose an existing batch";
  const placedAllocations = line.chicken_allocations.filter(
    (allocation) => allocation.block_name || allocation.batch_name,
  );
  const firstPlacement = placedAllocations[0];
  const placementDetail = firstPlacement
    ? [
        firstPlacement.block_name ? `Block ${firstPlacement.block_name}` : null,
        !received && firstPlacement.batch_name ? firstPlacement.batch_name : null,
        !received && firstPlacement.batch_hatch_date
          ? `${titleCase(firstPlacement.batch_type || "other")}, ${formatBatchAge(firstPlacement.batch_hatch_date, today())} old`
          : null,
        placedAllocations.length > 1
          ? `+${placedAllocations.length - 1} more`
          : null,
      ]
          .filter(Boolean)
          .join(" · ")
    : "";
  const placementSummary = [
    `${formatNumber(allocated)} / ${formatNumber(baseQuantity)} placed`,
    placementDetail || null,
  ]
    .filter(Boolean)
    .join(" · ");
  useEffect(() => {
    if (validationError?.fieldKey !== `${line.key}:product`) return;
    requestAnimationFrame(() => productSearchRef.current?.focus());
  }, [line.key, validationError]);

  function selectProduct(product: Product) {
    const unit =
      product.product_units.find((candidate) => candidate.is_base_unit) ??
      product.product_units[0];
    onChange({
      product_id: product.id,
      unit_id: unit?.unit_id ?? "",
      quantity: "",
      discount_type: "",
      discount_value: "",
      discount_reason: "",
      chicken_batch_id: "",
      chicken_batch_name: "",
      chicken_batch_type: "",
      chicken_batch_hatch_date: "",
      chicken_batch_quantity: 0,
      chicken_batch_custom_name: "",
      chicken_allocations: [newChickenAllocation()],
    });
    setProductSearch("");
    setProductPickerOpen(false);
  }

  function updateAllocation(
    key: string,
    patch: Partial<ChickenAllocationDraft>,
  ) {
    onChange({
      chicken_allocations: line.chicken_allocations.map((allocation) =>
        allocation.key === key ? { ...allocation, ...patch } : allocation,
      ),
    });
  }

  return (
    <>
      {!selectedProduct ? (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setProductPickerOpen(true)}
            style={[
              styles.pickerTrigger,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              validationError?.fieldKey === `${line.key}:product` && {
                borderColor: theme.danger,
              },
            ]}
          >
            <Ionicons name="search-outline" size={19} color={theme.textSecondary} />
            <AppText style={styles.grow} tone="secondary">Choose a product</AppText>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </Pressable>
          {validationError?.fieldKey === `${line.key}:product` ? (
            <AppText size="small" style={{ color: theme.danger }}>
              {validationError.message}
            </AppText>
          ) : null}
          <Modal
            transparent
            animationType="slide"
            visible={
              productPickerOpen ||
              validationError?.fieldKey === `${line.key}:product`
            }
            onRequestClose={() => setProductPickerOpen(false)}
          >
            <Pressable
              style={styles.pickerBackdrop}
              onPress={() => setProductPickerOpen(false)}
            >
              <Pressable
                onPress={(event) => event.stopPropagation()}
                style={[styles.pickerSheet, { backgroundColor: theme.backgroundElement }]}
              >
                <View style={styles.pickerModalHeader}>
                  <View style={styles.grow}>
                    <AppText weight="semibold">Choose a product</AppText>
                    <AppText size="small" tone="secondary">
                      Search the farm’s active products.
                    </AppText>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close product picker"
                    onPress={() => setProductPickerOpen(false)}
                    hitSlop={10}
                  >
                    <Ionicons name="close" size={24} color={theme.text} />
                  </Pressable>
                </View>
                <TextField
                  label="Search products"
                  style={styles.fieldInput}
                  ref={(instance) => {
                    productSearchRef.current = instance;
                    registerInput(`${line.key}:product`, instance);
                  }}
                  error={
                    validationError?.fieldKey === `${line.key}:product`
                      ? validationError.message
                      : undefined
                  }
                  value={productSearch}
                  onChangeText={setProductSearch}
                  placeholder="Type a product name"
                  autoCapitalize="words"
                />
                <ScrollView
                  style={styles.modalOptionList}
                  keyboardShouldPersistTaps="handled"
                >
                  {filteredProducts.length ? filteredProducts.map((product) => (
                    <Pressable
                      key={product.id}
                      accessibilityRole="button"
                      onPress={() => selectProduct(product)}
                      style={[
                        styles.modalOption,
                        { borderBottomColor: theme.border },
                      ]}
                    >
                      <View style={styles.grow}>
                        <AppText weight="semibold">{product.name}</AppText>
                        <AppText size="small" tone="secondary">
                          {titleCase(product.product_type)}
                        </AppText>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                    </Pressable>
                  )) : (
                    <AppText size="small" tone="secondary" style={styles.modalEmpty}>
                      {activeProducts.length
                        ? "No products match that search."
                        : "Create a product before settling with goods."}
                    </AppText>
                  )}
                  {matchingProductCount > 30 ? (
                    <AppText size="small" tone="secondary" style={styles.modalEmpty}>
                      Showing the first 30 matches. Refine your search to narrow the list.
                    </AppText>
                  ) : null}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      ) : null}
      {selectedProduct ? (
        <View style={styles.selectedItem}>
          <AppText weight="semibold">{selectedProduct.name}</AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onChange({ product_id: "", unit_id: "" });
              setProductSearch("");
            }}
          >
            <AppText size="small" style={{ color: theme.primary }}>Change</AppText>
          </Pressable>
        </View>
      ) : null}
      {selectedProduct ? (
        <>
          <AppText size="small" weight="semibold">Unit</AppText>
          <View style={styles.optionList}>
            {units.map((unit) => (
              <Pressable
                key={unit.unit_id}
                accessibilityRole="button"
                accessibilityState={{ selected: line.unit_id === unit.unit_id }}
                onPress={() => onChange({ unit_id: unit.unit_id })}
                style={[
                  styles.unitOption,
                  {
                    backgroundColor:
                      line.unit_id === unit.unit_id
                        ? theme.backgroundSelected
                        : theme.backgroundElement,
                  },
                ]}
              >
                <AppText size="small" weight="semibold">
                  {unit.unit_name} ({unit.unit_abbreviation})
                </AppText>
                {line.unit_id === unit.unit_id ? (
                  <Ionicons name="checkmark-circle" size={18} color={theme.primary} />
                ) : null}
              </Pressable>
            ))}
          </View>
          {selectedUnit && baseUnit ? (
            <View style={[styles.conversionCard, { backgroundColor: theme.backgroundSelected }]}>
                <Ionicons name="swap-horizontal-outline" size={18} color={theme.primary} />
                <AppText size="small" style={{ color: theme.primary, flex: 1 }}>
                1 {selectedUnit.unit_abbreviation} ={" "}
                {formatNumber(Number(selectedUnit.conversion_factor))}{" "}
                {baseUnit.unit_abbreviation}
                {line.quantity
                  ? ` · ${formatNumber(baseQuantity)} ${baseUnit.unit_abbreviation} in this line`
                  : ""}
              </AppText>
            </View>
          ) : null}
        </>
      ) : null}
      <TextField
        label="Quantity"
        style={styles.fieldInput}
        ref={(instance) => registerInput(`${line.key}:quantity`, instance)}
        error={
          validationError?.fieldKey === `${line.key}:quantity`
            ? validationError.message
            : undefined
        }
        value={line.quantity}
        onChangeText={(quantity) => onChange({ quantity })}
        keyboardType="decimal-pad"
        placeholder="0"
      />
      <TextField
        label="Agreed value per selected unit"
        style={styles.fieldInput}
        ref={(instance) => registerInput(`${line.key}:unit-value`, instance)}
        error={
          validationError?.fieldKey === `${line.key}:unit-value`
            ? validationError.message
            : undefined
        }
        value={line.agreed_unit_value}
        onChangeText={(agreed_unit_value) => onChange({ agreed_unit_value })}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />
      <AppText size="small" weight="semibold">Discount</AppText>
      <View style={styles.pills}>
        {([
          ["", "No discount"],
          ["fixed", "Fixed amount"],
          ["percentage", "Percentage"],
        ] as const).map(([discount_type, label]) => (
          <Choice
            key={label}
            label={label}
            selected={line.discount_type === discount_type}
            onPress={() =>
              onChange({
                discount_type,
                discount_value: discount_type ? line.discount_value : "",
                discount_reason: discount_type ? line.discount_reason : "",
              })
            }
          />
        ))}
      </View>
      {line.discount_type ? (
        <>
          <TextField
            label={
              line.discount_type === "percentage"
                ? "Discount percentage"
                : "Discount amount"
            }
            ref={(instance) =>
              registerInput(`${line.key}:discount`, instance)
            }
            error={
              validationError?.fieldKey === `${line.key}:discount`
                ? validationError.message
                : undefined
            }
            value={line.discount_value}
            onChangeText={(discount_value) => onChange({ discount_value })}
            keyboardType="decimal-pad"
            placeholder={line.discount_type === "percentage" ? "0" : "0.00"}
          />
          <TextField
            label="Discount reason (optional)"
            style={styles.fieldInput}
            value={line.discount_reason}
            onChangeText={(discount_reason) => onChange({ discount_reason })}
            placeholder="e.g. agreed price reduction"
          />
        </>
      ) : null}
      {selectedProduct ? (
        <View style={styles.lineValue}>
          <AppText size="small" tone="secondary">
            {formatNumber(positive(line.quantity))} {selectedUnit?.unit_abbreviation ?? ""}
            {" · "}
            {formatMoney(
              positive(line.quantity) * positive(line.agreed_unit_value),
              currency,
            )}{" "}
            gross · {formatMoney(draftLineValue(line), currency)} after discount
          </AppText>
        </View>
      ) : null}
      {chicken ? (
        <View style={[styles.chickenFlow, { borderTopColor: theme.border }]}>
          <View style={styles.chickenHeading}>
            <View style={styles.grow}>
              <AppText weight="semibold">Chicken placement</AppText>
              <AppText size="small" tone="secondary">
                {formatNumber(baseQuantity)} {baseUnit?.unit_abbreviation ?? "chickens"}
              </AppText>
            </View>
            <Ionicons name="paw-outline" size={20} color={theme.primary} />
          </View>
          {received ? (
            <AccordionSection
              title="Receiving batch"
              summary={batchSummary}
              expanded={
                batchSectionOpen ||
                validationError?.fieldKey === `${line.key}:age` ||
                validationError?.fieldKey === `${line.key}:batch`
              }
              onToggle={() => setBatchSectionOpen((current) => !current)}
            >
              <View style={styles.pills}>
                <Choice
                  label="New batch"
                  selected={line.chicken_mode === "receive_new"}
                  onPress={() =>
                    onChange({
                      chicken_mode: "receive_new",
                      chicken_batch_id: "",
                      chicken_batch_name: "",
                      chicken_batch_type: "",
                      chicken_batch_hatch_date: "",
                      chicken_batch_quantity: 0,
                      chicken_batch_custom_name: "",
                    })
                  }
                />
                <Choice
                  label="Existing batch"
                  selected={line.chicken_mode === "receive_existing"}
                  onPress={() =>
                    onChange({
                      chicken_mode: "receive_existing",
                      chicken_batch_id: "",
                      chicken_batch_name: "",
                      chicken_batch_type: "",
                      chicken_batch_hatch_date: "",
                      chicken_batch_quantity: 0,
                      chicken_batch_custom_name: "",
                    })
                  }
                />
              </View>
              {line.chicken_mode === "receive_existing" ? (
                <>
                  <SearchableChickenPicker
                    userId={userId}
                    farmId={farmId}
                    selection="receive_batch"
                    selectedId={line.chicken_batch_id}
                    settlementDate={settlementDate}
                    focusKey={`${line.key}:batch`}
                    error={
                      validationError?.fieldKey === `${line.key}:batch`
                        ? validationError.message
                        : undefined
                    }
                    registerInput={registerInput}
                    onSelect={(option) =>
                      onChange({
                        chicken_batch_id: option.id,
                        chicken_batch_name: option.name,
                        chicken_batch_type: option.chicken_type ?? "",
                        chicken_batch_hatch_date: option.hatch_date ?? "",
                        chicken_batch_quantity: option.quantity,
                      })
                    }
                    emptyMessage="No active batches found."
                  />
                </>
              ) : (
                <>
                  <TextField
                    label="Batch name (optional)"
                    style={styles.fieldInput}
                    value={line.chicken_batch_custom_name}
                    onChangeText={(chicken_batch_custom_name) =>
                      onChange({ chicken_batch_custom_name })
                    }
                    placeholder="Leave blank for automatic name"
                  />
                  <View style={styles.lineEditor}>
                    <AppText size="small" weight="semibold">Chicken type</AppText>
                    <View style={styles.pills}>
                      {chickenTypes.map((type) => (
                        <Choice
                          key={type}
                          label={titleCase(type)}
                          selected={line.chicken_type === type}
                          onPress={() => onChange({ chicken_type: type })}
                        />
                      ))}
                    </View>
                  </View>
                  <View style={styles.lineEditor}>
                    <TextField
                      label={`Age when received · ${settlementDate}`}
                      style={styles.fieldInput}
                      ref={(instance) => registerInput(`${line.key}:age`, instance)}
                      error={
                        validationError?.fieldKey === `${line.key}:age`
                          ? validationError.message
                          : undefined
                      }
                      value={line.chicken_age}
                      onChangeText={(chicken_age) => onChange({ chicken_age })}
                      keyboardType="number-pad"
                      placeholder="Enter age"
                    />
                    <View style={styles.pills}>
                      {(["days", "weeks", "months", "years"] as ChickenAgeUnit[]).map((unit) => (
                        <Choice
                          key={unit}
                          label={unit}
                          selected={line.chicken_age_unit === unit}
                          onPress={() => onChange({ chicken_age_unit: unit })}
                        />
                      ))}
                    </View>
                  </View>
                </>
              )}
            </AccordionSection>
          ) : null}
          <AccordionSection
            title={received ? "Block placement" : "Choose block, then batch"}
            summary={placementSummary}
            expanded={
              placementSectionOpen ||
              Boolean(validationError?.fieldKey?.includes(":allocation:"))
            }
            onToggle={() => setPlacementSectionOpen((current) => !current)}
          >
            {line.chicken_allocations.map((allocation, index) => (
              <View key={allocation.key} style={styles.placementGroup}>
                <View style={styles.placementHeader}>
                  <View style={styles.grow}>
                    <AppText weight="semibold">Placement {index + 1}</AppText>
                    {allocation.block_name ? (
                      <>
                        <AppText size="small" tone="secondary">
                          Block · {allocation.block_name}
                          {allocation.batch_name ? ` · ${allocation.batch_name}` : ""}
                        </AppText>
                        {allocation.batch_name ? (
                          <AppText size="small" tone="secondary">
                            {titleCase(allocation.batch_type || "other")}
                            {allocation.batch_hatch_date
                              ? ` · ${formatBatchAge(allocation.batch_hatch_date, received ? settlementDate : today())} old`
                              : " · Age unknown"}
                            {` · ${formatNumber(allocation.batch_quantity)} in block`}
                          </AppText>
                        ) : null}
                      </>
                    ) : null}
                  </View>
                  {line.chicken_allocations.length > 1 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove chicken placement ${index + 1}`}
                      hitSlop={8}
                      onPress={() =>
                        onChange({
                          chicken_allocations: line.chicken_allocations.filter(
                            (candidate) => candidate.key !== allocation.key,
                          ),
                        })
                      }
                    >
                      <Ionicons name="close-circle-outline" size={20} color={theme.danger} />
                    </Pressable>
                  ) : null}
                </View>
                <SearchableChickenPicker
                  userId={userId}
                  farmId={farmId}
                  selection={received ? "receive_block" : "issue_block"}
                  selectedId={allocation.block_id}
                  quantityLabel={received ? "spaces free" : "chickens"}
                  focusKey={`${line.key}:allocation:${allocation.key}:block`}
                  settlementDate={settlementDate}
                  error={
                    validationError?.fieldKey ===
                    `${line.key}:allocation:${allocation.key}:block`
                      ? validationError.message
                      : undefined
                  }
                  registerInput={registerInput}
                  emptyMessage={
                    received
                      ? "No active blocks have capacity."
                      : "No active blocks have chickens."
                  }
                  onSelect={(option) =>
                    updateAllocation(allocation.key, {
                      block_id: option.id,
                      block_name: option.name,
                      block_quantity: option.quantity,
                      ...(!received ? { batch_id: "" } : {}),
                      ...(!received
                        ? {
                            batch_name: "",
                            batch_type: "",
                            batch_hatch_date: "",
                            batch_quantity: 0,
                          }
                        : {}),
                    })
                  }
                />
                {!received && allocation.block_id ? (
                  <SearchableChickenPicker
                    userId={userId}
                    farmId={farmId}
                    selection="issue_batch"
                    blockId={allocation.block_id}
                    selectedId={allocation.batch_id}
                    quantityLabel="in this block"
                    focusKey={`${line.key}:allocation:${allocation.key}:batch`}
                    settlementDate={settlementDate}
                    error={
                      validationError?.fieldKey ===
                      `${line.key}:allocation:${allocation.key}:batch`
                        ? validationError.message
                        : undefined
                    }
                    registerInput={registerInput}
                    emptyMessage="No active batches in this block."
                    onSelect={(option) =>
                      updateAllocation(allocation.key, {
                        batch_id: option.id,
                        batch_name: option.name,
                        batch_type: option.chicken_type ?? "",
                        batch_hatch_date: option.hatch_date ?? "",
                        batch_quantity: option.quantity,
                      })
                    }
                  />
                ) : null}
                <TextField
                  label="Chickens in this placement"
                  style={styles.fieldInput}
                  ref={(instance) =>
                    registerInput(
                      `${line.key}:allocation:${allocation.key}:quantity`,
                      instance,
                    )
                  }
                  error={
                    validationError?.fieldKey ===
                    `${line.key}:allocation:${allocation.key}:quantity`
                      ? validationError.message
                      : undefined
                  }
                  value={allocation.quantity}
                  onChangeText={(quantity) =>
                    updateAllocation(allocation.key, { quantity })
                  }
                  keyboardType="number-pad"
                  placeholder="0"
                />
              </View>
            ))}
            <Button
              label="Add another block"
              variant="secondary"
              onPress={() =>
                onChange({
                  chicken_allocations: [
                    ...line.chicken_allocations,
                    newChickenAllocation(),
                  ],
                })
              }
            />
            <View style={styles.allocationTotal}>
              <AppText size="small" tone="secondary">Allocated</AppText>
              <AppText
                size="small"
                weight="semibold"
                style={{
                  color: allocated === baseQuantity ? theme.primary : theme.danger,
                }}
              >
                {formatNumber(allocated)} / {formatNumber(baseQuantity)}
              </AppText>
            </View>
          </AccordionSection>
        </View>
      ) : null}
    </>
  );
}

function SearchableChickenPicker({
  userId,
  farmId,
  selection,
  batchId,
  blockId,
  selectedId,
  quantityLabel = "chickens",
  emptyMessage,
  focusKey,
  settlementDate,
  error,
  registerInput,
  onSelect,
}: {
  userId: string | undefined;
  farmId: string | undefined;
  selection: ChickenSettlementSelection | undefined;
  batchId?: string;
  blockId?: string;
  selectedId: string;
  quantityLabel?: string;
  emptyMessage: string;
  focusKey: string;
  settlementDate: string;
  error?: string;
  registerInput: (fieldKey: string, instance: TextInput | null) => void;
  onSelect: (option: ChickenPickerOption) => void;
}) {
  const { theme } = useTheme();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ChickenPickerOption | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const searchRef = useRef<TextInput>(null);
  const isPickerVisible = pickerOpen || Boolean(error);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput);
      setOffset(0);
    }, 250);
    return () => clearTimeout(timeout);
  }, [searchInput]);
  useEffect(() => {
    if (!error) return;
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [error]);
  const query = useChickenSettlementOptions(
    userId,
    farmId,
    isPickerVisible ? selection : undefined,
    isPickerVisible ? search : "",
    batchId,
    blockId,
    offset,
  );
  const options = query.data
    ? selection === "receive_batch" || selection === "issue_batch"
      ? query.data.batches.map((batch) => ({
          id: batch.id,
          name: batch.name,
          quantity: batch.total_quantity,
          chicken_type: batch.chicken_type,
          hatch_date: batch.hatch_date,
        }))
      : query.data.blocks.map((block) => ({
          id: block.id,
          name: block.name,
          quantity:
            selection === "issue_block"
              ? block.batch_quantity ?? 0
              : block.available_capacity,
          chicken_type: undefined,
          hatch_date: undefined,
        }))
    : [];

  return (
    <View style={styles.picker}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          selected?.id === selectedId
            ? `Change selection from ${selected.name}`
            : `Choose ${selection?.endsWith("batch") ? "batch" : "block"}`
        }
        onPress={() => {
          setSearch("");
          setSearchInput("");
          setOffset(0);
          setPickerOpen(true);
        }}
        style={[
          styles.pickerTrigger,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: error ? theme.danger : theme.border,
          },
        ]}
      >
        {selected?.id === selectedId ? (
          <>
            <Ionicons name="checkmark-circle" size={19} color={theme.primary} />
            <View style={styles.grow}>
              <AppText size="small" weight="semibold">{selected.name}</AppText>
              {selected.chicken_type ? (
                <AppText size="small" tone="secondary">
                  {titleCase(selected.chicken_type)}
                  {selected.hatch_date
                    ? ` · ${formatBatchAge(selected.hatch_date, selection === "issue_batch" ? today() : settlementDate)} old`
                    : " · Age unknown"}
                  {` · ${formatNumber(selected.quantity)} ${quantityLabel}`}
                </AppText>
              ) : (
                <AppText size="small" tone="secondary">
                  {formatNumber(selected.quantity)} {quantityLabel}
                </AppText>
              )}
            </View>
          </>
        ) : (
          <>
            <Ionicons name="search-outline" size={19} color={theme.textSecondary} />
            <AppText style={styles.grow} tone="secondary">
              {selection?.endsWith("batch")
                ? selection === "receive_batch"
                  ? "Choose an existing batch"
                  : "Choose a batch from this block"
                : selection
                  ? "Choose a block"
                  : "Choose a batch first to search its housing blocks"}
            </AppText>
          </>
        )}
        {selection ? (
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        ) : null}
      </Pressable>
      {error ? (
        <AppText size="small" style={{ color: theme.danger }}>{error}</AppText>
      ) : null}
      {selection ? (
        <Modal
          transparent
          animationType="slide"
          visible={isPickerVisible}
          onRequestClose={() => setPickerOpen(false)}
        >
          <Pressable
            style={styles.pickerBackdrop}
            onPress={() => setPickerOpen(false)}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={[styles.pickerSheet, { backgroundColor: theme.backgroundElement }]}
            >
              <View style={styles.pickerModalHeader}>
                <View style={styles.grow}>
                  <AppText weight="semibold">
                    {selection === "issue_batch"
                      ? "Choose a batch"
                      : selection === "receive_batch"
                        ? "Choose an existing batch"
                        : "Choose a block"}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {selection === "issue_batch"
                      ? "Batches in this block, with age and available stock."
                      : selection === "receive_batch"
                        ? "Select the batch that will receive these chickens."
                        : "Select where these chickens will be placed."}
                  </AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close chicken picker"
                  onPress={() => setPickerOpen(false)}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={24} color={theme.text} />
                </Pressable>
              </View>
              <TextField
                label={
                  selection === "issue_batch"
                    ? "Find batch in this block"
                    : selection === "receive_batch"
                      ? "Search batches"
                      : "Search blocks"
                }
                style={styles.fieldInput}
                error={error}
                ref={(instance) => {
                  searchRef.current = instance;
                  registerInput(focusKey, instance);
                }}
                value={searchInput}
                onChangeText={setSearchInput}
                placeholder={
                  selection === "issue_batch"
                    ? "Search the selected block"
                    : selection === "receive_batch"
                      ? "Search batch name"
                      : "Search block name"
                }
                autoCapitalize="none"
              />
              {query.isLoading ? (
                <View style={styles.pickerLoading}>
                  <ActivityIndicator color={theme.primary} />
                  <AppText size="small" tone="secondary">Loading choices…</AppText>
                </View>
              ) : query.isError ? (
                <View style={styles.pickerLoading}>
                  <AppText size="small" style={{ color: theme.danger }}>
                    {normalizeApiError(query.error).message}
                  </AppText>
                  <Button
                    label="Retry search"
                    variant="secondary"
                    onPress={() => void query.refetch()}
                  />
                </View>
              ) : options.length ? (
                <ScrollView
                  style={styles.modalOptionList}
                  keyboardShouldPersistTaps="handled"
                >
                  {options.map((option) => (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: selectedId === option.id }}
                      style={[
                        styles.modalOption,
                        {
                          backgroundColor:
                            selectedId === option.id
                              ? theme.backgroundSelected
                              : "transparent",
                          borderBottomColor: theme.border,
                        },
                      ]}
                      onPress={() => {
                        setSelected(option);
                        onSelect(option);
                        setPickerOpen(false);
                        setSearch("");
                        setSearchInput("");
                      }}
                    >
                      <View style={styles.grow}>
                        <AppText size="small" weight="semibold">{option.name}</AppText>
                        {option.chicken_type ? (
                          <AppText size="small" tone="secondary">
                            {titleCase(option.chicken_type)}
                            {" · "}
                            {option.hatch_date
                              ? `${formatBatchAge(option.hatch_date, selection === "issue_batch" ? today() : settlementDate)} old · hatched ${formatDate(option.hatch_date)}`
                              : "Age not recorded"}
                          </AppText>
                        ) : null}
                      </View>
                      <View style={styles.optionQuantity}>
                        <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                          {formatNumber(option.quantity)}
                        </AppText>
                        <AppText size="small" tone="secondary">{quantityLabel}</AppText>
                      </View>
                      {selectedId === option.id ? (
                        <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                      ) : null}
                    </Pressable>
                  ))}
                </ScrollView>
              ) : (
                <AppText size="small" tone="secondary" style={styles.modalEmpty}>
                  {emptyMessage}
                </AppText>
              )}
              {query.data?.has_more || offset > 0 ? (
                <View style={styles.pickerPager}>
                  {offset > 0 ? (
                    <Button
                      label="Previous results"
                      variant="secondary"
                      onPress={() => setOffset((current) => Math.max(0, current - 30))}
                    />
                  ) : null}
                  {query.data?.has_more ? (
                    <Button
                      label="More results"
                      variant="secondary"
                      onPress={() => setOffset((current) => current + 30)}
                    />
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

function AccordionSection({
  title,
  summary,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.accordion}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.accordionHeader}
      >
        <View style={styles.grow}>
          <AppText weight="semibold">{title}</AppText>
          {!expanded ? (
            <AppText size="small" tone="secondary">{summary}</AppText>
          ) : null}
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={19}
          color={theme.textSecondary}
        />
      </Pressable>
      {expanded ? <View style={styles.accordionBody}>{children}</View> : null}
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.choice,
        {
          backgroundColor: selected ? theme.primary : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
    >
      <AppText
        size="small"
        weight="semibold"
        style={{ color: selected ? theme.onPrimary : theme.text }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function newDraft(
  kind: LineKind,
  direction: SettlementDirection = "contact_to_farm",
): DraftLine {
  const key = `${Date.now()}-${Math.random()}`;
  if (kind === "goods") {
    return {
      key,
      kind,
      product_id: "",
      unit_id: "",
      quantity: "",
      agreed_unit_value: "",
      discount_type: "",
      discount_value: "",
      discount_reason: "",
      chicken_mode:
        direction === "contact_to_farm" ? "receive_new" : "issue",
      chicken_batch_id: "",
      chicken_batch_name: "",
      chicken_batch_type: "",
      chicken_batch_hatch_date: "",
      chicken_batch_quantity: 0,
      chicken_batch_custom_name: "",
      chicken_type: "layers",
      chicken_age: "",
      chicken_age_unit: "weeks",
      chicken_allocations: [newChickenAllocation()],
    };
  }
  if (kind === "service") {
    return { key, kind, description: "", value: "" };
  }
  return {
    key,
    kind,
    amount: "",
    payment_method: "cash",
    reference_number: "",
  };
}

function newChickenAllocation(): ChickenAllocationDraft {
  return {
    key: `${Date.now()}-${Math.random()}`,
    batch_id: "",
    batch_name: "",
    batch_type: "",
    batch_hatch_date: "",
    batch_quantity: 0,
    block_id: "",
    block_name: "",
    block_quantity: 0,
    quantity: "",
  };
}

function positive(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 3,
  });
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

function formatBatchAge(hatchDate: string, referenceDate: string) {
  const hatch = new Date(`${hatchDate}T00:00:00`);
  const reference = new Date(`${referenceDate}T00:00:00`);
  if (Number.isNaN(hatch.getTime()) || Number.isNaN(reference.getTime())) {
    return "Age unknown";
  }
  const days = Math.max(
    0,
    Math.floor((reference.getTime() - hatch.getTime()) / 86_400_000),
  );
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"}`;
  if (days < 56) {
    const weeks = Math.floor(days / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }
  const months =
    (reference.getFullYear() - hatch.getFullYear()) * 12 +
    reference.getMonth() -
    hatch.getMonth() -
    (reference.getDate() < hatch.getDate() ? 1 : 0);
  if (months < 12) {
    const count = Math.max(months, 1);
    return `${count} ${count === 1 ? "month" : "months"}`;
  }
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return `${years} ${years === 1 ? "year" : "years"}${
    remainder ? ` ${remainder} ${remainder === 1 ? "month" : "months"}` : ""
  }`;
}

function draftLineValue(line: DraftLine) {
  if (line.kind === "cash") return roundMoney(positive(line.amount));
  if (line.kind === "service") return roundMoney(positive(line.value));
  const gross = roundMoney(
    positive(line.quantity) * positive(line.agreed_unit_value),
  );
  const discount = line.discount_type === "percentage"
    ? roundMoney((gross * positive(line.discount_value)) / 100)
    : line.discount_type === "fixed"
      ? roundMoney(positive(line.discount_value))
      : 0;
  return Math.max(0, roundMoney(gross - discount));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoney(value: number | string, currency: string) {
  return `${currency} ${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function describeLine(line: {
  kind: string;
  value: string;
  amount?: string;
  payment_method?: string;
  reference_number?: string | null;
  description?: string;
  quantity?: string;
  unit_abbreviation?: string;
  product_name?: string;
  discount_amount?: string;
  discount_reason?: string | null;
  chicken_placement?: {
    mode: "receive" | "issue";
    allocations: {
      batch_name: string;
      block_name: string;
      quantity: number;
    }[];
  };
}) {
  if (line.kind === "cash") {
    return `Cash · ${line.payment_method ?? "payment"}${line.reference_number ? ` · ${line.reference_number}` : ""} · ${line.amount ?? line.value}`;
  }
  if (line.kind === "goods") {
    const placement = line.chicken_placement?.allocations
      .map(
        (allocation) =>
          `${allocation.quantity} ${allocation.batch_name} → ${allocation.block_name}`,
      )
      .join(", ");
    const discount = Number(line.discount_amount ?? 0) > 0
      ? ` · discount ${line.discount_amount}${line.discount_reason ? ` (${line.discount_reason})` : ""}`
      : "";
    return `${line.quantity ?? "0"} ${line.unit_abbreviation ?? ""} ${line.product_name ?? "goods"}${discount} · net value ${line.value}${placement ? ` · ${line.chicken_placement?.mode === "receive" ? "received" : "issued"}: ${placement}` : ""}`;
  }
  return `Service · ${line.description ?? "service"} · value ${line.value}`;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const chickenTypes: ChickenType[] = [
  "layers",
  "broiler",
  "kienyeji",
  "breeder",
  "other",
];

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 36,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  directionCard: {
    padding: 16,
    gap: 12,
    borderRadius: 14,
    borderLeftWidth: 4,
  },
  directionFlow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  directionParty: { flex: 1, minWidth: 100, gap: 3 },
  grow: { flex: 1, gap: 6 },
  section: { padding: 16, gap: 16, borderRadius: 14 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  accordionHeader: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sectionBody: { gap: 14, paddingTop: 12 },
  autofillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  sectionIcon: {
    height: 40,
    width: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  lineCard: { paddingVertical: 12, gap: 14 },
  lineDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  lineHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lineTitle: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  expandLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 40,
  },
  lineEditor: { gap: 14 },
  fieldInput: { borderWidth: 1, borderRadius: 8, minHeight: 48 },
  lineNumber: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20 },
  selectedItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  unitOption: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  conversionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  lineValue: { paddingHorizontal: 2 },
  chickenFlow: { gap: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  chickenHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  accordion: { gap: 8, paddingTop: 8 },
  accordionBody: { gap: 14, paddingTop: 8 },
  placementGroup: { gap: 12, paddingVertical: 12 },
  placementHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  allocationTotal: { flexDirection: "row", justifyContent: "space-between" },
  totalCard: { padding: 16, gap: 14, borderRadius: 14 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  picker: { gap: 10 },
  pickerTrigger: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 14,
  },
  optionList: { gap: 8 },
  pickerBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.56)",
  },
  pickerSheet: {
    width: "100%",
    maxWidth: 640,
    height: "88%",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 14,
  },
  pickerModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  modalOptionList: {
    flex: 1,
    minHeight: 100,
    width: "100%",
  },
  modalOption: {
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionQuantity: {
    alignItems: "flex-end",
    minWidth: 76,
  },
  modalEmpty: {
    paddingVertical: 24,
    paddingHorizontal: 8,
  },
  pickerLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  pickerPager: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  historyItem: { paddingVertical: 12, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  historyTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
