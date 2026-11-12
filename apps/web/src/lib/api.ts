import type { Problem } from "@aashi/contracts";

/** An error reply from the API, in its one standard format. */
export class ApiError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail ?? problem.title);
  }
  get status() {
    return this.problem.status;
  }
  get code() {
    return this.problem.code;
  }
}

/** Calls the API through the web app's /api proxy and returns the JSON reply. */
export async function api<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError({ type: "about:blank", title: "Network error", status: 0, code: "network_error", detail: "Could not reach the server. Check your connection and try again." });
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    const problem = data as Partial<Problem> | undefined;
    throw new ApiError({
      type: "about:blank",
      title: problem?.title ?? "Something went wrong",
      status: res.status,
      code: problem?.code ?? "error",
      detail: problem?.detail ?? "Something went wrong. Please try again.",
      errors: problem?.errors,
    });
  }
  return data as T;
}

export const isNotFound = (error: unknown): boolean => error instanceof ApiError && error.status === 404;
