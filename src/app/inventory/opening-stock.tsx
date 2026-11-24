import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useRef, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  View,
  type ScrollViewInstance,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useChickenSaleOptions } from "@/features/chickens/hooks";
import { useEggCollectionOptions } from "@/features/eggs/hooks";
import {
  useCreateInventoryOpeningSetup,
  useInventoryOpeningSetupStatus,
  useProducts,
} from "@/features/management/hooks";
import type {
  InventoryOpeningSetupInput,
  Product,
} from "@/features/management/api";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type Species = "chickens" | "eggs";
type ChickenType = "layers" | "broiler" | "kienyeji" | "breeder" | "other";
type AgeUnit = "days" | "weeks" | "months";
type ChickenDraft = {
  key: string;
  name: string;
  productId: string;
  chickenType: ChickenType;
  breed: string;
  age: string;
  ageUnit: AgeUnit;
  unitCost: string;
  quantities: Record<string, string>;
};
type EggDraft = {
  key: string;
  productId: string;
  quantities: Record<string, string>;
  unitCosts: Record<string, string>;
};

const chickenTypes: { value: ChickenType; label: string }[] = [
  { value: "layers", label: "Layers" },
  { value: "broiler", label: "Broilers" },
  { value: "kienyeji", label: "Kienyeji" },
  { value: "breeder", label: "Breeders" },
  { value: "other", label: "Other" },
];

const ageUnits: { value: AgeUnit; label: string }[] = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
];

export default function OpeningStockRoute() {
  return (
    <SessionGate allowIncompleteSetup>
      <OpeningStockContent />
    </SessionGate>
  );
}

function OpeningStockContent() {
  const params = useLocalSearchParams<{
    species?: string;
    fromSetup?: string;
    setupStep?: string;
  }>();
  const species: Species = params.species === "eggs" ? "eggs" : "chickens";
  const returnHref: Href =
    params.fromSetup === "true"
      ? {
          pathname: "/farm-setup",
          params: { step: params.setupStep ?? "3" },
        }
      : "/inventory";
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const farmId = farm.selectedFarm?.id;
  const userId = user?.id;
  const status = useInventoryOpeningSetupStatus(userId, farmId);
  const productsQuery = useProducts(userId, farmId);
  const chickenOptions = useChickenSaleOptions(userId, farmId);
  const eggOptions = useEggCollectionOptions(userId, farmId);
  const mutation = useCreateInventoryOpeningSetup(userId ?? "", farmId ?? "");
  const chickenBlocks = chickenOptions.data?.blocks ?? [];
  const eggProducts = (eggOptions.data?.products ?? []).filter(
    (product) =>
      productsQuery.data?.some(
        (candidate) =>
          candidate.id === product.id &&
          candidate.is_active &&
          candidate.product_type === "eggs",
      ),
  );
  const chickenProducts = (productsQuery.data ?? []).filter(
    (product) =>
      product.is_active && product.product_type === "chickens",
  );
  const eligible = status.data?.[species].eligible;
  const [setupDate, setSetupDate] = useState(localDateString());
  const scrollView = useRef<ScrollViewInstance>(null);
  const [chickenBatches, setChickenBatches] = useState<ChickenDraft[]>(() => [
    newChickenDraft(`Initial Chicken Stock - ${localDateString()}`),
  ]);
  const resolvedChickenBatches = chickenBatches.map((batch) =>
    batch.productId || !chickenProducts[0]
      ? batch
      : { ...batch, productId: chickenProducts[0].id },
  );
  const [eggStock, setEggStock] = useState<EggDraft[]>([newEggDraft()]);
  const [formError, setFormError] = useState<string | null>(null);
  const loading =
    status.isLoading ||
    chickenOptions.isLoading ||
    eggOptions.isLoading ||
    productsQuery.isLoading;

  function scrollInputIntoView(target: number) {
    if (Platform.OS !== "android") return;

    setTimeout(() => {
      scrollView.current?.scrollResponderScrollNativeHandleToKeyboard(
        target,
        24,
        true,
      );
    }, 350);
  }

  function updateChicken(key: string, update: Partial<ChickenDraft>) {
    setFormError(null);
    setChickenBatches((current) =>
      current.map((batch) =>
        batch.key === key ? { ...batch, ...update } : batch,
      ),
    );
  }

  function updateEgg(key: string, update: Partial<EggDraft>) {
    setFormError(null);
    setEggStock((current) =>
      current.map((row) => (row.key === key ? { ...row, ...update } : row)),
    );
  }

  async function saveOpeningStock() {
    if (!farmId || !userId) {
      setFormError("Select a farm before recording opening stock.");
      return;
    }
    if (!isValidDate(setupDate)) {
      setFormError("Choose a valid date for this opening stock record.");
      return;
    }

    let payload: InventoryOpeningSetupInput;
    if (species === "chickens") {
      if (chickenBatches.some((batch) => !isValidAge(batch.age))) {
        setFormError(
          "Enter a whole, non-negative age for each batch, or leave age blank if it is unknown.",
        );
        return;
      }
      const batches = resolvedChickenBatches.map((batch) => ({
        name: batch.name.trim(),
        product_id: batch.productId,
        chicken_type: batch.chickenType,
        breed: batch.breed.trim() || undefined,
        hatch_date:
          calculateHatchDate(batch.age, batch.ageUnit, setupDate) ?? undefined,
        unit_cost: batch.unitCost.trim() || undefined,
        allocations: Object.entries(batch.quantities)
          .filter(([, quantity]) => Number(quantity) > 0)
          .map(([blockId, quantity]) => ({
            block_id: blockId,
            quantity: Number(quantity),
          })),
      }));
      if (
        batches.some(
          (batch) =>
              !batch.name ||
              !chickenProducts.some(
                (product) => product.id === batch.product_id,
              ) ||
              !isOptionalNonNegativeNumber(batch.unit_cost) ||
              batch.allocations.length === 0 ||
            batch.allocations.some(
              (allocation) =>
                !Number.isInteger(allocation.quantity) ||
                allocation.quantity <= 0,
            ),
        )
      ) {
        setFormError(
          "Complete each batch: enter a name, assign birds to a housing block, and check any cost you entered.",
        );
        return;
      }
      payload = {
        species,
        setup_date: setupDate,
        chicken_batches: batches,
        egg_stock: [],
      };
    } else {
      const rows = eggStock.map((row) => ({
        product_id: row.productId,
        units: Object.entries(row.quantities)
          .filter(([, quantity]) => quantity.trim())
          .map(([unitId, quantity]) => ({
            unit_id: unitId,
            quantity: quantity.trim(),
            unit_cost: row.unitCosts[unitId]?.trim() || undefined,
          })),
      }));
      if (
        rows.some(
          (row) =>
            !row.product_id ||
            !row.units.length ||
            row.units.some(
              (unit) =>
                !Number.isFinite(Number(unit.quantity)) ||
                Number(unit.quantity) <= 0 ||
                !isOptionalNonNegativeNumber(unit.unit_cost),
            ),
        )
      ) {
        setFormError(
          "For each egg product, enter a positive quantity in at least one unit. Check any cost you entered.",
        );
        return;
      }
      const eggStockEntries = rows.flatMap((row) =>
        row.units.map((unit) => ({
          product_id: row.product_id,
          unit_id: unit.unit_id,
          quantity: unit.quantity,
          unit_cost: unit.unit_cost,
        })),
      );
      payload = {
        species,
        setup_date: setupDate,
        chicken_batches: [],
        egg_stock: eggStockEntries,
      };
    }

    setFormError(null);
    try {
      await mutation.mutateAsync(payload);
      Alert.alert(
        "Opening stock recorded",
        "Your initial stock is now part of the farm records. This did not create a purchase or payment.",
        [{ text: "Done", onPress: () => router.replace(returnHref) }],
      );
    } catch (error) {
      setFormError(normalizeApiError(error).message);
    }
  }

  const optionError =
    status.error ??
    (species === "chickens" ? chickenOptions.error : eggOptions.error) ??
    productsQuery.error;
  const optionsReady =
    species === "chickens"
      ? chickenOptions.isSuccess && productsQuery.isSuccess
      : eggOptions.isSuccess && productsQuery.isSuccess;
  const noLocations =
    species === "chickens" && optionsReady && chickenBlocks.length === 0;
  const noChickenProducts =
    species === "chickens" &&
    productsQuery.isSuccess &&
    chickenProducts.length === 0;
  const noEggProducts = species === "eggs" && optionsReady && eggProducts.length === 0;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        ref={scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      >
        <FarmPageHeader
          title="Opening stock"
          showBack
          fallbackHref={returnHref}
        />
        <View style={styles.intro}>
          <View style={[styles.introIcon, { backgroundColor: `${theme.primary}18` }]}>
            {species === "chickens" ? (
              <MaterialCommunityIcons
                name="bird"
                size={23}
                color={theme.primary}
              />
            ) : (
              <Ionicons name="egg-outline" size={22} color={theme.primary} />
            )}
          </View>
          <View style={styles.grow}>
            <AppText size="heading" weight="semibold" style={styles.pageTitle}>
              {species === "chickens" ? "Opening flock" : "Opening egg stock"}
            </AppText>
            <AppText size="small" tone="secondary">
              Record stock already on your farm. This won’t create a purchase.
            </AppText>
          </View>
        </View>

        {loading ? (
          <Card><AppText size="small" tone="secondary">Loading farm setup options…</AppText></Card>
        ) : optionError ? (
          <Card style={styles.notice}>
            <AppText weight="semibold">Setup options could not be loaded</AppText>
            <AppText size="small" tone="secondary">
              {normalizeApiError(optionError).message}
            </AppText>
          </Card>
        ) : !eligible ? (
          <Card style={styles.notice}>
            <Ionicons name="lock-closed-outline" size={22} color={theme.textSecondary} />
            <AppText weight="semibold">Initial setup is no longer available</AppText>
            <AppText size="small" tone="secondary">
              This farm already has {species === "chickens" ? "chicken" : "egg"} records.
              Continue with the normal flock or egg workflow to preserve the history.
            </AppText>
            <Button
              label="Return to inventory"
              variant="secondary"
              onPress={() => router.replace(returnHref)}
            />
          </Card>
        ) : noEggProducts ? (
          <Card style={styles.emptyEggCard}>
            <View
              style={[
                styles.emptyEggIcon,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <Ionicons name="egg-outline" size={24} color={theme.primary} />
            </View>
            <View style={styles.emptyEggCopy}>
              <AppText size="heading" weight="semibold">
                Set up an egg product
              </AppText>
              <AppText size="small" tone="secondary">
                Opening stock needs an active egg product with at least one
                measurement unit. Create it now, then you’ll return here.
              </AppText>
            </View>
            <Button
              label="Set up egg product"
              onPress={() =>
                router.push({
                  pathname: "/products/new",
                  params: {
                    setupType: "eggs",
                    returnToOpeningStock: "true",
                    openingSpecies: "eggs",
                    fromSetup: params.fromSetup,
                    setupStep: params.setupStep,
                  },
                })
              }
            />
            <Button
              label="Back to inventory"
              variant="secondary"
              onPress={() => router.replace(returnHref)}
            />
          </Card>
        ) : noChickenProducts ? (
          <Card style={styles.emptyEggCard}>
            <View
              style={[
                styles.emptyEggIcon,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <MaterialCommunityIcons
                name="bird"
                size={24}
                color={theme.primary}
              />
            </View>
            <View style={styles.emptyEggCopy}>
              <AppText size="heading" weight="semibold">
                Set up a chicken product
              </AppText>
              <AppText size="small" tone="secondary">
                Opening flock stock needs an active chicken product so the
                starting quantity is tracked in inventory. Create one first.
              </AppText>
            </View>
            <Button
              label="Set up chicken product"
              onPress={() =>
                router.push({
                  pathname: "/products/new",
                  params: {
                    setupType: "chickens",
                    returnToOpeningStock: "true",
                    openingSpecies: "chickens",
                    fromSetup: params.fromSetup,
                    setupStep: params.setupStep,
                  },
                })
              }
            />
            <Button
              label="Back to inventory"
              variant="secondary"
              onPress={() => router.replace(returnHref)}
            />
          </Card>
        ) : noLocations ? (
          <Card style={styles.notice}>
            <Ionicons name="alert-circle-outline" size={22} color="#B9852F" />
            <AppText weight="semibold">Complete setup prerequisites</AppText>
            <AppText size="small" tone="secondary">
              Add an active housing block before assigning opening chickens.
            </AppText>
            <Button
              label="Return to inventory"
              variant="secondary"
              onPress={() => router.replace(returnHref)}
            />
          </Card>
        ) : (
          <>
            <Card style={styles.dateCard}>
              <View style={styles.dateHeading}>
                <View
                  style={[
                    styles.dateIcon,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={theme.primary}
                  />
                </View>
                <View style={styles.grow}>
                  <AppText weight="semibold">Opening stock date</AppText>
                  <AppText size="small" tone="secondary">
                    When this count was accurate
                  </AppText>
                </View>
              </View>
              <DatePickerField
                label="Stock as of"
                value={setupDate}
                onChange={(date) => {
                  setSetupDate(date);
                  setFormError(null);
                }}
                maximumDate={new Date()}
              />
            </Card>
            {species === "chickens" ? (
              <View style={styles.formList}>
                {resolvedChickenBatches.map((batch, index) => (
                  <ChickenBatchCard
                    key={batch.key}
                    batch={batch}
                    index={index}
                    products={chickenProducts}
                    blocks={chickenBlocks}
                    currency={farm.selectedFarm?.settings?.currency ?? "KES"}
                    setupDate={setupDate}
                    onInputFocus={scrollInputIntoView}
                    onChange={(update) => updateChicken(batch.key, update)}
                    onRemove={
                      resolvedChickenBatches.length > 1
                        ? () =>
                            setChickenBatches((current) =>
                              current.filter((item) => item.key !== batch.key),
                            )
                        : undefined
                    }
                  />
                ))}
                <Button
                  label="Add another chicken batch"
                  variant="secondary"
                  style={[
                    styles.addBatchOption,
                    {
                      backgroundColor: "transparent",
                      borderColor: theme.primary,
                    },
                  ]}
                  onPress={() =>
                    setChickenBatches((current) => [
                      ...current,
                      newChickenDraft(
                        `Chicken Batch ${current.length + 1} - ${localDateString()}`,
                        chickenProducts[0]?.id ?? "",
                      ),
                    ])
                  }
                />
              </View>
            ) : (
              <View style={styles.formList}>
                {eggStock.map((row, index) => {
                  const product = eggProducts.find((item) => item.id === row.productId);
                  const units = product?.units ?? [];
                  return (
                    <EggStockCard
                      key={row.key}
                      row={row}
                      index={index}
                      products={eggProducts}
                      units={units}
                      currency={farm.selectedFarm?.settings?.currency ?? "KES"}
                      onInputFocus={scrollInputIntoView}
                      onChange={(update) => updateEgg(row.key, update)}
                      onRemove={
                        eggStock.length > 1
                          ? () =>
                              setEggStock((current) =>
                                current.filter((item) => item.key !== row.key),
                              )
                          : undefined
                      }
                    />
                  );
                })}
                <Button
                  label="Add another egg product"
                  variant="secondary"
                  onPress={() => setEggStock((current) => [...current, newEggDraft()])}
                />
              </View>
            )}
            {formError ? (
              <Card
                accessibilityRole="alert"
                style={[
                  styles.errorCard,
                  { borderColor: theme.danger, backgroundColor: theme.backgroundElement },
                ]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={20}
                  color={theme.danger}
                />
                <View style={styles.errorCopy}>
                  <AppText weight="semibold" style={{ color: theme.danger }}>
                    Check the opening stock details
                  </AppText>
                  <AppText size="small">{formError}</AppText>
                </View>
              </Card>
            ) : null}
            <Button
              label="Record opening stock"
              loading={mutation.isPending}
              disabled={mutation.isPending || noLocations}
              onPress={() => void saveOpeningStock()}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ChickenBatchCard({
  batch,
  index,
  products,
  blocks,
  currency,
  setupDate,
  onInputFocus,
  onChange,
  onRemove,
}: {
  batch: ChickenDraft;
  index: number;
  products: Product[];
  blocks: { id: string; name: string; current_chickens?: number }[];
  currency: string;
  setupDate: string;
  onInputFocus: (target: number) => void;
  onChange: (update: Partial<ChickenDraft>) => void;
  onRemove?: () => void;
}) {
  const { theme } = useTheme();
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const totalBirds = Object.values(batch.quantities).reduce(
    (total, quantity) => total + (Number(quantity) || 0),
    0,
  );
  const estimatedHatchDate = calculateHatchDate(
    batch.age,
    batch.ageUnit,
    setupDate,
  );
  return (
    <Card style={styles.batchCard}>
      <View style={styles.cardHeading}>
        <View style={styles.batchHeadingCopy}>
          <View
            style={[
              styles.batchIcon,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <MaterialCommunityIcons
              name="bird"
              size={20}
              color={theme.primary}
            />
          </View>
          <View style={styles.grow}>
            <AppText weight="semibold">Batch {index + 1}</AppText>
            <AppText size="small" tone="secondary">
              {totalBirds.toLocaleString()} {totalBirds === 1 ? "bird" : "birds"} assigned
            </AppText>
          </View>
        </View>
        {onRemove ? (
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`Remove chicken batch ${index + 1}`}
            style={[
              styles.removeBatch,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Ionicons name="trash-outline" size={18} color={theme.danger} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.fieldBlock}>
        <AppText size="small" weight="semibold">
          Inventory product
        </AppText>
        <View style={styles.productChoiceRow}>
          {products.map((product) => {
            const selected = batch.productId === product.id;
            return (
              <Pressable
                key={product.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => onChange({ productId: product.id })}
                style={[
                  styles.chickenProductChoice,
                  {
                    borderColor: selected ? theme.primary : theme.border,
                    backgroundColor: selected
                      ? theme.backgroundSelected
                      : theme.background,
                  },
                ]}
              >
                <AppText
                  size="small"
                  weight={selected ? "semibold" : "regular"}
                  numberOfLines={1}
                >
                  {product.name}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.fieldBlock}>
        <AppText size="small" weight="semibold">
          Batch name
        </AppText>
        <TextInput
          value={batch.name}
          onChangeText={(name) => onChange({ name })}
          placeholder="e.g. Existing layers"
          accessibilityLabel="Chicken batch name"
          onFocus={(event) => onInputFocus(event.nativeEvent.target)}
          style={[
            styles.input,
            {
              backgroundColor: theme.background,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          placeholderTextColor={theme.textSecondary}
        />
      </View>
      <View style={styles.fieldBlock}>
        <AppText size="small" weight="semibold">
          Chicken type
        </AppText>
        <View style={styles.typeGrid}>
          {chickenTypes.map((type) => (
            <TypeChoiceCard
              key={type.value}
              label={type.label}
              selected={batch.chickenType === type.value}
              onPress={() => onChange({ chickenType: type.value })}
            />
          ))}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showOptionalDetails }}
        onPress={() => setShowOptionalDetails((expanded) => !expanded)}
        style={[styles.optionalToggle, { borderTopColor: theme.border }]}
      >
        <AppText size="small" weight="semibold" tone="secondary">
          Optional details
        </AppText>
        <Ionicons
          name={showOptionalDetails ? "chevron-up" : "chevron-down"}
          size={17}
          color={theme.textSecondary}
        />
      </Pressable>
      {showOptionalDetails ? (
        <View style={styles.optionalFields}>
          <View style={styles.fieldBlock}>
            <AppText size="small" weight="semibold">
              Breed
            </AppText>
            <TextInput
              value={batch.breed}
              onChangeText={(breed) => onChange({ breed })}
              placeholder="Optional"
              accessibilityLabel="Breed, optional"
              onFocus={(event) => onInputFocus(event.nativeEvent.target)}
              style={[
                styles.input,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              placeholderTextColor={theme.textSecondary}
            />
          </View>
          <View style={styles.fieldBlock}>
            <AppText size="small" weight="semibold">
              Age (optional)
            </AppText>
            <AppText size="small" tone="secondary">
              Age on the stock date estimates the hatch date.
            </AppText>
            <TextInput
              value={batch.age}
              onChangeText={(age) => onChange({ age })}
              placeholder="Enter age"
              keyboardType="number-pad"
              accessibilityLabel="Approximate current chicken age"
              onFocus={(event) => onInputFocus(event.nativeEvent.target)}
              style={[
                styles.input,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              placeholderTextColor={theme.textSecondary}
            />
            <View style={styles.chipWrap}>
              {ageUnits.map((unit) => (
                <ChoiceChip
                  key={unit.value}
                  label={unit.label}
                  selected={batch.ageUnit === unit.value}
                  onPress={() => onChange({ ageUnit: unit.value })}
                />
              ))}
            </View>
            {estimatedHatchDate ? (
              <View
                style={[
                  styles.estimatedHatchDate,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons
                  name="calendar-outline"
                  size={17}
                  color={theme.primary}
                />
                <View style={styles.grow}>
                  <AppText size="small" tone="secondary">
                    Estimated hatch date
                  </AppText>
                  <AppText size="small" weight="semibold">
                    {formatDisplayDate(estimatedHatchDate)}
                  </AppText>
                </View>
              </View>
            ) : null}
          </View>
          <View style={styles.fieldBlock}>
            <AppText size="small" weight="semibold">
              Cost per bird ({currency}, optional)
            </AppText>
            <TextInput
              value={batch.unitCost}
              onChangeText={(unitCost) => onChange({ unitCost })}
              placeholder="Leave blank if unknown"
              keyboardType="decimal-pad"
              accessibilityLabel={`Acquisition cost per bird in ${currency}, optional`}
              onFocus={(event) => onInputFocus(event.nativeEvent.target)}
              style={[
                styles.input,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              placeholderTextColor={theme.textSecondary}
            />
          </View>
        </View>
      ) : null}
      <View style={styles.allocationSection}>
        <View style={styles.allocationHeading}>
          <View style={styles.grow}>
            <AppText size="small" weight="semibold">Assign birds to housing</AppText>
            <AppText size="small" tone="secondary">
              Enter the count for each block.
            </AppText>
          </View>
          <View
            style={[
              styles.totalBadge,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <AppText
              size="small"
              weight="semibold"
              style={{ color: theme.primary }}
            >
              {totalBirds.toLocaleString()}
            </AppText>
          </View>
        </View>
        {blocks.map((block) => (
          <View
            key={block.id}
            style={[styles.allocationRow, { borderTopColor: theme.border }]}
          >
            <View style={styles.grow}>
              <AppText size="small" weight="semibold">
                {block.name}
              </AppText>
              <AppText size="small" tone="secondary">
                Currently housed: {block.current_chickens ?? 0}
              </AppText>
            </View>
            <TextInput
              value={batch.quantities[block.id] ?? ""}
              onChangeText={(quantity) =>
                onChange({
                  quantities: { ...batch.quantities, [block.id]: quantity },
                })
              }
              placeholder="0"
              keyboardType="number-pad"
              accessibilityLabel={`Birds assigned to ${block.name}`}
              onFocus={(event) => onInputFocus(event.nativeEvent.target)}
              style={[
                styles.quantityInput,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              placeholderTextColor={theme.textSecondary}
            />
          </View>
        ))}
      </View>
    </Card>
  );
}

function EggStockCard({
  row,
  index,
  products,
  units,
  currency,
  onInputFocus,
  onChange,
  onRemove,
}: {
  row: EggDraft;
  index: number;
  products: {
    id: string;
    name: string;
    units: {
      id: string;
      name: string;
      abbreviation: string;
      conversion_factor: number | string;
      is_base_unit: boolean;
    }[];
  }[];
  units: {
    id: string;
    name: string;
    abbreviation: string;
    conversion_factor: number | string;
    is_base_unit: boolean;
  }[];
  currency: string;
  onInputFocus: (target: number) => void;
  onChange: (update: Partial<EggDraft>) => void;
  onRemove?: () => void;
}) {
  const { theme } = useTheme();
  const selectedProduct = products.find(
    (product) => product.id === row.productId,
  );
  const baseUnit = units.find((unit) => unit.is_base_unit);
  const totalInBaseUnits = units.reduce(
    (total, unit) =>
      total +
      (Number(row.quantities[unit.id]) || 0) *
        Number(unit.conversion_factor),
    0,
  );
  return (
    <Card style={styles.formCard}>
      <View style={styles.cardHeading}>
        <View style={styles.eggHeadingCopy}>
          <View
            style={[
              styles.eggIcon,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Ionicons name="egg-outline" size={19} color={theme.primary} />
          </View>
          <View style={styles.grow}>
            <AppText weight="semibold">Egg stock {index + 1}</AppText>
            <AppText size="small" tone="secondary">
              {selectedProduct?.name ?? "Choose a product"}
            </AppText>
          </View>
        </View>
        {onRemove ? (
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`Remove egg stock ${index + 1}`}
            style={[
              styles.removeBatch,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Ionicons name="trash-outline" size={19} color={theme.danger} />
          </Pressable>
        ) : null}
      </View>
      <AppText size="small" weight="semibold">Egg product</AppText>
      <View style={styles.productChoices}>
        {products.map((product) => (
          <Pressable
            key={product.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: row.productId === product.id }}
            onPress={() =>
              onChange({
                productId: product.id,
                quantities: {},
                unitCosts: {},
              })
            }
            style={[
              styles.eggProductChoice,
              {
                backgroundColor:
                  row.productId === product.id
                    ? theme.backgroundSelected
                    : theme.background,
                borderColor:
                  row.productId === product.id ? theme.primary : theme.border,
              },
            ]}
          >
            <View
              style={[
                styles.productChoiceIcon,
                {
                  backgroundColor:
                    row.productId === product.id
                      ? theme.background
                      : theme.backgroundSelected,
                },
              ]}
            >
              <Ionicons
                name="egg-outline"
                size={17}
                color={
                  row.productId === product.id
                    ? theme.primary
                    : theme.textSecondary
                }
              />
            </View>
            <AppText
              size="small"
              weight={row.productId === product.id ? "semibold" : "regular"}
              style={styles.grow}
            >
              {product.name}
            </AppText>
            <Ionicons
              name={
                row.productId === product.id
                  ? "checkmark-circle"
                  : "ellipse-outline"
              }
              size={19}
              color={
                row.productId === product.id
                  ? theme.primary
                  : theme.textSecondary
              }
            />
          </Pressable>
        ))}
      </View>
      {selectedProduct ? (
        units.length ? (
          <View style={styles.eggUnitList}>
            <View style={styles.quantityHeading}>
              <AppText size="small" weight="semibold">
                Opening quantities
              </AppText>
              <AppText size="small" tone="secondary">
                Enter one or more units
              </AppText>
            </View>
            {units.map((unit) => (
              <View
                key={unit.id}
                style={[
                  styles.eggUnitCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View style={styles.eggUnitCopy}>
                  <AppText weight="semibold">{unit.name}</AppText>
                  <AppText size="small" tone="secondary">
                    {unit.is_base_unit
                      ? "Main unit"
                      : `1 ${unit.abbreviation} = ${Number(unit.conversion_factor).toLocaleString()} ${baseUnit?.abbreviation ?? "main units"}`}
                  </AppText>
                </View>
                <View style={styles.eggQuantityField}>
                  <AppText size="small" tone="secondary">
                    Quantity ({unit.abbreviation})
                  </AppText>
                  <TextInput
                    value={row.quantities[unit.id] ?? ""}
                    onChangeText={(quantity) =>
                      onChange({
                        quantities: {
                          ...row.quantities,
                          [unit.id]: quantity,
                        },
                      })
                    }
                    placeholder="0"
                    keyboardType="decimal-pad"
                    accessibilityLabel={`${unit.name} opening quantity`}
                    onFocus={(event) => onInputFocus(event.nativeEvent.target)}
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                    ]}
                    placeholderTextColor={theme.textSecondary}
                  />
                </View>
              </View>
            ))}
            {baseUnit && totalInBaseUnits > 0 ? (
              <View
                style={[
                  styles.eggTotal,
                  {
                    backgroundColor: theme.backgroundSelected,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Ionicons
                  name="calculator-outline"
                  size={17}
                  color={theme.primary}
                />
                <AppText size="small" weight="semibold">
                  Total in {baseUnit.abbreviation}:{" "}
                  {totalInBaseUnits.toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}{" "}
                  {baseUnit.abbreviation} in main units
                </AppText>
              </View>
            ) : null}
          </View>
        ) : (
          <View
            style={[
              styles.noEggUnits,
              {
                borderColor: theme.danger,
                backgroundColor: theme.backgroundSelected,
              },
            ]}
          >
            <Ionicons
              name="alert-circle-outline"
              size={18}
              color={theme.danger}
            />
            <AppText size="small" style={styles.grow}>
              This product has no measurement units configured. Edit the
              product first, then return to opening stock.
            </AppText>
          </View>
        )
      ) : (
        <AppText size="small" tone="secondary">
          Select an egg product to enter its opening quantities.
        </AppText>
      )}
      {selectedProduct && units.length ? (
        <View style={styles.eggUnitList}>
          <AppText size="small" weight="semibold">
            Optional cost for each entered unit ({currency})
          </AppText>
          {units
            .filter((unit) => row.quantities[unit.id]?.trim())
            .map((unit) => (
              <View key={unit.id} style={styles.fieldBlock}>
                <AppText size="small" tone="secondary">
                  Cost per {unit.name}
                </AppText>
                <TextInput
                  value={row.unitCosts[unit.id] ?? ""}
                  onChangeText={(unitCost) =>
                    onChange({
                      unitCosts: {
                        ...row.unitCosts,
                        [unit.id]: unitCost,
                      },
                    })
                  }
                  placeholder="Leave blank if not known"
                  keyboardType="decimal-pad"
                  accessibilityLabel={`Optional cost per ${unit.name} in ${currency}`}
                  onFocus={(event) => onInputFocus(event.nativeEvent.target)}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  placeholderTextColor={theme.textSecondary}
                />
              </View>
            ))}
        </View>
      ) : null}
    </Card>
  );
}

function TypeChoiceCard({
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
        styles.typeCard,
        {
          backgroundColor: selected ? `${theme.primary}18` : theme.background,
          borderColor: selected ? theme.primary : theme.border,
          shadowColor: selected ? theme.primary : "transparent",
        },
      ]}
    >
      <AppText
        size="small"
        weight={selected ? "semibold" : "regular"}
        style={{ color: selected ? theme.primary : theme.text }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function ChoiceChip({
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
        styles.chip,
        {
          backgroundColor: selected ? `${theme.primary}18` : theme.background,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
    >
      <AppText size="small" weight={selected ? "semibold" : "regular"}>
        {label}
      </AppText>
    </Pressable>
  );
}

function newChickenDraft(
  name = `Chicken Batch - ${localDateString()}`,
  productId = "",
): ChickenDraft {
  return {
    key: `${Date.now()}-${Math.random()}`,
    name,
    productId,
    chickenType: "layers",
    breed: "",
    age: "",
    ageUnit: "weeks",
    unitCost: "",
    quantities: {},
  };
}

function newEggDraft(): EggDraft {
  return {
    key: `${Date.now()}-${Math.random()}`,
    productId: "",
    quantities: {},
    unitCosts: {},
  };
}

function isValidAge(value: string): boolean {
  return value.trim() === "" || /^\d{1,4}$/.test(value);
}

function calculateHatchDate(
  ageValue: string,
  ageUnit: AgeUnit,
  referenceDate: string,
): string | undefined {
  if (!ageValue.trim() || !isValidAge(ageValue)) return undefined;
  const parts = referenceDate.split("-").map(Number);
  if (parts.length !== 3 || !isValidDate(referenceDate)) return undefined;

  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  const age = Number(ageValue);
  if (ageUnit === "days") {
    date.setDate(date.getDate() - age);
  } else if (ageUnit === "weeks") {
    date.setDate(date.getDate() - age * 7);
  } else {
    const originalDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() - age);
    const lastDayOfTargetMonth = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0,
    ).getDate();
    date.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function isOptionalNonNegativeNumber(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
}

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: 18,
    gap: 16,
    paddingBottom: 44,
  },
  intro: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 5 },
  introIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  pageTitle: { fontSize: 22, lineHeight: 28 },
  grow: { flex: 1 },
  notice: { gap: 10 },
  dateCard: { gap: 12, padding: 15 },
  dateHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  dateIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  formList: { gap: 14 },
  addBatchOption: {
    borderStyle: "dotted",
    borderWidth: 1.5,
    borderRadius: 12,
  },
  batchCard: { gap: 13, padding: 16 },
  formCard: { gap: 12 },
  emptyEggCard: { gap: 14, padding: 18 },
  emptyEggIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyEggCopy: { gap: 5 },
  cardHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  batchHeadingCopy: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  eggHeadingCopy: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  eggIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  batchIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBatch: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldBlock: { gap: 6 },
  productChoiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chickenProductChoice: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 9,
  },
  optionalToggle: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 1,
    paddingTop: 8,
  },
  optionalFields: { gap: 14, paddingBottom: 2 },
  estimatedHatchDate: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  clearDate: { alignSelf: "flex-start", minHeight: 34, justifyContent: "center" },
  allocationSection: { gap: 10, paddingTop: 3 },
  eggUnitList: { gap: 10 },
  quantityHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  productChoices: { gap: 8 },
  eggProductChoice: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  productChoiceIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  eggUnitCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 11,
    padding: 10,
  },
  eggUnitCopy: { flex: 1, gap: 3 },
  eggQuantityField: { width: 128, gap: 5 },
  eggTotal: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 11,
  },
  noEggUnits: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 9,
    padding: 11,
  },
  allocationHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 4,
  },
  totalBadge: {
    minWidth: 40,
    height: 34,
    paddingHorizontal: 9,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityInput: {
    width: 76,
    height: 42,
    borderWidth: 1,
    borderRadius: 9,
    textAlign: "center",
    paddingHorizontal: 6,
  },
  allocationRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  typeCard: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 108,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  chip: {
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
  },
  errorCopy: { flex: 1, gap: 4 },
});
