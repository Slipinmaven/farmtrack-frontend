const configuredOrigin = process.env.EXPO_PUBLIC_API_URL?.trim().replace(
  /\/+$/,
  "",
);
const apiOrigin = (configuredOrigin || "http://localhost:8000").replace(
  /\/api\/v1$/,
  "",
);

export const API_BASE_URL = `${apiOrigin}/api/v1`;
export const REQUEST_TIMEOUT_MS = 15_000;
