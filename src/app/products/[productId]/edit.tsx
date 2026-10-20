import { router, useLocalSearchParams, type Href } from "expo-router";
import { KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoadingState } from "@/components/feedback/loading-state";
import { FarmPageHeader } from "@/components/layout/farm-page-header";
import { SessionGate } from "@/components/layout/session-gate";
import { useAppDialog } from "@/components/ui/app-dialog";
import { ProductForm } from "@/features/management/components/product-form";
import { useProduct, useUpdateProduct } from "@/features/management/hooks";
import { normalizeApiError } from "@/lib/api/errors";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useTheme } from "@/providers/theme-provider";
import { Card } from "@/components/ui/card";
import { AppText } from "@/components/ui/app-text";
import { Button } from "@/components/ui/button";

export default function EditProductRoute() {
  const params = useLocalSearchParams<{
    productId: string;
    fromSetup?: string;
    setupStep?: string;
  }>();
  const fromSetup = params.fromSetup === "true";
  return (
    <SessionGate allowIncompleteSetup={fromSetup}>
      <EditProductContent
        fromSetup={fromSetup}
        setupStep={params.setupStep ?? "1"}
      />
    </SessionGate>
  );
}

function EditProductContent({
  fromSetup,
  setupStep,
}: {
  fromSetup: boolean;
  setupStep: string;
}) {
  const { user } = useAuth();
  const farm = useFarm();
  const { theme } = useTheme();
  const dialog = useAppDialog();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const productQuery = useProduct(user?.id, farm.selectedFarm?.id, productId);
  const detailHref = fromSetup
    ? ({ pathname: "/farm-setup", params: { step: setupStep } } as Href)
    : (`/products/${productId}` as Href);
  const update = useUpdateProduct(user?.id ?? "", farm.selectedFarm?.id ?? "");

  if (productQuery.isLoading) return <LoadingState label="Loading product" />;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <FarmPageHeader title="Edit product" showBack backHref={detailHref} />
        {productQuery.isError ? (
          <Card style={styles.state}>
            <AppText weight="semibold">Could not load this product</AppText>
            <AppText tone="secondary">
              {normalizeApiError(productQuery.error).message}
            </AppText>
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => void productQuery.refetch()}
            />
          </Card>
        ) : null}
        {productQuery.data ? (
          <ProductForm
            key={productQuery.data.id}
            initialProduct={productQuery.data}
            submitLabel="Save changes"
            isSubmitting={update.isPending}
            onSubmit={async (payload) => {
              await update.mutateAsync({
                productId: productQuery.data!.id,
                payload,
              });
              await dialog.showDialog({
                title: "Product updated",
                message:
                  "Your product details and unit conversions have been saved.",
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
