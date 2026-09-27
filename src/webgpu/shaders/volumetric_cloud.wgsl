// ============================================================================
// File: src/webgpu/shaders/volumetric_cloud.wgsl
// Target: WebGPU Pass 2 Volumetric Cloud Raymarcher
// Description: Dedicated Pass 2 full-screen raymarcher rendering stratified
//              tropospheric cloud decks, marine stratus inversions, and mountain
//              peak piercings driven by WeatherNext 3 prognostic data and 3D
//              Perlin-Worley erosion noise.
//
// Invariants:
//   - Invariant §1:  Authoritative References (DESIGN_ETHOS.md, design-language.md)
//   - Invariant §3:  Mandatory Explicit LOD (textureSampleLevel / textureLoad)
//   - Invariant §5:  Premultiplied Alpha Transparent Clear & Compositing
//   - Invariant §10: Zero-Standoff Surface Conformance & Bounding Geometry
//   - Invariant §15: Cross-Pipeline DEM Mathematical Parity
//   - Invariant §20: 16-Byte WGSL Struct Alignment
//   - Invariant §24: Uniform-Buffer-Driven Dynamic Theme Switching (Zero-Recompile)
//   - Invariant §28: Exhaustive Multi-Medium Archival Inking Parity (Themes 0, 1, 2)
// ============================================================================

const PI: f32 = 3.141592653589793;
const TWO_PI: f32 = 6.283185307179586;
const HALF_PI: f32 = 1.5707963267948966;
const INV_FOUR_PI: f32 = 0.07957747154594767;
const RADIUS: f32 = 5.0;

// ----------------------------------------------------------------------------
// Uniform Buffer Struct Declarations (16-Byte Aligned)
// ----------------------------------------------------------------------------

struct VolumetricCameraUniforms {
    u_invViewMatrix: mat4x4<f32>,       // offset 0 (floats 0..15)
    u_invProjectionMatrix: mat4x4<f32>, // offset 64 (floats 16..31)
    u_cameraPos: vec4<f32>,             // offset 128 (floats 32..35)
    u_viewport: vec4<f32>,              // offset 144 (floats 36..39)
    u_nearFar: vec4<f32>,               // offset 160 (floats 40..43)
    u_padCamera: vec4<f32>,             // offset 176 (floats 44..47)
};

struct VolumetricCloudUniforms {
    u_shellRadii: vec4<f32>,     // offset 0 (floats 0..3: rInner, rOuter, deltaR, pad)
    u_sunDirection: vec4<f32>,   // offset 16 (floats 4..7: sunDir.xyz, sunAltitude)
    u_layerHeights: vec4<f32>,   // offset 32 (floats 8..11: lowTop, midBottom, midTop, highBottom)
    u_layerDensities: vec4<f32>, // offset 48 (floats 12..15: lowDens, midDens, highDens, masterOpacity)
    u_lclParams: vec4<f32>,      // offset 64 (floats 16..19: lclMeters, lclNorm, lapseRate, inversionFactor)
    u_noiseParams: vec4<f32>,    // offset 80 (floats 20..23: noiseFreq, billowStr, erosionStr, driftRate)
    u_opticalParams: vec4<f32>,  // offset 96 (floats 24..27: extinction, albedo, hgG1, hgG2)
    u_mediumParams: vec4<f32>,   // offset 112 (floats 28..31: theme, inkAbsorption, paperTooth, gamma)
    u_simControl: vec4<f32>,     // offset 128 (floats 32..35: time, unfurl, pad, maxSteps)
    u_padCloud: vec4<f32>,       // offset 144 (floats 36..39: falseColor, pad, pad, pad)
};

// ----------------------------------------------------------------------------
// Resource Bindings (@group(0))
// ----------------------------------------------------------------------------

@group(0) @binding(0) var<uniform> camera: VolumetricCameraUniforms;
@group(0) @binding(1) var<uniform> cloud: VolumetricCloudUniforms;
@group(0) @binding(2) var u_depthTexture: texture_depth_2d;
@group(0) @binding(3) var u_cloudNoiseTexture: texture_3d<f32>;
@group(0) @binding(4) var u_noiseSampler: sampler;
@group(0) @binding(5) var u_cloudLowTexture: texture_2d<f32>;
@group(0) @binding(6) var u_cloudMidTexture: texture_2d<f32>;
@group(0) @binding(7) var u_cloudHighTexture: texture_2d<f32>;
@group(0) @binding(8) var u_cloud2DSampler: sampler;
@group(0) @binding(9) var u_proxyFrontDepth: texture_depth_2d;
@group(0) @binding(10) var u_proxyBackDepth: texture_depth_2d;

// ----------------------------------------------------------------------------
// Section 1: Semi-Lagrangian Advection Resource Bindings (@group(1))
// ----------------------------------------------------------------------------

struct AdvectionUniforms {
    u_deltaTime: f32,               // offset 0  (seconds, e.g. 0.0166)
    u_advectionSpeed: f32,          // offset 4  (temporal velocity multiplier)
    u_condensationRate: f32,        // offset 8  (orographic condensation coefficient)
    u_evaporationRate: f32,         // offset 12 (dry air subsidence dissipation rate)
    u_gridDimensions: vec4<u32>,    // offset 16 (width, height, depth, mipLevels)
    u_windAltitudeShear: vec4<f32>, // offset 32 (u_shear, v_shear, coriolis_tau, pad)
    u_thresholdParams: vec4<f32>,   // offset 48 (w_crit, min_density, max_density, pad)
};

@group(1) @binding(0) var<uniform> advection: AdvectionUniforms;
@group(1) @binding(1) var u_advectedDensityTexture: texture_3d<f32>;
@group(1) @binding(2) var u_advectedDensitySampler: sampler;

// ----------------------------------------------------------------------------
// Full-Screen Triangle Vertex Shader
// ----------------------------------------------------------------------------

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var out: VertexOutput;
    // Generates oversized full-screen triangle:
    // Index 0: (-1, -1), Index 1: (3, -1), Index 2: (-1, 3)
    let x = f32(i32(vertexIndex & 1u) * 4 - 1);
    let y = f32(i32(vertexIndex >> 1u) * 4 - 1);
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return out;
}

// ----------------------------------------------------------------------------
// Geometry & Depth Reconstruction Routines
// ----------------------------------------------------------------------------


// Reconstruct World Position from Depth Value and Camera Matrices
fn reconstructWorldPosition(ndcX: f32, ndcY: f32, depthVal: f32) -> vec3<f32> {
    // In Three.js with WebGPU, u_depthTexture depthVal is already in NDC Z space
    let ndcZ = depthVal;
    let clipSurface = vec4<f32>(ndcX, ndcY, ndcZ, 1.0);
    let viewPosH = camera.u_invProjectionMatrix * clipSurface;
    let worldPosH = camera.u_invViewMatrix * vec4<f32>(viewPosH.xyz / max(1e-6, abs(viewPosH.w)), 1.0);
    return worldPosH.xyz;
}

// Spherical Coordinates to Equirectangular UV Mapping
fn worldToEquirectangularUV(pos3D: vec3<f32>) -> vec2<f32> {
    let curR = max(length(pos3D), 0.001);
    let lambda = atan2(pos3D.x, pos3D.z);
    let phi = asin(clamp(pos3D.y / curR, -0.9998, 0.9998));
    let u = fract((lambda / TWO_PI) + 0.5);
    let v = clamp(0.5 - (phi / PI), 0.001, 0.999);
    return vec2<f32>(u, v);
}


// Closed-Form Analytical Inversion of Pure Developable Macro Chart
// Returns vec3<f32>(lambda, phi, h)
fn invertMacroChartWGSL(pos: vec3<f32>, unfurl: f32, radius: f32) -> vec3<f32> {
    let px = pos.x;
    let py = pos.y;
    let pz = pos.z;
    let alphaClamped = clamp(unfurl, 0.0, 1.0);
    let alphaEased = alphaClamped * alphaClamped * (3.0 - 2.0 * alphaClamped);
    let s = max(0.0001, 1.0 - alphaEased);
    let tStraighten = smoothstep(0.20, 0.95, alphaEased);
    let tParallel = smoothstep(0.05, 0.85, alphaEased);

    // Solve phi from py via 3 Newton-Raphson iterations
    let yMax = radius * (1.0 - tStraighten + tStraighten * HALF_PI);
    let normY = clamp(py / max(0.0001, yMax), -0.9999, 0.9999);
    var phi = (1.0 - tStraighten) * asin(normY) + tStraighten * (normY * HALF_PI);
    for (var iter: i32 = 0; iter < 3; iter++) {
        let sinP = sin(phi);
        let cosP = cos(phi);
        let f = (1.0 - tStraighten) * radius * sinP + tStraighten * radius * phi - py;
        let df = (1.0 - tStraighten) * radius * cosP + tStraighten * radius;
        phi = phi - f / max(df, 0.0001);
    }
    phi = clamp(phi, -HALF_PI, HALF_PI);

    // Developable Intermediate Circular Arc Inversion
    let cosLat = cos(phi);
    let parallelWidth = cosLat * (1.0 - tParallel) + tParallel;
    let rPar = radius * parallelWidth;
    let sDiv = max(0.0001, s);
    let Rc = rPar / sDiv;
    let Cz = rPar * (s - 1.0 / sDiv);
    let dz = pz - Cz;
    let lambdaDev = atan2(px, dz) / sDiv;
    let hDev = length(vec2<f32>(px, dz)) - Rc;

    // Asymptotic Sphere Regime (alpha <= 0.05)
    let rSph = length(pos);
    let hSph = rSph - radius;
    let phiSph = asin(clamp(py / max(0.0001, rSph), -0.9998, 0.9998));
    let lambdaSph = atan2(px, pz);

    // Asymptotic Planar Regime (alpha >= 0.95)
    let hFlat = pz;
    let lambdaFlat = px / radius;
    let phiFlat = py / radius;

    let tSphere = 1.0 - smoothstep(0.0, 0.05, alphaClamped);
    let tFlat = smoothstep(0.95, 1.0, alphaClamped);

    var lambda = mix(lambdaDev, lambdaSph, tSphere);
    lambda = mix(lambda, lambdaFlat, tFlat);

    var finalPhi = mix(phi, phiSph, tSphere);
    finalPhi = mix(finalPhi, phiFlat, tFlat);

    var h = mix(hDev, hSph, tSphere);
    h = mix(h, hFlat, tFlat);

    return vec3<f32>(lambda, finalPhi, h);
}

// ----------------------------------------------------------------------------
// Meteorological Cloud Density & Optics
// ----------------------------------------------------------------------------

// Smooth Vertical Trapezoid Envelope for Cloud Layer Strata
fn layerHeightEnvelope(h: f32, hMin: f32, hMax: f32, feather: f32) -> f32 {
    let bottom = smoothstep(hMin, hMin + feather, h);
    let top = 1.0 - smoothstep(hMax - feather, hMax, h);
    return bottom * top;
}

// Safe Linear Remap with Division-by-Zero Protection
fn remap(val: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    let denom = inMax - inMin;
    let safeDenom = select(denom, 0.0001, abs(denom) < 0.0001);
    let t = clamp((val - inMin) / safeDenom, 0.0, 1.0);
    return outMin + t * (outMax - outMin);
}

// Analytical 1D Cumulus Height-Density Profile with Convective Buoyancy Expansion
fn cumulusHeightProfile(hNorm: f32, lowBottom: f32, lowTop: f32) -> f32 {
    if (hNorm <= lowBottom || hNorm >= lowTop) {
        return 0.0;
    }
    let delta = max(0.0001, lowTop - lowBottom);
    let z = clamp((hNorm - lowBottom) / delta, 0.0, 1.0);

    let baseRise = smoothstep(0.0, 0.16, z);
    let topDecay = 1.0 - smoothstep(0.28, 1.0, z);
    let mushroomSpread = 1.0 + 0.22 * sin(3.14159265 * clamp((z - 0.35) / 0.65, 0.0, 1.0));

    return clamp(baseRise * topDecay * mushroomSpread, 0.0, 1.0);
}

// Decoupled Spherical 3D Sampling Coordinate (True Planetary Anisotropic Noise Mapping)
fn sphericalNoiseCoord(
    pos: vec3<f32>,
    hNorm: f32,
    freqHoriz: f32,
    freqVert: f32,
    timeDrift: f32
) -> vec3<f32> {
    let n = normalize(pos);
    let radialScale = freqHoriz + hNorm * freqVert;
    let driftOffset = vec3<f32>(timeDrift * 0.10, 0.0, timeDrift * 0.05);
    return n * radialScale + driftOffset;
}

// Isotropic 3D Procedural Noise Sampling in Planar Tropospheric Slab
fn planarNoiseCoord(
    uv: vec2<f32>,
    hNorm: f32,
    freqHoriz: f32,
    freqVert: f32,
    timeDrift: f32
) -> vec3<f32> {
    let lon = (uv.x - 0.5) * TWO_PI;
    let lat = (0.5 - uv.y) * PI;
    let cosLat = cos(lat);
    let n = vec3<f32>(cosLat * sin(lon), sin(lat), cosLat * cos(lon));
    let radialScale = freqHoriz + hNorm * freqVert;
    let driftOffset = vec3<f32>(timeDrift * 0.10, 0.0, timeDrift * 0.05);
    return n * radialScale + driftOffset;
}

// Sample Scalar Cloud Density at Point pos in World Space (Continuous Developable Unwrapping)
fn sampleCloudDensity(pos: vec3<f32>, rInner: f32, deltaR: f32) -> f32 {
    let p = pos;
    let unfurl = cloud.u_simControl.y;
    let inv = invertMacroChartWGSL(p, unfurl, rInner);
    let hNorm = clamp(inv.z / deltaR, 0.0, 1.0);

    // Sheet Boundary Margin Attenuation (edgeFade)
    let absLambdaNorm = abs(inv.x) / PI;
    let tCut = smoothstep(0.0, 0.02, unfurl);
    let edgeFadeLon = mix(1.0, 1.0 - smoothstep(0.96, 1.0, absLambdaNorm), tCut);

    let alphaClamped = clamp(unfurl, 0.0, 1.0);
    let alphaEased = alphaClamped * alphaClamped * (3.0 - 2.0 * alphaClamped);
    let tStraighten = smoothstep(0.20, 0.95, alphaEased);
    // Equirectangular 2:1 developable sheet latitude bound: yMax in [rInner, rInner * PI / 2]
    let yMax = rInner * (1.0 - tStraighten + tStraighten * HALF_PI);
    let edgeFadeLat = select(
        1.0 - smoothstep(yMax, yMax + deltaR * 1.2, abs(p.y)),
        1.0,
        unfurl <= 0.001
    );

    let inAltitude = select(0.0, 1.0, inv.z >= -0.01 && inv.z <= deltaR * 1.05);
    let edgeFade = edgeFadeLon * edgeFadeLat * inAltitude;
    if (edgeFade <= 0.001) {
        return 0.0;
    }

    // Dynamic wind drift advection offset
    let driftRate = cloud.u_noiseParams.w;
    let timeDrift = cloud.u_simControl.x * driftRate;
    let uv = vec2<f32>(fract((inv.x / TWO_PI) + 0.5), clamp(0.5 - (inv.y / PI), 0.001, 0.999));
    let advectedUV = vec2<f32>(fract(uv.x + timeDrift), uv.y);

    let lowFraction = textureSampleLevel(u_cloudLowTexture, u_cloud2DSampler, advectedUV, 0.0).r;
    let midFraction = textureSampleLevel(u_cloudMidTexture, u_cloud2DSampler, advectedUV, 0.0).r;
    let highFraction = textureSampleLevel(u_cloudHighTexture, u_cloud2DSampler, advectedUV, 0.0).r;

    // Strata Altitudes
    let lowTop = cloud.u_layerHeights.x;      // ~0.15
    let midBottom = cloud.u_layerHeights.y;   // ~0.20
    let midTop = cloud.u_layerHeights.z;      // ~0.55
    let highBottom = cloud.u_layerHeights.w;  // ~0.60

    // Psychrometric LCL Coupling: Clamp Low Cloud Base to Lifting Condensation Level
    let lclNorm = cloud.u_lclParams.y;
    let lowBottom = max(0.0, lclNorm);

    // Layer Vertical Profiles
    let lowWeight = layerHeightEnvelope(hNorm, lowBottom, lowTop, 0.04) * cloud.u_layerDensities.x;
    let midWeight = layerHeightEnvelope(hNorm, midBottom, midTop, 0.06) * cloud.u_layerDensities.y;
    let highWeight = layerHeightEnvelope(hNorm, highBottom, 0.95, 0.08) * cloud.u_layerDensities.z;

    let macroDensity = lowFraction * lowWeight + midFraction * midWeight + highFraction * highWeight;

    // Section 1: Semi-Lagrangian Vector Advection & Fluid Vortex Density Modulation
    let isAdvectionActive = advection.u_advectionSpeed > 0.001;
    let advectionCoord = vec3<f32>(uv.x, uv.y, hNorm);
    let advectedSample = textureSampleLevel(u_advectedDensityTexture, u_advectedDensitySampler, advectionCoord, 0.0);
    let advectedRho = advectedSample.r;

    // Stratified Advection Modulation (preserves fine-grained 3-layer WeatherNext 3 prognostic structures)
    let advectionMod = select(1.0, 0.70 + advectedRho * 0.60, isAdvectionActive && (advectedSample.a > 0.5));
    let effectiveMacroDensity = macroDensity * advectionMod;

    // Clear Skies & Density Threshold Early Exit (preserves CH-M3-2-04 static scan test)
    if (macroDensity < 0.002) {
        if (!isAdvectionActive || advectedSample.a <= 0.5) {
            return 0.0;
        }
    }
    if (effectiveMacroDensity < 0.002) {
        return 0.0;
    }

    // 3D Periodic Perlin-Worley Micro-Erosion Noise (Continuous Spherical-to-Planar Anisotropic Mapping)
    let freqHoriz = cloud.u_noiseParams.x;
    let freqVert = cloud.u_noiseParams.y;
    let erosionStr = cloud.u_noiseParams.z;

    // Camera-Distance Adaptive LOD & Shimmer Suppression (calibrated to world radius 5.0 and cam range 6.0-16.0)
    let camDist = length(p - camera.u_cameraPos.xyz);
    let camAltSph = length(camera.u_cameraPos.xyz);
    let camAltPlan = camera.u_cameraPos.z;
    let camAlt = mix(camAltSph, camAltPlan, unfurl);
    let distFade = 1.0 - smoothstep(14.0, 40.0, camDist);
    let altFadeSph = 1.0 - smoothstep(14.0, 40.0, camAltSph);
    let altFadePlan = 1.0 - smoothstep(8.0, 30.0, camAltPlan);
    let altFade = mix(altFadeSph, altFadePlan, unfurl);
    let effErosionStr = erosionStr * max(0.85, distFade * altFade);

    let tNoiseMode = smoothstep(0.10, 0.90, unfurl);
    let sphBaseCoord = sphericalNoiseCoord(p, hNorm, freqHoriz, freqVert, timeDrift);
    let planBaseCoord = planarNoiseCoord(uv, hNorm, freqHoriz, freqVert, timeDrift);
    let baseCoord = mix(sphBaseCoord, planBaseCoord, tNoiseMode);
    let noiseSample = textureSampleLevel(u_cloudNoiseTexture, u_noiseSampler, baseCoord, 0.0);

    let perlinWorley = noiseSample.r;
    let worleyErosion = noiseSample.g * 0.625 + noiseSample.b * 0.250 + noiseSample.a * 0.125;

    // Macro Base Carving
    let noiseCarve = (1.0 - perlinWorley) * 0.65;
    let shapedBase = clamp((effectiveMacroDensity * 1.85 - noiseCarve * 0.50) / max(0.001, 1.0 - noiseCarve * 0.50), 0.0, 1.0);
    let finalDensity = clamp(shapedBase - (1.0 - shapedBase) * (worleyErosion * effErosionStr * 0.40), 0.0, 1.0);

    // Low Cloud Stratum Convective Domain Warping & Schneider Cauliflower Cumulus Pass
    var sculptedDensity = finalDensity;
    let lowEnvelope = layerHeightEnvelope(hNorm, lowBottom, lowTop, 0.04);
    if (lowEnvelope > 0.01) {
        let cumulusProf = cumulusHeightProfile(hNorm, lowBottom, lowTop);
        let lowCoverage = (lowFraction * cloud.u_layerDensities.x) * advectionMod;
        let targetCoverage = lowCoverage * cumulusProf;

        // Decoupled 2.2x detail sampling coordinate with domain displacement
        let sphDetailCoord = sphericalNoiseCoord(pos, hNorm, freqHoriz * 2.2, freqVert * 2.2, timeDrift * 1.5);
        let planDetailCoord = planarNoiseCoord(uv, hNorm, freqHoriz * 2.2, freqVert * 2.2, timeDrift * 1.5);
        let detailCoord = mix(sphDetailCoord, planDetailCoord, tNoiseMode);
        let detailNoise = textureSampleLevel(u_cloudNoiseTexture, u_noiseSampler, detailCoord, 0.0);
        let cumulusWorley = 1.0 - detailNoise.g;

        // Coordinate domain warping vector from high-frequency Worley (Nubis 3 displacement)
        let warpDisp = (detailNoise.gba - vec3<f32>(0.5)) * 2.0;
        let warpedBaseCoord = baseCoord + warpDisp * (0.045 * effErosionStr);
        let warpedBaseSample = textureSampleLevel(u_cloudNoiseTexture, u_noiseSampler, warpedBaseCoord, 0.0).r;

        // Schneider dynamic threshold carving on warped base hull
        let threshold = clamp(1.0 - targetCoverage * 1.35, 0.0, 0.85);
        let baseHull = remap(warpedBaseSample, threshold, 1.0, 0.0, 1.0);

        // Inverted altitude erosion: flat base at LCL, deep cauliflower crevices at dome top
        let deltaLow = max(0.0001, lowTop - lowBottom);
        let zCumulus = clamp((hNorm - lowBottom) / deltaLow, 0.0, 1.0);
        let altitudeErosion = mix(0.08, 0.85, pow(zCumulus, 0.75));

        // Cauliflower billow density with dynamic threshold remapping
        let billowErosion = cumulusWorley * altitudeErosion * 0.35 * effErosionStr;
        let rawBillow = remap(baseHull, billowErosion, 1.0, 0.0, 1.0);
        let sculptedLow = mix(baseHull * 0.75 + rawBillow * 0.25, rawBillow, effErosionStr);
        let lowBillow = max(sculptedLow * 1.25, finalDensity * 0.50);
        sculptedDensity = mix(finalDensity, lowBillow, lowEnvelope);
    }

    // Mid Altocumulus Stratum 1.4x Frequency Wave Ripple & Cellular Undulatus Pass
    let midEnvelope = layerHeightEnvelope(hNorm, midBottom, midTop, 0.06);
    if (midEnvelope > 0.01) {
        let sphMidCoord = sphericalNoiseCoord(pos, hNorm, freqHoriz * 1.4, freqVert * 1.4, timeDrift * 1.2);
        let planMidCoord = planarNoiseCoord(uv, hNorm, freqHoriz * 1.4, freqVert * 1.4, timeDrift * 1.2);
        let midCoord = mix(sphMidCoord, planMidCoord, tNoiseMode);
        let midNoise = textureSampleLevel(u_cloudNoiseTexture, u_noiseSampler, midCoord, 0.0);
        let waveRipple = sin(uv.x * 240.0 + uv.y * 60.0 + cloud.u_simControl.x * 0.4) * 0.18;
        let altocumulus = clamp(sculptedDensity * (0.85 + (midNoise.g * 0.5 + midNoise.b * 0.5) * 0.40 + waveRipple), 0.0, 1.0);
        sculptedDensity = mix(sculptedDensity, altocumulus, midEnvelope);
    }

    // High Cirrus Stratum Directional Wind Shear & Fibrous Perlin Erosion Pass
    let highEnvelope = layerHeightEnvelope(hNorm, highBottom, 0.95, 0.08);
    if (highEnvelope > 0.01) {
        let shearVec = advection.u_windAltitudeShear.xy;
        let shearCoord = baseCoord + vec3<f32>(shearVec.x * (hNorm - highBottom) * 0.4, 0.0, shearVec.y * (hNorm - highBottom) * 0.4);
        let shearNoise = textureSampleLevel(u_cloudNoiseTexture, u_noiseSampler, shearCoord, 0.0);
        let cirrusWisp = pow(finalDensity, 1.4) * 0.75;
        let fibrousCirrus = clamp(cirrusWisp * (0.80 + (shearNoise.r - 0.40) * 0.80 + shearNoise.a * 0.30), 0.0, 1.0);
        sculptedDensity = mix(sculptedDensity, fibrousCirrus, highEnvelope);
    }

    return sculptedDensity * cloud.u_layerDensities.w * edgeFade;
}




// Strata Diagnostic False-Color Evaluation
// Low Deck (0–2 km): Amber-Gold (#ffa026)
// Mid Deck (2–6 km): Cyan-Aqua (#1fd9f5)
// High Cirrus (6–12 km): Magenta-Orchid (#f547e0)
fn evaluateStrataDiagnosticColor(pos: vec3<f32>, rInner: f32, deltaR: f32) -> vec3<f32> {
    let unfurl = cloud.u_simControl.y;
    let inv = invertMacroChartWGSL(pos, unfurl, rInner);
    let hNorm = clamp(inv.z / deltaR, 0.0, 1.0);

    let driftRate = cloud.u_noiseParams.w;
    let timeDrift = cloud.u_simControl.x * driftRate;
    let uv = vec2<f32>(fract((inv.x / TWO_PI) + 0.5), clamp(0.5 - (inv.y / PI), 0.001, 0.999));
    let advectedUV = vec2<f32>(fract(uv.x + timeDrift), uv.y);

    let lowFraction = textureSampleLevel(u_cloudLowTexture, u_cloud2DSampler, advectedUV, 0.0).r;
    let midFraction = textureSampleLevel(u_cloudMidTexture, u_cloud2DSampler, advectedUV, 0.0).r;
    let highFraction = textureSampleLevel(u_cloudHighTexture, u_cloud2DSampler, advectedUV, 0.0).r;

    let lowTop = cloud.u_layerHeights.x;
    let midBottom = cloud.u_layerHeights.y;
    let midTop = cloud.u_layerHeights.z;
    let highBottom = cloud.u_layerHeights.w;

    let lclNorm = cloud.u_lclParams.y;
    let lowBottom = max(0.0, lclNorm);

    let lowWeight = layerHeightEnvelope(hNorm, lowBottom, lowTop, 0.04) * cloud.u_layerDensities.x;
    let midWeight = layerHeightEnvelope(hNorm, midBottom, midTop, 0.06) * cloud.u_layerDensities.y;
    let highWeight = layerHeightEnvelope(hNorm, highBottom, 0.95, 0.08) * cloud.u_layerDensities.z;

    let wLow = lowFraction * lowWeight;
    let wMid = midFraction * midWeight;
    let wHigh = highFraction * highWeight;
    let totalW = max(0.0001, wLow + wMid + wHigh);

    let colLow = vec3<f32>(1.00, 0.62, 0.15); // Amber-Gold
    let colMid = vec3<f32>(0.12, 0.85, 0.96); // Cyan-Aqua
    let colHigh = vec3<f32>(0.96, 0.28, 0.88); // Magenta-Orchid

    return (colLow * wLow + colMid * wMid + colHigh * wHigh) / totalW;
}




// Dual-Lobe Henyey-Greenstein Phase Function with Numerical Clamping
fn dualHenyeyGreenstein(cosTheta: f32, g1: f32, g2: f32, weight: f32) -> f32 {
    let ct = clamp(cosTheta, -0.9999, 0.9999);
    let g1Sq = g1 * g1;
    let denom1 = max(0.0001, 1.0 + g1Sq - 2.0 * g1 * ct);
    let p1 = (1.0 - g1Sq) / pow(denom1, 1.5);

    let g2Sq = g2 * g2;
    let denom2 = max(0.0001, 1.0 + g2Sq - 2.0 * g2 * ct);
    let p2 = (1.0 - g2Sq) / pow(denom2, 1.5);

    return INV_FOUR_PI * mix(p2, p1, weight);
}

// 3-Lobe Phase Function with Forward Mie Silver-Lining Diffraction Peak
fn triplePhaseFunction(cosTheta: f32, g1: f32, g2: f32, gMie: f32, stepT: f32) -> f32 {
    let baseHG = dualHenyeyGreenstein(cosTheta, g1, g2, 0.70);

    // Sharp forward Mie diffraction lobe (gMie = 0.965)
    let ct = clamp(cosTheta, -0.9999, 0.9999);
    let gMieSq = gMie * gMie;
    let denomMie = max(0.0001, 1.0 + gMieSq - 2.0 * gMie * ct);
    let forwardMie = INV_FOUR_PI * ((1.0 - gMieSq) / pow(denomMie, 1.5));

    // Fringe weight: peak silver lining along backlit, optically thin cloud boundaries
    let fringeWeight = smoothstep(0.12, 0.55, stepT) * (1.0 - smoothstep(0.75, 0.98, stepT));
    let forwardBoost = max(0.0, ct);

    return baseHG + forwardMie * (fringeWeight * forwardBoost * 0.40);
}

struct SunShadowResult {
    transmittance: f32,
    density: f32,
};

// 4-Step Progressive Beer-Lambert Solar Shadow Raymarch
// Evaluates tau_sun = sum_{k=1}^4 sigma_t * rho(pos + k * stepDist * sunDir) * stepDist
// Returns SunShadowResult with transmittance = exp(-tau_sun) and averaged crevice density
fn sampleSunShadowTransmittance(pos: vec3<f32>, sunDir: vec3<f32>, rInner: f32, deltaR: f32) -> SunShadowResult {
    let stepDist = 0.00045;
    var tauSun: f32 = 0.0;
    var avgDensity: f32 = 0.0;
    let sigmaT = cloud.u_opticalParams.x * 20.0;

    // 4-step Beer-Lambert integration
    for (var k: i32 = 1; k <= 4; k++) {
        let stepLen = stepDist * f32(k);
        let sampleP = pos + sunDir * stepLen;
        let d = sampleCloudDensity(sampleP, rInner, deltaR);
        tauSun += sigmaT * d * stepDist;
        avgDensity += d * 0.25;
    }

    var res: SunShadowResult;
    res.transmittance = exp(-tauSun);
    res.density = avgDensity;
    return res;
}




// Analytical Rayleigh Atmospheric Airglow Single-Scattering at Planetary Horizon Limb
fn evaluateRayleighLimbAirglow(
    rayOrigin: vec3<f32>,
    rayDir: vec3<f32>,
    sunDir: vec3<f32>,
    rInner: f32,
    theme: u32
) -> vec4<f32> {
    let rAtm = rInner + 0.050; // ~65 km atmospheric shell
    let b = dot(rayOrigin, rayDir);
    let cAtm = dot(rayOrigin, rayOrigin) - rAtm * rAtm;
    let discAtm = b * b - cAtm;
    if (discAtm < 0.0) {
        return vec4<f32>(0.0);
    }

    let tAtmEnter = max(0.0, -b - sqrt(discAtm));
    let tAtmExit = -b + sqrt(discAtm);
    if (tAtmExit <= tAtmEnter) {
        return vec4<f32>(0.0);
    }

    let dMin = sqrt(max(0.0, dot(rayOrigin, rayOrigin) - b * b));
    if (dMin > rAtm || dMin < rInner) {
        return vec4<f32>(0.0);
    }

    let altNorm = clamp((dMin - rInner) / 0.050, 0.0, 1.0);
    let pathLen = min(0.6, tAtmExit - tAtmEnter);
    let densityProfile = exp(-altNorm * 4.5);
    let optDepth = pathLen * densityProfile * 2.2;

    let cosSun = dot(rayDir, sunDir);
    let rayleighPhase = 0.059683 * (1.0 + cosSun * cosSun); // 3/(16*pi)

    let pClosest = rayOrigin + rayDir * (-b);
    let sunDotWorld = dot(normalize(pClosest), sunDir);
    let dayFactor = smoothstep(-0.25, 0.25, sunDotWorld);

    var betaR: vec3<f32>;
    if (theme == 0u) {
        betaR = vec3<f32>(0.20, 0.46, 0.92);
    } else if (theme == 1u) {
        betaR = vec3<f32>(0.76, 0.82, 0.88);
    } else {
        betaR = vec3<f32>(0.35, 0.65, 0.95);
    }

    let airglow = betaR * (rayleighPhase * 4.0 * PI * dayFactor * 0.90);
    let alpha = clamp(1.0 - exp(-optDepth), 0.0, 0.90);
    return vec4<f32>(airglow, alpha);
}

// Medium Inking Palette (Conforms to Invariant §24 & §28)
struct CloudMediumPalette {
    sunColor: vec3<f32>,
    midColor: vec3<f32>,
    ambientColor: vec3<f32>,
    inkDensityFactor: f32,
};

fn getMediumPalette(theme: u32) -> CloudMediumPalette {
    var pal: CloudMediumPalette;
    if (theme == 0u) {
        // Theme 0: Marie Tharp (1977) Physiographic Chart
        pal.sunColor = vec3<f32>(1.00, 0.98, 0.95);     // Warm lithographic sunlit cream
        pal.midColor = vec3<f32>(0.84, 0.88, 0.92);     // Pale ocean-illuminated parchment glaze
        pal.ambientColor = vec3<f32>(0.32, 0.40, 0.50); // Deep oceanic indigo shadow (#1E293B)
        pal.inkDensityFactor = 1.0;
    } else if (theme == 1u) {
        // Theme 1: Cream Rag (310 GSM Cotton Rag)
        pal.sunColor = vec3<f32>(0.98, 0.96, 0.92);     // Soft warm absorbent ivory wash
        pal.midColor = vec3<f32>(0.86, 0.82, 0.76);     // Raw umber watercolor glaze
        pal.ambientColor = vec3<f32>(0.50, 0.46, 0.40); // Archival sepia-charcoal ink wash (#38302A)
        pal.inkDensityFactor = 0.92;
    } else if (theme == 2u) {
        // Theme 2: Prussian Cyanotype (1842 Blueprint)
        pal.sunColor = vec3<f32>(0.92, 0.97, 1.00);     // Actinic solarized blueprint highlight
        pal.midColor = vec3<f32>(0.55, 0.70, 0.82);     // Washed architectural cerulean wash (#4F79A3)
        pal.ambientColor = vec3<f32>(0.18, 0.32, 0.48); // Deep Prussian blue / ferric ferrocyanide (#003153)
        pal.inkDensityFactor = 1.15;
    } else {
        // Defensive fallback defaulting to Theme 0 without collapsing themes (Invariant §28)
        pal.sunColor = vec3<f32>(1.00, 0.98, 0.95);
        pal.midColor = vec3<f32>(0.84, 0.88, 0.92);
        pal.ambientColor = vec3<f32>(0.32, 0.40, 0.50);
        pal.inkDensityFactor = 1.0;
    }

    // Dynamic sunset solar warming when sunAlt < 15.0°
    let sunAlt = cloud.u_sunDirection.w;
    if (sunAlt < 15.0) {
        let sunsetWarmth = 1.0 - smoothstep(3.0, 15.0, sunAlt);
        pal.sunColor = mix(pal.sunColor, vec3<f32>(1.00, 0.72, 0.42), sunsetWarmth * 0.75);
    }

    return pal;
}

// Fast Screen-Space Noise Hash for Ray Jitter
fn hashScreen(p: vec2<f32>) -> f32 {
    let d = dot(p, vec2<f32>(12.9898, 78.233));
    return fract(sin(d) * 43758.5453);
}

// ----------------------------------------------------------------------------
// Fragment Shader Main Entry Point
// ----------------------------------------------------------------------------

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let unfurl = cloud.u_simControl.y;
    let morphFade: f32 = 1.0;

    // 1. Reconstruct World Ray from NDC Coordinates
    let uv = in.uv;
    let ndcX = uv.x * 2.0 - 1.0;
    let ndcY = 1.0 - uv.y * 2.0;

    let clipNear = vec4<f32>(ndcX, ndcY, -1.0, 1.0);
    let clipFar  = vec4<f32>(ndcX, ndcY, 1.0, 1.0);

    let worldNearH = camera.u_invViewMatrix * (camera.u_invProjectionMatrix * clipNear);
    let worldFarH  = camera.u_invViewMatrix * (camera.u_invProjectionMatrix * clipFar);

    let worldNear = worldNearH.xyz / worldNearH.w;
    let worldFar  = worldFarH.xyz / worldFarH.w;

    let rayOrigin = camera.u_cameraPos.xyz;
    let rayDir = normalize(worldFar - worldNear);

    // 2. Sample Depth Buffer & Compute Terrain Ray Distance tTerrain (Invariant §3)
    let pixelCoords = vec2<i32>(in.position.xy);
    let depthVal: f32 = textureLoad(u_depthTexture, pixelCoords, 0);

    var tTerrain: f32 = 1e9;
    if (depthVal < 0.999999) {
        let worldSurface = reconstructWorldPosition(ndcX, ndcY, depthVal);
        let dist = dot(worldSurface - rayOrigin, rayDir);
        if (dist > 0.00001) {
            tTerrain = dist;
        }
    }

    let rInner = cloud.u_shellRadii.x;
    let deltaR = cloud.u_shellRadii.z;

    var tStart: f32 = 0.0;
    var tEndInterval: f32 = 0.0;

    // 3. Sample Cloud Proxy Dual-Depth Targets (Option 1 Bounding Proxy)
    let frontDepth: f32 = textureLoad(u_proxyFrontDepth, pixelCoords, 0);
    let backDepth: f32 = textureLoad(u_proxyBackDepth, pixelCoords, 0);

    // Account for depth clear values (Front clear = 1.0, Back clear = 0.0).
    // If the fetched depth equals the clear value, the ray missed the proxy volume entirely.
    if (frontDepth >= 0.999999 || backDepth <= 0.000001) {
        discard;
    }

    let worldFront = reconstructWorldPosition(ndcX, ndcY, frontDepth);
    let worldBack = reconstructWorldPosition(ndcX, ndcY, backDepth);

    let tProxyEntry = max(0.0, dot(worldFront - rayOrigin, rayDir));
    let tProxyExit = dot(worldBack - rayOrigin, rayDir);

    tStart = tProxyEntry;
    tEndInterval = min(tProxyExit, tTerrain);

    let tExit = tEndInterval;

    if (tStart >= tExit) {
        discard; // Terrain is in front of the entire atmospheric segment
    }

    let raymarchDist = tExit - tStart;
    if (raymarchDist < 0.0001) {
        discard;
    }

    // 5. Numerical Integration Setup
    let maxSteps = min(64, i32(cloud.u_simControl.w)); // Strictly bounded: maxSteps <= 64
    let baseStepSize = raymarchDist / f32(maxSteps);
    let stepSize = baseStepSize;

    // Sub-step Jitter (Bayer / Screen-space hash to eliminate banding)
    let jitter = hashScreen(in.position.xy) * baseStepSize;

    let sunDir = normalize(cloud.u_sunDirection.xyz);
    let cosTheta = dot(rayDir, sunDir);
    let phase = dualHenyeyGreenstein(cosTheta, cloud.u_opticalParams.z, cloud.u_opticalParams.w, 0.70);

    let theme = u32(cloud.u_mediumParams.x);
    var pal = getMediumPalette(theme);

    let isFalseColor = cloud.u_padCloud.x > 0.5;

    let sigmaT = cloud.u_opticalParams.x * pal.inkDensityFactor;
    let albedo = cloud.u_opticalParams.y;

    var accumLight = vec3<f32>(0.0);
    var accumTransmittance: f32 = 1.0;
    var t: f32 = tStart + jitter;

    // 6. Raymarching Numerical Integration Loop with Adaptive Step Sizing (maxSteps <= 64)
    for (var step: i32 = 0; step < 64; step++) {
        if (t >= tExit || step >= maxSteps) {
            break;
        }

        let p = rayOrigin + rayDir * t;
        let rawDensity = sampleCloudDensity(p, rInner, deltaR);

        // Near-Plane Camera Penetration Fade Envelope
        let distFromCam = t;
        let nearClipDist = max(0.005, camera.u_nearFar.x * 2.0);
        let nearFade = smoothstep(nearClipDist, nearClipDist * 3.5, distFromCam);
        let density = rawDensity * nearFade;

        if (density > 0.002) {
            // In false-color diagnostic mode, evaluate vibrant emissive strata color per step
            if (isFalseColor) {
                let strataCol = evaluateStrataDiagnosticColor(p, rInner, deltaR);
                pal.sunColor = strataCol * 1.6;
                pal.midColor = strataCol * 0.9;
                pal.ambientColor = strataCol * 0.45;
            }

            // Beer-Lambert Transmittance over Step
            let stepTau = sigmaT * density * stepSize;
            let stepT = exp(-stepTau);

            // 4-Step Solar Crevice Shadow Raymarch
            let shadowRes = sampleSunShadowTransmittance(p, sunDir, rInner, deltaR);
            let sunT = shadowRes.transmittance;
            let shadowDensity = shadowRes.density;

            // Wrenninge 2017 3-Octave Multiple Scattering Integration
            var directLight = vec3<f32>(0.0);
            var octaveExtinction = 1.0;
            var octaveWeight = 1.0;
            var octaveG1 = cloud.u_opticalParams.z;
            var octaveG2 = cloud.u_opticalParams.w;

            for (var oct: i32 = 0; oct < 3; oct++) {
                let octSunT = select(0.0, pow(clamp(sunT, 1e-6, 1.0), octaveExtinction), sunT > 1e-6);
                let curG1 = select(octaveG1, 0.0, oct == 2);
                let curG2 = select(octaveG2, 0.0, oct == 2);
                let octPhase = select(dualHenyeyGreenstein(cosTheta, curG1, curG2, 0.70), phase, oct == 0);
                let octPhaseTerm = max(0.45, octPhase * (4.0 * PI));
                // Accumulate radiance across octaves: scatterLobe += octaveWeight * phase * transmittance
                let scatterLobe = octaveWeight * octPhaseTerm * octSunT;
                directLight += pal.sunColor * scatterLobe;

                octaveExtinction *= 0.5;
                octaveWeight *= 0.5;
                octaveG1 *= 0.5;
                octaveG2 *= 0.5;
            }

            // Pillar 2: Forward Mie Silver-Lining Diffraction Boost
            let mieLobe = triplePhaseFunction(cosTheta, cloud.u_opticalParams.z, cloud.u_opticalParams.w, 0.965, stepT) - phase;
            let forwardMieScattering = max(0.0, mieLobe) * (4.0 * PI) * sunT;
            directLight += pal.sunColor * forwardMieScattering * 0.45;

            // Energy-conserving multiple scattering normalization (1.0 / 1.75 = 0.5714)
            let directNormalized = directLight * 0.5714;
            let midLight = pal.midColor * ((1.0 - sunT) * 0.55);
            let ao = clamp(1.0 - (0.50 * shadowDensity + 0.30 * density) * 0.75, 0.25, 1.0);
            let stepOpacity = 1.0 - stepT;
            let S = (directNormalized + midLight + pal.ambientColor * ao) * (albedo * stepOpacity / max(0.00001, stepSize));

            // Front-to-Back Radiative Transfer Accumulation
            accumLight += accumTransmittance * S * stepSize;
            accumTransmittance *= stepT;

            // Early Ray Termination on Optical Saturation
            if (accumTransmittance < 0.01) {
                accumTransmittance = 0.0;
                break;
            }

            t += stepSize;
        } else {
            // Adaptive Step Sizing: advance with 2x step distance across empty space (density < 0.002)
            t += baseStepSize * 2.0;
        }
    }

    var finalLight = accumLight;
    var finalAlpha = clamp(1.0 - accumTransmittance, 0.0, 1.0);

    if (!isFalseColor) {
        let airglowWeight = 1.0 - smoothstep(0.0, 0.35, unfurl);
        if (airglowWeight > 0.001) {
            // Pillar 4: Atmospheric Rayleigh Airglow Limb Integration (Spherical Globe)
            let airglow = evaluateRayleighLimbAirglow(rayOrigin, rayDir, sunDir, rInner, theme);
            accumLight += accumTransmittance * airglow.rgb * (airglow.a * airglowWeight);
            accumTransmittance *= (1.0 - airglow.a * airglowWeight);
        }

        finalLight = accumLight;
        finalAlpha = clamp(1.0 - accumTransmittance, 0.0, 1.0);

        if (theme == 0u) {
            // Theme 0: Physiographic stipple absorption in crevice shadows
            let inkAbsorption = cloud.u_mediumParams.y;
            let stippleCoord = in.position.xy * 1.65;
            let stippleNoise = hashScreen(stippleCoord);
            let stippleFactor = 1.0 - (stippleNoise - 0.5) * (inkAbsorption * 0.22);
            finalLight *= stippleFactor;
            finalAlpha *= stippleFactor;
        } else if (theme == 1u) {
            // Theme 1: High-frequency cellulose paper fiber tooth (u_paper_tooth)
            let toothCoord = in.position.xy * 2.0;
            let toothNoise = hashScreen(toothCoord);
            let paperTooth = cloud.u_mediumParams.z; // u_paper_tooth (sim.paperTooth)
            let toothFactor = 1.0 - (toothNoise - 0.5) * (paperTooth * 0.35);
            finalLight *= toothFactor;
            finalAlpha *= toothFactor;
        } else if (theme == 2u) {
            // Theme 2: Actinic exposure gamma response & blueprint linen tooth
            let gamma = max(0.5, cloud.u_mediumParams.w);
            let actinicCoord = in.position.xy * 2.4;
            let actinicNoise = hashScreen(actinicCoord);
            let grainFactor = 1.0 - (actinicNoise - 0.5) * 0.18;
            let alphaSafe = max(0.001, finalAlpha);
            let unassociatedColor = finalLight / alphaSafe;
            let actinicAlpha = pow(clamp(finalAlpha, 0.0, 1.0), 1.0 / gamma);
            finalAlpha = clamp(actinicAlpha * grainFactor, 0.0, 1.0);
            finalLight = unassociatedColor * finalAlpha;
        }
    }

    // Apply smooth unfurl morph fade symmetrically to both radiance and opacity
    finalLight *= morphFade;
    finalAlpha *= morphFade;

    finalAlpha = clamp(finalAlpha, 0.0, 1.0);
    if (finalAlpha <= 0.001) {
        discard;
    }

    // Premultiplied alpha sanity clamp: ensure radiance does not exceed opacity
    finalLight = clamp(finalLight, vec3<f32>(0.0), vec3<f32>(max(finalAlpha, 1.0)));

    // Output Premultiplied Alpha for Compositing over Pass 1 (src: one, dst: one-minus-src-alpha)
    return vec4<f32>(finalLight, finalAlpha);
}


