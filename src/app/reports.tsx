import { SessionGate } from "@/components/layout/session-gate";
import { ReportsOverview } from "@/features/reports/overview/overview-screen";

export default function ReportsRoute() {
  return (
    <SessionGate>
      <ReportsOverview />
    </SessionGate>
  );
}
