export type ThemeMode = "light" | "dark" | "system";
export type FarmRole = "owner" | "manager" | "worker";
export type FarmMembershipStatus = "invited" | "active" | "revoked";
export type FarmInvitationEmailStatus =
  | "not_configured"
  | "queued"
  | "sent"
  | "failed"
  | "cancelled";

export type FarmMembership = {
  id: string;
  farm_id: string;
  user_id: string;
  email: string | null;
  farm_name: string | null;
  role: FarmRole;
  status: FarmMembershipStatus;
  invited_by_id: string | null;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  invitation_email_status: FarmInvitationEmailStatus;
  invitation_email_sent_at: string | null;
};

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
  deletion_requested_at: string | null;
  created_at: string;
  updated_at: string;
  settings: FarmSettings | null;
};

export type PendingFarmDeletion = {
  id: string;
  name: string;
  deletion_requested_at: string;
  scheduled_for: string;
  notification_sent?: boolean | null;
};

export type FarmLeaveEmailStatus = {
  member_email_sent: boolean;
  owner_email_sent: boolean;
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
