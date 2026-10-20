import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
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
import type { Contact } from "@/features/management/api";
import {
  useCreateContact,
  useSearchCustomers,
} from "@/features/management/hooks";
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
};

type SaleCompletion = {
  id: string;
  referenceNumber: string | null;
  totalCents: bigint;
  paidCents: bigint;
  balanceDueCents: bigint;
  creditCents: bigint;
  saleDate: string;
  customerName: string;
  itemSummaries: { label: string; amount: string }[];
  paymentSummaries: { label: string; amount: string }[];
  reminderMessage: string;
};

const paymentMethods = [
  { label: "Cash", value: "cash" },
  { label: "M-Pesa", value: "mpesa" },
  { label: "Bank transfer", value: "bank_transfer" },
  { label: "Card", value: "card" },
  { label: "Other", value: "other" },
] as const;

const MAX_MONEY_CENTS = 999_999_999_999n;

function newLine(unitId: string): SaleLine {
  return {
    id: `${Date.now()}-${Math.random()}`,
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

  const [stage, setStage] = useState<"edit" | "review" | "success">("edit");
  const [step, setStep] = useState(0);
  const [productId, setProductId] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [saleDate, setSaleDate] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState("");
  const [customer, setCustomer] = useState<Contact | null>(null);
  const createContact = useCreateContact(user?.id ?? "", farmId);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [customerError, setCustomerError] = useState("");
  const [recordPayment, setRecordPayment] = useState(false);
  const [payments, setPayments] = useState<PaymentDraft[]>([newPayment()]);
  const [scheduleSaleFollowUp, setScheduleSaleFollowUp] = useState(false);
  const [reminderDueDate, setReminderDueDate] = useState<string | null>(null);
  const [reminderDueTime, setReminderDueTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [completion, setCompletion] = useState<SaleCompletion | null>(null);
  const [referenceCopied, setReferenceCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedCustomerSearch(customerSearch.trim()),
      250,
    );
    return () => clearTimeout(timeout);
  }, [customerSearch]);

  const customerSearchQuery = useSearchCustomers(
    user?.id,
    farm.selectedFarm?.id,
    debouncedCustomerSearch,
  );
  const product = inStockProducts.find((item) => item.id === productId) ?? null;
  const availableQuantity = Number(
    product?.available_quantity_in_base_unit ?? 0,
  );
  const baseUnit = product?.units.find((unit) => unit.is_base_unit);
  const requestedBaseMicro = lines.reduce((total, line) => {
    const selectedUnit = product?.units.find((unit) => unit.id === line.unitId);
    const quantity = quantityMilli(line.quantity);
    const factor = selectedUnit
      ? quantityMilli(String(selectedUnit.conversion_factor))
      : null;
    return quantity !== null && factor !== null
      ? total + quantity * factor
      : total;
  }, 0n);
  const requestedBaseQuantity = Number(requestedBaseMicro) / 1_000_000;
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
  const effectiveSaleDate = saleDate || farmToday(timezone);
  const effectiveReminderDueDate =
    reminderDueDate ?? addFarmDays(farmToday(timezone), 1);
  const currency = farm.selectedFarm?.settings?.currency ?? "KES";

  function selectProduct(nextProduct: EggCollectionProduct) {
    setProductId(nextProduct.id);
    setLines([
      newLine(
        nextProduct.units.find((unit) => unit.is_base_unit)?.id ??
          nextProduct.units[0]?.id ??
          "",
      ),
    ]);
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
      if (!product) {
        nextErrors.product = "Choose the egg product you are selling.";
      } else {
        if (lines.length === 0) {
          nextErrors.product = "Add at least one unit line to this sale.";
        }
        for (const [index, line] of lines.entries()) {
          const quantity = quantityMilli(line.quantity);
          const unit = product.units.find((entry) => entry.id === line.unitId);
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
          const availableMilli = quantityMilli(
            String(product.available_quantity_in_base_unit),
          );
          if (availableMilli === null) {
            nextErrors.stock =
              "Current stock could not be verified. Refresh the stock options and try again.";
          } else if (requestedBaseMicro > availableMilli * 1000n) {
            const requested = formatQuantity(
              requestedBaseQuantity,
              baseUnit?.abbreviation ?? "base units",
            );
            const available = formatQuantity(
              availableQuantity,
              baseUnit?.abbreviation ?? "base units",
            );
            nextErrors.stock = `This sale uses ${requested} but only ${available} are available. Reduce one or more unit-line quantities.`;
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
    } else if (targetStep === 2) {
      if (recordPayment) {
        for (const [index, payment] of payments.entries()) {
          const amount = salePriceCents(payment.amount);
          if (amount === null || amount <= 0n || amount > MAX_MONEY_CENTS) {
            nextErrors[`payment:${payment.id}`] =
              `Enter a valid amount greater than zero for payment ${index + 1} (up to 2 decimal places).`;
          }
        }
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
            : null;
      const focusKey =
        inputKey ??
        (firstError === "stock" && lines.length
          ? `quantity:${lines[lines.length - 1].id}`
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
    if (!product) {
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
    const payload: EggSaleInput = {
      transaction_date: effectiveSaleDate,
      contact_id: customer?.id,
      notes: notes.trim() || undefined,
      items: lines.map((line) => ({
        product_id: product.id,
        unit_id: line.unitId,
        quantity: line.quantity.trim(),
        unit_price: centsToDecimal(salePriceCents(line.unitPrice) ?? 0n),
      })),
      payments: recordPayment
        ? payments.map((payment) => ({
            amount: centsToDecimal(salePriceCents(payment.amount) ?? 0n),
            payment_date: effectiveSaleDate,
            payment_method: payment.method,
            reference_number: payment.reference.trim() || undefined,
          }))
        : [],
    };
    if (creditCents > 0n) {
      const confirmed = await dialog.confirmDialog({
        title: "Payments exceed sale total",
        message: `The sale total is ${formatCurrency(totalCents, currency)}, but the payments add up to ${formatCurrency(paidCents, currency)}. ${formatCurrency(creditCents, currency)} will be recorded as ${customer ? `${customer.name}’s` : "walk-in customer"} credit. No refund will be issued.`,
        tone: "info",
        cancelLabel: "Review payments",
        confirmLabel: "Confirm customer credit",
      });
      if (!confirmed) return;
    }
    try {
      const result = await createSale.mutateAsync(payload);
      const savedBalanceDue =
        parseMoneyToCents(String(result.balance_due)) ?? balanceDueCents;
      const savedCredit =
        parseMoneyToCents(String(result.credit_balance)) ?? creditCents;
      const savedPaid =
        parseMoneyToCents(String(result.amount_paid)) ?? paidCents;
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
          const buyerName = customer?.name ?? "the buyer";
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
      setCompletion({
        id: result.id,
        referenceNumber: result.reference_number,
        totalCents,
        paidCents: savedPaid,
        balanceDueCents: savedBalanceDue,
        creditCents: savedCredit,
        saleDate: effectiveSaleDate,
        customerName: customer?.name ?? "Walk-in customer",
        itemSummaries: lines.map((line) => {
          const unit = product.units.find((item) => item.id === line.unitId);
          return {
            label: `${line.quantity} ${unit?.abbreviation ?? "unit"} × ${formatCurrency(salePriceCents(line.unitPrice) ?? 0n, currency)}`,
            amount: formatCurrency(lineTotalCents(line) ?? 0n, currency),
          };
        }),
        paymentSummaries: recordPayment
          ? payments.map((payment, index) => ({
              label: `Payment ${index + 1} · ${paymentMethods.find((method) => method.value === payment.method)?.label ?? "Payment"}${payment.reference.trim() ? ` · ${payment.reference.trim()}` : ""}`,
              amount: formatCurrency(
                salePriceCents(payment.amount) ?? 0n,
                currency,
              ),
            }))
          : [],
        reminderMessage,
      });
      setReferenceCopied(false);
      setCopyError("");
      setStage("success");
    } catch (submitError: unknown) {
      setStage("edit");
      setStep(0);
      const message = normalizeApiError(submitError).message;
      if (/not enough|available|stock|inventory/i.test(message)) {
        const refreshed = await options.refetch();
        const latestProduct =
          refreshed.data?.products.find((item) => item.id === product.id) ??
          options.data?.products.find((item) => item.id === product.id);
        const latestAvailable = Number(
          latestProduct?.available_quantity_in_base_unit ??
            product.available_quantity_in_base_unit,
        );
        const latestBaseUnit = latestProduct?.units.find(
          (unit) => unit.is_base_unit,
        );
        const stockMessage = latestProduct
          ? `Stock changed before the sale could be saved. The latest available amount is ${formatQuantity(latestAvailable, latestBaseUnit?.abbreviation ?? "base units")}; this sale requests ${formatQuantity(requestedBaseQuantity, baseUnit?.abbreviation ?? "base units")}. Reduce one or more quantities and try again.`
          : friendlySaleError(message);
        setFieldErrors({
          stock: stockMessage,
        });
        setError("");
        const lastLine = lines[lines.length - 1];
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

  async function copySaleReference() {
    if (!completion) return;
    try {
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(
        completion.referenceNumber ?? completion.id,
      );
      setReferenceCopied(true);
      setCopyError("");
    } catch (clipboardError: unknown) {
      setReferenceCopied(false);
      setCopyError(
        `Could not copy the reference. ${normalizeApiError(clipboardError).message}`,
      );
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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <FarmPageHeader
            title={
              stage === "success"
                ? "Sale recorded"
                : stage === "edit"
                  ? "Sell eggs"
                  : "Review egg sale"
            }
            showBack
            backHref="/(tabs)/eggs"
          />

          {stage !== "success" && options.isError ? (
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

          {stage !== "success" &&
          !options.isError &&
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

          {stage !== "success" &&
          !options.isError &&
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

          {stage === "success" && completion ? (
            <View style={styles.successContent}>
              <Card style={styles.successHero}>
                <View
                  style={[
                    styles.successIcon,
                    { backgroundColor: `${theme.success}18` },
                  ]}
                >
                  <Ionicons name="checkmark" size={30} color={theme.success} />
                </View>
                <AppText size="heading" weight="semibold">
                  Egg sale recorded
                </AppText>
                <AppText size="small" tone="secondary">
                  The sale and inventory update are complete.
                </AppText>
              </Card>

              <Card style={styles.card}>
                <AppText weight="semibold">
                  {completion.referenceNumber
                    ? "Transaction reference"
                    : "Transaction ID"}
                </AppText>
                <View style={styles.referenceRow}>
                  <AppText
                    size="heading"
                    weight="semibold"
                    style={styles.referenceValue}
                    selectable
                  >
                    {completion.referenceNumber ?? completion.id}
                  </AppText>
                  <Button
                    label={referenceCopied ? "Copied" : "Copy"}
                    variant="secondary"
                    onPress={() => void copySaleReference()}
                  />
                </View>
                {copyError ? (
                  <AppText size="small" style={{ color: theme.danger }}>
                    {copyError}
                  </AppText>
                ) : null}
              </Card>

              <Card style={styles.card}>
                <AppText weight="semibold">Sale details</AppText>
                {completion.itemSummaries.map((item, index) => (
                  <View
                    key={`${item.label}-${index}`}
                    style={styles.summaryRow}
                  >
                    <AppText size="small" tone="secondary">
                      {item.label}
                    </AppText>
                    <AppText size="small">{item.amount}</AppText>
                  </View>
                ))}
                <View style={styles.totalRow}>
                  <AppText weight="semibold">Sale total</AppText>
                  <AppText weight="semibold">
                    {formatCurrency(completion.totalCents, currency)}
                  </AppText>
                </View>
                <SummaryRow label="Customer" value={completion.customerName} />
                <SummaryRow label="Sale date" value={completion.saleDate} />
                {completion.paymentSummaries.map((payment, index) => (
                  <SummaryRow
                    key={`${payment.label}-${index}`}
                    label={payment.label}
                    value={payment.amount}
                  />
                ))}
                <SummaryRow
                  label="Paid"
                  value={formatCurrency(completion.paidCents, currency)}
                />
                {completion.balanceDueCents > 0n ? (
                  <SummaryRow
                    label="Balance due"
                    value={formatCurrency(completion.balanceDueCents, currency)}
                  />
                ) : null}
                {completion.creditCents > 0n ? (
                  <SummaryRow
                    label="Customer credit"
                    value={formatCurrency(completion.creditCents, currency)}
                  />
                ) : null}
                {completion.balanceDueCents === 0n &&
                completion.creditCents === 0n ? (
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: theme.success }}
                  >
                    Paid in full
                  </AppText>
                ) : null}
              </Card>

              {completion.reminderMessage ? (
                <View
                  accessibilityRole="alert"
                  style={[
                    styles.completionReminder,
                    {
                      borderColor: completion.reminderMessage.includes(
                        "could not be saved",
                      )
                        ? theme.danger
                        : theme.border,
                      backgroundColor: completion.reminderMessage.includes(
                        "could not be saved",
                      )
                        ? `${theme.danger}10`
                        : theme.backgroundElement,
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      completion.reminderMessage.includes("could not be saved")
                        ? "alert-circle-outline"
                        : "notifications-outline"
                    }
                    size={20}
                    color={
                      completion.reminderMessage.includes("could not be saved")
                        ? theme.danger
                        : theme.primary
                    }
                  />
                  <AppText size="small" style={styles.formErrorText}>
                    {completion.reminderMessage}
                  </AppText>
                </View>
              ) : null}

              <View style={styles.successActions}>
                <Button
                  label="View sales"
                  variant="secondary"
                  onPress={() => router.replace("/(tabs)/sales")}
                />
                <Button
                  label="Return to eggs"
                  onPress={() => router.replace("/(tabs)/eggs")}
                />
              </View>
            </View>
          ) : null}

          {inStockProducts.length > 0 && stage === "edit" ? (
            <>
              <View
                accessibilityRole="progressbar"
                accessibilityLabel={`Sale setup step ${step + 1} of 3`}
                style={[styles.progressCard, { borderColor: theme.border }]}
              >
                <View style={styles.headingRow}>
                  <AppText weight="semibold">
                    Step {step + 1} of 3 ·{" "}
                    {
                      [
                        "Eggs and price",
                        "Customer and date",
                        "Payment and reminder",
                      ][step]
                    }
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {Math.round(((step + 1) / 3) * 100)}%
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
                <AppText size="small" tone="secondary">
                  {
                    [
                      "Choose the product, enter the quantities and prices.",
                      "Choose a customer if known and confirm when the sale happened.",
                      "Record one or more payments, or leave the balance due.",
                    ][step]
                  }
                </AppText>
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
              {step === 0 ? (
                <>
                  <Card style={styles.card}>
                    <AppText weight="semibold">Choose egg product</AppText>
                    {fieldErrors.product ? (
                      <AppText size="small" style={{ color: theme.danger }}>
                        {fieldErrors.product}
                      </AppText>
                    ) : null}
                    <View style={styles.choiceList}>
                      {inStockProducts.map((item) => {
                        const selected = productId === item.id;
                        const unit = item.units.find(
                          (entry) => entry.is_base_unit,
                        );
                        return (
                          <Pressable
                            key={item.id}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: selected }}
                            onPress={() => selectProduct(item)}
                            style={[
                              styles.productChoice,
                              {
                                borderColor: selected
                                  ? theme.primary
                                  : theme.border,
                                backgroundColor: selected
                                  ? theme.backgroundSelected
                                  : theme.background,
                              },
                            ]}
                          >
                            <View style={styles.productCopy}>
                              <AppText weight="semibold">{item.name}</AppText>
                              <AppText size="small" tone="secondary">
                                {quantityLabel(
                                  item.available_quantity_in_base_unit,
                                  unit?.abbreviation ?? "base units",
                                )}{" "}
                                available
                              </AppText>
                            </View>
                            <Ionicons
                              name={
                                selected
                                  ? "radio-button-on"
                                  : "radio-button-off"
                              }
                              size={20}
                              color={
                                selected ? theme.primary : theme.textSecondary
                              }
                            />
                          </Pressable>
                        );
                      })}
                    </View>
                  </Card>
                </>
              ) : null}

              {product ? (
                <>
                  {step === 0 ? (
                    <Card style={styles.card}>
                      <View style={styles.headingRow}>
                        <AppText weight="semibold">
                          Enter quantities and prices
                        </AppText>
                        <AppText size="small" tone="secondary">
                          {formatQuantity(
                            availableQuantity,
                            baseUnit?.abbreviation ?? "base units",
                          )}{" "}
                          available
                        </AppText>
                      </View>
                      {lines.map((line, index) => {
                        const selectedUnit = product.units.find(
                          (unit) => unit.id === line.unitId,
                        );
                        return (
                          <View key={line.id} style={styles.lineCard}>
                            <View style={styles.headingRow}>
                              <AppText size="small" weight="semibold">
                                Unit line {index + 1}
                              </AppText>
                              {lines.length > 1 ? (
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
                              {product.units.map((unit) => {
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
                                (line.id === lines[lines.length - 1]?.id
                                  ? fieldErrors.stock
                                  : undefined) ??
                                (line.quantity.trim() &&
                                (quantityMilli(line.quantity) === null ||
                                  quantityMilli(line.quantity) === 0n)
                                  ? "Enter a quantity greater than zero (up to 3 decimal places)."
                                  : undefined)
                              }
                            />
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
                              <View style={styles.summaryRow}>
                                <AppText size="small" weight="semibold">
                                  Line total:{" "}
                                  {formatCurrency(
                                    lineTotalCents(line) ?? 0n,
                                    currency,
                                  )}
                                </AppText>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                      {product.units.length > 1 ? (
                        <Button
                          label="Add another unit line"
                          variant="secondary"
                          onPress={() => {
                            setError("");
                            setFieldErrors({});
                            setLines((current) => [
                              ...current,
                              newLine(
                                product.units.find(
                                  (unit) =>
                                    !current.some(
                                      (line) => line.unitId === unit.id,
                                    ),
                                )?.id ?? product.units[0].id,
                              ),
                            ]);
                          }}
                        />
                      ) : null}
                      <View style={styles.totalRow}>
                        <AppText weight="semibold">Sale total</AppText>
                        <AppText weight="semibold">
                          {formatCurrency(totalCents, currency)}
                        </AppText>
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
                      <AppText weight="semibold">
                        Customer and sale date
                      </AppText>
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
                      <TextField
                        label="Search for a customer (optional)"
                        value={customerSearch}
                        onChangeText={(value) => {
                          setCustomerSearch(value);
                          setCustomer(null);
                          setCustomerError("");
                          setError("");
                        }}
                        placeholder="Type at least 2 characters"
                      />
                      {!customer && debouncedCustomerSearch.length >= 2 ? (
                        customerSearchQuery.isFetching ? (
                          <AppText size="small" tone="secondary">
                            Searching customers…
                          </AppText>
                        ) : (customerSearchQuery.data ?? []).length > 0 ? (
                          <View style={styles.customerResults}>
                            {(customerSearchQuery.data ?? []).map((contact) => (
                              <Pressable
                                key={contact.id}
                                accessibilityRole="button"
                                onPress={() => {
                                  setCustomer(contact);
                                  setCustomerSearch("");
                                  setDebouncedCustomerSearch("");
                                  setCustomerError("");
                                }}
                                style={[
                                  styles.customerChoice,
                                  { borderColor: theme.border },
                                ]}
                              >
                                <View style={styles.customerResultCopy}>
                                  <AppText weight="semibold">
                                    {contact.name}
                                  </AppText>
                                  <AppText size="small" tone="secondary">
                                    {[contact.phone, contact.email]
                                      .filter(Boolean)
                                      .join(" · ") || "No contact details"}
                                  </AppText>
                                </View>
                                <Ionicons
                                  name="chevron-forward"
                                  size={18}
                                  color={theme.textSecondary}
                                />
                              </Pressable>
                            ))}
                          </View>
                        ) : (
                          <AppText size="small" tone="secondary">
                            No customers match “{debouncedCustomerSearch}”. You
                            can add them below.
                          </AppText>
                        )
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

                      {!customer ? (
                        <View style={styles.walkInNote}>
                          <Ionicons
                            name="person-outline"
                            size={17}
                            color={theme.textSecondary}
                          />
                          <AppText size="small" tone="secondary">
                            {customerSearch.trim()
                              ? "You can continue without selecting a customer; this will be a walk-in sale."
                              : "No customer selected · this will be recorded as a walk-in sale."}
                          </AppText>
                        </View>
                      ) : null}

                      {!customer ? (
                        <>
                          <Button
                            label={
                              showNewCustomerForm
                                ? "Cancel adding customer"
                                : "Add a new customer"
                            }
                            variant="secondary"
                            onPress={() => {
                              setShowNewCustomerForm((visible) => !visible);
                              setCustomerError("");
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
                                label="Customer name"
                                value={newCustomerName}
                                onChangeText={(value) => {
                                  setNewCustomerName(value);
                                  setCustomerError("");
                                }}
                                placeholder="Full name or business name"
                                maxLength={150}
                              />
                              <TextField
                                label="Phone (optional)"
                                value={newCustomerPhone}
                                onChangeText={(value) => {
                                  setNewCustomerPhone(value);
                                  setCustomerError("");
                                }}
                                placeholder="Phone number"
                                keyboardType="phone-pad"
                                maxLength={30}
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
                                label="Save and select customer"
                                loading={createContact.isPending}
                                disabled={!newCustomerName.trim()}
                                onPress={() => void addCustomer()}
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
                        <AppText weight="semibold">Payments received</AppText>
                        <AppText size="small" tone="secondary">
                          Split payments across methods, leave an amount due, or
                          record an overpayment as customer credit.
                        </AppText>
                        <View style={styles.switchRow}>
                          <View style={styles.switchCopy}>
                            <AppText weight="semibold">
                              Record a payment now
                            </AppText>
                            <AppText size="small" tone="secondary">
                              Turn this on to enter one or more payments.
                            </AppText>
                          </View>
                          <Switch
                            accessibilityLabel="Record payment now"
                            value={recordPayment}
                            onValueChange={setRecordPayment}
                            trackColor={{
                              false: theme.border,
                              true: theme.primary,
                            }}
                          />
                        </View>
                        {recordPayment ? (
                          <>
                            {payments.map((payment, index) => (
                              <View
                                key={payment.id}
                                style={[
                                  styles.paymentEntry,
                                  { borderColor: theme.border },
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
                                      <Ionicons
                                        name="trash-outline"
                                        size={19}
                                        color={theme.danger}
                                      />
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
                                        borderColor: theme.border,
                                        backgroundColor:
                                          theme.backgroundElement,
                                      },
                                    ]}
                                  >
                                    <Ionicons
                                      name="checkmark-circle-outline"
                                      size={17}
                                      color={theme.primary}
                                    />
                                    <AppText
                                      size="small"
                                      weight="semibold"
                                      style={{ color: theme.primary }}
                                    >
                                      Fill remaining to pay in full
                                    </AppText>
                                  </Pressable>
                                ) : null}
                                <AppText size="small" weight="semibold">
                                  Payment method
                                </AppText>
                                <View style={styles.unitChoices}>
                                  {paymentMethods.map((method) => {
                                    const active =
                                      payment.method === method.value;
                                    return (
                                      <Pressable
                                        key={method.value}
                                        accessibilityRole="radio"
                                        accessibilityState={{ checked: active }}
                                        onPress={() =>
                                          updatePayment(payment.id, {
                                            method: method.value,
                                            reference:
                                              method.value === "cash"
                                                ? ""
                                                : payment.reference,
                                          })
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
                                        <AppText size="small">
                                          {method.label}
                                        </AppText>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                                {payment.method !== "cash" ? (
                                  <TextField
                                    label="Reference number (optional)"
                                    value={payment.reference}
                                    onChangeText={(reference) =>
                                      updatePayment(payment.id, { reference })
                                    }
                                    placeholder="Bank or M-Pesa reference"
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
                          {creditCents > 0n ? (
                            <View style={styles.paymentOutcome}>
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
                                  Customer credit
                                </AppText>
                                <AppText size="small" tone="secondary">
                                  {formatCurrency(creditCents, currency)}{" "}
                                  exceeds this sale. It will be recorded as
                                  credit for{" "}
                                  {customer?.name ?? "the walk-in customer"}; no
                                  refund is issued.
                                </AppText>
                              </View>
                            </View>
                          ) : balanceDueCents > 0n ? (
                            <View style={styles.paymentOutcome}>
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
                                  Balance due
                                </AppText>
                                <AppText size="small" tone="secondary">
                                  {formatCurrency(balanceDueCents, currency)}{" "}
                                  remains to collect. The sale will be recorded
                                  with this outstanding balance.
                                </AppText>
                              </View>
                            </View>
                          ) : totalCents > 0n ? (
                            <View style={styles.paymentOutcome}>
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
                          <View style={styles.switchRow}>
                            <View style={styles.switchCopy}>
                              <AppText weight="semibold">
                                {creditCents > 0n
                                  ? "Reminder to settle the customer credit"
                                  : "Reminder to collect the balance"}
                              </AppText>
                              <AppText size="small" tone="secondary">
                                {creditCents > 0n
                                  ? `Remind yourself to settle ${formatCurrency(creditCents, currency)} owed to ${customer?.name ?? "the buyer"}.`
                                  : `Remind yourself to collect ${formatCurrency(balanceDueCents, currency)} from ${customer?.name ?? "the buyer"}.`}
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
                            <View style={styles.reminderSchedule}>
                              <AppText size="small" tone="secondary">
                                We’ll remind you in FarmTrack. A phone alert is
                                scheduled when this device supports it;
                                otherwise the reminder stays in-app.
                              </AppText>
                              <DatePickerField
                                label="Remind me on"
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
                                label="Reminder time (farm local time)"
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

              <View style={styles.stepActions}>
                {step > 0 ? (
                  <Button
                    label="Back"
                    variant="secondary"
                    onPress={() => {
                      setError("");
                      setStep((current) => current - 1);
                      scrollRef.current?.scrollTo({ y: 0, animated: true });
                    }}
                  />
                ) : null}
                <Button
                  label={step === 2 ? "Review sale" : "Continue"}
                  onPress={continueSale}
                />
              </View>
            </>
          ) : null}

          {stage === "review" && product ? (
            <>
              <Card style={styles.card}>
                <AppText weight="semibold">Sale summary</AppText>
                <AppText>{product.name}</AppText>
                {lines.map((line, index) => {
                  const unit = product.units.find(
                    (item) => item.id === line.unitId,
                  );
                  const priceCents = salePriceCents(line.unitPrice) ?? 0n;
                  return (
                    <View key={line.id} style={styles.summaryRow}>
                      <AppText size="small" tone="secondary">
                        {line.quantity} {unit?.abbreviation} ×{" "}
                        {formatCurrency(priceCents, currency)}
                      </AppText>
                      <AppText size="small">
                        {formatCurrency(lineTotalCents(line) ?? 0n, currency)}
                      </AppText>
                    </View>
                  );
                })}
                <View style={styles.totalRow}>
                  <AppText weight="semibold">Total</AppText>
                  <AppText weight="semibold">
                    {formatCurrency(totalCents, currency)}
                  </AppText>
                </View>
                <SummaryRow label="Sale date" value={effectiveSaleDate} />
                <SummaryRow
                  label="Customer"
                  value={customer?.name ?? "Walk-in · no customer linked"}
                />
                {recordPayment ? (
                  payments.map((payment, index) => (
                    <SummaryRow
                      key={payment.id}
                      label={`Payment ${index + 1} · ${paymentMethods.find((method) => method.value === payment.method)?.label ?? "Payment"}`}
                      value={`${formatCurrency(salePriceCents(payment.amount) ?? 0n, currency)}${payment.reference.trim() ? ` · ${payment.reference.trim()}` : ""}`}
                    />
                  ))
                ) : (
                  <SummaryRow label="Payments" value="None recorded now" />
                )}
                <SummaryRow
                  label="Paid now"
                  value={formatCurrency(paidCents, currency)}
                />
                <SummaryRow
                  label={creditCents > 0n ? "Customer credit" : "Balance due"}
                  value={formatCurrency(
                    creditCents > 0n ? creditCents : balanceDueCents,
                    currency,
                  )}
                />
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
                  <AppText size="small" tone="secondary">
                    {creditCents > 0n
                      ? `${formatCurrency(creditCents, currency)} becomes customer credit. No refund is issued.`
                      : balanceDueCents > 0n
                        ? `${formatCurrency(balanceDueCents, currency)} remains as the sale’s balance due.`
                        : "Payments match the sale total exactly."}
                  </AppText>
                </View>
                {notes.trim() ? (
                  <SummaryRow label="Notes" value={notes.trim()} />
                ) : null}
                {scheduleSaleFollowUp &&
                (balanceDueCents > 0n || creditCents > 0n) ? (
                  <SummaryRow
                    label="Follow-up reminder"
                    value={`${effectiveReminderDueDate} at ${reminderDueTime}`}
                  />
                ) : null}
              </Card>
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
              <Button
                label={
                  creditCents > 0n
                    ? "Confirm sale & customer credit"
                    : balanceDueCents > 0n
                      ? "Confirm sale with balance due"
                      : "Confirm fully paid sale"
                }
                loading={createSale.isPending}
                onPress={() => void submitSale()}
              />
            </>
          ) : null}
        </ScrollView>
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
    gap: 14,
  },
  successContent: { gap: 14 },
  successHero: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 24,
  },
  successIcon: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    marginBottom: 4,
  },
  referenceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  referenceValue: { flex: 1 },
  successActions: { gap: 9 },
  completionReminder: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  card: { gap: 13 },
  progressCard: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
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
  choiceList: { gap: 9 },
  productChoice: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 13,
  },
  productCopy: { flex: 1, gap: 4 },
  lineCard: {
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#8885",
    borderRadius: 8,
    padding: 12,
  },
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
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#8885",
    paddingTop: 12,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  switchCopy: { flex: 1, gap: 4 },
  stepActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
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
  reminderSchedule: { gap: 11 },
  customerChoice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  customerResults: { gap: 8 },
  customerResultCopy: { flex: 1, gap: 3 },
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
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 13,
  },
  fillPaymentButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 7,
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
  },
  reviewOutcome: {
    gap: 5,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryValue: { flex: 1, textAlign: "right" },
});
