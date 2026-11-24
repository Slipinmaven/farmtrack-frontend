import type { NormalizedPaymentMessage } from "./types";

export type ImportedPaymentAssessment = {
  expectedAmount: string | null;
  importedAmount: string | null;
  amountComparison: "MATCH" | "PARTIAL" | "OVER" | "UNKNOWN";
  duplicateReference: boolean;
  warnings: string[];
};

export function assessImportedPayment(
  payment: NormalizedPaymentMessage,
  expectedAmount: string | null,
  existingReferences: string[],
): ImportedPaymentAssessment {
  const importedCents = parseCents(payment.amount);
  const expectedCents = parseCents(expectedAmount);
  const amountComparison =
    importedCents === null || expectedCents === null
      ? "UNKNOWN"
      : importedCents === expectedCents
        ? "MATCH"
        : importedCents < expectedCents
          ? "PARTIAL"
          : "OVER";
  const normalizedReference = payment.transactionReference?.trim().toUpperCase();
  const duplicateReference = Boolean(
    normalizedReference &&
      existingReferences.some(
        (reference) => reference.trim().toUpperCase() === normalizedReference,
      ),
  );
  const warnings = [...payment.warnings];
  if (amountComparison === "PARTIAL") {
    warnings.push(
      "The imported amount is less than the expected payment. It will be recorded as a partial payment.",
    );
  } else if (amountComparison === "OVER") {
    warnings.push(
      "The imported amount is higher than the expected payment. FarmTrack will not change the purchase total; the existing overpayment confirmation is still required.",
    );
  }
  if (duplicateReference) {
    warnings.push("This transaction reference is already present in this purchase form.");
  }
  return {
    expectedAmount,
    importedAmount: payment.amount,
    amountComparison,
    duplicateReference,
    warnings,
  };
}

function parseCents(value: string | null): bigint | null {
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
}
