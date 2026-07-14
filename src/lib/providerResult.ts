export type ProviderName = "spotify" | "youtube";

export type ProviderResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; provider: ProviderName; reason: string; httpStatus: number };

export const providerOk = <T>(data: T): ProviderResult<T> => ({ status: "ok", data });

export const providerError = <T>(
  provider: ProviderName,
  reason: string,
  httpStatus: number,
): ProviderResult<T> => ({ status: "error", provider, reason, httpStatus });

export function isProviderError<T>(
  result: ProviderResult<T>,
): result is Extract<ProviderResult<T>, { status: "error" }> {
  return result.status === "error";
}

export function extractProviderReason(raw: string): string {
  const text = raw.trim();
  if (!text) return "Provider returned an empty error response";
  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string; reason?: string; status?: string; errors?: Array<{ reason?: string; message?: string }> } | string;
      error_description?: string;
      message?: string;
    };
    if (typeof parsed.error === "string") return parsed.error_description || parsed.error;
    const nested = parsed.error?.errors?.[0];
    return (
      parsed.error?.message ||
      parsed.error?.reason ||
      nested?.message ||
      nested?.reason ||
      parsed.message ||
      text.slice(0, 500)
    );
  } catch {
    return text.slice(0, 500);
  }
}

export class ProviderHttpError extends Error {
  provider: ProviderName;
  httpStatus: number;

  constructor(provider: ProviderName, httpStatus: number, reason: string) {
    super(reason);
    this.name = "ProviderHttpError";
    this.provider = provider;
    this.httpStatus = httpStatus;
  }
}