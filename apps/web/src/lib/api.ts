import type { Problem } from "@aashi/contracts";
import createClient from "openapi-fetch";
import type { paths } from "./api.gen";

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

/**
 * The typed API client, generated from the OpenAPI contract (api.gen.ts; run
 * `pnpm openapi` after changing the contract). Addresses, inputs and replies
 * are checked by the compiler. Calls go through the web app's /api proxy.
 * Any error reply is thrown as an ApiError, so `data` is always present on return.
 */
export const client = createClient<paths>({ baseUrl: "/api" });

client.use({
  async onResponse({ response }) {
    if (response.ok) return undefined;
    const problem = (await response.json().catch(() => undefined)) as Partial<Problem> | undefined;
    throw new ApiError({
      type: "about:blank",
      title: problem?.title ?? "Something went wrong",
      status: response.status,
      code: problem?.code ?? "error",
      detail: problem?.detail ?? "Something went wrong. Please try again.",
      errors: problem?.errors,
    });
  },
  onError() {
    return new ApiError({
      type: "about:blank",
      title: "Network error",
      status: 0,
      code: "network_error",
      detail: "Could not reach the server. Check your connection and try again.",
    });
  },
});

export const isNotFound = (error: unknown): boolean => error instanceof ApiError && error.status === 404;

/** Where to go after signing in: the `next` address if it is a path inside this app, otherwise the fallback. */
export function nextPath(fallback: string): string {
  const next = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
