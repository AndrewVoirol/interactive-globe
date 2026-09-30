// ============================================================================
// File: src/webgpu/shaders/cloud_shell.wgsl
// Target: WebGPU Multi-Altitude Cloud Shell Render Pipeline
// Description: Multi-altitude tropospheric cloud shell rendering with real NOAA GFS
//              cloud fraction grids (LCDC, MCDC, HCDC), orographic terrain lift,
//              differential tropospheric wind drift, and archival drafting inking.
// Invariants:
//   - Invariant §3:  Mandatory Unconditional Derivative Evaluation (fwidth, dpdx, dpdy)
//   - Invariant §5:  Premultiplied Alpha Transparent Clear & Compositing
//   - Invariant §10: Horizon Tangent Attenuation (smoothstep on facing n · v)
//   - Invariant §15: Cross-Pipeline DEM Mathematical Parity (elevMeters decoding)
//   - Invariant §20: WebGPU Auxiliary Buffer Discipline
//   - Invariant §24: Uniform-Buffer-Driven Dynamic Theme Switching (Zero-Recompile)
//   - Invariant §28: Exhaustive Multi-Medium Shader Parity (Themes 0, 1, 2)
//   - Invariant §44: Metric Latitude Scaling for Procedural Substrate Noise
//   - Invariant §48: Dynamic Dimensions (No Hardcoded Literals)
// ============================================================================

const TWO_PI: f32 = 6.283185307179586;

// Strict 16-Byte Alignment Uniform Struct (Total: 288 bytes / 72 floats) (RFC §4.1)
struct CloudUniforms {
    u_unfurl: f32,                // offset 0 (float 0) - Manifold morph parameter [0..1]
    u_mode: u32,                  // offset 4 (float 1) - Simulation mode [0..3]
    u_theme: u32,                 // offset 8 (float 2) - Active medium theme (0, 1, 2)
    u_time: f32,                  // offset 12 (float 3) - Elapsed simulation time in seconds
    u_cameraPos: vec4<f32>,       // offset 16 (floats 4..7) - Camera XYZ position + 1.0
    u_viewport: vec4<f32>,        // offset 32 (floats 8..11) - x: w, y: h, z: 1/w, w: 1/h
    u_cloudDrift: vec4<f32>,      // offset 48 (floats 12..15) - x: lowDrift (0.6), y: midDrift (1.0), z: highDrift (1.8), w: baseDriftSpeed
    u_layerStandoff: vec4<f32>,   // offset 64 (floats 16..19) - x: low (0.0010), y: mid (0.0040), z: high (0.0080), w: dispScale
    u_layerOpacity: vec4<f32>,    // offset 80 (floats 20..23) - x: low (0.70), y: mid (0.50), z: high (0.30), w: globalOpacity
    u_layerIndex: u32,            // offset 96 (float 24) - activeLayerIdx (0 = Low, 1 = Mid, 2 = High)
    u_peakExponent: f32,          // offset 100 (float 25) - Peak Exponent
    u_atmosphericScale: f32,      // offset 104 (float 26) - Standoff Exaggeration [1.0 .. 12.0] (u_horizonExaggeration)
    u_shadowIntensity: f32,       // offset 108 (float 27) - Dynamic Ground Shadow Intensity [0.0 .. 0.60]
    u_sunDirection: vec4<f32>,    // offset 112 (floats 28..31) - xyz: normalized sun dir, w: sun altitude
    u_mediumProperties: vec4<f32>,// offset 128 (floats 32..35) - x: inkAbsorption, y: fiberDensity, z: exposureGamma, w: paperTooth (u_paper_tooth)
    u_verticalScaleMode: u32,     // offset 144 (float 36) - 0 = Linear Legacy, 1 = Dual-Log
    u_rainShadowFeedback: f32,    // offset 148 (float 37) - Dynamic Orographic Moisture Coupling [0.0..1.0]
    u_padCloud0: f32,             // offset 152 (float 38)
    u_padCloud1: f32,             // offset 156 (float 39)
    u_viewMatrix: mat4x4<f32>,    // offset 160 (floats 40..55) - Camera view matrix (Column-major)
    u_projectionMatrix: mat4x4<f32>, // offset 224 (floats 56..71) - Camera projection matrix (Column-major)
};

@group(0) @binding(0) var<uniform> cloud: CloudUniforms;
@group(0) @binding(1) var u_cloudTexture: texture_2d<f32>;
@group(0) @binding(2) var u_cloudSampler: sampler;
@group(0) @binding(3) var u_demTexture: texture_2d<f32>;
@group(0) @binding(4) var u_demSampler: sampler;
@group(0) @binding(5) var u_regionalDEMTexture: texture_2d<f32>;

struct RegionalOverlayUniforms {
    u_regionalBounds: vec4<f32>, // minLon, minLat, maxLon, maxLat
    u_pad0: vec4<f32>,
    u_pad1: vec4<f32>,
    u_regionalActive: u32,
    u_pad2: u32,
    u_pad3: u32,
    u_pad4: u32,
};

@group(0) @binding(6) var<uniform> u_regionalOverlay: RegionalOverlayUniforms;
@group(0) @binding(7) var u_windTexture: texture_2d<f32>;
@group(0) @binding(8) var u_windSampler: sampler;
@group(0) @binding(9) var u_jetStreamTexture: texture_2d<f32>;
@group(0) @binding(10) var u_midCloudTexture: texture_2d<f32>;
@group(0) @binding(11) var u_highCloudTexture: texture_2d<f32>;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) surfaceType: f32,
    @location(3) target2D: vec4<f32>, // xy: Mercator 2D, zw: Reserved/Unused
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) facing: f32,
    @location(2) worldPos: vec3<f32>,
    @location(3) normal: vec3<f32>,
};

fn getRegionalBlendWeight(uv: vec2<f32>) -> f32 {
    if (u_regionalOverlay.u_regionalActive != 1u) {
        return 0.0;
    }

    let bounds = u_regionalOverlay.u_regionalBounds;
    let minLon = bounds.x;
    let minLat = bounds.y;
    let maxLon = bounds.z;
    let maxLat = bounds.w;

    // Strict bounds validation: require non-inverted valid geographic coordinates
    if (minLon >= maxLon || minLat >= maxLat ||
        minLat < -90.0 || maxLat > 90.0 ||
        minLon < -180.0 || maxLon > 180.0) {
        return 0.0;
    }

    let lon = uv.x * 360.0 - 180.0;
    let lat = 90.0 - uv.y * 180.0;

    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) {
        return 0.0;
    }

    let regU = (lon - minLon) / (maxLon - minLon);
    let regV = (maxLat - lat) / (maxLat - minLat);

    let blendDeg = 0.5;
    let lonSpan = maxLon - minLon;
    let latSpan = maxLat - minLat;
    let marginU = clamp(blendDeg / lonSpan, 0.001, 0.49);
    let marginV = clamp(blendDeg / latSpan, 0.001, 0.49);

    let distU = min(regU, 1.0 - regU);
    let distV = min(regV, 1.0 - regV);

    let weightU = smoothstep(0.0, marginU, distU);
    let weightV = smoothstep(0.0, marginV, distV);
    return weightU * weightV;
}

fn sampleRegionalComposite(uv: vec2<f32>, globalSample: vec4<f32>, lod: f32) -> vec4<f32> {
    let weight = getRegionalBlendWeight(uv);
    if (weight <= 0.0001) {
        return globalSample;
    }

    let bounds = u_regionalOverlay.u_regionalBounds;
    let minLon = bounds.x;
    let minLat = bounds.y;
    let maxLon = bounds.z;
    let maxLat = bounds.w;

    let lon = uv.x * 360.0 - 180.0;
    let lat = 90.0 - uv.y * 180.0;

    let regU = clamp((lon - minLon) / (maxLon - minLon), 0.0, 1.0);
    let regV = clamp((maxLat - lat) / (maxLat - minLat), 0.0, 1.0);

    let regSample = textureSampleLevel(u_regionalDEMTexture, u_demSampler, vec2<f32>(regU, regV), lod);
    return mix(globalSample, regSample, weight);
}

// Invariant §15: Cross-Pipeline DEM Mathematical Parity
fn decodeElevation(demSample: vec4<f32>) -> f32 {
    return demSample.a * 19772.0 - 10924.0;
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.uv = input.uv;

    // Sample DEM elevation at vertex for terrain-following cloud lift (Invariant §15)
    let demSampleGlobal = textureSampleLevel(u_demTexture, u_demSampler, input.uv, 0.0);
    let demSample = sampleRegionalComposite(input.uv, demSampleGlobal, 0.0);
    let elevMeters = decodeElevation(demSample);

    // Compute base manifold position and normal
    let def = evaluateManifoldCore(
        input.position, input.target2D.xy,
        cloud.u_unfurl, cloud.u_mode, cloud.u_time,
        vec4<f32>(0.0), 0.0, vec4<f32>(0.0)
    );
    let basePos = def.pos;
    var normal = def.normal;
    out.normal = normal;

    // Support 3 independent altitude standoffs:
    // Low:  ~1-2km,  standoff R + 0.0010
    // Mid:  ~4-6km,  standoff R + 0.0040
    // High: ~10-12km, standoff R + 0.0080
    let layerIdx = cloud.u_layerIndex;
    var baseStandoff = cloud.u_layerStandoff.x; // Low ~0.0010 (~1.27 km)
    if (layerIdx == 1u) {
        baseStandoff = cloud.u_layerStandoff.y; // Mid ~0.0040 (~5.10 km)
    } else if (layerIdx == 2u) {
        baseStandoff = cloud.u_layerStandoff.z; // High ~0.0080 (~10.19 km)
    }

    let normH = max(0.0, elevMeters) / 8848.0;
    let camDist = length(cloud.u_cameraPos.xyz);
    let orbitT = clamp((camDist - 8.0) / (25.0 - 8.0), 0.0, 1.0);
    let dynamicExp = clamp(mix(0.95, 1.25, orbitT) * (cloud.u_peakExponent / 1.4), 0.85, 1.30);
    let shapedH = (1.0 - exp(-2.2 * normH)) / (1.0 - exp(-2.2));
    
    let poleDist = abs(input.uv.y - 0.5) * 2.0;
    let poleAtten = 1.0 - smoothstep(0.85, 0.98, poleDist);
    // Surface-conforming terrain crust displacement (Invariant §15 parity with crust_hydrosphere.wgsl)
    let crustDisp = pow(shapedH, dynamicExp) * (cloud.u_layerStandoff.w * 2.8) * poleAtten;
    var effCrustDisp = crustDisp;
    if (cloud.u_verticalScaleMode == 1u) {
        if (elevMeters > 0.0) {
            let logNormH = log(1.0 + elevMeters / 1200.0) / log(1.0 + 8848.0 / 1200.0);
            effCrustDisp = logNormH * (cloud.u_layerStandoff.w * 2.8) * poleAtten;
        } else {
            effCrustDisp = 0.0;
        }
    }

    // Pitch-adaptive standoff exaggeration (Spec §2.3)
    let vCam = normalize(cloud.u_cameraPos.xyz - basePos);
    let NdotV = clamp(dot(normal, vCam) / 0.35, 0.0, 1.0);
    let k_exagg = 1.0 + (cloud.u_atmosphericScale - 1.0) * ((1.0 - NdotV) * (1.0 - NdotV));
    let effStandoff = baseStandoff * k_exagg;

    // Unified terrain-following displacement ensuring strict stratum hierarchy:
    // z_low < z_mid < z_high and z_layer >= crustDisp everywhere across all landforms.
    var totalOffset = crustDisp + effStandoff;
    if (cloud.u_verticalScaleMode == 1u) {
        totalOffset = effCrustDisp + effStandoff;
    }

    // Morph participation with u_unfurl:
    // Evaluate world position along surface normal:
    // p_world = p_base + n_base * (delta_z_standoff + h_lift)
    // At alpha=1.0, n_base = (0, 0, 1), naturally preserving altitude standoff as vertical 3D offset above flattened terrain
    let worldP = basePos + normal * totalOffset;
    var effWorldP = worldP;

    if (cloud.u_mode == 1u) {
        let ease = clamp(cloud.u_unfurl, 0.0, 1.0);
        let oneMinusT = 1.0 - ease;
        if (oneMinusT > 0.001) {
            let invOneMinusT = 1.0 / oneMinusT;
            let curR = max(length(input.position), 0.001);
            let lambda = atan2(input.position.x, input.position.z);
            let phi = asin(clamp(input.position.y / curR, -0.9998, 0.9998));
            let curAngle = oneMinusT * lambda;
            let T_lambda = vec3<f32>(curR * cos(curAngle), 0.0, -curR * cos(phi) * sin(curAngle));
            let T_phi = vec3<f32>(
                0.0,
                mix(curR * cos(phi), curR / max(cos(phi), 0.05), ease),
                -curR * sin(phi) * invOneMinusT * (cos(curAngle) - 1.0) - curR * sin(phi) * oneMinusT
            );
            let rawNorm = cross(T_lambda, T_phi);
            if (length(rawNorm) > 0.0001) {
                normal = normalize(rawNorm);
                effWorldP = basePos + normal * totalOffset;
            }
        } else {
            normal = vec3<f32>(0.0, 0.0, 1.0);
            effWorldP = basePos + normal * totalOffset;
        }
    }

    out.normal = normal;
    out.worldPos = effWorldP;

    let viewDir = normalize(cloud.u_cameraPos.xyz - effWorldP);
    out.facing = dot(normal, viewDir);

    let viewPos = cloud.u_viewMatrix * vec4<f32>(effWorldP, 1.0);
    out.clipPos = cloud.u_projectionMatrix * viewPos;
    return out;
}

// Invariant §44: Metric Latitude Scaling for Procedural Substrate Noise
fn hash12(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

const INV_EARTH_RADIUS_M: f32 = 1.5696123e-7;
const INV_PI: f32 = 0.31830988618379067;
const INV_TWO_PI: f32 = 0.15915494309189535;

// Closed-form Riemannian exponential map on S² for semi-Lagrangian great-circle advection (Milestone 1)
fn mapSphericalGeodesicUV(
    arrivalUV: vec2<f32>,
    windVelMps: vec2<f32>,
    deltaTSeconds: f32
) -> vec2<f32> {
    let lam_p = windVelMps.x * (INV_EARTH_RADIUS_M * deltaTSeconds);
    let phi_p = windVelMps.y * (INV_EARTH_RADIUS_M * deltaTSeconds);
    let sigma_sq = lam_p * lam_p + phi_p * phi_p;
    if (sigma_sq < 1e-12) {
        return arrivalUV;
    }
    let phi_a = (0.5 - arrivalUV.y) * PI;
    let cos_phi_a = cos(phi_a);
    let sin_phi_a = sin(phi_a);
    let sigma = sqrt(sigma_sq);
    let sinc = select(1.0 - sigma_sq * 0.16666667, sin(sigma) / max(sigma, 1e-7), sigma > 1e-4);
    let cos_sigma = cos(sigma);
    let c_lam = sinc * lam_p;
    let c_phi = sinc * phi_p;
    let sin_phi_d = clamp(c_phi * cos_phi_a + cos_sigma * sin_phi_a, -1.0, 1.0);
    let phi_d = asin(sin_phi_d);
    let y = c_lam;
    let x = cos_sigma * cos_phi_a - c_phi * sin_phi_a;
    let delta_lambda = atan2(y, x);
    let uv_x = fract(arrivalUV.x + delta_lambda * INV_TWO_PI + 1.0);
    let uv_y = clamp(0.5 - phi_d * INV_PI, 0.0001, 0.9999);
    return vec2<f32>(uv_x, uv_y);
}

// Single-lobe Henyey-Greenstein scattering phase function (Spec §11)
fn henyeyGreenstein(mu: f32, g: f32) -> f32 {
    let g2 = g * g;
    let denom = 1.0 + g2 - 2.0 * g * mu;
    return (1.0 - g2) / (4.0 * PI * pow(max(denom, 1e-4), 1.5));
}

// Dual-lobe Henyey-Greenstein phase function with analytical energy conservation (Spec §11)
fn dualLobePhase(mu: f32, gFwd: f32, gBwd: f32, wFwd: f32) -> f32 {
    let fwd = henyeyGreenstein(mu, gFwd);
    let bwd = henyeyGreenstein(mu, -gBwd);
    return wFwd * fwd + (1.0 - wFwd) * bwd;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Invariant §3: Mandatory Unconditional Derivative Evaluation
    // All derivatives MUST be evaluated at the top of fs_main in unconditional control flow,
    // strictly before any dynamic branching, conditional blocks, or discard statements!
    let du_dx = dpdx(in.uv.x);
    let du_dy = dpdy(in.uv.x);
    let dv_dx = dpdx(in.uv.y);
    let dv_dy = dpdy(in.uv.y);
    let dUv = fwidth(in.uv);

    // Sample 2D horizontal wind velocity (u, v) in m/s unconditionally at the top of fs_main (Rule 4)
    let rawWind = textureSampleLevel(u_windTexture, u_windSampler, in.uv, 0.0).xy;
    let rawJetStream = textureSampleLevel(u_jetStreamTexture, u_windSampler, in.uv, 0.0).xy;

    let layerIdx = cloud.u_layerIndex;
    var layerDriftFactor = cloud.u_cloudDrift.x; // Low 5.0
    if (layerIdx == 1u) {
        layerDriftFactor = cloud.u_cloudDrift.y; // Mid 15.0
    } else if (layerIdx == 2u) {
        layerDriftFactor = cloud.u_cloudDrift.z; // High 40.0
    }

    // Unpopulated wind grid fallbacks
    let activeSurfaceWind = select(rawWind, vec2<f32>(layerDriftFactor, 0.0), length(rawWind) < 0.01);
    let activeJetWind = select(rawJetStream, vec2<f32>(layerDriftFactor * 2.0, 0.0), length(rawJetStream) < 0.01);

    // Multi-Stratum Vertical Wind Shear (Milestone 2)
    // - Low Stratus (0–2 km, layer 0): WeatherNext 3 10m surface wind
    // - Mid Altocumulus (2–6 km, layer 1): Linearly blended wind mix(u_10m, u_250hPa, 0.40)
    // - High Cirrus (6–12 km, layer 2): Upper-tropospheric Jet Stream wind (u_250hPa)
    var stratumWind: vec2<f32>;
    if (layerIdx == 0u) {
        stratumWind = activeSurfaceWind;
    } else if (layerIdx == 1u) {
        stratumWind = mix(activeSurfaceWind, activeJetWind, 0.40);
    } else {
        stratumWind = activeJetWind;
    }

    let effectiveWind = stratumWind;

    // Time-lapse visual advection rate for planetary scale
    let baseDriftSpeed = cloud.u_cloudDrift.w;
    let effectiveSpeed = select(baseDriftSpeed * 2500.0, 0.0, baseDriftSpeed <= 0.0001);

    // Dual-phase cyclic semi-Lagrangian advection (Milestone 1)
    // Seamless continuous motion along spherical streamlines with zero coordinate distortion
    const T_CYCLE: f32 = 16.0;
    let tNorm = cloud.u_time / T_CYCLE;
    let phase0 = fract(tNorm);
    let phase1 = fract(tNorm + 0.5);
    let dt0 = (phase0 - 0.5) * T_CYCLE * effectiveSpeed;
    let dt1 = (phase1 - 0.5) * T_CYCLE * effectiveSpeed;

    let sampleUV = mapSphericalGeodesicUV(in.uv, -effectiveWind, dt0);
    let sampleUV1 = mapSphericalGeodesicUV(in.uv, -effectiveWind, dt1);

    // Unconditional texture sampling at top of fs_main before any branch or discard
    let c0 = textureSampleLevel(u_cloudTexture, u_cloudSampler, sampleUV, 0.0).r;
    let c1 = textureSampleLevel(u_cloudTexture, u_cloudSampler, sampleUV1, 0.0).r;
    let blendWeight = 2.0 * abs(phase0 - 0.5);
    let rawCloud = mix(c0, c1, blendWeight);

    // Vertical Slab Parallax Extrusion (Spec §9, Phase 1)
    // Physical stratum deck thickness: Low 1.4km, Mid 2.4km, High 2.0km
    var deckThicknessKm: f32 = 1.4;
    if (layerIdx == 1u) {
        deckThicknessKm = 2.4;
    } else if (layerIdx == 2u) {
        deckThicknessKm = 2.0;
    }

    // View-ray projection onto local equirectangular tangent frame
    let muEff = max(in.facing, 0.15);
    let camDeltaRay = cloud.u_cameraPos.xyz - in.worldPos;
    let camDistRay = length(camDeltaRay);
    let viewRay = select(in.normal, camDeltaRay / camDistRay, camDistRay > 1e-4);
    let sphereLambda = (in.uv.x - 0.5) * TWO_PI;
    let eastVec = vec3<f32>(-sin(sphereLambda), 0.0, cos(sphereLambda));
    let northVec = cross(in.normal, eastVec);
    let vE = dot(viewRay, eastVec);
    let vN = dot(viewRay, northVec);

    const TWO_PI_RE_KM: f32 = 40030.17;
    const PI_RE_KM: f32 = 20015.09;
    let cosLatSlab = max(0.15, cos((in.uv.y - 0.5) * PI));

    // Mid interior slice (z = 0.5 * deckThicknessKm)
    let zMidKm = 0.5 * deckThicknessKm;
    let deltaUMid = -(zMidKm * vE) / (muEff * TWO_PI_RE_KM * cosLatSlab);
    let deltaVMid =  (zMidKm * vN) / (muEff * PI_RE_KM);
    let uvMid0 = vec2<f32>(fract(sampleUV.x + deltaUMid), clamp(sampleUV.y + deltaVMid, 0.001, 0.999));
    let uvMid1 = vec2<f32>(fract(sampleUV1.x + deltaUMid), clamp(sampleUV1.y + deltaVMid, 0.001, 0.999));
    let cMid0 = textureSampleLevel(u_cloudTexture, u_cloudSampler, uvMid0, 0.0).r;
    let cMid1 = textureSampleLevel(u_cloudTexture, u_cloudSampler, uvMid1, 0.0).r;
    let rawCloudMid = mix(cMid0, cMid1, blendWeight);

    // Base boundary slice (z = 1.0 * deckThicknessKm)
    let zBaseKm = 1.0 * deckThicknessKm;
    let deltaUBase = -(zBaseKm * vE) / (muEff * TWO_PI_RE_KM * cosLatSlab);
    let deltaVBase =  (zBaseKm * vN) / (muEff * PI_RE_KM);
    let uvBase0 = vec2<f32>(fract(sampleUV.x + deltaUBase), clamp(sampleUV.y + deltaVBase, 0.001, 0.999));
    let uvBase1 = vec2<f32>(fract(sampleUV1.x + deltaUBase), clamp(sampleUV1.y + deltaVBase, 0.001, 0.999));
    let cBase0 = textureSampleLevel(u_cloudTexture, u_cloudSampler, uvBase0, 0.0).r;
    let cBase1 = textureSampleLevel(u_cloudTexture, u_cloudSampler, uvBase1, 0.0).r;
    let rawCloudBase = mix(cBase0, cBase1, blendWeight);

    // 3-Tap composite slab density (Weights: Top 0.45, Mid 0.35, Base 0.20)
    let rawCloudSlab = rawCloud * 0.45 + rawCloudMid * 0.35 + rawCloudBase * 0.20;

    // Multi-Stratum Solar Ray Projection & Inter-Deck Shadows (Spec §10, Phase 2)
    let azDeg = select(315.0, degrees(atan2(cloud.u_sunDirection.x, cloud.u_sunDirection.y)), length(cloud.u_sunDirection.xy) > 1e-4);
    let altDeg = select(45.0, cloud.u_sunDirection.w, cloud.u_sunDirection.w > 0.0);
    let radAz = radians(azDeg);
    let radAlt = clamp(radians(altDeg), radians(5.0), radians(85.0));
    let tanAlt = tan(radAlt);

    let cosLatShadow = max(0.15, cos((in.uv.y - 0.5) * PI));
    let invTwoPiRe = 1.0 / (TWO_PI_RE_KM * cosLatShadow * tanAlt);
    let invPiRe = 1.0 / (PI_RE_KM * tanAlt);
    let cosAz = cos(radAz);
    let sinAz = sin(radAz);

    // Delta h offsets:
    // Mid -> Low (2.5 km), High -> Low (7.0 km), High -> Mid (4.5 km)
    let shadowOffset_mid2low = vec2<f32>(-(2.5 * invTwoPiRe) * cosAz, (2.5 * invPiRe) * sinAz);
    let shadowOffset_high2low = vec2<f32>(-(7.0 * invTwoPiRe) * cosAz, (7.0 * invPiRe) * sinAz);
    let shadowOffset_high2mid = vec2<f32>(-(4.5 * invTwoPiRe) * cosAz, (4.5 * invPiRe) * sinAz);

    // Penumbra filter radii in UV space
    // 2.5 km -> 20 km; 4.5 km -> 28 km; 7.0 km -> 35 km
    let rU_20 = (20.0 / TWO_PI_RE_KM) / cosLatShadow;
    let rV_20 = 20.0 / PI_RE_KM;
    let rU_28 = (28.0 / TWO_PI_RE_KM) / cosLatShadow;
    let rV_28 = 28.0 / PI_RE_KM;
    let rU_35 = (35.0 / TWO_PI_RE_KM) / cosLatShadow;
    let rV_35 = 35.0 / PI_RE_KM;

    // Center coordinates for upper decks (advected along spherical streamlines §10.3)
    let unadvectedMid = vec2<f32>(fract(in.uv.x + shadowOffset_mid2low.x), clamp(in.uv.y + shadowOffset_mid2low.y, 0.001, 0.999));
    let unadvectedHigh = select(
        vec2<f32>(fract(in.uv.x + shadowOffset_high2mid.x), clamp(in.uv.y + shadowOffset_high2mid.y, 0.001, 0.999)),
        vec2<f32>(fract(in.uv.x + shadowOffset_high2low.x), clamp(in.uv.y + shadowOffset_high2low.y, 0.001, 0.999)),
        layerIdx == 0u
    );
    let windMid = mix(activeSurfaceWind, activeJetWind, 0.40);
    let centerUV_mid = mapSphericalGeodesicUV(unadvectedMid, -windMid, dt0);
    let centerUV_high = mapSphericalGeodesicUV(unadvectedHigh, -activeJetWind, dt0);
    let rU_highSelect = select(rU_28, rU_35, layerIdx == 0u);
    let rV_highSelect = select(rV_28, rV_35, layerIdx == 0u);

    var midCloudShadowDens: f32 = 0.0;
    var highCloudShadowDens: f32 = 0.0;

    // Gate upper-stratum shadow ray lookups to layers that actually receive them (Optimization §10.5)
    // Low Stratus (layer 0) queries both Mid and High decks (8 taps)
    // Mid Altocumulus (layer 1) queries only High deck (4 taps)
    // High Cirrus (layer 2) queries zero upper decks (0 taps)
    if (layerIdx == 0u) {
        let tapMid0 = vec2<f32>(fract(centerUV_mid.x - 0.38 * rU_20), clamp(centerUV_mid.y - 0.92 * rV_20, 0.0, 1.0));
        let tapMid1 = vec2<f32>(fract(centerUV_mid.x + 0.92 * rU_20), clamp(centerUV_mid.y - 0.38 * rV_20, 0.0, 1.0));
        let tapMid2 = vec2<f32>(fract(centerUV_mid.x + 0.38 * rU_20), clamp(centerUV_mid.y + 0.92 * rV_20, 0.0, 1.0));
        let tapMid3 = vec2<f32>(fract(centerUV_mid.x - 0.92 * rU_20), clamp(centerUV_mid.y + 0.38 * rV_20, 0.0, 1.0));

        let m0 = textureSampleLevel(u_midCloudTexture, u_cloudSampler, tapMid0, 0.0).r;
        let m1 = textureSampleLevel(u_midCloudTexture, u_cloudSampler, tapMid1, 0.0).r;
        let m2 = textureSampleLevel(u_midCloudTexture, u_cloudSampler, tapMid2, 0.0).r;
        let m3 = textureSampleLevel(u_midCloudTexture, u_cloudSampler, tapMid3, 0.0).r;
        midCloudShadowDens = (m0 + m1 + m2 + m3) * 0.25;
    }

    if (layerIdx <= 1u) {
        let tapHigh0 = vec2<f32>(fract(centerUV_high.x - 0.38 * rU_highSelect), clamp(centerUV_high.y - 0.92 * rV_highSelect, 0.0, 1.0));
        let tapHigh1 = vec2<f32>(fract(centerUV_high.x + 0.92 * rU_highSelect), clamp(centerUV_high.y - 0.38 * rV_highSelect, 0.0, 1.0));
        let tapHigh2 = vec2<f32>(fract(centerUV_high.x + 0.38 * rU_highSelect), clamp(centerUV_high.y + 0.92 * rV_highSelect, 0.0, 1.0));
        let tapHigh3 = vec2<f32>(fract(centerUV_high.x - 0.92 * rU_highSelect), clamp(centerUV_high.y + 0.38 * rV_highSelect, 0.0, 1.0));

        let h0 = textureSampleLevel(u_highCloudTexture, u_cloudSampler, tapHigh0, 0.0).r;
        let h1 = textureSampleLevel(u_highCloudTexture, u_cloudSampler, tapHigh1, 0.0).r;
        let h2 = textureSampleLevel(u_highCloudTexture, u_cloudSampler, tapHigh2, 0.0).r;
        let h3 = textureSampleLevel(u_highCloudTexture, u_cloudSampler, tapHigh3, 0.0).r;
        highCloudShadowDens = (h0 + h1 + h2 + h3) * 0.25;
    }

    // Inter-deck Beer-Lambert optical depth accumulation (§10.4)
    let tauMid = smoothstep(0.10, 0.40, midCloudShadowDens) * 0.55;
    let tauHigh = smoothstep(0.12, 0.45, highCloudShadowDens) * 0.30;
    var interdeckTau: f32 = 0.0;
    if (layerIdx == 0u) {
        interdeckTau = tauMid + tauHigh;
    } else if (layerIdx == 1u) {
        interdeckTau = tauHigh;
    } // layerIdx == 2u receives zero shadow (interdeckTau = 0.0)

    let interdeckShadow = clamp(1.0 - cloud.u_shadowIntensity * interdeckTau, 0.0, 1.0);

    // Orographic lift & rain shadows via 2D wind-terrain coupling (Invariant §3, §15, §18, RFC Mechanic 4)
    // Sample u_demTexture and u_windTexture in unconditional uniform control flow at explicit LOD 0.0 strictly before discards
    let demDims = vec2<f32>(textureDimensions(u_demTexture));
    let dU = 1.0 / max(demDims.x, 1.0);
    let dV = 1.0 / max(demDims.y, 1.0);
    let uvEast = vec2<f32>(fract(in.uv.x + dU), in.uv.y);
    let uvWest = vec2<f32>(fract(in.uv.x + 1.0 - dU), in.uv.y);
    let uvNorth = vec2<f32>(in.uv.x, clamp(in.uv.y - dV, 0.001, 0.999));
    let uvSouth = vec2<f32>(in.uv.x, clamp(in.uv.y + dV, 0.001, 0.999));

    let demCenterGlobal = textureSampleLevel(u_demTexture, u_demSampler, in.uv, 0.0);
    let demEastGlobal = textureSampleLevel(u_demTexture, u_demSampler, uvEast, 0.0);
    let demWestGlobal = textureSampleLevel(u_demTexture, u_demSampler, uvWest, 0.0);
    let demNorthGlobal = textureSampleLevel(u_demTexture, u_demSampler, uvNorth, 0.0);
    let demSouthGlobal = textureSampleLevel(u_demTexture, u_demSampler, uvSouth, 0.0);

    let demCenter = sampleRegionalComposite(in.uv, demCenterGlobal, 0.0);
    let demEast = sampleRegionalComposite(uvEast, demEastGlobal, 0.0);
    let demWest = sampleRegionalComposite(uvWest, demWestGlobal, 0.0);
    let demNorth = sampleRegionalComposite(uvNorth, demNorthGlobal, 0.0);
    let demSouth = sampleRegionalComposite(uvSouth, demSouthGlobal, 0.0);

    let zTerrain = decodeElevation(demCenter);
    let elevEast = decodeElevation(demEast);
    let elevWest = decodeElevation(demWest);
    let elevNorth = decodeElevation(demNorth);
    let elevSouth = decodeElevation(demSouth);

    // Spherical metric tensor arc lengths (Invariant §18)
    let latRad = (0.5 - in.uv.y) * PI;
    let cosLat = max(0.1, cos(latRad));
    const EARTH_RADIUS: f32 = 6371000.0; // meters
    // Taper metric tensor arc length so 1/dx does not blow up at high latitudes
    let cosLatMetric = max(0.35, cos(latRad));
    let dx = 2.0 * EARTH_RADIUS * cosLatMetric * (dU * TWO_PI);
    let dy = 2.0 * EARTH_RADIUS * (dV * PI);
    let gradH = vec2<f32>((elevEast - elevWest) / dx, (elevNorth - elevSouth) / dy);

    // Reuse 2D horizontal wind velocity (u, v) in m/s coupled to vertical stratum shear
    let windVel = effectiveWind;
    let wOrographic = dot(windVel, gradH);

    // Stratum coupling attenuates vertical influence at higher layers
    let stratumCoupling = select(1.0, select(0.50, 0.15, layerIdx == 2u), layerIdx >= 1u);

    // Polar attenuation to prevent coordinate singularity distortion & radial starburst pinwheels near poles (Invariant §18)
    let poleDist = abs(in.uv.y - 0.5) * 2.0;
    let poleAtten = 1.0 - smoothstep(0.82, 0.96, poleDist);
    let cosLatPolar = max(0.0, cos(latRad));
    let polarLonAtten = smoothstep(0.01, 0.25, cosLatPolar);
    let polarOrographicAtten = smoothstep(0.05, 0.35, cosLatPolar);

    let liftTerm = select(wOrographic * 50.0, ((elevEast - elevWest) / 8848.0) * 10.0, length(windVel) < 1e-4);
    let orographicLift = 0.35 * tanh(0.05 * liftTerm) * stratumCoupling;
    let effOrographicLift = orographicLift * poleAtten * polarLonAtten * polarOrographicAtten;

    // Orographic leeward rain shadow attenuation (Spec §2.2, Invariant §3)
    let wOro = wOrographic;
    let rainShadowAtten = 1.0 - cloud.u_rainShadowFeedback * clamp(-wOro * 40.0, 0.0, 0.85) * stratumCoupling;
    var baseDensity = clamp((rawCloudSlab + effOrographicLift) * poleAtten, 0.0, 1.0);
    baseDensity *= rainShadowAtten;
    let condensedCloud = baseDensity;

    // Backward compatibility deltaH variables
    let deltaH = (elevEast - elevWest) / 8848.0;
    let windwardBoost = clamp(deltaH * 3.5, 0.0, 0.35);
    let leewardShadow = clamp(-deltaH * 4.0, 0.0, 0.70);
    let orographicFactor = 1.0 + (windwardBoost - leewardShadow) * stratumCoupling;

    // Milestone 3: Stratum-Specific Orographic Terrain Blocking & Ridge Interception (§7)
    // Physical ridge blocking of lower tropospheric cloud decks without clipping inside solid rock,
    // while permitting high-altitude cirrus to traverse mountain crests unimpeded.
    // Stratum altitude boundaries:
    // - Low stratus (Layer 0): base = 0 m, top = 2000 m
    // - Mid altocumulus (Layer 1): base = 2000 m, top = 6000 m
    // - High cirrus (Layer 2): base = 6000 m, top = 12000 m
    var zStratumBase: f32 = 0.0;
    var zStratumTop: f32 = 2000.0;
    if (layerIdx == 1u) {
        zStratumBase = 2000.0;
        zStratumTop = 6000.0;
    } else if (layerIdx == 2u) {
        zStratumBase = 6000.0;
        zStratumTop = 12000.0;
    }
    // W3C WGSL §14.4 compliant formulation equivalent to smoothstep(zStratumTop, zStratumBase, zTerrain):
    let alphaStratum = 1.0 - smoothstep(zStratumBase, zStratumTop, zTerrain);

    // Invariant §10 standard: smoothstep(0.02, 0.20, in.facing)
    // Horizon Limb Falloff Specification (§1) for tropospheric cloud shells:
    let horizonAtten = horizonFalloff(in.facing, 0.08, 0.000, 0.05);
    if (cloud.u_unfurl < 0.20 && in.facing <= 0.0) {
        discard;
    }

    // Feathering threshold < 20%:
    // Values below 20% cloud fraction feather to 0 to prevent harsh blocky pixel steps from 0.25° GFS resolution.
    let featheredCloud = smoothstep(0.0, 0.20, condensedCloud);
    let effectiveCloud = clamp(condensedCloud * featheredCloud, 0.0, 1.0);

    if (effectiveCloud <= 0.001) {
        discard;
    }

    // Discard fragments completely blocked by terrain ridges (Milestone 3)
    let blockedCloud = effectiveCloud * alphaStratum;
    if (blockedCloud <= 0.001) {
        discard;
    }

    // Altitude-dependent opacity:
    // High cirrus 0.2–0.4, Low stratus 0.5–0.8.
    var baseLayerOpacity = cloud.u_layerOpacity.x; // Low stratus: 0.50 - 0.80
    if (layerIdx == 1u) {
        baseLayerOpacity = cloud.u_layerOpacity.y; // Mid altocumulus: 0.40 - 0.60
    } else if (layerIdx == 2u) {
        baseLayerOpacity = cloud.u_layerOpacity.z; // High cirrus: 0.20 - 0.40
    }

    var alpha = blockedCloud * baseLayerOpacity * cloud.u_layerOpacity.w * horizonAtten;

    // Volumetric slant-path optical depth amplification (Spec §9, Phase 1)
    let slabPathFactor = clamp(1.0 / muEff, 1.0, 2.5);
    alpha = (1.0 - exp(-alpha * slabPathFactor * 1.8));

    // Dual-lobe Henyey-Greenstein anisotropic phase function (Spec §11, Phase 3)
    let sunDirLen = length(cloud.u_sunDirection.xyz);
    let sunDir = select(vec3<f32>(0.0, 1.0, 0.0), cloud.u_sunDirection.xyz / sunDirLen, sunDirLen > 1e-4);
    let camDelta = cloud.u_cameraPos.xyz - in.worldPos;
    let camDist = length(camDelta);
    let viewDir = select(in.normal, camDelta / camDist, camDist > 1e-4);
    let cosTheta = dot(viewDir, sunDir);
    let muScat = -cosTheta;
    let phase = dualLobePhase(muScat, 0.72, 0.28, 0.82);
    let phaseFactor = clamp(phase * 4.0 * PI, 0.55, 1.85);

    let NdotL = max(0.0, dot(in.normal, sunDir));
    let selfShadow = mix(1.0 - cloud.u_shadowIntensity * 0.5, 1.0, NdotL);

    // Invariant §28: Exhaustive Multi-Medium Shader Parity
    // Explicit branches for u_theme == 0u, 1u, and 2u with period-accurate archival inks:
    // - Theme 0 (Marie Tharp 1977): Soft warm white (vec3(0.96, 0.96, 0.94)), semi-transparent, subtle cast shadows / underside darkening.
    // - Theme 1 (Cream Rag): Warm ivory watercolor washes (vec3(0.98, 0.95, 0.89)), absorbed into cellulose paper fiber tooth (u_paper_tooth).
    // - Theme 2 (Prussian Cyanotype 1842): Actinic white wisps (vec3(0.95, 0.98, 1.00)), photochemical blueprint exposure.
    var cloudColor: vec3<f32>;

    if (cloud.u_theme == 0u) {
        // Theme 0 (Marie Tharp 1977): Soft warm white with subtle underside darkening / cast shadows
        let coreWhite = vec3<f32>(0.96, 0.96, 0.94);
        let undersideShade = vec3<f32>(0.82, 0.85, 0.89) * selfShadow;
        cloudColor = mix(undersideShade, coreWhite * phaseFactor * selfShadow, smoothstep(0.15, 0.70, featheredCloud));
    } else if (cloud.u_theme == 1u) {
        // Theme 1 (Cream Rag): Warm ivory watercolor washes absorbed into cellulose paper fiber tooth (u_paper_tooth)
        let ivoryWash = vec3<f32>(0.98, 0.95, 0.89);

        // Metric latitude scaling for paper fiber tooth
        let toothCoord = vec2<f32>(in.uv.x * cosLat, in.uv.y) * 800.0;
        let paperNoise = hash12(toothCoord);
        let paperTooth = cloud.u_mediumProperties.w; // u_paper_tooth parameter
        let toothFactor = 1.0 - (paperNoise - 0.5) * (paperTooth * 0.35);

        // Stratum ink pigmentation (Milestone 4):
        // Layer 0 (Low Stratus): Layered gouache with subtle crevice density
        // Layer 1 (Mid Altocumulus): Soft umber wash
        // Layer 2 (High Cirrus): Translucent silverpoint hairlines (#4A423B with high alpha falloff)
        var stratumPigment: vec3<f32>;
        if (layerIdx == 0u) {
            let creviceTone = vec3<f32>(0.78, 0.72, 0.64);
            stratumPigment = mix(creviceTone, ivoryWash, smoothstep(0.20, 0.75, featheredCloud));
        } else if (layerIdx == 1u) {
            let umberTone = vec3<f32>(0.74, 0.67, 0.58);
            stratumPigment = mix(umberTone, ivoryWash, smoothstep(0.15, 0.65, featheredCloud));
        } else {
            let silverpointHairline = vec3<f32>(0.290, 0.259, 0.231); // #4A423B
            stratumPigment = mix(silverpointHairline, ivoryWash, smoothstep(0.25, 0.80, featheredCloud));
            let cirrusFalloff = pow(featheredCloud, 2.4);
            let hairlineMod = mix(0.70, 1.30, fract(sin(dot(toothCoord * 2.5, vec2<f32>(12.9898, 78.233))) * 43758.5453));
            alpha = alpha * cirrusFalloff * hairlineMod;
        }

        cloudColor = stratumPigment * toothFactor * phaseFactor * selfShadow;
        alpha = alpha * mix(0.85, 1.0, toothFactor);
    } else if (cloud.u_theme == 2u) {
        // Theme 2 (Prussian Cyanotype 1842): Actinic white wisps, photochemical blueprint exposure
        let actinicWhite = vec3<f32>(0.95, 0.98, 1.00);
        let gamma = max(0.5, cloud.u_mediumProperties.z);
        let actinicDensity = pow(featheredCloud, gamma);
        cloudColor = actinicWhite * phaseFactor * selfShadow;
        alpha = actinicDensity * baseLayerOpacity * cloud.u_layerOpacity.w * horizonAtten;
    } else {
        // Fallback branch
        cloudColor = vec3<f32>(0.96, 0.96, 0.94);
    }

    // Multi-Stratum Beer-Lambert inter-deck cast shadow attenuation (Spec §10)
    // Cartographic medium ink wash modulation (Rule 3)
    var shadowWashColor = vec3<f32>(0.20, 0.22, 0.25); // Theme 0 Marie Tharp
    if (cloud.u_theme == 1u) {
        shadowWashColor = vec3<f32>(0.353, 0.302, 0.255); // Theme 1 Cream Rag bistre wash #5A4D41
    } else if (cloud.u_theme == 2u) {
        shadowWashColor = vec3<f32>(0.043, 0.114, 0.227); // Theme 2 Prussian Cyanotype navy #0B1D3A
    }
    cloudColor = mix(shadowWashColor, cloudColor, interdeckShadow);

    // Invariant §5: Premultiplied Alpha Transparent Clear & Compositing
    // Output must be premultiplied alpha: vec4<f32>(color.rgb * alpha, alpha)
    let derivAnchor = (du_dx + du_dy + dv_dx + dv_dy + dUv.x) * 1.0e-7;
    let finalAlpha = clamp(alpha, 0.0, 1.0) + derivAnchor;
    return vec4<f32>(cloudColor * finalAlpha, finalAlpha);
}
