import { ValidationError, type FieldIssue } from '../errors/errors.ts';
import { OPERATION_TYPES, PRIORITY_MAX, PRIORITY_MIN, type Job, type JsonObject } from '../../domain/models/job.ts';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates untrusted job input and returns a normalized Job (trimmed text, de-duplicated and
 * sorted machine and dependency lists). Reports every invalid field at once.
 *
 * Only shape and range rules live here. Whether referenced machines and dependencies exist, and
 * whether the dependency graph stays acyclic, depends on stored data and is checked by the use cases.
 * A deadline too early for the duration is deliberately accepted: the scheduler excludes such jobs.
 */
export function validateJobInput(raw: unknown): Job {
  if (!isRecord(raw)) throw new ValidationError([{ field: 'body', message: 'must be a JSON object' }]);

  const issues: FieldIssue[] = [];
  const fail = (field: string, message: string): undefined => {
    issues.push({ field, message });
    return undefined;
  };

  const text = (field: string, message: string): string | undefined => {
    const value = raw[field];
    return typeof value === 'string' && value.trim() ? value.trim() : fail(field, message);
  };

  const integer = (field: string, min: number, message: string, max = Infinity): number | undefined => {
    const value = raw[field];
    return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
      ? value
      : fail(field, message);
  };

  const stringList = (field: string, message: string, required: boolean): string[] | undefined => {
    const value = raw[field];
    if (value === undefined && !required) return [];
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v.trim())) return fail(field, message);
    const unique = [...new Set(value.map((v: string) => v.trim()))].sort();
    return required && unique.length === 0 ? fail(field, message) : unique;
  };

  const id = text('id', "is required: 1-64 characters, letters, digits, '-' or '_'");
  if (id !== undefined && !ID_PATTERN.test(id)) {
    fail('id', "must be 1-64 characters: letters, digits, '-' or '_'");
  }
  const name = text('name', 'is required');

  const operationType = OPERATION_TYPES.find((t) => t === raw.operationType);
  if (!operationType) fail('operationType', `must be one of: ${OPERATION_TYPES.join(', ')}`);

  const duration = integer('duration', 1, 'must be an integer of at least 1 (slots)');
  const releaseTime = integer('releaseTime', 0, 'must be an integer of at least 0');
  const deadline = integer('deadline', 0, 'must be an integer of at least 0');
  const priority = integer(
    'priority',
    PRIORITY_MIN,
    `must be an integer between ${PRIORITY_MIN} and ${PRIORITY_MAX}`,
    PRIORITY_MAX,
  );
  const eligibleMachines = stringList('eligibleMachines', 'must be a non-empty array of machine IDs', true);
  const dependencies = stringList('dependencies', 'must be an array of job IDs', false);

  let inputData: JsonObject = {};
  if (raw.inputData !== undefined) {
    if (isRecord(raw.inputData)) inputData = raw.inputData;
    else fail('inputData', 'must be a JSON object');
  }

  if (issues.length > 0) throw new ValidationError(issues);

  return {
    id: id!,
    name: name!,
    operationType: operationType!,
    duration: duration!,
    releaseTime: releaseTime!,
    deadline: deadline!,
    priority: priority!,
    eligibleMachines: eligibleMachines!,
    dependencies: dependencies!,
    inputData,
  };
}
