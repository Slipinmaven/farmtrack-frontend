import type {
  NormalizedPaymentMessage,
  PaymentChannel,
  PaymentDirection,
  PaymentMessageType,
  PaymentTransactionStatus,
} from "./types";

type ParsedDateTime = {
  date: string | null;
  time: string | null;
  dateTime: string | null;
  error: string | null;
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function parseDateParts(
  value: string,
): { year: number; month: number; day: number } | null {
  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(value);
  let year: number;
  let month: number;
  let day: number;

  if (numeric) {
    day = Number(numeric[1]);
    month = Number(numeric[2]);
    year = Number(numeric[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
  } else {
    const named =
      /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(value) ??
      /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/.exec(value);
    if (!named) return null;
    if (/^\d/.test(named[1])) {
      day = Number(named[1]);
      month = MONTHS[named[2].toLowerCase()];
      year = Number(named[3]);
    } else {
      month = MONTHS[named[1].toLowerCase()];
      day = Number(named[2]);
      year = Number(named[3]);
    }
    if (!month) return null;
  }

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function parseTime(value: string): { value: string | null; error: string | null } {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(
    value.trim(),
  );
  if (!match) return { value: null, error: "The transaction time is invalid." };

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  const meridiem = match[4]?.toUpperCase();
  if (minute > 59 || second > 59 || (meridiem && (hour < 1 || hour > 12))) {
    return { value: null, error: "The transaction time is invalid." };
  }
  if (meridiem) {
    hour = hour % 12 + (meridiem === "PM" ? 12 : 0);
  } else if (hour > 23) {
    return { value: null, error: "The transaction time is invalid." };
  }
  return {
    value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    error: null,
  };
}

export function parseKenyanTransactionDateTime(message: string): ParsedDateTime {
  const datePattern =
    /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})\b/;
  const dateMatch = datePattern.exec(message);
  if (!dateMatch) {
    return {
      date: null,
      time: null,
      dateTime: null,
      error: null,
    };
  }

  const parsedDate = parseDateParts(dateMatch[1]);
  if (!parsedDate) {
    return {
      date: null,
      time: null,
      dateTime: null,
      error: "The transaction date is invalid or could not be interpreted.",
    };
  }

  const afterDate = message.slice(dateMatch.index + dateMatch[0].length);
  const timeMatch = /\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\b/i.exec(
    afterDate,
  );
  const date = `${String(parsedDate.year).padStart(4, "0")}-${String(
    parsedDate.month,
  ).padStart(2, "0")}-${String(parsedDate.day).padStart(2, "0")}`;
  if (!timeMatch) {
    return { date, time: null, dateTime: null, error: null };
  }

  const parsedTime = parseTime(timeMatch[1]);
  if (!parsedTime.value) {
    return {
      date,
      time: null,
      dateTime: null,
      error: parsedTime.error,
    };
  }

  const [hour, minute] = parsedTime.value.split(":").map(Number);
  const utcMillis =
    Date.UTC(parsedDate.year, parsedDate.month - 1, parsedDate.day, hour, minute) -
    3 * 60 * 60 * 1000;
  return {
    date,
    time: parsedTime.value,
    dateTime: new Date(utcMillis).toISOString(),
    error: null,
  };
}

function looksLikeMpesaConfirmation(message: string, reference: string | null) {
  return (
    /\bm[\s-]?pesa\b|\bpochi(?:\s+la\s+biashara)?\b/i.test(message) ||
    Boolean(reference && /\bconfirmed\b/i.test(message))
  );
}

export function classifyMpesaMessage(
  message: string,
  reference: string | null,
): PaymentMessageType {
  if (!looksLikeMpesaConfirmation(message, reference)) return "NOT_MPESA";
  if (/\brevers(?:ed|al|ing)\b|\btransaction reversed\b/i.test(message)) {
    return "REVERSAL";
  }
  if (
    /\bfailed\b|\bcancelled\b|\bcanceled\b|\bnot successful\b|\bcould not be processed\b/i.test(
      message,
    )
  ) {
    return "FAILED";
  }
  if (/\bfuliza\b/i.test(message)) return "FULIZA";
  if (
    /\bbalance enquiry\b|\bbalance inquiry\b|\byour\s+(?:m-?pesa\s+)?balance is\b/i.test(
      message,
    )
  ) {
    return "BALANCE_ENQUIRY";
  }
  if (/\bwithdraw(?:al|n)?\b|\batm\b/i.test(message)) {
    return "WITHDRAWAL";
  }
  if (/\bdeposit(?:ed)?\b/i.test(message) && !/\bfor account\b/i.test(message)) {
    return "DEPOSIT";
  }
  if (
    /\byou have received\b|\bhas received\b|\breceived\s+(?:Ksh|KES|USD)\b|\bcredited with\b/i.test(
      message,
    )
  ) {
    return "RECEIVED_MONEY";
  }
  if (
    /\bpay[\s-]?bill\b|\baccount number\b|\bfor account\b/i.test(message)
  ) {
    return "PAYBILL";
  }
  if (
    /\bbuy goods\b|\btill(?: number| no\.?)?\b|\bpaid to\b|\bpochi(?:\s+la\s+biashara)?\b/i.test(
      message,
    )
  ) {
    return "BUY_GOODS";
  }
  if (/\bsent to\b/i.test(message)) return "SEND_MONEY";
  return "UNKNOWN";
}

function parseAmount(message: string): {
  amount: string | null;
  currency: string | null;
} {
  const currencyMatch =
    /(?:^|[^A-Z])(KES|KSHS?|USD|EUR|GBP)\s*([0-9][0-9,. ]*(?:[.,][0-9]{1,2})?)/i.exec(
      message,
    );
  const symbolMatch =
    /([$€£])\s*([0-9][0-9,. ]*(?:[.,][0-9]{1,2})?)/.exec(message);
  const fallbackMatch =
    /\b(?:paid|sent|received|amount)\D{0,12}([0-9][0-9,. ]*(?:[.,][0-9]{1,2})?)/i.exec(
      message,
    );
  const matched = currencyMatch ?? symbolMatch ?? fallbackMatch;
  if (!matched) return { amount: null, currency: null };

  const raw = ((currencyMatch || symbolMatch ? matched[2] : matched[1]) ?? "")
    .trim()
    .replace(/[.,]$/, "");
  const currencyToken = currencyMatch?.[1]?.toUpperCase();
  const symbolCurrency = symbolMatch
    ? { $: "USD", "€": "EUR", "£": "GBP" }[symbolMatch[1]] ?? null
    : null;
  const currency: string | null =
    currencyToken?.startsWith("KSH") || currencyToken === "KES"
      ? "KES"
      : currencyToken ?? symbolCurrency;
  const normalized = normalizeAmount(raw);
  return { amount: normalized, currency };
}

function normalizeAmount(raw: string): string | null {
  let value = raw.replace(/\s/g, "");
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    value = value.split(groupingSeparator).join("");
    if (decimalSeparator === ",") value = value.replace(",", ".");
  } else if (lastComma >= 0) {
    const fractionLength = value.length - lastComma - 1;
    value =
      fractionLength > 0 && fractionLength <= 2
        ? value.replace(",", ".")
        : value.replace(/,/g, "");
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function cleanEntity(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/\b(?:on|at)\s*$/i, "")
    .replace(/[\s,.;:-]+$/, "")
    .trim();
  return cleaned || null;
}

function extractEntity(
  message: string,
  keyword: "from" | "to",
): { name: string | null; phone: string | null } {
  const match = new RegExp(
    `\\b${keyword}\\s+(.+?)(?=\\s+for account\\b|\\s+for\\b|\\s+via\\s+Pochi\\b|\\s+on\\s+\\d|\\s+at\\s+\\d|\\s+account\\b|$)`,
    "i",
  ).exec(message);
  const phone =
    /\b(?:\+?254|0)[0-9Xx*]{7,10}\b/.exec(match?.[1] ?? "")?.[0] ?? null;
  const name = cleanEntity(
    match?.[1]
      ?.replace(/\b(?:phone|mobile|number)\b.*$/i, "")
      .replace(phone ?? "\u0000", ""),
  );
  return { name, phone };
}

function extractBusinessNumber(message: string): string | null {
  const match =
    /\b(?:pay[\s-]?bill|till|business)\s*(?:number|no\.?)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{3,19})\b/i.exec(
      message,
    );
  return match?.[1] ?? null;
}

function extractAccountNumber(message: string): string | null {
  const match =
    /\b(?:for\s+)?account(?:\s+number)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{0,29})/i.exec(
      message,
    );
  return match?.[1] ?? null;
}

function channelFor(messageType: PaymentMessageType): PaymentChannel {
  switch (messageType) {
    case "BUY_GOODS":
      return "BUY_GOODS";
    case "PAYBILL":
      return "PAYBILL";
    case "SEND_MONEY":
      return "SEND_MONEY";
    case "RECEIVED_MONEY":
      return "RECEIVED_MONEY";
    case "NOT_MPESA":
      return "OTHER";
    case "UNKNOWN":
      return "UNKNOWN";
    default:
      return "OTHER";
  }
}

function statusFor(messageType: PaymentMessageType): PaymentTransactionStatus {
  if (messageType === "REVERSAL") return "REVERSAL";
  if (messageType === "FAILED") return "FAILED";
  if (
    [
      "BUY_GOODS",
      "PAYBILL",
      "SEND_MONEY",
      "RECEIVED_MONEY",
    ].includes(messageType)
  ) {
    return "SUCCESS";
  }
  return "UNKNOWN";
}

function directionFor(
  message: string,
  messageType: PaymentMessageType,
): PaymentDirection {
  if (
    messageType === "RECEIVED_MONEY" ||
    /\byou have received\b|\bhas received\b|\bcredited with\b/i.test(message)
  ) {
    return "INCOMING";
  }
  if (
    ["BUY_GOODS", "PAYBILL", "SEND_MONEY"].includes(messageType) &&
    /\b(?:paid to|sent to|buy goods|pay[\s-]?bill|till|pochi(?:\s+la\s+biashara)?)\b/i.test(
      message,
    )
  ) {
    return "OUTGOING";
  }
  return "UNKNOWN";
}

export function parsePaymentMessage(message: string): NormalizedPaymentMessage {
  const normalizedMessage = message.trim();
  const referenceMatch = /\b([A-Z0-9]{6,12})\s+Confirmed\b/i.exec(
    normalizedMessage,
  );
  const transactionReference = referenceMatch?.[1]?.toUpperCase() ?? null;
  const messageType = classifyMpesaMessage(normalizedMessage, transactionReference);
  const transactionStatus = statusFor(messageType);
  const direction = directionFor(normalizedMessage, messageType);
  const { amount, currency } = parseAmount(normalizedMessage);
  const dateTime = parseKenyanTransactionDateTime(normalizedMessage);
  const recipient = extractEntity(normalizedMessage, "to");
  const sender = extractEntity(normalizedMessage, "from");
  const warnings: string[] = [];
  const missingFields: string[] = [];
  const uncertainFields: string[] = [];

  if (messageType === "NOT_MPESA") {
    warnings.push("This text does not look like a supported M-Pesa confirmation.");
  } else if (messageType === "UNKNOWN") {
    warnings.push(
      "This M-Pesa message format is not recognized. Do not treat it as a successful payment without checking it.",
    );
    uncertainFields.push("paymentChannel", "direction", "transactionStatus");
  } else if (["WITHDRAWAL", "DEPOSIT", "BALANCE_ENQUIRY", "FULIZA"].includes(messageType)) {
    warnings.push("This M-Pesa message is not a supplier payment confirmation.");
  } else if (messageType === "REVERSAL") {
    warnings.push(
      "This is a reversal, not a new successful payment. Check the original transaction separately.",
    );
  } else if (messageType === "FAILED") {
    warnings.push("This transaction was not successful and cannot be recorded as paid.");
  }

  if (direction === "INCOMING") {
    warnings.push(
      "This message describes money received. Confirm separately that it represents an outgoing supplier payment before recording it.",
    );
  } else if (direction === "UNKNOWN" && transactionStatus === "SUCCESS") {
    warnings.push("Payment direction is unclear and must be reviewed.");
    uncertainFields.push("direction");
  }
  if (!transactionReference) missingFields.push("transactionReference");
  if (!amount) missingFields.push("amount");
  if (!dateTime.date) missingFields.push("transactionDate");
  if (!dateTime.time) missingFields.push("transactionTime");
  if (dateTime.error) warnings.push(dateTime.error);
  if (!recipient.name && direction === "OUTGOING") missingFields.push("recipientName");
  if (!sender.name && direction === "INCOMING") missingFields.push("senderName");
  if (amount && currency && currency !== "KES") {
    warnings.push(
      `The message amount is in ${currency}; FarmTrack payment totals use the farm's configured currency.`,
    );
    uncertainFields.push("amount", "currency");
  }
  if (!normalizedMessage) {
    warnings.push("No shared text was received.");
  }

  const businessNumber = extractBusinessNumber(normalizedMessage);
  const accountNumber = extractAccountNumber(normalizedMessage);
  const supportedSuccess = transactionStatus === "SUCCESS";
  const requiredReliableFields =
    Number(Boolean(transactionReference)) + Number(Boolean(amount));

  return {
    transactionReference,
    amount,
    currency,
    paymentChannel: channelFor(messageType),
    direction,
    transactionStatus,
    messageType,
    senderName: sender.name,
    senderPhone: sender.phone,
    recipientName: recipient.name,
    recipientPhone: recipient.phone,
    businessNumber,
    accountNumber,
    transactionDate: dateTime.date,
    transactionTime: dateTime.time,
    transactionDateTime: dateTime.dateTime,
    timezone: "Africa/Nairobi",
    importedAt: new Date().toISOString(),
    originalMessage: normalizedMessage,
    parserConfidence: supportedSuccess
      ? 0.5 + requiredReliableFields * 0.15 + Number(Boolean(dateTime.date)) * 0.1
      : messageType === "UNKNOWN"
        ? 0.3
        : 0.1,
    warnings,
    missingFields,
    uncertainFields: [...new Set(uncertainFields)],
  };
}
