// ============================================================================
// File: src/webgpu/shaders/horizon_occlusion.wgsl
// Target: WebGPU Horizon Occlusion Compute Pass
// Architecture: Milestone Section 2: Directional Horizon & Canyon Self-Shadowing
// Mathematical Foundations:
//   - Section 2.2: Dynamic Horizon Angle Elevation Mapping
//     tan(theta_max(x)) = max_{s in (0, s_max]} (h(x + s * l_xy) - h(x)) / s
//   - Section 2.2: Soft Penumbra Filtering via Sun Angular Diameter (delta_sun ~ 0.53 deg)
//     S_terrain(x) = min_{s in (0, s_max]} clamp((tan(theta_sun) - (h(x + s * l_xy) - h(x)) / s) / (k_softness * tan(delta_sun)), 0.0, 1.0)
//   - Section 2.4: 32-Byte TerrainShadowUniforms
//   - Invariant §18 & Rule 8: Spherical metric arc-length and geoid elevation decoding
// ============================================================================

struct TerrainShadowUniforms {
    u_sunAzimuth: f32,             // offset 0  (radians, [0, 2*PI])
    u_sunAltitude: f32,            // offset 4  (radians, [0, PI/2])
    u_maxRayDistanceMeters: f32,   // offset 8  (e.g. 50,000.0 m max shadow reach)
    u_penumbraSoftness: f32,       // offset 12 (penumbra transition coefficient)
    u_shadowMapDimensions: vec2<u32>, // offset 16 (width, height, e.g. 4096, 2048)
    u_sampleStepCount: u32,        // offset 24 (steps per ray, e.g. 16 or 32)
    _pad: u32,                     // offset 28 (16-byte alignment)
};

@group(0) @binding(0) var<uniform> uniforms: TerrainShadowUniforms;
@group(0) @binding(1) var u_demTexture: texture_2d<f32>;
@group(0) @binding(2) var u_demSampler: sampler;
@group(0) @binding(3) var u_shadowMap: texture_storage_2d<r8unorm, write>;

const PI: f32 = 3.14159265358979323846;
const TWO_PI: f32 = 6.28318530717958647692;
const EARTH_RADIUS_M: f32 = 6371000.0;
const TAN_DELTA_SUN: f32 = 0.009250245; // tan(0.53 deg) ~ sun angular diameter

fn decodeElevation(demSample: vec4<f32>) -> f32 {
    return demSample.a * 19772.0 - 10924.0;
}

@compute @workgroup_size(16, 16)
fn cs_main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let dims = uniforms.u_shadowMapDimensions;
    if (globalId.x >= dims.x || globalId.y >= dims.y) {
        return;
    }

    let coord = vec2<i32>(i32(globalId.x), i32(globalId.y));
    let fDims = vec2<f32>(f32(dims.x), f32(dims.y));
    let uv = (vec2<f32>(f32(coord.x) + 0.5, f32(coord.y) + 0.5)) / fDims;

    // Below horizon / night guard
    if (uniforms.u_sunAltitude <= 0.0) {
        textureStore(u_shadowMap, coord, vec4<f32>(0.0, 0.0, 0.0, 1.0));
        return;
    }

    let baseSample = textureSampleLevel(u_demTexture, u_demSampler, uv, 0.0);
    let h0 = decodeElevation(baseSample);

    // Spherical metric tensor arc-length evaluation (Rule 8 & Invariant §18)
    let cosLat = max(1e-4, cos((uv.y - 0.5) * PI));
    let circumLonMeters = TWO_PI * EARTH_RADIUS_M * cosLat;
    let meridianMeters = PI * EARTH_RADIUS_M;

    let radAz = uniforms.u_sunAzimuth;
    let sinAz = sin(radAz);
    let cosAz = cos(radAz);

    let tanSunAlt = tan(clamp(uniforms.u_sunAltitude, 0.001, 1.55334));
    let kSoftness = max(0.01, uniforms.u_penumbraSoftness);
    let penumbraScale = max(1e-5, kSoftness * TAN_DELTA_SUN);

    let maxRayDist = max(1000.0, uniforms.u_maxRayDistanceMeters);
    let stepCount = max(4u, uniforms.u_sampleStepCount);

    var minShadow = 1.0;

    for (var i = 1u; i <= stepCount; i++) {
        let t = f32(i) / f32(stepCount);
        let s = maxRayDist * (t * t);

        let deltaEast = s * sinAz;
        let deltaNorth = s * cosAz;

        let deltaU = deltaEast / circumLonMeters;
        let deltaV = -deltaNorth / meridianMeters;

        let sampleUV = vec2<f32>(
            fract(uv.x + deltaU + 1.0),
            clamp(uv.y + deltaV, 0.001, 0.999)
        );

        let sSample = textureSampleLevel(u_demTexture, u_demSampler, sampleUV, 0.0);
        let hs = decodeElevation(sSample);

        let deltaH = hs - h0;
        let horizonSlope = deltaH / s;

        let stepShadow = clamp((tanSunAlt - horizonSlope) / penumbraScale, 0.0, 1.0);
        minShadow = min(minShadow, stepShadow);
    }

    textureStore(u_shadowMap, coord, vec4<f32>(minShadow, 0.0, 0.0, 1.0));
}
