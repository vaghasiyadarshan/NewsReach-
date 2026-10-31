import type { ZodType } from 'zod';
import { ValidationError } from '../../domain/model/errors.ts';

/**
 * Parses HTTP-only inputs (path parameters, query strings, the run request body) with zod and
 * reports failures through the same ValidationError the rest of the system uses. Job fields are
 * validated in the domain, not here, so every entry point shares one set of rules.
 */
export function parseInput<T>(schema: ZodType<T>, data: unknown, source: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw new ValidationError(
    result.error.issues.map((issue) => ({
      field: [source, ...issue.path.map(String)].join('.'),
      message: issue.message,
    })),
  );
}
