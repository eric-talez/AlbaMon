/** Bound offsets and reject repeated/malformed URL page values. */
export function normalizePage(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1;
}
