import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { Farm } from "@/features/farms/types";
import { useFarms } from "@/features/farms/hooks";
import { useAuth } from "@/providers/auth-provider";
import { readSelectedFarm, saveSelectedFarm } from "@/lib/storage/farm";

type FarmStatus = "initializing" | "ready" | "empty" | "inactive" | "error";
type FarmContextValue = {
  farms: Farm[];
  allFarms: Farm[];
  selectedFarm: Farm | null;
  status: FarmStatus;
  error: Error | null;
  selectFarm: (farmId: string) => Promise<void>;
  refreshFarms: () => Promise<void>;
};

const FarmContext = createContext<FarmContextValue | null>(null);

export function FarmProvider({ children }: { children: ReactNode }) {
  const { user, status: authStatus } = useAuth();
  const userId = user?.id;
  const farmQuery = useFarms(userId, authStatus === "authenticated");
  const [selection, setSelection] = useState<{
    userId: string;
    farmId: string | null;
    resolved: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    if (authStatus !== "authenticated" || !userId) return;
    void readSelectedFarm(userId)
      .then((farmId) => {
        if (active) {
          setSelection({ userId, farmId, resolved: true });
        }
      })
      .catch(() => {
        if (active) setSelection({ userId, farmId: null, resolved: true });
      });
    return () => {
      active = false;
    };
  }, [authStatus, userId]);

  const selectionResolved =
    authStatus !== "authenticated" ||
    !userId ||
    (selection?.userId === userId && selection.resolved);
  const selectedFarmId =
    selection && selection.userId === userId ? selection.farmId : null;
  const allFarms = farmQuery.data ?? [];
  const activeFarms = allFarms.filter((farm) => farm.is_active);
  const effectiveFarmId = activeFarms.some((farm) => farm.id === selectedFarmId)
    ? selectedFarmId
    : (activeFarms[0]?.id ?? null);
  const selectedFarm =
    activeFarms.find((farm) => farm.id === effectiveFarmId) ?? null;

  useEffect(() => {
    if (
      !selectionResolved ||
      !userId ||
      !effectiveFarmId ||
      effectiveFarmId === selectedFarmId
    )
      return;
    void saveSelectedFarm(userId, effectiveFarmId).catch(() => undefined);
  }, [effectiveFarmId, selectedFarmId, selectionResolved, userId]);

  async function selectFarm(farmId: string): Promise<void> {
    if (!activeFarms.some((farm) => farm.id === farmId) || !userId) return;
    setSelection({ userId, farmId, resolved: true });
    await saveSelectedFarm(userId, farmId);
  }

  async function refreshFarms(): Promise<void> {
    await farmQuery.refetch();
  }

  let status: FarmStatus = "initializing";
  if (
    authStatus === "authenticated" &&
    selectionResolved &&
    !farmQuery.isLoading
  ) {
    if (farmQuery.isError) status = "error";
    else if (farmQuery.data && farmQuery.data.length === 0) status = "empty";
    else if (farmQuery.data && activeFarms.length === 0) status = "inactive";
    else if (selectedFarm) status = "ready";
  }

  return (
    <FarmContext.Provider
      value={{
        farms: activeFarms,
        allFarms,
        selectedFarm,
        status,
        error: farmQuery.error instanceof Error ? farmQuery.error : null,
        selectFarm,
        refreshFarms,
      }}
    >
      {children}
    </FarmContext.Provider>
  );
}

export function useFarm(): FarmContextValue {
  const context = useContext(FarmContext);
  if (!context) throw new Error("useFarm must be used inside FarmProvider.");
  return context;
}
