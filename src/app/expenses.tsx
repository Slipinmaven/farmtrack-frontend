import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
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
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TextField } from "@/components/ui/text-field";
import { useBlockSearch } from "@/features/blocks/hooks";
import {
  getExpenseDisplayName,
  type ExpenseRecord,
  type SettlementPaymentMethod,
} from "@/features/management/api";
import {
  useContacts,
  useCreateExpense,
  useExpenseCategories,
  useExpenseSummary,
  useInfiniteExpenses,
} from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const categoryIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  feed_and_nutrition: "leaf-outline",
  medication_veterinary: "medkit-outline",
  labour: "people-outline",
  utilities: "flash-outline",
  transport: "car-outline",
  repairs_maintenance: "hammer-outline",
  equipment: "construct-outline",
  housing_facilities: "home-outline",
  packaging: "cube-outline",
  administration: "document-text-outline",
  other: "ellipsis-horizontal-circle-outline",
};

const paymentMethods: { value: SettlementPaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

export default function ExpensesRoute() {
  return (
    <SessionGate>
      <ExpensesContent />
    </SessionGate>
  );
}

function ExpensesContent() {
  const params = useLocalSearchParams<{ new?: string }>();
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const farmId = farm.selectedFarm?.id;
  const categoriesQuery = useExpenseCategories(user?.id, farmId);
  const allCategoriesQuery = useExpenseCategories(user?.id, farmId, true);
  const categories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data],
  );
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [paidNow, setPaidNow] = useState("");
  const [expenseName, setExpenseName] = useState("");
  const [expenseDate, setExpenseDate] = useState(today());
  const [paymentMethod, setPaymentMethod] =
    useState<SettlementPaymentMethod>("cash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [contactId, setContactId] = useState("");
  const [contactName, setContactName] = useState("");
  const [blockId, setBlockId] = useState("");
  const [blockName, setBlockName] = useState("");
  const [receiptReference, setReceiptReference] = useState("");
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [debouncedContactSearch, setDebouncedContactSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [blockFilter, setBlockFilter] = useState("");
  const [blockFilterName, setBlockFilterName] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [draftCategoryFilter, setDraftCategoryFilter] = useState("all");
  const [draftBlockFilter, setDraftBlockFilter] = useState("");
  const [draftBlockFilterName, setDraftBlockFilterName] = useState("");
  const [draftPaymentStatusFilter, setDraftPaymentStatusFilter] = useState("all");
  const [draftFromDate, setDraftFromDate] = useState("");
  const [draftToDate, setDraftToDate] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(params.new === "1");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pickerMode, setPickerMode] = useState<
    "category" | "block" | "filter_category" | "filter_block" | null
  >(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [debouncedPickerSearch, setDebouncedPickerSearch] = useState("");
  const [error, setError] = useState("");
  const showExpenseForm = formOpen || params.new === "1";
  const summaryQuery = useExpenseSummary(user?.id, farmId, {
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
  });
  const expensesQuery = useInfiniteExpenses(user?.id, farmId, {
    search: debouncedSearch || undefined,
    category: categoryFilter === "all" ? undefined : categoryFilter,
    block_id: blockFilter || undefined,
    payment_status: paymentStatusFilter,
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
  });
  const contactsQuery = useContacts(
    user?.id,
    farmId,
    debouncedContactSearch,
    undefined,
  );
  const blockSearchQuery = useBlockSearch(
    user?.id,
    farmId,
    debouncedPickerSearch,
    pickerMode?.includes("block") ?? false,
  );
  const createExpense = useCreateExpense(user?.id ?? "", farmId ?? "");

  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedContactSearch(contactSearch.trim()),
      250,
    );
    return () => clearTimeout(timeout);
  }, [contactSearch]);
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedPickerSearch(pickerSearch.trim()),
      250,
    );
    return () => clearTimeout(timeout);
  }, [pickerSearch]);

  const expenses = useMemo(
    () => expensesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [expensesQuery.data],
  );
  const totalCount = expensesQuery.data?.pages[0]?.total_count ?? 0;
  const contacts = contactsQuery.data?.pages.flatMap((page) => page) ?? [];
  const amountValue = Number(amount);
  const paidNowValue = paidNow.trim() ? Number(paidNow) : 0;
  const isLoading = expensesQuery.isLoading;
  const availablePickerOptions = useMemo(() => {
    const query = pickerSearch.trim().toLocaleLowerCase();
    if (pickerMode === "category" || pickerMode === "filter_category") {
      return (pickerMode === "category" ? categories : allCategoriesQuery.data ?? categories)
        .filter((item) => !query || item.name.toLocaleLowerCase().includes(query))
        .map((item) => ({ id: item.key, name: item.name }));
    }
    if (pickerMode === "block" || pickerMode === "filter_block") {
      return (blockSearchQuery.data?.pages.flatMap((page) => page) ?? [])
        .filter((item) => !query || item.name.toLocaleLowerCase().includes(query))
        .map((item) => ({ id: item.id, name: item.name }));
    }
    return [];
  }, [allCategoriesQuery.data, blockSearchQuery.data, categories, pickerMode, pickerSearch]);
  const activeFilterCount =
    Number(categoryFilter !== "all") +
    Number(Boolean(blockFilter)) +
    Number(paymentStatusFilter !== "all") +
    Number(Boolean(fromDate)) +
    Number(Boolean(toDate));
  const hasAppliedFilters = Boolean(debouncedSearch || activeFilterCount);
  const activeCategoryName =
    (allCategoriesQuery.data ?? categories).find((item) => item.key === categoryFilter)?.name;
  const activeFilterSummary = [
    activeCategoryName,
    blockFilterName || undefined,
    paymentStatusFilter === "all" ? undefined : humanize(paymentStatusFilter),
    fromDate || toDate ? `${fromDate || "Any date"} – ${toDate || "Today"}` : undefined,
  ].filter(Boolean).join(" · ");

  function openPicker(mode: NonNullable<typeof pickerMode>) {
    setPickerSearch("");
    setPickerMode(mode);
  }

  function openFilters() {
    setDraftCategoryFilter(categoryFilter);
    setDraftBlockFilter(blockFilter);
    setDraftBlockFilterName(blockFilterName);
    setDraftPaymentStatusFilter(paymentStatusFilter);
    setDraftFromDate(fromDate);
    setDraftToDate(toDate);
    setFiltersOpen(true);
  }

  function applyFilters() {
    if (draftFromDate && draftToDate && draftFromDate > draftToDate) {
      return;
    }
    setCategoryFilter(draftCategoryFilter);
    setBlockFilter(draftBlockFilter);
    setBlockFilterName(draftBlockFilterName);
    setPaymentStatusFilter(draftPaymentStatusFilter);
    setFromDate(draftFromDate);
    setToDate(draftToDate);
    setFiltersOpen(false);
  }

  function selectPickerOption(id: string, name = "") {
    switch (pickerMode) {
      case "category":
        setCategory(id);
        setError("");
        break;
      case "block":
        setBlockId(id);
        setBlockName(name);
        break;
      case "filter_category":
        setDraftCategoryFilter(id);
        break;
      case "filter_block":
        setDraftBlockFilter(id);
        setDraftBlockFilterName(name);
        break;
      default:
        break;
    }
    setPickerMode(null);
  }

  function clearFilters() {
    setDraftCategoryFilter("all");
    setDraftBlockFilter("");
    setDraftBlockFilterName("");
    setDraftPaymentStatusFilter("all");
    setDraftFromDate("");
    setDraftToDate("");
  }

  async function submit() {
    if (!farmId) return;
    if (!category || !categories.some((item) => item.key === category && item.is_active)) {
      setError("Choose an expense category.");
      return;
    }
    if (!expenseName.trim()) {
      setError("Enter a meaningful name for this expense.");
      return;
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Enter an expense amount greater than zero.");
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) {
      setError("Enter an amount with no more than two decimal places.");
      return;
    }
    if (amountValue > 9999999999.99) {
      setError("The amount is too large to record.");
      return;
    }
    if (!Number.isFinite(paidNowValue) || paidNowValue < 0 || paidNowValue > amountValue) {
      setError("Amount paid now must be between zero and the expense total.");
      return;
    }
    if (paidNow.trim() && !/^\d+(\.\d{1,2})?$/.test(paidNow.trim())) {
      setError("Enter the amount paid with no more than two decimal places.");
      return;
    }
    setError("");
    try {
      const expense = await createExpense.mutateAsync({
        name: expenseName.trim(),
        category,
        amount: amount.trim(),
        expense_date: expenseDate,
        ...(paidNowValue > 0
          ? {
              initial_payment: {
                amount: paidNow.trim(),
                payment_date: expenseDate,
                payment_method: paymentMethod,
                ...(referenceNumber.trim()
                  ? { reference_number: referenceNumber.trim() }
                  : {}),
              },
            }
          : {}),
        ...(contactId ? { contact_id: contactId } : {}),
        ...(blockId ? { block_id: blockId } : {}),
        ...(receiptReference.trim() ? { receipt_reference: receiptReference.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      setAmount("");
      setPaidNow("");
      setExpenseName("");
      setReferenceNumber("");
      setNotes("");
      setReceiptReference("");
      await dialog.showDialog({
        title: "Expense recorded",
        message: `${formatMoney(Number(expense.amount), theme.currency)} expense saved.`,
        tone: "success",
      });
    } catch (submitError: unknown) {
      const message = normalizeApiError(submitError).message;
      setError(message);
      await dialog.showDialog({
        title: "Couldn’t record expense",
        message,
        tone: "error",
      });
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: theme.background }]}
        edges={["top", "bottom"]}
      >
        <View style={styles.loadingContent}>
          <FarmPageHeader title="Expenses" showBack fallbackHref={"/(tabs)" as Href} />
          <LoadingState label="Loading expenses" />
        </View>
      </SafeAreaView>
    );
  }
  if (!farm.selectedFarm) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: theme.background }]}
        edges={["top", "bottom"]}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <FarmPageHeader title="Expenses" showBack fallbackHref={"/(tabs)" as Href} />
          <Card style={styles.section}>
            <AppText weight="semibold">Choose a farm</AppText>
            <AppText size="small" tone="secondary">
              Select a farm before recording or reviewing expenses.
            </AppText>
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl
            refreshing={
              !showExpenseForm &&
              (expensesQuery.isRefetching ||
                summaryQuery.isRefetching ||
              categoriesQuery.isRefetching ||
              allCategoriesQuery.isRefetching)
            }
            onRefresh={() => {
              if (showExpenseForm) return;
              void Promise.all([
                expensesQuery.refetch(),
                summaryQuery.refetch(),
                categoriesQuery.refetch(),
                allCategoriesQuery.refetch(),
              ]);
            }}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <FarmPageHeader title="Expenses" showBack fallbackHref={"/(tabs)" as Href} />

        {expensesQuery.isError ? (
          <Card style={styles.section}>
            <View style={styles.errorHeading}>
              <Ionicons name="alert-circle-outline" size={20} color={theme.danger} />
              <AppText weight="semibold">Couldn’t load farm expenses</AppText>
            </View>
            <AppText size="small" tone="secondary">
              {normalizeApiError(expensesQuery.error).message}
            </AppText>
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => void expensesQuery.refetch()}
            />
          </Card>
        ) : null}
        {categoriesQuery.isError ? (
          <Card style={styles.section}>
            <View style={styles.errorHeading}>
              <Ionicons name="alert-circle-outline" size={20} color={theme.danger} />
              <AppText weight="semibold">Couldn’t load expense categories</AppText>
            </View>
            <AppText size="small" tone="secondary">
              {normalizeApiError(categoriesQuery.error).message}
            </AppText>
            <Button
              label="Retry categories"
              variant="secondary"
              onPress={() => void categoriesQuery.refetch()}
            />
          </Card>
        ) : null}

        <View style={styles.pageActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showExpenseForm }}
            onPress={() => {
              if (params.new === "1") {
                router.setParams({ new: undefined });
                setFormOpen(false);
              } else {
                setFormOpen((value) => !value);
              }
            }}
            style={[
              styles.newExpenseButton,
              { backgroundColor: theme.primary },
            ]}
          >
            <Ionicons
              name={showExpenseForm ? "close" : "add"}
              size={18}
              color={theme.onPrimary}
            />
            <AppText
              size="small"
              weight="semibold"
              style={{ color: theme.onPrimary }}
            >
              {showExpenseForm ? "Close form" : "New expense"}
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage expense categories"
            onPress={() => router.push("/settings/expense-categories" as Href)}
            style={[
              styles.manageCategoriesButton,
              {
                borderColor: theme.border,
                backgroundColor: theme.backgroundElement,
              },
            ]}
          >
            <Ionicons
              name="pricetags-outline"
              size={16}
              color={theme.textSecondary}
            />
            <AppText size="small" weight="semibold">
              Categories
            </AppText>
          </Pressable>
        </View>

        {summaryQuery.isError ? (
          <Card style={[styles.summaryCard, styles.summaryError]}>
            <View style={styles.errorHeading}>
              <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
              <AppText size="small" weight="semibold">
                Couldn’t load expense totals
              </AppText>
            </View>
            <AppText size="small" tone="secondary">
              {normalizeApiError(summaryQuery.error).message}
            </AppText>
            <Button
              label="Retry totals"
              variant="quiet"
              onPress={() => void summaryQuery.refetch()}
            />
          </Card>
        ) : summaryQuery.data ? (
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.summaryHeading}>
              <AppText size="small" weight="semibold">
                Spending overview
              </AppText>
              <AppText size="small" tone="secondary">
                {fromDate || toDate ? "Selected dates" : "All time"}
              </AppText>
            </View>
            <View style={styles.summaryMetrics}>
              <ExpenseMetric
                label="Total"
                value={formatMoney(Number(summaryQuery.data.total_amount), theme.currency)}
                detail={`${summaryQuery.data.expense_count} records`}
                color={theme.text}
              />
              <View
                style={[styles.metricDivider, { borderLeftColor: theme.border }]}
              >
                <ExpenseMetric
                  label="Paid"
                  value={formatMoney(Number(summaryQuery.data.amount_paid), theme.currency)}
                  color={theme.success}
                />
              </View>
              <View
                style={[styles.metricDivider, { borderLeftColor: theme.border }]}
              >
                <ExpenseMetric
                  label="Outstanding"
                  value={formatMoney(Number(summaryQuery.data.balance_due), theme.currency)}
                  color={
                    Number(summaryQuery.data.balance_due) > 0
                      ? theme.danger
                      : theme.textSecondary
                  }
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.summaryLoading}>
            <ActivityIndicator size="small" color={theme.primary} />
            <AppText size="small" tone="secondary">
              Loading spending overview
            </AppText>
          </View>
        )}

        {showExpenseForm ? (
          <Card style={[styles.section, styles.expenseForm]}>
          <TextField
            label="Expense name"
            value={expenseName}
            onChangeText={setExpenseName}
            placeholder="For example, 50 kg layer feed"
            maxLength={120}
          />
          <AppText size="small" weight="semibold">Expense category</AppText>
          <SelectorButton
            label={categories.find((item) => item.key === category)?.name ?? "Choose a category"}
            onPress={() => openPicker("category")}
            accessibilityLabel="Choose expense category"
          />

          <TextField
            label={`Amount (${theme.currency})`}
            value={amount}
            onChangeText={(value) => {
              setAmount(value);
              setError("");
            }}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
          <DatePickerField
            label="Expense date"
            value={expenseDate}
            maximumDate={new Date()}
            onChange={setExpenseDate}
          />

          <TextField
            label={`Amount paid now (${theme.currency}) · optional`}
            value={paidNow}
            onChangeText={(value) => {
              setPaidNow(value);
              setError("");
            }}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />

          {paidNowValue > 0 ? (
            <>
              <View style={styles.paymentHeading}>
                <AppText size="small" weight="semibold">Initial payment method</AppText>
                <AppText size="small" tone="secondary">The remaining amount stays due.</AppText>
              </View>
              <View style={styles.paymentMethods}>
                {paymentMethods.map((method) => {
                  const selected = paymentMethod === method.value;
                  return (
                    <Pressable
                      key={method.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setPaymentMethod(method.value);
                        if (method.value === "cash") setReferenceNumber("");
                        setError("");
                      }}
                      style={[
                        styles.paymentOption,
                        {
                          borderColor: selected ? theme.primary : theme.border,
                          backgroundColor: selected
                            ? theme.backgroundSelected
                            : theme.backgroundElement,
                        },
                      ]}
                    >
                      <AppText
                        size="small"
                        weight={selected ? "semibold" : "regular"}
                        style={{ color: selected ? theme.primary : theme.text }}
                      >
                        {method.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
          {paidNowValue > 0 && paymentMethod !== "cash" ? (
            <TextField
              label="Payment reference (optional)"
              value={referenceNumber}
              onChangeText={(value) => {
                setReferenceNumber(value);
                setError("");
              }}
              placeholder="Enter transaction or receipt reference if available"
              autoCapitalize="characters"
            />
          ) : null}

          <View style={styles.contactSection}>
            <AppText size="small" weight="semibold">Paid to (optional)</AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setContactSearch("");
                setDebouncedContactSearch("");
                setContactPickerOpen(true);
              }}
              style={[
                styles.selector,
                { borderColor: theme.border, backgroundColor: theme.backgroundElement },
              ]}
            >
              <View style={styles.grow}>
                <AppText size="small" weight="semibold">
                  {contactName || "Choose a farm contact"}
                </AppText>
                <AppText size="small" tone="secondary">
                  {contactId ? "Tap to change" : "Supplier or other contact"}
                </AppText>
              </View>
              <Ionicons name="search-outline" size={19} color={theme.primary} />
            </Pressable>
            {contactId ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setContactId("");
                  setContactName("");
                }}
              >
                <AppText size="small" style={{ color: theme.primary }}>
                  Clear contact
                </AppText>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.contactSection}>
            <AppText size="small" weight="semibold">Related block (optional)</AppText>
            <SelectorButton
              label={blockName || "No block"}
              onPress={() => openPicker("block")}
              accessibilityLabel="Choose related block"
              clearLabel={blockId ? "Clear block" : undefined}
              onClear={() => { setBlockId(""); setBlockName(""); }}
            />
          </View>

          <TextField
            label="Receipt link or reference (optional)"
            value={receiptReference}
            onChangeText={setReceiptReference}
            placeholder="Enter a receipt reference or file link"
            autoCapitalize="none"
          />

          <TextField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="What was this expense for?"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {error ? (
            <View style={styles.inlineError}>
              <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
              <AppText size="small" style={{ color: theme.danger, flex: 1 }}>
                {error}
              </AppText>
            </View>
          ) : null}
          <Button
            label="Save expense"
            onPress={() => void submit()}
            loading={createExpense.isPending}
            disabled={createExpense.isPending}
          />
          </Card>
        ) : null}

        <Card style={[styles.section, styles.historyCard]}>
          <View style={styles.historyHeading}>
            <View style={styles.grow}>
              <AppText size="heading" weight="semibold">Expense history</AppText>
              <AppText size="small" tone="secondary">
                Showing {expenses.length} of {totalCount} {totalCount === 1 ? "expense" : "expenses"}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh expenses"
              onPress={() => void expensesQuery.refetch()}
              hitSlop={8}
            >
              {expensesQuery.isRefetching ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Ionicons name="refresh-outline" size={19} color={theme.primary} />
              )}
            </Pressable>
          </View>
          <TextField
            label="Search"
            value={search}
            onChangeText={setSearch}
            placeholder="Name, payee, notes, block, or reference"
            autoCapitalize="none"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Filters${activeFilterCount ? `, ${activeFilterCount} active` : ""}`}
            onPress={openFilters}
            style={[
              styles.filterButton,
              { borderColor: activeFilterCount ? theme.primary : theme.border },
            ]}
          >
            <Ionicons
              name="options-outline"
              size={19}
              color={activeFilterCount ? theme.primary : theme.text}
            />
            <AppText
              size="small"
              weight="semibold"
              style={{ color: activeFilterCount ? theme.primary : theme.text }}
            >
              Filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}
            </AppText>
            {activeFilterSummary ? (
              <AppText size="small" tone="secondary" numberOfLines={1} style={styles.filterSummary}>
                {activeFilterSummary}
              </AppText>
            ) : null}
          </Pressable>
          {search || activeFilterCount ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSearch("");
                setDebouncedSearch("");
                setCategoryFilter("all");
                setBlockFilter("");
                setBlockFilterName("");
                setPaymentStatusFilter("all");
                setFromDate("");
                setToDate("");
              }}
            >
              <AppText size="small" style={{ color: theme.primary }}>Clear all filters</AppText>
            </Pressable>
          ) : null}
          {expenses.length ? (
            <View>
              {expenses.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  currency={theme.currency}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={26} color={theme.textSecondary} />
              <AppText weight="semibold">
                {hasAppliedFilters ? "No expenses match these filters" : "No expenses recorded"}
              </AppText>
              <AppText size="small" tone="secondary" style={styles.centerText}>
                {hasAppliedFilters
                  ? "Try changing the search or filters to see more results."
                  : "Expenses you record for this farm will appear here."}
              </AppText>
            </View>
          )}
          {expensesQuery.hasNextPage ? (
            <Button
              label="Load more expenses"
              variant="secondary"
              loading={expensesQuery.isFetchingNextPage}
              onPress={() => void expensesQuery.fetchNextPage()}
            />
          ) : null}
          {expensesQuery.isFetchNextPageError ? (
            <View style={styles.inlineError}>
              <AppText size="small" style={{ color: theme.danger, flex: 1 }}>
                Couldn’t load more expenses: {normalizeApiError(expensesQuery.error).message}
              </AppText>
              <Button
                label="Retry"
                variant="quiet"
                onPress={() => void expensesQuery.fetchNextPage()}
              />
            </View>
          ) : null}
        </Card>
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={filtersOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFiltersOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalRoot}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close expense filters"
            onPress={() => setFiltersOpen(false)}
            style={styles.scrim}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={[
              styles.modalSheet,
              styles.filterSheet,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
            <View style={styles.modalHeading}>
              <View style={styles.grow}>
                <AppText size="heading" weight="semibold">Filter expenses</AppText>
                <AppText size="small" tone="secondary">
                  Narrow results by date, category, block, or payment status.
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close expense filters"
                onPress={() => setFiltersOpen(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={23} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.filterForm}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
            >
              <SelectorButton
                title="Category"
                label={
                  draftCategoryFilter === "all"
                    ? "All categories"
                    : (allCategoriesQuery.data ?? categories)
                        .find((item) => item.key === draftCategoryFilter)?.name ?? "Category"
                }
                onPress={() => openPicker("filter_category")}
              />
              <SelectorButton
                title="Block"
                label={
                  draftBlockFilter
                    ? draftBlockFilterName || "Selected block"
                    : "All blocks"
                }
                onPress={() => openPicker("filter_block")}
              />
              <View style={styles.dateFilters}>
                <DatePickerField
                  label="From"
                  value={draftFromDate}
                  maximumDate={draftToDate ? new Date(`${draftToDate}T12:00:00`) : new Date()}
                  onChange={setDraftFromDate}
                  style={styles.dateFilter}
                />
                <DatePickerField
                  label="To"
                  value={draftToDate}
                  minimumDate={draftFromDate ? new Date(`${draftFromDate}T12:00:00`) : undefined}
                  maximumDate={new Date()}
                  onChange={setDraftToDate}
                  style={styles.dateFilter}
                />
              </View>
              <View style={styles.statusFilter}>
                <AppText size="small" weight="semibold">Payment status</AppText>
                <View style={styles.statusOptions}>
                  {[
                    ["all", "All"],
                    ["paid", "Paid"],
                    ["partial", "Partially paid"],
                    ["unpaid", "Unpaid"],
                    ["cancelled", "Cancelled"],
                  ].map(([value, label]) => (
                    <FilterChip
                      key={value}
                      label={label}
                      selected={draftPaymentStatusFilter === value}
                      onPress={() => setDraftPaymentStatusFilter(value)}
                    />
                  ))}
                </View>
              </View>
              {draftFromDate && draftToDate && draftFromDate > draftToDate ? (
                <AppText size="small" style={{ color: theme.danger }}>
                  The start date must be on or before the end date.
                </AppText>
              ) : null}
            </ScrollView>
            <View style={styles.filterActions}>
              <Button label="Reset" variant="quiet" onPress={clearFilters} />
              <Button
                label="Apply filters"
                onPress={applyFilters}
                disabled={Boolean(draftFromDate && draftToDate && draftFromDate > draftToDate)}
              />
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={pickerMode !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerMode(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalRoot}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close selection list"
            onPress={() => setPickerMode(null)}
            style={styles.scrim}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={[
              styles.modalSheet,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
            <View style={styles.modalHeading}>
              <View style={styles.grow}>
                <AppText size="heading" weight="semibold">
                  {pickerMode?.includes("category") ? "Choose a category" : "Choose a block"}
                </AppText>
                <AppText size="small" tone="secondary">
                  Search the farm’s {pickerMode?.includes("category") ? "expense categories" : "blocks"}.
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close selection list"
                onPress={() => setPickerMode(null)}
                hitSlop={10}
              >
                <Ionicons name="close" size={23} color={theme.textSecondary} />
              </Pressable>
            </View>
            <TextField
              label={pickerMode?.includes("category") ? "Search categories" : "Search blocks"}
              value={pickerSearch}
              onChangeText={setPickerSearch}
              placeholder={pickerMode?.includes("category") ? "Type a category name" : "Type a block name"}
              autoCapitalize="none"
            />
            <ScrollView
              contentContainerStyle={styles.pickerResults}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
            >
              {(pickerMode === "category" && categoriesQuery.isLoading) ||
              (pickerMode === "filter_category" && allCategoriesQuery.isLoading) ||
              (pickerMode?.includes("block") &&
                (blockSearchQuery.isFetching ||
                  (pickerSearch.trim() !== debouncedPickerSearch && Boolean(pickerSearch.trim())))) ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : null}
              {pickerMode === "filter_category" ? (
                <PickerOption
                  label="All categories"
                  selected={draftCategoryFilter === "all"}
                  onPress={() => selectPickerOption("all")}
                />
              ) : null}
              {pickerMode === "filter_block" || pickerMode === "block" ? (
                <PickerOption
                  label={pickerMode === "block" ? "No block" : "All blocks"}
                  selected={pickerMode === "block" ? !blockId : !draftBlockFilter}
                  onPress={() => selectPickerOption("")}
                />
              ) : null}
              {availablePickerOptions.map((option) => (
                <PickerOption
                  key={option.id}
                  label={option.name}
                  selected={
                    (pickerMode === "category" && category === option.id) ||
                    (pickerMode === "block" && blockId === option.id) ||
                    (pickerMode === "filter_category" && draftCategoryFilter === option.id) ||
                    (pickerMode === "filter_block" && draftBlockFilter === option.id)
                  }
                  onPress={() => selectPickerOption(option.id, option.name)}
                />
              ))}
              {pickerMode?.includes("block") && blockSearchQuery.hasNextPage ? (
                <Button
                  label="Load more blocks"
                  variant="secondary"
                  loading={blockSearchQuery.isFetchingNextPage}
                  onPress={() => void blockSearchQuery.fetchNextPage()}
                />
              ) : null}
              {!availablePickerOptions.length &&
              !pickerSearch.trim() &&
              !categoriesQuery.isLoading &&
              !allCategoriesQuery.isLoading ? (
                <AppText size="small" tone="secondary" style={styles.centerText}>
                  {pickerMode?.includes("category")
                    ? "No expense categories are available."
                    : "Search by block name to find a block."}
                </AppText>
              ) : !availablePickerOptions.length &&
                pickerSearch.trim() &&
                !categoriesQuery.isLoading &&
                !allCategoriesQuery.isLoading &&
                !blockSearchQuery.isFetching &&
                pickerSearch.trim() === debouncedPickerSearch ? (
                <AppText size="small" tone="secondary" style={styles.centerText}>
                  No matches. Try another search.
                </AppText>
              ) : null}
              {pickerMode?.includes("block") && blockSearchQuery.isError ? (
                <View style={styles.contactError}>
                  <AppText size="small" style={{ color: theme.danger }}>
                    Couldn’t load blocks: {normalizeApiError(blockSearchQuery.error).message}
                  </AppText>
                  <Button label="Retry" variant="quiet" onPress={() => void blockSearchQuery.refetch()} />
                </View>
              ) : null}
              {pickerMode === "category" && categoriesQuery.isError ? (
                <View style={styles.contactError}>
                  <AppText size="small" style={{ color: theme.danger }}>
                    Couldn’t load categories: {normalizeApiError(categoriesQuery.error).message}
                  </AppText>
                  <Button label="Retry" variant="quiet" onPress={() => void categoriesQuery.refetch()} />
                </View>
              ) : null}
              {pickerMode === "filter_category" && allCategoriesQuery.isError ? (
                <View style={styles.contactError}>
                  <AppText size="small" style={{ color: theme.danger }}>
                    Couldn’t load categories: {normalizeApiError(allCategoriesQuery.error).message}
                  </AppText>
                  <Button label="Retry" variant="quiet" onPress={() => void allCategoriesQuery.refetch()} />
                </View>
              ) : null}
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={contactPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setContactPickerOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalRoot}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close contact picker"
            onPress={() => setContactPickerOpen(false)}
            style={styles.scrim}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={[
              styles.modalSheet,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
            <View style={styles.modalHeading}>
              <View style={styles.grow}>
                <AppText size="heading" weight="semibold">Choose a contact</AppText>
                <AppText size="small" tone="secondary">Search farm contacts</AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close contact picker"
                onPress={() => setContactPickerOpen(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={23} color={theme.textSecondary} />
              </Pressable>
            </View>
            <TextField
              label="Search contacts"
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="Type a name"
              autoCapitalize="none"
            />
            <ScrollView
              contentContainerStyle={styles.contactResults}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setContactId("");
                  setContactName("");
                  setContactPickerOpen(false);
                }}
                style={[styles.contactRow, { borderBottomColor: theme.border }]}
              >
                <AppText size="small" weight="semibold">No contact</AppText>
                <AppText size="small" tone="secondary">Leave the payee unassigned</AppText>
              </Pressable>
              {contacts.map((contact) => (
                <Pressable
                  key={contact.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setContactId(contact.id);
                    setContactName(contact.name);
                    setContactPickerOpen(false);
                  }}
                  style={[styles.contactRow, { borderBottomColor: theme.border }]}
                >
                  <AppText size="small" weight="semibold">{contact.name}</AppText>
                  <AppText size="small" tone="secondary">
                    {contact.roles.map(humanize).join(" · ") || "Farm contact"}
                  </AppText>
                </Pressable>
              ))}
              {contactsQuery.isError ? (
                <View style={styles.contactError}>
                  <AppText size="small" style={{ color: theme.danger }}>
                    Couldn’t load contacts: {normalizeApiError(contactsQuery.error).message}
                  </AppText>
                  <Button
                    label="Retry"
                    variant="quiet"
                    onPress={() => void contactsQuery.refetch()}
                  />
                </View>
              ) : contactsQuery.isFetching ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : contacts.length === 0 ? (
                <AppText size="small" tone="secondary" style={styles.centerText}>
                  No matching contacts. You can record the expense without one.
                </AppText>
              ) : null}
              {contactsQuery.hasNextPage ? (
                <Button
                  label="Load more contacts"
                  variant="secondary"
                  loading={contactsQuery.isFetchingNextPage}
                  onPress={() => void contactsQuery.fetchNextPage()}
                />
              ) : null}
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function ExpenseRow({
  expense,
  currency,
}: {
  expense: ExpenseRecord;
  currency: string;
}) {
  const { theme } = useTheme();
  const statusByPayment: Record<
    ExpenseRecord["payment_status"],
    { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
  > = {
    paid: { label: "Paid", color: theme.success, icon: "checkmark-circle-outline" },
    partial: { label: "Partial", color: theme.secondary, icon: "time-outline" },
    unpaid: { label: "Unpaid", color: theme.danger, icon: "alert-circle-outline" },
    cancelled: { label: "Cancelled", color: theme.textSecondary, icon: "close-circle-outline" },
  };
  const status = statusByPayment[expense.payment_status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open expense ${getExpenseDisplayName(expense)}`}
      onPress={() => router.push(`/expenses/${expense.id}` as Href)}
      style={({ pressed }) => [
        styles.expenseRow,
        {
          borderTopColor: theme.border,
          opacity: pressed ? 0.74 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.expenseIcon,
          { backgroundColor: theme.background },
        ]}
      >
        <Ionicons
          name={categoryIcons[expense.category] ?? "pricetag-outline"}
          size={18}
          color={theme.primary}
        />
      </View>
      <View style={styles.expenseCopy}>
        <View style={styles.expenseTopLine}>
          <View style={styles.expenseTitleBlock}>
            <AppText weight="semibold" numberOfLines={1}>
              {getExpenseDisplayName(expense)}
            </AppText>
            <AppText size="small" tone="secondary" numberOfLines={1}>
              {expense.category_name} · {formatExpenseDate(expense.expense_date)}
            </AppText>
          </View>
          <View style={styles.expenseAmountBlock}>
            <AppText size="small" weight="semibold" numberOfLines={1}>
              {formatMoney(Number(expense.amount), currency)}
            </AppText>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: `${status.color}18` },
              ]}
            >
              <Ionicons
                name={status.icon}
                size={12}
                color={status.color}
              />
              <AppText
                size="small"
                weight="semibold"
                style={{ color: status.color }}
              >
                {status.label}
              </AppText>
            </View>
          </View>
        </View>
        <View style={styles.expenseMetaLine}>
          <AppText size="small" tone="secondary" numberOfLines={1}>
            Paid {formatMoney(Number(expense.amount_paid), currency)}
          </AppText>
          {Number(expense.balance_due) > 0 ? (
            <AppText size="small" style={{ color: theme.danger }} numberOfLines={1}>
              Due {formatMoney(Number(expense.balance_due), currency)}
            </AppText>
          ) : null}
          {expense.contact_name || expense.block_name ? (
            <AppText size="small" tone="secondary" numberOfLines={1} style={styles.expenseContext}>
              {[expense.contact_name, expense.block_name].filter(Boolean).join(" · ")}
            </AppText>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />
    </Pressable>
  );
}

function ExpenseMetric({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail?: string;
  color: string;
}) {
  return (
    <View style={styles.metric}>
      <AppText size="small" tone="secondary" numberOfLines={1}>
        {label}
      </AppText>
      <AppText size="small" weight="semibold" style={{ color }} numberOfLines={1}>
        {value}
      </AppText>
      {detail ? (
        <AppText size="small" tone="secondary" numberOfLines={1}>
          {detail}
        </AppText>
      ) : null}
    </View>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
        },
      ]}
    >
      <AppText
        size="small"
        weight={selected ? "semibold" : "regular"}
        style={{ color: selected ? theme.primary : theme.text }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function SelectorButton({
  title,
  label,
  onPress,
  accessibilityLabel,
  clearLabel,
  onClear,
}: {
  title?: string;
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  clearLabel?: string;
  onClear?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.selectorGroup}>
      {title ? <AppText size="small" weight="semibold">{title}</AppText> : null}
      <View style={styles.selectorRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? title}
          onPress={onPress}
          style={[
            styles.selector,
            styles.selectorFill,
            { borderColor: theme.border, backgroundColor: theme.backgroundElement },
          ]}
        >
          <AppText size="small" weight="semibold" numberOfLines={1} style={styles.grow}>
            {label}
          </AppText>
          <Ionicons name="search-outline" size={18} color={theme.primary} />
        </Pressable>
        {clearLabel && onClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={clearLabel}
            onPress={onClear}
            style={[styles.clearSelector, { borderColor: theme.border }]}
          >
            <Ionicons name="close" size={18} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function PickerOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.pickerOption, { borderBottomColor: theme.border }]}
    >
      <AppText size="small" weight={selected ? "semibold" : "regular"} style={styles.grow}>
        {label}
      </AppText>
      {selected ? <Ionicons name="checkmark-circle" size={20} color={theme.primary} /> : null}
    </Pressable>
  );
}

function humanize(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatMoney(value: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function formatExpenseDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}

function today(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboardContainer: { flex: 1 },
  loadingContent: { flex: 1, padding: 16, gap: 16 },
  content: { padding: 14, gap: 12, paddingBottom: 24 },
  section: { gap: 13, borderRadius: 12, padding: 13 },
  grow: { flex: 1, gap: 3 },
  pageActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  newExpenseButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 9,
    paddingHorizontal: 12,
  },
  manageCategoriesButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
  },
  summaryCard: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryError: { backgroundColor: "transparent" },
  summaryHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryMetrics: { flexDirection: "row" },
  metric: { flex: 1, minWidth: 0, gap: 2, paddingRight: 5 },
  metricDivider: {
    flex: 1,
    borderLeftWidth: 1,
    paddingLeft: 9,
  },
  summaryLoading: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 4,
  },
  expenseForm: { gap: 12 },
  dateFilters: { flexDirection: "row", gap: 10 },
  dateFilter: { flex: 1 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentHeading: { gap: 3 },
  paymentMethods: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  paymentOption: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 9 },
  contactSection: { gap: 8 },
  selector: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
    gap: 12,
  },
  inlineError: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  errorHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  historyHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 2,
  },
  historyCard: { gap: 11 },
  filterRow: { flexDirection: "row", gap: 8 },
  filterChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7 },
  filterButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterSummary: { flex: 1 },
  expenseRow: {
    minHeight: 68,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  expenseCopy: { flex: 1, minWidth: 0, gap: 5 },
  expenseTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  expenseTitleBlock: { flex: 1, minWidth: 0, gap: 1 },
  expenseAmountBlock: { alignItems: "flex-end", gap: 3 },
  expenseMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  expenseContext: { flex: 1 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  expenseIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: { alignItems: "center", gap: 9, paddingVertical: 18 },
  centerText: { textAlign: "center" },
  modalRoot: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  scrim: { ...StyleSheet.absoluteFill },
  modalSheet: {
    maxHeight: "82%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  filterSheet: { maxHeight: "90%" },
  filterForm: { gap: 16, paddingBottom: 8 },
  statusFilter: { gap: 8 },
  statusOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  selectorGroup: { gap: 7 },
  selectorRow: { flexDirection: "row", gap: 8 },
  selectorFill: { flex: 1 },
  clearSelector: {
    width: 44,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  modalHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  contactResults: { gap: 0, paddingBottom: 12 },
  pickerResults: { gap: 0, paddingBottom: 12 },
  pickerOption: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  contactRow: { minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: "center", gap: 3 },
  contactError: { gap: 8, paddingVertical: 12 },
});
