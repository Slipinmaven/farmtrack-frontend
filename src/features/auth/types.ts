export type User = {
  id: string;
  email: string;
  role: "USER" | "SUPER_ADMIN";
};

export type AuthenticationResponse = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  user: User;
};

export type LoginPayload = {
  email: string;
  password: string;
  device_id?: string;
  device_name?: string;
  platform?: string;
};
