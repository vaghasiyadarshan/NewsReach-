/** Plain code-unit string comparison, so "J10" < "J2". Used for every ID / machine tie-break. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
