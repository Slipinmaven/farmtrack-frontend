import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
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
        automaticallyAdjustKeyboardInsets
      >
        <FarmPageHeader title="Measurement units" showBack />
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <AppText size="heading" weight="semibold" style={styles.libraryTitle}>
              Unit library
            </AppText>
            <AppText size="small" tone="secondary">
              Units are shared across products and farm records.
            </AppText>
          </View>
          <View style={styles.headerActions}>
            {units.data?.length ? (
              <View
                style={[
                  styles.totalBadge,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                  {units.data.length}
                </AppText>
              </View>
            ) : null}
            <Button
              label={formOpen ? "Close" : "Add unit"}
              variant={formOpen ? "secondary" : "primary"}
              style={styles.headerButton}
              onPress={() => {
                if (formOpen) clearForm();
                else setFormOpen(true);
              }}
            />
          </View>
        </View>
        {returnToProductForm ? (
          <View
            style={[
              styles.returnNote,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Ionicons name="information-circle-outline" size={18} color={theme.primary} />
            <AppText size="small" style={styles.returnCopy}>
              Create a unit to use as your product’s main counting unit. We’ll
              return you to product setup after it’s saved.
            </AppText>
          </View>
        ) : null}

        {formOpen ? (
          <Card style={[styles.form, { borderColor: theme.primary }]}>
            <View style={styles.formHeading}>
              <View
                style={[
                  styles.formIcon,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons
                  name={editingId ? "create-outline" : "add-outline"}
                  size={18}
                  color={theme.primary}
                />
              </View>
              <View style={styles.formHeadingCopy}>
                <AppText size="body" weight="semibold" style={styles.formTitle}>
                  {editingId ? "Edit unit" : "Create a unit"}
                </AppText>
                <AppText size="small" tone="secondary">
                  Add a name and the short form used in records.
                </AppText>
              </View>
            </View>
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
                  style={styles.compactInput}
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
                  style={styles.compactInput}
                />
              </View>
            </View>
            <View
              style={[
                styles.preview,
                { borderColor: theme.border },
              ]}
            >
              <View
                style={[
                  styles.previewBadge,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: theme.primary }}
                  numberOfLines={1}
                >
                  {abbreviation.trim() || "UNIT"}
                </AppText>
              </View>
              <View style={styles.previewCopy}>
                <AppText size="small" tone="secondary">
                  PREVIEW
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
              <Button
                label="Cancel"
                variant="secondary"
                style={styles.compactAction}
                onPress={clearForm}
              />
              <Button
                label={editingId ? "Save changes" : "Create unit"}
                loading={create.isPending || update.isPending}
                disabled={!name.trim() || !abbreviation.trim()}
                style={styles.compactAction}
                onPress={() => void saveUnit()}
              />
            </View>
          </Card>
        ) : null}

        <View style={styles.listHeading}>
          <View style={styles.listHeadingCopy}>
            <AppText size="heading" weight="semibold" style={styles.sectionTitle}>
              Your units
            </AppText>
            {units.data?.length ? (
              <AppText size="small" tone="secondary">
                Manage the units used across your records.
              </AppText>
            ) : null}
          </View>
        </View>
        {units.data?.length ? (
          <View
            style={[
              styles.searchField,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
            <Ionicons name="search-outline" size={17} color={theme.textSecondary} />
            <TextInput
              accessibilityLabel="Search units"
              placeholder="Search units"
              placeholderTextColor={theme.textSecondary}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              style={[styles.searchInput, { color: theme.text, fontFamily: theme.fontFamily }]}
            />
          </View>
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
        {filteredUnits.length ? (
          <Card style={[styles.unitList, { borderColor: theme.border }]}>
            {filteredUnits.map((unit, index) => (
              <View
                key={unit.id}
                style={[
                  styles.unitRow,
                  index < filteredUnits.length - 1 && {
                    borderBottomColor: theme.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <View
                  style={[
                    styles.unitBadge,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: theme.primary }}
                    numberOfLines={1}
                  >
                    {unit.abbreviation}
                  </AppText>
                </View>
                <View style={styles.unitCopy}>
                  <AppText weight="semibold" numberOfLines={1}>
                    {unit.name}
                  </AppText>
                  <AppText size="small" tone="secondary" numberOfLines={1}>
                    {unit.abbreviation} · Measurement unit
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
                      opacity: pressed ? 0.65 : 1,
                    },
                  ]}
                >
                  <Ionicons name="create-outline" size={17} color={theme.primary} />
                </Pressable>
              </View>
            ))}
          </Card>
        ) : null}
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
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 32,
    gap: 16,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  headingCopy: { flex: 1, gap: 4 },
  libraryTitle: { fontSize: 21, lineHeight: 28 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  totalBadge: {
    minWidth: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    paddingHorizontal: 8,
  },
  headerButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 7 },
  compactAction: { minHeight: 40, paddingHorizontal: 13 },
  returnNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  returnCopy: { flex: 1, lineHeight: 18 },
  form: { gap: 13, borderRadius: 10, padding: 14 },
  formHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  formIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  formHeadingCopy: { flex: 1, gap: 1 },
  formTitle: { fontSize: 18, lineHeight: 24 },
  fields: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  nameField: { flex: 1 },
  abbreviationField: { width: 104 },
  compactInput: { minHeight: 44, paddingVertical: 8, fontSize: 15 },
  preview: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  previewBadge: {
    minWidth: 48,
    maxWidth: 86,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    paddingHorizontal: 8,
  },
  previewCopy: { flex: 1, gap: 1 },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  searchField: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 8, fontSize: 14 },
  saveError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 7,
    padding: 10,
  },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
    marginBottom: -5,
  },
  listHeadingCopy: { flex: 1, gap: 1 },
  sectionTitle: { fontSize: 21, lineHeight: 28 },
  state: { gap: 10, borderRadius: 9 },
  emptyState: { alignItems: "flex-start", gap: 10, borderRadius: 10 },
  emptyIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  unitList: { padding: 0, borderRadius: 10, overflow: "hidden" },
  unitRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  unitBadge: {
    minWidth: 46,
    maxWidth: 76,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 7,
  },
  unitCopy: { flex: 1, minWidth: 0, gap: 1 },
  editButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
});
