// ============================================================================
// File: src/core/math/float16.ts
// IEEE 754-2008 Half-Precision Float16 Encoding & Decoding
// ============================================================================

/**
 * Decode 16-bit half-precision float according to IEEE 754-2008.
 */
export function decodeFloat16(h: number): number {
  const sign = (h & 0x8000) !== 0 ? -1 : 1;
  const exp = (h & 0x7c00) >> 10;
  const frac = h & 0x03ff;

  if (exp === 0) {
    // Subnormal number or zero
    return sign * Math.pow(2, -14) * (frac / 1024);
  } else if (exp === 0x1f) {
    // Infinity or NaN
    return frac === 0 ? sign * Infinity : NaN;
  }
  // Normalized number
  return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

/**
 * Encode number to 16-bit half-precision float according to IEEE 754-2008.
 */
export function encodeFloat16(val: number): number {
  if (val === 0) return 0;
  const sign = val < 0 ? 0x8000 : 0x0000;
  const absVal = Math.abs(val);

  if (Number.isNaN(val)) return 0x7e00;
  if (!Number.isFinite(val)) return sign | 0x7c00;

  let exp = Math.floor(Math.log2(absVal));
  let frac = Math.round((absVal / Math.pow(2, exp) - 1) * 1024);

  if (frac === 1024) {
    exp += 1;
    frac = 0;
  }

  const biasedExp = exp + 15;
  if (biasedExp >= 31) {
    return sign | 0x7c00; // Overflow to infinity
  } else if (biasedExp <= 0) {
    // Subnormal
    frac = Math.round((absVal / Math.pow(2, -14)) * 1024);
    if (frac === 1024) {
      return sign | 0x0400; // Promote to smallest normal float16
    }
    return sign | (frac & 0x03ff);
  }

  return sign | ((biasedExp & 0x1f) << 10) | (frac & 0x03ff);
}
