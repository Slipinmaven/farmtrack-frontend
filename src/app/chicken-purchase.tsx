import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as SecureStore from "expo-secure-store";
import { router, usePreventRemove } from "expo-router";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  type TextInputInstance,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
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
import {
  useCreateContact,
  useUpdateContact,
} from "@/features/management/hooks";
import {
  useChickenPurchaseOptions,
  useCreateChickenPurchase,
  useCreateChickenPurchaseReceipt,
  useRecordChickenPurchasePayment,
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
import {
  useCancelReminder,
  useCreateReminder,
  useRescheduleReminder,
} from "@/features/reminders/hooks";
import { registerForReminderPush } from "@/features/reminders/push-notifications";
import type { Reminder } from "@/features/reminders/api";
import { FarmSelector } from "@/features/farms/components/farm-selector";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";
import { PaymentMessageReview } from "@/features/payment-message-import/components/PaymentMessageReview";
import {
  assessImportedPayment,
} from "@/features/payment-message-import/validation";
import type {
  PaymentMessageEdits,
} from "@/features/payment-message-import/components/PaymentMessageReview";
import { parsePaymentMessage } from "@/features/payment-message-import/parser";
import {
  usePaymentMessageImport,
} from "@/features/payment-message-import/PaymentMessageImportProvider";
import {
  SmsPaymentPicker,
  type SelectedSmsPayment,
} from "@/features/payment-message-import/components/SmsPaymentPicker";
import type {
  NormalizedPaymentMessage,
} from "@/features/payment-message-import/types";

const steps = [
  "Purchase details",
  "Batch & housing",
  "Payment",
  "Review & confirm",
];
const FIRST_PAYMENT_TARGET = "first-payment";

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

type PurchaseUnitEntryDraft = {
  id: string;
  unitId: string;
  quantity: string;
  unitPrice: string;
};

type PurchaseItemDraft = {
  id: string;
  productId: string;
  chickenType: ChickenType;
  unitEntries: PurchaseUnitEntryDraft[];
  quantity?: string;
  unitId?: string;
  unitPrice?: string;
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
  smsMessageId?: string;
  amount: string;
  method: ChickenPaymentMethod;
  reference: string;
  date: string;
  time: string | null;
};

const purchaseDraftSchema = z.object({
  version: z.literal(1),
  savedAt: z.number(),
  step: z.number().int().min(0).max(3),
  purchaseDate: z.string().nullable(),
  supplierId: z.string(),
  supplierFormOpen: z.boolean(),
  newSupplierName: z.string(),
  newSupplierPhone: z.string(),
  newSupplierEmail: z.string(),
  purchaseNotes: z.string(),
  itemDrafts: z.array(
    z.object({
      id: z.string(),
      productId: z.string(),
      chickenType: z.enum(["layers", "broiler", "kienyeji", "breeder", "other"]),
      unitEntries: z
        .array(
          z.object({
            id: z.string(),
            unitId: z.string(),
            quantity: z.string(),
            unitPrice: z.string(),
          }),
        )
        .optional(),
      quantity: z.string().optional(),
      unitId: z.string().optional(),
      unitPrice: z.string().optional(),
      notes: z.string(),
    }),
  ),
  recordPayment: z.boolean(),
  fullyPaid: z.boolean(),
  paymentAmount: z.string(),
  paymentMethod: z.enum(["cash", "mpesa", "bank_transfer", "card", "other"]),
  paymentReference: z.string(),
  paymentSmsMessageId: z.string().nullable().optional(),
  paymentDate: z.string().nullable(),
  paymentTime: z.string().nullable(),
  additionalPayments: z.array(
    z.object({
      id: z.string(),
      smsMessageId: z.string().optional(),
      amount: z.string(),
      method: z.enum(["cash", "mpesa", "bank_transfer", "card", "other"]),
      reference: z.string(),
      date: z.string().optional(),
      time: z.string().nullable().optional(),
    }),
  ),
  remindForSettlement: z.boolean(),
  reminderDueDate: z.string(),
  reminderDueTime: z.string(),
  discountType: z.enum(["fixed", "percentage"]).nullable(),
  discountValue: z.string(),
  discountReason: z.string(),
  discountConfirmed: z.boolean(),
  overpaymentConfirmed: z.boolean(),
});

function createItemDraft(): PurchaseItemDraft {
  return {
    id: `${Date.now()}-${Math.random()}`,
    productId: "",
    chickenType: "layers",
    unitEntries: [],
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

function formatReminderDateTime(
  value: string,
  timezone: string | null | undefined,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone || "UTC",
  }).format(date);
}

function formatChickenCount(quantity: number | string): string {
  const numericQuantity = Number(quantity);
  return Number.isFinite(numericQuantity)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(
        numericQuantity,
      )
    : String(quantity);
}

function chickenPurchaseUnitLabel(unitName: string, quantity: number): string {
  const normalized = unitName.trim().toLocaleLowerCase();
  if (/^(bird|birds|bd|bds)$/.test(normalized)) {
    return quantity === 1 ? "bird" : "birds";
  }
  if (quantity === 1) {
    return normalized.endsWith("s") ? normalized.slice(0, -1) : normalized;
  }
  return normalized.endsWith("s") ? normalized : `${normalized}s`;
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
  const {
    sharedMessage,
    nativeError: shareNativeError,
    clearSharedMessage,
  } = usePaymentMessageImport();
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
  const updateContact = useUpdateContact(auth.user?.id ?? "", farmId ?? "");
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
  const [paymentSmsMessageId, setPaymentSmsMessageId] = useState<string | null>(
    null,
  );
  const [paymentDate, setPaymentDate] = useState<string | null>(null);
  const [paymentTime, setPaymentTime] = useState<string | null>(null);
  const [smsPickerOpen, setSmsPickerOpen] = useState(false);
  const [smsTargetPaymentId, setSmsTargetPaymentId] = useState<string | null>(
    null,
  );
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
  const fieldRefs = useRef(new Map<string, TextInputInstance>());
  const fieldFocusRequest = useRef(0);
  const [result, setResult] = useState<ChickenPurchaseResult | null>(null);
  const recordPurchasePayment = useRecordChickenPurchasePayment(
    auth.user?.id ?? "",
    farmId ?? "",
    result?.id ?? "",
  );
  const reschedulePurchaseReminder = useRescheduleReminder(
    auth.user?.id ?? "",
    farmId ?? "",
    savedBalanceReminder?.id ?? "",
  );
  const cancelPurchaseReminder = useCancelReminder(
    auth.user?.id ?? "",
    farmId ?? "",
    savedBalanceReminder?.id ?? "",
  );
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const [balancePaymentAmount, setBalancePaymentAmount] = useState("");
  const [balancePaymentMethod, setBalancePaymentMethod] =
    useState<ChickenPaymentMethod>("mpesa");
  const [balancePaymentReference, setBalancePaymentReference] = useState("");
  const [balancePaymentSmsMessageId, setBalancePaymentSmsMessageId] =
    useState<string | null>(null);
  const [balancePaymentDate, setBalancePaymentDate] = useState<string | null>(
    null,
  );
  const [balancePaymentTime, setBalancePaymentTime] = useState<string | null>(
    null,
  );
  const [balanceSmsPickerOpen, setBalanceSmsPickerOpen] = useState(false);
  const [recordedBalanceSmsMessageIds, setRecordedBalanceSmsMessageIds] =
    useState<string[]>([]);
  const [balancePaymentError, setBalancePaymentError] = useState<string | null>(null);
  const [reminderEditorOpen, setReminderEditorOpen] = useState(false);
  const [reminderEditError, setReminderEditError] = useState<string | null>(null);
  const [reminderCancelError, setReminderCancelError] = useState<string | null>(null);
  const [copiedReference, setCopiedReference] = useState<string | null>(null);
  const [arrivalOpen, setArrivalOpen] = useState(false);
  const [arrivalDate, setArrivalDate] = useState(farmToday);
  const [arrivalNotes, setArrivalNotes] = useState("");
  const [arrivalDrafts, setArrivalDrafts] = useState<ArrivalBatchDraft[]>([]);
  const [arrivalError, setArrivalError] = useState<string | null>(null);
  const [messageReview, setMessageReview] = useState<{
    id: string;
    payment: NormalizedPaymentMessage;
  } | null>(null);
  const [messageImportError, setMessageImportError] = useState<string | null>(
    null,
  );
  const [draftStorageError, setDraftStorageError] = useState<string | null>(
    null,
  );
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null);
  const [leavePromptVisible, setLeavePromptVisible] = useState(false);
  const [leaveDraftError, setLeaveDraftError] = useState<string | null>(null);
  const [leaveActionPending, setLeaveActionPending] = useState(false);
  const parsedShareId = useRef<string | null>(null);
  const draftWriteChain = useRef<Promise<void>>(Promise.resolve());
  const leaveActionRef = useRef<(() => void) | null>(null);
  const discardDraftWritesRef = useRef(false);
  const draftKey =
    Platform.OS === "android" && auth.user?.id && farmId
      ? `farmtrack.chicken-purchase-draft.${auth.user.id}.${farmId}`
      : null;
  const selectedPurchaseDate = purchaseDate ?? farmToday;
  const defaultChickenProduct = options.data?.products[0];
  const items = itemDrafts.map((item) => {
    const product =
      options.data?.products.find((candidate) => candidate.id === item.productId) ??
      (!item.productId ? defaultChickenProduct : undefined);
    const defaultUnit = product?.product_units.find((unit) => unit.is_base_unit) ??
      product?.product_units[0];
    const legacyUnitEntry =
      item.unitEntries.length === 0 &&
      item.unitId &&
      item.quantity !== undefined &&
      item.unitPrice !== undefined
        ? [
            {
              id: `${item.id}-unit-legacy`,
              unitId: item.unitId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            },
          ]
        : [];
    const unitEntries =
      item.unitEntries.length > 0
        ? item.unitEntries
        : legacyUnitEntry.length > 0
          ? legacyUnitEntry
          : defaultUnit
            ? [
                {
                  id: `${item.id}-unit-default`,
                  unitId: defaultUnit.unit_id,
                  quantity: "",
                  unitPrice: "",
                },
              ]
            : [];
    if (item.productId || !product) {
      return { ...item, unitEntries };
    }
    return {
      ...item,
      productId: product.id,
      unitEntries,
    };
  });

  function bindFieldRef(key: string, input: TextInputInstance | null) {
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
    items.flatMap((item) =>
      item.unitEntries.map((entry) => ({
        quantity: entry.quantity,
        unitPrice: entry.unitPrice,
        conversionFactor:
          options.data?.products
            .find((product) => product.id === item.productId)
            ?.product_units.find((unit) => unit.unit_id === entry.unitId)
            ?.conversion_factor ?? 1,
      })),
    ),
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
  const existingSmsMessageIds = [
    ...(paymentSmsMessageId ? [paymentSmsMessageId] : []),
    ...additionalPayments
      .map((payment) => payment.smsMessageId)
      .filter((messageId): messageId is string => Boolean(messageId)),
  ];
  const balanceDueCents =
    purchaseTotalCents > paidNowCents ? purchaseTotalCents - paidNowCents : 0n;
  const creditBalanceCents =
    paidNowCents > purchaseTotalCents ? paidNowCents - purchaseTotalCents : 0n;
  const importExpectedAmount = fullyPaid
    ? centsToDecimal(purchaseTotalCents)
    : paymentAmount.trim() ||
      (purchaseTotalCents > 0n ? centsToDecimal(purchaseTotalCents) : null);
  const importAssessment = messageReview
    ? assessImportedPayment(
        messageReview.payment,
        importExpectedAmount,
        [
          paymentReference,
          ...additionalPayments.map((payment) => payment.reference),
        ].filter(Boolean),
      )
    : null;
  const importWarnings = messageReview
    ? [...messageReview.payment.warnings]
    : [];
  const selectedSupplier = options.data?.suppliers.find(
    (supplier) => supplier.id === supplierId,
  );
  const draftSupplier =
    supplierFormOpen &&
    (newSupplierName.trim() ||
      newSupplierPhone.trim() ||
      newSupplierEmail.trim())
      ? {
          name: newSupplierName.trim(),
          phone: newSupplierPhone.trim(),
          email: newSupplierEmail.trim(),
        }
      : null;
  const reviewSupplier = selectedSupplier ?? draftSupplier;
  if (
    messageReview?.payment.recipientName &&
    selectedSupplier &&
    messageReview.payment.recipientName.trim().toLowerCase() !==
      selectedSupplier.name.trim().toLowerCase()
  ) {
    importWarnings.push(
      `The message recipient “${messageReview.payment.recipientName}” differs from the selected supplier “${selectedSupplier.name}”. Check the recipient; FarmTrack will not change the supplier.`,
    );
  }
  const importCurrencyMismatch = Boolean(
    messageReview?.payment.currency &&
      messageReview.payment.currency.toUpperCase() !== theme.currency.toUpperCase(),
  );
  const importBlockReason = messageReview
    ? messageReview.payment.transactionStatus !== "SUCCESS"
      ? "Only a message classified as a successful payment can be imported. You can enter payment details manually instead."
      : importCurrencyMismatch
        ? `The message currency (${messageReview.payment.currency}) differs from the farm currency (${theme.currency}). Convert and enter the payment manually.`
        : importAssessment?.duplicateReference
          ? "This transaction reference is already present in the current purchase form."
          : undefined
    : undefined;
  const draftSnapshot = JSON.stringify({
    version: 1,
    savedAt: 0,
    step,
    purchaseDate,
    supplierId,
    supplierFormOpen,
    newSupplierName,
    newSupplierPhone,
    newSupplierEmail,
    purchaseNotes,
    itemDrafts,
    recordPayment,
    fullyPaid,
    paymentAmount,
    paymentMethod,
    paymentReference,
    paymentSmsMessageId,
    paymentDate,
    paymentTime,
    additionalPayments,
    remindForSettlement,
    reminderDueDate,
    reminderDueTime,
    discountType,
    discountValue,
    discountReason,
    discountConfirmed,
    overpaymentConfirmed,
  });
  const hasUnsavedPurchase = Boolean(
    purchaseDate ||
      supplierId ||
      newSupplierName.trim() ||
      newSupplierPhone.trim() ||
      newSupplierEmail.trim() ||
      purchaseNotes.trim() ||
      itemDrafts.some(
        (item) =>
          item.productId ||
          item.chickenType !== "layers" ||
          item.unitEntries.some(
            (entry) =>
              entry.quantity.trim() ||
              entry.unitId ||
              entry.unitPrice.trim(),
          ) ||
          item.notes.trim(),
      ) ||
      recordPayment ||
      paymentAmount.trim() ||
      paymentReference.trim() ||
      paymentSmsMessageId ||
      additionalPayments.length > 0 ||
      remindForSettlement ||
      discountType !== null ||
      discountValue.trim() ||
      discountReason.trim(),
  );

  async function dismissPaymentMessageImport(id: string) {
    try {
      await clearSharedMessage(id);
      setMessageReview(null);
      setMessageImportError(null);
    } catch {
      setMessageImportError(
        "FarmTrack could not clear the shared message. It remains available for review.",
      );
    }
  }

  async function applySelectedSmsPayments(
    selectedPayments: SelectedSmsPayment[],
    mode: "add" | "replace",
  ) {
    if (selectedPayments.length === 0) return;
    if (!draftKey || loadedDraftKey !== draftKey) {
      setMessageImportError(
        "FarmTrack is still restoring the purchase draft. Please try again.",
      );
      return;
    }

    const hasExistingPayment =
      fullyPaid ||
      paymentAmount.trim() ||
      additionalPayments.length > 0;
    if (mode === "replace" && hasExistingPayment) {
      const replace = await dialog.confirmDialog({
        title: "Replace current payment details?",
        message:
          "The selected SMS payments will replace all payment amounts and references currently entered. Your purchase details will stay unchanged.",
        tone: "warning",
        cancelLabel: "Keep current details",
        confirmLabel: "Use selected messages",
      });
      if (!replace) return;
    }

    const paymentSelections =
      mode === "add"
        ? selectedPayments.filter(
            ({ messageId }) => !existingSmsMessageIds.includes(messageId),
          )
        : selectedPayments;
    if (paymentSelections.length === 0) {
      setMessageImportError(
        mode === "add"
          ? "Those messages are already in the payment list. Select a new payment or use Replace list."
          : "Select at least one payment message to replace the current list.",
      );
      return;
    }

    if (
      smsTargetPaymentId === FIRST_PAYMENT_TARGET &&
      (fullyPaid || paymentAmount.trim() || paymentReference.trim())
    ) {
      const replaceFirstPayment = await dialog.confirmDialog({
        title: "Replace payment 1?",
        message:
          "The first selected M-Pesa message will fill payment 1. Any other selected messages will become separate payments.",
        tone: "warning",
        details: [
          {
            label: "Current payment 1",
            value: fullyPaid
              ? formatCents(purchaseTotalCents, theme.currency)
              : formatCents(
                  parseMoneyToCents(paymentAmount) ?? 0n,
                  theme.currency,
                ),
          },
        ],
        cancelLabel: "Keep current payment",
        confirmLabel: "Use selected message",
      });
      if (!replaceFirstPayment) return;
    }

    if (
      paymentSelections.some(
        ({ payment }) => !payment.amount || !payment.transactionDate,
      )
    ) {
      setMessageImportError(
        "A selected message is missing a usable amount or date. Choose another message or enter the payment manually.",
      );
      return;
    }

    const incomingRecipients = paymentSelections
      .map(({ payment }) => ({
        name: payment.recipientName?.trim() ?? "",
        phone: payment.recipientPhone?.trim() ?? "",
      }))
      .filter((recipient) => recipient.name || recipient.phone);
    const uniqueNames = [
      ...new Set(
        incomingRecipients
          .map(({ name }) => name.toLocaleLowerCase())
          .filter(Boolean),
      ),
    ];
    const uniquePhones = [
      ...new Set(
        incomingRecipients
          .map(({ phone }) => phone.replace(/\D/g, ""))
          .filter(Boolean),
      ),
    ];
    if (uniqueNames.length > 1 || uniquePhones.length > 1) {
      await dialog.showDialog({
        title: "Different recipients in selected messages",
        message:
          "The selected payments name different recipients. Payment entries will be added, but FarmTrack will not change supplier details.",
        tone: "info",
      });
    } else if (incomingRecipients.length > 0) {
      const smsRecipient = {
        name: incomingRecipients.find(({ name }) => name)?.name ?? "",
        phone: incomingRecipients.find(({ phone }) => phone)?.phone ?? "",
      };
      const selectedSupplier = options.data?.suppliers.find(
        (supplier) => supplier.id === supplierId,
      );
      const currentName = selectedSupplier?.name.trim() ?? newSupplierName.trim();
      const currentPhone = selectedSupplier?.phone?.trim() ?? newSupplierPhone.trim();
      const differs =
        (smsRecipient.name &&
          smsRecipient.name.toLocaleLowerCase() !== currentName.toLocaleLowerCase()) ||
        (smsRecipient.phone &&
          smsRecipient.phone.replace(/\D/g, "") !==
            currentPhone.replace(/\D/g, ""));
      const hasSupplierDetails = Boolean(currentName || currentPhone);

      if (!selectedSupplier && !hasSupplierDetails) {
        setSupplierFormOpen(true);
        if (smsRecipient.name) setNewSupplierName(smsRecipient.name);
        if (smsRecipient.phone) setNewSupplierPhone(smsRecipient.phone);
      } else if (hasSupplierDetails && differs) {
        const useSmsRecipient = await dialog.confirmDialog({
          title: "Recipient differs from supplier",
          message: selectedSupplier
            ? `The payment is addressed to ${smsRecipient.name || smsRecipient.phone}, while the selected supplier is ${selectedSupplier.name}. Use which details?`
            : `The payment is addressed to ${smsRecipient.name || smsRecipient.phone}, which differs from the supplier details you entered. Use which details?`,
          tone: "info",
          details: [
            ...(smsRecipient.name
              ? [{ label: "SMS name", value: smsRecipient.name }]
              : []),
            ...(smsRecipient.phone
              ? [{ label: "SMS phone", value: smsRecipient.phone }]
              : []),
          ],
          cancelLabel: selectedSupplier
            ? "Keep supplier details"
            : "Keep entered details",
          confirmLabel: "Use SMS details",
        });
        if (useSmsRecipient) {
          if (selectedSupplier) {
            try {
              await updateContact.mutateAsync({
                contactId: selectedSupplier.id,
                payload: {
                  name: smsRecipient.name || selectedSupplier.name,
                  phone: smsRecipient.phone || selectedSupplier.phone,
                  roles: selectedSupplier.roles,
                },
              });
            } catch (contactError: unknown) {
              await dialog.showDialog({
                title: "Supplier details were not updated",
                message: normalizeApiError(contactError).message,
                tone: "error",
              });
              return;
            }
          } else {
            setSupplierFormOpen(true);
            if (smsRecipient.name) setNewSupplierName(smsRecipient.name);
            if (smsRecipient.phone) setNewSupplierPhone(smsRecipient.phone);
          }
        }
      }
    }

    const toDraft = (payment: SelectedSmsPayment): AdditionalPaymentDraft => ({
      id: `sms-${payment.messageId}`,
      smsMessageId: payment.messageId,
      amount: payment.payment.amount ?? "",
      method: "mpesa",
      reference: payment.payment.transactionReference ?? "",
      date: payment.payment.transactionDate ?? selectedPurchaseDate,
      time: payment.payment.transactionTime,
    });
    const nextEntries = paymentSelections.map(toDraft);
    const [first, ...rest] = nextEntries;
    if (smsTargetPaymentId) {
      if (mode !== "add") {
        setMessageImportError(
          "This payment changed while messages were open. Close the picker and try again.",
        );
        return;
      }
      setRecordPayment(true);
      setFullyPaid(false);
      if (smsTargetPaymentId === FIRST_PAYMENT_TARGET) {
        setPaymentAmount(first.amount);
        setPaymentMethod(first.method);
        setPaymentReference(first.reference);
        setPaymentSmsMessageId(first.smsMessageId ?? null);
        setPaymentDate(first.date);
        setPaymentTime(first.time);
        setAdditionalPayments((current) => [...current, ...rest]);
      } else {
        setAdditionalPayments((current) => [
          ...current.map((payment) =>
            payment.id === smsTargetPaymentId ? first : payment,
          ),
          ...rest,
        ]);
      }
    } else if (mode === "add" && hasExistingPayment) {
      setRecordPayment(true);
      setFullyPaid(false);
      const firstPaymentIsEmpty =
        !fullyPaid &&
        !paymentAmount.trim() &&
        !paymentReference.trim() &&
        !paymentSmsMessageId;
      if (firstPaymentIsEmpty) {
        setPaymentAmount(first.amount);
        setPaymentMethod(first.method);
        setPaymentReference(first.reference);
        setPaymentSmsMessageId(first.smsMessageId ?? null);
        setPaymentDate(first.date);
        setPaymentTime(first.time);
        setAdditionalPayments((current) => [...current, ...rest]);
      } else {
        setAdditionalPayments((current) => [...current, ...nextEntries]);
      }
    } else {
      setRecordPayment(true);
      setFullyPaid(false);
      setPaymentAmount(first.amount);
      setPaymentMethod(first.method);
      setPaymentReference(first.reference);
      setPaymentSmsMessageId(first.smsMessageId ?? null);
      setPaymentDate(first.date);
      setPaymentTime(first.time);
      setAdditionalPayments(rest);
    }

    setOverpaymentConfirmed(false);
    setMessageImportError(null);
    setSmsTargetPaymentId(null);
    setSmsPickerOpen(false);
  }

  async function applyImportedPayment(edits: PaymentMessageEdits) {
    if (!messageReview) return;
    setMessageImportError(null);
    const amountCents = parseMoneyToCents(edits.amount);
    if (amountCents === null || amountCents <= 0n) {
      setMessageImportError("Enter a valid payment amount before importing.");
      return;
    }
    if (!parseDate(edits.date)) {
      setMessageImportError(
        "Enter a valid transaction date. FarmTrack will not substitute the import date.",
      );
      return;
    }
    if (
      edits.time &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(edits.time)
    ) {
      setMessageImportError("Enter the transaction time in 24-hour HH:mm format.");
      return;
    }
    if (edits.reference.length > 100) {
      setMessageImportError("The transaction reference is too long.");
      return;
    }
    const reference = edits.reference.trim();
    const duplicate = reference
      ? [
          paymentReference,
          ...additionalPayments.map((payment) => payment.reference),
        ].some(
          (existing) =>
            existing.trim().toUpperCase() === reference.toUpperCase(),
        )
      : false;
    if (duplicate) {
      setMessageImportError(
        "This transaction reference is already present in the current purchase form.",
      );
      return;
    }
    if (
      paymentAmount.trim() &&
      parseMoneyToCents(paymentAmount) !== amountCents
    ) {
      const replace = await dialog.confirmDialog({
        title: "Replace the entered payment?",
        message:
          "The imported amount differs from the amount already entered. Use the reviewed message amount and reference instead?",
        tone: "warning",
        cancelLabel: "Keep my amount",
        confirmLabel: "Use imported amount",
      });
      if (!replace) return;
    }
    const isOverpayment =
      purchaseTotalCents > 0n &&
      amountCents + additionalPaymentCents > purchaseTotalCents;
    if (isOverpayment) {
      const confirmed = await dialog.confirmDialog({
        title: "Payments exceed the purchase",
        message:
          "The purchase total will not change. If you continue, any amount above it will be recorded as supplier credit using the existing purchase rules.",
        tone: "warning",
        details: [
          {
            label: "Purchase total",
            value: formatCents(purchaseTotalCents, theme.currency),
          },
          {
            label: "Payments including this message",
            value: formatCents(amountCents + additionalPaymentCents, theme.currency),
          },
        ],
        cancelLabel: "Review amount",
        confirmLabel: "Use amount",
      });
      if (!confirmed) return;
    }
    if (!draftKey || loadedDraftKey !== draftKey) {
      setMessageImportError(
        "FarmTrack is still restoring the purchase draft. Please try again.",
      );
      return;
    }

    const updatedDraft = {
      ...JSON.parse(draftSnapshot),
      step: 2,
      recordPayment: true,
      fullyPaid: false,
      paymentAmount: centsToDecimal(amountCents),
      paymentMethod: "mpesa",
      paymentReference: reference,
      paymentSmsMessageId: null,
      paymentDate: edits.date,
      paymentTime: edits.time || null,
      overpaymentConfirmed: isOverpayment,
    };
    try {
      await persistDraftSnapshot(draftKey, JSON.stringify(updatedDraft));
      await clearSharedMessage(messageReview.id);
    } catch {
      setMessageImportError(
        "FarmTrack could not safely save the reviewed payment details or clear the share. The message remains available; try again.",
      );
      return;
    }

    setRecordPayment(true);
    setFullyPaid(false);
    setPaymentAmount(centsToDecimal(amountCents));
    setPaymentMethod("mpesa");
    setPaymentReference(reference);
    setPaymentSmsMessageId(null);
    setPaymentDate(edits.date);
    setPaymentTime(edits.time || null);
    setOverpaymentConfirmed(isOverpayment);
    setMessageReview(null);
  }

  function persistDraftSnapshot(key: string, serialized: string) {
    draftWriteChain.current = draftWriteChain.current
      .catch(() => undefined)
      .then(async () => {
        if (discardDraftWritesRef.current) return;
        const draft = purchaseDraftSchema.parse(JSON.parse(serialized));
        await SecureStore.setItemAsync(
          key,
          JSON.stringify({ ...draft, savedAt: Date.now() }),
        );
      });
    return draftWriteChain.current;
  }

  useEffect(() => {
    if (!draftKey) return;
    let active = true;
    const timer = setTimeout(() => {
      discardDraftWritesRef.current = false;
      setLoadedDraftKey(null);
      setStep(0);
      setPurchaseDate(null);
      setSupplierId("");
      setSupplierFormOpen(false);
      setNewSupplierName("");
      setNewSupplierPhone("");
      setNewSupplierEmail("");
      setPurchaseNotes("");
      setItemDrafts([createItemDraft()]);
      setRecordPayment(false);
      setFullyPaid(false);
      setPaymentAmount("");
      setPaymentMethod("cash");
      setPaymentReference("");
      setPaymentSmsMessageId(null);
      setPaymentDate(null);
      setPaymentTime(null);
      setSmsPickerOpen(false);
      setSmsTargetPaymentId(null);
      setAdditionalPayments([]);
      setRemindForSettlement(false);
      setReminderDueDate(addDaysToDate(farmToday, 1));
      setReminderDueTime("09:00");
      setDiscountType(null);
      setDiscountValue("");
      setDiscountReason("");
      setDiscountConfirmed(false);
      setOverpaymentConfirmed(false);
      setSavedBalanceReminder(null);
      setResult(null);
      setPaymentFormOpen(false);
      setBalancePaymentAmount("");
      setBalancePaymentMethod("mpesa");
      setBalancePaymentReference("");
      setBalancePaymentSmsMessageId(null);
      setBalancePaymentDate(null);
      setBalancePaymentTime(null);
      setBalanceSmsPickerOpen(false);
      setRecordedBalanceSmsMessageIds([]);
      setBalancePaymentError(null);
      setMessageReview(null);
      setMessageImportError(null);
      void SecureStore.getItemAsync(draftKey)
        .then(async (value) => {
          if (!active) return;
          if (!value) {
            setLoadedDraftKey(draftKey);
            setDraftStorageError(null);
            return;
          }
          let parsed: ReturnType<typeof purchaseDraftSchema.safeParse>;
          try {
            parsed = purchaseDraftSchema.safeParse(JSON.parse(value));
          } catch {
            parsed = purchaseDraftSchema.safeParse(null);
          }
          if (!parsed.success) {
            setDraftStorageError(
              "The saved chicken purchase draft could not be read. You can continue with a new entry.",
            );
            setLoadedDraftKey(draftKey);
            return;
          }
          if (Date.now() - parsed.data.savedAt > 14 * 24 * 60 * 60 * 1000) {
            await SecureStore.deleteItemAsync(draftKey);
            if (!active) return;
            setDraftStorageError(
              "An old chicken purchase draft was cleared. Start a new purchase to continue.",
            );
            setLoadedDraftKey(draftKey);
            return;
          }
          const draft = parsed.data;
          setStep(draft.step);
          setPurchaseDate(draft.purchaseDate);
          setSupplierId(draft.supplierId);
          setSupplierFormOpen(draft.supplierFormOpen);
          setNewSupplierName(draft.newSupplierName);
          setNewSupplierPhone(draft.newSupplierPhone);
          setNewSupplierEmail(draft.newSupplierEmail);
          setPurchaseNotes(draft.purchaseNotes);
          setItemDrafts(
            draft.itemDrafts.map((item) => ({
              id: item.id,
              productId: item.productId,
              chickenType: item.chickenType,
              unitEntries:
                item.unitEntries ??
                (item.unitId
                  ? [
                      {
                        id: `${item.id}-unit-legacy`,
                        unitId: item.unitId,
                        quantity: item.quantity ?? "",
                        unitPrice: item.unitPrice ?? "",
                      },
                    ]
                  : []),
              notes: item.notes,
            })),
          );
          setRecordPayment(draft.recordPayment);
          setFullyPaid(draft.fullyPaid);
          setPaymentAmount(draft.paymentAmount);
          setPaymentMethod(draft.paymentMethod);
          setPaymentReference(draft.paymentReference);
          setPaymentSmsMessageId(draft.paymentSmsMessageId ?? null);
          setPaymentDate(draft.paymentDate);
          setPaymentTime(draft.paymentTime);
          setAdditionalPayments(
            draft.additionalPayments.map((payment) => ({
              ...payment,
              date: payment.date ?? draft.paymentDate ?? farmToday,
              time: payment.time ?? null,
            })),
          );
          setRemindForSettlement(draft.remindForSettlement);
          setReminderDueDate(draft.reminderDueDate);
          setReminderDueTime(draft.reminderDueTime);
          setDiscountType(draft.discountType);
          setDiscountValue(draft.discountValue);
          setDiscountReason(draft.discountReason);
          setDiscountConfirmed(draft.discountConfirmed);
          setOverpaymentConfirmed(draft.overpaymentConfirmed);
          setDraftStorageError(null);
          setLoadedDraftKey(draftKey);
        })
        .catch(() => {
          if (!active) return;
          setDraftStorageError(
            "FarmTrack could not access the saved purchase draft. Your current entry will remain on screen.",
          );
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [draftKey, farmToday]);

  useEffect(() => {
    if (!draftKey || loadedDraftKey !== draftKey) return;
    const timer = setTimeout(() => {
      void persistDraftSnapshot(draftKey, draftSnapshot).catch(() => {
        setDraftStorageError(
          "FarmTrack could not save this purchase draft securely.",
        );
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [draftKey, draftSnapshot, loadedDraftKey]);

  const shouldPreventRemove = Boolean(
    draftKey && loadedDraftKey === draftKey && hasUnsavedPurchase && !result,
  );
  const [navigationAllowed, setNavigationAllowed] = useState(false);
  usePreventRemove(
    shouldPreventRemove && !navigationAllowed,
    ({ repeat }) => {
      leaveActionRef.current = repeat;
      setLeaveDraftError(null);
      setLeavePromptVisible(true);
    },
  );

  useEffect(() => {
    if (!draftKey || loadedDraftKey !== draftKey) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "background") return;
      void persistDraftSnapshot(draftKey, draftSnapshot).catch(() => {
        setDraftStorageError(
          "FarmTrack could not save this purchase draft securely.",
        );
      });
    });
    return () => subscription.remove();
  }, [draftKey, draftSnapshot, loadedDraftKey]);

  useEffect(() => {
    if (!sharedMessage || parsedShareId.current === sharedMessage.id) return;
    const timer = setTimeout(() => {
      parsedShareId.current = sharedMessage.id;
      setMessageImportError(null);
      try {
        setMessageReview({
          id: sharedMessage.id,
          payment: parsePaymentMessage(sharedMessage.text),
        });
      } catch {
        setMessageImportError("FarmTrack could not read this shared message.");
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [sharedMessage]);

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
      changes.productId !== undefined ||
      changes.unitEntries !== undefined
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
      unitEntries: defaultUnit
        ? [
            {
              id: `${item.id}-${defaultUnit.unit_id}`,
              unitId: defaultUnit.unit_id,
              quantity: "",
              unitPrice: "",
            },
          ]
        : [],
    });
  }

  function toggleItemUnit(item: PurchaseItemDraft, unit: ProductUnit) {
    const currentEntries = item.unitEntries;
    const selected = currentEntries.some(
      (entry) => entry.unitId === unit.unit_id,
    );
    const unitEntries = selected
      ? currentEntries.filter((entry) => entry.unitId !== unit.unit_id)
      : [
          ...currentEntries,
          {
            id: `${item.id}-${unit.unit_id}`,
            unitId: unit.unit_id,
            quantity: "",
            unitPrice: "",
          },
        ];
    updateItem(item.id, { unitEntries });
  }

  function updateItemUnit(
    item: PurchaseItemDraft,
    unitEntryId: string,
    changes: Partial<PurchaseUnitEntryDraft>,
  ) {
    updateItem(item.id, {
      unitEntries: item.unitEntries.map((entry) =>
        entry.id === unitEntryId ? { ...entry, ...changes } : entry,
      ),
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
        if (item.unitEntries.length === 0) {
          return reportFieldError(
            `Choose at least one purchase unit for item ${index + 1}.`,
            `batch:${item.id}:unit`,
          );
        }
        for (const entry of item.unitEntries) {
          if (
            !product.product_units.some(
              (unit) => unit.unit_id === entry.unitId,
            )
          ) {
            return reportFieldError(
              `Choose a valid unit for item ${index + 1}.`,
              `batch:${item.id}:unit`,
            );
          }
          const quantity = Number(entry.quantity);
          if (!Number.isSafeInteger(quantity) || quantity < 1) {
            return reportFieldError(
              `Enter a whole-number quantity above zero for each selected unit in item ${index + 1}.`,
              `batch:${item.id}:quantity:${entry.id}`,
            );
          }
          if (parseMoneyToCents(entry.unitPrice) === null) {
            return reportFieldError(
              `Enter a price with up to two decimal places for each selected unit in item ${index + 1}. Use 0 if the chickens are free.`,
              `batch:${item.id}:unit-price:${entry.id}`,
            );
          }
        }
      }
      if (discountType && purchasePricing.error) {
        return reportFieldError(purchasePricing.error, "discount:value");
      }
    }
    if (step === 2 && recordPayment) {
      if (paymentDate && !parseDate(paymentDate)) {
        return reportFieldError(
          "Choose a valid payment date.",
          "payment:date",
        );
      }
      if (
        paymentTime &&
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(paymentTime)
      ) {
        return reportFieldError(
          "Choose a valid payment time.",
          "payment:time",
        );
      }
      for (const payment of additionalPayments) {
        if (payment.date && !parseDate(payment.date)) {
          return reportFieldError(
            "Choose a valid date for each additional payment.",
            `payment:${payment.id}:date`,
          );
        }
        if (
          payment.time &&
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(payment.time)
        ) {
          return reportFieldError(
            "Choose a valid time for each additional payment.",
            `payment:${payment.id}:time`,
          );
        }
      }
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

  async function copyPurchaseValue(value: string) {
    try {
      await Clipboard.setStringAsync(value);
      setCopiedReference(value);
    } catch (copyError: unknown) {
      await dialog.showDialog({
        title: "Couldn’t copy",
        message: normalizeApiError(copyError).message,
        tone: "error",
      });
    }
  }

  async function submitBalancePayment() {
    if (!farmId || !result) return;
    setBalancePaymentError(null);
    const balanceCents = parseMoneyToCents(String(result.balance_due)) ?? 0n;
    const amountCents = parseMoneyToCents(balancePaymentAmount);
    if (amountCents === null || amountCents <= 0n) {
      setBalancePaymentError("Enter a payment amount greater than zero.");
      return;
    }
    if (amountCents > balanceCents) {
      setBalancePaymentError("Payment cannot be more than the balance due.");
      return;
    }
    const reference = balancePaymentReference.trim();
    if (balancePaymentMethod !== "cash" && !reference) {
      setBalancePaymentError("Enter a reference for M-Pesa or bank payments.");
      return;
    }
    if (
      balancePaymentMethod === "mpesa" &&
      reference &&
      result.payments.some(
        (payment) =>
          payment.reference_number?.trim().toUpperCase() ===
          reference.toUpperCase(),
      )
    ) {
      setBalancePaymentError(
        "That M-Pesa reference is already recorded for this purchase.",
      );
      return;
    }

    try {
      const recorded = await recordPurchasePayment.mutateAsync({
        amount: centsToDecimal(amountCents),
        payment_date: balancePaymentDate ?? farmToday,
        payment_time:
          balancePaymentTime ??
          farmLocalTime(farm.selectedFarm?.settings?.timezone),
        payment_method: balancePaymentMethod,
        reference_number: reference || undefined,
      });
      setResult((current) => current && current.id === result.id
        ? {
            ...current,
            amount_paid: recorded.amount_paid,
            balance_due: recorded.balance_due,
            credit_balance: recorded.credit_balance,
            payments: [...current.payments, recorded.payment],
          }
        : current);
      if (balancePaymentSmsMessageId) {
        setRecordedBalanceSmsMessageIds((current) =>
          current.includes(balancePaymentSmsMessageId)
            ? current
            : [...current, balancePaymentSmsMessageId],
        );
      }
      if (
        (parseMoneyToCents(String(recorded.balance_due)) ?? 0n) === 0n &&
        savedBalanceReminder
      ) {
        try {
          await cancelPurchaseReminder.mutateAsync();
          setSavedBalanceReminder(null);
          setReminderCancelError(null);
        } catch (cancelError: unknown) {
          setReminderCancelError(
            `Payment was recorded, but the reminder could not be cancelled: ${normalizeApiError(cancelError).message}`,
          );
        }
      }
      setPaymentFormOpen(false);
      setSmsPickerOpen(false);
      setSmsTargetPaymentId(null);
      setMessageReview(null);
      setMessageImportError(null);
      setBalancePaymentAmount("");
      setBalancePaymentReference("");
      setBalancePaymentSmsMessageId(null);
      setBalancePaymentDate(null);
      setBalancePaymentTime(null);
    } catch (paymentError: unknown) {
      setBalancePaymentError(normalizeApiError(paymentError).message);
    }
  }

  function applyBalanceSmsPayment(selectedPayments: SelectedSmsPayment[]) {
    const selected = selectedPayments[0];
    if (!selected) return;
    const { payment } = selected;
    if (!payment.amount || !payment.transactionDate) {
      setBalancePaymentError(
        "This message is missing a usable amount or date. Enter the payment manually or choose another message.",
      );
      return;
    }
    setBalancePaymentAmount(payment.amount);
    setBalancePaymentMethod("mpesa");
    setBalancePaymentReference(payment.transactionReference ?? "");
    setBalancePaymentSmsMessageId(selected.messageId);
    setBalancePaymentDate(payment.transactionDate);
    setBalancePaymentTime(payment.transactionTime ?? null);
    setBalancePaymentError(null);
    setBalanceSmsPickerOpen(false);
  }

  function openReminderEditor(reminder: Reminder) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: farm.selectedFarm?.settings?.timezone ?? "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(reminder.due_at));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    setReminderDueDate(`${value("year")}-${value("month")}-${value("day")}`);
    setReminderDueTime(`${value("hour")}:${value("minute")}`);
    setReminderEditError(null);
    setReminderEditorOpen(true);
  }

  async function saveReminderChanges() {
    if (!savedBalanceReminder) return;
    setReminderEditError(null);
    if (
      !parseDate(reminderDueDate) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderDueTime)
    ) {
      setReminderEditError("Choose a valid reminder date and time.");
      return;
    }
    if (
      `${reminderDueDate}T${reminderDueTime}` <=
      `${farmToday}T${farmLocalTime(farm.selectedFarm?.settings?.timezone)}`
    ) {
      setReminderEditError("Choose a reminder time in the future for this farm.");
      return;
    }
    try {
      const updated = await reschedulePurchaseReminder.mutateAsync(
        `${reminderDueDate}T${reminderDueTime}:00`,
      );
      setSavedBalanceReminder(updated);
      setReminderEditorOpen(false);
    } catch (rescheduleError: unknown) {
      setReminderEditError(normalizeApiError(rescheduleError).message);
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
        ? `This is exactly ${amountMultiple} times the purchase cost. Check whether you meant ${formatCents(purchaseTotalCents, theme.currency)}.`
        : "";
      const confirmed = await dialog.confirmDialog({
        title: "Payment is higher than the purchase",
        message:
          "Check the amount before continuing. If correct, the extra payment will be saved as credit with this supplier.",
        tone: "warning",
        details: [
          {
            label: "Purchase total",
            value: formatCents(purchaseTotalCents, theme.currency),
          },
          {
            label: "Payment entered",
            value: formatCents(paidNowCents, theme.currency),
          },
          {
            label: "Supplier credit",
            value: formatCents(
              paidNowCents - purchaseTotalCents,
              theme.currency,
            ),
          },
        ],
        note: likelyExtraZero
          ? `${likelyExtraZero} This is a supplier credit, not a confirmed cash refund.`
          : "This is a supplier credit, not a confirmed cash refund.",
        cancelLabel: "Go back and edit",
        confirmLabel: "Record supplier credit",
      });
      if (!confirmed) {
        setStep(2);
        setFocusPaymentAfterReview(true);
        return;
      }
      paymentConfirmed = true;
      setOverpaymentConfirmed(true);
    }
    let purchaseSupplierId = supplierId;
    const supplierName = newSupplierName.trim();
    const supplierPhone = newSupplierPhone.trim();
    const supplierEmail = newSupplierEmail.trim();
    const hasSupplierDraft =
      supplierFormOpen && Boolean(supplierName || supplierPhone || supplierEmail);
    if (hasSupplierDraft && !supplierName) {
      setSupplierError("Enter a supplier name to save these contact details.");
      setStep(0);
      return;
    }
    try {
      if (hasSupplierDraft) {
        const refreshedOptions = await options.refetch();
        if (refreshedOptions.isError) {
          throw refreshedOptions.error;
        }
        if (!refreshedOptions.data) {
          throw new Error("Could not check existing suppliers before saving.");
        }
        const normalizedSupplierName = supplierName.toLocaleLowerCase();
        const existingSupplier = refreshedOptions.data.suppliers.find(
          (supplier) =>
            supplier.name.trim().toLocaleLowerCase() ===
              normalizedSupplierName &&
            (supplier.phone ?? "").trim() === supplierPhone &&
            (supplier.email ?? "").trim().toLocaleLowerCase() ===
              supplierEmail.toLocaleLowerCase(),
        );
        const supplier =
          existingSupplier ??
          (await createContact.mutateAsync({
            name: supplierName,
            roles: ["supplier"],
            phone: supplierPhone || undefined,
            email: supplierEmail || undefined,
          }));
        purchaseSupplierId = supplier.id;
        setSupplierId(supplier.id);
        setSupplierFormOpen(false);
        setNewSupplierName("");
        setNewSupplierPhone("");
        setNewSupplierEmail("");
        setSupplierError(null);
        if (!existingSupplier) await options.refetch();
      }
      const created = await createPurchase.mutateAsync({
        transaction_date: selectedPurchaseDate,
        supplier_id: purchaseSupplierId || undefined,
        notes: purchaseNotes.trim() || undefined,
        discount_type: discountType ?? undefined,
        discount_value: discountType ? discountValue.trim() : "0.00",
        discount_reason:
          discountType && discountReason.trim()
            ? discountReason.trim()
            : undefined,
        overpayment_confirmed: paymentConfirmed,
        items: items.flatMap((item) =>
          item.unitEntries.map((entry) => ({
            product_id: item.productId,
            chicken_type: item.chickenType as ChickenType,
            quantity: Number(entry.quantity),
            unit_id: entry.unitId,
            unit_price: entry.unitPrice.trim(),
            notes: item.notes.trim() || undefined,
          })),
        ),
        payments: recordPayment
          ? [
              {
                amount: centsToDecimal(enteredPaymentCents),
                payment_date: paymentDate ?? selectedPurchaseDate,
                payment_time: paymentTime,
                payment_method: paymentMethod,
                reference_number: paymentReference.trim() || undefined,
              },
              ...additionalPayments.map((payment) => ({
                amount: centsToDecimal(parseMoneyToCents(payment.amount) ?? 0n),
                payment_date: payment.date || selectedPurchaseDate,
                payment_time: payment.time,
                payment_method: payment.method,
                reference_number: payment.reference.trim() || undefined,
              })),
            ]
          : [],
      });
      discardDraftWritesRef.current = true;
      setResult(created);
      if (draftKey) {
        try {
          await draftWriteChain.current.catch(() => undefined);
          await SecureStore.deleteItemAsync(draftKey);
          setLoadedDraftKey(null);
          setDraftStorageError(null);
        } catch {
          setDraftStorageError(
            "The purchase was recorded, but its local draft could not be cleared.",
          );
        }
      }
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
    const resultDiscountCents =
      parseMoneyToCents(String(result.discount_amount)) ?? 0n;
    const resultBalanceDueCents =
      parseMoneyToCents(String(result.balance_due)) ?? 0n;
    const balanceColor = theme.mode === "dark" ? "#F0A35E" : "#A85A12";
    return (
      <PurchaseSuccessShell
        footer={
          <>
            <Button
              label="Back to chickens"
              variant="secondary"
              style={styles.successFooterButton}
              onPress={() => router.replace("/(tabs)/flock")}
            />
            {result.items.some((item) => item.quantity_remaining > 0) ? (
              <Button
                label="Receive chickens"
                style={styles.successFooterButton}
                onPress={() =>
                  router.push({
                    pathname: "/purchases/[purchaseId]/receive",
                    params: { purchaseId: result.id },
                  })
                }
              />
            ) : null}
          </>
        }
      >
        <Animated.View
          entering={FadeInDown.duration(320)}
          style={styles.successContent}
        >
          <View style={styles.successHeading}>
            <View style={[styles.resultMark, { backgroundColor: theme.success }]}>
            <Ionicons name="checkmark" size={24} color="#FFFFFF" />
            </View>
            <AppText size="heading" weight="semibold">
              Purchase recorded
            </AppText>
          </View>
          <View style={styles.successMeta}>
            {result.reference_number ? (
              <>
                <AppText size="small" weight="semibold">{result.reference_number}</AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Copy transaction reference"
                  onPress={() => void copyPurchaseValue(result.reference_number!)}
                >
                  <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                    {copiedReference === result.reference_number ? "Copied" : "Copy"}
                  </AppText>
                </Pressable>
                <AppText size="small" tone="secondary">·</AppText>
              </>
            ) : null}
            <AppText size="small" tone="secondary">
              {formatDateForDisplay(result.transaction_date)}
            </AppText>
            <AppText size="small" tone="secondary">·</AppText>
            <AppText size="small" tone="secondary">
              {options.data.suppliers.find(
                (supplier) => supplier.id === result.contact_id,
              )?.name ?? "No supplier"}
            </AppText>
          </View>

          <View style={[styles.successSection, { borderTopColor: theme.border }]}>
            <View style={styles.deliveryHeading}>
              <AppText weight="semibold">Receive chickens next</AppText>
              <AppText size="small" tone="secondary">
                {result.items.some((item) => item.quantity_remaining > 0)
                  ? "Not received"
                  : "All received"}
              </AppText>
            </View>
            {result.items.map((purchasedItem) => {
              const product = options.data.products.find(
                (candidate) => candidate.id === purchasedItem.product_id,
              );
              const unit = product?.product_units.find(
                (candidate) => candidate.unit_id === purchasedItem.unit_id,
              );
              const ordered = purchasedItem.quantity_received + purchasedItem.quantity_remaining;
              const progress = ordered > 0
                ? (purchasedItem.quantity_received / ordered) * 100
                : 0;
              const unitLabel = chickenPurchaseUnitLabel(
                unit?.unit_abbreviation || unit?.unit_name || "unit",
                ordered,
              );
              return (
                <View key={purchasedItem.id} style={styles.deliveryItem}>
                  <View style={styles.deliveryHeading}>
                    <AppText size="small" weight="semibold">
                      {formatChickenCount(purchasedItem.quantity_received)} of{" "}
                      {formatChickenCount(ordered)} {unitLabel} received
                    </AppText>
                    <AppText size="small" weight="semibold" style={{
                      color: purchasedItem.quantity_remaining === 0 ? theme.success : theme.secondary,
                    }}>
                      {purchasedItem.quantity_remaining === 0
                        ? "Received"
                        : purchasedItem.quantity_received > 0
                          ? "Partly received"
                          : "Awaiting"}
                    </AppText>
                  </View>
                  <View style={[styles.successProgressTrack, { backgroundColor: theme.backgroundSelected }]}>
                    <View style={[styles.successProgressFill, { width: `${Math.min(progress, 100)}%`, backgroundColor: theme.primary }]} />
                  </View>
                  {purchasedItem.quantity_remaining > 0 ? (
                    <AppText size="small" tone="secondary">
                      {formatChickenCount(purchasedItem.quantity_remaining)} {unitLabel} outstanding
                    </AppText>
                  ) : null}
                </View>
              );
            })}
            <AppText size="small" tone="secondary">
              Flock counts update as you record each delivery.
            </AppText>
          </View>

          <View style={[styles.successSection, { borderTopColor: theme.border }]}>
            <AppText weight="semibold">What you bought</AppText>
            {result.items.map((purchasedItem) => {
              const product = options.data.products.find(
                (candidate) => candidate.id === purchasedItem.product_id,
              );
              const unit = product?.product_units.find(
                (candidate) => candidate.unit_id === purchasedItem.unit_id,
              );
              const chickenType = chickenTypes.find(
                (type) => type.value === purchasedItem.chicken_type,
              )?.label;
              const unitLabel = chickenPurchaseUnitLabel(
                unit?.unit_abbreviation || unit?.unit_name || "unit",
                purchasedItem.quantity,
              );
              return (
                <View key={purchasedItem.id} style={styles.purchasedItem}>
                  <View style={styles.purchasedItemHeading}>
                    <View style={styles.flexCopy}>
                      <AppText weight="semibold">
                        {chickenType ?? "Chicken"} · {formatChickenCount(purchasedItem.quantity)} {unitLabel}
                      </AppText>
                      <AppText size="small" tone="secondary">
                        {product?.name ?? "Chicken product"}
                      </AppText>
                    </View>
                  </View>
                  <AppText size="small" tone="secondary">
                    {formatChickenCount(purchasedItem.quantity)} × {formatMoney(purchasedItem.unit_price, theme.currency)} each
                  </AppText>
                </View>
              );
            })}
            <SummaryRow
              label="Subtotal"
              value={formatCents(resultSubtotalCents, theme.currency)}
            />
            {resultDiscountCents > 0n ? (
              <SummaryRow
                label="Discount"
                value={`− ${formatMoney(result.discount_amount, theme.currency)}`}
              />
            ) : null}
            <View style={[styles.purchaseTotalRow, { borderTopColor: theme.border }]}>
              <AppText weight="semibold">Total cost</AppText>
              <AppText weight="semibold">{formatMoney(result.transaction_total, theme.currency)}</AppText>
            </View>
          </View>

          <View style={[styles.successSection, { borderTopColor: theme.border }]}>
            <AppText weight="semibold">Payment</AppText>
            {resultBalanceDueCents > 0n ? (
              <>
                <AppText size="small" tone="secondary">Balance due</AppText>
                <AppText size="title" weight="semibold" style={{ color: balanceColor }}>
                  {formatCents(resultBalanceDueCents, theme.currency)}
                </AppText>
              </>
            ) : (
              <AppText size="body" weight="semibold" style={{ color: theme.success }}>
                {resultCreditBalanceCents > 0n
                  ? `Supplier credit · ${formatCents(resultCreditBalanceCents, theme.currency)}`
                  : "Paid in full"}
              </AppText>
            )}
            {Number(result.transaction_total) > 0 ? (
              <>
                <View style={[styles.successProgressTrack, { backgroundColor: theme.backgroundSelected }]}>
                  <View style={[styles.successProgressFill, {
                    width: `${Math.min((Number(result.amount_paid) / Number(result.transaction_total)) * 100, 100)}%`,
                    backgroundColor: theme.primary,
                  }]} />
                </View>
                <AppText size="small" tone="secondary">
                  {formatMoney(result.amount_paid, theme.currency)} paid of {formatMoney(result.transaction_total, theme.currency)}
                </AppText>
              </>
            ) : null}
            {result.payments.map((payment, index) => {
              const methodName = paymentMethods.find(
                (method) => method.value === payment.payment_method,
              )?.label ?? "Payment";
              return (
                <View key={payment.id ?? `${payment.payment_date}-${index}`} style={styles.paymentLine}>
                  <AppText size="small" style={styles.flexCopy}>
                    {formatMoney(payment.amount, theme.currency)} via {methodName}
                    {payment.reference_number ? ` · ${payment.reference_number}` : ""}
                  </AppText>
                  {payment.reference_number ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Copy payment reference"
                      onPress={() => void copyPurchaseValue(payment.reference_number!)}
                    >
                      <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                        {copiedReference === payment.reference_number ? "Copied" : "Copy"}
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            {paymentFormOpen && resultBalanceDueCents > 0n ? (
              <View style={[styles.inlinePaymentForm, { borderTopColor: theme.border }]}>
                <TextField
                  label="Amount"
                  value={balancePaymentAmount}
                  onChangeText={setBalancePaymentAmount}
                  placeholder="Enter amount"
                  keyboardType="decimal-pad"
                  leadingIcon="cash-outline"
                />
                <AppText size="small" weight="semibold">Payment method</AppText>
                <View style={styles.paymentMethodChoices}>
                  {([
                    ["mpesa", "M-Pesa"],
                    ["cash", "Cash"],
                    ["bank_transfer", "Bank"],
                  ] as const).map(([method, label]) => (
                    <Pressable
                      key={method}
                      accessibilityRole="button"
                      accessibilityState={{ selected: balancePaymentMethod === method }}
                      onPress={() => setBalancePaymentMethod(method)}
                      style={[
                        styles.paymentMethodChoice,
                        {
                          backgroundColor: balancePaymentMethod === method
                            ? theme.backgroundSelected
                            : theme.backgroundElement,
                          borderColor: balancePaymentMethod === method
                            ? theme.primary
                            : theme.border,
                        },
                      ]}
                    >
                      <AppText
                        size="small"
                        weight={balancePaymentMethod === method ? "semibold" : undefined}
                        style={{ color: balancePaymentMethod === method ? theme.primary : theme.text }}
                      >
                        {label}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
                {balancePaymentMethod !== "cash" ? (
                  <TextField
                    label="Payment reference"
                    value={balancePaymentReference}
                    onChangeText={setBalancePaymentReference}
                    placeholder={balancePaymentMethod === "mpesa" ? "M-Pesa code" : "Bank reference"}
                    autoCapitalize="characters"
                  />
                ) : null}
                {balancePaymentMethod === "mpesa" ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setBalancePaymentError(null);
                      setBalanceSmsPickerOpen(true);
                    }}
                    style={[
                      styles.balanceSmsAction,
                      {
                        backgroundColor: theme.backgroundSelected,
                        borderColor: `${theme.primary}66`,
                      },
                    ]}
                  >
                    <Ionicons name="phone-portrait-outline" size={18} color={theme.primary} />
                    <AppText
                      size="small"
                      weight="semibold"
                      style={styles.flexCopy}
                    >
                      Find payment on this phone
                    </AppText>
                    <Ionicons name="chevron-forward" size={18} color={theme.primary} />
                  </Pressable>
                ) : null}
                {balancePaymentError ? (
                  <AppText size="small" style={{ color: theme.danger }}>
                    {balancePaymentError}
                  </AppText>
                ) : null}
                <View style={styles.paymentFormActions}>
                  <Button
                    label="Cancel"
                    variant="secondary"
                    disabled={recordPurchasePayment.isPending}
                    onPress={() => {
                      setPaymentFormOpen(false);
                      setBalancePaymentError(null);
                    }}
                  />
                  <Button
                    label="Record payment"
                    loading={recordPurchasePayment.isPending}
                    onPress={() => void submitBalancePayment()}
                  />
                </View>
              </View>
            ) : null}
            {resultBalanceDueCents > 0n && !paymentFormOpen ? (
              <Button
                label="Pay balance"
                variant="secondary"
                onPress={() => {
                  setBalancePaymentAmount(String(result.balance_due));
                  setBalancePaymentReference("");
                  setBalancePaymentSmsMessageId(null);
                  setBalancePaymentDate(null);
                  setBalancePaymentTime(null);
                  setBalancePaymentError(null);
                  setPaymentFormOpen(true);
                }}
              />
            ) : null}
          </View>

          {savedBalanceReminder && resultBalanceDueCents > 0n ? (
            <View style={[styles.successSection, { borderTopColor: theme.border }]}>
              <View style={styles.deliveryHeading}>
                <View style={styles.flexCopy}>
                  <AppText weight="semibold">Reminder to settle the balance</AppText>
                  <AppText size="small" tone="secondary">
                    {formatReminderDateTime(
                      savedBalanceReminder.due_at,
                      farm.selectedFarm?.settings?.timezone,
                    )}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {savedBalanceReminder.delivery_channel === "push"
                      ? "In-app and push reminder"
                      : "In-app reminder"}
                  </AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openReminderEditor(savedBalanceReminder)}
                  style={styles.linkButton}
                >
                  <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
                    Change reminder
                  </AppText>
                </Pressable>
              </View>
              {reminderEditorOpen ? (
                <View style={styles.reminderEditor}>
                  <DatePickerField
                    label="Reminder date"
                    value={reminderDueDate}
                    onChange={setReminderDueDate}
                    minimumDate={parseDate(farmToday) ?? new Date()}
                  />
                  <TimePickerField
                    label="Reminder time"
                    value={reminderDueTime}
                    minimumTime={reminderDueDate === farmToday
                      ? nextFarmLocalTime(farm.selectedFarm?.settings?.timezone)
                      : undefined}
                    onChange={setReminderDueTime}
                  />
                  {reminderEditError ? (
                    <AppText size="small" style={{ color: theme.danger }}>
                      {reminderEditError}
                    </AppText>
                  ) : null}
                  <View style={styles.paymentFormActions}>
                    <Button
                      label="Cancel"
                      variant="secondary"
                      disabled={reschedulePurchaseReminder.isPending}
                      onPress={() => setReminderEditorOpen(false)}
                    />
                    <Button
                      label="Save reminder"
                      loading={reschedulePurchaseReminder.isPending}
                      onPress={() => void saveReminderChanges()}
                    />
                  </View>
                </View>
              ) : null}
              {reminderCancelError ? (
                <View style={styles.reminderErrorCard}>
                  <AppText size="small" style={{ color: theme.danger }}>
                    {reminderCancelError}
                  </AppText>
                  <Button
                    label="Cancel reminder"
                    variant="secondary"
                    loading={cancelPurchaseReminder.isPending}
                    onPress={() => {
                      void cancelPurchaseReminder.mutateAsync()
                        .then(() => {
                          setSavedBalanceReminder(null);
                          setReminderCancelError(null);
                        })
                        .catch((cancelError: unknown) => {
                          setReminderCancelError(
                            `The reminder could not be cancelled: ${normalizeApiError(cancelError).message}`,
                          );
                        });
                    }}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          {reminderError ? (
            <View style={styles.reminderErrorCard}>
              <AppText size="small" style={{ color: theme.danger }}>
                The purchase was recorded, but the settlement reminder wasn’t saved: {reminderError}
              </AppText>
              <Button
                label="Retry reminder"
                variant="secondary"
                loading={createReminder.isPending}
                onPress={() => void saveSettlementReminder(result)}
              />
            </View>
          ) : null}
          {purchaseNotes.trim() ? (
            <View style={[styles.successSection, { borderTopColor: theme.border }]}>
              <AppText weight="semibold">Notes</AppText>
              <AppText size="small" style={styles.purchaseNotes}>
                {purchaseNotes.trim()}
              </AppText>
            </View>
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
        </Animated.View>
        {balanceSmsPickerOpen ? (
          <SmsPaymentPicker
            key={`balance-${result.id}`}
            visible
            fromDate={result.transaction_date}
            currency={theme.currency}
            existingReferences={result.payments
              .map((payment) => payment.reference_number ?? "")
              .filter(Boolean)}
            existingSmsMessageIds={[]}
            excludedSmsMessageIds={[
              paymentSmsMessageId,
              ...additionalPayments.map((payment) => payment.smsMessageId),
              ...recordedBalanceSmsMessageIds,
            ].filter((messageId): messageId is string => Boolean(messageId))}
            maxSelections={1}
            hasExistingPayments={result.payments.length > 0}
            selectIntoExistingPayment
            purchaseTotalCents={
              parseMoneyToCents(String(result.transaction_total))?.toString() ??
              "0"
            }
            currentPaidCents={
              parseMoneyToCents(String(result.amount_paid))?.toString() ?? "0"
            }
            onClose={() => setBalanceSmsPickerOpen(false)}
            onSelect={(selected) => applyBalanceSmsPayment(selected)}
          />
        ) : null}
      </PurchaseSuccessShell>
    );
  }

  function continuePendingNavigation() {
    const action = leaveActionRef.current;
    if (!action) {
      setLeaveDraftError("Could not continue leaving. Your purchase is still open.");
      return;
    }
    leaveActionRef.current = null;
    setNavigationAllowed(true);
    setLeaveActionPending(false);
    setLeavePromptVisible(false);
    action();
  }

  async function saveDraftAndLeave() {
    if (!draftKey || loadedDraftKey !== draftKey) {
      setLeaveDraftError("Draft storage is not ready yet. Your purchase is still open.");
      return;
    }
    setLeaveActionPending(true);
    try {
      await persistDraftSnapshot(draftKey, draftSnapshot);
      setDraftStorageError(null);
      continuePendingNavigation();
    } catch {
      setLeaveActionPending(false);
      setLeaveDraftError(
        "FarmTrack could not save this draft. Your purchase is still open; try again.",
      );
    }
  }

  async function discardDraftAndLeave() {
    if (!draftKey || loadedDraftKey !== draftKey) {
      setLeaveDraftError("Draft storage is not ready yet. Your purchase is still open.");
      return;
    }
    setLeaveActionPending(true);
    discardDraftWritesRef.current = true;
    try {
      await draftWriteChain.current.catch(() => undefined);
      await SecureStore.deleteItemAsync(draftKey);
      setDraftStorageError(null);
      continuePendingNavigation();
    } catch {
      setLeaveActionPending(false);
      discardDraftWritesRef.current = false;
      setLeaveDraftError(
        "FarmTrack could not discard the saved draft. Your purchase is still open; try again.",
      );
    }
  }

  return (
    <ScreenShell>
      <FarmPageHeader
        title="Record chicken purchase"
        showBack
        fallbackHref="/(tabs)/flock"
      />
      <View
        style={[
          styles.progressSection,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={styles.progressLabels}>
          <AppText size="small" weight="semibold" tone="secondary">
            CHICKEN PURCHASE
          </AppText>
          <AppText size="small" weight="semibold">
            {String(step + 1).padStart(2, "0")} /{" "}
            {String(steps.length).padStart(2, "0")}
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
        <Animated.View
          key={step}
          entering={FadeInDown.duration(220)}
          style={styles.stepContent}
        >
          <View style={styles.sectionIntro}>
            <AppText size="heading" weight="semibold">
              Purchase details
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
            {!supplierFormOpen ? (
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.inlineAddButton,
                  {
                    borderColor: `${theme.primary}55`,
                    backgroundColor: pressed
                      ? theme.backgroundSelected
                      : theme.backgroundElement,
                  },
                ]}
                onPress={() => {
                  setSupplierError(null);
                  setSupplierFormOpen(true);
                }}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={20}
                  color={theme.primary}
                />
                <AppText weight="semibold" style={{ color: theme.primary }}>
                  Add supplier
                </AppText>
              </Pressable>
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
        </Animated.View>
      ) : null}

      {step === 1 ? (
        <Animated.View
          key={step}
          entering={FadeInDown.duration(220)}
          style={styles.stepContent}
        >
          <View style={styles.sectionIntro}>
            <AppText size="heading" weight="semibold">
              Purchase items
            </AppText>
            <AppText size="small" tone="secondary">
              Add multiple units under one product, or add another product.
            </AppText>
          </View>
          {items.map((item, index) => (
            <Card
              key={item.id}
              style={[
                styles.itemCard,
                { borderLeftColor: theme.primary, borderColor: theme.border },
              ]}
            >
              <View style={styles.itemHeading}>
                <View style={styles.itemHeadingTitle}>
                  <View
                    style={[
                      styles.itemNumber,
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
                  <AppText weight="semibold">Purchase line</AppText>
                </View>
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
                    style={[
                      styles.removeItemButton,
                      { backgroundColor: `${theme.danger}12` },
                    ]}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={17}
                      color={theme.danger}
                    />
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
                  No active chicken products. Add one in Product management.
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
                  selectedUnitIds={item.unitEntries.map(
                    (entry) => entry.unitId,
                  )}
                  error={
                    arrivalFieldError?.key === `batch:${item.id}:unit`
                      ? arrivalFieldError.message
                      : undefined
                  }
                  onToggle={(unit) => {
                    clearFieldError(`batch:${item.id}:unit`);
                    toggleItemUnit(item, unit);
                  }}
                />
              ) : null}
              {item.unitEntries.map((entry) => {
                const unit = options.data.products
                  .find((product) => product.id === item.productId)
                  ?.product_units.find(
                    (candidate) => candidate.unit_id === entry.unitId,
                  );
                return (
                  <View
                    key={entry.id}
                    style={[
                      styles.unitQuantityCard,
                      {
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <View style={styles.unitQuantityHeading}>
                      <View
                        style={[
                          styles.unitQuantityIcon,
                          { backgroundColor: `${theme.primary}18` },
                        ]}
                      >
                        <Ionicons
                          name="layers-outline"
                          size={16}
                          color={theme.primary}
                        />
                      </View>
                      <View style={styles.flexCopy}>
                        <AppText weight="semibold">
                          {unit?.unit_name ?? "Selected unit"}
                        </AppText>
                        <AppText size="small" tone="secondary">
                          {unit?.is_base_unit
                            ? "Base unit"
                            : unit
                              ? `1 ${unit.unit_name.toLocaleLowerCase()} = ${formatChickenCount(Number(unit.conversion_factor))} ${chickenPurchaseUnitLabel(
                                  options.data.products
                                    .find(
                                      (product) =>
                                        product.id === item.productId,
                                    )
                                    ?.product_units.find(
                                      (candidate) => candidate.is_base_unit,
                                    )?.unit_name ?? "birds",
                                  Number(unit.conversion_factor),
                                )}`
                              : "Unit conversion unavailable"}
                        </AppText>
                      </View>
                    </View>
                    <View style={styles.unitQuantityFields}>
                      <View style={styles.unitQuantityInput}>
                        <TextField
                          label="Quantity"
                          value={entry.quantity}
                          ref={(input) =>
                            bindFieldRef(
                              `batch:${item.id}:quantity:${entry.id}`,
                              input,
                            )
                          }
                          error={
                            arrivalFieldError?.key ===
                            `batch:${item.id}:quantity:${entry.id}`
                              ? arrivalFieldError.message
                              : undefined
                          }
                          onChangeText={(value) => {
                            clearFieldError(
                              `batch:${item.id}:quantity:${entry.id}`,
                            );
                            updateItemUnit(item, entry.id, {
                              quantity: value,
                            });
                          }}
                          keyboardType="number-pad"
                          placeholder="e.g. 3"
                        />
                      </View>
                      <View style={styles.unitQuantityInput}>
                        <TextField
                          label={`Price per ${unit?.unit_name.toLocaleLowerCase() ?? "unit"} (${theme.currency})`}
                          value={entry.unitPrice}
                          ref={(input) =>
                            bindFieldRef(
                              `batch:${item.id}:unit-price:${entry.id}`,
                              input,
                            )
                          }
                          error={
                            arrivalFieldError?.key ===
                            `batch:${item.id}:unit-price:${entry.id}`
                              ? arrivalFieldError.message
                              : undefined
                          }
                          onChangeText={(value) => {
                            clearFieldError(
                              `batch:${item.id}:unit-price:${entry.id}`,
                            );
                            updateItemUnit(item, entry.id, {
                              unitPrice: value,
                            });
                          }}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
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
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.addPurchaseLine,
              {
                borderColor: `${theme.primary}55`,
                backgroundColor: pressed
                  ? theme.backgroundSelected
                  : theme.backgroundElement,
              },
            ]}
            onPress={() => {
              setDiscountConfirmed(false);
              setOverpaymentConfirmed(false);
              setItemDrafts((current) => [...current, createItemDraft()]);
            }}
          >
            <View
              style={[
                styles.addPurchaseLineIcon,
                { backgroundColor: `${theme.primary}18` },
              ]}
            >
              <Ionicons
                name="add"
                size={21}
                color={theme.primary}
              />
            </View>
            <View style={styles.flexCopy}>
              <AppText weight="semibold" style={{ color: theme.primary }}>
                Add another product
              </AppText>
              <AppText size="small" tone="secondary">
                Start a separate product entry
              </AppText>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.primary}
            />
          </Pressable>
          <Card
            style={[
              styles.pricingCard,
              { borderColor: `${theme.primary}55` },
            ]}
          >
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
                clearFieldError("discount:value");
                if (discountType === null) {
                  setDiscountType("fixed");
                } else {
                  setDiscountType(null);
                  setDiscountValue("");
                  setDiscountReason("");
                }
                setDiscountConfirmed(false);
                setOverpaymentConfirmed(false);
              }}
              style={[
                styles.discountToggle,
                {
                  backgroundColor:
                    discountType !== null
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
                    Choose how to calculate it below
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
            {discountType !== null ? (
              <View
                style={[
                  styles.discountEditor,
                  { backgroundColor: theme.background },
                ]}
              >
                <View
                  style={[
                    styles.discountModes,
                    { backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <DiscountModeChoice
                    label="%"
                    description="Percent"
                    selected={discountType === "percentage"}
                    theme={theme}
                    onPress={() => {
                      clearFieldError("discount:value");
                      setDiscountType("percentage");
                      setDiscountValue("");
                      setDiscountConfirmed(false);
                      setOverpaymentConfirmed(false);
                    }}
                  />
                  <DiscountModeChoice
                    label={theme.currency}
                    description="Fixed amount"
                    selected={discountType === "fixed"}
                    theme={theme}
                    onPress={() => {
                      clearFieldError("discount:value");
                      setDiscountType("fixed");
                      setDiscountValue("");
                      setDiscountConfirmed(false);
                      setOverpaymentConfirmed(false);
                    }}
                  />
                </View>
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
                  label="Reason · optional"
                  value={discountReason}
                  onChangeText={(value) => setDiscountReason(value)}
                  placeholder="e.g. Bulk order"
                  maxLength={200}
                />
              </View>
            ) : null}
            <View
              style={[
                styles.discountTotals,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <View
                style={[
                  styles.discountSubtotal,
                  { borderBottomColor: theme.border },
                ]}
              >
                <AppText size="small" tone="secondary">
                  Subtotal
                </AppText>
                <AppText size="small" weight="semibold">
                  {formatCents(purchasePricing.subtotalCents, theme.currency)}
                </AppText>
              </View>
              <View style={styles.discountTotal}>
                <View style={styles.flexCopy}>
                  <AppText size="small" weight="semibold">
                    Final cost
                  </AppText>
                  {purchasePricing.discountCents > 0n ? (
                    <AppText size="small" style={{ color: theme.success }}>
                      Saving{" "}
                      {formatCents(
                        purchasePricing.discountCents,
                        theme.currency,
                      )}
                    </AppText>
                  ) : null}
                </View>
                <AppText
                  size="heading"
                  weight="semibold"
                  style={{ color: theme.primary }}
                >
                  {formatCents(purchasePricing.totalCents, theme.currency)}
                </AppText>
              </View>
              {purchasePricing.effectiveCostPerChickenCents !== null ? (
                <AppText size="small" tone="secondary">
                  {formatCents(
                    purchasePricing.effectiveCostPerChickenCents,
                    theme.currency,
                  )}{" "}
                  per chicken
                </AppText>
              ) : null}
            </View>
          </Card>
        </Animated.View>
      ) : null}

      {step === 2 ? (
        <Animated.View
          entering={FadeInDown.duration(220)}
          style={styles.stepContent}
        >
          <View style={styles.sectionIntro}>
            <AppText size="heading" weight="semibold">
              Payment
            </AppText>
          </View>
          {shareNativeError || draftStorageError ? (
            <Card style={styles.paymentEntry}>
              {shareNativeError ? (
                <AppText size="small" style={{ color: theme.danger }}>
                  {shareNativeError}
                </AppText>
              ) : null}
              {draftStorageError ? (
                <AppText size="small" style={{ color: theme.danger }}>
                  {draftStorageError}
                </AppText>
              ) : null}
            </Card>
          ) : null}
          <Card style={styles.paymentToggle}>
            <View style={styles.flexCopy}>
              <AppText weight="semibold">Record payment now</AppText>
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
              <View
                style={[
                  styles.paymentCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}
              >
                <PaymentCardHeader
                  number={1}
                  method={
                    paymentMethods.find(
                      (method) => method.value === paymentMethod,
                    )?.label ?? "Payment"
                  }
                />
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
                </View>
              </Pressable>
              <TextField
                label={`Amount (${theme.currency})`}
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
                  Payment method
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
                        if (
                          paymentMethod === "mpesa" &&
                          method.value !== "mpesa"
                        ) {
                          setPaymentReference("");
                        }
                        if (method.value !== "mpesa") {
                          setPaymentDate(null);
                          setPaymentTime(null);
                        }
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
              {Platform.OS === "android" && paymentMethod === "mpesa" ? (
                <SmsPaymentImportButton
                  onPress={() => {
                    setSmsTargetPaymentId(FIRST_PAYMENT_TARGET);
                    setSmsPickerOpen(true);
                  }}
                />
              ) : null}
              {paymentMethod === "mpesa" ? (
                <>
                  <DatePickerField
                    label="Date"
                    value={paymentDate ?? selectedPurchaseDate}
                    onChange={setPaymentDate}
                  />
                  {paymentTime ? (
                    <TimePickerField
                      label="Time (Nairobi)"
                      value={paymentTime}
                      onChange={setPaymentTime}
                    />
                  ) : null}
                </>
              ) : null}
              </View>
              {additionalPayments.map((payment, index) => (
                <View
                  key={payment.id}
                  style={[
                    styles.paymentCard,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor:
                        smsTargetPaymentId === payment.id
                          ? theme.primary
                          : theme.border,
                    },
                  ]}
                >
                  <PaymentCardHeader
                    number={index + 2}
                    method={
                      paymentMethods.find(
                        (method) => method.value === payment.method,
                      )?.label ?? "Payment"
                    }
                    onRemove={() => {
                      setAdditionalPayments((current) =>
                        current.filter(
                          (candidate) => candidate.id !== payment.id,
                        ),
                      );
                      setOverpaymentConfirmed(false);
                    }}
                    removeLabel={`Remove payment ${index + 2}`}
                  />
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
                  {Platform.OS === "android" &&
                  payment.method === "mpesa" ? (
                    <SmsPaymentImportButton
                      onPress={() => {
                        setSmsTargetPaymentId(payment.id);
                        setSmsPickerOpen(true);
                      }}
                    />
                  ) : null}
                  {payment.method === "mpesa" ? (
                    <>
                      <DatePickerField
                        label="Date"
                        value={payment.date || selectedPurchaseDate}
                        onChange={(date) =>
                          setAdditionalPayments((current) =>
                            current.map((candidate) =>
                              candidate.id === payment.id
                                ? { ...candidate, date }
                                : candidate,
                            ),
                          )
                        }
                      />
                      {payment.time ? (
                        <TimePickerField
                          label="Time (Nairobi)"
                          value={payment.time}
                          onChange={(time) =>
                            setAdditionalPayments((current) =>
                              current.map((candidate) =>
                                candidate.id === payment.id
                                  ? { ...candidate, time }
                                  : candidate,
                              ),
                            )
                          }
                        />
                      ) : null}
                    </>
                  ) : null}
                </View>
              ))}
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.inlineAddButton,
                  {
                    borderColor: `${theme.primary}55`,
                    backgroundColor: pressed
                      ? theme.backgroundSelected
                      : theme.backgroundElement,
                  },
                ]}
                onPress={() => {
                  setAdditionalPayments((current) => [
                    ...current,
                    {
                      id: `${Date.now()}-${Math.random()}`,
                      amount: "",
                      method: "cash",
                      reference: "",
                      date: selectedPurchaseDate,
                      time: null,
                    },
                  ]);
                  setOverpaymentConfirmed(false);
                }}
              >
                <Ionicons name="add-circle-outline" size={20} color={theme.primary} />
                <AppText weight="semibold" style={{ color: theme.primary }}>
                  Add payment
                </AppText>
              </Pressable>
            </>
          ) : null}
          <Card
            style={[
              styles.paymentSummary,
              { borderColor: `${theme.primary}55` },
            ]}
          >
            <View
              style={[
                styles.purchaseTotalHero,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <View style={styles.flexCopy}>
                <AppText size="small" weight="semibold" tone="secondary">
                  FINAL PURCHASE TOTAL
                </AppText>
                <AppText
                  size="heading"
                  weight="semibold"
                  style={[styles.purchaseTotalAmount, { color: theme.primary }]}
                >
                  {formatCents(purchaseTotalCents, theme.currency)}
                </AppText>
              </View>
              <View
                style={[
                  styles.purchaseTotalIcon,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <Ionicons
                  name="receipt-outline"
                  size={21}
                  color={theme.primary}
                />
              </View>
            </View>
            <View style={[styles.paymentPaidRow, { borderTopColor: theme.border }]}>
              <AppText size="small" tone="secondary">
                Paid now
              </AppText>
              <AppText size="small" weight="semibold" style={{ color: theme.success }}>
                {formatCents(paidNowCents, theme.currency)}
              </AppText>
            </View>
            <View
              style={[
                styles.paymentOutcome,
                {
                  borderColor: `${creditBalanceCents > 0n ? theme.secondary : balanceDueCents > 0n ? theme.danger : theme.success}45`,
                  backgroundColor:
                    creditBalanceCents > 0n
                      ? `${theme.secondary}12`
                      : balanceDueCents > 0n
                        ? `${theme.danger}0C`
                        : `${theme.success}12`,
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
                    ? "Supplier credit"
                    : balanceDueCents > 0n
                      ? "Balance due"
                      : "Paid in full"}
                </AppText>
              </View>
              <AppText
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
                {formatCents(
                  creditBalanceCents > 0n
                    ? creditBalanceCents
                    : balanceDueCents,
                  theme.currency,
                )}
              </AppText>
            </View>
          </Card>
          {balanceDueCents > 0n || creditBalanceCents > 0n ? (
            <View
              style={[
                styles.reminderCard,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: remindForSettlement
                    ? `${theme.primary}70`
                    : theme.border,
                },
              ]}
            >
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
                      : "transparent",
                    borderBottomColor: remindForSettlement
                      ? theme.border
                      : "transparent",
                  },
                ]}
              >
                <View
                  style={[
                    styles.reminderIcon,
                    {
                      backgroundColor: remindForSettlement
                        ? theme.primary
                        : theme.backgroundSelected,
                    },
                  ]}
                >
                  <Ionicons
                    name="alarm-outline"
                    size={19}
                    color={
                      remindForSettlement ? theme.onPrimary : theme.primary
                    }
                  />
                </View>
                <View style={styles.flexCopy}>
                  <AppText weight="semibold">Payment reminder</AppText>
                  {remindForSettlement ? (
                    <AppText size="small" tone="secondary">
                      {formatDateForDisplay(reminderDueDate)} · {reminderDueTime}
                    </AppText>
                  ) : null}
                </View>
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
                  {reminderError ? (
                    <AppText size="small" style={{ color: theme.danger }}>
                      {reminderError}
                    </AppText>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      {step === 3 ? (
        <Animated.View
          key={step}
          entering={FadeInDown.duration(220)}
          style={styles.stepContent}
        >
          <View style={styles.sectionIntro}>
            <AppText size="heading" weight="semibold">
              Review purchase
            </AppText>
          </View>
          <View
            style={[
              styles.reviewHero,
              { backgroundColor: theme.primary },
            ]}
          >
            <View style={styles.reviewHeroTop}>
              <View
                style={[
                  styles.reviewHeroIcon,
                  { backgroundColor: `${theme.onPrimary}20` },
                ]}
              >
                <Ionicons
                  name="receipt-outline"
                  size={21}
                  color={theme.onPrimary}
                />
              </View>
              <View style={styles.flexCopy}>
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: theme.onPrimary, opacity: 0.8 }}
                >
                  PURCHASE TOTAL
                </AppText>
                <AppText
                  size="heading"
                  weight="semibold"
                  style={[
                    styles.reviewHeroAmount,
                    { color: theme.onPrimary },
                  ]}
                >
                  {formatCents(purchaseTotalCents, theme.currency)}
                </AppText>
              </View>
              <View
                style={[
                  styles.reviewDateBadge,
                  { backgroundColor: `${theme.onPrimary}18` },
                ]}
              >
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: theme.onPrimary }}
                >
                  {formatDateForDisplay(selectedPurchaseDate)}
                </AppText>
              </View>
            </View>
            <View
              style={[
                styles.reviewHeroDivider,
                { backgroundColor: `${theme.onPrimary}30` },
              ]}
            />
            <View style={styles.reviewSupplierLine}>
              <Ionicons
                name="person-outline"
                size={17}
                color={theme.onPrimary}
              />
              <AppText
                size="small"
                weight="semibold"
                style={{ color: theme.onPrimary, flex: 1 }}
                numberOfLines={1}
              >
                {reviewSupplier?.name || "Supplier details"}
              </AppText>
              <AppText
                size="small"
                style={{ color: theme.onPrimary, opacity: 0.82 }}
              >
                {Number(purchasePricing.chickenCount).toLocaleString()} birds
              </AppText>
            </View>
          </View>

          {reviewSupplier ? (
            <Card style={styles.reviewSupplierCard}>
              <View style={styles.reviewSectionHeading}>
                <View
                  style={[
                    styles.reviewSectionIcon,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color={theme.primary}
                  />
                </View>
                <View style={styles.flexCopy}>
                  <AppText weight="semibold">
                    {reviewSupplier.name || "New supplier"}
                  </AppText>
                  {reviewSupplier.phone ? (
                    <AppText size="small" tone="secondary">
                      {reviewSupplier.phone}
                    </AppText>
                  ) : null}
                  {reviewSupplier.email ? (
                    <AppText size="small" tone="secondary">
                      {reviewSupplier.email}
                    </AppText>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.supplierStatusBadge,
                    {
                      backgroundColor: draftSupplier
                        ? `${theme.secondary}18`
                        : `${theme.success}18`,
                    },
                  ]}
                >
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{
                      color: draftSupplier ? theme.secondary : theme.success,
                    }}
                  >
                    {draftSupplier ? "Not saved" : "Saved"}
                  </AppText>
                </View>
              </View>
              {draftSupplier ? (
                <AppText size="small" style={{ color: theme.secondary }}>
                  Save supplier in Purchase details to link it to this purchase.
                </AppText>
              ) : null}
            </Card>
          ) : null}

          <Card style={styles.reviewCard}>
            <View style={styles.reviewSectionHeading}>
              <View
                style={[
                  styles.reviewSectionIcon,
                  { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons name="leaf-outline" size={18} color={theme.primary} />
              </View>
              <AppText weight="semibold" style={styles.flexCopy}>
                Items
              </AppText>
              <AppText size="small" tone="secondary">
                {items.length} {items.length === 1 ? "line" : "lines"}
              </AppText>
            </View>
            {items.map((item, index) => {
              const product = options.data.products.find(
                (candidate) => candidate.id === item.productId,
              );
              const lineSubtotalCents = item.unitEntries.reduce(
                (total, entry) =>
                  total +
                  BigInt(entry.quantity || "0") *
                    (parseMoneyToCents(entry.unitPrice) ?? 0n),
                0n,
              );
              const unitBreakdown = item.unitEntries
                .map((entry) => {
                  const unit = product?.product_units.find(
                    (candidate) => candidate.unit_id === entry.unitId,
                  );
                  return unit
                    ? `${entry.quantity || "0"} ${chickenPurchaseUnitLabel(
                        unit.unit_name,
                        Number(entry.quantity) || 0,
                      )}`
                    : null;
                })
                .filter(Boolean)
                .join(" + ");
              const baseUnit =
                product?.product_units.find((unit) => unit.is_base_unit);
              const totalBaseQuantity = item.unitEntries.reduce(
                (total, entry) => {
                  const unit = product?.product_units.find(
                    (candidate) => candidate.unit_id === entry.unitId,
                  );
                  return (
                    total +
                    (Number(entry.quantity) || 0) *
                      (Number(unit?.conversion_factor) || 0)
                  );
                },
                0,
              );
              return (
                <View
                  key={item.id}
                  style={[
                    styles.reviewLine,
                    { borderTopColor: theme.border },
                  ]}
                >
                  <View style={styles.flexCopy}>
                    <AppText weight="semibold">
                      {product?.name ?? "Chicken product"}
                    </AppText>
                    <AppText size="small" tone="secondary">
                      {chickenTypes.find(
                        (type) => type.value === item.chickenType,
                      )?.label ?? "Chicken"}{" "}
                      · {unitBreakdown || "No units selected"}
                      {baseUnit && totalBaseQuantity > 0
                        ? ` · ${formatChickenCount(totalBaseQuantity)} ${chickenPurchaseUnitLabel(
                            baseUnit.unit_name,
                            totalBaseQuantity,
                          )} total`
                        : ""}
                    </AppText>
                  </View>
                  <AppText weight="semibold">
                    {formatCents(lineSubtotalCents, theme.currency)}
                  </AppText>
                </View>
              );
            })}
            {purchaseNotes.trim() ? (
              <View
                style={[
                  styles.reviewNotes,
                  { backgroundColor: theme.background },
                ]}
              >
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color={theme.textSecondary}
                />
                <AppText size="small" tone="secondary" style={styles.flexCopy}>
                  {purchaseNotes.trim()}
                </AppText>
              </View>
            ) : null}
          </Card>

          <Card style={styles.reviewCard}>
            <View style={styles.reviewSectionHeading}>
              <View
                style={[
                  styles.reviewSectionIcon,
                  { backgroundColor: `${theme.success}18` },
                ]}
              >
                <Ionicons
                  name="wallet-outline"
                  size={18}
                  color={theme.success}
                />
              </View>
              <AppText weight="semibold" style={styles.flexCopy}>
                Payment breakdown
              </AppText>
              <AppText size="small" tone="secondary">
                {recordPayment
                  ? `${1 + additionalPayments.length} entries`
                  : "Not recorded"}
              </AppText>
            </View>
            {recordPayment ? (
              <>
                <ReviewPaymentRow
                  index={1}
                  method={paymentMethods.find(
                    (method) => method.value === paymentMethod,
                  )?.label ?? "Payment"}
                  amount={formatCents(enteredPaymentCents, theme.currency)}
                  reference={paymentReference}
                />
                {additionalPayments.map((payment, index) => (
                  <ReviewPaymentRow
                    key={payment.id}
                    index={index + 2}
                    method={
                      paymentMethods.find(
                        (method) => method.value === payment.method,
                      )?.label ?? "Payment"
                    }
                    amount={formatCents(
                      parseMoneyToCents(payment.amount) ?? 0n,
                      theme.currency,
                    )}
                    reference={payment.reference}
                  />
                ))}
              </>
            ) : (
              <AppText size="small" tone="secondary">
                No payment will be recorded now.
              </AppText>
            )}
          </Card>

          <Card style={styles.reviewCard}>
            <AppText weight="semibold">Totals</AppText>
            <SummaryRow
              label="Subtotal"
              value={formatCents(purchasePricing.subtotalCents, theme.currency)}
            />
            {purchasePricing.discountCents > 0n ? (
              <SummaryRow
                label="Discount"
                value={formatCents(
                  -purchasePricing.discountCents,
                  theme.currency,
                )}
                labelColor={theme.secondary}
                valueColor={theme.secondary}
              />
            ) : null}
            <View
              style={[
                styles.reviewTotalLine,
                { borderTopColor: theme.border },
              ]}
            >
              <AppText weight="semibold">Paid now</AppText>
              <AppText weight="semibold" style={{ color: theme.success }}>
                {formatCents(paidNowCents, theme.currency)}
              </AppText>
            </View>
            <View
              style={[
                styles.reviewBalance,
                { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <View style={styles.flexCopy}>
                <AppText size="small" tone="secondary">
                  {creditBalanceCents > 0n ? "Supplier credit" : "Balance due"}
                </AppText>
                <AppText weight="semibold">
                  {creditBalanceCents > 0n
                    ? formatCents(creditBalanceCents, theme.currency)
                    : formatCents(balanceDueCents, theme.currency)}
                </AppText>
              </View>
              <View
                style={[
                  styles.reviewBalanceBadge,
                  {
                    backgroundColor:
                      creditBalanceCents > 0n || balanceDueCents === 0n
                        ? `${theme.success}18`
                        : `${theme.secondary}18`,
                  },
                ]}
              >
                <Ionicons
                  name={
                    creditBalanceCents > 0n || balanceDueCents === 0n
                      ? "checkmark-circle"
                      : "time-outline"
                  }
                  size={17}
                  color={
                    creditBalanceCents > 0n || balanceDueCents === 0n
                      ? theme.success
                      : theme.secondary
                  }
                />
                <AppText
                  size="small"
                  weight="semibold"
                  style={{
                    color:
                      creditBalanceCents > 0n || balanceDueCents === 0n
                        ? theme.success
                        : theme.secondary,
                  }}
                >
                  {creditBalanceCents > 0n
                    ? "Credit"
                    : balanceDueCents === 0n
                      ? "Settled"
                      : "Due"}
                </AppText>
              </View>
            </View>
            {remindForSettlement &&
            (balanceDueCents > 0n || creditBalanceCents > 0n) ? (
              <SummaryRow
                label="Reminder"
                value={`${formatDateForDisplay(reminderDueDate)} · ${reminderDueTime}`}
              />
            ) : null}
          </Card>
        </Animated.View>
      ) : null}

      {error ? (
        <AppText size="small" style={{ color: theme.danger }}>
          {error}
        </AppText>
      ) : null}
      {messageImportError && !messageReview ? (
        <View style={styles.sectionIntro}>
          <AppText size="small" style={{ color: theme.danger }}>
            {messageImportError}
          </AppText>
          {sharedMessage ? (
            <Button
              label="Dismiss shared message"
              variant="secondary"
              onPress={() =>
                void dismissPaymentMessageImport(sharedMessage.id)
              }
            />
          ) : null}
        </View>
      ) : null}

      {messageReview ? (
        <PaymentMessageReview
          payment={messageReview.payment}
          warnings={importWarnings}
          currency={theme.currency}
          expectedAmount={importExpectedAmount}
          purchaseDate={selectedPurchaseDate}
          canImport={
            messageReview.payment.transactionStatus === "SUCCESS" &&
            !importCurrencyMismatch &&
            !importAssessment?.duplicateReference
          }
          blockReason={importBlockReason}
          error={messageImportError}
          onCancel={() => void dismissPaymentMessageImport(messageReview.id)}
          onConfirm={(edits) => void applyImportedPayment(edits)}
        />
      ) : null}

      {smsPickerOpen ? (
        <SmsPaymentPicker
          key={selectedPurchaseDate}
          visible
          fromDate={selectedPurchaseDate}
          currency={theme.currency}
          existingSmsMessageIds={existingSmsMessageIds}
          selectIntoExistingPayment={Boolean(smsTargetPaymentId)}
          hasExistingPayments={Boolean(
            fullyPaid ||
              paymentAmount.trim() ||
              paymentReference.trim() ||
              additionalPayments.length,
          )}
          purchaseTotalCents={purchaseTotalCents.toString()}
          currentPaidCents={paidNowCents.toString()}
          existingReferences={[
            paymentReference,
            ...additionalPayments.map((payment) => payment.reference),
          ]}
          onClose={() => {
            setSmsPickerOpen(false);
            setSmsTargetPaymentId(null);
          }}
          onSelect={(selected, mode) =>
            void applySelectedSmsPayments(selected, mode)
          }
        />
      ) : null}

      <Modal
        visible={leavePromptVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (leaveActionPending) return;
          leaveActionRef.current = null;
          setLeavePromptVisible(false);
        }}
      >
        <View style={styles.leavePromptOverlay}>
          <View
            style={[
              styles.leavePromptCard,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <View
              style={[
                styles.leavePromptIcon,
                { backgroundColor: `${theme.primary}18` },
              ]}
            >
              <Ionicons
                name="document-text-outline"
                size={23}
                color={theme.primary}
              />
            </View>
            <AppText size="heading" weight="semibold">
              Leave this purchase?
            </AppText>
            <AppText tone="secondary">
              Save your details and selected M-Pesa messages as a draft to
              continue later, or discard the purchase.
            </AppText>
            {leaveDraftError ? (
              <AppText size="small" style={{ color: theme.danger }}>
                {leaveDraftError}
              </AppText>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={leaveActionPending}
              onPress={() => {
                leaveActionRef.current = null;
                setLeaveDraftError(null);
                setLeavePromptVisible(false);
              }}
              style={[
                styles.leavePromptButton,
                {
                  borderColor: theme.border,
                  opacity: leaveActionPending ? 0.6 : 1,
                },
              ]}
            >
              <AppText weight="semibold">Keep editing</AppText>
            </Pressable>
            <View style={styles.leavePromptChoices}>
              <Pressable
                accessibilityRole="button"
                disabled={leaveActionPending}
                onPress={() => void discardDraftAndLeave()}
                style={[
                  styles.leavePromptChoice,
                  styles.leavePromptDestructive,
                  {
                    borderColor: theme.danger,
                    opacity: leaveActionPending ? 0.6 : 1,
                  },
                ]}
              >
                <AppText
                  size="small"
                  weight="semibold"
                  style={{ color: theme.danger }}
                >
                  Discard
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={leaveActionPending}
                onPress={() => void saveDraftAndLeave()}
                style={[
                  styles.leavePromptChoice,
                  {
                    backgroundColor: theme.primary,
                    borderColor: theme.primary,
                    opacity: leaveActionPending ? 0.6 : 1,
                  },
                ]}
              >
                {leaveActionPending ? (
                  <ActivityIndicator color={theme.onPrimary} size="small" />
                ) : (
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: theme.onPrimary }}
                  >
                    Save draft
                  </AppText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.navigationActions}>
        <Pressable
          accessibilityRole="button"
          disabled={createPurchase.isPending}
          onPress={() =>
            step === 0 ? router.back() : setStep((current) => current - 1)
          }
          style={({ pressed }) => [
            styles.navigationBack,
            {
              backgroundColor: pressed
                ? theme.backgroundSelected
                : theme.backgroundElement,
              borderColor: theme.border,
              opacity: createPurchase.isPending ? 0.55 : 1,
            },
          ]}
        >
          <Ionicons
            name={step === 0 ? "close" : "arrow-back"}
            size={18}
            color={theme.textSecondary}
          />
          <AppText weight="semibold">
            {step === 0 ? "Cancel" : "Back"}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: createPurchase.isPending,
            busy: createPurchase.isPending,
          }}
          disabled={createPurchase.isPending}
          onPress={() =>
            step < steps.length - 1
              ? goNext()
              : void submitPurchase()
          }
          android_ripple={{ color: `${theme.onPrimary}24` }}
          style={({ pressed }) => [
            styles.navigationContinue,
            {
              backgroundColor: theme.primary,
              opacity: pressed || createPurchase.isPending ? 0.9 : 1,
            },
          ]}
        >
          {createPurchase.isPending ? (
            <ActivityIndicator color={theme.onPrimary} />
          ) : (
            <>
              <AppText weight="semibold" style={{ color: theme.onPrimary }}>
                {step < steps.length - 1 ? "Continue" : "Record purchase"}
              </AppText>
              <Ionicons
                name={step < steps.length - 1 ? "arrow-forward" : "checkmark"}
                size={19}
                color={theme.onPrimary}
              />
            </>
          )}
        </Pressable>
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

function PurchaseSuccessShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <FarmPageHeader
          title="Purchase"
          showBack
          fallbackHref="/(tabs)/flock"
        />
        <ScrollView
          contentContainerStyle={[styles.content, styles.successScroll]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          {children}
        </ScrollView>
        <View
          style={[
            styles.successFooter,
            {
              backgroundColor: theme.background,
              borderTopColor: theme.border,
            },
          ]}
        >
          {footer}
        </View>
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
            ? theme.primary
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
        style={{ color: selected ? theme.onPrimary : theme.text }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function DiscountModeChoice({
  label,
  description,
  selected,
  theme,
  onPress,
}: {
  label: string;
  description: string;
  selected: boolean;
  theme: ReturnType<typeof useTheme>["theme"];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${description}${label === "%" ? "" : `, ${label}`}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.discountMode,
        {
          backgroundColor: selected
            ? theme.primary
            : pressed
              ? theme.backgroundSelected
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
            style={{ color: selected ? theme.onPrimary : theme.primary }}
          >
            {label}
          </AppText>
        </View>
        {selected ? (
          <Ionicons name="checkmark-circle" size={17} color={theme.onPrimary} />
        ) : null}
      </View>
      <View style={styles.discountModeCopy}>
        <AppText
          size="small"
          weight="semibold"
          style={[
            styles.discountModeDescription,
            { color: selected ? theme.onPrimary : theme.text },
          ]}
        >
          {description}
        </AppText>
      </View>
    </Pressable>
  );
}

function SmsPaymentImportButton({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Paste M-Pesa payment confirmation"
      onPress={onPress}
      android_ripple={{ color: `${theme.primary}18` }}
      style={({ pressed }) => [
        styles.mpesaImportCard,
        {
          backgroundColor: pressed
            ? theme.backgroundSelected
            : theme.backgroundElement,
          borderColor: `${theme.primary}70`,
        },
      ]}
    >
      <View
        style={[styles.mpesaImportIcon, { backgroundColor: theme.primary }]}
      >
        <Ionicons name="chatbubbles" size={20} color={theme.onPrimary} />
      </View>
      <View style={styles.flexCopy}>
        <AppText weight="semibold">Paste M-Pesa confirmation</AppText>
        <View style={styles.mpesaCaption}>
          <Ionicons
            name="shield-checkmark-outline"
            size={14}
            color={theme.success}
          />
          <AppText size="small" tone="secondary">
            Copy a confirmation from Messages, then paste it here
          </AppText>
        </View>
      </View>
      <View style={[styles.mpesaArrow, { backgroundColor: theme.primary }]}>
        <Ionicons
          name="arrow-forward"
          size={18}
          color={theme.onPrimary}
        />
      </View>
    </Pressable>
  );
}

function PaymentCardHeader({
  number,
  method,
  onRemove,
  removeLabel,
}: {
  number: number;
  method: string;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.paymentCardHeader}>
      <View style={styles.paymentHeadingTitle}>
        <View
          style={[
            styles.paymentNumber,
            { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <AppText
            size="small"
            weight="semibold"
            style={{ color: theme.primary }}
          >
            {String(number).padStart(2, "0")}
          </AppText>
        </View>
        <AppText weight="semibold">Payment {number}</AppText>
      </View>
      <View style={styles.flexCopy} />
      <View
        style={[
          styles.paymentMethodBadge,
          { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <AppText
          size="small"
          weight="semibold"
          style={{ color: theme.primary }}
        >
          {method}
        </AppText>
      </View>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={removeLabel ?? `Remove payment ${number}`}
          onPress={onRemove}
          style={({ pressed }) => [
            styles.removePaymentButton,
            {
              backgroundColor: pressed
                ? `${theme.danger}24`
                : `${theme.danger}12`,
            },
          ]}
        >
          <Ionicons name="trash-outline" size={17} color={theme.danger} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ProductUnitChooser({
  product,
  selectedUnitIds,
  onToggle,
  error,
}: {
  product: Product;
  selectedUnitIds: string[];
  onToggle: (unit: ProductUnit) => void;
  error?: string;
}) {
  const { theme } = useTheme();
  const baseUnit =
    product.product_units.find((unit) => unit.is_base_unit) ??
    product.product_units[0];
  return (
    <View style={styles.inputSection}>
      <View style={styles.unitHeading}>
        <AppText size="small" weight="semibold">
          Units
        </AppText>
      </View>
      <View style={styles.productUnits}>
        {product.product_units.map((unit) => {
          const selected = selectedUnitIds.includes(unit.unit_id);
          const factor = Number(unit.conversion_factor);
          const conversion =
            unit.is_base_unit || !baseUnit
              ? "Base unit"
              : Number.isFinite(factor) && factor > 0
                ? `1 ${unit.unit_name.toLocaleLowerCase()} = ${formatChickenCount(factor)} ${chickenPurchaseUnitLabel(baseUnit.unit_name, factor)}`
                : "Conversion not set";
          return (
            <Pressable
              key={unit.unit_id}
              accessibilityRole="checkbox"
              accessibilityLabel={`${unit.unit_name}, ${conversion}`}
              accessibilityState={{ checked: selected }}
              onPress={() => onToggle(unit)}
              style={({ pressed }) => [
                styles.productUnitCard,
                {
                  backgroundColor: selected
                    ? theme.backgroundSelected
                    : pressed
                      ? theme.backgroundSelected
                      : theme.backgroundElement,
                  borderColor: error
                    ? theme.danger
                    : selected
                      ? theme.primary
                      : theme.border,
                },
              ]}
            >
              <View style={styles.productUnitHeading}>
                <AppText
                  weight="semibold"
                  style={styles.productUnitName}
                >
                  {unit.unit_name}
                </AppText>
                {selected ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={17}
                    color={theme.primary}
                  />
                ) : null}
                <View
                  style={[
                    styles.productUnitAbbreviation,
                    { backgroundColor: selected ? theme.primary : theme.background },
                  ]}
                >
                  <AppText
                    size="small"
                    weight="semibold"
                    style={{ color: selected ? theme.onPrimary : theme.textSecondary }}
                  >
                    {unit.unit_abbreviation}
                  </AppText>
                </View>
              </View>
              <AppText
                size="small"
                tone="secondary"
                style={styles.productUnitConversion}
              >
                {conversion}
              </AppText>
            </Pressable>
          );
        })}
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

function ReviewPaymentRow({
  index,
  method,
  amount,
  reference,
}: {
  index: number;
  method: string;
  amount: string;
  reference: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.reviewPaymentRow, { borderTopColor: theme.border }]}>
      <View
        style={[
          styles.reviewPaymentIndex,
          { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <AppText
          size="small"
          weight="semibold"
          style={{ color: theme.primary }}
        >
          {index}
        </AppText>
      </View>
      <View style={styles.flexCopy}>
        <AppText weight="semibold">{method}</AppText>
        {reference.trim() ? (
          <AppText size="small" tone="secondary">
            Ref · {reference.trim()}
          </AppText>
        ) : null}
      </View>
      <AppText weight="semibold">{amount}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 17,
    paddingBottom: 28,
    gap: 14,
  },
  stateCard: { gap: 10 },
  progressSection: {
    gap: 11,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  progressTrack: { flexDirection: "row", gap: 5 },
  progressSegment: { flex: 1, height: 6, borderRadius: 3 },
  stepContent: { gap: 16 },
  sectionIntro: { gap: 4, paddingBottom: 0 },
  inputSection: { gap: 8 },
  newSupplierCard: { gap: 12, borderRadius: 18, padding: 16 },
  inlineAddButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  addPurchaseLine: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  addPurchaseLineIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
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
    borderRadius: 14,
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
    borderRadius: 14,
  },
  emptyOptions: { paddingVertical: 14, textAlign: "center" },
  choiceList: { gap: 7 },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choiceButton: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 15,
    borderWidth: 1,
    borderRadius: 14,
  },
  unitHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  productUnits: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  productUnitCard: {
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 128,
    minHeight: 76,
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  productUnitHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  productUnitName: { flex: 1, flexShrink: 1 },
  productUnitAbbreviation: {
    minHeight: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    paddingHorizontal: 6,
  },
  productUnitConversion: { flexShrink: 1 },
  unitQuantityCard: {
    gap: 12,
    borderWidth: 1,
    borderRadius: 15,
    padding: 12,
  },
  unitQuantityHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  unitQuantityIcon: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  unitQuantityFields: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  unitQuantityInput: { flex: 1, minWidth: 135 },
  discountHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  discountIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  discountToggle: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  discountToggleIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  discountEditor: {
    gap: 12,
    padding: 12,
    borderRadius: 15,
  },
  discountModes: {
    flexDirection: "row",
    gap: 7,
    padding: 5,
    borderRadius: 14,
  },
  discountMode: {
    flex: 1,
    minHeight: 74,
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: 11,
  },
  discountModeTop: {
    minHeight: 27,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  discountModeSymbol: {
    minWidth: 30,
    minHeight: 25,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderRadius: 8,
  },
  discountModeCopy: { alignItems: "center" },
  discountModeDescription: { textAlign: "center", flexShrink: 1 },
  discountTotals: {
    gap: 10,
    padding: 13,
    borderRadius: 15,
  },
  discountSubtotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(90,110,100,0.28)",
  },
  discountTotal: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  multilineInput: { minHeight: 88 },
  itemCard: {
    gap: 16,
    borderRadius: 18,
    padding: 16,
    borderLeftWidth: 4,
  },
  itemHeadingTitle: { flexDirection: "row", alignItems: "center", gap: 9 },
  itemNumber: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  itemHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  removeItemButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
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
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    padding: 16,
  },
  reminderSection: { gap: 10 },
  reminderCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 5,
  },
  reminderToggle: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 2,
    paddingVertical: 8,
  },
  reminderIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  reminderSchedule: { gap: 12, paddingTop: 13, paddingBottom: 8 },
  fullyPaidToggle: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  checkboxMark: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 7,
  },
  paymentSummary: { gap: 11 },
  paymentPaidRow: {
    minHeight: 39,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  purchaseTotalHero: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 16,
    borderRadius: 16,
  },
  purchaseTotalAmount: { marginTop: 4 },
  purchaseTotalIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  mpesaImportCard: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
  },
  mpesaImportIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#226B68",
  },
  mpesaCaption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
  },
  mpesaArrow: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  paymentOutcome: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 15,
  },
  paymentCard: {
    gap: 14,
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
  },
  paymentCardHeader: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  paymentHeadingTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  paymentNumber: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  paymentMethodBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  removePaymentButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  paymentEntry: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  flexCopy: { flex: 1 },
  contactDetails: { gap: 6, paddingVertical: 4 },
  contactLink: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reviewCard: { gap: 13, borderRadius: 18, padding: 16 },
  pricingCard: { gap: 15, borderRadius: 18, padding: 16 },
  reviewHero: { gap: 14, padding: 17, borderRadius: 20 },
  reviewHeroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  reviewHeroIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  reviewHeroAmount: { marginTop: 2 },
  reviewDateBadge: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 11,
  },
  reviewHeroDivider: { height: StyleSheet.hairlineWidth },
  reviewSupplierLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reviewSectionHeading: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 2,
  },
  reviewSectionIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  reviewSupplierCard: { gap: 10, borderRadius: 18, padding: 14 },
  supplierStatusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  reviewLine: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 9,
  },
  reviewNotes: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 12,
  },
  reviewPaymentRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  reviewPaymentIndex: {
    width: 27,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  reviewTotalLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: 11,
  },
  reviewBalance: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderRadius: 14,
  },
  reviewBalanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
  },
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
  leavePromptOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  leavePromptCard: {
    gap: 13,
    alignSelf: "center",
    width: "100%",
    maxWidth: 430,
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
  },
  leavePromptIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  leavePromptButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 14,
  },
  leavePromptChoices: { flexDirection: "row", gap: 9 },
  leavePromptChoice: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 14,
  },
  leavePromptDestructive: { backgroundColor: "transparent" },
  navigationActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 9,
    paddingTop: 2,
  },
  navigationBack: {
    minWidth: 94,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 15,
  },
  navigationContinue: {
    minWidth: 142,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 18,
    overflow: "hidden",
  },
  successContent: { gap: 16 },
  successScroll: { paddingBottom: 20 },
  successHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  successMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7, marginTop: -7 },
  successSection: { gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16 },
  successFooter: { flexDirection: "row", gap: 9, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8 },
  successFooterButton: { flex: 1, minWidth: 0, paddingHorizontal: 10 },
  deliveryHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  deliveryItem: { gap: 6, paddingVertical: 7 },
  successProgressTrack: { height: 7, overflow: "hidden", borderRadius: 4 },
  successProgressFill: { height: "100%", borderRadius: 4 },
  purchasedItem: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#D8DED5", paddingTop: 10 },
  purchasedItemHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  purchaseTotalRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderTopWidth: 1, paddingTop: 11 },
  paymentLine: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 5 },
  inlinePaymentForm: { gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 4 },
  balanceSmsAction: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  paymentMethodChoices: { flexDirection: "row", gap: 8 },
  paymentMethodChoice: { minHeight: 40, flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 8 },
  paymentFormActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  reminderEditor: { gap: 12, paddingTop: 12 },
  linkButton: { paddingVertical: 6, paddingHorizontal: 2 },
  purchaseNotes: { textAlign: "left" },
  reminderErrorCard: { gap: 10, borderRadius: 12, padding: 12, backgroundColor: "transparent" },
  receiptSuccess: { gap: 10 },
  reminderSaved: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
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
