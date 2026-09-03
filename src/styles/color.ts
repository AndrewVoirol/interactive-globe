/**
 * Indicatrix Engine — Color Science & OKLCH-to-Linear sRGB Utility Module
 * 
 * Provides analytical OKLCH color space transformations converted to Linear sRGB
 * for TypeScript calculations, GLSL fragment shaders, and WGSL compute/render shaders.
 * Conforms strictly to design-language.md Section 1.1 & 1.3.
 */

export interface RGBColor {
  r: number; // [0.0, 1.0]
  g: number; // [0.0, 1.0]
  b: number; // [0.0, 1.0]
}

/**
 * Analytical OKLCH-to-Linear sRGB conversion algorithm in TypeScript.
 * 
 * @param L Lightness [0.0, 1.0]
 * @param C Chroma [0.0, ~0.37]
 * @param hDeg Hue angle in degrees [0.0, 360.0]
 */
export function oklchToRgb(L: number, C: number, hDeg: number): RGBColor {
  const hRad = (hDeg * Math.PI) / 180.0;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return {
    r: Math.max(0.0, Math.min(1.0, r)),
    g: Math.max(0.0, Math.min(1.0, g)),
    b: Math.max(0.0, Math.min(1.0, bl)),
  };
}

/**
 * Helper to smoothstep in scalar math: smoothstep(edge0, edge1, x)
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}

/**
 * Linear RGB interpolation helper
 */
function lerpRgb(c1: RGBColor, c2: RGBColor, t: number): RGBColor {
  const clampedT = Math.max(0.0, Math.min(1.0, t));
  return {
    r: c1.r + (c2.r - c1.r) * clampedT,
    g: c1.g + (c2.g - c1.g) * clampedT,
    b: c1.b + (c2.b - c1.b) * clampedT,
  };
}

// Color constants in linear float RGB
export const COLOR_TENSION_AMBER: RGBColor = { r: 200 / 255, g: 109 / 255, b: 81 / 255 }; // #C86D51
export const COLOR_RUPTURE_CRIMSON: RGBColor = { r: 220 / 255, g: 38 / 255, b: 38 / 255 };  // #DC2626
export const COLOR_CRACK_WHITE: RGBColor = { r: 253 / 255, g: 251 / 255, b: 247 / 255 };   // #FDFBF7

export const COLOR_OCEANIC_INDIGO: RGBColor = { r: 26 / 255, g: 35 / 255, b: 58 / 255 };    // #1A233A
export const COLOR_BIOLUM_CYAN: RGBColor = { r: 56 / 255, g: 189 / 255, b: 248 / 255 };    // #38BDF8
export const COLOR_EDDY_VIOLET: RGBColor = { r: 129 / 255, g: 140 / 255, b: 248 / 255 };   // #818CF8

/**
 * Mode 2: Griffith LEFM Tensile Stress Energy Color Interpolator
 * Maps strain energy density sigma in [0.0, 1.0] -> sRGB color
 */
export function getStrainEnergyColor(strain: number, baseColor: RGBColor): RGBColor {
  if (strain <= 0.0) return baseColor;

  if (strain < 0.45) {
    const t = smoothstep(0.12, 0.45, strain);
    return lerpRgb(baseColor, COLOR_TENSION_AMBER, t);
  } else if (strain < 0.78) {
    const t = smoothstep(0.45, 0.78, strain);
    return lerpRgb(COLOR_TENSION_AMBER, COLOR_RUPTURE_CRIMSON, t);
  } else {
    const t = smoothstep(0.78, 1.0, strain);
    return lerpRgb(COLOR_RUPTURE_CRIMSON, COLOR_CRACK_WHITE, t);
  }
}

/**
 * Mode 3: Fluid Vorticity Magnitude Color Interpolator
 * Maps vorticity magnitude omega in [0.0, 1.0] -> sRGB color
 */
export function getFluidVorticityColor(vorticity: number, baseColor: RGBColor): RGBColor {
  if (vorticity <= 0.0) return baseColor;

  if (vorticity < 0.50) {
    const t = smoothstep(0.05, 0.50, vorticity);
    return lerpRgb(baseColor, COLOR_OCEANIC_INDIGO, t);
  } else if (vorticity < 0.85) {
    const t = smoothstep(0.50, 0.85, vorticity);
    return lerpRgb(COLOR_OCEANIC_INDIGO, COLOR_BIOLUM_CYAN, t);
  } else {
    const t = smoothstep(0.85, 1.0, vorticity);
    return lerpRgb(COLOR_BIOLUM_CYAN, COLOR_EDDY_VIOLET, t);
  }
}

/**
 * GLSL Analytical OKLCH-to-Linear sRGB Chunk
 */
export const OKLCH_TO_RGB_GLSL = `
vec3 oklch2rgb(vec3 c) {
    float L = c.x;
    float C = c.y;
    float hRad = c.z * 0.01745329251; // Degrees to Radians
    float a = C * cos(hRad);
    float b = C * sin(hRad);

    float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    float s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    float l = l_ * l_ * l_;
    float m = m_ * m_ * m_;
    float s = s_ * s_ * s_;

    float r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    float g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    float bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

    return clamp(vec3(r, g, bl), 0.0, 1.0);
}
`;

/**
 * WGSL Analytical OKLCH-to-Linear sRGB Chunk
 */
export const OKLCH_TO_RGB_WGSL = `
fn oklch2rgb(c: vec3<f32>) -> vec3<f32> {
    let L = c.x;
    let C = c.y;
    let hRad = c.z * 0.01745329251;
    let a = C * cos(hRad);
    let b = C * sin(hRad);

    let l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    let m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    let s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    let l = l_ * l_ * l_;
    let m = m_ * m_ * m_;
    let s = s_ * s_ * s_;

    let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    let bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

    return clamp(vec3<f32>(r, g, bl), vec3<f32>(0.0), vec3<f32>(1.0));
}
`;
