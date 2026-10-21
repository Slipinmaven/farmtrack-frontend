import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TextField } from "@/components/ui/text-field";
import { ContactForm } from "@/features/management/components/contact-form";
import { ProductForm } from "@/features/management/components/product-form";
import {
  useContacts,
  useCreateContact,
  useCreateInventoryPurchase,
  useCreateProduct,
  useProducts,
} from "@/features/management/hooks";
import type {
  CreateContactPayload,
  CreateProductPayload,
  Product,
  SettlementPaymentMethod,
} from "@/features/management/api";
import { getProductTypeLabel } from "@/features/management/product-options";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type PurchaseLine = {
  id: string;
  productId: string;
  unitId: string;
  quantity: string;
  unitPrice: string;
};

const paymentMethods: { value: SettlementPaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

function newLine(): PurchaseLine {
  return {
    id: `${Date.now()}-${Math.random()}`,
    productId: "",
    unitId: "",
    quantity: "",
    unitPrice: "",
  };
}

export default function InventoryPurchaseRoute() {
  return (
    <SessionGate>
      <InventoryPurchaseContent />
    </SessionGate>
  );
}

function InventoryPurchaseContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const { productId: productIdParam } = useLocalSearchParams<{
    productId?: string;
  }>();
  const prefilledProductId = Array.isArray(productIdParam)
    ? productIdParam[0]
    : productIdParam;
  const prefilledProductHandled = useRef(false);
  const farmId = farm.selectedFarm?.id;
  const [supplierSearch, setSupplierSearch] = useState("");
  const [debouncedSupplierSearch, setDebouncedSupplierSearch] = useState("");
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [createSupplierOpen, setCreateSupplierOpen] = useState(false);
  const [selectedSupplierName, setSelectedSupplierName] = useState("");
  const [productPickerLineId, setProductPickerLineId] = useState<string | null>(null);
  const [createProductLineId, setCreateProductLineId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const productsQuery = useProducts(user?.id, farmId);
  const suppliersQuery = useContacts(
    user?.id,
    farmId,
    debouncedSupplierSearch,
    "supplier",
  );
  const createPurchase = useCreateInventoryPurchase(user?.id ?? "", farmId ?? "");
  const createContact = useCreateContact(user?.id ?? "", farmId ?? "");
  const createProduct = useCreateProduct(user?.id ?? "", farmId ?? "");

  const products = useMemo(
    () =>
      (productsQuery.data ?? []).filter(
        (product) =>
          product.is_active &&
          product.product_type !== "chickens" &&
          product.product_type !== "eggs" &&
          product.product_units.length > 0,
      ),
    [productsQuery.data],
  );
  const exactProductMatch = products.some(
    (product) =>
      product.name.trim().toLocaleLowerCase() ===
      productSearch.trim().toLocaleLowerCase(),
  );
  const suppliers = suppliersQuery.data?.pages.flatMap((page) => page) ?? [];
  const [purchaseDate, setPurchaseDate] = useState(today());
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([newLine()]);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<SettlementPaymentMethod>("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedSupplierSearch(supplierSearch.trim()),
      250,
    );
    return () => clearTimeout(timeout);
  }, [supplierSearch]);

  const total = lines.reduce((sum, line) => {
    const quantity = Number(line.quantity);
    const price = Number(line.unitPrice);
    return Number.isFinite(quantity) && Number.isFinite(price)
      ? sum + quantity * price
      : sum;
  }, 0);

  function updateLine(id: string, update: Partial<PurchaseLine>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...update } : line)),
    );
    setError("");
  }

  function selectProduct(line: PurchaseLine, product: Product) {
    const unit =
      product.product_units.find((item) => item.is_base_unit) ??
      product.product_units[0];
    updateLine(line.id, {
      productId: product.id,
      unitId: unit?.unit_id ?? "",
      quantity: "",
      unitPrice: "",
    });
    setProductPickerLineId(null);
  }

  useEffect(() => {
    if (!prefilledProductId || !products.length || prefilledProductHandled.current) {
      return;
    }
    const product = products.find((item) => item.id === prefilledProductId);
    if (!product) return;
    const unit =
      product.product_units.find((item) => item.is_base_unit) ??
      product.product_units[0];
    const frame = requestAnimationFrame(() => {
      prefilledProductHandled.current = true;
      setLines((current) => {
        const firstLine = current[0];
        if (!firstLine || firstLine.productId) return current;
        return [
          {
            ...firstLine,
            productId: product.id,
            unitId: unit?.unit_id ?? "",
          },
          ...current.slice(1),
        ];
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [prefilledProductId, products]);

  function openProductPicker(lineId: string) {
    setProductSearch("");
    setProductPickerLineId(lineId);
  }

  function openCreateProduct(lineId: string, name = "") {
    setCreateProductLineId(lineId);
    setProductSearch(name);
    setProductPickerLineId(null);
    setCreateProductOpen(true);
  }

  async function saveNewProduct(payload: CreateProductPayload) {
    const product = await createProduct.mutateAsync(payload);
    const line = lines.find((item) => item.id === createProductLineId);
    if (line) selectProduct(line, product);
    setCreateProductOpen(false);
    setCreateProductLineId(null);
  }

  async function saveNewSupplier(payload: CreateContactPayload) {
    const supplier = await createContact.mutateAsync({
      ...payload,
      roles: payload.roles.includes("supplier")
        ? payload.roles
        : [...payload.roles, "supplier"],
    });
    setSupplierId(supplier.id);
    setSelectedSupplierName(supplier.name);
    setCreateSupplierOpen(false);
    setSupplierPickerOpen(false);
  }

  async function submit() {
    setError("");
    if (!farmId) {
      setError("Select a farm before recording this purchase.");
      return;
    }
    if (!isValidDate(purchaseDate)) {
      setError("Enter a valid purchase date.");
      return;
    }
    if (!lines.length || lines.some((line) => !line.productId || !line.unitId)) {
      setError("Choose a product and unit for every purchase item.");
      return;
    }
    if (
      lines.some((line) => {
        const quantity = Number(line.quantity);
        const price = Number(line.unitPrice);
        return (
          !Number.isFinite(quantity) ||
          quantity <= 0 ||
          !Number.isFinite(price) ||
          price < 0
        );
      })
    ) {
      setError("Enter a quantity greater than zero and a valid unit price for each item.");
      return;
    }
    if (
      lines.some((line) => {
        const product = products.find((item) => item.id === line.productId);
        return !product?.product_units.some((unit) => unit.unit_id === line.unitId);
      })
    ) {
      setError("A selected unit is not configured for its product. Select it again.");
      return;
    }
    const paid = paymentAmount.trim() ? Number(paymentAmount) : 0;
    if (!Number.isFinite(paid) || paid < 0) {
      setError("Enter a valid amount paid, or leave it blank if unpaid.");
      return;
    }
    if (paid > total) {
      setError("The amount paid cannot exceed the purchase total.");
      return;
    }
    if (paid > 0 && paymentMethod !== "cash" && paymentReference.trim() && !/^[A-Za-z0-9- ]{1,100}$/.test(paymentReference.trim())) {
      setError("Reference must be letters, numbers, spaces, or dashes, with up to 100 characters.");
      return;
    }
    try {
      const purchase = await createPurchase.mutateAsync({
        transaction_date: purchaseDate,
        supplier_id: supplierId || undefined,
        notes: notes.trim() || undefined,
        items: lines.map((line) => ({
          product_id: line.productId,
          unit_id: line.unitId,
          quantity: line.quantity,
          unit_price: line.unitPrice,
        })),
        payments:
          paid > 0
            ? [
                {
                  amount: String(paid),
                  payment_date: purchaseDate,
                  payment_method: paymentMethod,
                  reference_number:
                    paymentMethod === "cash"
                      ? undefined
                      : paymentReference.trim() || undefined,
                },
              ]
            : [],
      });
      if (Number(purchase.balance_due) > 0) {
        const addPayment = await dialog.confirmDialog({
          title: "Purchase recorded",
          message: `${formatMoney(Number(purchase.balance_due), theme.currency)} remains unpaid. Record a payment now?`,
          confirmLabel: "Record payment",
          cancelLabel: "Later",
        });
        if (addPayment) {
          router.replace({
            pathname: "/transactions/[transactionId]/settlements",
            params: {
              transactionId: purchase.id,
              transactionType: "purchase",
              balanceDue: purchase.balance_due,
              creditBalance: purchase.credit_balance,
              referenceNumber: purchase.reference_number ?? "",
            },
          });
        } else {
          router.replace("/inventory" as Href);
        }
        return;
      }
      await dialog.showDialog({
        title: "Purchase recorded",
        message: "The purchase was saved and its goods are now included in inventory.",
        tone: "success",
      });
      router.replace("/inventory" as Href);
    } catch (cause: unknown) {
      setError(normalizeApiError(cause).message);
    }
  }

  if (productsQuery.isLoading) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: theme.background }]}
        edges={["top", "bottom"]}
      >
        <View style={[styles.content, styles.loadingScreen]}>
          <FarmPageHeader title="Purchase supplies" showBack fallbackHref="/inventory" />
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={theme.primary} />
            <AppText tone="secondary">Loading products…</AppText>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (productsQuery.isError) {
    return (
      <SafeAreaView
        style={[styles.screen, { backgroundColor: theme.background }]}
        edges={["top", "bottom"]}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <FarmPageHeader title="Purchase supplies" showBack fallbackHref="/inventory" />
          <Card style={styles.section}>
            <AppText weight="semibold">Couldn’t load products</AppText>
            <AppText size="small" style={{ color: theme.danger }}>
              {normalizeApiError(productsQuery.error).message}
            </AppText>
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => void productsQuery.refetch()}
            />
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
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <FarmPageHeader title="Purchase supplies" showBack fallbackHref="/inventory" />
        <View
          style={[
            styles.purchaseHero,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}
        >
          <View
            style={[
              styles.purchaseHeroIcon,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Ionicons name="bag-handle-outline" size={22} color={theme.primary} />
          </View>
          <View style={styles.grow}>
            <AppText size="heading" weight="semibold">Record a purchase</AppText>
            <AppText size="small" tone="secondary">
              Received goods are added to your farm stock when you save.
            </AppText>
          </View>
        </View>

        <View style={styles.itemsHeading}>
          <View style={styles.grow}>
            <AppText size="heading" weight="semibold">Items</AppText>
            <AppText size="small" tone="secondary">
              Add the products and quantities received.
            </AppText>
          </View>
          <View
            style={[
              styles.itemCountBadge,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
              {lines.length}
            </AppText>
          </View>
        </View>

        {lines.map((line, index) => {
              const selected = products.find((product) => product.id === line.productId);
              return (
                <Card key={line.id} style={styles.lineCard}>
                  <View style={styles.lineTitle}>
                    <View
                      style={[
                        styles.lineNumber,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <AppText
                        size="small"
                        weight="semibold"
                        style={{ color: theme.primary }}
                      >
                        {index + 1}
                      </AppText>
                    </View>
                    <AppText weight="semibold" style={styles.grow}>
                      {selected?.name ?? "Choose an item"}
                    </AppText>
                    {lines.length > 1 ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setLines((current) =>
                            current.filter((item) => item.id !== line.id),
                          );
                          setError("");
                        }}
                      >
                        <Ionicons name="trash-outline" size={19} color={theme.danger} />
                      </Pressable>
                    ) : null}
                  </View>

                  {!line.productId ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => openProductPicker(line.id)}
                      style={[
                        styles.selectorButton,
                        { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                      ]}
                    >
                      <View style={styles.grow}>
                        <AppText size="small" tone="secondary">PRODUCT</AppText>
                        <AppText size="small" weight="semibold">
                          Search and choose a product
                        </AppText>
                      </View>
                      <Ionicons name="search-outline" size={19} color={theme.primary} />
                    </Pressable>
                  ) : (
                    <View style={styles.selectedProduct}>
                      <Ionicons name="checkmark-circle" size={18} color={theme.success} />
                      <AppText size="small" tone="secondary">Product selected</AppText>
                    </View>
                  )}
                  {line.productId ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        updateLine(line.id, {
                          productId: "",
                          unitId: "",
                          quantity: "",
                          unitPrice: "",
                        });
                      }}
                    >
                      <AppText size="small" style={{ color: theme.primary }}>
                        Change product
                      </AppText>
                    </Pressable>
                  ) : null}

                  {selected ? (
                    <>
                      <AppText size="small" weight="semibold">Purchased in</AppText>
                      <View style={styles.productChoices}>
                        {selected.product_units.map((unit) => (
                          <Choice
                            key={unit.id}
                            label={`${unit.unit_name} (${unit.unit_abbreviation})`}
                            selected={line.unitId === unit.unit_id}
                            onPress={() => updateLine(line.id, { unitId: unit.unit_id })}
                          />
                        ))}
                      </View>
                      <View style={styles.inputRow}>
                        <TextField
                          label="Quantity"
                          value={line.quantity}
                          onChangeText={(value) => updateLine(line.id, { quantity: value })}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          style={styles.half}
                        />
                        <TextField
                          label={`Unit price (${theme.currency})`}
                          value={line.unitPrice}
                          onChangeText={(value) => updateLine(line.id, { unitPrice: value })}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          style={styles.half}
                        />
                      </View>
                      {Number(line.quantity) > 0 && Number(line.unitPrice) >= 0 ? (
                        <AppText
                          size="small"
                          weight="semibold"
                          style={[styles.lineTotal, { color: theme.primary }]}
                        >
                          Line total {formatMoney(
                            Number(line.quantity) * Number(line.unitPrice),
                            theme.currency,
                          )}
                        </AppText>
                      ) : null}
                    </>
                  ) : null}
                </Card>
              );
        })}
        <Pressable
          accessibilityRole="button"
          onPress={() => setLines((current) => [...current, newLine()])}
          style={({ pressed }) => [
            styles.addProductButton,
            {
              borderColor: theme.border,
              backgroundColor: theme.backgroundElement,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <Ionicons name="add-circle-outline" size={20} color={theme.primary} />
          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
            Add another product
          </AppText>
        </Pressable>
        <Card style={styles.section}>
          <View style={styles.purchaseDetailsHeading}>
            <View style={styles.grow}>
              <AppText size="heading" weight="semibold">Purchase details</AppText>
              <AppText size="small" tone="secondary">
                Supplier, date, and payment information.
              </AppText>
            </View>
            <View
              style={[
                styles.detailsHeadingIcon,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <Ionicons name="receipt-outline" size={18} color={theme.primary} />
            </View>
          </View>
          <View
            style={[
              styles.totalRow,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <View style={styles.grow}>
              <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                PURCHASE TOTAL
              </AppText>
              <AppText size="small" tone="secondary">
                {lines.length} {lines.length === 1 ? "item" : "items"}
              </AppText>
            </View>
            <AppText size="title" weight="semibold" style={{ color: theme.primary }}>
              {formatMoney(total, theme.currency)}
            </AppText>
          </View>
          <View style={[styles.formDivider, { backgroundColor: theme.border }]} />
          <DatePickerField
            label="Purchase date"
            value={purchaseDate}
            onChange={(value) => {
              setPurchaseDate(value);
              setError("");
            }}
          />
          <View style={styles.fieldSectionHeading}>
            <Ionicons name="person-outline" size={17} color={theme.primary} />
            <AppText size="small" weight="semibold">Supplier</AppText>
            <AppText size="small" tone="secondary">(optional)</AppText>
          </View>
          {suppliersQuery.isError ? (
            <View style={styles.supplierError}>
              <AppText size="small" style={{ color: theme.danger }}>
                Couldn’t load suppliers: {normalizeApiError(suppliersQuery.error).message}
              </AppText>
              <Button
                label="Retry suppliers"
                variant="quiet"
                onPress={() => void suppliersQuery.refetch()}
              />
              <Button
                label="Add supplier"
                variant="secondary"
                onPress={() => setCreateSupplierOpen(true)}
              />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSupplierSearch("");
                setDebouncedSupplierSearch("");
                setSupplierPickerOpen(true);
              }}
              style={[
                styles.selectorButton,
                { borderColor: theme.border, backgroundColor: theme.backgroundElement },
              ]}
            >
              <View style={styles.grow}>
                <AppText size="small" weight="semibold">
                  {supplierId ? selectedSupplierName || "Selected supplier" : "Choose a supplier"}
                </AppText>
                <AppText size="small" tone="secondary">
                  {supplierId ? "Tap to change" : "Search your supplier contacts"}
                </AppText>
              </View>
              <Ionicons name="chevron-down" size={19} color={theme.textSecondary} />
            </Pressable>
          )}
          <View style={[styles.paymentHeading, { borderTopColor: theme.border }]}>
            <View style={styles.fieldSectionHeading}>
              <Ionicons name="card-outline" size={17} color={theme.primary} />
              <AppText size="small" weight="semibold">Payment</AppText>
            </View>
            <AppText size="small" tone="secondary">
              Leave amount paid at zero if this purchase is unpaid.
            </AppText>
          </View>
          <TextField
            label="Amount paid"
            value={paymentAmount}
            onChangeText={(value) => {
              setPaymentAmount(value);
              setError("");
            }}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
          <AppText size="small" weight="semibold">Method of payment</AppText>
          <View style={styles.productChoices}>
            {paymentMethods.map((method) => (
              <Choice
                key={method.value}
                label={method.label}
                selected={paymentMethod === method.value}
                onPress={() => {
                  setPaymentMethod(method.value);
                  if (method.value === "cash") setPaymentReference("");
                }}
              />
            ))}
          </View>
          {Number(paymentAmount) > 0 && paymentMethod !== "cash" ? (
            <TextField
              label="Payment reference (optional)"
              value={paymentReference}
              onChangeText={(value) => {
                setPaymentReference(value);
                setError("");
              }}
              placeholder="Receipt or transaction code"
            />
          ) : null}
          <TextField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Add a note about this purchase"
            multiline
            maxLength={500}
          />
              {error ? (
                <View
                  style={[
                    styles.formError,
                    {
                      backgroundColor: theme.backgroundSelected,
                      borderColor: theme.danger,
                    },
                  ]}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color={theme.danger}
                  />
                  <AppText
                    size="small"
                    style={[styles.formErrorText, { color: theme.danger }]}
                  >
                    {error}
                  </AppText>
                </View>
              ) : null}
              <Button
                label="Save purchase"
                loading={createPurchase.isPending}
                onPress={() => void submit()}
              />
        </Card>
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={productPickerLineId !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setProductPickerLineId(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close product picker"
            onPress={() => setProductPickerLineId(null)}
            style={styles.modalScrim}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={[
              styles.modalSheet,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.grow}>
                <AppText size="heading" weight="semibold">Choose a product</AppText>
                <AppText size="small" tone="secondary">
                  Search existing supplies or add a new product.
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close product picker"
                hitSlop={8}
                onPress={() => setProductPickerLineId(null)}
              >
                <Ionicons name="close" size={23} color={theme.text} />
              </Pressable>
            </View>
            <TextField
              label="Search products"
              value={productSearch}
              onChangeText={setProductSearch}
              placeholder="Feed, medicine, tools..."
              autoCapitalize="none"
            />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={styles.modalList}
            >
              {products
                .filter((product) =>
                  product.name.toLocaleLowerCase().includes(productSearch.trim().toLocaleLowerCase()),
                )
                .map((product) => (
                  <Pressable
                    key={product.id}
                    accessibilityRole="button"
                    onPress={() => {
                      const line = lines.find((item) => item.id === productPickerLineId);
                      if (line) selectProduct(line, product);
                    }}
                    style={[
                      styles.productResult,
                      { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <View style={styles.grow}>
                      <AppText weight="semibold">{product.name}</AppText>
                      <AppText size="small" tone="secondary">
                        {getProductTypeLabel(product.product_type)} · {product.product_units
                          .map((unit) => unit.unit_abbreviation)
                          .join(", ")}
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                  </Pressable>
                ))}
              {!productsQuery.isLoading &&
              !products.some((product) =>
                product.name.toLocaleLowerCase().includes(productSearch.trim().toLocaleLowerCase()),
              ) ? (
                <AppText size="small" tone="secondary" style={styles.noMatches}>
                  No matching products. Add this item to your farm products.
                </AppText>
              ) : null}
              {productsQuery.isLoading ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : null}
            </ScrollView>
            {!exactProductMatch ? (
              <Button
                label={productSearch.trim() ? `Create “${productSearch.trim()}”` : "Create a new product"}
                variant="secondary"
                onPress={() => {
                  if (productPickerLineId) {
                    openCreateProduct(productPickerLineId, productSearch.trim());
                  }
                }}
              />
            ) : (
              <AppText size="small" tone="secondary">
                Choose the matching product above instead of creating a duplicate.
              </AppText>
            )}
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={createSupplierOpen}
        animationType="slide"
        onRequestClose={() => setCreateSupplierOpen(false)}
      >
        <SafeAreaView
          style={[styles.screen, { backgroundColor: theme.background }]}
          edges={["top", "bottom"]}
        >
          <View style={styles.createHeader}>
            <View style={styles.grow}>
              <AppText size="heading" weight="semibold">Add a supplier</AppText>
              <AppText size="small" tone="secondary">
                The supplier will be selected for this purchase.
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close supplier form"
              hitSlop={8}
              onPress={() => setCreateSupplierOpen(false)}
            >
              <Ionicons name="close" size={23} color={theme.text} />
            </Pressable>
          </View>
          <ContactForm
            initialRoles={["supplier"]}
            submitLabel="Create and select supplier"
            isSubmitting={createContact.isPending}
            onSubmit={saveNewSupplier}
          />
        </SafeAreaView>
      </Modal>

      <Modal
        visible={supplierPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSupplierPickerOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close supplier picker"
            onPress={() => setSupplierPickerOpen(false)}
            style={styles.modalScrim}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={[
              styles.modalSheet,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.grow}>
                <AppText size="heading" weight="semibold">Choose a supplier</AppText>
                <AppText size="small" tone="secondary">Search your supplier contacts.</AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close supplier picker"
                hitSlop={8}
                onPress={() => setSupplierPickerOpen(false)}
              >
                <Ionicons name="close" size={23} color={theme.text} />
              </Pressable>
            </View>
            <TextField
              label="Search suppliers"
              value={supplierSearch}
              onChangeText={setSupplierSearch}
              placeholder="Supplier name or phone"
              autoCapitalize="none"
            />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={styles.modalList}
              onMomentumScrollEnd={(event) => {
                const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
                if (
                  layoutMeasurement.height + contentOffset.y >= contentSize.height - 40 &&
                  suppliersQuery.hasNextPage &&
                  !suppliersQuery.isFetchingNextPage
                ) {
                  void suppliersQuery.fetchNextPage();
                }
              }}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSupplierId("");
                  setSelectedSupplierName("");
                  setSupplierPickerOpen(false);
                }}
                style={[
                  styles.productResult,
                  { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                ]}
              >
                <AppText weight="semibold">No supplier</AppText>
                {!supplierId ? (
                  <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                ) : null}
              </Pressable>
              {suppliers.map((supplier) => (
                <Pressable
                  key={supplier.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setSupplierId(supplier.id);
                    setSelectedSupplierName(supplier.name);
                    setSupplierPickerOpen(false);
                  }}
                  style={[
                    styles.productResult,
                    { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <View style={styles.grow}>
                    <AppText weight="semibold">{supplier.name}</AppText>
                    {supplier.phone ? (
                      <AppText size="small" tone="secondary">{supplier.phone}</AppText>
                    ) : null}
                  </View>
                  {supplierId === supplier.id ? (
                    <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                  ) : null}
                </Pressable>
              ))}
              {suppliersQuery.isLoading ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : null}
              {suppliersQuery.isFetchingNextPage ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : null}
              {suppliersQuery.hasNextPage ? (
                <Button
                  label="Load more suppliers"
                  variant="quiet"
                  loading={suppliersQuery.isFetchingNextPage}
                  onPress={() => void suppliersQuery.fetchNextPage()}
                />
              ) : null}
              {suppliersQuery.isError ? (
                <AppText size="small" style={{ color: theme.danger }}>
                  {normalizeApiError(suppliersQuery.error).message}
                </AppText>
              ) : null}
              {!suppliersQuery.isLoading && suppliers.length === 0 && !suppliersQuery.isError ? (
                <AppText size="small" tone="secondary" style={styles.noMatches}>
                  No suppliers match this search.
                </AppText>
              ) : null}
            </ScrollView>
            <Button
              label="Add a new supplier"
              variant="secondary"
              onPress={() => {
                setSupplierPickerOpen(false);
                setCreateSupplierOpen(true);
              }}
            />
          </SafeAreaView>
        </View>
      </Modal>

      <Modal
        visible={createProductOpen}
        animationType="slide"
        onRequestClose={() => setCreateProductOpen(false)}
      >
        <SafeAreaView
          style={[styles.screen, { backgroundColor: theme.background }]}
          edges={["top", "bottom"]}
        >
          <View style={styles.createHeader}>
            <View style={styles.grow}>
              <AppText size="heading" weight="semibold">Add a farm product</AppText>
              <AppText size="small" tone="secondary">It will be selected for this purchase.</AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close product form"
              hitSlop={8}
              onPress={() => setCreateProductOpen(false)}
            >
              <Ionicons name="close" size={23} color={theme.text} />
            </Pressable>
          </View>
          <ProductForm
            key={`${createProductOpen}-${createProductLineId ?? ""}-${productSearch}`}
            submitLabel="Create and select"
            isSubmitting={createProduct.isPending}
            initialProductType="feed"
            initialName={productSearch.trim()}
            allowedProductTypes={["feed", "medication", "equipment", "other"]}
            onSubmit={saveNewProduct}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );

}

function Choice({
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
        styles.choice,
        {
          backgroundColor: selected ? theme.primary : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
    >
      <AppText
        size="small"
        weight="semibold"
        style={{ color: selected ? theme.onPrimary : theme.text }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatMoney(value: number, currency: string) {
  return `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboardContainer: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 44,
    gap: 15,
  },
  purchaseHero: {
    minHeight: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderRadius: 18,
    padding: 17,
  },
  purchaseHeroIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  itemsHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 1,
  },
  purchaseDetailsHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  detailsHeadingIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  itemCountBadge: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  section: { gap: 14, padding: 16, borderRadius: 18 },
  lineCard: {
    gap: 13,
    padding: 15,
    borderRadius: 17,
  },
  lineTitle: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  lineNumber: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  grow: { flex: 1, minWidth: 0 },
  selectedProduct: { flexDirection: "row", alignItems: "center", gap: 7 },
  productChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 11,
    borderWidth: 1,
  },
  addProductButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 13,
    paddingHorizontal: 14,
  },
  selectorButton: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inputRow: { flexDirection: "row", gap: 10 },
  half: { flex: 1, minWidth: 0 },
  lineTotal: { textAlign: "right", paddingTop: 2 },
  paymentHeading: {
    gap: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 13,
    marginTop: 2,
  },
  fieldSectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingTop: 3,
  },
  totalRow: {
    minHeight: 76,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  formDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  formError: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 11,
    padding: 11,
  },
  formErrorText: { flex: 1 },
  supplierError: { gap: 2 },
  loadingScreen: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 9 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalScrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0, 0, 0, 0.42)",
  },
  modalSheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalList: { gap: 8, paddingBottom: 8 },
  productResult: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  noMatches: { textAlign: "center", padding: 12 },
  createHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});
