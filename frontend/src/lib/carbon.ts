// Grid carbon intensity estimate from the transmission-connected fuel mix.
// Factors are operational (stack) emissions in gCO2/kWh. Gas uses ~450 g/kWh, a typical
// blended value for Ontario's mix of combined-cycle and peaking plants. Nuclear, hydro, wind
// and solar have ~0 operational emissions. Biofuel is treated as biogenic (0) by convention.
// This is an estimate for consumer context, not an official IESO figure.

export const EMISSION_FACTORS_G_PER_KWH: Record<string, number> = {
  GAS: 450,
  NUCLEAR: 0,
  HYDRO: 0,
  WIND: 0,
  SOLAR: 0,
  BIOFUEL: 0,
  OTHER: 0,
};

export const CLEAN_FUELS = new Set(['NUCLEAR', 'HYDRO', 'WIND', 'SOLAR']);

export interface FuelOutput {
  fuel_type: string;
  output_mw: number;
}

export interface CarbonSummary {
  /** Estimated grams of CO2 per kWh generated */
  intensity: number;
  /** Share of output from nuclear, hydro, wind and solar (0-100) */
  cleanPercent: number;
  totalMw: number;
}

export const computeCarbon = (mix: FuelOutput[]): CarbonSummary => {
  const totalMw = mix.reduce((sum, f) => sum + Math.max(0, f.output_mw), 0);
  if (totalMw <= 0) return { intensity: 0, cleanPercent: 0, totalMw: 0 };

  const weighted = mix.reduce(
    (sum, f) => sum + Math.max(0, f.output_mw) * (EMISSION_FACTORS_G_PER_KWH[f.fuel_type] ?? 0),
    0,
  );
  const clean = mix
    .filter((f) => CLEAN_FUELS.has(f.fuel_type))
    .reduce((sum, f) => sum + Math.max(0, f.output_mw), 0);

  return {
    intensity: weighted / totalMw,
    cleanPercent: (clean / totalMw) * 100,
    totalMw,
  };
};
