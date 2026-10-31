import {
  ConflictError,
  GraphError,
  InvalidTransitionError,
  LimitExceededError,
  MissingReferenceError,
  NotFoundError,
  ValidationError,
} from '../../domain/model/errors.ts';

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ErrorResponse {
  status: number;
  body: ErrorBody;
}

const respond = (status: number, code: string, message: string, details?: Record<string, unknown>): ErrorResponse => ({
  status,
  body: { error: { code, message, ...(details ? { details } : {}) } },
});

/**
 * The single place that turns failures into HTTP responses:
 * 400 bad input, 404 not found, 409 state conflict, 422 well-formed but unacceptable
 * (dependency cycle, unknown references, scheduling limits), 500 anything unexpected.
 */
export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof ValidationError) return respond(400, error.code, error.message, { issues: error.issues });
  if (error instanceof NotFoundError) return respond(404, error.code, error.message);
  if (error instanceof ConflictError || error instanceof InvalidTransitionError) {
    return respond(409, error.code, error.message);
  }
  if (error instanceof GraphError) return respond(422, error.code, error.message, { cycle: error.cycle });
  if (error instanceof MissingReferenceError) {
    return respond(422, error.code, error.message, { kind: error.kind, ids: error.ids });
  }
  if (error instanceof LimitExceededError) return respond(422, error.code, error.message);

  // body-parser raises this for a request body that is not valid JSON
  if (typeof error === 'object' && error !== null && (error as { type?: unknown }).type === 'entity.parse.failed') {
    return respond(400, 'INVALID_JSON', 'The request body is not valid JSON');
  }
  return respond(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}
