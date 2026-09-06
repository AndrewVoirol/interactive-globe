// ============================================================================
// File: src/webgpu/shaders/wind_particles.wgsl
// Target: WebGPU Compute Pipeline (Particle Advection & History Ring Buffer)
// Description: Advects 65,536 wind particles (Surface + Jet Stream strata) via RK2
//              integration against NOAA GFS velocity fields and records manifold-anchored
//              3D world position history for vector ribbon extrusion.
// ============================================================================

const PI: f32 = 3.141592653589793;
const TWO_PI: f32 = 6.283185307179586;
const RADIUS: f32 = 5.0; // Base manifold radius
const EARTH_RADIUS: f32 = 6371000.0;

struct WindSimUniforms {
    u_unfurl: f32,
    u_mode: u32,
    u_time: f32,
    u_deltaTime: f32,
    u_numParticles: u32,
    u_speedMultiplier: f32,
    u_showSurfaceWinds: f32,
    u_showJetStream: f32,
};

struct WindParticle {
    pos: vec4<f32>,      // x: lonRad, y: latRad, z: altitudeOffset, w: normalizedAge [0..1]
    vel: vec4<f32>,      // x: uMps, y: vMps, z: wMps, w: speedMagnitude
    history0: vec4<f32>, // xyz: worldPos 0 (newest), w: alpha
    history1: vec4<f32>, // xyz: worldPos 1, w: alpha
    history2: vec4<f32>, // xyz: worldPos 2, w: alpha
    history3: vec4<f32>, // xyz: worldPos 3 (oldest), w: alpha
};

@group(0) @binding(0) var<uniform> sim: WindSimUniforms;
@group(0) @binding(1) var<storage, read> particlesIn: array<WindParticle>;
@group(0) @binding(2) var<storage, read_write> particlesOut: array<WindParticle>;
@group(0) @binding(3) var u_windSampler: sampler;
@group(0) @binding(4) var u_windTexture: texture_2d<f32>;
@group(0) @binding(5) var u_jetTexture: texture_2d<f32>;

// Deterministic fast hash for particle respawning
fn hash12(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

fn hash21(p: f32) -> vec2<f32> {
    var p3 = fract(vec3<f32>(p) * vec3<f32>(0.1031, 0.1030, 0.0973));
    p3 = p3 + dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

// Sample wind velocity vector (u, v in m/s) at geographic coordinates
fn sampleVelocity(lonRad: f32, latRad: f32, isJet: bool) -> vec2<f32> {
    let uCoord = fract((lonRad + PI) / TWO_PI);
    let vCoord = clamp((latRad + PI * 0.5) / PI, 0.001, 0.999);
    let uv = vec2<f32>(uCoord, vCoord);
    if (isJet) {
        return textureSampleLevel(u_jetTexture, u_windSampler, uv, 0.0).xy;
    } else {
        return textureSampleLevel(u_windTexture, u_windSampler, uv, 0.0).xy;
    }
}

// Evaluates 3D world position across Indicatrix's 5 morphing paradigms
fn evaluateManifoldPosition(lonRad: f32, latRad: f32, altOffset: f32, mode: u32, unfurl: f32) -> vec3<f32> {
    let r = RADIUS + altOffset;
    let cosLat = cos(latRad);
    let sinLat = sin(latRad);
    let cosLon = cos(lonRad);
    let sinLon = sin(lonRad);

    // Spherical position
    let p3D = vec3<f32>(r * cosLat * sinLon, r * sinLat, r * cosLat * cosLon);

    // Planar flat position (Plate Carrée)
    let flatX = (lonRad / PI) * (RADIUS * PI * 0.5);
    let flatY = (latRad / (PI * 0.5)) * (RADIUS * 0.5);
    let p2D = vec3<f32>(flatX, flatY, altOffset);

    let clampedUnfurl = clamp(unfurl, 0.0, 1.0);
    let ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);

    // Mode 1: Cylindrical Scroll
    if (mode == 1u) {
        let oneMinusT = 1.0 - ease;
        if (oneMinusT > 0.001) {
            let invOneMinusT = 1.0 / oneMinusT;
            let curAngle = oneMinusT * lonRad;
            let curX = (r * invOneMinusT) * sin(curAngle);
            let curZ = (r * cosLat * invOneMinusT) * (cos(curAngle) - 1.0) + (r * cosLat * oneMinusT);
            let curY = mix(p3D.y, p2D.y, ease);
            return vec3<f32>(curX, curY, curZ);
        } else {
            return p2D;
        }
    }

    // Mode 4: Fuller Dymaxion arch interpolation
    if (mode == 4u) {
        let arch = sin(PI * ease) * 0.45;
        let safeLen = max(length(p3D), 0.0001);
        let sphereNorm = p3D / safeLen;
        return mix(p3D, p2D, ease) + sphereNorm * arch;
    }

    // Default: Mode 0 (Linear), Mode 2 (Fracture), Mode 3 (Fluid)
    return mix(p3D, p2D, ease);
}

@compute @workgroup_size(256, 1, 1)
fn cs_advect_wind(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if (index >= sim.u_numParticles) {
        return;
    }

    let pIn = particlesIn[index];
    var pOut: WindParticle;

    let halfParticles = sim.u_numParticles / 2u;
    let isJetStream = index >= halfParticles;
    let layerEnabled = select(sim.u_showSurfaceWinds, sim.u_showJetStream, isJetStream);

    // If layer is disabled, freeze particle output
    if (layerEnabled < 0.5) {
        pOut = pIn;
        particlesOut[index] = pOut;
        return;
    }

    var lon = pIn.pos.x;
    var lat = pIn.pos.y;
    var alt = select(0.04, 0.22, isJetStream); // Surface hugs terrain (+0.04), Jet stream floats (+0.22)
    var age = pIn.pos.w;

    let dt = sim.u_deltaTime * sim.u_speedMultiplier;
    let ageIncrement = select(0.008, 0.005, isJetStream); // Jet streams live longer

    // Check if particle should respawn
    let shouldRespawn = age >= 1.0 || (lon != lon) || (lat != lat) || abs(lat) > (PI * 0.495);

    if (shouldRespawn) {
        // Spawn at randomized geographic position
        let seed = vec2<f32>(f32(index), sim.u_time * 0.31 + f32(index) * 0.17);
        let rnd = hash21(seed.x * 12.9898 + seed.y * 78.233);

        lon = (rnd.x * 2.0 - 1.0) * PI; // -PI to +PI
        // Latitude weighted towards mid-latitudes for jet stream
        if (isJetStream) {
            let latSign = select(-1.0, 1.0, rnd.y > 0.5);
            lat = latSign * (PI * (0.20 + fract(rnd.y * 2.0) * 0.22)); // 36° to 75°
        } else {
            lat = (rnd.y * 2.0 - 1.0) * (PI * 0.46);
        }
        age = fract(rnd.x * 3.7); // Stagger initial ages

        let initialWorldPos = evaluateManifoldPosition(lon, lat, alt, sim.u_mode, sim.u_unfurl);
        let vel = sampleVelocity(lon, lat, isJetStream);
        let speed = length(vel);

        pOut.pos = vec4<f32>(lon, lat, alt, age);
        pOut.vel = vec4<f32>(vel.x, vel.y, 0.0, speed);
        pOut.history0 = vec4<f32>(initialWorldPos, 1.0);
        pOut.history1 = vec4<f32>(initialWorldPos, 0.75);
        pOut.history2 = vec4<f32>(initialWorldPos, 0.50);
        pOut.history3 = vec4<f32>(initialWorldPos, 0.25);

        particlesOut[index] = pOut;
        return;
    }

    // 2nd-Order Runge-Kutta (RK2) Advection
    let v0 = sampleVelocity(lon, lat, isJetStream);

    // Earth angular conversion
    // Coordinate scale factor for visual speed in simulation
    let simScale = select(3500.0, 5000.0, isJetStream);
    let cosLat = max(0.05, cos(lat));

    let dLon0 = (v0.x * dt * simScale / EARTH_RADIUS) / cosLat;
    let dLat0 = (v0.y * dt * simScale / EARTH_RADIUS);

    // Midpoint evaluation
    let lonMid = lon + dLon0 * 0.5;
    let latMid = clamp(lat + dLat0 * 0.5, -PI * 0.49, PI * 0.49);
    let vMid = sampleVelocity(lonMid, latMid, isJetStream);

    let dLon1 = (vMid.x * dt * simScale / EARTH_RADIUS) / max(0.05, cos(latMid));
    let dLat1 = (vMid.y * dt * simScale / EARTH_RADIUS);

    // Advance position
    lon = lon + dLon1;
    // Wrap longitude across antimeridian [-PI, PI]
    if (lon > PI) { lon = lon - TWO_PI; }
    if (lon < -PI) { lon = lon + TWO_PI; }

    lat = clamp(lat + dLat1, -PI * 0.49, PI * 0.49);
    age = age + ageIncrement;

    let speed = length(vMid);
    let worldPos = evaluateManifoldPosition(lon, lat, alt, sim.u_mode, sim.u_unfurl);

    // Calculate fade alpha: smooth fade in at birth, fade out at end of life
    let fadeIn = smoothstep(0.0, 0.15, age);
    let fadeOut = 1.0 - smoothstep(0.75, 1.0, age);
    let alpha = fadeIn * fadeOut;

    pOut.pos = vec4<f32>(lon, lat, alt, age);
    pOut.vel = vec4<f32>(vMid.x, vMid.y, 0.0, speed);

    // Shift history points
    pOut.history3 = pIn.history2;
    pOut.history2 = pIn.history1;
    pOut.history1 = pIn.history0;
    pOut.history0 = vec4<f32>(worldPos, alpha);

    particlesOut[index] = pOut;
}
