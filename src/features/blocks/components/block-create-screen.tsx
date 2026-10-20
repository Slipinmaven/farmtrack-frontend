import { router } from "expo-router";
import { KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { BlockForm } from "@/features/blocks/components/block-form";
import { useCreateBlock } from "@/features/blocks/hooks";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export function BlockCreateScreen({
  setupStep,
}: {
  setupStep?: string;
}) {
  const isSetupFlow = setupStep !== undefined;
  const { user } = useAuth();
  const dialog = useAppDialog();
  const farm = useFarm();
  const { theme } = useTheme();
  const create = useCreateBlock(user?.id ?? "", farm.selectedFarm?.id ?? "");

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <FarmPageHeader
          title="New block"
          showBack
          backHref={
            isSetupFlow
              ? {
                  pathname: "/farm-setup",
                  params: { step: setupStep },
                }
              : "/(tabs)/blocks"
          }
        />
        <AppText size="small" tone="secondary" style={styles.intro}>
          Add a housing area for {farm.selectedFarm?.name ?? "your farm"}.
        </AppText>
        <BlockForm
          submitLabel="Create block"
          onSubmit={async (payload) => {
            await create.mutateAsync(payload);
            if (setupStep !== undefined) {
              router.replace({
                pathname: "/farm-setup",
                params: { step: setupStep },
              });
              return;
            }
            await dialog.showDialog({
              title: "Block created",
              message: "Your new block is ready to use.",
              tone: "success",
            });
            router.replace("/(tabs)/blocks");
          }}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = { screen: { flex: 1 }, intro: { paddingHorizontal: 18 } };
