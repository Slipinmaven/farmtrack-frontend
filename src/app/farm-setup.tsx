import { zodResolver } from "@hookform/resolvers/zod";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Controller, useForm } from "react-hook-form";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";

import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { useBlocks } from "@/features/blocks/hooks";
import type { ProductType } from "@/features/management/api";
import { useDeleteProduct, useProducts } from "@/features/management/hooks";
import {
  useCompleteFarmSetup,
  useCreateFarm,
} from "@/features/farms/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const schema = z.object({
  name: z.string().trim().min(1, "Enter a farm name.").max(150),
});
type FormValues = z.infer<typeof schema>;

const steps = [
  { title: "Chicken product", kind: "required" },
  { title: "Egg products", kind: "optional" },
  { title: "Housing", kind: "required" },
  { title: "Chicken stock", kind: "optional" },
  { title: "Egg stock", kind: "optional" },
  { title: "Supplies", kind: "optional" },
  { title: "Review", kind: "finish" },
] as const;

const supplies: { type: ProductType; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: "feed", title: "Feed", icon: "leaf-outline" },
  { type: "medication", title: "Medication", icon: "medkit-outline" },
  { type: "equipment", title: "Equipment", icon: "construct-outline" },
  { type: "other", title: "Other supplies", icon: "cube-outline" },
];

export default function FarmSetupScreen() {
  const params = useLocalSearchParams<{ additional?: string }>();
  const isAdditionalFarm = params.additional === "true";
  return (
    <SessionGate
      allowEmptyFarm={!isAdditionalFarm}
      allowIncompleteSetup
    >
      <FarmSetupContent isAdditionalFarm={isAdditionalFarm} />
    </SessionGate>
  );
}

function FarmSetupContent({
  isAdditionalFarm,
}: {
  isAdditionalFarm: boolean;
}) {
  const params = useLocalSearchParams<{ step?: string }>();
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const [setupError, setSetupError] = useState<string | null>(null);
  const farmId = farm.selectedFarm?.id;
  const productsQuery = useProducts(user?.id, farmId);
  const blocksQuery = useBlocks(user?.id, farmId);
  const createFarm = useCreateFarm(user?.id ?? "");
  const completeSetup = useCompleteFarmSetup(user?.id ?? "", farmId ?? "");
  const deleteProduct = useDeleteProduct(user?.id ?? "", farmId ?? "");
  const products = productsQuery.data ?? [];
  const activeChickenProducts = products.filter(
    (product) => product.is_active && product.product_type === "chickens",
  );
  const activeEggProducts = products.filter(
    (product) => product.is_active && product.product_type === "eggs",
  );
  const activeBlocks = (blocksQuery.data ?? []).filter(
    (block) => block.is_active,
  );
  const activeSupplies = products.filter(
    (product) =>
      product.is_active &&
      !["chickens", "eggs"].includes(product.product_type),
  );
  const chickenReady = activeChickenProducts.length > 0;
  const housingReady = activeBlocks.length > 0;
  const setupReady = chickenReady && housingReady;
  const requiredRemaining = Number(!chickenReady) + Number(!housingReady);
  const parsedStep = Number(params.step ?? 0);
  const step = Number.isInteger(parsedStep)
    ? Math.max(0, Math.min(steps.length - 1, parsedStep))
    : 0;
  const {
    background,
    backgroundElement,
    backgroundSelected,
    border,
    danger,
    primary,
    secondary,
    textSecondary,
  } = theme;

  if (farm.selectedFarm?.setup_completed_at && !isAdditionalFarm) {
    return <Redirect href="/(tabs)" />;
  }

  async function finishSetup() {
    try {
      await completeSetup.mutateAsync();
      router.replace("/(tabs)");
    } catch (error) {
      setSetupError(normalizeApiError(error).message);
    }
  }

  function goToStep(nextStep: number) {
    setSetupError(null);
    router.replace({
      pathname: "/farm-setup",
      params: { step: String(nextStep) },
    });
  }

  if (!farm.selectedFarm || isAdditionalFarm) {
    return (
      <CreateFarmForm
        isSubmitting={createFarm.isPending}
        onCreate={async (name) => {
          const created = await createFarm.mutateAsync({ name });
          await farm.selectFarm(created.id);
          await farm.refreshFarms();
          router.replace({ pathname: "/farm-setup", params: { step: "0" } });
        }}
      />
    );
  }

  function openProduct(type: ProductType, name?: string) {
    router.push({
      pathname: "/products/new",
      params: {
        setupFlow: "true",
        setupStep: String(step),
        setupType: type,
        ...(name ? { setupName: name } : {}),
      },
    });
  }

  function openOpeningStock(species: "chickens" | "eggs") {
    router.push({
      pathname: "/inventory/opening-stock",
      params: {
        species,
        fromSetup: "true",
        setupStep: String(step),
      },
    });
  }

  async function removeEggProduct(productId: string, productName: string) {
    const confirmed = await dialog.confirmDialog({
      title: "Remove egg product?",
      message: `“${productName}” will be permanently removed.`,
      confirmLabel: "Remove product",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteProduct.mutateAsync(productId);
    } catch (error) {
      await dialog.showDialog({
        title: "Couldn’t remove product",
        message: normalizeApiError(error).message,
        tone: "error",
      });
    }
  }

  const error = productsQuery.error ?? blocksQuery.error;
  const isLoading = productsQuery.isLoading || blocksQuery.isLoading;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: background }]}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.farmHeading}>
            <AppText size="small" weight="semibold" style={{ color: primary }}>
              FARMTRACK  /  FIRST-TIME SETUP
            </AppText>
            <AppText size="heading" weight="semibold" style={styles.farmName}>
              {farm.selectedFarm.name}
            </AppText>
          </View>

        <View style={styles.progressArea}>
          <View style={styles.progressMeta}>
            <AppText size="small" weight="semibold" tone="secondary">
              STEP {step + 1} OF {steps.length}
            </AppText>
            <AppText size="small" tone="secondary">
              {requiredRemaining
                ? `${requiredRemaining} required ${requiredRemaining === 1 ? "item" : "items"} left`
                : "Required items complete"}
            </AppText>
          </View>
          <View
            style={[styles.progressTrack, { backgroundColor: backgroundSelected }]}
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 1,
              max: steps.length,
              now: step + 1,
              text: `Step ${step + 1} of ${steps.length}`,
            }}
          >
            <View
              style={[
                styles.progressFill,
                {
                  width: `${((step + 1) / steps.length) * 100}%`,
                  backgroundColor: primary,
                },
              ]}
            />
          </View>
          <View style={styles.essentials}>
            <AppText size="small" weight="semibold">
              To unlock your farm
            </AppText>
            <View style={styles.essentialItems}>
              <EssentialStatus label="Chicken product" complete={chickenReady} />
              <View style={[styles.statusDivider, { backgroundColor: border }]} />
              <EssentialStatus label="Housing block" complete={housingReady} />
            </View>
          </View>
        </View>

        <View style={styles.stepContent}>
          <View style={styles.stepEyebrow}>
            <View
              style={[
                styles.stepMarker,
                {
                  backgroundColor:
                    steps[step].kind === "required" ? primary : secondary,
                },
              ]}
            />
            <AppText
              size="small"
              weight="semibold"
              style={{
                color: steps[step].kind === "required" ? primary : secondary,
              }}
            >
              {steps[step].kind === "required"
                ? "REQUIRED"
                : steps[step].kind === "finish"
                  ? "READY WHEN YOU ARE"
                  : "OPTIONAL"}
            </AppText>
          </View>
          <AppText size="title" weight="semibold" style={styles.stepTitle}>
            {stepTitle(step)}
          </AppText>
          <AppText size="body" tone="secondary" style={styles.stepDescription}>
            {stepDescription(step)}
          </AppText>

          {isLoading ? (
            <AppText size="small" tone="secondary">
              Loading your farm setup…
            </AppText>
          ) : error ? (
            <View style={[styles.errorPanel, { borderColor: border, backgroundColor: backgroundElement }]}>
              <AppText weight="semibold">Couldn’t load setup details</AppText>
              <AppText size="small" tone="secondary">
                {normalizeApiError(error).message}
              </AppText>
              <Pressable
                onPress={() => {
                  void productsQuery.refetch();
                  void blocksQuery.refetch();
                }}
                style={[styles.retryAction, { borderColor: border }]}
              >
                <AppText size="small" weight="semibold">Try again</AppText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.actions}>
              {step === 0 ? (
                chickenReady ? (
                  activeChickenProducts.map((product) => (
                    <SetupRow
                      key={product.id}
                      icon="checkmark-circle"
                      title={product.name}
                      detail="Active chicken product"
                      status="Added"
                      complete
                    />
                  ))
                ) : (
                  <SetupRow
                    icon="add-circle-outline"
                    title="Create chicken product"
                    detail="Set its name and counting units"
                    onPress={() => openProduct("chickens", "Chickens")}
                  />
                )
              ) : null}

              {step === 1 ? (
                <>
                  {activeEggProducts.map((product) => (
                    <View
                      key={product.id}
                      style={[styles.eggProduct, { borderBottomColor: border }]}
                    >
                      <SetupRow
                        icon="checkmark-circle"
                        title={product.name}
                        detail="Active egg product"
                        status="Added"
                        complete
                      />
                      <View style={styles.eggActions}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            router.push({
                              pathname: "/products/[productId]/edit",
                              params: {
                                productId: product.id,
                                fromSetup: "true",
                                setupStep: "1",
                              },
                            })
                          }
                          style={styles.eggAction}
                        >
                          <Ionicons name="create-outline" size={15} color={textSecondary} />
                          <AppText size="small" tone="secondary">Edit</AppText>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          disabled={deleteProduct.isPending}
                          onPress={() =>
                            void removeEggProduct(product.id, product.name)
                          }
                          style={styles.eggAction}
                        >
                          <Ionicons name="trash-outline" size={15} color={theme.danger} />
                          <AppText size="small" style={{ color: theme.danger }}>
                            Remove
                          </AppText>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                  {[
                    { name: "Kienyeji eggs", key: "kienyeji" },
                    { name: "Grade eggs", key: "grade" },
                  ]
                    .filter(
                      (option) =>
                        !activeEggProducts.some((product) =>
                          product.name.toLowerCase().includes(option.key),
                        ),
                    )
                    .map((option) => (
                      <SetupRow
                        key={option.key}
                        icon="egg-outline"
                        title={option.name}
                        detail="Optional · create a separate product"
                        onPress={() => openProduct("eggs", option.name)}
                      />
                    ))}
                  <AppText size="small" tone="secondary" style={styles.inlineNote}>
                    Egg products are optional. You can edit or remove them here,
                    or later from Products.
                  </AppText>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  {activeBlocks.map((block) => (
                    <SetupRow
                      key={block.id}
                      icon="checkmark-circle"
                      title={block.name}
                      detail={`Capacity ${block.capacity}`}
                      status="Added"
                      complete
                    />
                  ))}
                  <SetupRow
                    icon="home-outline"
                    title="Create housing block"
                    detail="Name the house and set its capacity"
                    onPress={() =>
                      router.push({
                        pathname: "/setup/block",
                        params: { step: "2" },
                      })
                    }
                  />
                </>
              ) : null}

              {step === 3 || step === 4 ? (
                <SetupRow
                  icon={step === 3 ? "paw-outline" : "egg-outline"}
                  title={`Record ${step === 3 ? "chicken" : "egg"} opening stock`}
                  detail="Enter the stock already on your farm"
                  onPress={() =>
                    openOpeningStock(step === 3 ? "chickens" : "eggs")
                  }
                />
              ) : null}

              {step === 4 && activeEggProducts.length === 0 ? (
                <AppText size="small" tone="secondary" style={styles.inlineNote}>
                  No egg products yet. You can add them later from Products.
                </AppText>
              ) : null}

              {step === 5 ? (
                <>
                  {activeSupplies.map((product) => (
                    <SetupRow
                      key={product.id}
                      icon="cube-outline"
                      title={product.name}
                      detail="Record an opening balance"
                      onPress={() =>
                        router.push({
                          pathname: "/products/[productId]/inventory",
                          params: {
                            productId: product.id,
                            fromSetup: "true",
                            setupStep: "5",
                          },
                        })
                      }
                    />
                  ))}
                  {supplies.map((item) => (
                    <SetupRow
                      key={item.type}
                      icon={item.icon}
                      title={`Add ${item.title.toLowerCase()}`}
                      detail="Create a product for this supply"
                      onPress={() => openProduct(item.type)}
                    />
                  ))}
                </>
              ) : null}

              {step === 6 ? (
                <>
                  <ReviewRow
                    label="Chicken product"
                    value={chickenReady ? `${activeChickenProducts.length} added` : "Required"}
                    complete={chickenReady}
                  />
                  <ReviewRow
                    label="Housing blocks"
                    value={housingReady ? `${activeBlocks.length} added` : "Required"}
                    complete={housingReady}
                  />
                  <ReviewRow
                    label="Egg products"
                    value={activeEggProducts.length ? `${activeEggProducts.length} added` : "Skipped"}
                    complete
                  />
                  <ReviewRow
                    label="Supplies"
                    value={activeSupplies.length ? `${activeSupplies.length} added` : "Skipped"}
                    complete
                  />
                  <AppText size="small" tone="secondary" style={styles.reviewNote}>
                    Anything skipped can be added later. Opening stock is
                    recorded as a balance, not as a purchase.
                  </AppText>
                </>
              ) : null}
            </View>
          )}
        </View>

        {setupError ? (
          <AppText size="small" style={{ color: danger }}>{setupError}</AppText>
        ) : null}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: border, backgroundColor: background }]}>
          {step > 0 ? (
            <Pressable
              onPress={() => goToStep(step - 1)}
              style={styles.backAction}
              accessibilityRole="button"
            >
              <Ionicons name="arrow-back" size={17} color={textSecondary} />
              <AppText size="small" weight="semibold" style={{ color: textSecondary }}>
                Back
              </AppText>
            </Pressable>
          ) : (
            <View style={styles.backAction} />
          )}
          {step === steps.length - 1 ? (
            <Pressable
              onPress={() => void finishSetup()}
              disabled={!setupReady || completeSetup.isPending}
              style={[
                styles.primaryAction,
                {
                  backgroundColor: primary,
                  opacity: setupReady ? 1 : 0.45,
                },
              ]}
            >
              <AppText size="small" weight="semibold" style={{ color: theme.onPrimary }}>
                {completeSetup.isPending ? "Finishing…" : "Finish setup"}
              </AppText>
              {!completeSetup.isPending ? (
                <Ionicons name="arrow-forward" size={17} color={theme.onPrimary} />
              ) : null}
            </Pressable>
          ) : (
            <Pressable
              onPress={() => goToStep(step + 1)}
              disabled={
                (step === 0 && !chickenReady) ||
                (step === 2 && !housingReady) ||
                isLoading
              }
              style={[
                styles.primaryAction,
                {
                  backgroundColor: primary,
                  opacity:
                    (step === 0 && !chickenReady) ||
                    (step === 2 && !housingReady) ||
                    isLoading
                      ? 0.45
                      : 1,
                },
              ]}
            >
              <AppText size="small" weight="semibold" style={{ color: theme.onPrimary }}>
                {steps[step].kind === "optional" ? "Skip for now" : "Continue"}
              </AppText>
              <Ionicons name="arrow-forward" size={17} color={theme.onPrimary} />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function stepTitle(step: number): string {
  return [
    "What chickens do you raise?",
    "Do you keep eggs?",
    "Where are your chickens housed?",
    "How many chickens do you have?",
    "Do you have eggs in stock?",
    "What supplies do you use?",
    "Your farm is almost ready",
  ][step];
}

function stepDescription(step: number): string {
  return [
    "Add at least one active chicken product. This is required before entering stock or using the farm.",
    "Add the egg types you track. Kienyeji and Grade eggs are separate optional products.",
    "Create at least one active housing block. You can add more blocks later.",
    "If you already have birds, record their opening count and assign them to a block. Otherwise skip.",
    "Record eggs already on the farm if applicable. This step is optional.",
    "Set up feed, medication, equipment, and other inventory products you currently use.",
    "Check the essentials, then start using FarmTrack. Optional details can be completed later.",
  ][step];
}

function EssentialStatus({
  label,
  complete,
}: {
  label: string;
  complete: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.essentialStatus}>
      <Ionicons
        name={complete ? "checkmark-circle" : "ellipse-outline"}
        size={15}
        color={complete ? theme.primary : theme.textSecondary}
      />
      <AppText size="small" tone={complete ? "primary" : "secondary"}>
        {label}
      </AppText>
    </View>
  );
}

function SetupRow({
  icon,
  title,
  detail,
  status,
  complete = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  status?: string;
  complete?: boolean;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const row = (
    <>
      <Ionicons
        name={icon}
        size={20}
        color={complete ? theme.primary : theme.textSecondary}
      />
      <View style={styles.rowCopy}>
        <AppText size="small" weight="semibold" numberOfLines={1}>
          {title}
        </AppText>
        <AppText size="small" tone="secondary" numberOfLines={2}>
          {detail}
        </AppText>
      </View>
      {status ? (
        <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
          {status}
        </AppText>
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      ) : null}
    </>
  );
  const style = [
    styles.actionRow,
    { borderBottomColor: theme.border, backgroundColor: theme.backgroundElement },
  ];
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [...style, pressed && styles.pressed]}
    >
      {row}
    </Pressable>
  ) : (
    <View style={style}>{row}</View>
  );
}

function ReviewRow({
  label,
  value,
  complete,
}: {
  label: string;
  value: string;
  complete: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.reviewRow, { borderBottomColor: theme.border }]}>
      <Ionicons
        name={complete ? "checkmark-circle" : "alert-circle-outline"}
        size={18}
        color={complete ? theme.primary : theme.secondary}
      />
      <AppText size="small" style={styles.reviewLabel}>{label}</AppText>
      <AppText size="small" weight="semibold" tone="secondary">{value}</AppText>
    </View>
  );
}

function CreateFarmForm({
  isSubmitting,
  onCreate,
}: {
  isSubmitting: boolean;
  onCreate: (name: string) => Promise<void>;
}) {
  const { theme } = useTheme();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  async function submit(values: FormValues) {
    try {
      await onCreate(values.name);
    } catch (error) {
      form.setError("root", { message: normalizeApiError(error).message });
    }
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
          contentContainerStyle={styles.createContent}
          keyboardShouldPersistTaps="handled"
        >
          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
            FARMTRACK  /  NEW FARM
          </AppText>
          <AppText size="title" weight="semibold">
            Name your farm
          </AppText>
          <AppText tone="secondary">
            We’ll then set up your products, housing, and any opening stock.
          </AppText>
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <TextField
                label="Farm name"
                autoCapitalize="words"
                maxLength={150}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          {form.formState.errors.root?.message ? (
            <AppText style={{ color: theme.danger }}>
              {form.formState.errors.root.message}
            </AppText>
          ) : null}
          <Button
            label="Create farm"
            loading={form.formState.isSubmitting || isSubmitting}
            onPress={form.handleSubmit(submit)}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  createContent: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  farmHeading: { gap: 3, marginBottom: 20 },
  farmName: { fontSize: 23, lineHeight: 29 },
  progressArea: { gap: 10, marginBottom: 34 },
  progressMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  essentials: { gap: 7, marginTop: 2 },
  essentialItems: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  essentialStatus: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDivider: { width: 1, height: 14 },
  stepContent: { gap: 12, flex: 1 },
  stepEyebrow: { flexDirection: "row", alignItems: "center", gap: 7 },
  stepMarker: { width: 7, height: 7, borderRadius: 4 },
  stepTitle: { fontSize: 25, lineHeight: 31, maxWidth: 520 },
  stepDescription: { maxWidth: 520, marginBottom: 6, lineHeight: 22 },
  actions: { gap: 0, marginTop: 6 },
  actionRow: {
    minHeight: 62,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  eggProduct: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eggActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 18,
    paddingHorizontal: 12,
    paddingBottom: 9,
  },
  eggAction: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 5 },
  rowCopy: { flex: 1, gap: 1 },
  pressed: { opacity: 0.72 },
  inlineNote: { marginTop: 8 },
  errorPanel: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 8 },
  retryAction: {
    minHeight: 38,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 13,
    borderWidth: 1,
    borderRadius: 6,
  },
  reviewRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reviewLabel: { flex: 1 },
  reviewNote: { marginTop: 10, lineHeight: 19 },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 24 : 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  backAction: {
    minWidth: 82,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  primaryAction: {
    minWidth: 140,
    minHeight: 42,
    borderRadius: 7,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
});
