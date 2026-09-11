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
    u_displacementScale: f32,
    u_peakExponent: f32,
    u_pad1: f32,
    u_pad2: f32,
    u_cameraPos: vec4<f32>,
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
@group(0) @binding(6) var u_demSampler: sampler;
@group(0) @binding(7) var u_demTexture: texture_2d<f32>;
@group(0) @binding(8) var u_regionalDEMTexture: texture_2d<f32>;

struct RegionalOverlayUniforms {
    u_regionalBounds: vec4<f32>,
    u_pad0: vec4<f32>,
    u_pad1: vec4<f32>,
    u_regionalActive: u32,
    u_pad2: u32,
    u_pad3: u32,
    u_pad4: u32,
};

@group(0) @binding(9) var<uniform> u_regionalOverlay: RegionalOverlayUniforms;

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

fn getRegionalBlendWeight(uv: vec2<f32>) -> f32 {
    if (u_regionalOverlay.u_regionalActive == 0u) {
        return 0.0;
    }

    let bounds = u_regionalOverlay.u_regionalBounds;
    let minLon = bounds.x;
    let minLat = bounds.y;
    let maxLon = bounds.z;
    let maxLat = bounds.w;

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

    let regSample = textureSampleLevel(u_regionalDEMTexture, u_demSampler, vec2<f32>(regU, regV), 0.0);
    return mix(globalSample, regSample, weight);
}

// Unpack DEM elevation at equirectangular coordinates
fn sampleTerrainElevation(lonRad: f32, latRad: f32) -> f32 {
    let u = fract(lonRad / TWO_PI + 0.5);
    let v = clamp(0.5 - latRad / PI, 0.001, 0.999);
    let demSampleGlobal = textureSampleLevel(u_demTexture, u_demSampler, vec2<f32>(u, v), 0.0);
    let sample = sampleRegionalComposite(vec2<f32>(u, v), demSampleGlobal, 0.0);
    // Invariant §15: Cross-Pipeline DEM Mathematical Parity
    let elevMeters = sample.a * 19772.0 - 10924.0;
    // For wind particles, ensure we don't return negative elevation (clip to sea level)
    return max(0.0, elevMeters);
}

struct TerrainSample {
    elevation: f32,
    gradient: vec2<f32>,
};

fn sampleTerrain(lonRad: f32, latRad: f32) -> TerrainSample {
    let demDims = vec2<f32>(textureDimensions(u_demTexture));
    let dLon = TWO_PI / max(demDims.x, 1.0);
    let dLat = PI / max(demDims.y, 1.0);

    let hCenter = sampleTerrainElevation(lonRad, latRad);
    let hEast   = sampleTerrainElevation(lonRad + dLon, latRad);
    let hWest   = sampleTerrainElevation(lonRad - dLon, latRad);
    let hNorth  = sampleTerrainElevation(lonRad, clamp(latRad + dLat, -PI * 0.495, PI * 0.495));
    let hSouth  = sampleTerrainElevation(lonRad, clamp(latRad - dLat, -PI * 0.495, PI * 0.495));

    // Spherical metric arc lengths (Invariant §18):
    // dx = 2 * R_E * cos(lat) * dLon
    // dy = 2 * R_E * dLat
    let cosLat = max(0.05, cos(latRad));
    let dx = 2.0 * EARTH_RADIUS * cosLat * dLon;
    let dy = 2.0 * EARTH_RADIUS * dLat;

    var res: TerrainSample;
    res.elevation = hCenter;
    res.gradient = vec2<f32>((hEast - hWest) / dx, (hNorth - hSouth) / dy);
    return res;
}

// Sample wind velocity vector (u, v in m/s) at geographic coordinates
// NOAA GFS Grid Layout:
// U: 0° (Greenwich) to 360°, V: +90° (North Pole, y=0) to -90° (South Pole, y=180)
// Spec §2.2: Topographic Barrier Wind Deflection & Kinetic Energy Speed Conservation
fn sampleVelocity(lonRad: f32, latRad: f32, isJet: bool) -> vec2<f32> {
    let uCoord = fract(lonRad / TWO_PI);
    let vCoord = clamp((PI * 0.5 - latRad) / PI, 0.001, 0.999);
    let uv = vec2<f32>(uCoord, vCoord);
    if (isJet) {
        // Upper troposphere jet stream at 250 hPa (~10.5 km) bypasses surface topography
        return textureSampleLevel(u_jetTexture, u_windSampler, uv, 0.0).xy;
    }

    let rawVel = textureSampleLevel(u_windTexture, u_windSampler, uv, 0.0).xy;

    // Evaluate surface terrain elevation and spherical metric gradient
    let terrain = sampleTerrain(lonRad, latRad);
    let gradMag = length(terrain.gradient);
    let slopeNormal = terrain.gradient / max(gradMag, 1e-6);

    // Apply barrier deflection if over elevated terrain and steep slope
    if (terrain.elevation > 0.0 && gradMag > 1e-5) {
        let d = dot(rawVel, slopeNormal);
        if (d > 0.0) {
            // Deflect upslope barrier flow by 75% (Spec §2.2)
            let uDeflected = rawVel - 0.75 * d * slopeNormal;
            // Mechanic 3: Along-contour valley funneling vector steer
            let tContour = vec2<f32>(-slopeNormal.y, slopeNormal.x);
            let crossZ = rawVel.x * slopeNormal.y - rawVel.y * slopeNormal.x;
            let steerSign = select(-1.0, 1.0, crossZ >= 0.0);
            let rawSpeed = length(rawVel);
            let uSteered = uDeflected + 0.25 * steerSign * tContour * rawSpeed;
            let defSpeed = length(uSteered);
            // Baseline kinetic energy conservation: return select(uDeflected, uDeflected * (rawSpeed / max(defSpeed, 1e-6)), rawSpeed > 1e-5 && defSpeed > 1e-6);
            return select(uSteered, uSteered * (rawSpeed / max(defSpeed, 1e-6)), rawSpeed > 1e-5 && defSpeed > 1e-6);
        }
    }

    return rawVel;
}

fn computeLiftedAltitude(lonRad: f32, latRad: f32, vel: vec2<f32>, isJet: bool) -> f32 {
    let t = sampleTerrain(lonRad, latRad);
    let wOrographic = dot(vel, t.gradient);
    
    let normH = max(0.0, t.elevation) / 8848.0;
    let camDist = length(sim.u_cameraPos.xyz);
    let orbitT = clamp((camDist - 8.0) / (25.0 - 8.0), 0.0, 1.0);
    let dynamicExp = mix(1.0, 1.8, orbitT) * (max(0.5, sim.u_peakExponent) / 1.4);
    
    let poleDist = abs(clamp(0.5 - latRad / PI, 0.001, 0.999) - 0.5) * 2.0;
    let poleAtten = 1.0 - smoothstep(0.85, 0.98, poleDist);
    
    let terrainDisp = pow(normH, max(0.5, dynamicExp)) * (sim.u_displacementScale * 2.8) * poleAtten;
    
    // Pitch-adaptive horizon standoff exaggeration for Jet Stream (RFC Mechanic 2)
    let cosLat = cos(latRad);
    let sinLat = sin(latRad);
    let cosLon = cos(lonRad);
    let sinLon = sin(lonRad);
    let normal = vec3<f32>(cosLat * sinLon, sinLat, cosLat * cosLon);
    let basePos = normal * RADIUS;
    let vCam = normalize(sim.u_cameraPos.xyz - basePos);
    let NdotV = clamp(dot(normal, vCam) / 0.35, 0.0, 1.0);
    let k_exagg = 1.0 + 9.0 * ((1.0 - NdotV) * (1.0 - NdotV));

    let baseAlt = select(0.0005, 0.0065 * k_exagg, isJet);
    let lift = select(
        terrainDisp + clamp(wOrographic * 0.005, 0.0, 0.035),
        terrainDisp + clamp(wOrographic * 0.002, -0.005, 0.010),
        isJet
    );
    return baseAlt + lift;
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

    // Orographic vertical velocity w = u_h · ∇h (in m/s) and terrain-lifted altitude
    let t0 = sampleTerrain(lon, lat);
    let wOrographic = dot(currentVel, t0.gradient);
    let alt0 = computeLiftedAltitude(lon, lat, currentVel, isJetStream);

    // Calculate fade alpha: smooth fade in at birth, fade out at end of life
    let fadeIn = smoothstep(0.0, 0.12, age);
    let fadeOut = 1.0 - smoothstep(0.85, 1.0, age);
    let alpha = fadeIn * fadeOut;

    let worldPos0 = evaluateManifoldPosition(lon, lat, alt0, sim.u_mode, sim.u_unfurl);

    // Dynamic physical streamline step length (in geographic radians) scaled with wind velocity
    // Surface winds: fine filament steps (0.020 rad) for crisp streamline continuity
    // Jet stream: long, continuous atmospheric river sweeps (0.046 rad)
    let baseStep = select(0.020, 0.046, isJetStream);
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
    let v1 = sampleVelocity(lon1, lat1, isJetStream);
    let alt1 = computeLiftedAltitude(lon1, lat1, v1, isJetStream);
    let worldPos1 = evaluateManifoldPosition(lon1, lat1, alt1, sim.u_mode, sim.u_unfurl);

    // Step 1 -> 2
    let s1 = max(length(v1), 0.01);
    let dir1 = v1 / s1;
    let cosLat1 = max(0.08, cos(lat1));
    var lon2 = lon1 - (dir1.x * stepLen) / cosLat1;
    if (lon2 > PI) { lon2 = lon2 - TWO_PI; }
    if (lon2 < -PI) { lon2 = lon2 + TWO_PI; }
    let lat2 = clamp(lat1 - dir1.y * stepLen, -PI * 0.49, PI * 0.49);
    let v2 = sampleVelocity(lon2, lat2, isJetStream);
    let alt2 = computeLiftedAltitude(lon2, lat2, v2, isJetStream);
    let worldPos2 = evaluateManifoldPosition(lon2, lat2, alt2, sim.u_mode, sim.u_unfurl);

    // Step 2 -> 3
    let s2 = max(length(v2), 0.01);
    let dir2 = v2 / s2;
    let cosLat2 = max(0.08, cos(lat2));
    var lon3 = lon2 - (dir2.x * stepLen) / cosLat2;
    if (lon3 > PI) { lon3 = lon3 - TWO_PI; }
    if (lon3 < -PI) { lon3 = lon3 + TWO_PI; }
    let lat3 = clamp(lat2 - dir2.y * stepLen, -PI * 0.49, PI * 0.49);
    let v3 = sampleVelocity(lon3, lat3, isJetStream);
    let alt3 = computeLiftedAltitude(lon3, lat3, v3, isJetStream);
    let worldPos3 = evaluateManifoldPosition(lon3, lat3, alt3, sim.u_mode, sim.u_unfurl);

    // Jet stream retains high segment alpha to form continuous fluid ribbons;
    // Surface winds retain balanced alpha for clearly defined streamlines without noise.
    let a1 = select(0.76, 0.90, isJetStream);
    let a2 = select(0.50, 0.74, isJetStream);
    let a3 = select(0.25, 0.52, isJetStream);

    pOut.pos = vec4<f32>(lon, lat, alt0, age);
    pOut.vel = vec4<f32>(currentVel.x, currentVel.y, wOrographic, speed);
    pOut.history0 = vec4<f32>(worldPos0, alpha * 1.00);
    pOut.history1 = vec4<f32>(worldPos1, alpha * a1);
    pOut.history2 = vec4<f32>(worldPos2, alpha * a2);
    pOut.history3 = vec4<f32>(worldPos3, alpha * a3);

    particlesOut[index] = pOut;
}
