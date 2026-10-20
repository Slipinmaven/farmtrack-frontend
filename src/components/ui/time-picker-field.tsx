import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { createElement, useState, type ChangeEvent } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/providers/theme-provider";

type TimePickerFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minimumTime?: string;
};

function timeAsDate(value: string): Date {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function TimePickerField({
  label,
  value,
  onChange,
  minimumTime,
}: TimePickerFieldProps) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const selectedValue =
    minimumTime && value < minimumTime ? minimumTime : value;
  const selectedTime = timeAsDate(selectedValue);

  function handleTimeChange(date: Date) {
    const time = formatTime(date);
    onChange(minimumTime && time < minimumTime ? minimumTime : time);
  }

  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        <AppText size="small" weight="semibold">
          {label}
        </AppText>
        {createElement("input", {
          type: "time",
          value: selectedValue,
          min: minimumTime,
          "aria-label": label,
          onChange: (event: ChangeEvent<HTMLInputElement>) =>
            onChange(
              minimumTime && event.currentTarget.value < minimumTime
                ? minimumTime
                : event.currentTarget.value,
            ),
          style: {
            boxSizing: "border-box",
            width: "100%",
            minHeight: 48,
            padding: "0 12px",
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            font: "inherit",
          },
        })}
      </View>
    );
  }

  function openPicker() {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: selectedTime,
        mode: "time",
        is24Hour: true,
        onValueChange: (_event, date) => handleTimeChange(date),
      });
    } else {
      setVisible(true);
    }
  }

  return (
    <View style={styles.container}>
      <AppText size="small" weight="semibold">
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPress={openPicker}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: pressed
              ? theme.backgroundSelected
              : theme.backgroundElement,
            borderColor: theme.border,
          },
        ]}
      >
        <AppText size="small">{value}</AppText>
        <Ionicons name="time-outline" size={18} color={theme.primary} />
      </Pressable>

      {Platform.OS === "ios" ? (
        <Modal
          visible={visible}
          transparent
          animationType="slide"
          onRequestClose={() => setVisible(false)}
        >
          <View style={styles.modalRoot}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close time picker"
              onPress={() => setVisible(false)}
              style={styles.scrim}
            />
            <SafeAreaView
              edges={["bottom"]}
              style={[
                styles.sheet,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <AppText size="heading" weight="semibold">
                  {label}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close time picker"
                  hitSlop={8}
                  onPress={() => setVisible(false)}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={22} color={theme.text} />
                </Pressable>
              </View>
              <DateTimePicker
                value={selectedTime}
                mode="time"
                display="spinner"
                is24Hour
                themeVariant={theme.mode === "dark" ? "dark" : "light"}
                onValueChange={(_event, date) => handleTimeChange(date)}
              />
              <Button label="Done" onPress={() => setVisible(false)} />
            </SafeAreaView>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 7 },
  trigger: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
  },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
