import { router } from "expo-router";
import { KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { ContactForm } from "@/features/management/components/contact-form";
import { useCreateContact } from "@/features/management/hooks";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function CreateContactScreen() {
  return (
    <SessionGate>
      <CreateContactContent />
    </SessionGate>
  );
}

function CreateContactContent() {
  const { user } = useAuth();
  const farm = useFarm();
  const dialog = useAppDialog();
  const { theme } = useTheme();
  const create = useCreateContact(user?.id ?? "", farm.selectedFarm?.id ?? "");

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <FarmPageHeader title="New contact" showBack backHref="/contacts" />
        <AppText size="small" tone="secondary" style={styles.intro}>
          Save contact details and how they work with your farm.
        </AppText>
        <ContactForm
          submitLabel="Create contact"
          isSubmitting={create.isPending}
          onSubmit={async (payload) => {
            await create.mutateAsync(payload);
            await dialog.showDialog({
              title: "Contact created",
              message: "Your contact is ready to use.",
              tone: "success",
            });
            router.replace("/contacts");
          }}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = {
  screen: { flex: 1 },
  intro: { paddingHorizontal: 18, paddingTop: 4 },
};
