// ============================================================================
// File: src/webgpu/shaders/crust_hydrosphere.wgsl
// Target: Unified Native WebGPU Lithosphere Crust & Liquid Hydrosphere Pipeline
// Mathematical Foundations: Indicatrix Engine Frontiers 3 & 4
// Synchronous Dual-Surface Morphing Theorem: Theorem 3.3.2 (Zero Z-Fighting, Zero Cracks)
// ============================================================================

struct SimUniforms {
    u_unfurl: f32,
    u_mode: u32,
    u_theme: u32,             // 0 = Dark Obsidian, 1 = Light Monochrome (swisstopo)
    u_time: f32,
    u_viewport: vec4<f32>,     // x: width, y: height, z: 1/width, w: 1/height
    u_cameraPos: vec4<f32>,
    u_cursorHitPos: vec4<f32>,
    u_cursorVel: vec4<f32>,
    u_cursorActive: f32,
    u_displacementScale: f32,
    u_seaLevel: f32,          // Dynamic sea level in meters
    u_roughness: f32,
    u_viewMatrix: mat4x4<f32>,
    u_projectionMatrix: mat4x4<f32>,
    u_sunAzimuth: f32,
    u_sunAltitude: f32,
    u_ambientOcclusion: f32,
    u_waterClarity: f32,
    u_peakExponent: f32,
    u_layerOpacity: f32,
    u_renderStyle: u32,       // 0 = Architectural / Relief, 1 = Hybrid / Depth, 2 = Orbital
    u_isolatedStratum: f32,   // -1.0 = All active, 0.0..4.0 = Isolate specific stratum band
    u_mediumProperties: vec4<f32>, // x: inkAbsorption, y: fiberDensity, z: exposureGamma, w: stippleDensity
    u_shadowIntensity: f32, // Dynamic cloud ground shadow intensity (offset 272, float 68)
    u_cloudDriftRate: f32,  // Dynamic cloud drift rate for shadow sync (offset 276, float 69) _padShadow0: f32,
    u_cloudAltitudeKm: f32, // Dynamic cloud deck altitude in km (offset 280, float 70) _padShadow1: f32,
    u_verticalScaleMode: u32, // Vertical scale mode: 0 = Linear Legacy, 1 = Symmetrical Dual-Log (offset 284, float 71) _padShadow2: f32,
    u_pluvial_gamma: f32, // offset 288 (float 72)
    u_weatherOpticalMode: u32, // offset 292 (uint 73)
    u_lclBypass: f32, // offset 296 (float 74)
    u_purityMode: f32, // offset 300 (float 75)
    u_scrubTau: f32, // offset 304 (float 76)
    u_advectionActive: f32, // offset 308 (float 77)
    _padScrub1: f32, // offset 312 (float 78)
    _padScrub2: f32, // offset 316 (float 79)
};

@group(0) @binding(0) var<uniform> sim: SimUniforms;
@group(0) @binding(1) var u_demTexture: texture_2d<f32>;
@group(0) @binding(2) var u_demSampler: sampler;
@group(0) @binding(3) var u_orbitalTextures: texture_2d_array<f32>; // Layer 0: Day Blue Marble, Layer 1: Night Lights
@group(0) @binding(4) var u_orbitalSampler: sampler;
@group(0) @binding(5) var u_regionalDEMTexture: texture_2d<f32>;

struct RegionalOverlayUniforms {
    u_regionalBounds: vec4<f32>, // minLon, minLat, maxLon, maxLat (bytes 0..15)
    u_pad0: vec4<f32>,           // (bytes 16..31)
    u_pad1: vec4<f32>,           // (bytes 32..47)
    u_regionalActive: u32,       // (bytes 48..51)
    u_pad2: u32,
    u_pad3: u32,
    u_pad4: u32,
};

@group(0) @binding(6) var<uniform> u_regionalOverlay: RegionalOverlayUniforms;
@group(0) @binding(7) var u_cloudTexture: texture_2d<f32>;
@group(0) @binding(8) var u_cloudSampler: sampler;
@group(0) @binding(9) var u_precipTexture: texture_2d<f32>;
@group(0) @binding(10) var u_precipSampler: sampler;
@group(0) @binding(11) var u_tempTexture: texture_2d<f32>;
@group(0) @binding(12) var u_dewpointTexture: texture_2d<f32>;
@group(0) @binding(13) var u_precipNextTexture: texture_2d<f32>;
@group(0) @binding(14) var u_windTexture: texture_2d<f32>;

struct TerrainShadowUniforms {
    u_sunAzimuth: f32,             // offset 0  (radians, [0, 2*PI])
    u_sunAltitude: f32,            // offset 4  (radians, [0, PI/2])
    u_maxRayDistanceMeters: f32,   // offset 8  (e.g. 50,000.0 m max shadow reach)
    u_penumbraSoftness: f32,       // offset 12 (penumbra transition coefficient)
    u_shadowMapDimensions: vec2<u32>, // offset 16 (width, height, e.g. 4096, 2048)
    u_sampleStepCount: u32,        // offset 24 (steps per ray, e.g. 16 or 32)
    _pad: u32,                     // offset 28 (16-byte alignment)
};

@group(1) @binding(0) var<uniform> u_terrainShadow: TerrainShadowUniforms;
@group(1) @binding(1) var u_terrainShadowTexture: texture_2d<f32>;
@group(1) @binding(2) var u_terrainShadowSampler: sampler;
@group(1) @binding(3) var u_hydroTexture: texture_2d<f32>;
@group(1) @binding(4) var u_normalTexture: texture_2d<f32>;

struct CDLODInstance {
    minUV: vec2<f32>,
    sizeUV: vec2<f32>,
    lod: u32,
    morphStart: f32,
    invMorphRange: f32,
    lodFraction: f32,
};

struct CDLODControlUniforms {
    u_cdlodActive: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
};

@group(2) @binding(0) var<uniform> u_cdlodControl: CDLODControlUniforms;
@group(2) @binding(1) var<storage, read> cdlodInstances: array<CDLODInstance>;

struct VertexInput {
    @location(0) position: vec3<f32>, // Base manifold position
    @location(1) uv: vec2<f32>,       // Longitude/Latitude [0, 1]
    @location(2) surfaceType: f32,    // 0.0 = Crust, 1.0 = Liquid Hydrosphere
    @location(3) target2D: vec4<f32>, // xy: Mercator 2D, zw: Dymaxion 2D (optional)
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) worldPos: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) elevation: f32,
    @location(4) waterDepth: f32,
    @location(5) surfaceType: f32,
    @location(6) dymaxion2D: vec2<f32>,
};

const PI: f32 = 3.14159265358979323846;
const PI_F32: f32 = 3.14159265358979323846;
const TWO_PI_F32: f32 = 6.28318530717958647692;
const INV_PI_F32: f32 = 0.31830988618379067154;
const INV_TWO_PI_F32: f32 = 0.15915494309189533577;
const EARTH_RADIUS_M: f32 = 6371000.0;
const INV_EARTH_RADIUS_M: f32 = 1.5696123e-7;
const RADIUS: f32 = 5.0;

fn computeSunLightDir(azimuthDeg: f32, altitudeDeg: f32) -> vec3<f32> {
    let radAz = radians(azimuthDeg);
    let radAlt = radians(altitudeDeg);
    let cosAlt = cos(radAlt);
    return normalize(vec3<f32>(
        sin(radAz) * cosAlt,
        cos(radAz) * cosAlt,
        sin(radAlt)
    ));
}

// Procedural pseudo-random 2D hash for micro-fiber paper tooth
fn hashPaper2D(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

// ----------------------------------------------------------------------------
// Hydrosphere Optics & Jerlov Radiative Transfer (Frontier 3)
// ----------------------------------------------------------------------------
struct HydrosphereUniforms {
    u_waterType: u32,             // 0=Type I, 1=Type IA, 2=Type IB, 3=Type II, 4=Type III
    u_time: f32,                  // Continuous time in seconds
    u_seaLevelOffset: f32,        // Sea level adjustment datum (meters)
    u_causticIntensity: f32,      // Caustic focusing gain multiplier
    u_sunAzimuth: f32,            // Solar azimuth in degrees
    u_sunAltitude: f32,           // Solar altitude in degrees
    u_roughness: f32,             // Water surface micro-facet roughness
    u_fresnelPower: f32,          // Schlick Fresnel exponent
};

const JERLOV_KD: array<vec3<f32>, 5> = array<vec3<f32>, 5>(
    vec3<f32>(0.355, 0.055, 0.023), // Type I  (Ultra-oligotrophic, blue-penetrating)
    vec3<f32>(0.365, 0.063, 0.038), // Type IA
    vec3<f32>(0.380, 0.075, 0.052), // Type IB
    vec3<f32>(0.410, 0.105, 0.094), // Type II
    vec3<f32>(0.480, 0.145, 0.190)  // Type III (Coastal gelbstoff)
);

const JERLOV_A: array<vec3<f32>, 5> = array<vec3<f32>, 5>(
    vec3<f32>(0.350, 0.051, 0.018),
    vec3<f32>(0.355, 0.058, 0.032),
    vec3<f32>(0.362, 0.068, 0.046),
    vec3<f32>(0.385, 0.088, 0.085),
    vec3<f32>(0.440, 0.115, 0.165)
);

const JERLOV_BB: array<vec3<f32>, 5> = array<vec3<f32>, 5>(
    vec3<f32>(0.00045, 0.00054, 0.00063),
    vec3<f32>(0.00081, 0.00094, 0.00108),
    vec3<f32>(0.00117, 0.00135, 0.00153),
    vec3<f32>(0.00216, 0.00252, 0.00288),
    vec3<f32>(0.00480, 0.00560, 0.00640)
);

const JERLOV_R_INF: array<vec3<f32>, 5> = array<vec3<f32>, 5>(
    vec3<f32>(0.00064, 0.00527, 0.01720),
    vec3<f32>(0.00114, 0.00803, 0.01660),
    vec3<f32>(0.00161, 0.00983, 0.01635),
    vec3<f32>(0.00280, 0.01412, 0.01666),
    vec3<f32>(0.00542, 0.02377, 0.01903)
);

const ALBEDO_CARBONATE_REEF: vec3<f32> = vec3<f32>(0.48, 0.54, 0.44);
const ALBEDO_ABYSSAL_BASALT: vec3<f32> = vec3<f32>(0.06, 0.05, 0.04);

fn computeSlantPathCosines(N: vec3<f32>, L: vec3<f32>, V: vec3<f32>) -> vec2<f32> {
    const INV_NW_SQ: f32 = 0.561937; // 1.0 / (1.334 * 1.334)
    let NdotL = max(0.0, dot(N, L));
    let NdotV = max(0.0, dot(N, V));
    let sin2_theta_s = max(0.0, 1.0 - NdotL * NdotL);
    let sin2_theta_v = max(0.0, 1.0 - NdotV * NdotV);
    let mu_s = sqrt(max(0.01, 1.0 - sin2_theta_s * INV_NW_SQ));
    let mu_v = sqrt(max(0.01, 1.0 - sin2_theta_v * INV_NW_SQ));
    return vec2<f32>(mu_s, mu_v);
}

fn evaluateKubelkaMunkReflectance(
    depthMeters: f32,
    waterType: u32,
    bottomAlbedo: vec3<f32>,
    mu_s: f32,
    mu_v: f32
) -> vec3<f32> {
    let typeIdx = clamp(waterType, 0u, 4u);
    let a   = JERLOV_A[typeIdx];
    let bb  = JERLOV_BB[typeIdx];
    let Rinf = JERLOV_R_INF[typeIdx];
    let gamma = 2.0 * sqrt(a * (a + 2.0 * bb));
    let pathFactor = 0.5 * ((1.0 / mu_s) + (1.0 / mu_v));
    let expTerm = exp(-2.0 * gamma * (depthMeters * pathFactor));
    let crossTerm = Rinf * bottomAlbedo;
    let diffTerm  = bottomAlbedo - Rinf;
    let numerator   = Rinf * (vec3<f32>(1.0) - crossTerm) + diffTerm * expTerm;
    let denominator = (vec3<f32>(1.0) - crossTerm) + Rinf * (diffTerm * expTerm);
    return clamp(numerator / max(denominator, vec3<f32>(0.001)), vec3<f32>(0.0), vec3<f32>(1.0));
}

struct JerlovProperties {
    Kd: vec3<f32>,
    a: vec3<f32>,
    bb: vec3<f32>,
    Rinf: vec3<f32>,
};

fn getJerlovProperties(clarity: f32, depthMeters: f32) -> JerlovProperties {
    // Clarity slider: 1.0 = Type I (Crystal Open Ocean), 0.0 = Type III (Turbid Coastal)
    // Coastal shallows naturally have higher CDOM/gelbstoff concentrations (Type III, index 4),
    // while open deep ocean trends towards Type I (index 0), modulated by user clarity slider.
    let coastalFactor = (1.0 - smoothstep(10.0, 85.0, depthMeters)) * 0.70;
    let effectiveClarity = clamp(clarity * (1.0 - coastalFactor), 0.0, 1.0);

    // Continuous mapping to Jerlov index space [0.0 .. 4.0]:
    // 0.0 = Type I, 1.0 = Type IA, 2.0 = Type IB, 3.0 = Type II, 4.0 = Type III
    let typeParam = (1.0 - effectiveClarity) * 4.0;
    let idx0 = u32(clamp(floor(typeParam), 0.0, 4.0));
    let idx1 = min(idx0 + 1u, 4u);
    let frac = typeParam - floor(typeParam);

    var props: JerlovProperties;
    props.Kd = mix(JERLOV_KD[idx0], JERLOV_KD[idx1], frac);
    props.a = mix(JERLOV_A[idx0], JERLOV_A[idx1], frac);
    props.bb = mix(JERLOV_BB[idx0], JERLOV_BB[idx1], frac);
    props.Rinf = mix(JERLOV_R_INF[idx0], JERLOV_R_INF[idx1], frac);
    return props;
}

fn evaluateKubelkaMunkReflectanceProps(
    depthMeters: f32,
    props: JerlovProperties,
    bottomAlbedo: vec3<f32>,
    mu_s: f32,
    mu_v: f32
) -> vec3<f32> {
    let a   = props.a;
    let bb  = props.bb;
    let Rinf = props.Rinf;
    let gamma = 2.0 * sqrt(a * (a + 2.0 * bb));
    let pathFactor = 0.5 * ((1.0 / mu_s) + (1.0 / mu_v));
    let expTerm = exp(-2.0 * gamma * (depthMeters * pathFactor));
    let crossTerm = Rinf * bottomAlbedo;
    let diffTerm  = bottomAlbedo - Rinf;
    let numerator   = Rinf * (vec3<f32>(1.0) - crossTerm) + diffTerm * expTerm;
    let denominator = (vec3<f32>(1.0) - crossTerm) + Rinf * (diffTerm * expTerm);
    return clamp(numerator / max(denominator, vec3<f32>(0.001)), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn evaluateSpectralTransmission(depthMeters: f32, waterType: u32, mu_s: f32, mu_v: f32) -> vec3<f32> {
    let Kd = JERLOV_KD[clamp(waterType, 0u, 4u)];
    let pathFactor = (1.0 / mu_s) + (1.0 / mu_v);
    let opticalPath = Kd * (depthMeters * pathFactor);
    return exp(-opticalPath);
}

struct WaveHarmonic {
    amplitude: f32,
    kx: f32,
    ky: f32,
    omega: f32,
    phi: f32,
};

const WAVE_OCTAVES: array<WaveHarmonic, 4> = array<WaveHarmonic, 4>(
    WaveHarmonic(0.024,  2.40,  1.80, 2.20, 0.00),
    WaveHarmonic(0.014, -3.80,  3.20, 3.40, 1.14),
    WaveHarmonic(0.008,  6.50, -5.10, 5.10, 2.31),
    WaveHarmonic(0.004, -9.20, -8.60, 7.80, 4.05)
);

struct RippleResult {
    normalPerturbation: vec2<f32>,
    analyticalDivergence: f32,
};

fn evaluateMicroRipples(uv: vec2<f32>, time: f32) -> RippleResult {
    var dN = vec2<f32>(0.0, 0.0);
    var divN = 0.0;
    for (var i = 0u; i < 4u; i = i + 1u) {
        let phase = WAVE_OCTAVES[i].kx * uv.x + WAVE_OCTAVES[i].ky * uv.y - WAVE_OCTAVES[i].omega * time + WAVE_OCTAVES[i].phi;
        let cosP = cos(phase);
        let sinP = sin(phase);
        dN.x = dN.x + WAVE_OCTAVES[i].amplitude * WAVE_OCTAVES[i].kx * cosP;
        dN.y = dN.y + WAVE_OCTAVES[i].amplitude * WAVE_OCTAVES[i].ky * cosP;
        let kSq = WAVE_OCTAVES[i].kx * WAVE_OCTAVES[i].kx + WAVE_OCTAVES[i].ky * WAVE_OCTAVES[i].ky;
        divN = divN - WAVE_OCTAVES[i].amplitude * kSq * sinP;
    }
    var res: RippleResult;
    res.normalPerturbation = dN;
    res.analyticalDivergence = divN;
    return res;
}

fn evaluateCausticIntensity(
    depthMeters: f32,
    analyticalDivergence: f32,
    waterType: u32,
    intensityGain: f32
) -> f32 {
    let inRange = depthMeters > 0.01 && depthMeters <= 45.0;
    const MU_REFR: f32 = 0.2504;
    let safeDepth = clamp(depthMeters, 0.0, 50.0);
    let beta = select(0.0, MU_REFR * safeDepth * exp(-safeDepth * 0.18), inRange);
    let rawCaustic = 1.0 - (beta * analyticalDivergence) * intensityGain;
    let depthGate = 1.0 - smoothstep(12.0, 35.0, safeDepth);
    let caustic = max(0.0, mix(1.0, rawCaustic, depthGate));
    return select(1.0, caustic, inRange);
}

fn computeHydrosphereShading(
    worldPos: vec3<f32>,
    baseNormal: vec3<f32>,
    viewDir: vec3<f32>,
    sunDir: vec3<f32>,
    uvCoord: vec2<f32>,
    elevationMeters: f32,
    uniforms: HydrosphereUniforms,
    shadowFactor: f32
) -> vec4<f32> {
    let depthMeters = max(0.0, uniforms.u_seaLevelOffset - elevationMeters);
    let isWater = depthMeters > 0.001;
    let safeDepth = select(0.001, depthMeters, isWater);

    let rippleUv = uvCoord * 450.0;
    let ripples = evaluateMicroRipples(rippleUv, uniforms.u_time);

    let lambda = (uvCoord.x - 0.5) * (2.0 * PI);
    let sphereTangentX = vec3<f32>(cos(lambda), 0.0, -sin(lambda));
    let sphereTangentY = cross(baseNormal, sphereTangentX);
    let flatTangentX = vec3<f32>(1.0, 0.0, 0.0);
    let flatTangentY = vec3<f32>(0.0, 1.0, 0.0);
    let tangentX = normalize(mix(sphereTangentX, flatTangentX, sim.u_unfurl));
    let tangentY = normalize(mix(sphereTangentY, flatTangentY, sim.u_unfurl));

    let perturbedNormal = normalize(
        baseNormal + 
        (tangentX * ripples.normalPerturbation.x + tangentY * ripples.normalPerturbation.y) * 0.35
    );

    let cosines = computeSlantPathCosines(baseNormal, sunDir, viewDir);
    let mu_s = cosines.x;
    let mu_v = cosines.y;

    // Jerlov radiative transfer optical properties:
    // Seamlessly transitions from coastal Type III emerald green to deep Type I crystal sapphire blue
    let props = getJerlovProperties(sim.u_waterClarity, safeDepth);

    // Benthic Substrate Albedo:
    // Shallow lagoons and coral atolls (0m - 50m) exhibit warm aragonite carbonate reef albedo
    // ALBEDO_CARBONATE_REEF = vec3(0.48, 0.54, 0.44), transitioning to abyssal basalt in deep basins
    let reefWeight = 1.0 - smoothstep(1.0, 50.0, safeDepth);
    let bedAlbedo = mix(ALBEDO_ABYSSAL_BASALT, ALBEDO_CARBONATE_REEF, reefWeight);

    // Kubelka-Munk two-flux bottom reflectance evaluated with physical optical thickness
    let R_subsurface = evaluateKubelkaMunkReflectanceProps(safeDepth, props, bedAlbedo, mu_s, mu_v);

    // Gerstner micro-ripple caustics focused onto shallow bathymetry
    let causticFactor = evaluateCausticIntensity(
        safeDepth,
        ripples.analyticalDivergence,
        uniforms.u_waterType,
        uniforms.u_causticIntensity
    );

    let NdotL = max(0.05, dot(baseNormal, sunDir));
    let seabedRadiance = R_subsurface * (NdotL * causticFactor * shadowFactor);

    // Pelagic Radiance & Bathymetric Gradient from Jerlov Radiative Transfer
    var cSkyAmbient: vec3<f32>;
    var cTrench: vec3<f32>;
    if (sim.u_theme == 2u) {
        cSkyAmbient = vec3<f32>(0.12, 0.22, 0.34);
        cTrench     = vec3<f32>(0.03, 0.05, 0.09); // Deep exposed prussiate #0E1824
    } else if (sim.u_theme == 1u) {
        cSkyAmbient = vec3<f32>(0.28, 0.34, 0.44);
        cTrench     = vec3<f32>(0.10, 0.16, 0.22); // Marine Indigo #263B52
    } else {
        cSkyAmbient = vec3<f32>(0.14, 0.18, 0.24);
        cTrench     = vec3<f32>(0.005, 0.015, 0.05); // Abyssal Trench #0F171F
    }
    let cSunLight = select(vec3<f32>(1.08, 1.02, 0.94), vec3<f32>(0.95, 0.98, 1.02), sim.u_theme == 2u);
    let sunIllum = cSunLight * (NdotL * 0.85 * shadowFactor + 0.15) + cSkyAmbient * 0.80;

    // Jerlov volume radiance: Type I crystal sapphire blue vs Type III emerald green
    let pelagicRadiance = clamp((props.Rinf * 36.0) * sunIllum, vec3<f32>(0.0), vec3<f32>(0.75));

    // Deep abyssal trenches (> 2000m to 10,924m): total extinction deepens into midnight indigo
    let normDepth = clamp(safeDepth / 10924.0, 0.0, 1.0);
    let trenchFactor = smoothstep(0.12, 0.85, normDepth);
    let deepOceanColor = mix(pelagicRadiance, cTrench, trenchFactor);

    // Continuous physical blend from shallow Kubelka-Munk seabed glow to deep Jerlov volume radiance
    let depthBlend = smoothstep(6.0, 65.0, safeDepth);
    var waterColor = mix(seabedRadiance * 1.35, deepOceanColor, depthBlend);

    // Medium-specific water surface styling:
    // In Theme 1 (Cream Rag): Archival watercolor wash on cotton rag paper
    // In Theme 2 (Prussian Cyanotype): Pure photochemical cerulean-to-indigo blueprint wash
    // In Theme 0 (Marie Tharp): Bruce Heezen & Marie Tharp painted bathymetric wash
    if (sim.u_theme == 1u) {
        let cShoreWash = vec3<f32>(0.58, 0.70, 0.64);
        let cDeepWash  = vec3<f32>(0.24, 0.35, 0.46);
        let washTone = mix(cShoreWash, cDeepWash, depthBlend) * sunIllum;
        let fiberFreq = 1800.0 * max(0.1, sim.u_mediumProperties.y);
        let fiberTooth = (hashPaper2D(uvCoord * fiberFreq) - 0.5) * (sim.u_roughness * 0.35);
        waterColor = mix(waterColor, washTone * (1.0 + fiberTooth), 0.70);
    } else if (sim.u_theme == 2u) {
        let cShallowCyan = vec3<f32>(0.20, 0.36, 0.54);
        let cDeepIndigo  = vec3<f32>(0.04, 0.09, 0.18);
        let cyanWash = mix(cShallowCyan, cDeepIndigo, depthBlend) * sunIllum;
        let linenFreq = 1400.0 * max(0.1, sim.u_mediumProperties.y);
        let linenTooth = (hashPaper2D(uvCoord * linenFreq) - 0.5) * (sim.u_roughness * 0.30);
        waterColor = mix(waterColor, cyanWash * (1.0 + linenTooth), 0.65);
    } else if (sim.u_renderStyle < 2u) {
        // Theme 0 (Marie Tharp): Bruce Heezen & Marie Tharp / Heinrich Berann painted bathymetric wash
        let cTharpCoastal = vec3<f32>(0.08, 0.34, 0.42);
        let cTharpDeep    = vec3<f32>(0.02, 0.06, 0.14);
        let tharpWash = mix(cTharpCoastal, cTharpDeep, depthBlend) * sunIllum;
        let boardFreq = 750.0 * max(0.1, sim.u_mediumProperties.y);
        let boardTooth = (hashPaper2D(uvCoord * boardFreq) - 0.5) * (sim.u_roughness * 0.25);
        waterColor = mix(waterColor, tharpWash * (1.0 + boardTooth), 0.65);
    }

    let NdotV = max(0.0, dot(perturbedNormal, viewDir));
    const F0_WATER: f32 = 0.0204;
    let fresnel = F0_WATER + (1.0 - F0_WATER) * pow(1.0 - NdotV, uniforms.u_fresnelPower);

    let halfVec = normalize(sunDir + viewDir);
    let NdotH = max(0.0, dot(perturbedNormal, halfVec));
    let specPower = mix(128.0, 16.0, uniforms.u_roughness);
    let sunSpecular = pow(NdotH, specPower) * ((specPower + 8.0) / (8.0 * 3.14159265));

    // Dampen sky glare on the unfurled flat map so the ocean stays deep, clear, and visible
    let mapFresnelAtten = mix(1.0, 0.20, sim.u_unfurl);
    let isDark = sim.u_theme != 1u;
    let skyReflection = select(vec3<f32>(0.75, 0.85, 0.95), vec3<f32>(0.20, 0.38, 0.55), isDark) * (fresnel * mapFresnelAtten);
    let specAtten = mix(1.0, 0.35, sim.u_unfurl);

    let photorealSpecular = vec3<f32>(sunSpecular * fresnel * specAtten * shadowFactor);
    let archivalMatteSpecular = vec3<f32>(0.92, 0.95, 0.98) * (sunSpecular * fresnel * specAtten * shadowFactor * 0.20);
    let defaultSpecular = select(archivalMatteSpecular, photorealSpecular, sim.u_renderStyle >= 2u);

    var mediumSpecular: vec3<f32>;
    if (sim.u_theme == 1u) {
        mediumSpecular = vec3<f32>(0.95, 0.92, 0.85) * (sunSpecular * 0.02 * fresnel);
    } else if (sim.u_theme == 2u) {
        mediumSpecular = vec3<f32>(0.85, 0.92, 1.00) * (sunSpecular * fresnel * specAtten * shadowFactor * 0.25);
    } else {
        mediumSpecular = defaultSpecular;
    }

    let finalColor = waterColor * (1.0 - fresnel * 0.4) + skyReflection + mediumSpecular;

    // Dynamic optical transparency modulated by Beer-Lambert clarity (10% to 100%)
    let clarityNorm = clamp(sim.u_waterClarity, 0.08, 1.0);
    let kExtinction = 0.0006 / clarityNorm;
    let depthOpacity = 1.0 - exp(-safeDepth * kExtinction);
    let turbidityBase = mix(0.68, 0.15, clarityNorm);
    let maxOpacity = select(select(0.60, 0.55, sim.u_theme == 1u), 0.70, sim.u_theme == 2u);
    let waterOpacity = clamp(
        (turbidityBase + depthOpacity * 0.70 + fresnel * 0.20) * sim.u_layerOpacity,
        0.18,
        maxOpacity
    );

    let finalOutput = vec4<f32>(finalColor, waterOpacity);
    return select(vec4<f32>(0.0, 0.0, 0.0, 0.0), finalOutput, isWater);
}

// ----------------------------------------------------------------------------
// Manifold Kinematics Across All 5 Paradigms
// ----------------------------------------------------------------------------
fn computeCurlNoise(p: vec3<f32>, time: f32) -> vec3<f32> {
    let t = time * 0.75;
    let rot = mat3x3<f32>(
         0.00,  0.80,  0.60,
        -0.80,  0.36, -0.48,
        -0.60, -0.48,  0.64
    );
    let q1 = rot * p * 0.45;
    let q2 = rot * rot * p * 0.95;

    let ux = -0.55 * cos(0.55 * q1.y + t * 0.7) - 0.45 * cos(0.95 * q1.z - t * 0.5);
    let uy = -0.55 * cos(0.55 * q1.z + t * 0.9) - 0.45 * cos(0.95 * q1.x - t * 0.6);
    let uz = -0.55 * cos(0.55 * q1.x + t * 0.8) - 0.45 * cos(0.95 * q1.y - t * 0.4);

    let u2x = 0.25 * sin(1.5 * q2.y - t * 1.2);
    let u2y = 0.25 * sin(1.5 * q2.z - t * 1.1);
    let u2z = 0.25 * sin(1.5 * q2.x - t * 1.3);

    return rot * vec3<f32>(ux + u2x, uy + u2y, uz + u2z);
}

struct DeformedVertex {
    pos: vec3<f32>,
    normal: vec3<f32>,
};

fn evaluateManifold(uv: vec2<f32>, unfurl: f32, mode: u32) -> DeformedVertex {
    var out: DeformedVertex;
    let clampedUnfurl = clamp(unfurl, 0.0, 1.0);
    let ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);

    let lambda = (uv.x - 0.5) * TWO_PI_F32;
    let phi = (0.5 - uv.y) * PI_F32;

    let cosLat = cos(phi);
    let sinLat = sin(phi);
    let cosLon = cos(lambda);
    let sinLon = sin(lambda);

    let pos3D = vec3<f32>(RADIUS * cosLat * sinLon, RADIUS * sinLat, RADIUS * cosLat * cosLon);

    let clampedPhi = clamp(phi, -1.4835, 1.4835);
    let mercatorY = log(tan(PI_F32 * 0.25 + clampedPhi * 0.5)) * RADIUS;
    let mercatorX = lambda * RADIUS;
    let pos2D = vec3<f32>(mercatorX, mercatorY, 0.015);

    if (mode == 1u) {
        // Mode 1: Cylindrical Scroll Unfurling
        let oneMinusT = 1.0 - ease;
        if (oneMinusT > 0.001) {
            let invOneMinusT = 1.0 / oneMinusT;
            let curAngle = oneMinusT * lambda;
            let curX = (RADIUS * invOneMinusT) * sin(curAngle);
            let curZ = (RADIUS * cosLat * invOneMinusT) * (cos(curAngle) - 1.0) + (RADIUS * cosLat * oneMinusT);
            let curY = mix(pos3D.y, pos2D.y, ease);
            out.pos = vec3<f32>(curX, curY, curZ);

            let T_lambda = vec3<f32>(RADIUS * cos(curAngle), 0.0, -RADIUS * cosLat * sin(curAngle));
            let T_phi = vec3<f32>(
                0.0,
                mix(RADIUS * cosLat, RADIUS / max(cosLat, 0.05), ease),
                -RADIUS * sinLat * invOneMinusT * (cos(curAngle) - 1.0) - RADIUS * sinLat * oneMinusT
            );
            let rawNorm = cross(T_lambda, T_phi);
            out.normal = select(normalize(pos3D), normalize(rawNorm), length(rawNorm) > 0.0001);
        } else {
            let u = oneMinusT * lambda;
            let sinTerm = lambda * (1.0 - (u * u) / 6.0);
            let cosTerm = oneMinusT * (lambda * lambda) * (-0.5 + (u * u) / 24.0);
            let curX = RADIUS * sinTerm;
            let curZ = RADIUS * cosLat * cosTerm + RADIUS * cosLat * oneMinusT;
            let curY = mix(pos3D.y, pos2D.y, ease);
            out.pos = vec3<f32>(curX, curY, curZ);
            out.normal = vec3<f32>(0.0, 0.0, 1.0);
        }
    } else if (mode == 2u) {
        // Mode 2: Griffith LEFM
        let distToSeam = PI_F32 - abs(lambda);
        let seamFactor = 1.0 - smoothstep(0.0, 0.75, distToSeam);
        let tRupture = 0.18;

        let hitDist = length(pos3D - sim.u_cursorHitPos.xyz);
        let cursorInfluence = sim.u_cursorActive * exp(-hitDist * hitDist / (2.0 * 0.64));
        let hoopStress = cursorInfluence * 0.45 * (1.0 + 2.0 * cosLat * cosLat);

        if (ease < tRupture) {
            let strainProgress = ease / tRupture;
            let localStrain = seamFactor * strainProgress * max(0.2, cos(phi * 0.85)) + hoopStress;
            out.pos = pos3D + normalize(pos3D) * (localStrain * 0.30);
            out.normal = normalize(out.pos);
        } else {
            let postRuptureT = smoothstep(tRupture, 1.0, ease);
            let flutterWave = sin(distToSeam * 16.0 - ease * 24.0);
            let flutterDecay = exp(-4.2 * (ease - tRupture));
            let flutterAmp = (0.50 * seamFactor + cursorInfluence * 0.20) * flutterWave * flutterDecay;
            out.pos = mix(pos3D, pos2D, postRuptureT) + vec3<f32>(0.0, 0.0, flutterAmp);
            out.normal = mix(normalize(pos3D), vec3<f32>(0.0, 0.0, 1.0), postRuptureT);
        }
    } else if (mode == 3u) {
        // Mode 3: Fluid Advection
        let rawSin = sin(PI_F32 * clampedUnfurl);
        let liquefaction = pow(max(0.0, rawSin), 1.15);
        let unElevatedSphere = normalize(pos3D) * RADIUS;
        let basePos = mix(unElevatedSphere, vec3<f32>(mercatorX, mercatorY, 0.0), ease);
        let naturalVel = computeCurlNoise(basePos, sim.u_time);

        let hitDist = length(basePos - sim.u_cursorHitPos.xyz);
        let coreRadius = 0.85;
        let vortexCirc = (1.0 - exp(-hitDist * hitDist / (coreRadius * coreRadius))) / (hitDist + 0.05);
        let surfaceNormal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(basePos), length(basePos) > 0.001);
        let vortexTangent = normalize(cross(surfaceNormal, basePos - sim.u_cursorHitPos.xyz + vec3<f32>(0.001)));
        let clampedSpeed = clamp(sim.u_cursorVel.w, 0.0, 1.5);
        let vortexVelocity = vortexTangent * (sim.u_cursorActive * clampedSpeed * vortexCirc * 0.35);
        let wakeAdvection = normalize(sim.u_cursorVel.xyz + vec3<f32>(0.0001)) * (clampedSpeed * 0.15 * sim.u_cursorActive * exp(-hitDist * hitDist / 1.5));

        let wavePhase1 = dot(basePos, vec3<f32>(0.35, 0.62, 0.42)) * 1.35 - sim.u_time * 1.25;
        let wavePhase2 = dot(basePos, vec3<f32>(-0.45, 0.30, 0.65)) * 1.75 - sim.u_time * 0.90;
        let silkWave = (sin(wavePhase1) * 0.65 + cos(wavePhase2) * 0.35) * liquefaction * 0.65;
        let silkDrape = surfaceNormal * silkWave;

        let advectionOffset = naturalVel * (liquefaction * 1.55) + silkDrape + (vortexVelocity + wakeAdvection) * (sim.u_cursorActive * 0.25);
        out.pos = basePos + advectionOffset + surfaceNormal * 0.015;
        out.normal = mix(normalize(unElevatedSphere + silkDrape * 0.5), vec3<f32>(0.0, 0.0, 1.0), ease);
    } else if (mode == 4u) {
        // Mode 4: Fuller Dymaxion Polyhedral Net
        let arch = sin(PI_F32 * clampedUnfurl) * 0.45;
        let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);
        out.pos = mix(pos3D, pos2D, ease) + sphereNorm * arch;
        out.normal = mix(sphereNorm, vec3<f32>(0.0, 0.0, 1.0), ease);
    } else {
        // Mode 0: Linear Manifold Mix
        let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);
        out.pos = mix(pos3D, pos2D, ease);
        out.normal = mix(sphereNorm, vec3<f32>(0.0, 0.0, 1.0), ease);
    }

    return out;
}

fn decodeElevation(texColor: vec4<f32>) -> f32 {
    let normElev = texColor.a;
    return normElev * 19772.0 - 10924.0; // [-10,924m .. +8,848m]
}

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

@vertex
fn vs_main(input: VertexInput, @builtin(instance_index) instanceIdx: u32) -> VertexOutput {
    var output: VertexOutput;

    var inUv = input.uv;
    var inSurfaceType = input.surfaceType;
    var d2D = input.target2D.zw;

    var deformed: DeformedVertex;
    var inst: CDLODInstance;
    var instLod: f32 = 0.0;

    if (u_cdlodControl.u_cdlodActive == 1u) {
        inst = cdlodInstances[instanceIdx];
        let p = input.position.xy;

        // Evaluate unmorphed coordinate & world position to compute camera distance r
        let uv_unmorphed = inst.minUV + p * inst.sizeUV;
        let unmorphed = evaluateManifold(uv_unmorphed, sim.u_unfurl, sim.u_mode);
        let r = length(unmorphed.pos - sim.u_cameraPos.xyz);

        // Morph factor alpha
        let alpha = clamp((r - inst.morphStart) * inst.invMorphRange, 0.0, 1.0);

        // Snap odd grid coordinates in parameter space
        let p_morphed = p - alpha * (fract(p * 32.0) * (1.0 / 32.0));

        // Compute global parametric coordinate
        let uv = inst.minUV + p_morphed * inst.sizeUV;
        inUv = uv;

        // Continuous LOD fraction including morph progression
        inst.lodFraction = f32(inst.lod) + alpha;
        instLod = inst.lodFraction;

        // Pass canonical (u, v) directly into evaluateManifold
        deformed = evaluateManifold(uv, sim.u_unfurl, sim.u_mode);
        d2D = vec2<f32>(0.0, 0.0);
    } else {
        deformed = evaluateManifold(inUv, sim.u_unfurl, sim.u_mode);
        let patchDistPre = length(sim.u_cameraPos.xyz - deformed.pos);
        inst.lodFraction = clamp(log2(max(1.0, patchDistPre * 0.2)), 0.0, 4.0);
        instLod = inst.lodFraction;
    }

    output.uv = inUv;
    output.surfaceType = inSurfaceType;

    let basePos = deformed.pos;
    let baseNormal = deformed.normal;

    // Continuous patch LOD based on camera distance to patch base position:
    // Prevents Nyquist sub-pixel sampling spikes while preserving bold 3D massif relief
    let patchDist = length(sim.u_cameraPos.xyz - basePos);
    let patchLOD = clamp(log2(max(1.0, patchDist * 0.2)), 0.0, 4.0);

    let uv = inUv;
    let demSample = textureSampleLevel(u_demTexture, u_demSampler, uv, inst.lodFraction);
    let demSampleComp = sampleRegionalComposite(uv, demSample, instLod);
    let elevMeters = decodeElevation(demSampleComp);
    output.elevation = elevMeters;

    // Liquid Hydrosphere shell: conforms to dynamic lake datum or global sea level
    let hydroSample = textureSampleLevel(u_hydroTexture, u_demSampler, inUv, 0.0);
    let z_lake = hydroSample.g * 9000.0;
    let isLake = z_lake > 0.0;
    let localWaterDatum = select(sim.u_seaLevel, z_lake, z_lake > 0.0);

    // Calculate sea level displacement
    let depth = max(0.0, localWaterDatum - elevMeters);
    output.waterDepth = depth;

    // Polar displacement attenuation near singularities (prevent spiky mesh artifacts in Canada/Greenland/Siberia)
    let poleDist = abs(inUv.y - 0.5) * 2.0;
    let poleAtten = 1.0 - smoothstep(0.85, 0.98, poleDist);

    // Synchronous Dual-Surface Morphing Theorem (Theorem 3.3.2):
    // Zero gaps and zero z-fighting at shoreline (h = 0)
    var normalDisplacement = 0.0;
    let dispScale = sim.u_displacementScale * 2.8;
    if (inSurfaceType > 0.5) {
        normalDisplacement = (localWaterDatum / 8848.0) * dispScale * poleAtten;
    } else {
        // Lithosphere Crust: linear geometric elevation displacement & full bathymetry (0.65 dampening removed)
        if (sim.u_verticalScaleMode == 1u) {
            if (elevMeters >= 0.0) {
                // Symmetrical logarithmic elevation: expands lower/mid relief (hills/valleys) while smoothly bounding summits
                let logNormH = log(1.0 + elevMeters / 1200.0) / log(1.0 + 8848.0 / 1200.0);
                normalDisplacement = logNormH * dispScale * poleAtten;
            } else {
                // Symmetrical logarithmic bathymetry: reveals continental shelf and slope without core blowout
                let logNormD = log(1.0 + (-elevMeters) / 1500.0) / log(1.0 + 10924.0 / 1500.0);
                normalDisplacement = -logNormD * dispScale * poleAtten;
            }
        } else {
            if (elevMeters >= 0.0) {
                // True linear physical displacement: normalDisplacement = elevMeters * sim.u_elevationExaggeration
                let normH = elevMeters / 8848.0;
                normalDisplacement = normH * dispScale * poleAtten;
            } else {
                let normD = clamp(-elevMeters / 10924.0, 0.0, 1.0);
                // Continuous finite-slope continental shelf: eliminates vertical shear cliff at shoreline
                let shelfD = normD / (1.0 + 1.5 * (1.0 - normD));
                normalDisplacement = -shelfD * dispScale * poleAtten;
            }
        }
    }

    // Invariant §10: Grazing Horizon Parameterization for negative bathymetric displacement
    let viewDir = normalize(sim.u_cameraPos.xyz - basePos);
    let camDist = length(sim.u_cameraPos.xyz);
    let d_cam = camDist;
    let R_planet = RADIUS;
    let cosHorizon = sqrt(max(0.0, 1.0 - pow(R_planet / camDist, 2.0)));
    let tau = dot(baseNormal, viewDir) - cosHorizon;
    let limbAtten = smoothstep(0.000, 0.005, tau);
    if (normalDisplacement < 0.0) {
        normalDisplacement = normalDisplacement * limbAtten;
    }

    let worldP = basePos + baseNormal * normalDisplacement;
    output.worldPos = worldP;
    output.normal = baseNormal;

    output.dymaxion2D = d2D;

    let viewPos = sim.u_viewMatrix * vec4<f32>(worldP, 1.0);
    output.clipPos = sim.u_projectionMatrix * viewPos;

    return output;
}

// ----------------------------------------------------------------------------
// Cloud Ground Shadow Projection & Soft Penumbra Filtering (Spec §2.1)
// ----------------------------------------------------------------------------
fn computeCloudShadowOffset(uv: vec2<f32>, sunAzimuthDeg: f32, sunAltitudeDeg: f32) -> vec2<f32> {
    const EARTH_RADIUS_KM: f32 = 6371.0;
    let cloudAltKm: f32 = select(2.5, sim.u_cloudAltitudeKm, sim.u_cloudAltitudeKm > 0.0);
    const TWO_PI_RE: f32 = 2.0 * 3.141592653589793 * EARTH_RADIUS_KM; // ~40030.17 km
    const PI_RE: f32 = 3.141592653589793 * EARTH_RADIUS_KM;           // ~20015.09 km

    // Key light sun azimuth (315.0 deg / NW) and altitude (45.0 deg) default
    let azDeg = select(315.0, sunAzimuthDeg, sunAzimuthDeg > 0.0);
    let altDeg = select(45.0, sunAltitudeDeg, sunAltitudeDeg > 0.0);

    let radAz = radians(azDeg);
    let radAlt = clamp(radians(altDeg), radians(5.0), radians(85.0)); // Prevent horizon division by zero
    let tanAlt = tan(radAlt);

    // Invariant §18: Spherical metric tensor arc-length evaluation
    let cosLat = max(0.15, cos((uv.y - 0.5) * 3.141592653589793));

    // Spec §2.1 Equirectangular shadow displacement
    let deltaU = -(cloudAltKm / (tanAlt * TWO_PI_RE)) * cos(radAz) / cosLat;
    let deltaV =  (cloudAltKm / (tanAlt * PI_RE)) * sin(radAz);

    return vec2<f32>(deltaU, deltaV);
}

fn sampleCloudShadowFactor(uv: vec2<f32>, shadowOffset: vec2<f32>, intensity: f32) -> f32 {
    const EARTH_CIRCUMFERENCE_M: f32 = 40075000.0;
    let physicalRate = sim.u_cloudDriftRate / EARTH_CIRCUMFERENCE_M;
    let driftOffset = sim.u_time * physicalRate;
    let centerUV = vec2<f32>(fract(uv.x + driftOffset + shadowOffset.x), clamp(uv.y + shadowOffset.y, 0.001, 0.999));
    let cosLat = max(0.15, cos((uv.y - 0.5) * 3.141592653589793));

    // 20 km penumbra filter radius in UV space
    const PENUMBRA_KM: f32 = 20.0;
    const TWO_PI_RE: f32 = 40030.17;
    const PI_RE: f32 = 20015.09;
    let rU = (PENUMBRA_KM / TWO_PI_RE) / cosLat;
    let rV = PENUMBRA_KM / PI_RE;

    // 4 rotated jitter taps (Poisson disk distribution)
    let tap0 = vec2<f32>(fract(centerUV.x - 0.38 * rU), clamp(centerUV.y - 0.92 * rV, 0.0, 1.0));
    let tap1 = vec2<f32>(fract(centerUV.x + 0.92 * rU), clamp(centerUV.y - 0.38 * rV, 0.0, 1.0));
    let tap2 = vec2<f32>(fract(centerUV.x + 0.38 * rU), clamp(centerUV.y + 0.92 * rV, 0.0, 1.0));
    let tap3 = vec2<f32>(fract(centerUV.x - 0.92 * rU), clamp(centerUV.y + 0.38 * rV, 0.0, 1.0));

    // Invariant §3: Explicit LOD 0.0
    let c0 = textureSampleLevel(u_cloudTexture, u_cloudSampler, tap0, 0.0).r;
    let c1 = textureSampleLevel(u_cloudTexture, u_cloudSampler, tap1, 0.0).r;
    let c2 = textureSampleLevel(u_cloudTexture, u_cloudSampler, tap2, 0.0).r;
    let c3 = textureSampleLevel(u_cloudTexture, u_cloudSampler, tap3, 0.0).r;

    let cloudDens = (c0 + c1 + c2 + c3) * 0.25;

    // Soft ground shadow attenuation per Spec §2.1
    let shadowFactor = 1.0 - intensity * smoothstep(0.10, 0.35, cloudDens);
    return clamp(shadowFactor, 0.0, 1.0);
}

// ----------------------------------------------------------------------------
// apply_weather_pigmentation: Stage 3 Archival Ink Weather Overlays
// Conforms strictly to Invariant §28 (Explicit 3-Medium Branching)
// ----------------------------------------------------------------------------
fn apply_weather_pigmentation(
    precipRate: f32,
    theme: u32,
    mediumProps: vec4<f32>,
    baseColor: vec4<f32>
) -> vec4<f32> {
    let intensity = clamp(precipRate / 50.0, 0.0, 1.0);
    if (intensity <= 0.001) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }

    if (theme == 0u) {
        // Theme 0: Marie Tharp 1977 — Lithographic stipple density modulated by precipRate
        let stippleProb = clamp(intensity * 0.85 * max(0.1, mediumProps.w), 0.05, 0.95);
        let hashSeed = vec2<f32>(
            baseColor.r * 1337.1 + baseColor.b * 3141.5,
            baseColor.g * 2718.2 + precipRate * 42.0
        );
        let rng = hashPaper2D(hashSeed);
        let hasDot = select(0.0, 1.0, rng < stippleProb);
        let alpha = clamp(hasDot * intensity * 0.65 + intensity * 0.15, 0.0, 0.85);
        let cTharpIndigo = vec3<f32>(0.118, 0.161, 0.231); // #1E293B Marine Indigo
        return vec4<f32>(cTharpIndigo, alpha);
    } else if (theme == 1u) {
        // Theme 1: Cream Rag — Warm sepia-charcoal wash modulated by paper tooth (mediumProps.y)
        let paperTooth = mediumProps.y;
        let toothSeed = vec2<f32>(baseColor.g * 1920.0, baseColor.r * 1080.0) * max(0.1, paperTooth);
        let toothNoise = (hashPaper2D(toothSeed) - 0.5) * 0.35;
        let toothFactor = clamp(paperTooth * (1.0 + toothNoise), 0.5, 1.5);
        let alpha = clamp(intensity * 0.6 * toothFactor, 0.0, 0.90);
        return vec4<f32>(0.220, 0.188, 0.165, alpha);
    } else if (theme == 2u) {
        // Theme 2: Prussian Cyanotype 1842 — Actinic solarization to deep Prussian blue
        let gamma = max(0.1, mediumProps.z);
        let solarizedIntensity = pow(intensity, 1.0 / gamma);
        let alpha = clamp(solarizedIntensity * 0.8, 0.0, 0.95);
        return vec4<f32>(0.039, 0.098, 0.184, alpha);
    } else {
        // Defensive fallback for non-standard theme
        return vec4<f32>(0.220, 0.188, 0.165, intensity * 0.6);
    }
}

// ----------------------------------------------------------------------------
// sample_spectral_doppler: Standard Meteorological Radar Color Ramp
// ----------------------------------------------------------------------------
fn sample_spectral_doppler(precipRate: f32) -> vec4<f32> {
    if (precipRate < 0.1) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }

    let cLightBlue = vec3<f32>(0.25, 0.60, 1.00);
    let cGreen     = vec3<f32>(0.00, 0.78, 0.20);
    let cYellow    = vec3<f32>(1.00, 0.85, 0.00);
    let cOrange    = vec3<f32>(1.00, 0.47, 0.00);
    let cRed       = vec3<f32>(0.90, 0.00, 0.00);
    let cMagenta   = vec3<f32>(0.78, 0.00, 0.78);

    var color: vec3<f32>;
    var alpha: f32 = 0.75;

    if (precipRate < 1.0) {
        let t = (precipRate - 0.1) / 0.9;
        color = mix(cLightBlue * 0.8, cLightBlue, t);
        alpha = mix(0.40, 0.65, t);
    } else if (precipRate < 2.5) {
        let t = (precipRate - 1.0) / 1.5;
        color = mix(cLightBlue, cGreen, t);
        alpha = mix(0.65, 0.75, t);
    } else if (precipRate < 7.5) {
        let t = (precipRate - 2.5) / 5.0;
        color = mix(cGreen, cYellow, t);
        alpha = mix(0.75, 0.80, t);
    } else if (precipRate < 15.0) {
        let t = (precipRate - 7.5) / 7.5;
        color = mix(cYellow, cOrange, t);
        alpha = mix(0.80, 0.85, t);
    } else if (precipRate < 30.0) {
        let t = (precipRate - 15.0) / 15.0;
        color = mix(cOrange, cRed, t);
        alpha = mix(0.85, 0.90, t);
    } else {
        let t = clamp((precipRate - 30.0) / 20.0, 0.0, 1.0);
        color = mix(cRed, cMagenta, t);
        alpha = mix(0.90, 0.95, t);
    }

    return vec4<f32>(color, alpha);
}

// ----------------------------------------------------------------------------
// compute_valley_drainage: Modulates Leopold-Maddock river channel width by pluvial factor
// ----------------------------------------------------------------------------
fn compute_valley_drainage(baseWidth: f32, precipRate: f32, pluvialGamma: f32) -> f32 {
    let pluvialFactor = 1.0 + pluvialGamma * sqrt(clamp(precipRate, 0.0, 50.0));
    return baseWidth * pluvialFactor;
}

// ============================================================================
// Riemannian Exponential Map & Spherical Geodesic Advection on S^2
// ============================================================================
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
    let phi_a = (0.5 - arrivalUV.y) * PI_F32;
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
    let uv_x = fract(arrivalUV.x + delta_lambda * INV_TWO_PI_F32 + 1.0);
    let uv_y = clamp(0.5 - phi_d * INV_PI_F32, 0.0001, 0.9999);
    return vec2<f32>(uv_x, uv_y);
}

// Bidirectional semi-Lagrangian great-circle advection helper
fn sampleAdvectedPrecipitationField(
    arrivalUV: vec2<f32>,
    windVelMps: vec2<f32>,
    tau: f32
) -> f32 {
    let advectionMultiplier = sim.u_advectionActive;
    let uv0 = mapSphericalGeodesicUV(arrivalUV, -windVelMps, tau * 3600.0 * advectionMultiplier);
    let uv1 = mapSphericalGeodesicUV(arrivalUV, windVelMps, (1.0 - tau) * 3600.0 * advectionMultiplier);
    let sample0 = textureSampleLevel(u_precipTexture, u_precipSampler, uv0, 0.0).r;
    let sample1 = textureSampleLevel(u_precipNextTexture, u_precipSampler, uv1, 0.0).r;
    return mix(sample0, sample1, tau);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // 1. Unconditional derivative evaluation for WGSL uniform control flow conformance (Invariant #3)
    let du_dx = dpdx(input.uv.x);
    let du_dy = dpdy(input.uv.x);
    let dv_dx = dpdx(input.uv.y);
    let dv_dy = dpdy(input.uv.y);
    let dym_dx = dpdx(input.dymaxion2D);
    let dym_dy = dpdy(input.dymaxion2D);
    let dUV = fwidth(input.uv);

    // 2. Unconditional DEM 5-tap sampling with screen-space derivative LOD strictly before any branching/discard (Invariant #3)
    let duv_dx = vec2<f32>(du_dx, dv_dx);
    let duv_dy = vec2<f32>(du_dy, dv_dy);
    let demDims = textureDimensions(u_demTexture);
    let texSize = vec2<f32>(f32(demDims.x), f32(demDims.y));
    let deltaMax2 = max(dot(duv_dx * texSize, duv_dx * texSize), dot(duv_dy * texSize, duv_dy * texSize));
    let mipLOD = clamp(0.5 * log2(max(deltaMax2, 1e-4)) * 0.08, 0.0, 0.5);

    let pixelFootprintM = length(dUV) * (PI * EARTH_RADIUS_M);
    let normalLOD = clamp(log2(max(1.0, pixelFootprintM / 450.0)), 0.0, 8.0);

    let mipStep = exp2(floor(mipLOD));
    let tsGlobal = (vec2<f32>(1.0, 1.0) / max(texSize, vec2<f32>(1.0, 1.0))) * max(1.0, mipStep);

    let regDims = textureDimensions(u_regionalDEMTexture);
    let regWeightC = getRegionalBlendWeight(input.uv);
    let regSpanLon = max(0.001, u_regionalOverlay.u_regionalBounds.z - u_regionalOverlay.u_regionalBounds.x);
    let regSpanLat = max(0.001, u_regionalOverlay.u_regionalBounds.w - u_regionalOverlay.u_regionalBounds.y);
    let tsRegional = vec2<f32>(
        (regSpanLon / 360.0) / max(f32(regDims.x), 1.0),
        (regSpanLat / 180.0) / max(f32(regDims.y), 1.0)
    ) * max(1.0, mipStep);

    let ts = mix(tsGlobal, tsRegional * 3.0, regWeightC);
    let slopeScale = clamp(mix(1.0, 2.2, regWeightC), 1.0, 2.5);

    // Antimeridian seamless horizontal wrapping (fract on U) and polar clamp (clamp on V) to eliminate tile/seam artifacts
    let uvR = vec2<f32>(fract(input.uv.x + ts.x), clamp(input.uv.y, 0.0, 1.0));
    let uvL = vec2<f32>(fract(input.uv.x - ts.x + 1.0), clamp(input.uv.y, 0.0, 1.0));
    let uvU = vec2<f32>(input.uv.x, clamp(input.uv.y + ts.y, 0.0, 1.0));
    let uvD = vec2<f32>(input.uv.x, clamp(input.uv.y - ts.y, 0.0, 1.0));

    let demC = textureSampleLevel(u_demTexture, u_demSampler, input.uv, mipLOD);
    let demR = textureSampleLevel(u_demTexture, u_demSampler, uvR, mipLOD);
    let demL = textureSampleLevel(u_demTexture, u_demSampler, uvL, mipLOD);
    let demU = textureSampleLevel(u_demTexture, u_demSampler, uvU, mipLOD);
    let demD = textureSampleLevel(u_demTexture, u_demSampler, uvD, mipLOD);

    // Seamless Regional High-Resolution DEM Compositing (NOAA CUDEM ~10m)
    let finalDemC = sampleRegionalComposite(input.uv, demC, 0.0);
    let finalDemR = sampleRegionalComposite(uvR, demR, 0.0);
    let finalDemL = sampleRegionalComposite(uvL, demL, 0.0);
    let finalDemU = sampleRegionalComposite(uvU, demU, 0.0);
    let finalDemD = sampleRegionalComposite(uvD, demD, 0.0);

    // 3. Unconditional Cloud Ground Shadow 4-tap sampling strictly before dynamic branching/discard (Invariant #3)
    let shadowOffset = computeCloudShadowOffset(input.uv, sim.u_sunAzimuth, sim.u_sunAltitude);
    let shadowIntensity = sim.u_shadowIntensity;
    let shadowFactor = sampleCloudShadowFactor(input.uv, shadowOffset, shadowIntensity);

    // Unconditional Directional Terrain Horizon Self-Shadow sampling strictly before dynamic branching/discard (Section 2)
    let terrainShadowRaw = textureSampleLevel(u_terrainShadowTexture, u_terrainShadowSampler, input.uv, 0.0).r;
    let terrainShadow = select(1.0, terrainShadowRaw, u_terrainShadow.u_shadowMapDimensions.x > 0u && u_terrainShadow.u_sunAltitude > 0.0);

    // 4. Unconditional Precipitation, Next Precipitation, Wind, Temperature & Dewpoint Texture Sampling strictly before dynamic branching/discard (Invariant #3)
    let precipUV = input.uv;
    let precipRateRaw = textureSampleLevel(u_precipTexture, u_precipSampler, precipUV, 0.0).r;
    let windForAdvection = textureSampleLevel(u_windTexture, u_precipSampler, input.uv, 0.0);
    // The full bidirectional advection activates when two temporal frames are available
    // For now, store the scrub tau for downstream use
    let scrubTau = sim.u_scrubTau;
    let tempC = textureSampleLevel(u_tempTexture, u_precipSampler, precipUV, 0.0).r;
    let dewpointC = textureSampleLevel(u_dewpointTexture, u_precipSampler, precipUV, 0.0).r;
    let hydroSample = textureSampleLevel(u_hydroTexture, u_demSampler, input.uv, 0.0);
    let z_lake = hydroSample.g * 9000.0;
    let normSample0 = textureSampleLevel(u_normalTexture, u_demSampler, input.uv, 0.0);
    let normSampleGlobal = textureSampleLevel(u_normalTexture, u_demSampler, input.uv, normalLOD);
    let lclMeters = 125.0 * max(tempC - dewpointC, 0.0);
    let demSample = finalDemC;
    let elevMeters = demSample.a * 19772.0 - 10924.0; // Standard DEM decode (Invariant §15)
    let lclGateRaw = smoothstep(lclMeters - 200.0, lclMeters, elevMeters);
    let lclGate = select(lclGateRaw, 1.0, sim.u_lclBypass > 0.5);
    // Unconditional semi-Lagrangian advection evaluation for WGSL uniform control flow conformance (Invariant #3)
    let precipAdvectedField = sampleAdvectedPrecipitationField(input.uv, windForAdvection.xy, scrubTau);
    let precipAdvected = select(precipRateRaw, precipAdvectedField, sim.u_advectionActive > 0.5);
    // Modulate precipitation by LCL gate
    let precipModulated = precipAdvected * lclGate;
    let precipRate = precipModulated;

    // Dymaxion cross-facet polygon tearing discard guard via analytical 2D Jacobian
    if (sim.u_mode == 4u && sim.u_unfurl > 0.02) {
        let det = du_dx * dv_dy - du_dy * dv_dx;
        if (abs(det) > 1e-12) {
            let invDet = 1.0 / det;
            let d_du = (dym_dx * dv_dy - dym_dy * dv_dx) * invDet;
            let d_dv = (-dym_dx * du_dy + dym_dy * du_dx) * invDet;

            if (length(d_du) > 35.0 || length(d_dv) > 35.0) {
                discard;
            }
        }
    }

    let V = normalize(sim.u_cameraPos.xyz - input.worldPos);
    let N = normalize(input.normal);

    if (input.surfaceType > 0.5) {
        if (sim.u_purityMode > 0.5) {
            discard;
        }
        // Dynamic lake datum evaluation: preserve water shell for inland lakes (e.g. Lake Titicaca at +3812m)
        let localWaterDatum = select(sim.u_seaLevel, z_lake, z_lake > 0.0);
        let depthMeters = max(0.0, localWaterDatum - elevMeters);
        if (depthMeters <= 0.001) {
            discard;
        }

        var hydroUniforms: HydrosphereUniforms;
        let clarityIdx = clamp(u32(floor((1.0 - clamp(sim.u_waterClarity, 0.0, 1.0)) * 4.0 + 0.5)), 0u, 4u);
        hydroUniforms.u_waterType = clarityIdx;
        hydroUniforms.u_time = sim.u_time;
        hydroUniforms.u_seaLevelOffset = localWaterDatum;
        hydroUniforms.u_causticIntensity = 1.0;
        hydroUniforms.u_sunAzimuth = sim.u_sunAzimuth;
        hydroUniforms.u_sunAltitude = sim.u_sunAltitude;
        hydroUniforms.u_roughness = sim.u_roughness;
        hydroUniforms.u_fresnelPower = 4.0;

        let sunPrimary = computeSunLightDir(sim.u_sunAzimuth, sim.u_sunAltitude);
        let safeElevation = elevMeters;
        let hydroColor = computeHydrosphereShading(
            input.worldPos,
            N,
            V,
            sunPrimary,
            input.uv,
            safeElevation,
            hydroUniforms,
            shadowFactor
        );

        var hydroRgb = hydroColor.rgb;
        var hydroOverlay: vec4<f32>;
        if (sim.u_weatherOpticalMode == 1u) {
            hydroOverlay = sample_spectral_doppler(precipRate);
        } else {
            hydroOverlay = apply_weather_pigmentation(
                precipRate,
                sim.u_theme,
                sim.u_mediumProperties,
                vec4<f32>(hydroRgb, 1.0)
            );
        }
        hydroRgb = mix(hydroRgb, hydroOverlay.rgb, hydroOverlay.a);

        return vec4<f32>(hydroRgb, hydroColor.a);
    }

    // Lithosphere Crust Pass with Eduard Imhof Swiss Relief Shading
    let n0 = normalize(input.normal);

    // Continuous orthonormal tangent frame on sphere & planar manifold
    // Eliminates the discontinuous abs(n0.y) > 0.95 step at latitude 71.8° and polar starburst spokes
    let lambda = (input.uv.x - 0.5) * (2.0 * PI);
    let sphereTangentX = vec3<f32>(cos(lambda), 0.0, -sin(lambda));
    let sphereTangentY = cross(n0, sphereTangentX);
    let flatTangentX = vec3<f32>(1.0, 0.0, 0.0);
    let flatTangentY = vec3<f32>(0.0, 1.0, 0.0);
    let tangentX = normalize(mix(sphereTangentX, flatTangentX, sim.u_unfurl));
    let tangentY = normalize(mix(sphereTangentY, flatTangentY, sim.u_unfurl));

    let isLandBase = finalDemC.b;
    let landElevBase = finalDemC.r;
    let oceanDepthBase = finalDemC.g;

    // Dynamic coastal inundation & shelf exposure coupled to u_seaLevel
    let isLand = select(isLandBase, smoothstep(sim.u_seaLevel - 4.0, sim.u_seaLevel + 4.0, elevMeters), abs(sim.u_seaLevel) > 0.01);
    let landElev = select(landElevBase, max(0.0, (elevMeters - sim.u_seaLevel) / 8848.0), abs(sim.u_seaLevel) > 0.01);
    let oceanDepth = select(oceanDepthBase, max(0.0, (sim.u_seaLevel - elevMeters) / 10924.0), abs(sim.u_seaLevel) > 0.01);

    let onLand = isLand > 0.45;
    // True physical bathymetric elevation scale matching land elevation:
    // land: [0 .. +8848m] -> [0.0 .. 1.0]
    // ocean: [0 .. -10924m] -> [0.0 .. -1.2346]
    let bathyElev = -oceanDepth * (10924.0 / 8848.0);
    let hC = select(bathyElev, landElev, onLand);

    // Domain-aware one-sided finite differences: clamp cross-boundary taps to hC
    let hasR = select(finalDemR.b <= 0.45, finalDemR.b > 0.45, onLand);
    let hasL = select(finalDemL.b <= 0.45, finalDemL.b > 0.45, onLand);
    let hasU = select(finalDemU.b <= 0.45, finalDemU.b > 0.45, onLand);
    let hasD = select(finalDemD.b <= 0.45, finalDemD.b > 0.45, onLand);

    let rawHR = select(-finalDemR.g * (10924.0 / 8848.0), finalDemR.r, onLand);
    let rawHL = select(-finalDemL.g * (10924.0 / 8848.0), finalDemL.r, onLand);
    let rawHU = select(-finalDemU.g * (10924.0 / 8848.0), finalDemU.r, onLand);
    let rawHD = select(-finalDemD.g * (10924.0 / 8848.0), finalDemD.r, onLand);

    let effHR = select(hC, rawHR, hasR);
    let effHL = select(hC, rawHL, hasL);
    let effHU = select(hC, rawHU, hasU);
    let effHD = select(hC, rawHD, hasD);

    let hR = effHR;
    let hL = effHL;
    let hU = effHU;
    let hD = effHD;

    // Controlled displacement scale: calibrated for crisp Eduard Imhof Swiss relief hillshading
    let dispScale = sim.u_displacementScale * 45.0 + 1.0;
    // Polar displacement and gradient attenuation near singularities (lat > 76.5°)
    // Smoothly attenuates finite difference spikes, Laplacian explosion, and tangential spinning near poles
    // Exact match with vertex shader poleAtten (0.85 to 0.98)
    let fragPoleDist = abs(input.uv.y - 0.5) * 2.0;
    let fragPoleAtten = 1.0 - smoothstep(0.85, 0.98, fragPoleDist);
    let cosLatPolar = max(0.0, cos((input.uv.y - 0.5) * PI));
    let polarLonAtten = smoothstep(0.01, 0.25, cosLatPolar);

    let scaleX = select(select(0.0, 1.0, hasR || hasL), 0.5, hasR && hasL);
    let scaleY = select(select(0.0, 1.0, hasU || hasD), 0.5, hasU && hasD);
    let dHx = (effHR - effHL) * scaleX * dispScale * slopeScale;
    let dHy = (effHD - effHU) * scaleY * dispScale * slopeScale;
    let effDHx = dHx * polarLonAtten;
    let effDHy = dHy * polarLonAtten;

    // Perturbed surface normal in 3D world space with polar attenuation
    let perturbedN = normalize(n0 - (tangentX * effDHx + tangentY * effDHy) * fragPoleAtten);

    // Multi-Scale Normal Shading:
    // Blend between a 7.2 km macro-geomorphic baseline and a 450 m micro-structural baseline
    // using screen-space UV derivatives
    let multiScaleBlend = clamp((pixelFootprintM - 450.0) / (7200.0 - 450.0), 0.0, 1.0);

    // Micro-structural normal reconstructed from BC5 normal map: Z = sqrt(1.0 - X^2 - Y^2)
    let normX = normSample0.r * 2.0 - 1.0;
    let normY = normSample0.g * 2.0 - 1.0;
    let normZ = sqrt(max(0.0, 1.0 - normX * normX - normY * normY));
    let macroN = perturbedN; // 7.2 km macroscopic geomorphic baseline
    let microScale = sim.u_displacementScale * 25.0 + 1.0;
    let microN = normalize(macroN * normZ + (tangentX * normX + tangentY * normY) * (fragPoleAtten * microScale));

    let blendedN = normalize(mix(microN, macroN, multiScaleBlend));
    let effectiveNormal = select(blendedN, macroN, length(vec2<f32>(normX, normY)) < 0.01);

    // Toksvig Specular Anti-Aliasing:
    // Derive the tangent-space normal and Toksvig length L = ||N_avg|| across mipmap levels.
    let nMipX = normSampleGlobal.r * 2.0 - 1.0;
    let nMipY = normSampleGlobal.g * 2.0 - 1.0;
    let normalDispersion = length(vec2<f32>(normX, normY) - vec2<f32>(nMipX, nMipY));
    let mipScale = clamp(normalLOD * 0.25, 0.0, 1.0);
    let L = clamp(1.0 - normalDispersion * (3.8 * mipScale + 0.4), 0.04, 1.0);
    let L_toksvig = L;
    let variance = (1.0 - L) / max(L, 1e-4);
    let sigma_sq = variance;
    let baseRoughness = select(0.06, clamp(sim.u_roughness, 0.04, 0.25), sim.u_theme != 1u);
    let alpha_base = baseRoughness;
    let roughness = sqrt(baseRoughness * baseRoughness + variance);
    let alpha_prime = roughness;
    let effectiveAlpha = select(roughness, baseRoughness, sim._padScrub1 > 0.5);

    // Discrete Laplacian Curvature evaluated strictly on domain-aware effective elevations
    let laplacian = ((effHR + effHL + effHU + effHD) - 4.0 * hC) * slopeScale;
    let effLaplacian = laplacian * fragPoleAtten * polarLonAtten;
    let kRidge  = clamp(-effLaplacian * 25.0, 0.0, 1.0);
    let kValley = clamp(effLaplacian * 45.0, 0.0, 1.0);

    // Multidirectional Oblique Solar Illumination controlled dynamically by u_sunAzimuth & u_sunAltitude
    let L1_view = computeSunLightDir(sim.u_sunAzimuth, sim.u_sunAltitude);
    let L2_view = computeSunLightDir(sim.u_sunAzimuth - 90.0, sim.u_sunAltitude * 0.65);

    let N_view = normalize((sim.u_viewMatrix * vec4<f32>(effectiveNormal, 0.0)).xyz);
    let NdotL1 = max(0.0, dot(N_view, L1_view)) * terrainShadow;
    let NdotL2 = max(0.0, dot(N_view, L2_view));

    var diffuseTotal = 0.08 + (0.72 * NdotL1) * shadowFactor + 0.20 * NdotL2;

    // Ridge Crest Contrast Enhancement & Valley Crevice AO (modulated by u_ambientOcclusion)
    let ridgeEnhance = (NdotL1 - 0.5) * kRidge * 0.22;
    diffuseTotal = clamp(diffuseTotal + ridgeEnhance * shadowFactor, 0.04, 1.40);
    let creviceAO = 1.0 - kValley * (0.85 * sim.u_ambientOcclusion);
    diffuseTotal = diffuseTotal * creviceAO;

    // Tangent-space micro-structural normal from BC5 Level 0:
    let n_micro = microN;

    // Filtered normal from BC5 mipmap pyramid at screen-space derivative LOD:
    let nMipZ = sqrt(max(0.0, 1.0 - nMipX * nMipX - nMipY * nMipY));
    let n_filtered = normalize(macroN * nMipZ + (tangentX * nMipX + tangentY * nMipY) * (fragPoleAtten * microScale));

    // Toksvig Specular Anti-Aliasing:
    // When bypassed: raw un-filtered Level 0 micro-normal with base roughness alpha_base.
    // When active: filtered LOD normal with Toksvig roughness alpha_prime.
    let specNormalWorld = select(n_filtered, n_micro, sim._padScrub1 > 0.5);
    let N_view_spec = normalize((sim.u_viewMatrix * vec4<f32>(specNormalWorld, 0.0)).xyz);
    let pos_view = (sim.u_viewMatrix * vec4<f32>(input.worldPos, 1.0)).xyz;
    let V_view = normalize(-pos_view);
    let L_view = L1_view;
    let H_view = normalize(L_view + V_view);
    let NdotH_crust = max(0.0, dot(N_view_spec, H_view));
    let NdotV_crust = max(0.0, dot(N_view_spec, V_view));
    let NdotL_crust = max(0.0, dot(N_view_spec, L_view));

    let a2_spec = effectiveAlpha * effectiveAlpha;
    let dDenom_crust = NdotH_crust * NdotH_crust * (a2_spec - 1.0) + 1.0;
    let D_crust = a2_spec / (PI * dDenom_crust * dDenom_crust);
    let k_crust = effectiveAlpha * 0.5;
    let G_crust = (NdotL_crust / (NdotL_crust * (1.0 - k_crust) + k_crust)) * (NdotV_crust / (NdotV_crust * (1.0 - k_crust) + k_crust));
    let F_crust = 0.18 + (1.0 - 0.18) * pow(1.0 - max(0.0, dot(V_view, H_view)), 5.0);
    let specCrust = (D_crust * G_crust * F_crust) / max(4.0 * NdotL_crust * NdotV_crust, 1e-4);
    let crustSpecular = specCrust * NdotL_crust * terrainShadow * shadowFactor * 1.20;

    // Slope-Dependent Rock Cliff Exposure (theta > 35 degrees)
    let cosSlope = clamp(dot(perturbedN, n0), 0.0, 1.0);
    let rockWeight = (1.0 - smoothstep(0.66913, 0.81915, cosSlope)) * 0.75;

    // Procedural Rock Strata and Joints Hachuring with isotropic metric latitude scaling
    let cosLat = max(0.1, cos((input.uv.y - 0.5) * PI));
    let metricUv = vec2<f32>(input.uv.x * cosLat, input.uv.y) * 800.0;
    let gradDir = normalize(vec2<f32>(effDHx, effDHy) + vec2<f32>(1e-6, 1e-6));
    let strikeDir = vec2<f32>(-gradDir.y, gradDir.x);
    let uFall   = dot(metricUv, gradDir);
    let uStrike = dot(metricUv, strikeDir);
    let strata1 = sin(uStrike * 0.85);
    let strata2 = sin(uStrike * 2.10 + 0.8);
    let strataTotal = strata1 * 0.6 + strata2 * 0.4;
    let joint1 = sin(uFall * 1.40 + strataTotal * 1.2);
    let hachurePattern = clamp(0.90 + 0.10 * (joint1 * 0.65 + strataTotal * 0.35), 0.0, 1.0);

    var cRockDark: vec3<f32>;
    var cRockLit: vec3<f32>;
    var cSkyAmbient: vec3<f32>;
    var cLowland: vec3<f32>;
    var cPlateau: vec3<f32>;
    var cFlank: vec3<f32>;
    var cMontane: vec3<f32>;
    var cSummit: vec3<f32>;

    if (sim.u_theme == 2u) {
        // Prussian Cyanotype (Ferroprussiate Monochromatic Wash)
        cRockDark   = vec3<f32>(0.06, 0.12, 0.20);
        cRockLit    = vec3<f32>(0.32, 0.45, 0.58);
        cSkyAmbient = vec3<f32>(0.14, 0.22, 0.32);
        cLowland    = vec3<f32>(0.09, 0.16, 0.25); // Deep Prussian Ground #172940
        cPlateau    = vec3<f32>(0.18, 0.28, 0.42);
        cFlank      = vec3<f32>(0.34, 0.48, 0.64);
        cMontane    = vec3<f32>(0.52, 0.64, 0.76); // Washed Slate High Plateau
        cSummit     = vec3<f32>(0.92, 0.94, 0.96); // Chalk Ruling Pen #E8EDF2
    } else if (sim.u_theme == 1u) {
        // Cream Rag Paper (Eduard Imhof Swiss Alpine Relief)
        cRockDark   = vec3<f32>(0.36, 0.32, 0.28); // Warm alpine limestone shadow #5C5247
        cRockLit    = vec3<f32>(0.72, 0.67, 0.58); // Sunlit limestone crags #B8AB94
        cSkyAmbient = vec3<f32>(0.38, 0.40, 0.44);
        cLowland    = vec3<f32>(0.81, 0.71, 0.53); // Dune Ochre #CFB588
        cPlateau    = vec3<f32>(0.74, 0.63, 0.48); // Warm Steppe Ochre #BDA17A
        cFlank      = vec3<f32>(0.58, 0.44, 0.35); // Soft Umber Foothill #947059
        cMontane    = vec3<f32>(0.66, 0.56, 0.43); // Montane Steppe / Tibetan Plateau #A88E6E
        cSummit     = vec3<f32>(0.98, 0.97, 0.95); // Glacial White #FDFCFA
    } else {
        // Marie Tharp Physiographic (Dark Abyssal Trench to Parchment Land)
        cRockDark   = vec3<f32>(0.05, 0.08, 0.12); // Deep oceanic basalt crevice
        cRockLit    = vec3<f32>(0.32, 0.36, 0.40); // Mineral basalt illuminated
        cSkyAmbient = vec3<f32>(0.14, 0.18, 0.24);
        cLowland    = vec3<f32>(0.80, 0.71, 0.57); // Parchment Land #CBB692
        cPlateau    = vec3<f32>(0.72, 0.64, 0.52);
        cFlank      = vec3<f32>(0.60, 0.52, 0.42);
        cMontane    = vec3<f32>(0.68, 0.60, 0.48); // Archival Parchment Steppe
        cSummit     = vec3<f32>(0.96, 0.93, 0.88); // Alpine Ridge #F4EDE1
    }

    let cRockShaded = mix(cRockDark, cRockLit, hachurePattern * diffuseTotal);

    // Natural Illumination Split: Warm Sun Direct + Cool Cerulean Sky Fill
    let cSunLight = select(vec3<f32>(1.08, 1.02, 0.94), vec3<f32>(0.96, 0.98, 1.02), sim.u_theme == 2u);
    let sunDirect = max(0.0, NdotL1) * shadowFactor;
    let skyIndirect = 0.40 + 0.60 * max(0.0, perturbedN.y * 0.5 + 0.5);

    // Eduard Imhof Swiss Hypsometric Tinting with Physical Elevation Metre Ramps
    // Calibrated continuous transitions: lowlands (0..400m), piedmont/foothills (400..1400m),
    // mountain flanks (1400..3200m), montane steppe / high plateau (3200..5200m),
    // glacial summits & alpine ridges (>5200m).
    let hMeters = clamp(landElev * 8848.0, 0.0, 8848.0);
    let t0 = smoothstep(150.0, 650.0, hMeters);
    let t1 = smoothstep(650.0, 1600.0, hMeters);
    let t2 = smoothstep(1600.0, 3200.0, hMeters);
    let t3 = smoothstep(5200.0, 6800.0, hMeters);
    let cRamp = mix(mix(mix(mix(cLowland, cPlateau, t0), cFlank, t1), cMontane, t2), cSummit, t3);

    // Aerial Perspective & Illumination Combine
    var landIllum: vec3<f32>;
    let lowlandWeight = 1.0 - smoothstep(30.0, 600.0, hMeters);
    let lowlandMicroShade = (kRidge - kValley) * 0.40 * lowlandWeight;

    if (sim.u_theme == 1u) {
        // Eduard Imhof Dual-Temperature Vector Illumination:
        // Warm golden ochre on NW 315° direct illuminated slopes vs cool violet-umber on SE 135° shadowed slopes
        let cWarmDirect = vec3<f32>(1.14, 1.06, 0.94);
        let cCoolShadow = vec3<f32>(0.35, 0.36, 0.45);
        let sunWeight = smoothstep(0.04, 0.68, NdotL1 * shadowFactor);
        let directComponent = cWarmDirect * (sunDirect * 0.90 + ridgeEnhance * 0.8 * shadowFactor);
        let shadowComponent = cCoolShadow * (skyIndirect * creviceAO);
        let lowlandLift = lowlandWeight * 0.12 * (1.0 + lowlandMicroShade);
        landIllum = mix(shadowComponent, directComponent, sunWeight) + cWarmDirect * lowlandLift;
    } else if (sim.u_theme == 2u) {
        // Prussian Cyanotype: Actinic Monochromatic Photochemical Illumination
        // STRICTLY MONOCHROMATIC — pure cool actinic blueprint lighting, zero warm/yellow sun component
        let cActinicDirect = vec3<f32>(0.96, 0.98, 1.02);
        let cActinicShadow = vec3<f32>(0.18, 0.32, 0.48);
        let sunWeight = clamp(NdotL1 * 1.4 * shadowFactor, 0.0, 1.0);
        let directComponent = cActinicDirect * (sunDirect * 0.85 + ridgeEnhance * 0.8 * shadowFactor);
        let shadowComponent = cActinicShadow * (skyIndirect * creviceAO);
        landIllum = mix(shadowComponent, directComponent, sunWeight);
    } else {
        let cWarmSun = vec3<f32>(1.04, 0.98, 0.88);
        let cCoolHaze = vec3<f32>(0.84, 0.90, 1.06);
        let skyHaze = mix(cCoolHaze, cWarmSun, clamp(NdotL1 * 1.5 * shadowFactor, 0.0, 1.0));
        landIllum = (cSunLight * (sunDirect * 0.85 + ridgeEnhance * shadowFactor) + cSkyAmbient * (skyIndirect * creviceAO)) * skyHaze;
    }
    landIllum = landIllum * (1.0 + lowlandMicroShade * 0.30);
    let tintedLand = cRamp * landIllum;
    let alpineElevWeight = smoothstep(500.0, 1800.0, hMeters);
    let effectiveRockWeight = rockWeight * select(1.0, alpineElevWeight, sim.u_theme == 1u);
    var finalLand = mix(tintedLand, cRockShaded, effectiveRockWeight);

    // ========================================================================
    // STAGE 2 PHYSICAL MEDIUM AS INK: CONTINENTAL CRUST SHADING
    // ========================================================================
    if (sim.u_theme == 0u) {
        // --- THEME 0: MARIE THARP / HEINRICH BERANN (Physiographic Pen-and-Ink & Gouache on Illustration Board) ---
        let landSlope = length(vec2<f32>(effDHx, effDHy));
        let cGouacheParchment = vec3<f32>(0.96, 0.93, 0.88); // Alpine Ridge #F4EDE1
        let cInkTharp = vec3<f32>(0.18, 0.14, 0.11); // Archival bone-sepia drafting ink #2E241C
        let cParchmentInk = vec3<f32>(0.80, 0.71, 0.57); // Warm parchment ink tone #CBB692

        // 1. Berann-style gouache brushwork built up in layers following terrain contours & slope gradients
        // Directional stroke texture aligned to terrain slope gradient (broad, painterly character)
        let brushCoord = vec2<f32>(uStrike * 0.45, uFall * 0.25);
        let brush1 = sin(brushCoord.x * 2.0 + sin(brushCoord.y * 1.4) * 1.5);
        let brush2 = cos(brushCoord.x * 3.8 + brushCoord.y * 0.85);
        let painterlyBrush = (brush1 * 0.60 + brush2 * 0.40) * 0.5 + 0.5;

        let strokeFlank = smoothstep(0.04, 0.42, landSlope);
        let cGouacheBody = mix(cParchmentInk * 0.75, cGouacheParchment, painterlyBrush);
        finalLand = mix(finalLand, cGouacheBody, painterlyBrush * strokeFlank * 0.28 * sim.u_mediumProperties.w);

        // Gouache highlights on illuminated ridge crests and slope faces
        let gouacheLift = smoothstep(0.38, 0.88, diffuseTotal) * (kRidge * 0.45 + clamp(landSlope * 2.6, 0.0, 0.45));
        finalLand = mix(finalLand, cGouacheParchment, gouacheLift * 0.32);

        // 2. Physiographic cross-hatching and slope-gradient pen-and-ink shading
        let inkTone = mix(cParchmentInk * 0.55, cInkTharp, smoothstep(0.08, 0.35, landSlope));

        let hatchSpacing1 = fract(uStrike * 1.85);
        let distHatch1 = min(hatchSpacing1, 1.0 - hatchSpacing1);
        let hatch1 = 1.0 - smoothstep(0.04, 0.12, distHatch1);

        let hatchSpacing2 = fract((uStrike * 0.707 + uFall * 0.707) * 1.85);
        let distHatch2 = min(hatchSpacing2, 1.0 - hatchSpacing2);
        let hatch2 = 1.0 - smoothstep(0.04, 0.12, distHatch2);

        let crossHatch = max(hatch1, hatch2 * smoothstep(0.25, 0.65, landSlope * 4.0));
        let shadowSlopeFactor = clamp((1.0 - NdotL1) * 0.75 + landSlope * 1.6, 0.0, 1.0);
        let riftChasm = smoothstep(0.06, 0.32, effLaplacian) * smoothstep(1200.0, 4500.0, hMeters);
        let physiographicHatch = crossHatch * shadowSlopeFactor * smoothstep(0.06, 0.40, landSlope) * (1.0 + riftChasm * 1.4);
        finalLand = mix(finalLand, inkTone, physiographicHatch * 0.35 * sim.u_mediumProperties.w);

        // 3. Physiographic stippling on lowland transitions and plateaus modulated by stippleDensity (1.0)
        let stippleFreq = 1600.0 * max(0.1, sim.u_mediumProperties.w);
        let stippleCoord = vec2<f32>(input.uv.x * cosLat, input.uv.y) * stippleFreq;
        let cellId = floor(stippleCoord);
        let cellFract = fract(stippleCoord);
        let dotCenter = vec2<f32>(
            hashPaper2D(cellId + vec2<f32>(3.0, 11.0)),
            hashPaper2D(cellId + vec2<f32>(17.0, 31.0))
        ) * 0.6 + vec2<f32>(0.2);
        let distToDot = length(cellFract - dotCenter);

        let dotProb = clamp(0.10 + landSlope * 3.6 + (1.0 - diffuseTotal) * 0.20, 0.04, 0.82);
        let cellRng = hashPaper2D(cellId * 2.83 + vec2<f32>(11.7, 23.4));
        let hasDot = cellRng < dotProb;
        let dotRadius = mix(0.10, 0.22, clamp(landSlope * 3.2, 0.0, 1.0));
        let dotMask = select(0.0, 1.0 - smoothstep(dotRadius - 0.04, dotRadius + 0.04, distToDot), hasDot) * fragPoleAtten;
        let stippleTone = mix(cParchmentInk * 0.40, cInkTharp, smoothstep(0.05, 0.25, landSlope));
        finalLand = mix(finalLand, stippleTone, dotMask * 0.40 * sim.u_mediumProperties.w);

        // 4. Illustration board substrate: smoother, less fibrous than cotton rag, with lower frequency broader grain
        let boardFreq = 750.0 * max(0.1, sim.u_mediumProperties.y);
        let boardCoord = vec2<f32>(input.uv.x * cosLat, input.uv.y) * boardFreq;
        let boardFleck1 = hashPaper2D(boardCoord);
        let boardFleck2 = hashPaper2D(boardCoord * 0.45 + vec2<f32>(19.3, 57.1));
        let boardTooth = (boardFleck1 * 0.65 + boardFleck2 * 0.35 - 0.50) * (sim.u_roughness * 0.40);
        finalLand = clamp(finalLand * (1.0 + boardTooth), vec3<f32>(0.0), vec3<f32>(1.0));

        // Subtractive ink absorption into warm parchment illustration board
        let kTharpInk = vec3<f32>(1.55, 1.70, 2.00); // Warm sepia-umber absorption
        let surfaceLumaTharp = dot(finalLand, vec3<f32>(0.299, 0.587, 0.114));
        let inkDensityTharp = clamp(1.0 - surfaceLumaTharp, 0.0, 1.0);
        let cBoardBase = vec3<f32>(0.80, 0.71, 0.57); // Warm parchment #CBB692
        let boardAbsorbed = cBoardBase * exp(-kTharpInk * (inkDensityTharp * 0.85));
        finalLand = mix(finalLand, boardAbsorbed, clamp(sim.u_mediumProperties.x * 0.35, 0.0, 0.50));
    } else if (sim.u_theme == 1u) {
        // --- THEME 1: CREAM RAG (Copperplate Intaglio on Cotton Rag) ---
        // 1. Dual-scale anisotropic cellulose fibers modulated by fiberDensity & u_roughness
        let fiberFreq = 1800.0 * max(0.1, sim.u_mediumProperties.y);
        let fiberCoord = input.uv * fiberFreq;
        let fiberFleck = hashPaper2D(fiberCoord);
        let fiberStrand = hashPaper2D(vec2<f32>(fiberCoord.x * 0.45 + 37.0, fiberCoord.y * 1.95 + 83.0));
        let fiberTooth = (fiberFleck * 0.60 + fiberStrand * 0.40 - 0.50) * (sim.u_roughness * 0.85);

        // Grazing raking light amplifies micro-shadows behind individual fibers
        let grazingFactor = pow(max(0.0, NdotL1), 0.65);
        let toothGlaze = 1.0 + fiberTooth * grazingFactor;
        finalLand = clamp(finalLand * toothGlaze, vec3<f32>(0.0), vec3<f32>(1.0));

        // 2. Johann Georg Lehmann (1799) slope-angle hachuring (steep alpine faces theta > 20°)
        let slopeAngle = acos(cosSlope);
        let rad20 = 0.349066; // 20° in radians
        let rad45 = 0.785398; // 45° in radians
        if (slopeAngle > rad20) {
            let slopeIntensity = clamp((slopeAngle - rad20) / (rad45 - rad20), 0.0, 1.0);
            let hatchSpacing = fract(uStrike * 1.35);
            let distToHatch = min(hatchSpacing, 1.0 - hatchSpacing);
            // Stroke width increases with slope angle (Lehmann's principle: steeper = denser/thicker)
            let strokeHalfW = mix(0.04, 0.32, slopeIntensity);
            let hatchCoverage = 1.0 - smoothstep(strokeHalfW - 0.03, strokeHalfW + 0.03, distToHatch);
            // Intermittent engraved cuts along the fall line
            let strokeCut = step(0.20, fract(uFall * 0.42));
            let lehmannAlpine = smoothstep(400.0, 1400.0, hMeters);
            let lehmannStroke = hatchCoverage * strokeCut * slopeIntensity * lehmannAlpine;
            let cCopperplateSepia = vec3<f32>(0.22, 0.19, 0.16); // Archival sepia-charcoal ink #38302A
            finalLand = mix(finalLand, cCopperplateSepia, lehmannStroke * 0.75);
        }

        // 3. Subtractive Kubelka-Munk intaglio ink absorption with capillary micro-bleed into fibers
        let capillaryBleed = fiberTooth * (sim.u_mediumProperties.x * 0.35);
        let kSepia = vec3<f32>(1.45, 1.72, 2.15); // Sepia spectral absorption
        let shadowDepth = clamp(1.0 - diffuseTotal, 0.0, 1.0);
        let slopeGrip = smoothstep(0.04, 0.25, length(vec2<f32>(effDHx, effDHy)));
        let inkDensity = clamp(shadowDepth * slopeGrip * 0.45, 0.0, 0.60);
        let cPaperBase = vec3<f32>(0.953, 0.925, 0.878); // Arches 300gsm Cream Rag #F3ECE0
        let intaglioAbsorbed = cPaperBase * exp(-kSepia * (inkDensity * (1.0 + capillaryBleed)));
        let inkBlend = clamp(inkDensity * 1.5 * sim.u_mediumProperties.x, 0.0, 0.70);
        finalLand = mix(finalLand, intaglioAbsorbed, inkBlend);

        // Calibrated copperplate intaglio plate indentation:
        // Roller press compression embeds ink into damp 300 GSM cotton rag, embossing fine debossed bevels
        let plateIndentation = smoothstep(0.06, 0.35, length(vec2<f32>(effDHx, effDHy))) * (0.22 * sim.u_mediumProperties.x);
        finalLand = finalLand * (1.0 - plateIndentation * (1.0 - NdotL1 * 0.65));
    } else if (sim.u_theme == 2u) {
        // --- THEME 2: PRUSSIAN CYANOTYPE (1842 John Herschel Photochemical Model) ---
        // Actinic exposure model: elevation inversion with sensitometric curve E = (1.0 - elevNorm)^exposureGamma
        let normLandElev = clamp(landElev, 0.0, 1.0);
        let landExposure = pow(clamp(1.0 - normLandElev, 0.0, 1.0), max(0.1, sim.u_mediumProperties.z));
        let cChalkRulingPen = vec3<f32>(0.91, 0.93, 0.96); // Unexposed summit resist #E8EDF2
        let cWashedCerulean = vec3<f32>(0.09, 0.16, 0.25); // Lowland blueprint wash #172940
        let developedCyanotype = mix(cChalkRulingPen, cWashedCerulean, smoothstep(0.04, 0.80, landExposure));

        // Precision technical blueprint relief: modulate sensitized emulsion with actinic directional illumination
        let cyanShaded = developedCyanotype * landIllum;

        // Summits, sharp ridges, and crests wash out to crisp ruling-pen chalk linework (#E8EDF2)
        let unexposedResist = smoothstep(0.65, 0.98, normLandElev) + kRidge * 0.50;
        finalLand = mix(cyanShaded, cChalkRulingPen, clamp(unexposedResist, 0.0, 0.95));

        // 1. Prussian Blue Crystal Precipitation Noise (colloidal ferroprussiate micro-crystals)
        // High-frequency crystalline granularity in deep exposure regions — NOT smooth gradients
        let crystalFreq = 2600.0 * max(0.1, sim.u_mediumProperties.y);
        let crystalCoord = vec2<f32>(input.uv.x * cosLat, input.uv.y) * crystalFreq;
        let crystal1 = hashPaper2D(crystalCoord);
        let crystal2 = hashPaper2D(crystalCoord * 1.618 + vec2<f32>(13.7, 47.3));
        let crystalGranularity = (crystal1 * crystal2 - 0.22) * 2.2;
        let crystalStrength = smoothstep(0.25, 0.85, landExposure) * (0.32 * sim.u_roughness);
        let cPrussianCrystal = vec3<f32>(0.06, 0.11, 0.18); // Deep Prussian blue crystal precipitate #0F1C2E
        finalLand = mix(finalLand, cPrussianCrystal, clamp(crystalGranularity * crystalStrength, 0.0, 0.40));

        // 2. Subtle Wash Edge Effect (ferroprussiate developer solution pooling at rinse boundaries)
        // Mid-elevation transition boundary darkening along exposure gradient
        let washEdgeBand = 1.0 - abs(landExposure - 0.48) * 3.6;
        let washEdge = pow(clamp(washEdgeBand, 0.0, 1.0), 2.2);
        let slopeFactor = smoothstep(0.04, 0.28, length(vec2<f32>(effDHx, effDHy)));
        let cWashEdgeIndigo = vec3<f32>(0.08, 0.15, 0.25); // Rinse solution boundary concentration
        finalLand = mix(finalLand, cWashEdgeIndigo, washEdge * slopeFactor * 0.30);

        // 3. Structured Drafting Linen Tooth (interlocking orthogonal warp/weft weave grid)
        // Rough linen cloth weave texture with distinct regular structural grid (strictly monochromatic)
        let linenFreq = 1400.0 * max(0.1, sim.u_mediumProperties.y);
        let linenCoord = vec2<f32>(input.uv.x * cosLat, input.uv.y) * linenFreq;
        let warp = cos(linenCoord.x * 3.14159265);
        let weft = cos(linenCoord.y * 3.14159265);
        let cellCoord = floor(linenCoord);
        let isWarpOver = select(-1.0, 1.0, fract((cellCoord.x + cellCoord.y) * 0.5) < 0.25 || fract((cellCoord.x + cellCoord.y) * 0.5) > 0.75);
        let weaveGrid = (warp - weft) * isWarpOver * 0.35 + (warp * weft) * 0.15;
        let linenSlub = (hashPaper2D(linenCoord * 0.5) - 0.5) * 0.40;
        let linenTooth = (weaveGrid + linenSlub) * (sim.u_roughness * 0.65);
        finalLand = clamp(finalLand * (1.0 + linenTooth), vec3<f32>(0.0), vec3<f32>(1.0));

        // Calibrated ferric blueprint slope contrast:
        // Actinic photochemical exposure model with enhanced slope gradient dynamics
        let ferricSlope = length(vec2<f32>(effDHx, effDHy));
        let ferricContrast = pow(clamp(ferricSlope * 3.8, 0.0, 1.0), 1.25);
        let ferricModulation = mix(0.92, 1.18, ferricContrast * (NdotL1 - 0.45));
        finalLand = clamp(finalLand * ferricModulation, vec3<f32>(0.0), vec3<f32>(1.0));
    }

    // Continental crust Cook-Torrance microfacet specular highlight with Toksvig AA
    let cSpecMedium = select(select(vec3<f32>(0.92, 0.94, 0.96), vec3<f32>(0.95, 0.92, 0.85), sim.u_theme == 1u), vec3<f32>(0.85, 0.92, 1.00), sim.u_theme == 2u);
    finalLand = finalLand + crustSpecular * cSpecMedium;

    // ------------------------------------------------------------------------
    // STAGE 1 In-Shader Geomorphic Hydrology Drainage (Frontiers 3 & 4)
    // Conforms self-tapering waterways directly into DEM valley troughs.
    // Invariant #7 Line Ratio: Major river widths strictly proportioned below
    // coastline widths (55-60% ratio: 1.98px vs 3.40px maximum, tapering
    // down to 0.40px hairline headwaters in alpine terrain).
    // ------------------------------------------------------------------------
    let shoreWaterwayGate = smoothstep(0.40, 0.60, isLand);
    if (shoreWaterwayGate > 0.001) {
        // 1. Upstream Drainage Catchment Area A & Leopold-Maddock Downstream Hydraulic Geometry
        // Purging Laplacian heuristic (kValley) and elevation proxy (1 - normElev)^1.6
        // Ingest 15 arc-sec MERIT Hydro upstream drainage area (UPA in km²) packed into log-scaled 16-bit texture
        let normArea = textureSampleLevel(u_hydroTexture, u_demSampler, input.uv, 0.0).r;
        let A_max = 7000000.0;
        let A = exp(normArea * log(A_max + 1.0)) - 1.0; // km²
        let V_packed = normArea;
        let catchmentArea = A;
        let descentAccum = clamp(pow(A / A_max, 0.35), 0.0, 1.0);

        // Leopold-Maddock downstream hydraulic geometry scaling:
        let channelWidth = 2.1 * pow(max(0.0, A - 15.0), 0.45);
        let channelDepth = 0.28 * pow(max(0.0, A - 15.0), 0.32);
        let w_A = channelWidth;
        let d_A = channelDepth;

        // 2. Discrete Second-Derivative Valley Sub-Texel Centering
        let d2x = hR + hL - 2.0 * hC;
        let d2y = hD + hU - 2.0 * hC;
        let gx  = (hR - hL) * 0.5;
        let gy  = (hD - hU) * 0.5;

        let deltaX = select(0.0, -clamp(gx / max(d2x, 1e-4), -0.75, 0.75), d2x > 1e-4);
        let deltaY = select(0.0, -clamp(gy / max(d2y, 1e-4), -0.75, 0.75), d2y > 1e-4);

        // Sub-texel offset from cell center [-0.5, +0.5]
        let uvGrid = input.uv / ts;
        let fCell  = fract(uvGrid) - vec2<f32>(0.5);

        // Metric coordinate offset on globe manifold (accounting for spherical latitude convergence)
        var metricDistVec = (fCell - vec2<f32>(deltaX, deltaY)) * ts;
        metricDistVec.x = metricDistVec.x * cosLat;

        let distUv = length(metricDistVec);
        let pixelUv = length(dUV);
        let distPx = distUv / max(pixelUv, 1e-6);

        // Metric distance across planetary manifold (Earth equatorial circumference ~ 40,075,017m)
        let r_dist = distUv * 40075017.0;
        let distToAxis = r_dist;

        // Incise fluvial channel into crust geometry and shade water albedo along channel corridor:
        let channelIncise = -channelDepth * exp(-pow(2.0 * distToAxis / max(channelWidth, 15.0), 2.0));
        let delta_z = channelIncise;

        // 3. Self-Tapering Waterway Line Width (Invariant #7: 55-60% of coastline width 3.40px)
        // High alpine headwaters: 0.40px ultra-fine hairline
        // Lowland valley confluences: 1.98px (58.2% of 3.40px)
        var riverWidthPx = mix(0.40, 1.98, descentAccum);
        let pluvialFactor = 1.0 + sim.u_pluvial_gamma * sqrt(clamp(precipRate, 0.0, 50.0));
        riverWidthPx = riverWidthPx * pluvialFactor;
        let riverHalfWidth = riverWidthPx * 0.5;
        let riverFeather = 0.45;

        // Sub-pixel screen-space box feathering for resolution-invariant linework
        let channelCoverage = 1.0 - smoothstep(riverHalfWidth - riverFeather, riverHalfWidth + riverFeather, distPx);

        // 4. Leopold-Maddock Fluvial Presence Gate
        // Active on flat terrain if catchmentArea > 15.0 (Amazon Basin w(A) >= 1800m, active <20m elevation)
        // Inactive on dry alpine ridges (catchmentArea <= 15.0 -> w(A) = 0, riverPresence = 0)
        let riverPresence = select(0.0, smoothstep(15.0, 45.0, A), A > 15.0);
        let valleyGate = riverPresence;

        // Cliff attenuation: in sheer vertical rock cliffs (>35°), water forms narrow chutes
        let cliffDampen = 1.0 - rockWeight * 0.35;

        let waterwayGlaze = channelCoverage * valleyGate * cliffDampen * shoreWaterwayGate;

        // Physical Gaussian bed incision shading: darkens channel depression according to channelIncise
        let bedIncisionShade = clamp(1.0 + channelIncise * 0.0035 * valleyGate * shoreWaterwayGate, 0.72, 1.0);
        finalLand = finalLand * bedIncisionShade;

        // Archival Medium: High-contrast intaglio plate indentation along Leopold-Maddock river trunks (Cream Rag)
        if (sim.u_theme == 1u) {
            let riverIntaglioDeboss = channelCoverage * valleyGate * (0.35 * sim.u_mediumProperties.x);
            finalLand = finalLand * (1.0 - riverIntaglioDeboss * (1.0 - NdotL1 * 0.45));
        }

        if (waterwayGlaze > 0.001) {
            var cWaterway: vec3<f32>;
            var glazeAlpha: f32;

            if (sim.u_theme == 1u) {
                // Theme 1 (Cream Rag Paper): Archival Mineral Glazes / Washed Celadon-Lapis
                // Alpine headwaters: washed mineral celadon (#77998B / vec3(0.32, 0.48, 0.46))
                // Lowland confluences: deep archival lapis glaze (#263B52 / vec3(0.18, 0.32, 0.46))
                let cAlpineCeladon = vec3<f32>(0.32, 0.48, 0.46);
                let cLowlandLapis   = vec3<f32>(0.18, 0.32, 0.46);
                cWaterway = mix(cAlpineCeladon, cLowlandLapis, descentAccum);
                glazeAlpha = waterwayGlaze * mix(0.38, 0.52, descentAccum);
            } else if (sim.u_theme == 2u) {
                // Theme 2 (Prussian Cyanotype): Washed Architectural Cerulean / Blueprint Drafting Ink
                // Headwaters: delicate blueprint chalk cerulean (#7AA2C8)
                // Confluences: rich ferroprussiate cerulean (#4F79A3 / vec3(0.32, 0.58, 0.80))
                let cChalkCerulean = vec3<f32>(0.52, 0.76, 0.92);
                let cDraftCerulean = vec3<f32>(0.32, 0.58, 0.80);
                cWaterway = mix(cChalkCerulean, cDraftCerulean, descentAccum);
                glazeAlpha = waterwayGlaze * mix(0.48, 0.65, descentAccum);
            } else {
                // Theme 0 (Marie Tharp): Deep Marine Turquoise Drafting Glaze
                let cAlpineCyan = vec3<f32>(0.32, 0.64, 0.72);
                let cEstuaryCyan = vec3<f32>(0.18, 0.46, 0.56);
                cWaterway = mix(cAlpineCyan, cEstuaryCyan, descentAccum);
                glazeAlpha = waterwayGlaze * mix(0.42, 0.58, descentAccum);
            }

            finalLand = mix(finalLand, cWaterway, clamp(glazeAlpha, 0.0, 0.85));
        }
    }

    var finalCrust: vec3<f32>;
    let isDark = sim.u_theme != 1u;

    if (sim.u_renderStyle == 0u) {
        // ====================================================================
        // OPTION A: ARCHITECTURAL TOPOGRAPHIC & BATHYMETRIC RELIEF
        // The entire planetary crust is an exposed solid physical relief sculpture.
        // No dark void! Ocean basins are rendered as architectural bathymetry
        // with mid-ocean ridges, seamounts, and trenches in sculpted mineral slate.
        // ====================================================================

            let normDepth = clamp(oceanDepth, 0.0, 1.0);
            let bathyDepthM = normDepth * 10924.0;
            var cBathyShelf: vec3<f32>;
            var cBathySlope: vec3<f32>;
            var cBathyAbyss: vec3<f32>;
            var cBathyTrench: vec3<f32>;
            var cBathyRidge: vec3<f32>;

            if (sim.u_theme == 2u) {
                // Prussian Cyanotype: Architectural drafting wash in cerulean & ferroprussiate indigo
                cBathyShelf  = vec3<f32>(0.20, 0.36, 0.52); // Drafting cobalt #294D75
                cBathySlope  = vec3<f32>(0.11, 0.22, 0.35); // Pelagic slope cerulean-indigo
                cBathyAbyss  = vec3<f32>(0.06, 0.13, 0.22); // Prussian indigo #162B42
                cBathyTrench = vec3<f32>(0.02, 0.05, 0.09); // Deep exposed prussiate #0E1824
                cBathyRidge  = vec3<f32>(0.91, 0.93, 0.96); // Chalk ruling pen crest #E8EDF2
            } else if (sim.u_theme == 1u) {
                // Cream Cotton Rag: Eduard Imhof tiered watercolor shelves (inner celadon, outer shelf break, pelagic slope, marine indigo, hadal trench)
                let cShorelineWash = vec3<f32>(0.68, 0.76, 0.72); // Delicate coastal estuarine wash
                let cInnerBase = vec3<f32>(0.56, 0.68, 0.62); // Luminous shelf celadon #77998B
                let cInnerShelf = mix(cShorelineWash, cInnerBase, smoothstep(0.0002, 0.004, normDepth));
                let cOuterShelf = vec3<f32>(0.42, 0.55, 0.56); // Mineral celadon-lapis wash
                let shelfTier = smoothstep(0.004, 0.018, normDepth);
                cBathyShelf  = mix(cInnerShelf, cOuterShelf, shelfTier);
                cBathySlope  = vec3<f32>(0.32, 0.44, 0.52); // Continental slope mineral lapis wash
                cBathyAbyss  = vec3<f32>(0.22, 0.32, 0.44); // Soft marine indigo #263B52
                cBathyTrench = vec3<f32>(0.12, 0.17, 0.24); // Trench umber-indigo
                cBathyRidge  = vec3<f32>(0.88, 0.84, 0.78); // Warm bleached parchment
            } else {
                // Marie Tharp: High-contrast turquoise continental shelf, pelagic slope & abyssal basalt
                cBathyShelf  = vec3<f32>(0.12, 0.48, 0.55); // Coastal turquoise #23778A
                cBathySlope  = vec3<f32>(0.08, 0.22, 0.28); // Oceanic teal-navy continental slope
                cBathyAbyss  = vec3<f32>(0.035, 0.065, 0.105); // Abyssal plain basalt #0F171F
                cBathyTrench = vec3<f32>(0.010, 0.018, 0.038); // Deep hadal trench abyss
                cBathyRidge  = vec3<f32>(0.54, 0.50, 0.42); // Mid-Atlantic rift ridge parchment
            }

            let b0 = smoothstep(0.004, 0.022, normDepth);  // Shelf (0-200m) to Slope (200-2500m)
            let b1 = smoothstep(0.022, 0.228, normDepth);  // Slope to Abyssal Plain (2500-5500m)
            let b2 = smoothstep(0.228, 0.503, normDepth);  // Abyss to Hadal Trench (>5500m)

            var cBathy = mix(
                mix(cBathyShelf, cBathySlope, b0),
                mix(cBathyAbyss, cBathyTrench, b2),
                b1
            );

            if (sim.u_theme == 2u) {
                // Ferric blueprint tonal ramp: deep blue water absorption in restored ocean subduction trenches
                let deepExposure = pow(clamp(normDepth, 0.0, 1.0), max(0.1, sim.u_mediumProperties.z));
                let cSubductionTrench = vec3<f32>(0.015, 0.04, 0.08); // Deep photochemical Turnbull's indigo
                cBathy = mix(cBathy, cSubductionTrench, smoothstep(0.28, 0.92, deepExposure) * 0.75);

                // Ocean trench Prussian crystal precipitation noise (colloidal insoluble ferroprussiate micro-crystals)
                let bCrystalCoord = vec2<f32>(input.uv.x * cosLat, input.uv.y) * (2600.0 * max(0.1, sim.u_mediumProperties.y));
                let bCrystal = (hashPaper2D(bCrystalCoord) * hashPaper2D(bCrystalCoord * 1.618 + vec2<f32>(7.1, 31.9)) - 0.22) * 2.0;
                let bCrystalWeight = smoothstep(0.35, 0.95, deepExposure) * (0.28 * sim.u_roughness);
                cBathy = mix(cBathy, vec3<f32>(0.03, 0.06, 0.10), clamp(bCrystal * bCrystalWeight, 0.0, 0.35));
            }

            // Mid-ocean ridge depth gate: highlights mid-ocean rift systems (1,400m - 4,000m)
            // without speckling abyssal plains (>4,800m) or shallow coastal shelves (<1,200m)
            let ridgeDepthGate = smoothstep(1200.0, 2000.0, bathyDepthM) * (1.0 - smoothstep(3800.0, 4800.0, bathyDepthM));

            // Mid-ocean ridge crest highlight gated by authentic ridge depth
            cBathy = mix(cBathy, cBathyRidge, kRidge * 0.45 * ridgeDepthGate);

            // Trench crevice ink absorption: deep hadal chasms (>5,500m) absorb dark archival ink in concave troughs (kValley)
            let trenchChasmWeight = clamp(kValley * 1.5 * smoothstep(4500.0, 6500.0, bathyDepthM), 0.0, 1.0);
            let cTrenchInk = cBathyTrench * 0.65;
            cBathy = mix(cBathy, cTrenchInk, trenchChasmWeight * 0.85);

            let safeCosLat = max(0.08, cosLat);

            // Marie Tharp (Theme 0): Bruce Heezen & Marie Tharp Physiographic Pen-and-Ink Stippling
            // Modulated by bathymetric slope gradient and u_mediumProperties.w (stippleDensity)
            if (sim.u_theme == 0u) {
                let bathySlope = length(vec2<f32>(effDHx, effDHy));
                let stippleFreq = 1400.0 * max(0.1, sim.u_mediumProperties.w);
                let stippleCoord = vec2<f32>(input.uv.x * safeCosLat, input.uv.y) * stippleFreq;
                let cellId = floor(stippleCoord);
                let cellFract = fract(stippleCoord);

                // Authentic Tharp abyssal plain stippling: sediment dot pattern on abyssal plains and slopes
                let abyssalPlainFactor = smoothstep(0.10, 0.35, normDepth);
                let slopeFactor = smoothstep(0.02, 0.30, bathySlope);
                let dotProb = (abyssalPlainFactor * 0.25 + slopeFactor * 0.55) * (sim.u_mediumProperties.w * 0.85);
                let cellRng = hashPaper2D(cellId * 3.17 + vec2<f32>(43.1, 89.3));
                let hasDot = cellRng < dotProb;

                let jitter = (vec2<f32>(
                    hashPaper2D(cellId * 1.73 + vec2<f32>(13.3, 71.9)),
                    hashPaper2D(cellId * 2.41 + vec2<f32>(97.1, 31.7))
                ) - 0.50) * 0.65;
                let dotCenter = vec2<f32>(0.5, 0.5) + jitter;
                let distToDot = length(cellFract - dotCenter);

                // Dot radius slightly larger on steeper slopes
                let dotRadius = mix(0.11, 0.24, clamp(bathySlope * 3.2, 0.0, 1.0));
                let dotMask = select(0.0, 1.0 - smoothstep(dotRadius - 0.04, dotRadius + 0.04, distToDot), hasDot) * fragPoleAtten;

                let cStippleInk = vec3<f32>(0.03, 0.05, 0.07);
                cBathy = mix(cBathy, cStippleInk, dotMask * 0.70);

                // Mid-ocean ridge crests: concentrated transform fault hatching (decoupled from kValley)
                let uRidgeStrike = dot(vec2<f32>(input.uv.x * safeCosLat, input.uv.y) * 950.0, strikeDir);
                let ridgeHatchWave = smoothstep(0.38, 0.94, sin(uRidgeStrike * 1.65));
                let ridgeHatchStrength = ridgeHatchWave * (kRidge * 1.6);
                let ridgeHatch = clamp(ridgeHatchStrength * ridgeDepthGate, 0.0, 1.0);
                cBathy = mix(cBathy, cBathyRidge, ridgeHatch * 0.60);

                // Mid-Atlantic Ridge & oceanic axial rift valleys: prominent physiographic chasm incision scaled to real topographic gradient
                let bathyGrad = length(vec2<f32>(effDHx, effDHy));
                let oceanRiftChasm = smoothstep(0.04, 0.28, bathyGrad) * ridgeDepthGate;
                cBathy = mix(cBathy, cTrenchInk, oceanRiftChasm * 0.70 * sim.u_mediumProperties.w);
            } else if (sim.u_theme == 1u) {
                // Cream Rag: Subtractive paper tooth and ink absorption into cotton rag ground
                let fiberFreq = 1800.0 * max(0.1, sim.u_mediumProperties.y);
                let bFiberTooth = (hashPaper2D(input.uv * fiberFreq) - 0.5) * (sim.u_roughness * 0.40);
                cBathy = clamp(cBathy * (1.0 + bFiberTooth), vec3<f32>(0.0), vec3<f32>(1.0));
            } else if (sim.u_theme == 2u) {
                // Prussian Cyanotype: Structured blueprint linen weave tooth on bathymetric ground
                let linenFreq = 1400.0 * max(0.1, sim.u_mediumProperties.y);
                let linenCoord = vec2<f32>(input.uv.x * safeCosLat, input.uv.y) * linenFreq;
                let warp = cos(linenCoord.x * 3.14159265);
                let weft = cos(linenCoord.y * 3.14159265);
                let cellCoord = floor(linenCoord);
                let isWarpOver = select(-1.0, 1.0, fract((cellCoord.x + cellCoord.y) * 0.5) < 0.25 || fract((cellCoord.x + cellCoord.y) * 0.5) > 0.75);
                let weaveGrid = (warp - weft) * isWarpOver * 0.30 + (warp * weft) * 0.12;
                let bLinenTooth = (weaveGrid + (hashPaper2D(linenCoord * 0.5) - 0.5) * 0.35) * (sim.u_roughness * 0.50);
                cBathy = clamp(cBathy * (1.0 + bLinenTooth), vec3<f32>(0.0), vec3<f32>(1.0));

                // 1842 Technical Blueprint Bathymetric Stippling on continental slope and shelf break
                if (sim.u_mediumProperties.w > 0.1) {
                    let bathySlope = length(vec2<f32>(effDHx, effDHy));
                    let stippleFreq = 1800.0 * sim.u_mediumProperties.w;
                    let stippleCoord = vec2<f32>(input.uv.x * safeCosLat, input.uv.y) * stippleFreq;
                    let cellId = floor(stippleCoord);
                    let cellFract = fract(stippleCoord);
                    let dotProb = smoothstep(0.015, 0.30, bathySlope) * (sim.u_mediumProperties.w * 0.70);
                    let cellRng = hashPaper2D(cellId * 2.71 + vec2<f32>(19.4, 53.2));
                    let hasDot = cellRng < dotProb;
                    let distToDot = length(cellFract - vec2<f32>(0.5));
                    let dotMask = select(0.0, 1.0 - smoothstep(0.10, 0.22, distToDot), hasDot) * fragPoleAtten;
                    let cChalkDot = vec3<f32>(0.91, 0.93, 0.96); // Chalk ruling pen sounding dot
                    cBathy = mix(cBathy, cChalkDot, dotMask * 0.65);
                }
            }

            var bathyIllum: vec3<f32>;
            if (sim.u_theme == 2u) {
                // Prussian Cyanotype: Actinic bathymetric illumination with zero warm sunlight
                let cActinicDirect = vec3<f32>(0.92, 0.96, 1.00);
                let cActinicShadow = vec3<f32>(0.18, 0.28, 0.42);
                bathyIllum = cActinicDirect * (sunDirect * 0.80 + ridgeEnhance * 0.8 * shadowFactor) + cActinicShadow * (skyIndirect * creviceAO);
            } else if (sim.u_theme == 1u) {
                // Cream Cotton Rag: Eduard Imhof warm sunlit relief with cool violet-umber shadow
                let cWarmDirect = vec3<f32>(1.10, 1.02, 0.90);
                let cCoolShadow = vec3<f32>(0.36, 0.32, 0.42);
                let sunWeight = clamp(sunDirect * 1.4, 0.0, 1.0);
                let directComp = cWarmDirect * (sunDirect * 0.85 + ridgeEnhance * 0.8 * shadowFactor);
                let shadowComp = cCoolShadow * (skyIndirect * creviceAO);
                bathyIllum = mix(shadowComp, directComp, sunWeight);
            } else {
                bathyIllum = cSunLight * (sunDirect * 0.80 + ridgeEnhance * 0.8 * shadowFactor) + cSkyAmbient * (skyIndirect * creviceAO);
            }
        let shelfDepthMeters = normDepth * 10924.0;
        let bathyRockGate = smoothstep(200.0, 1000.0, shelfDepthMeters);
        let cBathyComposite = mix(cBathy * bathyIllum, cRockShaded, rockWeight * 0.4 * bathyRockGate);

        let shoreCoverage = smoothstep(0.35, 0.65, isLand);
        finalCrust = mix(cBathyComposite, finalLand, shoreCoverage);
    } else if (sim.u_renderStyle == 2u) {
        // ====================================================================
        // OPTION C: NASA BLUE MARBLE ORBITAL PHOTOREALISM & CELESTIAL TERMINATOR
        // True-color orbital photography with dynamic celestial day/night blending,
        // nocturnal anthropogenic city lights, and golden Rayleigh twilight rim.
        // ====================================================================
        let dayColor = textureSampleLevel(u_orbitalTextures, u_orbitalSampler, input.uv, 0, 0.0).rgb;
        let nightColor = textureSampleLevel(u_orbitalTextures, u_orbitalSampler, input.uv, 1, 0.0).rgb;

        let sunDirWorld = computeSunLightDir(sim.u_sunAzimuth, sim.u_sunAltitude);
        let cosSun = dot(normalize(input.worldPos), sunDirWorld);

        let dayWeight = smoothstep(-0.08, 0.08, cosSun);
        let nightWeight = 1.0 - dayWeight;

        let directIllum = 0.10 + 0.90 * max(0.0, cosSun) * shadowFactor;
        let dayLit = dayColor * directIllum;
        let nightLit = nightColor * (nightWeight * 1.25);

        let twilightBand = pow(1.0 - abs(cosSun) / 0.08, 2.0) * select(0.0, 1.0, abs(cosSun) < 0.08);
        let twilightColor = vec3<f32>(1.0, 0.60, 0.28) * (twilightBand * 0.12);

        finalCrust = dayLit * dayWeight + nightLit + twilightColor;
    } else {
        // ====================================================================
        // OPTION B: HYDROSPHERE & BATHYMETRIC DEPTH
        // Ocean floor is submerged beneath translucent liquid water.
        // Deep seabed colors showing through the water column.
        // ====================================================================
        let normDepth = clamp(oceanDepth, 0.0, 1.0);
        var cOceanShelf: vec3<f32>;
        var cOceanSlope: vec3<f32>;
        var cOceanDeep: vec3<f32>;
        var cOceanTrench: vec3<f32>;

        if (sim.u_theme == 2u) {
            cOceanShelf  = vec3<f32>(0.20, 0.36, 0.54);
            cOceanSlope  = vec3<f32>(0.13, 0.24, 0.38);
            cOceanDeep   = vec3<f32>(0.07, 0.15, 0.25);
            cOceanTrench = vec3<f32>(0.03, 0.07, 0.12);
        } else if (sim.u_theme == 1u) {
            let cInnerShelf = vec3<f32>(0.58, 0.70, 0.64);
            let cOuterShelf = vec3<f32>(0.44, 0.56, 0.58);
            let shelfTier = smoothstep(0.004, 0.018, normDepth);
            cOceanShelf  = mix(cInnerShelf, cOuterShelf, shelfTier);
            cOceanSlope  = vec3<f32>(0.34, 0.46, 0.52);
            cOceanDeep   = vec3<f32>(0.24, 0.35, 0.46);
            cOceanTrench = vec3<f32>(0.13, 0.19, 0.26);
        } else {
            cOceanShelf  = vec3<f32>(0.04, 0.18, 0.28);
            cOceanSlope  = vec3<f32>(0.025, 0.10, 0.18);
            cOceanDeep   = vec3<f32>(0.012, 0.045, 0.09);
            cOceanTrench = vec3<f32>(0.005, 0.012, 0.03);
        }

        let reefInfluence = 1.0 - smoothstep(0.001, 0.025, normDepth);
        let shelfReefBed = mix(cOceanShelf, select(vec3<f32>(0.94, 0.92, 0.86), ALBEDO_CARBONATE_REEF * 0.85, isDark), reefInfluence);

        let ob0 = smoothstep(0.004, 0.022, normDepth);
        let ob1 = smoothstep(0.022, 0.228, normDepth);
        let ob2 = smoothstep(0.228, 0.503, normDepth);
        let cBathy = mix(
            mix(shelfReefBed, cOceanSlope, ob0),
            mix(cOceanDeep, cOceanTrench, ob2),
            ob1
        );

        // Submerged bathymetric relief hillshading through water column
        let bathySunDirect = max(0.0, NdotL1) * shadowFactor;
        let bathyReliefWeight = 0.85 * (1.0 - smoothstep(0.02, 0.40, normDepth) * 0.40);
        let bathyIllum = (cSunLight * (bathySunDirect * 0.80 + ridgeEnhance * 0.75 * shadowFactor) + cSkyAmbient * (skyIndirect * creviceAO)) * bathyReliefWeight;
        finalCrust = mix(cBathy * bathyIllum, finalLand, smoothstep(0.32, 0.68, isLand));
    }

    // Hypsometric Stratum Isolation Glaze (Non-Destructive Elevation Band Highlight)
    if (sim.u_isolatedStratum >= -0.5) {
        let targetStratum = u32(round(sim.u_isolatedStratum));
        var currentStratum = 2u;
        if (elevMeters < -5500.0) {
            currentStratum = 0u; // Abyssal Trench
        } else if (elevMeters < -200.0) {
            currentStratum = 1u; // Continental Shelf Break / Mid-Ocean Ridge
        } else if (elevMeters < 500.0) {
            currentStratum = 2u; // Continental Shelf & Coastal Lowlands
        } else if (elevMeters < 5200.0) {
            currentStratum = 3u; // Steppe / Montane Plateaus
        } else {
            currentStratum = 4u; // Glacial Summits & Alpine Ridges
        }

        if (currentStratum == targetStratum) {
            // Selected stratum: subtle mineral brilliance & contrast boost
            finalCrust = finalCrust * 1.15;
        } else {
            // Non-selected stratum: soften contrast towards subdued tone to maintain geographic context
            let luma = dot(finalCrust, vec3<f32>(0.299, 0.587, 0.114));
            finalCrust = mix(finalCrust, vec3<f32>(luma), 0.50) * 0.70;
        }
    }

    // Archival Cartographic Drafting Graticule (15° Parallels & Meridians)
    let meridianGrid = fract(input.uv.x * 24.0);
    let parallelGrid = fract(input.uv.y * 12.0);

    // Polar meridian attenuation: smoothly fade meridians approaching poles (>75° latitude)
    let poleDist = abs(input.uv.y - 0.5) * 2.0;
    let meridianFade = 1.0 - smoothstep(0.78, 0.95, poleDist);

    // Screen-space derivative feathering (fwidth) for resolution-invariant hairline linework
    let halfWidthU = max(0.012, dUV.x * 1.25);
    let halfWidthV = max(0.012, dUV.y * 1.25);

    let lineU = (1.0 - smoothstep(0.0, halfWidthU, min(meridianGrid, 1.0 - meridianGrid))) * meridianFade;
    let lineV = 1.0 - smoothstep(0.0, halfWidthV, min(parallelGrid, 1.0 - parallelGrid));
    let minorGraticule = max(lineU, lineV);

    let isEquator = 1.0 - smoothstep(0.0, max(0.020, dUV.y * 1.8), abs(input.uv.y - 0.5));
    let isPrime   = (1.0 - smoothstep(0.0, max(0.020, dUV.x * 1.8), abs(input.uv.x - 0.5))) * meridianFade;
    let majorGraticule = max(isEquator, isPrime);

    var cGraticule: vec3<f32>;
    var graticuleWeight: f32;
    if (sim.u_theme == 2u) {
        cGraticule = vec3<f32>(0.91, 0.93, 0.96); // Chalk Ruling Pen Linework
        graticuleWeight = minorGraticule * 0.09 + majorGraticule * 0.18;
    } else if (sim.u_theme == 1u) {
        cGraticule = vec3<f32>(0.28, 0.22, 0.16); // Copperplate Sepia Ink Linework
        graticuleWeight = minorGraticule * 0.08 + majorGraticule * 0.16;
    } else {
        cGraticule = vec3<f32>(0.23, 0.47, 0.54); // Marine Turquoise Drafting Linework
        graticuleWeight = minorGraticule * 0.08 + majorGraticule * 0.16;
    }
    finalCrust = mix(finalCrust, cGraticule, clamp(graticuleWeight, 0.0, 0.35));

    // ========================================================================
    // MEDIUM-SPECIFIC ANALYTICAL CONTOURS & OCEANOGRAPHIC ISOBATHS
    // ========================================================================
    if (sim.u_renderStyle != 2u) {
        let camDist = length(sim.u_cameraPos.xyz);
        let orbitZoom = clamp((25.0 - camDist) / (25.0 - 6.0), 0.0, 1.0);

        // True screen-space DEM gradient derivatives via precomputed dUV (Invariant #3)
        // Eliminates the ~42x displacement normal blowout so anti-Moiré and hairlines render correctly
        let pxPerTexel = dUV / max(ts, vec2<f32>(1e-6));
        let dDemLandX = (finalDemR.r - finalDemL.r) * 0.5;
        let dDemLandY = (finalDemD.r - finalDemU.r) * 0.5;
        let dDemDepthX = (finalDemR.g - finalDemL.g) * 0.5;
        let dDemDepthY = (finalDemD.g - finalDemU.g) * 0.5;
        let dDemGlobalX = (finalDemR.a - finalDemL.a) * 0.5;
        let dDemGlobalY = (finalDemD.a - finalDemU.a) * 0.5;

        if (sim.u_theme == 1u) {
            // --- THEME 1 (Cream Rag): Eduard Imhof Swiss Topographic Analytical Contours ---
            // Generates copperplate sepia contours on land, fading on steep slopes where Lehmann hachures dominate
            let shoreContourFade = smoothstep(0.35, 0.65, isLand);
            if (shoreContourFade > 0.001 && landElev >= 0.0) {
                let normLand = clamp(landElev, 0.0, 1.0);
                let creamFreq = mix(32.0, 64.0, orbitZoom);
                let elevIndex = normLand * creamFreq;

                // Screen-space derivative width evaluation using true unscaled DEM gradient (Invariant #3)
                let dElevPx = length(vec2<f32>(dDemLandX * pxPerTexel.x, dDemLandY * pxPerTexel.y)) * creamFreq;
                let halfW = max(0.008, dElevPx * 0.85);

                // Minor contours (every interval)
                let minorVal = fract(elevIndex);
                let distMinor = min(minorVal, 1.0 - minorVal);
                let isMinor = 1.0 - smoothstep(0.0, halfW, distMinor);

                // Major index contours (every 5th interval)
                let majorIndex = elevIndex * 0.20;
                let majorVal = fract(majorIndex);
                let distMajor = min(majorVal, 1.0 - majorVal) * 5.0;
                let isMajor = 1.0 - smoothstep(0.0, halfW * 1.5, distMajor);

                // Slope coordination: contours fade on slopes > 20° (0.349 rad) where Lehmann hachures dominate
                let slopeAngle = acos(cosSlope);
                let hachureFade = 1.0 - smoothstep(0.30, 0.42, slopeAngle);

                // Anti-Moiré suppression at orbital distance when lines crowd into sub-pixel clusters
                let moireGuard = 1.0 - smoothstep(0.35, 0.85, dElevPx);
                let moireGuardMajor = 1.0 - smoothstep(0.35, 0.85, dElevPx * 0.20);

                let cCopperplateSepia = vec3<f32>(0.22, 0.19, 0.16); // Archival sepia-charcoal ink #38302A
                let contourAlpha = (isMinor * 0.25 * moireGuard + isMajor * 0.35 * moireGuardMajor) * hachureFade * shoreContourFade;
                finalCrust = mix(finalCrust, cCopperplateSepia, clamp(contourAlpha, 0.0, 0.65));
            }
        } else if (sim.u_theme == 2u) {
            // --- THEME 2 (Prussian Cyanotype): Analytical Chalk Ruling Pen Isoline Contours ---
            // View-dependent frequency and screen-space derivative feathering to eliminate globe-scale Moiré
            let normElev = clamp((elevMeters + 10924.0) / 19772.0, 0.0, 1.0);
            let cyanoFreq = mix(16.0, 44.0, orbitZoom);
            let contourVal = fract(normElev * cyanoFreq);
            let distToLine = min(contourVal, 1.0 - contourVal);

            let dElevPx = length(vec2<f32>(dDemGlobalX * pxPerTexel.x, dDemGlobalY * pxPerTexel.y)) * cyanoFreq;
            let halfW = max(0.008, dElevPx * 0.85);
            let isContour = 1.0 - smoothstep(0.0, halfW, distToLine);

            // Anti-Moiré suppression when lines crowd into sub-pixel clusters
            let moireGuard = 1.0 - smoothstep(0.35, 0.85, dElevPx);

            let cChalkContour = vec3<f32>(0.91, 0.93, 0.96); // Chalk Ruling Pen Linework #E8EDF2
            finalCrust = mix(finalCrust, cChalkContour, isContour * moireGuard * 0.60);
        } else if (sim.u_theme == 0u) {
            // --- THEME 0 (Marie Tharp): Oceanographic Isobaths on Continental Shelf & Abyssal Plain ---
            // Land has NO contours per physiographic tradition; ocean basins feature major 1000m isobaths
            if (isLand <= 0.45) {
                let shoreIsobathFade = 1.0 - smoothstep(0.35, 0.65, isLand);
                let normDepth = clamp(oceanDepth, 0.0, 1.0);
                let depthMeters = normDepth * 10924.0;
                let isobathFreq = depthMeters / 1000.0; // 1000m depth contours
                let isobathVal = fract(isobathFreq);
                let distToIsobath = min(isobathVal, 1.0 - isobathVal);

                let dDepthPx = length(vec2<f32>(dDemDepthX * pxPerTexel.x, dDemDepthY * pxPerTexel.y)) * 10.924;
                let isobathWidth = max(0.008, dDepthPx * 0.85);
                let isIsobath = 1.0 - smoothstep(0.0, isobathWidth, distToIsobath);

                // Continental shelf break isobath (200m depth contour) visible on continental shelf
                let shelfIsobathVal = fract(depthMeters / 200.0);
                let distToShelfIsobath = min(shelfIsobathVal, 1.0 - shelfIsobathVal);
                let isShelfIsobath = (1.0 - smoothstep(0.0, isobathWidth * 5.0, distToShelfIsobath)) * smoothstep(600.0, 100.0, depthMeters);

                let moireGuard = 1.0 - smoothstep(0.35, 0.85, dDepthPx);
                let cMarineTurquoise = vec3<f32>(0.20, 0.58, 0.65); // Thin marine turquoise drafting ink #3394A6
                let netIsobath = max(isIsobath, isShelfIsobath * 0.70);
                finalCrust = mix(finalCrust, cMarineTurquoise, netIsobath * moireGuard * 0.45 * shoreIsobathFade);
            }
        }
    }

    // Atmospheric limb darkening in light mode to define globe silhouette against white canvas
    if (sim.u_theme == 1u) {
        let NdotV = clamp(dot(n0, V), 0.0, 1.0);
        let limbFactor = pow(1.0 - NdotV, 3.0);
        let unfurlFade = 1.0 - smoothstep(0.3, 0.8, sim.u_unfurl);
        finalCrust = finalCrust * (1.0 - limbFactor * 0.35 * unfurlFade);
    }

    // ========================================================================
    // STAGE 3: Archival Ink Pigmentation & Weather Overlays
    // ========================================================================
    var weatherOverlay: vec4<f32>;
    if (sim.u_weatherOpticalMode == 1u) {
        weatherOverlay = sample_spectral_doppler(precipRate);
    } else {
        weatherOverlay = apply_weather_pigmentation(
            precipRate,
            sim.u_theme,
            sim.u_mediumProperties,
            vec4<f32>(finalCrust, 1.0)
        );
    }

    finalCrust = mix(finalCrust, weatherOverlay.rgb, weatherOverlay.a);

    let finalAlpha = clamp(sim.u_layerOpacity, 0.0, 1.0);
    return vec4<f32>(finalCrust * finalAlpha, finalAlpha);
}
