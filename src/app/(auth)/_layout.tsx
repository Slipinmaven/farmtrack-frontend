import { Redirect, Stack } from "expo-router";

import { LoadingState } from "@/components/feedback/loading-state";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";

export default function AuthLayout() {
  const auth = useAuth();
  const farm = useFarm();
  if (auth.status === "loading") return <LoadingState />;
  if (auth.status === "blocked") return <Redirect href="/device-blocked" />;
  if (auth.status === "authenticated") {
    if (farm.status === "initializing")
      return <LoadingState label="Loading your farm" />;
    if (farm.status === "empty") return <Redirect href="/farm-setup" />;
    if (farm.status === "ready") return <Redirect href="/(tabs)" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
