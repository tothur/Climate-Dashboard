import type { Language } from "./model";

/**
 * A probability as a whole percentage that never claims certainty: a
 * statistical estimate that rounds to 0% or 100% reads as "<1%" or ">99%".
 */
export function formatChancePercent(probability: number, language: Language): string {
  const format = new Intl.NumberFormat(language === "hu" ? "hu-HU" : "en-US", { style: "percent", maximumFractionDigits: 0 });
  if (!Number.isFinite(probability)) return "–";
  if (probability > 0.99) return `>${format.format(0.99)}`;
  if (probability < 0.01) return `<${format.format(0.01)}`;
  return format.format(probability);
}
