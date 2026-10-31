/**
 * Mutual exclusion per key across callers, including separate processes. A second caller for the
 * same key waits until the first finishes, so a schedule is never run by two requests at once.
 */
export interface RunLock {
  withLock<T>(key: number, work: () => Promise<T>): Promise<T>;
}
