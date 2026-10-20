export const queryKeys = {
  farms: (userId: string) => ["farms", userId] as const,
  blocks: (userId: string, farmId: string) =>
    ["blocks", userId, farmId] as const,
};
