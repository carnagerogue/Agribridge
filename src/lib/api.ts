export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
let csrfToken = "";
export function setCsrfToken(token: string) {
  csrfToken = token;
}
export async function rawRequest(
  path: string,
  method = "GET",
  body?: unknown,
  idempotencyKey?: string,
  signal?: AbortSignal,
) {
  return fetch(path, {
    method,
    credentials: "same-origin",
    signal: signal ?? AbortSignal.timeout(18000),
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { "X-CSRF-Token": csrfToken }),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const response = await rawRequest(path, method, body, idempotencyKey);
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error?.code ?? "REQUEST_FAILED",
      data.error?.message ??
        "Could not complete this request. Please try again.",
    );
  return data as T;
}
