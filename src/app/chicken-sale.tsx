import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TimePickerField } from "@/components/ui/time-picker-field";
import { TextField } from "@/components/ui/text-field";
import {
  useChickenSaleOptions,
  useCreateChickenSale,
} from "@/features/chickens/hooks";
import { formatChickenCount } from "@/features/chickens/format";
import type { Contact } from "@/features/management/api";
import type {
  ChickenSaleInput,
  ChickenSaleItemInput,
  ChickenType,
} from "@/features/chickens/api";
import {
  useCreateContact,
  useCreateContactRole,
  useContacts,
  useSearchCustomers,
} from "@/features/management/hooks";
import {
  isValidKenyanMobile,
  normalizedKenyanPhone,
} from "@/features/management/kenyan-phone";
import { getContacts } from "@/features/management/api";
import { useCreateReminder } from "@/features/reminders/hooks";
import {
  registerForReminderPush,
  scheduleReminderNotification,
} from "@/features/reminders/push-notifications";
import type { Reminder } from "@/features/reminders/api";
import {
  centsToDecimal,
  formatCents,
  parseMoneyToCents,
} from "@/features/chickens/purchase-pricing";
import {
  SmsPaymentPicker,
  type SelectedSmsPayment,
} from "@/features/payment-message-import/components/SmsPaymentPicker";
import { usePaymentMessageImport } from "@/features/payment-message-import/PaymentMessageImportProvider";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type SaleLineDraft = {
  id: string;
  productId: string;
  chickenType: ChickenType | "";
  quantity: string;
  unitPrice: string;
};

type SalePaymentDraft = {
  id: string;
  amount: string;
  method: (typeof paymentMethods)[number]["value"];
  reference: string;
  smsMessageId?: string;
  date?: string;
  time?: string | null;
};

type SmsCustomerDraft = {
  name: string;
  phone: string;
  sourceMessageId: string;
};

const paymentMethods = [
  { label: "Cash", value: "cash", icon: "cash-outline" },
  { label: "M-Pesa", value: "mpesa", icon: "phone-portrait-outline" },
  { label: "Bank", value: "bank_transfer", icon: "business-outline" },
  { label: "Card", value: "card", icon: "card-outline" },
  { label: "Other", value: "other", icon: "ellipsis-horizontal-outline" },
] as const;

function newPayment(): SalePaymentDraft {
  return {
    id: `${Date.now()}-${Math.random()}`,
    amount: "",
    method: "cash",
    reference: "",
  };
}

function newSaleLine(): SaleLineDraft {
  return {
    id: `${Date.now()}-${Math.random()}`,
    productId: "",
    chickenType: "layers",
    quantity: "",
    unitPrice: "",
  };
}

type SaleDropdownOption<Value extends string = string> = {
  label: string;
  value: Value;
};

const chickenTypeOptions: SaleDropdownOption<ChickenType>[] = [
  { label: "Layers", value: "layers" },
  { label: "Broiler", value: "broiler" },
  { label: "Kienyeji", value: "kienyeji" },
  { label: "Breeder", value: "breeder" },
  { label: "Other", value: "other" },
];

function chickenTypeLabel(chickenType: ChickenType): string {
  return (
    chickenTypeOptions.find((option) => option.value === chickenType)?.label ??
    chickenType
  );
}

function normalizedName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function farmToday(timezone: string | null | undefined): string {
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

function farmTimeNow(timezone: string | null | undefined): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone || "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  };
  try {
    return new Intl.DateTimeFormat("en-GB", options).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      ...options,
      timeZone: "UTC",
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
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

export default function ChickenSaleScreen() {
  return (
    <SessionGate>
      <ChickenSaleContent />
    </SessionGate>
  );
}

function ChickenSaleContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const {
    nativeError: smsImportNativeError,
    sharedMessage,
  } = usePaymentMessageImport();
  const dialog = useAppDialog();
  const farmId = farm.selectedFarm?.id ?? "";
  const options = useChickenSaleOptions(user?.id, farm.selectedFarm?.id);
  const createSale = useCreateChickenSale(user?.id ?? "", farmId);
  const createContact = useCreateContact(user?.id ?? "", farmId);
  const createContactRole = useCreateContactRole(user?.id ?? "", farmId);
  const createReminder = useCreateReminder(user?.id ?? "", farmId);
  const [customerId, setCustomerId] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Contact | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState("");
  const customerDirectoryQuery = useContacts(
    user?.id,
    farm.selectedFarm?.id,
    "",
    "customer",
  );
  const customerSearchQuery = useSearchCustomers(
    user?.id,
    farm.selectedFarm?.id,
    debouncedCustomerSearch,
  );
  const isBrowsingCustomers = customerSearch.trim().length < 2;
  const visibleCustomers = isBrowsingCustomers
    ? customerDirectoryQuery.data?.pages.flatMap((page) => page) ?? []
    : customerSearchQuery.data ?? [];
  const customerListLoading = isBrowsingCustomers
    ? customerDirectoryQuery.isLoading
    : customerSearch.trim() !== debouncedCustomerSearch ||
      customerSearchQuery.isFetching;
  const customerListError = isBrowsingCustomers
    ? customerDirectoryQuery.isError
    : customerSearchQuery.isError;
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [newCustomerNotes, setNewCustomerNotes] = useState("");
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);
  const [lines, setLines] = useState<SaleLineDraft[]>([newSaleLine()]);
  const [step, setStep] = useState(0);
  const timezone = farm.selectedFarm?.settings?.timezone;
  const [transactionDate, setTransactionDate] = useState<string | null>(null);
  const [transactionTime, setTransactionTime] = useState<string | null>(null);
  const [includeTransactionTime, setIncludeTransactionTime] = useState(true);
  const [scheduleSaleFollowUp, setScheduleSaleFollowUp] = useState(false);
  const [reminderDueDate, setReminderDueDate] = useState<string | null>(null);
  const [reminderDueTime, setReminderDueTime] = useState("09:00");
  const [recordPayment, setRecordPayment] = useState(false);
  const [payments, setPayments] = useState<SalePaymentDraft[]>([newPayment()]);
  const [smsPickerPaymentId, setSmsPickerPaymentId] = useState<string | null>(null);
  const [smsCustomerDraft, setSmsCustomerDraft] =
    useState<SmsCustomerDraft | null>(null);
  const activeSmsCustomerDraft =
    smsCustomerDraft &&
    payments.some(
      (payment) => payment.smsMessageId === smsCustomerDraft.sourceMessageId,
    )
      ? smsCustomerDraft
      : null;
  const [isResolvingSmsCustomer, setIsResolvingSmsCustomer] = useState(false);
  const [discountType, setDiscountType] = useState<"fixed" | "percentage" | null>(null);
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedCustomerSearch(customerSearch.trim()),
      250,
    );
    return () => clearTimeout(timeout);
  }, [customerSearch]);

  const effectiveTransactionDate = transactionDate ?? farmToday(timezone);
  const effectiveTransactionTime = transactionTime ?? farmTimeNow(timezone);
  const effectiveReminderDueDate =
    reminderDueDate ?? addFarmDays(farmToday(timezone), 1);

  const saleProducts =
    options.data?.products.filter((product) => product.product_type === "chickens") ??
    [];
  const noSaleProducts =
    !options.isError && options.data !== undefined && saleProducts.length === 0;
  const firstSaleProductId = saleProducts[0]?.id;
  const batches = options.data?.batches ?? [];
  function selectedProductId(line: SaleLineDraft): string {
    return line.productId || firstSaleProductId || "";
  }

  function availableStockFor(chickenType: ChickenType): number {
    return batches
      .filter((batch) => batch.chicken_type === chickenType)
      .flatMap((batch) => batch.stocks)
      .reduce((sum, stock) => sum + stock.quantity, 0);
  }

  const lineTotals = lines.map((line) => {
    const parsedQuantity = Number(line.quantity);
    const quantity =
      Number.isInteger(parsedQuantity) && parsedQuantity > 0
        ? parsedQuantity
        : 0;
    const unitPriceCents = parseMoneyToCents(line.unitPrice);
    return {
      quantity,
      unitPriceCents,
      totalCents:
        unitPriceCents === null
          ? 0n
          : BigInt(quantity) * unitPriceCents,
    };
  });
  const subtotalCents = lineTotals.reduce(
    (sum, line) => sum + line.totalCents,
    0n,
  );
  const parsedDiscount = discountType
    ? parseMoneyToCents(discountValue)
    : 0n;
  const calculatedDiscountCents =
    parsedDiscount === null
      ? 0n
      : discountType === "percentage"
        ? (subtotalCents * parsedDiscount + 5000n) / 10000n
        : parsedDiscount;
  const discountCents =
    calculatedDiscountCents > subtotalCents
      ? subtotalCents
      : calculatedDiscountCents;
  const totalCents = subtotalCents - discountCents;
  const paidCents = recordPayment
    ? payments.reduce(
        (total, payment) =>
          total + (parseMoneyToCents(payment.amount) ?? 0n),
        0n,
      )
    : 0n;
  const balanceDueCents = totalCents > paidCents ? totalCents - paidCents : 0n;
  const creditCents = paidCents > totalCents ? paidCents - totalCents : 0n;
  const saleFollowUpAmountCents =
    balanceDueCents > 0n ? balanceDueCents : creditCents;

  function updateLine(
    lineId: string,
    update: (line: SaleLineDraft) => SaleLineDraft,
  ) {
    setLines((current) =>
      current.map((line) => (line.id === lineId ? update(line) : line)),
    );
  }

  function remainingForFullPayment(paymentId: string): bigint {
    const otherPaymentsCents = payments
      .filter((item) => item.id !== paymentId)
      .reduce(
        (sum, item) => sum + (parseMoneyToCents(item.amount) ?? 0n),
        0n,
      );
    return totalCents > otherPaymentsCents
      ? totalCents - otherPaymentsCents
      : 0n;
  }

  function fillPaymentToFull(paymentId: string) {
    const amount = remainingForFullPayment(paymentId);
    setPayments((current) =>
      current.map((item) =>
        item.id === paymentId
          ? { ...item, amount: centsToDecimal(amount) }
          : item,
      ),
    );
  }

  async function addCustomer() {
    const name = newCustomerName.trim();
    if (!name) return;
    try {
      let customer: Contact;
      const phone = newCustomerPhone.trim();
      const matchingContact = isValidKenyanMobile(phone)
        ? await findMatchingSmsContact({ name, phone })
        : null;
      if (matchingContact) {
        if (matchingContact.roles.includes("customer")) {
          customer = matchingContact;
        } else {
          await createContactRole.mutateAsync({
            contactId: matchingContact.id,
            role: "customer",
          });
          customer = {
            ...matchingContact,
            roles: [...matchingContact.roles, "customer"],
          };
        }
      } else {
        customer = await createContact.mutateAsync({
          name,
          roles: ["customer"],
          phone: phone || undefined,
          email: newCustomerEmail.trim() || undefined,
          address: newCustomerAddress.trim() || undefined,
          notes: newCustomerNotes.trim() || undefined,
        });
      }
      setCustomerId(customer.id);
      setSelectedCustomer(customer);
      setSmsCustomerDraft(null);
      setCustomerSearch("");
      setDebouncedCustomerSearch("");
      setShowNewCustomerForm(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerEmail("");
      setNewCustomerAddress("");
      setNewCustomerNotes("");
      setShowCustomerDetails(false);
    } catch (contactError: unknown) {
      setError(normalizeApiError(contactError).message);
    }
  }

  async function applySmsPayment(selectedPayments: SelectedSmsPayment[]) {
    const targetId = smsPickerPaymentId;
    if (!selectedPayments.length || !targetId) return;
    const target = payments.find((item) => item.id === targetId);
    if (!target) {
      setError("This payment entry is no longer available. Try again.");
      setSmsPickerPaymentId(null);
      return;
    }
    const seenReferences = new Set(
      payments
        .filter((item) => item.id !== targetId && item.method === "mpesa")
        .map((item) => item.reference.trim().toUpperCase())
        .filter(Boolean),
    );
    const seenMessageIds = new Set(
      payments
        .filter((item) => item.id !== targetId)
        .map((item) => item.smsMessageId)
        .filter((id): id is string => Boolean(id)),
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
      const currentCustomer = selectedCustomer;
      const replacingCustomer = Boolean(customerId && currentCustomer);
      const usePayerAsCustomer = await dialog.confirmDialog({
        title: replacingCustomer
          ? "Replace the selected customer?"
          : "Use the payer as the customer?",
        message:
          `${replacingCustomer ? "Use the payer details from this message instead of the selected customer?" : "Use the payer details from this message for the sale?"} FarmTrack will check your contacts when you submit.${selectedPayments.length > 1 ? " Details come from the first selected message." : ""}`,
        tone: "info",
        details: [
          ...(replacingCustomer
            ? [
                {
                  label: "Selected customer",
                  value: `${currentCustomer?.name ?? "Selected customer"}${currentCustomer?.phone ? ` · ${currentCustomer.phone}` : ""}`,
                },
              ]
            : []),
          { label: "Payer name", value: payerName || "Not included in message" },
          {
            label: "Payer phone",
            value: payerPhone || "Not included in message",
          },
        ],
        confirmLabel: replacingCustomer ? "Replace customer" : "Use as customer",
        cancelLabel: replacingCustomer ? "Keep selected customer" : "Payment only",
      });
      if (usePayerAsCustomer) {
        if (payerName && isValidKenyanMobile(payerPhone)) {
          setSmsCustomerDraft({
            name: payerName,
            phone: payerPhone,
            sourceMessageId: selectedPayments[0].messageId,
          });
          setCustomerId("");
          setSelectedCustomer(null);
        } else {
          needsPayerDetailsReview = true;
          setNewCustomerName(payerName);
          setNewCustomerPhone(payerPhone);
          setShowNewCustomerForm(true);
          setShowCustomerDetails(false);
          setCustomerId("");
          setSelectedCustomer(null);
          setStep(0);
          setSmsCustomerDraft(null);
        }
      }
    }
    const toDraft = (selected: SelectedSmsPayment): SalePaymentDraft => ({
      ...newPayment(),
      amount: selected.payment.amount ?? "",
      method: "mpesa",
      reference: selected.payment.transactionReference ?? "",
      smsMessageId: selected.messageId,
      date: selected.payment.transactionDate ?? undefined,
      time: selected.payment.transactionTime,
    });
    const [first, ...additional] = selectedPayments.map(toDraft);
    setError(
      needsPayerDetailsReview
        ? "The message does not include a complete payer name and mobile number. Check the details before saving the customer."
        : null,
    );
    setRecordPayment(true);
    setPayments((current) => [
      ...current.map((item) =>
        item.id === targetId ? { ...first, id: targetId } : item,
      ),
      ...additional,
    ]);
    setSmsPickerPaymentId(null);
  }

  async function resolveSmsCustomer(
    customerDraft: SmsCustomerDraft,
  ): Promise<Contact> {
    const match = await findMatchingSmsContact(customerDraft);
    if (match) {
      if (match.roles.includes("customer")) return match;
      await createContactRole.mutateAsync({
        contactId: match.id,
        role: "customer",
      });
      return { ...match, roles: [...match.roles, "customer"] };
    }

    return createContact.mutateAsync({
      name: customerDraft.name,
      phone: customerDraft.phone,
      roles: ["customer"],
    });
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

  function validateAndBuildPayload(
    requireCustomerForAccount = false,
    customerOverride?: Contact,
  ):
    | { error: string }
    | { payload: ChickenSaleInput } {
    if (lines.length === 0) return { error: "Add at least one sale item." } as const;

    const payloadItems: ChickenSaleItemInput[] = [];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const product = saleProducts.find(
        (item) => item.id === selectedProductId(line),
      );
      if (!product) {
        return { error: `Choose a chicken product for item ${lineIndex + 1}.` } as const;
      }
      const baseUnit = product.product_units.find((unit) => unit.is_base_unit);
      if (!baseUnit || Number(baseUnit.conversion_factor) !== 1) {
        return {
          error: `${product.name} needs a base unit representing one chicken before it can be sold.`,
        } as const;
      }
      const quantity = Number(line.quantity);
      if (
        !/^\d+$/.test(line.quantity.trim()) ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return {
          error: `Enter a whole number of chickens greater than zero for item ${lineIndex + 1}.`,
        } as const;
      }
      if (!line.chickenType) {
        return {
          error: `Choose a chicken type for item ${lineIndex + 1}.`,
        } as const;
      }
      const unitPriceCents = parseMoneyToCents(line.unitPrice);
      if (unitPriceCents === null) {
        return {
          error: `Enter a valid price with up to two decimal places for item ${lineIndex + 1}.`,
        } as const;
      }
      payloadItems.push({
        product_id: product.id,
        chicken_type: line.chickenType,
        quantity,
        unit_id: baseUnit.unit_id,
        unit_price: centsToDecimal(unitPriceCents),
      });
    }

    if (discountType && parsedDiscount === null) {
      return { error: "Enter a valid discount amount." } as const;
    }
    if (
      discountType === "percentage" &&
      (parsedDiscount ?? 0n) > 10000n
    ) {
      return { error: "A discount percentage cannot exceed 100%." } as const;
    }
    if (
      discountType === "fixed" &&
      (parsedDiscount ?? 0n) > subtotalCents
    ) {
      return { error: "The discount cannot exceed the sale subtotal." } as const;
    }
    if (recordPayment) {
      if (!payments.length) {
        return { error: "Add a payment or turn off Record payment now." } as const;
      }
      for (let index = 0; index < payments.length; index += 1) {
        const amount = parseMoneyToCents(payments[index].amount);
        if (amount === null || amount <= 0n) {
          return {
            error: `Enter a valid amount greater than zero for payment ${index + 1}.`,
          } as const;
        }
      }
      const seenReferences = new Set<string>();
      const seenSmsMessageIds = new Set<string>();
      for (let index = 0; index < payments.length; index += 1) {
        const payment = payments[index];
        const reference = payment.reference.trim().toUpperCase();
        if (payment.method === "mpesa" && reference) {
          if (seenReferences.has(reference)) {
            return {
              error: `M-Pesa transaction code in payment ${index + 1} is already used.`,
            } as const;
          }
          seenReferences.add(reference);
        }
        if (payment.smsMessageId) {
          if (seenSmsMessageIds.has(payment.smsMessageId)) {
            return {
              error: `M-Pesa message in payment ${index + 1} is already used.`,
            } as const;
          }
          seenSmsMessageIds.add(payment.smsMessageId);
        }
      }
    }
    const effectiveCustomer = customerOverride ?? selectedCustomer;
    const effectiveCustomerId = customerOverride?.id ?? customerId;
    if (
      requireCustomerForAccount &&
      (balanceDueCents > 0n || creditCents > 0n) &&
      !(effectiveCustomerId && effectiveCustomer?.name.trim())
    ) {
      return {
        error:
          "Choose a customer with a name before recording a balance due or overpayment as a customer account.",
      } as const;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveTransactionDate)) {
      return { error: "Choose a valid sale date." } as const;
    }
    if (
      scheduleSaleFollowUp &&
      saleFollowUpAmountCents > 0n &&
      (!parseCalendarDate(effectiveReminderDueDate) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderDueTime))
    ) {
      return { error: "Choose a valid reminder date and time." } as const;
    }
    if (
      scheduleSaleFollowUp &&
      saleFollowUpAmountCents > 0n &&
      `${effectiveReminderDueDate}T${reminderDueTime}` <=
        `${farmToday(timezone)}T${farmTimeNow(timezone)}`
    ) {
      return {
        error: "Choose a reminder time in the future for this farm.",
      } as const;
    }
    return {
      payload: {
        transaction_date: effectiveTransactionDate,
        transaction_time: includeTransactionTime ? effectiveTransactionTime : null,
        customer_id: effectiveCustomerId || undefined,
        notes: notes.trim() || undefined,
        items: payloadItems,
        discount_type: discountType ?? undefined,
        discount_value: discountType ? discountValue.trim() : "0.00",
        discount_reason:
          discountType && discountReason.trim()
            ? discountReason.trim()
            : undefined,
        payments: recordPayment
          ? payments.map((payment) => ({
              amount: centsToDecimal(
                parseMoneyToCents(payment.amount) ?? 0n,
              ),
              payment_date: payment.date ?? effectiveTransactionDate,
              payment_time:
                payment.date
                  ? payment.time ?? null
                  : includeTransactionTime
                    ? effectiveTransactionTime
                    : null,
              payment_method: payment.method,
              reference_number: payment.reference.trim() || undefined,
            }))
          : [],
      },
    } as const;
  }

  async function submitSale() {
    setError(null);
    const result = validateAndBuildPayload();
    if ("error" in result) {
      setError(result.error ?? "Review the sale details and try again.");
      const validationError = result.error.toLowerCase();
      setStep(
        validationError.includes("reminder")
          ? 3
          : validationError.includes("customer") ||
              validationError.includes("sale date")
          ? 0
          : validationError.includes("payment") || validationError.includes("discount")
            ? 2
            : 1,
      );
      return;
    }
    if (recordPayment && paidCents > totalCents) {
      const confirmed = await dialog.confirmDialog({
        title: "Payment exceeds sale total",
        message: `The sale total is ${formatCents(totalCents, theme.currency)}, but the payments add up to ${formatCents(paidCents, theme.currency)}. The difference will be recorded as customer credit.`,
        tone: "info",
        cancelLabel: "Review payments",
        confirmLabel: "Confirm credit",
      });
      if (!confirmed) return;
    }
    try {
      let saleCustomer = selectedCustomer ?? undefined;
      if (activeSmsCustomerDraft) {
        setIsResolvingSmsCustomer(true);
        saleCustomer = await resolveSmsCustomer(activeSmsCustomerDraft);
        setCustomerId(saleCustomer.id);
        setSelectedCustomer(saleCustomer);
      }
      const finalResult = validateAndBuildPayload(true, saleCustomer);
      if ("error" in finalResult) {
        setError(finalResult.error);
        if (finalResult.error.toLowerCase().includes("customer")) {
          setStep(0);
        } else {
          setStep(2);
        }
        return;
      }
      const sale = await createSale.mutateAsync(finalResult.payload);
      let reminderNotice = "";
      let reminderNoticeTone: "info" | "warning" = "info";
      const saleBalanceDueCents =
        parseMoneyToCents(String(sale.balance_due)) ?? 0n;
      const saleCreditCents =
        parseMoneyToCents(String(sale.credit_balance)) ?? 0n;
      if (
        scheduleSaleFollowUp &&
        (saleBalanceDueCents > 0n || saleCreditCents > 0n)
      ) {
        try {
          let expoPushToken: string | undefined;
          let deliveryChannel: Reminder["delivery_channel"] = "push";
          let pushSetupError: unknown;
          try {
            expoPushToken = await registerForReminderPush();
          } catch (error: unknown) {
            deliveryChannel = "in_app";
            pushSetupError = error;
          }
          const buyerName = saleCustomer?.name;
          const isOverpayment = saleCreditCents > 0n;
          const followUpAmount = isOverpayment
            ? saleCreditCents
            : saleBalanceDueCents;
          const reminderTitle = isOverpayment
            ? "Settle chicken sale overpayment"
            : "Follow up on chicken sale balance";
          const reminderDescription = isOverpayment
            ? `Settle the ${formatCents(followUpAmount, theme.currency)} overpayment owed to ${buyerName ?? "the customer"} from ${sale.reference_number ?? "the chicken sale"}.`
            : buyerName
              ? `Ask ${buyerName} for the remaining ${formatCents(followUpAmount, theme.currency)} from ${sale.reference_number ?? "the chicken sale"}.`
              : `Follow up on the unpaid ${formatCents(followUpAmount, theme.currency)} from this walk-in sale (${sale.reference_number ?? "the chicken sale"}).`;
          const reminder = await createReminder.mutateAsync({
            title: reminderTitle,
            description: reminderDescription,
            due_at: `${effectiveReminderDueDate}T${reminderDueTime}:00`,
            delivery_channel: deliveryChannel,
            ...(expoPushToken ? { expo_push_token: expoPushToken } : {}),
            related_entity_type: "sale_transaction",
            related_entity_id: sale.id,
          });
          if (deliveryChannel === "in_app") {
            let phoneAlertMessage = "";
            if (Platform.OS === "web") {
              phoneAlertMessage =
                " Device alerts are available in the mobile app.";
            } else {
              try {
                await scheduleReminderNotification(reminder);
              } catch (localAlertError: unknown) {
                phoneAlertMessage = ` A device alert could not be scheduled: ${normalizeApiError(localAlertError).message}`;
                reminderNoticeTone = "warning";
              }
            }
            reminderNotice = `Follow-up reminder saved in FarmTrack for ${effectiveReminderDueDate} at ${reminderDueTime}.${phoneAlertMessage} Push setup was unavailable: ${normalizeApiError(pushSetupError).message}`;
          }
        } catch (reminderError: unknown) {
          reminderNotice = `The sale was recorded, but the balance reminder could not be saved: ${normalizeApiError(reminderError).message}`;
          reminderNoticeTone = "warning";
        }
      }
      router.replace({
        pathname: "/sales/[saleId]",
        params: {
          saleId: sale.id,
          created: "true",
          ...(reminderNotice ? { reminderNotice, reminderNoticeTone } : {}),
        },
      });
    } catch (saleError: unknown) {
      setError(normalizeApiError(saleError).message);
    } finally {
      setIsResolvingSmsCustomer(false);
    }
  }

  if (options.isLoading) return <LoadingState label="Loading sale options" />;

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
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          <FarmPageHeader title="Record chicken sale" showBack />
          {options.isError ? (
            <Card style={styles.section}>
              <AppText weight="semibold">Could not load sale options</AppText>
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

          {noSaleProducts ? (
            <Card style={styles.emptyProductsCard}>
              <View
                style={[
                  styles.emptyProductsIcon,
                  { backgroundColor: `${theme.primary}18` },
                ]}
              >
                <Ionicons
                  name="pricetag-outline"
                  size={23}
                  color={theme.primary}
                />
              </View>
              <AppText weight="semibold">
                No chicken products available for sale
              </AppText>
              <AppText size="small" tone="secondary">
                Add or activate a chicken product in Product management, then
                switch on “Available for sale” to use it here.
              </AppText>
              <Button
                label="Manage products"
                variant="secondary"
                onPress={() => router.push("/products")}
              />
            </Card>
          ) : null}

          {!noSaleProducts ? (
            <>
          <StepProgress step={step} />
          {step === 0 ? (
          <Card style={styles.section}>
            <SectionTitle number="1" title="Who is buying?" />
            {selectedCustomer ? (
              <View
                style={[
                  styles.selectedCustomerCard,
                  {
                    borderColor: theme.primary,
                    backgroundColor: `${theme.primary}0A`,
                  },
                ]}
              >
                <View
                  style={[
                    styles.selectedCustomerIcon,
                    { backgroundColor: `${theme.primary}18` },
                  ]}
                >
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={theme.primary}
                  />
                </View>
                <View style={styles.selectedCustomerCopy}>
                  <AppText weight="semibold" numberOfLines={1}>
                    {selectedCustomer.name}
                  </AppText>
                  <AppText size="small" tone="secondary" numberOfLines={2}>
                    {[selectedCustomer.phone, selectedCustomer.email]
                      .filter(Boolean)
                      .join(" · ") || "No contact details"}
                  </AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change selected customer"
                  onPress={() => {
                    setCustomerId("");
                    setSelectedCustomer(null);
                    setCustomerSearch("");
                  }}
                  style={[
                    styles.changeCustomerButton,
                    { borderColor: theme.border },
                  ]}
                >
                  <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                    Change
                  </AppText>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.customerPickerHeading}>
                  <View style={styles.customerPickerCopy}>
                    <AppText weight="semibold">Customer</AppText>
                  </View>
                  <AppText size="small" tone="secondary">
                    Optional
                  </AppText>
                </View>
                <View
                  style={[
                    styles.customerSearchBox,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="search-outline"
                    size={19}
                    color={theme.textSecondary}
                  />
                  <TextInput
                    accessibilityLabel="Search customers by name, phone, or email"
                    placeholder="Search or browse customers"
                    placeholderTextColor={theme.textSecondary}
                    value={customerSearch}
                    onChangeText={setCustomerSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.customerSearchInput, { color: theme.text }]}
                  />
                  {customerSearch.length > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear customer search"
                      onPress={() => setCustomerSearch("")}
                      hitSlop={8}
                    >
                      <Ionicons
                        name="close-circle"
                        size={19}
                        color={theme.textSecondary}
                      />
                    </Pressable>
                  ) : null}
                </View>
                {customerListLoading ? (
                  <View style={styles.customerSearchState}>
                    <ActivityIndicator size="small" color={theme.primary} />
                    <AppText size="small" tone="secondary">
                      {isBrowsingCustomers
                        ? "Loading customers…"
                        : "Searching customers…"}
                    </AppText>
                  </View>
                ) : customerListError ? (
                  <View style={styles.customerSearchState}>
                    <AppText size="small" style={{ color: theme.danger }}>
                      {normalizeApiError(
                        isBrowsingCustomers
                          ? customerDirectoryQuery.error
                          : customerSearchQuery.error,
                      ).message}
                    </AppText>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        void (isBrowsingCustomers
                          ? customerDirectoryQuery.refetch()
                          : customerSearchQuery.refetch())
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
                ) : visibleCustomers.length ? (
                  <ScrollView
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    style={[
                      styles.customerResults,
                      { borderColor: theme.border },
                    ]}
                  >
                    {visibleCustomers.map((customer, index) => (
                      <Pressable
                        key={customer.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${customer.name}${customer.phone ? `, ${customer.phone}` : ""}`}
                        onPress={() => {
                          setCustomerId(customer.id);
                          setSelectedCustomer(customer);
                          setSmsCustomerDraft(null);
                          setCustomerSearch("");
                          setDebouncedCustomerSearch("");
                        }}
                        style={({ pressed }) => [
                          styles.customerResult,
                          index > 0 && {
                            borderTopWidth: 1,
                            borderTopColor: theme.border,
                          },
                          { opacity: pressed ? 0.65 : 1 },
                        ]}
                      >
                        <View
                          style={[
                            styles.customerResultIcon,
                            { backgroundColor: theme.backgroundSelected },
                          ]}
                        >
                          <Ionicons
                            name="person-outline"
                            size={17}
                            color={theme.primary}
                          />
                        </View>
                        <View style={styles.customerResultCopy}>
                          <AppText weight="semibold" numberOfLines={1}>
                            {customer.name}
                          </AppText>
                          <AppText size="small" tone="secondary" numberOfLines={1}>
                            {[customer.phone, customer.email]
                              .filter(Boolean)
                              .join(" · ") || "No contact details"}
                          </AppText>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={17}
                          color={theme.textSecondary}
                        />
                      </Pressable>
                    ))}
                    {isBrowsingCustomers &&
                    customerDirectoryQuery.hasNextPage ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={customerDirectoryQuery.isFetchingNextPage}
                        onPress={() =>
                          void customerDirectoryQuery.fetchNextPage()
                        }
                        style={[
                          styles.loadMoreCustomers,
                          { borderTopColor: theme.border },
                        ]}
                      >
                        {customerDirectoryQuery.isFetchingNextPage ? (
                          <ActivityIndicator size="small" color={theme.primary} />
                        ) : (
                          <AppText
                            size="small"
                            weight="semibold"
                            style={{ color: theme.primary }}
                          >
                            Load more customers
                          </AppText>
                        )}
                      </Pressable>
                    ) : null}
                  </ScrollView>
                ) : (
                  <AppText size="small" tone="secondary">
                    {isBrowsingCustomers
                      ? "No saved customers yet."
                      : `No customers match “${debouncedCustomerSearch}”.`}
                  </AppText>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showNewCustomerForm }}
                  onPress={() => setShowNewCustomerForm((visible) => !visible)}
                  style={[
                    styles.addNewCustomerButton,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.backgroundElement,
                    },
                  ]}
                >
                  <Ionicons
                    name={showNewCustomerForm ? "close-outline" : "person-add-outline"}
                    size={18}
                    color={theme.primary}
                  />
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: theme.primary, flex: 1 }}
                  >
                    {showNewCustomerForm ? "Cancel new customer" : "Add a new customer"}
                  </AppText>
                  <Ionicons
                    name={showNewCustomerForm ? "chevron-up" : "chevron-down"}
                    size={17}
                    color={theme.primary}
                  />
                </Pressable>
                {showNewCustomerForm ? (
                  <View style={styles.newCustomerForm}>
                    <TextInput
                      accessibilityLabel="New customer name"
                      placeholder="Customer name"
                      placeholderTextColor={theme.textSecondary}
                      value={newCustomerName}
                      onChangeText={setNewCustomerName}
                      style={[
                        styles.input,
                        {
                          backgroundColor: theme.background,
                          borderColor: theme.border,
                          color: theme.text,
                        },
                      ]}
                    />
                    <Pressable
                      accessibilityRole="button"
                      disabled={!newCustomerName.trim() || createContact.isPending}
                      onPress={() => void addCustomer()}
                      style={[
                        styles.createCustomerButton,
                        {
                          backgroundColor: theme.primary,
                          opacity:
                            !newCustomerName.trim() || createContact.isPending
                              ? 0.5
                              : 1,
                        },
                      ]}
                    >
                      {createContact.isPending ? (
                        <ActivityIndicator size="small" color={theme.onPrimary} />
                      ) : (
                        <Ionicons
                          name="person-add-outline"
                          size={18}
                          color={theme.onPrimary}
                        />
                      )}
                      <AppText
                        size="small"
                        weight="semibold"
                        style={{ color: theme.onPrimary }}
                      >
                        Save and select customer
                      </AppText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: showCustomerDetails }}
                      onPress={() => setShowCustomerDetails((visible) => !visible)}
                      style={styles.optionalFieldsToggle}
                    >
                      <AppText
                        size="small"
                        weight="semibold"
                        style={{ color: theme.primary }}
                      >
                        {showCustomerDetails
                          ? "Hide optional contact details"
                          : "Add contact details (optional)"}
                      </AppText>
                      <Ionicons
                        name={showCustomerDetails ? "chevron-up" : "chevron-down"}
                        size={17}
                        color={theme.primary}
                      />
                    </Pressable>
                    {showCustomerDetails ? (
                      <View style={styles.optionalFields}>
                        <TextField
                          label="Phone number"
                          value={newCustomerPhone}
                          onChangeText={setNewCustomerPhone}
                          keyboardType="phone-pad"
                        />
                        <TextField
                          label="Email address"
                          placeholder="Email address"
                          value={newCustomerEmail}
                          onChangeText={setNewCustomerEmail}
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                        <TextField
                          label="Address"
                          placeholder="Address"
                          value={newCustomerAddress}
                          onChangeText={setNewCustomerAddress}
                        />
                        <TextField
                          label="Notes"
                          placeholder="Customer notes (optional)"
                          value={newCustomerNotes}
                          onChangeText={setNewCustomerNotes}
                        />
                        <AppText size="small" tone="secondary">
                          These details will be saved with the customer.
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: !customerId }}
                  onPress={() => {
                    setCustomerId("");
                    setSelectedCustomer(null);
                    setSmsCustomerDraft(null);
                  }}
                  style={[
                    styles.walkInOption,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.backgroundElement,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.walkInRadio,
                      {
                        borderColor: !customerId ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    {!customerId ? (
                      <View
                        style={[
                          styles.walkInRadioSelected,
                          { backgroundColor: theme.primary },
                        ]}
                      />
                    ) : null}
                  </View>
                  <View style={styles.customerPickerCopy}>
                    <AppText size="small" weight="semibold">
                      Continue without a customer
                    </AppText>
                  </View>
                </Pressable>
              </>
            )}
            <View style={[styles.dateTimeCard, { borderColor: theme.border }]}>
              <DatePickerField
                label="Sale date"
                value={effectiveTransactionDate}
                onChange={setTransactionDate}
              />
              <View style={styles.paymentToggle}>
                <View style={styles.paymentToggleCopy}>
                  <AppText size="small" weight="semibold">Include a time</AppText>
                </View>
                <Switch
                  accessibilityLabel="Include transaction time"
                  value={includeTransactionTime}
                  onValueChange={setIncludeTransactionTime}
                  trackColor={{ false: theme.border, true: theme.primary }}
                  thumbColor={theme.backgroundElement}
                />
              </View>
              {includeTransactionTime ? (
                <TimePickerField
                  label="Sale time"
                  value={effectiveTransactionTime}
                  onChange={setTransactionTime}
                />
              ) : null}
            </View>
          </Card>
          ) : null}

          {step === 1 ? (
          <View style={styles.section}>
            <SectionTitle number="2" title="Chickens and price" />
            {lines.map((line, lineIndex) => {
              const available = line.chickenType
                ? availableStockFor(line.chickenType)
                : 0;
              const ordered = Number(line.quantity);
              const exceedsStock =
                Number.isInteger(ordered) && ordered > available;
              return (
              <Card key={line.id} style={styles.saleLine}>
                <View style={styles.lineHeading}>
                  <AppText weight="semibold">Sale item {lineIndex + 1}</AppText>
                  {lines.length > 1 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove sale item ${lineIndex + 1}`}
                      onPress={() =>
                        setLines((current) =>
                          current.filter((candidate) => candidate.id !== line.id),
                        )
                      }
                    >
                      <Ionicons name="trash-outline" size={19} color={theme.danger} />
                    </Pressable>
                  ) : null}
                </View>
                <SaleDropdown
                  label="Chicken product"
                  placeholder="Choose a chicken product"
                  icon="cube-outline"
                  value={selectedProductId(line)}
                  searchable
                  options={saleProducts.map((product) => ({
                    label: product.name,
                    value: product.id,
                  }))}
                  onChange={(productId) =>
                    updateLine(line.id, (current) => ({
                      ...current,
                      productId,
                    }))
                  }
                />

                <SaleDropdown
                  label="Chicken type"
                  placeholder="Choose a chicken type"
                  icon="paw-outline"
                  value={line.chickenType}
                  options={chickenTypeOptions}
                  onChange={(chickenType) =>
                    updateLine(line.id, (current) => ({
                      ...current,
                      chickenType,
                    }))
                  }
                />
                {line.chickenType ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: 13,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: exceedsStock ? `${theme.secondary}55` : theme.border,
                      backgroundColor: exceedsStock
                        ? `${theme.secondary}10`
                        : theme.backgroundElement,
                    }}
                  >
                    <Ionicons
                      name={
                        exceedsStock ? "alert-circle-outline" : "cube-outline"
                      }
                      size={19}
                      color={
                        exceedsStock ? theme.secondary : theme.primary
                      }
                    />
                    <View style={styles.flexCopy}>
                      <AppText size="small" weight="semibold">
                        {available.toLocaleString()}{" "}
                        {chickenTypeLabel(line.chickenType)} currently available
                      </AppText>
                      <AppText size="small" tone="secondary">
                        {exceedsStock
                          ? `This order exceeds current stock by ${(ordered - available).toLocaleString()}. Record it now and deliver in parts as stock becomes available.`
                          : "You can record a partial delivery now and fulfil the remainder later."}
                      </AppText>
                    </View>
                  </View>
                ) : null}
                <View style={styles.formField}>
                  <AppText size="small" weight="semibold">
                    Quantity ordered
                  </AppText>
                  <TextInput
                    accessibilityLabel="Ordered chicken quantity"
                    keyboardType="number-pad"
                    placeholder="For example, 500"
                    placeholderTextColor={theme.textSecondary}
                    value={line.quantity}
                    onChangeText={(quantity) =>
                      updateLine(line.id, (current) => ({ ...current, quantity }))
                    }
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                    ]}
                  />
                </View>
                <View style={styles.formField}>
                  <AppText size="small" weight="semibold">
                    Price per chicken
                  </AppText>
                  <TextInput
                    accessibilityLabel="Price per chicken"
                    keyboardType="decimal-pad"
                    placeholder={`Price in ${theme.currency}`}
                    placeholderTextColor={theme.textSecondary}
                    value={line.unitPrice}
                    onChangeText={(value) =>
                      updateLine(line.id, (current) => ({
                        ...current,
                        unitPrice: value,
                      }))
                    }
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                    ]}
                  />
                </View>
                <View
                  style={[
                    styles.lineTotal,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <View style={styles.flexCopy}>
                    <AppText size="small" weight="semibold">
                      Line total
                    </AppText>
                    <AppText size="small" tone="secondary">
                      {formatChickenCount(lineTotals[lineIndex].quantity)}
                    </AppText>
                  </View>
                  <AppText
                    weight="semibold"
                    style={{ color: theme.primary, flexShrink: 1, textAlign: "right" }}
                  >
                    {formatCents(lineTotals[lineIndex].totalCents, theme.currency)}
                  </AppText>
                </View>
              </Card>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add another chicken sale item"
              onPress={() =>
                setLines((current) => [
                  ...current,
                  { ...newSaleLine(), productId: firstSaleProductId ?? "" },
                ])
              }
              style={({ pressed }) => [
                styles.addSaleItemButton,
                {
                  backgroundColor: theme.backgroundSelected,
                  borderColor: theme.border,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.addSaleItemIcon,
                  {
                    backgroundColor: theme.primary,
                  },
                ]}
              >
                <Ionicons name="add" size={21} color={theme.onPrimary} />
              </View>
              <AppText
                weight="semibold"
                style={[styles.addSaleItemLabel, { color: theme.text }]}
              >
                Add another chicken item
              </AppText>
            </Pressable>
          </View>
          ) : null}

          {step === 2 ? (
          <>
          <Animated.View
            key={step}
            entering={FadeInDown.duration(220)}
            style={styles.stepContent}
          >
            <SectionTitle number="3" title="Discount and payment" />
            <Card style={styles.salePricingCard}>
            <View style={styles.discountHeader}>
              <View
                style={[
                  styles.discountIcon,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons
                  name="pricetag-outline"
                  size={19}
                  color={theme.primary}
                />
              </View>
              <View style={styles.flexCopy}>
                <AppText weight="semibold">Discount</AppText>
                <AppText size="small" tone="secondary">
                  {discountType === null
                    ? "Optional price adjustment"
                    : discountType === "fixed"
                      ? "Fixed amount discount"
                      : "Percentage discount"}
                </AppText>
              </View>
            </View>
            <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel="Apply discount"
                accessibilityState={{ checked: discountType !== null }}
                onPress={() => {
                  setDiscountType(discountType === null ? "fixed" : null);
                  setDiscountValue("");
                  if (discountType !== null) setDiscountReason("");
                }}
                style={({ pressed }) => [
                  styles.discountToggle,
                  {
                    backgroundColor:
                      discountType !== null
                        ? theme.backgroundSelected
                        : pressed
                          ? theme.backgroundSelected
                          : theme.backgroundElement,
                    borderColor:
                      discountType !== null ? `${theme.primary}70` : theme.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.discountToggleIcon,
                    {
                      backgroundColor:
                        discountType !== null
                          ? theme.primary
                          : theme.backgroundSelected,
                    },
                  ]}
                >
                  <Ionicons
                    name="pricetag-outline"
                    size={18}
                    color={
                      discountType !== null ? theme.onPrimary : theme.primary
                    }
                  />
                </View>
                <View style={styles.flexCopy}>
                  <AppText weight="semibold">Apply discount</AppText>
                  {discountType !== null ? (
                    <AppText size="small" tone="secondary">
                      Choose a type below
                    </AppText>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.checkboxMark,
                    {
                      backgroundColor:
                        discountType !== null
                          ? theme.primary
                          : theme.backgroundElement,
                      borderColor:
                        discountType !== null ? theme.primary : theme.border,
                    },
                  ]}
                >
                  {discountType !== null ? (
                    <Ionicons name="checkmark" size={15} color={theme.onPrimary} />
                  ) : null}
                </View>
              </Pressable>
            {discountType ? (
                <View
                  style={[
                    styles.discountEditor,
                    { backgroundColor: theme.background },
                  ]}
                >
                <View
                  accessibilityRole="radiogroup"
                  style={[
                    styles.discountModeSwitch,
                  ]}
                >
                  {(["percentage", "fixed"] as const).map((type) => {
                    const selected = discountType === type;
                    return (
                      <Pressable
                        key={type}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={
                          type === "percentage"
                            ? "Percentage discount"
                            : "Fixed amount discount"
                        }
                        onPress={() => {
                          if (type !== discountType) setDiscountValue("");
                          setDiscountType(type);
                        }}
                        style={[
                          styles.discountMode,
                          {
                            backgroundColor: selected
                              ? theme.primary
                              : theme.backgroundElement,
                            borderColor: selected ? theme.primary : theme.border,
                          },
                        ]}
                      >
                        <View style={styles.discountModeTop}>
                          <View
                            style={[
                              styles.discountModeSymbol,
                              {
                                backgroundColor: selected
                                  ? `${theme.onPrimary}20`
                                  : theme.backgroundSelected,
                              },
                            ]}
                          >
                            <AppText
                              size="small"
                              weight="semibold"
                              numberOfLines={1}
                              style={{
                                color: selected ? theme.onPrimary : theme.primary,
                              }}
                            >
                              {type === "percentage" ? "%" : theme.currency}
                            </AppText>
                          </View>
                          {selected ? (
                            <Ionicons
                              name="checkmark-circle"
                              size={17}
                              color={theme.onPrimary}
                            />
                          ) : null}
                        </View>
                        <AppText
                          size="small"
                          weight="semibold"
                          style={{
                            color: selected ? theme.onPrimary : theme.text,
                          }}
                        >
                          {type === "percentage" ? "Percent" : "Fixed amount"}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
                <View
                  style={[
                    styles.discountAmountField,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <AppText
                    weight="semibold"
                    style={{ color: theme.textSecondary }}
                  >
                    {discountType === "percentage" ? "%" : theme.currency}
                  </AppText>
                  <TextInput
                    accessibilityLabel={
                      discountType === "percentage"
                        ? "Discount percentage"
                        : "Discount amount"
                    }
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={theme.textSecondary}
                    value={discountValue}
                    onChangeText={setDiscountValue}
                    style={[styles.discountAmountInput, { color: theme.text }]}
                  />
                </View>
                <TextInput
                  accessibilityLabel="Discount reason"
                  placeholder="Reason (optional)"
                  placeholderTextColor={theme.textSecondary}
                  value={discountReason}
                  onChangeText={setDiscountReason}
                  maxLength={200}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                />
              </View>
            ) : null}
            <View
              style={[
                styles.saleTotals,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <SummaryLine
                label="Subtotal"
                value={formatCents(subtotalCents, theme.currency)}
              />
              {discountType ? (
                <SummaryLine
                  label="Discount"
                  value={`−${formatCents(discountCents, theme.currency)}`}
                  color={theme.secondary}
                />
              ) : null}
              <View
                style={[
                  styles.saleTotalBanner,
                  {
                    backgroundColor: theme.background,
                    borderLeftColor: theme.primary,
                  },
                  ]}
              >
                <View style={styles.discountToggleCopy}>
                  <AppText size="small" weight="semibold">
                    Sale total
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {lines.length} {lines.length === 1 ? "item" : "items"}
                  </AppText>
                </View>
                <AppText
                  size="heading"
                  weight="semibold"
                  style={{ color: theme.text, textAlign: "right" }}
                >
                  {formatCents(totalCents, theme.currency)}
                </AppText>
              </View>
            </View>
            </Card>
            <Card style={styles.salePaymentCard}>
            <View style={styles.paymentSectionHeader}>
              <View style={styles.paymentSectionTitle}>
                <View
                  style={[
                    styles.discountIcon,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons name="wallet-outline" size={19} color={theme.primary} />
                </View>
                <View style={styles.paymentToggleCopy}>
                  <AppText size="heading" weight="semibold">Payment</AppText>
                  <AppText size="small" tone="secondary">
                    {`${formatCents(paidCents, theme.currency)} received`}
                  </AppText>
                </View>
              </View>
            </View>
            <View
              style={[
                styles.collectPaymentToggle,
                {
                  backgroundColor: theme.backgroundSelected,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.paymentToggleCopy}>
                <AppText weight="semibold">Record payment now</AppText>
              </View>
              <Switch
                accessibilityLabel="Record payment now"
                value={recordPayment}
                onValueChange={(enabled) => {
                  setRecordPayment(enabled);
                  setError(null);
                }}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor={theme.backgroundElement}
              />
            </View>
            {recordPayment ? (
              <>
                {payments.map((payment, index) => (
                  <View
                    key={payment.id}
                    style={[
                      styles.paymentEntry,
                      {
                        backgroundColor: theme.backgroundSelected,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <View style={styles.paymentHeading}>
                      <View style={styles.paymentTitle}>
                        <View
                          style={[
                            styles.paymentNumber,
                            { backgroundColor: `${theme.primary}16` },
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
                        <AppText weight="semibold">
                          {paymentMethods.find(
                            (method) => method.value === payment.method,
                          )?.label ?? "Payment"}
                        </AppText>
                      </View>
                      {payments.length > 1 ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove payment ${index + 1}`}
                          onPress={() =>
                            setPayments((current) =>
                              current.filter((item) => item.id !== payment.id),
                            )
                          }
                        >
                          <Ionicons
                            name="trash-outline"
                            size={18}
                            color={theme.danger}
                          />
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={styles.paymentAmountHeading}>
                      <AppText size="small" tone="secondary">
                        Amount received
                      </AppText>
                      {remainingForFullPayment(payment.id) > 0n ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Fill payment ${index + 1} with the remaining amount to pay the sale in full`}
                          onPress={() => fillPaymentToFull(payment.id)}
                          style={({ pressed }) => [
                            styles.fillPaymentButton,
                            {
                              backgroundColor: pressed
                                ? theme.backgroundSelected
                                : "transparent",
                            },
                          ]}
                        >
                          <Ionicons
                            name="arrow-down-circle-outline"
                            size={16}
                            color={theme.primary}
                          />
                          <AppText
                            size="small"
                            weight="semibold"
                            style={{ color: theme.primary }}
                          >
                            Fill remaining
                          </AppText>
                        </Pressable>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.paymentAmountField,
                        {
                          backgroundColor: theme.backgroundElement,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <AppText
                        size="small"
                        weight="semibold"
                        style={{ color: theme.textSecondary }}
                      >
                        {theme.currency}
                      </AppText>
                      <TextInput
                        accessibilityLabel={`Payment ${index + 1} amount`}
                        keyboardType="decimal-pad"
                        placeholder="Amount received"
                        placeholderTextColor={theme.textSecondary}
                        value={payment.amount}
                        onChangeText={(amount) =>
                          setPayments((current) =>
                            current.map((item) =>
                              item.id === payment.id ? { ...item, amount } : item,
                            ),
                          )
                        }
                        style={[styles.paymentAmountInput, { color: theme.text }]}
                      />
                    </View>
                    <AppText size="small" tone="secondary">
                      Payment method
                    </AppText>
                    <View
                      accessibilityRole="radiogroup"
                      style={styles.paymentMethodsGrid}
                    >
                      {paymentMethods.map((method) => (
                        <PaymentMethodChoice
                          key={method.value}
                          method={method}
                          selected={payment.method === method.value}
                          onPress={() =>
                            setPayments((current) =>
                              current.map((item) =>
                                item.id === payment.id
                                  ? {
                                      ...item,
                                      method: method.value,
                                      ...(method.value !== "mpesa" ||
                                      item.method !== "mpesa"
                                        ? {
                                            reference: "",
                                            smsMessageId: undefined,
                                            date: undefined,
                                            time: undefined,
                                          }
                                        : {}),
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      ))}
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
                            setError(null);
                            setSmsPickerPaymentId(payment.id);
                          }}
                          style={({ pressed }) => [
                            styles.smsPaymentButton,
                            {
                              backgroundColor: pressed
                                ? theme.backgroundSelected
                                : theme.backgroundElement,
                              borderColor: `${theme.primary}70`,
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
                              size={19}
                              color={theme.onPrimary}
                            />
                          </View>
                          <View style={styles.paymentToggleCopy}>
                            <AppText
                              size="small"
                              weight="semibold"
                              style={{ color: theme.text }}
                            >
                              {payment.smsMessageId
                                ? "Change M-Pesa message"
                                : "Paste M-Pesa confirmation"}
                            </AppText>
                            <AppText size="small" tone="secondary">
                              Copy from Messages, then paste
                            </AppText>
                          </View>
                          <View
                            style={[
                              styles.smsPaymentArrow,
                              { backgroundColor: theme.primary },
                            ]}
                          >
                            <Ionicons
                              name="arrow-forward"
                              size={17}
                              color={theme.onPrimary}
                            />
                          </View>
                        </Pressable>
                        {payment.smsMessageId ? (
                          <View
                            style={[
                              styles.smsSelectedBadge,
                              { backgroundColor: theme.backgroundSelected },
                            ]}
                          >
                            <Ionicons
                              name="checkmark-circle"
                              size={16}
                              color={theme.success}
                            />
                            <AppText
                              size="small"
                              tone="secondary"
                              style={styles.smsSelectedText}
                            >
                              Message added · {payment.date}
                              {payment.time ? ` · ${payment.time}` : ""}
                            </AppText>
                          </View>
                        ) : null}
                        {smsImportNativeError ? (
                          <AppText size="small" style={{ color: theme.danger }}>
                            {smsImportNativeError}
                          </AppText>
                        ) : null}
                      </>
                    ) : null}
                    {payment.method !== "cash" ? (
                      <TextInput
                        accessibilityLabel={`Payment ${index + 1} reference number`}
                        placeholder={
                          payment.method === "mpesa"
                            ? "M-Pesa transaction code"
                            : "Reference number (optional)"
                        }
                        placeholderTextColor={theme.textSecondary}
                        value={payment.reference}
                        maxLength={100}
                        onChangeText={(reference) =>
                          setPayments((current) =>
                            current.map((item) =>
                              item.id === payment.id
                                ? { ...item, reference }
                                : item,
                            ),
                          )
                        }
                        style={[
                          styles.input,
                          {
                            backgroundColor: theme.background,
                            borderColor: theme.border,
                            color: theme.text,
                          },
                        ]}
                      />
                    ) : null}
                  </View>
                ))}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add another payment"
                  onPress={() =>
                    setPayments((current) => [...current, newPayment()])
                  }
                  style={({ pressed }) => [
                    styles.addPaymentButton,
                    {
                      backgroundColor: theme.backgroundSelected,
                      borderColor: theme.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.addPaymentIcon,
                      { backgroundColor: theme.primary },
                    ]}
                  >
                    <Ionicons name="add" size={18} color={theme.onPrimary} />
                  </View>
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: theme.text }}
                  >
                    Add another payment
                  </AppText>
                </Pressable>
              </>
            ) : null}
            <View
              style={[
                styles.paymentOutcome,
                {
                  borderColor:
                    creditCents > 0n
                      ? customerId || activeSmsCustomerDraft
                        ? theme.secondary
                        : theme.danger
                      : balanceDueCents > 0n
                        ? theme.danger
                        : theme.success,
                  backgroundColor:
                    creditCents > 0n
                      ? customerId || activeSmsCustomerDraft
                        ? `${theme.secondary}10`
                        : `${theme.danger}0A`
                      : balanceDueCents > 0n
                        ? `${theme.danger}0A`
                        : `${theme.success}10`,
                },
              ]}
            >
              <Ionicons
                name={
                  creditCents > 0n
                    ? "return-down-back-outline"
                    : balanceDueCents > 0n
                      ? "time-outline"
                      : "checkmark-circle-outline"
                }
                size={21}
                color={
                  creditCents > 0n
                    ? customerId || activeSmsCustomerDraft
                      ? theme.secondary
                      : theme.danger
                    : balanceDueCents > 0n
                      ? theme.danger
                      : theme.success
                }
              />
              <View style={styles.flexCopy}>
                <AppText
                  weight="semibold"
                  style={{
                    color:
                      creditCents > 0n
                        ? customerId || activeSmsCustomerDraft
                          ? theme.secondary
                          : theme.danger
                        : balanceDueCents > 0n
                          ? theme.danger
                          : theme.success,
                  }}
                >
                  {creditCents > 0n
                    ? customerId || activeSmsCustomerDraft
                      ? "Customer credit"
                      : "Overpayment"
                    : balanceDueCents > 0n
                      ? "Balance due"
                      : "Paid in full"}
                </AppText>
              </View>
              {creditCents > 0n || balanceDueCents > 0n ? (
                <AppText
                  weight="semibold"
                  style={{
                    color:
                      creditCents > 0n
                        ? customerId || activeSmsCustomerDraft
                          ? theme.secondary
                          : theme.danger
                        : theme.danger,
                    textAlign: "right",
                  }}
                >
                  {formatCents(
                    creditCents > 0n ? creditCents : balanceDueCents,
                    theme.currency,
                  )}
                </AppText>
              ) : null}
            </View>
            <TextInput
              accessibilityLabel="Sale notes"
              placeholder="Sale notes (optional)"
              placeholderTextColor={theme.textSecondary}
              value={notes}
              onChangeText={setNotes}
              multiline
              style={[
                styles.input,
                styles.notesInput,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
            />
          </Card>
          </Animated.View>
          </>
          ) : null}

          {step === 3 ? (
            <Animated.View
              key={step}
              entering={FadeInDown.duration(220)}
              style={styles.reviewContent}
            >
              <SectionTitle number="4" title="Review the sale" />
              <View
                style={[
                  styles.reviewTotal,
                  {
                    backgroundColor: theme.backgroundSelected,
                    borderLeftColor: theme.primary,
                  },
                ]}
              >
                <View style={styles.flexCopy}>
                  <AppText size="small" weight="semibold" tone="secondary">
                    SALE TOTAL
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {lines.length} {lines.length === 1 ? "item" : "items"}
                    {discountCents > 0n ? " · discount applied" : ""}
                  </AppText>
                </View>
                <AppText
                  size="heading"
                  weight="semibold"
                  style={{ color: theme.text, textAlign: "right" }}
                >
                  {formatCents(totalCents, theme.currency)}
                </AppText>
              </View>
              <Card style={styles.reviewCard}>
                <View style={styles.reviewInfoRow}>
                  <View
                    style={[
                      styles.reviewIcon,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <Ionicons name="person-outline" size={19} color={theme.primary} />
                  </View>
                  <View style={styles.flexCopy}>
                    <AppText weight="semibold">
                      {selectedCustomer?.name ??
                        activeSmsCustomerDraft?.name ??
                        "Walk-in sale"}
                    </AppText>
                    <AppText size="small" tone="secondary">
                      {selectedCustomer?.phone ??
                        activeSmsCustomerDraft?.phone ??
                        "No customer selected"}
                    </AppText>
                  </View>
                  {activeSmsCustomerDraft && !selectedCustomer ? (
                    <View
                      style={[
                        styles.reviewSourceBadge,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <AppText
                        size="small"
                        weight="semibold"
                        style={{ color: theme.primary }}
                      >
                        M-Pesa
                      </AppText>
                    </View>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.reviewInfoRow,
                    {
                      borderTopColor: theme.border,
                      borderTopWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.reviewIcon,
                      { backgroundColor: theme.backgroundSelected },
                    ]}
                  >
                    <Ionicons name="calendar-outline" size={19} color={theme.primary} />
                  </View>
                  <View style={styles.flexCopy}>
                    <AppText size="small" weight="semibold">
                      Sale date
                    </AppText>
                    <AppText size="small" tone="secondary">
                      {effectiveTransactionDate}
                      {includeTransactionTime ? ` · ${effectiveTransactionTime}` : ""}
                    </AppText>
                  </View>
                </View>
              </Card>
              <Card style={styles.reviewCard}>
                <View style={styles.reviewSectionHeading}>
                  <AppText weight="semibold">Items</AppText>
                  <AppText size="small" tone="secondary">
                    {lines.length} {lines.length === 1 ? "line" : "lines"}
                  </AppText>
                </View>
                {lines.map((line, index) => {
                  const product = saleProducts.find(
                    (item) => item.id === selectedProductId(line),
                  );
                  return (
                    <View
                      key={line.id}
                      style={[
                        styles.reviewItemRow,
                        index > 0 && {
                          borderTopColor: theme.border,
                          borderTopWidth: StyleSheet.hairlineWidth,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.reviewItemNumber,
                          { backgroundColor: theme.backgroundSelected },
                        ]}
                      >
                        <AppText
                          size="small"
                          weight="semibold"
                          style={{ color: theme.primary }}
                        >
                          {String(index + 1).padStart(2, "0")}
                        </AppText>
                      </View>
                      <View style={styles.flexCopy}>
                        <AppText weight="semibold" numberOfLines={1}>
                          {product?.name ?? "Chickens"}
                        </AppText>
                        <AppText size="small" tone="secondary">
                          {line.chickenType
                            ? `${chickenTypeLabel(line.chickenType)} · ${formatChickenCount(lineTotals[index].quantity)} birds × ${formatCents(lineTotals[index].unitPriceCents ?? 0n, theme.currency)}`
                            : "Chicken type not selected"}
                        </AppText>
                      </View>
                      <AppText weight="semibold" style={styles.reviewItemAmount}>
                        {formatCents(lineTotals[index].totalCents, theme.currency)}
                      </AppText>
                    </View>
                  );
                })}
                <View style={[styles.reviewTotals, { borderTopColor: theme.border }]}>
                  <SummaryLine
                    label="Subtotal"
                    value={formatCents(subtotalCents, theme.currency)}
                  />
                  {discountType ? (
                    <SummaryLine
                      label="Discount"
                      value={`−${formatCents(discountCents, theme.currency)}`}
                      color={theme.secondary}
                    />
                  ) : null}
                </View>
              </Card>
              <Card style={styles.reviewCard}>
                <View style={styles.reviewSectionHeading}>
                  <View style={styles.paymentSectionTitle}>
                    <View
                      style={[
                        styles.reviewIcon,
                        { backgroundColor: theme.backgroundSelected },
                      ]}
                    >
                      <Ionicons name="wallet-outline" size={19} color={theme.primary} />
                    </View>
                    <View style={styles.flexCopy}>
                      <AppText weight="semibold">Payment</AppText>
                      <AppText size="small" tone="secondary">
                        {recordPayment ? "Recorded with this sale" : "Not recorded yet"}
                      </AppText>
                    </View>
                  </View>
                </View>
                {recordPayment
                  ? payments.map((payment, index) => {
                      const method = paymentMethods.find(
                        (candidate) => candidate.value === payment.method,
                      );
                      return (
                        <View key={payment.id} style={styles.reviewPaymentRow}>
                          <Ionicons
                            name={method?.icon ?? "wallet-outline"}
                            size={18}
                            color={theme.primary}
                          />
                          <View style={styles.flexCopy}>
                            <AppText size="small" weight="semibold">
                              {method?.label ?? `Payment ${index + 1}`}
                            </AppText>
                            {payment.reference ? (
                              <AppText size="small" tone="secondary">
                                {payment.reference}
                              </AppText>
                            ) : null}
                          </View>
                          <AppText size="small" weight="semibold">
                            {formatCents(
                              parseMoneyToCents(payment.amount) ?? 0n,
                              theme.currency,
                            )}
                          </AppText>
                        </View>
                      );
                    })
                  : null}
                {(balanceDueCents > 0n || creditCents > 0n) &&
                !customerId &&
                !activeSmsCustomerDraft ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setError(null);
                        setStep(0);
                      }}
                      style={({ pressed }) => [
                        styles.reviewCustomerAction,
                        {
                          backgroundColor: theme.backgroundSelected,
                          borderColor: `${theme.primary}55`,
                          opacity: pressed ? 0.75 : 1,
                        },
                      ]}
                    >
                      <Ionicons
                        name="person-add-outline"
                        size={19}
                        color={theme.primary}
                      />
                      <AppText
                        size="small"
                        weight="semibold"
                        style={styles.flexCopy}
                      >
                        {creditCents > 0n
                          ? "Choose a customer for the overpayment"
                          : "Choose a customer to track the balance"}
                      </AppText>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={theme.primary}
                      />
                    </Pressable>
                ) : null}
                <View style={[styles.reviewTotals, { borderTopColor: theme.border }]}>
                  <SummaryLine
                    label="Paid now"
                    value={formatCents(paidCents, theme.currency)}
                    color={theme.success}
                  />
                  <SummaryLine
                    label={
                      creditCents > 0n
                        ? customerId || activeSmsCustomerDraft
                          ? "Customer credit"
                          : "Overpayment"
                        : "Balance due"
                    }
                    value={formatCents(
                      creditCents > 0n ? creditCents : balanceDueCents,
                      theme.currency,
                    )}
                    color={
                      creditCents > 0n
                        ? customerId || activeSmsCustomerDraft
                          ? theme.success
                          : theme.danger
                        : balanceDueCents === 0n
                          ? theme.success
                          : theme.danger
                    }
                    strong
                  />
                </View>
              </Card>
              {saleFollowUpAmountCents > 0n &&
              (creditCents === 0n || Boolean(customerId || activeSmsCustomerDraft)) ? (
                <View
                  style={[
                    styles.balanceReminderCard,
                    {
                      borderColor: scheduleSaleFollowUp ? theme.primary : theme.border,
                      backgroundColor: scheduleSaleFollowUp
                        ? `${theme.primary}0A`
                        : theme.backgroundElement,
                    },
                  ]}
                >
                  <View style={styles.balanceReminderHeading}>
                    <View
                      style={[
                        styles.reminderIcon,
                        { backgroundColor: `${theme.primary}1A` },
                      ]}
                    >
                      <Ionicons
                        name="notifications-outline"
                        size={20}
                        color={theme.primary}
                      />
                    </View>
                    <View style={styles.flexCopy}>
                      <AppText weight="semibold">
                        {creditCents > 0n
                          ? "Settle the customer overpayment"
                          : "Follow up on the unpaid balance"}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        {creditCents > 0n
                          ? `Remind yourself to settle ${formatCents(creditCents, theme.currency)} owed to ${selectedCustomer?.name ?? activeSmsCustomerDraft?.name ?? "the buyer"}.`
                          : selectedCustomer
                            ? `Remind yourself to ask ${selectedCustomer.name} for ${formatCents(balanceDueCents, theme.currency)}.`
                            : activeSmsCustomerDraft
                              ? `Remind yourself to ask ${activeSmsCustomerDraft.name} for ${formatCents(balanceDueCents, theme.currency)}.`
                            : `Remind yourself to follow up on ${formatCents(balanceDueCents, theme.currency)} from this walk-in sale.`}
                      </AppText>
                    </View>
                    <Switch
                      accessibilityLabel={
                        creditCents > 0n
                          ? "Set a reminder to settle the customer overpayment"
                          : selectedCustomer || activeSmsCustomerDraft
                            ? "Set a reminder to ask the buyer for the balance"
                            : "Set a reminder to follow up on the walk-in sale balance"
                      }
                      value={scheduleSaleFollowUp}
                      onValueChange={setScheduleSaleFollowUp}
                      trackColor={{ false: theme.border, true: theme.primary }}
                      thumbColor={theme.backgroundElement}
                    />
                  </View>
                  {scheduleSaleFollowUp ? (
                    <View style={styles.reminderSchedule}>
                      <AppText size="small" tone="secondary">
                        We’ll remind you in FarmTrack. A device push will be used
                        when available; otherwise the reminder stays in-app.
                      </AppText>
                      <DatePickerField
                        label="Remind me on"
                        value={effectiveReminderDueDate}
                        onChange={setReminderDueDate}
                        minimumDate={parseCalendarDate(farmToday(timezone))}
                      />
                      <TimePickerField
                        label="Reminder time (farm local time)"
                        value={reminderDueTime}
                        onChange={setReminderDueTime}
                        minimumTime={
                          effectiveReminderDueDate === farmToday(timezone)
                            ? farmTimeNow(timezone)
                            : undefined
                        }
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}
              {notes.trim() ? (
                <Card style={styles.reviewCard}>
                  <AppText weight="semibold">Sale notes</AppText>
                  <AppText size="small" tone="secondary">
                    {notes.trim()}
                  </AppText>
                </Card>
              ) : null}
              <View
                style={[
                  styles.deliveryNote,
                  {
                    backgroundColor: `${theme.primary}0A`,
                    borderColor: `${theme.primary}35`,
                  },
                ]}
              >
                <Ionicons name="cube-outline" size={22} color={theme.primary} />
                <View style={styles.flexCopy}>
                  <AppText weight="semibold">Delivery comes next</AppText>
                  <AppText size="small" tone="secondary">
                    Record delivered birds from the sale details after saving.
                  </AppText>
                </View>
              </View>
            </Animated.View>
          ) : null}

          {error ? (
            <Card style={[styles.errorCard, { borderColor: theme.danger }]}>
              <AppText size="small" style={{ color: theme.danger }}>
                {error}
              </AppText>
            </Card>
          ) : null}
          <View style={styles.stepActions}>
            {step > 0 ? (
              <Button
                label="Back"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => {
                  setError(null);
                  setStep((current) => current - 1);
                }}
              />
            ) : null}
            {step < 3 ? (
              <Button
                label={step === 2 ? "Review sale" : "Continue"}
                style={{ flex: 1 }}
                onPress={() => {
                  setError(null);
                  if (step > 0) {
                    const result = validateAndBuildPayload();
                    if ("error" in result) {
                      setError(result.error);
                      const validationError = result.error.toLowerCase();
                      if (
                        validationError.includes("reminder")
                      ) {
                        setStep(3);
                      } else if (
                        validationError.includes("customer") ||
                        validationError.includes("sale date")
                      ) {
                        setStep(0);
                      } else if (
                        validationError.includes("payment") ||
                        validationError.includes("discount")
                      ) {
                        setStep(2);
                      }
                      return;
                    }
                  }
                  setStep((current) => current + 1);
                }}
              />
            ) : (
              <Button
                label="Record sale order"
                style={{ flex: 1 }}
                loading={createSale.isPending || isResolvingSmsCustomer}
                disabled={options.isError || !options.data}
                onPress={() => void submitSale()}
              />
            )}
          </View>
            </>
          ) : null}
        </ScrollView>
        {smsPickerPaymentId ? (
          <SmsPaymentPicker
            key={smsPickerPaymentId}
            visible
            fromDate={effectiveTransactionDate}
            currency={theme.currency}
            existingReferences={payments.flatMap((payment) =>
              payment.id !== smsPickerPaymentId &&
              payment.method === "mpesa" &&
              payment.reference.trim()
                ? [payment.reference.trim()]
                : [],
            )}
            existingSmsMessageIds={[]}
            excludedSmsMessageIds={payments.flatMap((payment) =>
              payment.smsMessageId
                ? [payment.smsMessageId]
                : [],
            )}
            maxSelections={10}
            hasExistingPayments={payments.some(
              (payment) =>
                (payment.amount.trim() || payment.reference.trim()),
            )}
            selectIntoExistingPayment
            transactionLabel="sale"
            expectedDirection="INCOMING"
            overpaymentMessage="The amount above the sale total becomes customer credit."
            purchaseTotalCents={totalCents.toString()}
            currentPaidCents={payments
              .filter((payment) => payment.id !== smsPickerPaymentId)
              .reduce(
                (sum, payment) =>
                  sum + (parseMoneyToCents(payment.amount) ?? 0n),
                0n,
              )
              .toString()}
            sharedMessage={sharedMessage}
            onClose={() => setSmsPickerPaymentId(null)}
            onSelect={(selected) => applySmsPayment(selected)}
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryLine({
  label,
  value,
  color,
  strong = false,
}: {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.summaryLine}>
      <AppText
        size="small"
        weight={strong ? "semibold" : "regular"}
        tone={color ? undefined : "secondary"}
        style={color ? { color } : undefined}
      >
        {label}
      </AppText>
      <AppText
        size="small"
        weight={strong ? "semibold" : "regular"}
        style={{ color: color ?? theme.text }}
      >
        {value}
      </AppText>
    </View>
  );
}

function PaymentMethodChoice({
  method,
  selected,
  onPress,
}: {
  method: (typeof paymentMethods)[number];
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={method.label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.paymentMethodOption,
        {
          backgroundColor: selected
            ? theme.primary
            : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <Ionicons
        name={method.icon}
        size={19}
        color={selected ? theme.onPrimary : theme.textSecondary}
      />
      <AppText
        size="small"
        weight={selected ? "semibold" : "regular"}
        numberOfLines={1}
        style={{ color: selected ? theme.onPrimary : theme.text }}
      >
        {method.label}
      </AppText>
      {selected ? (
        <Ionicons name="checkmark-circle" size={16} color={theme.onPrimary} />
      ) : null}
    </Pressable>
  );
}

function SaleDropdown<Value extends string>({
  label,
  placeholder,
  icon,
  value,
  options,
  searchable = false,
  onChange,
}: {
  label: string;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: Value | "";
  options: readonly SaleDropdownOption<Value>[];
  searchable?: boolean;
  onChange: (value: Value) => void;
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

  return (
    <View style={styles.saleDropdownField}>
      <AppText size="small" weight="semibold">
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedOption?.label ?? placeholder}`}
        accessibilityState={{ expanded: visible }}
        onPress={openSelector}
        style={({ pressed }) => [
          styles.saleDropdownTrigger,
          {
            backgroundColor: pressed
              ? theme.backgroundSelected
              : theme.backgroundElement,
            borderColor: visible ? theme.primary : theme.border,
          },
        ]}
      >
        <View
          style={[
            styles.saleDropdownIcon,
            { backgroundColor: `${theme.primary}18` },
          ]}
        >
          <Ionicons name={icon} size={19} color={theme.primary} />
        </View>
        <AppText
          size="body"
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

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.saleDropdownModalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close ${label.toLowerCase()} selector`}
            onPress={() => setVisible(false)}
            style={styles.saleDropdownScrim}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={[
              styles.saleDropdownSheet,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <View
              style={[
                styles.saleDropdownHandle,
                { backgroundColor: theme.border },
              ]}
            />
            <View style={styles.saleDropdownHeader}>
              <View style={styles.flexCopy}>
                <AppText size="heading" weight="semibold">
                  {label}
                </AppText>
                <AppText size="small" tone="secondary">
                  Select one option for this sale item.
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Close ${label.toLowerCase()} selector`}
                hitSlop={8}
                onPress={() => setVisible(false)}
                style={styles.saleDropdownClose}
              >
                <Ionicons name="close" size={22} color={theme.text} />
              </Pressable>
            </View>
            {searchable ? (
              <View
                style={[
                  styles.saleDropdownSearch,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Ionicons
                  name="search-outline"
                  size={18}
                  color={theme.textSecondary}
                />
                <TextInput
                  accessibilityLabel={`Search ${label.toLowerCase()}`}
                  placeholder={`Search ${label.toLowerCase()}`}
                  placeholderTextColor={theme.textSecondary}
                  value={search}
                  onChangeText={setSearch}
                  returnKeyType="search"
                  style={[styles.saleDropdownSearchInput, { color: theme.text }]}
                />
              </View>
            ) : null}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.saleDropdownOptions}
            >
              {filteredOptions.map((option) => {
                const selected = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onChange(option.value);
                      setVisible(false);
                    }}
                    style={({ pressed }) => [
                      styles.saleDropdownOption,
                      {
                        backgroundColor: selected
                          ? `${theme.primary}12`
                          : pressed
                            ? theme.background
                            : "transparent",
                        borderColor: selected ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <AppText
                      weight={selected ? "semibold" : "regular"}
                      style={{
                        flex: 1,
                        color: selected ? theme.primary : theme.text,
                      }}
                    >
                      {option.label}
                    </AppText>
                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
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
                  style={styles.saleDropdownEmpty}
                >
                  {options.length === 0
                    ? "No chicken products are available yet."
                    : "No matching options."}
                </AppText>
              ) : null}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <View style={[styles.stepBadge, { backgroundColor: `${theme.primary}1A` }]}>
        <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
          {number}
        </AppText>
      </View>
      <AppText size="heading" weight="semibold">
        {title}
      </AppText>
    </View>
  );
}

function StepProgress({ step }: { step: number }) {
  const { theme } = useTheme();
  const titles = ["Customer", "Birds & price", "Discount & payment", "Review"];
  return (
    <View
      accessibilityLabel={`Step ${step + 1} of ${titles.length}: ${titles[step]}`}
      style={[
        styles.stepProgress,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <View style={styles.stepProgressHeading}>
        <AppText size="small" weight="semibold">
          Step {step + 1} of {titles.length}
        </AppText>
        <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
          {titles[step]}
        </AppText>
      </View>
      <View style={styles.stepTrack}>
        {titles.map((title, index) => (
          <View
            key={title}
            style={[
              styles.stepSegment,
              { backgroundColor: index <= step ? theme.primary : theme.border },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 36,
    gap: 16,
  },
  section: { gap: 12 },
  stepContent: { gap: 14, paddingBottom: 8 },
  salePricingCard: { gap: 14, padding: 15 },
  salePaymentCard: { gap: 14, padding: 15 },
  reviewContent: { gap: 14, paddingBottom: 8 },
  reviewCard: { gap: 12, padding: 14 },
  reviewTotal: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 14,
    borderLeftWidth: 4,
  },
  reviewInfoRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 7,
  },
  reviewIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  reviewSourceBadge: {
    minHeight: 28,
    justifyContent: "center",
    paddingHorizontal: 9,
    borderRadius: 14,
  },
  reviewSectionHeading: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  reviewItemRow: {
    minHeight: 65,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  reviewItemNumber: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  reviewItemAmount: { textAlign: "right" },
  reviewTotals: {
    gap: 8,
    paddingTop: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reviewPaymentRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  reviewCustomerAction: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 11,
  },
  stepProgress: {
    gap: 9,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  stepProgressHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepTrack: { flexDirection: "row", gap: 5 },
  stepSegment: { flex: 1, height: 4, borderRadius: 2 },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: 9 },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  saleDropdownField: { gap: 7 },
  saleDropdownTrigger: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 11,
  },
  saleDropdownIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  saleDropdownModalRoot: { flex: 1, justifyContent: "flex-end" },
  saleDropdownScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.46)",
  },
  saleDropdownSheet: {
    maxHeight: "78%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  saleDropdownHandle: {
    width: 38,
    height: 4,
    alignSelf: "center",
    borderRadius: 2,
    marginBottom: 16,
  },
  saleDropdownHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingBottom: 15,
  },
  saleDropdownClose: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  saleDropdownSearch: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  saleDropdownSearchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingVertical: 8,
  },
  saleDropdownOptions: { gap: 8, paddingTop: 12, paddingBottom: 20 },
  saleDropdownOption: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderRadius: 10,
  },
  saleDropdownEmpty: {
    paddingVertical: 24,
    textAlign: "center",
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  formField: { gap: 7 },
  customerPickerHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  customerPickerCopy: { flex: 1, minWidth: 0, gap: 3 },
  customerSearchBox: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
  },
  customerSearchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingVertical: 8,
  },
  customerSearchState: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  customerResults: {
    maxHeight: 248,
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  loadMoreCustomers: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  customerResult: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  customerResultIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  customerResultCopy: { flex: 1, minWidth: 0, gap: 2 },
  addNewCustomerButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 9,
  },
  newCustomerForm: {
    gap: 10,
    padding: 12,
    borderRadius: 10,
  },
  createCustomerButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  optionalFieldsToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 38,
  },
  optionalFields: { gap: 10 },
  dateTimeCard: {
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  flexCopy: { flex: 1, minWidth: 0, gap: 3 },
  selectedCustomerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 12,
    borderWidth: 1,
    borderRadius: 11,
  },
  selectedCustomerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedCustomerCopy: { flex: 1, minWidth: 0, gap: 2 },
  changeCustomerButton: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  walkInOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderWidth: 1,
    borderRadius: 10,
  },
  walkInRadio: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  walkInRadioSelected: { width: 10, height: 10, borderRadius: 5 },
  stepActions: { flexDirection: "row", gap: 10 },
  addSaleItemButton: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderRadius: 13,
  },
  addSaleItemIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  addSaleItemLabel: { flex: 1 },
  saleLine: { gap: 11 },
  lineTotal: {
    minHeight: 58,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 11,
  },
  lineHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  blockCard: {
    gap: 0,
    padding: 10,
    borderWidth: 1,
    borderRadius: 11,
  },
  blockHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
  },
  blockTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flex: 1,
    minWidth: 0,
  },
  blockIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  blockNameGroup: { flex: 1, gap: 2 },
  blockSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    flexShrink: 0,
  },
  blockMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
    paddingLeft: 43,
    paddingBottom: 3,
  },
  stockPill: {
    minHeight: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  batchStock: {
    gap: 8,
    padding: 9,
    marginTop: 8,
    borderTopWidth: 1,
    borderWidth: 1,
    borderRadius: 9,
  },
  batchSelect: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  batchCheck: {
    width: 19,
    height: 19,
    borderWidth: 1,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  batchDescription: { flex: 1, minWidth: 0, gap: 2 },
  batchIndicators: {
    alignItems: "flex-end",
    gap: 5,
  },
  summary: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 8,
  },
  discountToggle: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 13,
  },
  discountHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  discountToggleIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  checkboxMark: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 7,
  },
  discountEditor: {
    gap: 12,
    padding: 12,
    borderRadius: 13,
  },
  discountIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  discountToggleCopy: { flex: 1, minWidth: 0, gap: 3 },
  discountModeSwitch: {
    flexDirection: "row",
    gap: 8,
  },
  discountMode: {
    flex: 1,
    minHeight: 76,
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  discountModeTop: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  discountModeSymbol: {
    minWidth: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  discountAmountField: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 11,
  },
  discountAmountInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    paddingVertical: 8,
    fontSize: 18,
  },
  saleTotalBanner: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 14,
    borderLeftWidth: 3,
  },
  saleTotals: { gap: 8, padding: 12, borderRadius: 14 },
  collectPaymentToggle: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: 13,
  },
  paymentSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  paymentSectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  smsPaymentButton: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 13,
  },
  smsPaymentIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  smsPaymentArrow: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  smsSelectedBadge: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 9,
    borderRadius: 9,
  },
  smsSelectedText: { flex: 1, minWidth: 0 },
  paymentMethodsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  paymentMethodOption: {
    flexGrow: 1,
    flexBasis: "40%",
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 11,
  },
  paymentOutcome: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderRadius: 13,
  },
  summaryLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  paymentToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  paymentToggleCopy: { flex: 1, gap: 2 },
  paymentEntry: {
    gap: 10,
    padding: 13,
    borderWidth: 0,
    borderRadius: 14,
  },
  paymentTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  paymentNumber: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  paymentAmountField: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  paymentAmountInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingVertical: 8,
    fontSize: 16,
  },
  paymentAmountHeading: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  addPaymentButton: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  addPaymentIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  fillPaymentButton: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 8,
    paddingHorizontal: 7,
  },
  paymentHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  notesInput: { minHeight: 58, textAlignVertical: "top" },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  reviewLine: { gap: 6, paddingVertical: 9, borderBottomWidth: 1 },
  deliveryNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  balanceReminderCard: {
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  emptyProductsCard: {
    gap: 10,
    alignItems: "flex-start",
    padding: 16,
  },
  emptyProductsIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  balanceReminderHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reminderIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  reminderSchedule: { gap: 10 },
  errorCard: { borderWidth: 1, gap: 8 },
});
