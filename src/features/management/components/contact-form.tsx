import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import type {
  Contact,
  ContactRole,
  CreateContactPayload,
} from "@/features/management/api";
import { normalizeApiError } from "@/lib/api/errors";
import { useTheme } from "@/providers/theme-provider";

type ContactFormProps = {
  initialContact?: Contact;
  initialRoles?: ContactRole[];
  submitLabel: string;
  isSubmitting?: boolean;
  onSubmit: (payload: CreateContactPayload) => Promise<void>;
};

const roleOptions: {
  value: ContactRole;
  label: string;
  description: string;
}[] = [
  {
    value: "customer",
    label: "Customer",
    description: "Buys products or services from your farm",
  },
  {
    value: "supplier",
    label: "Supplier",
    description: "Provides products or services to your farm",
  },
];

export function ContactForm({
  initialContact,
  initialRoles,
  submitLabel,
  isSubmitting = false,
  onSubmit,
}: ContactFormProps) {
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const [name, setName] = useState(initialContact?.name ?? "");
  const [phone, setPhone] = useState(initialContact?.phone ?? "");
  const [email, setEmail] = useState(initialContact?.email ?? "");
  const [address, setAddress] = useState(initialContact?.address ?? "");
  const [notes, setNotes] = useState(initialContact?.notes ?? "");
  const [roles, setRoles] = useState<ContactRole[]>(
    initialContact?.roles ?? initialRoles ?? [],
  );
  const [error, setError] = useState<string | null>(null);

  function toggleRole(role: ContactRole) {
    setRoles((selected) =>
      selected.includes(role)
        ? selected.filter((item) => item !== role)
        : [...selected, role],
    );
    setError(null);
  }

  async function submit() {
    if (!name.trim()) {
      setError("Enter a contact name.");
      return;
    }
    if (!roles.length) {
      setError("Choose customer, supplier, or both.");
      return;
    }
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        roles,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      });
    } catch (submitError) {
      await dialog.showDialog({
        title: initialContact
          ? "Couldn’t update contact"
          : "Couldn’t create contact",
        message: normalizeApiError(submitError).message,
        tone: "error",
      });
    }
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Card style={styles.form}>
        <View style={styles.section}>
          <AppText size="heading" weight="semibold">
            Contact information
          </AppText>
          <TextField
            label="Full name"
            placeholder="e.g. Amina Otieno"
            value={name}
            onChangeText={setName}
            maxLength={150}
          />
          <TextField
            label="Phone (optional)"
            placeholder="Phone number"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            maxLength={30}
          />
          <TextField
            label="Email (optional)"
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            maxLength={255}
          />
          <TextField
            label="Address (optional)"
            placeholder="Street, town, or delivery location"
            value={address}
            onChangeText={setAddress}
            maxLength={255}
          />
          <TextField
            label="Notes (optional)"
            placeholder="Additional details"
            value={notes}
            onChangeText={setNotes}
            multiline
            style={styles.multiline}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.roleHeading}>
            <View style={styles.roleCopy}>
              <AppText size="heading" weight="semibold">
                Relationship
              </AppText>
              <AppText size="small" tone="secondary">
                Select one or both. A contact can be a customer and a supplier.
              </AppText>
            </View>
            <Ionicons name="people-outline" size={22} color={theme.primary} />
          </View>
          {roleOptions.map((option) => {
            const selected = roles.includes(option.value);
            return (
              <Pressable
                key={option.value}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => toggleRole(option.value)}
                style={[
                  styles.roleOption,
                  {
                    backgroundColor: selected
                      ? theme.backgroundSelected
                      : theme.backgroundElement,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
              >
                <View style={styles.roleOptionCopy}>
                  <AppText weight="semibold">{option.label}</AppText>
                  <AppText size="small" tone="secondary">
                    {option.description}
                  </AppText>
                </View>
                <Ionicons
                  name={selected ? "checkbox" : "square-outline"}
                  size={21}
                  color={selected ? theme.primary : theme.textSecondary}
                />
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <AppText size="small" style={{ color: theme.danger }}>
            {error}
          </AppText>
        ) : null}
        <Button
          label={submitLabel}
          loading={isSubmitting}
          disabled={!name.trim() || roles.length === 0}
          onPress={() => void submit()}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 32,
  },
  form: { gap: 24 },
  section: { gap: 14 },
  multiline: { minHeight: 84, textAlignVertical: "top" },
  roleHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  roleCopy: { flex: 1, gap: 2 },
  roleOption: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  roleOptionCopy: { flex: 1, gap: 2 },
});