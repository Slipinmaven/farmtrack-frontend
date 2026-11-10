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
            <AppText size="heading" weight="semibold" style={styles.title}>
              {dialog?.title}
            </AppText>
            <AppText tone="secondary" style={styles.message}>
              {dialog?.message}
            </AppText>
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
    gap: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 24,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { textAlign: "center" },
  message: { textAlign: "center" },
  actions: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8,
  },
  action: {
    minHeight: 46,
    minWidth: 100,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 16,
  },
  messageAction: { width: "100%", marginTop: 8 },
});
