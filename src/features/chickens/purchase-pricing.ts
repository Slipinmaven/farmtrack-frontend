export type PurchaseDiscountType = "fixed" | "percentage";
export const PURCHASE_DISCOUNT_CONFIRMATION_THRESHOLD_BASIS_POINTS = 8000n;

export type PurchasePricingLine = {
  quantity: string;
  unitPrice: string;
  conversionFactor: number;
};

export type PurchasePricing = {
  subtotalCents: bigint;
  discountCents: bigint;
  totalCents: bigint;
  chickenCount: bigint;
  effectiveCostPerChickenCents: bigint | null;
  error: string | null;
};

function parseScaledDecimal(value: string, scale: bigint): bigint | null {
  const normalized = value.trim();
  const fractionalDigits = Number(scale.toString().length - 1);
  const fractionPattern =
    fractionalDigits > 0 ? `(?:\\.\\d{0,${fractionalDigits}})?` : "";
  if (!new RegExp(`^\\d+${fractionPattern}$`).test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return (
    BigInt(whole) * scale +
    BigInt(fraction.padEnd(fractionalDigits, "0") || "0")
  );
}

export function parseMoneyToCents(value: string): bigint | null {
  return parseScaledDecimal(value, 100n);
}

export function centsToDecimal(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function requiresPurchaseDiscountConfirmation(
  subtotalCents: bigint,
  discountCents: bigint,
): boolean {
  return (
    subtotalCents > 0n &&
    discountCents * 10000n >
      subtotalCents * PURCHASE_DISCOUNT_CONFIRMATION_THRESHOLD_BASIS_POINTS
  );
}

export function calculateChickenPurchasePricing(
  lines: PurchasePricingLine[],
  discountType: PurchaseDiscountType | null,
  discountValue: string,
): PurchasePricing {
  let subtotalCents = 0n;
  let chickenMilliCount = 0n;
  for (const line of lines) {
    const quantityText = line.quantity.trim();
    if (quantityText && !/^\d+$/.test(quantityText)) {
      return emptyPricing("Chicken quantities must be whole numbers.");
    }
    const quantity = quantityText ? BigInt(quantityText) : 0n;
    const unitPriceCents = parseMoneyToCents(line.unitPrice);
    if (line.unitPrice.trim() && unitPriceCents === null) {
      return emptyPricing("Unit prices can have up to two decimal places.");
    }
    const price = unitPriceCents ?? 0n;
    subtotalCents += quantity * price;

    if (quantity > 0n) {
      const factor = parseScaledDecimal(String(line.conversionFactor), 1000n);
      if (factor === null || factor <= 0n) {
        return emptyPricing(
          "The selected unit has an invalid chicken conversion.",
        );
      }
      chickenMilliCount += quantity * factor;
    }
  }

  const chickenCount = chickenMilliCount / 1000n;
  if (chickenMilliCount % 1000n !== 0n) {
    return emptyPricing("Chicken quantities must convert to whole chickens.");
  }

  let discountCents = 0n;
  if (discountType) {
    const parsedDiscount = parseMoneyToCents(discountValue);
    if (parsedDiscount === null) {
      return {
        subtotalCents,
        discountCents,
        totalCents: subtotalCents,
        chickenCount,
        effectiveCostPerChickenCents: null,
        error: "Enter a valid discount amount.",
      };
    }
    if (discountType === "fixed") {
      discountCents = parsedDiscount;
    } else {
      if (parsedDiscount > 10000n) {
        return {
          subtotalCents,
          discountCents,
          totalCents: subtotalCents,
          chickenCount,
          effectiveCostPerChickenCents: null,
          error: "A percentage discount cannot exceed 100%.",
        };
      }
      discountCents = (subtotalCents * parsedDiscount + 5000n) / 10000n;
    }
    if (discountCents > subtotalCents) {
      return {
        subtotalCents,
        discountCents,
        totalCents: subtotalCents,
        chickenCount,
        effectiveCostPerChickenCents: null,
        error: "Discount cannot exceed the purchase subtotal.",
      };
    }
  }

  const totalCents = subtotalCents - discountCents;
  return {
    subtotalCents,
    discountCents,
    totalCents,
    chickenCount,
    effectiveCostPerChickenCents:
      chickenCount > 0n
        ? (totalCents + chickenCount / 2n) / chickenCount
        : null,
    error: null,
  };
}

function emptyPricing(error: string): PurchasePricing {
  return {
    subtotalCents: 0n,
    discountCents: 0n,
    totalCents: 0n,
    chickenCount: 0n,
    effectiveCostPerChickenCents: null,
    error,
  };
}

export function formatCents(cents: bigint, currency: string): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const integerPart = absolute / 100n;
  const fractionPart = Number(absolute % 100n);
  const groupingFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  });
  const groupingParts = groupingFormatter.formatToParts(1234567890123);
  const groupSeparator = groupingParts.find(
    (part) => part.type === "group",
  )?.value;
  const groupLengths = groupingParts
    .filter((part) => part.type === "integer")
    .map((part) => part.value.length);
  const primaryGroupLength = groupLengths.at(-1) ?? 3;
  const secondaryGroupLength = groupLengths.at(-2) ?? primaryGroupLength;
  let groupedInteger = integerPart.toString();
  if (groupSeparator) {
    const groups: string[] = [];
    let end = groupedInteger.length;
    let groupLength = primaryGroupLength;
    while (end > groupLength) {
      groups.unshift(groupedInteger.slice(end - groupLength, end));
      end -= groupLength;
      groupLength = secondaryGroupLength;
    }
    groups.unshift(groupedInteger.slice(0, end));
    groupedInteger = groups.join(groupSeparator);
  }
  const localizedFraction = new Intl.NumberFormat(undefined, {
    useGrouping: false,
    minimumIntegerDigits: 2,
    maximumFractionDigits: 0,
  }).format(fractionPart);
  let hasInteger = false;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .formatToParts(negative ? -1 : 1)
    .map((part) => {
      if (part.type === "integer") {
        if (hasInteger) return "";
        hasInteger = true;
        return groupedInteger;
      }
      if (part.type === "group") return "";
      if (part.type === "fraction") return localizedFraction;
      return part.value;
    })
    .join("");
}

export function formatMoneyValue(
  value: number | string,
  currency: string,
): string {
  const normalized =
    typeof value === "number" ? value.toFixed(2) : value.trim();
  const negative = normalized.startsWith("-");
  const cents = parseMoneyToCents(
    negative ? normalized.slice(1) : normalized,
  );
  if (cents !== null) return formatCents(negative ? -cents : cents, currency);

  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue)
    ? new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).format(numericValue)
    : "—";
}
