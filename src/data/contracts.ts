import { z } from "zod";

export const DailyPointSchema = z
  .object({
    date: z.string(),
    value: z.coerce.number(),
  })
  .passthrough();

export const ClimateMetricSourceSchema = z
  .object({
    shortName: z.string(),
    descriptionEn: z.string(),
    descriptionHu: z.string(),
    url: z.string(),
  })
  .passthrough();

export const ClimateReanalyzerYearSeriesSchema = z
  .object({
    name: z.union([z.string(), z.number()]),
    data: z.array(z.union([z.number(), z.string(), z.null()])).optional(),
  })
  .passthrough();

export const ClimateReanalyzerPayloadSchema = z.array(ClimateReanalyzerYearSeriesSchema);

export const RuntimeLoadResultSchema = z
  .object({
    sourceMode: z.union([z.literal("live"), z.literal("mixed"), z.literal("bundled")]),
    warnings: z.array(z.string()).default([]),
    updatedAtIso: z.string(),
  })
  .passthrough();

export type DailyPointContract = z.infer<typeof DailyPointSchema>;
export type ClimateReanalyzerPayloadContract = z.infer<typeof ClimateReanalyzerPayloadSchema>;
