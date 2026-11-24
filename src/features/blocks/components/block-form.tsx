import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useRef } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
} from "react-native";
import { z } from "zod";

import { AppText } from "@/components/ui/app-text";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import type { Block, CreateBlockPayload } from "@/features/blocks/types";
import { normalizeApiError } from "@/lib/api/errors";
import { useTheme } from "@/providers/theme-provider";

const schema = z
  .object({
    name: z.string().trim().min(1, "Enter a block name.").max(100),
    description: z.string(),
    capacity: z.string().regex(/^\d+$/, "Enter a whole number."),
    over_capacity_limit: z.string().regex(/^\d+$/, "Enter a whole number."),
    is_active: z.boolean(),
  })
  .transform((values) => ({
    ...values,
    description: values.description.trim() || null,
    capacity: Number(values.capacity),
    over_capacity_limit: Number(values.over_capacity_limit),
  }));
type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

type BlockFormProps = {
  initialBlock?: Block;
  submitLabel: string;
  onSubmit: (payload: CreateBlockPayload) => Promise<void>;
};

export function BlockForm({
  initialBlock,
  submitLabel,
  onSubmit,
}: BlockFormProps) {
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const scrollView = useRef<ScrollViewInstance>(null);
  const nameInput = useRef<TextInputInstance>(null);
  const descriptionInput = useRef<TextInputInstance>(null);
  const capacityInput = useRef<TextInputInstance>(null);
  const extraCapacityInput = useRef<TextInputInstance>(null);
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialBlock?.name ?? "",
      description: initialBlock?.description ?? "",
      capacity: initialBlock?.capacity.toString() ?? "",
      over_capacity_limit: initialBlock?.over_capacity_limit.toString() ?? "0",
      is_active: initialBlock?.is_active ?? true,
    },
  });

  async function submit(values: FormOutput) {
    try {
      await onSubmit(values);
    } catch (error) {
      await dialog.showDialog({
        title: "Couldn’t save block",
        message: normalizeApiError(error).message,
        tone: "error",
      });
    }
  }

  function scrollInputIntoView(input: TextInputInstance | null) {
    if (Platform.OS !== "android" || !input) return;

    setTimeout(() => {
      scrollView.current?.scrollResponderScrollNativeHandleToKeyboard(
        input,
        20,
        true,
      );
    }, 350);
  }

  return (
    <ScrollView
      ref={scrollView}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Card style={styles.form}>
        <View style={styles.sectionHeading}>
          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
            BLOCK DETAILS
          </AppText>
          <AppText size="small" tone="secondary">
            Set a name and its housing capacity.
          </AppText>
        </View>
        <Controller
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <TextField
              ref={nameInput}
              label="Block name"
              placeholder="e.g. North house"
              autoCapitalize="words"
              maxLength={100}
              returnKeyType="next"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              onFocus={() => scrollInputIntoView(nameInput.current)}
              onSubmitEditing={() => descriptionInput.current?.focus()}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={form.control}
          name="description"
          render={({ field }) => (
            <TextField
              ref={descriptionInput}
              label="Description (optional)"
              multiline
              blurOnSubmit
              returnKeyType="next"
              style={styles.multiline}
              value={field.value}
              onChangeText={field.onChange}
              onFocus={() => scrollInputIntoView(descriptionInput.current)}
              onSubmitEditing={() => capacityInput.current?.focus()}
            />
          )}
        />
        <View style={styles.capacitySection}>
          <View style={styles.sectionHeading}>
            <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
              CAPACITY
            </AppText>
            <AppText size="small" tone="secondary">
              Maximum birds = capacity + extra allowance.
            </AppText>
          </View>
          <View style={styles.capacityFields}>
            <Controller
              control={form.control}
              name="capacity"
              render={({ field, fieldState }) => (
                <View style={styles.capacityField}>
                  <TextField
                    ref={capacityInput}
                    label="Base capacity"
                    placeholder="e.g. 500"
                    keyboardType="number-pad"
                    returnKeyType="next"
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    onFocus={() => scrollInputIntoView(capacityInput.current)}
                    onSubmitEditing={() => extraCapacityInput.current?.focus()}
                    error={fieldState.error?.message}
                  />
                </View>
              )}
            />
            <Controller
              control={form.control}
              name="over_capacity_limit"
              render={({ field, fieldState }) => (
                <View style={styles.capacityField}>
                  <TextField
                    ref={extraCapacityInput}
                    label="Extra allowance"
                    placeholder="0"
                    keyboardType="number-pad"
                    returnKeyType="done"
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    onFocus={() => scrollInputIntoView(extraCapacityInput.current)}
                    onSubmitEditing={() => void form.handleSubmit(submit)()}
                    error={fieldState.error?.message}
                  />
                </View>
              )}
            />
          </View>
        </View>
        <Controller
          control={form.control}
          name="is_active"
          render={({ field }) => (
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <AppText weight="semibold">Block active</AppText>
                <AppText size="small" tone="secondary">
                  Inactive blocks cannot receive chicken movements.
                </AppText>
              </View>
              <Switch
                value={field.value}
                onValueChange={field.onChange}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor={theme.backgroundElement}
                accessibilityLabel="Block is active"
              />
            </View>
          )}
        />
        <Button
          label={submitLabel}
          loading={form.formState.isSubmitting}
          onPress={() => void form.handleSubmit(submit)()}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 40,
  },
  form: { gap: 18 },
  sectionHeading: { gap: 3 },
  capacitySection: { gap: 12 },
  multiline: { minHeight: 84, textAlignVertical: "top" },
  capacityFields: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  capacityField: { flex: 1, minWidth: 0 },
  switchRow: {
    minHeight: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  switchCopy: { flex: 1, gap: 3 },
});
