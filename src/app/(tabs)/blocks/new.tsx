import { SessionGate } from "@/components/layout/session-gate";
import { BlockCreateScreen } from "@/features/blocks/components/block-create-screen";

export default function CreateBlockScreen() {
  return (
    <SessionGate>
      <BlockCreateScreen />
    </SessionGate>
  );
}
