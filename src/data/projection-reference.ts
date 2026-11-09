/**
 * Published reference values the Projections page draws: the CMIP7 ScenarioMIP
 * warming pathways and the Armstrong McKay et al. (2022) tipping thresholds.
 */

export interface LongRangeScenarioDefinition {
  key: "high" | "medium" | "mediumLow" | "low";
  labelEn: string;
  labelHu: string;
  shortLabel: string;
  anchors: Array<[number, number]>;
  colorLight: string;
  colorDark: string;
}

export interface TippingPointDefinition {
  key: string;
  labelEn: string;
  labelHu: string;
  categoryEn: string;
  categoryHu: string;
  centralThreshold: number;
  minThreshold: number;
  maxThreshold: number;
}

export const CMIP7_SCENARIOMIP_TEMPERATURE_SOURCE_URL = "https://gmd.copernicus.org/articles/19/2627/2026/";
export const MCKAY_TIPPING_POINTS_SOURCE_URL = "https://www.science.org/doi/10.1126/science.abn7950";
export const CMIP7_SCENARIOMIP_SCENARIOS: LongRangeScenarioDefinition[] = [
  {
    key: "high",
    labelEn: "High",
    labelHu: "Magas",
    shortLabel: "H",
    anchors: [
      [2025, 1.55],
      [2030, 1.65],
      [2040, 1.95],
      [2050, 2.25],
      [2060, 2.55],
      [2070, 2.85],
      [2080, 3.1],
      [2090, 3.3],
      [2100, 3.5],
    ],
    colorLight: "#b8392d",
    colorDark: "#f28273",
  },
  {
    key: "medium",
    labelEn: "Medium",
    labelHu: "Közepes",
    shortLabel: "M",
    anchors: [
      [2025, 1.55],
      [2030, 1.62],
      [2040, 1.82],
      [2050, 2.05],
      [2060, 2.25],
      [2070, 2.43],
      [2080, 2.58],
      [2090, 2.68],
      [2100, 2.75],
    ],
    colorLight: "#d0764a",
    colorDark: "#f2a77f",
  },
  {
    key: "mediumLow",
    labelEn: "Medium-Low",
    labelHu: "Közepesen alacsony",
    shortLabel: "ML",
    anchors: [
      [2025, 1.55],
      [2030, 1.61],
      [2040, 1.78],
      [2050, 1.93],
      [2060, 2.02],
      [2070, 2.08],
      [2080, 2.12],
      [2090, 2.12],
      [2100, 2.1],
    ],
    colorLight: "#a8781f",
    colorDark: "#e9b75f",
  },
  {
    key: "low",
    labelEn: "Low",
    labelHu: "Alacsony",
    shortLabel: "L",
    anchors: [
      [2025, 1.55],
      [2030, 1.6],
      [2040, 1.72],
      [2050, 1.82],
      [2060, 1.86],
      [2070, 1.86],
      [2080, 1.83],
      [2090, 1.78],
      [2100, 1.74],
    ],
    colorLight: "#25827d",
    colorDark: "#89cfc2",
  },
];

export const MCKAY_TIPPING_POINTS: TippingPointDefinition[] = [
  {
    key: "greenland-ice-sheet",
    labelEn: "Greenland Ice Sheet collapse",
    labelHu: "A grönlandi jégtakaró összeomlása",
    categoryEn: "Ice sheet",
    categoryHu: "Jégtakaró",
    centralThreshold: 1.5,
    minThreshold: 0.8,
    maxThreshold: 3,
  },
  {
    key: "west-antarctic-ice-sheet",
    labelEn: "West Antarctic Ice Sheet collapse",
    labelHu: "A nyugat-antarktiszi jégtakaró összeomlása",
    categoryEn: "Ice sheet",
    categoryHu: "Jégtakaró",
    centralThreshold: 1.5,
    minThreshold: 1,
    maxThreshold: 3,
  },
  {
    key: "coral-reefs",
    labelEn: "Low-latitude coral reef die-off",
    labelHu: "A trópusi korallzátonyok pusztulása",
    categoryEn: "Ecosystem",
    categoryHu: "Ökoszisztéma",
    centralThreshold: 1.5,
    minThreshold: 1,
    maxThreshold: 2,
  },
  {
    key: "abrupt-permafrost-thaw",
    labelEn: "Boreal permafrost abrupt thaw",
    labelHu: "A boreális permafroszt hirtelen olvadása",
    categoryEn: "Permafrost",
    categoryHu: "Permafroszt",
    centralThreshold: 1.5,
    minThreshold: 1,
    maxThreshold: 2.3,
  },
  {
    key: "barents-sea-ice",
    labelEn: "Barents Sea ice abrupt loss",
    labelHu: "A Barents-tenger jegének hirtelen eltűnése",
    categoryEn: "Sea ice",
    categoryHu: "Tengeri jég",
    centralThreshold: 1.6,
    minThreshold: 1.5,
    maxThreshold: 1.7,
  },
  {
    key: "labrador-irminger-convection",
    labelEn: "Labrador-Irminger Seas convection collapse",
    labelHu: "A Labrador- és Irminger-tengeri konvekció összeomlása",
    categoryEn: "Ocean circulation",
    categoryHu: "Óceáni cirkuláció",
    centralThreshold: 1.8,
    minThreshold: 1.1,
    maxThreshold: 3.8,
  },
  {
    key: "mountain-glaciers",
    labelEn: "Mountain glacier loss",
    labelHu: "A hegyi gleccserek eltűnése",
    categoryEn: "Glaciers",
    categoryHu: "Gleccserek",
    centralThreshold: 2,
    minThreshold: 1.5,
    maxThreshold: 3,
  },
  {
    key: "sahel-greening",
    labelEn: "Sahel and West African monsoon greening",
    labelHu: "A Száhel és a nyugat-afrikai monszunvidék kizöldülése",
    categoryEn: "Monsoon",
    categoryHu: "Monszun",
    centralThreshold: 2.8,
    minThreshold: 2,
    maxThreshold: 3.5,
  },
  {
    key: "east-antarctic-subglacial-basins",
    labelEn: "East Antarctic subglacial basins collapse",
    labelHu: "A kelet-antarktiszi szubglaciális medencék összeomlása",
    categoryEn: "Ice sheet",
    categoryHu: "Jégtakaró",
    centralThreshold: 3,
    minThreshold: 2,
    maxThreshold: 6,
  },
  {
    key: "amazon-rainforest",
    labelEn: "Amazon rainforest dieback",
    labelHu: "Az amazóniai esőerdő pusztulása",
    categoryEn: "Ecosystem",
    categoryHu: "Ökoszisztéma",
    centralThreshold: 3.5,
    minThreshold: 2,
    maxThreshold: 6,
  },
  {
    key: "boreal-permafrost-collapse",
    labelEn: "Boreal permafrost collapse",
    labelHu: "A boreális permafroszt összeomlása",
    categoryEn: "Permafrost",
    categoryHu: "Permafroszt",
    centralThreshold: 4,
    minThreshold: 3,
    maxThreshold: 6,
  },
  {
    key: "amoc",
    labelEn: "Atlantic Meridional Overturning Circulation collapse",
    labelHu: "Az atlanti átfordító áramlás (AMOC) összeomlása",
    categoryEn: "Ocean circulation",
    categoryHu: "Óceáni cirkuláció",
    centralThreshold: 4,
    minThreshold: 1.4,
    maxThreshold: 8,
  },
  {
    key: "boreal-forest-south",
    labelEn: "Boreal forest southern dieback",
    labelHu: "A boreális erdők déli peremének pusztulása",
    categoryEn: "Ecosystem",
    categoryHu: "Ökoszisztéma",
    centralThreshold: 4,
    minThreshold: 1.4,
    maxThreshold: 5,
  },
  {
    key: "boreal-forest-north",
    labelEn: "Boreal forest northern expansion",
    labelHu: "A boreális erdők északi terjeszkedése",
    categoryEn: "Ecosystem",
    categoryHu: "Ökoszisztéma",
    centralThreshold: 4,
    minThreshold: 1.5,
    maxThreshold: 7.2,
  },
  {
    key: "arctic-winter-sea-ice",
    labelEn: "Arctic winter sea ice collapse",
    labelHu: "Az arktiszi téli tengeri jég eltűnése",
    categoryEn: "Sea ice",
    categoryHu: "Tengeri jég",
    centralThreshold: 6.3,
    minThreshold: 4.5,
    maxThreshold: 8.7,
  },
  {
    key: "east-antarctic-ice-sheet",
    labelEn: "East Antarctic Ice Sheet collapse",
    labelHu: "A kelet-antarktiszi jégtakaró összeomlása",
    categoryEn: "Ice sheet",
    categoryHu: "Jégtakaró",
    centralThreshold: 7.5,
    minThreshold: 5,
    maxThreshold: 10,
  },
];
