import { Ionicons } from "@expo/vector-icons";
import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { useTheme } from "@/providers/theme-provider";

type DialogTone = "info" | "success" | "error" | "warning";
type DialogOptions = {
  title: string;
  message: string;
  tone?: DialogTone;
  details?: { label: string; value: string }[];
  note?: string;
};
type ConfirmDialogOptions = DialogOptions & {
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
};
type DialogState = DialogOptions & {
  kind: "message" | "confirmation";
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};
type AppDialogContextValue = {
  showDialog: (options: DialogOptions) => Promise<void>;
  confirmDialog: (options: ConfirmDialogOptions) => Promise<boolean>;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  function close(confirmed: boolean) {
    setDialog(null);
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
  }

  const showDialog = useCallback((options: DialogOptions): Promise<void> => {
    return new Promise((resolve) => {
      resolveRef.current = () => resolve();
      setDialog({ ...options, kind: "message" });
    });
  }, []);

  const confirmDialog = useCallback(
    (options: ConfirmDialogOptions): Promise<boolean> =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setDialog({ ...options, kind: "confirmation" });
      }),
    [],
  );
  const contextValue = useMemo(
    () => ({ showDialog, confirmDialog }),
    [confirmDialog, showDialog],
  );

  const toneColor =
    dialog?.tone === "success"
      ? theme.success
      : dialog?.tone === "error"
        ? theme.danger
        : dialog?.tone === "warning"
          ? theme.secondary
        : theme.primary;
  const iconName =
    dialog?.tone === "success"
      ? "checkmark-circle"
      : dialog?.tone === "error"
        ? "alert-circle"
        : dialog?.tone === "warning"
          ? "alert-circle"
        : dialog?.kind === "confirmation"
          ? "help-circle"
          : "information-circle";

  return (
    <AppDialogContext.Provider value={contextValue}>
      {children}
      <Modal
        transparent
        animationType="fade"
        visible={dialog !== null}
        onRequestClose={() => close(false)}
      >
        <Pressable
          onPress={() => close(false)}
          style={styles.backdrop}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[
              styles.dialog,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: `${toneColor}1A` }]}>
              <Ionicons name={iconName} size={26} color={toneColor} />
            </View>
            <View style={styles.copy}>
              <AppText size="heading" weight="semibold" style={styles.title}>
                {dialog?.title}
              </AppText>
              <AppText tone="secondary" style={styles.message}>
                {dialog?.message}
              </AppText>
            </View>
            {dialog?.details?.length ? (
              <View
                style={[
                  styles.details,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
              >
                {dialog.details.map((item, index) => (
                  <View
                    key={item.label}
                    style={[
                      styles.detailRow,
                      index > 0 && {
                        borderTopColor: theme.border,
                        borderTopWidth: StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    <AppText size="small" tone="secondary" style={styles.detailLabel}>
                      {item.label}
                    </AppText>
                    <AppText size="small" weight="semibold" style={styles.detailValue}>
                      {item.value}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : null}
            {dialog?.note ? (
              <View
                style={[
                  styles.note,
                  {
                    backgroundColor: `${toneColor}12`,
                    borderLeftColor: toneColor,
                  },
                ]}
              >
                <AppText size="small" style={{ color: theme.text }}>
                  {dialog.note}
                </AppText>
              </View>
            ) : null}
            {dialog?.kind === "confirmation" ? (
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => close(false)}
                  style={[styles.action, { borderColor: theme.border }]}
                >
                  <AppText weight="semibold">
                    {dialog.cancelLabel ?? "Cancel"}
                  </AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => close(true)}
                  style={[
                    styles.action,
                    {
                      backgroundColor: dialog.destructive
                        ? theme.danger
                        : theme.primary,
                      borderColor: dialog.destructive
                        ? theme.danger
                        : theme.primary,
                    },
                  ]}
                >
                  <AppText weight="semibold" style={{ color: theme.onPrimary }}>
                    {dialog.confirmLabel}
                  </AppText>
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => close(true)}
                style={[
                  styles.action,
                  styles.messageAction,
                  {
                    backgroundColor: theme.primary,
                    borderColor: theme.primary,
                  },
                ]}
              >
                <AppText weight="semibold" style={{ color: theme.onPrimary }}>
                  Okay
                </AppText>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </AppDialogContext.Provider>
  );
}

export function useAppDialog(): AppDialogContextValue {
  const context = useContext(AppDialogContext);
  if (!context) {
    throw new Error("useAppDialog must be used inside AppDialogProvider.");
  }
  return context;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "rgba(0, 0, 0, 0.48)",
  },
  dialog: {
    width: "100%",
    maxWidth: 440,
    alignItems: "center",
    gap: 16,
    borderWidth: 1,
    borderRadius: 18,
    padding: 22,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { width: "100%", gap: 7 },
  title: { textAlign: "left", lineHeight: 26 },
  message: { textAlign: "left", lineHeight: 21 },
  details: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  detailRow: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 8,
  },
  detailLabel: { flex: 1 },
  detailValue: { textAlign: "right", fontVariant: ["tabular-nums"] },
  note: {
    width: "100%",
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  actions: {
    width: "100%",
    flexDirection: "column-reverse",
    gap: 10,
  },
  action: {
    minHeight: 48,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  messageAction: { marginTop: 0 },
});
