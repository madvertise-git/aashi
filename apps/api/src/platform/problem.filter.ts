import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Problem } from "@aashi/contracts";
import type { Response } from "express";
import { ZodError } from "zod";

const TITLES: Record<number, [code: string, title: string]> = {
  400: ["bad_request", "Bad request"],
  401: ["unauthenticated", "Sign in required"],
  403: ["forbidden", "Not allowed"],
  404: ["not_found", "Not found"],
  409: ["conflict", "Conflict"],
  422: ["validation_failed", "Validation failed"],
  429: ["rate_limited", "Too many requests"],
};

/** An error with a stable code that screens can act on. */
export class ProblemException extends HttpException {
  constructor(status: number, readonly code: string, detail: string) {
    super(detail, status);
  }
}

/** Looks through wrapper errors for a Postgres error code (e.g. 23505). */
function pgCode(error: unknown): string | undefined {
  for (let e = error as { code?: unknown; cause?: unknown } | undefined, i = 0; e && i < 5; e = e.cause as typeof e, i++) {
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
  }
  return undefined;
}

/** Turns every error into one format: RFC 9457 "problem details". */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger("ProblemFilter");

  catch(error: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const problem = this.toProblem(error);
    res.status(problem.status).type("application/problem+json").send(JSON.stringify(problem));
  }

  private toProblem(error: unknown): Problem {
    if (error instanceof ZodError) {
      return {
        type: "about:blank",
        title: "Validation failed",
        status: 422,
        code: "validation_failed",
        errors: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      };
    }
    if (error instanceof HttpException) {
      const status = error.getStatus();
      const [code, title] = TITLES[status] ?? ["error", "Error"];
      return {
        type: "about:blank",
        title,
        status,
        code: error instanceof ProblemException ? error.code : code,
        detail: error.message,
      };
    }
    if (pgCode(error) === "23505") {
      return { type: "about:blank", title: "Conflict", status: 409, code: "conflict", detail: "That already exists." };
    }
    this.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return { type: "about:blank", title: "Something went wrong", status: 500, code: "internal_error" };
  }
}
