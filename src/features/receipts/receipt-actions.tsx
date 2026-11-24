import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Print from "expo-print";
import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { AppText } from "@/components/ui/app-text";
import type { ReceiptDocument } from "@/features/receipts/receipt-export";
import { createReceiptHtml } from "@/features/receipts/receipt-export";
import { exportHtmlPdf } from "@/features/reports/export";
import { useTheme } from "@/providers/theme-provider";

export function GenerateReceiptButton({
  transactionId,
  transactionType,
  paymentId,
  paymentNumber,
  compact = false,
}: {
  transactionId: string;
  transactionType: "sale" | "purchase";
  paymentId?: string;
  paymentNumber?: number;
  compact?: boolean;
}) {
  const { theme } = useTheme();
  const isPayment = paymentNumber !== undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        isPayment ? "Generate payment receipt" : "Generate transaction receipt"
      }
      onPress={() =>
        router.push({
          pathname: "/transactions/[transactionId]/receipt",
          params: {
            transactionId,
            transactionType,
            documentKind: isPayment ? "payment" : "transaction",
            paymentId,
            paymentNumber: isPayment ? String(paymentNumber) : undefined,
          },
        })
      }
      style={({ pressed }) => [
        styles.generateButton,
        compact && styles.compactGenerateButton,
        {
          backgroundColor: compact ? theme.backgroundElement : `${theme.primary}12`,
          borderColor: compact ? theme.border : `${theme.primary}55`,
          opacity: pressed ? 0.76 : 1,
        },
      ]}
    >
      <Ionicons
        name={isPayment ? "receipt-outline" : "receipt"}
        size={compact ? 15 : 17}
        color={theme.text}
      />
      <AppText
        size="small"
        weight="semibold"
        numberOfLines={1}
        style={{ color: theme.text }}
      >
        {compact
          ? isPayment
            ? "Payment receipt"
            : "Receipt"
          : isPayment
            ? "Generate payment receipt"
            : "Generate receipt"}
      </AppText>
      {compact ? null : (
        <Ionicons
          name="arrow-forward"
          size={15}
          color={theme.textSecondary}
          style={styles.generateArrow}
        />
      )}
    </Pressable>
  );
}

export function ReceiptActionButtons({
  document,
}: {
  document: ReceiptDocument;
}) {
  const { theme } = useTheme();
  const [busy, setBusy] = useState<"pdf" | "print" | null>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const reference =
    document.transaction.reference_number ?? document.transaction.id;
  const filename = safeFilename(
    document.kind === "payment"
      ? `${document.transactionType}-${reference}-payment-${document.paymentNumber}`
      : `${document.transactionType}-${reference}`,
  );
  const html = createReceiptHtml(document);

  async function handleAction(action: "pdf" | "print") {
    setBusy(action);
    setFeedback(null);
    try {
      if (action === "pdf") {
        await exportHtmlPdf(html, filename, { receipt: true });
        setFeedback({
          message:
            Platform.OS === "web"
              ? "Receipt PDF downloaded."
              : "Receipt PDF is ready to share.",
          error: false,
        });
      } else {
        await printReceipt(html);
        setFeedback({ message: "Receipt sent to the print dialog.", error: false });
      }
    } catch (cause) {
      setFeedback({
        message:
          cause instanceof Error
            ? `Could not create the receipt: ${cause.message}`
            : "Could not create the receipt. Please try again.",
        error: true,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.actionPanel}>
      <View style={styles.actionsHeading}>
        <Ionicons name="download-outline" size={18} color={theme.primary} />
        <AppText weight="semibold">Take your receipt</AppText>
      </View>
      <View style={styles.actions}>
        <ActionButton
          label={busy === "pdf" ? "Preparing…" : "Share PDF"}
          icon="share-outline"
          primary
          loading={busy === "pdf"}
          disabled={Boolean(busy)}
          onPress={() => void handleAction("pdf")}
        />
        <ActionButton
          label={busy === "print" ? "Preparing…" : "Print receipt"}
          icon="print-outline"
          loading={busy === "print"}
          disabled={Boolean(busy)}
          onPress={() => void handleAction("print")}
        />
      </View>
      {feedback ? (
        <AppText
          size="small"
          style={{ color: feedback.error ? theme.danger : theme.success }}
          accessibilityRole={feedback.error ? "alert" : undefined}
        >
          {feedback.message}
        </AppText>
      ) : null}
    </View>
  );
}

function ActionButton({
  label,
  icon,
  primary = false,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  primary?: boolean;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const accent = primary ? theme.onPrimary : theme.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: primary ? theme.primary : theme.backgroundElement,
          borderColor: primary ? theme.primary : theme.border,
          opacity: disabled ? 0.62 : pressed ? 0.76 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={accent} />
      ) : (
        <Ionicons name={icon} size={18} color={accent} />
      )}
      <AppText
        size="small"
        weight="semibold"
        style={{ color: accent }}
        numberOfLines={1}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

async function printReceipt(html: string): Promise<void> {
  if (Platform.OS !== "web") {
    await Print.printAsync({ html });
    return;
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("The browser blocked the receipt print window.");
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  await new Promise<void>((resolve, reject) => {
    let started = false;
    const startPrint = () => {
      if (started) return;
      started = true;
      if (printWindow.closed) {
        reject(new Error("The receipt print window was closed."));
        return;
      }
      printWindow.addEventListener(
        "afterprint",
        () => printWindow.close(),
        { once: true },
      );
      printWindow.focus();
      printWindow.print();
      resolve();
    };
    printWindow.addEventListener("load", startPrint, { once: true });
    window.setTimeout(startPrint, 500);
  });
}

function safeFilename(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

const styles = StyleSheet.create({
  generateButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 10,
  },
  compactGenerateButton: {
    minHeight: 34,
    justifyContent: "flex-start",
    paddingHorizontal: 9,
    borderRadius: 8,
  },
  generateArrow: { marginLeft: "auto" },
  actionPanel: { gap: 12 },
  actionsHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  actionButton: {
    minHeight: 46,
    flex: 1,
    minWidth: 130,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 11,
  },
});
