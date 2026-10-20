import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { ScrollView, StyleSheet, Switch, View } from "react-native";
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

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Card style={styles.form}>
        <AppText size="small" tone="secondary">
          Keep block capacity aligned with its current chicken occupancy.
        </AppText>
        <Controller
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <TextField
              label="Block name"
              placeholder="e.g. North house"
              autoCapitalize="words"
              maxLength={100}
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
          render={({ field }) => (
            <TextField
              label="Description (optional)"
              multiline
              style={styles.multiline}
              value={field.value}
              onChangeText={field.onChange}
            />
          )}
        />
        <View style={styles.capacityFields}>
          <Controller
            control={form.control}
            name="capacity"
            render={({ field, fieldState }) => (
              <TextField
                label="Base capacity"
                keyboardType="number-pad"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={form.control}
            name="over_capacity_limit"
            render={({ field, fieldState }) => (
              <TextField
                label="Extra allowance"
                keyboardType="number-pad"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
        </View>
        <AppText size="small" tone="secondary">
          Maximum occupancy is the base capacity plus the extra allowance.
        </AppText>
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
          onPress={form.handleSubmit(submit)}
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
    paddingTop: 12,
    paddingBottom: 32,
  },
  form: { gap: 16 },
  multiline: { minHeight: 84, textAlignVertical: "top" },
  capacityFields: { gap: 14 },
  switchRow: {
    minHeight: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  switchCopy: { flex: 1, gap: 3 },
});
