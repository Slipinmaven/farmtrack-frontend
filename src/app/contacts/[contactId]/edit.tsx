import { router, useLocalSearchParams, type Href } from "expo-router";
import { KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ContactForm } from "@/features/management/components/contact-form";
import { useContact, useUpdateContact } from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function EditContactRoute() {
  return (
    <SessionGate>
      <EditContactContent />
    </SessionGate>
  );
}

function EditContactContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const { contactId } = useLocalSearchParams<{ contactId: string }>();
  const contactQuery = useContact(user?.id, farm.selectedFarm?.id, contactId);
  const update = useUpdateContact(user?.id ?? "", farm.selectedFarm?.id ?? "");
  const detailHref = `/contacts/${contactId}` as Href;

  if (contactQuery.isLoading) return <LoadingState label="Loading contact" />;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <FarmPageHeader title="Edit contact" showBack backHref={detailHref} />
        {contactQuery.isError ? (
          <Card style={styles.state}>
            <AppText weight="semibold">Could not load this contact</AppText>
            <AppText tone="secondary">
              {normalizeApiError(contactQuery.error).message}
            </AppText>
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => void contactQuery.refetch()}
            />
          </Card>
        ) : null}
        {contactQuery.data ? (
          <ContactForm
            key={contactQuery.data.id}
            initialContact={contactQuery.data}
            submitLabel="Save changes"
            isSubmitting={update.isPending}
            onSubmit={async (payload) => {
              await update.mutateAsync({
                contactId: contactQuery.data!.id,
                payload,
              });
              await dialog.showDialog({
                title: "Contact updated",
                message: "Your contact details and roles have been saved.",
                tone: "success",
              });
              router.replace(detailHref);
            }}
          />
        ) : null}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  state: { margin: 18, gap: 10 },
});
