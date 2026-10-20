import { router, useLocalSearchParams, type Href } from "expo-router";
import { KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { BlockForm } from "@/features/blocks/components/block-form";
import { useBlock, useUpdateBlock } from "@/features/blocks/hooks";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function EditBlockRoute() {
  const { user } = useAuth();
  const dialog = useAppDialog();
  const farm = useFarm();
  const { theme } = useTheme();
  const { blockId } = useLocalSearchParams<{ blockId: string }>();
  const blockQuery = useBlock(user?.id, farm.selectedFarm?.id, blockId);
  const update = useUpdateBlock(user?.id ?? "", farm.selectedFarm?.id ?? "");
  const detailHref = `/(tabs)/blocks/${blockId}` as Href;

  if (blockQuery.isLoading) return <LoadingState label="Loading block" />;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <FarmPageHeader title="Edit block" showBack backHref={detailHref} />
        {blockQuery.data ? (
          <BlockForm
            key={blockQuery.data.id}
            initialBlock={blockQuery.data}
            submitLabel="Save changes"
            onSubmit={async (payload) => {
              await update.mutateAsync({
                blockId: blockQuery.data!.id,
                payload,
              });
              await dialog.showDialog({
                title: "Changes saved",
                message: "Your block details have been updated.",
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

const styles = { screen: { flex: 1 } };
