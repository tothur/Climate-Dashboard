import type { EChartsOption } from "echarts";
import type { DailyPoint } from "../domain/model";
import { buildClimateTrendOption } from "./iliTrend";

interface BuildAuxiliaryTrendOptionArgs {
  points: DailyPoint[];
  title: string;
  unit: string;
  compact: boolean;
  dark?: boolean;
  color?: string;
}

export function displayVirusLabel(label: string): string {
  return label;
}

export function buildVirologyDetectionsOption({
  points,
  title,
  unit,
  compact,
  dark = false,
  color,
}: BuildAuxiliaryTrendOptionArgs): EChartsOption {
  return buildClimateTrendOption({
    points,
    seriesName: title,
    unit,
    compact,
    dark,
    color,
    labels: {
      noData: "No data",
      latest: "Latest",
    },
  });
}

export function buildVirologyPositivityOption(args: BuildAuxiliaryTrendOptionArgs): EChartsOption {
  return buildVirologyDetectionsOption(args);
}
