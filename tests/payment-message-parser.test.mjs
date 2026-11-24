import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyMpesaMessage,
  parseKenyanTransactionDateTime,
  parsePaymentMessage,
} from "../src/features/payment-message-import/parser.ts";
import { assessImportedPayment } from "../src/features/payment-message-import/validation.ts";

const fixtures = {
  buyGoods:
    "ABC123XYZ9 Confirmed. Ksh5,000.00 paid to FARM SUPPLIES LTD on 5/11/26 at 10:35 AM.",
  paybill:
    "XYZ123ABC9 Confirmed. Ksh5,000.00 sent to FARM SUPPLIES LTD for account 12A-45 on 05/11/2026 at 10:35PM.",
  sendMoney:
    "QWE123RTY4 Confirmed. Ksh5,000.00 sent to JOHN DOE 0722XXXXXX on 5 Nov 2026 at 22:35.",
  pochi:
    "PCH1234567 Confirmed. Ksh2,500.00 sent to FARM SUPPLIES via Pochi La Biashara on 5/11/26 at 11:15 AM.",
  incoming:
    "LMN123PQR5 Confirmed. You have received Ksh5,000.00 from JOHN DOE 0722XXXXXX on 5/11/26 at 10:35 AM.",
  withdrawal:
    "WDR1234567 Confirmed. Ksh2,000.00 withdrawn at an M-Pesa agent on 5/11/26 at 10:35 AM.",
  reversal:
    "REV1234567 Confirmed. Ksh5,000.00 for transaction ABC123XYZ9 has been reversed on 5/11/26 at 10:35 AM.",
  failed: "FLD1234567 Failed. Your M-Pesa transaction could not be processed.",
};

test("classifies and extracts a successful Buy Goods payment", () => {
  const parsed = parsePaymentMessage(fixtures.buyGoods);
  assert.equal(parsed.messageType, "BUY_GOODS");
  assert.equal(parsed.transactionStatus, "SUCCESS");
  assert.equal(parsed.transactionReference, "ABC123XYZ9");
  assert.equal(parsed.amount, "5000.00");
  assert.equal(parsed.recipientName, "FARM SUPPLIES LTD");
  assert.equal(parsed.direction, "OUTGOING");
  assert.equal(parsed.transactionDate, "2026-11-05");
  assert.equal(parsed.transactionTime, "10:35");
});

test("keeps a PayBill account number separate from the reference", () => {
  const parsed = parsePaymentMessage(fixtures.paybill);
  assert.equal(parsed.messageType, "PAYBILL");
  assert.equal(parsed.transactionReference, "XYZ123ABC9");
  assert.equal(parsed.accountNumber, "12A-45");
  assert.equal(parsed.recipientName, "FARM SUPPLIES LTD");
});

test("extracts recipient phone number for Send Money", () => {
  const parsed = parsePaymentMessage(fixtures.sendMoney);
  assert.equal(parsed.messageType, "SEND_MONEY");
  assert.equal(parsed.recipientPhone, "0722XXXXXX");
  assert.equal(parsed.recipientName, "JOHN DOE");
  assert.equal(parsed.direction, "OUTGOING");
});

test("recognizes Pochi La Biashara as an outgoing M-Pesa payment", () => {
  const parsed = parsePaymentMessage(fixtures.pochi);
  assert.equal(parsed.messageType, "BUY_GOODS");
  assert.equal(parsed.paymentChannel, "BUY_GOODS");
  assert.equal(parsed.direction, "OUTGOING");
  assert.equal(parsed.transactionStatus, "SUCCESS");
  assert.equal(parsed.amount, "2500.00");
});

test("keeps money received as incoming, not an outgoing payment", () => {
  const parsed = parsePaymentMessage(fixtures.incoming);
  assert.equal(parsed.messageType, "RECEIVED_MONEY");
  assert.equal(parsed.direction, "INCOMING");
  assert.equal(parsed.senderName, "JOHN DOE");
  assert.ok(parsed.warnings.some((warning) => /money received/i.test(warning)));
});

test("keeps an overlong incoming payer number separate from the payer name", () => {
  const parsed = parsePaymentMessage(
    "LMN123PQR5 Confirmed. You have received Ksh100.00 from TEST PAYER 01123456789 on 5/11/26 at 10:35 AM.",
  );
  assert.equal(parsed.senderName, "TEST PAYER");
  assert.equal(parsed.senderPhone, "01123456789");
});

test("recognizes withdrawals as non-payment messages", () => {
  const parsed = parsePaymentMessage(fixtures.withdrawal);
  assert.equal(parsed.messageType, "WITHDRAWAL");
  assert.equal(parsed.transactionStatus, "UNKNOWN");
  assert.ok(parsed.warnings.some((warning) => /not a supplier payment/i.test(warning)));
});

test("recognizes reversals without marking them as new successful payments", () => {
  const parsed = parsePaymentMessage(fixtures.reversal);
  assert.equal(parsed.messageType, "REVERSAL");
  assert.equal(parsed.transactionStatus, "REVERSAL");
  assert.ok(parsed.warnings.some((warning) => /original transaction/i.test(warning)));
});

test("recognizes failed transactions", () => {
  const parsed = parsePaymentMessage(fixtures.failed);
  assert.equal(parsed.transactionStatus, "FAILED");
  assert.equal(parsed.messageType, "FAILED");
});

test("does not treat an unrecognized M-Pesa format as a successful payment", () => {
  const parsed = parsePaymentMessage(
    "UNK1234567 Confirmed. Transaction information is being updated.",
  );
  assert.equal(parsed.messageType, "UNKNOWN");
  assert.equal(parsed.transactionStatus, "UNKNOWN");
  assert.equal(parsed.amount, null);
  assert.ok(parsed.uncertainFields.includes("direction"));
});

test("preserves date when no time was supplied", () => {
  const parsed = parsePaymentMessage(
    "ABC123XYZ9 Confirmed. Ksh500.00 paid to FARM SUPPLIES LTD on 5/11/26.",
  );
  assert.equal(parsed.transactionDate, "2026-11-05");
  assert.equal(parsed.transactionTime, null);
  assert.equal(parsed.transactionDateTime, null);
  assert.ok(parsed.missingFields.includes("transactionTime"));
});

test("flags impossible calendar dates", () => {
  const parsed = parsePaymentMessage(
    "ABC123XYZ9 Confirmed. Ksh500.00 paid to FARM SUPPLIES LTD on 31/02/2026 at 10:35.",
  );
  assert.equal(parsed.transactionDate, null);
  assert.ok(parsed.warnings.some((warning) => /date is invalid/i.test(warning)));
});

test("reports a missing amount rather than inferring it", () => {
  const parsed = parsePaymentMessage(
    "ABC123XYZ9 Confirmed. Paid to FARM SUPPLIES LTD on 5/11/26.",
  );
  assert.equal(parsed.amount, null);
  assert.ok(parsed.missingFields.includes("amount"));
});

test("parses currency formatting without confusing account and payment references", () => {
  const parsed = parsePaymentMessage(
    "XYZ123ABC9 Confirmed. KES 5.000,50 sent to FARM SUPPLIES LTD for account 001A on 05-11-2026 at 22:35.",
  );
  assert.equal(parsed.amount, "5000.50");
  assert.equal(parsed.accountNumber, "001A");
  assert.equal(parsed.transactionReference, "XYZ123ABC9");
});

test("handles unusual line breaks and spacing", () => {
  const parsed = parsePaymentMessage(
    "ABC123XYZ9   Confirmed.\nKsh 1,250.00   paid to FARM SUPPLIES LTD\non 05/11/2026 at 10:35 PM.",
  );
  assert.equal(parsed.transactionReference, "ABC123XYZ9");
  assert.equal(parsed.amount, "1250.00");
  assert.equal(parsed.transactionTime, "22:35");
});

test("classifies balance, deposit, Fuliza, and unknown non-payment notifications", () => {
  assert.equal(
    classifyMpesaMessage("ABC123 Confirmed. Your M-Pesa balance is Ksh500.", "ABC123"),
    "BALANCE_ENQUIRY",
  );
  assert.equal(
    classifyMpesaMessage("ABC123 Confirmed. Ksh500 deposited to account 1234.", "ABC123"),
    "DEPOSIT",
  );
  assert.equal(
    classifyMpesaMessage("ABC123 Confirmed. Fuliza amount is Ksh500.", "ABC123"),
    "FULIZA",
  );
  assert.equal(classifyMpesaMessage("Hello there", null), "NOT_MPESA");
});

test("parses DD/MM/YY and DD/MM/YYYY using the Kenyan date order", () => {
  assert.equal(
    parseKenyanTransactionDateTime("5/11/26").date,
    "2026-11-05",
  );
  assert.equal(
    parseKenyanTransactionDateTime("05/11/2026").date,
    "2026-11-05",
  );
});

test("parses month names, AM/PM noon, midnight, and 24-hour times", () => {
  assert.equal(
    parseKenyanTransactionDateTime("5 Nov 2026 at 12:00 AM").time,
    "00:00",
  );
  assert.equal(
    parseKenyanTransactionDateTime("5 November 2026 at 12:00 PM").time,
    "12:00",
  );
  assert.equal(
    parseKenyanTransactionDateTime("5 Nov 2026 at 22:35").time,
    "22:35",
  );
});

test("converts Nairobi local transaction time to UTC across midnight", () => {
  const parsed = parseKenyanTransactionDateTime("5/11/26 at 01:00");
  assert.equal(parsed.dateTime, "2026-11-04T22:00:00.000Z");
  assert.equal(parsed.date, "2026-11-05");
  assert.equal(parsed.time, "01:00");
});

test("applies an explicit century rule and rejects invalid times", () => {
  assert.equal(parseKenyanTransactionDateTime("5/11/69").date, "2069-11-05");
  assert.equal(parseKenyanTransactionDateTime("5/11/70").date, "1970-11-05");
  assert.equal(
    parseKenyanTransactionDateTime("5/11/2026 at 25:00").error,
    "The transaction time is invalid.",
  );
});

test("detects repeated reference imports in the same form", () => {
  const parsed = parsePaymentMessage(fixtures.buyGoods);
  const assessment = assessImportedPayment(parsed, "5000.00", ["abc123xyz9"]);
  assert.equal(assessment.duplicateReference, true);
  assert.equal(assessment.amountComparison, "MATCH");
});

test("assesses partial and overpayments without changing the expected purchase amount", () => {
  const payment = parsePaymentMessage(fixtures.buyGoods);
  assert.equal(assessImportedPayment(payment, "6000.00", []).amountComparison, "PARTIAL");
  assert.equal(assessImportedPayment(payment, "4000.00", []).amountComparison, "OVER");
});
