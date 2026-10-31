import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, deriveScheduleStatus, isFinal } from '../../src/domain/execution/lifecycle.ts';
import { InvalidTransitionError } from '../../src/domain/model/errors.ts';
import type { ExecutionStatus } from '../../src/domain/model/execution.ts';

const ALL: ExecutionStatus[] = ['SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED', 'BLOCKED'];

describe('execution lifecycle', () => {
  it('allows exactly the legal transitions', () => {
    const legal = new Set(['SCHEDULED>RUNNING', 'SCHEDULED>BLOCKED', 'RUNNING>COMPLETED', 'RUNNING>FAILED']);
    for (const from of ALL) {
      for (const to of ALL) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(legal.has(`${from}>${to}`));
      }
    }
  });

  it('refuses to move a COMPLETED execution back to RUNNING', () => {
    expect(() => assertTransition('COMPLETED', 'RUNNING')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('COMPLETED', 'RUNNING')).toThrow('COMPLETED -> RUNNING');
  });

  it('cannot skip RUNNING on the way to COMPLETED or FAILED', () => {
    expect(canTransition('SCHEDULED', 'COMPLETED')).toBe(false);
    expect(canTransition('SCHEDULED', 'FAILED')).toBe(false);
  });

  it('treats COMPLETED, FAILED and BLOCKED as final', () => {
    expect(ALL.filter(isFinal)).toEqual(['COMPLETED', 'FAILED', 'BLOCKED']);
  });
});

describe('derived schedule status', () => {
  it('is GENERATED while every job is only assigned', () => {
    expect(deriveScheduleStatus(['SCHEDULED', 'SCHEDULED'])).toBe('GENERATED');
  });

  it('is RUNNING while work remains after a start', () => {
    expect(deriveScheduleStatus(['COMPLETED', 'SCHEDULED'])).toBe('RUNNING');
    expect(deriveScheduleStatus(['COMPLETED', 'RUNNING'])).toBe('RUNNING');
  });

  it('is COMPLETED when every job completed', () => {
    expect(deriveScheduleStatus(['COMPLETED', 'COMPLETED'])).toBe('COMPLETED');
  });

  it('is COMPLETED_WITH_FAILURES when finished with failed or blocked jobs', () => {
    expect(deriveScheduleStatus(['COMPLETED', 'FAILED', 'BLOCKED'])).toBe('COMPLETED_WITH_FAILURES');
    expect(deriveScheduleStatus(['FAILED'])).toBe('COMPLETED_WITH_FAILURES');
  });

  it('has nothing pending when there are no executions', () => {
    expect(deriveScheduleStatus([])).toBe('COMPLETED');
  });
});
