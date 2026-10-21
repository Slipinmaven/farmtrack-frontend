import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
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
import { SessionGate } from "@/components/layout/session-gate";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TextField } from "@/components/ui/text-field";
import type {
  EggCollectionProduct,
  EggLossResult,
  EggLossReason,
} from "@/features/eggs/api";
import {
  useCreateEggLoss,
  useEggCollectionOptions,
} from "@/features/eggs/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const reasons: { value: EggLossReason; label: string; hint: string }[] = [
  { value: "broken", label: "Broken", hint: "Cracked or broken during handling" },
  { value: "spoiled", label: "Spoiled", hint: "No longer safe or suitable to sell" },
  {
    value: "contaminated",
    label: "Contaminated",
    hint: "Affected by dirt or another contaminant",
  },
  { value: "damaged", label: "Damaged", hint: "Damaged but not necessarily broken" },
  { value: "discarded", label: "Discarded", hint: "Removed from usable stock" },
  { value: "other", label: "Other", hint: "Another reason" },
];

export default function EggLossScreen() {
  return (
    <SessionGate>
      <EggLossContent />
    </SessionGate>
  );
}

function EggLossContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const farmId = farm.selectedFarm?.id;
  const options = useEggCollectionOptions(user?.id, farmId);
  const createLoss = useCreateEggLoss(user?.id ?? "", farmId ?? "");
  const [stage, setStage] = useState<"select" | "review">("select");
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [lossItems, setLossItems] = useState<
    { quantity: string; unitId: string }[]
  >([{ quantity: "", unitId: "" }]);
  const [lossDate, setLossDate] = useState(localToday());
  const [reason, setReason] = useState<EggLossReason | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const product = options.data?.products.find((item) => item.id === productId);
  const products = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return (
      options.data?.products.filter(
        (item) =>
          !query ||
          item.name.toLowerCase().includes(query) ||
          item.units.some(
            (unit) =>
              unit.name.toLowerCase().includes(query) ||
              unit.abbreviation.toLowerCase().includes(query),
          ),
      ) ?? []
    );
  }, [options.data, productSearch]);
  const baseUnit = product?.units.find((unit) => unit.is_base_unit);
  const collectedBase = Number(product?.collected_quantity_in_base_unit ?? 0);
  const lostBase = Number(product?.lost_quantity_in_base_unit ?? 0);
  const availableBase = Number(product?.available_quantity_in_base_unit ?? 0);
  const enteredLossItems = lossItems
    .filter((item) => item.quantity.trim())
    .map((item) => ({
      ...item,
      unit: product?.units.find((unit) => unit.id === item.unitId),
    }));
  const lossBase = enteredLossItems.reduce(
    (total, item) =>
      total +
      Number(item.quantity || 0) *
        Number(item.unit?.conversion_factor ?? 0),
    0,
  );

  function chooseProduct(nextProduct: EggCollectionProduct) {
    setProductId(nextProduct.id);
    setLossItems([
      {
        quantity: "",
        unitId:
          nextProduct.units.find((unit) => unit.is_base_unit)?.id ??
          nextProduct.units[0]?.id ??
          "",
      },
    ]);
    setError("");
  }

  function validateAndReview() {
    if (!product) {
      setError("Choose the egg product this loss belongs to.");
      return;
    }
    if (!enteredLossItems.length) {
      setError("Enter a quantity for at least one unit.");
      return;
    }
    for (const item of enteredLossItems) {
      if (!item.unit) {
        setError("Choose a configured unit for every quantity entered.");
        return;
      }
      const parsedQuantity = Number(item.quantity);
      if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
        setError("Every entered quantity must be greater than zero.");
        return;
      }
      if (!/^\d+(\.\d{1,3})?$/.test(item.quantity)) {
        setError("Use up to three decimal places for each quantity.");
        return;
      }
      if (item.quantity.split(".")[0].length > 9) {
        setError("A quantity is too large. Enter no more than 9 whole-number digits.");
        return;
      }
    }
    if (
      new Set(enteredLossItems.map((item) => item.unitId)).size !==
      enteredLossItems.length
    ) {
      setError("Use each unit only once. Add a different unit for another quantity.");
      return;
    }
    if (!availableBase) {
      setError("There are no collected eggs available to write off for this product.");
      return;
    }
    if (lossBase > availableBase) {
      setError(
        `This loss is ${formatQuantity(lossBase)} ${baseUnit?.abbreviation || baseUnit?.name}, but only ${formatQuantity(availableBase)} remain. Reduce the quantity or choose another product.`,
      );
      return;
    }
    if (!reason) {
      setError("Choose the main reason for this egg loss.");
      return;
    }
    if (!isValidDate(lossDate)) {
      setError("Choose a valid loss date.");
      return;
    }
    if (new Date(`${lossDate}T00:00:00`).getTime() > new Date().getTime()) {
      setError("Loss date cannot be in the future.");
      return;
    }
    setError("");
    setStage("review");
  }

  async function submitLoss() {
    if (!product || !reason) return;
    let results: EggLossResult[];
    try {
      results = await createLoss.mutateAsync({
        product_id: product.id,
        items: enteredLossItems.map(({ quantity: itemQuantity, unitId: itemUnitId }) => ({
          quantity: itemQuantity,
          unit_id: itemUnitId,
        })),
        loss_date: lossDate,
        reason,
        notes: notes.trim() || undefined,
      });
    } catch (submitError: unknown) {
      setError(friendlyLossError(normalizeApiError(submitError).message));
      setStage("select");
      return;
    }
    await dialog.showDialog({
      title: "Egg loss recorded",
      message: `${formatQuantity(results.reduce((total, result) => total + Number(result.quantity_in_base_unit), 0))} ${baseUnit?.abbreviation || baseUnit?.name || "eggs"} written off. Remaining available: ${formatQuantity(Math.max(availableBase - lossBase, 0))} ${baseUnit?.abbreviation || baseUnit?.name || "eggs"}.`,
      tone: "success",
    });
    router.replace("/(tabs)/eggs");
  }

  if (options.isLoading) {
    return <LoadingState label="Loading egg inventory" />;
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <FarmPageHeader
            title={stage === "select" ? "Record egg loss" : "Review egg loss"}
            showBack
            backHref="/(tabs)/eggs"
          />

          {options.isError ? (
            <Card style={styles.section}>
              <AppText weight="semibold">Could not load egg inventory</AppText>
              <AppText size="small" tone="secondary">
                {normalizeApiError(options.error).message}
              </AppText>
              <Button
                label="Retry"
                variant="secondary"
                onPress={() => void options.refetch()}
              />
            </Card>
          ) : null}

          {!options.isError &&
          !options.data?.products.length ? (
            <Card style={styles.empty}>
              <Ionicons
                name="egg-outline"
                size={26}
                color={theme.textSecondary}
              />
              <AppText weight="semibold">Set up an egg product first</AppText>
              <AppText size="small" tone="secondary">
                Create an active egg product and configure its units before
                recording losses.
              </AppText>
            </Card>
          ) : null}

          {options.data?.products.length && !options.isError ? (
            <>
              {stage === "select" ? (
                <>
                  <View
                    style={[
                      styles.inventoryNotice,
                      {
                        backgroundColor: `${theme.primary}0D`,
                        borderColor: `${theme.primary}35`,
                      },
                    ]}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={19}
                      color={theme.primary}
                    />
                    <AppText size="small" style={styles.noticeText}>
                      Collected eggs from blocks are combined into farm stock.
                      This loss is deducted from the selected product’s total,
                      not assigned to one source block.
                    </AppText>
                  </View>

                  <Card style={styles.section}>
                    <SectionHeading
                      step="1"
                      title="Choose egg product"
                      detail="Available quantity is calculated from recorded collections minus previous losses."
                    />
                    {options.data.products.length > 4 ? (
                      <TextField
                        label="Search egg products or units"
                        placeholder="Product name or unit"
                        value={productSearch}
                        onChangeText={setProductSearch}
                      />
                    ) : null}
                    <View style={styles.productList}>
                      {products.map((item) => (
                        <ProductChoice
                          key={item.id}
                          product={item}
                          selected={productId === item.id}
                          onPress={() => chooseProduct(item)}
                        />
                      ))}
                    </View>
                    {products.length === 0 ? (
                      <AppText size="small" tone="secondary">
                        No egg products or units match that search.
                      </AppText>
                    ) : null}
                  </Card>

                  {product ? (
                    <>
                      <Card style={styles.stockCard}>
                        <View style={styles.stockHeading}>
                          <View style={styles.stockCopy}>
                            <AppText size="small" tone="secondary">
                              Available before this loss
                            </AppText>
                            <AppText size="heading" weight="semibold">
                              {options.isFetching
                                ? "Refreshing…"
                                : `${formatQuantity(availableBase)} ${baseUnit?.abbreviation || baseUnit?.name || "base units"}`}
                            </AppText>
                          </View>
                          <View
                            style={[
                              styles.stockIcon,
                              { backgroundColor: `${theme.success}18` },
                            ]}
                          >
                            <Ionicons
                              name="layers-outline"
                              size={20}
                              color={theme.success}
                            />
                          </View>
                        </View>
                        <AppText size="small" tone="secondary">
                          Collected: {formatQuantity(collectedBase)} · Previously
                          lost: {formatQuantity(lostBase)}{" "}
                          {baseUnit?.abbreviation || baseUnit?.name}
                        </AppText>
                        {availableBase <= 0 ? (
                          <AppText
                            size="small"
                            style={{ color: theme.danger }}
                          >
                            No available stock for this product. Record a
                            collection before writing off eggs.
                          </AppText>
                        ) : null}
                      </Card>

                      <Card style={styles.section}>
                        <SectionHeading
                          step="2"
                          title="Enter the loss"
                          detail="Add a quantity for every unit involved. All quantities are checked together against available stock."
                        />
                        {lossItems.map((item, index) => {
                          const unit = product.units.find(
                            (candidate) => candidate.id === item.unitId,
                          );
                          const lineBase =
                            Number(item.quantity || 0) *
                            Number(unit?.conversion_factor ?? 0);
                          return (
                            <View key={`loss-item-${index}`} style={styles.lossItem}>
                              <View style={styles.lossItemHeading}>
                                <AppText weight="semibold">
                                  Quantity {index + 1}
                                </AppText>
                                {lossItems.length > 1 ? (
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove quantity ${index + 1}`}
                                    onPress={() => {
                                      setLossItems((current) =>
                                        current.filter((_, itemIndex) => itemIndex !== index),
                                      );
                                      setError("");
                                    }}
                                    hitSlop={8}
                                  >
                                    <Ionicons
                                      name="close-circle-outline"
                                      size={22}
                                      color={theme.textSecondary}
                                    />
                                  </Pressable>
                                ) : null}
                              </View>
                              <TextField
                                label="Quantity"
                                placeholder="0"
                                value={item.quantity}
                                onChangeText={(value) => {
                                  const sanitized = value
                                    .replace(",", ".")
                                    .replace(/[^\d.]/g, "");
                                  const [integer, ...fraction] =
                                    sanitized.split(".");
                                  const normalizedInteger =
                                    integer || (fraction.length ? "0" : "");
                                  const quantity = fraction.length
                                    ? `${normalizedInteger}.${fraction.join("").slice(0, 3)}`
                                    : normalizedInteger;
                                  setLossItems((current) =>
                                    current.map((entry, itemIndex) =>
                                      itemIndex === index
                                        ? { ...entry, quantity }
                                        : entry,
                                    ),
                                  );
                                  setError("");
                                }}
                                keyboardType="decimal-pad"
                                maxLength={13}
                              />
                              <AppText size="small" weight="semibold">
                                Unit
                              </AppText>
                              <View style={styles.unitList}>
                                {product.units.map((candidate) => {
                                  const selected = item.unitId === candidate.id;
                                  const usedByAnother = lossItems.some(
                                    (entry, itemIndex) =>
                                      itemIndex !== index &&
                                      entry.unitId === candidate.id &&
                                      entry.quantity.trim().length > 0,
                                  );
                                  return (
                                    <Pressable
                                      key={candidate.id}
                                      accessibilityRole="radio"
                                      accessibilityState={{ checked: selected }}
                                      disabled={usedByAnother}
                                      onPress={() => {
                                        setLossItems((current) =>
                                          current.map((entry, itemIndex) =>
                                            itemIndex === index
                                              ? { ...entry, unitId: candidate.id }
                                              : entry,
                                          ),
                                        );
                                        setError("");
                                      }}
                                      style={[
                                        styles.unitChoice,
                                        {
                                          borderColor: selected
                                            ? theme.primary
                                            : theme.border,
                                          backgroundColor: selected
                                            ? `${theme.primary}0A`
                                            : theme.background,
                                          opacity: usedByAnother ? 0.45 : 1,
                                        },
                                      ]}
                                    >
                                      <View style={styles.unitChoiceCopy}>
                                        <AppText
                                          weight="semibold"
                                          style={{
                                            color: selected
                                              ? theme.primary
                                              : theme.text,
                                          }}
                                        >
                                          {candidate.name}
                                        </AppText>
                                        <AppText size="small" tone="secondary">
                                          {candidate.is_base_unit
                                            ? "Base unit"
                                            : `1 ${candidate.abbreviation} = ${formatQuantity(Number(candidate.conversion_factor))} ${baseUnit?.abbreviation || baseUnit?.name}`}
                                        </AppText>
                                      </View>
                                      <Ionicons
                                        name={
                                          selected
                                            ? "radio-button-on"
                                            : "radio-button-off"
                                        }
                                        size={19}
                                        color={
                                          selected
                                            ? theme.primary
                                            : theme.textSecondary
                                        }
                                      />
                                    </Pressable>
                                  );
                                })}
                              </View>
                              {item.quantity && unit ? (
                                <View
                                  style={[
                                    styles.conversion,
                                    { backgroundColor: theme.backgroundElement },
                                  ]}
                                >
                                  <AppText size="small" tone="secondary">
                                    This quantity equals
                                  </AppText>
                                  <AppText weight="semibold">
                                    {formatQuantity(lineBase)}{" "}
                                    {baseUnit?.abbreviation || baseUnit?.name}
                                  </AppText>
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                        {lossItems.length < product.units.length ? (
                          <Button
                            label="Add another unit"
                            variant="secondary"
                            onPress={() => {
                              const availableUnit = product.units.find(
                                (unit) =>
                                  !lossItems.some((entry) => entry.unitId === unit.id),
                              );
                              if (!availableUnit) return;
                              setLossItems((current) => [
                                ...current,
                                { quantity: "", unitId: availableUnit.id },
                              ]);
                              setError("");
                            }}
                          />
                        ) : null}
                        {enteredLossItems.length ? (
                          <View
                            style={[
                              styles.conversion,
                              { backgroundColor: theme.backgroundElement },
                            ]}
                          >
                            <AppText size="small" tone="secondary">
                              Combined loss
                            </AppText>
                            <AppText weight="semibold">
                              {formatQuantity(lossBase)}{" "}
                              {baseUnit?.abbreviation || baseUnit?.name}
                            </AppText>
                          </View>
                        ) : null}
                      </Card>

                      <Card style={styles.section}>
                        <SectionHeading
                          step="3"
                          title="Why were the eggs lost?"
                          detail="Choose the closest reason for your records."
                        />
                        <View style={styles.reasonList}>
                          {reasons.map((item) => {
                            const selected = reason === item.value;
                            return (
                              <Pressable
                                key={item.value}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: selected }}
                                onPress={() => {
                                  setReason(item.value);
                                  setError("");
                                }}
                                style={[
                                  styles.reasonChoice,
                                  {
                                    borderColor: selected
                                      ? theme.primary
                                      : theme.border,
                                    backgroundColor: selected
                                      ? `${theme.primary}0A`
                                      : theme.background,
                                  },
                                ]}
                              >
                                <View style={styles.reasonCopy}>
                                  <AppText weight="semibold">
                                    {item.label}
                                  </AppText>
                                  <AppText size="small" tone="secondary">
                                    {item.hint}
                                  </AppText>
                                </View>
                                <Ionicons
                                  name={
                                    selected
                                      ? "radio-button-on"
                                      : "radio-button-off"
                                  }
                                  size={19}
                                  color={
                                    selected
                                      ? theme.primary
                                      : theme.textSecondary
                                  }
                                />
                              </Pressable>
                            );
                          })}
                        </View>
                      </Card>

                      <Card style={styles.section}>
                        <SectionHeading
                          step="4"
                          title="Date and notes"
                          detail="Record when the loss happened and add context if useful."
                        />
                        <DatePickerField
                          label="Loss date"
                          value={lossDate}
                          maximumDate={new Date()}
                          onChange={(value) => {
                            setLossDate(value);
                            setError("");
                          }}
                        />
                        <TextField
                          label="Notes (optional)"
                          placeholder="Add any details about this loss"
                          value={notes}
                          onChangeText={setNotes}
                          multiline
                          textAlignVertical="top"
                          style={styles.notesInput}
                        />
                      </Card>
                    </>
                  ) : null}
                </>
              ) : product && enteredLossItems.length && reason ? (
                <Card style={styles.reviewCard}>
                  <View style={styles.reviewHeading}>
                    <View
                      style={[
                        styles.reviewIcon,
                        { backgroundColor: `${theme.danger}18` },
                      ]}
                    >
                      <Ionicons
                        name="alert-circle-outline"
                        size={20}
                        color={theme.danger}
                      />
                    </View>
                    <View style={styles.reviewCopy}>
                      <AppText weight="semibold">{product.name}</AppText>
                      <AppText size="small" tone="secondary">
                        Egg loss · {formatDate(lossDate)}
                      </AppText>
                    </View>
                  </View>
                  {enteredLossItems.map((item) => (
                    <SummaryRow
                      key={item.unitId}
                      label="Quantity lost"
                      value={`${item.quantity} ${item.unit?.name ?? "unit"}`}
                    />
                  ))}
                  <SummaryRow
                    label="Base unit equivalent"
                    value={`${formatQuantity(lossBase)} ${baseUnit?.abbreviation || baseUnit?.name}`}
                  />
                  <SummaryRow
                    label="Reason"
                    value={reasons.find((item) => item.value === reason)?.label ?? reason}
                  />
                  <SummaryRow
                    label="Available after loss"
                    value={`${formatQuantity(Math.max(availableBase - lossBase, 0))} ${baseUnit?.abbreviation || baseUnit?.name}`}
                  />
                  {notes.trim() ? (
                    <SummaryRow label="Notes" value={notes.trim()} />
                  ) : null}
                  <AppText size="small" tone="secondary">
                    This is deducted from combined farm stock for this egg
                    product.
                  </AppText>
                </Card>
              ) : null}
            </>
          ) : null}

          {error ? (
            <View
              style={[styles.error, { backgroundColor: `${theme.danger}10` }]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={17}
                color={theme.danger}
              />
              <AppText size="small" style={{ color: theme.danger, flex: 1 }}>
                {error}
              </AppText>
            </View>
          ) : null}
        </ScrollView>

        {options.data?.products.length ? (
          <View
            style={[
              styles.bottomBar,
              {
                backgroundColor: theme.background,
                borderTopColor: theme.border,
              },
            ]}
          >
            <View style={styles.bottomCopy}>
              <AppText size="small" weight="semibold" numberOfLines={1}>
                {stage === "review"
                  ? `${formatQuantity(lossBase)} ${baseUnit?.abbreviation || baseUnit?.name || "eggs"} lost`
                  : product
                    ? `${formatQuantity(availableBase)} ${baseUnit?.abbreviation || baseUnit?.name || "eggs"} available`
                    : "Choose an egg product"}
              </AppText>
              <AppText size="small" tone="secondary" numberOfLines={1}>
                {product?.name ?? "Egg inventory"}
              </AppText>
            </View>
            {stage === "select" ? (
              <Button
                label="Review loss"
                disabled={!product || options.isFetching}
                onPress={validateAndReview}
              />
            ) : (
              <View style={styles.reviewActions}>
                <Button
                  label="Edit"
                  variant="secondary"
                  onPress={() => setStage("select")}
                />
                <Button
                  label="Record loss"
                  loading={createLoss.isPending}
                  onPress={() => void submitLoss()}
                />
              </View>
            )}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ProductChoice({
  product,
  selected,
  onPress,
}: {
  product: EggCollectionProduct;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.productChoice,
        {
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? `${theme.primary}0A` : theme.background,
        },
      ]}
    >
      <View style={styles.productCopy}>
        <AppText weight="semibold" numberOfLines={2}>
          {product.name}
        </AppText>
        <AppText size="small" tone="secondary" numberOfLines={2}>
          {product.units.length
            ? `Units: ${product.units.map((unit) => unit.abbreviation || unit.name).join(", ")}`
            : "No units configured"}
        </AppText>
      </View>
      <Ionicons
        name={selected ? "radio-button-on" : "radio-button-off"}
        size={20}
        color={selected ? theme.primary : theme.textSecondary}
      />
    </Pressable>
  );
}

function SectionHeading({
  step,
  title,
  detail,
}: {
  step: string;
  title: string;
  detail: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.sectionHeading}>
      <View
        style={[styles.step, { backgroundColor: `${theme.primary}18` }]}
      >
        <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
          {step}
        </AppText>
      </View>
      <View style={styles.sectionCopy}>
        <AppText weight="semibold">{title}</AppText>
        <AppText size="small" tone="secondary">
          {detail}
        </AppText>
      </View>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <AppText size="small" tone="secondary">
        {label}
      </AppText>
      <AppText size="small" weight="semibold" style={styles.summaryValue}>
        {value}
      </AppText>
    </View>
  );
}

function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const parsed = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return (
    parsed.getFullYear() === Number(match[1]) &&
    parsed.getMonth() === Number(match[2]) - 1 &&
    parsed.getDate() === Number(match[3])
  );
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function formatQuantity(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function friendlyLossError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("only") && normalized.includes("base units remain")) {
    return "Available stock changed while you were working. Refresh inventory and reduce the loss quantity.";
  }
  if (normalized.includes("not configured for this egg product")) {
    return "That unit is no longer configured for this product. Select a registered unit and try again.";
  }
  if (normalized.includes("not found for this farm")) {
    return "This egg product is no longer available. Refresh the list and choose another product.";
  }
  return message;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 28,
    gap: 14,
  },
  section: { gap: 14 },
  sectionHeading: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  step: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    flexShrink: 0,
  },
  sectionCopy: { flex: 1, minWidth: 0, gap: 2 },
  productList: { gap: 8 },
  productChoice: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 9,
  },
  productCopy: { flex: 1, minWidth: 0, gap: 3 },
  inventoryNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 11,
    borderWidth: 1,
    borderRadius: 9,
  },
  noticeText: { flex: 1 },
  stockCard: { gap: 8 },
  stockHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  stockCopy: { flex: 1, minWidth: 0, gap: 2 },
  stockIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  unitList: { gap: 7 },
  lossItem: { gap: 10, paddingBottom: 12 },
  lossItemHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  unitChoice: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  unitChoiceCopy: { flex: 1, minWidth: 0, gap: 2 },
  conversion: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    padding: 10,
    borderRadius: 8,
  },
  reasonList: { gap: 7 },
  reasonChoice: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  reasonCopy: { flex: 1, minWidth: 0, gap: 2 },
  notesInput: { minHeight: 82 },
  empty: { alignItems: "flex-start", gap: 9 },
  error: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 8,
  },
  reviewCard: { gap: 14 },
  reviewHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  reviewIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  reviewCopy: { flex: 1, minWidth: 0, gap: 2 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryValue: { flex: 1, minWidth: 0, textAlign: "right" },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomCopy: { flex: 1, minWidth: 0, gap: 2 },
  reviewActions: { flexDirection: "row", alignItems: "center", gap: 8 },
});
