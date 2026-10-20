import { isAxiosError } from "axios";

export type ApiValidationDetail = {
  field: string;
  message: string;
  type: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly code: string,
    readonly requestId?: string,
    readonly details: ApiValidationDetail[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseDetails(value: unknown): ApiValidationDetail[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ApiValidationDetail[] => {
    if (!isRecord(item)) return [];
    return [
      {
        field: typeof item.field === "string" ? item.field : "",
        message:
          typeof item.message === "string" ? item.message : "Invalid value.",
        type: typeof item.type === "string" ? item.type : "validation_error",
      },
    ];
  });
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (!isAxiosError(error)) {
    return new ApiError(
      error instanceof Error && error.message.trim()
        ? error.message
        : "Something went wrong. Please try again.",
      undefined,
      "CLIENT_ERROR",
    );
  }

  const responseData: unknown = error.response?.data;
  const payload =
    isRecord(responseData) && isRecord(responseData.error)
      ? responseData.error
      : undefined;
  const details = parseDetails(payload?.details);
  const responseMessage =
    typeof payload?.message === "string"
      ? payload.message
      : error.response
        ? error.message || "The request could not be completed."
        : "Unable to reach FarmTrack. Check your connection and try again.";
  return new ApiError(
    details.length
      ? details.map(({ field, message }) =>
          field ? `${field}: ${message}` : message,
        ).join(" ")
      : responseMessage,
    error.response?.status,
    typeof payload?.code === "string" ? payload.code : "NETWORK_ERROR",
    typeof payload?.request_id === "string" ? payload.request_id : undefined,
    details,
  );
}
