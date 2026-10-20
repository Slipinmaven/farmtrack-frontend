import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/app-text";
import { useUpdateFarmStatus } from "@/features/farms/hooks";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export function FarmSelector() {
  const farm = useFarm();
  const { user } = useAuth();
  const { theme } = useTheme();
  const updateStatus = useUpdateFarmStatus(user?.id ?? "");
  const [visible, setVisible] = useState(false);
  const [switchingFarmId, setSwitchingFarmId] = useState<string | null>(null);
  const [enablingFarmId, setEnablingFarmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function selectFarm(farmId: string) {
    setSwitchingFarmId(farmId);
    setError(null);
    try {
      await farm.selectFarm(farmId);
      setVisible(false);
    } catch {
      setError("Farm selection could not be saved. Please try again.");
    } finally {
      setSwitchingFarmId(null);
    }
  }

  async function enableFarm(farmId: string) {
    setEnablingFarmId(farmId);
    setError(null);
    try {
      await updateStatus.mutateAsync({ farmId, is_active: true });
      await farm.refreshFarms();
    } catch {
      setError("Farm could not be enabled. Please try again.");
    } finally {
      setEnablingFarmId(null);
    }
  }

  function addAnotherFarm() {
    setVisible(false);
    router.push({ pathname: "/farm-setup", params: { additional: "true" } });
  }

  return (
    <View style={styles.container}>
      <AppText size="small" tone="secondary">
        FARM SETTINGS FOR
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Selected farm: ${farm.selectedFarm?.name ?? "Choose a farm"}. Tap to switch farms.`}
        onPress={() => setVisible(true)}
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
        <View style={[styles.triggerIcon, { backgroundColor: theme.primary }]}>
          <Ionicons name="business-outline" size={19} color={theme.onPrimary} />
        </View>
        <View style={styles.triggerCopy}>
          <AppText weight="semibold" numberOfLines={1}>
            {farm.selectedFarm?.name ?? "Select a farm"}
          </AppText>
          <AppText size="small" tone="secondary" numberOfLines={1}>
            {`${farm.allFarms.length} farm${farm.allFarms.length === 1 ? "" : "s"} in your workspace`}
          </AppText>
        </View>
        <Ionicons name="chevron-down" size={19} color={theme.textSecondary} />
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
            accessibilityLabel="Close farm selector"
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
                  Choose a farm
                </AppText>
                <AppText size="small" tone="secondary">
                  Enable inactive farms before selecting them.
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close farm selector"
                hitSlop={8}
                onPress={() => setVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={22} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.farmList}
              keyboardShouldPersistTaps="handled"
            >
              {[...farm.allFarms]
                .sort(
                  (left, right) =>
                    Number(right.is_active) - Number(left.is_active),
                )
                .map((item) => {
                  const selected = item.id === farm.selectedFarm?.id;
                  const switching = switchingFarmId === item.id;
                  const enabling = enablingFarmId === item.id;
                  const content = (
                    <>
                      <View style={styles.farmCopy}>
                        <AppText
                          weight="semibold"
                          numberOfLines={1}
                          style={
                            !item.is_active
                              ? { color: theme.textSecondary }
                              : undefined
                          }
                        >
                          {item.name}
                        </AppText>
                        <AppText
                          size="small"
                          tone="secondary"
                          numberOfLines={2}
                        >
                          {item.description ||
                            item.location ||
                            "Farm profile and operational records"}
                        </AppText>
                      </View>
                      {switching ? (
                        <ActivityIndicator color={theme.primary} />
                      ) : selected ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={21}
                          color={theme.primary}
                        />
                      ) : null}
                    </>
                  );

                  if (!item.is_active) {
                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.farmOption,
                          styles.inactiveOption,
                          {
                            backgroundColor: theme.backgroundSelected,
                            borderColor: theme.border,
                          },
                        ]}
                      >
                        {content}
                        <View style={styles.inactiveControl}>
                          <AppText size="small" tone="secondary">
                            {enabling ? "Enabling" : "Enable to select"}
                          </AppText>
                          {enabling ? (
                            <ActivityIndicator color={theme.primary} />
                          ) : (
                            <Switch
                              value={false}
                              disabled={Boolean(
                                enablingFarmId || switchingFarmId,
                              )}
                              onValueChange={(value) => {
                                if (value) void enableFarm(item.id);
                              }}
                              trackColor={{
                                false: theme.border,
                                true: theme.primary,
                              }}
                              thumbColor={theme.backgroundElement}
                              accessibilityLabel={`Enable ${item.name} so it can be selected`}
                            />
                          )}
                        </View>
                      </View>
                    );
                  }

                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="radio"
                      accessibilityLabel={`${item.name}${selected ? ", selected" : ""}`}
                      accessibilityState={{
                        checked: selected,
                        disabled: Boolean(switchingFarmId),
                      }}
                      disabled={Boolean(switchingFarmId || enablingFarmId)}
                      onPress={() => void selectFarm(item.id)}
                      style={({ pressed }) => [
                        styles.farmOption,
                        {
                          backgroundColor:
                            selected || pressed
                              ? theme.backgroundSelected
                              : theme.backgroundElement,
                          borderColor: selected ? theme.primary : theme.border,
                        },
                      ]}
                    >
                      {content}
                    </Pressable>
                  );
                })}
              {error ? (
                <AppText size="small" style={{ color: theme.danger }}>
                  {error}
                </AppText>
              ) : null}
              <View
                style={[
                  styles.addFarmDivider,
                  { borderTopColor: theme.border },
                ]}
              />
              <Pressable
                accessibilityRole="button"
                onPress={addAnotherFarm}
                style={({ pressed }) => [
                  styles.addFarm,
                  pressed && { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={20}
                  color={theme.textSecondary}
                />
                <View style={styles.addFarmCopy}>
                  <AppText size="small" weight="semibold" tone="secondary">
                    Add another farm
                  </AppText>
                  <AppText size="small" tone="secondary">
                    For an additional site you manage.
                  </AppText>
                </View>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 7 },
  trigger: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  triggerIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  triggerCopy: { flex: 1, gap: 2 },
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
    paddingBottom: 16,
  },
  modalTitle: { flex: 1, gap: 3 },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  farmList: { gap: 9, paddingBottom: 18 },
  farmOption: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 9,
  },
  inactiveOption: { opacity: 0.82 },
  farmCopy: { flex: 1, gap: 3 },
  inactiveControl: { alignItems: "center", gap: 2 },
  addFarmDivider: { borderTopWidth: 1, marginTop: 7 },
  addFarm: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  addFarmCopy: { gap: 1 },
});
