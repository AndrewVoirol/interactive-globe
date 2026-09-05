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
};

const PI: f32 = 3.14159265358979323846;
const RADIUS: f32 = 5.0;

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

    let albedoMix = smoothstep(0.0, 60.0, safeDepth);
    let bedAlbedo = mix(ALBEDO_CARBONATE_REEF, ALBEDO_ABYSSAL_BASALT, albedoMix);

    let R_subsurface = evaluateKubelkaMunkReflectance(safeDepth, uniforms.u_waterType, bedAlbedo, mu_s, mu_v);

    let causticFactor = evaluateCausticIntensity(
        safeDepth,
        ripples.analyticalDivergence,
        uniforms.u_waterType,
        uniforms.u_causticIntensity
    );

    let NdotL = max(0.05, dot(baseNormal, sunDir));
    let seabedRadiance = R_subsurface * (NdotL * causticFactor);

    let NdotV = max(0.0, dot(perturbedNormal, viewDir));
    const F0_WATER: f32 = 0.0204;
    let fresnel = F0_WATER + (1.0 - F0_WATER) * pow(1.0 - NdotV, uniforms.u_fresnelPower);

    let halfVec = normalize(sunDir + viewDir);
    let NdotH = max(0.0, dot(perturbedNormal, halfVec));
    let specPower = mix(128.0, 16.0, uniforms.u_roughness);
    let sunSpecular = pow(NdotH, specPower) * ((specPower + 8.0) / (8.0 * 3.14159265));

    let skyReflection = vec3<f32>(0.65, 0.78, 0.92) * fresnel;
    let finalColor = seabedRadiance * (1.0 - fresnel) + skyReflection + vec3<f32>(sunSpecular * fresnel);
    let transmission = evaluateSpectralTransmission(safeDepth, uniforms.u_waterType, mu_s, mu_v);
    let waterOpacity = clamp(1.0 - transmission.y + fresnel * 0.4, 0.15, 0.98);

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
    let phi = asin(clamp(pos3D.y / curR, -1.0, 1.0));

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
        out.pos = mix(pos3D, pos2D, ease);
        out.normal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);
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

    // Resolve 2D targets (use attributes or analytical fallback)
    var t2D = input.target2D.xy;
    var d2D = input.target2D.zw;
    if (dot(t2D, t2D) < 1e-4) {
        let r = max(length(input.position), 0.001);
        let lambda = atan2(input.position.x, input.position.z);
        let phi = asin(clamp(input.position.y / r, -0.996, 0.996));
        t2D = vec2<f32>(lambda * RADIUS, log(tan(PI * 0.25 + phi * 0.5)) * RADIUS);
        d2D = t2D;
    }

    // Dynamic manifold base position across 5 paradigms
    let deformed = evaluateManifold(input.position, t2D, d2D);
    let basePos = deformed.pos;
    let baseNormal = deformed.normal;

    // Calculate sea level displacement
    let waterLevel = sim.u_seaLevel;
    let depth = max(0.0, waterLevel - elevMeters);
    output.waterDepth = depth;

    // Synchronous Dual-Surface Morphing Theorem (Theorem 3.3.2):
    // Zero gaps and zero z-fighting at shoreline (h = 0)
    var normalDisplacement = 0.0;
    if (input.surfaceType > 0.5) {
        // Liquid Hydrosphere shell: floats at sea level (displacement is 0 when seaLevel is 0)
        normalDisplacement = max(0.0, waterLevel) * 0.0001;
    } else {
        // Lithosphere Crust: displaced by actual topography/bathymetry
        normalDisplacement = (elevMeters / 8848.0) * 0.08 * sim.u_displacementScale;
    }

    let worldP = basePos + baseNormal * normalDisplacement;
    output.worldPos = worldP;
    output.normal = baseNormal;

    let viewPos = sim.u_viewMatrix * vec4<f32>(worldP, 1.0);
    output.clipPos = sim.u_projectionMatrix * viewPos;

    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let V = normalize(sim.u_cameraPos.xyz - input.worldPos);
    let N = normalize(input.normal);

    // Liquid Hydrosphere Surface Pass via Jerlov Radiative Transfer & Caustics
    if (input.surfaceType > 0.5) {
        var hydroUniforms: HydrosphereUniforms;
        hydroUniforms.u_waterType = 0u; // Type I
        hydroUniforms.u_time = sim.u_time;
        hydroUniforms.u_seaLevelOffset = sim.u_seaLevel;
        hydroUniforms.u_causticIntensity = 1.0;
        hydroUniforms.u_sunAzimuth = 315.0;
        hydroUniforms.u_sunAltitude = 45.0;
        hydroUniforms.u_roughness = sim.u_roughness;
        hydroUniforms.u_fresnelPower = 5.0;

        let sunPrimary = normalize(vec3<f32>(-0.7071, 0.5, 0.7071));
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
    let sunPrimary = normalize(vec3<f32>(-0.7071, 0.5, 0.7071));
    let sunFill    = normalize(vec3<f32>(-0.7071, 0.3, -0.7071));

    let NdotL1 = max(0.0, dot(N, sunPrimary));
    let NdotL2 = max(0.0, dot(N, sunFill));

    let diffuseTotal = clamp(0.08 + 0.72 * NdotL1 + 0.20 * NdotL2, 0.05, 1.40);

    let curLen = length(input.worldPos);
    let radialNormal = select(vec3<f32>(0.0, 0.0, 1.0), input.worldPos / curLen, curLen > 0.001);
    let cosSlope = clamp(dot(N, radialNormal), 0.0, 1.0);
    let rockWeight = (1.0 - smoothstep(0.66913, 0.81915, cosSlope)) * 0.65;

    let isDark = sim.u_theme == 0u;
    let cRockDark = select(vec3<f32>(0.22, 0.23, 0.25), vec3<f32>(0.08, 0.09, 0.11), isDark);
    let cRockLit  = select(vec3<f32>(0.60, 0.58, 0.54), vec3<f32>(0.35, 0.36, 0.38), isDark);
    let cRockShaded = mix(cRockDark, cRockLit, diffuseTotal);

    let tElev = clamp(input.elevation / 8848.0, 0.0, 1.0);
    let cLowland = select(vec3<f32>(0.95, 0.96, 0.94), vec3<f32>(0.11, 0.14, 0.18), isDark);
    let cMidland = select(vec3<f32>(0.82, 0.84, 0.86), vec3<f32>(0.28, 0.32, 0.38), isDark);
    let cAlpine  = select(vec3<f32>(0.52, 0.55, 0.60), vec3<f32>(0.58, 0.62, 0.68), isDark);
    let cSummit  = select(vec3<f32>(0.16, 0.18, 0.22), vec3<f32>(0.92, 0.90, 0.86), isDark);

    let tLow = smoothstep(0.0, 0.35, tElev);
    let tMid = smoothstep(0.35, 0.70, tElev);
    let tHigh = smoothstep(0.70, 0.95, tElev);
    let cRamp = mix(mix(mix(cLowland, cMidland, tLow), cAlpine, tMid), cSummit, tHigh);

    let finalLand = mix(cRamp * diffuseTotal, cRockShaded, rockWeight);
    return vec4<f32>(finalLand, 1.0);
}
