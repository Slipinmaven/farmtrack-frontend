import { router, useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AppText } from "@/components/ui/app-text";
import { ProductForm } from "@/features/management/components/product-form";
import { useCreateProduct } from "@/features/management/hooks";
import type { ProductType } from "@/features/management/api";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";

export default function CreateProductScreen() {
  return (
    <SessionGate allowIncompleteSetup>
      <CreateProductContent />
    </SessionGate>
  );
}

function CreateProductContent() {
  const params = useLocalSearchParams<{
    setupFlow?: string;
    setupType?: ProductType;
    setupName?: string;
    setupStep?: string;
  }>();
  const isSetupFlow = params.setupFlow === "true";
  const { user } = useAuth();
  const farm = useFarm();
  const dialog = useAppDialog();
  const { theme } = useTheme();
  const create = useCreateProduct(user?.id ?? "", farm.selectedFarm?.id ?? "");

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <FarmPageHeader
          title="New product"
          showBack
          backHref={
            isSetupFlow
              ? {
                  pathname: "/farm-setup",
                  params: { step: params.setupStep ?? "0" },
                }
              : "/products"
          }
        />
        <AppText size="small" tone="secondary" style={styles.intro}>
          Add a product and define the measurement units your farm uses.
        </AppText>
        <ProductForm
          initialProductType={params.setupType}
          allowedProductTypes={
            params.setupType ? [params.setupType] : undefined
          }
          initialName={params.setupName}
          submitLabel="Create product"
          isSubmitting={create.isPending}
          onSubmit={async (payload) => {
            await create.mutateAsync(payload);
            if (isSetupFlow) {
              router.replace({
                pathname: "/farm-setup",
                params: { step: params.setupStep ?? "0" },
              });
              return;
            }
            await dialog.showDialog({
              title: "Product created",
              message: "Your new product is ready to use.",
              tone: "success",
            });
            router.replace("/products");
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
