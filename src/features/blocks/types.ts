export type Block = {
  id: string;
  farm_id: string;
  name: string;
  description: string | null;
  capacity: number;
  over_capacity_limit: number;
  occupied_chickens: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type BlockBatchOccupancy = {
  batch_id: string;
  batch_name: string;
  chicken_type: string;
  breed: string | null;
  status: string;
  hatch_date: string | null;
  age_days: number | null;
  quantity: number;
  notes: string | null;
};

export type BlockDetails = Block & {
  batches: BlockBatchOccupancy[];
};

export type CreateBlockPayload = {
  name: string;
  description?: string | null;
  capacity: number;
  over_capacity_limit: number;
  is_active: boolean;
};

export type UpdateBlockPayload = Partial<CreateBlockPayload>;
