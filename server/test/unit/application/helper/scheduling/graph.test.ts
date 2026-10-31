import { describe, expect, it } from 'vitest';
import { GraphError, MissingReferenceError } from '../../../../../src/application/errors/errors.ts';
import {
  assertValidGraph,
  findCycle,
  findMissingReferences,
  transitiveDependencies,
  transitiveDependents,
} from '../../../../../src/application/helper/scheduling/graph.ts';

const node = (id: string, ...dependencies: string[]) => ({ id, dependencies });

describe('graph validation', () => {
  it('accepts a valid DAG', () => {
    expect(() => assertValidGraph([node('J1'), node('J2', 'J1'), node('J3', 'J1', 'J2')])).not.toThrow();
  });

  // Mandatory test 6: a missing dependency reference is rejected
  it('rejects a missing dependency reference and lists every missing id', () => {
    const jobs = [node('J1', 'J9'), node('J2', 'J8', 'J9')];
    expect(findMissingReferences(jobs)).toEqual(['J8', 'J9']);
    try {
      assertValidGraph(jobs);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MissingReferenceError);
      expect((e as MissingReferenceError).ids).toEqual(['J8', 'J9']);
    }
  });

  // Mandatory test 5: a circular dependency is rejected
  it('rejects a self dependency', () => {
    expect(findCycle([node('J1', 'J1')])).toEqual(['J1', 'J1']);
    expect(() => assertValidGraph([node('J1', 'J1')])).toThrow(GraphError);
  });

  it('reports a 2-node cycle path', () => {
    expect(findCycle([node('J1', 'J2'), node('J2', 'J1')])).toEqual(['J1', 'J2', 'J1']);
  });

  it('reports a 3-node cycle path', () => {
    const jobs = [node('J1', 'J2'), node('J2', 'J3'), node('J3', 'J1')];
    expect(findCycle(jobs)).toEqual(['J1', 'J2', 'J3', 'J1']);
    try {
      assertValidGraph(jobs);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(GraphError);
      expect((e as GraphError).message).toContain('J1 -> J2 -> J3 -> J1');
    }
  });

  it('reports only the cycle, not the path leading into it', () => {
    const jobs = [node('J1', 'J2'), node('J2', 'J3'), node('J3', 'J2')];
    expect(findCycle(jobs)).toEqual(['J2', 'J3', 'J2']);
  });

  it('is not fooled by a diamond (shared dependency, no cycle)', () => {
    const jobs = [node('J1'), node('J2', 'J1'), node('J3', 'J1'), node('J4', 'J2', 'J3')];
    expect(findCycle(jobs)).toBeNull();
  });

  it('reports missing references before cycles', () => {
    expect(() => assertValidGraph([node('J1', 'J2', 'J9'), node('J2', 'J1')])).toThrow(MissingReferenceError);
  });
});

describe('transitive closure helpers', () => {
  const jobs = [node('J1'), node('J2', 'J1'), node('J3', 'J2'), node('J4')];

  it('finds transitive dependencies', () => {
    expect([...transitiveDependencies('J3', jobs)].sort()).toEqual(['J1', 'J2']);
    expect(transitiveDependencies('J4', jobs).size).toBe(0);
  });

  it('finds transitive dependents', () => {
    expect([...transitiveDependents('J1', jobs)].sort()).toEqual(['J2', 'J3']);
    expect(transitiveDependents('J3', jobs).size).toBe(0);
  });
});
