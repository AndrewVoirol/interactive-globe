// ============================================================================
// File: src/webgpu/shaders/cloud_noise_compute.wgsl
// Target: WebGPU 3D Compute Pipeline (@compute @workgroup_size(4, 4, 4))
// Description: On-boot synthesis of 128x128x128 periodic 3D Perlin-Worley cloud noise.
//
// Channel Allocation:
//   - Red:   Low-frequency Perlin-Worley billow base (3-octave Perlin dilated by Worley)
//   - Green: High-frequency Worley erosion octave 1 (period 8)
//   - Blue:  High-frequency Worley erosion octave 2 (period 16)
//   - Alpha: High-frequency Worley erosion octave 3 (period 32)
//
// Invariants:
//   - Invariant §3:  Uniform Control Flow & Explicit LOD
//   - Invariant §46: Cross-Language Math Parity with src/core/math/cloudNoiseMath.ts
//   - Invariant §48: Dynamic Texture Dimensions (via textureDimensions built-in)
// ============================================================================

@group(0) @binding(0) var noiseTexture: texture_storage_3d<rgba8unorm, write>;

// ============================================================================
// Fast Permutation-Free 3D Integer Hash (PCG3D)
// ============================================================================
fn pcg3d(p_in: vec3<u32>) -> vec3<f32> {
    var v = p_in * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v.x = v.x ^ (v.x >> 16u);
    v.y = v.y ^ (v.y >> 16u);
    v.z = v.z ^ (v.z >> 16u);
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return vec3<f32>(v) * (1.0 / 4294967296.0);
}

// Ken Perlin's C²-continuous quintic polynomial: 6t⁵ - 15t⁴ + 10t³
fn quinticFade3(t: vec3<f32>) -> vec3<f32> {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

// Normalized gradient vector on S² for periodic cell corner
fn perlinGradient(corner: vec3<u32>, period: u32) -> vec3<f32> {
    let wrapped = corner % vec3<u32>(period, period, period);
    let raw = pcg3d(wrapped);
    let grad = raw * 2.0 - 1.0;
    let len = length(grad);
    return select(grad / len, vec3<f32>(0.57735, 0.57735, 0.57735), len < 0.001);
}

// Periodic 3D Perlin Gradient Noise in [0.0, 1.0]
fn periodicPerlin3D(p: vec3<f32>, period: u32) -> f32 {
    let scaled = p * f32(period);
    let i0 = vec3<u32>(scaled);
    let f0 = fract(scaled);
    let w = quinticFade3(f0);

    let d000 = dot(perlinGradient(i0 + vec3<u32>(0u, 0u, 0u), period), f0 - vec3<f32>(0.0, 0.0, 0.0));
    let d100 = dot(perlinGradient(i0 + vec3<u32>(1u, 0u, 0u), period), f0 - vec3<f32>(1.0, 0.0, 0.0));
    let d010 = dot(perlinGradient(i0 + vec3<u32>(0u, 1u, 0u), period), f0 - vec3<f32>(0.0, 1.0, 0.0));
    let d110 = dot(perlinGradient(i0 + vec3<u32>(1u, 1u, 0u), period), f0 - vec3<f32>(1.0, 1.0, 0.0));
    let d001 = dot(perlinGradient(i0 + vec3<u32>(0u, 0u, 1u), period), f0 - vec3<f32>(0.0, 0.0, 1.0));
    let d101 = dot(perlinGradient(i0 + vec3<u32>(1u, 0u, 1u), period), f0 - vec3<f32>(1.0, 0.0, 1.0));
    let d011 = dot(perlinGradient(i0 + vec3<u32>(0u, 1u, 1u), period), f0 - vec3<f32>(0.0, 1.0, 1.0));
    let d111 = dot(perlinGradient(i0 + vec3<u32>(1u, 1u, 1u), period), f0 - vec3<f32>(1.0, 1.0, 1.0));

    let x00 = mix(d000, d100, w.x);
    let x10 = mix(d010, d110, w.x);
    let x01 = mix(d001, d101, w.x);
    let x11 = mix(d011, d111, w.x);

    let y0 = mix(x00, x10, w.y);
    let y1 = mix(x01, x11, w.y);

    let val = mix(y0, y1, w.z);
    return clamp(val * 0.9 + 0.5, 0.0, 1.0);
}

// Periodic 3D Worley Cellular Distance in [0.0, 1.0] (1.0 = center, 0.0 = edge)
fn periodicWorley3D(p: vec3<f32>, period: u32) -> f32 {
    let scaled = p * f32(period);
    let i0 = vec3<i32>(scaled);
    let f0 = fract(scaled);

    var minDistSq: f32 = 100.0;
    let p_i = i32(period);

    for (var dz: i32 = -1; dz <= 1; dz++) {
        for (var dy: i32 = -1; dy <= 1; dy++) {
            for (var dx: i32 = -1; dx <= 1; dx++) {
                let cell = i0 + vec3<i32>(dx, dy, dz);
                let wrapped = vec3<u32>(
                    u32((cell.x % p_i + p_i) % p_i),
                    u32((cell.y % p_i + p_i) % p_i),
                    u32((cell.z % p_i + p_i) % p_i)
                );
                let featureOffset = pcg3d(wrapped);
                let diff = (vec3<f32>(f32(dx), f32(dy), f32(dz)) + featureOffset) - f0;
                let distSq = dot(diff, diff);
                minDistSq = min(minDistSq, distSq);
            }
        }
    }

    let dist = sqrt(minDistSq);
    return clamp(1.0 - dist, 0.0, 1.0);
}

// Linear remap with division-by-zero protection
fn remap(value: f32, oldMin: f32, oldMax: f32, newMin: f32, newMax: f32) -> f32 {
    let denom = oldMax - oldMin;
    let safeDenom = select(denom, 0.0001, abs(denom) < 0.0001);
    let t = clamp((value - oldMin) / safeDenom, 0.0, 1.0);
    return newMin + t * (newMax - newMin);
}

@compute @workgroup_size(4, 4, 4)
fn cs_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let dims = textureDimensions(noiseTexture);
    if (any(global_id >= dims)) {
        return;
    }

    // Normalized UVW coordinates at cell center
    let p = (vec3<f32>(global_id) + vec3<f32>(0.5)) / vec3<f32>(dims);

    // Channels Green, Blue, Alpha: 3 octaves of Worley erosion (periods 8, 16, 32)
    let worley8  = periodicWorley3D(p, 8u);
    let worley16 = periodicWorley3D(p, 16u);
    let worley32 = periodicWorley3D(p, 32u);

    // Channel Red: Perlin-Worley billow base
    let perlin4  = periodicPerlin3D(p, 4u);
    let perlin8  = periodicPerlin3D(p, 8u);
    let perlin16 = periodicPerlin3D(p, 16u);
    let perlinFbm = 0.625 * perlin4 + 0.250 * perlin8 + 0.125 * perlin16;

    let worley4  = periodicWorley3D(p, 4u);
    let worleyBaseFbm = 0.625 * worley4 + 0.250 * worley8 + 0.125 * worley16;

    // Schneider Dilated Remap
    let billowThreshold = (1.0 - worleyBaseFbm) * 0.75;
    let perlinWorley = clamp(remap(perlinFbm, billowThreshold, 1.0, 0.0, 1.0) / 0.75, 0.0, 1.0);

    textureStore(noiseTexture, global_id, vec4<f32>(perlinWorley, worley8, worley16, worley32));
}
