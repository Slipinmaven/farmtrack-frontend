import { z } from "zod";

export const createBlockSchema = z.object({
  name: z.string().trim().min(1, "Enter a block name.").max(100),
  description: z.string().nullable().optional(),
  capacity: z.number().int().min(0, "Capacity cannot be negative."),
  over_capacity_limit: z.number().int().min(0, "Limit cannot be negative."),
  is_active: z.boolean().default(true),
});

export type CreateBlockFormValues = z.infer<typeof createBlockSchema>;
