import { OperationError } from '../../errors/errors.ts';
import type { JsonObject, OperationType } from '../../../domain/models/job.ts';

export interface OperationContext {
  /** Outputs of this job's dependencies, keyed by dependency job ID. */
  dependencyOutputs: Record<string, JsonObject>;
}

export type OperationHandler = (input: JsonObject, ctx: OperationContext) => JsonObject;

const DEFAULT_SUMMARY_WORDS = 20;

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Returns the named fields as non-empty strings, or throws one error naming every bad field. */
function requireText<K extends string>(input: JsonObject, ...fields: K[]): Record<K, string> {
  const missing = fields.filter((f) => !isNonEmptyText(input[f]));
  if (missing.length > 0) {
    throw new OperationError(`Missing or empty field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
  }
  return Object.fromEntries(fields.map((f) => [f, input[f] as string])) as Record<K, string>;
}

function requireBody(input: JsonObject): string {
  if (typeof input.body !== 'string') throw new OperationError('Missing field: body');
  return input.body;
}

function summaryWordCount(input: JsonObject): number {
  const value = input.summary_words;
  if (value === undefined) return DEFAULT_SUMMARY_WORDS;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new OperationError('summary_words must be a positive integer');
  }
  return value;
}

/**
 * The simulated operations. Typing the registry as a Record over every OperationType makes the
 * compiler flag a new operation type that has no handler.
 */
export const OPERATIONS: Record<OperationType, OperationHandler> = {
  VALIDATE_ARTICLE: (input) => {
    const { title, body } = requireText(input, 'title', 'body');
    return { valid: true, titleLength: title.length, bodyWords: words(body).length };
  },

  COUNT_WORDS: (input) => ({ wordCount: words(requireBody(input)).length }),

  GENERATE_SUMMARY: (input) => {
    const body = requireBody(input);
    const requested = summaryWordCount(input);
    const summary = words(body).slice(0, requested);
    return { summary: summary.join(' '), summaryWords: summary.length, requestedWords: requested };
  },

  CHECK_METADATA: (input) => {
    const { title, author, category } = requireText(input, 'title', 'author', 'category');
    return { valid: true, title, author, category };
  },

  BUILD_EDITORIAL_REPORT: (input, ctx) => ({
    title: isNonEmptyText(input.report_title) ? input.report_title : 'Editorial Report',
    dependencyCount: Object.keys(ctx.dependencyOutputs).length,
    results: ctx.dependencyOutputs,
  }),
};

/** Runs the operation; throws OperationError when its input is invalid. */
export function runOperation(type: OperationType, input: JsonObject, ctx: OperationContext): JsonObject {
  return OPERATIONS[type](input, ctx);
}
