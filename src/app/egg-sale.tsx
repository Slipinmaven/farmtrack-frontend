import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TimePickerField } from "@/components/ui/time-picker-field";
import { TextField } from "@/components/ui/text-field";
import { useAppDialog } from "@/components/ui/app-dialog";
import {
  useCreateEggSale,
  useEggCollectionOptions,
} from "@/features/eggs/hooks";
import type { EggCollectionProduct, EggSaleInput } from "@/features/eggs/api";
import { getContacts, type Contact } from "@/features/management/api";
import {
  useCreateContact,
  useCreateContactRole,
  useContacts,
  useProfitabilityReport,
} from "@/features/management/hooks";
import {
  isValidKenyanMobile,
  kenyanMobileError,
  normalizedKenyanPhone,
} from "@/features/management/kenyan-phone";
import {
  SmsPaymentPicker,
  type SelectedSmsPayment,
} from "@/features/payment-message-import/components/SmsPaymentPicker";
import { usePaymentMessageImport } from "@/features/payment-message-import/PaymentMessageImportProvider";
import { useCreateReminder } from "@/features/reminders/hooks";
import {
  registerForReminderPush,
  scheduleReminderNotification,
} from "@/features/reminders/push-notifications";
import type { Reminder } from "@/features/reminders/api";
import { normalizeApiError } from "@/lib/api/errors";
import {
  centsToDecimal,
  formatCents,
  parseMoneyToCents,
} from "@/features/chickens/purchase-pricing";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type SaleLine = {
  id: string;
  productId: string;
  unitId: string;
  quantity: string;
  unitPrice: string;
};

type PaymentMethod = (typeof paymentMethods)[number]["value"];
type PaymentDraft = {
  id: string;
  amount: string;
  method: PaymentMethod;
  reference: string;
  smsMessageId?: string;
  date?: string;
  time?: string | null;
  payerName?: string | null;
  payerPhone?: string | null;
};

const paymentMethods = [
  { label: "Cash", value: "cash", icon: "cash-outline" },
  { label: "M-Pesa", value: "mpesa", icon: "phone-portrait-outline" },
  { label: "Bank", value: "bank_transfer", icon: "business-outline" },
  { label: "Card", value: "card", icon: "card-outline" },
  { label: "Other", value: "other", icon: "ellipsis-horizontal-outline" },
] as const;

const MAX_MONEY_CENTS = 999_999_999_999n;

type SmsCustomerDraft = {
  name: string;
  phone: string;
  sourceMessageId: string;
};

function normalizedName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function newLine(productId: string, unitId: string): SaleLine {
  return {
    id: `${Date.now()}-${Math.random()}`,
    productId,
    unitId,
    quantity: "",
    unitPrice: "",
  };
}

function newPayment(): PaymentDraft {
  return {
    id: `${Date.now()}-${Math.random()}`,
    amount: "",
    method: "cash",
    reference: "",
  };
}

function farmToday(timezone: string | null | undefined): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((entry) => entry.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function farmTimeNow(timezone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date());
  }
}

function addFarmDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseCalendarDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
    ? date
    : undefined;
}

function quantityMilli(value: string): bigint | null {
  const trimmed = value.trim();
  const normalized = trimmed.includes(".")
    ? trimmed.replace(/0+$/, "").replace(/\.$/, "")
    : trimmed;
  if (!/^\d{1,9}(?:\.\d{0,3})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0") || "0");
}

function salePriceCents(value: string): bigint | null {
  const normalized = value.trim();
  if (!/^\d{1,10}(?:\.\d{0,2})?$/.test(normalized)) return null;
  return parseMoneyToCents(normalized);
}

function lineTotalCents(line: SaleLine): bigint | null {
  const quantity = quantityMilli(line.quantity);
  const price = salePriceCents(line.unitPrice);
  if (quantity === null || quantity === 0n || price === null) return null;
  return (quantity * price + 500n) / 1000n;
}

function quantityLabel(value: number | string, unit: string): string {
  return `${Number(value).toLocaleString()} ${unit}`;
}

export default function EggSaleScreen() {
  return (
    <SessionGate>
      <EggSaleContent />
    </SessionGate>
  );
}

function EggSaleContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const {
    nativeError: smsImportNativeError,
    sharedMessage,
  } = usePaymentMessageImport();
  const dialog = useAppDialog();
  const farmId = farm.selectedFarm?.id ?? "";
  const options = useEggCollectionOptions(user?.id, farm.selectedFarm?.id);
  const createSale = useCreateEggSale(user?.id ?? "", farmId);
  const createReminder = useCreateReminder(user?.id ?? "", farmId);
  const timezone = farm.selectedFarm?.settings?.timezone;
  const sellableProducts = useMemo(
    () =>
      (options.data?.products ?? []).filter((product) => product.is_sellable),
    [options.data?.products],
  );
  const inStockProducts = useMemo(
    () =>
      sellableProducts.filter(
        (product) => Number(product.available_quantity_in_base_unit) > 0,
      ),
    [sellableProducts],
  );

  const [stage, setStage] = useState<"edit" | "review">("edit");
  const [step, setStep] = useState(0);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [saleDate, setSaleDate] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState("");
  const [showAllCustomers, setShowAllCustomers] = useState(false);
  const [customer, setCustomer] = useState<Contact | null>(null);
  const createContact = useCreateContact(user?.id ?? "", farmId);
  const createContactRole = useCreateContactRole(user?.id ?? "", farmId);
  const customerDirectoryQuery = useContacts(
    user?.id,
    farm.selectedFarm?.id,
    debouncedCustomerSearch,
    "customer",
  );
  const visibleCustomers =
    customerDirectoryQuery.data?.pages.flatMap((page) => page) ?? [];
  const displayedCustomers = showAllCustomers
    ? visibleCustomers
    : visibleCustomers.slice(0, 5);
  const customerListLoading =
    customerSearch.trim() !== debouncedCustomerSearch ||
    customerDirectoryQuery.isLoading ||
    (customerSearch.trim().length > 0 && customerDirectoryQuery.isFetching);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [customerError, setCustomerError] = useState("");
  const [recordPayment, setRecordPayment] = useState(false);
  const [payments, setPayments] = useState<PaymentDraft[]>([newPayment()]);
  const [smsPickerPaymentId, setSmsPickerPaymentId] = useState<string | null>(
    null,
  );
  const [smsCustomerDraft, setSmsCustomerDraft] =
    useState<SmsCustomerDraft | null>(null);
  const [scheduleSaleFollowUp, setScheduleSaleFollowUp] = useState(false);
  const [reminderDueDate, setReminderDueDate] = useState<string | null>(null);
  const [reminderDueTime, setReminderDueTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const scrollRef = useRef<ScrollViewInstance>(null);
  const inputRefs = useRef<Record<string, TextInputInstance | null>>({});

  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedCustomerSearch(customerSearch.trim()),
      250,
    );
    return () => clearTimeout(timeout);
  }, [customerSearch]);

  const selectedProducts = selectedProductIds
    .map((id) => inStockProducts.find((item) => item.id === id))
    .filter((item): item is EggCollectionProduct => Boolean(item));
  const activeSmsCustomerDraft =
    smsCustomerDraft &&
    payments.some(
      (payment) => payment.smsMessageId === smsCustomerDraft.sourceMessageId,
    )
      ? smsCustomerDraft
      : null;
  const productTotals = selectedProducts.map((selectedProduct) => {
    const requestedBaseMicro = lines
      .filter((line) => line.productId === selectedProduct.id)
      .reduce((total, line) => {
        const selectedUnit = selectedProduct.units.find(
          (unit) => unit.id === line.unitId,
        );
        const quantity = quantityMilli(line.quantity);
        const factor = selectedUnit
          ? quantityMilli(String(selectedUnit.conversion_factor))
          : null;
        return quantity !== null && factor !== null
          ? total + quantity * factor
          : total;
      }, 0n);
    const baseUnit = selectedProduct.units.find((unit) => unit.is_base_unit);
    const availableQuantity = Number(
      selectedProduct.available_quantity_in_base_unit,
    );
    return {
      product: selectedProduct,
      baseUnit,
      availableQuantity,
      requestedBaseMicro,
      requestedBaseQuantity: Number(requestedBaseMicro) / 1_000_000,
      remainingQuantity:
        availableQuantity - Number(requestedBaseMicro) / 1_000_000,
    };
  });
  const totalCents = lines.reduce(
    (total, line) => total + (lineTotalCents(line) ?? 0n),
    0n,
  );
  const paidCents = recordPayment
    ? payments.reduce(
        (total, payment) => total + (salePriceCents(payment.amount) ?? 0n),
        0n,
      )
    : 0n;
  const balanceDueCents = totalCents > paidCents ? totalCents - paidCents : 0n;
  const creditCents = paidCents > totalCents ? paidCents - totalCents : 0n;
  const hasNamedCustomer = Boolean(
    customer?.name.trim() || activeSmsCustomerDraft?.name.trim(),
  );
  const effectiveSaleDate = saleDate || farmToday(timezone);
  const effectiveReminderDueDate =
    reminderDueDate ?? addFarmDays(farmToday(timezone), 1);
  const currency = farm.selectedFarm?.settings?.currency ?? "KES";
  const costReport = useProfitabilityReport(user?.id, farmId, {
    from_date: effectiveSaleDate,
    to_date: effectiveSaleDate,
  });
  const closingStock = costReport.data?.closing_stock ?? [];

  function estimatedStockCostCents(
    productId: string,
    quantityMicro: bigint,
  ): bigint | null {
    const stock = closingStock.find((item) => item.product_id === productId);
    const valuedQuantityMilli = quantityMilli(
      String(stock?.valued_quantity ?? ""),
    );
    const valuedCostCents = salePriceCents(String(stock?.valued_cost ?? ""));
    if (
      valuedQuantityMilli === null ||
      valuedCostCents === null ||
      valuedQuantityMilli <= 0n ||
      Number(stock?.unvalued_quantity ?? 0) > 0
    ) {
      return null;
    }
    const valuedQuantityMicro = valuedQuantityMilli * 1000n;
    return (
      (valuedCostCents * quantityMicro + valuedQuantityMicro / 2n) /
      valuedQuantityMicro
    );
  }

  function selectProduct(nextProduct: EggCollectionProduct) {
    const selected = selectedProductIds.includes(nextProduct.id);
    setSelectedProductIds((current) =>
      selected
        ? current.filter((id) => id !== nextProduct.id)
        : [...current, nextProduct.id],
    );
    setLines((current) =>
      selected
        ? current.filter((line) => line.productId !== nextProduct.id)
        : [
            ...current,
            newLine(
              nextProduct.id,
              nextProduct.units.find((unit) => unit.is_base_unit)?.id ??
                nextProduct.units[0]?.id ??
                "",
            ),
          ],
    );
    setError("");
    setFieldErrors({});
  }

  function updateLine(lineId: string, patch: Partial<SaleLine>) {
    setError("");
    setFieldErrors((current) => {
      const next = { ...current };
      if ("quantity" in patch) delete next[`quantity:${lineId}`];
      if ("unitPrice" in patch) delete next[`price:${lineId}`];
      if ("unitId" in patch) {
        delete next[`quantity:${lineId}`];
        delete next[`price:${lineId}`];
      }
      delete next.stock;
      return next;
    });
    setLines((current) =>
      current.map((line) =>
        line.id === lineId ? { ...line, ...patch } : line,
      ),
    );
  }

  function updatePayment(paymentId: string, patch: Partial<PaymentDraft>) {
    setError("");
    if ("amount" in patch) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[`payment:${paymentId}`];
        return next;
      });
    }
    setPayments((current) =>
      current.map((payment) =>
        payment.id === paymentId ? { ...payment, ...patch } : payment,
      ),
    );
  }

  function remainingForFullPayment(paymentId: string): bigint {
    const otherPayments = payments
      .filter((payment) => payment.id !== paymentId)
      .reduce(
        (total, payment) => total + (salePriceCents(payment.amount) ?? 0n),
        0n,
      );
    return totalCents > otherPayments ? totalCents - otherPayments : 0n;
  }

  function fillRemainingPayment(paymentId: string) {
    updatePayment(paymentId, {
      amount: centsToDecimal(remainingForFullPayment(paymentId)),
    });
  }

  async function applySmsPayment(selectedPayments: SelectedSmsPayment[]) {
    const targetId = smsPickerPaymentId;
    if (!selectedPayments.length || !targetId) return;
    const target = payments.find((payment) => payment.id === targetId);
    if (!target) {
      setError("This payment entry is no longer available. Try again.");
      setSmsPickerPaymentId(null);
      return;
    }

    const otherPayments = payments.filter(
      (payment) => payment.id !== targetId,
    );
    const seenReferences = new Set(
      otherPayments
        .filter((payment) => payment.method === "mpesa")
        .map((payment) => payment.reference.trim().toUpperCase())
        .filter(Boolean),
    );
    const seenMessageIds = new Set(
      otherPayments
        .map((payment) => payment.smsMessageId)
        .filter((messageId): messageId is string => Boolean(messageId)),
    );
    for (const [index, selected] of selectedPayments.entries()) {
      if (!selected.payment.amount || !selected.payment.transactionDate) {
        setError(
          `M-Pesa message ${index + 1} is missing a usable amount or date.`,
        );
        setSmsPickerPaymentId(null);
        return;
      }
      const reference =
        selected.payment.transactionReference?.trim().toUpperCase() ?? "";
      if (reference && seenReferences.has(reference)) {
        setError(
          `M-Pesa transaction code in selected message ${index + 1} is already used.`,
        );
        setSmsPickerPaymentId(null);
        return;
      }
      if (selected.messageId && seenMessageIds.has(selected.messageId)) {
        setError(`M-Pesa message ${index + 1} is already used in this sale.`);
        setSmsPickerPaymentId(null);
        return;
      }
      if (reference) seenReferences.add(reference);
      seenMessageIds.add(selected.messageId);
    }

    const payer = selectedPayments[0]?.payment;
    const payerName = payer?.senderName?.trim() ?? "";
    const payerPhone = payer?.senderPhone?.trim() ?? "";
    let needsPayerDetailsReview = false;
    if (payerName || payerPhone) {
      const usePayerAsCustomer = await dialog.confirmDialog({
        title: customer ? "Replace the selected customer?" : "Use payer as customer?",
        message:
          `${customer ? "Use the payer details from this message instead of the selected customer?" : "Use the payer details from this message for the sale?"} FarmTrack checks your contacts when you submit.${selectedPayments.length > 1 ? " Details come from the first selected message." : ""}`,
        tone: "info",
        details: [
          ...(customer
            ? [
                {
                  label: "Selected customer",
                  value: `${customer.name}${customer.phone ? ` · ${customer.phone}` : ""}`,
                },
              ]
            : []),
          { label: "Payer name", value: payerName || "Not included in message" },
          {
            label: "Payer phone",
            value: payerPhone || "Not included in message",
          },
        ],
        confirmLabel: customer ? "Replace customer" : "Use as customer",
        cancelLabel: customer ? "Keep selected customer" : "Payment only",
      });
      if (usePayerAsCustomer) {
        setSmsCustomerDraft({
          name: payerName,
          phone: payerPhone,
          sourceMessageId: selectedPayments[0].messageId,
        });
        setCustomer(null);
        setCustomerSearch("");
        setDebouncedCustomerSearch("");
        if (payerName && isValidKenyanMobile(payerPhone)) {
          setShowNewCustomerForm(false);
        } else {
          needsPayerDetailsReview = true;
          setNewCustomerName(payerName);
          setNewCustomerPhone(payerPhone);
          setNewCustomerEmail("");
          setShowNewCustomerForm(true);
          setStep(1);
        }
      }
    }

    const toDraft = (selected: SelectedSmsPayment): PaymentDraft => ({
      ...newPayment(),
      amount: selected.payment.amount ?? "",
      method: "mpesa",
      reference: selected.payment.transactionReference ?? "",
      smsMessageId: selected.messageId,
      date: selected.payment.transactionDate ?? undefined,
      time: selected.payment.transactionTime,
      payerName: selected.payment.senderName,
      payerPhone: selected.payment.senderPhone,
    });
    const [first, ...additional] = selectedPayments.map(toDraft);
    setError(
      needsPayerDetailsReview
        ? "The M-Pesa message does not provide a complete customer phone number. Correct the payer details below or select an existing customer before continuing."
        : "",
    );
    setRecordPayment(true);
    setPayments((current) => [
      ...current.map((payment) =>
        payment.id === targetId ? { ...first, id: targetId } : payment,
      ),
      ...additional,
    ]);
    setSmsPickerPaymentId(null);
  }

  async function findMatchingSmsContact(details: {
    name: string;
    phone: string;
  }): Promise<Contact | null> {
    let offset = 0;
    while (true) {
      const contacts = await getContacts(farmId, {
        search: details.name,
        limit: 100,
        offset,
      });
      const match = contacts.find(
        (contact) =>
          normalizedName(contact.name) === normalizedName(details.name) &&
          normalizedKenyanPhone(contact.phone) ===
            normalizedKenyanPhone(details.phone),
      );
      if (match) return match;
      if (contacts.length < 100) return null;
      offset += contacts.length;
    }
  }

  async function resolveSmsCustomer(
    details: SmsCustomerDraft,
  ): Promise<Contact> {
    if (!details.name.trim()) {
      throw new Error("Enter the payer’s name before using them as the customer.");
    }
    const phoneError = kenyanMobileError(details.phone);
    if (phoneError) throw new Error(phoneError);
    const match = await findMatchingSmsContact(details);
    if (match) {
      if (match.roles.includes("customer")) return match;
      await createContactRole.mutateAsync({
        contactId: match.id,
        role: "customer",
      });
      return { ...match, roles: [...match.roles, "customer"] };
    }
    return createContact.mutateAsync({
      name: details.name.trim(),
      phone: normalizedKenyanPhone(details.phone),
      roles: ["customer"],
    });
  }

  async function addCustomer() {
    const name = newCustomerName.trim();
    if (!name) {
      setCustomerError("Enter the customer’s name.");
      return;
    }
    try {
      const created = await createContact.mutateAsync({
        name,
        roles: ["customer"],
        phone: newCustomerPhone.trim() || undefined,
        email: newCustomerEmail.trim() || undefined,
      });
      setCustomer(created);
      setSmsCustomerDraft(null);
      setCustomerSearch("");
      setDebouncedCustomerSearch("");
      setShowNewCustomerForm(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerEmail("");
      setCustomerError("");
    } catch (contactError: unknown) {
      setCustomerError(normalizeApiError(contactError).message);
    }
  }

  function validateStep(targetStep: number): boolean {
    const nextErrors: Record<string, string> = {};
    if (targetStep === 0) {
      if (selectedProducts.length === 0) {
        nextErrors.product = "Choose at least one egg product to sell.";
      } else {
        if (lines.length === 0) {
          nextErrors.product = "Add at least one sale unit to this sale.";
        }
        for (const [index, line] of lines.entries()) {
          const quantity = quantityMilli(line.quantity);
          const lineProduct = selectedProducts.find(
            (item) => item.id === line.productId,
          );
          const unit = lineProduct?.units.find(
            (entry) => entry.id === line.unitId,
          );
          const price = salePriceCents(line.unitPrice);
          if (!unit) {
            nextErrors[`quantity:${line.id}`] =
              "Choose a registered unit for this line.";
          } else if (quantity === null || quantity === 0n) {
            nextErrors[`quantity:${line.id}`] =
              "Enter a quantity greater than zero (up to 3 decimal places).";
          }
          if (price === null) {
            nextErrors[`price:${line.id}`] =
              "Enter a price using up to 2 decimal places.";
          }
          if ((lineTotalCents(line) ?? 0n) > MAX_MONEY_CENTS) {
            nextErrors[`price:${line.id}`] =
              "This line total is above the supported limit. Reduce the quantity or price.";
          }
          if (
            quantity !== null &&
            quantity > 0n &&
            price !== null &&
            price === 0n
          ) {
            nextErrors[`price:${line.id}`] =
              "Enter a price greater than zero for this sale line.";
          }
          if (!unit && !nextErrors[`quantity:${line.id}`]) {
            nextErrors[`quantity:${line.id}`] =
              `Check the unit selected on line ${index + 1}.`;
          }
        }
        const hasLineErrors = Object.keys(nextErrors).some(
          (key) => key.startsWith("quantity:") || key.startsWith("price:"),
        );
        if (!hasLineErrors) {
          for (const totals of productTotals) {
            const availableMilli = quantityMilli(
              String(totals.product.available_quantity_in_base_unit),
            );
            if (availableMilli === null) {
              nextErrors[`stock:${totals.product.id}`] =
                `Current stock for ${totals.product.name} could not be verified. Refresh the stock options and try again.`;
            } else if (totals.requestedBaseMicro > availableMilli * 1000n) {
              nextErrors[`stock:${totals.product.id}`] =
                `${totals.product.name}: this sale uses ${formatQuantity(totals.requestedBaseQuantity, totals.baseUnit?.abbreviation ?? "base units")} but only ${formatQuantity(totals.availableQuantity, totals.baseUnit?.abbreviation ?? "base units")} are available. Reduce one or more quantities.`;
            }
          }
        }
        if (totalCents <= 0n) {
          nextErrors.total = "Sale total must be greater than zero.";
        } else if (totalCents > MAX_MONEY_CENTS) {
          nextErrors.total =
            "Sale total is above the supported limit. Reduce the quantity or price.";
        }
      }
    } else if (targetStep === 1) {
      if (!parseCalendarDate(effectiveSaleDate)) {
        nextErrors.saleDate = "Choose a valid sale date.";
      }
      if (activeSmsCustomerDraft) {
        if (!activeSmsCustomerDraft.name.trim()) {
          nextErrors.smsCustomerName = "Enter the payer’s name.";
        }
        const phoneError = kenyanMobileError(activeSmsCustomerDraft.phone);
        if (phoneError) nextErrors.smsCustomerPhone = phoneError;
      }
    } else if (targetStep === 2) {
      if (recordPayment) {
        const seenMpesaReferences = new Set<string>();
        const seenSmsMessageIds = new Set<string>();
        for (const [index, payment] of payments.entries()) {
          const amount = salePriceCents(payment.amount);
          if (amount === null || amount <= 0n || amount > MAX_MONEY_CENTS) {
            nextErrors[`payment:${payment.id}`] =
              `Enter a valid amount greater than zero for payment ${index + 1} (up to 2 decimal places).`;
          }
          if (payment.method === "mpesa") {
            const reference = payment.reference.trim().toUpperCase();
            if (reference && seenMpesaReferences.has(reference)) {
              nextErrors[`payment:${payment.id}`] =
                "This M-Pesa transaction code is already used in another payment.";
            }
            if (reference) seenMpesaReferences.add(reference);
            if (
              payment.smsMessageId &&
              seenSmsMessageIds.has(payment.smsMessageId)
            ) {
              nextErrors[`payment:${payment.id}`] =
                "This M-Pesa message is already used in another payment.";
            }
            if (payment.smsMessageId) {
              seenSmsMessageIds.add(payment.smsMessageId);
            }
          }
        }
      }
      if ((balanceDueCents > 0n || creditCents > 0n) && !hasNamedCustomer) {
        nextErrors.customer =
          "Select a customer with a name to track a balance due or overpayment.";
      }
      if (scheduleSaleFollowUp && (balanceDueCents > 0n || creditCents > 0n)) {
        if (!parseCalendarDate(effectiveReminderDueDate)) {
          nextErrors.reminderDate = "Choose a valid reminder date.";
        } else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderDueTime)) {
          nextErrors.reminderTime = "Choose a valid reminder time.";
        } else if (
          `${effectiveReminderDueDate}T${reminderDueTime}` <=
          `${farmToday(timezone)}T${farmTimeNow(timezone)}`
        ) {
          nextErrors.reminderDate =
            "Choose a reminder date and time that is still in the future.";
        }
      }
    }
    setFieldErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      const inputKey = firstError.startsWith("quantity:")
        ? firstError
        : firstError.startsWith("price:")
          ? firstError
          : firstError.startsWith("payment:")
            ? firstError
            : firstError === "smsCustomerName"
              ? "smsCustomerName"
              : firstError === "smsCustomerPhone"
                ? "smsCustomerPhone"
                : null;
      const focusKey =
        inputKey ??
        (firstError.startsWith("stock:")
          ? (() => {
              const stockProductId = firstError.slice("stock:".length);
              const stockLine = lines.find(
                (line) => line.productId === stockProductId,
              );
              return stockLine ? `quantity:${stockLine.id}` : null;
            })()
          : null);
      if (focusKey) {
        setTimeout(() => inputRefs.current[focusKey]?.focus(), 0);
      } else {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    }
    return Object.keys(nextErrors).length === 0;
  }

  function continueSale() {
    setError("");
    if (!validateStep(step)) return;
    if (step < 2) {
      setStep((current) => current + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      setStage("review");
    }
  }

  async function submitSale() {
    if (selectedProducts.length === 0) {
      setStage("edit");
      setStep(0);
      validateStep(0);
      return;
    }
    for (let saleStep = 0; saleStep < 3; saleStep += 1) {
      if (!validateStep(saleStep)) {
        setStage("edit");
        setStep(saleStep);
        return;
      }
    }
    let saleCustomer = customer;
    if (activeSmsCustomerDraft) {
      try {
        saleCustomer = await resolveSmsCustomer(activeSmsCustomerDraft);
      } catch (customerError: unknown) {
        setStage("edit");
        setStep(1);
        setError(
          `Could not link the M-Pesa payer as a customer. The sale has not been recorded. ${normalizeApiError(customerError).message}`,
        );
        return;
      }
    }
    const payload: EggSaleInput = {
      transaction_date: effectiveSaleDate,
      contact_id: saleCustomer?.id,
      notes: notes.trim() || undefined,
      items: lines.map((line) => ({
        product_id: line.productId,
        unit_id: line.unitId,
        quantity: line.quantity.trim(),
        unit_price: centsToDecimal(salePriceCents(line.unitPrice) ?? 0n),
      })),
      payments: recordPayment
        ? payments.map((payment) => ({
            amount: centsToDecimal(salePriceCents(payment.amount) ?? 0n),
            payment_date: payment.date ?? effectiveSaleDate,
            payment_method: payment.method,
            reference_number: payment.reference.trim() || undefined,
          }))
        : [],
    };
    if (creditCents > 0n) {
      const confirmed = await dialog.confirmDialog({
        title: "Keep the extra as customer credit?",
        message:
          "The amount above the sale total will stay on this customer's account for a future purchase.",
        tone: "warning",
        details: [
          { label: "Sale total", value: formatCurrency(totalCents, currency) },
          { label: "Paid", value: formatCurrency(paidCents, currency) },
          {
            label: `${saleCustomer?.name ?? "Customer"} credit`,
            value: formatCurrency(creditCents, currency),
          },
        ],
        note: "No refund will be sent.",
        cancelLabel: "Edit payments",
        confirmLabel: "Keep as credit",
      });
      if (!confirmed) return;
    }
    try {
      const result = await createSale.mutateAsync(payload);
      setSmsCustomerDraft(null);
      const savedBalanceDue =
        parseMoneyToCents(String(result.balance_due)) ?? balanceDueCents;
      const savedCredit =
        parseMoneyToCents(String(result.credit_balance)) ?? creditCents;
      let reminderMessage = "";
      if (scheduleSaleFollowUp && (savedBalanceDue > 0n || savedCredit > 0n)) {
        try {
          let expoPushToken: string | undefined;
          let deliveryChannel: Reminder["delivery_channel"] = "push";
          try {
            expoPushToken = await registerForReminderPush();
          } catch {
            deliveryChannel = "in_app";
          }
          const isOverpayment = savedCredit > 0n;
          const followUpAmount = isOverpayment ? savedCredit : savedBalanceDue;
          const buyerName = saleCustomer?.name ?? "the buyer";
          const reminder = await createReminder.mutateAsync({
            title: isOverpayment
              ? "Settle egg sale overpayment"
              : "Follow up on egg sale balance",
            description: isOverpayment
              ? `Settle the ${formatCurrency(followUpAmount, currency)} overpayment owed to ${buyerName} from ${result.reference_number ?? "the egg sale"}.`
              : `Ask ${buyerName} for the remaining ${formatCurrency(followUpAmount, currency)} from ${result.reference_number ?? "the egg sale"}.`,
            due_at: `${effectiveReminderDueDate}T${reminderDueTime}:00`,
            delivery_channel: deliveryChannel,
            ...(expoPushToken ? { expo_push_token: expoPushToken } : {}),
            related_entity_type: "sale_transaction",
            related_entity_id: result.id,
          });
          if (deliveryChannel === "in_app") {
            if (Platform.OS === "web") {
              reminderMessage = `Follow-up reminder saved for ${effectiveReminderDueDate} at ${reminderDueTime}.`;
            } else {
              try {
                await scheduleReminderNotification(reminder);
                reminderMessage = `Follow-up reminder saved for ${effectiveReminderDueDate} at ${reminderDueTime}. A phone alert is set on this device.`;
              } catch {
                reminderMessage = `Follow-up reminder saved for ${effectiveReminderDueDate} at ${reminderDueTime}. You can still find it in Reminders.`;
              }
            }
          } else {
            reminderMessage = `Follow-up reminder saved for ${effectiveReminderDueDate} at ${reminderDueTime}.`;
          }
        } catch (reminderError: unknown) {
          reminderMessage = `The sale was recorded, but the reminder could not be saved. ${normalizeApiError(reminderError).message}`;
        }
      }
      router.replace({
        pathname: "/sales/[saleId]",
        params: {
          saleId: result.id,
          created: "true",
          ...(reminderMessage
            ? {
                reminderNotice: reminderMessage,
                ...(reminderMessage.includes("could not be saved")
                  ? { reminderNoticeTone: "warning" }
                  : {}),
              }
            : {}),
        },
      });
    } catch (submitError: unknown) {
      setStage("edit");
      setStep(0);
      const message = normalizeApiError(submitError).message;
      if (/not enough|available|stock|inventory/i.test(message)) {
        const refreshed = await options.refetch();
        const latestProducts =
          refreshed.data?.products ?? options.data?.products ?? [];
        const changedStock = productTotals.find((totals) => {
          const latest = latestProducts.find(
            (item) => item.id === totals.product.id,
          );
          return (
            latest &&
            Number(latest.available_quantity_in_base_unit) <
              totals.requestedBaseQuantity
          );
        });
        const latestProduct = changedStock
          ? latestProducts.find(
              (item) => item.id === changedStock.product.id,
            )
          : undefined;
        const latestBaseUnit = latestProduct?.units.find(
          (unit) => unit.is_base_unit,
        );
        const stockMessage =
          changedStock && latestProduct
            ? `Stock changed for ${latestProduct.name}. ${formatQuantity(Number(latestProduct.available_quantity_in_base_unit), latestBaseUnit?.abbreviation ?? "base units")} remain, but this sale needs ${formatQuantity(changedStock.requestedBaseQuantity, changedStock.baseUnit?.abbreviation ?? "base units")}. Reduce the quantity and try again.`
            : friendlySaleError(message);
        setFieldErrors(
          changedStock
            ? { [`stock:${changedStock.product.id}`]: stockMessage }
            : {},
        );
        setError(changedStock ? "" : stockMessage);
        const lastLine = lines.find(
          (line) => line.productId === changedStock?.product.id,
        );
        if (lastLine) {
          setTimeout(
            () => inputRefs.current[`quantity:${lastLine.id}`]?.focus(),
            0,
          );
        }
      } else {
        setError(
          `Could not record the egg sale. ${friendlySaleError(message)}`,
        );
        await options.refetch();
      }
    }
  }

  if (options.isLoading) {
    return <LoadingState label="Loading egg sale options" />;
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          <FarmPageHeader title="Egg sale" showBack backHref="/(tabs)/eggs" />

          {options.isError ? (
            <Card style={styles.card}>
              <AppText weight="semibold">Could not load egg stock</AppText>
              <AppText size="small" tone="secondary">
                {normalizeApiError(options.error).message}
              </AppText>
              <Button
                label="Retry"
                variant="secondary"
                onPress={() => void options.refetch()}
              />
            </Card>
          ) : null}

          {!options.isError &&
          sellableProducts.length === 0 ? (
            <Card style={styles.empty}>
              <Ionicons
                name="storefront-outline"
                size={28}
                color={theme.primary}
              />
              <AppText weight="semibold">
                No egg products available for sale
              </AppText>
              <AppText size="small" tone="secondary">
                Set an active Eggs product as available for sale before
                recording egg sales.
              </AppText>
              <Button
                label="Manage products"
                onPress={() => router.push("/products")}
              />
            </Card>
          ) : null}

          {!options.isError &&
          sellableProducts.length > 0 &&
          inStockProducts.length === 0 ? (
            <Card style={styles.empty}>
              <Ionicons
                name="egg-outline"
                size={28}
                color={theme.textSecondary}
              />
              <AppText weight="semibold">
                No collected eggs available to sell
              </AppText>
              <AppText size="small" tone="secondary">
                Egg products are marked for sale, but there is no remaining
                stock after losses and previous sales.
              </AppText>
              <Button
                label="Record egg collection"
                onPress={() => router.push("/egg-collection")}
              />
            </Card>
          ) : null}

          {inStockProducts.length > 0 && stage === "edit" ? (
            <>
              <View
                accessibilityRole="progressbar"
                accessibilityLabel={`Sale setup step ${step + 1} of 3`}
                style={[
                  styles.progressCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View style={styles.progressLabels}>
                  <AppText size="small" weight="semibold">
                    EGG SALE
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {String(step + 1).padStart(2, "0")} / 03
                  </AppText>
                </View>
                <View style={styles.progressTrack}>
                  {[0, 1, 2].map((item) => (
                    <View
                      key={item}
                      style={[
                        styles.progressSegment,
                        {
                          backgroundColor:
                            item <= step ? theme.primary : theme.border,
                        },
                      ]}
                    />
                  ))}
                </View>
              </View>
              {error ? (
                <View
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                  style={[
                    styles.formError,
                    {
                      backgroundColor: `${theme.danger}12`,
                      borderColor: theme.danger,
                    },
                  ]}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={20}
                    color={theme.danger}
                  />
                  <AppText size="small" style={styles.formErrorText}>
                    {error}
                  </AppText>
                </View>
              ) : null}
              <Animated.View
                key={`egg-sale-step-${step}`}
                entering={FadeInDown.duration(220)}
                style={styles.stepContent}
              >
                <View style={styles.sectionIntro}>
                  <AppText size="heading" weight="semibold">
                    {["Items and price", "Customer and date", "Payment"][step]}
                  </AppText>
                </View>
              {step === 0 ? (
                <>
                  <Card style={styles.card}>
                    <AppText weight="semibold">Choose products to sell</AppText>
                    <AppText size="small" tone="secondary">
                      Select every egg grade or type included in this sale.
                    </AppText>
                    {fieldErrors.product ? (
                      <AppText size="small" style={{ color: theme.danger }}>
                        {fieldErrors.product}
                      </AppText>
                    ) : null}
                    <View style={styles.choiceList}>
                      {inStockProducts.map((item) => {
                        const selected = selectedProductIds.includes(item.id);
                        const unit = item.units.find(
                          (entry) => entry.is_base_unit,
                        );
                        return (
                          <Pressable
                            key={item.id}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected }}
                            onPress={() => selectProduct(item)}
                            style={[
                              styles.productChoice,
                              {
                                borderColor: selected
                                  ? theme.primary
                                  : theme.border,
                                backgroundColor: selected
                                  ? `${theme.primary}0A`
                                  : theme.background,
                              },
                            ]}
                          >
                            <View style={styles.productChoiceContent}>
                              <View style={styles.productChoiceHeading}>
                                <View style={styles.productCopy}>
                                  <AppText weight="semibold">
                                    {item.name}
                                  </AppText>
                                  <AppText size="small" tone="secondary">
                                    {unit?.name ?? "Egg stock"}
                                  </AppText>
                                </View>
                                <Ionicons
                                  name={
                                    selected
                                      ? "checkmark-circle"
                                      : "chevron-forward"
                                  }
                                  size={20}
                                  color={
                                    selected ? theme.primary : theme.textSecondary
                                  }
                                />
                              </View>
                              <View style={styles.productStockStats}>
                                <View
                                  style={[
                                    styles.productStockStat,
                                    { backgroundColor: theme.backgroundElement },
                                  ]}
                                >
                                  <AppText size="small" tone="secondary">
                                    Total stock
                                  </AppText>
                                  <AppText size="small" weight="semibold">
                                    {quantityLabel(item.on_hand_quantity_in_base_unit, unit?.abbreviation ?? "units")}
                                  </AppText>
                                </View>
                                <View
                                  style={[
                                    styles.productStockStat,
                                    {
                                      backgroundColor: `${theme.secondary}12`,
                                      borderColor: `${theme.secondary}35`,
                                    },
                                  ]}
                                >
                                  <AppText
                                    size="small"
                                    style={{ color: theme.secondary }}
                                  >
                                    Reserved for orders
                                  </AppText>
                                  <AppText size="small" weight="semibold">
                                    {quantityLabel(item.reserved_quantity_in_base_unit, unit?.abbreviation ?? "units")}
                                  </AppText>
                                </View>
                                <View
                                  style={[
                                    styles.productStockStat,
                                    {
                                      backgroundColor: `${theme.success}10`,
                                      borderColor: `${theme.success}35`,
                                    },
                                  ]}
                                >
                                  <AppText
                                    size="small"
                                    style={{ color: theme.success }}
                                  >
                                    Sellable
                                  </AppText>
                                  <AppText
                                    size="small"
                                    weight="semibold"
                                    style={{ color: theme.success }}
                                  >
                                    {quantityLabel(item.available_quantity_in_base_unit, unit?.abbreviation ?? "units")}
                                  </AppText>
                                </View>
                              </View>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Card>
                </>
              ) : null}

              {selectedProducts.length > 0 ? (
                <>
                  {step === 0 ? (
                    <Card style={styles.card}>
                      <View style={styles.sectionTitle}>
                        <View
                          style={[
                            styles.sectionIcon,
                            { backgroundColor: theme.backgroundSelected },
                          ]}
                        >
                          <Ionicons
                            name="pricetag-outline"
                            size={18}
                            color={theme.primary}
                          />
                        </View>
                        <View style={styles.sectionTitleCopy}>
                          <AppText weight="semibold">
                            Set quantity and price
                          </AppText>
                          <AppText size="small" tone="secondary">
                            Add units for each selected product. Different egg
                            grades stay together on this sale.
                          </AppText>
                        </View>
                      </View>
                      {selectedProducts.map((selectedProduct) => {
                        const totals = productTotals.find(
                          (item) => item.product.id === selectedProduct.id,
                        );
                        const baseUnit = totals?.baseUnit;
                        const availableQuantity =
                          totals?.availableQuantity ?? 0;
                        const onHandQuantity = Number(
                          selectedProduct.on_hand_quantity_in_base_unit,
                        );
                        const reservedQuantity = Number(
                          selectedProduct.reserved_quantity_in_base_unit,
                        );
                        const requestedBaseQuantity =
                          totals?.requestedBaseQuantity ?? 0;
                        const productLines = lines.filter(
                          (line) => line.productId === selectedProduct.id,
                        );
                        return (
                          <View
                            key={selectedProduct.id}
                            style={[
                              styles.productSaleGroup,
                              { borderTopColor: theme.border },
                            ]}
                          >
                            <View style={styles.sectionTitleCopy}>
                              <AppText weight="semibold">
                                {selectedProduct.name}
                              </AppText>
                            </View>
                            <View style={styles.stockOverview}>
                              <View
                                style={[
                                  styles.sellableStock,
                                  {
                                    backgroundColor: `${theme.success}10`,
                                    borderColor: `${theme.success}35`,
                                  },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.stockStateIcon,
                                    { backgroundColor: `${theme.success}18` },
                                  ]}
                                >
                                  <Ionicons
                                    name="checkmark-circle-outline"
                                    size={19}
                                    color={theme.success}
                                  />
                                </View>
                                <View style={styles.sellableStockCopy}>
                                  <AppText
                                    size="small"
                                    weight="semibold"
                                    style={{ color: theme.success }}
                                  >
                                    Ready to sell
                                  </AppText>
                                  <AppText
                                    size="heading"
                                    weight="semibold"
                                    style={{ color: theme.success }}
                                  >
                                    {quantityLabel(
                                      availableQuantity,
                                      baseUnit?.abbreviation ?? "pieces",
                                    )}
                                  </AppText>
                                  <AppText size="small" tone="secondary">
                                    After this sale:{" "}
                                    {formatQuantity(
                                      Math.max(
                                        0,
                                        availableQuantity -
                                          requestedBaseQuantity,
                                      ),
                                      baseUnit?.abbreviation ?? "pieces",
                                    )}
                                  </AppText>
                                </View>
                              </View>
                              <View style={styles.stockBreakdown}>
                                <View style={styles.stockBreakdownRow}>
                                  <AppText size="small" tone="secondary">
                                    Total stock
                                  </AppText>
                                  <AppText size="small" weight="semibold">
                                    {quantityLabel(onHandQuantity, baseUnit?.abbreviation ?? "pieces")}
                                  </AppText>
                                </View>
                                <View
                                  style={[
                                    styles.stockBreakdownRow,
                                    styles.reservedStockRow,
                                    {
                                      backgroundColor: `${theme.secondary}10`,
                                      borderColor: `${theme.secondary}35`,
                                    },
                                  ]}
                                >
                                  <AppText
                                    size="small"
                                    weight="semibold"
                                    style={{ color: theme.secondary }}
                                  >
                                    Reserved for orders
                                  </AppText>
                                  <AppText size="small" weight="semibold">
                                    {quantityLabel(reservedQuantity, baseUnit?.abbreviation ?? "pieces")}
                                  </AppText>
                                </View>
                              </View>
                            </View>
                            {fieldErrors[`stock:${selectedProduct.id}`] ? (
                              <AppText
                                size="small"
                                style={{ color: theme.danger }}
                              >
                                {fieldErrors[`stock:${selectedProduct.id}`]}
                              </AppText>
                            ) : null}
                            {productLines.map((line, index) => {
                        const selectedUnit = selectedProduct.units.find(
                          (unit) => unit.id === line.unitId,
                        );
                        const lineQuantity = quantityMilli(line.quantity);
                        const conversionFactor = selectedUnit
                          ? quantityMilli(String(selectedUnit.conversion_factor))
                          : null;
                        const convertedLineQuantity =
                          lineQuantity !== null && conversionFactor !== null
                            ? Number(lineQuantity * conversionFactor) / 1_000_000
                            : null;
                        const baseQuantityMicro =
                          lineQuantity !== null && conversionFactor !== null
                            ? lineQuantity * conversionFactor
                            : null;
                        const lineRevenueCents = lineTotalCents(line);
                        const estimatedCostCents =
                          baseQuantityMicro !== null
                            ? estimatedStockCostCents(
                                selectedProduct.id,
                                baseQuantityMicro,
                              )
                            : null;
                        const estimatedProfitCents =
                          estimatedCostCents !== null &&
                          lineRevenueCents !== null
                            ? lineRevenueCents - estimatedCostCents
                            : null;
                        return (
                          <View
                            key={line.id}
                            style={[
                              styles.lineCard,
                              {
                                borderColor: theme.border,
                                backgroundColor: theme.background,
                              },
                            ]}
                          >
                            <View style={styles.lineHeading}>
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
                              <View style={styles.lineHeadingCopy}>
                                <AppText size="small" weight="semibold">
                                  Sale unit
                                </AppText>
                                {selectedUnit ? (
                                  <AppText size="small" tone="secondary">
                                    Price per {selectedUnit.abbreviation}
                                  </AppText>
                                ) : null}
                              </View>
                              {productLines.length > 1 ? (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Remove unit line ${index + 1}`}
                                  onPress={() => {
                                    setError("");
                                    setFieldErrors({});
                                    setLines((current) =>
                                      current.filter(
                                        (item) => item.id !== line.id,
                                      ),
                                    );
                                  }}
                                >
                                  <Ionicons
                                    name="close-circle-outline"
                                    size={22}
                                    color={theme.danger}
                                  />
                                </Pressable>
                              ) : null}
                            </View>
                            <View style={styles.unitChoices}>
                              {selectedProduct.units.map((unit) => {
                                const active = unit.id === line.unitId;
                                return (
                                  <Pressable
                                    key={unit.id}
                                    accessibilityRole="radio"
                                    accessibilityState={{ checked: active }}
                                    onPress={() =>
                                      updateLine(line.id, { unitId: unit.id })
                                    }
                                    style={[
                                      styles.unitChip,
                                      {
                                        borderColor: active
                                          ? theme.primary
                                          : theme.border,
                                        backgroundColor: active
                                          ? theme.backgroundSelected
                                          : theme.background,
                                      },
                                    ]}
                                  >
                                    <AppText
                                      size="small"
                                      weight={active ? "semibold" : "regular"}
                                    >
                                      {unit.name} ({unit.abbreviation})
                                    </AppText>
                                  </Pressable>
                                );
                              })}
                            </View>
                            <TextField
                              ref={(input) => {
                                inputRefs.current[`quantity:${line.id}`] =
                                  input;
                              }}
                              label={`Quantity (${selectedUnit?.abbreviation ?? "unit"})`}
                              value={line.quantity}
                              onChangeText={(quantity) =>
                                updateLine(line.id, { quantity })
                              }
                              keyboardType="decimal-pad"
                              placeholder="e.g. 2"
                              error={
                                fieldErrors[`quantity:${line.id}`] ??
                                (line.quantity.trim() &&
                                (quantityMilli(line.quantity) === null ||
                                  quantityMilli(line.quantity) === 0n)
                                  ? "Enter a quantity greater than zero (up to 3 decimal places)."
                                  : undefined)
                              }
                            />
                            {selectedUnit && convertedLineQuantity !== null ? (
                              <View
                                style={[
                                  styles.conversionNotice,
                                  {
                                    backgroundColor: `${theme.primary}0A`,
                                    borderColor: `${theme.primary}24`,
                                  },
                                ]}
                              >
                                <Ionicons
                                  name="swap-horizontal-outline"
                                  size={16}
                                  color={theme.primary}
                                />
                                <AppText
                                  size="small"
                                  style={styles.conversionCopy}
                                >
                                  {line.quantity} {selectedUnit.abbreviation} =
                                  {" "}
                                  {formatQuantity(
                                    convertedLineQuantity,
                                    baseUnit?.abbreviation ?? "pieces",
                                  )}
                                </AppText>
                              </View>
                            ) : null}
                            <TextField
                              ref={(input) => {
                                inputRefs.current[`price:${line.id}`] = input;
                              }}
                              label={`Price per ${selectedUnit?.abbreviation ?? "unit"}`}
                              value={line.unitPrice}
                              onChangeText={(unitPrice) =>
                                updateLine(line.id, { unitPrice })
                              }
                              keyboardType="decimal-pad"
                              placeholder="0.00"
                              error={
                                fieldErrors[`price:${line.id}`] ??
                                (line.unitPrice.trim() &&
                                (salePriceCents(line.unitPrice) === null ||
                                  (lineTotalCents(line) ?? 0n) >
                                    MAX_MONEY_CENTS)
                                  ? "Enter a valid price with up to 2 decimal places."
                                  : undefined)
                              }
                            />
                            {selectedUnit ? (
                              <View
                                style={[
                                  styles.lineTotal,
                                  { backgroundColor: theme.backgroundElement },
                                ]}
                              >
                                <AppText size="small" tone="secondary">
                                  Line amount
                                </AppText>
                                <AppText size="small" weight="semibold">
                                  {formatCurrency(
                                    lineTotalCents(line) ?? 0n,
                                    currency,
                                  )}
                                </AppText>
                              </View>
                            ) : null}
                            {lineTotalCents(line) !== null ? (
                              <View
                                style={[
                                  styles.marginEstimate,
                                  {
                                    backgroundColor: theme.backgroundElement,
                                    borderColor: theme.border,
                                  },
                                ]}
                              >
                                <View style={styles.marginEstimateHeading}>
                                  <View style={styles.lineHeadingCopy}>
                                    <AppText size="small" weight="semibold">
                                      Estimated gross profit
                                    </AppText>
                                    <AppText size="small" tone="secondary">
                                      Sale amount less stock cost, before other
                                      expenses
                                    </AppText>
                                  </View>
                                  <Ionicons
                                    name="trending-up-outline"
                                    size={18}
                                    color={theme.primary}
                                  />
                                </View>
                                {estimatedCostCents !== null &&
                                estimatedProfitCents !== null &&
                                lineRevenueCents !== null ? (
                                  <View style={styles.marginValues}>
                                    <View style={styles.marginValue}>
                                      <AppText size="small" tone="secondary">
                                        Sale
                                      </AppText>
                                      <AppText size="small" weight="semibold">
                                        {formatCurrency(
                                          lineRevenueCents,
                                          currency,
                                        )}
                                      </AppText>
                                    </View>
                                    <View style={styles.marginValue}>
                                      <AppText size="small" tone="secondary">
                                        Stock cost
                                      </AppText>
                                      <AppText size="small" weight="semibold">
                                        {formatCurrency(
                                          estimatedCostCents,
                                          currency,
                                        )}
                                      </AppText>
                                    </View>
                                    <View style={styles.marginValue}>
                                      <AppText size="small" tone="secondary">
                                        Est. profit
                                      </AppText>
                                      <AppText
                                        size="small"
                                        weight="semibold"
                                        style={{
                                          color:
                                            estimatedProfitCents >= 0n
                                              ? theme.success
                                              : theme.danger,
                                        }}
                                      >
                                        {formatCurrency(
                                          estimatedProfitCents,
                                          currency,
                                        )}
                                      </AppText>
                                    </View>
                                  </View>
                                ) : (
                                  <AppText size="small" tone="secondary">
                                    {costReport.isPending
                                      ? "Loading recorded stock cost..."
                                      : costReport.isError
                                        ? "Could not load recorded stock cost. This estimate is unavailable."
                                        : "A complete recorded stock cost is unavailable, so profit cannot be estimated."}
                                  </AppText>
                                )}
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                            <View
                              style={[
                                styles.remainingStock,
                                {
                                  backgroundColor:
                                    totals && totals.remainingQuantity < 0
                                      ? `${theme.danger}0A`
                                      : theme.backgroundElement,
                                  borderColor:
                                    totals && totals.remainingQuantity < 0
                                      ? `${theme.danger}35`
                                      : theme.border,
                                },
                              ]}
                            >
                              <Ionicons
                                name={
                                  totals && totals.remainingQuantity < 0
                                    ? "alert-circle-outline"
                                    : "cube-outline"
                                }
                                size={18}
                                color={
                                  totals && totals.remainingQuantity < 0
                                    ? theme.danger
                                    : theme.primary
                                }
                              />
                              <View style={styles.remainingStockCopy}>
                                <AppText size="small" weight="semibold">
                                  {formatQuantity(
                                    Math.max(0, totals?.remainingQuantity ?? 0),
                                    baseUnit?.abbreviation ?? "pieces",
                                  )}{" "}
                                  left
                                </AppText>
                                <AppText size="small" tone="secondary">
                                  Converted from all units of {selectedProduct.name}
                                </AppText>
                              </View>
                            </View>
                            {selectedProduct.units.length > 1 ? (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Add another sale unit for ${selectedProduct.name}`}
                                onPress={() => {
                                  setError("");
                                  setFieldErrors({});
                                  setLines((current) => {
                                    const currentProductLines = current.filter(
                                      (line) =>
                                        line.productId === selectedProduct.id,
                                    );
                                    const unitId =
                                      selectedProduct.units.find(
                                        (unit) =>
                                          !currentProductLines.some(
                                            (line) => line.unitId === unit.id,
                                          ),
                                      )?.id ?? selectedProduct.units[0].id;
                                    return [
                                      ...current,
                                      newLine(selectedProduct.id, unitId),
                                    ];
                                  });
                                }}
                                style={({ pressed }) => [
                                  styles.addUnitAction,
                                  {
                                    backgroundColor: pressed
                                      ? theme.backgroundSelected
                                      : theme.background,
                                    borderColor: `${theme.primary}55`,
                                  },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.addUnitIcon,
                                    { backgroundColor: `${theme.primary}12` },
                                  ]}
                                >
                                  <Ionicons
                                    name="add"
                                    size={20}
                                    color={theme.primary}
                                  />
                                </View>
                                <View style={styles.addUnitCopy}>
                                  <AppText
                                    size="small"
                                    weight="semibold"
                                    style={{ color: theme.primary }}
                                  >
                                    Add another unit
                                  </AppText>
                                  <AppText size="small" tone="secondary">
                                    Add a different pack size
                                  </AppText>
                                </View>
                                <Ionicons
                                  name="chevron-forward"
                                  size={18}
                                  color={theme.primary}
                                />
                              </Pressable>
                            ) : null}
                          </View>
                        );
                      })}
                      <View
                        style={[
                          styles.saleTotal,
                          {
                            backgroundColor: theme.backgroundSelected,
                            borderColor: `${theme.primary}30`,
                          },
                        ]}
                      >
                        <View style={styles.saleTotalCopy}>
                          <AppText size="small" tone="secondary">
                            SALE TOTAL
                          </AppText>
                          <AppText weight="semibold">
                            {formatCurrency(totalCents, currency)}
                          </AppText>
                        </View>
                        <Ionicons
                          name="arrow-forward-circle-outline"
                          size={25}
                          color={theme.primary}
                        />
                      </View>
                      {fieldErrors.total ? (
                        <AppText size="small" style={{ color: theme.danger }}>
                          {fieldErrors.total}
                        </AppText>
                      ) : null}
                    </Card>
                  ) : null}

                  {step === 1 ? (
                    <Card style={styles.card}>
                      <View style={styles.sectionTitle}>
                        <View
                          style={[
                            styles.sectionIcon,
                            { backgroundColor: theme.backgroundSelected },
                          ]}
                        >
                          <Ionicons
                            name="calendar-outline"
                            size={18}
                            color={theme.primary}
                          />
                        </View>
                        <View style={styles.sectionTitleCopy}>
                          <AppText weight="semibold">Sale date</AppText>
                          <AppText size="small" tone="secondary">
                            When the eggs were sold.
                          </AppText>
                        </View>
                      </View>
                      <DatePickerField
                        label="Sale date"
                        value={effectiveSaleDate}
                        onChange={(value) => {
                          setSaleDate(value);
                          setError("");
                          setFieldErrors((current) => {
                            const next = { ...current };
                            delete next.saleDate;
                            return next;
                          });
                        }}
                      />
                      {fieldErrors.saleDate ? (
                        <AppText size="small" style={{ color: theme.danger }}>
                          {fieldErrors.saleDate}
                        </AppText>
                      ) : null}
                      <View
                        style={[
                          styles.sectionDivider,
                          { backgroundColor: theme.border },
                        ]}
                      />
                      <View style={styles.sectionTitle}>
                        <View
                          style={[
                            styles.sectionIcon,
                            { backgroundColor: theme.backgroundSelected },
                          ]}
                        >
                          <Ionicons
                            name="person-outline"
                            size={18}
                            color={theme.primary}
                          />
                        </View>
                        <View style={styles.sectionTitleCopy}>
                          <AppText weight="semibold">Customer</AppText>
                          <AppText size="small" tone="secondary">
                            Optional for walk-in sales.
                          </AppText>
                        </View>
                      </View>
                      <TextField
                        label="Find a customer"
                        value={customerSearch}
                        onChangeText={(value) => {
                          setCustomerSearch(value);
                          setShowAllCustomers(false);
                          setCustomer(null);
                          setCustomerError("");
                          setError("");
                        }}
                        placeholder="Search customers by name or phone"
                      />
                      {!customer ? (
                        <View
                          style={[
                            styles.customerPicker,
                            { backgroundColor: theme.backgroundElement },
                          ]}
                        >
                          <View style={styles.customerPickerHeading}>
                            <AppText size="small" weight="semibold">
                              {customerSearch.trim()
                                ? "SEARCH RESULTS"
                                : "CUSTOMERS"}
                            </AppText>
                            <AppText size="small" tone="secondary">
                              {visibleCustomers.length}
                            </AppText>
                          </View>
                          {customerListLoading ? (
                            <View style={styles.customerStatus}>
                              <AppText size="small" tone="secondary">
                                Loading customers…
                              </AppText>
                            </View>
                          ) : customerDirectoryQuery.isError ? (
                            <View
                              style={[
                                styles.customerStatus,
                                {
                                  backgroundColor: `${theme.danger}0A`,
                                  borderColor: `${theme.danger}35`,
                                },
                              ]}
                            >
                              <AppText size="small" style={{ color: theme.danger }}>
                                Could not load customers. Check your connection and retry.
                              </AppText>
                              <Pressable
                                accessibilityRole="button"
                                onPress={() =>
                                  void customerDirectoryQuery.refetch()
                                }
                              >
                                <AppText
                                  size="small"
                                  weight="semibold"
                                  style={{ color: theme.primary }}
                                >
                                  Retry
                                </AppText>
                              </Pressable>
                            </View>
                          ) : displayedCustomers.length > 0 ? (
                            <View style={styles.customerResults}>
                              {displayedCustomers.map((contact, index) => (
                                <Pressable
                                  key={contact.id}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Select ${contact.name}${contact.phone ? `, ${contact.phone}` : ""}`}
                                  onPress={() => {
                                    setCustomer(contact);
                                    setSmsCustomerDraft(null);
                                    setShowNewCustomerForm(false);
                                    setCustomerSearch("");
                                    setDebouncedCustomerSearch("");
                                    setCustomerError("");
                                  }}
                                  style={({ pressed }) => [
                                    styles.customerChoice,
                                    {
                                      borderColor: theme.border,
                                      backgroundColor: pressed
                                        ? theme.backgroundSelected
                                        : theme.background,
                                    },
                                  ]}
                                >
                                  <View
                                    style={[
                                      styles.customerAvatar,
                                      {
                                        backgroundColor:
                                          index % 2 === 0
                                            ? `${theme.primary}18`
                                            : `${theme.secondary}18`,
                                      },
                                    ]}
                                  >
                                    <AppText
                                      size="small"
                                      weight="semibold"
                                      style={{
                                        color:
                                          index % 2 === 0
                                            ? theme.primary
                                            : theme.secondary,
                                      }}
                                    >
                                      {contact.name.trim().charAt(0).toUpperCase()}
                                    </AppText>
                                  </View>
                                  <View style={styles.customerResultCopy}>
                                    <AppText weight="semibold">
                                      {contact.name}
                                    </AppText>
                                    <AppText size="small" tone="secondary">
                                      {contact.phone ||
                                        contact.email ||
                                        "No contact details"}
                                    </AppText>
                                  </View>
                                  <Ionicons
                                    name="add-circle-outline"
                                    size={21}
                                    color={theme.primary}
                                  />
                                </Pressable>
                              ))}
                            </View>
                          ) : (
                            <View style={styles.customerStatus}>
                              <AppText size="small" tone="secondary">
                                {customerSearch.trim()
                                  ? `No customers match “${customerSearch.trim()}”.`
                                  : "No customers saved yet. This can still be recorded as a walk-in sale."}
                              </AppText>
                            </View>
                          )}
                          {visibleCustomers.length > 5 ||
                          customerDirectoryQuery.hasNextPage ||
                          showAllCustomers ? (
                            <Pressable
                              accessibilityRole="button"
                              disabled={customerDirectoryQuery.isFetchingNextPage}
                              onPress={() => {
                                if (
                                  showAllCustomers &&
                                  customerDirectoryQuery.hasNextPage
                                ) {
                                  void customerDirectoryQuery.fetchNextPage();
                                } else if (
                                  !showAllCustomers &&
                                  visibleCustomers.length > 5
                                ) {
                                  setShowAllCustomers((current) => !current);
                                } else if (customerDirectoryQuery.hasNextPage) {
                                  setShowAllCustomers(true);
                                  void customerDirectoryQuery.fetchNextPage();
                                } else {
                                  setShowAllCustomers(false);
                                }
                              }}
                              style={[
                                styles.customerMoreButton,
                                { borderColor: theme.border },
                              ]}
                            >
                              <AppText
                                size="small"
                                weight="semibold"
                                style={{ color: theme.primary }}
                              >
                                {customerDirectoryQuery.isFetchingNextPage
                                  ? "Loading…"
                                  : showAllCustomers &&
                                      customerDirectoryQuery.hasNextPage
                                    ? "Load more customers"
                                    : showAllCustomers
                                      ? "Show fewer"
                                      : visibleCustomers.length > 5
                                        ? `Show all ${visibleCustomers.length} customers`
                                        : customerSearch.trim()
                                          ? "Load more results"
                                          : "Load more customers"}
                              </AppText>
                              <Ionicons
                                name={
                                  customerDirectoryQuery.isFetchingNextPage
                                    ? "hourglass-outline"
                                    : "chevron-down"
                                }
                                size={16}
                                color={theme.primary}
                              />
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                      {customer ? (
                        <View
                          style={[
                            styles.selectedCustomer,
                            {
                              borderColor: theme.primary,
                              backgroundColor: theme.backgroundSelected,
                            },
                          ]}
                        >
                          <View style={styles.customerResultCopy}>
                            <AppText size="small" tone="secondary">
                              Sale customer
                            </AppText>
                            <AppText weight="semibold">{customer.name}</AppText>
                            {customer.phone ? (
                              <AppText size="small" tone="secondary">
                                {customer.phone}
                              </AppText>
                            ) : null}
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Remove selected customer"
                            onPress={() => setCustomer(null)}
                          >
                            <Ionicons
                              name="close-circle-outline"
                              size={23}
                              color={theme.primary}
                            />
                          </Pressable>
                        </View>
                      ) : null}

                      {activeSmsCustomerDraft && !customer ? (
                        <View
                          style={[
                            styles.smsCustomerNote,
                            {
                              backgroundColor: `${theme.primary}0A`,
                              borderColor: `${theme.primary}35`,
                            },
                          ]}
                        >
                          <Ionicons
                            name="person-circle-outline"
                            size={19}
                            color={theme.primary}
                          />
                          <View style={styles.customerResultCopy}>
                            <AppText size="small" weight="semibold">
                              M-Pesa payer will be linked
                            </AppText>
                            <AppText size="small" tone="secondary">
                              {activeSmsCustomerDraft.name || "Name missing"} ·{" "}
                              {activeSmsCustomerDraft.phone || "Phone missing"}
                            </AppText>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Do not link the M-Pesa payer as customer"
                            onPress={() => setSmsCustomerDraft(null)}
                            hitSlop={8}
                          >
                            <Ionicons
                              name="close-circle-outline"
                              size={20}
                              color={theme.textSecondary}
                            />
                          </Pressable>
                        </View>
                      ) : null}

                      {!customer && !activeSmsCustomerDraft ? (
                        <View style={styles.walkInNote}>
                          <Ionicons
                            name="person-outline"
                            size={17}
                            color={theme.textSecondary}
                          />
                          <AppText size="small" tone="secondary">
                            {customerSearch.trim()
                              ? "Continue without linking a customer for a walk-in sale."
                              : "Walk-in sale · no customer linked."}
                          </AppText>
                        </View>
                      ) : null}

                      {!customer ? (
                        <>
                          <Button
                            label={
                              showNewCustomerForm
                                ? activeSmsCustomerDraft
                                  ? "Cancel using payer details"
                                  : "Cancel adding customer"
                                : "Add a new customer"
                            }
                            variant="secondary"
                            onPress={() => {
                              setShowNewCustomerForm((visible) => !visible);
                              setCustomerError("");
                              if (showNewCustomerForm && activeSmsCustomerDraft) {
                                setSmsCustomerDraft(null);
                              }
                            }}
                          />
                          {showNewCustomerForm ? (
                            <View
                              style={[
                                styles.newCustomerForm,
                                {
                                  backgroundColor: theme.backgroundElement,
                                  borderColor: theme.border,
                                },
                              ]}
                            >
                              <AppText size="small" weight="semibold">
                                New customer details
                              </AppText>
                              <TextField
                                ref={(input) => {
                                  inputRefs.current.smsCustomerName = input;
                                }}
                                label="Customer name"
                                value={newCustomerName}
                                onChangeText={(value) => {
                                  setNewCustomerName(value);
                                  setCustomerError("");
                                  setError("");
                                  setFieldErrors((current) => {
                                    const next = { ...current };
                                    delete next.smsCustomerName;
                                    return next;
                                  });
                                  setSmsCustomerDraft((current) =>
                                    current ? { ...current, name: value } : current,
                                  );
                                }}
                                placeholder="Full name or business name"
                                maxLength={150}
                                error={fieldErrors.smsCustomerName}
                              />
                              <TextField
                                ref={(input) => {
                                  inputRefs.current.smsCustomerPhone = input;
                                }}
                                label={
                                  activeSmsCustomerDraft
                                    ? "Payer phone number"
                                    : "Phone (optional)"
                                }
                                value={newCustomerPhone}
                                onChangeText={(value) => {
                                  setNewCustomerPhone(value);
                                  setCustomerError("");
                                  setError("");
                                  setFieldErrors((current) => {
                                    const next = { ...current };
                                    delete next.smsCustomerPhone;
                                    return next;
                                  });
                                  setSmsCustomerDraft((current) =>
                                    current ? { ...current, phone: value } : current,
                                  );
                                }}
                                placeholder="0712 345 678 or +254 712 345 678"
                                keyboardType="phone-pad"
                                maxLength={30}
                                error={
                                  fieldErrors.smsCustomerPhone ??
                                  (activeSmsCustomerDraft
                                    ? kenyanMobileError(newCustomerPhone)
                                    : undefined)
                                }
                              />
                              <TextField
                                label="Email (optional)"
                                value={newCustomerEmail}
                                onChangeText={(value) => {
                                  setNewCustomerEmail(value);
                                  setCustomerError("");
                                }}
                                placeholder="name@example.com"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                maxLength={255}
                              />
                              {customerError ? (
                                <AppText
                                  size="small"
                                  style={{ color: theme.danger }}
                                >
                                  {customerError}
                                </AppText>
                              ) : null}
                              <Button
                                label={
                                  activeSmsCustomerDraft
                                    ? "Use these details on the sale"
                                    : "Save and select customer"
                                }
                                loading={
                                  !activeSmsCustomerDraft &&
                                  createContact.isPending
                                }
                                disabled={
                                  !activeSmsCustomerDraft &&
                                  !newCustomerName.trim()
                                }
                                onPress={() => {
                                  if (activeSmsCustomerDraft) {
                                    if (!newCustomerName.trim()) {
                                      setCustomerError(
                                        "Enter the payer’s name before using them as the customer.",
                                      );
                                      inputRefs.current.smsCustomerName?.focus();
                                      return;
                                    }
                                    const phoneError =
                                      kenyanMobileError(newCustomerPhone);
                                    if (phoneError) {
                                      setCustomerError(phoneError);
                                      inputRefs.current.smsCustomerPhone?.focus();
                                      return;
                                    }
                                    setSmsCustomerDraft({
                                      ...activeSmsCustomerDraft,
                                      name: newCustomerName.trim(),
                                      phone: newCustomerPhone,
                                    });
                                    setShowNewCustomerForm(false);
                                    setCustomerError("");
                                    setError("");
                                    setFieldErrors((current) => {
                                      const next = { ...current };
                                      delete next.smsCustomerName;
                                      delete next.smsCustomerPhone;
                                      return next;
                                    });
                                  } else {
                                    void addCustomer();
                                  }
                                }}
                              />
                            </View>
                          ) : null}
                        </>
                      ) : null}
                    </Card>
                  ) : null}

                  {step === 2 ? (
                    <>
                      <Card style={styles.card}>
                        <View style={styles.sectionTitle}>
                          <View
                            style={[
                              styles.sectionIcon,
                              { backgroundColor: theme.backgroundSelected },
                            ]}
                          >
                            <Ionicons
                              name="card-outline"
                              size={18}
                              color={theme.primary}
                            />
                          </View>
                          <View style={styles.sectionTitleCopy}>
                            <AppText weight="semibold">Payment</AppText>
                            <AppText size="small" tone="secondary">
                              Sale total · {formatCurrency(totalCents, currency)}
                            </AppText>
                          </View>
                        </View>
                        <View style={styles.paymentModeChoices}>
                          {[
                            {
                              value: true,
                              title: "Received",
                              detail: "Record money collected",
                            },
                            {
                              value: false,
                              title: "Not yet",
                              detail: "Leave the full balance due",
                            },
                          ].map((choice) => {
                            const selected = recordPayment === choice.value;
                            return (
                              <Pressable
                                key={choice.title}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: selected }}
                                onPress={() => {
                                  setRecordPayment(choice.value);
                                  if (!choice.value) setSmsCustomerDraft(null);
                                }}
                                style={[
                                  styles.paymentMode,
                                  {
                                    borderColor: selected
                                      ? theme.primary
                                      : theme.border,
                                    backgroundColor: selected
                                      ? `${theme.primary}0A`
                                      : theme.background,
                                  },
                                ]}
                              >
                                <Ionicons
                                  name={
                                    choice.value
                                      ? "checkmark-circle-outline"
                                      : "time-outline"
                                  }
                                  size={20}
                                  color={
                                    selected
                                      ? theme.primary
                                      : theme.textSecondary
                                  }
                                />
                                <View style={styles.paymentModeCopy}>
                                  <AppText
                                    size="small"
                                    weight={selected ? "semibold" : "regular"}
                                  >
                                    {choice.title}
                                  </AppText>
                                  <AppText size="small" tone="secondary">
                                    {choice.detail}
                                  </AppText>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                        {recordPayment ? (
                          <>
                            {payments.map((payment, index) => (
                              <View
                                key={payment.id}
                                style={[
                                  styles.paymentEntry,
                                  {
                                    borderColor: theme.border,
                                    backgroundColor: theme.background,
                                  },
                                ]}
                              >
                                <View style={styles.headingRow}>
                                  <AppText weight="semibold">
                                    Payment {index + 1}
                                  </AppText>
                                  {payments.length > 1 ? (
                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityLabel={`Remove payment ${index + 1}`}
                                      onPress={() => {
                                        setError("");
                                        setPayments((current) =>
                                          current.filter(
                                            (item) => item.id !== payment.id,
                                          ),
                                        );
                                      }}
                                    >
                                      <View style={styles.removePaymentIcon}>
                                        <Ionicons
                                          name="trash-outline"
                                          size={17}
                                          color={theme.danger}
                                        />
                                      </View>
                                    </Pressable>
                                  ) : null}
                                </View>
                                <TextField
                                  ref={(input) => {
                                    inputRefs.current[`payment:${payment.id}`] =
                                      input;
                                  }}
                                  label="Amount received"
                                  value={payment.amount}
                                  onChangeText={(amount) =>
                                    updatePayment(payment.id, { amount })
                                  }
                                  keyboardType="decimal-pad"
                                  placeholder={`0.00 ${currency}`}
                                  error={
                                    fieldErrors[`payment:${payment.id}`] ??
                                    (payment.amount.trim() &&
                                    (salePriceCents(payment.amount) === null ||
                                      salePriceCents(payment.amount) === 0n ||
                                      (salePriceCents(payment.amount) ?? 0n) >
                                        MAX_MONEY_CENTS)
                                      ? "Enter an amount greater than zero with up to 2 decimal places."
                                      : undefined)
                                  }
                                />
                                {remainingForFullPayment(payment.id) > 0n ? (
                                  <Pressable
                                    accessibilityRole="button"
                                    onPress={() =>
                                      fillRemainingPayment(payment.id)
                                    }
                                    style={[
                                      styles.fillPaymentButton,
                                      {
                                        borderColor: `${theme.primary}35`,
                                        backgroundColor: `${theme.primary}08`,
                                      },
                                    ]}
                                  >
                                    <Ionicons
                                      name="arrow-down-circle-outline"
                                      size={17}
                                      color={theme.primary}
                                    />
                                    <AppText
                                      size="small"
                                      weight="semibold"
                                      style={{ color: theme.primary }}
                                    >
                                      Fill remaining ·{" "}
                                      {formatCurrency(
                                        remainingForFullPayment(payment.id),
                                        currency,
                                      )}
                                    </AppText>
                                  </Pressable>
                                ) : null}
                                <AppText size="small" weight="semibold">
                                  How was it paid?
                                </AppText>
                                <View style={styles.paymentMethodsGrid}>
                                  {paymentMethods.map((method) => {
                                    const active =
                                      payment.method === method.value;
                                    return (
                                      <Pressable
                                        key={method.value}
                                        accessibilityRole="radio"
                                        accessibilityState={{
                                          checked: active,
                                        }}
                                        onPress={() =>
                                          updatePayment(payment.id, {
                                            method: method.value,
                                            ...(method.value !== "mpesa"
                                              ? {
                                                  reference: "",
                                                  smsMessageId: undefined,
                                                  date: undefined,
                                                  time: undefined,
                                                  payerName: undefined,
                                                  payerPhone: undefined,
                                                }
                                              : {}),
                                          })
                                        }
                                        style={[
                                          styles.paymentMethod,
                                          {
                                            borderColor: active
                                              ? theme.primary
                                              : theme.border,
                                            backgroundColor: active
                                              ? `${theme.primary}0A`
                                              : theme.background,
                                          },
                                        ]}
                                      >
                                        <Ionicons
                                          name={method.icon}
                                          size={18}
                                          color={
                                            active
                                              ? theme.primary
                                              : theme.textSecondary
                                          }
                                        />
                                        <AppText
                                          size="small"
                                          weight={
                                            active ? "semibold" : "regular"
                                          }
                                        >
                                          {method.label}
                                        </AppText>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                                {payment.method === "mpesa" ? (
                                  <>
                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityLabel={
                                        payment.smsMessageId
                                          ? "Choose a different M-Pesa message"
                                          : "Paste an M-Pesa payment confirmation"
                                      }
                                      onPress={() => {
                                        setError("");
                                        setSmsPickerPaymentId(payment.id);
                                      }}
                                      style={({ pressed }) => [
                                        styles.smsPaymentButton,
                                        {
                                          backgroundColor: pressed
                                            ? theme.backgroundSelected
                                            : theme.backgroundElement,
                                          borderColor: `${theme.primary}55`,
                                        },
                                      ]}
                                    >
                                      <View
                                        style={[
                                          styles.smsPaymentIcon,
                                          { backgroundColor: theme.primary },
                                        ]}
                                      >
                                        <Ionicons
                                          name="chatbox-ellipses-outline"
                                          size={18}
                                          color={theme.onPrimary}
                                        />
                                      </View>
                                      <View style={styles.smsPaymentCopy}>
                                        <AppText
                                          size="small"
                                          weight="semibold"
                                        >
                                          {payment.smsMessageId
                                            ? "Change M-Pesa message"
                                            : "Paste M-Pesa confirmation"}
                                        </AppText>
                                        <AppText size="small" tone="secondary">
                                          Copy a confirmation from Messages, then paste
                                        </AppText>
                                      </View>
                                      <Ionicons
                                        name="chevron-forward"
                                        size={19}
                                        color={theme.primary}
                                      />
                                    </Pressable>
                                    {payment.smsMessageId ? (
                                      <View
                                        style={[
                                          styles.smsSelectedBadge,
                                          {
                                            backgroundColor: `${theme.success}0A`,
                                            borderColor: `${theme.success}35`,
                                          },
                                        ]}
                                      >
                                        <Ionicons
                                          name="checkmark-circle"
                                          size={17}
                                          color={theme.success}
                                        />
                                        <View style={styles.smsSelectedCopy}>
                                          <AppText
                                            size="small"
                                            weight="semibold"
                                          >
                                            Message added
                                          </AppText>
                                          {payment.payerName ? (
                                            <AppText
                                              size="small"
                                              tone="secondary"
                                            >
                                              Paid by {payment.payerName}
                                            </AppText>
                                          ) : null}
                                          {payment.date ? (
                                            <AppText
                                              size="small"
                                              tone="secondary"
                                            >
                                              {payment.date}
                                              {payment.time
                                                ? ` at ${payment.time}`
                                                : ""}
                                            </AppText>
                                          ) : null}
                                          {payment.reference ? (
                                            <View style={styles.smsReference}>
                                              <AppText
                                                size="small"
                                                tone="secondary"
                                              >
                                                Transaction code
                                              </AppText>
                                              <AppText
                                                size="small"
                                                weight="semibold"
                                                style={styles.smsReferenceValue}
                                              >
                                                {payment.reference}
                                              </AppText>
                                            </View>
                                          ) : null}
                                        </View>
                                      </View>
                                    ) : null}
                                    {smsImportNativeError ? (
                                      <AppText
                                        size="small"
                                        style={{ color: theme.danger }}
                                      >
                                        {smsImportNativeError}
                                      </AppText>
                                    ) : null}
                                  </>
                                ) : null}
                                {payment.method !== "cash" &&
                                payment.method !== "mpesa" ? (
                                  <TextField
                                    label="Reference number (optional)"
                                    value={payment.reference}
                                    onChangeText={(reference) =>
                                      updatePayment(payment.id, { reference })
                                    }
                                    placeholder="Bank or card reference"
                                    maxLength={100}
                                  />
                                ) : null}
                                {payment.method === "mpesa" &&
                                !payment.smsMessageId ? (
                                  <TextField
                                    label="M-Pesa transaction code (optional)"
                                    value={payment.reference}
                                    onChangeText={(reference) =>
                                      updatePayment(payment.id, { reference })
                                    }
                                    placeholder="e.g. QWE123ABC"
                                    autoCapitalize="characters"
                                    maxLength={100}
                                  />
                                ) : null}
                              </View>
                            ))}
                            <Button
                              label="Add another payment"
                              variant="secondary"
                              onPress={() => {
                                setError("");
                                setPayments((current) => [
                                  ...current,
                                  newPayment(),
                                ]);
                              }}
                            />
                          </>
                        ) : null}
                        <View style={styles.paymentSummary}>
                          <View style={styles.summaryRow}>
                            <AppText size="small" tone="secondary">
                              Payments recorded now
                            </AppText>
                            <AppText size="small" weight="semibold">
                              {formatCurrency(paidCents, currency)}
                            </AppText>
                          </View>
                          {fieldErrors.customer ? (
                            <AppText
                              size="small"
                              style={{ color: theme.danger }}
                            >
                              {fieldErrors.customer}
                            </AppText>
                          ) : null}
                          {creditCents > 0n ? (
                            <View
                              style={[
                                styles.paymentOutcome,
                                {
                                  backgroundColor: `${theme.primary}0A`,
                                  borderColor: `${theme.primary}30`,
                                },
                              ]}
                            >
                              <Ionicons
                                name="return-down-back-outline"
                                size={20}
                                color={theme.primary}
                              />
                              <View style={styles.switchCopy}>
                                <AppText
                                  size="small"
                                  weight="semibold"
                                  style={{ color: theme.primary }}
                                >
                                  {formatCurrency(creditCents, currency)} customer credit
                                </AppText>
                                <AppText size="small" tone="secondary">
                                  The extra will be held as credit; no refund is issued.
                                </AppText>
                              </View>
                            </View>
                          ) : balanceDueCents > 0n ? (
                            <View
                              style={[
                                styles.paymentOutcome,
                                {
                                  backgroundColor: `${theme.danger}0A`,
                                  borderColor: `${theme.danger}30`,
                                },
                              ]}
                            >
                              <Ionicons
                                name="time-outline"
                                size={20}
                                color={theme.danger}
                              />
                              <View style={styles.switchCopy}>
                                <AppText
                                  size="small"
                                  weight="semibold"
                                  style={{ color: theme.danger }}
                                >
                                  {formatCurrency(balanceDueCents, currency)} due
                                </AppText>
                                <AppText size="small" tone="secondary">
                                  This amount will remain outstanding on the sale.
                                </AppText>
                              </View>
                            </View>
                          ) : totalCents > 0n ? (
                            <View
                              style={[
                                styles.paymentOutcome,
                                {
                                  backgroundColor: `${theme.success}0A`,
                                  borderColor: `${theme.success}30`,
                                },
                              ]}
                            >
                              <Ionicons
                                name="checkmark-circle-outline"
                                size={20}
                                color={theme.success}
                              />
                              <AppText
                                size="small"
                                weight="semibold"
                                style={{ color: theme.success }}
                              >
                                Paid in full
                              </AppText>
                            </View>
                          ) : (
                            <AppText size="small" tone="secondary">
                              Add sale quantities and prices to preview the
                              balance.
                            </AppText>
                          )}
                        </View>
                      </Card>

                      {balanceDueCents > 0n || creditCents > 0n ? (
                        <Card style={styles.reminderCard}>
                          <View style={styles.sectionTitle}>
                            <View
                              style={[
                                styles.sectionIcon,
                                { backgroundColor: `${theme.primary}14` },
                              ]}
                            >
                              <Ionicons
                                name="notifications-outline"
                                size={18}
                                color={theme.primary}
                              />
                            </View>
                            <View style={styles.sectionTitleCopy}>
                              <AppText weight="semibold">
                                Follow-up reminder
                              </AppText>
                              <AppText size="small" tone="secondary">
                                Keep this outstanding amount on your radar.
                              </AppText>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.reminderAmount,
                              {
                                backgroundColor: `${theme.primary}0A`,
                                borderColor: `${theme.primary}25`,
                              },
                            ]}
                          >
                            <View style={styles.reminderAmountCopy}>
                              <AppText size="small" tone="secondary">
                                {creditCents > 0n
                                  ? "Customer credit to settle"
                                  : "Balance to collect"}
                              </AppText>
                              <AppText weight="semibold">
                                {formatCurrency(
                                  creditCents > 0n
                                    ? creditCents
                                    : balanceDueCents,
                                  currency,
                                )}
                              </AppText>
                            </View>
                            <Switch
                              accessibilityLabel="Set a follow-up reminder for this egg sale"
                              value={scheduleSaleFollowUp}
                              onValueChange={setScheduleSaleFollowUp}
                              trackColor={{
                                false: theme.border,
                                true: theme.primary,
                              }}
                            />
                          </View>
                          {scheduleSaleFollowUp ? (
                            <>
                              <AppText size="small" tone="secondary">
                                Reminder for{" "}
                                {customer?.name ??
                                  activeSmsCustomerDraft?.name ??
                                  "the buyer"}
                              </AppText>
                              <View
                                style={[
                                  styles.reminderSchedule,
                                  {
                                    backgroundColor: theme.background,
                                    borderColor: theme.border,
                                  },
                                ]}
                              >
                                <AppText size="small" weight="semibold">
                                  WHEN SHOULD WE REMIND YOU?
                                </AppText>
                                <AppText size="small" tone="secondary">
                                  Saved in FarmTrack; a phone alert is also set
                                  when this device supports it.
                                </AppText>
                                <DatePickerField
                                  label="Reminder date"
                                  value={effectiveReminderDueDate}
                                  onChange={(value) => {
                                    setReminderDueDate(value);
                                    setFieldErrors((current) => {
                                      const next = { ...current };
                                      delete next.reminderDate;
                                      return next;
                                    });
                                  }}
                                  minimumDate={parseCalendarDate(
                                    farmToday(timezone),
                                  )}
                                />
                                {fieldErrors.reminderDate ? (
                                  <AppText
                                    size="small"
                                    style={{ color: theme.danger }}
                                  >
                                    {fieldErrors.reminderDate}
                                  </AppText>
                                ) : null}
                                <TimePickerField
                                  label="Reminder time · farm local"
                                  value={reminderDueTime}
                                  onChange={(value) => {
                                    setReminderDueTime(value);
                                    setFieldErrors((current) => {
                                      const next = { ...current };
                                      delete next.reminderTime;
                                      delete next.reminderDate;
                                      return next;
                                    });
                                  }}
                                  minimumTime={
                                    effectiveReminderDueDate ===
                                    farmToday(timezone)
                                      ? farmTimeNow(timezone)
                                      : undefined
                                  }
                                />
                                {fieldErrors.reminderTime ? (
                                  <AppText
                                    size="small"
                                    style={{ color: theme.danger }}
                                  >
                                    {fieldErrors.reminderTime}
                                  </AppText>
                                ) : null}
                              </View>
                            </>
                          ) : null}
                        </Card>
                      ) : null}

                      <Card style={styles.card}>
                        <AppText weight="semibold">Sale note</AppText>
                        <TextField
                          label="Notes (optional)"
                          value={notes}
                          onChangeText={(value) => {
                            setNotes(value);
                            setError("");
                          }}
                          placeholder="Add a note about this sale"
                          multiline
                        />
                      </Card>
                    </>
                  ) : null}
                </>
              ) : null}

              </Animated.View>
            </>
          ) : null}

          {stage === "review" && selectedProducts.length > 0 ? (
            <>
              <View
                style={[
                  styles.reviewTotalCard,
                  {
                    backgroundColor: theme.backgroundSelected,
                    borderColor: `${theme.primary}35`,
                  },
                ]}
              >
                <View style={styles.reviewTotalTop}>
                  <View
                    style={[
                      styles.reviewTotalIcon,
                      { backgroundColor: `${theme.primary}18` },
                    ]}
                  >
                    <Ionicons
                      name="receipt-outline"
                      size={20}
                      color={theme.primary}
                    />
                  </View>
                  <AppText size="small" weight="semibold">
                    SALE TOTAL
                  </AppText>
                </View>
                <AppText size="title" weight="semibold">
                  {formatCurrency(totalCents, currency)}
                </AppText>
                <AppText size="small" tone="secondary">
                  {selectedProducts.length} egg product
                  {selectedProducts.length === 1 ? "" : "s"} · {lines.length} sale
                  {lines.length === 1 ? " line" : " lines"}
                </AppText>
              </View>

              {productTotals.map((totals) => {
                const productLines = lines.filter(
                  (line) => line.productId === totals.product.id,
                );
                const productTotal = productLines.reduce(
                  (sum, line) => sum + (lineTotalCents(line) ?? 0n),
                  0n,
                );
                return (
                  <Card key={totals.product.id} style={styles.reviewCard}>
                    <View style={styles.sectionTitle}>
                      <View
                        style={[
                          styles.sectionIcon,
                          { backgroundColor: theme.backgroundSelected },
                        ]}
                      >
                        <Ionicons
                          name="egg-outline"
                          size={18}
                          color={theme.primary}
                        />
                      </View>
                      <View style={styles.sectionTitleCopy}>
                        <AppText weight="semibold">
                          {totals.product.name}
                        </AppText>
                        <AppText size="small" tone="secondary">
                          {formatQuantity(
                            totals.requestedBaseQuantity,
                            totals.baseUnit?.abbreviation ?? "pieces",
                          )}{" "}
                          from stock
                        </AppText>
                      </View>
                      <AppText size="small" weight="semibold">
                        {formatCurrency(productTotal, currency)}
                      </AppText>
                    </View>
                    {productLines.map((line) => {
                      const unit = totals.product.units.find(
                        (item) => item.id === line.unitId,
                      );
                      const quantity = quantityMilli(line.quantity);
                      const factor = unit
                        ? quantityMilli(String(unit.conversion_factor))
                        : null;
                      const convertedQuantity =
                        quantity !== null && factor !== null
                          ? Number(quantity * factor) / 1_000_000
                          : null;
                      return (
                        <View
                          key={line.id}
                          style={[
                            styles.reviewItem,
                            { borderTopColor: theme.border },
                          ]}
                        >
                          <View style={styles.reviewItemCopy}>
                            <AppText size="small" weight="semibold">
                              {line.quantity} {unit?.abbreviation}
                            </AppText>
                            <AppText size="small" tone="secondary">
                              {convertedQuantity !== null
                                ? `${formatQuantity(convertedQuantity, totals.baseUnit?.abbreviation ?? "pieces")} · `
                                : ""}
                              {formatCurrency(
                                salePriceCents(line.unitPrice) ?? 0n,
                                currency,
                              )}{" "}
                              per {unit?.abbreviation}
                            </AppText>
                          </View>
                          <AppText size="small" weight="semibold">
                            {formatCurrency(lineTotalCents(line) ?? 0n, currency)}
                          </AppText>
                        </View>
                      );
                    })}
                    <View
                      style={[
                        styles.reviewStockSummary,
                        { backgroundColor: theme.backgroundElement },
                      ]}
                    >
                      <Ionicons
                        name="cube-outline"
                        size={17}
                        color={theme.primary}
                      />
                      <AppText size="small" weight="semibold">
                        {formatQuantity(
                          Math.max(0, totals.remainingQuantity),
                          totals.baseUnit?.abbreviation ?? "pieces",
                        )}{" "}
                        left after sale
                      </AppText>
                    </View>
                  </Card>
                );
              })}

              <Card style={styles.reviewCard}>
                <View style={styles.sectionTitle}>
                  <View
                    style={[
                      styles.sectionIcon,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <Ionicons
                      name="person-outline"
                      size={18}
                      color={theme.primary}
                    />
                  </View>
                  <AppText weight="semibold">Sale details</AppText>
                </View>
                <SummaryRow label="Sale date" value={effectiveSaleDate} />
                <SummaryRow
                  label="Customer"
                  value={
                    customer?.name ??
                    activeSmsCustomerDraft?.name ??
                    "Walk-in · no customer linked"
                  }
                />
                {activeSmsCustomerDraft?.phone ? (
                  <SummaryRow
                    label="Payer phone"
                    value={activeSmsCustomerDraft.phone}
                  />
                ) : null}
              </Card>

              <Card style={styles.reviewCard}>
                <View style={styles.sectionTitle}>
                  <View
                    style={[
                      styles.sectionIcon,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <Ionicons
                      name="card-outline"
                      size={18}
                      color={theme.primary}
                    />
                  </View>
                  <AppText weight="semibold">Payment summary</AppText>
                </View>
                {recordPayment ? (
                  payments.map((payment, index) => (
                    <View
                      key={payment.id}
                      style={[
                        styles.paymentReviewRow,
                        { borderTopColor: theme.border },
                      ]}
                    >
                      <View style={styles.paymentReviewHeading}>
                        <AppText size="small" weight="semibold">
                          {index + 1}.{" "}
                          {paymentMethods.find(
                            (method) => method.value === payment.method,
                          )?.label ?? "Payment"}
                        </AppText>
                        <AppText size="small" weight="semibold">
                          {formatCurrency(
                            salePriceCents(payment.amount) ?? 0n,
                            currency,
                          )}
                        </AppText>
                      </View>
                      {payment.reference.trim() ? (
                        <AppText size="small" tone="secondary">
                          Ref: {payment.reference.trim()}
                        </AppText>
                      ) : null}
                      {payment.date ? (
                        <AppText size="small" tone="secondary">
                          Received {payment.date}
                          {payment.time ? ` at ${payment.time}` : ""}
                        </AppText>
                      ) : null}
                    </View>
                  ))
                ) : (
                  <View
                    style={[
                      styles.noPaymentsNote,
                      { backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={18}
                      color={theme.textSecondary}
                    />
                    <AppText size="small" tone="secondary">
                      No payment recorded now
                    </AppText>
                  </View>
                )}
                <View
                  style={[
                    styles.paidNowSummary,
                    { backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <AppText size="small" tone="secondary">
                    Paid now
                  </AppText>
                  <AppText size="small" weight="semibold">
                    {formatCurrency(paidCents, currency)}
                  </AppText>
                </View>
                <View
                  style={[
                    styles.reviewOutcome,
                    {
                      borderColor:
                        creditCents > 0n
                          ? theme.primary
                          : balanceDueCents > 0n
                            ? theme.danger
                            : theme.success,
                      backgroundColor:
                        creditCents > 0n
                          ? `${theme.primary}0A`
                          : balanceDueCents > 0n
                            ? `${theme.danger}0A`
                            : `${theme.success}0A`,
                    },
                  ]}
                >
                  <AppText
                    weight="semibold"
                    style={{
                      color:
                        creditCents > 0n
                          ? theme.primary
                          : balanceDueCents > 0n
                            ? theme.danger
                            : theme.success,
                    }}
                  >
                    {creditCents > 0n
                      ? "You owe the customer"
                      : balanceDueCents > 0n
                        ? "Customer still owes you"
                        : "Paid in full"}
                  </AppText>
                  {creditCents > 0n || balanceDueCents > 0n ? (
                    <AppText size="small" weight="semibold">
                      {formatCurrency(
                        creditCents > 0n ? creditCents : balanceDueCents,
                        currency,
                      )}
                    </AppText>
                  ) : null}
                  {creditCents > 0n ? (
                    <AppText size="small" tone="secondary">
                      Held as customer credit. No refund is issued.
                    </AppText>
                  ) : balanceDueCents > 0n ? (
                    <AppText size="small" tone="secondary">
                      Remains outstanding on this sale.
                    </AppText>
                  ) : null}
                </View>
              </Card>

              {notes.trim() ||
              (scheduleSaleFollowUp &&
                (balanceDueCents > 0n || creditCents > 0n)) ? (
                <Card style={styles.reviewCard}>
                  <View style={styles.sectionTitle}>
                    <View
                      style={[
                        styles.sectionIcon,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <Ionicons
                        name="document-text-outline"
                        size={18}
                        color={theme.primary}
                      />
                    </View>
                    <AppText weight="semibold">Notes and follow-up</AppText>
                  </View>
                  {notes.trim() ? (
                    <View
                      style={[
                        styles.reviewNote,
                        { backgroundColor: theme.backgroundElement },
                      ]}
                    >
                      <AppText size="small" tone="secondary">
                        Sale note
                      </AppText>
                      <AppText size="small">{notes.trim()}</AppText>
                    </View>
                  ) : null}
                  {scheduleSaleFollowUp &&
                  (balanceDueCents > 0n || creditCents > 0n) ? (
                    <View style={styles.reviewReminder}>
                      <View
                        style={[
                          styles.reviewReminderIcon,
                          { backgroundColor: `${theme.primary}14` },
                        ]}
                      >
                        <Ionicons
                          name="notifications-outline"
                          size={18}
                          color={theme.primary}
                        />
                      </View>
                      <View style={styles.reviewReminderCopy}>
                        <AppText size="small" weight="semibold">
                          Follow-up scheduled
                        </AppText>
                        <AppText size="small" tone="secondary">
                          {effectiveReminderDueDate} · {reminderDueTime}
                        </AppText>
                      </View>
                    </View>
                  ) : null}
                </Card>
              ) : null}
              <View style={styles.reviewEditGroup}>
                <AppText size="small" weight="semibold" tone="secondary">
                  Need to change something?
                </AppText>
                <View style={styles.editReviewActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit eggs and prices"
                    disabled={createSale.isPending}
                    onPress={() => {
                      setStep(0);
                      setStage("edit");
                    }}
                    style={[
                      styles.editAction,
                      { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <Ionicons name="egg-outline" size={18} color={theme.primary} />
                    <AppText size="small" weight="semibold">Items</AppText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit customer and date"
                    disabled={createSale.isPending}
                    onPress={() => {
                      setStep(1);
                      setStage("edit");
                    }}
                    style={[
                      styles.editAction,
                      { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <Ionicons name="person-outline" size={18} color={theme.primary} />
                    <AppText size="small" weight="semibold">Customer</AppText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit payments and reminder"
                    disabled={createSale.isPending}
                    onPress={() => {
                      setStep(2);
                      setStage("edit");
                    }}
                    style={[
                      styles.editAction,
                      { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <Ionicons name="card-outline" size={18} color={theme.primary} />
                    <AppText size="small" weight="semibold">Payment</AppText>
                  </Pressable>
                </View>
              </View>
            </>
          ) : null}
        </ScrollView>
        {stage === "edit" && inStockProducts.length > 0 ? (
          <View
            style={[
              styles.stickyActions,
              {
                backgroundColor: theme.background,
                borderTopColor: theme.border,
              },
            ]}
          >
            {step > 0 ? (
              <Button
                label="Back"
                variant="secondary"
                onPress={() => {
                  setError("");
                  setStep((current) => current - 1);
                  scrollRef.current?.scrollTo({ y: 0, animated: true });
                }}
                style={styles.backAction}
              />
            ) : null}
            <Button
              label={step === 2 ? "Review sale" : "Continue"}
              onPress={continueSale}
              style={styles.continueAction}
            />
          </View>
        ) : null}
        {stage === "review" && selectedProducts.length > 0 ? (
          <View
            style={[
              styles.stickyActions,
              {
                backgroundColor: theme.background,
                borderTopColor: theme.border,
              },
            ]}
          >
            <Button
              label={
                creditCents > 0n
                  ? "Confirm sale & customer credit"
                  : balanceDueCents > 0n
                    ? "Confirm sale with balance due"
                    : "Confirm fully paid sale"
              }
              loading={createSale.isPending}
              disabled={createSale.isPending}
              onPress={() => void submitSale()}
              style={styles.continueAction}
            />
          </View>
        ) : null}
        {smsPickerPaymentId ? (
          <SmsPaymentPicker
            key={smsPickerPaymentId}
            visible
            fromDate={effectiveSaleDate}
            currency={currency}
            existingReferences={payments.flatMap((payment) =>
              payment.id !== smsPickerPaymentId &&
              payment.method === "mpesa" &&
              payment.reference.trim()
                ? [payment.reference.trim()]
                : [],
            )}
            existingSmsMessageIds={payments.flatMap((payment) =>
              payment.id === smsPickerPaymentId && payment.smsMessageId
                ? [payment.smsMessageId]
                : [],
            )}
            excludedSmsMessageIds={payments.flatMap((payment) =>
              payment.id !== smsPickerPaymentId && payment.smsMessageId
                ? [payment.smsMessageId]
                : [],
            )}
            maxSelections={10}
            hasExistingPayments={payments.some(
              (payment) =>
                payment.id !== smsPickerPaymentId &&
                (payment.amount.trim() || payment.reference.trim()),
            )}
            selectIntoExistingPayment
            transactionLabel="egg sale"
            expectedDirection="INCOMING"
            overpaymentMessage="The amount above the egg sale total becomes customer credit."
            purchaseTotalCents={totalCents.toString()}
            currentPaidCents={payments
              .filter((payment) => payment.id !== smsPickerPaymentId)
              .reduce(
                (sum, payment) =>
                  sum + (salePriceCents(payment.amount) ?? 0n),
                0n,
              )
              .toString()}
            sharedMessage={sharedMessage}
            onClose={() => setSmsPickerPaymentId(null)}
            onSelect={(selected) => void applySmsPayment(selected)}
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <AppText size="small" tone="secondary">
        {label}
      </AppText>
      <AppText size="small" style={styles.summaryValue}>
        {value}
      </AppText>
    </View>
  );
}

function formatQuantity(value: number, unit: string): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${unit}`;
}

function formatCurrency(
  cents: bigint,
  currency: string | null | undefined,
): string {
  const code = currency?.toUpperCase();
  if (!code || !/^[A-Z]{3}$/.test(code)) {
    return `${centsToDecimal(cents)}${currency ? ` ${currency}` : ""}`;
  }
  return formatCents(cents, code);
}

function friendlySaleError(message: string): string {
  if (/not enough|available|stock|inventory/i.test(message)) {
    return "The available egg stock changed. Review the quantity and try again.";
  }
  if (/not marked as available for sale/i.test(message)) {
    return "This egg product is no longer enabled for sale. Choose another product.";
  }
  if (/unit is not configured|selected unit/i.test(message)) {
    return "A selected unit is no longer configured for this product. Choose a valid unit.";
  }
  return message;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 24,
    gap: 14,
  },
  card: { gap: 13 },
  progressCard: {
    gap: 9,
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTrack: {
    flexDirection: "row",
    gap: 5,
  },
  progressSegment: {
    flex: 1,
    height: 5,
    borderRadius: 4,
  },
  stickyActions: {
    flexDirection: "row",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
  },
  backAction: { minWidth: 96 },
  continueAction: { flex: 1 },
  formError: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  formErrorText: { flex: 1 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 24 },
  stepContent: { gap: 14 },
  sectionIntro: { gap: 3 },
  choiceList: { gap: 9 },
  productChoice: {
    gap: 11,
    borderWidth: 1,
    borderRadius: 15,
    padding: 12,
  },
  productChoiceContent: { flex: 1, minWidth: 0, gap: 11 },
  productChoiceHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  productCopy: { flex: 1, minWidth: 0, gap: 3 },
  productStockStats: { gap: 6 },
  productStockStat: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  sectionTitleCopy: { flex: 1, minWidth: 0, gap: 1 },
  sectionDivider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  stockOverview: {
    gap: 10,
  },
  sellableStock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderRadius: 15,
    padding: 12,
  },
  stockStateIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  sellableStockCopy: { flex: 1, minWidth: 0, gap: 1 },
  stockBreakdown: {
    gap: 5,
    paddingTop: 2,
  },
  stockBreakdownRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  reservedStockRow: {
    borderWidth: 1,
  },
  productSaleGroup: {
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
  },
  conversionNotice: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  conversionCopy: { flex: 1, minWidth: 0 },
  remainingStock: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  remainingStockCopy: { flex: 1, gap: 2 },
  addUnitAction: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  addUnitIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  addUnitCopy: { flex: 1, minWidth: 0, gap: 2 },
  lineCard: {
    gap: 12,
    borderWidth: 1,
    borderRadius: 13,
    padding: 12,
  },
  lineHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  lineNumber: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  lineHeadingCopy: { flex: 1, minWidth: 0, gap: 1 },
  lineTotal: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 9,
    paddingHorizontal: 10,
  },
  marginEstimate: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 11,
    padding: 11,
  },
  marginEstimateHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  marginValues: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  marginValue: { flex: 1, minWidth: 82, gap: 3 },
  headingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  unitChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  unitChip: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  saleTotal: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  saleTotalCopy: { gap: 1 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  switchCopy: { flex: 1, gap: 4 },
  reviewEditGroup: { gap: 6 },
  editReviewActions: { flexDirection: "row", gap: 7 },
  editAction: {
    flex: 1,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  reminderCard: {
    gap: 13,
    borderWidth: 1,
    borderColor: "#8885",
  },
  reminderAmount: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  reminderAmountCopy: { flex: 1, gap: 3 },
  reminderSchedule: {
    gap: 11,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  customerChoice: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  customerPicker: {
    gap: 9,
    borderRadius: 13,
    padding: 11,
  },
  customerPickerHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  customerStatus: {
    minHeight: 48,
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#8885",
    borderRadius: 10,
    padding: 10,
  },
  customerResults: { gap: 7 },
  customerAvatar: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  customerResultCopy: { flex: 1, gap: 3 },
  customerMoreButton: {
    minHeight: 39,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
  },
  smsCustomerNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  selectedCustomer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  walkInNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  newCustomerForm: {
    gap: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 13,
  },
  paymentEntry: {
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
  },
  removePaymentIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#D9484814",
  },
  paymentModeChoices: {
    flexDirection: "row",
    gap: 9,
  },
  paymentMode: {
    flex: 1,
    minHeight: 78,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  paymentModeCopy: { flex: 1, minWidth: 0, gap: 2 },
  paymentMethodsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  paymentMethod: {
    minWidth: "30%",
    minHeight: 55,
    flexGrow: 1,
    flexBasis: "30%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 9,
  },
  smsPaymentButton: {
    minHeight: 65,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  smsPaymentIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  smsPaymentCopy: { flex: 1, minWidth: 0, gap: 2 },
  smsSelectedBadge: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  smsSelectedCopy: { flex: 1, minWidth: 0, gap: 4 },
  smsReference: { gap: 2, marginTop: 2 },
  smsReferenceValue: { flexWrap: "wrap" },
  fillPaymentButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 7,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
  },
  paymentSummary: {
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#8885",
    paddingTop: 13,
  },
  paymentOutcome: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 10,
    padding: 11,
  },
  reviewOutcome: {
    gap: 5,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  paymentReviewRow: {
    gap: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  paymentReviewHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  noPaymentsNote: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 9,
    paddingHorizontal: 10,
  },
  paidNowSummary: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 9,
    paddingHorizontal: 11,
  },
  reviewNote: {
    gap: 5,
    borderRadius: 10,
    padding: 12,
  },
  reviewReminder: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#8885",
    borderRadius: 11,
    padding: 11,
  },
  reviewReminderIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  reviewReminderCopy: { flex: 1, gap: 3 },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryValue: { flex: 1, textAlign: "right" },
  reviewTotalCard: {
    minHeight: 150,
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 3,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
  },
  reviewTotalTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 2,
  },
  reviewTotalIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  reviewCard: { gap: 12 },
  reviewItem: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  reviewItemCopy: { flex: 1, gap: 2 },
  reviewStockSummary: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 9,
    paddingHorizontal: 10,
  },
});
