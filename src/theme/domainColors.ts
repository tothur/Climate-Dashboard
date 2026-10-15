/**
 * Chart colours for the dashboard's topic domains. These mirror the
 * --domain-* CSS variables in styles/observatory.css (light and dark), so a
 * single-series chart always matches its topic's cards and accents.
 *
 * Charts where the sign carries meaning use the diverging pair instead:
 * warm / loss in the temperature red, cool / gain in the ocean blue.
 */

export type ChartDomain = "temperature" | "ocean" | "ice" | "forcing";

const DOMAIN_COLORS: Record<ChartDomain, { light: string; dark: string }> = {
  temperature: { light: "#c54c40", dark: "#f28273" },
  ocean: { light: "#26769c", dark: "#7ab9dc" },
  ice: { light: "#25827d", dark: "#89cfc2" },
  forcing: { light: "#976718", dark: "#e9b75f" },
};

export function domainColor(domain: ChartDomain, dark: boolean): string {
  return dark ? DOMAIN_COLORS[domain].dark : DOMAIN_COLORS[domain].light;
}

export function domainColorAlpha(domain: ChartDomain, dark: boolean, alpha: number): string {
  const hex = domainColor(domain, dark).slice(1);
  const [red, green, blue] = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/** Diverging pair for sign-coded charts: positive warm / negative cool by default. */
export function divergingColors(dark: boolean): { warm: string; cool: string } {
  return { warm: domainColor("temperature", dark), cool: domainColor("ocean", dark) };
}
