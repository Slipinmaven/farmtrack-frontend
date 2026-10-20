import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { SessionGate } from "@/components/layout/session-gate";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import type { Contact, ContactRole } from "@/features/management/api";
import { ContactRoleBadge } from "@/features/management/components/contact-role-badge";
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
      <View style={styles.content}>
        <FarmPageHeader
          title="Contact management"
          showBack
          backHref="/(tabs)/account"
        />
        <View style={styles.toolbar}>
          <Button
            label="Add contact"
            onPress={() => router.push("/contacts/new")}
          />
        </View>
        <TextField
          label="Search contacts"
          placeholder="Search name, phone, email, or address"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Filter contacts by role"
          style={styles.filters}
        >
          {(
            [
              { label: "All contacts", value: undefined },
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
                style={[
                  styles.filter,
                  {
                    backgroundColor: selected
                      ? theme.primary
                      : theme.backgroundElement,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
              >
                <AppText
                  size="small"
                  weight="semibold"
                  numberOfLines={1}
                  style={{
                    color: selected ? theme.onPrimary : theme.text,
                    textAlign: "center",
                  }}
                >
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
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
          keyboardShouldPersistTaps="handled"
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
              <Card style={styles.state}>
                <AppText weight="semibold">
                  {search || role ? "No matching contacts" : "No contacts yet"}
                </AppText>
                <AppText tone="secondary">
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
    <Card style={styles.contactRow}>
      <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
        <AppText weight="semibold" style={{ color: theme.onPrimary }}>
          {contact.name.trim().slice(0, 1).toUpperCase()}
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
            <ContactRoleBadge key={role} role={role} />
          ))}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </Card>
  );
}

function formatRoles(roles: ContactRole[]): string {
  return roles
    .map((role) => (role === "customer" ? "Customer" : "Supplier"))
    .join(" and ");
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    gap: 14,
  },
  toolbar: { alignItems: "flex-end" },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filter: {
    flexGrow: 1,
    flexBasis: 82,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 8,
  },
  list: { gap: 10, paddingBottom: 28 },
  listFooter: { paddingVertical: 16 },
  state: { gap: 10 },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  avatar: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
  },
  contactCopy: { flex: 1, gap: 4, minWidth: 0 },
  roles: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
