/**
 * testbed/weather-shaders.js
 *
 * Dedicated WGSL shader sources for the Weather & Troposphere Testbed.
 * Implements:
 *   1. CRUST_TERRAIN_WGSL: Planetary crust with DEM displacement & dynamic cloud ground shadow.
 *   2. VOLUMETRIC_CLOUD_WGSL: Stratified full-screen raymarcher with continuous altitude penetration,
 *      Wrenninge multiple scattering, 3D Perlin-Worley noise, and archival medium inking.
 *
 * Conforms to:
 *   - Invariant §3: Unconditional Derivative Evaluation
 *   - Invariant §5: Premultiplied Alpha Transparent Clear
 *   - Invariant §10: Horizon Tangent Attenuation
 *   - Invariant §15: Cross-Pipeline DEM Geoid Parity (elevMeters = demSample.a * 19772.0 - 10924.0)
 *   - Invariant §20: 16-Byte WGSL Struct Alignment
 *   - Invariant §24: Uniform-Driven Theme Switching
 *   - Invariant §28: Multi-Medium Archival Inking Parity (0: Tharp, 1: Cream Rag, 2: Cyanotype)
 *   - Invariant §29: Strict Scalar/Vec4 Uniform Packing
 */

export const CRUST_TERRAIN_WGSL = /* wgsl */ `
struct CameraUniforms {
    viewMatrix: mat4x4<f32>,
    projectionMatrix: mat4x4<f32>,
    invViewMatrix: mat4x4<f32>,
    invProjectionMatrix: mat4x4<f32>,
    cameraPos: vec4<f32>,
    viewport: vec4<f32>,
};

struct TerrainUniforms {
    sunDir: vec4<f32>,          // xyz: sun direction, w: sun altitude deg
    terrainParams: vec4<f32>,   // x: dispScale, y: shadowIntensity, z: theme, w: unfurl
    paletteParams: vec4<f32>,   // x: inkAbsorption, y: paperTooth, z: exposureGamma, w: time
};

@group(0) @binding(0) var<uniform> cam: CameraUniforms;
@group(0) @binding(1) var<uniform> terrain: TerrainUniforms;
@group(0) @binding(2) var u_demTexture: texture_2d<f32>;
@group(0) @binding(3) var u_demSampler: sampler;
@group(0) @binding(4) var u_cloudShadowTexture: texture_2d<f32>;
@group(0) @binding(5) var u_cloudShadowSampler: sampler;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) normal: vec3<f32>,
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) worldPos: vec3<f32>,
    @location(2) normal: vec3<f32>,
    @location(3) facing: f32,
};

const PI: f32 = 3.141592653589793;
const TWO_PI: f32 = 6.283185307179586;
const RADIUS: f32 = 5.0;

// Mode 0 Developable Manifold Transform (Symmetric Arc Unfurl)
fn evaluateDevelopableManifold(pSphere: vec3<f32>, uv: vec2<f32>, alpha: f32) -> vec3<f32> {
    if (alpha <= 0.0001) {
        return pSphere;
    }
    let lonRad = (uv.x - 0.5) * TWO_PI;
    let latRad = (0.5 - uv.y) * PI;

    let s = max(0.001, 1.0 - alpha);
    let rPar = RADIUS * cos(latRad);
    let uAngle = s * lonRad;

    var curX: f32;
    var curZ: f32;
    if (abs(uAngle) > 0.02) {
        curX = rPar * sin(uAngle) / s;
        curZ = rPar * (cos(uAngle) - 1.0) / s + rPar * s;
    } else {
        let u2 = uAngle * uAngle;
        curX = rPar * lonRad * (1.0 - u2 / 6.0);
        curZ = -s * rPar * (lonRad * lonRad) * (0.5 - u2 / 24.0) + rPar * s;
    }

    let tParallel = smoothstep(0.08, 0.78, alpha);
    let yArc = RADIUS * latRad;
    let yStraight = RADIUS * sin(latRad) * (1.0 - tParallel) + yArc * tParallel;

    let pUnfurl = vec3<f32>(curX, yStraight, curZ);
    return mix(pSphere, pUnfurl, smoothstep(0.0, 1.0, alpha));
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.uv = in.uv;

    // Invariant §15: Geoid decoding formula (Rule 8: demSample.a * 19772.0 - 10924.0)
    let demSample = textureSampleLevel(u_demTexture, u_demSampler, in.uv, 0.0);
    let elevMeters = demSample.a * 19772.0 - 10924.0;
    let normElev = clamp((elevMeters + 10924.0) / 19772.0, 0.0, 1.0);
    let dispScale = terrain.terrainParams.x;
    let rDisplaced = RADIUS + (normElev - 0.55) * dispScale;

    let basePos = normalize(in.position) * rDisplaced;
    let unfurl = terrain.terrainParams.w;
    let worldP = evaluateDevelopableManifold(basePos, in.uv, unfurl);

    out.worldPos = worldP;
    out.normal = normalize(in.normal);

    let viewP = cam.viewMatrix * vec4<f32>(worldP, 1.0);
    out.clipPos = cam.projectionMatrix * viewP;

    let camDir = normalize(cam.cameraPos.xyz - worldP);
    out.facing = max(0.0, dot(out.normal, camDir));

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Unconditional derivative evaluation at top of fs_main (Invariant §3)
    let dUv = fwidth(in.uv);

    let demSample = textureSampleLevel(u_demTexture, u_demSampler, in.uv, 0.0);
    let elevMeters = demSample.a * 19772.0 - 10924.0;

    let sunDir = normalize(terrain.sunDir.xyz);
    let norm = normalize(in.normal);

    // DEM Hillshade Relief from finite differences
    let texStep = vec2<f32>(1.0 / 2048.0, 1.0 / 1024.0);
    let hR = textureSampleLevel(u_demTexture, u_demSampler, in.uv + vec2<f32>(texStep.x, 0.0), 0.0).a;
    let hL = textureSampleLevel(u_demTexture, u_demSampler, in.uv - vec2<f32>(texStep.x, 0.0), 0.0).a;
    let hD = textureSampleLevel(u_demTexture, u_demSampler, in.uv + vec2<f32>(0.0, texStep.y), 0.0).a;
    let hU = textureSampleLevel(u_demTexture, u_demSampler, in.uv - vec2<f32>(0.0, texStep.y), 0.0).a;

    let dX = (hR - hL) * 20.0;
    let dY = (hD - hU) * 20.0;
    let tangentX = normalize(vec3<f32>(in.normal.z + 0.0001, 0.0, -in.normal.x));
    let tangentY = cross(norm, tangentX);
    let perturbedNormal = normalize(norm - tangentX * dX - tangentY * dY);
    let NdotL = max(0.08, dot(perturbedNormal, sunDir));

    // Dynamic Cloud Ground Shadow Projection (FIRST_PRINCIPLES_ATMOSPHERIC_SPEC §2.1)
    let sunAltDeg = max(5.0, terrain.sunDir.w);
    let tanAlt = tan(sunAltDeg * PI / 180.0);
    let shadowStandoff = 0.015; // Low stratum height
    let shadowOffsetU = - (shadowStandoff / (tanAlt * TWO_PI)) * sunDir.x;
    let shadowOffsetV =   (shadowStandoff / (tanAlt * PI)) * sunDir.z;
    let shadowUV = in.uv + vec2<f32>(shadowOffsetU, shadowOffsetV);

    let shadowCloudDens = textureSampleLevel(u_cloudShadowTexture, u_cloudShadowSampler, shadowUV, 0.0).r;
    let shadowIntensity = terrain.terrainParams.y;
    let shadowFactor = 1.0 - shadowIntensity * smoothstep(0.10, 0.40, shadowCloudDens);

    // Multi-scale zero-crossing coastline boundaries (adaptive with screen-space dUv)
    let coastStep = max(texStep * 1.5, dUv * 1.8);
    let hR_coast = textureSampleLevel(u_demTexture, u_demSampler, in.uv + vec2<f32>(coastStep.x, 0.0), 0.0).a;
    let hL_coast = textureSampleLevel(u_demTexture, u_demSampler, in.uv - vec2<f32>(coastStep.x, 0.0), 0.0).a;
    let hD_coast = textureSampleLevel(u_demTexture, u_demSampler, in.uv + vec2<f32>(0.0, coastStep.y), 0.0).a;
    let hU_coast = textureSampleLevel(u_demTexture, u_demSampler, in.uv - vec2<f32>(0.0, coastStep.y), 0.0).a;

    let isLandC = elevMeters >= 0.0;
    let isLandR = (hR_coast * 19772.0 - 10924.0) >= 0.0;
    let isLandL = (hL_coast * 19772.0 - 10924.0) >= 0.0;
    let isLandD = (hD_coast * 19772.0 - 10924.0) >= 0.0;
    let isLandU = (hU_coast * 19772.0 - 10924.0) >= 0.0;
    let isCoast = f32(isLandC != isLandR || isLandC != isLandL || isLandC != isLandD || isLandC != isLandU);

    // Subtle cartographic graticule (30° grid lines + equator + prime meridian)
    let lonDeg = in.uv.x * 360.0 - 180.0;
    let latDeg = 90.0 - in.uv.y * 180.0;
    let gridDegX = abs(fract(lonDeg / 30.0 + 0.5) - 0.5) * 30.0;
    let gridDegY = abs(fract(latDeg / 30.0 + 0.5) - 0.5) * 30.0;
    let gridWidth = max(0.35, dUv.y * 180.0 * 1.2);
    let isGrid = f32(gridDegX < gridWidth || gridDegY < gridWidth);
    let isMajor = f32(abs(latDeg) < gridWidth * 1.6 || abs(lonDeg) < gridWidth * 1.6);

    let theme = u32(terrain.terrainParams.z);
    var baseColor: vec3<f32>;

    if (theme == 0u) {
        // Theme 0: Marie Tharp (1977) Physiographic Bathymetry & Land
        if (elevMeters < 0.0) {
            let depthNorm = clamp(-elevMeters / 9000.0, 0.0, 1.0);
            baseColor = mix(vec3<f32>(0.14, 0.36, 0.54), vec3<f32>(0.04, 0.12, 0.24), depthNorm);
        } else {
            let landNorm = clamp(elevMeters / 6000.0, 0.0, 1.0);
            baseColor = mix(vec3<f32>(0.72, 0.68, 0.54), vec3<f32>(0.92, 0.90, 0.86), landNorm);
        }
        // Dark navy intaglio coastline
        baseColor = mix(baseColor, vec3<f32>(0.02, 0.04, 0.08), isCoast * 0.95);
        baseColor = mix(baseColor, vec3<f32>(0.25, 0.40, 0.55), isGrid * 0.20 + isMajor * 0.35);
    } else if (theme == 1u) {
        // Theme 1: Cream Rag (310 GSM Cotton Rag) with Imhof Celadon coastal shelves
        if (elevMeters < 0.0) {
            let depthNorm = clamp(-elevMeters / 6000.0, 0.0, 1.0);
            baseColor = mix(vec3<f32>(0.56, 0.68, 0.64), vec3<f32>(0.36, 0.48, 0.52), depthNorm);
        } else {
            let landNorm = clamp(elevMeters / 5000.0, 0.0, 1.0);
            baseColor = mix(vec3<f32>(0.94, 0.91, 0.85), vec3<f32>(0.98, 0.96, 0.92), landNorm);
        }
        // Sepia intaglio ink coastline
        baseColor = mix(baseColor, vec3<f32>(0.15, 0.12, 0.08), isCoast * 0.95);
        baseColor = mix(baseColor, vec3<f32>(0.35, 0.30, 0.25), isGrid * 0.18 + isMajor * 0.28);
    } else {
        // Theme 2: Prussian Cyanotype (1842 Blueprint)
        let prussian = vec3<f32>(0.02, 0.12, 0.28);
        let blueHighlight = vec3<f32>(0.55, 0.75, 0.92);
        let landT = clamp((elevMeters + 2000.0) / 7000.0, 0.0, 1.0);
        baseColor = mix(prussian, blueHighlight * 0.7, landT);
        // Chalk-white blueprint coastline
        baseColor = mix(baseColor, vec3<f32>(0.85, 0.94, 1.0), isCoast * 0.95);
        baseColor = mix(baseColor, vec3<f32>(0.45, 0.65, 0.85), isGrid * 0.18 + isMajor * 0.28);
    }

    let litColor = baseColor * (NdotL * 0.85 + 0.15) * shadowFactor;

    // Horizon limb falloff (Invariant §10)
    let limbFade = smoothstep(0.02, 0.18, in.facing);

    return vec4<f32>(litColor * limbFade, 1.0);
}
`;

export const VOLUMETRIC_CLOUD_WGSL = /* wgsl */ `
const PI: f32 = 3.141592653589793;
const TWO_PI: f32 = 6.283185307179586;
const INV_FOUR_PI: f32 = 0.07957747154594767;

struct VolumetricCameraUniforms {
    invViewMatrix: mat4x4<f32>,
    invProjectionMatrix: mat4x4<f32>,
    cameraPos: vec4<f32>,       // xyz: cam pos, w: cam altitude km
    viewport: vec4<f32>,        // xy: res, zw: 1/res
    nearFar: vec4<f32>,         // x: near, y: far, zw: pad
};

struct VolumetricCloudUniforms {
    shellRadii: vec4<f32>,      // x: rInner, y: rOuter, z: deltaR, w: pad
    sunDirection: vec4<f32>,    // xyz: dir, w: altitude deg
    layerHeights: vec4<f32>,    // x: lowTop, y: midBottom, z: midTop, w: highBottom
    layerDensities: vec4<f32>,  // x: lowDens, y: midDens, z: highDens, w: masterOpacity
    lclParams: vec4<f32>,       // x: lclMeters, y: lclNorm, z: lapseRate, w: inversionFactor
    noiseParams: vec4<f32>,     // x: noiseFreq, y: billowStr, z: erosionStr, w: driftRate
    opticalParams: vec4<f32>,   // x: extinction, y: albedo, z: hgG1, w: hgG2
    mediumParams: vec4<f32>,    // x: theme, y: inkAbsorption, z: paperTooth, w: gamma
    simControl: vec4<f32>,      // x: time, y: unfurl, z: forecastHourBlend, w: maxSteps
    shearParams: vec4<f32>,     // x: cirrusShearRate, y: advectionSpeed, zw: pad
};

@group(0) @binding(0) var<uniform> cam: VolumetricCameraUniforms;
@group(0) @binding(1) var<uniform> cloud: VolumetricCloudUniforms;
@group(0) @binding(2) var u_depthTexture: texture_depth_2d;
@group(0) @binding(3) var u_cloudNoiseTexture: texture_3d<f32>;
@group(0) @binding(4) var u_noiseSampler: sampler;
@group(0) @binding(5) var u_cloudLowTexture0: texture_2d<f32>;
@group(0) @binding(6) var u_cloudMidTexture0: texture_2d<f32>;
@group(0) @binding(7) var u_cloudHighTexture0: texture_2d<f32>;
@group(0) @binding(8) var u_cloudLowTexture1: texture_2d<f32>;
@group(0) @binding(9) var u_cloudMidTexture1: texture_2d<f32>;
@group(0) @binding(10) var u_cloudHighTexture1: texture_2d<f32>;
@group(0) @binding(11) var u_cloudSampler: sampler;
@group(0) @binding(12) var u_windTexture: texture_2d<f32>;
@group(0) @binding(13) var u_windSampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(vertexIndex & 1u) * 4 - 1);
    let y = f32(i32(vertexIndex >> 1u) * 4 - 1);
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return out;
}

// Analytical Ray-Sphere Intersection
// Returns vec2(tNear, tFar). If ray misses sphere, returns vec2(-1.0, -1.0)
fn intersectSphere(rayOrigin: vec3<f32>, rayDir: vec3<f32>, radius: f32) -> vec2<f32> {
    let b = dot(rayOrigin, rayDir);
    let c = dot(rayOrigin, rayOrigin) - radius * radius;
    let d = b * b - c;
    if (d < 0.0) {
        return vec2<f32>(-1.0, -1.0);
    }
    let sqrtD = sqrt(d);
    return vec2<f32>(-b - sqrtD, -b + sqrtD);
}

// Tropospheric Bounding Shell Intersection [rInner, rOuter]
// Seamlessly supports:
//   Regime 1: Orbital Space (rCam > rOuter)
//   Regime 2: Inside Troposphere / Strata Deck (rInner <= rCam <= rOuter)
//   Regime 3: Sub-Cloud Ceiling / Ground Level (rCam < rInner)
fn intersectTroposphericShell(
    rayOrigin: vec3<f32>,
    rayDir: vec3<f32>,
    rInner: f32,
    rOuter: f32
) -> vec2<f32> {
    let rCam = length(rayOrigin);
    let hitOuter = intersectSphere(rayOrigin, rayDir, rOuter);
    let hitInner = intersectSphere(rayOrigin, rayDir, rInner);

    var tStart = -1.0;
    var tExit  = -1.0;

    if (rCam > rOuter) {
        // Regime 1: Looking into troposphere from outer space
        if (hitOuter.x > 0.0) {
            tStart = hitOuter.x;
            // Ray exits into crust if hitInner.x > 0, otherwise passes through to outer limb hitOuter.y
            tExit = select(hitOuter.y, hitInner.x, hitInner.x > 0.0);
        }
    } else if (rCam >= rInner) {
        // Regime 2: Camera is physically INSIDE the cloud stratum
        tStart = 0.0;
        // Ray heading down hits crust at hitInner.x; ray heading up exits to space at hitOuter.y
        tExit = select(hitOuter.y, hitInner.x, hitInner.x > 0.0);
    } else {
        // Regime 3: Camera is below nominal rInner (in valley or beneath low cloud ceiling)
        // Ray pointing UP enters rInner at hitInner.y and exits rOuter at hitOuter.y
        if (hitInner.y > 0.0) {
            tStart = hitInner.y;
            tExit  = hitOuter.y;
        }
    }

    return vec2<f32>(tStart, tExit);
}

fn worldToEquirectangularUV(pos3D: vec3<f32>) -> vec2<f32> {
    let curR = max(length(pos3D), 0.001);
    let phi = atan2(pos3D.z, pos3D.x);
    let theta = acos(clamp(pos3D.y / curR, -0.9998, 0.9998));
    let u = fract((phi / TWO_PI) + 1.0);
    let v = clamp(theta / PI, 0.001, 0.999);
    return vec2<f32>(u, v);
}

fn layerHeightEnvelope(h: f32, hMin: f32, hMax: f32, feather: f32) -> f32 {
    let bottom = smoothstep(hMin, hMin + feather, h);
    let top = 1.0 - smoothstep(hMax - feather, hMax, h);
    return bottom * top;
}

struct CloudDensitySample {
    density: f32,
    strataRgb: vec3<f32>,
};

// Samples meteorological cloud density combining WeatherNext 3 prognostic strata
// with living wind advection, vertical shear, and 3D Perlin-Worley micro-erosion.
fn sampleCloudDensity(pos: vec3<f32>, rInner: f32, deltaR: f32) -> CloudDensitySample {
    let r = length(pos);
    let hNorm = clamp((r - rInner) / deltaR, 0.0, 1.0);

    let baseUV = worldToEquirectangularUV(pos);

    // WeatherNext 10m Wind Vector Advection (rg16float)
    let windVec = textureSampleLevel(u_windTexture, u_windSampler, baseUV, 0.0).rg;
    let advectionSpeed = cloud.shearParams.y;
    let timeSec = cloud.simControl.x;

    // Vertical Differential Wind Shear:
    // Low clouds drift with surface 10m wind; high cirrus drift 3.5x faster with jet stream
    let shearMultiplier = mix(1.0, 3.5, smoothstep(0.40, 0.95, hNorm));
    let advectedUV = vec2<f32>(
        fract(baseUV.x - (windVec.x * 0.00004 * advectionSpeed * shearMultiplier * timeSec)),
        clamp(baseUV.y + (windVec.y * 0.00004 * advectionSpeed * shearMultiplier * timeSec), 0.001, 0.999)
    );

    // Continuous hourly forecast blending (t in [0..1] between frame 0 and frame 1)
    let forecastBlend = cloud.simControl.z;
    let lowF0 = textureSampleLevel(u_cloudLowTexture0, u_cloudSampler, advectedUV, 0.0).r;
    let lowF1 = textureSampleLevel(u_cloudLowTexture1, u_cloudSampler, advectedUV, 0.0).r;
    let lowFraction = mix(lowF0, lowF1, forecastBlend);

    let midF0 = textureSampleLevel(u_cloudMidTexture0, u_cloudSampler, advectedUV, 0.0).r;
    let midF1 = textureSampleLevel(u_cloudMidTexture1, u_cloudSampler, advectedUV, 0.0).r;
    let midFraction = mix(midF0, midF1, forecastBlend);

    let highF0 = textureSampleLevel(u_cloudHighTexture0, u_cloudSampler, advectedUV, 0.0).r;
    let highF1 = textureSampleLevel(u_cloudHighTexture1, u_cloudSampler, advectedUV, 0.0).r;
    let highFraction = mix(highF0, highF1, forecastBlend);

    // Strata Vertical Profiles
    let lowTop = cloud.layerHeights.x;      // ~0.18
    let midBottom = cloud.layerHeights.y;   // ~0.20
    let midTop = cloud.layerHeights.z;      // ~0.55
    let highBottom = cloud.layerHeights.w;  // ~0.60

    // Psychrometric LCL Coupling
    let lclNorm = cloud.lclParams.y;
    let lowBottom = max(0.0, lclNorm);

    let lowWeight = layerHeightEnvelope(hNorm, lowBottom, lowTop, 0.03) * cloud.layerDensities.x;
    let midWeight = layerHeightEnvelope(hNorm, midBottom, midTop, 0.05) * cloud.layerDensities.y;
    let highWeight = layerHeightEnvelope(hNorm, highBottom, 0.98, 0.07) * cloud.layerDensities.z;

    let wLow = lowFraction * lowWeight;
    let wMid = midFraction * midWeight;
    let wHigh = highFraction * highWeight;
    let macroDensity = wLow + wMid + wHigh;

    // Strata Diagnostic False-Color Spectrum:
    // Low Deck (0-2 km): Amber-Gold
    // Mid Deck (2-6 km): Cyan-Aqua
    // High Cirrus (6-12 km): Magenta-Orchid
    let totalW = max(0.0001, wLow + wMid + wHigh);
    let colLow = vec3<f32>(1.00, 0.62, 0.15);
    let colMid = vec3<f32>(0.12, 0.85, 0.96);
    let colHigh = vec3<f32>(0.96, 0.28, 0.88);
    let strataRgb = (colLow * wLow + colMid * wMid + colHigh * wHigh) / totalW;

    if (macroDensity < 0.002) {
        return CloudDensitySample(0.0, strataRgb);
    }

    // Stratum-conditioned morphological frequency and sampling
    let isHighCirrus = smoothstep(0.48, 0.75, hNorm);
    let isLowDeck    = 1.0 - smoothstep(0.18, 0.35, hNorm);

    // Anisotropic shearing for high cirrus along the local wind vector
    let shearDrift = vec3<f32>(windVec.x, 0.0, -windVec.y) * ((hNorm - 0.45) * 0.08 * cloud.shearParams.y);
    let samplePos = pos - shearDrift * isHighCirrus;

    let noiseFreq = mix(24.0, 32.0, isLowDeck);
    let noiseCoord = samplePos * (noiseFreq / rInner) + vec3<f32>(timeSec * 0.004, 0.0, timeSec * 0.002);
    let noiseSample = textureSampleLevel(u_cloudNoiseTexture, u_noiseSampler, noiseCoord, 0.0);

    let perlinWorleyBase = noiseSample.r;
    let worleyOctaves = noiseSample.g * 0.625 + noiseSample.b * 0.25 + noiseSample.a * 0.125;

    // Low: Worley billow dominance (puffy cauliflower lobes)
    // High: Fibrous Perlin streak dominance (wispy fall-streaks)
    let lowShaped = mix(perlinWorleyBase, 1.0 - noiseSample.g, 0.40);
    let highShaped = mix(perlinWorleyBase, noiseSample.r * (1.0 - noiseSample.a * 0.35), 0.55);
    let stratumNoise = mix(mix(perlinWorleyBase, lowShaped, isLowDeck), highShaped, isHighCirrus);

    let billowStr = cloud.noiseParams.y;
    let erosionStr = mix(cloud.noiseParams.z, cloud.noiseParams.z * 1.4, isHighCirrus);
    let noiseCarve = (1.0 - stratumNoise) * billowStr;
    let shapedBase = clamp((macroDensity * 2.4 - noiseCarve * 0.5) / max(0.001, 1.0 - noiseCarve * 0.5), 0.0, 1.0);
    let finalDensity = clamp(shapedBase - (1.0 - shapedBase) * (worleyOctaves * erosionStr * 0.5), 0.0, 1.0);

    return CloudDensitySample(finalDensity * cloud.layerDensities.w, strataRgb);
}

// 3-Lobe Phase Function: Dual Henyey-Greenstein + Sharp Forward Mie Diffraction Peak (Silver Lining)
fn triplePhaseFunction(cosTheta: f32, g1: f32, g2: f32, gMie: f32, stepT: f32) -> f32 {
    let ct = clamp(cosTheta, -0.9999, 0.9999);
    let g1Sq = g1 * g1;
    let denom1 = max(0.0001, 1.0 + g1Sq - 2.0 * g1 * ct);
    let p1 = (1.0 - g1Sq) / pow(denom1, 1.5);

    let g2Sq = g2 * g2;
    let denom2 = max(0.0001, 1.0 + g2Sq - 2.0 * g2 * ct);
    let p2 = (1.0 - g2Sq) / pow(denom2, 1.5);

    let baseHG = INV_FOUR_PI * mix(p2, p1, 0.70);

    // Forward Mie Diffraction Lobe (gMie = 0.965)
    let gMieSq = gMie * gMie;
    let denomMie = max(0.0001, 1.0 + gMieSq - 2.0 * gMie * ct);
    let pMie = (1.0 - gMieSq) / pow(denomMie, 1.5);
    let mieLobe = INV_FOUR_PI * pMie;

    // Fringe Activation: peaks along thin optical boundaries (silver lining)
    let fringeWeight = smoothstep(0.12, 0.55, stepT) * (1.0 - smoothstep(0.75, 0.98, stepT));
    let forwardBoost = max(0.0, ct);

    return baseHG + mieLobe * (fringeWeight * forwardBoost * 0.40);
}

// 4-Step Vertical Multi-Stratum Solar Crevice Shadow Raymarch (Cloud-on-Cloud)
fn sampleSunShadowTransmittance(pos: vec3<f32>, sunDir: vec3<f32>, rInner: f32, deltaR: f32) -> f32 {
    let stepDist = deltaR * 0.28;
    var tauSun: f32 = 0.0;
    let sigmaT = cloud.opticalParams.x * 0.85;

    for (var k: i32 = 1; k <= 4; k++) {
        let sampleP = pos + sunDir * (stepDist * f32(k));
        let rSample = length(sampleP);
        let hSample = clamp((rSample - rInner) / deltaR, 0.0, 1.0);
        if (hSample >= 0.999) {
            break;
        }

        let uv = worldToEquirectangularUV(sampleP);
        let lowD  = textureSampleLevel(u_cloudLowTexture0, u_cloudSampler, uv, 0.0).r * layerHeightEnvelope(hSample, 0.0, cloud.layerHeights.x, 0.03);
        let midD  = textureSampleLevel(u_cloudMidTexture0, u_cloudSampler, uv, 0.0).r * layerHeightEnvelope(hSample, cloud.layerHeights.y, cloud.layerHeights.z, 0.05);
        let highD = textureSampleLevel(u_cloudHighTexture0, u_cloudSampler, uv, 0.0).r * layerHeightEnvelope(hSample, cloud.layerHeights.w, 0.98, 0.07);

        let aloftDensity = lowD * cloud.layerDensities.x + midD * cloud.layerDensities.y + highD * cloud.layerDensities.z;
        tauSun += sigmaT * aloftDensity * stepDist;
    }
    return exp(-tauSun);
}

// Planetary Atmospheric Rayleigh Airglow Limb
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
    let tAtmExit  = -b + sqrt(discAtm);
    if (tAtmExit <= tAtmEnter) {
        return vec4<f32>(0.0);
    }

    let dMin = sqrt(max(0.0, dot(rayOrigin, rayOrigin) - b * b));
    if (dMin > rAtm) {
        return vec4<f32>(0.0);
    }

    let altNorm = clamp((dMin - rInner) / (rAtm - rInner), 0.0, 1.0);
    let pathLen = min(0.6, tAtmExit - tAtmEnter);
    let densityProfile = exp(-altNorm * 4.5);
    let optDepth = pathLen * densityProfile * 2.2;

    let cosTheta = dot(rayDir, sunDir);
    let pRayleigh = (3.0 / (16.0 * PI)) * (1.0 + cosTheta * cosTheta);

    let pClosest = rayOrigin + rayDir * (-b);
    let sunDotWorld = dot(normalize(pClosest), sunDir);
    let dayFactor = smoothstep(-0.25, 0.25, sunDotWorld);

    var betaR: vec3<f32>;
    if (theme == 0u) {
        // Marie Tharp: luminous atmospheric azure
        betaR = vec3<f32>(0.20, 0.46, 0.92);
    } else if (theme == 1u) {
        // Cream Rag: soft parchment atmospheric wash
        betaR = vec3<f32>(0.76, 0.82, 0.88);
    } else {
        // Prussian Cyanotype: photochemical blueprint cyan
        betaR = vec3<f32>(0.35, 0.65, 0.95);
    }

    let airglow = betaR * (pRayleigh * 4.0 * PI * dayFactor * 0.90);
    let alpha = clamp(1.0 - exp(-optDepth), 0.0, 0.90);
    return vec4<f32>(airglow, alpha);
}

struct CloudMediumPalette {
    sunColor: vec3<f32>,
    midColor: vec3<f32>,
    ambientColor: vec3<f32>,
    inkDensityFactor: f32,
};

fn getMediumPalette(theme: u32) -> CloudMediumPalette {
    var pal: CloudMediumPalette;
    if (theme == 0u) {
        // Theme 0: Marie Tharp
        pal.sunColor = vec3<f32>(1.00, 0.98, 0.95);
        pal.midColor = vec3<f32>(0.84, 0.88, 0.92);
        pal.ambientColor = vec3<f32>(0.28, 0.36, 0.46);
        pal.inkDensityFactor = 1.0;
    } else if (theme == 1u) {
        // Theme 1: Cream Rag (Sepia ink wash)
        pal.sunColor = vec3<f32>(0.98, 0.96, 0.92);
        pal.midColor = vec3<f32>(0.86, 0.82, 0.76);
        pal.ambientColor = vec3<f32>(0.46, 0.42, 0.38);
        pal.inkDensityFactor = 0.92;
    } else {
        // Theme 2: Prussian Cyanotype (Blueprint highlight)
        pal.sunColor = vec3<f32>(0.92, 0.97, 1.00);
        pal.midColor = vec3<f32>(0.55, 0.70, 0.82);
        pal.ambientColor = vec3<f32>(0.14, 0.28, 0.44);
        pal.inkDensityFactor = 1.15;
    }
    return pal;
}

fn hashScreen(p: vec2<f32>) -> f32 {
    let d = dot(p, vec2<f32>(12.9898, 78.233));
    return fract(sin(d) * 43758.5453);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // 1. Reconstruct World Ray (WebGPU near plane is Z = 0.0)
    let uv = in.uv;
    let ndcX = uv.x * 2.0 - 1.0;
    let ndcY = 1.0 - uv.y * 2.0;

    let clipNear = vec4<f32>(ndcX, ndcY, 0.0, 1.0);
    let clipFar  = vec4<f32>(ndcX, ndcY, 1.0, 1.0);

    let worldNearH = cam.invViewMatrix * (cam.invProjectionMatrix * clipNear);
    let worldFarH  = cam.invViewMatrix * (cam.invProjectionMatrix * clipFar);

    let worldNear = worldNearH.xyz / worldNearH.w;
    let worldFar  = worldFarH.xyz / worldFarH.w;

    let rayOrigin = cam.cameraPos.xyz;
    let rayDir = normalize(worldFar - worldNear);

    // 2. Terrain Depth Distance Clamping
    let pixelCoords = vec2<i32>(in.position.xy);
    let depthVal = textureLoad(u_depthTexture, pixelCoords, 0);

    var tTerrain: f32 = 1e9;
    if (depthVal < 0.999999) {
        let clipSurface = vec4<f32>(ndcX, ndcY, depthVal, 1.0);
        let viewPosH = cam.invProjectionMatrix * clipSurface;
        let worldSurfaceH = cam.invViewMatrix * vec4<f32>(viewPosH.xyz / max(1e-6, abs(viewPosH.w)), 1.0);
        let dist = dot(worldSurfaceH.xyz - rayOrigin, rayDir);
        if (dist > 0.00001) {
            tTerrain = dist;
        }
    }

    // 3. Tropospheric Bounding Shell Ray Interval
    let rInner = cloud.shellRadii.x;
    let rOuter = cloud.shellRadii.y;
    let deltaR = cloud.shellRadii.z;

    let shellHit = intersectTroposphericShell(rayOrigin, rayDir, rInner, rOuter);
    if (shellHit.x < 0.0 || shellHit.y <= shellHit.x) {
        discard;
    }

    let tStart = shellHit.x;
    let tExit = min(shellHit.y, tTerrain);

    if (tStart >= tExit) {
        discard;
    }

    let raymarchDist = tExit - tStart;
    if (raymarchDist < 0.0001) {
        discard;
    }

    // 4. Adaptive Step Numerical Integration
    let maxSteps = min(64, i32(cloud.simControl.w));
    let baseStepSize = raymarchDist / f32(maxSteps);
    let jitter = hashScreen(in.position.xy) * baseStepSize;

    let sunDir = normalize(cloud.sunDirection.xyz);
    let cosTheta = dot(rayDir, sunDir);

    let theme = u32(cloud.mediumParams.x);
    let pal = getMediumPalette(theme);

    let sigmaT = cloud.opticalParams.x * pal.inkDensityFactor;
    let albedo = cloud.opticalParams.y;

    let isFalseColor = cloud.shearParams.z > 0.5;

    var accumLight = vec3<f32>(0.0);
    var accumTransmittance: f32 = 1.0;
    var t: f32 = tStart + jitter;

    // Near-Plane Camera Penetration Fade Envelope
    // Eliminates harsh clipping when camera plunges into cloud decks
    let nearClipDist = max(0.05, cam.nearFar.x * 2.0);

    for (var step: i32 = 0; step < 64; step++) {
        if (t >= tExit || step >= maxSteps) {
            break;
        }

        let p = rayOrigin + rayDir * t;
        let cSample = sampleCloudDensity(p, rInner, deltaR);

        // Apply smooth near-plane dissolve when camera is inside
        let distFromCam = t;
        let nearFade = smoothstep(nearClipDist, nearClipDist * 3.5, distFromCam);
        let density = cSample.density * nearFade;

        if (density > 0.002) {
            let stepTau = sigmaT * density * baseStepSize;
            let stepT = exp(-stepTau);

            let sunT = sampleSunShadowTransmittance(p, sunDir, rInner, deltaR);

            // In false-color diagnostic mode, tint scattered light by strata color
            let stepTint = select(vec3<f32>(1.0), cSample.strataRgb, isFalseColor);

            // 3-Lobe Phase Function with Forward Mie Silver-Lining Diffraction Peak
            let stepPhase = triplePhaseFunction(cosTheta, cloud.opticalParams.z, cloud.opticalParams.w, 0.965, stepT);

            // Wrenninge Multiple Scattering with Normalized Octaves
            var directLight = vec3<f32>(0.0);
            var octExtinction = 1.0;
            var octWeight = 0.55;
            for (var oct: i32 = 0; oct < 3; oct++) {
                let octSunT = select(0.0, pow(clamp(sunT, 1e-6, 1.0), octExtinction), sunT > 1e-6);
                let octPhaseTerm = max(0.15, stepPhase * 3.14159);
                directLight += pal.sunColor * stepTint * (octWeight * octPhaseTerm * octSunT);
                octExtinction *= 0.5;
                octWeight *= 0.5;
            }

            let midLight = pal.midColor * stepTint * ((1.0 - sunT) * 0.20);
            let ambientLight = pal.ambientColor * stepTint * 0.10;
            let S = (directLight + midLight + ambientLight) * (albedo * (1.0 - stepT) / max(0.00001, baseStepSize));

            accumLight += accumTransmittance * S * baseStepSize;
            accumTransmittance *= stepT;

            if (accumTransmittance < 0.01) {
                accumTransmittance = 0.0;
                break;
            }

            t += baseStepSize;
        } else {
            t += baseStepSize * 2.0;
        }
    }

    // Composite planetary Rayleigh atmospheric airglow behind remaining cloud transmittance
    let airglow = evaluateRayleighLimbAirglow(rayOrigin, rayDir, sunDir, rInner, theme);
    accumLight += accumTransmittance * airglow.rgb * airglow.a;
    accumTransmittance *= (1.0 - airglow.a);

    let alpha = 1.0 - accumTransmittance;
    if (alpha <= 0.002) {
        discard;
    }

    return vec4<f32>(accumLight, alpha);
}
`;

export const CLOUD_NOISE_COMPUTE_WGSL = /* wgsl */ `
@group(0) @binding(0) var noiseTexture: texture_storage_3d<rgba8unorm, write>;

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

fn quinticFade3(t: vec3<f32>) -> vec3<f32> {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

fn perlinGradient(corner: vec3<u32>, period: u32) -> vec3<f32> {
    let wrapped = corner % vec3<u32>(period, period, period);
    let raw = pcg3d(wrapped);
    let grad = raw * 2.0 - 1.0;
    let len = length(grad);
    return select(grad / len, vec3<f32>(0.57735, 0.57735, 0.57735), len < 0.001);
}

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

    let p = (vec3<f32>(global_id) + vec3<f32>(0.5)) / vec3<f32>(dims);

    let worley8  = periodicWorley3D(p, 8u);
    let worley16 = periodicWorley3D(p, 16u);
    let worley32 = periodicWorley3D(p, 32u);

    let perlin4  = periodicPerlin3D(p, 4u);
    let perlin8  = periodicPerlin3D(p, 8u);
    let perlin16 = periodicPerlin3D(p, 16u);
    let perlinFbm = 0.625 * perlin4 + 0.250 * perlin8 + 0.125 * perlin16;

    let worley4  = periodicWorley3D(p, 4u);
    let worleyBaseFbm = 0.625 * worley4 + 0.250 * worley8 + 0.125 * worley16;

    let billowThreshold = (1.0 - worleyBaseFbm) * 0.75;
    let perlinWorley = clamp(remap(perlinFbm, billowThreshold, 1.0, 0.0, 1.0) / 0.75, 0.0, 1.0);

    textureStore(noiseTexture, global_id, vec4<f32>(perlinWorley, worley8, worley16, worley32));
}
`;
