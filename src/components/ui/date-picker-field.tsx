import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/providers/theme-provider";

type DatePickerFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  style?: StyleProp<ViewStyle>;
};

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function localDayStart(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DatePickerField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  style,
}: DatePickerFieldProps) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const selectedDate = value ? parseLocalDate(value) : null;
  const minimumLimit = minimumDate ? localDayStart(minimumDate) : null;
  const maximumLimit = maximumDate ? localDayStart(maximumDate) : null;
  const currentDay = localDayStart(new Date());
  const pickerToday = maximumLimit ?? minimumLimit ?? currentDay;
  const [displayedMonth, setDisplayedMonth] = useState(() => {
    const initial = selectedDate ?? pickerToday;
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const daysInMonth = new Date(
    displayedMonth.getFullYear(),
    displayedMonth.getMonth() + 1,
    0,
  ).getDate();
  const firstWeekday = new Date(
    displayedMonth.getFullYear(),
    displayedMonth.getMonth(),
    1,
  ).getDay();
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(displayedMonth);
  const canAdvanceMonth =
    !maximumLimit ||
    displayedMonth.getFullYear() < maximumLimit.getFullYear() ||
    (displayedMonth.getFullYear() === maximumLimit.getFullYear() &&
      displayedMonth.getMonth() < maximumLimit.getMonth());
  const canRetreatMonth =
    !minimumLimit ||
    displayedMonth.getFullYear() > minimumLimit.getFullYear() ||
    (displayedMonth.getFullYear() === minimumLimit.getFullYear() &&
      displayedMonth.getMonth() > minimumLimit.getMonth());

  function openPicker() {
    const initial = selectedDate ?? pickerToday;
    setDisplayedMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
    setVisible(true);
  }

  function chooseDate(date: Date) {
    const selectedDay = localDayStart(date).getTime();
    if (
      (minimumLimit && selectedDay < minimumLimit.getTime()) ||
      (maximumLimit && selectedDay > maximumLimit.getTime())
    )
      return;
    onChange(formatLocalDate(date));
    setVisible(false);
  }

  return (
    <View style={[styles.container, style]}>
      <AppText size="small" weight="semibold">
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || "Choose a date"}`}
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
        <AppText
          size="small"
          style={{ color: value ? theme.text : theme.textSecondary }}
          numberOfLines={1}
        >
          {value || "Choose a date"}
        </AppText>
        <Ionicons name="calendar-outline" size={18} color={theme.primary} />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close date picker"
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
              <View style={styles.modalTitle}>
                <AppText size="heading" weight="semibold">
                  {label}
                </AppText>
                <AppText size="small" tone="secondary">
                  Select a date
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close date picker"
                hitSlop={8}
                onPress={() => setVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={22} color={theme.text} />
              </Pressable>
            </View>
            <View style={styles.monthNavigation}>
              {canRetreatMonth ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  onPress={() =>
                    setDisplayedMonth(
                      (month) =>
                        new Date(month.getFullYear(), month.getMonth() - 1, 1),
                    )
                  }
                  style={styles.monthArrow}
                >
                  <Ionicons name="chevron-back" size={20} color={theme.text} />
                </Pressable>
              ) : (
                <View style={styles.monthArrow} />
              )}
              <AppText weight="semibold">{monthLabel}</AppText>
              {canAdvanceMonth ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  onPress={() =>
                    setDisplayedMonth(
                      (month) =>
                        new Date(month.getFullYear(), month.getMonth() + 1, 1),
                    )
                  }
                  style={styles.monthArrow}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={theme.text}
                  />
                </Pressable>
              ) : (
                <View style={styles.monthArrow} />
              )}
            </View>
            <View style={styles.calendarGrid}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <View key={day} style={styles.calendarCell}>
                  <AppText size="small" tone="secondary">
                    {day}
                  </AppText>
                </View>
              ))}
              {Array.from({ length: 42 }, (_, index) => {
                const day = index - firstWeekday + 1;
                if (day < 1 || day > daysInMonth) {
                  return (
                    <View key={`blank-${index}`} style={styles.calendarCell} />
                  );
                }
                const date = new Date(
                  displayedMonth.getFullYear(),
                  displayedMonth.getMonth(),
                  day,
                );
                const isSelected =
                  selectedDate?.getFullYear() === date.getFullYear() &&
                  selectedDate.getMonth() === date.getMonth() &&
                  selectedDate.getDate() === day;
                const isToday =
                  pickerToday.getFullYear() === date.getFullYear() &&
                  pickerToday.getMonth() === date.getMonth() &&
                  pickerToday.getDate() === day;
                const dateValue = date.getTime();
                const isDisabled =
                  (minimumLimit !== null &&
                    dateValue < minimumLimit.getTime()) ||
                  (maximumLimit !== null && dateValue > maximumLimit.getTime());
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="button"
                    accessibilityLabel={`${monthLabel} ${day}`}
                    accessibilityState={{
                      selected: isSelected,
                      disabled: isDisabled,
                    }}
                    disabled={isDisabled}
                    onPress={() => chooseDate(date)}
                    style={[
                      styles.calendarCell,
                      styles.calendarDay,
                      {
                        backgroundColor: isSelected
                          ? theme.primary
                          : "transparent",
                        borderColor:
                          isSelected || isToday ? theme.primary : "transparent",
                        opacity: isDisabled ? 0.35 : 1,
                      },
                    ]}
                  >
                    <AppText
                      size="small"
                      weight={isSelected || isToday ? "semibold" : "regular"}
                      style={{
                        color: isSelected
                          ? theme.onPrimary
                          : isDisabled
                            ? theme.textSecondary
                            : theme.text,
                      }}
                    >
                      {day}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => chooseDate(pickerToday)}
                style={styles.todayButton}
              >
                <AppText weight="semibold" style={{ color: theme.primary }}>
                  Today
                </AppText>
              </Pressable>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => setVisible(false)}
              />
            </View>
          </SafeAreaView>
        </View>
      </Modal>
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
    maxHeight: "82%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingBottom: 12,
  },
  modalTitle: { flex: 1, gap: 3 },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  monthNavigation: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  monthArrow: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarCell: {
    width: "14.2857%",
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDay: { borderWidth: 1, borderRadius: 21 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 18,
  },
  todayButton: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
});
