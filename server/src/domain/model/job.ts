export const OPERATION_TYPES = [
  'VALIDATE_ARTICLE',
  'COUNT_WORDS',
  'GENERATE_SUMMARY',
  'CHECK_METADATA',
  'BUILD_EDITORIAL_REPORT',
] as const;

export type OperationType = (typeof OPERATION_TYPES)[number];

export type JsonObject = Record<string, unknown>;

export interface Job {
  id: string;
  name: string;
  operationType: OperationType;
  /** Processing time in slots (>= 1). */
  duration: number;
  /** Earliest permitted start slot. */
  releaseTime: number;
  /** Latest permitted completion slot. */
  deadline: number;
  /** 1 (lowest) to 10 (highest). */
  priority: number;
  eligibleMachines: string[];
  dependencies: string[];
  inputData: JsonObject;
}

export const PRIORITY_MIN = 1;
export const PRIORITY_MAX = 10;
