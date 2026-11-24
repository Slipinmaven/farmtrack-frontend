import { zodResolver } from "@hookform/resolvers/zod";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInputInstance,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";

import { SessionGate } from "@/components/layout/session-gate";
import { FarmTrackMark } from "@/components/branding/farmtrack-mark";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBlocks } from "@/features/blocks/hooks";
import type { ProductType } from "@/features/management/api";
import { useDeleteProduct, useProducts } from "@/features/management/hooks";
import {
  useCompleteFarmSetup,
  useCreateFarm,
  useFarmInvitations,
  usePendingFarmDeletions,
} from "@/features/farms/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters.")
    .max(40, "Use 40 characters or fewer.")
    .regex(/[a-z0-9]/i, "Include at least one letter or number."),
});
type FormValues = z.infer<typeof schema>;
const farmNameSuggestions = [
  "Green Valley Farm",
  "Family Poultry",
  "Mixed Livestock",
];

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
  const { user, signOut } = useAuth();
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
      params: {
        step: String(nextStep),
        ...(isAdditionalFarm ? { additional: "true" } : {}),
      },
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
        }}
        onContinue={() =>
          router.replace({
            pathname: "/farm-setup",
            params: {
              step: "0",
              ...(isAdditionalFarm ? { additional: "true" } : {}),
            },
          })
        }
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
        ...(isAdditionalFarm ? { setupAdditional: "true" } : {}),
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
      message: `“${productName}” will be permanently removed if it has no recorded activity. If it is already in use, edit it and deactivate it instead.`,
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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <FarmPageHeader
            title="Farm setup"
            showNotifications={false}
            rightAction={
              <Pressable
                accessibilityRole="button"
                onPress={() => void signOut()}
                hitSlop={8}
                style={styles.setupSignOut}
              >
                <AppText size="small" weight="semibold" tone="secondary">
                  Sign out
                </AppText>
              </Pressable>
            }
          />
          <View style={styles.farmHeading}>
            <AppText size="small" weight="semibold" style={{ color: primary }}>
              FIRST-TIME SETUP
            </AppText>
            <AppText size="title" weight="semibold" style={styles.farmName}>
              Set up {farm.selectedFarm.name}
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
        </View>

        <View style={styles.stepContent}>
          <View style={styles.stepContentHeader}>
            <View
              style={[
                styles.stepKindBadge,
                { backgroundColor: backgroundSelected },
              ]}
            >
              <AppText
                size="small"
                weight="semibold"
                style={{
                  color:
                    steps[step].kind === "required"
                      ? primary
                      : steps[step].kind === "finish"
                        ? secondary
                        : textSecondary,
                }}
              >
                {steps[step].kind === "required"
                  ? "REQUIRED"
                  : steps[step].kind === "finish"
                    ? "FINAL STEP"
                    : "OPTIONAL"}
              </AppText>
            </View>
          </View>
          <AppText size="title" weight="semibold" style={styles.stepTitle}>
            {stepTitle(step)}
          </AppText>
          <AppText size="small" tone="secondary" style={styles.stepDescription}>
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
                <>
                  {activeChickenProducts.map((product) => (
                    <SetupRow
                      key={product.id}
                      icon="checkmark-circle"
                      title={product.name}
                      detail="Chicken product · ready to use"
                      status="Added"
                      complete
                      action={
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${product.name}`}
                          onPress={() =>
                            router.push({
                              pathname: "/products/[productId]/edit",
                              params: {
                                productId: product.id,
                                fromSetup: "true",
                                setupStep: "0",
                                ...(isAdditionalFarm
                                  ? { setupAdditional: "true" }
                                  : {}),
                              },
                            })
                          }
                          style={[
                            styles.productEditAction,
                            {
                              backgroundColor: backgroundSelected,
                              borderColor: border,
                            },
                          ]}
                        >
                          <Ionicons name="create-outline" size={15} color={primary} />
                          <AppText size="small" weight="semibold" style={{ color: primary }}>
                            Edit
                          </AppText>
                        </Pressable>
                      }
                    />
                  ))}
                  <SetupRow
                    icon="add-circle-outline"
                    title={
                      chickenReady
                        ? "Add another chicken product"
                        : "Create chicken product"
                    }
                    detail={
                      chickenReady
                        ? "Track another type of bird"
                        : "We’ll set up its name and counting unit"
                    }
                    onPress={() =>
                      openProduct(
                        "chickens",
                        activeChickenProducts.length
                          ? `Chickens ${activeChickenProducts.length + 1}`
                          : "Chickens",
                      )
                    }
                  />
                </>
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
                                ...(isAdditionalFarm
                                  ? { setupAdditional: "true" }
                                  : {}),
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

function SetupRow({
  icon,
  title,
  detail,
  status,
  complete = false,
  action,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  status?: string;
  complete?: boolean;
  action?: ReactNode;
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
      {action}
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
  onContinue,
}: {
  isSubmitting: boolean;
  onCreate: (name: string) => Promise<void>;
  onContinue: () => void;
}) {
  const { theme } = useTheme();
  const { signOut, user } = useAuth();
  const pendingFarmDeletions = usePendingFarmDeletions(user?.id);
  const farmInvitations = useFarmInvitations(user?.id);
  const inputRef = useRef<TextInputInstance>(null);
  const [createdFarmName, setCreatedFarmName] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
    mode: "onChange",
    reValidateMode: "onChange",
  });
  const name = useWatch({ control: form.control, name: "name" }) ?? "";
  const normalizedName = name.trim();
  const isNameValid =
    normalizedName.length >= 2 &&
    normalizedName.length <= 40 &&
    /[a-z0-9]/i.test(normalizedName);
  const isBusy = form.formState.isSubmitting || isSubmitting;

  async function submit(values: FormValues) {
    try {
      await onCreate(values.name);
      setCreatedFarmName(values.name.trim());
    } catch (error) {
      form.setError("root", { message: normalizeApiError(error).message });
    }
  }

  function chooseSuggestion(suggestion: string) {
    form.setValue("name", suggestion, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    inputRef.current?.focus();
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        style={[styles.screen, { backgroundColor: theme.background }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.createShell}>
          <View style={styles.createTopBar}>
            <View style={styles.createBrand}>
              <View
                style={[
                  styles.createLogo,
                  {
                    backgroundColor:
                      theme.mode === "dark"
                        ? "#FFFFFF"
                        : theme.backgroundSelected,
                  },
                ]}
              >
                <FarmTrackMark size={30} />
              </View>
              <AppText size="body" weight="semibold">Farm setup</AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={() => void signOut()}
              hitSlop={8}
              style={({ pressed }) => [
                styles.signOutAction,
                pressed && !isBusy ? styles.pressed : null,
              ]}
            >
              <AppText
                size="small"
                weight="semibold"
                style={{ color: theme.textSecondary }}
              >
                Sign out
              </AppText>
            </Pressable>
          </View>

          {!createdFarmName ? (
            <>
              <View
                style={styles.createProgress}
                accessibilityRole="progressbar"
                accessibilityValue={{
                  min: 1,
                  max: 2,
                  now: 1,
                  text: "Step 1 of 2: Create your farm",
                }}
              >
                <View
                  style={[
                    styles.createProgressSegment,
                    { backgroundColor: theme.primary },
                  ]}
                />
                <View
                  style={[
                    styles.createProgressSegment,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                />
              </View>
              <ScrollView
                style={styles.createMain}
                contentContainerStyle={styles.createContent}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
              >
                <View style={styles.createIntro}>
                  <AppText size="title" weight="semibold" style={styles.createTitle}>
                    What’s your farm called?
                  </AppText>
                  <AppText tone="secondary" style={styles.createLead}>
                    This name appears on your records and reports.
                  </AppText>
                </View>
                <View
                  style={[
                    styles.invitationPrompt,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: `${theme.primary}55`,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.invitationPromptIcon,
                      { backgroundColor: `${theme.primary}18` },
                    ]}
                  >
                    <Ionicons
                      name="mail-open-outline"
                      size={20}
                      color={theme.primary}
                    />
                  </View>
                  <View style={styles.invitationPromptCopy}>
                    <AppText weight="semibold">
                      Were you invited to a farm?
                    </AppText>
                    <AppText size="small" tone="secondary">
                      Accept the invitation instead of creating a separate
                      workspace.
                    </AppText>
                  </View>
                  {farmInvitations.data?.length ? (
                    <View
                      style={[
                        styles.invitationCount,
                        { backgroundColor: theme.primary },
                      ]}
                    >
                      <AppText
                        size="small"
                        weight="semibold"
                        style={{ color: theme.onPrimary }}
                      >
                        {farmInvitations.data.length}
                      </AppText>
                    </View>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push("/farm-team")}
                    style={({ pressed }) => [
                      styles.invitationPromptAction,
                      {
                        backgroundColor: pressed
                          ? theme.backgroundSelected
                          : `${theme.primary}12`,
                      },
                    ]}
                  >
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{ color: theme.primary }}
                    >
                      Check invitations
                    </AppText>
                    <Ionicons
                      name="arrow-forward"
                      size={16}
                      color={theme.primary}
                    />
                  </Pressable>
                </View>
                {pendingFarmDeletions.data?.length ? (
                  <Card style={{ gap: 10, borderColor: `${theme.danger}70` }}>
                    <AppText weight="semibold">
                      {pendingFarmDeletions.data.length === 1
                        ? "A farm is awaiting deletion"
                        : `${pendingFarmDeletions.data.length} farms are awaiting deletion`}
                    </AppText>
                    <AppText size="small" tone="secondary">
                      You can restore a farm instead of creating a new one.
                      Review the remaining time and confirm with your password.
                    </AppText>
                    <Button
                      label="Review and restore a farm"
                      variant="secondary"
                      onPress={() => router.push("/account-details")}
                    />
                  </Card>
                ) : null}

                <Controller
                  control={form.control}
                  name="name"
                  render={({ field, fieldState }) => {
                    const showError = Boolean(
                      fieldState.error &&
                      (fieldState.isTouched || field.value.length > 0),
                    );
                    return (
                      <View style={styles.nameField}>
                        <AppText size="small" weight="semibold">
                          Farm name
                        </AppText>
                        <View
                          style={[
                            styles.nameInputFrame,
                            {
                              backgroundColor: theme.backgroundElement,
                              borderColor: showError
                                ? theme.danger
                                : fieldState.isTouched && fieldState.isDirty
                                  ? theme.primary
                                  : theme.border,
                              borderWidth: isFocused ? 2 : 1,
                            },
                            isFocused && {
                              borderColor: showError ? theme.danger : theme.primary,
                            },
                          ]}
                        >
                          <TextInput
                            ref={(input) => {
                              field.ref(input);
                              inputRef.current = input;
                            }}
                            accessibilityLabel="Farm name"
                            accessibilityHint={
                              showError
                                ? fieldState.error?.message
                                : "You can change this later in Settings."
                            }
                            autoCapitalize="words"
                            autoComplete="off"
                            enterKeyHint="done"
                            maxLength={40}
                            onBlur={() => {
                              setIsFocused(false);
                              field.onBlur();
                              if (!field.value.trim()) {
                                void form.trigger("name");
                              }
                            }}
                            onChangeText={field.onChange}
                            onFocus={() => setIsFocused(true)}
                            onSubmitEditing={() => {
                              if (!isBusy && isNameValid) {
                                void form.handleSubmit(submit)();
                              }
                            }}
                            placeholder="e.g. Green Valley Farm"
                            placeholderTextColor={theme.textSecondary}
                            returnKeyType="done"
                            selectionColor={theme.primary}
                            style={[
                              styles.nameInput,
                              { color: theme.text, fontFamily: theme.fontFamily },
                            ]}
                            value={field.value}
                          />
                          {field.value.length > 0 ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Clear farm name"
                              disabled={isBusy}
                              hitSlop={8}
                              onPress={() => {
                                field.onChange("");
                                field.onBlur();
                                inputRef.current?.focus();
                              }}
                              style={[
                                styles.clearName,
                                { backgroundColor: theme.backgroundSelected },
                              ]}
                            >
                              <Ionicons
                                name="close"
                                size={17}
                                color={theme.text}
                              />
                            </Pressable>
                          ) : null}
                        </View>
                        <View style={styles.nameMeta}>
                          <AppText
                            size="small"
                            style={{
                              flex: 1,
                              color: showError ? theme.danger : theme.textSecondary,
                            }}
                            accessibilityLiveRegion="polite"
                          >
                            {showError
                              ? fieldState.error?.message
                              : "You can change this later in Settings."}
                          </AppText>
                          <AppText size="small" tone="secondary">
                            {field.value.length}/40
                          </AppText>
                        </View>
                      </View>
                    );
                  }}
                />

                <View style={styles.suggestions}>
                  <AppText size="small" tone="secondary">
                    Need a starting point?
                  </AppText>
                  <View style={styles.suggestionList}>
                    {farmNameSuggestions.map((suggestion) => (
                      <Pressable
                        key={suggestion}
                        accessibilityRole="button"
                        disabled={isBusy}
                        onPress={() => chooseSuggestion(suggestion)}
                        style={({ pressed }) => [
                          styles.suggestionChip,
                          {
                            borderColor: theme.border,
                            backgroundColor: theme.backgroundElement,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <AppText size="small">{suggestion}</AppText>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {form.formState.errors.root?.message ? (
                  <AppText
                    accessibilityLiveRegion="assertive"
                    size="small"
                    style={{ color: theme.danger }}
                  >
                    {form.formState.errors.root.message}
                  </AppText>
                ) : null}
              </ScrollView>
              <View
                style={[
                  styles.createFooter,
                  { backgroundColor: theme.background },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: !isNameValid || isBusy,
                    busy: isBusy,
                  }}
                  disabled={!isNameValid || isBusy}
                  onPress={() => void form.handleSubmit(submit)()}
                  style={({ pressed }) => [
                    styles.createButton,
                    {
                      backgroundColor: isNameValid
                        ? theme.primary
                        : theme.backgroundSelected,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  {isBusy ? (
                    <ActivityIndicator color={theme.onPrimary} />
                  ) : (
                    <AppText
                      size="body"
                      weight="semibold"
                      style={{
                        color: isNameValid ? theme.onPrimary : theme.textSecondary,
                      }}
                    >
                      Create farm
                    </AppText>
                  )}
                  {isBusy ? (
                    <AppText
                      size="body"
                      weight="semibold"
                      style={{ color: theme.onPrimary }}
                    >
                      Creating…
                    </AppText>
                  ) : null}
                </Pressable>
                <AppText size="small" tone="secondary" style={styles.createFootnote}>
                  Takes about a minute to finish setup.
                </AppText>
              </View>
            </>
          ) : (
            <View style={styles.createSuccess}>
              <View
                style={[
                  styles.successMark,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons
                  name="checkmark"
                  size={34}
                  color={theme.success}
                />
              </View>
              <AppText size="title" weight="semibold" style={styles.createTitle}>
                {createdFarmName} is ready
              </AppText>
              <AppText tone="secondary" style={styles.createLead}>
                Next, add your first chicken product or housing block.
              </AppText>
              <Pressable
                accessibilityRole="button"
                onPress={onContinue}
                style={({ pressed }) => [
                  styles.createButton,
                  { backgroundColor: theme.primary },
                  pressed && styles.pressed,
                ]}
              >
                <AppText
                  size="body"
                  weight="semibold"
                  style={{ color: theme.onPrimary }}
                >
                  Continue setup
                </AppText>
              </Pressable>
            </View>
          )}
        </View>
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
    paddingTop: 24,
    paddingBottom: 28,
    gap: 26,
  },
  setupSignOut: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  createContent: {
    flexGrow: 1,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 20,
  },
  createShell: {
    flex: 1,
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    paddingHorizontal: 20,
  },
  createTopBar: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  createBrand: { flexDirection: "row", alignItems: "center", gap: 10 },
  createLogo: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutAction: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  createProgress: { flexDirection: "row", gap: 6, marginTop: 14 },
  createProgressSegment: { flex: 1, height: 4, borderRadius: 2 },
  createMain: { flex: 1, minHeight: 0 },
  createIntro: { gap: 5 },
  createTitle: { fontSize: 24, lineHeight: 30, letterSpacing: -0.35 },
  createLead: { lineHeight: 20 },
  invitationPrompt: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  invitationPromptIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  invitationPromptCopy: { flex: 1, minWidth: 170, gap: 3 },
  invitationCount: {
    minWidth: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    paddingHorizontal: 6,
  },
  invitationPromptAction: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  nameField: { gap: 6 },
  nameInputFrame: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 11,
    paddingLeft: 13,
    paddingRight: 10,
  },
  nameInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 0,
    borderWidth: 0,
    fontSize: 17,
    outlineWidth: 0,
    outlineColor: "transparent",
    outlineStyle: "solid",
  },
  clearName: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  nameMeta: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  suggestions: { gap: 8 },
  suggestionList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestionChip: {
    minHeight: 36,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 13,
  },
  createFooter: {
    paddingTop: 12,
    paddingBottom: 14,
  },
  createButton: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 11,
    paddingHorizontal: 18,
  },
  createFootnote: { textAlign: "center", marginTop: 10 },
  createSuccess: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingVertical: 28,
  },
  successMark: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  farmHeading: { gap: 4 },
  farmName: { fontSize: 25, lineHeight: 31 },
  progressArea: { gap: 10 },
  progressMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTrack: { height: 5, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  stepContent: { gap: 12, flex: 1 },
  stepContentHeader: { flexDirection: "row", alignItems: "center" },
  stepKindBadge: {
    minHeight: 26,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  stepTitle: { fontSize: 22, lineHeight: 28, maxWidth: 520 },
  stepDescription: { maxWidth: 520, marginBottom: 6, lineHeight: 19 },
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
  productEditAction: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 8,
  },
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
  createForm: { gap: 16 },
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
