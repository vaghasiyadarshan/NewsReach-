const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

function errorCodeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : undefined;
}

export const isUniqueViolation = (error: unknown): boolean => errorCodeOf(error) === UNIQUE_VIOLATION;
export const isForeignKeyViolation = (error: unknown): boolean => errorCodeOf(error) === FOREIGN_KEY_VIOLATION;
