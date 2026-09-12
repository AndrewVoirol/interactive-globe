/**
 * ArchivalPigmentation.ts
 *
 * Canonical weather pigmentation and spectral Doppler radar optical mode formulations
 * for the Indicatrix Engine (crust_hydrosphere.wgsl).
 *
 * Architecture Invariants:
 * - Invariant §28: Exhaustive Multi-Medium Shader Parity (Zero Theme Collapsing)
 *   Theme 0: Marie Tharp 1977 — Lithographic stipple ink
 *   Theme 1: Cream Rag — Warm sepia-charcoal wash modulated by paper tooth
 *   Theme 2: Prussian Cyanotype 1842 — Actinic solarization to deep Prussian blue
 */

/**
 * 2D pseudo-random hash function matching WGSL hashPaper2D.
 */
export function hashPaper2D(px: number | [number, number], py?: number): number {
  let x: number, y: number;
  if (Array.isArray(px)) {
    x = px[0];
    y = px[1];
  } else {
    x = px;
    y = py ?? 0;
  }
  const dot = x * 127.1 + y * 311.7;
  const s = Math.sin(dot) * 43758.5453123;
  return s - Math.floor(s);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Evaluates archival cartographic weather pigmentation for historical drafting mediums.
 *
 * @param precipRate - Precipitation intensity in mm/hr
 * @param theme - Cartographic medium (0: Marie Tharp, 1: Cream Rag, 2: Prussian Cyanotype)
 * @param mediumProps - Physical medium properties [inkAbsorption, fiberDensity/tooth, exposureGamma, stippleDensity]
 * @param baseColor - Underlying substrate color [r, g, b, a]
 * @returns RGBA pigmentation color [r, g, b, a]
 */
export function apply_weather_pigmentation(
  precipRate: number,
  theme: number,
  mediumProps: [number, number, number, number] = [0.8, 1.0, 1.0, 1.0],
  baseColor: [number, number, number, number] = [0.0, 0.0, 0.0, 1.0]
): [number, number, number, number] {
  const intensity = clamp(precipRate / 50.0, 0.0, 1.0);
  if (intensity <= 0.001) {
    return [0.0, 0.0, 0.0, 0.0];
  }

  if (theme === 0) {
    // Theme 0: Marie Tharp 1977 — Lithographic stipple density modulated by precipRate
    const stippleProb = clamp(intensity * 0.85 * Math.max(0.1, mediumProps[3]), 0.05, 0.95);
    const hashSeedX = baseColor[0] * 1337.1 + baseColor[2] * 3141.5;
    const hashSeedY = baseColor[1] * 2718.2 + precipRate * 42.0;
    const rng = hashPaper2D(hashSeedX, hashSeedY);
    const hasDot = rng < stippleProb ? 1.0 : 0.0;
    const alpha = clamp(hasDot * intensity * 0.65 + intensity * 0.15, 0.0, 0.85);
    const cTharpIndigo: [number, number, number] = [0.118, 0.161, 0.231];
    return [cTharpIndigo[0], cTharpIndigo[1], cTharpIndigo[2], alpha];
  } else if (theme === 1) {
    // Theme 1: Cream Rag — Warm sepia-charcoal wash modulated by paper tooth (mediumProps.y)
    const paperTooth = mediumProps[1];
    const toothSeedX = baseColor[1] * 1920.0 * Math.max(0.1, paperTooth);
    const toothSeedY = baseColor[0] * 1080.0 * Math.max(0.1, paperTooth);
    const toothNoise = (hashPaper2D(toothSeedX, toothSeedY) - 0.5) * 0.35;
    const toothFactor = clamp(paperTooth * (1.0 + toothNoise), 0.5, 1.5);
    const alpha = clamp(intensity * 0.6 * toothFactor, 0.0, 0.90);
    return [0.220, 0.188, 0.165, alpha];
  } else if (theme === 2) {
    // Theme 2: Prussian Cyanotype 1842 — Actinic solarization to deep Prussian blue
    const gamma = Math.max(0.1, mediumProps[2]);
    const solarizedIntensity = Math.pow(intensity, 1.0 / gamma);
    const alpha = clamp(solarizedIntensity * 0.8, 0.0, 0.95);
    return [0.039, 0.098, 0.184, alpha];
  } else {
    // Defensive fallback for non-standard theme
    return [0.220, 0.188, 0.165, intensity * 0.6];
  }
}

export const applyWeatherPigmentation = apply_weather_pigmentation;

/**
 * Samples modern meteorological spectral Doppler radar color palette.
 *
 * @param precipRate - Precipitation intensity in mm/hr
 * @returns RGBA Doppler color [r, g, b, a]
 */
export function sample_spectral_doppler(precipRate: number): [number, number, number, number] {
  if (precipRate < 0.1) {
    return [0.0, 0.0, 0.0, 0.0];
  }

  const cLightBlue: [number, number, number] = [0.25, 0.60, 1.00];
  const cGreen: [number, number, number]     = [0.00, 0.78, 0.20];
  const cYellow: [number, number, number]    = [1.00, 0.85, 0.00];
  const cOrange: [number, number, number]    = [1.00, 0.47, 0.00];
  const cRed: [number, number, number]       = [0.90, 0.00, 0.00];
  const cMagenta: [number, number, number]   = [0.78, 0.00, 0.78];

  let color: [number, number, number];
  let alpha = 0.75;

  const mix3 = (c1: [number, number, number], c2: [number, number, number], t: number): [number, number, number] => [
    c1[0] * (1.0 - t) + c2[0] * t,
    c1[1] * (1.0 - t) + c2[1] * t,
    c1[2] * (1.0 - t) + c2[2] * t,
  ];

  if (precipRate < 1.0) {
    const t = (precipRate - 0.1) / 0.9;
    color = mix3([cLightBlue[0] * 0.8, cLightBlue[1] * 0.8, cLightBlue[2] * 0.8], cLightBlue, t);
    alpha = 0.40 * (1.0 - t) + 0.65 * t;
  } else if (precipRate < 2.5) {
    const t = (precipRate - 1.0) / 1.5;
    color = mix3(cLightBlue, cGreen, t);
    alpha = 0.65 * (1.0 - t) + 0.75 * t;
  } else if (precipRate < 7.5) {
    const t = (precipRate - 2.5) / 5.0;
    color = mix3(cGreen, cYellow, t);
    alpha = 0.75 * (1.0 - t) + 0.80 * t;
  } else if (precipRate < 15.0) {
    const t = (precipRate - 7.5) / 7.5;
    color = mix3(cYellow, cOrange, t);
    alpha = 0.80 * (1.0 - t) + 0.85 * t;
  } else if (precipRate < 30.0) {
    const t = (precipRate - 15.0) / 15.0;
    color = mix3(cOrange, cRed, t);
    alpha = 0.85 * (1.0 - t) + 0.90 * t;
  } else {
    const t = clamp((precipRate - 30.0) / 20.0, 0.0, 1.0);
    color = mix3(cRed, cMagenta, t);
    alpha = 0.90 * (1.0 - t) + 0.95 * t;
  }

  return [color[0], color[1], color[2], alpha];
}

export const sampleSpectralDoppler = sample_spectral_doppler;
