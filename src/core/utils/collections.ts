/**
 * Whether every member of one set is in another.
 * @param subset - The candidate subset.
 * @param superset - The set that must contain every member.
 * @returns True when `subset` fits inside `superset`.
 */
export function isSubset(subset: ReadonlySet<number>, superset: ReadonlySet<number>): boolean {
  return [...subset].every((member: number): boolean => superset.has(member));
}

/**
 * Whether two arrays hold the same numbers in the same order.
 * @param first - First array.
 * @param second - Second array.
 * @returns True when both arrays are equal.
 */
export function arraysEqual(first: readonly number[], second: readonly number[]): boolean {
  return (
    first.length === second.length && first.every((value: number, index: number): boolean => value === second[index])
  );
}
