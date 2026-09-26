const NICE_STEP_MULTIPLIERS = [1, 2, 2.5, 4, 5];
const EPSILON = 1e-6;

function isWholeMultiple(value: number, step: number): boolean {
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < EPSILON;
}

function findStep(min: number, range: number, minIntervals: number, maxIntervals: number): number | undefined {
  const startExponent = Math.floor(Math.log10(range / maxIntervals)) - 1;
  for (let exponent = startExponent; exponent <= startExponent + 3; exponent += 1) {
    for (const multiplier of NICE_STEP_MULTIPLIERS) {
      const step = multiplier * 10 ** exponent;
      const intervals = range / step;
      if (intervals > maxIntervals + EPSILON || intervals < minIntervals - EPSILON) continue;
      if (isWholeMultiple(range, step) && isWholeMultiple(min, step)) return step;
    }
  }
  return undefined;
}

/**
 * Picks a "nice" tick step that divides a fixed [min, max] axis evenly, so ECharts does not
 * add irregular labels at the bounds (e.g. -40, 0, 50, 100, 140). Returns undefined when the
 * bounds are open or no step between 3 and 10 intervals fits (4-8 preferred), leaving ECharts to choose.
 */
export function evenAxisInterval(min: number | undefined, max: number | undefined): number | undefined {
  if (typeof min !== "number" || typeof max !== "number" || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return undefined;
  }
  const range = max - min;
  return findStep(min, range, 4, 8) ?? findStep(min, range, 3, 10);
}

/** Number of decimals needed to print ticks of the given step without noise (20 → 0, 2.5 → 1, 0.25 → 2). */
export function axisStepDecimals(step: number | undefined, fallback: number): number {
  if (step == null || !Number.isFinite(step) || step <= 0) return fallback;
  for (let decimals = 0; decimals <= 4; decimals += 1) {
    if (isWholeMultiple(step * 10 ** decimals, 1)) return decimals;
  }
  return fallback;
}
