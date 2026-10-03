// ============================================================================
// File: src/webgpu/shaders/drainage_accumulation.wgsl
// Target: WebGPU Geomorphic Drainage Basin Synthesis Compute Pass
// Architecture: Milestone 11: Geomorphic Drainage Basin Synthesis & Leopold-Maddock Hydrology
// Mathematical Foundations:
//   - Section 4: D-Infinity downhill steepest descent flow routing field d(x) = -grad(h) / ||grad(h)||
//   - Leopold & Maddock (1953) Hydraulic Geometry: W = a * Q^0.50, D = c * Q^0.40
//   - Flint's Law Bedrock Incision: delta_z = K * A^0.45 * ||grad(h)||^1.0
//   - Pluvial Discharge Coupling: Q(x) = \int_{B(x)} P(y) dy
//   - Rule 8 DEM Parity: elevMeters = demSample.a * 19772.0 - 10924.0
// ============================================================================

struct DrainageBasinUniforms {
    u_widthExponentB: f32,          // offset 0  (default 0.50)
    u_depthExponentF: f32,          // offset 4  (default 0.40)
    u_erodibilityConstantK: f32,    // offset 8  (default 1.00)
    u_flintExponentM: f32,          // offset 12 (default 0.45)
    u_flintExponentN: f32,          // offset 16 (default 1.00)
    u_minDischargeThreshold: f32,   // offset 20 (minimum Q to render a stream hairline)
    u_demGridDimensions: vec2<u32>, // offset 24 (e.g. width, height)
};

@group(0) @binding(0) var<uniform> uniforms: DrainageBasinUniforms;
@group(0) @binding(1) var u_demTexture: texture_2d<f32>;
@group(0) @binding(2) var u_demSampler: sampler;
@group(0) @binding(3) var u_precipTexture: texture_2d<f32>;
@group(0) @binding(4) var u_precipSampler: sampler;
@group(0) @binding(5) var u_drainageMap: texture_storage_2d<rgba16float, write>;

const PI: f32 = 3.14159265358979323846;
const TWO_PI: f32 = 6.28318530717958647692;
const EARTH_RADIUS_M: f32 = 6371000.0;
const A_MAX_KM2: f32 = 7000000.0; // Amazon Basin benchmark ~7,000,000 km²

fn decodeElevation(demSample: vec4<f32>) -> f32 {
    return demSample.a * 19772.0 - 10924.0;
}

@compute @workgroup_size(16, 16)
fn cs_main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let dims = uniforms.u_demGridDimensions;
    if (globalId.x >= dims.x || globalId.y >= dims.y) {
        return;
    }

    let coord = vec2<i32>(i32(globalId.x), i32(globalId.y));
    let fDims = vec2<f32>(f32(dims.x), f32(dims.y));
    let uv = (vec2<f32>(f32(coord.x) + 0.5, f32(coord.y) + 0.5)) / fDims;
    let ts = vec2<f32>(1.0 / fDims.x, 1.0 / fDims.y);

    // Center elevation & land gate
    let centerSample = textureSampleLevel(u_demTexture, u_demSampler, uv, 0.0);
    let h0 = decodeElevation(centerSample);
    let isLand = centerSample.b > 0.45;

    // Ocean cells: clear drainage accumulation and return early
    if (!isLand) {
        textureStore(u_drainageMap, coord, vec4<f32>(0.0, 0.0, 0.0, 0.0));
        return;
    }

    // Spherical metric tensor: physical distance per grid texel in meters
    let cosLat = max(1e-4, cos((uv.y - 0.5) * PI));
    let dxMeters = (TWO_PI * EARTH_RADIUS_M * cosLat) / fDims.x;
    let dyMeters = (PI * EARTH_RADIUS_M) / fDims.y;
    let cellAreaKm2 = (dxMeters * dyMeters) * 1e-6;

    // Antimeridian wrapping and polar clamping for 4 cardinal neighbors
    let uvR = vec2<f32>(fract(uv.x + ts.x), clamp(uv.y, 0.001, 0.999));
    let uvL = vec2<f32>(fract(uv.x - ts.x + 1.0), clamp(uv.y, 0.001, 0.999));
    let uvU = vec2<f32>(uv.x, clamp(uv.y + ts.y, 0.001, 0.999));
    let uvD = vec2<f32>(uv.x, clamp(uv.y - ts.y, 0.001, 0.999));

    let hR = decodeElevation(textureSampleLevel(u_demTexture, u_demSampler, uvR, 0.0));
    let hL = decodeElevation(textureSampleLevel(u_demTexture, u_demSampler, uvL, 0.0));
    let hU = decodeElevation(textureSampleLevel(u_demTexture, u_demSampler, uvU, 0.0));
    let hD = decodeElevation(textureSampleLevel(u_demTexture, u_demSampler, uvD, 0.0));

    // Discrete topographic gradient: grad(h) = (dh/dx, dh/dy)
    let gx = (hR - hL) / (2.0 * dxMeters);
    let gy = (hU - hD) / (2.0 * dyMeters);
    let slope = sqrt(gx * gx + gy * gy);
    let invSlope = 1.0 / max(1e-5, slope);

    // Steepest descent downhill flow direction vector d(x) = -grad(h) / ||grad(h)||
    let downhill = vec2<f32>(-gx * invSlope, -gy * invSlope);

    // Discrete second-derivative Laplacian curvature: d2h/dx2 + d2h/dy2
    // Concave troughs (valleys) have curvature > 0; convex ridges have curvature < 0
    let d2x = (hR + hL - 2.0 * h0) / (dxMeters * dxMeters);
    let d2y = (hU + hD - 2.0 * h0) / (dyMeters * dyMeters);
    let laplacian = d2x + d2y;
    let valleyCurvature = max(0.0, laplacian * 1e6); // Scale curvature for geomorphic convergence

    // Sample live precipitation from WeatherNext 3 / RainViewer texture
    let precipRate = textureSampleLevel(u_precipTexture, u_precipSampler, uv, 0.0).r;

    // Upstream Catchment Basin Trajectory Accumulation:
    // Follow the uphill gradient field d_up(x) = +grad(h) / ||grad(h)|| into headwaters
    var accumulatedArea = cellAreaKm2;
    var accumulatedPrecip = precipRate;
    let upstreamSteps = 16u;
    var traceUV = uv;
    let traceStepMeters = max(dxMeters, dyMeters) * 1.5;

    for (var step = 1u; step <= upstreamSteps; step++) {
        let sampleCosLat = max(1e-4, cos((traceUV.y - 0.5) * PI));
        let sampleDxM = (TWO_PI * EARTH_RADIUS_M * sampleCosLat) / fDims.x;
        let sampleDyM = (PI * EARTH_RADIUS_M) / fDims.y;

        let sUvR = vec2<f32>(fract(traceUV.x + ts.x), clamp(traceUV.y, 0.001, 0.999));
        let sUvL = vec2<f32>(fract(traceUV.x - ts.x + 1.0), clamp(traceUV.y, 0.001, 0.999));
        let sUvU = vec2<f32>(traceUV.x, clamp(traceUV.y + ts.y, 0.001, 0.999));
        let sUvD = vec2<f32>(traceUV.x, clamp(traceUV.y - ts.y, 0.001, 0.999));

        let sHR = decodeElevation(textureSampleLevel(u_demTexture, u_demSampler, sUvR, 0.0));
        let sHL = decodeElevation(textureSampleLevel(u_demTexture, u_demSampler, sUvL, 0.0));
        let sHU = decodeElevation(textureSampleLevel(u_demTexture, u_demSampler, sUvU, 0.0));
        let sHD = decodeElevation(textureSampleLevel(u_demTexture, u_demSampler, sUvD, 0.0));

        let sgx = (sHR - sHL) / (2.0 * sampleDxM);
        let sgy = (sHU - sHD) / (2.0 * sampleDyM);
        let sSlope = sqrt(sgx * sgx + sgy * sgy);
        let sInvSlope = 1.0 / max(1e-5, sSlope);

        // Uphill flow direction = +grad(h)
        let uphillDir = vec2<f32>(sgx * sInvSlope, sgy * sInvSlope);

        // Advance trace position uphill into catchment basin
        let deltaEast = uphillDir.x * traceStepMeters;
        let deltaNorth = uphillDir.y * traceStepMeters;

        let deltaU = deltaEast / (TWO_PI * EARTH_RADIUS_M * sampleCosLat);
        let deltaV = deltaNorth / (PI * EARTH_RADIUS_M);

        traceUV = vec2<f32>(fract(traceUV.x + deltaU + 1.0), clamp(traceUV.y + deltaV, 0.001, 0.999));

        // Sample upstream precipitation along trajectory
        let upPrecip = textureSampleLevel(u_precipTexture, u_precipSampler, traceUV, 0.0).r;
        let stepWeight = f32(step) * 1.25; // Hack's Law catchment scaling: upstream tributary branching
        accumulatedArea += cellAreaKm2 * stepWeight;
        accumulatedPrecip += upPrecip * stepWeight;
    }

    // Geomorphic valley convergence amplification from discrete Laplacian
    let convergenceGain = 1.0 + clamp(valleyCurvature * 2.5, 0.0, 15.0);
    accumulatedArea = accumulatedArea * convergenceGain;

    // Physical Discharge Q(x) = \int_{B(x)} P(y) dy
    // Pluvial factor coupling: baseline pluvial runoff augmented by accumulated precipitation
    let meanPrecip = accumulatedPrecip / f32(upstreamSteps + 1u);
    let pluvialFactor = 1.0 + sqrt(clamp(meanPrecip, 0.0, 50.0)) * 0.35 * uniforms.u_depthExponentF;
    let dischargeQ = accumulatedArea * pluvialFactor;

    // Flint's Law Bedrock Incision: delta_z = K * A^m * ||grad(h)||^n
    let erodibilityK = uniforms.u_erodibilityConstantK;
    let flintM = uniforms.u_flintExponentM;
    let flintN = uniforms.u_flintExponentN;
    let areaNorm = clamp(accumulatedArea / A_MAX_KM2, 0.0, 1.0);
    let slopeNorm = clamp(slope * 100.0, 0.0, 1.0);
    let incisionDepth = erodibilityK * pow(areaNorm, flintM) * pow(slopeNorm, flintN);

    // Channel width W = a * Q^b (Leopold & Maddock 1953)
    let normQ = clamp(dischargeQ / A_MAX_KM2, 0.0, 1.0);

    // Output RGBA16Float:
    // .r = Log-scaled or normalized upstream drainage area A(x) in [0.0, 1.0]
    // .g = Physical discharge Q(x)
    // .b = Topographic slope ||grad(h)||
    // .a = Bedrock channel incision delta_z
    textureStore(u_drainageMap, coord, vec4<f32>(normQ, dischargeQ, slope, incisionDepth));
}
