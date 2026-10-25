/**
 * Python-style modulo: the result is always in 0..modulus-1.
 * @param value - The number to wrap.
 * @param modulus - The wrap-around size, 12 by default.
 * @returns The wrapped value.
 */
export function mod(value: number, modulus: number = 12): number {
  return ((value % modulus) + modulus) % modulus;
}

/**
 * Ascending numeric comparator for `Array.prototype.sort`.
 * @param left - First number.
 * @param right - Second number.
 * @returns Negative when `left` sorts first.
 */
export function ascending(left: number, right: number): number {
  return left - right;
}

/**
 * Add up numbers.
 * @param values - The numbers.
 * @returns Their total, 0 when empty.
 */
export function sum(values: readonly number[]): number {
  return values.reduce((total: number, value: number): number => total + value, 0);
}

/**
 * Largest of the numbers. Reduces rather than spreading, so long lists cannot overflow the stack.
 * @param values - The numbers.
 * @returns The maximum, or -Infinity when empty.
 */
export function maxOf(values: readonly number[]): number {
  return values.reduce((largest: number, value: number): number => Math.max(largest, value), -Infinity);
}

/**
 * Smallest of the numbers. Reduces rather than spreading, so long lists cannot overflow the stack.
 * @param values - The numbers.
 * @returns The minimum, or Infinity when empty.
 */
export function minOf(values: readonly number[]): number {
  return values.reduce((smallest: number, value: number): number => Math.min(smallest, value), Infinity);
}

/**
 * Pearson correlation of two equal-length series.
 * @param firstSeries - First series.
 * @param secondSeries - Second series.
 * @returns The correlation, or 0 when either series is flat.
 * @throws When the series differ in length.
 */
export function pearson(firstSeries: readonly number[], secondSeries: readonly number[]): number {
  if (firstSeries.length !== secondSeries.length) {
    throw new Error("Series must be the same length");
  }

  const meanFirst: number = sum(firstSeries) / firstSeries.length;
  const meanSecond: number = sum(secondSeries) / secondSeries.length;

  let covariance: number = 0;
  let spreadFirst: number = 0;
  let spreadSecond: number = 0;

  firstSeries.forEach((firstValue: number, index: number): void => {
    const secondValue: number = secondSeries[index] ?? 0;

    covariance += (firstValue - meanFirst) * (secondValue - meanSecond);
    spreadFirst += (firstValue - meanFirst) ** 2;
    spreadSecond += (secondValue - meanSecond) ** 2;
  });

  const spread: number = Math.sqrt(spreadFirst * spreadSecond);

  return spread > 0 ? covariance / spread : 0;
}
