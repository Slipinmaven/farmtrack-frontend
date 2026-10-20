import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useChickenSaleOptions } from "@/features/chickens/hooks";
import { useEggCollectionOptions } from "@/features/eggs/hooks";
import {
  useCreateInventoryOpeningSetup,
  useInventoryOpeningSetupStatus,
  useProducts,
} from "@/features/management/hooks";
import type { InventoryOpeningSetupInput } from "@/features/management/api";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type Species = "chickens" | "eggs";
type ChickenType = "layers" | "broiler" | "kienyeji" | "breeder" | "other";
type ChickenDraft = {
  key: string;
  name: string;
  chickenType: ChickenType;
  breed: string;
  hatchDate: string;
  unitCost: string;
  quantities: Record<string, string>;
};
type EggDraft = {
  key: string;
  productId: string;
  blockId: string;
  unitId: string;
  quantity: string;
  unitCost: string;
};

const chickenTypes: { value: ChickenType; label: string }[] = [
  { value: "layers", label: "Layers" },
  { value: "broiler", label: "Broilers" },
  { value: "kienyeji", label: "Kienyeji" },
  { value: "breeder", label: "Breeders" },
  { value: "other", label: "Other" },
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
  const eggBlocks = (eggOptions.data?.blocks ?? []).filter(
    (block) => block.is_active,
  );
  const activeBlockCount =
    species === "chickens" ? chickenBlocks.length : eggBlocks.length;
  const eggProducts = (eggOptions.data?.products ?? []).filter(
    (product) =>
      productsQuery.data?.some(
        (candidate) =>
          candidate.id === product.id &&
          candidate.is_active &&
          candidate.product_type === "eggs",
      ),
  );
  const eligible = status.data?.[species].eligible;
  const [setupDate, setSetupDate] = useState(localDateString());
  const [chickenBatches, setChickenBatches] = useState<ChickenDraft[]>([
    newChickenDraft(),
  ]);
  const [eggStock, setEggStock] = useState<EggDraft[]>([newEggDraft()]);
  const loading =
    status.isLoading ||
    chickenOptions.isLoading ||
    eggOptions.isLoading ||
    productsQuery.isLoading;

  function updateChicken(key: string, update: Partial<ChickenDraft>) {
    setChickenBatches((current) =>
      current.map((batch) =>
        batch.key === key ? { ...batch, ...update } : batch,
      ),
    );
  }

  function updateEgg(key: string, update: Partial<EggDraft>) {
    setEggStock((current) =>
      current.map((row) => (row.key === key ? { ...row, ...update } : row)),
    );
  }

  async function saveOpeningStock() {
    if (!farmId || !userId) {
      Alert.alert("Farm unavailable", "Select a farm before recording opening stock.");
      return;
    }
    if (!isValidDate(setupDate)) {
      Alert.alert("Check the date", "Enter the date as YYYY-MM-DD.");
      return;
    }

    let payload: InventoryOpeningSetupInput;
    if (species === "chickens") {
      if (
        chickenBatches.some(
          (batch) =>
            batch.hatchDate &&
            (!isValidDate(batch.hatchDate) || batch.hatchDate > setupDate),
        )
      ) {
        Alert.alert(
          "Check the hatch date",
          "Enter a valid hatch date on or before the opening stock date.",
        );
        return;
      }
      const batches = chickenBatches.map((batch) => ({
        name: batch.name.trim(),
        chicken_type: batch.chickenType,
        breed: batch.breed.trim() || undefined,
        hatch_date: batch.hatchDate.trim() || undefined,
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
              !isOptionalNonNegativeNumber(batch.unit_cost) ||
              batch.allocations.length === 0 ||
            batch.allocations.some(
              (allocation) =>
                !Number.isInteger(allocation.quantity) ||
                allocation.quantity <= 0,
            ),
        )
      ) {
        Alert.alert(
          "Complete each batch",
          "Give every batch a name, assign its birds to at least one housing block, and enter a valid non-negative cost if you provide one.",
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
        block_id: row.blockId,
        unit_id: row.unitId,
        quantity: row.quantity.trim(),
        unit_cost: row.unitCost.trim() || undefined,
      }));
      if (
        rows.some(
          (row) =>
            !row.product_id ||
            !row.block_id ||
            !row.unit_id ||
            !row.quantity ||
            !Number.isFinite(Number(row.quantity)) ||
            Number(row.quantity) <= 0 ||
            !isOptionalNonNegativeNumber(row.unit_cost),
        )
      ) {
        Alert.alert(
          "Complete each egg stock row",
          "Choose an egg product, housing block and unit, enter a positive quantity, and enter a valid non-negative cost if you provide one.",
        );
        return;
      }
      payload = {
        species,
        setup_date: setupDate,
        chicken_batches: [],
        egg_stock: rows,
      };
    }

    try {
      await mutation.mutateAsync(payload);
      Alert.alert(
        "Opening stock recorded",
        "Your initial stock is now part of the farm records. This did not create a purchase or payment.",
        [{ text: "Done", onPress: () => router.replace(returnHref) }],
      );
    } catch (error) {
      Alert.alert("Could not record opening stock", normalizeApiError(error).message);
    }
  }

  const optionError =
    status.error ??
    (species === "chickens" ? chickenOptions.error : eggOptions.error) ??
    (species === "eggs" ? productsQuery.error : undefined);
  const optionsReady =
    species === "chickens"
      ? chickenOptions.isSuccess
      : eggOptions.isSuccess && productsQuery.isSuccess;
  const noLocations = optionsReady && activeBlockCount === 0;
  const noEggProducts = species === "eggs" && optionsReady && eggProducts.length === 0;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <FarmPageHeader
          title="Opening stock"
          showBack
          fallbackHref={returnHref}
        />
        <View style={styles.intro}>
          <View style={[styles.introIcon, { backgroundColor: `${theme.primary}18` }]}>
            <Ionicons
              name={species === "chickens" ? "home-outline" : "egg-outline"}
              size={22}
              color={theme.primary}
            />
          </View>
          <View style={styles.grow}>
            <AppText size="heading" weight="semibold">
              Set initial {species === "chickens" ? "flock" : "egg"} stock
            </AppText>
            <AppText size="small" tone="secondary">
              One-time setup for existing stock not yet recorded in FarmTrack.
              It creates no purchase or payment.
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
        ) : noLocations || noEggProducts ? (
          <Card style={styles.notice}>
            <Ionicons name="alert-circle-outline" size={22} color="#B9852F" />
            <AppText weight="semibold">Complete setup prerequisites</AppText>
            <AppText size="small" tone="secondary">
              {noLocations
                ? "Add an active housing block before assigning opening stock."
                : "Create an active egg product with configured units before entering opening eggs."}
            </AppText>
            <Button
              label="Return to inventory"
              variant="secondary"
              onPress={() => router.replace(returnHref)}
            />
          </Card>
        ) : (
          <>
            <Card style={styles.infoCard}>
              <Ionicons name="shield-checkmark-outline" size={19} color="#548D73" />
              <AppText size="small" tone="secondary" style={styles.grow}>
                This setup is available only before this stock type has existing records.
                Enter a verified cost per unit when known; leaving it blank keeps
                profitability incomplete rather than assigning an estimate.
              </AppText>
            </Card>
            <Card style={styles.formCard}>
              <AppText weight="semibold">Stock as of</AppText>
              <TextInput
                value={setupDate}
                onChangeText={setSetupDate}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
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
            </Card>
            {species === "chickens" ? (
              <View style={styles.formList}>
                {chickenBatches.map((batch, index) => (
                  <ChickenBatchCard
                    key={batch.key}
                    batch={batch}
                    index={index}
                    blocks={chickenBlocks}
                    currency={farm.selectedFarm?.settings?.currency ?? "KES"}
                    onChange={(update) => updateChicken(batch.key, update)}
                    onRemove={
                      chickenBatches.length > 1
                        ? () =>
                            setChickenBatches((current) =>
                              current.filter((item) => item.key !== batch.key),
                            )
                        : undefined
                    }
                  />
                ))}
                <Button
                  label="Add another batch"
                  variant="secondary"
                  onPress={() => setChickenBatches((current) => [...current, newChickenDraft()])}
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
                      blocks={eggBlocks}
                      units={units}
                      currency={farm.selectedFarm?.settings?.currency ?? "KES"}
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
                  label="Add another egg stock row"
                  variant="secondary"
                  onPress={() => setEggStock((current) => [...current, newEggDraft()])}
                />
              </View>
            )}
            {mutation.isError ? (
              <Card style={styles.errorCard}>
                <AppText size="small" style={{ color: theme.danger }}>
                  {normalizeApiError(mutation.error).message}
                </AppText>
              </Card>
            ) : null}
            <Button
              label="Record opening stock"
              loading={mutation.isPending}
              disabled={mutation.isPending || noLocations || noEggProducts}
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
  blocks,
  currency,
  onChange,
  onRemove,
}: {
  batch: ChickenDraft;
  index: number;
  blocks: { id: string; name: string; current_chickens?: number }[];
  currency: string;
  onChange: (update: Partial<ChickenDraft>) => void;
  onRemove?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Card style={styles.formCard}>
      <View style={styles.cardHeading}>
        <AppText weight="semibold">Batch {index + 1}</AppText>
        {onRemove ? (
          <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel="Remove batch">
            <Ionicons name="trash-outline" size={19} color={theme.danger} />
          </Pressable>
        ) : null}
      </View>
      <TextInput
        value={batch.name}
        onChangeText={(name) => onChange({ name })}
        placeholder="Batch name"
        style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
        placeholderTextColor={theme.textSecondary}
      />
      <AppText size="small" tone="secondary">Chicken type</AppText>
      <View style={styles.chipWrap}>
        {chickenTypes.map((type) => (
          <ChoiceChip
            key={type.value}
            label={type.label}
            selected={batch.chickenType === type.value}
            onPress={() => onChange({ chickenType: type.value })}
          />
        ))}
      </View>
      <TextInput
        value={batch.breed}
        onChangeText={(breed) => onChange({ breed })}
        placeholder="Breed (optional)"
        style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
        placeholderTextColor={theme.textSecondary}
      />
      <TextInput
      value={batch.hatchDate}
      onChangeText={(hatchDate) => onChange({ hatchDate })}
      placeholder="Hatch date (optional, YYYY-MM-DD)"
      keyboardType="numbers-and-punctuation"
      style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
      placeholderTextColor={theme.textSecondary}
      />
      <AppText size="small" tone="secondary">
        Acquisition cost per bird ({currency}, optional)
      </AppText>
      <TextInput
        value={batch.unitCost}
        onChangeText={(unitCost) => onChange({ unitCost })}
        placeholder="Leave blank if not known"
        keyboardType="decimal-pad"
        style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
        placeholderTextColor={theme.textSecondary}
      />
      <AppText size="small" weight="semibold">Allocate birds to blocks</AppText>
      {blocks.map((block) => (
        <View key={block.id} style={styles.allocationRow}>
          <View style={styles.grow}>
            <AppText size="small" weight="semibold">{block.name}</AppText>
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
            style={[
              styles.quantityInput,
              { backgroundColor: theme.background, borderColor: theme.border, color: theme.text },
            ]}
            placeholderTextColor={theme.textSecondary}
          />
        </View>
      ))}
    </Card>
  );
}

function EggStockCard({
  row,
  index,
  products,
  blocks,
  units,
  currency,
  onChange,
  onRemove,
}: {
  row: EggDraft;
  index: number;
  products: {
    id: string;
    name: string;
    units: { id: string; name: string; abbreviation: string }[];
  }[];
  blocks: { id: string; name: string; is_active: boolean }[];
  units: { id: string; name: string; abbreviation: string }[];
  currency: string;
  onChange: (update: Partial<EggDraft>) => void;
  onRemove?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Card style={styles.formCard}>
      <View style={styles.cardHeading}>
        <AppText weight="semibold">Egg stock {index + 1}</AppText>
        {onRemove ? (
          <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel="Remove egg row">
            <Ionicons name="trash-outline" size={19} color={theme.danger} />
          </Pressable>
        ) : null}
      </View>
      <AppText size="small" tone="secondary">Egg product</AppText>
      <View style={styles.chipWrap}>
        {products.map((product) => (
          <ChoiceChip
            key={product.id}
            label={product.name}
            selected={row.productId === product.id}
            onPress={() =>
              onChange({
                productId: product.id,
                unitId:
                  product.units.find((unit) => unit.id === row.unitId)?.id ??
                  product.units[0]?.id ??
                  "",
              })
            }
          />
        ))}
      </View>
      <AppText size="small" tone="secondary">Housing block</AppText>
      <View style={styles.chipWrap}>
        {blocks.map((block) => (
          <ChoiceChip
            key={block.id}
            label={block.name}
            selected={row.blockId === block.id}
            onPress={() => onChange({ blockId: block.id })}
          />
        ))}
      </View>
      <AppText size="small" tone="secondary">Unit</AppText>
      <View style={styles.chipWrap}>
        {units.map((unit) => (
          <ChoiceChip
            key={unit.id}
            label={unit.abbreviation || unit.name}
            selected={row.unitId === unit.id}
            onPress={() => onChange({ unitId: unit.id })}
          />
        ))}
      </View>
      <TextInput
        value={row.quantity}
        onChangeText={(quantity) => onChange({ quantity })}
        placeholder="Quantity"
        keyboardType="decimal-pad"
        style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
        placeholderTextColor={theme.textSecondary}
      />
      <AppText size="small" tone="secondary">
        Acquisition/production cost per {units.find((unit) => unit.id === row.unitId)?.abbreviation || "selected unit"} ({currency}, optional)
      </AppText>
      <TextInput
        value={row.unitCost}
        onChangeText={(unitCost) => onChange({ unitCost })}
        placeholder="Leave blank if not known"
        keyboardType="decimal-pad"
        style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
        placeholderTextColor={theme.textSecondary}
      />
    </Card>
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

function newChickenDraft(): ChickenDraft {
  return {
    key: `${Date.now()}-${Math.random()}`,
    name: "",
    chickenType: "layers",
    breed: "",
    hatchDate: "",
    unitCost: "",
    quantities: {},
  };
}

function newEggDraft(): EggDraft {
  return {
    key: `${Date.now()}-${Math.random()}`,
    productId: "",
    blockId: "",
    unitId: "",
    quantity: "",
    unitCost: "",
  };
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
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  intro: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 3 },
  introIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1 },
  infoCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#548D7310" },
  notice: { gap: 10 },
  formList: { gap: 12 },
  formCard: { gap: 12 },
  cardHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 15 },
  quantityInput: { width: 76, height: 42, borderWidth: 1, borderRadius: 8, textAlign: "center", paddingHorizontal: 6 },
  allocationRow: { flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#00000018", paddingTop: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { minHeight: 36, borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  errorCard: { borderColor: "#B65050" },
});
