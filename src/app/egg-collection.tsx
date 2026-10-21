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
  EggCollectionBlock,
  EggCollectionProduct,
} from "@/features/eggs/api";
import { useCreateEggCollection, useEggCollectionOptions } from "@/features/eggs/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type CollectionLine = {
  key: string;
  unitId: string;
  quantity: string;
};

type SelectedBlock = {
  block: EggCollectionBlock;
  lines: CollectionLine[];
};

type CollectionEntryError = {
  message: string;
  blockId?: string;
};

export default function EggCollectionScreen() {
  return (
    <SessionGate>
      <EggCollectionContent />
    </SessionGate>
  );
}

function EggCollectionContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const farmId = farm.selectedFarm?.id;
  const options = useEggCollectionOptions(user?.id, farmId);
  const createCollection = useCreateEggCollection(user?.id ?? "", farmId ?? "");
  const [stage, setStage] = useState<"select" | "review">("select");
  const [productId, setProductId] = useState("");
  const [selectedBlocks, setSelectedBlocks] = useState<SelectedBlock[]>([]);
  const [blockSearch, setBlockSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [collectionDate, setCollectionDate] = useState(localToday());
  const [collectionTime, setCollectionTime] = useState(localTime());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<CollectionEntryError | null>(null);

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
  const blocks = useMemo(() => {
    const query = blockSearch.trim().toLowerCase();
    return (
      options.data?.blocks.filter(
        (block) => !query || block.name.toLowerCase().includes(query),
      ) ?? []
    );
  }, [options.data, blockSearch]);
  const baseUnit = product?.units.find((unit) => unit.is_base_unit);
  const allEntries = selectedBlocks.flatMap((selected) =>
    selected.lines
      .filter((line) => Number(line.quantity) > 0)
      .map((line) => ({
        block: selected.block,
        line,
        unit: product?.units.find((unit) => unit.id === line.unitId),
      }))
      .filter(
        (
          entry,
        ): entry is {
          block: EggCollectionBlock;
          line: CollectionLine;
          unit: NonNullable<typeof entry.unit>;
        } => Boolean(entry.unit),
      ),
  );
  const baseQuantity = allEntries.reduce(
    (total, entry) =>
      total +
      Number(entry.line.quantity) *
        Number(entry.unit.conversion_factor),
    0,
  );
  const hasAnyQuantity = allEntries.length > 0;

  function toggleBlock(block: EggCollectionBlock) {
    if (!product?.units.length) {
      setError({
        message: "This egg product has no registered units. Edit its units first.",
      });
      return;
    }
    const isSelected = selectedBlocks.some(
      (selected) => selected.block.id === block.id,
    );
    if (isSelected) {
      setSelectedBlocks((current) =>
        current.filter((selected) => selected.block.id !== block.id),
      );
    } else {
      const defaultUnit =
        product.units.find((unit) => unit.is_base_unit) ?? product.units[0];
      setSelectedBlocks((current) => [
        ...current,
        {
          block,
          lines: [
            {
              key: createLineKey(),
              unitId: defaultUnit.id,
              quantity: "",
            },
          ],
        },
      ]);
    }
    setError(null);
  }

  function changeProduct(nextProductId: string) {
    setProductId(nextProductId);
    setSelectedBlocks([]);
    setError(null);
  }

  function updateLine(
    blockId: string,
    lineKey: string,
    update: Partial<CollectionLine>,
  ) {
    setSelectedBlocks((current) =>
      current.map((selected) =>
        selected.block.id === blockId
          ? {
              ...selected,
              lines: selected.lines.map((line) =>
                line.key === lineKey ? { ...line, ...update } : line,
              ),
            }
          : selected,
      ),
    );
    setError(null);
  }

  function addUnitLine(blockId: string) {
    if (!product) return;
    setSelectedBlocks((current) =>
      current.map((selected) => {
        if (selected.block.id !== blockId) return selected;
        const usedUnits = new Set(selected.lines.map((line) => line.unitId));
        const nextUnit = product.units.find((unit) => !usedUnits.has(unit.id));
        if (!nextUnit) return selected;
        return {
          ...selected,
          lines: [
            ...selected.lines,
            { key: createLineKey(), unitId: nextUnit.id, quantity: "" },
          ],
        };
      }),
    );
  }

  function removeUnitLine(blockId: string, lineKey: string) {
    setSelectedBlocks((current) =>
      current.map((selected) =>
        selected.block.id === blockId
          ? {
              ...selected,
              lines: selected.lines.filter((line) => line.key !== lineKey),
            }
          : selected,
      ),
    );
  }

  function validateAndReview() {
    if (!product) {
      setError({ message: "Choose the egg product being collected." });
      return;
    }
    if (!product.units.length) {
      setError({
        message: "This egg product has no registered units. Edit its units first.",
      });
      return;
    }
    if (!selectedBlocks.length) {
      setError({ message: "Select at least one block to collect eggs from." });
      return;
    }
    for (const selected of selectedBlocks) {
      if (!selected.lines.length) {
        setError({
          message: `Add at least one quantity for ${selected.block.name}.`,
          blockId: selected.block.id,
        });
        return;
      }
      for (const line of selected.lines) {
        const quantity = Number(line.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          setError({
            message: `Enter a quantity greater than zero for ${selected.block.name}.`,
            blockId: selected.block.id,
          });
          return;
        }
        if (!/^\d+(\.\d{1,3})?$/.test(line.quantity)) {
          setError({
            message: "Use up to three decimal places for the quantity.",
            blockId: selected.block.id,
          });
          return;
        }
        if (line.quantity.split(".")[0].length > 9) {
          setError({
            message:
              "Quantity is too large. Enter no more than 9 whole-number digits.",
            blockId: selected.block.id,
          });
          return;
        }
        if (!product.units.some((unit) => unit.id === line.unitId)) {
          setError({
            message: `Choose a registered unit for ${selected.block.name}.`,
            blockId: selected.block.id,
          });
          return;
        }
      }
    }
    if (!isValidDate(collectionDate)) {
      setError({ message: "Choose a valid collection date." });
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(collectionTime)) {
      setError({ message: "Enter a valid collection time in HH:MM format." });
      return;
    }
    const now = new Date();
    const selectedDateTime = new Date(
      `${collectionDate}T${collectionTime}:00`,
    );
    if (selectedDateTime.getTime() > now.getTime()) {
      setError({
        message: "Collection time cannot be in the future. Choose an earlier time.",
      });
      return;
    }
    setError(null);
    setStage("review");
  }

  async function submitCollection() {
    if (!product || !farmId) return;
    try {
      const response = await createCollection.mutateAsync({
        collected_at: localDateTimeToIso(collectionDate, collectionTime),
        items: selectedBlocks.flatMap((selected) =>
          selected.lines.map((line) => ({
            product_id: product.id,
            block_id: selected.block.id,
            quantity: line.quantity,
            unit_id: line.unitId,
            notes: notes.trim() || undefined,
          })),
        ),
      });
      if (!response.length) {
        throw new Error("No egg collection entries were saved. Please try again.");
      }
      await dialog.showDialog({
        title: "Egg collection recorded",
        message: `${formatQuantity(baseQuantity)} ${baseUnit?.abbreviation || baseUnit?.name || "base units"} collected from ${selectedBlocks.length} ${selectedBlocks.length === 1 ? "block" : "blocks"}.`,
        tone: "success",
      });
      if (response.length) router.replace("/(tabs)/eggs");
    } catch (submitError: unknown) {
      setStage("select");
      setError({
        message: friendlyCollectionError(
          normalizeApiError(submitError).message,
        ),
      });
    }
  }

  if (options.isLoading) {
    return <LoadingState label="Loading egg collection options" />;
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
            title={stage === "select" ? "Collect eggs" : "Review collection"}
            showBack
            backHref="/(tabs)/eggs"
          />

          {options.isError ? (
            <Card style={styles.section}>
              <AppText weight="semibold">Could not load collection options</AppText>
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
          (!options.data?.products.length || !options.data.blocks.length) ? (
            <Card style={styles.empty}>
              <Ionicons
                name="egg-outline"
                size={26}
                color={theme.textSecondary}
              />
              <AppText weight="semibold">
                {!options.data?.products.length
                  ? "Set up an egg product first"
                  : "Add an active block first"}
              </AppText>
              <AppText size="small" tone="secondary">
                {!options.data?.products.length
                  ? "Create an active product with type Eggs and register its units, such as trays or pieces."
                  : "Egg collection needs at least one active block as its source."}
              </AppText>
            </Card>
          ) : null}

          {options.data &&
          options.data.products.length > 0 &&
          options.data.blocks.length > 0 &&
          stage === "select" ? (
            <>
              <AppText size="small" tone="secondary">
                Choose the egg product and blocks, then record each block’s
                quantity in any unit configured for that product. You can mix
                units, for example trays and loose pieces.
              </AppText>

              <Card style={styles.section}>
                <SectionHeading
                  step="1"
                  title="Choose egg product"
                  detail="Units are taken from the product setup."
                />
                {options.data.products.length > 4 ? (
                  <TextField
                    label="Search egg products or units"
                    placeholder="Product name or unit"
                    value={productSearch}
                    onChangeText={setProductSearch}
                  />
                ) : null}
                <View style={styles.choiceList}>
                  {products.map((item) => (
                    <ProductChoice
                      key={item.id}
                      product={item}
                      selected={productId === item.id}
                      onPress={() => changeProduct(item.id)}
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
                <Card style={styles.section}>
                  <SectionHeading
                    step="2"
                    title="Select source blocks"
                    detail="Select every block included in this collection."
                  />
                  {options.data.blocks.length > 5 ? (
                    <TextField
                      label="Search blocks"
                      placeholder="Find a block by name"
                      value={blockSearch}
                      onChangeText={setBlockSearch}
                    />
                  ) : null}
                  <View style={styles.choiceList}>
                    {blocks.map((block) => {
                      const selected = selectedBlocks.some(
                        (entry) => entry.block.id === block.id,
                      );
                      return (
                        <Pressable
                          key={block.id}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          onPress={() => toggleBlock(block)}
                          style={[
                            styles.blockChoice,
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
                          <View
                            style={[
                              styles.check,
                              {
                                backgroundColor: selected
                                  ? theme.primary
                                  : "transparent",
                                borderColor: selected
                                  ? theme.primary
                                  : theme.border,
                              },
                            ]}
                          >
                            {selected ? (
                              <Ionicons
                                name="checkmark"
                                size={14}
                                color={theme.onPrimary}
                              />
                            ) : null}
                          </View>
                          <AppText
                            weight={selected ? "semibold" : "regular"}
                            style={styles.blockName}
                          >
                            {block.name}
                          </AppText>
                          {selected ? (
                            <AppText size="small" tone="secondary">
                              Selected
                            </AppText>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                  {error?.message &&
                  !error.blockId &&
                  !productId ? (
                    <InlineError message={error.message} />
                  ) : null}
                  {blockSearch.trim() && blocks.length === 0 ? (
                    <AppText size="small" tone="secondary">
                      No blocks match that search.
                    </AppText>
                  ) : null}
                </Card>
              ) : null}

              {product && selectedBlocks.length ? (
                <Card style={styles.section}>
                  <SectionHeading
                    step="3"
                    title="Record collection by block"
                    detail="Add another unit in a block to record mixed trays, pieces, or other registered units."
                  />
                  {selectedBlocks.map((selected) => (
                    <BlockCollectionEditor
                      key={selected.block.id}
                      selected={selected}
                      product={product}
                      onUpdate={updateLine}
                      onAddLine={addUnitLine}
                      onRemoveLine={removeUnitLine}
                      error={
                        error?.blockId === selected.block.id
                          ? error.message
                          : undefined
                      }
                      onRemoveBlock={() =>
                        toggleBlock(selected.block)
                      }
                    />
                  ))}
                </Card>
              ) : null}

              {selectedBlocks.length ? (
                <Card style={styles.section}>
                  <SectionHeading
                    step="4"
                    title="When was it collected?"
                    detail="The selected local date and time are stored with the collection."
                  />
                  <DatePickerField
                    label="Collection date"
                    value={collectionDate}
                    maximumDate={new Date()}
                    onChange={(value) => {
                      setCollectionDate(value);
                      setError(null);
                    }}
                  />
                  <TextField
                    label="Collection time"
                    value={collectionTime}
                    onChangeText={(value) => {
                      setCollectionTime(value);
                      setError(null);
                    }}
                    placeholder="HH:MM"
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                  <TextField
                    label="Notes (optional)"
                    placeholder="For example, morning collection"
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    textAlignVertical="top"
                    style={styles.notesInput}
                  />
                </Card>
              ) : null}
            </>
          ) : null}

          {stage === "review" && product ? (
            <>
              <Card style={styles.reviewCard}>
                <View style={styles.reviewHeading}>
                  <View
                    style={[
                      styles.reviewIcon,
                      { backgroundColor: `${theme.primary}18` },
                    ]}
                  >
                    <Ionicons
                      name="egg-outline"
                      size={20}
                      color={theme.primary}
                    />
                  </View>
                  <View style={styles.headingCopy}>
                    <AppText weight="semibold">{product.name}</AppText>
                    <AppText size="small" tone="secondary">
                      {formatDate(collectionDate)} · {collectionTime}
                    </AppText>
                  </View>
                </View>
                <AppText size="small" tone="secondary">
                  Collection by source block
                </AppText>
                {selectedBlocks.map((selected) => (
                  <View
                    key={selected.block.id}
                    style={[
                      styles.reviewBlock,
                      { borderColor: theme.border },
                    ]}
                  >
                    <AppText weight="semibold">{selected.block.name}</AppText>
                    {selected.lines.map((line) => {
                      const unit = product.units.find(
                        (candidate) => candidate.id === line.unitId,
                      );
                      return (
                        <View key={line.key} style={styles.reviewLine}>
                          <AppText>
                            {line.quantity} {unit?.abbreviation || unit?.name}
                          </AppText>
                          <AppText size="small" tone="secondary">
                            {formatQuantity(
                              Number(line.quantity) *
                                Number(unit?.conversion_factor ?? 0),
                            )}{" "}
                            {baseUnit?.abbreviation || baseUnit?.name}
                          </AppText>
                        </View>
                      );
                    })}
                  </View>
                ))}
                <View
                  style={[
                    styles.totalRow,
                    { borderTopColor: theme.border },
                  ]}
                >
                  <AppText weight="semibold">
                    Combined total ({baseUnit?.name || "base unit"})
                  </AppText>
                  <AppText size="heading" weight="semibold">
                    {formatQuantity(baseQuantity)}{" "}
                    {baseUnit?.abbreviation || baseUnit?.name}
                  </AppText>
                </View>
                {notes.trim() ? (
                  <AppText size="small" tone="secondary">
                    Notes: {notes.trim()}
                  </AppText>
                ) : null}
              </Card>
              {error ? <InlineError message={error.message} /> : null}
            </>
          ) : null}

          {stage === "select" && error && !error.blockId ? (
            <InlineError message={error.message} />
          ) : null}
        </ScrollView>

        {options.data?.products.length && options.data.blocks.length ? (
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
              <AppText size="small" weight="semibold">
                {stage === "review"
                  ? `${formatQuantity(baseQuantity)} ${baseUnit?.abbreviation || baseUnit?.name || "eggs"}`
                  : hasAnyQuantity
                    ? `${formatQuantity(baseQuantity)} ${baseUnit?.abbreviation || baseUnit?.name || "eggs"} · ${selectedBlocks.length} ${selectedBlocks.length === 1 ? "block" : "blocks"}`
                    : "Choose blocks and enter quantities"}
              </AppText>
              <AppText size="small" tone="secondary" numberOfLines={1}>
                {product?.name ?? "No product selected"}
              </AppText>
            </View>
            {stage === "select" ? (
              <Button
                label="Review collection"
                disabled={!product || !selectedBlocks.length}
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
                  label="Record collection"
                  loading={createCollection.isPending}
                  onPress={() => void submitCollection()}
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
  const baseUnit = product.units.find((unit) => unit.is_base_unit);
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
        {baseUnit ? (
          <AppText size="small" tone="secondary">
            Base unit: {baseUnit.name}
          </AppText>
        ) : null}
      </View>
      <Ionicons
        name={selected ? "radio-button-on" : "radio-button-off"}
        size={20}
        color={selected ? theme.primary : theme.textSecondary}
      />
    </Pressable>
  );
}

function BlockCollectionEditor({
  selected,
  product,
  onUpdate,
  onAddLine,
  onRemoveLine,
  onRemoveBlock,
  error,
}: {
  selected: SelectedBlock;
  product: EggCollectionProduct;
  onUpdate: (
    blockId: string,
    lineKey: string,
    update: Partial<CollectionLine>,
  ) => void;
  onAddLine: (blockId: string) => void;
  onRemoveLine: (blockId: string, lineKey: string) => void;
  onRemoveBlock: () => void;
  error?: string;
}) {
  const { theme } = useTheme();
  const usedUnitIds = new Set(selected.lines.map((line) => line.unitId));
  const canAddUnit = product.units.some(
    (unit) => !usedUnitIds.has(unit.id),
  );
  return (
    <View
      style={[
        styles.blockEditor,
        { backgroundColor: theme.background, borderColor: theme.border },
      ]}
    >
      <View style={styles.blockEditorHeading}>
        <View style={styles.blockEditorCopy}>
          <AppText weight="semibold">{selected.block.name}</AppText>
          <AppText size="small" tone="secondary">
            Collection quantities from this block
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${selected.block.name}`}
          onPress={onRemoveBlock}
          hitSlop={8}
        >
          <Ionicons
            name="close-circle-outline"
            size={22}
            color={theme.textSecondary}
          />
        </Pressable>
      </View>
      {selected.lines.map((line, index) => {
        const selectedUnit = product.units.find(
          (unit) => unit.id === line.unitId,
        );
        const otherUsedUnitIds = new Set(
          selected.lines
            .filter((other) => other.key !== line.key)
            .map((other) => other.unitId),
        );
        return (
          <View key={line.key} style={styles.unitEntry}>
            <View style={styles.unitEntryHeading}>
              <AppText size="small" weight="semibold">
                Quantity {selected.lines.length > 1 ? index + 1 : ""}
              </AppText>
              {selected.lines.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove quantity row ${index + 1} for ${selected.block.name}`}
                  onPress={() => onRemoveLine(selected.block.id, line.key)}
                  hitSlop={8}
                >
                  <AppText size="small" style={{ color: theme.danger }}>
                    Remove
                  </AppText>
                </Pressable>
              ) : null}
            </View>
            <TextField
              label={`Amount in ${selectedUnit?.name || "selected unit"}`}
              placeholder="0"
              value={line.quantity}
              onChangeText={(value) => {
                const sanitized = value.replace(",", ".").replace(/[^\d.]/g, "");
                const [integer, ...fraction] = sanitized.split(".");
                const normalizedInteger =
                  integer || (fraction.length ? "0" : "");
                const normalized = fraction.length
                  ? `${normalizedInteger}.${fraction.join("").slice(0, 3)}`
                  : normalizedInteger;
                onUpdate(selected.block.id, line.key, {
                  quantity: normalized,
                });
              }}
              keyboardType="decimal-pad"
              maxLength={13}
            />
            <AppText size="small" tone="secondary">
              Collection unit
            </AppText>
            <View style={styles.unitChoices}>
              {product.units.map((unit) => {
                const chosen = line.unitId === unit.id;
                const unavailable =
                  !chosen && otherUsedUnitIds.has(unit.id);
                return (
                  <Pressable
                    key={unit.id}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: chosen,
                      disabled: unavailable,
                    }}
                    disabled={unavailable}
                    onPress={() =>
                      onUpdate(selected.block.id, line.key, {
                        unitId: unit.id,
                      })
                    }
                    style={[
                      styles.unitChoice,
                      {
                        borderColor: chosen ? theme.primary : theme.border,
                        backgroundColor: chosen
                          ? `${theme.primary}12`
                          : theme.backgroundElement,
                        opacity: unavailable ? 0.45 : 1,
                      },
                    ]}
                  >
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{ color: chosen ? theme.primary : theme.text }}
                    >
                      {unit.abbreviation || unit.name}
                    </AppText>
                    <AppText size="small" tone="secondary" numberOfLines={1}>
                      {unit.is_base_unit
                        ? "base"
                        : `1 = ${formatQuantity(Number(unit.conversion_factor))} ${product.units.find((candidate) => candidate.is_base_unit)?.abbreviation || "base"}`}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
      {canAddUnit ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onAddLine(selected.block.id)}
          style={[styles.addUnitButton, { borderColor: theme.border }]}
        >
          <Ionicons name="add" size={17} color={theme.primary} />
          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
            Add another unit
          </AppText>
        </Pressable>
      ) : null}
      {error ? <InlineError message={error} /> : null}
    </View>
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
        style={[
          styles.step,
          { backgroundColor: `${theme.primary}18` },
        ]}
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

function InlineError({ message }: { message: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.error, { backgroundColor: `${theme.danger}10` }]}>
      <Ionicons name="alert-circle-outline" size={17} color={theme.danger} />
      <AppText size="small" style={{ color: theme.danger, flex: 1 }}>
        {message}
      </AppText>
    </View>
  );
}

function createLineKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localTime(): string {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return (
    parsed.getFullYear() === Number(match[1]) &&
    parsed.getMonth() === Number(match[2]) - 1 &&
    parsed.getDate() === Number(match[3])
  );
}

function localDateTimeToIso(date: string, time: string): string {
  const local = new Date(`${date}T${time}:00`);
  return local.toISOString();
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
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 3,
  });
}

function friendlyCollectionError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("inactive block")) {
    return "One of the selected blocks is no longer active. Refresh the options and try again.";
  }
  if (normalized.includes("inactive product")) {
    return "This egg product is no longer active. Choose an active egg product.";
  }
  if (normalized.includes("not configured for egg product")) {
    return "A selected unit is no longer configured for this product. Choose a registered unit and try again.";
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
  choiceList: { gap: 8 },
  productChoice: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 9,
  },
  productCopy: { flex: 1, minWidth: 0, gap: 3 },
  blockChoice: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: 8,
  },
  check: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 5,
  },
  blockName: { flex: 1, minWidth: 0 },
  blockEditor: {
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  blockEditorHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  blockEditorCopy: { flex: 1, minWidth: 0, gap: 2 },
  unitEntry: { gap: 8 },
  unitEntryHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  unitChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  unitChoice: {
    minWidth: 78,
    maxWidth: "48%",
    alignItems: "flex-start",
    gap: 2,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: 8,
  },
  addUnitButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: "dashed",
  },
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
  headingCopy: { flex: 1, minWidth: 0, gap: 2 },
  reviewBlock: { gap: 8, padding: 12, borderWidth: 1, borderRadius: 9 },
  reviewLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  totalRow: { gap: 4, paddingTop: 12, borderTopWidth: 1 },
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
  reviewActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
