import { INFLUENZA_ALL_KEY } from "../data/adapter";

export type PathogenFamily = "influenza" | "sarscov2" | "rsv" | "hmpv" | "other";

const FAMILY_SERIES_COLORS: Record<Exclude<PathogenFamily, "other">, { light: string; dark: string }> = {
  influenza: { light: "#ec4899", dark: "#f472b6" },
  sarscov2: { light: "#2563eb", dark: "#60a5fa" },
  rsv: { light: "#14b8a6", dark: "#2dd4bf" },
  hmpv: { light: "#f97316", dark: "#fb923c" },
};

const OTHER_SERIES_COLORS = {
  light: ["#8b5cf6", "#0ea5e9", "#ef4444", "#84cc16", "#f59e0b"],
  dark: ["#a78bfa", "#38bdf8", "#f87171", "#a3e635", "#fbbf24"],
};

function hashKey(value: string): number {
  let hash = 0;
  for (let idx = 0; idx < value.length; idx += 1) {
    hash = (hash * 31 + value.charCodeAt(idx)) >>> 0;
  }
  return hash;
}

export function resolvePathogenFamily(virus: string | null | undefined): PathogenFamily {
  const normalized = String(virus ?? "").trim().toLowerCase();
  if (!normalized) return "other";
  if (
    normalized === INFLUENZA_ALL_KEY.toLowerCase() ||
    normalized.includes("influenza") ||
    normalized.includes("flu-like") ||
    normalized.startsWith("ili")
  ) {
    return "influenza";
  }
  if (normalized.includes("sars") || normalized.includes("cov")) return "sarscov2";
  if (/\brsv\b/.test(normalized)) return "rsv";
  if (normalized.includes("hmpv") || normalized.includes("metapneumo")) return "hmpv";
  return "other";
}

export function pathogenSeriesColor(virus: string | null | undefined, dark = false): string {
  const family = resolvePathogenFamily(virus);
  if (family !== "other") {
    const palette = FAMILY_SERIES_COLORS[family];
    return dark ? palette.dark : palette.light;
  }
  const fallback = dark ? OTHER_SERIES_COLORS.dark : OTHER_SERIES_COLORS.light;
  const key = String(virus ?? "").trim() || "other";
  return fallback[hashKey(key) % fallback.length];
}

export function pathogenClassName(virus: string | null | undefined): `pathogen-${PathogenFamily}` {
  return `pathogen-${resolvePathogenFamily(virus)}`;
}
