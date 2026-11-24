import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
  findNodeHandle,
  type ScrollViewInstance,
  type TextInputInstance,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { productTypeOptions } from "@/features/management/product-options";
import type {
  CreateProductPayload,
  Product,
  ProductType,
} from "@/features/management/api";
import { normalizeApiError, type ApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";
import { useCreateUnit, useUnits } from "@/features/management/hooks";

type ProductUnitDraft = {
  key: string;
  unitId: string;
  conversionFactor: string;
  isBaseUnit: boolean;
};

type ProductTypeIconName =
  | { library: "material"; name: keyof typeof MaterialCommunityIcons.glyphMap }
  | { library: "ion"; name: keyof typeof Ionicons.glyphMap };

const productTypeIcons: Record<ProductType, ProductTypeIconName> = {
  chickens: { library: "material", name: "bird" },
  eggs: { library: "ion", name: "egg-outline" },
  feed: { library: "ion", name: "leaf-outline" },
  medication: { library: "ion", name: "medkit-outline" },
  equipment: { library: "ion", name: "construct-outline" },
  other: { library: "ion", name: "cube-outline" },
};

function ProductTypeIcon({
  type,
  size,
  color,
}: {
  type: ProductType;
  size: number;
  color: string;
}) {
  const icon = productTypeIcons[type];
  return icon.library === "material" ? (
    <MaterialCommunityIcons name={icon.name} size={size} color={color} />
  ) : (
    <Ionicons name={icon.name} size={size} color={color} />
  );
}

type ProductFormProps = {
  initialProduct?: Product;
  initialProductType?: ProductType;
  allowedProductTypes?: ProductType[];
  initialName?: string;
  initialDescription?: string;
  setupMode?: boolean;
  submitLabel: string;
  isSubmitting?: boolean;
  onSubmit: (payload: CreateProductPayload) => Promise<void>;
};

function suggestedUnitConversion(unitName: string, baseUnitName: string): string {
  const countSize = (name: string) => {
    const unit = name.trim().toLowerCase();
    if (/^(piece|pieces|each|pc|pcs|egg|eggs|bird|birds|head|heads|chicken|chickens)$/.test(unit)) {
      return 1;
    }
    if (/^(dozen|doz)$/.test(unit)) return 12;
    if (/^trays?$/.test(unit)) return 30;
    return null;
  };
  const size = countSize(unitName);
  const baseSize = countSize(baseUnitName);
  if (size === null || baseSize === null) return "";
  return String(Number((size / baseSize).toFixed(3)));
}

function pluralUnitName(name: string, quantity: number): string {
  if (quantity === 1 || /s$/i.test(name)) return name;
  return /[^aeiou]y$/i.test(name)
    ? `${name.slice(0, -1)}ies`
    : `${name}s`;
}

function FormAction({
  label,
  icon,
  disabled = false,
  style,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.formAction,
        style,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={17} color={theme.primary} />
      <AppText size="small" weight="semibold">
        {label}
      </AppText>
    </Pressable>
  );
}

export function ProductForm({
  initialProduct,
  initialProductType,
  allowedProductTypes,
  initialName,
  initialDescription,
  setupMode = false,
  submitLabel,
  isSubmitting = false,
  onSubmit,
}: ProductFormProps) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const unitQuery = useUnits(user?.id);
  const createUnit = useCreateUnit(user?.id ?? "");
  const scrollRef = useRef<ScrollViewInstance>(null);
  const nameInputRef = useRef<TextInputInstance>(null);
  const descriptionInputRef = useRef<TextInputInstance>(null);
  const unitNameInputRef = useRef<TextInputInstance>(null);
  const unitAbbreviationInputRef = useRef<TextInputInstance>(null);
  const conversionInputRefs = useRef(new Map<string, TextInputInstance>());
  const nextKey = useRef(initialProduct?.product_units.length ?? 1);
  const [name, setName] = useState(initialProduct?.name ?? initialName ?? "");
  const [description, setDescription] = useState(
    initialProduct?.description ?? initialDescription ?? "",
  );
  const [descriptionVisible, setDescriptionVisible] = useState(
    !setupMode || Boolean(initialProduct?.description),
  );
  const [productType, setProductType] = useState<ProductType>(
    initialProduct?.product_type ?? initialProductType ?? "other",
  );
  const isEggSetup = setupMode && productType === "eggs";
  const [isActive, setIsActive] = useState(initialProduct?.is_active ?? true);
  const [isSellable, setIsSellable] = useState(
    initialProduct?.is_sellable ??
      (setupMode &&
        (initialProductType === "chickens" || initialProductType === "eggs")),
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
  const [unitEditDraft, setUnitEditDraft] = useState<{
    key: string;
    unitId: string;
    conversionFactor: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [setupUnitError, setSetupUnitError] = useState<string | null>(null);
  const [setupUnitRetry, setSetupUnitRetry] = useState(0);
  const [unitDraftOpen, setUnitDraftOpen] = useState(false);
  const [unitNameDraft, setUnitNameDraft] = useState("Dozen");
  const [unitAbbreviationDraft, setUnitAbbreviationDraft] = useState("doz");
  const [unitCreateError, setUnitCreateError] = useState<string | null>(null);
  const setupUnitAttempted = useRef(false);
  const recommendedChickenUnit = unitQuery.data?.find((unit) =>
    /^(birds?|heads?|chickens?)$/i.test(unit.name.trim()) ||
    /^(bird|birds|head|heads|chicken|chickens)$/i.test(unit.abbreviation.trim()),
  );
  const recommendedEggUnit = unitQuery.data?.find((unit) =>
    /^pieces?$/i.test(unit.name.trim()) ||
    /^(pc|pcs|piece|pieces)$/i.test(unit.abbreviation.trim()),
  );
  const recommendedTrayUnit = unitQuery.data?.find(
    (unit) =>
      /^trays?$/i.test(unit.name.trim()) ||
      /^trays?$/i.test(unit.abbreviation.trim()),
  );
  const defaultUnitRows: ProductUnitDraft[] =
    !initialProduct && unitQuery.data?.length
      ? [
          {
            key: "unit-0",
            unitId:
              setupMode && productType === "chickens"
                ? recommendedChickenUnit?.id ?? ""
                : setupMode && productType === "eggs"
                  ? recommendedEggUnit?.id ?? ""
                  : unitQuery.data[0].id,
            conversionFactor: "1",
            isBaseUnit: true,
          },
        ]
      : [];
  const unitRows = savedUnitRows.length ? savedUnitRows : defaultUnitRows;

  useEffect(() => {
    if (
      !setupMode ||
      initialProduct ||
      !["chickens", "eggs"].includes(initialProductType ?? "") ||
      unitQuery.isLoading ||
      unitQuery.isError ||
      !unitQuery.data ||
      setupUnitAttempted.current
    ) {
      return;
    }

    setupUnitAttempted.current = true;
    const preparePoultryUnits = async () => {
      if (initialProductType === "eggs") {
        const pieceUnit =
          recommendedEggUnit ??
          (await createUnit.mutateAsync({
            name: "Piece",
            abbreviation: "pc",
          }));
        const trayUnit =
          recommendedTrayUnit ??
          (await createUnit.mutateAsync({
            name: "Tray",
            abbreviation: "tray",
          }));
        setUnitRows([
          {
            key: "setup-piece-unit",
            unitId: pieceUnit.id,
            conversionFactor: "1",
            isBaseUnit: true,
          },
          {
            key: "setup-tray-unit",
            unitId: trayUnit.id,
            conversionFactor: "30",
            isBaseUnit: false,
          },
        ]);
        return;
      }

      const birdUnit =
        recommendedChickenUnit ??
        (await createUnit.mutateAsync({
          name: "Bird",
          abbreviation: "bird",
        }));
      setUnitRows([
        {
          key: "setup-bird-unit",
          unitId: birdUnit.id,
          conversionFactor: "1",
          isBaseUnit: true,
        },
      ]);
    };

    void preparePoultryUnits()
      .catch((cause: unknown) => {
        setSetupUnitError(
          `Could not prepare the counting units: ${normalizeApiError(cause).message}`,
        );
      });
  }, [
    createUnit,
    initialProduct,
    initialProductType,
    recommendedChickenUnit,
    recommendedEggUnit,
    recommendedTrayUnit,
    setupUnitRetry,
    setupMode,
    unitQuery.data,
    unitQuery.isError,
    unitQuery.isLoading,
  ]);

  function scrollFocusedInput(input: TextInputInstance | null) {
    if (!input) return;
    setTimeout(() => {
      const handle = findNodeHandle(input);
      if (handle != null) {
        scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(
          handle,
          100,
          true,
        );
      }
    }, 80);
  }

  const baseUnit = unitRows.find((row) => row.isBaseUnit);
  const baseUnitDefinition = unitQuery.data?.find(
    (unit) => unit.id === baseUnit?.unitId,
  );
  const baseUnitName = baseUnitDefinition?.name ?? "stock unit";

  function updateUnitRow(key: string, update: Partial<ProductUnitDraft>) {
    clearFormErrors();
    setUnitRows((rows) =>
      (rows.length ? rows : defaultUnitRows).map((row) =>
        row.key === key
          ? {
              ...row,
              ...update,
              ...(update.unitId && !row.isBaseUnit && !row.conversionFactor
                ? {
                    conversionFactor: suggestedUnitConversion(
                      unitQuery.data?.find((unit) => unit.id === update.unitId)
                        ?.name ?? "",
                      baseUnitDefinition?.name ?? "",
                    ),
                  }
                : {}),
            }
          : row,
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
      (rows.length ? rows : defaultUnitRows).map((row) => {
        const unit = unitQuery.data?.find((item) => item.id === row.unitId);
        const nextBaseUnit = unitQuery.data?.find(
          (item) => item.id === unitRows.find((item) => item.key === key)?.unitId,
        );
        return {
          ...row,
          isBaseUnit: row.key === key,
          conversionFactor:
            row.key === key
              ? "1"
              : suggestedUnitConversion(
                  unit?.name ?? "",
                  nextBaseUnit?.name ?? "",
                ),
        };
      }),
    );
    clearFormErrors();
  }

  function addUnitRow() {
    const key = `unit-${nextKey.current++}`;
    setUnitRows((rows) => [
      ...(rows.length ? rows : defaultUnitRows),
      {
        key,
        unitId: "",
        conversionFactor: "",
        isBaseUnit: false,
      },
    ]);
    setOpenUnitRow(key);
    clearFormErrors();
  }

  function openUnitDraft() {
    const eggProduct = productType === "eggs";
    setUnitNameDraft(eggProduct ? "Crate" : "Dozen");
    setUnitAbbreviationDraft(eggProduct ? "crate" : "doz");
    setUnitCreateError(null);
    setUnitDraftOpen(true);
  }

  function openUnitEditor(row: ProductUnitDraft) {
    const unit = unitQuery.data?.find((item) => item.id === row.unitId);
    setUnitEditDraft({
      key: row.key,
      unitId: row.unitId,
      conversionFactor: row.conversionFactor,
    });
    setUnitNameDraft(unit?.name ?? "");
    setUnitAbbreviationDraft(unit?.abbreviation ?? "");
    setUnitCreateError(null);
    setOpenUnitRow(row.key);
  }

  async function saveUnitEditor(row: ProductUnitDraft) {
    const nameValue = unitNameDraft.trim();
    const abbreviationValue = unitAbbreviationDraft.trim();
    const conversionFactor = unitEditDraft?.conversionFactor.trim() ?? "";
    if (!nameValue || !abbreviationValue) {
      setUnitCreateError("Enter both a unit name and a short form.");
      return;
    }
    if (
      !row.isBaseUnit &&
      (!/^\d{1,9}(?:\.\d{1,3})?$/.test(conversionFactor) ||
        Number(conversionFactor) <= 0)
    ) {
      setUnitCreateError("Enter a positive conversion amount.");
      return;
    }

    setUnitCreateError(null);
    try {
      const currentUnit = unitQuery.data?.find((unit) => unit.id === row.unitId);
      const matchingUnit = unitQuery.data?.find(
        (unit) =>
          unit.name.toLocaleLowerCase() === nameValue.toLocaleLowerCase() &&
          unit.abbreviation.toLocaleLowerCase() ===
            abbreviationValue.toLocaleLowerCase(),
      );
      const unit =
        currentUnit?.name.toLocaleLowerCase() === nameValue.toLocaleLowerCase() &&
        currentUnit.abbreviation.toLocaleLowerCase() ===
          abbreviationValue.toLocaleLowerCase()
          ? currentUnit
          : matchingUnit ??
            (await createUnit.mutateAsync({
              name: nameValue,
              abbreviation: abbreviationValue,
            }));
      if (
        unitRows.some(
          (other) => other.key !== row.key && other.unitId === unit.id,
        )
      ) {
        setUnitCreateError("That unit is already used in this product.");
        return;
      }

      setUnitRows((rows) =>
        (rows.length ? rows : defaultUnitRows).map((item) =>
          item.key === row.key
            ? {
                ...item,
                unitId: unit.id,
                conversionFactor: item.isBaseUnit ? "1" : conversionFactor,
              }
            : item,
        ),
      );
      setUnitEditDraft(null);
      setOpenUnitRow(null);
      clearFormErrors();
    } catch (cause) {
      setUnitCreateError(normalizeApiError(cause).message);
    }
  }

  async function saveAdditionalUnit() {
    const nameValue = unitNameDraft.trim();
    const abbreviationValue = unitAbbreviationDraft.trim();
    if (!nameValue || !abbreviationValue) {
      setUnitCreateError("Enter both a unit name and a short form.");
      return;
    }

    setUnitCreateError(null);
    try {
      const existingUnit = unitQuery.data?.find(
        (unit) =>
          unit.name.toLocaleLowerCase() === nameValue.toLocaleLowerCase() ||
          unit.abbreviation.toLocaleLowerCase() ===
            abbreviationValue.toLocaleLowerCase(),
      );
      const unit =
        existingUnit ??
        (await createUnit.mutateAsync({
          name: nameValue,
          abbreviation: abbreviationValue,
        }));
      if (unitRows.some((row) => row.unitId === unit.id)) {
        setUnitCreateError("That unit is already included for this product.");
        return;
      }
      const conversionFactor = suggestedUnitConversion(
        unit.name,
        baseUnitDefinition?.name ?? "",
      );
      const emptyRow = unitRows.find(
        (row) => !row.isBaseUnit && !row.unitId,
      );
      const newRow: ProductUnitDraft = {
        key: emptyRow?.key ?? `unit-${nextKey.current++}`,
        unitId: unit.id,
        conversionFactor,
        isBaseUnit: false,
      };
      setUnitRows((rows) => {
        const currentRows = rows.length ? rows : defaultUnitRows;
        return emptyRow
          ? currentRows.map((row) =>
              row.key === emptyRow.key ? newRow : row,
            )
          : [...currentRows, newRow];
      });
      setUnitDraftOpen(false);
      setOpenUnitRow(null);
      clearFormErrors();
    } catch (cause) {
      setUnitCreateError(normalizeApiError(cause).message);
    }
  }

  async function submit() {
    setSubmitError(null);
    if (createUnit.isPending) {
      revealValidationError("Wait for the counting unit to finish setting up.");
      return;
    }
    if (!name.trim()) {
      revealValidationError("Enter a product name.");
      return;
    }
    if (unitQuery.isLoading) {
      revealValidationError("Wait for measurement units to finish loading.");
      return;
    }
    if (!unitRows.length || unitRows.some((row) => !row.unitId)) {
      revealValidationError("Choose a measurement unit for every row.");
      return;
    }
    if (new Set(unitRows.map((row) => row.unitId)).size !== unitRows.length) {
      revealValidationError("Each measurement unit can only be added once.");
      return;
    }
    if (unitRows.filter((row) => row.isBaseUnit).length !== 1) {
      revealValidationError("Select exactly one main counting unit.");
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
      revealValidationError(
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
      setSubmitError(normalizeApiError(submitError));
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ y: 0, animated: true }),
      );
    }
  }

  function revealValidationError(message: string) {
    setError(message);
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: true }),
    );
  }

  function clearFormErrors() {
    setError(null);
    setSubmitError(null);
  }

  const submitErrorLines = submitError
    ? submitError.details.length
      ? submitError.details.map(({ field, message }) =>
          field ? `${field}: ${message}` : message,
        )
      : [submitError.message]
    : [];

  return (
    <View style={styles.formScreen}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          setupMode && styles.setupContent,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
      <View
        style={[
          styles.form,
          setupMode && styles.setupForm,
          isEggSetup && styles.eggSetupForm,
        ]}
      >
        {isEggSetup ? (
          <View style={styles.eggLead}>
            <AppText
              size="title"
              weight="semibold"
              style={[styles.eggLeadTitle, { color: theme.text }]}
            >
              {initialProduct ? "Edit your eggs" : "Set up your eggs"}
            </AppText>
            <AppText size="small" tone="secondary">
              Name your product, then choose how you count and sell eggs.
            </AppText>
          </View>
        ) : null}
        {submitError ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.submitError,
              {
                borderColor: theme.danger,
                backgroundColor: theme.backgroundElement,
              },
            ]}
          >
            <Ionicons
              name="alert-circle"
              size={20}
              color={theme.danger}
            />
            <View style={styles.submitErrorCopy}>
              <AppText weight="semibold" style={{ color: theme.danger }}>
                {initialProduct
                  ? "Product could not be updated"
                  : "Product could not be created"}
              </AppText>
              {submitErrorLines.map((line, index) => (
                <AppText key={`${index}-${line}`} size="small">
                  {line}
                </AppText>
              ))}
              {submitError.requestId ? (
                <AppText size="small" tone="secondary">
                  Reference: {submitError.requestId}
                </AppText>
              ) : null}
            </View>
          </View>
        ) : null}
        <View
          style={[
            styles.sectionCard,
            setupMode && styles.setupSectionCard,
            isEggSetup && styles.eggSetupCard,
            {
              borderColor: setupMode ? theme.border : "transparent",
              backgroundColor:
                setupMode && !isEggSetup
                  ? theme.backgroundElement
                  : "transparent",
            },
          ]}
        >
        <View
          style={[
            styles.section,
            setupMode && styles.setupSection,
            isEggSetup && styles.eggSetupSection,
          ]}
        >
          {!setupMode ? <View style={styles.sectionHeading}>
            <View
              style={[
                styles.stepNumber,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                01
              </AppText>
            </View>
            <View style={styles.sectionCopy}>
              <AppText size="heading" weight="semibold">
                Product details
              </AppText>
              <AppText size="small" tone="secondary">
                Name and categorize the item for your farm.
              </AppText>
            </View>
          </View> : null}
          <View style={isEggSetup ? styles.eggSetupField : undefined}>
            <TextField
              ref={nameInputRef}
              label="Product name"
              placeholder={
                setupMode && productType === "eggs"
                  ? "e.g. Kienyeji eggs"
                  : setupMode
                    ? "e.g. Chickens"
                    : "e.g. Layer mash"
              }
              value={name}
              onChangeText={(value) => {
                setName(value);
                clearFormErrors();
              }}
              maxLength={setupMode ? 80 : 150}
              autoCapitalize="words"
              autoComplete="off"
              enterKeyHint="done"
              selectTextOnFocus={setupMode}
              onFocus={() => scrollFocusedInput(nameInputRef.current)}
              inputContainerStyle={isEggSetup ? styles.eggInput : undefined}
              style={isEggSetup ? styles.eggNameText : undefined}
              trailingAction={
                setupMode && name
                  ? {
                      icon: "close-circle-outline",
                      accessibilityLabel: "Clear product name",
                      onPress: () => setName(""),
                    }
                  : undefined
              }
            />
          </View>
          {setupMode ? (
            <View style={styles.descriptionSection}>
              {descriptionVisible ? (
                <>
                  <View style={styles.descriptionHeading}>
                    <AppText size="small" weight="semibold">
                      Description
                    </AppText>
                    <View style={styles.descriptionMeta}>
                      <AppText size="small" tone="secondary">
                        Optional · {description.length}/200
                      </AppText>
                      <View style={styles.descriptionActions}>
                      {description ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setDescription("")}
                          style={[
                            styles.descriptionAction,
                            {
                              backgroundColor: theme.backgroundSelected,
                              borderColor: theme.border,
                            },
                          ]}
                        >
                          <Ionicons
                            name="close-circle-outline"
                            size={14}
                            color={theme.primary}
                          />
                          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                            Clear
                          </AppText>
                        </Pressable>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setDescription("");
                          setDescriptionVisible(false);
                        }}
                        style={[
                          styles.descriptionAction,
                          {
                            backgroundColor: `${theme.danger}12`,
                            borderColor: `${theme.danger}35`,
                          },
                        ]}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={14}
                          color={theme.danger}
                        />
                        <AppText size="small" weight="semibold" style={{ color: theme.danger }}>
                          Remove
                        </AppText>
                      </Pressable>
                      </View>
                    </View>
                  </View>
                  <TextField
                    ref={descriptionInputRef}
                    label="Description"
                    hideLabel
                    placeholder={
                      isEggSetup
                        ? "e.g. Free-range eggs from House 1, sold by the tray"
                        : "What is this product used for?"
                    }
                    value={description}
                    maxLength={200}
                    onChangeText={(value) => {
                      setDescription(value);
                      setSubmitError(null);
                    }}
                    multiline
                    selectTextOnFocus
                    onFocus={() => scrollFocusedInput(descriptionInputRef.current)}
                    style={[styles.multiline, isEggSetup && styles.eggDescriptionInput]}
                  />
                </>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDescriptionVisible(true)}
                  style={styles.addDescription}
                >
                  <Ionicons name="add-circle-outline" size={17} color={theme.primary} />
                  <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                    Add description
                  </AppText>
                </Pressable>
              )}
            </View>
          ) : (
            <TextField
              ref={descriptionInputRef}
              label="Description (optional)"
              placeholder="What is this product used for?"
              value={description}
              onChangeText={(value) => {
                setDescription(value);
                setSubmitError(null);
              }}
              multiline
              onFocus={() => scrollFocusedInput(descriptionInputRef.current)}
              style={styles.multiline}
            />
          )}
          {!setupMode ? <View style={styles.fieldGroup}>
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
                    onPress={() => {
                      setProductType(option.value);
                      clearFormErrors();
                    }}
                    style={[
                      styles.option,
                      {
                        backgroundColor: selected
                          ? theme.backgroundSelected
                          : theme.background,
                        borderColor: selected ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <ProductTypeIcon
                      type={option.value}
                      size={17}
                      color={selected ? theme.primary : theme.textSecondary}
                    />
                    <AppText
                      size="small"
                      weight={selected ? "semibold" : "regular"}
                      style={{ color: theme.text, flex: 1 }}
                    >{option.label}</AppText>
                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={17}
                        color={theme.primary}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View> : null}
          {isEggSetup ? (
            <AppText size="small" weight="semibold" style={styles.eggAvailabilityTitle}>
              Availability
            </AppText>
          ) : null}
          <View
            style={[
              styles.settingsGroup,
              isEggSetup && styles.eggAvailabilityGroup,
              {
                borderColor: theme.border,
                backgroundColor: isEggSetup
                  ? theme.backgroundElement
                  : "transparent",
              },
            ]}
          >
            {!setupMode ? <View style={styles.activeRow}>
              <View
                style={[
                  styles.settingIcon,
                  { backgroundColor: isActive ? theme.backgroundSelected : theme.background },
                ]}
              >
                <Ionicons
                  name="toggle-outline"
                  size={18}
                  color={isActive ? theme.primary : theme.textSecondary}
                />
              </View>
              <View style={styles.activeCopy}>
                <AppText weight="semibold" style={styles.settingTitle}>
                  Active in your farm
                </AppText>
                <AppText
                  size="small"
                  tone="secondary"
                  style={styles.settingDescription}
                >
                  {isActive
                    ? "Available in new stock and farm activity."
                    : "Hidden from new activity; past records stay."}
                </AppText>
              </View>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: theme.border, true: theme.success }}
                thumbColor={theme.backgroundElement}
                accessibilityLabel="Product active"
                style={styles.settingSwitch}
              />
            </View> : null}
            {!setupMode ? <View style={[styles.settingDivider, { backgroundColor: theme.border }]} /> : null}
            <View
              style={[
                styles.activeRow,
                setupMode && styles.setupActiveRow,
                isEggSetup && styles.eggAvailabilityRow,
              ]}
            >
              <View
                style={[
                  styles.settingIcon,
                  { backgroundColor: isSellable ? theme.backgroundSelected : theme.background },
                ]}
              >
                <Ionicons
                  name="pricetag-outline"
                  size={17}
                  color={isSellable ? theme.primary : theme.textSecondary}
                />
              </View>
              <View style={styles.activeCopy}>
                <AppText weight="semibold" style={styles.settingTitle}>
                  Available for sale
                </AppText>
                <AppText
                  size="small"
                  tone="secondary"
                  style={styles.settingDescription}
                >
                  {isSellable
                    ? "Can be added to customer sales."
                    : "Hidden from sales. Farm stock tracking is unchanged."}
                </AppText>
              </View>
              <Switch
                value={isSellable}
                onValueChange={setIsSellable}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor={theme.backgroundElement}
                accessibilityLabel="Product available for sale"
                style={styles.settingSwitch}
              />
            </View>
          </View>
        </View>
        </View>

        <View
          style={[
            styles.sectionCard,
            setupMode && styles.setupSectionCard,
            isEggSetup && styles.eggSetupCard,
            {
              borderColor: setupMode ? theme.border : "transparent",
              backgroundColor:
                setupMode && !isEggSetup
                  ? theme.backgroundElement
                  : "transparent",
            },
          ]}
        >
        <View
          style={[
            styles.section,
            styles.measurements,
            setupMode && styles.setupSection,
          ]}
        >
          {!setupMode ? (
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
                <AppText size="heading" weight="semibold" style={styles.stockTitle}>
                  Stock units
                </AppText>
                <AppText size="small" tone="secondary">
                  Choose your main counting unit, then add pack conversions if
                  you need them.
                </AppText>
              </View>
            </View>
          ) : (
            isEggSetup ? (
              <View style={[styles.eggUnitHeading, { borderTopColor: theme.border }]}>
                <View
                  style={[
                    styles.eggUnitStep,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: theme.primary }}
                  >
                    02
                  </AppText>
                </View>
                <AppText size="body" weight="semibold">
                  Egg counting units
                </AppText>
              </View>
            ) : (
              <View style={styles.unitHeadingCompact}>
                <AppText size="body" weight="semibold">
                  Counting unit
                </AppText>
                <AppText
                  size="small"
                  tone="secondary"
                  style={styles.unitHeadingDetail}
                >
                  Choose the main count, then add measures like dozens if needed.
                </AppText>
              </View>
            )
          )}

          {unitQuery.isLoading ? (
            <AppText size="small" tone="secondary">
              Loading measurement units…
            </AppText>
          ) : null}
          {setupMode && createUnit.isPending ? (
            <AppText size="small" tone="secondary">
              Preparing poultry counting units…
            </AppText>
          ) : null}
          {setupUnitError ? (
            <View
              accessibilityRole="alert"
              style={[
                styles.validationError,
                {
                  borderColor: theme.danger,
                  backgroundColor: theme.backgroundElement,
                },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={theme.danger}
              />
              <AppText size="small" style={{ color: theme.danger, flex: 1 }}>
                {setupUnitError}
              </AppText>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setupUnitAttempted.current = false;
                  setSetupUnitError(null);
                  setSetupUnitRetry((attempt) => attempt + 1);
                }}
              >
                <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                  Retry
                </AppText>
              </Pressable>
            </View>
          ) : null}
          {unitQuery.isError ? (
            <View style={styles.fieldGroup}>
              <View
                accessibilityRole="alert"
                style={[
                  styles.validationError,
                  {
                    borderColor: theme.danger,
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color={theme.danger}
                />
                <AppText size="small" style={{ color: theme.danger, flex: 1 }}>
                  {normalizeApiError(unitQuery.error).message}
                </AppText>
              </View>
              <Button
                label="Retry units"
                variant="secondary"
                onPress={() => void unitQuery.refetch()}
              />
            </View>
          ) : null}
          {!setupMode &&
          !unitQuery.isLoading &&
          !unitQuery.isError &&
          !unitQuery.data?.length ? (
            <View
              style={[
                styles.unitEmptyState,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.backgroundSelected,
                },
              ]}
            >
              <Ionicons
                name="resize-outline"
                size={22}
                color={theme.primary}
              />
              <View style={styles.unitEmptyCopy}>
                <AppText weight="semibold">No stock units yet</AppText>
                <AppText size="small" tone="secondary">
                  Create a counting unit, such as birds, eggs, kilograms, or
                  trays. You’ll return here automatically afterward.
                </AppText>
              </View>
              <Button
                label="Create first measurement unit"
                onPress={() =>
                  router.push({
                    pathname: "/units",
                    params: { returnToProductForm: "true" },
                  })
                }
              />
            </View>
          ) : null}

          <View
            style={[
              styles.unitRows,
              isEggSetup && styles.eggUnitsList,
              isEggSetup && {
                borderColor: theme.border,
                backgroundColor: theme.backgroundElement,
              },
            ]}
          >
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
            const rowEditing = openUnitRow === row.key;
            const unitSummary = row.isBaseUnit
              ? "Main stock unit. Other units convert to this."
              : row.conversionFactor
                ? `1 ${selectedUnit?.name ?? "unit"} = ${row.conversionFactor} ${pluralUnitName(baseUnitDefinition?.name ?? "base unit", Number(row.conversionFactor))}`
                : `Enter how many ${pluralUnitName(baseUnitDefinition?.name ?? "stock unit", 2)} are in one ${selectedUnit?.name ?? "unit"}.`;

            return (
              <View
                key={row.key}
                style={[
                  styles.unitRow,
                  setupMode && styles.setupUnitRow,
                  isEggSetup && styles.eggUnitRow,
                  isEggSetup && {
                    backgroundColor: row.isBaseUnit
                      ? theme.backgroundSelected
                      : theme.backgroundElement,
                    borderLeftWidth: 3,
                    borderLeftColor: row.isBaseUnit ? theme.primary : theme.secondary,
                  },
                  isEggSetup &&
                    index === unitRows.length - 1 &&
                    styles.eggUnitLastRow,
                  { borderColor: theme.border },
                ]}
              >
                <View style={styles.unitRowHeading}>
                  {isEggSetup ? (
                    <>
                      <View style={styles.eggUnitCopy}>
                        <View style={styles.eggUnitTitleRow}>
                          <AppText weight="semibold">
                            {selectedUnit?.name ?? (row.isBaseUnit ? "Main unit" : "New unit")}
                          </AppText>
                          {row.isBaseUnit ? (
                            <View
                              style={[
                                styles.eggMainTag,
                                {
                                  backgroundColor: theme.backgroundSelected,
                                  borderColor: `${theme.primary}50`,
                                },
                              ]}
                            >
                              <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                                Main
                              </AppText>
                            </View>
                          ) : null}
                        </View>
                        <AppText size="small" tone="secondary">
                          {unitSummary}
                        </AppText>
                      </View>
                      <View style={styles.eggUnitActions}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${selectedUnit?.name ?? "measurement unit"}`}
                          accessibilityState={{ expanded: rowEditing }}
                          onPress={() =>
                            rowEditing
                              ? (setOpenUnitRow(null), setUnitEditDraft(null), setUnitCreateError(null))
                              : openUnitEditor(row)
                          }
                          style={[
                            styles.eggEditAction,
                            { backgroundColor: `${theme.primary}18` },
                          ]}
                        >
                          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                            {rowEditing ? "Cancel" : "Edit"}
                          </AppText>
                        </Pressable>
                        {!row.isBaseUnit ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${selectedUnit?.name ?? "measurement unit"}`}
                            hitSlop={6}
                            onPress={() => {
                              setUnitRows((rows) =>
                                (rows.length ? rows : defaultUnitRows).filter(
                                  (item) => item.key !== row.key,
                                ),
                              );
                              setOpenUnitRow(null);
                            }}
                            style={styles.eggRemoveAction}
                          >
                            <Ionicons name="trash-outline" size={15} color={theme.textSecondary} />
                            <AppText size="small" tone="secondary">Remove</AppText>
                          </Pressable>
                        ) : null}
                      </View>
                    </>
                  ) : (
                    <AppText weight="semibold">
                      {row.isBaseUnit
                        ? productType === "eggs"
                          ? "Main egg unit"
                          : "Main counting unit"
                        : `${productType === "eggs" ? "Egg measure" : "Additional unit"} ${conversionIndex}`}
                    </AppText>
                  )}
                  {!isEggSetup && !row.isBaseUnit && unitRows.length > 1 ? (
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

                {!isEggSetup ? <Pressable
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
                    setupMode && styles.setupUnitSelector,
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
                    name={openUnitRow === row.key ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={theme.textSecondary}
                  />
                </Pressable> : null}
                {!isEggSetup && openUnitRow === row.key ? (
                  <ScrollView
                    style={[styles.unitOptions, { borderColor: theme.border }]}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                    keyboardShouldPersistTaps="handled"
                  >
                    {availableUnits.map((unit) => (
                      <Pressable
                        key={unit.id}
                        accessibilityRole="button"
                        onPress={() => {
                          updateUnitRow(row.key, { unitId: unit.id });
                          setOpenUnitRow(null);
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
                  </ScrollView>
                ) : null}

                {isEggSetup && rowEditing ? (
                  <View
                    style={[
                      styles.eggUnitEditor,
                      {
                        backgroundColor: theme.backgroundSelected,
                        borderColor: theme.border,
                        borderLeftColor: theme.primary,
                      },
                    ]}
                  >
                    <View style={styles.eggEditorHeading}>
                      <View
                        style={[
                          styles.eggEditorIcon,
                          { backgroundColor: `${theme.primary}20` },
                        ]}
                      >
                        <Ionicons
                          name="options-outline"
                          size={17}
                          color={theme.primary}
                        />
                      </View>
                      <View style={styles.eggEditorCopy}>
                        <AppText size="small" weight="semibold">
                          Edit {row.isBaseUnit ? "main unit" : "egg measure"}
                        </AppText>
                        <AppText size="small" tone="secondary">
                          Set the label and how this product uses it.
                        </AppText>
                      </View>
                    </View>
                    <TextField
                      ref={unitNameInputRef}
                      label="Unit name"
                      value={unitNameDraft}
                      onChangeText={setUnitNameDraft}
                      maxLength={80}
                      autoCapitalize="words"
                      selectTextOnFocus
                      onFocus={() => scrollFocusedInput(unitNameInputRef.current)}
                    />
                    <TextField
                      ref={unitAbbreviationInputRef}
                      label="Short form"
                      value={unitAbbreviationDraft}
                      onChangeText={setUnitAbbreviationDraft}
                      maxLength={16}
                      autoCapitalize="none"
                      selectTextOnFocus
                      onFocus={() =>
                        scrollFocusedInput(unitAbbreviationInputRef.current)
                      }
                    />
                    {!row.isBaseUnit ? (
                      <TextField
                        label={`Eggs per ${unitNameDraft.trim().toLowerCase() || "unit"}`}
                        placeholder="e.g. 30"
                        keyboardType="decimal-pad"
                        ref={(input) => {
                          if (input) conversionInputRefs.current.set(row.key, input);
                          else conversionInputRefs.current.delete(row.key);
                        }}
                        value={unitEditDraft?.conversionFactor ?? ""}
                        onChangeText={(value) =>
                          setUnitEditDraft((draft) =>
                            draft ? { ...draft, conversionFactor: value } : draft,
                          )
                        }
                        selectTextOnFocus={Boolean(unitEditDraft?.conversionFactor)}
                        onFocus={() =>
                          scrollFocusedInput(
                            conversionInputRefs.current.get(row.key) ?? null,
                          )
                        }
                      />
                    ) : (
                      <AppText size="small" tone="secondary">
                        This is the default unit used to count eggs.
                      </AppText>
                    )}
                    <AppText size="small" tone="secondary" style={styles.eggEditorNote}>
                      Renaming creates a separate unit for this product. Your existing units remain unchanged.
                    </AppText>
                    {unitCreateError ? (
                      <AppText
                        accessibilityLiveRegion="assertive"
                        size="small"
                        style={{ color: theme.danger }}
                      >
                        {unitCreateError}
                      </AppText>
                    ) : null}
                    <View style={styles.eggEditorActions}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setOpenUnitRow(null);
                          setUnitEditDraft(null);
                          setUnitCreateError(null);
                        }}
                        style={[
                          styles.eggEditorCancel,
                          { borderColor: theme.border },
                        ]}
                      >
                        <AppText size="small" weight="semibold">Cancel</AppText>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={createUnit.isPending}
                        onPress={() => void saveUnitEditor(row)}
                        style={[
                          styles.eggEditorSave,
                          { backgroundColor: theme.primary },
                          createUnit.isPending && styles.disabledAction,
                        ]}
                      >
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={theme.onPrimary}
                        />
                        <AppText
                          size="small"
                          weight="semibold"
                          style={{ color: theme.onPrimary }}
                        >
                          Save unit
                        </AppText>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {!isEggSetup && row.isBaseUnit ? (
                  setupMode ? (
                    <AppText size="small" tone="secondary">
                      Main unit for stock and sales
                    </AppText>
                  ) : (
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
                  )
                ) : (
                  !row.isBaseUnit && (!isEggSetup || rowEditing) ? (
                    <TextField
                      label={
                        isEggSetup
                          ? `Eggs per ${selectedUnit?.name.toLowerCase() ?? "unit"}`
                          : `How many ${pluralUnitName(baseUnitName, 2).toLowerCase()} are in one ${selectedUnit?.name.toLowerCase() ?? "unit"}?`
                      }
                      placeholder="e.g. 30"
                      keyboardType="decimal-pad"
                      ref={(input) => {
                        if (input)
                          conversionInputRefs.current.set(row.key, input);
                        else conversionInputRefs.current.delete(row.key);
                      }}
                      selectTextOnFocus={
                        setupMode && Boolean(row.conversionFactor)
                      }
                      value={row.conversionFactor}
                      onChangeText={(value) =>
                        updateUnitRow(row.key, { conversionFactor: value })
                      }
                      onFocus={() =>
                        scrollFocusedInput(
                          conversionInputRefs.current.get(row.key) ?? null,
                        )
                      }
                    />
                  ) : null
                )}

                {!row.isBaseUnit && (!isEggSetup || rowEditing) ? (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: false }}
                    onPress={() => void chooseBaseUnit(row.key)}
                    style={[
                      styles.baseChoice,
                      setupMode && styles.setupBaseChoice,
                    ]}
                  >
                    <Ionicons
                      name={
                        row.isBaseUnit ? "radio-button-on" : "radio-button-off"
                      }
                      size={19}
                      color={row.isBaseUnit ? theme.primary : theme.textSecondary}
                    />
                    <AppText size="small">
                      Use as the main counting unit
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
          </View>

          {unitQuery.data?.length ? (
            <View style={styles.fieldGroup}>
              <View style={styles.unitActions}>
                <FormAction
                  label={
                    setupMode
                      ? productType === "eggs"
                        ? "Add a unit, like crate"
                        : "Add another measure"
                      : "Add another unit"
                  }
                  icon="add-circle-outline"
                  style={
                    isEggSetup
                      ? [
                          styles.eggAddUnitButton,
                          { borderColor: theme.border },
                        ]
                      : undefined
                  }
                  disabled={
                    createUnit.isPending ||
                    (!isEggSetup && unitRows.length >= unitQuery.data.length)
                  }
                  onPress={isEggSetup ? openUnitDraft : addUnitRow}
                />
                {setupMode && !isEggSetup ? (
                  <FormAction
                    label="Create a unit"
                    icon="create-outline"
                    disabled={createUnit.isPending}
                    onPress={openUnitDraft}
                  />
                ) : (
                  <FormAction
                    label="Manage units"
                    icon="settings-outline"
                    onPress={() =>
                      router.push({
                        pathname: "/units",
                        params: { returnToProductForm: "true" },
                      })
                    }
                  />
                )}
              </View>
              {unitDraftOpen ? (
                <View
                  style={[
                    styles.unitDraft,
                    isEggSetup && styles.eggUnitDraft,
                    {
                      backgroundColor: theme.backgroundSelected,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <View style={styles.unitDraftHeading}>
                    <View style={styles.unitDraftCopy}>
                      <AppText size="small" weight="semibold">
                        Create a measurement unit
                      </AppText>
                      <AppText size="small" tone="secondary">
                        Add a new way to count this product.
                      </AppText>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Cancel new unit"
                      onPress={() => {
                        setUnitDraftOpen(false);
                        setUnitCreateError(null);
                      }}
                      style={styles.cancelUnitDraft}
                    >
                      <Ionicons
                        name="close"
                        size={17}
                        color={theme.textSecondary}
                      />
                    </Pressable>
                  </View>
                  <TextField
                    ref={unitNameInputRef}
                    label="Unit name"
                    value={unitNameDraft}
                    onChangeText={setUnitNameDraft}
                    maxLength={80}
                    autoCapitalize="words"
                    selectTextOnFocus
                    onFocus={() => scrollFocusedInput(unitNameInputRef.current)}
                  />
                  <TextField
                    ref={unitAbbreviationInputRef}
                    label="Short form"
                    value={unitAbbreviationDraft}
                    onChangeText={setUnitAbbreviationDraft}
                    maxLength={16}
                    autoCapitalize="none"
                    selectTextOnFocus
                    onFocus={() =>
                      scrollFocusedInput(unitAbbreviationInputRef.current)
                    }
                  />
                  {isEggSetup ? (
                    <View style={styles.eggUnitPresets}>
                      {[
                        { name: "Crate", abbreviation: "crate" },
                        { name: "Dozen", abbreviation: "doz" },
                        { name: "Basket", abbreviation: "basket" },
                      ].map((preset) => (
                        <Pressable
                          key={preset.name}
                          accessibilityRole="button"
                          onPress={() => {
                            setUnitNameDraft(preset.name);
                            setUnitAbbreviationDraft(preset.abbreviation);
                          }}
                          style={[
                            styles.eggUnitPreset,
                            {
                              backgroundColor: theme.backgroundElement,
                              borderColor: theme.border,
                            },
                          ]}
                        >
                          <AppText size="small" weight="semibold">
                            {preset.name}
                          </AppText>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {unitCreateError ? (
                    <AppText
                      accessibilityLiveRegion="assertive"
                      size="small"
                      style={{ color: theme.danger }}
                    >
                      {unitCreateError}
                    </AppText>
                  ) : null}
                  <Button
                    label="Add unit"
                    loading={createUnit.isPending}
                    disabled={!unitNameDraft.trim() || !unitAbbreviationDraft.trim()}
                    style={styles.addUnitButton}
                    onPress={() => void saveAdditionalUnit()}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          {isEggSetup ? (
            <View
              style={[
                styles.eggUnitNote,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={theme.primary}
              />
              <AppText size="small" tone="secondary" style={styles.eggUnitNoteText}>
                Tray size can vary. You can change the conversion for this product at any time.
              </AppText>
            </View>
          ) : null}
        </View>

        {error ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.validationError,
              { borderColor: theme.danger, backgroundColor: theme.backgroundElement },
            ]}
          >
            <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
            <AppText size="small" style={{ color: theme.danger, flex: 1 }}>
              {error}
            </AppText>
          </View>
        ) : null}
        </View>
      </View>
      </ScrollView>
      <View
        style={[
          styles.stickyFooter,
          setupMode && styles.setupStickyFooter,
          {
            backgroundColor: theme.background,
            borderTopColor: theme.border,
          },
        ]}
      >
        <Button
          label={submitLabel}
          loading={unitQuery.isLoading || createUnit.isPending || isSubmitting}
          style={[
            styles.submitButton,
            setupMode ? styles.setupStickyButton : styles.normalStickyButton,
          ]}
          disabled={
            unitQuery.isLoading ||
            createUnit.isPending ||
            !unitQuery.data?.length ||
            !name.trim()
          }
          onPress={() => void submit()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  formScreen: { flex: 1 },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 22,
  },
  setupContent: {
    maxWidth: 520,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
  },
  form: { gap: 18 },
  setupForm: { gap: 10 },
  eggSetupForm: { gap: 0 },
  eggLead: { gap: 5, marginBottom: 22 },
  eggLeadTitle: { fontSize: 25, lineHeight: 31, letterSpacing: -0.45 },
  eggSetupCard: {
    gap: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  eggSetupSection: { gap: 18 },
  eggSetupField: { marginBottom: 0 },
  eggInput: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingLeft: 13,
    paddingRight: 4,
  },
  eggNameText: {
    minHeight: 50,
    fontSize: 15,
    paddingVertical: 10,
    borderWidth: 0,
    backgroundColor: "transparent",
    outlineWidth: 0,
    outlineColor: "transparent",
    outlineStyle: "solid",
  },
  eggDescriptionInput: { minHeight: 88, borderRadius: 12, borderWidth: 1.5 },
  eggAvailabilityTitle: { marginBottom: -7 },
  eggAvailabilityGroup: {
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  eggAvailabilityRow: { minHeight: 64 },
  eggUnitHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 13,
    marginTop: 2,
    marginBottom: -3,
  },
  eggUnitStep: {
    width: 25,
    height: 25,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  eggUnitsList: {
    gap: 0,
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 14,
  },
  eggAddUnitButton: {
    width: "100%",
    minHeight: 48,
    borderStyle: "dashed",
    borderRadius: 12,
    justifyContent: "center",
  },
  eggUnitPresets: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  eggUnitPreset: {
    minHeight: 34,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 17,
    paddingHorizontal: 12,
  },
  unitRows: { gap: 8 },
  eggUnitRow: {
    gap: 8,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
    padding: 14,
  },
  eggUnitLastRow: { borderBottomWidth: 0 },
  eggUnitCopy: { flex: 1, minWidth: 0, gap: 3 },
  eggUnitTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eggMainTag: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  eggUnitActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  eggEditAction: {
    minHeight: 34,
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 9,
  },
  eggRemoveAction: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
  },
  eggUnitNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  eggUnitNoteText: { flex: 1, lineHeight: 18 },
  eggUnitDraft: { borderRadius: 13, padding: 14 },
  eggUnitEditor: {
    gap: 11,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 12,
    padding: 12,
  },
  eggEditorHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 2,
  },
  eggEditorIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  eggEditorCopy: { flex: 1, gap: 2 },
  eggEditorNote: { lineHeight: 17 },
  eggEditorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    marginTop: 1,
  },
  eggEditorCancel: {
    minHeight: 40,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 13,
  },
  eggEditorSave: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 9,
    paddingHorizontal: 13,
  },
  disabledAction: { opacity: 0.55 },
  stickyFooter: {
    width: "100%",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 9,
    paddingBottom: 10,
    alignItems: "center",
  },
  setupStickyFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 11,
    paddingBottom: 12,
    alignItems: "center",
  },
  setupStickyButton: { width: "100%", maxWidth: 480 },
  normalStickyButton: { width: "100%", maxWidth: 644 },
  sectionCard: {
    gap: 17,
    padding: 0,
    borderWidth: 0,
    borderRadius: 0,
  },
  setupSectionCard: {
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  section: { gap: 15 },
  setupSection: { gap: 10 },
  descriptionSection: { gap: 7 },
  descriptionHeading: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  descriptionMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  descriptionActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  descriptionAction: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
  },
  addDescription: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
  },
  fieldGroup: { gap: 9 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: {
    minHeight: 48,
    flexBasis: "46%",
    flexGrow: 1,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  activeRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  setupActiveRow: { minHeight: 54 },
  activeCopy: { flex: 1, minWidth: 0, gap: 2 },
  settingTitle: { flexShrink: 1 },
  settingDescription: { flexShrink: 1, lineHeight: 17 },
  settingSwitch: { flexShrink: 0, marginLeft: 2 },
  settingsGroup: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 11 },
  settingIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  settingDivider: { height: StyleSheet.hairlineWidth, marginLeft: 42 },
  measurements: { gap: 14 },
  unitHeadingCompact: { gap: 1 },
  unitHeadingDetail: { lineHeight: 17 },
  setupUnitRow: { gap: 8, borderRadius: 8, padding: 10 },
  unitDraft: { gap: 9, borderWidth: 1, borderRadius: 9, padding: 10 },
  unitDraftHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  unitDraftCopy: { flex: 1, gap: 1 },
  cancelUnitDraft: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  addUnitButton: {
    alignSelf: "flex-start",
    minHeight: 42,
    borderRadius: 8,
  },
  setupUnitSelector: { minHeight: 42 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  sectionCopy: { flex: 1, gap: 3 },
  stepNumber: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  stockTitle: { fontSize: 21, lineHeight: 28 },
  unitActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  formAction: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 12,
  },
  submitButton: { minHeight: 52, borderRadius: 9 },
  setupSubmitButton: { minHeight: 46, borderRadius: 8 },
  submitError: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 9,
    padding: 12,
  },
  submitErrorCopy: { flex: 1, gap: 5 },
  validationError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 11,
  },
  unitEmptyState: {
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 9,
    padding: 12,
  },
  unitEmptyCopy: { gap: 4 },
  unitRow: {
    gap: 11,
    borderWidth: 1,
    borderRadius: 9,
    padding: 12,
  },
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
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 12,
  },
  selectorText: { flex: 1 },
  unitOptions: {
    maxHeight: 190,
    flexGrow: 0,
    borderWidth: 1,
    borderRadius: 7,
  },
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
  setupBaseChoice: { minHeight: 34 },
});
