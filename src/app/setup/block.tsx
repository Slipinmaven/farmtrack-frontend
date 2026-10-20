import { useLocalSearchParams } from "expo-router";

import { SessionGate } from "@/components/layout/session-gate";
import { BlockCreateScreen } from "@/features/blocks/components/block-create-screen";

export default function SetupBlockScreen() {
  const params = useLocalSearchParams<{ step?: string }>();
  return (
    <SessionGate allowIncompleteSetup>
      <BlockCreateScreen setupStep={params.step ?? "2"} />
    </SessionGate>
  );
}
