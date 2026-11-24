export const queryKeys = {
  farms: (userId: string) => ["farms", userId] as const,
  farmMembers: (userId: string, farmId: string) =>
    ["farm-members", userId, farmId] as const,
  farmInvitations: (userId: string) => ["farm-invitations", userId] as const,
  blocks: (userId: string, farmId: string) =>
    ["blocks", userId, farmId] as const,
};
