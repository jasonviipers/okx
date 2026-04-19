/**
 * Clamps a number between a minimum and maximum value (inclusive).
 *
 * @param value - The number to clamp.
 * @param min - The lower bound.
 * @param max - The upper bound.
 * @returns The clamped value.
 *
 * @example
 * clamp(5, 0, 3)  // → 3
 * clamp(-1, 0, 1) // → 0
 * clamp(0.5, 0, 1) // → 0.5
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Clamps a number to the [0, 1] range.
 * Shorthand for `clamp(value, 0, 1)`.
 *
 * @param value - The number to clamp.
 * @returns A value in [0, 1].
 *
 * @example
 * clamp01(1.5) // → 1
 * clamp01(-0.2) // → 0
 * clamp01(0.7) // → 0.7
 */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * Computes the arithmetic mean of an array of numbers.
 * Returns `0` for an empty array to avoid division-by-zero.
 *
 * @param values - The numbers to average.
 * @returns The mean, or `0` if the array is empty.
 *
 * @example
 * average([1, 2, 3]) // → 2
 * average([])        // → 0
 */
export function average(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

/**
 * Computes the sum of an array of numbers.
 * Returns `0` for an empty array.
 *
 * @param values - The numbers to sum.
 * @returns The total.
 *
 * @example
 * sum([1, 2, 3]) // → 6
 * sum([])        // → 0
 */
export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
