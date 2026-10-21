import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/app-text";
import {
  exportReport,
  type ReportExportData,
  type ReportExportFormat,
} from "@/features/reports/export";
import { useTheme } from "@/providers/theme-provider";

const formats: {
  id: ReportExportFormat;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: "pdf",
    label: "PDF",
    description: "A polished document for viewing and sharing",
    icon: "document-text-outline",
  },
  {
    id: "xlsx",
    label: "Excel workbook",
    description: "Organized sheets for sorting and analysis",
    icon: "grid-outline",
  },
  {
    id: "csv",
    label: "CSV",
    description: "Simple data file for other tools",
    icon: "reader-outline",
  },
];

export function ReportExportActions({
  data,
  resolveData,
  label,
}: {
  data: ReportExportData;
  resolveData?: () => Promise<ReportExportData>;
  label?: string;
}) {
  const { theme } = useTheme();
  const [busy, setBusy] = useState<ReportExportFormat | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleExport(format: ReportExportFormat) {
    setMenuOpen(false);
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
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? `Export ${data.title}`}
        accessibilityState={{ expanded: menuOpen, busy: Boolean(busy) }}
        disabled={Boolean(busy)}
        onPress={() => {
          setError(null);
          setStatus(null);
          setMenuOpen(true);
        }}
        style={({ pressed }) => [
          styles.trigger,
          {
            borderColor: theme.border,
            backgroundColor: theme.backgroundElement,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : (
          <Ionicons name="download-outline" size={18} color={theme.primary} />
        )}
        {label ? (
          <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
            {busy ? "Preparing…" : label}
          </AppText>
        ) : null}
        <Ionicons name="chevron-down" size={15} color={theme.textSecondary} />
      </Pressable>
      {status ? (
        <AppText size="small" style={[styles.feedback, { color: theme.success }]}>
          {status}
        </AppText>
      ) : null}
      {error ? (
        <AppText size="small" style={[styles.feedback, { color: theme.danger }]}>
          {error}
        </AppText>
      ) : null}

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close export options"
            onPress={() => setMenuOpen(false)}
            style={styles.scrim}
          />
          <SafeAreaView
            style={[
              styles.menu,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.menuHeading}>
              <View style={styles.headingCopy}>
                <AppText size="heading" weight="semibold">
                  Export report
                </AppText>
                <AppText size="small" tone="secondary" numberOfLines={2}>
                  {data.title}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close export options"
                onPress={() => setMenuOpen(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            {formats.map((format) => (
              <Pressable
                key={format.id}
                accessibilityRole="button"
                disabled={Boolean(busy)}
                onPress={() => void handleExport(format.id)}
                style={({ pressed }) => [
                  styles.formatOption,
                  {
                    backgroundColor: pressed
                      ? theme.backgroundSelected
                      : "transparent",
                    opacity: busy && busy !== format.id ? 0.5 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.formatIcon,
                    { backgroundColor: theme.backgroundSelected },
                  ]}
                >
                  <Ionicons
                    name={format.icon}
                    size={18}
                    color={theme.primary}
                  />
                </View>
                <View style={styles.formatCopy}>
                  <AppText size="small" weight="semibold">
                    {format.label}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {format.description}
                  </AppText>
                </View>
                <Ionicons
                  name="arrow-down-outline"
                  size={16}
                  color={theme.textSecondary}
                />
              </Pressable>
            ))}
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "flex-end", gap: 5 },
  trigger: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
  },
  feedback: { maxWidth: "100%", textAlign: "right" },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.38)",
  },
  scrim: { ...StyleSheet.absoluteFill },
  menu: {
    borderWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 17,
    paddingTop: 15,
    paddingBottom: 10,
  },
  menuHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
  },
  headingCopy: { flex: 1, gap: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 5 },
  formatOption: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 10,
    paddingHorizontal: 7,
  },
  formatIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  formatCopy: { flex: 1, gap: 2 },
});
