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

const PI: f32 = 3.141592653589793;
const TWO_PI: f32 = 6.283185307179586;
const RADIUS: f32 = 5.0;

// Strict 16-Byte Alignment Uniform Struct (Total: 288 bytes / 72 floats) (RFC §4.1)
struct CloudUniforms {
    u_unfurl: f32,                // offset 0 (float 0) - Manifold morph parameter [0..1]
    u_mode: u32,                  // offset 4 (float 1) - Simulation mode [0..4]
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
    u_pad: vec4<f32>,             // offset 144 (floats 36..39) - Reserved 16-byte pad
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

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) surfaceType: f32,
    @location(3) target2D: vec4<f32>, // xy: Mercator, zw: Dymaxion
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) facing: f32,
    @location(2) worldPos: vec3<f32>,
    @location(3) normal: vec3<f32>,
};

fn getRegionalBlendWeight(uv: vec2<f32>) -> f32 {
    if (u_regionalOverlay.u_regionalActive == 0u) {
        return 0.0;
    }

    let bounds = u_regionalOverlay.u_regionalBounds;
    let minLon = bounds.x;
    let minLat = bounds.y;
    let maxLon = bounds.z;
    let maxLat = bounds.w;

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

// Evaluates base manifold deformation across 5 paradigms
fn evaluateManifold(pos3D: vec3<f32>, mercator2D: vec2<f32>, dymaxion2D: vec2<f32>) -> vec3<f32> {
    let ease = cloud.u_unfurl * cloud.u_unfurl * (3.0 - 2.0 * cloud.u_unfurl);
    let pos2D = vec3<f32>(mercator2D.x, mercator2D.y, 0.0);

    if (cloud.u_mode == 1u) {
        // Mode 1: Cylindrical Scroll
        let oneMinusT = 1.0 - ease;
        if (oneMinusT > 0.001) {
            let invOneMinusT = 1.0 / oneMinusT;
            let lonRad = atan2(pos3D.x, pos3D.z);
            let curAngle = oneMinusT * lonRad;
            let latRad = asin(clamp(pos3D.y / RADIUS, -0.999, 0.999));
            let cosLat = cos(latRad);
            let curX = (RADIUS * invOneMinusT) * sin(curAngle);
            let curZ = (RADIUS * cosLat * invOneMinusT) * (cos(curAngle) - 1.0) + (RADIUS * cosLat * oneMinusT);
            let curY = mix(pos3D.y, pos2D.y, ease);
            return vec3<f32>(curX, curY, curZ);
        } else {
            return pos2D;
        }
    } else if (cloud.u_mode == 4u) {
        // Mode 4: Fuller Dymaxion
        let dym2D = vec3<f32>(dymaxion2D.x, dymaxion2D.y, 0.0);
        let arch = sin(PI * cloud.u_unfurl) * 0.45;
        let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);
        return mix(pos3D, dym2D, ease) + sphereNorm * arch;
    }

    // Default Modes 0, 2, 3 (Linear Mix)
    return mix(pos3D, pos2D, ease);
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
    let basePos = evaluateManifold(input.position, input.target2D.xy, input.target2D.zw);
    let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(input.position), length(input.position) > 0.001);
    let flatNorm = vec3<f32>(0.0, 0.0, 1.0);
    var normal = normalize(mix(sphereNorm, flatNorm, cloud.u_unfurl));
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
    let dynamicExp = mix(1.0, 1.8, orbitT) * (max(0.5, cloud.u_peakExponent) / 1.4);
    
    let poleDist = abs(input.uv.y - 0.5) * 2.0;
    let poleAtten = 1.0 - smoothstep(0.85, 0.98, poleDist);
    
    // Surface-conforming terrain crust displacement (Invariant §15 parity with crust_hydrosphere.wgsl)
    let crustDisp = pow(normH, max(0.5, dynamicExp)) * (cloud.u_layerStandoff.w * 2.8) * poleAtten;

    // Pitch-adaptive standoff exaggeration (Spec §2.3)
    let vCam = normalize(cloud.u_cameraPos.xyz - basePos);
    let NdotV = clamp(dot(normal, vCam) / 0.35, 0.0, 1.0);
    let k_exagg = 1.0 + (cloud.u_atmosphericScale - 1.0) * ((1.0 - NdotV) * (1.0 - NdotV));
    let effStandoff = baseStandoff * k_exagg;

    // Unified terrain-following displacement ensuring strict stratum hierarchy:
    // z_low < z_mid < z_high and z_layer >= crustDisp everywhere across all landforms.
    let totalOffset = crustDisp + effStandoff;

    // Morph participation with u_unfurl:
    // Evaluate world position along surface normal:
    // p_world = p_base + n_base * (delta_z_standoff + h_lift)
    // At alpha=1.0, n_base = (0, 0, 1), naturally preserving altitude standoff as vertical 3D offset above flattened terrain
    let worldP = basePos + normal * totalOffset;
    var effWorldP = worldP;

    if (cloud.u_mode == 1u) {
        let ease = cloud.u_unfurl * cloud.u_unfurl * (3.0 - 2.0 * cloud.u_unfurl);
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

    // Independent drift via u_cloudDrift uniform:
    // Modulate longitude UVs: uv.x = fract(uv.x + driftOffset),
    // where drift speed varies by altitude (e.g. Low 0.6x, Mid 1.0x, High 1.8x).
    let layerIdx = cloud.u_layerIndex;
    var driftSpeed = cloud.u_cloudDrift.x; // Low 0.6x
    if (layerIdx == 1u) {
        driftSpeed = cloud.u_cloudDrift.y; // Mid 1.0x
    } else if (layerIdx == 2u) {
        driftSpeed = cloud.u_cloudDrift.z; // High 1.8x
    }

    let driftOffset = cloud.u_time * driftSpeed * cloud.u_cloudDrift.w;
    let driftedU = fract(in.uv.x + driftOffset);
    let sampleUV = vec2<f32>(driftedU, in.uv.y);

    // Unconditional texture sampling at top of fs_main before any branch or discard
    let rawCloud = textureSampleLevel(u_cloudTexture, u_cloudSampler, sampleUV, 0.0).r;

    // Orographic lift & rain shadows via 2D wind-terrain coupling (Invariant §3, §15, §18, RFC Mechanic 4)
    // Sample u_demTexture and u_windTexture in unconditional uniform control flow at explicit LOD 0.0 strictly before discards
    let demDims = vec2<f32>(textureDimensions(u_demTexture));
    let dU = 1.0 / max(demDims.x, 1.0);
    let dV = 1.0 / max(demDims.y, 1.0);
    let uvEast = vec2<f32>(fract(in.uv.x + dU), in.uv.y);
    let uvWest = vec2<f32>(fract(in.uv.x + 1.0 - dU), in.uv.y);
    let uvNorth = vec2<f32>(in.uv.x, clamp(in.uv.y - dV, 0.001, 0.999));
    let uvSouth = vec2<f32>(in.uv.x, clamp(in.uv.y + dV, 0.001, 0.999));

    let demEastGlobal = textureSampleLevel(u_demTexture, u_demSampler, uvEast, 0.0);
    let demWestGlobal = textureSampleLevel(u_demTexture, u_demSampler, uvWest, 0.0);
    let demNorthGlobal = textureSampleLevel(u_demTexture, u_demSampler, uvNorth, 0.0);
    let demSouthGlobal = textureSampleLevel(u_demTexture, u_demSampler, uvSouth, 0.0);

    let demEast = sampleRegionalComposite(uvEast, demEastGlobal, 0.0);
    let demWest = sampleRegionalComposite(uvWest, demWestGlobal, 0.0);
    let demNorth = sampleRegionalComposite(uvNorth, demNorthGlobal, 0.0);
    let demSouth = sampleRegionalComposite(uvSouth, demSouthGlobal, 0.0);

    let elevEast = decodeElevation(demEast);
    let elevWest = decodeElevation(demWest);
    let elevNorth = decodeElevation(demNorth);
    let elevSouth = decodeElevation(demSouth);

    // Spherical metric tensor arc lengths (Invariant §18)
    let latRad = (0.5 - in.uv.y) * PI;
    let cosLat = max(0.1, cos(latRad));
    const EARTH_RADIUS: f32 = 6371000.0; // meters
    let dx = 2.0 * EARTH_RADIUS * cosLat * (dU * TWO_PI);
    let dy = 2.0 * EARTH_RADIUS * (dV * PI);
    let gradH = vec2<f32>((elevEast - elevWest) / dx, (elevNorth - elevSouth) / dy);

    // Sample 2D horizontal wind velocity (u, v) in m/s
    let windVel = textureSampleLevel(u_windTexture, u_windSampler, in.uv, 0.0).xy;
    let wOrographic = dot(windVel, gradH);

    // Stratum coupling attenuates vertical influence at higher layers
    let stratumCoupling = select(1.0, select(0.50, 0.15, layerIdx == 2u), layerIdx >= 1u);

    // Additive condensation & leeward rain shadow dissolution (RFC Mechanic 4)
    // Naturally dissolves clouds on leeward slopes (w < 0 -> tanh < 0)
    // and condenses clouds over windward peaks even when background cloud fraction is zero.
    let liftTerm = select(wOrographic * 50.0, ((elevEast - elevWest) / 8848.0) * 10.0, length(windVel) < 1e-4);
    let orographicLift = 0.35 * tanh(0.05 * liftTerm) * stratumCoupling;
    let condensedCloud = clamp(rawCloud + orographicLift, 0.0, 1.0);

    // Backward compatibility deltaH variables
    let deltaH = (elevEast - elevWest) / 8848.0;
    let windwardBoost = clamp(deltaH * 3.5, 0.0, 0.35);
    let leewardShadow = clamp(-deltaH * 4.0, 0.0, 0.70);
    let orographicFactor = 1.0 + (windwardBoost - leewardShadow) * stratumCoupling;

    // Invariant §10 standard: smoothstep(0.02, 0.20, in.facing)
    // Contract baseline: if (cloud.u_unfurl < 0.20 && in.facing < 0.02) { discard; }
    // Tailored for elevated tropospheric cloud shells (RFC Mechanic 2):
    let horizonAtten = smoothstep(-0.015, 0.04, in.facing);
    if (cloud.u_unfurl < 0.20 && in.facing < -0.015) {
        discard;
    }

    // Feathering threshold < 20%:
    // Values below 20% cloud fraction feather to 0 to prevent harsh blocky pixel steps from 0.25° GFS resolution.
    // Baseline raw feathering: let featheredCloud = smoothstep(0.0, 0.20, rawCloud);
    let featheredCloud = smoothstep(0.0, 0.20, condensedCloud);
    let effectiveCloud = clamp(condensedCloud * featheredCloud, 0.0, 1.0);

    if (effectiveCloud <= 0.001) {
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

    var alpha = effectiveCloud * baseLayerOpacity * cloud.u_layerOpacity.w * horizonAtten;

    // Cloud self-shadowing and anisotropic phase function (RFC Mechanic 1, §4.1)
    let sunDir = normalize(cloud.u_sunDirection.xyz);
    let viewDir = normalize(cloud.u_cameraPos.xyz - in.worldPos);
    let cosTheta = dot(viewDir, sunDir);
    const g: f32 = 0.40;
    const kPhase: f32 = 1.55 * g - 0.55 * g * g * g;
    let phase = (1.0 - kPhase * kPhase) / (4.0 * PI * (1.0 - kPhase * cosTheta) * (1.0 - kPhase * cosTheta));
    let phaseFactor = clamp(phase * 4.0 * PI, 0.6, 1.4);

    let NdotL = max(0.0, dot(in.normal, sunDir));
    let selfShadow = mix(0.70, 1.0, NdotL);

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

        cloudColor = ivoryWash * toothFactor * phaseFactor * selfShadow;
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

    // Invariant §5: Premultiplied Alpha Transparent Clear & Compositing
    // Output must be premultiplied alpha: vec4<f32>(color.rgb * alpha, alpha)
    let derivAnchor = (du_dx + du_dy + dv_dx + dv_dy + dUv.x) * 1.0e-7;
    let finalAlpha = clamp(alpha, 0.0, 1.0) + derivAnchor;
    return vec4<f32>(cloudColor * finalAlpha, finalAlpha);
}
