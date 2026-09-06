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
    u_padding: f32,
};

@group(0) @binding(0) var<uniform> sim: SimUniforms;
@group(0) @binding(1) var u_demTexture: texture_2d<f32>;
@group(0) @binding(2) var u_demSampler: sampler;

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
    uniforms: HydrosphereUniforms
) -> vec4<f32> {
    let depthMeters = max(0.0, uniforms.u_seaLevelOffset - elevationMeters);
    let isWater = depthMeters > 0.001;
    let safeDepth = select(0.001, depthMeters, isWater);

    let rippleUv = uvCoord * 450.0;
    let ripples = evaluateMicroRipples(rippleUv, uniforms.u_time);

    let upVec = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), abs(baseNormal.y) > 0.95);
    let tangentX = normalize(cross(upVec, baseNormal));
    let tangentY = cross(baseNormal, tangentX);

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
    let seabedRadiance = R_subsurface * (NdotL * causticFactor);

    // Pelagic Radiance & Bathymetric Gradient from Jerlov Radiative Transfer
    let isDark = sim.u_theme == 0u;
    let cSunLight = vec3<f32>(1.08, 1.02, 0.94);
    let cSkyAmbient = select(vec3<f32>(0.28, 0.34, 0.44), vec3<f32>(0.14, 0.18, 0.24), isDark);
    let sunIllum = cSunLight * (NdotL * 0.85 + 0.15) + cSkyAmbient * 0.80;

    // Jerlov volume radiance: Type I crystal sapphire blue vs Type III emerald green
    let pelagicRadiance = (props.Rinf * 48.0) * sunIllum;

    // Deep abyssal trenches (> 2000m to 10,924m): total extinction deepens into midnight indigo
    let normDepth = clamp(safeDepth / 10924.0, 0.0, 1.0);
    let trenchFactor = smoothstep(0.12, 0.85, normDepth);
    let cTrench = select(vec3<f32>(0.02, 0.06, 0.18), vec3<f32>(0.005, 0.015, 0.05), isDark);
    let deepOceanColor = mix(pelagicRadiance, cTrench, trenchFactor);

    // Continuous physical blend from shallow Kubelka-Munk seabed glow to deep Jerlov volume radiance
    let depthBlend = smoothstep(6.0, 65.0, safeDepth);
    let waterColor = mix(seabedRadiance * 1.35, deepOceanColor, depthBlend);

    let NdotV = max(0.0, dot(perturbedNormal, viewDir));
    const F0_WATER: f32 = 0.0204;
    let fresnel = F0_WATER + (1.0 - F0_WATER) * pow(1.0 - NdotV, uniforms.u_fresnelPower);

    let halfVec = normalize(sunDir + viewDir);
    let NdotH = max(0.0, dot(perturbedNormal, halfVec));
    let specPower = mix(128.0, 16.0, uniforms.u_roughness);
    let sunSpecular = pow(NdotH, specPower) * ((specPower + 8.0) / (8.0 * 3.14159265));

    // Dampen sky glare on the unfurled flat map so the ocean stays deep, clear, and visible
    let mapFresnelAtten = mix(1.0, 0.20, sim.u_unfurl);
    let skyReflection = select(vec3<f32>(0.75, 0.85, 0.95), vec3<f32>(0.20, 0.38, 0.55), isDark) * (fresnel * mapFresnelAtten);
    let specAtten = mix(1.0, 0.35, sim.u_unfurl);
    let finalColor = waterColor * (1.0 - fresnel * 0.4) + skyReflection + vec3<f32>(sunSpecular * fresnel * specAtten);

    // Dynamic optical transparency: shallow shelves are translucent to seabed below, deep abyss is dense
    let clarityScale = 0.0012 / max(0.15, sim.u_waterClarity);
    let depthOpacity = 1.0 - exp(-safeDepth * clarityScale);
    let waterOpacity = clamp((0.40 + depthOpacity * 0.54 + fresnel * 0.25) * sim.u_layerOpacity, 0.35, 0.96);

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

fn evaluateManifold(pos3D: vec3<f32>, target2D: vec2<f32>, dymaxion2D: vec2<f32>) -> DeformedVertex {
    var out: DeformedVertex;
    let clampedUnfurl = clamp(sim.u_unfurl, 0.0, 1.0);
    let ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);
    let pos2D = vec3<f32>(target2D.x, target2D.y, 0.015);

    let curR = max(length(pos3D), 0.001);
    let lambda = atan2(pos3D.x, pos3D.z);
    let phi = asin(clamp(pos3D.y / curR, -0.9998, 0.9998));

    if (sim.u_mode == 1u) {
        // Mode 1: Cylindrical Scroll Unfurling
        let oneMinusT = 1.0 - ease;
        if (oneMinusT > 0.001) {
            let invOneMinusT = 1.0 / oneMinusT;
            let curAngle = oneMinusT * lambda;
            let curX = (curR * invOneMinusT) * sin(curAngle);
            let curZ = (curR * cos(phi) * invOneMinusT) * (cos(curAngle) - 1.0) + (curR * cos(phi) * oneMinusT);
            let curY = mix(pos3D.y, pos2D.y, ease);
            out.pos = vec3<f32>(curX, curY, curZ);

            let T_lambda = vec3<f32>(curR * cos(curAngle), 0.0, -curR * cos(phi) * sin(curAngle));
            let T_phi = vec3<f32>(
                0.0,
                mix(curR * cos(phi), curR / max(cos(phi), 0.05), ease),
                -curR * sin(phi) * invOneMinusT * (cos(curAngle) - 1.0) - curR * sin(phi) * oneMinusT
            );
            let rawNorm = cross(T_lambda, T_phi);
            out.normal = select(normalize(pos3D), normalize(rawNorm), length(rawNorm) > 0.0001);
        } else {
            let u = oneMinusT * lambda;
            let sinTerm = lambda * (1.0 - (u * u) / 6.0);
            let cosTerm = oneMinusT * (lambda * lambda) * (-0.5 + (u * u) / 24.0);
            let curX = curR * sinTerm;
            let curZ = curR * cos(phi) * cosTerm + curR * cos(phi) * oneMinusT;
            let curY = mix(pos3D.y, pos2D.y, ease);
            out.pos = vec3<f32>(curX, curY, curZ);
            out.normal = vec3<f32>(0.0, 0.0, 1.0);
        }
    } else if (sim.u_mode == 2u) {
        // Mode 2: Griffith LEFM
        let distToSeam = PI - abs(lambda);
        let seamFactor = 1.0 - smoothstep(0.0, 0.75, distToSeam);
        let tRupture = 0.18;

        let hitDist = length(pos3D - sim.u_cursorHitPos.xyz);
        let cursorInfluence = sim.u_cursorActive * exp(-hitDist * hitDist / (2.0 * 0.64));
        let hoopStress = cursorInfluence * 0.45 * (1.0 + 2.0 * cos(phi) * cos(phi));

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
    } else if (sim.u_mode == 3u) {
        // Mode 3: Fluid Advection
        let rawSin = sin(PI * clampedUnfurl);
        let liquefaction = pow(max(0.0, rawSin), 1.15);
        let unElevatedSphere = normalize(pos3D) * RADIUS;
        let basePos = mix(unElevatedSphere, vec3<f32>(target2D.x, target2D.y, 0.0), ease);
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
    } else if (sim.u_mode == 4u) {
        // Mode 4: Fuller Dymaxion Polyhedral Net
        let dymaxionPos2D = vec3<f32>(dymaxion2D.x, dymaxion2D.y, 0.015);
        let arch = sin(PI * clampedUnfurl) * 0.45;
        let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);
        out.pos = mix(pos3D, dymaxionPos2D, ease) + sphereNorm * arch;
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

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.uv = input.uv;
    output.surfaceType = input.surfaceType;

    // Sample DEM
    let demSample = textureSampleLevel(u_demTexture, u_demSampler, input.uv, 0.0);
    let elevMeters = decodeElevation(demSample);
    output.elevation = elevMeters;

    // Resolve 2D targets from vertex buffer attributes
    let t2D = input.target2D.xy;
    let d2D = input.target2D.zw;

    // Dynamic manifold base position across 5 paradigms
    let deformed = evaluateManifold(input.position, t2D, d2D);
    let basePos = deformed.pos;
    let baseNormal = deformed.normal;

    // Calculate sea level displacement
    let waterLevel = sim.u_seaLevel;
    let depth = max(0.0, waterLevel - elevMeters);
    output.waterDepth = depth;

    // Polar displacement attenuation near singularities (prevent spiky mesh artifacts in Canada/Greenland/Siberia)
    let poleDist = abs(input.uv.y - 0.5) * 2.0;
    let poleAtten = 1.0 - smoothstep(0.85, 0.98, poleDist);

    // Synchronous Dual-Surface Morphing Theorem (Theorem 3.3.2):
    // Zero gaps and zero z-fighting at shoreline (h = 0)
    var normalDisplacement = 0.0;
    let dispScale = sim.u_displacementScale * 2.8;
    if (input.surfaceType > 0.5) {
        // Liquid Hydrosphere shell: floats at dynamic sea level
        normalDisplacement = (waterLevel / 8848.0) * dispScale * poleAtten;
    } else {
        // Lithosphere Crust: displaced by actual topography/bathymetry with peak sharpening
        if (elevMeters >= 0.0) {
            let normH = elevMeters / 8848.0;
            normalDisplacement = pow(normH, max(0.5, sim.u_peakExponent)) * dispScale * poleAtten;
        } else {
            let normD = clamp(-elevMeters / 10924.0, 0.0, 1.0);
            normalDisplacement = -pow(normD, 0.85) * (dispScale * 0.65) * poleAtten;
        }
    }

    let worldP = basePos + baseNormal * normalDisplacement;
    output.worldPos = worldP;
    output.normal = baseNormal;

    output.dymaxion2D = d2D;

    let viewPos = sim.u_viewMatrix * vec4<f32>(worldP, 1.0);
    output.clipPos = sim.u_projectionMatrix * viewPos;

    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Unconditional derivative evaluation for WGSL uniform control flow conformance
    let du_dx = dpdx(input.uv.x);
    let du_dy = dpdy(input.uv.x);
    let dv_dx = dpdx(input.uv.y);
    let dv_dy = dpdy(input.uv.y);
    let dym_dx = dpdx(input.dymaxion2D);
    let dym_dy = dpdy(input.dymaxion2D);

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

    // Liquid Hydrosphere Surface Pass via Jerlov Radiative Transfer & Caustics
    if (input.surfaceType > 0.5) {
        // In pure Relief / Architectural mode (u_renderStyle == 0),
        // hide the liquid hydrosphere surface so bathymetric ocean floor relief is visible
        if (sim.u_renderStyle == 0u) {
            discard;
        }

        let depthMeters = max(0.0, sim.u_seaLevel - input.elevation);
        if (depthMeters <= 0.001) {
            discard;
        }

        var hydroUniforms: HydrosphereUniforms;
        let clarityIdx = clamp(u32(floor((1.0 - clamp(sim.u_waterClarity, 0.0, 1.0)) * 4.0 + 0.5)), 0u, 4u);
        hydroUniforms.u_waterType = clarityIdx;
        hydroUniforms.u_time = sim.u_time;
        hydroUniforms.u_seaLevelOffset = sim.u_seaLevel;
        hydroUniforms.u_causticIntensity = 1.0;
        hydroUniforms.u_sunAzimuth = sim.u_sunAzimuth;
        hydroUniforms.u_sunAltitude = sim.u_sunAltitude;
        hydroUniforms.u_roughness = sim.u_roughness;
        hydroUniforms.u_fresnelPower = 4.0;

        let sunPrimary = computeSunLightDir(sim.u_sunAzimuth, sim.u_sunAltitude);
        return computeHydrosphereShading(
            input.worldPos,
            N,
            V,
            sunPrimary,
            input.uv,
            input.elevation,
            hydroUniforms
        );
    }

    // Lithosphere Crust Pass with Eduard Imhof Swiss Relief Shading
    let n0 = normalize(input.normal);
    let upVec = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), abs(n0.y) > 0.95);
    let tangentX = normalize(cross(upVec, n0));
    let tangentY = cross(n0, tangentX);

    // Sample 5-tap cross with screen-space derivative LOD for optimal texture cache coherence and zero moiré
    let duv_dx = vec2<f32>(du_dx, dv_dx);
    let duv_dy = vec2<f32>(du_dy, dv_dy);
    let texSize = vec2<f32>(2048.0, 1024.0);
    let deltaMax2 = max(dot(duv_dx * texSize, duv_dx * texSize), dot(duv_dy * texSize, duv_dy * texSize));
    let mipLOD = clamp(0.5 * log2(max(deltaMax2, 1e-4)), 0.0, 11.0);

    let mipStep = exp2(floor(mipLOD));
    let ts = vec2<f32>(1.0 / 2048.0, 1.0 / 1024.0) * max(1.0, mipStep);

    let demC = textureSampleLevel(u_demTexture, u_demSampler, input.uv, mipLOD);
    let demR = textureSampleLevel(u_demTexture, u_demSampler, input.uv + vec2<f32>(ts.x, 0.0), mipLOD);
    let demL = textureSampleLevel(u_demTexture, u_demSampler, input.uv - vec2<f32>(ts.x, 0.0), mipLOD);
    let demU = textureSampleLevel(u_demTexture, u_demSampler, input.uv + vec2<f32>(0.0, ts.y), mipLOD);
    let demD = textureSampleLevel(u_demTexture, u_demSampler, input.uv - vec2<f32>(0.0, ts.y), mipLOD);

    let isLand = demC.b;
    let landElev = demC.r;
    let oceanDepth = demC.g;

    let hC = select(-oceanDepth * 0.25, landElev, isLand > 0.45);
    let hR = select(-demR.g * 0.25, demR.r, demR.b > 0.45);
    let hL = select(-demL.g * 0.25, demL.r, demL.b > 0.45);
    let hU = select(-demU.g * 0.25, demU.r, demU.b > 0.45);
    let hD = select(-demD.g * 0.25, demD.r, demD.b > 0.45);

    // Controlled displacement scale: eliminates harsh 120x normal blowout while retaining crisp relief
    let dispScale = sim.u_displacementScale * 16.0 + 1.0;
    let dHx = (hR - hL) * 0.5 * dispScale;
    let dHy = (hD - hU) * 0.5 * dispScale;

    // Perturbed surface normal in 3D world space
    let perturbedN = normalize(n0 - tangentX * dHx - tangentY * dHy);

    // Discrete Laplacian Curvature
    let laplacian = (hR + hL + hU + hD) - 4.0 * hC;
    let kRidge  = clamp(-laplacian * 45.0, 0.0, 1.0);
    let kValley = clamp(laplacian * 45.0, 0.0, 1.0);

    // Multidirectional Oblique Solar Illumination controlled dynamically by u_sunAzimuth & u_sunAltitude
    let L1_view = computeSunLightDir(sim.u_sunAzimuth, sim.u_sunAltitude);
    let L2_view = computeSunLightDir(sim.u_sunAzimuth - 90.0, sim.u_sunAltitude * 0.65);

    let N_view = normalize((sim.u_viewMatrix * vec4<f32>(perturbedN, 0.0)).xyz);
    let NdotL1 = max(0.0, dot(N_view, L1_view));
    let NdotL2 = max(0.0, dot(N_view, L2_view));

    var diffuseTotal = 0.08 + 0.72 * NdotL1 + 0.20 * NdotL2;

    // Ridge Crest Contrast Enhancement & Valley Crevice AO (modulated by u_ambientOcclusion)
    let ridgeEnhance = (NdotL1 - 0.5) * kRidge * 0.45;
    diffuseTotal = clamp(diffuseTotal + ridgeEnhance, 0.04, 1.40);
    let creviceAO = 1.0 - kValley * (0.85 * sim.u_ambientOcclusion);
    diffuseTotal = diffuseTotal * creviceAO;

    // Slope-Dependent Rock Cliff Exposure (theta > 35 degrees)
    let cosSlope = clamp(dot(perturbedN, n0), 0.0, 1.0);
    let rockWeight = (1.0 - smoothstep(0.66913, 0.81915, cosSlope)) * 0.75;

    // Procedural Rock Strata and Joints Hachuring with isotropic metric latitude scaling
    let cosLat = max(0.1, cos((input.uv.y - 0.5) * PI));
    let metricUv = vec2<f32>(input.uv.x * cosLat, input.uv.y) * 800.0;
    let gradDir = normalize(vec2<f32>(dHx, dHy) + vec2<f32>(1e-6, 1e-6));
    let strikeDir = vec2<f32>(-gradDir.y, gradDir.x);
    let uFall   = dot(metricUv, gradDir);
    let uStrike = dot(metricUv, strikeDir);
    let strata1 = sin(uStrike * 0.85);
    let strata2 = sin(uStrike * 2.10 + 0.8);
    let strataTotal = strata1 * 0.6 + strata2 * 0.4;
    let joint1 = sin(uFall * 1.40 + strataTotal * 1.2);
    let hachurePattern = clamp(0.80 + 0.20 * (joint1 * 0.65 + strataTotal * 0.35), 0.0, 1.0);

    let isDark = sim.u_theme == 0u;
    let cRockDark = select(vec3<f32>(0.26, 0.24, 0.22), vec3<f32>(0.12, 0.10, 0.09), isDark);
    let cRockLit  = select(vec3<f32>(0.65, 0.58, 0.50), vec3<f32>(0.48, 0.38, 0.32), isDark);
    let cRockShaded = mix(cRockDark, cRockLit, hachurePattern * diffuseTotal);

    // Natural Illumination Split: Warm Sun Direct + Cool Cerulean Sky Fill
    let cSunLight = vec3<f32>(1.08, 1.02, 0.94);
    let cSkyAmbient = select(vec3<f32>(0.28, 0.32, 0.38), vec3<f32>(0.14, 0.18, 0.24), isDark);
    let sunDirect = max(0.0, NdotL1);
    let skyIndirect = 0.40 + 0.60 * max(0.0, perturbedN.y * 0.5 + 0.5);

    // Eduard Imhof Swiss Hypsometric Tinting with Power-Curve Distribution
    // pow(landElev, 0.38) distributes 0..1500m across the first 50% of the color ramp
    let tElev = pow(clamp(landElev, 0.0, 1.0), 0.38);
    let cLowland = select(vec3<f32>(0.92, 0.94, 0.88), vec3<f32>(0.14, 0.24, 0.16), isDark); // Lush moss / parchment lowlands
    let cPlateau = select(vec3<f32>(0.86, 0.82, 0.70), vec3<f32>(0.36, 0.30, 0.18), isDark); // Warm golden ochre (plains & plateaus)
    let cFlank   = select(vec3<f32>(0.74, 0.66, 0.56), vec3<f32>(0.48, 0.36, 0.26), isDark); // Terracotta sandstone (mountain flanks)
    let cAlpine  = select(vec3<f32>(0.58, 0.52, 0.48), vec3<f32>(0.64, 0.54, 0.48), isDark); // Jagged alpine rock
    let cSummit  = select(vec3<f32>(0.95, 0.96, 0.98), vec3<f32>(0.96, 0.94, 0.92), isDark); // Radiant ivory snow peaks

    let t0 = smoothstep(0.00, 0.28, tElev);
    let t1 = smoothstep(0.28, 0.55, tElev);
    let t2 = smoothstep(0.55, 0.80, tElev);
    let t3 = smoothstep(0.80, 0.96, tElev);
    let cRamp = mix(mix(mix(mix(cLowland, cPlateau, t0), cFlank, t1), cAlpine, t2), cSummit, t3);

    // Aerial Perspective & Illumination Combine
    let cWarmSun = vec3<f32>(1.04, 0.98, 0.88);
    let cCoolHaze = vec3<f32>(0.84, 0.90, 1.06);
    let skyHaze = mix(cCoolHaze, cWarmSun, clamp(NdotL1 * 1.5, 0.0, 1.0));
    let landIllum = (cSunLight * (sunDirect * 0.85 + ridgeEnhance) + cSkyAmbient * (skyIndirect * creviceAO)) * skyHaze;
    let tintedLand = cRamp * landIllum;
    let finalLand = mix(tintedLand, cRockShaded, rockWeight);

    var finalCrust: vec3<f32>;

    if (sim.u_renderStyle == 0u) {
        // ====================================================================
        // OPTION A: ARCHITECTURAL TOPOGRAPHIC & BATHYMETRIC RELIEF
        // The entire planetary crust is an exposed solid physical relief sculpture.
        // No dark void! Ocean basins are rendered as architectural bathymetry
        // with mid-ocean ridges, seamounts, and trenches in sculpted mineral slate.
        // ====================================================================
        if (isLand > 0.45) {
            finalCrust = finalLand;
        } else {
            let normDepth = clamp(oceanDepth, 0.0, 1.0);
            let cBathyShelf  = select(vec3<f32>(0.88, 0.90, 0.93), vec3<f32>(0.26, 0.30, 0.36), isDark); // Continental shelf slate
            let cBathyAbyss  = select(vec3<f32>(0.76, 0.80, 0.86), vec3<f32>(0.15, 0.18, 0.24), isDark); // Abyssal plain basalt
            let cBathyTrench = select(vec3<f32>(0.62, 0.66, 0.74), vec3<f32>(0.07, 0.09, 0.13), isDark); // Deep trench indigo
            let cBathyRidge  = select(vec3<f32>(0.96, 0.98, 1.00), vec3<f32>(0.36, 0.42, 0.50), isDark); // Mid-ocean ridge crest

            var cBathy = mix(
                mix(cBathyShelf, cBathyAbyss, smoothstep(0.005, 0.15, normDepth)),
                cBathyTrench,
                smoothstep(0.35, 0.85, normDepth)
            );
            // Mid-ocean ridge crest highlight
            cBathy = mix(cBathy, cBathyRidge, kRidge * 0.45);

            let bathyIllum = cSunLight * (sunDirect * 0.80 + ridgeEnhance * 0.8) + cSkyAmbient * (skyIndirect * creviceAO);
            finalCrust = mix(cBathy * bathyIllum, cRockShaded, rockWeight * 0.4);
        }
    } else if (sim.u_renderStyle == 2u) {
        // ====================================================================
        // OPTION C: NASA BLUE MARBLE ORBITAL PHOTOREALISM
        // True-color orbital photography: deep sapphire oceans, biome-rich vegetated
        // continents, desert ochres, polar snow, with subtle solar illumination.
        // ====================================================================
        let cOrbitalDeep = vec3<f32>(0.02, 0.08, 0.22);
        let cOrbitalShelf = vec3<f32>(0.05, 0.20, 0.38);
        let cOrbitalCoast = vec3<f32>(0.10, 0.35, 0.45);
        let normDepth = clamp(oceanDepth, 0.0, 1.0);
        let cOcean = mix(cOrbitalCoast, mix(cOrbitalShelf, cOrbitalDeep, smoothstep(0.02, 0.25, normDepth)), smoothstep(0.002, 0.05, normDepth));

        let absLat = abs(input.uv.y - 0.5) * 2.0;
        let cRainforest = vec3<f32>(0.12, 0.26, 0.10);
        let cSavanna = vec3<f32>(0.35, 0.38, 0.18);
        let cDesert = vec3<f32>(0.55, 0.48, 0.32);
        let cTundra = vec3<f32>(0.32, 0.34, 0.26);
        let cIce = vec3<f32>(0.92, 0.95, 0.98);

        var cBiome = mix(cRainforest, cSavanna, smoothstep(0.1, 0.35, absLat));
        cBiome = mix(cBiome, cDesert, smoothstep(0.25, 0.45, absLat) * (1.0 - smoothstep(0.45, 0.65, absLat)));
        cBiome = mix(cBiome, cTundra, smoothstep(0.55, 0.75, absLat));
        cBiome = mix(cBiome, cIce, smoothstep(0.72, 0.90, absLat));
        cBiome = mix(cBiome, cIce, smoothstep(0.65, 0.95, tElev));

        let orbitalIllum = cSunLight * (sunDirect * 0.90 + ridgeEnhance * 0.4) + cSkyAmbient * (skyIndirect * 0.6);
        let landLit = cBiome * orbitalIllum;
        let oceanLit = cOcean * (sunDirect * 0.85 + 0.15);
        finalCrust = mix(oceanLit, landLit, smoothstep(0.32, 0.68, isLand));
    } else {
        // ====================================================================
        // OPTION B: HYDROSPHERE & BATHYMETRIC DEPTH
        // Ocean floor is submerged beneath translucent liquid water.
        // Deep seabed colors showing through the water column.
        // ====================================================================
        let normDepth = clamp(oceanDepth, 0.0, 1.0);
        let cOceanShelf  = select(vec3<f32>(0.92, 0.95, 0.98), vec3<f32>(0.03, 0.14, 0.24), isDark);
        let cOceanDeep   = select(vec3<f32>(0.84, 0.88, 0.93), vec3<f32>(0.015, 0.05, 0.11), isDark);
        let cOceanTrench = select(vec3<f32>(0.75, 0.80, 0.86), vec3<f32>(0.006, 0.015, 0.035), isDark);
        let reefInfluence = 1.0 - smoothstep(0.001, 0.025, normDepth);
        let shelfReefBed = mix(cOceanShelf, select(vec3<f32>(0.94, 0.92, 0.86), ALBEDO_CARBONATE_REEF * 0.85, isDark), reefInfluence);
        let cBathy = mix(
            mix(shelfReefBed, cOceanDeep, smoothstep(0.005, 0.12, normDepth)),
            cOceanTrench,
            smoothstep(0.35, 0.85, normDepth)
        );
        let bathyIllum = cSunLight * (sunDirect * 0.75) + cSkyAmbient * (skyIndirect * creviceAO * 0.8);
        finalCrust = mix(cBathy * bathyIllum, finalLand, smoothstep(0.32, 0.68, isLand));
    }

    // Atmospheric limb darkening in light mode to define globe silhouette against white canvas
    if (sim.u_theme == 1u && sim.u_unfurl < 0.6) {
        let NdotV = clamp(dot(n0, V), 0.0, 1.0);
        let limbFactor = pow(1.0 - NdotV, 3.0);
        finalCrust = finalCrust * (1.0 - limbFactor * 0.35 * (1.0 - sim.u_unfurl));
    }

    return vec4<f32>(finalCrust, sim.u_layerOpacity);
}
