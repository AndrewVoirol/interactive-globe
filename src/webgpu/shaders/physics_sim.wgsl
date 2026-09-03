// ============================================================================
// File: src/webgpu/shaders/physics_sim.wgsl
// Target: Dedicated WebGPU WGSL Compute Pipeline (@compute @workgroup_size(256))
// Description: 1,000,000-Node Continuum Physics Simulation for Globe-to-Map Morphing
// ============================================================================

struct Particle {
    position: vec4<f32>,     // xyz: Position, w: pointType (1.0 = Land, 0.0 = Ocean)
    velocity: vec4<f32>,     // xyz: Velocity, w: metric (vStrain / vVorticity)
    rest_sphere: vec4<f32>,  // xyz: S² Coordinate, w: Rest Radius (5.0)
    rest_map: vec4<f32>,     // xy: 2D Mercator Target, zw: 2D Dymaxion Target
};

struct SimUniforms {
    u_unfurl: f32,           // Morph Progress [0.0 -> 1.0]
    u_mode: u32,             // 0=Linear, 1=Scroll, 2=Griffith, 3=Fluid, 4=Dymaxion
    u_layerMode: u32,        // 0=Both, 1=Points Only, 2=Wireframe Only
    u_time: f32,             // Elapsed Time (s)
    u_dt: f32,               // Timestep Delta (s)
    u_cursorActive: f32,     // 1.0 = Active Hover, 0.0 = Inactive
    u_numParticles: u32,     // Node Count (e.g. 1,000,000)
    u_pad1: f32,
    u_cursorRayOrig: vec4<f32>, // xyz: Camera Ray Origin
    u_cursorRayDir: vec4<f32>,  // xyz: Camera Ray Direction
    u_cursorHitPos: vec4<f32>,  // xyz: Unprojected Manifold Hit Point
    u_cursorVel: vec4<f32>,     // xyz: Cursor Velocity, w: Speed
    u_viewMatrix: mat4x4<f32>,
    u_projectionMatrix: mat4x4<f32>,
    u_cameraPos: vec4<f32>,
};

@group(0) @binding(0) var<uniform> sim: SimUniforms;
@group(0) @binding(1) var<storage, read> particlesIn: array<Particle>;
@group(0) @binding(2) var<storage, read_write> particlesOut: array<Particle>;

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
    let pos3D = pIn.rest_sphere.xyz;
    let pos2D = vec3<f32>(pIn.rest_map.xy, 0.0);
    let pointType = pIn.position.w;

    let clampedUnfurl = clamp(sim.u_unfurl, 0.0, 1.0);
    let ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);

    var finalPos = pos3D;
    var finalVel = vec3<f32>(0.0);
    var metric = 0.0;

    // Mode 1: Cylindrical Scroll (engine-audit.md §3.6)
    if (sim.u_mode == 1u) {
        let t = ease;
        let lambda = atan2(pos3D.x, pos3D.z);
        let phi = asin(clamp(pos3D.y / RADIUS, -1.0, 1.0));

        if (t < 0.999) {
            let invOneMinusT = 1.0 / (1.0 - t);
            let curAngle = (1.0 - t) * lambda;
            let curX = (RADIUS * invOneMinusT) * sin(curAngle);
            let curZ = (RADIUS * cos(phi) * invOneMinusT) * (cos(curAngle) - 1.0) + (RADIUS * cos(phi) * (1.0 - t));
            let curY = mix(pos3D.y, pos2D.y, t);
            finalPos = vec3<f32>(curX, curY, curZ);
        } else {
            finalPos = pos2D;
        }
        finalVel = vec3<f32>(0.0);
        metric = 0.0;
    }
    // Mode 2: Griffith LEFM Fracture + Cursor Hoop Stress Probe
    else if (sim.u_mode == 2u) {
        let t = ease;
        let lambda = atan2(pos3D.x, pos3D.z);
        let phi = asin(clamp(pos3D.y / RADIUS, -1.0, 1.0));
        let distToSeam = PI - abs(lambda);
        let seamFactor = 1.0 - smoothstep(0.0, 0.75, distToSeam);

        // Passive cursor raycast distance and tensile hoop stress concentration
        let hitDist = length(pos3D - sim.u_cursorHitPos.xyz);
        let cursorInfluence = sim.u_cursorActive * exp(-hitDist * hitDist / (2.0 * 0.64));
        let hoopStress = cursorInfluence * 0.45 * (1.0 + 2.0 * cos(phi) * cos(phi));

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
            let flutterAmp = (0.50 * seamFactor + cursorInfluence * 0.20) * flutterWave * flutterDecay;
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
        let rawSin = sin(PI * clampedUnfurl);
        let liquefaction = pow(max(0.0, rawSin), 1.15);
        let basePos = mix(pos3D, pos2D, t);
        let naturalVelocity = computeCurlNoise(basePos, sim.u_time);

        // Cursor Lamb-Oseen Vortex Wake Injection (anti-strobe)
        let hitDist = length(basePos - sim.u_cursorHitPos.xyz);
        let coreRadius: f32 = 0.85;
        let vortexCirculation = (1.0 - exp(-hitDist * hitDist / (coreRadius * coreRadius))) / (hitDist + 0.05);
        let surfaceNormal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(basePos), length(basePos) > 0.001);
        let relHit = basePos - sim.u_cursorHitPos.xyz + vec3<f32>(0.001, 0.001, 0.001);
        let vortexTangent = normalize(cross(surfaceNormal, relHit));
        let clampedSpeed = clamp(sim.u_cursorVel.w, 0.0, 1.5);
        let vortexVelocity = vortexTangent * (sim.u_cursorActive * clampedSpeed * vortexCirculation * 0.35);
        let wakeAdvection = normalize(sim.u_cursorVel.xyz + vec3<f32>(0.0001)) * (clampedSpeed * 0.15 * sim.u_cursorActive * exp(-hitDist * hitDist / 1.5));

        let totalVelocity = naturalVelocity + vortexVelocity + wakeAdvection;
        let localVorticity = length(totalVelocity) * max(liquefaction, sim.u_cursorActive * 0.3);

        // Silk drape wave dynamics: smooth traveling normal wave simulating delicate silk billowing in water
        let wavePhase1 = dot(basePos, vec3<f32>(0.35, 0.62, 0.42)) * 1.35 - sim.u_time * 1.25;
        let wavePhase2 = dot(basePos, vec3<f32>(-0.45, 0.30, 0.65)) * 1.75 - sim.u_time * 0.90;
        let silkWave = (sin(wavePhase1) * 0.65 + cos(wavePhase2) * 0.35) * liquefaction * 0.65;
        let silkDrapeOffset = surfaceNormal * silkWave;

        let advectionOffset = naturalVelocity * (liquefaction * 1.55) + silkDrapeOffset + (vortexVelocity + wakeAdvection) * (sim.u_cursorActive * 0.25);

        finalPos = basePos + advectionOffset;
        finalVel = totalVelocity;
        metric = clamp(localVorticity, 0.0, 1.0);
    }
    // Mode 4: Fuller Dymaxion Polyhedral Net Unfolding
    else if (sim.u_mode == 4u) {
        let arch = sin(PI * ease) * 0.45;
        let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);
        let dymaxionTarget = vec3<f32>(pIn.rest_map.zw, 0.0);
        finalPos = mix(pos3D, dymaxionTarget, ease) + sphereNorm * arch;
        finalVel = vec3<f32>(0.0);
        metric = 0.0;
    }
    // Mode 0: Linear Mix (Fallback)
    else {
        finalPos = mix(pos3D, pos2D, ease);
        finalVel = vec3<f32>(0.0);
        metric = 0.0;
    }

    // Write computed state to output storage buffer
    var pOut: Particle;
    pOut.position = vec4<f32>(finalPos, pointType);
    pOut.velocity = vec4<f32>(finalVel, metric);
    pOut.rest_sphere = pIn.rest_sphere;
    pOut.rest_map = pIn.rest_map;

    particlesOut[index] = pOut;
}
