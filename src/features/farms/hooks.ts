import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createFarm,
  completeFarmSetup,
  deleteFarmLogo,
  getFarms,
  uploadFarmLogo,
  updateFarm,
  updateFarmSettings,
} from "@/features/farms/api";
import type {
  CreateFarmPayload,
  FarmLogoUpload,
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
