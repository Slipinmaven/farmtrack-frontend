import { SessionGate } from "@/components/layout/session-gate";
import { FarmProfileForm } from "@/features/farms/components/farm-profile-form";

export default function FarmProfileScreen() {
  return (
    <SessionGate>
      <FarmProfileForm />
    </SessionGate>
  );
}
