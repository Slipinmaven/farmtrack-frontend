import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [actionCategory, setActionCategory] = useState<ExpenseCategory | null>(null);
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
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
      >
        <FarmPageHeader title="Expense categories" showBack compact />
        <View style={styles.intro}>
          <View style={styles.introCopy}>
            <AppText size="small" tone="secondary">
              Choose a category when recording expenses. Renaming or deactivating one won’t change past records.
            </AppText>
          </View>
          <View style={styles.introAction}>
            <Button
              label={formOpen ? "Close form" : "Add expense category"}
              variant={formOpen ? "secondary" : "primary"}
              onPress={() => {
                setFormOpen((open) => !open);
                setError("");
                setNewName("");
              }}
            />
          </View>
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
                <View style={styles.formHeading}>
                  <View
                    style={[
                      styles.formIcon,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <Ionicons name="pricetag-outline" size={18} color={theme.primary} />
                  </View>
                  <View style={styles.formHeadingCopy}>
                    <AppText size="body" weight="semibold">
                      Add an expense category
                    </AppText>
                    <AppText size="small" tone="secondary">
                      Use a name your team will recognize when recording spending.
                    </AppText>
                  </View>
                </View>
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
            <Card style={styles.categoriesSection}>
              <View style={styles.sectionHeading}>
                <View style={styles.sectionHeadingCopy}>
                  <AppText size="body" weight="semibold">Active categories</AppText>
                  <AppText size="small" tone="secondary">
                    Available when recording a new expense.
                  </AppText>
                </View>
                <View style={[styles.countBadge, { backgroundColor: theme.backgroundSelected }]}>
                  <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                    {activeCategories.length}
                  </AppText>
                </View>
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
                    onSave={() => void saveCategory(category.id)}
                    onCancel={() => { setEditingId(""); setError(""); }}
                    onActions={() => setActionCategory(category)}
                  />
                ))}
              </View>
              ) : (
              <View style={styles.emptyState}>
                <Ionicons name="pricetag-outline" size={20} color={theme.textSecondary} />
                <AppText size="small" tone="secondary">No active categories yet. Add one above.</AppText>
              </View>
              )}
            </Card>
            {inactiveCategories.length ? (
              <Card style={styles.categoriesSection}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${showInactive ? "Hide" : "Show"} ${inactiveCategories.length} inactive categories`}
                accessibilityState={{ expanded: showInactive }}
                onPress={() => setShowInactive((visible) => !visible)}
                style={({ pressed }) => [
                  styles.inactiveToggle,
                  {
                    borderTopColor: theme.border,
                    backgroundColor: pressed
                      ? theme.backgroundSelected
                      : "transparent",
                  },
                ]}
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
                      onSave={() => void saveCategory(category.id)}
                      onCancel={() => { setEditingId(""); setError(""); }}
                      onActions={() => setActionCategory(category)}
                    />
                  ))}
                </View>
              ) : null}
              </Card>
            ) : null}
          </>
        )}
       </ScrollView>
       <CategoryActionsSheet
         category={actionCategory}
         onClose={() => setActionCategory(null)}
         onRename={() => {
           if (!actionCategory) return;
           setEditingId(actionCategory.id);
           setEditingName(actionCategory.name);
           setError("");
           setActionCategory(null);
         }}
         onToggle={() => {
           if (!actionCategory) return;
           const category = actionCategory;
           setActionCategory(null);
           void toggleCategory(category.id, category.is_active, category.name);
         }}
       />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CategoryRow({
  category,
  editing,
  editingName,
  updating,
  onChangeName,
  onSave,
  onCancel,
  onActions,
}: {
  category: ExpenseCategory;
  editing: boolean;
  editingName: string;
  updating: boolean;
  onChangeName: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onActions: () => void;
}) {
  const { theme } = useTheme();
  const icon = categoryIcon(category.key);

  return (
    <View style={[styles.categoryRow, { borderBottomColor: theme.border }]}>
      <View
        style={[
          styles.categoryIcon,
          { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <Ionicons
          name={icon}
          size={17}
          color={theme.primary}
        />
      </View>
      {editing ? (
        <View style={styles.editArea}>
          <TextInput
            accessibilityLabel="Edit category name"
            value={editingName}
            onChangeText={onChangeName}
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={onSave}
            autoFocus
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
          <View style={styles.editActions}>
            <Button
              label="Cancel"
              variant="secondary"
              disabled={updating}
              onPress={onCancel}
            />
            <Button
              label="Save name"
              loading={updating}
              disabled={!editingName.trim()}
              onPress={onSave}
            />
          </View>
        </View>
      ) : (
        <View style={styles.categoryCopy}>
          <View style={styles.categoryNameRow}>
            <AppText size="body" weight="semibold" style={styles.categoryName}>
              {category.name}
            </AppText>
            {category.is_default ? (
              <View style={[styles.defaultBadge, { backgroundColor: theme.backgroundSelected }]}>
                <AppText size="small" weight="semibold" style={{ color: theme.textSecondary }}>
                  Built-in
                </AppText>
              </View>
            ) : null}
          </View>
          {!category.is_active ? (
            <AppText size="small" tone="secondary">
              Not used for new expenses
            </AppText>
          ) : null}
        </View>
      )}
      {!editing ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${category.name}`}
          disabled={updating}
          onPress={onActions}
          style={({ pressed }) => [
            styles.actionsButton,
            {
              backgroundColor: pressed
                ? theme.backgroundSelected
                : theme.background,
              borderColor: theme.border,
              opacity: updating ? 0.5 : 1,
            },
          ]}
        >
          <Ionicons name="ellipsis-horizontal" size={17} color={theme.text} />
          <AppText size="small" weight="semibold">Actions</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function CategoryActionsSheet({
  category,
  onClose,
  onRename,
  onToggle,
}: {
  category: ExpenseCategory | null;
  onClose: () => void;
  onRename: () => void;
  onToggle: () => void;
}) {
  const { theme } = useTheme();
  const isActive = category?.is_active ?? false;

  return (
    <Modal
      visible={category !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.sheetRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close category actions"
          onPress={onClose}
          style={styles.sheetScrim}
        />
        <View
          style={[
            styles.actionSheet,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          <View style={styles.sheetHeading}>
            <View style={styles.sheetHeadingCopy}>
              <AppText size="heading" weight="semibold">
                Category actions
              </AppText>
              {category ? (
                <AppText size="small" tone="secondary">
                  {category.name}
                </AppText>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close category actions"
              onPress={onClose}
              style={styles.sheetClose}
            >
              <Ionicons name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onRename}
            style={({ pressed }) => [
              styles.sheetAction,
              {
                borderTopColor: theme.border,
                backgroundColor: pressed
                  ? theme.backgroundSelected
                  : "transparent",
              },
            ]}
          >
            <View style={[styles.sheetActionIcon, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="create-outline" size={19} color={theme.primary} />
            </View>
            <View style={styles.sheetActionCopy}>
              <AppText weight="semibold">Rename category</AppText>
              <AppText size="small" tone="secondary">
                Update the label shown on expense records.
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={17} color={theme.textSecondary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onToggle}
            style={({ pressed }) => [
              styles.sheetAction,
              {
                borderTopColor: theme.border,
                backgroundColor: pressed
                  ? theme.backgroundSelected
                  : "transparent",
              },
            ]}
          >
            <View
              style={[
                styles.sheetActionIcon,
                {
                  backgroundColor: isActive
                    ? `${theme.danger}18`
                    : `${theme.success}18`,
                },
              ]}
            >
              <Ionicons
                name={isActive ? "archive-outline" : "refresh-outline"}
                size={19}
                color={isActive ? theme.danger : theme.success}
              />
            </View>
            <View style={styles.sheetActionCopy}>
              <AppText weight="semibold">
                {isActive ? "Deactivate category" : "Reactivate category"}
              </AppText>
              <AppText size="small" tone="secondary">
                {isActive
                  ? "Hide it from new expenses; keep past records."
                  : "Make it available for new expenses again."}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={17} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function categoryIcon(key: string): keyof typeof Ionicons.glyphMap {
  const known: Record<string, keyof typeof Ionicons.glyphMap> = {
    administration: "document-text-outline",
    feed_and_nutrition: "leaf-outline",
    medication_veterinary: "medkit-outline",
    labour: "people-outline",
    utilities: "flash-outline",
    transport: "car-outline",
    repairs_maintenance: "construct-outline",
    housing_facilities: "home-outline",
    equipment: "build-outline",
    packaging: "cube-outline",
    other: "pricetag-outline",
  };
  return known[key] ?? "pricetag-outline";
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboardContainer: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 30,
    gap: 14,
  },
  card: { gap: 10, borderRadius: 12 },
  intro: {
    gap: 10,
  },
  introCopy: { minWidth: 0 },
  introAction: { alignItems: "flex-end" },
  countBadge: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  stateCard: { alignItems: "flex-start", gap: 9, borderRadius: 8 },
  form: { gap: 14, borderRadius: 14, padding: 16 },
  formHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  formIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "rgba(34,107,104,0.12)",
  },
  formHeadingCopy: { flex: 1, minWidth: 0, gap: 2 },
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
  categoriesSection: { gap: 12, borderRadius: 15, padding: 15 },
  categoryList: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 2 },
  categoryRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  categoryIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    marginTop: 1,
  },
  categoryCopy: { flex: 1, minWidth: 0, gap: 4 },
  categoryNameRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: 6,
  },
  categoryName: { flexShrink: 1 },
  defaultBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  actionsButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 9,
  },
  editArea: { flex: 1, minWidth: 0, gap: 8 },
  editInput: {
    minWidth: 0,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 11,
    fontSize: 16,
  },
  editActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 7,
  },
  inactiveToggle: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
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
  sheetRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  sheetScrim: { ...StyleSheet.absoluteFill },
  actionSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 17,
    paddingTop: 18,
    paddingBottom: 28,
  },
  sheetHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
  },
  sheetHeadingCopy: { flex: 1, minWidth: 0, gap: 2 },
  sheetClose: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
  },
  sheetAction: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(120,140,140,0.25)",
  },
  sheetActionIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  sheetActionCopy: { flex: 1, minWidth: 0, gap: 2 },
});
