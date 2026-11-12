import type { PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/** Checks a request body or query against the shared rules. Failures become a 422. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly rules: ZodType<T>) {}

  transform(value: unknown): T {
    return this.rules.parse(value);
  }
}
