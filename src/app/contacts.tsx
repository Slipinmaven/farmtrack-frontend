import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { SessionGate } from "@/components/layout/session-gate";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Contact, ContactRole } from "@/features/management/api";
import { useContacts } from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function ContactsScreen() {
  return (
    <SessionGate>
      <ContactsContent />
    </SessionGate>
  );
}

function ContactsContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [role, setRole] = useState<ContactRole | undefined>();
  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedSearch(search.trim()),
      300,
    );
    return () => clearTimeout(timeout);
  }, [search]);
  const contacts = useContacts(
    user?.id,
    farm.selectedFarm?.id,
    debouncedSearch,
    role,
  );
  const visibleContacts = contacts.data?.pages.flatMap((page) => page) ?? [];

  if (contacts.isLoading) return <LoadingState label="Loading contacts" />;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <View style={styles.screenContent}>
        <FarmPageHeader
          title="Contact management"
          showBack
          backHref="/(tabs)/account"
        />
        {contacts.isError ? (
          <Card style={styles.state}>
            <AppText weight="semibold">Could not load contacts</AppText>
            <AppText tone="secondary">
              {normalizeApiError(contacts.error).message}
            </AppText>
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => void contacts.refetch()}
            />
          </Card>
        ) : null}
        <FlatList
          data={contacts.isError ? [] : visibleContacts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View style={styles.intro}>
                <View style={styles.introCopy}>
                  <AppText size="heading" weight="semibold" style={styles.pageTitle}>
                    Your network
                  </AppText>
                  <AppText size="small" tone="secondary">
                    Customers and suppliers, all in one place.
                  </AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/contacts/new")}
                  style={({ pressed }) => [
                    styles.addButton,
                    { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Ionicons name="person-add-outline" size={17} color={theme.onPrimary} />
                  <AppText size="small" weight="semibold" style={{ color: theme.onPrimary }}>
                    Add contact
                  </AppText>
                </Pressable>
              </View>
              <View
                style={[
                  styles.searchField,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}
              >
                <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
                <TextInput
                  accessibilityLabel="Search contacts"
                  placeholder="Name, phone, email or address"
                  placeholderTextColor={theme.textSecondary}
                  value={search}
                  onChangeText={setSearch}
                  returnKeyType="search"
                  style={[
                    styles.searchInput,
                    { color: theme.text, fontFamily: theme.fontFamily },
                  ]}
                />
                {search ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear contact search"
                    hitSlop={8}
                    onPress={() => setSearch("")}
                  >
                    <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Filter contacts by role"
                style={[styles.filters, { backgroundColor: theme.backgroundSelected }]}
              >
                {(
                  [
                    { label: "All", value: undefined },
                    { label: "Customers", value: "customer" },
                    { label: "Suppliers", value: "supplier" },
                  ] as const
                ).map((option) => {
                  const selected = role === option.value;
                  return (
                    <Pressable
                      key={option.label}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      onPress={() => setRole(option.value)}
                      style={({ pressed }) => [
                        styles.filter,
                        {
                          backgroundColor: selected ? theme.primary : theme.backgroundElement,
                          borderColor: selected ? theme.primary : theme.border,
                          opacity: pressed ? 0.78 : 1,
                        },
                      ]}
                    >
                      <AppText
                        size="small"
                        weight="semibold"
                        style={{ color: selected ? theme.onPrimary : theme.text }}
                      >
                        {option.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              {!contacts.isError && visibleContacts.length ? (
                <View style={styles.resultsHeading}>
                  <AppText size="small" weight="semibold">
                    {role ? role === "customer" ? "CUSTOMERS" : "SUPPLIERS" : "CONTACTS"}
                  </AppText>
                  <AppText size="small" tone="secondary">
                    {visibleContacts.length}{contacts.hasNextPage ? "+" : ""} shown
                  </AppText>
                </View>
              ) : null}
            </View>
          }
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          refreshing={contacts.isRefetching}
          onRefresh={() => void contacts.refetch()}
          onEndReached={() => {
            if (contacts.hasNextPage && !contacts.isFetchingNextPage) {
              void contacts.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            contacts.isFetchingNextPage ? (
              <ActivityIndicator
                color={theme.primary}
                style={styles.listFooter}
              />
            ) : null
          }
          ListEmptyComponent={
            !contacts.isError ? (
              <Card style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundSelected }]}>
                  <Ionicons
                    name={search || role ? "search-outline" : "people-outline"}
                    size={21}
                    color={theme.primary}
                  />
                </View>
                <AppText size="body" weight="semibold">
                  {search || role ? "No matching contacts" : "No contacts yet"}
                </AppText>
                <AppText size="small" tone="secondary">
                  {search || role
                    ? "Try a different search or choose another contact type."
                    : "Add customers and suppliers to keep their details together."}
                </AppText>
                {!search && !role ? (
                  <Button
                    label="Add first contact"
                    onPress={() => router.push("/contacts/new")}
                  />
                ) : null}
              </Card>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${formatRoles(item.roles)}`}
              onPress={() => router.push(`/contacts/${item.id}` as Href)}
              style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1 })}
            >
              <ContactListItem contact={item} />
            </Pressable>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

function ContactListItem({ contact }: { contact: Contact }) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.contactRow,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}>
        <AppText weight="semibold" style={{ color: theme.primary }}>
          {contactInitials(contact.name)}
        </AppText>
      </View>
      <View style={styles.contactCopy}>
        <AppText weight="semibold" numberOfLines={1}>
          {contact.name}
        </AppText>
        <AppText size="small" tone="secondary" numberOfLines={1}>
          {[contact.phone, contact.email].filter(Boolean).join(" · ") ||
            "No phone or email added"}
        </AppText>
        <View style={styles.roles}>
          {contact.roles.map((role) => (
            <RoleBadge key={role} role={role} />
          ))}
        </View>
      </View>
      <View style={[styles.rowArrow, { backgroundColor: theme.background }]}>
        <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
      </View>
    </View>
  );
}

function RoleBadge({ role }: { role: ContactRole }) {
  const { theme } = useTheme();
  const color = role === "customer" ? theme.success : theme.primary;
  return (
    <View style={[styles.roleBadge, { backgroundColor: `${color}16` }]}>
      <Ionicons
        name={role === "customer" ? "cart-outline" : "cube-outline"}
        size={12}
        color={color}
      />
      <AppText size="small" weight="semibold" style={{ color }}>
        {role === "customer" ? "Customer" : "Supplier"}
      </AppText>
    </View>
  );
}

function contactInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function formatRoles(roles: ContactRole[]): string {
  return roles
    .map((role) => (role === "customer" ? "Customer" : "Supplier"))
    .join(" and ");
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: {
    flex: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  list: { gap: 9, paddingTop: 14, paddingBottom: 30 },
  listHeader: { gap: 14, paddingBottom: 3 },
  intro: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  introCopy: { flex: 1, minWidth: 0, gap: 3 },
  pageTitle: { fontSize: 24, lineHeight: 31 },
  addButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 11,
  },
  searchField: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 8, fontSize: 14 },
  filters: {
    flexDirection: "row",
    gap: 7,
    padding: 4,
    borderRadius: 10,
  },
  filter: {
    flexGrow: 1,
    minWidth: 0,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 9,
    borderWidth: 1,
    borderRadius: 7,
  },
  resultsHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 3,
  },
  listFooter: { paddingVertical: 18 },
  state: { gap: 10, borderRadius: 10 },
  emptyState: { gap: 9, borderRadius: 10, marginTop: 4 },
  emptyIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  contactRow: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  contactCopy: { flex: 1, gap: 3, minWidth: 0 },
  roles: { flexDirection: "row", flexWrap: "wrap", gap: 5, paddingTop: 2 },
  roleBadge: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 5,
    paddingHorizontal: 7,
  },
  rowArrow: {
    width: 29,
    height: 29,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
});
