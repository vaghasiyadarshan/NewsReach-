export interface FieldIssue {
  field: string;
  message: string;
}

export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Malformed or out-of-range input (400). */
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
  constructor(readonly issues: FieldIssue[]) {
    super(`Invalid input: ${issues.map((i) => `${i.field}: ${i.message}`).join('; ')}`);
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  constructor(message: string) {
    super(message);
  }
}

/** State conflict, e.g. duplicate ID or stale schedule (409). */
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
  constructor(message: string) {
    super(message);
  }
}

/** Dependency cycle, including self dependency (422). `cycle` is e.g. ['J1','J2','J1']. */
export class GraphError extends DomainError {
  readonly code = 'CIRCULAR_DEPENDENCY';
  constructor(readonly cycle: string[]) {
    super(`Circular dependency: ${cycle.join(' -> ')}`);
  }
}

/** Reference to a dependency job or machine that does not exist (422). */
export class MissingReferenceError extends DomainError {
  readonly code = 'MISSING_REFERENCE';
  constructor(
    readonly kind: 'dependency' | 'machine',
    readonly ids: string[],
  ) {
    super(`Unknown ${kind} reference(s): ${ids.join(', ')}`);
  }
}

/** Input exceeds the supported scheduling limits (422). */
export class LimitExceededError extends DomainError {
  readonly code = 'LIMIT_EXCEEDED';
  constructor(message: string) {
    super(message);
  }
}

/** An operation could not complete because of its input; the engine records the job as FAILED. */
export class OperationError extends DomainError {
  readonly code = 'OPERATION_FAILED';
  constructor(message: string) {
    super(message);
  }
}

/** A lifecycle transition that is not allowed. */
export class InvalidTransitionError extends DomainError {
  readonly code = 'INVALID_TRANSITION';
  constructor(from: string, to: string) {
    super(`Invalid status transition ${from} -> ${to}`);
  }
}
