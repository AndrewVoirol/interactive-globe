// ============================================================================
// File: src/webgpu/shaders/hydrosphere_optics.wgsl
// Architecture: Physical Hydrosphere Optics & Radiative Transfer Module
// Specifications: Jerlov Types I-III, Kubelka-Munk Two-Flux, Multi-Octave Caustics
// Target: WebGPU / Apple Silicon M4 Pro Metal Backend
// ============================================================================

struct HydrosphereUniforms {
    u_waterType: u32,             // 0=Type I, 1=Type IA, 2=Type IB, 3=Type II, 4=Type III
    u_time: f32,                  // Continuous time in seconds
    u_seaLevelOffset: f32,        // Sea level adjustment datum (meters)
    u_causticIntensity: f32,      // Caustic focusing gain multiplier (default = 1.0)
    u_sunAzimuth: f32,            // Solar azimuth in degrees
    u_sunAltitude: f32,           // Solar altitude in degrees
    u_roughness: f32,             // Water surface micro-facet roughness [0.01 .. 0.2]
    u_fresnelPower: f32,          // Schlick Fresnel exponent (default = 5.0)
};

// ----------------------------------------------------------------------------
// Jerlov Water Optical Coefficients at [650nm (Red), 532nm (Green), 440nm (Blue)]
// Units: inverse meters (1/m)
// ----------------------------------------------------------------------------

// Diffuse downward attenuation Kd(lambda)
const JERLOV_KD: array<vec3<f32>, 5> = array<vec3<f32>, 5>(
    vec3<f32>(0.355, 0.055, 0.023), // Type I  (Ultra-oligotrophic, blue-penetrating)
    vec3<f32>(0.365, 0.063, 0.038), // Type IA (Oligotrophic)
    vec3<f32>(0.380, 0.075, 0.052), // Type IB (Clear open ocean)
    vec3<f32>(0.410, 0.105, 0.094), // Type II (Mesotrophic)
    vec3<f32>(0.480, 0.145, 0.190)  // Type III (Coastal gelbstoff, green-penetrating)
);

// Inherent absorption coefficient a(lambda)
const JERLOV_A: array<vec3<f32>, 5> = array<vec3<f32>, 5>(
    vec3<f32>(0.350, 0.051, 0.018), // Type I
    vec3<f32>(0.355, 0.058, 0.032), // Type IA
    vec3<f32>(0.362, 0.068, 0.046), // Type IB
    vec3<f32>(0.385, 0.088, 0.085), // Type II
    vec3<f32>(0.440, 0.115, 0.165)  // Type III
);

// Inherent backscattering coefficient bb(lambda)
const JERLOV_BB: array<vec3<f32>, 5> = array<vec3<f32>, 5>(
    vec3<f32>(0.00045, 0.00054, 0.00063), // Type I
    vec3<f32>(0.00081, 0.00094, 0.00108), // Type IA
    vec3<f32>(0.00117, 0.00135, 0.00153), // Type IB
    vec3<f32>(0.00216, 0.00252, 0.00288), // Type II
    vec3<f32>(0.00480, 0.00560, 0.00640)  // Type III
);

// Infinite-depth asymptotic volume reflectance R_infinity
const JERLOV_R_INF: array<vec3<f32>, 5> = array<vec3<f32>, 5>(
    vec3<f32>(0.00064, 0.00527, 0.01720), // Type I  (Deep Sapphire Abyss)
    vec3<f32>(0.00114, 0.00803, 0.01660), // Type IA
    vec3<f32>(0.00161, 0.00983, 0.01635), // Type IB
    vec3<f32>(0.00280, 0.01412, 0.01666), // Type II
    vec3<f32>(0.00542, 0.02377, 0.01903)  // Type III (Mesotrophic Green-Cyan)
);

// ----------------------------------------------------------------------------
// Marine Benthic Substrate Albedo Presets
// ----------------------------------------------------------------------------
const ALBEDO_CARBONATE_REEF: vec3<f32> = vec3<f32>(0.48, 0.54, 0.44); // Aragonite coral sand
const ALBEDO_WHITE_OOID:     vec3<f32> = vec3<f32>(0.60, 0.64, 0.58); // Bahamian white shoal
const ALBEDO_COASTAL_SILT:   vec3<f32> = vec3<f32>(0.28, 0.22, 0.15); // Terrigenous sediment
const ALBEDO_ABYSSAL_BASALT: vec3<f32> = vec3<f32>(0.06, 0.05, 0.04); // Pelagic clay

// ----------------------------------------------------------------------------
// Refraction & Slant Path Geometry
// ----------------------------------------------------------------------------
fn computeSlantPathCosines(N: vec3<f32>, L: vec3<f32>, V: vec3<f32>) -> vec2<f32> {
    const NW_SEAWATER: f32 = 1.334;
    const INV_NW_SQ: f32   = 0.561937; // 1.0 / (1.334 * 1.334)

    let NdotL = max(0.0, dot(N, L));
    let NdotV = max(0.0, dot(N, V));

    // Refracted cosines inside water via Snell's Law
    let sin2_theta_s = max(0.0, 1.0 - NdotL * NdotL);
    let sin2_theta_v = max(0.0, 1.0 - NdotV * NdotV);

    let mu_s = sqrt(max(0.01, 1.0 - sin2_theta_s * INV_NW_SQ));
    let mu_v = sqrt(max(0.01, 1.0 - sin2_theta_v * INV_NW_SQ));

    return vec2<f32>(mu_s, mu_v);
}

// ----------------------------------------------------------------------------
// Beer-Lambert Directional Transmission
// ----------------------------------------------------------------------------
fn evaluateSpectralTransmission(depthMeters: f32, waterType: u32, mu_s: f32, mu_v: f32) -> vec3<f32> {
    let Kd = JERLOV_KD[clamp(waterType, 0u, 4u)];
    let pathFactor = (1.0 / mu_s) + (1.0 / mu_v);
    let opticalPath = Kd * (depthMeters * pathFactor);
    return exp(-opticalPath);
}

// ----------------------------------------------------------------------------
// Kubelka-Munk Two-Flux Bottom Reflectance
// Analytical closed-form solution over reflective seabed
// ----------------------------------------------------------------------------
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

    // Two-flux attenuation coefficient gamma = 2 * sqrt(a * (a + 2*bb))
    let gamma = 2.0 * sqrt(a * (a + 2.0 * bb));
    
    // Slant-path angular scaling
    let pathFactor = 0.5 * ((1.0 / mu_s) + (1.0 / mu_v));
    let expTerm = exp(-2.0 * gamma * (depthMeters * pathFactor));

    // Exact Kubelka-Munk solution:
    // R = [R_inf * (1 - R_inf * R_b) + (R_b - R_inf) * exp] / [(1 - R_inf * R_b) + R_inf * (R_b - R_inf) * exp]
    let crossTerm = Rinf * bottomAlbedo;
    let diffTerm  = bottomAlbedo - Rinf;

    let numerator   = Rinf * (vec3<f32>(1.0) - crossTerm) + diffTerm * expTerm;
    let denominator = (vec3<f32>(1.0) - crossTerm) + Rinf * (diffTerm * expTerm);

    return clamp(numerator / max(denominator, vec3<f32>(0.001)), vec3<f32>(0.0), vec3<f32>(1.0));
}

// ----------------------------------------------------------------------------
// Multi-Octave Directional Wave Micro-Ripples & Analytical Divergence Caustics
// ----------------------------------------------------------------------------
struct WaveHarmonic {
    amplitude: f32,
    kx: f32,
    ky: f32,
    omega: f32,
    phi: f32,
};

// 4-Octave Directional Micro-Ripples
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
        let w = WAVE_OCTAVES[i];
        let phase = w.kx * uv.x + w.ky * uv.y - w.omega * time + w.phi;
        let cosP = cos(phase);
        let sinP = sin(phase);

        // Gradient of elevation gives normal perturbation: Delta_n = sum A_i * k_i * cos(phase)
        dN.x = dN.x + w.amplitude * w.kx * cosP;
        dN.y = dN.y + w.amplitude * w.ky * cosP;

        // Analytical Divergence: div(Delta_n) = sum -A_i * (kx^2 + ky^2) * sin(phase)
        let kSq = w.kx * w.kx + w.ky * w.ky;
        divN = divN - w.amplitude * kSq * sinP;
    }

    var res: RippleResult;
    res.normalPerturbation = dN;
    res.analyticalDivergence = divN;
    return res;
}

// ----------------------------------------------------------------------------
// Caustic Focusing Factor on Shallow Bathymetry Bed
// ----------------------------------------------------------------------------
fn evaluateCausticIntensity(
    depthMeters: f32,
    analyticalDivergence: f32,
    waterType: u32,
    intensityGain: f32
) -> f32 {
    let inRange = depthMeters > 0.01 && depthMeters <= 45.0;

    // Refraction coupling mu = 1 - 1/n_w = 0.2504
    const MU_REFR: f32 = 0.2504;

    // Depth-dependent focal parameter: peaks near 3m-6m, decays as depth increases
    let safeDepth = clamp(depthMeters, 0.0, 50.0);
    let beta = select(0.0, MU_REFR * safeDepth * exp(-safeDepth * 0.18), inRange);
    
    // Raw caustic focusing factor
    // Minus sign: ray convergence at wave troughs (analyticalDivergence < 0) focuses light into bright cusps
    let rawCaustic = 1.0 - (beta * analyticalDivergence) * intensityGain;

    // Depth gating: caustics attenuate rapidly due to multiple scattering below 25m
    let depthGate = 1.0 - smoothstep(12.0, 35.0, safeDepth);
    let caustic = max(0.0, mix(1.0, rawCaustic, depthGate));

    return select(1.0, caustic, inRange);
}

// ----------------------------------------------------------------------------
// Full Hydrosphere Pixel Radiance Evaluation
// ----------------------------------------------------------------------------
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

    // Micro-ripple wave perturbation
    let rippleUv = uvCoord * 450.0;
    let ripples = evaluateMicroRipples(rippleUv, uniforms.u_time);

    // Tangent frame construction
    let upVec = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), abs(baseNormal.y) > 0.95);
    let tangentX = normalize(cross(upVec, baseNormal));
    let tangentY = cross(baseNormal, tangentX);

    // Perturbed water surface normal
    let perturbedNormal = normalize(
        baseNormal + 
        (tangentX * ripples.normalPerturbation.x + tangentY * ripples.normalPerturbation.y) * 0.35
    );

    // Angular cosines
    let cosines = computeSlantPathCosines(baseNormal, sunDir, viewDir);
    let mu_s = cosines.x;
    let mu_v = cosines.y;

    // Substrate albedo selection: shallow lagoons -> carbonate reef, deep basins -> basalt
    let albedoMix = smoothstep(0.0, 60.0, safeDepth);
    let bedAlbedo = mix(ALBEDO_CARBONATE_REEF, ALBEDO_ABYSSAL_BASALT, albedoMix);

    // Kubelka-Munk bottom reflectance
    let R_subsurface = evaluateKubelkaMunkReflectance(safeDepth, uniforms.u_waterType, bedAlbedo, mu_s, mu_v);

    // Caustic intensity factor
    let causticFactor = evaluateCausticIntensity(
        safeDepth,
        ripples.analyticalDivergence,
        uniforms.u_waterType,
        uniforms.u_causticIntensity
    );

    // Diffuse solar illumination reaching seabed
    let NdotL = max(0.05, dot(baseNormal, sunDir));
    let seabedRadiance = R_subsurface * (NdotL * causticFactor);

    // Dynamic Schlick Fresnel reflection at water-air boundary
    let NdotV = max(0.0, dot(perturbedNormal, viewDir));
    const F0_WATER: f32 = 0.0204; // ((1.334 - 1.0) / (1.334 + 1.0))^2
    let fresnel = F0_WATER + (1.0 - F0_WATER) * pow(1.0 - NdotV, uniforms.u_fresnelPower);

    // Specular solar glint
    let halfVec = normalize(sunDir + viewDir);
    let NdotH = max(0.0, dot(perturbedNormal, halfVec));
    let specPower = mix(128.0, 16.0, uniforms.u_roughness);
    let sunSpecular = pow(NdotH, specPower) * ((specPower + 8.0) / (8.0 * 3.14159265));

    // Sky ambient color reflected at grazing angles
    let skyReflection = vec3<f32>(0.65, 0.78, 0.92) * fresnel;

    // Combine subsurface radiance with surface Fresnel glint
    let finalColor = seabedRadiance * (1.0 - fresnel) + skyReflection + vec3<f32>(sunSpecular * fresnel);

    // Water surface opacity: shallow water is translucent, deep water becomes opaque
    let waterOpacity = clamp(1.0 - exp(-safeDepth * 0.15) + fresnel * 0.4, 0.15, 0.98);

    let finalOutput = vec4<f32>(finalColor, waterOpacity);
    return select(vec4<f32>(0.0, 0.0, 0.0, 0.0), finalOutput, isWater);
}
