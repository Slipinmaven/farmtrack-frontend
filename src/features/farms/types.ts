export type ThemeMode = "light" | "dark" | "system";

export type FarmSettings = {
  id: string;
  farm_id: string;
  primary_color: string | null;
  secondary_color: string | null;
  font_family: string | null;
  font_scale: string | number | null;
  theme_mode: ThemeMode | null;
  logo_path: string | null;
  currency: string | null;
  timezone: string | null;
  created_at: string;
  updated_at: string;
};

export type Farm = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  location: string | null;
  phone_number: string | null;
  email: string | null;
  maximum_chicken_capacity: number | null;
  is_active: boolean;
  setup_completed_at: string | null;
  created_at: string;
  updated_at: string;
  settings: FarmSettings | null;
};

export type CreateFarmPayload = {
  name: string;
  description?: string | null;
  location?: string | null;
  phone_number?: string | null;
  email?: string | null;
  maximum_chicken_capacity?: number | null;
};

export type UpdateFarmPayload = Partial<
  Pick<
    Farm,
    | "name"
    | "description"
    | "location"
    | "phone_number"
    | "email"
    | "maximum_chicken_capacity"
    | "is_active"
  >
>;

export type FarmLogoUpload = {
  uri: string;
  fileName: string | null;
  mimeType: string | null;
};
