import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidKenyanMobile,
  kenyanMobileError,
  normalizedKenyanPhone,
} from "../src/features/management/kenyan-phone.ts";

test("accepts Kenyan mobile numbers in local and international formats", () => {
  for (const phone of [
    "0712 345 678",
    "0112 345 678",
    "+254 712 345 678",
    "254112345678",
    "712345678",
  ]) {
    assert.equal(isValidKenyanMobile(phone), true, phone);
    assert.equal(kenyanMobileError(phone), undefined, phone);
  }
});

test("normalizes valid international and national phone formats equally", () => {
  assert.equal(normalizedKenyanPhone("+254 712 345 678"), "0712345678");
  assert.equal(normalizedKenyanPhone("712345678"), "0712345678");
  assert.equal(
    normalizedKenyanPhone("0112 345 678"),
    normalizedKenyanPhone("0112345678"),
  );
});

test("explains an 11-digit payer number instead of accepting it", () => {
  const phone = "01123456789";
  assert.equal(isValidKenyanMobile(phone), false);
  assert.match(kenyanMobileError(phone) ?? "", /11 digits/);
  assert.match(kenyanMobileError(phone) ?? "", /10 digits/);
});

test("asks for the payer phone when the value is empty", () => {
  assert.match(kenyanMobileError("   ") ?? "", /Enter the payer’s mobile number/);
});
