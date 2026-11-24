import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  acceptFarmInvitation,
  createFarm,
  completeFarmSetup,
  deleteFarmLogo,
  getFarmInvitations,
  getFarmMembers,
  getFarms,
  getPendingFarmDeletions,
  inviteFarmMember,
  leaveFarm,
  resendFarmInvitation,
  restoreFarmDeletion,
  revokeFarmMember,
  scheduleFarmDeletion,
  uploadFarmLogo,
  updateFarm,
  updateFarmMemberRole,
  updateFarmSettings,
} from "@/features/farms/api";
import type {
  CreateFarmPayload,
  FarmMembership,
  FarmLeaveEmailStatus,
  FarmLogoUpload,
  FarmRole,
  FarmSettings,
  UpdateFarmPayload,
} from "@/features/farms/types";
import { queryKeys } from "@/lib/query/keys";

export function useFarms(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: userId ? queryKeys.farms(userId) : ["farms", "anonymous"],
    queryFn: getFarms,
    enabled: Boolean(userId) && enabled,
  });
}

export function usePendingFarmDeletions(userId: string | undefined) {
  return useQuery({
    queryKey: ["pending-farm-deletions", userId ?? "anonymous"],
    queryFn: getPendingFarmDeletions,
    enabled: Boolean(userId),
  });
}

export function useScheduleFarmDeletion(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (currentPassword: string) =>
      scheduleFarmDeletion(farmId, currentPassword),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.farms(userId) }),
        client.invalidateQueries({
          queryKey: ["pending-farm-deletions", userId],
        }),
      ]);
    },
  });
}

export function useRestoreFarmDeletion(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      farmId,
      currentPassword,
    }: {
      farmId: string;
      currentPassword: string;
    }) => restoreFarmDeletion(farmId, currentPassword),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.farms(userId) }),
        client.invalidateQueries({
          queryKey: ["pending-farm-deletions", userId],
        }),
      ]);
    },
  });
}

export function useLeaveFarm(userId: string, farmId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (currentPassword: string): Promise<FarmLeaveEmailStatus> =>
      leaveFarm(farmId, currentPassword),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.farms(userId) }),
        client.invalidateQueries({
          queryKey: queryKeys.farmMembers(userId, farmId),
        }),
        client.invalidateQueries({
          queryKey: queryKeys.farmInvitations(userId),
        }),
      ]);
    },
  });
}

export function useFarmMembers(
  userId: string | undefined,
  farmId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey:
      userId && farmId
        ? queryKeys.farmMembers(userId, farmId)
        : ["farm-members", userId ?? "anonymous", farmId ?? "unselected"],
    queryFn: () => getFarmMembers(farmId!),
    enabled: Boolean(farmId) && enabled,
  });
}

export function useFarmInvitations(userId: string | undefined) {
  return useQuery({
    queryKey: userId
      ? queryKeys.farmInvitations(userId)
      : ["farm-invitations", "anonymous"],
    queryFn: getFarmInvitations,
    enabled: Boolean(userId),
  });
}

function useInvalidateFarmAccess(userId: string) {
  const queryClient = useQueryClient();
  return async (farmId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.farms(userId) }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.farmInvitations(userId),
      }),
      ...(farmId
        ? [
            queryClient.invalidateQueries({
              queryKey: queryKeys.farmMembers(userId, farmId),
            }),
          ]
        : []),
    ]);
  };
}

export function useInviteFarmMember(userId: string, farmId: string) {
  const invalidate = useInvalidateFarmAccess(userId);
  return useMutation({
    mutationFn: ({
      email,
      role,
      createAccount,
      initialPassword,
    }: {
      email: string;
      role: Exclude<FarmRole, "owner">;
      createAccount?: boolean;
      initialPassword?: string;
    }) =>
      inviteFarmMember(farmId, email, role, {
        createAccount,
        initialPassword,
      }),
    onSuccess: () => invalidate(farmId),
  });
}

export function useUpdateFarmMemberRole(userId: string, farmId: string) {
  const invalidate = useInvalidateFarmAccess(userId);
  return useMutation({
    mutationFn: ({
      membershipId,
      role,
    }: {
      membershipId: string;
      role: Exclude<FarmRole, "owner">;
    }) => updateFarmMemberRole(farmId, membershipId, role),
    onSuccess: () => invalidate(farmId),
  });
}

export function useRevokeFarmMember(userId: string, farmId: string) {
  const invalidate = useInvalidateFarmAccess(userId);
  return useMutation({
    mutationFn: (membershipId: string) =>
      revokeFarmMember(farmId, membershipId),
    onSuccess: () => invalidate(farmId),
  });
}

export function useResendFarmInvitation(userId: string, farmId: string) {
  const invalidate = useInvalidateFarmAccess(userId);
  return useMutation({
    mutationFn: (membershipId: string) =>
      resendFarmInvitation(farmId, membershipId),
    onSuccess: () => invalidate(farmId),
  });
}

export function useAcceptFarmInvitation(userId: string) {
  const invalidate = useInvalidateFarmAccess(userId);
  return useMutation({
    mutationFn: (membershipId: string) =>
      acceptFarmInvitation(membershipId),
    onSuccess: (membership: FarmMembership) =>
      invalidate(membership.farm_id),
  });
}

export function useCreateFarm(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateFarmPayload) => createFarm(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.farms(userId),
      });
    },
  });
}

export function useCompleteFarmSetup(userId: string, farmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => completeFarmSetup(farmId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.farms(userId),
      });
    },
  });
}

export function useUpdateFarm(userId: string, farmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateFarmPayload) => updateFarm(farmId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.farms(userId),
      });
    },
  });
}

export function useUpdateFarmStatus(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      farmId,
      is_active,
    }: {
      farmId: string;
      is_active: boolean;
    }) => updateFarm(farmId, { is_active }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.farms(userId),
      });
    },
  });
}

export function useUpdateFarmSettings(userId: string, farmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      payload: Partial<
        Pick<
          FarmSettings,
          | "primary_color"
          | "secondary_color"
          | "font_family"
          | "font_scale"
          | "theme_mode"
          | "logo_path"
          | "currency"
          | "timezone"
        >
      >,
    ) => updateFarmSettings(farmId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.farms(userId),
      });
    },
  });
}

export function useUploadFarmLogo(userId: string, farmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (image: FarmLogoUpload) => uploadFarmLogo(farmId, image),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.farms(userId),
      });
    },
  });
}

export function useDeleteFarmLogo(userId: string, farmId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteFarmLogo(farmId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.farms(userId),
      });
    },
  });
}
