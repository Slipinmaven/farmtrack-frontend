import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { BlockCapacityMeter } from "@/features/blocks/components/block-capacity-meter";
import { useBlocks } from "@/features/blocks/hooks";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function BlocksScreen() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const query = useBlocks(user?.id, farm.selectedFarm?.id);
  const [search, setSearch] = useState("");
  const blocks = useMemo(
    () =>
      (query.data ?? []).filter((block) =>
        block.name.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [query.data, search],
  );

  if (query.isLoading) return <LoadingState label="Loading blocks" />;
  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top"]}
    >
      <View style={styles.content}>
        <FarmPageHeader
          title="Block management"
          showBack
          backHref="/(tabs)/account"
        />
        <View style={styles.toolbar}>
          <Button
            label="Add block"
            onPress={() => router.push("/(tabs)/blocks/new")}
          />
        </View>
        <TextField
          label="Search blocks"
          placeholder="Search by name"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {query.isError ? (
          <Card style={styles.state}>
            <AppText weight="semibold">Could not load blocks</AppText>
            <AppText tone="secondary">{query.error.message}</AppText>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => void query.refetch()}
            />
          </Card>
        ) : null}
        {!query.isError && blocks.length === 0 ? (
          <Card style={styles.state}>
            <AppText weight="semibold">
              {search ? "No matching blocks" : "No blocks yet"}
            </AppText>
            <AppText tone="secondary">
              {search
                ? "Try a different search."
                : "Add the first block to organize poultry by housing area."}
            </AppText>
            {!search ? (
              <Button
                label="Add first block"
                onPress={() => router.push("/(tabs)/blocks/new")}
              />
            ) : null}
          </Card>
        ) : null}
        <FlatList
          data={blocks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${item.occupied_chickens} chickens occupying capacity of ${item.capacity + item.over_capacity_limit}`}
              onPress={() => router.push(`/(tabs)/blocks/${item.id}` as Href)}
            >
              <Card style={styles.blockCard}>
                <View style={styles.blockHeader}>
                  <View style={styles.blockCopy}>
                    <AppText weight="semibold">{item.name}</AppText>
                    {item.description ? (
                      <AppText size="small" tone="secondary" numberOfLines={2}>
                        {item.description}
                      </AppText>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.status,
                      {
                        backgroundColor: item.is_active
                          ? `${theme.success}1A`
                          : theme.backgroundSelected,
                      },
                    ]}
                  >
                    <AppText
                      size="small"
                      style={{
                        color: item.is_active
                          ? theme.success
                          : theme.textSecondary,
                      }}
                    >
                      {item.is_active ? "Active" : "Inactive"}
                    </AppText>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={theme.textSecondary}
                  />
                </View>
                <BlockCapacityMeter block={item} compact />
              </Card>
            </Pressable>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    gap: 16,
  },
  toolbar: { alignItems: "flex-end" },
  list: { gap: 10, paddingBottom: 24 },
  blockCard: { gap: 14 },
  blockHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  blockCopy: { flex: 1, gap: 4 },
  status: {
    minWidth: 64,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignItems: "center",
  },
  state: { gap: 10 },
});
