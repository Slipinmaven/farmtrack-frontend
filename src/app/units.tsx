import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SessionGate } from "@/components/layout/session-gate";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import {
  useCreateUnit,
  useUnits,
  useUpdateUnit,
} from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";

export default function UnitsScreen() {
  return (
    <SessionGate allowIncompleteSetup>
      <UnitsContent />
    </SessionGate>
  );
}

function UnitsContent() {
  const params = useLocalSearchParams<{ returnToProductForm?: string }>();
  const returnToProductForm = params.returnToProductForm === "true";
  const { user } = useAuth();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const userId = user?.id ?? "";
  const units = useUnits(user?.id);
  const create = useCreateUnit(userId);
  const update = useUpdateUnit(userId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const filteredUnits = (units.data ?? []).filter((unit) =>
    `${unit.name} ${unit.abbreviation}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  function startEdit(unit: { id: string; name: string; abbreviation: string }) {
    setEditingId(unit.id);
    setFormOpen(true);
    setName(unit.name);
    setAbbreviation(unit.abbreviation);
    setError(null);
  }

  function clearForm() {
    setEditingId(null);
    setFormOpen(false);
    setName("");
    setAbbreviation("");
    setError(null);
  }

  async function saveUnit() {
    if (!name.trim() || !abbreviation.trim()) {
      setError("Enter both a unit name and abbreviation.");
      return;
    }
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        abbreviation: abbreviation.trim(),
      };
      if (editingId) {
        await update.mutateAsync({ unitId: editingId, payload });
      } else {
        await create.mutateAsync(payload);
      }
      await dialog.showDialog({
        title: editingId ? "Unit updated" : "Unit created",
        message: editingId
          ? "Your measurement unit has been updated."
          : "Your measurement unit is ready to use.",
        tone: "success",
      });
      if (!editingId && returnToProductForm) {
        router.back();
        return;
      }
      clearForm();
    } catch (submitError) {
      setError(normalizeApiError(submitError).message);
    }
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <FarmPageHeader title="Measurement units" showBack />
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <AppText size="small" tone="secondary">
              Units are shared across products and farm records.
            </AppText>
            <AppText size="small" tone="secondary">
              {units.data?.length ?? 0} measurement units
            </AppText>
          </View>
          <Button
            label={formOpen ? "Close" : "Add unit"}
            variant={formOpen ? "secondary" : "primary"}
            onPress={() => {
              if (formOpen) clearForm();
              else setFormOpen(true);
            }}
          />
        </View>
        {returnToProductForm ? (
          <Card style={styles.returnNote}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color={theme.primary}
            />
            <AppText size="small" style={styles.returnCopy}>
              Create a unit to use as your product’s main counting unit. We’ll
              return you to product setup after it’s saved.
            </AppText>
          </Card>
        ) : null}

        {formOpen ? (
          <Card style={styles.form}>
            <AppText size="heading" weight="semibold">
              {editingId ? "Edit measurement unit" : "New measurement unit"}
            </AppText>
            <View style={styles.fields}>
              <View style={styles.nameField}>
                <TextField
                  label="Unit name"
                  placeholder="e.g. Kilogram"
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    setError(null);
                  }}
                  maxLength={80}
                />
              </View>
              <View style={styles.abbreviationField}>
                <TextField
                  label="Short form"
                  placeholder="e.g. kg"
                  autoCapitalize="none"
                  value={abbreviation}
                  onChangeText={(value) => {
                    setAbbreviation(value);
                    setError(null);
                  }}
                  maxLength={16}
                />
              </View>
            </View>
            <View
              style={[
                styles.preview,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <View
                style={[
                  styles.previewBadge,
                  { backgroundColor: theme.primary },
                ]}
              >
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: theme.onPrimary }}
                  numberOfLines={1}
                >
                  {abbreviation.trim() || "UNIT"}
                </AppText>
              </View>
              <View style={styles.previewCopy}>
                <AppText size="small" tone="secondary">
                  Preview
                </AppText>
                <AppText weight="semibold" numberOfLines={1}>
                  {name.trim() || "Measurement unit"}
                </AppText>
              </View>
            </View>
            {error ? (
              <View
                accessibilityRole="alert"
                style={[
                  styles.saveError,
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
                  {error}
                </AppText>
              </View>
            ) : null}
            <View style={styles.formActions}>
              <Button label="Cancel" variant="secondary" onPress={clearForm} />
              <Button
                label={editingId ? "Save changes" : "Create unit"}
                loading={create.isPending || update.isPending}
                disabled={!name.trim() || !abbreviation.trim()}
                onPress={() => void saveUnit()}
              />
            </View>
          </Card>
        ) : null}

        <View style={styles.listHeading}>
          <AppText size="heading" weight="semibold">
            Your units
          </AppText>
          {units.data?.length ? (
            <AppText size="small" tone="secondary">
              {units.data.length}
            </AppText>
          ) : null}
        </View>
        {units.data?.length ? (
          <TextField
            label="Search units"
            placeholder="Search by name or short form"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
        ) : null}

        {units.isLoading ? (
          <Card>
            <AppText tone="secondary">Loading units…</AppText>
          </Card>
        ) : null}
        {units.isError ? (
          <Card style={styles.state}>
            <AppText weight="semibold">Could not load units</AppText>
            <AppText tone="secondary">
              {normalizeApiError(units.error).message}
            </AppText>
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => void units.refetch()}
            />
          </Card>
        ) : null}
        {!units.isLoading && !units.isError && units.data?.length === 0 ? (
          <Card style={styles.emptyState}>
            <View
              style={[
                styles.emptyIcon,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <Ionicons name="resize-outline" size={23} color={theme.primary} />
            </View>
            <AppText weight="semibold">No measurement units yet</AppText>
            <AppText size="small" tone="secondary">
              Add a unit such as kilograms, trays, or pieces to use with your
              products.
            </AppText>
            <Button label="Add first unit" onPress={() => setFormOpen(true)} />
          </Card>
        ) : null}
        {!units.isLoading &&
        !units.isError &&
        units.data?.length &&
        filteredUnits.length === 0 ? (
          <Card style={styles.state}>
            <AppText weight="semibold">No matching units</AppText>
            <AppText size="small" tone="secondary">
              Try a different name or short form.
            </AppText>
          </Card>
        ) : null}
        {filteredUnits.map((unit) => (
          <Card key={unit.id} style={styles.unitRow}>
            <View
              style={[
                styles.unitBadge,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <AppText
                size="small"
                weight="semibold"
                tone="muted"
                numberOfLines={1}
              >
                {unit.abbreviation}
              </AppText>
            </View>
            <View style={styles.unitCopy}>
              <AppText weight="semibold" numberOfLines={1}>
                {unit.name}
              </AppText>
              <AppText size="small" tone="secondary">
                Short form: {unit.abbreviation}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${unit.name}`}
              hitSlop={8}
              onPress={() => startEdit(unit)}
              style={({ pressed }) => [
                styles.editButton,
                {
                  backgroundColor: theme.backgroundSelected,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons name="create-outline" size={19} color={theme.primary} />
            </Pressable>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 36,
    gap: 14,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headingCopy: { flex: 1, gap: 3 },
  returnNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 12,
  },
  returnCopy: { flex: 1, lineHeight: 19 },
  form: { gap: 14 },
  fields: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  nameField: { flex: 1 },
  abbreviationField: { width: 118 },
  preview: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 6,
    padding: 10,
  },
  previewBadge: {
    minWidth: 50,
    maxWidth: 90,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    paddingHorizontal: 8,
  },
  previewCopy: { flex: 1, gap: 1 },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  saveError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 11,
  },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  state: { gap: 10 },
  emptyState: { alignItems: "flex-start", gap: 10 },
  emptyIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  unitRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  unitBadge: {
    width: 58,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
    paddingHorizontal: 5,
  },
  unitCopy: { flex: 1, gap: 2 },
  editButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
  },
});
