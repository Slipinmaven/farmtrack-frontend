import { router, useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { useAppDialog } from "@/components/ui/app-dialog";
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
    setupAdditional?: string;
    returnToOpeningStock?: string;
    openingSpecies?: "chickens" | "eggs";
    returnToInventory?: string;
    fromSetup?: string;
  }>();
  const isSetupFlow = params.setupFlow === "true";
  const isPoultrySetup =
    isSetupFlow &&
    (params.setupType === "chickens" || params.setupType === "eggs");
  const returnToOpeningStock = params.returnToOpeningStock === "true";
  const returnToInventory = params.returnToInventory === "true";
  const openingStockHref = {
    pathname: "/inventory/opening-stock" as const,
    params: {
      species: params.openingSpecies ?? "eggs",
      fromSetup: params.fromSetup,
      setupStep: params.setupStep,
    },
  };
  const { user } = useAuth();
  const farm = useFarm();
  const dialog = useAppDialog();
  const { theme } = useTheme();
  const create = useCreateProduct(user?.id ?? "", farm.selectedFarm?.id ?? "");

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <FarmPageHeader
          title="New product"
          showBack
          backHref={
            returnToOpeningStock
              ? openingStockHref
              : returnToInventory
                ? "/inventory"
                : isSetupFlow
                  ? {
                      pathname: "/farm-setup",
                      params: {
                        step: params.setupStep ?? "0",
                        ...(params.setupAdditional === "true"
                          ? { additional: "true" }
                          : {}),
                      },
                    }
                  : "/products"
          }
        />
        <ProductForm
          initialProductType={params.setupType}
          allowedProductTypes={
            params.setupType ? [params.setupType] : undefined
          }
          initialName={params.setupName}
          initialDescription={
            params.setupType === "chickens"
              ? "Live birds raised on this farm."
              : params.setupType === "eggs"
                ? "Eggs produced on this farm."
                : undefined
          }
          setupMode={isPoultrySetup}
          submitLabel="Create product"
          isSubmitting={create.isPending}
          onSubmit={async (payload) => {
            const product = await create.mutateAsync(payload);
            if (returnToOpeningStock) {
              router.replace(openingStockHref);
              return;
            }
            if (returnToInventory) {
              router.replace({
                pathname: "/products/[productId]/inventory",
                params: { productId: product.id },
              });
              return;
            }
            if (isSetupFlow) {
              router.replace({
                pathname: "/farm-setup",
                params: {
                  step: params.setupStep ?? "0",
                  ...(params.setupAdditional === "true"
                    ? { additional: "true" }
                    : {}),
                },
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
};
