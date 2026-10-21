import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
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
import type { ExpenseCategory } from "@/features/management/api";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme, type ThemeTokens } from "@/providers/theme-provider";

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
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const categories = categoriesQuery.data ?? [];
  const activeCategories = categories.filter((category) => category.is_active);
  const inactiveCategories = categories.filter((category) => !category.is_active);

  async function addCategory() {
    if (newName.trim().length < 2) {
      setError("Enter a category name with at least two characters.");
      return;
    }
    try {
      await createCategory.mutateAsync({ name: newName.trim() });
      setNewName("");
      setError("");
      setFormOpen(false);
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
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
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
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <FarmPageHeader title="Expense categories" showBack />
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <AppText size="small" tone="secondary">
              Categories organize spending across your farm.
            </AppText>
            <AppText size="small" tone="secondary">
              {activeCategories.length} active · {categories.length} total
            </AppText>
          </View>
          <Button
            label={formOpen ? "Close" : "Add category"}
            variant={formOpen ? "secondary" : "primary"}
            onPress={() => {
              setFormOpen((open) => !open);
              setError("");
              setNewName("");
            }}
          />
        </View>
        {categoriesQuery.isLoading ? (
          <LoadingState label="Loading expense categories" />
        ) : categoriesQuery.isError ? (
          <Card style={styles.stateCard}>
            <Ionicons name="cloud-offline-outline" size={22} color={theme.danger} />
            <AppText weight="semibold">Could not load expense categories</AppText>
            <AppText size="small" tone="secondary">{normalizeApiError(categoriesQuery.error).message}</AppText>
            <Button label="Retry" variant="secondary" onPress={() => void categoriesQuery.refetch()} />
          </Card>
        ) : (
          <>
            {formOpen ? (
              <Card style={styles.form}>
                <AppText size="body" weight="semibold">
                  New expense category
                </AppText>
                <TextField
                  label="Category name"
                  value={newName}
                  onChangeText={(value) => {
                    setNewName(value);
                    setError("");
                  }}
                  placeholder="For example, insurance"
                  maxLength={80}
                  onSubmitEditing={() => void addCategory()}
                  returnKeyType="done"
                />
                {error ? (
                  <View accessibilityRole="alert" style={styles.error}>
                    <Ionicons name="alert-circle-outline" size={17} color={theme.danger} />
                    <AppText size="small" style={{ color: theme.danger, flex: 1 }}>
                      {error}
                    </AppText>
                  </View>
                ) : null}
                <View style={styles.formActions}>
                  <Button
                    label="Cancel"
                    variant="secondary"
                    onPress={() => {
                      setFormOpen(false);
                      setNewName("");
                      setError("");
                    }}
                  />
                  <Button
                    label="Add category"
                    loading={createCategory.isPending}
                    disabled={!newName.trim()}
                    onPress={() => void addCategory()}
                  />
                </View>
              </Card>
            ) : null}
            {error && !formOpen ? (
              <View style={styles.error}>
                <Ionicons name="alert-circle-outline" size={17} color={theme.danger} />
                <AppText size="small" style={{ color: theme.danger, flex: 1 }}>{error}</AppText>
              </View>
            ) : null}
            <View style={styles.categoriesSection}>
              <View style={styles.sectionHeading}>
              <View style={styles.sectionHeadingCopy}>
                <AppText size="body" weight="semibold">Active categories</AppText>
                <AppText size="small" tone="secondary">
                  Used to classify new expenses.
                </AppText>
              </View>
              <AppText size="small" tone="secondary">{activeCategories.length}</AppText>
              </View>
              {activeCategories.length ? (
              <View style={[styles.categoryList, { borderTopColor: theme.border }]}>
                {activeCategories.map((category) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    editing={editingId === category.id}
                    editingName={editingName}
                    updating={updateCategory.isPending}
                    onChangeName={(value) => { setEditingName(value); setError(""); }}
                    onRename={() => {
                      setEditingId(category.id);
                      setEditingName(category.name);
                      setError("");
                    }}
                    onSave={() => void saveCategory(category.id)}
                    onCancel={() => { setEditingId(""); setError(""); }}
                    onToggle={() => void toggleCategory(category.id, category.is_active, category.name)}
                  />
                ))}
              </View>
              ) : (
              <View style={styles.emptyState}>
                <Ionicons name="pricetag-outline" size={20} color={theme.textSecondary} />
                <AppText size="small" tone="secondary">No active categories yet. Add one above.</AppText>
              </View>
              )}
            </View>
            {inactiveCategories.length ? (
              <View style={styles.categoriesSection}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showInactive }}
                onPress={() => setShowInactive((visible) => !visible)}
                style={[styles.inactiveToggle, { borderTopColor: theme.border }]}
              >
                <View style={styles.inactiveToggleCopy}>
                  <Ionicons name="archive-outline" size={17} color={theme.textSecondary} />
                  <AppText size="small" weight="semibold">Inactive categories</AppText>
                  <AppText size="small" tone="secondary">{inactiveCategories.length}</AppText>
                </View>
                <Ionicons
                  name={showInactive ? "chevron-up" : "chevron-down"}
                  size={17}
                  color={theme.textSecondary}
                />
              </Pressable>
              {showInactive ? (
                <View style={[styles.categoryList, { borderTopColor: theme.border }]}>
                  {inactiveCategories.map((category) => (
                    <CategoryRow
                      key={category.id}
                      category={category}
                      editing={editingId === category.id}
                      editingName={editingName}
                      updating={updateCategory.isPending}
                      onChangeName={(value) => { setEditingName(value); setError(""); }}
                      onRename={() => {
                        setEditingId(category.id);
                        setEditingName(category.name);
                        setError("");
                      }}
                      onSave={() => void saveCategory(category.id)}
                      onCancel={() => { setEditingId(""); setError(""); }}
                      onToggle={() => void toggleCategory(category.id, category.is_active, category.name)}
                    />
                  ))}
                </View>
              ) : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CategoryRow({
  category,
  editing,
  editingName,
  updating,
  onChangeName,
  onRename,
  onSave,
  onCancel,
  onToggle,
}: {
  category: ExpenseCategory;
  editing: boolean;
  editingName: string;
  updating: boolean;
  onChangeName: (value: string) => void;
  onRename: () => void;
  onSave: () => void;
  onCancel: () => void;
  onToggle: () => void;
}) {
  const { theme } = useTheme();
  const presentation = categoryPresentation(category.key, theme);

  return (
    <View style={[styles.categoryRow, { borderBottomColor: theme.border }]}>
      <View
        style={[
          styles.categoryIcon,
          { backgroundColor: `${presentation.color}18` },
        ]}
      >
        <Ionicons
          name={presentation.icon}
          size={17}
          color={presentation.color}
        />
      </View>
      {editing ? (
        <TextInput
          accessibilityLabel="Edit category name"
          value={editingName}
          onChangeText={onChangeName}
          maxLength={80}
          returnKeyType="done"
          onSubmitEditing={onSave}
          style={[
            styles.editInput,
            {
              backgroundColor: theme.background,
              borderColor: theme.border,
              color: theme.text,
              fontFamily: theme.fontFamily,
            },
          ]}
        />
      ) : (
        <View style={styles.categoryCopy}>
          <View style={styles.categoryNameRow}>
            <AppText size="small" weight="semibold" numberOfLines={1}>
              {category.name}
            </AppText>
            {category.is_default ? (
              <View style={[styles.defaultBadge, { backgroundColor: theme.backgroundSelected }]}>
                <AppText size="small" style={styles.defaultBadgeText}>
                  Default
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText size="small" tone="secondary" numberOfLines={1}>
            {category.is_default ? "FarmTrack category" : "Custom category"}
          </AppText>
        </View>
      )}
      {editing ? (
        <View style={styles.rowActions}>
          <CategoryIconButton
            label="Save category name"
            icon={updating ? "ellipsis-horizontal" : "checkmark"}
            color={theme.success}
            disabled={updating}
            onPress={onSave}
          />
          <CategoryIconButton
            label="Cancel editing"
            icon="close"
            color={theme.textSecondary}
            disabled={updating}
            onPress={onCancel}
          />
        </View>
      ) : (
        <View style={styles.rowActions}>
          <CategoryIconButton
            label={`Rename ${category.name}`}
            icon="create-outline"
            color={theme.primary}
            onPress={onRename}
          />
          <CategoryIconButton
            label={category.is_active ? `Deactivate ${category.name}` : `Reactivate ${category.name}`}
            icon={category.is_active ? "archive-outline" : "refresh-outline"}
            color={category.is_active ? theme.danger : theme.success}
            disabled={updating}
            onPress={onToggle}
          />
        </View>
      )}
    </View>
  );
}

function CategoryIconButton({
  label,
  icon,
  color,
  disabled = false,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconAction,
        { opacity: disabled ? 0.45 : pressed ? 0.6 : 1 },
      ]}
    >
      <Ionicons name={icon} size={18} color={color} />
    </Pressable>
  );
}

function categoryPresentation(
  key: string,
  theme: ThemeTokens,
): { icon: keyof typeof Ionicons.glyphMap; color: string } {
  const known: Record<
    string,
    { icon: keyof typeof Ionicons.glyphMap; color: string }
  > = {
    feed: { icon: "leaf-outline", color: theme.success },
    medication: { icon: "medkit-outline", color: "#8057B7" },
    veterinary: { icon: "fitness-outline", color: theme.danger },
    labor: { icon: "people-outline", color: "#B66A28" },
    utilities: { icon: "flash-outline", color: "#B18400" },
    transport: { icon: "car-outline", color: "#3479A8" },
    repairs: { icon: "construct-outline", color: theme.secondary },
    rent: { icon: "home-outline", color: "#458477" },
    equipment: { icon: "build-outline", color: "#5968B0" },
    packaging: { icon: "cube-outline", color: "#368B9B" },
    other: { icon: "pricetag-outline", color: theme.textSecondary },
  };
  return (
    known[key] ?? {
      icon: "pricetag-outline",
      color: theme.primary,
    }
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 30,
    gap: 18,
  },
  card: { gap: 10, borderRadius: 8 },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  headingCopy: { flex: 1, gap: 2 },
  stateCard: { alignItems: "flex-start", gap: 9, borderRadius: 8 },
  form: { gap: 12, borderRadius: 8 },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionHeadingCopy: { flex: 1, gap: 2 },
  categoriesSection: { gap: 8 },
  categoryList: { borderTopWidth: StyleSheet.hairlineWidth },
  categoryRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  categoryIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  categoryCopy: { flex: 1, minWidth: 0, gap: 2 },
  categoryNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  defaultBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  defaultBadgeText: { fontSize: 10, lineHeight: 14 },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 2 },
  iconAction: {
    width: 34,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  editInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 9,
    fontSize: 14,
  },
  inactiveToggle: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 7,
  },
  inactiveToggleCopy: { flexDirection: "row", alignItems: "center", gap: 8 },
  emptyState: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  error: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 2,
  },
});
