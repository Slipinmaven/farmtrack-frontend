import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppDialog } from "@/components/ui/app-dialog";
import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TimePickerField } from "@/components/ui/time-picker-field";
import { TextField } from "@/components/ui/text-field";
import type { Product, ProductUnit } from "@/features/management/api";
import { useCreateContact } from "@/features/management/hooks";
import {
  useChickenPurchaseOptions,
  useCreateChickenPurchase,
  useCreateChickenPurchaseReceipt,
} from "@/features/chickens/hooks";
import type {
  ChickenAgeUnit,
  ChickenPaymentMethod,
  ChickenPurchaseReceiptInput,
  ChickenPurchaseReceiptResult,
  ChickenPurchaseResult,
  ChickenType,
} from "@/features/chickens/api";
import {
  calculateChickenPurchasePricing,
  centsToDecimal,
  formatCents,
  formatMoneyValue,
  parseMoneyToCents,
  requiresPurchaseDiscountConfirmation,
  type PurchaseDiscountType,
} from "@/features/chickens/purchase-pricing";
import { useCreateReminder } from "@/features/reminders/hooks";
import { registerForReminderPush } from "@/features/reminders/push-notifications";
import type { Reminder } from "@/features/reminders/api";
import { FarmSelector } from "@/features/farms/components/farm-selector";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

const steps = [
  "Purchase details",
  "Batch & housing",
  "Payment",
  "Review & confirm",
];

const chickenTypes: { label: string; value: ChickenType }[] = [
  { label: "Layers", value: "layers" },
  { label: "Broilers", value: "broiler" },
  { label: "Kienyeji", value: "kienyeji" },
  { label: "Breeders", value: "breeder" },
  { label: "Other", value: "other" },
];

const paymentMethods: { label: string; value: ChickenPaymentMethod }[] = [
  { label: "Cash", value: "cash" },
  { label: "M-Pesa", value: "mpesa" },
  { label: "Bank transfer", value: "bank_transfer" },
  { label: "Card", value: "card" },
  { label: "Other", value: "other" },
];

const ageUnits: { label: string; value: ChickenAgeUnit }[] = [
  { label: "Days", value: "days" },
  { label: "Weeks", value: "weeks" },
  { label: "Months", value: "months" },
  { label: "Years", value: "years" },
];

type PurchaseItemDraft = {
  id: string;
  productId: string;
  chickenType: ChickenType;
  quantity: string;
  unitId: string;
  unitPrice: string;
  notes: string;
};

type ArrivalBatchDraft = {
  transactionItemId: string;
  quantityReceived: string;
  batchMode: "create" | "existing";
  existingBatchId: string;
  customBatchName: boolean;
  newBatchName: string;
  age: string;
  ageUnit: ChickenAgeUnit;
  blockAllocations: { blockId: string; quantity: string }[];
  notes: string;
};

type InlineFieldIssue = {
  key: string;
  message: string;
  request: number;
};

type AdditionalPaymentDraft = {
  id: string;
  amount: string;
  method: ChickenPaymentMethod;
  reference: string;
};

function createItemDraft(): PurchaseItemDraft {
  return {
    id: `${Date.now()}-${Math.random()}`,
    productId: "",
    chickenType: "layers",
    quantity: "",
    unitId: "",
    unitPrice: "",
    notes: "",
  };
}

function farmLocalDate(timezone: string | null | undefined): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", options).formatToParts(new Date());
  } catch {
    parts = new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone: "UTC",
    }).formatToParts(new Date());
  }
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDaysToDate(value: string, days: number): string {
  const date = parseDate(value) ?? new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function farmLocalTime(
  timezone: string | null | undefined,
  date = new Date(),
): string {
  const format = (timeZone: string, value: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(value);
  try {
    return format(timezone || "UTC", date);
  } catch {
    return format("UTC", date);
  }
}

function nextFarmLocalTime(timezone: string | null | undefined): string {
  const nextMinute = new Date();
  nextMinute.setSeconds(0, 0);
  nextMinute.setMinutes(nextMinute.getMinutes() + 1);
  return farmLocalTime(timezone, nextMinute);
}

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatMoney(amount: number | string, currency: string): string {
  return formatMoneyValue(amount, currency);
}

function formatDateForDisplay(value: string): string {
  const date = parseDate(value);
  return date
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
    : value;
}

function formatChickenCount(quantity: number | string): string {
  const numericQuantity = Number(quantity);
  return Number.isFinite(numericQuantity)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(
        numericQuantity,
      )
    : String(quantity);
}

export default function ChickenPurchaseScreen() {
  return (
    <SessionGate>
      <ChickenPurchaseContent />
    </SessionGate>
  );
}

function ChickenPurchaseContent() {
  const auth = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const farmId = farm.selectedFarm?.id;
  const farmToday = farmLocalDate(farm.selectedFarm?.settings?.timezone);
  const options = useChickenPurchaseOptions(auth.user?.id, farmId);
  const createPurchase = useCreateChickenPurchase(
    auth.user?.id ?? "",
    farmId ?? "",
  );
  const createReceipt = useCreateChickenPurchaseReceipt(
    auth.user?.id ?? "",
    farmId ?? "",
  );
  const createContact = useCreateContact(auth.user?.id ?? "", farmId ?? "");
  const createReminder = useCreateReminder(auth.user?.id ?? "", farmId ?? "");

  const [step, setStep] = useState(0);
  const [purchaseDate, setPurchaseDate] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [newSupplierEmail, setNewSupplierEmail] = useState("");
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [itemDrafts, setItemDrafts] = useState<PurchaseItemDraft[]>([
    createItemDraft(),
  ]);
  const [recordPayment, setRecordPayment] = useState(false);
  const [fullyPaid, setFullyPaid] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<ChickenPaymentMethod>("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [additionalPayments, setAdditionalPayments] = useState<
    AdditionalPaymentDraft[]
  >([]);
  const [remindForSettlement, setRemindForSettlement] = useState(false);
  const [reminderDueDate, setReminderDueDate] = useState(() =>
    addDaysToDate(farmToday, 1),
  );
  const [reminderDueTime, setReminderDueTime] = useState("09:00");
  const [savedBalanceReminder, setSavedBalanceReminder] =
    useState<Reminder | null>(null);
  const [discountType, setDiscountType] = useState<PurchaseDiscountType | null>(
    null,
  );
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [discountConfirmed, setDiscountConfirmed] = useState(false);
  const [overpaymentConfirmed, setOverpaymentConfirmed] = useState(false);
  const [focusDiscountAfterReview, setFocusDiscountAfterReview] =
    useState(false);
  const [focusPaymentAfterReview, setFocusPaymentAfterReview] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arrivalFieldError, setArrivalFieldError] =
    useState<InlineFieldIssue | null>(null);
  const fieldRefs = useRef(new Map<string, TextInput>());
  const fieldFocusRequest = useRef(0);
  const [result, setResult] = useState<ChickenPurchaseResult | null>(null);
  const [arrivalOpen, setArrivalOpen] = useState(false);
  const [arrivalDate, setArrivalDate] = useState(farmToday);
  const [arrivalNotes, setArrivalNotes] = useState("");
  const [arrivalDrafts, setArrivalDrafts] = useState<ArrivalBatchDraft[]>([]);
  const [arrivalError, setArrivalError] = useState<string | null>(null);
  const selectedPurchaseDate = purchaseDate ?? farmToday;
  const defaultChickenProduct = options.data?.products[0];
  const items = itemDrafts.map((item) => {
    if (item.productId || !defaultChickenProduct) return item;
    const defaultUnit =
      defaultChickenProduct.product_units.find((unit) => unit.is_base_unit) ??
      defaultChickenProduct.product_units[0];
    return {
      ...item,
      productId: defaultChickenProduct.id,
      unitId: defaultUnit?.unit_id ?? "",
    };
  });

  function bindFieldRef(key: string, input: TextInput | null) {
    if (input) fieldRefs.current.set(key, input);
    else fieldRefs.current.delete(key);
  }

  function reportFieldError(
    message: string,
    key: string,
    setMessage: (message: string | null) => void = setError,
  ): false {
    setMessage(message);
    const request = ++fieldFocusRequest.current;
    setArrivalFieldError({ key, message, request });
    requestAnimationFrame(() => fieldRefs.current.get(key)?.focus());
    return false;
  }

  function clearFieldError(key: string) {
    setArrivalFieldError((current) => (current?.key === key ? null : current));
    setError(null);
    setArrivalError(null);
  }

  function remainingArrivalCapacity(
    blockId: string,
    transactionItemId: string,
    allocationIndex: number,
  ): number {
    const block = options.data?.blocks.find(
      (candidate) => candidate.id === blockId,
    );
    if (!block) return 0;
    const assignedElsewhere = arrivalDrafts.reduce(
      (total, draft) =>
        total +
        draft.blockAllocations.reduce(
          (draftTotal, allocation, index) =>
            allocation.blockId === blockId &&
            !(
              draft.transactionItemId === transactionItemId &&
              index === allocationIndex
            )
              ? draftTotal + (Number(allocation.quantity) || 0)
              : draftTotal,
          0,
        ),
      0,
    );
    return Math.max(0, block.available_capacity - assignedElsewhere);
  }

  const purchasePricing = calculateChickenPurchasePricing(
    items.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      conversionFactor:
        options.data?.products
          .find((product) => product.id === item.productId)
          ?.product_units.find((unit) => unit.unit_id === item.unitId)
          ?.conversion_factor ?? 1,
    })),
    discountType,
    discountValue,
  );
  const purchaseTotalCents = purchasePricing.totalCents;
  const discountError =
    arrivalFieldError?.key === "discount:value"
      ? arrivalFieldError.message
      : discountValue.trim() && purchasePricing.error
        ? purchasePricing.error
        : undefined;
  const enteredPaymentCents = fullyPaid
    ? purchaseTotalCents
    : (parseMoneyToCents(paymentAmount) ?? 0n);
  const additionalPaymentCents = additionalPayments.reduce(
    (total, payment) => total + (parseMoneyToCents(payment.amount) ?? 0n),
    0n,
  );
  const paidNowCents = recordPayment
    ? enteredPaymentCents + additionalPaymentCents
    : 0n;
  const balanceDueCents =
    purchaseTotalCents > paidNowCents ? purchaseTotalCents - paidNowCents : 0n;
  const creditBalanceCents =
    paidNowCents > purchaseTotalCents ? paidNowCents - purchaseTotalCents : 0n;

  useEffect(() => {
    if (step !== 1 || !focusDiscountAfterReview) return;
    const frame = requestAnimationFrame(() => {
      fieldRefs.current.get("discount:value")?.focus();
      setFocusDiscountAfterReview(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusDiscountAfterReview, step]);

  useEffect(() => {
    if (step !== 2 || !focusPaymentAfterReview) return;
    const frame = requestAnimationFrame(() => {
      fieldRefs.current.get("payment:amount")?.focus();
      setFocusPaymentAfterReview(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusPaymentAfterReview, step]);

  function updateItem(id: string, changes: Partial<PurchaseItemDraft>) {
    if (
      changes.quantity !== undefined ||
      changes.unitPrice !== undefined ||
      changes.productId !== undefined ||
      changes.unitId !== undefined
    ) {
      setDiscountConfirmed(false);
      setOverpaymentConfirmed(false);
    }
    setItemDrafts((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...changes };
        return updated;
      }),
    );
  }

  function selectProduct(item: PurchaseItemDraft, product: Product) {
    const defaultUnit =
      product.product_units.find((unit) => unit.is_base_unit) ??
      product.product_units[0];
    updateItem(item.id, {
      productId: product.id,
      unitId: defaultUnit?.unit_id ?? "",
    });
  }

  function validateStep(): boolean {
    setError(null);
    setArrivalFieldError(null);
    if (step === 0) {
      const selectedDate = parseDate(selectedPurchaseDate);
      if (!selectedDate) {
        setError("Choose a valid purchase date.");
        return false;
      }
      const today = parseDate(farmToday) ?? new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate.getTime() > today.getTime()) {
        setError("Purchase date cannot be in the future.");
        return false;
      }
    }
    if (step === 1) {
      if (items.length === 0) {
        setError("Add at least one chicken purchase item.");
        return false;
      }
      for (const [index, item] of items.entries()) {
        const product = options.data?.products.find(
          (candidate) => candidate.id === item.productId,
        );
        if (!product) {
          return reportFieldError(
            `Choose a chicken product for item ${index + 1}.`,
            `batch:${item.id}:product`,
          );
        }
        if (!item.chickenType) {
          return reportFieldError(
            `Choose a chicken type for item ${index + 1}.`,
            `batch:${item.id}:type`,
          );
        }
        if (
          !product.product_units.some((unit) => unit.unit_id === item.unitId)
        ) {
          return reportFieldError(
            `Choose a valid unit for item ${index + 1}.`,
            `batch:${item.id}:unit`,
          );
        }
        const quantity = Number(item.quantity);
        if (!Number.isSafeInteger(quantity) || quantity < 1) {
          return reportFieldError(
            `Enter a whole-number quantity above zero for item ${index + 1}.`,
            `batch:${item.id}:quantity`,
          );
        }
        if (parseMoneyToCents(item.unitPrice) === null) {
          return reportFieldError(
            `Enter a unit price with up to two decimal places for item ${index + 1}. Use 0 if the chickens are free.`,
            `batch:${item.id}:unit-price`,
          );
        }
      }
      if (discountType && purchasePricing.error) {
        return reportFieldError(purchasePricing.error, "discount:value");
      }
    }
    if (step === 2 && recordPayment) {
      const amounts = [
        {
          key: "payment:amount",
          value: fullyPaid ? centsToDecimal(purchaseTotalCents) : paymentAmount,
        },
        ...additionalPayments.map((payment) => ({
          key: `payment:${payment.id}:amount`,
          value: payment.amount,
        })),
      ];
      for (const payment of amounts) {
        const amountCents = parseMoneyToCents(payment.value);
        if (amountCents === null || amountCents <= 0n) {
          return reportFieldError(
            "Enter a positive payment amount with up to two decimal places, or remove this payment.",
            payment.key,
          );
        }
      }
    }
    if (
      step === 3 &&
      remindForSettlement &&
      (balanceDueCents > 0n || creditBalanceCents > 0n)
    ) {
      if (
        !parseDate(reminderDueDate) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderDueTime)
      ) {
        setError("Choose a valid settlement reminder date and time.");
        return false;
      }
      if (
        `${reminderDueDate}T${reminderDueTime}` <=
        `${farmToday}T${farmLocalTime(farm.selectedFarm?.settings?.timezone)}`
      ) {
        setError("Choose a settlement reminder time in the future for this farm.");
        return false;
      }
    }
    return true;
  }

  function goNext() {
    if (!validateStep()) return;
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function submitNewSupplier() {
    if (!farmId) return;
    const name = newSupplierName.trim();
    if (!name) {
      setSupplierError("Enter a supplier name.");
      return;
    }
    setSupplierError(null);
    try {
      const supplier = await createContact.mutateAsync({
        name,
        roles: ["supplier"],
        phone: newSupplierPhone.trim() || undefined,
        email: newSupplierEmail.trim() || undefined,
      });
      await options.refetch();
      setSupplierId(supplier.id);
      setSupplierFormOpen(false);
      setNewSupplierName("");
      setNewSupplierPhone("");
      setNewSupplierEmail("");
    } catch (supplierSaveError: unknown) {
      setSupplierError(normalizeApiError(supplierSaveError).message);
    }
  }

  async function saveSettlementReminder(transaction: ChickenPurchaseResult) {
    if (!farmId) return;
    setReminderError(null);
    if (
      !parseDate(reminderDueDate) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderDueTime)
    ) {
      setReminderError("Choose a valid reminder date and time.");
      return;
    }
    if (
      `${reminderDueDate}T${reminderDueTime}` <=
      `${farmToday}T${farmLocalTime(farm.selectedFarm?.settings?.timezone)}`
    ) {
      setReminderError("Choose a reminder time in the future for this farm.");
      return;
    }

    let expoPushToken: string | undefined;
    let deliveryChannel: Reminder["delivery_channel"] = "push";
    try {
      expoPushToken = await registerForReminderPush();
    } catch {
      deliveryChannel = "in_app";
    }

    try {
      const reference = transaction.reference_number ?? "this purchase";
      const balanceDue = parseMoneyToCents(String(transaction.balance_due)) ?? 0n;
      const creditBalance = parseMoneyToCents(String(transaction.credit_balance)) ?? 0n;
      const isSupplierCredit = creditBalance > 0n;
      const amount = isSupplierCredit ? creditBalance : balanceDue;
      const reminder = await createReminder.mutateAsync({
        title: isSupplierCredit
          ? "Settle chicken supplier credit"
          : "Pay chicken purchase balance",
        description: isSupplierCredit
          ? `Follow up with the supplier to settle the ${formatCents(amount, theme.currency)} credit from ${reference}.`
          : `Pay the remaining ${formatCents(amount, theme.currency)} owed to the supplier for ${reference}.`,
        due_at: `${reminderDueDate}T${reminderDueTime}:00`,
        delivery_channel: deliveryChannel,
        ...(expoPushToken ? { expo_push_token: expoPushToken } : {}),
        related_entity_type: "transaction",
        related_entity_id: transaction.id,
      });
      setSavedBalanceReminder(reminder);
      setRemindForSettlement(false);
    } catch (saveError: unknown) {
      setReminderError(normalizeApiError(saveError).message);
    }
  }

  async function submitPurchase() {
    if (!farmId || !validateStep()) return;
    setError(null);
    let negotiatedDiscountConfirmed = discountConfirmed;
    if (
      requiresPurchaseDiscountConfirmation(
        purchasePricing.subtotalCents,
        purchasePricing.discountCents,
      ) &&
      !negotiatedDiscountConfirmed
    ) {
      const confirmed = await dialog.confirmDialog({
        title: "Confirm negotiated discount",
        message: `The discount is ${formatCents(purchasePricing.discountCents, theme.currency)} on a subtotal of ${formatCents(purchasePricing.subtotalCents, theme.currency)}, leaving a final purchase cost of ${formatCents(purchaseTotalCents, theme.currency)}. Discounts over 80% can be legitimate; confirm this negotiated price or review it before recording.`,
        tone: "info",
        cancelLabel: "Review discount",
        confirmLabel: "Confirm discount",
      });
      if (!confirmed) {
        setStep(1);
        setFocusDiscountAfterReview(true);
        return;
      }
      negotiatedDiscountConfirmed = true;
      setDiscountConfirmed(true);
    }
    let paymentConfirmed = overpaymentConfirmed;
    if (
      recordPayment &&
      paidNowCents > purchaseTotalCents &&
      !paymentConfirmed
    ) {
      const amountMultiple =
        purchaseTotalCents > 0n && paidNowCents % purchaseTotalCents === 0n
          ? paidNowCents / purchaseTotalCents
          : 0n;
      const likelyExtraZero = [10n, 100n, 1000n].includes(amountMultiple)
        ? ` The amount is exactly ${amountMultiple} times the purchase cost. Did you mean ${formatCents(purchaseTotalCents, theme.currency)}?`
        : "";
      const confirmed = await dialog.confirmDialog({
        title: "Payment exceeds purchase cost",
        message: `The purchase cost is ${formatCents(purchaseTotalCents, theme.currency)}, but the amount entered is ${formatCents(paidNowCents, theme.currency)}. The difference will be recorded as a credit balance, not as a confirmed refund.${likelyExtraZero}`,
        tone: "info",
        cancelLabel: "Review amount",
        confirmLabel: "Confirm amount",
      });
      if (!confirmed) {
        setStep(2);
        setFocusPaymentAfterReview(true);
        return;
      }
      paymentConfirmed = true;
      setOverpaymentConfirmed(true);
    }
    try {
      const created = await createPurchase.mutateAsync({
        transaction_date: selectedPurchaseDate,
        supplier_id: supplierId || undefined,
        notes: purchaseNotes.trim() || undefined,
        discount_type: discountType ?? undefined,
        discount_value: discountType ? discountValue.trim() : "0.00",
        discount_reason:
          discountType && discountReason.trim()
            ? discountReason.trim()
            : undefined,
        overpayment_confirmed: paymentConfirmed,
        items: items.map((item) => ({
          product_id: item.productId,
          chicken_type: item.chickenType as ChickenType,
          quantity: Number(item.quantity),
          unit_id: item.unitId,
          unit_price: item.unitPrice.trim(),
          notes: item.notes.trim() || undefined,
        })),
        payments: recordPayment
          ? [
              {
                amount: centsToDecimal(enteredPaymentCents),
                payment_date: selectedPurchaseDate,
                payment_method: paymentMethod,
                reference_number: paymentReference.trim() || undefined,
              },
              ...additionalPayments.map((payment) => ({
                amount: centsToDecimal(parseMoneyToCents(payment.amount) ?? 0n),
                payment_date: selectedPurchaseDate,
                payment_method: payment.method,
                reference_number: payment.reference.trim() || undefined,
              })),
            ]
          : [],
      });
      setResult(created);
      if (
        remindForSettlement &&
        ((parseMoneyToCents(String(created.balance_due)) ?? 0n) > 0n ||
          (parseMoneyToCents(String(created.credit_balance)) ?? 0n) > 0n)
      ) {
        await saveSettlementReminder(created);
      }
    } catch (saveError: unknown) {
      setError(normalizeApiError(saveError).message);
    }
  }

  async function openContactLink(url: string, target: string) {
    try {
      if (!(await Linking.canOpenURL(url))) throw new Error("Unsupported URL");
      await Linking.openURL(url);
    } catch {
      await dialog.showDialog({
        title: `Unable to open ${target}`,
        message: `No compatible app could open this ${target}.`,
        tone: "error",
      });
    }
  }

  function updateArrivalBatch(
    transactionItemId: string,
    changes: Partial<ArrivalBatchDraft>,
  ) {
    setArrivalDrafts((current) =>
      current.map((draft) => {
        if (draft.transactionItemId !== transactionItemId) return draft;
        const updated = { ...draft, ...changes };
        if (
          changes.quantityReceived !== undefined &&
          draft.blockAllocations.length > 0
        ) {
          const receivedQuantity = Number(changes.quantityReceived) || 0;
          const fixedAllocations = draft.blockAllocations
            .slice(0, -1)
            .reduce(
              (total, allocation) => total + (Number(allocation.quantity) || 0),
              0,
            );
          updated.blockAllocations = draft.blockAllocations.map(
            (allocation, index) =>
              index === draft.blockAllocations.length - 1
                ? {
                    ...allocation,
                    quantity: String(
                      Math.max(0, receivedQuantity - fixedAllocations),
                    ),
                  }
                : allocation,
          );
        }
        return updated;
      }),
    );
  }

  function updateArrivalAllocation(
    transactionItemId: string,
    index: number,
    changes: Partial<ArrivalBatchDraft["blockAllocations"][number]>,
  ) {
    const availableForRow = changes.blockId
      ? remainingArrivalCapacity(changes.blockId, transactionItemId, index)
      : 0;
    setArrivalDrafts((current) =>
      current.map((draft) =>
        draft.transactionItemId === transactionItemId
          ? {
              ...draft,
              blockAllocations: draft.blockAllocations.map(
                (allocation, allocationIndex) =>
                  allocationIndex === index
                    ? {
                        ...allocation,
                        ...changes,
                        quantity: changes.blockId
                          ? String(
                              Math.min(
                                Number(allocation.quantity) ||
                                  Number(draft.quantityReceived) ||
                                  0,
                                availableForRow,
                              ),
                            )
                          : (changes.quantity ?? allocation.quantity),
                      }
                    : allocation,
              ),
            }
          : draft,
      ),
    );
  }

  function addArrivalAllocation(transactionItemId: string) {
    setArrivalDrafts((current) =>
      current.map((draft) =>
        draft.transactionItemId === transactionItemId
          ? {
              ...draft,
              blockAllocations: [
                ...draft.blockAllocations,
                { blockId: "", quantity: "" },
              ],
            }
          : draft,
      ),
    );
  }

  function removeArrivalAllocation(transactionItemId: string, index: number) {
    setArrivalDrafts((current) =>
      current.map((draft) =>
        draft.transactionItemId === transactionItemId
          ? {
              ...draft,
              blockAllocations: draft.blockAllocations.filter(
                (_allocation, allocationIndex) => allocationIndex !== index,
              ),
            }
          : draft,
      ),
    );
  }

  function applyReceiptToPurchase(
    purchase: ChickenPurchaseResult,
    receipt: ChickenPurchaseReceiptResult,
  ): ChickenPurchaseResult {
    const receiptsByItem = new Map(
      receipt.items.map((item) => [item.transaction_item_id, item]),
    );
    return {
      ...purchase,
      items: purchase.items.map((item) => {
        const received = receiptsByItem.get(item.id);
        if (!received) return item;
        return {
          ...item,
          batch_id: received.batch_id,
          hatch_date: received.hatch_date,
          quantity_received:
            item.quantity_received + Number(received.quantity_received),
          quantity_remaining: Number(received.remaining_quantity),
        };
      }),
    };
  }

  function validateArrival(): boolean {
    if (!result) return false;
    setArrivalError(null);
    setArrivalFieldError(null);
    if (!parseDate(arrivalDate)) {
      setArrivalError("Choose a valid arrival date.");
      return false;
    }
    const arriving = arrivalDrafts.filter(
      (draft) => draft.quantityReceived.trim() !== "",
    );
    if (arriving.length === 0) {
      const draft = arrivalDrafts[0];
      return draft
        ? reportFieldError(
            "Enter an arrival quantity for at least one batch.",
            `arrival:${draft.transactionItemId}:quantity`,
            setArrivalError,
          )
        : false;
    }

    const allocatedByBlock = new Map<string, number>();
    for (const draft of arriving) {
      const purchaseItem = result.items.find(
        (item) => item.id === draft.transactionItemId,
      );
      if (!purchaseItem) {
        setArrivalError(
          "A purchase batch could not be found. Reopen this form.",
        );
        return false;
      }
      const quantity = Number(draft.quantityReceived);
      if (
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > purchaseItem.quantity_remaining
      ) {
        return reportFieldError(
          `Enter a whole-number quantity up to ${purchaseItem.quantity_remaining} for this batch.`,
          `arrival:${draft.transactionItemId}:quantity`,
          setArrivalError,
        );
      }
      if (!purchaseItem.batch_id) {
        if (draft.batchMode === "existing" && !draft.existingBatchId) {
          return reportFieldError(
            "Choose the existing chicken batch for this arrival.",
            `arrival:${draft.transactionItemId}:existing-batch`,
            setArrivalError,
          );
        }
        if (draft.batchMode === "create") {
          const age = Number(draft.age);
          if (
            draft.age.trim() === "" ||
            !Number.isSafeInteger(age) ||
            age < 0
          ) {
            return reportFieldError(
              "Enter the batch age in whole days, weeks, months, or years.",
              `arrival:${draft.transactionItemId}:age`,
              setArrivalError,
            );
          }
        }
      }
      if (draft.blockAllocations.length === 0) {
        setArrivalError(
          "Assign the arriving chickens to at least one housing block.",
        );
        return false;
      }
      const selectedBlockIds = new Set<string>();
      let allocatedQuantity = 0;
      for (const [
        allocationIndex,
        allocation,
      ] of draft.blockAllocations.entries()) {
        const allocationQuantity = Number(allocation.quantity);
        if (
          !Number.isSafeInteger(allocationQuantity) ||
          allocationQuantity < 1
        ) {
          return reportFieldError(
            "Enter a whole-number allocation above zero for each block.",
            `arrival:${draft.transactionItemId}:allocation:${allocationIndex}:quantity`,
            setArrivalError,
          );
        }
        if (!allocation.blockId || selectedBlockIds.has(allocation.blockId)) {
          return reportFieldError(
            "Choose a different housing block for each allocation.",
            `arrival:${draft.transactionItemId}:allocation:${allocationIndex}:block`,
            setArrivalError,
          );
        }
        const block = options.data?.blocks.find(
          (candidate) => candidate.id === allocation.blockId,
        );
        if (!block) {
          return reportFieldError(
            "Choose an active housing block for each allocation.",
            `arrival:${draft.transactionItemId}:allocation:${allocationIndex}:block`,
            setArrivalError,
          );
        }
        selectedBlockIds.add(block.id);
        allocatedQuantity += allocationQuantity;
        allocatedByBlock.set(
          block.id,
          (allocatedByBlock.get(block.id) ?? 0) + allocationQuantity,
        );
      }
      if (allocatedQuantity !== quantity) {
        const allocationIndex = Math.max(draft.blockAllocations.length - 1, 0);
        return reportFieldError(
          `Block allocations must add up to the ${quantity} chickens arriving in this batch.`,
          `arrival:${draft.transactionItemId}:allocation:${allocationIndex}:quantity`,
          setArrivalError,
        );
      }
    }

    for (const [blockId, quantity] of allocatedByBlock) {
      const block = options.data?.blocks.find(
        (candidate) => candidate.id === blockId,
      );
      if (block && quantity > block.available_capacity) {
        const overAllocatedDraft = arrivalDrafts
          .map((draft) => {
            let assignedBefore = 0;
            const allocationIndex = draft.blockAllocations.findIndex(
              (allocation) => {
                if (allocation.blockId !== blockId) return false;
                assignedBefore += Number(allocation.quantity) || 0;
                return assignedBefore > block.available_capacity;
              },
            );
            return allocationIndex < 0 ? null : { draft, allocationIndex };
          })
          .find(Boolean);
        if (overAllocatedDraft) {
          return reportFieldError(
            `${block.name} has room for ${block.available_capacity} more chickens, but ${quantity} are assigned.`,
            `arrival:${overAllocatedDraft.draft.transactionItemId}:allocation:${overAllocatedDraft.allocationIndex}:quantity`,
            setArrivalError,
          );
        }
        setArrivalError(
          `${block.name} has room for ${block.available_capacity} more chickens, but ${quantity} are assigned.`,
        );
        return false;
      }
    }
    return true;
  }

  function buildReceiptInput(
    purchase: ChickenPurchaseResult,
    drafts: ArrivalBatchDraft[],
    receivedDate: string,
    notes: string,
  ): ChickenPurchaseReceiptInput {
    return {
      transaction_id: purchase.id,
      received_date: receivedDate,
      notes: notes.trim() || undefined,
      items: drafts
        .filter((draft) => draft.quantityReceived.trim() !== "")
        .map((draft) => {
          const purchaseItem = purchase.items.find(
            (item) => item.id === draft.transactionItemId,
          )!;
          const chickenType = purchaseItem.chicken_type ?? "layers";
          return {
            transaction_item_id: purchaseItem.id,
            quantity_received: Number(draft.quantityReceived),
            batch_assignment:
              draft.batchMode === "existing"
                ? {
                    action: "USE_EXISTING" as const,
                    batch_id: draft.existingBatchId || purchaseItem.batch_id!,
                  }
                : {
                    action: "CREATE" as const,
                    new_batch: {
                      name: draft.customBatchName
                        ? draft.newBatchName.trim() || undefined
                        : undefined,
                      chicken_type: chickenType,
                      age: Number(draft.age),
                      age_unit: draft.ageUnit,
                      notes: draft.notes.trim() || undefined,
                    },
                  },
            block_allocations: draft.blockAllocations.map((allocation) => ({
              block_id: allocation.blockId,
              quantity: Number(allocation.quantity),
            })),
          };
        }),
    };
  }

  async function submitArrival() {
    if (!farmId || !result || !validateArrival()) return;
    setArrivalError(null);
    try {
      const receipt = await createReceipt.mutateAsync(
        buildReceiptInput(result, arrivalDrafts, arrivalDate, arrivalNotes),
      );
      setArrivalOpen(false);
      setResult((current) =>
        current ? applyReceiptToPurchase(current, receipt) : current,
      );
    } catch (receiptError: unknown) {
      setArrivalError(normalizeApiError(receiptError).message);
    }
  }

  if (!farmId) {
    return (
      <ScreenShell>
        <FarmPageHeader
          title="Record chicken purchase"
          showBack
          fallbackHref="/(tabs)/flock"
        />
        <Card style={styles.stateCard}>
          <AppText weight="semibold">
            {farm.status === "inactive"
              ? "Choose an active farm"
              : "No farm is selected"}
          </AppText>
          <AppText size="small" tone="secondary">
            {farm.status === "inactive"
              ? "Enable or select an active farm to continue with this purchase."
              : "Return to Chickens or select a farm to continue."}
          </AppText>
        </Card>
        {farm.status === "inactive" ? <FarmSelector /> : null}
        <Button
          label="Back to chickens"
          variant="secondary"
          onPress={() => router.replace("/(tabs)/flock")}
        />
      </ScreenShell>
    );
  }

  if (options.isLoading) {
    return (
      <ScreenShell>
        <FarmPageHeader
          title="Record chicken purchase"
          showBack
          fallbackHref="/(tabs)/flock"
        />
        <LoadingState label="Loading purchase options" />
      </ScreenShell>
    );
  }

  if (options.isError || !options.data) {
    return (
      <ScreenShell>
        <FarmPageHeader
          title="Record chicken purchase"
          showBack
          fallbackHref="/(tabs)/flock"
        />
        <Card style={styles.stateCard}>
          <AppText weight="semibold">Purchase options unavailable</AppText>
          <AppText size="small" tone="secondary">
            {options.isError
              ? normalizeApiError(options.error).message
              : "Try loading products, suppliers, and housing again."}
          </AppText>
          <Button
            label="Retry"
            variant="secondary"
            onPress={() => void options.refetch()}
          />
        </Card>
      </ScreenShell>
    );
  }

  if (result) {
    const resultSubtotalCents = result.items.reduce((total, item) => {
      const itemSubtotalCents = parseMoneyToCents(String(item.subtotal_amount));
      if (itemSubtotalCents !== null) return total + itemSubtotalCents;

      const quantity = Number(item.quantity);
      const unitPriceCents = parseMoneyToCents(String(item.unit_price));
      return Number.isSafeInteger(quantity) && unitPriceCents !== null
        ? total + BigInt(quantity) * unitPriceCents
        : total;
    }, 0n);
    const resultCreditBalanceCents =
      parseMoneyToCents(String(result.credit_balance)) ?? 0n;
    const resultBalanceDueCents =
      parseMoneyToCents(String(result.balance_due)) ?? 0n;
    return (
      <ScreenShell>
        <FarmPageHeader
          title="Purchase recorded"
          showBack
          fallbackHref="/(tabs)/flock"
        />
        <View style={styles.successContent}>
          <View style={[styles.resultMark, { backgroundColor: theme.success }]}>
            <Ionicons name="checkmark" size={24} color="#FFFFFF" />
          </View>
          <AppText size="heading" weight="semibold">
            Chicken purchase recorded
          </AppText>
          <AppText size="small" tone="secondary">
            The purchase records what you bought. Record each delivery
            separately so partial arrivals update flock stock accurately.
          </AppText>
          <SummaryRow
            label="Transaction reference"
            value={result.reference_number ?? "Not available"}
            emphasized
          />
          <SummaryRow
            label="Purchase date"
            value={formatDateForDisplay(result.transaction_date)}
          />
          <SummaryRow
            label="Supplier"
            value={
              options.data.suppliers.find(
                (supplier) => supplier.id === result.contact_id,
              )?.name ?? "No supplier"
            }
          />
          <View style={styles.successBatchList}>
            <AppText weight="semibold">Purchased batches</AppText>
            {result.items.map((purchasedItem, index) => {
              const product = options.data.products.find(
                (candidate) => candidate.id === purchasedItem.product_id,
              );
              const unit = product?.product_units.find(
                (candidate) => candidate.unit_id === purchasedItem.unit_id,
              );
              const chickenType = chickenTypes.find(
                (type) => type.value === purchasedItem.chicken_type,
              )?.label;
              return (
                <View key={purchasedItem.id} style={styles.successBatch}>
                  <AppText weight="semibold">
                    {chickenType ?? "Chicken"} ·{" "}
                    {formatChickenCount(purchasedItem.quantity)} purchased
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {product?.name ?? "Chicken product"} ·{" "}
                    {unit?.unit_abbreviation ?? "units"} ·{" "}
                    {formatMoney(purchasedItem.total_amount, theme.currency)}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {formatChickenCount(purchasedItem.quantity_received)}{" "}
                    received ·{" "}
                    {formatChickenCount(purchasedItem.quantity_remaining)}{" "}
                    outstanding
                  </AppText>
                  {purchasedItem.notes ? (
                    <AppText size="small" tone="secondary">
                      {purchasedItem.notes}
                    </AppText>
                  ) : null}
                </View>
              );
            })}
          </View>
          <SummaryRow
            label="Calculated subtotal"
            value={formatCents(resultSubtotalCents, theme.currency)}
          />
          <SummaryRow
            label="Discount"
            value={formatMoney(-result.discount_amount, theme.currency)}
            labelColor={theme.secondary}
            valueColor={theme.secondary}
          />
          <SummaryRow
            label="Final purchase cost"
            value={formatMoney(result.transaction_total, theme.currency)}
            emphasized
            labelColor={theme.primary}
            valueColor={theme.primary}
          />
          <SummaryRow
            label="Paid now"
            value={`${formatMoney(result.amount_paid, theme.currency)}${result.payments[0] ? ` · ${paymentMethods.find((method) => method.value === result.payments[0].payment_method)?.label ?? "Payment"}` : ""}`}
            labelColor={theme.success}
            valueColor={theme.success}
          />
          {result.payments[0]?.reference_number ? (
            <SummaryRow
              label="Payment reference"
              value={result.payments[0].reference_number}
            />
          ) : null}
          <SummaryRow
            label={
              resultCreditBalanceCents > 0n ? "Credit balance" : "Balance due"
            }
            value={formatCents(
              resultCreditBalanceCents > 0n
                ? resultCreditBalanceCents
                : resultBalanceDueCents,
              theme.currency,
            )}
            emphasized
            labelColor={
              resultBalanceDueCents === 0n || resultCreditBalanceCents > 0n
                ? theme.success
                : theme.danger
            }
            valueColor={
              resultBalanceDueCents === 0n || resultCreditBalanceCents > 0n
                ? theme.success
                : theme.danger
            }
          />
          {purchaseNotes.trim() ? (
            <SummaryRow label="Notes" value={purchaseNotes.trim()} />
          ) : null}
          {savedBalanceReminder ? (
            <Card style={styles.reminderSaved}>
              <Ionicons
                name="notifications-outline"
                size={19}
                color={theme.primary}
              />
              <View style={styles.flexCopy}>
                <AppText weight="semibold">
                  {savedBalanceReminder.delivery_channel === "push"
                    ? "Settlement reminder set"
                    : "In-app settlement reminder set"}
                </AppText>
                <AppText size="small" tone="secondary">
                  {formatDateForDisplay(
                    savedBalanceReminder.due_at.slice(0, 10),
                  )}{" "}
                  at {savedBalanceReminder.due_at.slice(11, 16)} farm time
                </AppText>
                {savedBalanceReminder.delivery_channel === "in_app" ? (
                  <AppText size="small" tone="secondary">
                    Push wasn’t available, so the reminder was saved to
                    FarmTrack and will appear in your in-app notifications.
                  </AppText>
                ) : null}
              </View>
            </Card>
          ) : null}
          {reminderError ? (
            <Card style={styles.reminderErrorCard}>
              <AppText size="small" style={{ color: theme.danger }}>
                The purchase was recorded, but the settlement reminder wasn’t
                saved: {reminderError}
              </AppText>
              <Button
                label="Retry reminder"
                variant="secondary"
                loading={createReminder.isPending}
                onPress={() => void saveSettlementReminder(result)}
              />
            </Card>
          ) : null}
          {arrivalOpen ? (
            <Card style={styles.arrivalCard}>
              <View style={styles.sectionIntro}>
                <AppText size="heading" weight="semibold">
                  Record chicken arrival
                </AppText>
                <AppText size="small" tone="secondary">
                  Enter only the chickens delivered now. Anything still expected
                  remains on this purchase for a later receipt.
                </AppText>
              </View>
              <DatePickerField
                label="Arrival date"
                value={arrivalDate}
                onChange={setArrivalDate}
                maximumDate={parseDate(farmToday) ?? new Date()}
              />
              {arrivalDrafts.map((draft) => {
                const purchaseItem = result.items.find(
                  (item) => item.id === draft.transactionItemId,
                );
                if (!purchaseItem || purchaseItem.quantity_remaining <= 0) {
                  return null;
                }
                const product = options.data.products.find(
                  (candidate) => candidate.id === purchaseItem.product_id,
                );
                const chickenType = purchaseItem.chicken_type ?? "layers";
                const existingBatch = draft.batchMode === "existing";
                return (
                  <View
                    key={draft.transactionItemId}
                    style={styles.arrivalBatch}
                  >
                    <AppText weight="semibold">
                      {chickenTypes.find((type) => type.value === chickenType)
                        ?.label ?? "Chicken"}
                      {" · "}
                      {product?.name ?? "Chicken product"}
                    </AppText>
                    <View style={styles.arrivalQuantityContext}>
                      <View style={styles.arrivalQuantityStat}>
                        <AppText size="small" tone="secondary">Still expected</AppText>
                        <AppText weight="semibold">
                          {formatChickenCount(purchaseItem.quantity_remaining)}
                        </AppText>
                      </View>
                      {purchaseItem.quantity_received > 0 ? (
                        <View style={styles.arrivalQuantityStat}>
                          <AppText size="small" tone="secondary">Received earlier</AppText>
                          <AppText weight="semibold">
                            {formatChickenCount(purchaseItem.quantity_received)}
                          </AppText>
                        </View>
                      ) : null}
                    </View>
                    <TextField
                      label="Number arriving now"
                      value={draft.quantityReceived}
                      ref={(input) =>
                        bindFieldRef(
                          `arrival:${draft.transactionItemId}:quantity`,
                          input,
                        )
                      }
                      error={
                        arrivalFieldError?.key ===
                        `arrival:${draft.transactionItemId}:quantity`
                          ? arrivalFieldError.message
                          : undefined
                      }
                      onChangeText={(value) => {
                        clearFieldError(
                          `arrival:${draft.transactionItemId}:quantity`,
                        );
                        updateArrivalBatch(draft.transactionItemId, {
                          quantityReceived: value,
                        });
                      }}
                      keyboardType="number-pad"
                      placeholder="0"
                    />
                    {!existingBatch ? (
                      <>
                        <View style={styles.inputSection}>
                          <AppText size="small" weight="semibold">
                            Batch name
                          </AppText>
                          <AppText size="small" tone="secondary">
                            Leave it automatic or choose your own name.
                          </AppText>
                          {draft.customBatchName ? (
                            <>
                              <TextField
                                label="Custom batch name"
                                value={draft.newBatchName}
                                onChangeText={(value) =>
                                  updateArrivalBatch(draft.transactionItemId, {
                                    newBatchName: value,
                                  })
                                }
                                placeholder="Enter a name (optional)"
                                maxLength={100}
                              />
                              <Button
                                label="Use automatic name"
                                variant="secondary"
                                onPress={() =>
                                  updateArrivalBatch(draft.transactionItemId, {
                                    customBatchName: false,
                                  })
                                }
                              />
                            </>
                          ) : (
                            <Button
                              label="Name it myself"
                              variant="secondary"
                              onPress={() =>
                                updateArrivalBatch(draft.transactionItemId, {
                                  customBatchName: true,
                                })
                              }
                            />
                          )}
                        </View>
                        <View style={styles.numberFields}>
                          <View style={styles.numberField}>
                            <TextField
                              label="Age on arrival"
                              value={draft.age}
                              ref={(input) =>
                                bindFieldRef(
                                  `arrival:${draft.transactionItemId}:age`,
                                  input,
                                )
                              }
                              error={
                                arrivalFieldError?.key ===
                                `arrival:${draft.transactionItemId}:age`
                                  ? arrivalFieldError.message
                                  : undefined
                              }
                              onChangeText={(value) => {
                                clearFieldError(
                                  `arrival:${draft.transactionItemId}:age`,
                                );
                                updateArrivalBatch(draft.transactionItemId, {
                                  age: value,
                                });
                              }}
                              keyboardType="number-pad"
                              placeholder="e.g. 8"
                            />
                          </View>
                          <View style={styles.numberField}>
                            <SearchableSelectField
                              label="Age unit"
                              value={draft.ageUnit}
                              placeholder="Weeks"
                              searchPlaceholder="Search age units"
                              searchable={false}
                              options={ageUnits.map((unit) => ({
                                label: unit.label,
                                value: unit.value,
                              }))}
                              onSelect={(value) =>
                                updateArrivalBatch(draft.transactionItemId, {
                                  ageUnit: value as ChickenAgeUnit,
                                })
                              }
                            />
                          </View>
                        </View>
                        <AppText size="small" tone="secondary">
                          We’ll calculate the hatch date from this age and the
                          arrival date.
                        </AppText>
                      </>
                    ) : (
                      <>
                        <SearchableSelectField
                          label="Existing chicken batch"
                          value={draft.existingBatchId}
                          placeholder="Choose existing batch"
                          searchPlaceholder="Search active batches"
                          error={
                            arrivalFieldError?.key ===
                            `arrival:${draft.transactionItemId}:existing-batch`
                              ? arrivalFieldError.message
                              : undefined
                          }
                          focusRequest={
                            arrivalFieldError?.key ===
                            `arrival:${draft.transactionItemId}:existing-batch`
                              ? arrivalFieldError.request
                              : 0
                          }
                          options={options.data.batches
                            .filter(
                              (batch) => batch.chicken_type === chickenType,
                            )
                            .map((batch) => ({
                              label: batch.name,
                              value: batch.id,
                              description: batch.hatch_date
                                ? `Hatch date ${formatDateForDisplay(batch.hatch_date)}`
                                : "Hatch date not set",
                            }))}
                          onSelect={(value) => {
                            clearFieldError(
                              `arrival:${draft.transactionItemId}:existing-batch`,
                            );
                            updateArrivalBatch(draft.transactionItemId, {
                              existingBatchId: value,
                            });
                          }}
                        />
                        <AppText size="small" tone="secondary">
                          The selected batch keeps its existing hatch date.
                        </AppText>
                      </>
                    )}
                    <View style={styles.allocationSection}>
                      <AppText size="small" weight="semibold">
                        Housing allocation
                      </AppText>
                      {draft.blockAllocations.map(
                        (allocation, allocationIndex) => {
                          const allocationKey = `arrival:${draft.transactionItemId}:allocation:${allocationIndex}`;
                          const quantityKey = `${allocationKey}:quantity`;
                          const blockKey = `${allocationKey}:block`;
                          const block = options.data.blocks.find(
                            (candidate) => candidate.id === allocation.blockId,
                          );
                          const availableCapacity = allocation.blockId
                            ? remainingArrivalCapacity(
                                allocation.blockId,
                                draft.transactionItemId,
                                allocationIndex,
                              )
                            : 0;
                          const assignedQuantity =
                            Number(allocation.quantity) || 0;
                          const capacityError =
                            allocation.blockId &&
                            assignedQuantity > availableCapacity
                              ? `${block?.name ?? "This block"} has only ${availableCapacity} spaces left.`
                              : undefined;
                          return (
                            <View
                              key={`${draft.transactionItemId}-${allocationIndex}`}
                              style={styles.allocationRow}
                            >
                              <View style={styles.allocationFields}>
                                <View style={styles.allocationQuantity}>
                                  <TextField
                                    label={`Block ${allocationIndex + 1} quantity`}
                                    value={allocation.quantity}
                                    ref={(input) =>
                                      bindFieldRef(quantityKey, input)
                                    }
                                    error={
                                      capacityError ??
                                      (arrivalFieldError?.key === quantityKey
                                        ? arrivalFieldError.message
                                        : undefined)
                                    }
                                    onChangeText={(value) => {
                                      clearFieldError(quantityKey);
                                      updateArrivalAllocation(
                                        draft.transactionItemId,
                                        allocationIndex,
                                        { quantity: value },
                                      );
                                    }}
                                    keyboardType="number-pad"
                                    placeholder="e.g. 300"
                                  />
                                </View>
                                <View style={styles.allocationBlock}>
                                  <SearchableSelectField
                                    label="Housing block"
                                    value={allocation.blockId}
                                    placeholder="Choose a block"
                                    searchPlaceholder="Search housing blocks"
                                    error={
                                      arrivalFieldError?.key === blockKey
                                        ? arrivalFieldError.message
                                        : undefined
                                    }
                                    focusRequest={
                                      arrivalFieldError?.key === blockKey
                                        ? arrivalFieldError.request
                                        : 0
                                    }
                                    options={options.data.blocks
                                      .filter(
                                        (candidate) =>
                                          !draft.blockAllocations.some(
                                            (other, otherIndex) =>
                                              otherIndex !== allocationIndex &&
                                              other.blockId === candidate.id,
                                          ),
                                      )
                                      .map((candidate) => {
                                        const free = remainingArrivalCapacity(
                                          candidate.id,
                                          draft.transactionItemId,
                                          allocationIndex,
                                        );
                                        const requestedQuantity =
                                          Number(allocation.quantity) || 0;
                                        const full =
                                          free === 0 &&
                                          candidate.id !== allocation.blockId;
                                        const insufficient =
                                          free < requestedQuantity;
                                        const unavailable =
                                          full || insufficient;
                                        return {
                                          label:
                                            free === 0
                                              ? `${candidate.name} (Full)`
                                              : insufficient
                                                ? `${candidate.name} (Only ${free.toLocaleString()} spaces left)`
                                                : candidate.name,
                                          value: candidate.id,
                                          description: `${free.toLocaleString()} spaces left${insufficient ? ` · ${requestedQuantity.toLocaleString()} needed` : ""} · ${(candidate.available_capacity - free).toLocaleString()} allocated`,
                                          disabled:
                                            unavailable &&
                                            candidate.id !== allocation.blockId,
                                          danger: unavailable,
                                        };
                                      })}
                                    onSelect={(value) => {
                                      clearFieldError(blockKey);
                                      updateArrivalAllocation(
                                        draft.transactionItemId,
                                        allocationIndex,
                                        { blockId: value },
                                      );
                                    }}
                                  />
                                </View>
                              </View>
                              {allocation.blockId ? (
                                <AppText
                                  size="small"
                                  style={{
                                    color: capacityError
                                      ? theme.danger
                                      : theme.textSecondary,
                                  }}
                                >
                                  {capacityError
                                    ? capacityError
                                    : `${Math.max(0, availableCapacity - assignedQuantity).toLocaleString()} spaces will remain after this arrival.`}
                                </AppText>
                              ) : null}
                              {draft.blockAllocations.length > 1 ? (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Remove block allocation ${allocationIndex + 1}`}
                                  onPress={() =>
                                    removeArrivalAllocation(
                                      draft.transactionItemId,
                                      allocationIndex,
                                    )
                                  }
                                  style={styles.removeAllocation}
                                >
                                  <Ionicons
                                    name="trash-outline"
                                    size={17}
                                    color={theme.danger}
                                  />
                                  <AppText
                                    size="small"
                                    style={{ color: theme.danger }}
                                  >
                                    Remove block
                                  </AppText>
                                </Pressable>
                              ) : null}
                            </View>
                          );
                        },
                      )}
                      <Button
                        label="Add another block"
                        variant="secondary"
                        onPress={() =>
                          addArrivalAllocation(draft.transactionItemId)
                        }
                      />
                      <AppText size="small" tone="secondary">
                        Allocated{" "}
                        {draft.blockAllocations.reduce(
                          (total, allocation) =>
                            total + (Number(allocation.quantity) || 0),
                          0,
                        )}{" "}
                        of {draft.quantityReceived || 0} chickens
                      </AppText>
                    </View>
                  </View>
                );
              })}
              {options.data.blocks.length === 0 ? (
                <AppText size="small" style={{ color: theme.danger }}>
                  Add an active housing block before recording this arrival.
                </AppText>
              ) : null}
              <TextField
                label="Arrival notes (optional)"
                value={arrivalNotes}
                onChangeText={setArrivalNotes}
                placeholder="Transport, condition, or other details"
                multiline
                textAlignVertical="top"
                style={styles.multilineInput}
              />
              {arrivalError ? (
                <AppText size="small" style={{ color: theme.danger }}>
                  {arrivalError}
                </AppText>
              ) : null}
              <View style={styles.arrivalActions}>
                <Button
                  label="Cancel arrival"
                  variant="secondary"
                  disabled={createReceipt.isPending}
                  onPress={() => setArrivalOpen(false)}
                />
                <Button
                  label="Record arrival"
                  loading={createReceipt.isPending}
                  onPress={() => void submitArrival()}
                />
              </View>
            </Card>
          ) : null}
          {result.items.some((item) => item.quantity_remaining > 0) ? (
            <Button
              label="Record receipt"
              onPress={() =>
                router.push({
                  pathname: "/purchases/[purchaseId]/receive",
                  params: { purchaseId: result.id },
                })
              }
            />
          ) : null}
          <Card style={styles.inventoryNote}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color={theme.primary}
            />
            <AppText size="small" tone="secondary" style={styles.flexCopy}>
              Flock numbers change when these chickens are received and assigned
              to housing.
            </AppText>
          </Card>
          <Button label="Back to chickens" onPress={() => router.back()} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <FarmPageHeader
        title="Record chicken purchase"
        showBack
        fallbackHref="/(tabs)/flock"
      />
      <View style={styles.progressSection}>
        <View style={styles.progressLabels}>
          <AppText size="small" weight="semibold" tone="secondary">
            STEP {step + 1} OF {steps.length}
          </AppText>
          <AppText size="small" weight="semibold">
            {steps[step]}
          </AppText>
        </View>
        <View style={styles.progressTrack}>
          {steps.map((stepLabel, index) => (
            <View
              key={stepLabel}
              style={[
                styles.progressSegment,
                {
                  backgroundColor: index <= step ? theme.primary : theme.border,
                },
              ]}
            />
          ))}
        </View>
      </View>

      {step === 0 ? (
        <View style={styles.stepContent}>
          <View style={styles.sectionIntro}>
            <AppText size="heading" weight="semibold">
              Purchase details
            </AppText>
            <AppText size="small" tone="secondary">
              Add the supplier and the date this purchase was agreed.
            </AppText>
          </View>
          <DatePickerField
            label="Purchase date"
            value={selectedPurchaseDate}
            onChange={setPurchaseDate}
            maximumDate={parseDate(farmToday) ?? new Date()}
          />
          <View style={styles.inputSection}>
            <SearchableSelectField
              label="Supplier (optional)"
              value={supplierId}
              placeholder="Choose supplier or no supplier"
              searchPlaceholder="Search suppliers"
              options={[
                { label: "No supplier", value: "" },
                ...options.data.suppliers.map((supplier) => ({
                  label: supplier.name,
                  value: supplier.id,
                  description: supplier.phone || supplier.email || undefined,
                })),
              ]}
              onSelect={setSupplierId}
            />
            {options.data.suppliers.length === 0 ? (
              <AppText size="small" tone="secondary">
                No suppliers yet. Add one here or continue without a supplier.
              </AppText>
            ) : null}
            {!supplierFormOpen ? (
              <Button
                label="Add a new supplier"
                variant="secondary"
                onPress={() => {
                  setSupplierError(null);
                  setSupplierFormOpen(true);
                }}
              />
            ) : (
              <Card style={styles.newSupplierCard}>
                <AppText weight="semibold">New supplier</AppText>
                <TextField
                  label="Supplier name"
                  value={newSupplierName}
                  onChangeText={setNewSupplierName}
                  placeholder="Business or contact name"
                  autoCapitalize="words"
                  maxLength={160}
                />
                <TextField
                  label="Phone (optional)"
                  value={newSupplierPhone}
                  onChangeText={setNewSupplierPhone}
                  placeholder="Phone number"
                  keyboardType="phone-pad"
                  maxLength={50}
                />
                <TextField
                  label="Email (optional)"
                  value={newSupplierEmail}
                  onChangeText={setNewSupplierEmail}
                  placeholder="name@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  maxLength={254}
                />
                {supplierError ? (
                  <AppText size="small" style={{ color: theme.danger }}>
                    {supplierError}
                  </AppText>
                ) : null}
                <View style={styles.supplierFormActions}>
                  <Button
                    label="Cancel"
                    variant="secondary"
                    disabled={createContact.isPending}
                    onPress={() => {
                      setSupplierFormOpen(false);
                      setSupplierError(null);
                    }}
                  />
                  <Button
                    label="Save supplier"
                    loading={createContact.isPending}
                    onPress={() => void submitNewSupplier()}
                  />
                </View>
              </Card>
            )}
          </View>
          <TextField
            label="Purchase notes (optional)"
            value={purchaseNotes}
            onChangeText={setPurchaseNotes}
            placeholder="Add any useful details"
            multiline
            textAlignVertical="top"
            style={styles.multilineInput}
          />
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.stepContent}>
          <View style={styles.sectionIntro}>
            <AppText size="heading" weight="semibold">
              Purchase quantities
            </AppText>
            <AppText size="small" tone="secondary">
              Enter the amount you bought here. Actual deliveries are recorded
              separately so you can receive part now and the remainder later.
            </AppText>
          </View>
          {items.map((item, index) => (
            <Card key={item.id} style={styles.itemCard}>
              <View style={styles.itemHeading}>
                <AppText weight="semibold">
                  Purchase item {index + 1}
                </AppText>
                {items.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove purchase item ${index + 1}`}
                    onPress={() => {
                      setDiscountConfirmed(false);
                      setOverpaymentConfirmed(false);
                      setItemDrafts((current) =>
                        current.filter((candidate) => candidate.id !== item.id),
                      );
                    }}
                    style={styles.removeItemButton}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={theme.danger}
                    />
                    <AppText size="small" style={{ color: theme.danger }}>
                      Remove
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
              <SearchableSelectField
                label="Chicken product"
                value={item.productId}
                placeholder="Choose chicken product"
                searchPlaceholder="Search chicken products"
                error={
                  arrivalFieldError?.key === `batch:${item.id}:product`
                    ? arrivalFieldError.message
                    : undefined
                }
                focusRequest={
                  arrivalFieldError?.key === `batch:${item.id}:product`
                    ? arrivalFieldError.request
                    : 0
                }
                options={options.data.products.map((product) => ({
                  label: product.name,
                  value: product.id,
                }))}
                onSelect={(productId) => {
                  clearFieldError(`batch:${item.id}:product`);
                  const product = options.data.products.find(
                    (candidate) => candidate.id === productId,
                  );
                  if (product) selectProduct(item, product);
                }}
              />
              {options.data.products.length === 0 ? (
                <AppText size="small" tone="secondary">
                  Add an active chicken product in Product management first.
                </AppText>
              ) : null}
              <SearchableSelectField
                label="Chicken type"
                value={item.chickenType}
                placeholder="Choose chicken type"
                searchPlaceholder="Search chicken types"
                searchable={false}
                error={
                  arrivalFieldError?.key === `batch:${item.id}:type`
                    ? arrivalFieldError.message
                    : undefined
                }
                focusRequest={
                  arrivalFieldError?.key === `batch:${item.id}:type`
                    ? arrivalFieldError.request
                    : 0
                }
                options={chickenTypes.map((type) => ({
                  label: type.label,
                  value: type.value,
                }))}
                onSelect={(value) => {
                  clearFieldError(`batch:${item.id}:type`);
                  updateItem(item.id, { chickenType: value as ChickenType });
                }}
              />
              {options.data.products.find(
                (product) => product.id === item.productId,
              ) ? (
                <ProductUnitChooser
                  product={
                    options.data.products.find(
                      (product) => product.id === item.productId,
                    )!
                  }
                  selectedUnitId={item.unitId}
                  error={
                    arrivalFieldError?.key === `batch:${item.id}:unit`
                      ? arrivalFieldError.message
                      : undefined
                  }
                  onSelect={(unit) => {
                    clearFieldError(`batch:${item.id}:unit`);
                    updateItem(item.id, { unitId: unit.unit_id });
                  }}
                />
              ) : null}
              <View style={styles.numberFields}>
                <View style={styles.numberField}>
                  <TextField
                    label="Quantity purchased"
                    value={item.quantity}
                    ref={(input) =>
                      bindFieldRef(`batch:${item.id}:quantity`, input)
                    }
                    error={
                      arrivalFieldError?.key === `batch:${item.id}:quantity`
                        ? arrivalFieldError.message
                        : undefined
                    }
                    onChangeText={(value) => {
                      clearFieldError(`batch:${item.id}:quantity`);
                      updateItem(item.id, { quantity: value });
                    }}
                    keyboardType="number-pad"
                    placeholder="e.g. 50"
                  />
                </View>
                <View style={styles.numberField}>
                  <TextField
                    label={`Unit price (${theme.currency})`}
                    value={item.unitPrice}
                    ref={(input) =>
                      bindFieldRef(`batch:${item.id}:unit-price`, input)
                    }
                    error={
                      arrivalFieldError?.key === `batch:${item.id}:unit-price`
                        ? arrivalFieldError.message
                        : undefined
                    }
                    onChangeText={(value) => {
                      clearFieldError(`batch:${item.id}:unit-price`);
                      updateItem(item.id, { unitPrice: value });
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                </View>
              </View>
              <TextField
                label="Purchase item notes (optional)"
                value={item.notes}
                onChangeText={(value) => updateItem(item.id, { notes: value })}
                placeholder="Add details about this order item"
              />
              <AppText size="small" tone="secondary">
                Batch and housing details are set on the separate receipt form
                when the chickens arrive.
              </AppText>
            </Card>
          ))}
          <Button
            label="Add another item"
            variant="secondary"
            onPress={() => {
              setDiscountConfirmed(false);
              setOverpaymentConfirmed(false);
              setItemDrafts((current) => [...current, createItemDraft()]);
            }}
          />
          <Card style={styles.pricingCard}>
            <View style={styles.sectionIntro}>
              <AppText weight="semibold">Purchase pricing</AppText>
              <AppText size="small" tone="secondary">
                Discounts reduce the purchase cost; they are not payments.
              </AppText>
            </View>
            <View style={styles.choiceWrap}>
              <ChoiceButton
                label="No discount"
                selected={discountType === null}
                onPress={() => {
                  clearFieldError("discount:value");
                  setDiscountType(null);
                  setDiscountValue("");
                  setDiscountConfirmed(false);
                  setOverpaymentConfirmed(false);
                }}
              />
              <ChoiceButton
                label="Fixed amount"
                selected={discountType === "fixed"}
                onPress={() => {
                  clearFieldError("discount:value");
                  setDiscountType("fixed");
                  setDiscountValue("");
                  setDiscountConfirmed(false);
                  setOverpaymentConfirmed(false);
                }}
              />
              <ChoiceButton
                label="Percentage"
                selected={discountType === "percentage"}
                onPress={() => {
                  clearFieldError("discount:value");
                  setDiscountType("percentage");
                  setDiscountValue("");
                  setDiscountConfirmed(false);
                  setOverpaymentConfirmed(false);
                }}
              />
            </View>
            {discountType ? (
              <>
                <TextField
                  label={
                    discountType === "percentage"
                      ? "Discount percentage"
                      : `Discount amount (${theme.currency})`
                  }
                  value={discountValue}
                  ref={(input) => bindFieldRef("discount:value", input)}
                  error={discountError}
                  onChangeText={(value) => {
                    clearFieldError("discount:value");
                    setDiscountValue(value);
                    setDiscountConfirmed(false);
                    setOverpaymentConfirmed(false);
                  }}
                  keyboardType="decimal-pad"
                  placeholder={
                    discountType === "percentage" ? "e.g. 5" : "0.00"
                  }
                />
                <TextField
                  label="Discount reason (optional)"
                  value={discountReason}
                  onChangeText={(value) => setDiscountReason(value)}
                  placeholder="Negotiated price, bulk purchase, etc."
                  maxLength={200}
                />
              </>
            ) : null}
            <View
              style={[styles.pricingSummary, { borderTopColor: theme.border }]}
            >
              <SummaryRow
                label="Calculated subtotal"
                value={formatCents(
                  purchasePricing.subtotalCents,
                  theme.currency,
                )}
              />
              <SummaryRow
                label="Discount"
                value={formatCents(
                  -purchasePricing.discountCents,
                  theme.currency,
                )}
                labelColor={theme.secondary}
                valueColor={theme.secondary}
              />
              <SummaryRow
                label="Final purchase cost"
                value={formatCents(purchasePricing.totalCents, theme.currency)}
                emphasized
                labelColor={theme.primary}
                valueColor={theme.primary}
              />
              {purchasePricing.effectiveCostPerChickenCents !== null ? (
                <SummaryRow
                  label="Effective cost per chicken"
                  value={formatCents(
                    purchasePricing.effectiveCostPerChickenCents,
                    theme.currency,
                  )}
                />
              ) : null}
            </View>
          </Card>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.stepContent}>
          <View style={styles.sectionIntro}>
            <AppText size="heading" weight="semibold">
              Payment
            </AppText>
            <AppText size="small" tone="secondary">
              Record one payment or split the amount across payment methods.
            </AppText>
          </View>
          <Card style={styles.paymentToggle}>
            <View style={styles.flexCopy}>
              <AppText weight="semibold">Record payment now</AppText>
              <AppText size="small" tone="secondary">
                You can record later payments separately.
              </AppText>
            </View>
            <Switch
              value={recordPayment}
              onValueChange={(enabled) => {
                setRecordPayment(enabled);
                setOverpaymentConfirmed(false);
                setError(null);
              }}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={theme.backgroundElement}
            />
          </Card>
          {recordPayment ? (
            <>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel="Fully paid"
                accessibilityState={{
                  checked: fullyPaid,
                  disabled: purchaseTotalCents <= 0n,
                }}
                disabled={purchaseTotalCents <= 0n}
                onPress={() => {
                  const nextFullyPaid = !fullyPaid;
                  setFullyPaid(nextFullyPaid);
                  setOverpaymentConfirmed(false);
                  setPaymentAmount(
                    nextFullyPaid ? centsToDecimal(purchaseTotalCents) : "",
                  );
                }}
                style={({ pressed }) => [
                  styles.fullyPaidToggle,
                  {
                    backgroundColor: pressed
                      ? theme.backgroundSelected
                      : theme.backgroundElement,
                    borderColor: fullyPaid ? theme.success : theme.border,
                    opacity: purchaseTotalCents <= 0n ? 0.5 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.checkboxMark,
                    {
                      backgroundColor: fullyPaid
                        ? theme.success
                        : theme.backgroundElement,
                      borderColor: fullyPaid ? theme.success : theme.border,
                    },
                  ]}
                >
                  {fullyPaid ? (
                    <Ionicons name="checkmark" size={15} color="#FFFFFF" />
                  ) : null}
                </View>
                <View style={styles.flexCopy}>
                  <AppText weight="semibold">Fully paid</AppText>
                  <AppText size="small" tone="secondary">
                    Set this payment to the final purchase cost.
                  </AppText>
                </View>
              </Pressable>
              <TextField
                label={`First payment amount (${theme.currency})`}
                value={
                  fullyPaid ? centsToDecimal(purchaseTotalCents) : paymentAmount
                }
                ref={(input) => bindFieldRef("payment:amount", input)}
                error={
                  arrivalFieldError?.key === "payment:amount"
                    ? arrivalFieldError.message
                    : undefined
                }
                onChangeText={(value) => {
                  clearFieldError("payment:amount");
                  setFullyPaid(false);
                  setOverpaymentConfirmed(false);
                  setPaymentAmount(value);
                }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                editable={!fullyPaid}
              />
              <View style={styles.inputSection}>
                <AppText size="small" weight="semibold">
                  First payment method
                </AppText>
                <View style={styles.choiceWrap}>
                  {paymentMethods.map((method) => (
                    <ChoiceButton
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
              </View>
              {paymentMethod !== "cash" ? (
                <TextField
                  label="Payment reference (optional)"
                  value={paymentReference}
                  onChangeText={setPaymentReference}
                  placeholder="Receipt or transaction code"
                  maxLength={100}
                />
              ) : null}
              {additionalPayments.map((payment, index) => (
                <View
                  key={payment.id}
                  style={[
                    styles.paymentEntry,
                    { borderTopColor: theme.border },
                  ]}
                >
                  <View style={styles.itemHeading}>
                    <AppText weight="semibold">Payment {index + 2}</AppText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove payment ${index + 2}`}
                      onPress={() => {
                        setAdditionalPayments((current) =>
                          current.filter(
                            (candidate) => candidate.id !== payment.id,
                          ),
                        );
                        setOverpaymentConfirmed(false);
                      }}
                      style={styles.removeAllocation}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={17}
                        color={theme.danger}
                      />
                      <AppText size="small" style={{ color: theme.danger }}>
                        Remove
                      </AppText>
                    </Pressable>
                  </View>
                  <TextField
                    label={`Amount (${theme.currency})`}
                    value={payment.amount}
                    ref={(input) =>
                      bindFieldRef(`payment:${payment.id}:amount`, input)
                    }
                    error={
                      arrivalFieldError?.key === `payment:${payment.id}:amount`
                        ? arrivalFieldError.message
                        : undefined
                    }
                    onChangeText={(value) => {
                      clearFieldError(`payment:${payment.id}:amount`);
                      setAdditionalPayments((current) =>
                        current.map((candidate) =>
                          candidate.id === payment.id
                            ? { ...candidate, amount: value }
                            : candidate,
                        ),
                      );
                      setOverpaymentConfirmed(false);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                  <View style={styles.inputSection}>
                    <AppText size="small" weight="semibold">
                      Payment method
                    </AppText>
                    <View style={styles.choiceWrap}>
                      {paymentMethods.map((method) => (
                        <ChoiceButton
                          key={method.value}
                          label={method.label}
                          selected={payment.method === method.value}
                          onPress={() =>
                            setAdditionalPayments((current) =>
                              current.map((candidate) =>
                                candidate.id === payment.id
                                  ? {
                                      ...candidate,
                                      method: method.value,
                                      reference:
                                        method.value === "cash"
                                          ? ""
                                          : candidate.reference,
                                    }
                                  : candidate,
                              ),
                            )
                          }
                        />
                      ))}
                    </View>
                  </View>
                  {payment.method !== "cash" ? (
                    <TextField
                      label="Payment reference (optional)"
                      value={payment.reference}
                      onChangeText={(value) =>
                        setAdditionalPayments((current) =>
                          current.map((candidate) =>
                            candidate.id === payment.id
                              ? { ...candidate, reference: value }
                              : candidate,
                          ),
                        )
                      }
                      placeholder="Receipt or transaction code"
                      maxLength={100}
                    />
                  ) : null}
                </View>
              ))}
              <Button
                label="Add another payment"
                variant="secondary"
                onPress={() => {
                  setAdditionalPayments((current) => [
                    ...current,
                    {
                      id: `${Date.now()}-${Math.random()}`,
                      amount: "",
                      method: "cash",
                      reference: "",
                    },
                  ]);
                  setOverpaymentConfirmed(false);
                }}
              />
            </>
          ) : null}
          <Card style={styles.paymentSummary}>
            <SummaryRow
              label="Purchase total"
              value={formatCents(purchaseTotalCents, theme.currency)}
              emphasized
              labelColor={theme.primary}
              valueColor={theme.primary}
            />
            <SummaryRow
              label="Paid now"
              value={formatCents(paidNowCents, theme.currency)}
              labelColor={theme.success}
              valueColor={theme.success}
            />
            <SummaryRow
              label={creditBalanceCents > 0n ? "Credit balance" : "Balance due"}
              value={formatCents(
                creditBalanceCents > 0n ? creditBalanceCents : balanceDueCents,
                theme.currency,
              )}
              emphasized
              labelColor={
                balanceDueCents === 0n || creditBalanceCents > 0n
                  ? theme.success
                  : theme.danger
              }
              valueColor={
                balanceDueCents === 0n || creditBalanceCents > 0n
                  ? theme.success
                  : theme.danger
              }
            />
            <AppText size="small" tone="secondary">
              {recordPayment && paymentAmount
                ? "Balance updates as you enter the amount paid."
                : "Enter an amount paid to preview the remaining balance."}
            </AppText>
            <View
              style={[
                styles.paymentOutcome,
                {
                  borderColor:
                    creditBalanceCents > 0n
                      ? theme.secondary
                      : balanceDueCents > 0n
                        ? theme.danger
                        : theme.success,
                  backgroundColor:
                    creditBalanceCents > 0n
                      ? `${theme.secondary}10`
                      : balanceDueCents > 0n
                        ? `${theme.danger}0A`
                        : `${theme.success}10`,
                },
              ]}
            >
              <Ionicons
                name={
                  creditBalanceCents > 0n
                    ? "return-down-back-outline"
                    : balanceDueCents > 0n
                      ? "time-outline"
                      : "checkmark-circle-outline"
                }
                size={21}
                color={
                  creditBalanceCents > 0n
                    ? theme.secondary
                    : balanceDueCents > 0n
                      ? theme.danger
                      : theme.success
                }
              />
              <View style={styles.flexCopy}>
                <AppText
                  size="small"
                  weight="semibold"
                  style={{
                    color:
                      creditBalanceCents > 0n
                        ? theme.secondary
                        : balanceDueCents > 0n
                          ? theme.danger
                          : theme.success,
                  }}
                >
                  {creditBalanceCents > 0n
                    ? "Supplier owes you"
                    : balanceDueCents > 0n
                      ? "You still owe the supplier"
                      : "Paid in full"}
                </AppText>
                <AppText size="small" tone="secondary">
                  {creditBalanceCents > 0n
                    ? `${formatCents(creditBalanceCents, theme.currency)} will be recorded as supplier credit; no refund has been received.`
                    : balanceDueCents > 0n
                      ? `${formatCents(balanceDueCents, theme.currency)} remains to pay.`
                      : "The payments entered match the discounted purchase total."}
                </AppText>
              </View>
            </View>
          </Card>
          {balanceDueCents > 0n || creditBalanceCents > 0n ? (
            <View style={styles.reminderSection}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={
                  creditBalanceCents > 0n
                    ? "Remind me to settle the supplier credit"
                    : "Remind me to pay the balance"
                }
                accessibilityState={{ checked: remindForSettlement }}
                onPress={() => {
                  const enabled = !remindForSettlement;
                  setRemindForSettlement(enabled);
                  setReminderError(null);
                  if (enabled && reminderDueDate < farmToday) {
                    setReminderDueDate(addDaysToDate(farmToday, 1));
                  } else if (enabled && reminderDueDate === farmToday) {
                    const minimumTime = nextFarmLocalTime(
                      farm.selectedFarm?.settings?.timezone,
                    );
                    if (reminderDueTime < minimumTime) {
                      setReminderDueTime(minimumTime);
                    }
                  }
                }}
                style={({ pressed }) => [
                  styles.reminderToggle,
                  {
                    backgroundColor: pressed
                      ? theme.backgroundSelected
                      : theme.backgroundElement,
                    borderColor: remindForSettlement
                      ? theme.primary
                      : theme.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.checkboxMark,
                    {
                      backgroundColor: remindForSettlement
                        ? theme.primary
                        : theme.backgroundElement,
                      borderColor: remindForSettlement
                        ? theme.primary
                        : theme.border,
                    },
                  ]}
                >
                  {remindForSettlement ? (
                    <Ionicons name="checkmark" size={15} color="#FFFFFF" />
                  ) : null}
                </View>
                <View style={styles.flexCopy}>
                  <AppText weight="semibold">
                    {creditBalanceCents > 0n
                      ? "Remind me to settle supplier credit"
                      : "Remind me to pay the balance"}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    We’ll notify you when the reminder is due.
                  </AppText>
                </View>
              </Pressable>
              {remindForSettlement ? (
                <View style={styles.reminderSchedule}>
                  <DatePickerField
                    label="Reminder date"
                    value={reminderDueDate}
                    onChange={(date) => {
                      setReminderDueDate(date);
                      if (date === farmToday) {
                        const minimumTime = nextFarmLocalTime(
                          farm.selectedFarm?.settings?.timezone,
                        );
                        if (reminderDueTime < minimumTime) {
                          setReminderDueTime(minimumTime);
                        }
                      }
                    }}
                    minimumDate={parseDate(farmToday) ?? new Date()}
                  />
                  <TimePickerField
                    label="Reminder time (farm local time)"
                    value={reminderDueTime}
                    onChange={setReminderDueTime}
                    minimumTime={
                      reminderDueDate === farmToday
                        ? nextFarmLocalTime(
                            farm.selectedFarm?.settings?.timezone,
                          )
                        : undefined
                    }
                  />
                  <View style={styles.inputSection}>
                    <AppText size="small" weight="semibold">
                      Reminder delivery
                    </AppText>
                    <AppText size="small" tone="secondary">
                      We’ll use a device push when available. If push setup
                      fails, the reminder will still be saved in FarmTrack.
                    </AppText>
                    {reminderError ? (
                      <AppText size="small" style={{ color: theme.danger }}>
                        {reminderError}
                      </AppText>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.stepContent}>
          <View style={styles.sectionIntro}>
            <AppText size="heading" weight="semibold">
              Review purchase
            </AppText>
            <AppText size="small" tone="secondary">
              Check the details before recording this purchase.
            </AppText>
          </View>
          <Card style={styles.reviewCard}>
            <AppText weight="semibold">Purchase overview</AppText>
            <AppText size="small" tone="secondary">
              Recording {Number(purchasePricing.chickenCount).toLocaleString()}{" "}
              chickens from{" "}
              {options.data.suppliers.find(
                (supplier) => supplier.id === supplierId,
              )?.name ?? "a supplier not specified"}
              .
            </AppText>
            <SummaryRow
              label="Purchase date"
              value={formatDateForDisplay(selectedPurchaseDate)}
            />
            {(() => {
              const supplier = options.data.suppliers.find(
                (candidate) => candidate.id === supplierId,
              );
              if (!supplier) return null;
              return (
                <View style={styles.contactDetails}>
                  <AppText size="small" weight="semibold">
                    {supplier.name}
                  </AppText>
                  {supplier.phone ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Call ${supplier.name}`}
                      onPress={() =>
                        void openContactLink(
                          `tel:${supplier.phone?.replace(/[^\d+]/g, "")}`,
                          "phone app",
                        )
                      }
                      style={styles.contactLink}
                    >
                      <Ionicons
                        name="call-outline"
                        size={17}
                        color={theme.primary}
                      />
                      <AppText size="small" style={{ color: theme.primary }}>
                        {supplier.phone}
                      </AppText>
                    </Pressable>
                  ) : null}
                  {supplier.email ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Email ${supplier.name}`}
                      onPress={() =>
                        void openContactLink(
                          `mailto:${supplier.email}`,
                          "email app",
                        )
                      }
                      style={styles.contactLink}
                    >
                      <Ionicons
                        name="mail-outline"
                        size={17}
                        color={theme.primary}
                      />
                      <AppText size="small" style={{ color: theme.primary }}>
                        {supplier.email}
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              );
            })()}
            {items.map((item, index) => {
              const product = options.data.products.find(
                (candidate) => candidate.id === item.productId,
              );
              const unit = product?.product_units.find(
                (candidate) => candidate.unit_id === item.unitId,
              );
              const unitPriceCents = parseMoneyToCents(item.unitPrice) ?? 0n;
              const lineSubtotalCents =
                BigInt(item.quantity || "0") * unitPriceCents;
              return (
                <View
                  key={item.id}
                  style={[styles.reviewItem, { borderTopColor: theme.border }]}
                >
                  <AppText weight="semibold">
                    Purchase item {index + 1}:{" "}
                    {product?.name ?? "Chicken product"}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {chickenTypes.find(
                      (type) => type.value === item.chickenType,
                    )?.label ?? "Chicken"}
                    {" · "}
                    {item.quantity} {unit?.unit_abbreviation ?? "units"}
                    {" · "}
                    {formatCents(lineSubtotalCents, theme.currency)} subtotal
                  </AppText>
                </View>
              );
            })}
            {purchaseNotes.trim() ? (
              <SummaryRow label="Notes" value={purchaseNotes.trim()} />
            ) : null}
          </Card>
          <Card style={styles.reviewCard}>
            <AppText weight="semibold">Financial summary</AppText>
            <SummaryRow
              label="Calculated subtotal"
              value={formatCents(purchasePricing.subtotalCents, theme.currency)}
            />
            <SummaryRow
              label="Discount"
              value={formatCents(
                -purchasePricing.discountCents,
                theme.currency,
              )}
              labelColor={theme.secondary}
              valueColor={theme.secondary}
            />
            <SummaryRow
              label="Final purchase cost"
              value={formatCents(purchaseTotalCents, theme.currency)}
              emphasized
              labelColor={theme.primary}
              valueColor={theme.primary}
            />
            <SummaryRow
              label={
                recordPayment
                  ? `Amount paid · ${1 + additionalPayments.length} payment${additionalPayments.length === 0 ? "" : "s"}`
                  : "Amount paid"
              }
              value={formatCents(paidNowCents, theme.currency)}
              labelColor={theme.success}
              valueColor={theme.success}
            />
            {creditBalanceCents > 0n ? (
              <SummaryRow
                label="Credit balance"
                value={formatCents(creditBalanceCents, theme.currency)}
                labelColor={theme.secondary}
                valueColor={theme.secondary}
              />
            ) : (
              <SummaryRow
                label="Outstanding balance"
                value={formatCents(balanceDueCents, theme.currency)}
                emphasized
                labelColor={
                  balanceDueCents === 0n ? theme.success : theme.danger
                }
                valueColor={
                  balanceDueCents === 0n ? theme.success : theme.danger
                }
              />
            )}
            {[
              ...(paymentReference.trim()
                ? [{ id: "first", value: paymentReference.trim() }]
                : []),
              ...additionalPayments
                .filter((payment) => payment.reference.trim())
                .map((payment) => ({
                  id: payment.id,
                  value: payment.reference.trim(),
                })),
            ].map((payment, index) => (
              <SummaryRow
                key={payment.id}
                label={`Payment ${index + 1} reference`}
                value={payment.value}
              />
            ))}
            {remindForSettlement &&
            (balanceDueCents > 0n || creditBalanceCents > 0n) ? (
              <SummaryRow
                label="Settlement reminder"
                value={`${formatDateForDisplay(reminderDueDate)} · ${reminderDueTime}`}
              />
            ) : null}
          </Card>
        </View>
      ) : null}

      {error ? (
        <AppText size="small" style={{ color: theme.danger }}>
          {error}
        </AppText>
      ) : null}

      <View style={styles.navigationActions}>
        <Button
          label={step === 0 ? "Cancel" : "Back"}
          variant="secondary"
          disabled={createPurchase.isPending}
          onPress={() =>
            step === 0 ? router.back() : setStep((current) => current - 1)
          }
        />
        {step < steps.length - 1 ? (
          <Button label="Continue" onPress={goNext} />
        ) : (
          <Button
            label="Record purchase"
            loading={createPurchase.isPending}
            onPress={() => void submitPurchase()}
          />
        )}
      </View>
    </ScreenShell>
  );
}

function ScreenShell({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

type SelectOption = {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
  danger?: boolean;
};

function SearchableSelectField({
  label,
  value,
  placeholder,
  searchPlaceholder,
  options,
  onSelect,
  searchable = true,
  error,
  focusRequest = 0,
}: {
  label: string;
  value: string;
  placeholder: string;
  searchPlaceholder: string;
  options: SelectOption[];
  onSelect: (value: string) => void;
  searchable?: boolean;
  error?: string;
  focusRequest?: number;
}) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState("");
  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(search.trim().toLowerCase()),
  );

  function openSelector() {
    setSearch("");
    setVisible(true);
  }

  useEffect(() => {
    if (focusRequest <= 0) return;
    const frame = requestAnimationFrame(openSelector);
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  return (
    <View style={styles.selectorField}>
      <AppText size="small" weight="semibold">
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedOption?.label ?? placeholder}`}
        accessibilityState={{ expanded: visible }}
        onPress={openSelector}
        style={({ pressed }) => [
          styles.selectTrigger,
          {
            backgroundColor: pressed
              ? theme.backgroundSelected
              : theme.backgroundElement,
            borderColor: error ? theme.danger : theme.border,
          },
        ]}
      >
        <AppText
          size="small"
          numberOfLines={1}
          style={{
            flex: 1,
            color: selectedOption ? theme.text : theme.textSecondary,
          }}
        >
          {selectedOption?.label ?? placeholder}
        </AppText>
        <Ionicons name="chevron-down" size={19} color={theme.textSecondary} />
      </Pressable>
      {error ? (
        <AppText size="small" style={{ color: theme.danger }}>
          {error}
        </AppText>
      ) : null}

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.selectModalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close ${label.toLowerCase()} selector`}
            onPress={() => setVisible(false)}
            style={styles.selectScrim}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={[
              styles.selectSheet,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.selectHeader}>
              <View style={styles.flexCopy}>
                <AppText size="heading" weight="semibold">
                  {label}
                </AppText>
                <AppText size="small" tone="secondary">
                  {searchable
                    ? "Search and choose an option."
                    : "Choose an option."}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Close ${label.toLowerCase()} selector`}
                hitSlop={8}
                onPress={() => setVisible(false)}
                style={styles.closeSelectorButton}
              >
                <Ionicons name="close" size={22} color={theme.text} />
              </Pressable>
            </View>
            {searchable ? (
              <TextField
                label={`Search ${label.toLowerCase()}`}
                placeholder={searchPlaceholder}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
                autoCapitalize="none"
              />
            ) : null}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.selectOptions}
              automaticallyAdjustKeyboardInsets
            >
              {filteredOptions.map((option) => {
                const isSelected = option.value === value;
                return (
                  <Pressable
                    key={option.value || "no-supplier"}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: isSelected,
                      disabled: option.disabled,
                    }}
                    disabled={option.disabled}
                    onPress={() => {
                      onSelect(option.value);
                      setVisible(false);
                    }}
                    style={({ pressed }) => [
                      styles.selectOption,
                      {
                        backgroundColor:
                          pressed || isSelected
                            ? theme.backgroundSelected
                            : theme.backgroundElement,
                        borderColor: option.danger
                          ? theme.danger
                          : isSelected
                            ? theme.primary
                            : theme.border,
                        opacity: option.disabled ? 0.48 : 1,
                      },
                    ]}
                  >
                    <View style={styles.flexCopy}>
                      <AppText
                        weight="semibold"
                        style={option.danger ? { color: theme.danger } : null}
                      >
                        {option.label}
                      </AppText>
                      {option.description ? (
                        <AppText
                          size="small"
                          tone={option.danger ? undefined : "secondary"}
                          style={option.danger ? { color: theme.danger } : null}
                        >
                          {option.description}
                        </AppText>
                      ) : null}
                    </View>
                    {isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={21}
                        color={theme.primary}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
              {filteredOptions.length === 0 ? (
                <AppText
                  size="small"
                  tone="secondary"
                  style={styles.emptyOptions}
                >
                  No matching options. Try another search.
                </AppText>
              ) : null}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

function ChoiceButton({
  label,
  selected,
  onPress,
  invalid = false,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.choiceButton,
        {
          backgroundColor: selected
            ? theme.backgroundSelected
            : pressed
              ? theme.backgroundSelected
              : theme.backgroundElement,
          borderColor: invalid
            ? theme.danger
            : selected
              ? theme.primary
              : theme.border,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      <AppText
        size="small"
        weight="semibold"
        style={{ color: selected ? theme.primary : theme.text }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function ProductUnitChooser({
  product,
  selectedUnitId,
  onSelect,
  error,
}: {
  product: Product;
  selectedUnitId: string;
  onSelect: (unit: ProductUnit) => void;
  error?: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.inputSection}>
      <AppText size="small" weight="semibold">
        Purchase unit
      </AppText>
      <View style={styles.choiceWrap}>
        {product.product_units.map((unit) => (
          <ChoiceButton
            key={unit.unit_id}
            label={`${unit.unit_name} (${unit.unit_abbreviation})`}
            selected={selectedUnitId === unit.unit_id}
            invalid={Boolean(error)}
            onPress={() => onSelect(unit)}
          />
        ))}
      </View>
      {error ? (
        <AppText size="small" style={{ color: theme.danger }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

function SummaryRow({
  label,
  value,
  emphasized = false,
  labelColor,
  valueColor,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  labelColor?: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <AppText
        size="small"
        tone={emphasized ? "primary" : "secondary"}
        style={labelColor ? { color: labelColor } : undefined}
      >
        {label}
      </AppText>
      <AppText
        size="small"
        weight="semibold"
        style={[styles.summaryValue, valueColor ? { color: valueColor } : null]}
      >
        {value}
      </AppText>
    </View>
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
    gap: 16,
  },
  stateCard: { gap: 10 },
  progressSection: { gap: 8 },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  progressTrack: { flexDirection: "row", gap: 5 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2 },
  stepContent: { gap: 22 },
  sectionIntro: { gap: 6, paddingBottom: 6 },
  inputSection: { gap: 8 },
  newSupplierCard: { gap: 12 },
  supplierFormActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
  },
  selectorField: { gap: 7 },
  selectTrigger: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
  },
  selectModalRoot: { flex: 1, justifyContent: "flex-end" },
  selectScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  selectSheet: {
    maxHeight: "82%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  selectHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingBottom: 14,
  },
  closeSelectorButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  selectOptions: { gap: 8, paddingTop: 12, paddingBottom: 18 },
  selectOption: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: 6,
  },
  emptyOptions: { paddingVertical: 14, textAlign: "center" },
  choiceList: { gap: 7 },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choiceButton: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 6,
  },
  multilineInput: { minHeight: 88 },
  itemCard: { gap: 19, borderRadius: 18, padding: 19 },
  itemHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  removeItemButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 6,
  },
  numberFields: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  numberField: { flex: 1, minWidth: 150 },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#D8DED5",
    paddingTop: 12,
  },
  paymentToggle: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    borderRadius: 16,
    padding: 16,
  },
  reminderSection: { gap: 10 },
  reminderToggle: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reminderSchedule: { gap: 12 },
  fullyPaidToggle: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  checkboxMark: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 5,
  },
  paymentSummary: { gap: 11 },
  paymentOutcome: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderWidth: 1,
    borderRadius: 10,
  },
  paymentEntry: { gap: 10, borderTopWidth: 1, paddingTop: 12 },
  flexCopy: { flex: 1 },
  contactDetails: { gap: 6, paddingVertical: 4 },
  contactLink: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reviewCard: { gap: 15, borderRadius: 16, padding: 17 },
  pricingCard: { gap: 18, borderRadius: 18, padding: 19 },
  pricingSummary: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#D8DED5",
    paddingTop: 11,
  },
  reviewItem: {
    gap: 3,
    borderTopWidth: 1,
    borderTopColor: "#D8DED5",
    paddingTop: 10,
  },
  successBatchList: { gap: 9, paddingTop: 4 },
  successBatch: {
    gap: 3,
    borderTopWidth: 1,
    borderTopColor: "#D8DED5",
    paddingTop: 10,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  summaryValue: { flex: 1, textAlign: "right" },
  inventoryNote: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  navigationActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 4,
  },
  successContent: { gap: 14 },
  receiptSuccess: { gap: 10 },
  reminderSaved: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reminderErrorCard: { gap: 10 },
  receiptSuccessItem: { gap: 3, paddingTop: 6 },
  arrivalCard: { gap: 17, borderRadius: 16, padding: 17 },
  arrivalBatch: {
    gap: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D8DED5",
    borderRadius: 14,
  },
  arrivalQuantityContext: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  arrivalQuantityStat: { flex: 1, minWidth: 115, gap: 3 },
  allocationSection: { gap: 9 },
  allocationRow: { gap: 7 },
  allocationFields: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  allocationQuantity: { flex: 0.75, minWidth: 120 },
  allocationBlock: { flex: 1.25, minWidth: 0 },
  removeAllocation: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 5,
    paddingHorizontal: 6,
  },
  arrivalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  resultMark: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 23,
  },
});
