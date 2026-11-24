import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

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
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    value: "customer",
    label: "Customer",
    description: "Buys products from your farm",
    icon: "cart-outline",
  },
  {
    value: "supplier",
    label: "Supplier",
    description: "Provides goods or services",
    icon: "cube-outline",
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
      setError(normalizeApiError(submitError).message);
    }
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
    >
      <View style={styles.form}>
        <View style={[styles.formIntro, { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.formIcon, { backgroundColor: theme.primary }]}>
            <Ionicons name="person-outline" size={22} color={theme.onPrimary} />
          </View>
          <View style={styles.formIntroCopy}>
            <AppText size="small" weight="semibold" style={{ color: theme.primary }}>
              FARM NETWORK
            </AppText>
            <AppText size="heading" weight="semibold" style={styles.formTitle}>
              {initialContact ? "Update contact" : "Add a contact"}
            </AppText>
            <AppText size="small" tone="secondary">
              Keep their details and relationship with your farm together.
            </AppText>
          </View>
        </View>

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeading}>
            <View style={[styles.sectionIcon, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="person-circle-outline" size={19} color={theme.primary} />
            </View>
            <View style={styles.sectionCopy}>
              <AppText size="body" weight="semibold">
                Contact details
              </AppText>
              <AppText size="small" tone="secondary">
                Name is required; the rest can be added later.
              </AppText>
            </View>
          </View>
          <TextField
            label="Full name"
            leadingIcon="person-outline"
            placeholder="e.g. Amina Otieno"
            value={name}
            onChangeText={(value) => {
              setName(value);
              setError(null);
            }}
            maxLength={150}
          />
          <TextField
            label="Phone (optional)"
            leadingIcon="call-outline"
            placeholder="Phone number"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(value) => {
              setPhone(value);
              setError(null);
            }}
            maxLength={30}
          />
          <TextField
            label="Email (optional)"
            leadingIcon="mail-outline"
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setError(null);
            }}
            maxLength={255}
          />
          <TextField
            label="Address (optional)"
            leadingIcon="location-outline"
            placeholder="Street, town, or delivery location"
            value={address}
            onChangeText={(value) => {
              setAddress(value);
              setError(null);
            }}
            maxLength={255}
          />
          <TextField
            label="Notes (optional)"
            leadingIcon="document-text-outline"
            placeholder="Additional details"
            value={notes}
            onChangeText={setNotes}
            multiline
            style={styles.multiline}
          />
        </Card>

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeading}>
            <View style={[styles.sectionIcon, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="people-outline" size={18} color={theme.primary} />
            </View>
            <View style={styles.sectionCopy}>
              <AppText size="body" weight="semibold">
                Relationship
              </AppText>
              <AppText size="small" tone="secondary">
                Select one or both roles for this contact.
              </AppText>
            </View>
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
                <View
                  style={[
                    styles.roleIcon,
                    { backgroundColor: selected ? theme.primary : theme.backgroundSelected },
                  ]}
                >
                  <Ionicons
                    name={option.icon}
                    size={18}
                    color={selected ? theme.onPrimary : theme.primary}
                  />
                </View>
                <View style={styles.roleOptionCopy}>
                  <AppText weight="semibold">{option.label}</AppText>
                  <AppText size="small" tone="secondary" style={styles.roleDescription}>
                    {option.description}
                  </AppText>
                </View>
                <Ionicons
                  name={selected ? "checkmark-circle" : "ellipse-outline"}
                  size={20}
                  color={selected ? theme.primary : theme.textSecondary}
                />
              </Pressable>
            );
          })}
        </Card>

        {error ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.error,
              { backgroundColor: `${theme.danger}12`, borderColor: `${theme.danger}55` },
            ]}
          >
            <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
            <AppText size="small" style={{ color: theme.danger, flex: 1 }}>
              {error}
            </AppText>
          </View>
        ) : null}
        <Button
          label={submitLabel}
          loading={isSubmitting}
          style={styles.submitButton}
          disabled={!name.trim() || roles.length === 0}
          onPress={() => void submit()}
        />
      </View>
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
    paddingTop: 14,
    paddingBottom: 36,
  },
  form: { gap: 15 },
  formIntro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderRadius: 12,
    padding: 14,
  },
  formIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  formIntroCopy: { flex: 1, minWidth: 0, gap: 2 },
  formTitle: { fontSize: 25, lineHeight: 32 },
  sectionCard: { gap: 15, borderRadius: 11, padding: 15 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  sectionCopy: { flex: 1, minWidth: 0, gap: 1 },
  multiline: { minHeight: 76, textAlignVertical: "top" },
  roleOption: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  roleIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  roleOptionCopy: { flex: 1, minWidth: 0, gap: 2 },
  roleDescription: { flexShrink: 1, lineHeight: 17 },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  submitButton: { minHeight: 52, borderRadius: 9 },
});