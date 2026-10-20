import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";

import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { productTypeOptions } from "@/features/management/product-options";
import type {
  CreateProductPayload,
  Product,
  ProductType,
} from "@/features/management/api";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";
import { useUnits } from "@/features/management/hooks";

type ProductUnitDraft = {
  key: string;
  unitId: string;
  conversionFactor: string;
  isBaseUnit: boolean;
};

type ProductFormProps = {
  initialProduct?: Product;
  initialProductType?: ProductType;
  allowedProductTypes?: ProductType[];
  initialName?: string;
  submitLabel: string;
  isSubmitting?: boolean;
  onSubmit: (payload: CreateProductPayload) => Promise<void>;
};

const productTypeIcons: Record<ProductType, keyof typeof Ionicons.glyphMap> = {
  chickens: "paw-outline",
  eggs: "egg-outline",
  feed: "leaf-outline",
  medication: "medkit-outline",
  equipment: "construct-outline",
  other: "cube-outline",
};

export function ProductForm({
  initialProduct,
  initialProductType,
  allowedProductTypes,
  initialName,
  submitLabel,
  isSubmitting = false,
  onSubmit,
}: ProductFormProps) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const unitQuery = useUnits(user?.id);
  const nextKey = useRef(initialProduct?.product_units.length ?? 1);
  const [name, setName] = useState(initialProduct?.name ?? initialName ?? "");
  const [description, setDescription] = useState(
    initialProduct?.description ?? "",
  );
  const [productType, setProductType] = useState<ProductType>(
    initialProduct?.product_type ?? initialProductType ?? "other",
  );
  const [isActive, setIsActive] = useState(initialProduct?.is_active ?? true);
  const [isSellable, setIsSellable] = useState(
    initialProduct?.is_sellable ?? false,
  );
  const [savedUnitRows, setUnitRows] = useState<ProductUnitDraft[]>(() =>
    (initialProduct?.product_units ?? []).map((unit, index) => ({
      key: `existing-${index}`,
      unitId: unit.unit_id,
      conversionFactor: String(unit.conversion_factor),
      isBaseUnit: unit.is_base_unit,
    })),
  );
  const [openUnitRow, setOpenUnitRow] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const defaultUnitRows: ProductUnitDraft[] =
    !initialProduct && unitQuery.data?.length
      ? [
          {
            key: "unit-0",
            unitId: unitQuery.data[0].id,
            conversionFactor: "1",
            isBaseUnit: true,
          },
        ]
      : [];
  const unitRows = savedUnitRows.length ? savedUnitRows : defaultUnitRows;

  const baseUnit = unitRows.find((row) => row.isBaseUnit);
  const baseUnitDefinition = unitQuery.data?.find(
    (unit) => unit.id === baseUnit?.unitId,
  );
  const exampleUnitRow = unitRows.find((row) => !row.isBaseUnit && row.unitId);
  const exampleUnit = unitQuery.data?.find(
    (unit) => unit.id === exampleUnitRow?.unitId,
  );
  const baseUnitName = baseUnitDefinition?.name ?? "main counting unit";

  function updateUnitRow(key: string, update: Partial<ProductUnitDraft>) {
    setUnitRows((rows) =>
      (rows.length ? rows : defaultUnitRows).map((row) =>
        row.key === key ? { ...row, ...update } : row,
      ),
    );
  }

  async function chooseBaseUnit(key: string) {
    if (unitRows.find((row) => row.key === key)?.isBaseUnit) return;
    const confirmed = await dialog.confirmDialog({
      title: "Change the main counting unit?",
      message:
        "This changes what the amounts below are measured in. We’ll clear them so you can enter the amounts again using the new unit.",
      confirmLabel: "Change unit",
    });
    if (!confirmed) return;

    setUnitRows((rows) =>
      (rows.length ? rows : defaultUnitRows).map((row) => ({
        ...row,
        isBaseUnit: row.key === key,
        conversionFactor: row.key === key ? "1" : "",
      })),
    );
    setError(null);
  }

  function addUnitRow() {
    setUnitRows((rows) => [
      ...(rows.length ? rows : defaultUnitRows),
      {
        key: `unit-${nextKey.current++}`,
        unitId: "",
        conversionFactor: "",
        isBaseUnit: false,
      },
    ]);
    setError(null);
  }

  async function submit() {
    if (!name.trim()) {
      setError("Enter a product name.");
      return;
    }
    if (unitQuery.isLoading) {
      setError("Wait for measurement units to finish loading.");
      return;
    }
    if (!unitRows.length || unitRows.some((row) => !row.unitId)) {
      setError("Choose a measurement unit for every row.");
      return;
    }
    if (new Set(unitRows.map((row) => row.unitId)).size !== unitRows.length) {
      setError("Each measurement unit can only be added once.");
      return;
    }
    if (unitRows.filter((row) => row.isBaseUnit).length !== 1) {
      setError("Select exactly one main counting unit.");
      return;
    }
    const invalidFactor = unitRows.some((row) => {
      if (row.isBaseUnit) return false;
      return (
        !/^\d{1,9}(?:\.\d{1,3})?$/.test(row.conversionFactor) ||
        Number(row.conversionFactor) <= 0
      );
    });
    if (invalidFactor) {
      setError(
        "Enter a positive amount with up to 3 decimal places for every other unit.",
      );
      return;
    }

    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        product_type: productType,
        is_active: isActive,
        is_sellable: isSellable,
        product_units: unitRows.map((row) => ({
          unit_id: row.unitId,
          conversion_factor: row.isBaseUnit ? 1 : Number(row.conversionFactor),
          is_base_unit: row.isBaseUnit,
        })),
      });
    } catch (submitError) {
      await dialog.showDialog({
        title: initialProduct
          ? "Couldn’t update product"
          : "Couldn’t create product",
        message: normalizeApiError(submitError).message,
        tone: "error",
      });
    }
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.form}>
        <View style={styles.formIntro}>
          <View
            style={[
              styles.formIcon,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Ionicons
              name={productTypeIcons[productType]}
              size={22}
              color={theme.primary}
            />
          </View>
          <View style={styles.formIntroCopy}>
            <AppText size="heading" weight="semibold">
              {initialProduct ? "Edit product" : "Set up a product"}
            </AppText>
            <AppText size="small" tone="secondary">
              Add the details and stock units you use to track this item.
            </AppText>
          </View>
        </View>
        <Card style={styles.sectionCard}>
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionCopy}>
              <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                PRODUCT DETAILS
              </AppText>
              <AppText size="small" tone="secondary">
                Name, category and how you use it.
              </AppText>
            </View>
            <Ionicons name="create-outline" size={19} color={theme.primary} />
          </View>
          <TextField
            label="Product name"
            placeholder="e.g. Layer mash"
            value={name}
            onChangeText={setName}
            maxLength={150}
          />
          <TextField
            label="Description (optional)"
            placeholder="What is this product used for?"
            value={description}
            onChangeText={setDescription}
            multiline
            style={styles.multiline}
          />
          <View style={styles.fieldGroup}>
            <AppText size="small" weight="semibold">
              Product type
            </AppText>
            <View style={styles.options}>
              {productTypeOptions
                .filter(
                  (option) =>
                    !allowedProductTypes ||
                    allowedProductTypes.includes(option.value),
                )
                .map((option) => {
                const selected = productType === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setProductType(option.value)}
                    style={[
                      styles.option,
                      {
                        backgroundColor: selected
                          ? theme.primary
                          : theme.backgroundElement,
                        borderColor: selected ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={productTypeIcons[option.value]}
                      size={17}
                      color={selected ? theme.onPrimary : theme.textSecondary}
                    />
                    <AppText
                      size="small"
                      weight={selected ? "semibold" : "regular"}
                      style={{ color: selected ? theme.onPrimary : theme.text }}
                    >{option.label}</AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.activeRow}>
            <View style={styles.activeCopy}>
              <AppText weight="semibold">Product active</AppText>
              <AppText size="small" tone="secondary">
                Keep history; hide from new activity.
              </AppText>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={theme.backgroundElement}
              accessibilityLabel="Product is active"
            />
          </View>
          <View style={styles.activeRow}>
            <View style={styles.activeCopy}>
              <AppText weight="semibold">Available for sale</AppText>
              <AppText size="small" tone="secondary">
                Turn on for items you sell. Farm purchases remain available.
              </AppText>
            </View>
            <Switch
              value={isSellable}
              onValueChange={setIsSellable}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={theme.backgroundElement}
              accessibilityLabel="Product available for sale"
            />
          </View>
        </View>
        </Card>

        <Card style={styles.sectionCard}>
        <View style={[styles.section, styles.measurements]}>
          <View style={styles.sectionHeading}>
            <View
              style={[
                styles.stepNumber,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                02
              </AppText>
            </View>
            <View style={styles.sectionCopy}>
              <AppText size="heading" weight="semibold">
                Stock units
              </AppText>
              <AppText size="small" tone="secondary">
                Choose your main counting unit, then add pack conversions if
                you need them.
              </AppText>
            </View>
          </View>

          {unitQuery.isLoading ? (
            <AppText size="small" tone="secondary">
              Loading measurement units…
            </AppText>
          ) : null}
          {unitQuery.isError ? (
            <View style={styles.fieldGroup}>
              <AppText size="small" style={{ color: theme.danger }}>
                {normalizeApiError(unitQuery.error).message}
              </AppText>
              <Button
                label="Retry units"
                variant="secondary"
                onPress={() => void unitQuery.refetch()}
              />
            </View>
          ) : null}
          {!unitQuery.isLoading &&
          !unitQuery.isError &&
          !unitQuery.data?.length ? (
            <View style={styles.fieldGroup}>
              <AppText size="small" tone="secondary">
                Create a measurement unit before setting up this product.
              </AppText>
              <Button
                label="Manage measurement units"
                variant="secondary"
                onPress={() => router.push("/units")}
              />
            </View>
          ) : null}

          {unitRows.map((row, index) => {
            const selectedUnit = unitQuery.data?.find(
              (unit) => unit.id === row.unitId,
            );
            const conversionIndex =
              unitRows
                .filter((item) => !item.isBaseUnit)
                .findIndex((item) => item.key === row.key) + 1;
            const takenUnitIds = new Set(
              unitRows
                .filter((other) => other.key !== row.key)
                .map((other) => other.unitId),
            );
            const availableUnits = (unitQuery.data ?? []).filter(
              (unit) => !takenUnitIds.has(unit.id),
            );

            return (
              <View
                key={row.key}
                style={[styles.unitRow, { borderTopColor: theme.border }]}
              >
                <View style={styles.unitRowHeading}>
                  <AppText weight="semibold">
                    {row.isBaseUnit
                      ? "Main counting unit"
                      : `Additional unit ${conversionIndex}`}
                  </AppText>
                  {unitRows.length > 1 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${selectedUnit?.name ?? "measurement"}`}
                      hitSlop={8}
                      onPress={() => {
                        setUnitRows((rows) =>
                          (rows.length ? rows : defaultUnitRows).filter(
                            (item) => item.key !== row.key,
                          ),
                        );
                        setOpenUnitRow(null);
                      }}
                      style={styles.removeButton}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={17}
                        color={theme.danger}
                      />
                    </Pressable>
                  ) : null}
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Choose measurement unit for row ${index + 1}`}
                  accessibilityState={{ expanded: openUnitRow === row.key }}
                  onPress={() =>
                    setOpenUnitRow((open) =>
                      open === row.key ? null : row.key,
                    )
                  }
                  style={[
                    styles.unitSelector,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.backgroundElement,
                    },
                  ]}
                >
                  <AppText
                    style={[
                      styles.selectorText,
                      !selectedUnit && { color: theme.textSecondary },
                    ]}
                  >
                    {selectedUnit
                      ? `${selectedUnit.name} (${selectedUnit.abbreviation})`
                      : "Choose a measurement unit"}
                  </AppText>
                  <Ionicons
                    name={
                      openUnitRow === row.key ? "chevron-up" : "chevron-down"
                    }
                    size={18}
                    color={theme.textSecondary}
                  />
                </Pressable>
                {openUnitRow === row.key ? (
                  <View
                    style={[styles.unitOptions, { borderColor: theme.border }]}
                  >
                    {availableUnits.map((unit) => (
                      <Pressable
                        key={unit.id}
                        accessibilityRole="button"
                        onPress={() => {
                          updateUnitRow(row.key, { unitId: unit.id });
                          setOpenUnitRow(null);
                          setError(null);
                        }}
                        style={styles.unitOption}
                      >
                        <AppText>
                          {unit.name} ({unit.abbreviation})
                        </AppText>
                        {unit.id === row.unitId ? (
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color={theme.primary}
                          />
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {row.isBaseUnit ? (
                  <View
                    style={[
                      styles.baseFactor,
                      {
                        backgroundColor: theme.backgroundSelected,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <AppText size="small" tone="secondary">
                      Stock is counted in this unit
                    </AppText>
                    <AppText weight="semibold">
                      1 {selectedUnit?.abbreviation ?? "unit"}
                    </AppText>
                  </View>
                ) : (
                  <TextField
                    label={`Amount of ${baseUnitName} in one ${selectedUnit?.name ?? "unit"}`}
                    placeholder="e.g. 30"
                    keyboardType="decimal-pad"
                    value={row.conversionFactor}
                    onChangeText={(value) =>
                      updateUnitRow(row.key, { conversionFactor: value })
                    }
                  />
                )}

                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: row.isBaseUnit }}
                  onPress={() => void chooseBaseUnit(row.key)}
                  style={styles.baseChoice}
                >
                  <Ionicons
                    name={
                      row.isBaseUnit ? "radio-button-on" : "radio-button-off"
                    }
                    size={19}
                    color={row.isBaseUnit ? theme.primary : theme.textSecondary}
                  />
                  <AppText size="small">
                    {row.isBaseUnit
                      ? "Stock is counted in this unit"
                      : "Use as the main counting unit"}
                  </AppText>
                </Pressable>
              </View>
            );
          })}

          {unitQuery.data?.length ? (
            <View style={styles.fieldGroup}>
              <Button
                label="Add measurement unit"
                variant="secondary"
                disabled={unitRows.length >= unitQuery.data.length}
                onPress={addUnitRow}
              />
              <AppText size="small" tone="secondary">
                {baseUnit
                  ? `For each other unit, enter how many ${baseUnitName} are in one. Example: if one ${exampleUnit?.name ?? "pack"} holds 30 ${baseUnitName}, enter 30.`
                  : "Choose the main counting unit before entering amounts."}
              </AppText>
            </View>
          ) : null}
        </View>

        {error ? (
          <AppText size="small" style={{ color: theme.danger }}>
            {error}
          </AppText>
        ) : null}
        </Card>
        <View style={styles.formFooter}>
          <Button
            label={submitLabel}
            loading={unitQuery.isLoading || isSubmitting}
            disabled={
              unitQuery.isLoading || !unitQuery.data?.length || !name.trim()
            }
            onPress={() => void submit()}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 32,
  },
  form: { gap: 24 },
  formIntro: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  formIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  formIntroCopy: { flex: 1, gap: 3 },
  sectionCard: { gap: 18, padding: 16 },
  section: { gap: 16 },
  fieldGroup: { gap: 9 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  option: {
    minHeight: 46,
    flexBasis: "47%",
    flexGrow: 1,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  activeRow: {
    minHeight: 52,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  activeCopy: { flex: 1, gap: 3 },
  measurements: { gap: 14 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  sectionCopy: { flex: 1, gap: 3 },
  stepNumber: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  formFooter: { paddingTop: 2 },
  unitRow: { gap: 11, borderTopWidth: 1, paddingTop: 14 },
  unitRowHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  removeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  unitSelector: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 13,
  },
  selectorText: { flex: 1 },
  unitOptions: { borderWidth: 1, borderRadius: 6, overflow: "hidden" },
  unitOption: {
    minHeight: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 13,
  },
  baseFactor: {
    minHeight: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 13,
  },
  baseChoice: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
