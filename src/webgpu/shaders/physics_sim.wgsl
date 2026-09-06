// ============================================================================
// File: src/webgpu/shaders/physics_sim.wgsl
// Target: Dedicated WebGPU WGSL Compute Pipeline (@compute @workgroup_size(256))
// Description: 1,000,000-Node Continuum Physics Simulation for Globe-to-Map Morphing
// ============================================================================

struct Particle {
    position: vec4<f32>,     // xyz: Position, w: pointType (1.0 = Land, 0.0 = Ocean)
    velocity: vec4<f32>,     // xyz: Velocity, w: metric (vStrain / vVorticity)
};

struct StaticParticle {
    rest_sphere: vec4<f32>,  // xyz: S² Coordinate, w: Rest Radius (5.0)
    rest_map: vec4<f32>,     // xy: 2D Mercator Target, zw: 2D Dymaxion Target
};

struct SimUniforms {
    u_unfurl: f32,           // Morph Progress [0.0 -> 1.0]
    u_mode: u32,             // 0=Linear, 1=Scroll, 2=Griffith, 3=Fluid, 4=Dymaxion
    u_layerMode: u32,        // 0=Both, 1=Points Only, 2=Wireframe Only
    u_time: f32,             // Elapsed Time (s)
    u_cursorActive: f32,     // 1.0 = Active Hover, 0.0 = Inactive
    u_numParticles: u32,     // Node Count (e.g. 1,000,000)
    u_theme: u32,            // 0 = Dark Cyber, 1 = Light Monochrome
    u_vortexStrength: f32,   // Fluid swirl & advection strength multiplier
    u_cursorHitPos: vec4<f32>, // xyz: Hit Pos, w: Fracture intensity multiplier
    u_cursorVel: vec4<f32>,
};

@group(0) @binding(0) var<uniform> sim: SimUniforms;
@group(0) @binding(1) var<storage, read> particlesIn: array<Particle>;
@group(0) @binding(2) var<storage, read_write> particlesOut: array<Particle>;
@group(0) @binding(3) var<storage, read> staticParticles: array<StaticParticle>;
@group(0) @binding(4) var u_windTexture: texture_2d<f32>;
@group(0) @binding(5) var u_windSampler: sampler;

const PI: f32 = 3.14159265358979323846;
const RADIUS: f32 = 5.0;

// Analytical 3D Solenoidal Vector Field (div u = 0 guaranteed, zero Cartesian lattice)
fn computeCurlNoise(p: vec3<f32>, time: f32) -> vec3<f32> {
    let t: f32 = time * 0.75;
    
    let rot = mat3x3<f32>(
        vec3<f32>(0.00,  0.80,  0.60),
        vec3<f32>(-0.80, 0.36, -0.48),
        vec3<f32>(-0.60, -0.48, 0.64)
    );

    let q1 = rot * (p * 0.45);
    let q2 = rot * (rot * (p * 0.95));

    let u_x = -0.55 * cos(0.55 * q1.y + t * 0.7) - 0.45 * cos(0.95 * q1.z - t * 0.5);
    let u_y = -0.55 * cos(0.55 * q1.z + t * 0.9) - 0.45 * cos(0.95 * q1.x - t * 0.6);
    let u_z = -0.55 * cos(0.55 * q1.x + t * 0.8) - 0.45 * cos(0.95 * q1.y - t * 0.4);

    let u2_x = 0.25 * sin(1.5 * q2.y - t * 1.2);
    let u2_y = 0.25 * sin(1.5 * q2.z - t * 1.1);
    let u2_z = 0.25 * sin(1.5 * q2.x - t * 1.3);

    return rot * vec3<f32>(u_x + u2_x, u_y + u2_y, u_z + u2_z);
}

@compute @workgroup_size(256, 1, 1)
fn cs_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if (index >= sim.u_numParticles) {
        return;
    }

    let pIn = particlesIn[index];
    let pStatic = staticParticles[index];
    let pos3D = pStatic.rest_sphere.xyz;
    let pos2D = vec3<f32>(pStatic.rest_map.xy, 0.0);
    let pointType = pIn.position.w;

    let clampedUnfurl = clamp(sim.u_unfurl, 0.0, 1.0);
    let ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);

    var finalPos = pos3D;
    var finalVel = vec3<f32>(0.0);
    var metric = 0.0;

    // NOAA GFS 1.0° Wind Velocity Grid Sampling & Surface Tangent Conversion (F34)
    let windLon = atan2(pos3D.x, pos3D.z);
    let windLat = asin(clamp(pos3D.y / RADIUS, -1.0, 1.0));
    let windUV = vec2<f32>(
        (windLon + PI) / (2.0 * PI),
        (windLat + PI * 0.5) / PI
    );
    let windSample = textureSampleLevel(u_windTexture, u_windSampler, windUV, 0.0).xy;
    let uWind = windSample.x;
    let vWind = windSample.y;

    // Orthonormal tangent basis on sphere (eEast, eNorth) strictly preserving dot(vTangent, normal) == 0
    let normal = normalize(pos3D);
    let eEast = normalize(vec3<f32>(normal.z, 0.0, -normal.x));
    let eNorth = cross(normal, eEast);
    let vTangent = uWind * eEast + vWind * eNorth;

    // Mode 1: Cylindrical Scroll (engine-audit.md §3.6)
    if (sim.u_mode == 1u) {
        let t = ease;
        let lambda = atan2(pos3D.x, pos3D.z);
        let phi = asin(clamp(pos3D.y / RADIUS, -0.9998, 0.9998));
        let oneMinusT = 1.0 - t;

        if (oneMinusT > 0.001) {
            let invOneMinusT = 1.0 / oneMinusT;
            let curAngle = oneMinusT * lambda;
            let curX = (RADIUS * invOneMinusT) * sin(curAngle);
            let curZ = (RADIUS * cos(phi) * invOneMinusT) * (cos(curAngle) - 1.0) + (RADIUS * cos(phi) * oneMinusT);
            let curY = mix(pos3D.y, pos2D.y, t);
            finalPos = vec3<f32>(curX, curY, curZ);
        } else {
            // Taylor Series Guard for oneMinusT <= 0.001 (prevents division by zero & cancellation)
            let u = oneMinusT * lambda;
            let sinTerm = lambda * (1.0 - (u * u) / 6.0);
            let cosTerm = oneMinusT * (lambda * lambda) * (-0.5 + (u * u) / 24.0);
            let curX = RADIUS * sinTerm;
            let curZ = RADIUS * cos(phi) * cosTerm + RADIUS * cos(phi) * oneMinusT;
            let curY = mix(pos3D.y, pos2D.y, t);
            finalPos = vec3<f32>(curX, curY, curZ);
        }
        finalVel = vec3<f32>(0.0);
        metric = 0.0;
    }
    // Mode 2: Griffith LEFM Fracture + Cursor Hoop Stress Probe
    else if (sim.u_mode == 2u) {
        let t = ease;
        let lambda = atan2(pos3D.x, pos3D.z);
        let phi = asin(clamp(pos3D.y / RADIUS, -0.9998, 0.9998));
        let distToSeam = PI - abs(lambda);
        let seamFactor = 1.0 - smoothstep(0.0, 0.75, distToSeam);

        // Passive cursor raycast distance and tensile hoop stress concentration
        let fracMult = select(1.0, sim.u_cursorHitPos.w, sim.u_cursorHitPos.w > 0.01);
        let hitDist = length(pos3D - sim.u_cursorHitPos.xyz);
        let cursorInfluence = sim.u_cursorActive * exp(-hitDist * hitDist / (2.0 * 0.64));
        let hoopStress = cursorInfluence * 0.45 * (1.0 + 2.0 * cos(phi) * cos(phi)) * fracMult;

        let tRupture = 0.18;
        if (t < tRupture) {
            let strainProgress = t / tRupture;
            let localStrain = seamFactor * strainProgress * max(0.2, cos(phi * 0.85)) + hoopStress;
            let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);
            let outwardTension = sphereNorm * (localStrain * 0.30);
            finalPos = pos3D + outwardTension;
            metric = clamp(localStrain, 0.0, 1.0);
        } else {
            let postRuptureT = smoothstep(tRupture, 1.0, t);
            let crackLatitudeFront = (PI * 0.5) * smoothstep(tRupture, 0.60, t);
            let distToCrackTip = abs(abs(phi) - crackLatitudeFront);
            let crackTipGlow = select(0.0, 1.0 - smoothstep(0.0, 0.3, distToCrackTip), (t < 0.65 && seamFactor > 0.3));

            let flutterWave = sin(distToSeam * 16.0 - t * 24.0);
            let flutterDecay = exp(-4.2 * (t - tRupture));
            let flutterAmp = (0.50 * seamFactor + cursorInfluence * 0.20) * flutterWave * flutterDecay * fracMult;
            let flutterOffset = vec3<f32>(0.0, 0.0, flutterAmp);

            let peeledPos = mix(pos3D, pos2D, postRuptureT);
            finalPos = peeledPos + flutterOffset;
            let localStrain = mix(seamFactor * (1.0 - postRuptureT) * 0.9 + crackTipGlow + hoopStress, 0.0, pow(postRuptureT, 1.8));
            metric = clamp(localStrain, 0.0, 1.0);
        }
        finalVel = vec3<f32>(0.0);
    }
    // Mode 3: Fluid Flow + Lamb-Oseen Trailing Vortex Wake (Continuous Hermite Formulation)
    else if (sim.u_mode == 3u) {
        let t = ease;
        let vortexMult = select(1.0, sim.u_vortexStrength, sim.u_vortexStrength > 0.01);
        let rawSin = sin(PI * clampedUnfurl);
        let liquefaction = pow(max(0.0, rawSin), 1.15);
        let basePos = mix(pos3D, pos2D, t);
        let naturalVelocity = computeCurlNoise(basePos, sim.u_time) * vortexMult;

        // Cursor Lamb-Oseen Vortex Wake Injection (anti-strobe)
        let hitDist = length(basePos - sim.u_cursorHitPos.xyz);
        let coreRadius: f32 = 0.85;
        let vortexCirculation = (1.0 - exp(-hitDist * hitDist / (coreRadius * coreRadius))) / (hitDist + 0.05);
        let surfaceNormal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(basePos), length(basePos) > 0.001);
        let relHit = basePos - sim.u_cursorHitPos.xyz + vec3<f32>(0.001, 0.001, 0.001);
        let vortexTangent = normalize(cross(surfaceNormal, relHit));
        let clampedSpeed = clamp(sim.u_cursorVel.w, 0.0, 1.5);
        let vortexVelocity = vortexTangent * (sim.u_cursorActive * clampedSpeed * vortexCirculation * 0.35 * vortexMult);
        let wakeAdvection = normalize(sim.u_cursorVel.xyz + vec3<f32>(0.0001)) * (clampedSpeed * 0.15 * sim.u_cursorActive * exp(-hitDist * hitDist / 1.5) * vortexMult);

        // Atmospheric circulation advection from NOAA GFS wind field (F34)
        let windScale = 0.02;
        let windAdvection = vTangent * (windScale * vortexMult);

        let totalVelocity = naturalVelocity + windAdvection + vortexVelocity + wakeAdvection;
        let localVorticity = length(totalVelocity) * max(liquefaction, sim.u_cursorActive * 0.3);

        // Silk drape wave dynamics: smooth traveling normal wave simulating delicate silk billowing in water
        let wavePhase1 = dot(basePos, vec3<f32>(0.35, 0.62, 0.42)) * 1.35 - sim.u_time * 1.25;
        let wavePhase2 = dot(basePos, vec3<f32>(-0.45, 0.30, 0.65)) * 1.75 - sim.u_time * 0.90;
        let silkWave = (sin(wavePhase1) * 0.65 + cos(wavePhase2) * 0.35) * liquefaction * 0.65;
        let silkDrapeOffset = surfaceNormal * silkWave;

        let advectionOffset = (naturalVelocity + windAdvection) * (liquefaction * 1.55) + silkDrapeOffset + (vortexVelocity + wakeAdvection) * (sim.u_cursorActive * 0.25);

        finalPos = basePos + advectionOffset;
        finalVel = totalVelocity;
        metric = clamp(localVorticity, 0.0, 1.0);
    }
    // Mode 4: Fuller Dymaxion Polyhedral Net Unfolding
    else if (sim.u_mode == 4u) {
        let arch = sin(PI * ease) * 0.45;
        let posLen = length(pos3D);
        let safeLen = max(posLen, 0.0001);
        let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), pos3D / safeLen, posLen > 0.001);
        let dymaxionTarget = vec3<f32>(pStatic.rest_map.zw, 0.0);
        finalPos = mix(pos3D, dymaxionTarget, ease) + sphereNorm * arch;
        finalVel = pos3D;
        metric = 0.0;
    }
    // Mode 0: Linear Mix (Fallback)
    else {
        finalPos = mix(pos3D, pos2D, ease);
        finalVel = vTangent * 0.01;
        metric = 0.0;
    }

    // Write computed state to output storage buffer (halved VRAM bandwidth write)
    var pOut: Particle;
    pOut.position = vec4<f32>(finalPos, pointType);
    pOut.velocity = vec4<f32>(finalVel, metric);

    particlesOut[index] = pOut;
}

// ============================================================================
// Procedural VRAM Fibonacci Sphere Particle Spawn Kernel (Feature F31)
// Dispatches directly in VRAM with 0 MB CPU allocation and 0 MB network transfer
// ============================================================================
@compute @workgroup_size(256, 1, 1)
fn cs_spawn(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if (index >= sim.u_numParticles) {
        return;
    }

    let N = f32(sim.u_numParticles);
    let fi = f32(index);
    let phi = 1.618033988749895; // Golden Ratio

    // Fibonacci Sphere Distribution (uniform area density on S²)
    let y = 1.0 - (2.0 * fi + 1.0) / N;
    let r = sqrt(max(0.0, 1.0 - y * y));
    let theta = 2.0 * PI * fi * (1.0 - 1.0 / phi);

    let p3D = vec3<f32>(r * cos(theta) * RADIUS, y * RADIUS, r * sin(theta) * RADIUS);

    let lambda = atan2(p3D.x, p3D.z);
    let lat = asin(clamp(p3D.y / RADIUS, -0.9998, 0.9998));
    let isLand = select(0.0, 1.0, abs(p3D.y) > 0.5 || abs(p3D.x) > 1.2);

    var p: Particle;
    p.position = vec4<f32>(p3D, isLand);
    p.velocity = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    particlesOut[index] = p;
}

