import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import type { ImagePickerAsset } from "expo-image-picker";
import { useEffect, useState } from "react";
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
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { FarmLogoPicker } from "@/features/farms/components/farm-logo-picker";
import { FarmRegionSelector } from "@/features/farms/components/farm-region-selector";
import { FarmSelector } from "@/features/farms/components/farm-selector";
import { FarmThemeSelector } from "@/features/farms/components/farm-theme-selector";
import { FontScaleSelector } from "@/features/farms/components/font-scale-selector";
import {
  useDeleteFarmLogo,
  useUpdateFarm,
  useUpdateFarmSettings,
  useUploadFarmLogo,
} from "@/features/farms/hooks";
import type { ThemeMode } from "@/features/farms/types";
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

export function FarmProfileForm() {
  const { selectedFarm } = useFarm();
  return (
    <FarmProfileFormContent key={selectedFarm?.id ?? "no-selected-farm"} />
  );
}

function FarmProfileFormContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme, setPreview } = useTheme();
  const selectedFarm = farm.selectedFarm;
  const settings = selectedFarm?.settings;
  const userId = user?.id ?? "";
  const farmId = selectedFarm?.id ?? "";
  const updateFarm = useUpdateFarm(userId, farmId);
  const updateSettings = useUpdateFarmSettings(userId, farmId);
  const uploadLogo = useUploadFarmLogo(userId, farmId);
  const deleteLogo = useDeleteFarmLogo(userId, farmId);
  const [logoDraft, setLogoDraft] = useState<{
    farmId: string;
    asset: ImagePickerAsset | null;
    remove: boolean;
  } | null>(null);
  const logoAsset = logoDraft?.farmId === farmId ? logoDraft.asset : null;
  const removeLogo = logoDraft?.farmId === farmId ? logoDraft.remove : false;
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(schema),
    defaultValues: getDefaultValues(selectedFarm, theme),
  });
  const [
    previewPrimary,
    previewSecondary,
    previewMode,
    previewFont,
    previewScale,
  ] = useWatch({
    control: form.control,
    name: [
      "primary_color",
      "secondary_color",
      "theme_mode",
      "font_family",
      "font_scale",
    ],
  });

  useEffect(() => {
    if (
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

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <FarmPageHeader title="Farm profile" showBack />
          <FarmSelector />
          {selectedFarm ? (
            <>
              <AppText tone="secondary" style={styles.intro}>
                Update the identity, contact details, operating capacity, and
                defaults for this farm.
              </AppText>

              <Card style={styles.section}>
                <SectionHeading
                  title="Farm identity"
                  description="The name and description shown across your workspace."
                />
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
              </Card>

              <Card style={styles.section}>
                <SectionHeading
                  title="Contact & location"
                  description="How to find and contact this farm."
                />
                <Controller
                  control={form.control}
                  name="location"
                  render={({ field, fieldState }) => (
                    <TextField
                      label="Location"
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
              </Card>

              <Card style={styles.section}>
                <SectionHeading
                  title="Capacity & status"
                  description="Set a positive bird capacity, or leave it blank if not defined."
                />
                <Controller
                  control={form.control}
                  name="maximum_chicken_capacity"
                  render={({ field, fieldState }) => (
                    <TextField
                      label="Maximum chicken capacity"
                      keyboardType="number-pad"
                      placeholder="Not set"
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <View style={styles.switchRow}>
                      <View style={styles.switchCopy}>
                        <AppText weight="semibold">Farm active</AppText>
                        <AppText size="small" tone="secondary">
                          Inactive farms are hidden from the farm switcher.
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
                      />
                    </View>
                  )}
                />
              </Card>

              <Card style={styles.section}>
                <SectionHeading
                  title="Brand & appearance"
                  description="Set the farm colors, display mode, and reading scale."
                />
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
                            </Pressable>
                          );
                        })}
                      </View>
                      <AppText size="small" tone="secondary">
                        Inter is the bundled display font; System uses the
                        device default.
                      </AppText>
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
              </Card>

              <Card style={styles.section}>
                <SectionHeading
                  title="Regional defaults"
                  description="Used for local time and financial values."
                />
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
              </Card>

              {form.formState.errors.root?.message ? (
                <AppText style={{ color: theme.danger }}>
                  {form.formState.errors.root.message}
                </AppText>
              ) : null}
              <Button
                label="Save farm profile"
                loading={form.formState.isSubmitting}
                disabled={!selectedFarm}
                onPress={form.handleSubmit(submit)}
              />
            </>
          ) : (
            <Card style={styles.section}>
              <AppText weight="semibold">Select a farm to manage</AppText>
              <AppText size="small" tone="secondary">
                Profile details and appearance are specific to the selected
                farm.
              </AppText>
            </Card>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <AppText size="heading" weight="semibold">
        {title}
      </AppText>
      <AppText size="small" tone="secondary">
        {description}
      </AppText>
    </View>
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 40,
    gap: 14,
  },
  intro: { marginBottom: 2 },
  section: { gap: 16 },
  sectionHeading: { gap: 4, marginBottom: 2 },
  multiline: { minHeight: 94, textAlignVertical: "top" },
  switchRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  switchCopy: { flex: 1, gap: 3 },
  fieldGroup: { gap: 8 },
  segmentRow: { flexDirection: "row", gap: 8 },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
  },
});
