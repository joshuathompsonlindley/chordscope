/**
 * Index of the first item whose key is at least `value`, in a list sorted by that key.
 * @param sorted - The items, in ascending key order.
 * @param value - The key to find.
 * @param keyOf - Reads an item's key.
 * @returns The index, or the list's length when every key is smaller.
 */
export function lowerBound<T>(sorted: readonly T[], value: number, keyOf: (item: T) => number): number {
  let low: number = 0;
  let high: number = sorted.length;

  while (low < high) {
    const middle: number = (low + high) >>> 1;

    if (keyOf(sorted[middle]!) < value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

/**
 * Index of the first item whose key is greater than `value`, in a list sorted by that key.
 * @param sorted - The items, in ascending key order.
 * @param value - The key to pass.
 * @param keyOf - Reads an item's key.
 * @returns The index, or the list's length when no key is greater.
 */
export function upperBound<T>(sorted: readonly T[], value: number, keyOf: (item: T) => number): number {
  let low: number = 0;
  let high: number = sorted.length;

  while (low < high) {
    const middle: number = (low + high) >>> 1;

    if (keyOf(sorted[middle]!) <= value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}
