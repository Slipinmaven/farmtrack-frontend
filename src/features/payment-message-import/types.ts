export type PaymentChannel =
  | "BUY_GOODS"
  | "PAYBILL"
  | "SEND_MONEY"
  | "RECEIVED_MONEY"
  | "OTHER"
  | "UNKNOWN";

export type PaymentDirection = "INCOMING" | "OUTGOING" | "UNKNOWN";

export type PaymentTransactionStatus =
  | "SUCCESS"
  | "FAILED"
  | "REVERSAL"
  | "UNKNOWN";

export type PaymentMessageType =
  | "BUY_GOODS"
  | "PAYBILL"
  | "SEND_MONEY"
  | "RECEIVED_MONEY"
  | "WITHDRAWAL"
  | "DEPOSIT"
  | "REVERSAL"
  | "FAILED"
  | "BALANCE_ENQUIRY"
  | "FULIZA"
  | "UNKNOWN"
  | "NOT_MPESA";

export type NormalizedPaymentMessage = {
  transactionReference: string | null;
  amount: string | null;
  currency: string | null;
  paymentChannel: PaymentChannel;
  direction: PaymentDirection;
  transactionStatus: PaymentTransactionStatus;
  messageType: PaymentMessageType;
  senderName: string | null;
  senderPhone: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  businessNumber: string | null;
  accountNumber: string | null;
  transactionDate: string | null;
  transactionTime: string | null;
  transactionDateTime: string | null;
  timezone: "Africa/Nairobi";
  importedAt: string;
  originalMessage: string;
  parserConfidence: number;
  warnings: string[];
  missingFields: string[];
  uncertainFields: string[];
};

export type SharedTextMessage = {
  id: string;
  text: string;
};
