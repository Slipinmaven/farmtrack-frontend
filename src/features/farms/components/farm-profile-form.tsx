import { zodResolver } from "@hookform/resolvers/zod";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import type { ImagePickerAsset } from "expo-image-picker";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { Controller, useForm, useWatch } from "react-hook-form";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { FarmLogoPicker } from "@/features/farms/components/farm-logo-picker";
import { useFarmLogo } from "@/features/farms/use-farm-logo";
import { FarmRegionSelector } from "@/features/farms/components/farm-region-selector";
import { FarmSelector } from "@/features/farms/components/farm-selector";
import { FarmThemeSelector } from "@/features/farms/components/farm-theme-selector";
import { FontScaleSelector } from "@/features/farms/components/font-scale-selector";
import { DestructiveReviewAction } from "@/features/deletion/components/destructive-review-action";
import { DeletionConfirmationSheet } from "@/features/deletion/components/deletion-confirmation-sheet";
import {
  useDeleteFarmLogo,
  useLeaveFarm,
  useScheduleFarmDeletion,
  useUpdateFarm,
  useUpdateFarmSettings,
  useUploadFarmLogo,
} from "@/features/farms/hooks";
import type { Farm, ThemeMode } from "@/features/farms/types";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const schema = z.object({
  name: z.string().trim().min(1, "Enter a farm name.").max(150),
  description: z.string(),
  location: z.string().max(255),
  phone_number: z.string().max(20),
  email: z
    .string()
    .trim()
    .max(255)
    .refine((value) => !value || z.email().safeParse(value).success, {
      message: "Enter a valid farm email address.",
    }),
  maximum_chicken_capacity: z
    .string()
    .regex(/^(?:[1-9]\d*)?$/, "Enter a positive whole number."),
  is_active: z.boolean(),
  primary_color: z.string().regex(/^#[\da-f]{6}$/i, "Use a 6-digit hex color."),
  secondary_color: z
    .string()
    .regex(/^#[\da-f]{6}$/i, "Use a 6-digit hex color."),
  theme_mode: z.enum(["light", "dark", "system"]),
  font_family: z.enum(["Inter", "System"]),
  font_scale: z
    .string()
    .regex(
      /^(0\.(7[5-9]|[89]\d)|1\.[0-4]\d|1\.50)$/,
      "Use a scale from 0.75 to 1.50.",
    ),
  currency: z.string().trim().length(3, "Enter a three-letter currency code."),
  timezone: z.string().trim().min(1, "Enter a timezone.").max(50),
});
type ProfileFormValues = z.infer<typeof schema>;

const modes: ThemeMode[] = ["light", "dark", "system"];
const fontFamilies = ["Inter", "System"] as const;
const profileSections = [
  "identity",
  "contact",
  "capacity",
  "access",
  "appearance",
  "region",
] as const;
type FarmProfileSection = (typeof profileSections)[number];

function getProfileSection(section?: string): FarmProfileSection {
  return (
    profileSections.find((candidate) => candidate === section) ?? "identity"
  );
}

export function FarmProfileForm() {
  const { selectedFarm } = useFarm();
  const { section } = useLocalSearchParams<{ section?: string }>();
  return (
    <FarmProfileFormContent
      key={`${selectedFarm?.id ?? "no-selected-farm"}:${section ?? ""}`}
      initialSection={section}
    />
  );
}

function FarmProfileFormContent({
  initialSection,
}: {
  initialSection?: string;
}) {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme, setPreview } = useTheme();
  const dialog = useAppDialog();
  const selectedFarm = farm.selectedFarm;
  const isFarmOwner = selectedFarm?.owner_id === user?.id;
  const settings = selectedFarm?.settings;
  const userId = user?.id ?? "";
  const farmId = selectedFarm?.id ?? "";
  const updateFarm = useUpdateFarm(userId, farmId);
  const updateSettings = useUpdateFarmSettings(userId, farmId);
  const uploadLogo = useUploadFarmLogo(userId, farmId);
  const deleteLogo = useDeleteFarmLogo(userId, farmId);
  const scheduleDeletion = useScheduleFarmDeletion(userId, farmId);
  const leaveFarm = useLeaveFarm(userId, farmId);
  const [accessPassword, setAccessPassword] = useState("");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessActionOpen, setAccessActionOpen] = useState(false);
  const [accessPasswordStep, setAccessPasswordStep] = useState(false);
  const [farmDeletionSheetOpen, setFarmDeletionSheetOpen] = useState(false);
  const [farmDeletionError, setFarmDeletionError] = useState<string | null>(
    null,
  );
  const [logoDraft, setLogoDraft] = useState<{
    farmId: string;
    asset: ImagePickerAsset | null;
    remove: boolean;
  } | null>(null);
  const [expandedSection, setExpandedSection] =
    useState<FarmProfileSection | null>(() =>
      getProfileSection(initialSection),
    );
  const logoAsset = logoDraft?.farmId === farmId ? logoDraft.asset : null;
  const removeLogo = logoDraft?.farmId === farmId ? logoDraft.remove : false;
  const hasLogoChanges = Boolean(
    logoDraft?.farmId === farmId && (logoDraft.asset || logoDraft.remove),
  );
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(schema),
    defaultValues: getDefaultValues(selectedFarm, theme),
  });
  const hasUnsavedChanges = form.formState.isDirty || hasLogoChanges;

  const [
    previewPrimary,
    previewSecondary,
    previewMode,
    previewFont,
    previewScale,
    farmName,
    farmLocation,
    farmPhone,
    farmEmail,
    maximumCapacity,
    farmIsActive,
    currency,
    timezone,
  ] = useWatch({
    control: form.control,
    name: [
      "primary_color",
      "secondary_color",
      "theme_mode",
      "font_family",
      "font_scale",
      "name",
      "location",
      "phone_number",
      "email",
      "maximum_chicken_capacity",
      "is_active",
      "currency",
      "timezone",
    ],
  });

  useEffect(() => {
    if (
      !isFarmOwner ||
      !farmId ||
      !previewPrimary ||
      !previewSecondary ||
      !previewMode ||
      !previewFont ||
      !previewScale
    )
      return;
    setPreview({
      farmId,
      settings: {
        primary_color: previewPrimary,
        secondary_color: previewSecondary,
        theme_mode: previewMode,
        font_family: previewFont === "System" ? "system" : "inter",
        font_scale: Number(previewScale),
      },
    });
  }, [
    farmId,
    isFarmOwner,
    previewFont,
    previewMode,
    previewPrimary,
    previewScale,
    previewSecondary,
    setPreview,
  ]);

  useEffect(() => {
    if (!farmId) return;
    return () => {
      setPreview((current) => (current?.farmId === farmId ? null : current));
    };
  }, [farmId, setPreview]);

  if (selectedFarm && user?.id && !isFarmOwner) {
    return <FarmMemberProfile farm={selectedFarm} userId={user.id} />;
  }

  function setLogoAsset(asset: ImagePickerAsset | null) {
    setLogoDraft((current) => ({
      farmId,
      asset,
      remove: current?.farmId === farmId ? current.remove : false,
    }));
  }

  function setRemoveLogo(remove: boolean) {
    setLogoDraft((current) => ({
      farmId,
      asset: current?.farmId === farmId ? current.asset : null,
      remove,
    }));
  }

  async function submit(values: ProfileFormValues) {
    try {
      const maximumCapacity = values.maximum_chicken_capacity.trim();
      await updateFarm.mutateAsync({
        name: values.name,
        description: values.description.trim() || null,
        location: values.location.trim() || null,
        phone_number: values.phone_number.trim() || null,
        email: values.email.trim() || null,
        maximum_chicken_capacity: maximumCapacity
          ? Number(maximumCapacity)
          : null,
        is_active: values.is_active,
      });
      await updateSettings.mutateAsync({
        primary_color: values.primary_color,
        secondary_color: values.secondary_color,
        theme_mode: values.theme_mode,
        font_family: values.font_family,
        font_scale: Number(values.font_scale),
        currency: values.currency.toUpperCase(),
        timezone: values.timezone,
      });
      if (logoAsset) {
        await uploadLogo.mutateAsync({
          uri: logoAsset.uri,
          fileName: logoAsset.fileName ?? null,
          mimeType: logoAsset.mimeType ?? null,
        });
      } else if (removeLogo) {
        await deleteLogo.mutateAsync();
      }
      await farm.refreshFarms();
      router.back();
    } catch (error) {
      form.setError("root", { message: normalizeApiError(error).message });
    }
  }

  async function confirmFarmAccessAction() {
    if (!selectedFarm) return;
    if (selectedFarm.owner_id === user?.id) return;
    if (hasUnsavedChanges) {
      setAccessError("Save or discard profile changes before continuing.");
      return;
    }
    if (!accessPassword) {
      setAccessError("Enter your current password to continue.");
      return;
    }

    const confirmed = await dialog.confirmDialog({
      title: "Leave this farm?",
      message:
        "You will lose access to this farm. This does not delete the farm or its records.",
      confirmLabel: "Leave farm",
      tone: "info",
    });
    if (!confirmed) return;

    setAccessError(null);
    try {
      await leaveFarm.mutateAsync(accessPassword);
      setAccessPassword("");
      await farm.refreshFarms();
      await dialog.showDialog({
        title: "Farm left",
        message: "You no longer have access to this farm.",
        tone: "info",
      });
      router.replace("/(tabs)");
    } catch (error: unknown) {
      setAccessError(normalizeApiError(error).message);
    }
  }

  async function submitFarmDeletion(password: string): Promise<boolean> {
    if (!selectedFarm || selectedFarm.owner_id !== user?.id) return false;
    setFarmDeletionError(null);
    try {
      const scheduled = await scheduleDeletion.mutateAsync(password);
      setFarmDeletionSheetOpen(false);
      await farm.refreshFarms();
      router.replace({
        pathname: "/account-details",
        params: {
          farmDeletionEmailSent: String(scheduled.notification_sent === true),
        },
      });
      return true;
    } catch (error: unknown) {
      setFarmDeletionError(normalizeApiError(error).message);
      return false;
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <FarmPageHeader title="Farm profile" showBack />
          <FarmSelector />
          {selectedFarm ? (
            <>
              <ProfileSection
                icon="business-outline"
                title="Farm identity"
                summary={farmName || "Name and logo"}
                expanded={expandedSection === "identity"}
                onPress={() =>
                  setExpandedSection((current) =>
                    current === "identity" ? null : "identity",
                  )
                }
              >
                <FarmLogoPicker
                  logoPath={settings?.logo_path}
                  asset={logoAsset}
                  removalRequested={removeLogo}
                  onAssetChange={setLogoAsset}
                  onRemovalChange={setRemoveLogo}
                />
                <Controller
                  control={form.control}
                  name="name"
                  render={({ field, fieldState }) => (
                    <TextField
                      label="Farm name"
                      placeholder="e.g. Green Valley Farm"
                      autoCapitalize="words"
                      maxLength={150}
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="description"
                  render={({ field, fieldState }) => (
                    <TextField
                      label="Description"
                      placeholder="What should people know about this farm?"
                      multiline
                      style={styles.multiline}
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              </ProfileSection>

              <ProfileSection
                icon="call-outline"
                title="Contact & location"
                summary={
                  farmLocation || farmPhone || farmEmail || "Optional details"
                }
                expanded={expandedSection === "contact"}
                onPress={() =>
                  setExpandedSection((current) =>
                    current === "contact" ? null : "contact",
                  )
                }
              >
                <Controller
                  control={form.control}
                  name="location"
                  render={({ field, fieldState }) => (
                    <TextField
                      label="Location"
                      placeholder="Town, county or region"
                      maxLength={255}
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="phone_number"
                  render={({ field, fieldState }) => (
                    <TextField
                      label="Phone number"
                      placeholder="Farm contact number"
                      keyboardType="phone-pad"
                      maxLength={20}
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="email"
                  render={({ field, fieldState }) => (
                    <TextField
                      label="Farm email"
                      placeholder="name@example.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={255}
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              </ProfileSection>

              <ProfileSection
                icon="people-outline"
                title="Capacity"
                summary={
                  maximumCapacity ? `${maximumCapacity} birds` : "No limit set"
                }
                expanded={expandedSection === "capacity"}
                onPress={() =>
                  setExpandedSection((current) =>
                    current === "capacity" ? null : "capacity",
                  )
                }
              >
                <Controller
                  control={form.control}
                  name="maximum_chicken_capacity"
                  render={({ field, fieldState }) => (
                    <TextField
                      label="Maximum chicken capacity"
                      keyboardType="number-pad"
                      placeholder="Leave blank if not set"
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              </ProfileSection>

              <ProfileSection
                icon="power-outline"
                title="Farm access"
                summary={farmIsActive ? "Active" : "Paused"}
                expanded={expandedSection === "access"}
                onPress={() =>
                  setExpandedSection((current) =>
                    current === "access" ? null : "access",
                  )
                }
              >
                <Controller
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <View
                      style={[
                        styles.statusRow,
                        {
                          backgroundColor: theme.backgroundSelected,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.statusIcon,
                          { backgroundColor: theme.backgroundElement },
                        ]}
                      >
                        <Ionicons
                          name={
                            field.value
                              ? "checkmark-circle-outline"
                              : "pause-circle-outline"
                          }
                          size={20}
                          color={
                            field.value ? theme.primary : theme.textSecondary
                          }
                        />
                      </View>
                      <View style={styles.switchCopy}>
                        <AppText weight="semibold">
                          {field.value ? "Active" : "Paused"}
                        </AppText>
                        <AppText size="small" tone="secondary">
                          {field.value
                            ? "Shown in farm switcher"
                            : "Hidden from farm switcher"}
                        </AppText>
                      </View>
                      <Switch
                        value={field.value}
                        onValueChange={field.onChange}
                        trackColor={{
                          false: theme.border,
                          true: theme.primary,
                        }}
                        thumbColor={theme.backgroundElement}
                        accessibilityLabel="Farm is active"
                        accessibilityState={{ checked: field.value }}
                      />
                    </View>
                  )}
                />
              </ProfileSection>

              <ProfileSection
                icon="color-palette-outline"
                title="Brand & appearance"
                summary={`${capitalize(previewMode)} · ${getFontScaleLabel(previewScale)} text`}
                expanded={expandedSection === "appearance"}
                onPress={() =>
                  setExpandedSection((current) =>
                    current === "appearance" ? null : "appearance",
                  )
                }
              >
                <View
                  style={[
                    styles.previewNote,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons
                    name="eye-outline"
                    size={16}
                    color={theme.primary}
                  />
                  <AppText size="small" tone="secondary">
                    Preview now · Save to keep
                  </AppText>
                </View>
                <Controller
                  control={form.control}
                  name="primary_color"
                  render={({ field }) => (
                    <FarmThemeSelector
                      value={field.value}
                      onSelect={(preset) => {
                        field.onChange(preset.primary);
                        form.setValue("secondary_color", preset.secondary, {
                          shouldDirty: true,
                        });
                      }}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="theme_mode"
                  render={({ field }) => (
                    <View style={styles.fieldGroup}>
                      <AppText size="small" weight="semibold">
                        Theme mode
                      </AppText>
                      <View style={styles.segmentRow}>
                        {modes.map((mode) => {
                          const selected = field.value === mode;
                          const modeIcon =
                            mode === "light"
                              ? "sunny-outline"
                              : mode === "dark"
                                ? "moon-outline"
                                : "phone-portrait-outline";
                          return (
                            <Pressable
                              key={mode}
                              accessibilityRole="radio"
                              accessibilityState={{ checked: selected }}
                              onPress={() => field.onChange(mode)}
                              style={[
                                styles.segment,
                                {
                                  backgroundColor: selected
                                    ? theme.primary
                                    : theme.backgroundElement,
                                  borderColor: selected
                                    ? theme.primary
                                    : theme.border,
                                },
                              ]}
                            >
                              <Ionicons
                                name={modeIcon}
                                size={17}
                                color={
                                  selected
                                    ? theme.onPrimary
                                    : theme.textSecondary
                                }
                              />
                              <AppText
                                size="small"
                                weight="semibold"
                                style={{
                                  color: selected
                                    ? theme.onPrimary
                                    : theme.text,
                                  textTransform: "capitalize",
                                }}
                              >
                                {mode}
                              </AppText>
                              {selected ? (
                                <Ionicons
                                  name="checkmark-circle"
                                  size={16}
                                  color={theme.onPrimary}
                                />
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}
                />
                <Controller
                  control={form.control}
                  name="font_family"
                  render={({ field }) => (
                    <View style={styles.fieldGroup}>
                      <AppText size="small" weight="semibold">
                        Font family
                      </AppText>
                      <View style={styles.segmentRow}>
                        {fontFamilies.map((fontFamily) => {
                          const selected = field.value === fontFamily;
                          return (
                            <Pressable
                              key={fontFamily}
                              accessibilityRole="radio"
                              accessibilityState={{ checked: selected }}
                              onPress={() => field.onChange(fontFamily)}
                              style={[
                                styles.segment,
                                {
                                  backgroundColor: selected
                                    ? theme.primary
                                    : theme.backgroundElement,
                                  borderColor: selected
                                    ? theme.primary
                                    : theme.border,
                                },
                              ]}
                            >
                              <Ionicons
                                name={
                                  fontFamily === "Inter"
                                    ? "text-outline"
                                    : "phone-portrait-outline"
                                }
                                size={17}
                                color={
                                  selected
                                    ? theme.onPrimary
                                    : theme.textSecondary
                                }
                              />
                              <AppText
                                size="small"
                                weight="semibold"
                                style={{
                                  color: selected
                                    ? theme.onPrimary
                                    : theme.text,
                                }}
                              >
                                {fontFamily}
                              </AppText>
                              {selected ? (
                                <Ionicons
                                  name="checkmark-circle"
                                  size={16}
                                  color={theme.onPrimary}
                                />
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}
                />
                <Controller
                  control={form.control}
                  name="font_scale"
                  render={({ field }) => (
                    <FontScaleSelector
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </ProfileSection>

              <ProfileSection
                icon="globe-outline"
                title="Regional defaults"
                summary={`${currency} · ${timezone}`}
                expanded={expandedSection === "region"}
                onPress={() =>
                  setExpandedSection((current) =>
                    current === "region" ? null : "region",
                  )
                }
              >
                <Controller
                  control={form.control}
                  name="timezone"
                  render={({ field: timezone }) => (
                    <Controller
                      control={form.control}
                      name="currency"
                      render={({ field: currency }) => (
                        <FarmRegionSelector
                          currency={currency.value}
                          timezone={timezone.value}
                          onSelect={(region) => {
                            currency.onChange(region.currency);
                            timezone.onChange(region.timezone);
                          }}
                        />
                      )}
                    />
                  )}
                />
              </ProfileSection>
              <Card
                style={[
                  styles.accessCard,
                  selectedFarm.owner_id === user?.id && styles.farmDeletionCard,
                  selectedFarm.owner_id === user?.id && {
                    borderColor: `${theme.danger}66`,
                    borderLeftColor: theme.danger,
                  },
                ]}
              >
                {selectedFarm.owner_id === user?.id ? (
                  <View
                    style={[
                      styles.accessTrigger,
                      styles.farmDeletionTrigger,
                      { backgroundColor: `${theme.danger}12` },
                    ]}
                  >
                    <View
                      style={[
                        styles.dangerIcon,
                        { backgroundColor: theme.danger },
                      ]}
                    >
                      <Ionicons
                        name="warning-outline"
                        size={20}
                        color="#FFFFFF"
                      />
                    </View>
                    <View style={styles.accessCopy}>
                      <AppText weight="semibold">Farm deletion</AppText>
                      <AppText size="small" tone="secondary">
                        PERMANENT FARM CHANGE
                      </AppText>
                    </View>
                    <Ionicons
                      name="alert-circle-outline"
                      size={20}
                      color={theme.danger}
                    />
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: accessActionOpen }}
                    onPress={() => {
                      setAccessActionOpen((open) => !open);
                      setAccessPasswordStep(false);
                      setAccessPassword("");
                      setAccessError(null);
                    }}
                    style={({ pressed }) => [
                      styles.accessTrigger,
                      pressed && { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <View
                      style={[
                        styles.dangerIcon,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <Ionicons
                        name="exit-outline"
                        size={19}
                        color={theme.textSecondary}
                      />
                    </View>
                    <View style={styles.accessCopy}>
                      <AppText weight="semibold">Leave farm</AppText>
                      <AppText size="small" tone="secondary">
                        Manage your access to this farm
                      </AppText>
                    </View>
                    <Ionicons
                      name={accessActionOpen ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                )}
                {selectedFarm.owner_id === user?.id || accessActionOpen ? (
                  <Animated.View
                    entering={FadeInDown.duration(220)}
                    exiting={FadeOutUp.duration(150)}
                    style={[
                      styles.accessDetails,
                      { borderTopColor: theme.border },
                    ]}
                  >
                    {selectedFarm.owner_id === user?.id ? (
                      <>
                        <AppText size="small" tone="secondary">
                          Schedule deletion only when you intend to remove this
                          farm and all of its records.
                        </AppText>
                        <View
                          style={[
                            styles.deletionTimeline,
                            {
                              backgroundColor: theme.background,
                              borderColor: theme.border,
                            },
                          ]}
                        >
                          <View style={styles.timelineStep}>
                            <View
                              style={[
                                styles.timelineMarker,
                                { backgroundColor: theme.danger },
                              ]}
                            >
                              <Ionicons
                                name="remove"
                                size={13}
                                color="#FFFFFF"
                              />
                            </View>
                            <View style={styles.timelineCopy}>
                              <AppText size="small" weight="semibold">
                                Request day
                              </AppText>
                              <AppText size="small" tone="secondary">
                                Farm access is removed from your workspace.
                              </AppText>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.timelineRule,
                              { backgroundColor: theme.border },
                            ]}
                          />
                          <View style={styles.timelineStep}>
                            <View
                              style={[
                                styles.timelineMarker,
                                {
                                  backgroundColor: `${theme.secondary}24`,
                                  borderColor: `${theme.secondary}70`,
                                },
                              ]}
                            >
                              <AppText size="small" weight="semibold">
                                30
                              </AppText>
                            </View>
                            <View style={styles.timelineCopy}>
                              <AppText size="small" weight="semibold">
                                Recovery deadline
                              </AppText>
                              <AppText size="small" tone="secondary">
                                Restore it from Account & access with your
                                password before this date.
                              </AppText>
                            </View>
                          </View>
                        </View>
                        {hasUnsavedChanges ? (
                          <AppText size="small" tone="secondary">
                            Save or discard profile changes before continuing.
                          </AppText>
                        ) : null}
                        <DestructiveReviewAction
                          label="Review farm deletion"
                          description="Farm and all records · 30-day recovery"
                          disabled={hasUnsavedChanges}
                          onPress={() => {
                            setFarmDeletionError(null);
                            setFarmDeletionSheetOpen(true);
                          }}
                        />
                      </>
                    ) : !accessPasswordStep ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={hasUnsavedChanges}
                        onPress={() => {
                          setAccessPasswordStep(true);
                          setAccessError(null);
                        }}
                        style={({ pressed }) => [
                          styles.accessStartAction,
                          {
                            borderColor: theme.border,
                            opacity: hasUnsavedChanges ? 0.5 : 1,
                          },
                          pressed && {
                            backgroundColor: theme.backgroundSelected,
                          },
                        ]}
                      >
                        <AppText size="small" weight="semibold">
                          Continue to leave farm
                        </AppText>
                        <Ionicons
                          name="arrow-forward"
                          size={16}
                          color={theme.textSecondary}
                        />
                      </Pressable>
                    ) : (
                      <View style={styles.accessConfirmation}>
                        <AppText size="small" weight="semibold">
                          Confirm your identity
                        </AppText>
                        <TextField
                          label="Current password"
                          value={accessPassword}
                          onChangeText={setAccessPassword}
                          secureTextEntry
                          autoCapitalize="none"
                          textContentType="password"
                        />
                        {accessError ? (
                          <AppText
                            size="small"
                            style={{ color: theme.danger }}
                          >
                            {accessError}
                          </AppText>
                        ) : null}
                        <View style={styles.accessActions}>
                          <Pressable
                            accessibilityRole="button"
                            disabled={
                              scheduleDeletion.isPending || leaveFarm.isPending
                            }
                            onPress={() => {
                              setAccessPasswordStep(false);
                              setAccessPassword("");
                              setAccessError(null);
                            }}
                            style={[
                              styles.accessCancelAction,
                              { borderColor: theme.border },
                            ]}
                          >
                            <AppText size="small" weight="semibold">
                              Cancel
                            </AppText>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{
                              disabled:
                                !accessPassword ||
                                scheduleDeletion.isPending ||
                                leaveFarm.isPending,
                              busy:
                                scheduleDeletion.isPending ||
                                leaveFarm.isPending,
                            }}
                            disabled={
                              !accessPassword ||
                              scheduleDeletion.isPending ||
                              leaveFarm.isPending
                            }
                            onPress={() => void confirmFarmAccessAction()}
                            style={[
                              styles.accessConfirmAction,
                              {
                                borderColor: theme.secondary,
                                opacity: accessPassword ? 1 : 0.5,
                              },
                            ]}
                          >
                            <AppText
                              size="small"
                              weight="semibold"
                            >
                              {leaveFarm.isPending
                                ? "Please wait…"
                                : "Leave farm"}
                            </AppText>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </Animated.View>
                ) : null}
              </Card>
            </>
          ) : (
            <Card style={styles.noFarmCard}>
              <AppText weight="semibold">Select a farm to manage</AppText>
              <AppText size="small" tone="secondary">
                Profile details and appearance are specific to the selected
                farm.
              </AppText>
            </Card>
          )}
        </ScrollView>
        {selectedFarm ? (
          <View
            style={[
              styles.saveBar,
              {
                backgroundColor: theme.backgroundElement,
                borderTopColor: theme.border,
              },
            ]}
          >
            <View style={styles.saveStatus}>
              <Ionicons
                name={hasUnsavedChanges ? "ellipse" : "checkmark-circle"}
                size={15}
                color={hasUnsavedChanges ? theme.primary : theme.textSecondary}
              />
              <AppText size="small" tone="secondary">
                {hasUnsavedChanges ? "Unsaved changes" : "All changes saved"}
              </AppText>
            </View>
            {form.formState.errors.root?.message ? (
              <View accessibilityRole="alert" style={styles.saveError}>
                <Ionicons
                  name="alert-circle-outline"
                  size={17}
                  color={theme.danger}
                />
                <AppText size="small" style={{ color: theme.danger, flex: 1 }}>
                  {form.formState.errors.root.message}
                </AppText>
              </View>
            ) : null}
            <Button
              label="Save changes"
              loading={form.formState.isSubmitting}
              disabled={!hasUnsavedChanges}
              style={{ opacity: hasUnsavedChanges ? 1 : 0.55 }}
              onPress={() => void form.handleSubmit(submit)()}
            />
          </View>
        ) : null}
      </SafeAreaView>
      <DeletionConfirmationSheet
        visible={farmDeletionSheetOpen}
        title="Schedule this farm for deletion?"
        subject={selectedFarm?.name ?? "Selected farm"}
        description="This starts a 30-day recovery period. The farm is hidden from the workspace during that time; after the deadline, its records are permanently removed."
        recoveryDescription="The farm and its records remain recoverable until the deadline. No action is needed to continue deletion."
        confirmationPhrase={selectedFarm?.name ?? ""}
        busy={scheduleDeletion.isPending}
        error={farmDeletionError}
        onDismiss={() => setFarmDeletionSheetOpen(false)}
        onConfirm={submitFarmDeletion}
      />
    </KeyboardAvoidingView>
  );
}

function FarmMemberProfile({ farm, userId }: { farm: Farm; userId: string }) {
  const { theme } = useTheme();
  const { refreshFarms } = useFarm();
  const dialog = useAppDialog();
  const leaveMutation = useLeaveFarm(userId, farm.id);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { uri: logoUri } = useFarmLogo(farm.settings?.logo_path);

  async function leaveSelectedFarm() {
    if (!password) return;
    const confirmed = await dialog.confirmDialog({
      title: `Leave ${farm.name}?`,
      message:
        "Your farm access will end immediately. The farm and its records will remain with the owner.",
      confirmLabel: "Leave farm",
      destructive: true,
    });
    if (!confirmed) return;

    setError(null);
    try {
      const emailStatus = await leaveMutation.mutateAsync(password);
      setPassword("");
      await refreshFarms();
      await dialog.showDialog({
        title: "You’ve left the farm",
        message: [
          emailStatus.owner_email_sent
            ? "The farm owner has been emailed."
            : "We couldn’t email the farm owner. Please contact them directly if they need to know.",
          emailStatus.member_email_sent
            ? "A confirmation was sent to your FarmTrack sign-in email."
            : "We couldn’t send your confirmation email.",
          "The farm and its records were not deleted.",
        ].join(" "),
        tone:
          emailStatus.owner_email_sent && emailStatus.member_email_sent
            ? "success"
            : "warning",
      });
      router.replace("/(tabs)");
    } catch (leaveError: unknown) {
      setError(normalizeApiError(leaveError).message);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <FarmPageHeader title="Farm profile" showBack />
          <FarmSelector />
          <Card style={styles.memberHero}>
            <View
              style={[
                styles.memberLogo,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              {logoUri ? (
                <Image
                  source={{ uri: logoUri }}
                  contentFit="cover"
                  style={styles.memberLogoImage}
                  accessibilityLabel={`${farm.name} logo`}
                />
              ) : (
                <Ionicons
                  name="business-outline"
                  size={26}
                  color={theme.primary}
                />
              )}
            </View>
            <View style={styles.memberHeroCopy}>
              <AppText size="heading" weight="semibold">
                {farm.name}
              </AppText>
              <View
                style={[
                  styles.memberAccessBadge,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons
                  name="eye-outline"
                  size={14}
                  color={theme.textSecondary}
                />
                <AppText size="small" weight="semibold" tone="secondary">
                  Member view
                </AppText>
              </View>
            </View>
          </Card>

          <Card style={styles.memberDetailsCard}>
            <View style={styles.memberSectionHeading}>
              <View
                style={[
                  styles.sectionIcon,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={20}
                  color={theme.primary}
                />
              </View>
              <View style={styles.sectionHeadingCopy}>
                <AppText weight="semibold">About this farm</AppText>
                <AppText size="small" tone="secondary">
                  Shared profile information
                </AppText>
              </View>
            </View>
            {farm.description ? (
              <AppText style={styles.memberDescription}>
                {farm.description}
              </AppText>
            ) : null}
            {farm.location ? (
              <FarmReadOnlyDetail
                icon="location-outline"
                label="Location"
                value={farm.location}
              />
            ) : null}
            {farm.phone_number ? (
              <FarmReadOnlyDetail
                icon="call-outline"
                label="Farm contact"
                value={farm.phone_number}
              />
            ) : null}
            {!farm.description && !farm.location && !farm.phone_number ? (
              <AppText size="small" tone="secondary">
                The farm owner hasn’t added any shared profile details yet.
              </AppText>
            ) : null}
            <View
              style={[
                styles.memberPrivacyNote,
                {
                  backgroundColor: theme.backgroundSelected,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={17}
                color={theme.textSecondary}
              />
              <AppText
                size="small"
                tone="secondary"
                style={styles.memberPrivacyCopy}
              >
                Owner account email and private contact details aren’t shown to
                farm members.
              </AppText>
            </View>
          </Card>

          <Card style={styles.memberLeaveCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: reviewOpen }}
              onPress={() => {
                setReviewOpen((open) => !open);
                setError(null);
                setPassword("");
              }}
              style={({ pressed }) => [
                styles.memberLeaveTrigger,
                {
                  backgroundColor: pressed
                    ? theme.backgroundSelected
                    : theme.backgroundElement,
                },
              ]}
            >
              <View
                style={[
                  styles.memberLeaveIcon,
                  {
                    backgroundColor: `${theme.danger}12`,
                    borderColor: `${theme.danger}40`,
                  },
                ]}
              >
                <Ionicons
                  name="exit-outline"
                  size={20}
                  color={theme.danger}
                />
              </View>
              <View style={styles.memberLeaveCopy}>
                <AppText weight="semibold" style={{ color: theme.danger }}>
                  Leave this farm
                </AppText>
                <AppText size="small" tone="secondary">
                  Review what changes before you continue
                </AppText>
              </View>
              <Ionicons
                name={reviewOpen ? "chevron-up" : "chevron-down"}
                size={19}
                color={theme.textSecondary}
              />
            </Pressable>
            {reviewOpen ? (
              <View
                style={[
                  styles.memberLeaveDetails,
                  { borderTopColor: theme.border },
                ]}
              >
                <View
                  style={[
                    styles.memberNotice,
                    {
                      backgroundColor: `${theme.danger}0D`,
                      borderColor: `${theme.danger}40`,
                    },
                  ]}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={19}
                    color={theme.danger}
                  />
                  <AppText size="small" style={styles.memberNoticeCopy}>
                    Your access ends as soon as you leave. The farm and shared
                    records stay with the owner and are not deleted.
                  </AppText>
                </View>
                <View
                  style={[
                    styles.ownerNotice,
                    {
                      backgroundColor: theme.backgroundSelected,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={theme.primary}
                  />
                  <AppText
                    size="small"
                    tone="secondary"
                    style={styles.memberNoticeCopy}
                  >
                    FarmTrack will email the farm owner when you leave and send
                    a confirmation to your sign-in email.
                  </AppText>
                </View>
                <TextField
                  label="Your current password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="password"
                />
                {error ? (
                  <AppText
                    accessibilityRole="alert"
                    size="small"
                    style={{ color: theme.danger }}
                  >
                    {error}
                  </AppText>
                ) : null}
                <View style={styles.memberLeaveActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={leaveMutation.isPending}
                    onPress={() => {
                      setReviewOpen(false);
                      setPassword("");
                      setError(null);
                    }}
                    style={[
                      styles.memberCancelAction,
                      {
                        borderColor: theme.border,
                        opacity: leaveMutation.isPending ? 0.5 : 1,
                      },
                    ]}
                  >
                    <AppText size="small" weight="semibold">
                      Keep my access
                    </AppText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled: !password || leaveMutation.isPending,
                      busy: leaveMutation.isPending,
                    }}
                    disabled={!password || leaveMutation.isPending}
                    onPress={() => void leaveSelectedFarm()}
                    style={({ pressed }) => [
                      styles.memberConfirmAction,
                      {
                        backgroundColor: theme.danger,
                        borderColor: theme.danger,
                        opacity: !password || leaveMutation.isPending ? 0.5 : 1,
                      },
                      pressed &&
                        password &&
                        !leaveMutation.isPending && { opacity: 0.82 },
                    ]}
                  >
                    <AppText
                      size="small"
                      weight="semibold"
                      style={{ color: "#FFFFFF" }}
                    >
                      {leaveMutation.isPending ? "Leaving…" : "Leave farm"}
                    </AppText>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </Card>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function FarmReadOnlyDetail({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.memberDetailRow,
        { borderTopColor: theme.border },
      ]}
    >
      <Ionicons name={icon} size={18} color={theme.textSecondary} />
      <View style={styles.memberDetailCopy}>
        <AppText size="small" tone="secondary">
          {label}
        </AppText>
        <AppText style={styles.memberDetailValue}>{value}</AppText>
      </View>
    </View>
  );
}

function ProfileSection({
  icon,
  title,
  summary,
  expanded,
  onPress,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  summary: string;
  expanded: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <Card style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.sectionTrigger,
          pressed && { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <View
          style={[
            styles.sectionIcon,
            { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <Ionicons name={icon} size={19} color={theme.primary} />
        </View>
        <View style={styles.sectionHeadingCopy}>
          <AppText size="body" weight="semibold">
            {title}
          </AppText>
          <AppText size="small" tone="secondary" numberOfLines={1}>
            {summary}
          </AppText>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={19}
          color={theme.textSecondary}
        />
      </Pressable>
      {expanded ? <View style={styles.sectionBody}>{children}</View> : null}
    </Card>
  );
}

function getDefaultValues(
  selectedFarm: ReturnType<typeof useFarm>["selectedFarm"],
  theme: ReturnType<typeof useTheme>["theme"],
): ProfileFormValues {
  const settings = selectedFarm?.settings;
  return {
    name: selectedFarm?.name ?? "",
    description: selectedFarm?.description ?? "",
    location: selectedFarm?.location ?? "",
    phone_number: selectedFarm?.phone_number ?? "",
    email: selectedFarm?.email ?? "",
    maximum_chicken_capacity:
      selectedFarm?.maximum_chicken_capacity?.toString() ?? "",
    is_active: selectedFarm?.is_active ?? true,
    primary_color: settings?.primary_color ?? "#226B68",
    secondary_color: settings?.secondary_color ?? "#BF6C52",
    theme_mode: settings?.theme_mode ?? "system",
    font_family:
      settings?.font_family?.toLowerCase() === "system" ? "System" : "Inter",
    font_scale: Number(settings?.font_scale ?? 1).toFixed(2),
    currency: settings?.currency ?? theme.currency,
    timezone: settings?.timezone ?? theme.timezone,
  };
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getFontScaleLabel(value: string) {
  const labels: Record<string, string> = {
    "0.75": "Compact",
    "0.90": "Comfort",
    "1.00": "Default",
    "1.15": "Relaxed",
    "1.30": "Large",
    "1.50": "Largest",
  };
  return labels[value] ?? "Custom";
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    gap: 12,
  },
  section: { borderRadius: 15, padding: 0, overflow: "hidden" },
  accessCard: { padding: 0, overflow: "hidden", marginTop: 8 },
  farmDeletionCard: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 16,
  },
  accessTrigger: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  farmDeletionTrigger: {
    minHeight: 72,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(120, 80, 60, 0.25)",
    paddingHorizontal: 14,
  },
  dangerIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  accessCopy: { flex: 1, gap: 3 },
  accessDetails: {
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  deletionTimeline: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  timelineStep: { flexDirection: "row", alignItems: "center", gap: 11 },
  timelineMarker: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 14,
  },
  timelineCopy: { flex: 1, gap: 3 },
  timelineRule: {
    width: 1,
    height: 16,
    marginLeft: 13,
    marginVertical: 4,
  },
  accessStartAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  accessConfirmation: { gap: 10 },
  accessActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
  },
  accessCancelAction: {
    minHeight: 42,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
  },
  accessConfirmAction: {
    minHeight: 42,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
  },
  noFarmCard: { gap: 5, borderRadius: 15 },
  memberHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 18,
    padding: 18,
  },
  memberLogo: {
    width: 58,
    height: 58,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  memberLogoImage: { width: "100%", height: "100%" },
  memberHeroCopy: { flex: 1, minWidth: 0, gap: 8 },
  memberAccessBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  memberDetailsCard: { gap: 13, borderRadius: 16, padding: 16 },
  memberSectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  memberDescription: { lineHeight: 23 },
  memberDetailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  memberDetailCopy: { flex: 1, minWidth: 0, gap: 3 },
  memberDetailValue: { flexShrink: 1 },
  memberPrivacyNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  memberPrivacyCopy: { flex: 1, lineHeight: 20 },
  memberLeaveCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(160, 55, 45, 0.45)",
    borderLeftWidth: 4,
    borderRadius: 16,
    padding: 0,
  },
  memberLeaveTrigger: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  memberLeaveIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 13,
  },
  memberLeaveCopy: { flex: 1, minWidth: 0, gap: 4 },
  memberLeaveDetails: {
    gap: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  memberNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  ownerNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  memberNoticeCopy: { flex: 1, lineHeight: 20 },
  memberLeaveActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 9,
  },
  memberCancelAction: {
    minHeight: 44,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  memberConfirmAction: {
    minHeight: 44,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  sectionTrigger: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sectionBody: { gap: 14, paddingHorizontal: 14, paddingBottom: 15 },
  previewNote: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 9,
    paddingHorizontal: 10,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  sectionHeadingCopy: { flex: 1, minWidth: 0, gap: 2 },
  multiline: { minHeight: 94, textAlignVertical: "top" },
  statusRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  statusIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  switchCopy: { flex: 1, minWidth: 0, gap: 3 },
  fieldGroup: { gap: 8 },
  segmentRow: { flexDirection: "row", gap: 7 },
  segment: {
    flex: 1,
    minHeight: 54,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 5,
  },
  saveBar: {
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  saveStatus: { flexDirection: "row", alignItems: "center", gap: 6 },
  saveError: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
});
