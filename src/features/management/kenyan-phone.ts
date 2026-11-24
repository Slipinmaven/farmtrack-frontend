export function normalizedKenyanPhone(
  phone: string | null | undefined,
): string {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (digits.startsWith("254") && digits.length === 12) {
    return `0${digits.slice(3)}`;
  }
  if (digits.length === 9 && digits.startsWith("7")) {
    return `0${digits}`;
  }
  return digits;
}

export function isValidKenyanMobile(phone: string): boolean {
  return /^0[17]\d{8}$/.test(normalizedKenyanPhone(phone));
}

export function kenyanMobileError(phone: string): string | undefined {
  const digits = phone.replace(/\D/g, "");
  if (!digits) {
    return "Enter the payer’s mobile number to link them as the customer.";
  }
  if (isValidKenyanMobile(phone)) return undefined;
  if (digits.length === 11) {
    return "This number has 11 digits. Enter 10 digits starting with 01 or 07, 9 digits starting with 7, or 12 digits starting with 254.";
  }
  return "Enter a valid Kenyan mobile number, such as 0712 345 678 or +254 712 345 678.";
}
