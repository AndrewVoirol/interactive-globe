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
// NOAA GFS Grid Layout:
// U: 0° (Greenwich) to 360°, V: +90° (North Pole, y=0) to -90° (South Pole, y=180)
fn sampleVelocity(lonRad: f32, latRad: f32, isJet: bool) -> vec2<f32> {
    let uCoord = fract(lonRad / TWO_PI);
    let vCoord = clamp((PI * 0.5 - latRad) / PI, 0.001, 0.999);
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

    // Planar flat position (Mercator matching terrain manifold)
    let clampedLat = clamp(latRad, -1.4835, 1.4835);
    let mercatorY = log(tan(PI * 0.25 + clampedLat * 0.5)) * RADIUS;
    let mercatorX = lonRad * RADIUS;
    let p2D = vec3<f32>(mercatorX, mercatorY, altOffset);

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

    // If layer is disabled, zero out history alpha so particles do not render
    if (layerEnabled < 0.5) {
        pOut = pIn;
        pOut.history0.w = 0.0;
        pOut.history1.w = 0.0;
        pOut.history2.w = 0.0;
        pOut.history3.w = 0.0;
        particlesOut[index] = pOut;
        return;
    }

    var lon = pIn.pos.x;
    var lat = pIn.pos.y;
    let alt = select(0.04, 0.22, isJetStream); // Surface hugs terrain (+0.04), Jet stream floats (+0.22)
    var age = pIn.pos.w;

    let dt = sim.u_deltaTime * sim.u_speedMultiplier;
    // Lifespan of ~550-800 frames (~4.5 - 7.0 seconds at 120 FPS) prevents rapid popping static
    let ageIncrement = select(0.0018, 0.0012, isJetStream);

    // Check if particle should respawn
    let shouldRespawn = age >= 1.0 || (lon != lon) || (lat != lat) || abs(lat) > (PI * 0.495);

    if (shouldRespawn) {
        // Spawn at randomized geographic position
        let seed = vec2<f32>(f32(index), sim.u_time * 0.31 + f32(index) * 0.17);
        let rnd = hash21(seed.x * 12.9898 + seed.y * 78.233);

        lon = (rnd.x * 2.0 - 1.0) * PI; // -PI to +PI
        // Latitude weighted across subtropical and polar jet streams
        if (isJetStream) {
            let latSign = select(-1.0, 1.0, rnd.y > 0.5);
            let isPolar = fract(rnd.y * 4.7) > 0.45;
            let jetFrac = select(0.14 + fract(rnd.y * 2.7) * 0.08, 0.26 + fract(rnd.y * 2.7) * 0.12, isPolar); // 25°-40° or 47°-68°
            lat = latSign * (PI * jetFrac);
        } else {
            lat = (rnd.y * 2.0 - 1.0) * (PI * 0.46);
        }
        age = fract(rnd.x * 3.7) * 0.4; // Stagger initial ages with headroom for smooth fade-in
    } else {
        // 2nd-Order Runge-Kutta (RK2) Advection forward in time
        let v0 = sampleVelocity(lon, lat, isJetStream);
        let simScale = select(6000.0, 10000.0, isJetStream);
        let cosLat = max(0.05, cos(lat));

        let dLon0 = (v0.x * dt * simScale / EARTH_RADIUS) / cosLat;
        let dLat0 = (v0.y * dt * simScale / EARTH_RADIUS);

        // Midpoint evaluation
        let lonMid = lon + dLon0 * 0.5;
        let latMid = clamp(lat + dLat0 * 0.5, -PI * 0.49, PI * 0.49);
        let vMid = sampleVelocity(lonMid, latMid, isJetStream);

        let dLon1 = (vMid.x * dt * simScale / EARTH_RADIUS) / max(0.05, cos(latMid));
        let dLat1 = (vMid.y * dt * simScale / EARTH_RADIUS);

        lon = lon + dLon1;
        if (lon > PI) { lon = lon - TWO_PI; }
        if (lon < -PI) { lon = lon + TWO_PI; }

        lat = clamp(lat + dLat1, -PI * 0.49, PI * 0.49);
        age = age + ageIncrement;
    }

    let currentVel = sampleVelocity(lon, lat, isJetStream);
    let speed = length(currentVel);

    // Calculate fade alpha: smooth fade in at birth, fade out at end of life
    let fadeIn = smoothstep(0.0, 0.12, age);
    let fadeOut = 1.0 - smoothstep(0.85, 1.0, age);
    let alpha = fadeIn * fadeOut;

    let worldPos0 = evaluateManifoldPosition(lon, lat, alt, sim.u_mode, sim.u_unfurl);

    // Dynamic physical streamline step length (in geographic radians) scaled with wind velocity
    // Surface winds: fine, short filament steps (0.012 rad)
    // Jet stream: long, continuous atmospheric river sweeps (0.046 rad)
    let baseStep = select(0.012, 0.046, isJetStream);
    let speedNorm = select(10.0, 32.0, isJetStream);
    let speedFactor = clamp(speed / speedNorm, select(0.5, 0.8, isJetStream), select(1.7, 2.6, isJetStream));
    let stepLen = baseStep * speedFactor;

    // Backward streamline integration (instantaneous streamline curve)
    // Step 0 -> 1
    let dir0 = currentVel / max(speed, 0.01);
    let cosLat0 = max(0.08, cos(lat));
    var lon1 = lon - (dir0.x * stepLen) / cosLat0;
    if (lon1 > PI) { lon1 = lon1 - TWO_PI; }
    if (lon1 < -PI) { lon1 = lon1 + TWO_PI; }
    let lat1 = clamp(lat - dir0.y * stepLen, -PI * 0.49, PI * 0.49);
    let worldPos1 = evaluateManifoldPosition(lon1, lat1, alt, sim.u_mode, sim.u_unfurl);

    // Step 1 -> 2
    let v1 = sampleVelocity(lon1, lat1, isJetStream);
    let s1 = max(length(v1), 0.01);
    let dir1 = v1 / s1;
    let cosLat1 = max(0.08, cos(lat1));
    var lon2 = lon1 - (dir1.x * stepLen) / cosLat1;
    if (lon2 > PI) { lon2 = lon2 - TWO_PI; }
    if (lon2 < -PI) { lon2 = lon2 + TWO_PI; }
    let lat2 = clamp(lat1 - dir1.y * stepLen, -PI * 0.49, PI * 0.49);
    let worldPos2 = evaluateManifoldPosition(lon2, lat2, alt, sim.u_mode, sim.u_unfurl);

    // Step 2 -> 3
    let v2 = sampleVelocity(lon2, lat2, isJetStream);
    let s2 = max(length(v2), 0.01);
    let dir2 = v2 / s2;
    let cosLat2 = max(0.08, cos(lat2));
    var lon3 = lon2 - (dir2.x * stepLen) / cosLat2;
    if (lon3 > PI) { lon3 = lon3 - TWO_PI; }
    if (lon3 < -PI) { lon3 = lon3 + TWO_PI; }
    let lat3 = clamp(lat2 - dir2.y * stepLen, -PI * 0.49, PI * 0.49);
    let worldPos3 = evaluateManifoldPosition(lon3, lat3, alt, sim.u_mode, sim.u_unfurl);

    // Jet stream retains high segment alpha to form continuous fluid ribbons;
    // Surface winds decay more rapidly for delicate localized filaments.
    let a1 = select(0.68, 0.90, isJetStream);
    let a2 = select(0.38, 0.74, isJetStream);
    let a3 = select(0.12, 0.52, isJetStream);

    pOut.pos = vec4<f32>(lon, lat, alt, age);
    pOut.vel = vec4<f32>(currentVel.x, currentVel.y, 0.0, speed);
    pOut.history0 = vec4<f32>(worldPos0, alpha * 1.00);
    pOut.history1 = vec4<f32>(worldPos1, alpha * a1);
    pOut.history2 = vec4<f32>(worldPos2, alpha * a2);
    pOut.history3 = vec4<f32>(worldPos3, alpha * a3);

    particlesOut[index] = pOut;
}
