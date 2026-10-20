import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TimePickerField } from "@/components/ui/time-picker-field";
import { TextField } from "@/components/ui/text-field";
import {
  useChickenSaleOptions,
  useCreateChickenSale,
} from "@/features/chickens/hooks";
import type { Contact } from "@/features/management/api";
import type {
  ChickenSaleInput,
  ChickenSaleItemInput,
  ChickenType,
} from "@/features/chickens/api";
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
import {
  centsToDecimal,
  formatCents,
  parseMoneyToCents,
} from "@/features/chickens/purchase-pricing";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

type AllocationDraft = {
  id: string;
  batchId: string;
  blockId: string;
  quantity: string;
};

type SaleLineDraft = {
  id: string;
  productId: string;
  unitPrice: string;
  allocations: AllocationDraft[];
};

type SalePaymentDraft = {
  id: string;
  amount: string;
  method: (typeof paymentMethods)[number]["value"];
  reference: string;
};

const paymentMethods = [
  { label: "Cash", value: "cash" },
  { label: "M-Pesa", value: "mpesa" },
  { label: "Bank", value: "bank_transfer" },
  { label: "Card", value: "card" },
  { label: "Other", value: "other" },
] as const;

function newPayment(): SalePaymentDraft {
  return {
    id: `${Date.now()}-${Math.random()}`,
    amount: "",
    method: "cash",
    reference: "",
  };
}

function newAllocation(): AllocationDraft {
  return {
    id: `${Date.now()}-${Math.random()}`,
    batchId: "",
    blockId: "",
    quantity: "",
  };
}

function newSaleLine(): SaleLineDraft {
  return {
    id: `${Date.now()}-${Math.random()}`,
    productId: "",
    unitPrice: "",
    allocations: [newAllocation()],
  };
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

function parseCostToTenThousandths(value: string): bigint | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{0,4})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0") || "0");
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
  const dialog = useAppDialog();
  const farmId = farm.selectedFarm?.id ?? "";
  const options = useChickenSaleOptions(user?.id, farm.selectedFarm?.id);
  const createSale = useCreateChickenSale(user?.id ?? "", farmId);
  const createContact = useCreateContact(user?.id ?? "", farmId);
  const createReminder = useCreateReminder(user?.id ?? "", farmId);
  const [customerId, setCustomerId] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Contact | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState("");
  const customerSearchQuery = useSearchCustomers(
    user?.id,
    farm.selectedFarm?.id,
    debouncedCustomerSearch,
  );
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [newCustomerNotes, setNewCustomerNotes] = useState("");
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);
  const [lines, setLines] = useState<SaleLineDraft[]>([newSaleLine()]);
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>({});
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
  const batches = options.data?.batches ?? [];
  const lineTotals = lines.map((line) => {
    const quantity = line.allocations.reduce((sum, allocation) => {
      const parsed = Number(allocation.quantity);
      return sum + (Number.isInteger(parsed) && parsed > 0 ? parsed : 0);
    }, 0);
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
  const selectedCostRows = lines.flatMap((line) =>
    line.allocations
      .filter((allocation) => Number(allocation.quantity) > 0)
      .map((allocation) => {
        const batch = batches.find((entry) => entry.id === allocation.batchId);
        const cost = batch?.estimated_unit_cost;
        const unitCost = cost == null
          ? null
          : parseCostToTenThousandths(String(cost));
        return {
          quantity: Number(allocation.quantity),
          unitCost,
        };
      }),
  );
  const hasUnknownCost =
    selectedCostRows.length === 0 ||
    selectedCostRows.some((row) => row.unitCost === null);
  const estimatedCostTenThousandths = selectedCostRows.reduce(
    (sum, row) =>
      sum + (row.unitCost ?? 0n) * BigInt(row.quantity),
    0n,
  );
  const estimatedCostCents = (estimatedCostTenThousandths + 50n) / 100n;
  const estimatedProfitCents = totalCents - estimatedCostCents;
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

  function updateAllocation(
    lineId: string,
    allocationId: string,
    update: (allocation: AllocationDraft) => AllocationDraft,
  ) {
    updateLine(lineId, (line) => ({
      ...line,
      allocations: line.allocations.map((allocation) =>
        allocation.id === allocationId ? update(allocation) : allocation,
      ),
    }));
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
      const customer = await createContact.mutateAsync({
        name,
        roles: ["customer"],
        phone: newCustomerPhone.trim() || undefined,
        email: newCustomerEmail.trim() || undefined,
        address: newCustomerAddress.trim() || undefined,
        notes: newCustomerNotes.trim() || undefined,
      });
      setCustomerId(customer.id);
      setSelectedCustomer(customer);
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

  function validateAndBuildPayload():
    | { error: string }
    | { payload: ChickenSaleInput } {
    if (lines.length === 0) return { error: "Add at least one sale item." } as const;

    const requiredStock = new Map<string, number>();
    const payloadItems: ChickenSaleItemInput[] = [];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const product = saleProducts.find((item) => item.id === line.productId);
      if (!product) {
        return { error: `Choose a chicken product for item ${lineIndex + 1}.` } as const;
      }
      const baseUnit = product.product_units.find((unit) => unit.is_base_unit);
      if (!baseUnit || Number(baseUnit.conversion_factor) !== 1) {
        return {
          error: `${product.name} needs a base unit representing one chicken before it can be sold.`,
        } as const;
      }

      const activeAllocations = line.allocations.filter(
        (allocation) =>
          allocation.batchId || allocation.blockId || allocation.quantity,
      );
      if (!activeAllocations.length) {
        return {
          error: `Allocate chickens from at least one batch for item ${lineIndex + 1}.`,
        } as const;
      }
      const saleType: ChickenType | undefined = batches.find(
        (batch) => batch.id === activeAllocations[0].batchId,
      )?.chicken_type;
      if (!saleType) {
        return { error: `Choose a batch for item ${lineIndex + 1}.` } as const;
      }
      const allocations = [];
      const seenPairs = new Set<string>();
      let quantity = 0;
      for (const allocation of activeAllocations) {
        const batch = batches.find((option) => option.id === allocation.batchId);
        const stock = batch?.stocks.find(
          (option) => option.block_id === allocation.blockId,
        );
        const parsedQuantity = Number(allocation.quantity);
        if (!batch || !stock || !Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
          return {
            error: `Complete the batch, block and whole-chicken quantity for item ${lineIndex + 1}.`,
          } as const;
        }
        if (batch.chicken_type !== saleType) {
          return {
            error: `All allocations in item ${lineIndex + 1} must have the same chicken type.`,
          } as const;
        }
        const pair = `${batch.id}:${stock.block_id}`;
        if (seenPairs.has(pair)) {
          return {
            error: "Remove duplicate batch and block allocations within a sale item.",
          } as const;
        }
        seenPairs.add(pair);
        const stockKey = pair;
        const cumulativeQuantity =
          (requiredStock.get(stockKey) ?? 0) + parsedQuantity;
        if (cumulativeQuantity > stock.quantity) {
          return {
            error: `Only ${stock.quantity.toLocaleString()} chickens are available from ${batch.name} in ${stock.block_name}.`,
          } as const;
        }
        requiredStock.set(stockKey, cumulativeQuantity);
        quantity += parsedQuantity;
        allocations.push({
          batch_id: batch.id,
          block_id: stock.block_id,
          quantity: parsedQuantity,
        });
      }
      const unitPriceCents = parseMoneyToCents(line.unitPrice);
      if (unitPriceCents === null) {
        return {
          error: `Enter a valid price with up to two decimal places for item ${lineIndex + 1}.`,
        } as const;
      }
      payloadItems.push({
        product_id: product.id,
        chicken_type: saleType,
        quantity,
        unit_id: baseUnit.unit_id,
        unit_price: centsToDecimal(unitPriceCents),
        batch_allocations: allocations,
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
        customer_id: customerId || undefined,
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
              payment_date: effectiveTransactionDate,
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
      const sale = await createSale.mutateAsync(result.payload);
      let reminderMessage = "";
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
          const buyerName = selectedCustomer?.name ?? "the buyer";
          const isOverpayment = saleCreditCents > 0n;
          const followUpAmount = isOverpayment
            ? saleCreditCents
            : saleBalanceDueCents;
          const reminderTitle = isOverpayment
            ? "Settle chicken sale overpayment"
            : "Follow up on chicken sale balance";
          const reminderDescription = isOverpayment
            ? `Settle the ${formatCents(followUpAmount, theme.currency)} overpayment owed to ${buyerName} from ${sale.reference_number ?? "the chicken sale"}.`
            : `Ask ${buyerName} for the remaining ${formatCents(followUpAmount, theme.currency)} from ${sale.reference_number ?? "the chicken sale"}.`;
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
              phoneAlertMessage = " Phone alerts are available in the mobile app.";
            } else {
              try {
                await scheduleReminderNotification(reminder);
                phoneAlertMessage =
                  " A phone alert is also scheduled on this device.";
              } catch (localAlertError: unknown) {
                phoneAlertMessage = ` The in-app reminder is saved, but a phone alert could not be scheduled: ${normalizeApiError(localAlertError).message}`;
              }
            }
            reminderMessage = `In-app sale follow-up reminder saved for ${effectiveReminderDueDate} at ${reminderDueTime}.${phoneAlertMessage} Push setup was unavailable: ${normalizeApiError(pushSetupError).message}`;
          } else {
            reminderMessage = `Sale follow-up reminder saved in the app with push delivery enabled for ${effectiveReminderDueDate} at ${reminderDueTime}.`;
          }
        } catch (reminderError: unknown) {
          reminderMessage = `Sale saved, but the balance reminder could not be saved: ${normalizeApiError(reminderError).message}`;
        }
      }
      await dialog.showDialog({
        title: "Chicken sale recorded",
        message: [
          sale.reference_number ?? "Sale saved",
          `Total: ${formatCents(totalCents, theme.currency)}`,
          `Paid: ${formatCents(parseMoneyToCents(String(sale.amount_paid)) ?? 0n, theme.currency)}`,
          Number(sale.balance_due) > 0
            ? `Customer balance due: ${formatCents(parseMoneyToCents(String(sale.balance_due)) ?? 0n, theme.currency)}`
            : Number(sale.credit_balance) > 0
              ? `Customer credit: ${formatCents(parseMoneyToCents(String(sale.credit_balance)) ?? 0n, theme.currency)}`
              : "Paid in full",
          "Inventory has been deducted from the selected batches and blocks.",
          reminderMessage,
        ].join("\n"),
        tone: "success",
      });
      router.replace("/(tabs)/flock");
    } catch (saleError: unknown) {
      setError(normalizeApiError(saleError).message);
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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
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
            <AppText size="small" tone="secondary">
              Customer is optional. Choose one to track their balance and
              follow-up, or record this as a walk-in sale.
            </AppText>
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
                  <AppText size="small" tone="secondary">
                    Customer selected
                  </AppText>
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
                    <AppText weight="semibold">Find an existing customer</AppText>
                    <AppText size="small" tone="secondary">
                      Search by name, phone, or email. Up to 25 matches are shown.
                    </AppText>
                  </View>
                  <AppText size="small" tone="secondary">
                    Optional
                  </AppText>
                </View>
                <View
                  style={[
                    styles.customerSearchBox,
                    {
                      backgroundColor: theme.background,
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
                    placeholder="Search customers"
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
                {customerSearch.trim().length < 2 ? (
                  <AppText size="small" tone="secondary">
                    Type at least 2 characters to search your customer list.
                  </AppText>
                ) : customerSearch.trim() !== debouncedCustomerSearch ||
                  customerSearchQuery.isFetching ? (
                  <View style={styles.customerSearchState}>
                    <ActivityIndicator size="small" color={theme.primary} />
                    <AppText size="small" tone="secondary">
                      Searching customers…
                    </AppText>
                  </View>
                ) : customerSearchQuery.isError ? (
                  <View style={styles.customerSearchState}>
                    <AppText size="small" style={{ color: theme.danger }}>
                      {normalizeApiError(customerSearchQuery.error).message}
                    </AppText>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void customerSearchQuery.refetch()}
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
                ) : customerSearchQuery.data?.length ? (
                  <View
                    style={[
                      styles.customerResults,
                      { borderColor: theme.border },
                    ]}
                  >
                    {customerSearchQuery.data.map((customer, index) => (
                      <Pressable
                        key={customer.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${customer.name}${customer.phone ? `, ${customer.phone}` : ""}`}
                        onPress={() => {
                          setCustomerId(customer.id);
                          setSelectedCustomer(customer);
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
                  </View>
                ) : (
                  <AppText size="small" tone="secondary">
                    No customers match “{debouncedCustomerSearch}”.
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
                    <AppText size="small" tone="secondary">
                      Record as a walk-in sale; no customer account is linked.
                    </AppText>
                  </View>
                </Pressable>
              </>
            )}
            <View style={[styles.dateTimeCard, { borderColor: theme.border }]}>
              <View style={styles.dateTimeIntro}>
                <Ionicons name="calendar-outline" size={19} color={theme.primary} />
                <View style={styles.flexCopy}>
                  <AppText weight="semibold">When did this sale happen?</AppText>
                  <AppText size="small" tone="secondary">
                    Defaults to today and your farm’s local time.
                  </AppText>
                </View>
              </View>
              <DatePickerField
                label="Sale date"
                value={effectiveTransactionDate}
                onChange={setTransactionDate}
              />
              <View style={styles.paymentToggle}>
                <View style={styles.paymentToggleCopy}>
                  <AppText size="small" weight="semibold">Include a time</AppText>
                  <AppText size="small" tone="secondary">
                    Optional; starts at the current time.
                  </AppText>
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
            {lines.map((line, lineIndex) => (
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
                <AppText size="small" tone="secondary">
                  Product
                </AppText>
                <View style={styles.chips}>
                  {saleProducts.map((product) => (
                    <ChoiceChip
                      key={product.id}
                      label={product.name}
                      selected={line.productId === product.id}
                      onPress={() =>
                        updateLine(line.id, (current) => ({
                          ...current,
                          productId: product.id,
                        }))
                      }
                    />
                  ))}
                </View>

                <View style={styles.inventoryIntro}>
                  <AppText size="small" weight="semibold">
                    Choose birds by block
                  </AppText>
                  <AppText size="small" tone="secondary">
                    Select a block to view its batches and available stock.
                  </AppText>
                </View>
                {options.data?.blocks.map((block) => {
                  const selectedType = batches.find((batch) =>
                    line.allocations.some(
                      (allocation) => allocation.batchId === batch.id,
                    ),
                  )?.chicken_type;
                  const blockBatches = batches
                    .map((batch) => ({
                      batch,
                      stock: batch.stocks.find(
                        (stock) => stock.block_id === block.id,
                      ),
                    }))
                    .filter(
                      (entry) =>
                        entry.stock &&
                        entry.stock.quantity > 0 &&
                        (!selectedType ||
                          entry.batch.chicken_type === selectedType),
                    );
                  return (
                    <View
                      key={block.id}
                      style={[
                        styles.blockCard,
                        {
                          backgroundColor: theme.background,
                          borderColor: expandedBlocks[`${line.id}:${block.id}`]
                            ? theme.primary
                            : theme.border,
                        },
                      ]}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{
                          expanded: Boolean(expandedBlocks[`${line.id}:${block.id}`]),
                        }}
                        onPress={() =>
                          setExpandedBlocks((current) => ({
                            ...current,
                            [`${line.id}:${block.id}`]:
                              !current[`${line.id}:${block.id}`],
                          }))
                        }
                        style={styles.blockHeading}
                      >
                        <View style={styles.blockTitle}>
                          <View
                            style={[
                              styles.blockIcon,
                              { backgroundColor: `${theme.primary}1A` },
                            ]}
                          >
                            <Ionicons name="home-outline" size={17} color={theme.primary} />
                          </View>
                          <View style={styles.blockNameGroup}>
                            <AppText weight="semibold">{block.name}</AppText>
                            <AppText size="small" tone="secondary">
                              {block.current_chickens.toLocaleString()} birds in block
                            </AppText>
                          </View>
                        </View>
                        <View style={styles.blockSummary}>
                          <Ionicons
                            name={
                              expandedBlocks[`${line.id}:${block.id}`]
                                ? "chevron-up"
                                : "chevron-down"
                            }
                            size={18}
                            color={theme.textSecondary}
                          />
                        </View>
                      </Pressable>
                      <View style={styles.blockMeta}>
                        <AppText size="small" tone="secondary">
                          {blockBatches.length} {blockBatches.length === 1 ? "batch" : "batches"} with available stock
                        </AppText>
                        {line.allocations.some(
                          (allocation) => allocation.blockId === block.id,
                        ) ? (
                          <AppText size="small" weight="semibold" style={{ color: theme.success }}>
                            {line.allocations
                              .filter((allocation) => allocation.blockId === block.id)
                              .reduce(
                                (sum, allocation) =>
                                  sum + (Number(allocation.quantity) || 0),
                                0,
                              )
                              .toLocaleString()} selected
                          </AppText>
                        ) : null}
                      </View>
                      {expandedBlocks[`${line.id}:${block.id}`] ? (
                        <>
                      {blockBatches.length ? (
                        blockBatches.map(({ batch, stock }) => {
                          if (!stock) return null;
                          const allocation = line.allocations.find(
                            (entry) =>
                              entry.batchId === batch.id &&
                              entry.blockId === block.id,
                          );
                          return (
                            <View
                              key={batch.id}
                              style={[
                                styles.batchStock,
                                {
                                  borderTopColor: theme.border,
                                  backgroundColor: allocation
                                    ? `${theme.primary}0A`
                                    : theme.background,
                                  borderColor: allocation ? `${theme.primary}55` : theme.border,
                                },
                              ]}
                            >
                              <Pressable
                                accessibilityRole="checkbox"
                                accessibilityState={{
                                  checked: Boolean(allocation),
                                }}
                                onPress={() => {
                                  if (allocation) {
                                    updateLine(line.id, (current) => ({
                                      ...current,
                                      allocations: current.allocations.filter(
                                        (entry) => entry.id !== allocation.id,
                                      ),
                                    }));
                                  } else {
                                    updateLine(line.id, (current) => ({
                                      ...current,
                                      allocations: [
                                        ...current.allocations,
                                        {
                                          id: `${Date.now()}-${Math.random()}`,
                                          batchId: batch.id,
                                          blockId: block.id,
                                          quantity: "",
                                        },
                                      ],
                                    }));
                                  }
                                }}
                                style={styles.batchSelect}
                              >
                                <View
                                  style={[
                                    styles.batchCheck,
                                    {
                                      backgroundColor: allocation
                                        ? theme.primary
                                        : theme.backgroundElement,
                                      borderColor: allocation
                                        ? theme.primary
                                        : theme.border,
                                    },
                                  ]}
                                >
                                  {allocation ? (
                                    <Ionicons
                                      name="checkmark"
                                      size={13}
                                      color={theme.onPrimary}
                                    />
                                  ) : null}
                                </View>
                                <View style={styles.batchDescription}>
                                  <AppText size="small" weight="semibold" numberOfLines={1}>
                                    {batch.name}
                                  </AppText>
                                  <AppText size="small" tone="secondary">
                                    {batch.chicken_type}
                                  </AppText>
                                </View>
                                <View style={styles.batchIndicators}>
                                  <View
                                    style={[
                                      styles.stockPill,
                                      { backgroundColor: `${theme.success}1A` },
                                    ]}
                                  >
                                    <AppText
                                      size="small"
                                      weight="semibold"
                                      style={{ color: theme.success }}
                                    >
                                      {stock.quantity.toLocaleString()} available
                                    </AppText>
                                  </View>
                                  <View
                                    style={[
                                      styles.stockPill,
                                      { backgroundColor: `${theme.primary}1A` },
                                    ]}
                                  >
                                    <AppText
                                      size="small"
                                      weight="semibold"
                                      style={{ color: theme.primary }}
                                    >
                                      Age {formatBatchAge(batch.hatch_date)}
                                    </AppText>
                                  </View>
                                </View>
                              </Pressable>
                              {allocation ? (
                                <TextInput
                                  accessibilityLabel={`${batch.name} quantity in ${block.name}`}
                                  keyboardType="number-pad"
                                  placeholder={`Quantity to sell (max ${stock.quantity})`}
                                  placeholderTextColor={theme.textSecondary}
                                  value={allocation.quantity}
                                  onChangeText={(quantity) =>
                                    updateAllocation(
                                      line.id,
                                      allocation.id,
                                      (current) => ({ ...current, quantity }),
                                    )
                                  }
                                  style={[
                                    styles.input,
                                    {
                                      backgroundColor: theme.backgroundElement,
                                      borderColor: theme.border,
                                      color: theme.text,
                                    },
                                  ]}
                                />
                              ) : null}
                            </View>
                          );
                        })
                      ) : (
                        <AppText size="small" tone="secondary">
                          No active batch stock in this block.
                        </AppText>
                      )}
                        </>
                      ) : null}
                    </View>
                  );
                })}

                <TextInput
                  accessibilityLabel="Price per chicken"
                  keyboardType="decimal-pad"
                  placeholder="Price per chicken"
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
                <AppText size="small" tone="secondary">
                  {lineTotals[lineIndex].quantity.toLocaleString()} chickens ·{" "}
                  {formatCents(lineTotals[lineIndex].totalCents, theme.currency)}
                </AppText>
              </Card>
            ))}
            <Button
              label="Add another sale item"
              variant="secondary"
              onPress={() => setLines((current) => [...current, newSaleLine()])}
            />
          </View>
          ) : null}

          {step === 2 ? (
          <>
          <Card style={styles.section}>
            <SectionTitle number="3" title="Discount and payment" />
            <View style={styles.chips}>
              <ChoiceChip
                label="No discount"
                selected={discountType === null}
                onPress={() => {
                  setDiscountType(null);
                  setDiscountValue("");
                  setDiscountReason("");
                }}
              />
              <ChoiceChip
                label="Fixed amount"
                selected={discountType === "fixed"}
                onPress={() => {
                  setDiscountType("fixed");
                  setDiscountValue("");
                }}
              />
              <ChoiceChip
                label="Percentage"
                selected={discountType === "percentage"}
                onPress={() => {
                  setDiscountType("percentage");
                  setDiscountValue("");
                }}
              />
            </View>
            {discountType ? (
              <>
                <TextInput
                  accessibilityLabel={
                    discountType === "percentage"
                      ? "Discount percentage"
                      : "Discount amount"
                  }
                  keyboardType="decimal-pad"
                  placeholder={
                    discountType === "percentage"
                      ? "Discount percentage"
                      : `Discount amount (${theme.currency})`
                  }
                  placeholderTextColor={theme.textSecondary}
                  value={discountValue}
                  onChangeText={setDiscountValue}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                />
                <TextInput
                  accessibilityLabel="Discount reason"
                  placeholder="Reason for discount (optional)"
                  placeholderTextColor={theme.textSecondary}
                  value={discountReason}
                  onChangeText={setDiscountReason}
                  maxLength={200}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                />
              </>
            ) : null}
            <View style={[styles.summary, { borderTopColor: theme.border }]}>
              <SummaryLine
                label="Subtotal"
                value={formatCents(subtotalCents, theme.currency)}
              />
              <SummaryLine
                label="Discount"
                value={`−${formatCents(discountCents, theme.currency)}`}
                color={theme.secondary}
              />
              <SummaryLine
                label="Sale total"
                value={formatCents(totalCents, theme.currency)}
                color={theme.primary}
                strong
              />
            </View>
          </Card>

          <Card style={styles.section}>
            <AppText weight="semibold">Payment details</AppText>
            <AppText size="small" tone="secondary">
              Record no payment now, split it across methods, leave a balance,
              or record an overpayment as customer credit.
            </AppText>
            <View style={styles.paymentToggle}>
              <View style={styles.paymentToggleCopy}>
                <AppText weight="semibold">Record payment now</AppText>
                <AppText size="small" tone="secondary">
                  You can record a payment later.
                </AppText>
              </View>
              <Switch
                accessibilityLabel="Record payment now"
                value={recordPayment}
                onValueChange={setRecordPayment}
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
                      { borderTopColor: theme.border },
                    ]}
                  >
                    <View style={styles.paymentHeading}>
                      <AppText weight="semibold">Payment {index + 1}</AppText>
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
                    <TextInput
                      accessibilityLabel={`Payment ${index + 1} amount`}
                      keyboardType="decimal-pad"
                      placeholder={`Amount (${theme.currency})`}
                      placeholderTextColor={theme.textSecondary}
                      value={payment.amount}
                      onChangeText={(amount) =>
                        setPayments((current) =>
                          current.map((item) =>
                            item.id === payment.id ? { ...item, amount } : item,
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
                    {remainingForFullPayment(payment.id) > 0n ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Fill payment ${index + 1} with the remaining amount to pay the sale in full`}
                      onPress={() => fillPaymentToFull(payment.id)}
                      style={({ pressed }) => [
                        styles.fillPaymentButton,
                        {
                          backgroundColor: theme.backgroundElement,
                          borderColor: theme.border,
                          opacity: pressed ? 0.65 : 1,
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
                    <View style={styles.chips}>
                      {paymentMethods.map((method) => (
                        <ChoiceChip
                          key={method.value}
                          label={method.label}
                          selected={payment.method === method.value}
                          onPress={() =>
                            setPayments((current) =>
                              current.map((item) =>
                                item.id === payment.id
                                  ? {
                                      ...item,
                                      method: method.value,
                                      reference:
                                        method.value === "cash"
                                          ? ""
                                          : item.reference,
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      ))}
                    </View>
                    {payment.method !== "cash" ? (
                      <TextInput
                        accessibilityLabel={`Payment ${index + 1} reference number`}
                        placeholder="Reference number (optional)"
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
                <Button
                  label="Add another payment"
                  variant="secondary"
                  onPress={() =>
                    setPayments((current) => [...current, newPayment()])
                  }
                />
              </>
            ) : null}
            <View style={[styles.summary, { borderTopColor: theme.border }]}>
              <SummaryLine
                label="Paid now"
                value={formatCents(paidCents, theme.currency)}
                color={theme.success}
              />
              {creditCents > 0n ? (
                <SummaryLine
                  label="Customer credit"
                  value={formatCents(creditCents, theme.currency)}
                  color={theme.success}
                  strong
                />
              ) : (
                <SummaryLine
                  label="Balance due"
                  value={formatCents(balanceDueCents, theme.currency)}
                  color={balanceDueCents > 0n ? theme.danger : theme.success}
                  strong
                />
              )}
            </View>
            <View
              style={[
                styles.paymentOutcome,
                {
                  borderColor:
                    creditCents > 0n
                      ? theme.secondary
                      : balanceDueCents > 0n
                        ? theme.danger
                        : theme.success,
                  backgroundColor:
                    creditCents > 0n
                      ? `${theme.secondary}10`
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
                      creditCents > 0n
                        ? theme.secondary
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
                    ? `${formatCents(creditCents, theme.currency)} will be recorded as customer credit; no refund has been issued.`
                    : balanceDueCents > 0n
                      ? `${formatCents(balanceDueCents, theme.currency)} remains to collect.`
                      : "The payments entered match the discounted sale total."}
                </AppText>
              </View>
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
          </>
          ) : null}

          {step === 3 ? (
            <Card style={styles.section}>
              <SectionTitle number="4" title="Review the sale" />
              <AppText size="small" tone="secondary">
                Check the summary before saving. The selected birds will be
                deducted from their blocks.
              </AppText>
              <View style={styles.reviewRow}>
                <Ionicons name="person-outline" size={18} color={theme.primary} />
                <AppText weight="semibold">
                  {selectedCustomer?.name ??
                    "Walk-in sale · no customer recorded"}
                </AppText>
              </View>
              <View style={styles.reviewRow}>
                <Ionicons name="calendar-outline" size={18} color={theme.primary} />
                <AppText size="small">
                  {effectiveTransactionDate}
                  {includeTransactionTime ? ` · ${effectiveTransactionTime}` : ""}
                </AppText>
              </View>
              {lines.map((line, index) => {
                const product = saleProducts.find((item) => item.id === line.productId);
                return (
                  <View key={line.id} style={[styles.reviewLine, { borderColor: theme.border }]}>
                    <View style={styles.summaryLine}>
                      <AppText weight="semibold">
                        {lineTotals[index].quantity.toLocaleString()} {product?.name ?? "chickens"}
                      </AppText>
                      <AppText weight="semibold">
                        {formatCents(lineTotals[index].totalCents, theme.currency)}
                      </AppText>
                    </View>
                    <AppText size="small" tone="secondary">
                      {line.allocations
                        .filter((allocation) => Number(allocation.quantity) > 0)
                        .map((allocation) => {
                          const batch = batches.find((item) => item.id === allocation.batchId);
                          const block = options.data?.blocks.find((item) => item.id === allocation.blockId);
                          return `${Number(allocation.quantity).toLocaleString()} from ${batch?.name ?? "batch"} in ${block?.name ?? "block"}`;
                        })
                        .join(" · ")}
                    </AppText>
                  </View>
                );
              })}
              <View style={[styles.summary, { borderTopColor: theme.border }]}>
                <SummaryLine label="Subtotal" value={formatCents(subtotalCents, theme.currency)} />
                <SummaryLine label="Discount" value={`−${formatCents(discountCents, theme.currency)}`} />
                <SummaryLine label="Sale total" value={formatCents(totalCents, theme.currency)} color={theme.primary} strong />
                <SummaryLine label="Paid now" value={formatCents(paidCents, theme.currency)} color={theme.success} />
                <SummaryLine
                  label={creditCents > 0n ? "Customer credit" : "Balance due"}
                  value={formatCents(creditCents > 0n ? creditCents : balanceDueCents, theme.currency)}
                  color={creditCents > 0n || balanceDueCents === 0n ? theme.success : theme.danger}
                  strong
                />
              </View>
              {saleFollowUpAmountCents > 0n ? (
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
                          ? `Remind yourself to settle ${formatCents(creditCents, theme.currency)} owed to ${selectedCustomer?.name ?? "the buyer"}.`
                          : `Remind yourself to ask ${selectedCustomer?.name ?? "the buyer"} for ${formatCents(balanceDueCents, theme.currency)}.`}
                      </AppText>
                    </View>
                    <Switch
                      accessibilityLabel={
                        creditCents > 0n
                          ? "Set a reminder to settle the customer overpayment"
                          : "Set a reminder to ask the buyer for the balance"
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
              <View
                style={[
                  styles.profitCard,
                  {
                    backgroundColor: hasUnknownCost
                      ? theme.backgroundElement
                      : `${estimatedProfitCents < 0n ? theme.danger : theme.success}12`,
                    borderColor: hasUnknownCost
                      ? theme.border
                      : `${estimatedProfitCents < 0n ? theme.danger : theme.success}55`,
                  },
                ]}
              >
                <Ionicons
                  name={
                    hasUnknownCost
                      ? "information-circle-outline"
                      : estimatedProfitCents < 0n
                        ? "trending-down-outline"
                        : "trending-up-outline"
                  }
                  size={22}
                  color={
                    hasUnknownCost
                      ? theme.textSecondary
                      : estimatedProfitCents < 0n
                        ? theme.danger
                        : theme.success
                  }
                />
                <View style={styles.flexCopy}>
                  <AppText weight="semibold">
                    {hasUnknownCost ? "Profit estimate incomplete" : "Estimated profit"}
                  </AppText>
                  {hasUnknownCost ? (
                    <AppText size="small" tone="secondary">
                      Purchase cost is missing for at least one selected batch.
                    </AppText>
                  ) : (
                    <>
                      <AppText
                        size="heading"
                        weight="semibold"
                        style={{ color: estimatedProfitCents < 0n ? theme.danger : theme.success }}
                      >
                        {formatCents(estimatedProfitCents, theme.currency)}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        Sale total less the birds’ recorded purchase cost.
                        Feed and care costs are not included.
                      </AppText>
                      <SummaryLine
                        label="Estimated purchase cost"
                        value={formatCents(estimatedCostCents, theme.currency)}
                      />
                    </>
                  )}
                </View>
              </View>
            </Card>
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
                label="Record sale and update stock"
                style={{ flex: 1 }}
                loading={createSale.isPending}
                disabled={options.isError || !options.data}
                onPress={() => void submitSale()}
              />
            )}
          </View>
            </>
          ) : null}
        </ScrollView>
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

function formatBatchAge(hatchDate: string | null): string {
  if (!hatchDate) return "unknown";
  const hatch = new Date(`${hatchDate}T00:00:00`);
  if (Number.isNaN(hatch.getTime())) return "unknown";
  const days = Math.max(
    0,
    Math.floor((Date.now() - hatch.getTime()) / 86_400_000),
  );
  const weeks = Math.floor(days / 7);
  const remainingDays = days % 7;
  if (weeks === 0) return `${days} ${days === 1 ? "day" : "days"}`;
  return `${weeks} ${weeks === 1 ? "week" : "weeks"}${
    remainingDays ? ` ${remainingDays} ${remainingDays === 1 ? "day" : "days"}` : ""
  }`;
}

function ChoiceChip({
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
        styles.chip,
        {
          backgroundColor: selected
            ? `${theme.primary}1A`
            : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
    >
      <AppText
        size="small"
        weight={selected ? "semibold" : "regular"}
        style={selected ? { color: theme.primary } : undefined}
      >
        {label}
      </AppText>
    </Pressable>
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    maxWidth: "100%",
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: 18,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
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
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
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
  dateTimeIntro: { flexDirection: "row", alignItems: "center", gap: 9 },
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
  saleLine: { gap: 11 },
  lineHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  inventoryIntro: { gap: 3 },
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
  paymentOutcome: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderWidth: 1,
    borderRadius: 10,
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
    gap: 9,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  fillPaymentButton: {
    minHeight: 38,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  paymentHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  notesInput: { minHeight: 78, textAlignVertical: "top" },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  reviewLine: { gap: 6, paddingVertical: 9, borderBottomWidth: 1 },
  profitCard: {
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
