import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import {
  useCreateExpenseCategory,
  useExpenseCategories,
  useUpdateExpenseCategory,
} from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function ExpenseCategoriesRoute() {
  return (
    <SessionGate>
      <ExpenseCategoriesContent />
    </SessionGate>
  );
}

function ExpenseCategoriesContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const farmId = farm.selectedFarm?.id;
  const categoriesQuery = useExpenseCategories(user?.id, farmId, true);
  const createCategory = useCreateExpenseCategory(user?.id ?? "", farmId ?? "");
  const updateCategory = useUpdateExpenseCategory(user?.id ?? "", farmId ?? "");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");
  const categories = categoriesQuery.data ?? [];

  async function addCategory() {
    if (newName.trim().length < 2) {
      setError("Enter a category name with at least two characters.");
      return;
    }
    try {
      await createCategory.mutateAsync({ name: newName.trim() });
      setNewName("");
      setError("");
    } catch (caught) {
      setError(normalizeApiError(caught).message);
    }
  }

  async function saveCategory(categoryId: string) {
    if (editingName.trim().length < 2) {
      setError("Enter a category name with at least two characters.");
      return;
    }
    try {
      await updateCategory.mutateAsync({
        categoryId,
        payload: { name: editingName.trim() },
      });
      setEditingId("");
      setError("");
    } catch (caught) {
      setError(normalizeApiError(caught).message);
    }
  }

  async function toggleCategory(categoryId: string, currentActive: boolean, name: string) {
    const confirmed = await dialog.confirmDialog({
      title: currentActive ? "Deactivate category?" : "Reactivate category?",
      message: currentActive
        ? `${name} will no longer be available for new expenses. Existing records will remain unchanged.`
        : `${name} will be available for new expenses again.`,
      confirmLabel: currentActive ? "Deactivate" : "Reactivate",
      destructive: currentActive,
    });
    if (!confirmed) return;
    try {
      await updateCategory.mutateAsync({
        categoryId,
        payload: { is_active: !currentActive },
      });
      setError("");
    } catch (caught) {
      setError(normalizeApiError(caught).message);
    }
  }

  if (!farm.selectedFarm) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <FarmPageHeader title="Expense categories" showBack />
          <Card style={styles.card}>
            <AppText weight="semibold">Choose a farm</AppText>
            <AppText size="small" tone="secondary">Select a farm before managing its expense categories.</AppText>
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <FarmPageHeader title="Expense categories" showBack />
        <AppText size="small" tone="secondary">
          Categories keep expense reports consistent. Deactivated categories stay attached to historical records.
        </AppText>
        {categoriesQuery.isLoading ? (
          <LoadingState label="Loading expense categories" />
        ) : categoriesQuery.isError ? (
          <Card style={styles.card}>
            <AppText weight="semibold">Could not load expense categories</AppText>
            <AppText size="small" tone="secondary">{normalizeApiError(categoriesQuery.error).message}</AppText>
            <Button label="Retry" variant="secondary" onPress={() => void categoriesQuery.refetch()} />
          </Card>
        ) : (
          <>
            <Card style={styles.card}>
              <AppText size="heading" weight="semibold">Add a category</AppText>
              <TextField
                label="Category name"
                value={newName}
                onChangeText={(value) => { setNewName(value); setError(""); }}
                placeholder="For example, insurance"
                maxLength={80}
              />
              <Button label="Add category" onPress={() => void addCategory()} loading={createCategory.isPending} />
            </Card>
            <Card style={styles.card}>
              <AppText size="heading" weight="semibold">Farm categories</AppText>
              {categories.map((category) => (
                <View key={category.id} style={[styles.category, { borderTopColor: theme.border }]}>
                  {editingId === category.id ? (
                    <>
                      <TextField
                        label="Category name"
                        value={editingName}
                        onChangeText={(value) => { setEditingName(value); setError(""); }}
                        maxLength={80}
                      />
                      <View style={styles.actions}>
                        <Button label="Save name" variant="secondary" onPress={() => void saveCategory(category.id)} loading={updateCategory.isPending} />
                        <Button label="Cancel" variant="quiet" onPress={() => { setEditingId(""); setError(""); }} />
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.titleRow}>
                        <View style={styles.grow}>
                          <AppText weight="semibold">{category.name}</AppText>
                          <AppText size="small" tone="secondary">
                            {category.is_default ? "Default category" : "Custom category"}
                            {category.is_active ? "" : " · Inactive"}
                          </AppText>
                        </View>
                        <Ionicons
                          name={category.is_active ? "checkmark-circle-outline" : "remove-circle-outline"}
                          size={20}
                          color={category.is_active ? theme.success : theme.textSecondary}
                        />
                      </View>
                      <View style={styles.actions}>
                        <Button
                          label="Rename"
                          variant="secondary"
                          onPress={() => { setEditingId(category.id); setEditingName(category.name); setError(""); }}
                        />
                        <Button
                          label={category.is_active ? "Deactivate" : "Reactivate"}
                          variant="quiet"
                          onPress={() => void toggleCategory(category.id, category.is_active, category.name)}
                        />
                      </View>
                    </>
                  )}
                </View>
              ))}
              {!categories.length ? (
                <AppText size="small" tone="secondary">There are no expense categories yet.</AppText>
              ) : null}
            </Card>
          </>
        )}
        {error ? (
          <View style={styles.error}>
            <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
            <AppText size="small" style={{ color: theme.danger, flex: 1 }}>{error}</AppText>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 30 },
  card: { gap: 14 },
  grow: { flex: 1, gap: 3 },
  category: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 10 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  actions: { flexDirection: "row", gap: 8 },
  error: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
});
