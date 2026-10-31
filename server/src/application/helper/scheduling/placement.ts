import type { Assignment } from '../../../domain/models/schedule.ts';
import type { Candidate } from './feasibility.ts';

export interface Placement {
  /** Sorted by job ID. */
  assignments: Assignment[];
  makespan: number;
}

interface PlacedJob {
  machine: string;
  start: number;
  end: number;
}

type PlacedState = ReadonlyArray<PlacedJob | undefined>;

/**
 * THE extension seam for placement rules. Every constraint on putting `candidates[index]` on
 * `machine` at `start` lives here (machine exclusivity and dependency ordering today). A new
 * constraint such as machine downtime windows or setup time is a new check in this function.
 *
 * `placed` is indexed like `candidates`; unplaced jobs are `undefined`. Dependencies are checked
 * in both directions so jobs can be placed in any order (a dependency may have a higher ID).
 */
export function canPlace(
  dependsOn: ReadonlyArray<ReadonlyArray<boolean>>,
  durations: readonly number[],
  placed: PlacedState,
  index: number,
  machine: string,
  start: number,
): boolean {
  const end = start + durations[index]!;
  for (let k = 0; k < placed.length; k++) {
    const other = placed[k];
    if (!other || k === index) continue;
    if (other.machine === machine && start < other.end && other.start < end) return false;
    if (dependsOn[index]![k] && other.end > start) return false;
    if (dependsOn[k]![index] && end > other.start) return false;
  }
  return true;
}

/**
 * Finds the best placement of an exact set of jobs (a subset of the candidates).
 *
 * Minimizes makespan by iterative deepening on a completion cap M. For a fixed M, a depth-first
 * search visits jobs in ID order and tries (start ascending, machine ascending), which enumerates
 * complete placements in lexicographic order of (jobId, start, machineId); the first one found is
 * therefore the lexicographically smallest placement for the smallest feasible M.
 */
export class SubsetPlacer {
  nodesVisited = 0;

  private readonly n: number;
  private readonly durations: number[];
  private readonly dependsOn: boolean[][];
  private readonly cache = new Map<number, Placement | null>();
  private readonly infeasible: number[] = [];

  /** `candidates` must be sorted by job ID and closed under dependencies for every subset asked about. */
  constructor(
    private readonly candidates: readonly Candidate[],
    private readonly horizon: number,
  ) {
    this.n = candidates.length;
    this.durations = candidates.map((c) => c.job.duration);
    const indexOf = new Map(candidates.map((c, i) => [c.job.id, i] as const));
    this.dependsOn = candidates.map((c) => {
      const row = new Array<boolean>(this.n).fill(false);
      for (const dep of c.job.dependencies) {
        const k = indexOf.get(dep);
        if (k !== undefined) row[k] = true;
      }
      return row;
    });
  }

  /** Bit mask of the direct dependencies of each candidate. */
  dependencyMasks(): number[] {
    return this.dependsOn.map((row) => row.reduce((mask, isDep, k) => (isDep ? mask | (1 << k) : mask), 0));
  }

  /** Best placement of exactly the jobs in `mask`, or null when they cannot all be scheduled. */
  placeJobs(mask: number): Placement | null {
    const cached = this.cache.get(mask);
    if (cached !== undefined) return cached;

    // Infeasibility is monotone: if a subset cannot be scheduled, no superset can.
    const result = this.infeasible.some((f) => (f & mask) === f) ? null : this.findBestPlacement(mask);
    if (result === null) this.infeasible.push(mask);
    this.cache.set(mask, result);
    return result;
  }

  private findBestPlacement(mask: number): Placement | null {
    const members: number[] = [];
    for (let i = 0; i < this.n; i++) if (mask & (1 << i)) members.push(i);
    if (members.length === 0) return { assignments: [], makespan: 0 };

    const machines = new Set(members.flatMap((i) => this.candidates[i]!.usableMachines));
    const totalWork = members.reduce((sum, i) => sum + this.durations[i]!, 0);
    const lowerBound = Math.max(
      ...members.map((i) => this.candidates[i]!.earliestStart + this.durations[i]!),
      Math.ceil(totalWork / machines.size),
    );

    for (let cap = lowerBound; cap <= this.horizon; cap++) {
      const placed = this.searchPlacement(members, cap);
      if (placed) {
        const assignments = members.map((i): Assignment => {
          const p = placed[i]!;
          return { jobId: this.candidates[i]!.job.id, machineId: p.machine, start: p.start, end: p.end };
        });
        return { assignments, makespan: Math.max(...assignments.map((a) => a.end)) };
      }
    }
    return null;
  }

  /** Depth-first search for a complete placement finishing by `cap`; returns the placed state or null. */
  private searchPlacement(members: readonly number[], cap: number): PlacedJob[] | null {
    const placed: Array<PlacedJob | undefined> = new Array(this.n).fill(undefined);
    const failed = new Set<string>();

    const dfs = (pos: number): boolean => {
      if (pos === members.length) return true;
      this.nodesVisited++;

      const key = this.stateKey(members, pos, placed);
      if (failed.has(key)) return false;

      const index = members[pos]!;
      const { job, usableMachines, earliestStart } = this.candidates[index]!;
      const lastStart = Math.min(job.deadline, cap) - job.duration;

      for (let start = earliestStart; start <= lastStart; start++) {
        for (const machine of usableMachines) {
          if (!canPlace(this.dependsOn, this.durations, placed, index, machine, start)) continue;
          placed[index] = { machine, start, end: start + job.duration };
          if (dfs(pos + 1)) return true;
          placed[index] = undefined;
        }
      }
      failed.add(key);
      return false;
    };

    return dfs(0) ? (placed as PlacedJob[]) : null;
  }

  /**
   * Identifies the state of a partial placement for the "known to fail" memo. What can still
   * influence the rest of the search: which slots each machine has taken, and the start of every
   * placed job that is tied by a dependency to a job not yet placed.
   */
  private stateKey(members: readonly number[], pos: number, placed: PlacedState): string {
    const occupancy = new Map<string, number>();
    for (const p of placed) {
      if (!p) continue;
      let bits = occupancy.get(p.machine) ?? 0;
      for (let s = p.start; s < p.end; s++) bits |= 1 << s;
      occupancy.set(p.machine, bits);
    }
    const machinePart = [...occupancy.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([m, bits]) => `${m}=${bits}`)
      .join(',');

    const unplaced = members.slice(pos);
    const linked: string[] = [];
    for (const k of members.slice(0, pos)) {
      if (unplaced.some((u) => this.dependsOn[u]![k] || this.dependsOn[k]![u])) {
        linked.push(`${k}@${placed[k]!.start}`);
      }
    }
    return `${pos}|${machinePart}|${linked.join(',')}`;
  }
}
