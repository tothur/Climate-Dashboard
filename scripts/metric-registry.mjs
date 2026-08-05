const VALIDATION_RULES = {
  global_surface_temperature: {
    minValue: 5,
    maxValue: 40,
    maxAgeDays: 20,
    minPoints: 20_000,
    minPointsLastYear: 300,
  },
  global_sea_surface_temperature: {
    minValue: 10,
    maxValue: 40,
    maxAgeDays: 10,
    minPoints: 8_000,
    minPointsLastYear: 250,
  },
  global_mean_sea_level: {
    minValue: -200,
    maxValue: 300,
    maxAgeDays: 450,
    minPoints: 300,
    minPointsLastYear: 0,
  },
  ocean_heat_content: {
    minValue: -50,
    maxValue: 120,
    maxAgeDays: 900,
    minPoints: 70,
    minPointsLastYear: 0,
  },
  earth_energy_imbalance: {
    minValue: -20,
    maxValue: 20,
    maxAgeDays: 220,
    minPoints: 250,
    minPointsLastYear: 6,
  },
  incoming_solar_energy: {
    minValue: 1358,
    maxValue: 1364,
    maxAgeDays: 220,
    minPoints: 250,
    minPointsLastYear: 6,
  },
  global_glacier_mass_balance: {
    minValue: -1200,
    maxValue: 250,
    maxAgeDays: 1600,
    minPoints: 30,
    minPointsLastYear: 0,
  },
  mountain_glacier_mass_balance: {
    minValue: -4,
    maxValue: 2,
    maxAgeDays: 1600,
    minPoints: 30,
    minPointsLastYear: 0,
  },
  antarctic_ice_sheet_mass_balance: {
    minValue: 0,
    maxValue: 4000,
    maxAgeDays: 430,
    minPoints: 200,
    minPointsLastYear: 8,
  },
  west_antarctic_ice_sheet_mass_balance: {
    minValue: 0,
    maxValue: 4000,
    maxAgeDays: 3200,
    minPoints: 200,
    minPointsLastYear: 0,
  },
  greenland_ice_sheet_mass_balance: {
    minValue: 0,
    maxValue: 7000,
    maxAgeDays: 430,
    minPoints: 200,
    minPointsLastYear: 8,
  },
  northern_hemisphere_surface_temperature: {
    minValue: -20,
    maxValue: 40,
    maxAgeDays: 20,
    minPoints: 20_000,
    minPointsLastYear: 300,
  },
  southern_hemisphere_surface_temperature: {
    minValue: -20,
    maxValue: 35,
    maxAgeDays: 20,
    minPoints: 20_000,
    minPointsLastYear: 300,
  },
  arctic_surface_temperature: {
    minValue: -70,
    maxValue: 25,
    maxAgeDays: 20,
    minPoints: 20_000,
    minPointsLastYear: 300,
  },
  antarctic_surface_temperature: {
    minValue: -80,
    maxValue: 25,
    maxAgeDays: 20,
    minPoints: 20_000,
    minPointsLastYear: 300,
  },
  north_atlantic_sea_surface_temperature: {
    minValue: -5,
    maxValue: 40,
    maxAgeDays: 10,
    minPoints: 8_000,
    minPointsLastYear: 250,
  },
  daily_nino34_sea_surface_temperature: {
    minValue: 15,
    maxValue: 35,
    maxAgeDays: 10,
    minPoints: 8_000,
    minPointsLastYear: 250,
  },
  global_surface_temperature_anomaly: {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 20,
    minPoints: 20_000,
    minPointsLastYear: 300,
  },
  global_sea_surface_temperature_anomaly: {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 10,
    minPoints: 8_000,
    minPointsLastYear: 250,
  },
  northern_hemisphere_surface_temperature_anomaly: {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 20,
    minPoints: 20_000,
    minPointsLastYear: 300,
  },
  southern_hemisphere_surface_temperature_anomaly: {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 20,
    minPoints: 20_000,
    minPointsLastYear: 300,
  },
  arctic_surface_temperature_anomaly: {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 20,
    minPoints: 20_000,
    minPointsLastYear: 300,
  },
  antarctic_surface_temperature_anomaly: {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 20,
    minPoints: 20_000,
    minPointsLastYear: 300,
  },
  north_atlantic_sea_surface_temperature_anomaly: {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 10,
    minPoints: 8_000,
    minPointsLastYear: 250,
  },
  daily_global_mean_temperature_anomaly: {
    minValue: -10,
    maxValue: 10,
    maxAgeDays: 20,
    minPoints: 30_000,
    minPointsLastYear: 300,
  },
  global_sea_ice_extent: {
    minValue: 0,
    maxValue: 60,
    maxAgeDays: 20,
    minPoints: 8_000,
    minPointsLastYear: 300,
  },
  arctic_sea_ice_extent: {
    minValue: 0,
    maxValue: 30,
    maxAgeDays: 20,
    minPoints: 8_000,
    minPointsLastYear: 300,
  },
  antarctic_sea_ice_extent: {
    minValue: 0,
    maxValue: 35,
    maxAgeDays: 20,
    minPoints: 8_000,
    minPointsLastYear: 300,
  },
  northern_hemisphere_snow_cover_extent: {
    minValue: 0,
    maxValue: 60,
    maxAgeDays: 120,
    minPoints: 600,
    minPointsLastYear: 10,
  },
  atmospheric_co2: {
    minValue: 200,
    maxValue: 700,
    maxAgeDays: 120,
    minPoints: 8_000,
    minPointsLastYear: 120,
  },
  atmospheric_ch4: {
    minValue: 1000,
    maxValue: 3000,
    maxAgeDays: 220,
    minPoints: 400,
    minPointsLastYear: 6,
  },
  atmospheric_n2o: {
    minValue: 200,
    maxValue: 500,
    maxAgeDays: 220,
    minPoints: 200,
    minPointsLastYear: 6,
  },
  atmospheric_aggi: {
    minValue: 0.5,
    maxValue: 3.5,
    maxAgeDays: 1000,
    minPoints: 30,
    minPointsLastYear: 0,
  },
  nino34_index: {
    minValue: -4,
    maxValue: 4,
    maxAgeDays: 220,
    minPoints: 800,
    minPointsLastYear: 6,
  },
  nao_index: {
    minValue: -8,
    maxValue: 8,
    maxAgeDays: 220,
    minPoints: 800,
    minPointsLastYear: 6,
  },
  pna_index: {
    minValue: -8,
    maxValue: 8,
    maxAgeDays: 220,
    minPoints: 800,
    minPointsLastYear: 6,
  },
  soi_index: {
    minValue: -8,
    maxValue: 8,
    maxAgeDays: 220,
    minPoints: 800,
    minPointsLastYear: 6,
  },
  arctic_oscillation_index: {
    minValue: -8,
    maxValue: 8,
    maxAgeDays: 220,
    minPoints: 800,
    minPointsLastYear: 6,
  },
};

const LATEST_SNAPSHOT_FIELDS = {
  global_surface_temperature: { label: "Global Surface Temperature", unit: "°C" },
  global_sea_surface_temperature: { label: "Global Sea Surface Temperature", unit: "°C" },
  global_mean_sea_level: { label: "Global Mean Sea Level", unit: "mm" },
  ocean_heat_content: { label: "Ocean Heat Content (0-2000m)", unit: "10^22 J" },
  earth_energy_imbalance: { label: "Earth Energy Imbalance", unit: "W/m2" },
  global_glacier_mass_balance: { label: "Global Glacier Mass Balance", unit: "Gt" },
  antarctic_ice_sheet_mass_balance: { label: "Antarctic Ice Sheet Mass Loss", unit: "Gt" },
  greenland_ice_sheet_mass_balance: { label: "Greenland Ice Sheet Mass Loss", unit: "Gt" },
  northern_hemisphere_surface_temperature: { label: "Northern Hemisphere Surface Temperature", unit: "°C" },
  southern_hemisphere_surface_temperature: { label: "Southern Hemisphere Surface Temperature", unit: "°C" },
  arctic_surface_temperature: { label: "Arctic Surface Temperature", unit: "°C" },
  antarctic_surface_temperature: { label: "Antarctic Surface Temperature", unit: "°C" },
  north_atlantic_sea_surface_temperature: { label: "North Atlantic Sea Surface Temperature", unit: "°C" },
  daily_nino34_sea_surface_temperature: { label: "Daily Sea Surface Temperature, Niño 3.4", unit: "°C" },
  global_surface_temperature_anomaly: { label: "Global Surface Temperature Anomaly", unit: "°C" },
  global_sea_surface_temperature_anomaly: { label: "Global Sea Surface Temperature Anomaly", unit: "°C" },
  northern_hemisphere_surface_temperature_anomaly: { label: "Northern Hemisphere Surface Temperature Anomaly", unit: "°C" },
  southern_hemisphere_surface_temperature_anomaly: { label: "Southern Hemisphere Surface Temperature Anomaly", unit: "°C" },
  arctic_surface_temperature_anomaly: { label: "Arctic Surface Temperature Anomaly", unit: "°C" },
  antarctic_surface_temperature_anomaly: { label: "Antarctic Surface Temperature Anomaly", unit: "°C" },
  north_atlantic_sea_surface_temperature_anomaly: { label: "North Atlantic Sea Surface Temperature Anomaly", unit: "°C" },
  daily_global_mean_temperature_anomaly: { label: "Daily Global Mean Temperature Anomaly", unit: "°C" },
  global_sea_ice_extent: { label: "Global Sea Ice Extent", unit: "million km²" },
  arctic_sea_ice_extent: { label: "Arctic Sea Ice Extent", unit: "million km²" },
  antarctic_sea_ice_extent: { label: "Antarctic Sea Ice Extent", unit: "million km²" },
  northern_hemisphere_snow_cover_extent: { label: "Northern Hemisphere Snow Cover Extent", unit: "million km²" },
  atmospheric_co2: { label: "Atmospheric CO2 (Mauna Loa)", unit: "ppm" },
  atmospheric_ch4: { label: "Atmospheric CH4 (Global)", unit: "ppb" },
  atmospheric_n2o: { label: "Atmospheric N2O (Global)", unit: "ppb" },
  atmospheric_aggi: { label: "NOAA Annual Greenhouse Gas Index", unit: "index" },
};

export const METRIC_REGISTRY = Object.freeze(
  Object.fromEntries(
    Object.entries(VALIDATION_RULES).map(([key, validation]) => [
      key,
      Object.freeze({
        validation: Object.freeze({ ...validation }),
        latestSnapshot: LATEST_SNAPSHOT_FIELDS[key]
          ? Object.freeze({ ...LATEST_SNAPSHOT_FIELDS[key] })
          : null,
      }),
    ])
  )
);

export const METRIC_KEYS = Object.freeze(Object.keys(METRIC_REGISTRY));

export const SERIES_RULES = Object.freeze(
  Object.fromEntries(METRIC_KEYS.map((key) => [key, METRIC_REGISTRY[key].validation]))
);

export const LATEST_SNAPSHOT_METRICS = Object.freeze(
  Object.fromEntries(
    METRIC_KEYS.filter((key) => METRIC_REGISTRY[key].latestSnapshot).map((key) => [
      key,
      METRIC_REGISTRY[key].latestSnapshot,
    ])
  )
);

export function metricSanitizeLimits(key) {
  const validation = METRIC_REGISTRY[key]?.validation;
  if (!validation) throw new Error(`Unknown climate metric key: ${key}`);
  return {
    minValue: validation.minValue,
    maxValue: validation.maxValue,
    maxAgeDays: validation.maxAgeDays,
  };
}
