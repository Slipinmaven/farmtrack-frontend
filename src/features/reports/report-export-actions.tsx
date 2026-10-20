import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  exportReport,
  type ReportExportData,
  type ReportExportFormat,
} from "@/features/reports/export";
import { useTheme } from "@/providers/theme-provider";

const formats: {
  id: ReportExportFormat;
  label: string;
}[] = [
  { id: "pdf", label: "Download PDF" },
  { id: "xlsx", label: "Excel" },
  { id: "csv", label: "CSV" },
];

export function ReportExportActions({
  data,
  resolveData,
}: {
  data: ReportExportData;
  resolveData?: () => Promise<ReportExportData>;
}) {
  const { theme } = useTheme();
  const [busy, setBusy] = useState<ReportExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleExport(format: ReportExportFormat) {
    setBusy(format);
    setError(null);
    setStatus(null);
    try {
      const exportData = resolveData ? await resolveData() : data;
      await exportReport(exportData, format);
      setStatus(
        format === "pdf"
          ? Platform.OS === "web"
            ? "PDF download started."
            : "PDF is ready to share."
          : `${format === "xlsx" ? "Excel workbook" : "CSV file"} download started.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not create the ${format.toUpperCase()} report: ${cause.message}`
          : `Could not create the ${format.toUpperCase()} report. Please try again.`,
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="download-outline" size={18} color={theme.primary} />
        </View>
        <View style={styles.copy}>
          <AppText weight="semibold">Download this report</AppText>
          <AppText size="small" tone="secondary">
            PDF for sharing, Excel for analysis, or CSV for data transfer.
          </AppText>
        </View>
      </View>
      <View style={styles.actions}>
        {formats.map((format) => (
          <Button
            key={format.id}
            label={format.label}
            variant={format.id === "pdf" ? "primary" : "secondary"}
            loading={busy === format.id}
            disabled={Boolean(busy)}
            onPress={() => void handleExport(format.id)}
            style={styles.action}
          />
        ))}
      </View>
      {status ? <AppText size="small" style={{ color: theme.success }}>{status}</AppText> : null}
      {error ? <AppText size="small" style={{ color: theme.danger }}>{error}</AppText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  heading: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { flexGrow: 1, flexBasis: 100, paddingHorizontal: 10 },
});
