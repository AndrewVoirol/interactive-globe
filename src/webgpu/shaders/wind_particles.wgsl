// ============================================================================
// File: src/webgpu/shaders/wind_particles.wgsl
// Target: WebGPU Compute Pipeline (Particle Advection & History Ring Buffer)
// Description: Advects 65,536 wind particles (Surface + Jet Stream strata) via RK2
//              integration against NOAA GFS velocity fields and records manifold-anchored
//              3D world position history for vector ribbon extrusion.
// ============================================================================

const TWO_PI: f32 = 6.283185307179586;
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
    u_verticalScaleMode: u32,
    u_particleLifetime: f32,
    u_cameraPos: vec3<f32>,
    u_tau: f32,
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
@group(0) @binding(4) var u_windTexture0: texture_2d<f32>;
@group(0) @binding(5) var u_windTexture1: texture_2d<f32>;
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
@group(0) @binding(10) var u_jetTexture: texture_2d<f32>;

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
    let uCoord = fract(lonRad / TWO_PI + 0.5);
    let vCoord = clamp((PI * 0.5 - latRad) / PI, 0.001, 0.999);
    let uv = vec2<f32>(uCoord, vCoord);
    if (isJet) {
        // Upper troposphere jet stream at 250 hPa (~10.5 km) bypasses surface topography
        return textureSampleLevel(u_jetTexture, u_windSampler, uv, 0.0).xy;
    }

    // Bilinear-temporal vector interpolation between Slot 0 and Slot 1 across ring buffer interval
    let w0 = textureSampleLevel(u_windTexture0, u_windSampler, uv, 0.0).xy;
    let w1 = textureSampleLevel(u_windTexture1, u_windSampler, uv, 0.0).xy;
    let rawVel = mix(w0, w1, clamp(sim.u_tau, 0.0, 1.0));

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
    let dynamicExp = clamp(mix(0.95, 1.25, orbitT) * (sim.u_peakExponent / 1.4), 0.85, 1.30);
    let shapedH = (1.0 - exp(-2.2 * normH)) / (1.0 - exp(-2.2));
    
    let poleDist = abs(clamp(0.5 - latRad / PI, 0.001, 0.999) - 0.5) * 2.0;
    let poleAtten = 1.0 - smoothstep(0.85, 0.98, poleDist);
    var terrainDisp = 0.0;
    let dispScale = sim.u_displacementScale * 2.8;
    if (sim.u_verticalScaleMode == 1u) {
        if (t.elevation > 0.0) {
            let logNormH = log(1.0 + t.elevation / 1200.0) / log(1.0 + 8848.0 / 1200.0);
            terrainDisp = logNormH * dispScale * poleAtten;
        }
    } else {
        terrainDisp = pow(shapedH, dynamicExp) * dispScale * poleAtten;
    }
    
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

fn geodeticToManifold(lonRad: f32, latRad: f32, altOffset: f32, mode: u32, unfurl: f32) -> vec3<f32> {
    let cosLat = cos(latRad);
    let sinLat = sin(latRad);
    let cosLon = cos(lonRad);
    let sinLon = sin(lonRad);
    let p3D = vec3<f32>(RADIUS * cosLat * sinLon, RADIUS * sinLat, RADIUS * cosLat * cosLon);
    let clampedLat = clamp(latRad, -1.4835, 1.4835);
    let mercatorY = log(tan(PI * 0.25 + clampedLat * 0.5)) * RADIUS;
    // Developable unroll (Mode 0 parity): Equirectangular 2:1 mapping (lonRad * RADIUS, latRad * RADIUS)
    // guarantees exact 1:1 spatial alignment with Mode 0 evaluateModeZero and eliminates latitudinal drift.
    let targetY = select(mercatorY, latRad * RADIUS, mode == 0u);
    let target2D = vec2<f32>(lonRad * RADIUS, targetY);

    let deformed = evaluateManifoldCore(
        p3D, target2D, unfurl, mode,
        sim.u_time, vec4<f32>(0.0), 0.0, vec4<f32>(0.0)
    );

    // Apply physical altitude standoff along the deformed surface normal.
    // Conforms ribbons to Mode 1 scroll curvature (r_scroll) without paper penetration,
    // and elevates filaments along Mode 3 traveling capillary waves.
    var finalPos = deformed.pos + deformed.normal * altOffset;

    // Mode 2 Tectonic Fracture: cancel discontinuous crust rift displacement across Mid-Atlantic Ridge calving rift
    // to maintain continuous atmospheric streamline transport without tearing or stretching over the opening chasm.
    if (mode == 2u) {
        let lambdaRift: f32 = -0.48869219;
        let dRift = abs(lonRad - lambdaRift);
        let fSeam = 1.0 - smoothstep(0.0, 0.70, dRift);
        let crackSign = select(-1.0, 1.0, lonRad >= lambdaRift);
        let sphereNorm = normalize(p3D);
        let tEast = normalize(vec3<f32>(sphereNorm.z, 0.0, -sphereNorm.x));
        let ease = clamp(unfurl, 0.0, 1.0);
        if (ease <= 0.15) {
            let crackProg = smoothstep(0.01, 0.15, ease);
            let crackDilation = crackSign * fSeam * (0.08 * crackProg);
            finalPos = finalPos - tEast * crackDilation;
        } else {
            let tPeel = smoothstep(0.15, 1.0, ease);
            let crackWidth = crackSign * fSeam * (0.08 + 0.40 * tPeel);
            finalPos = finalPos - tEast * (crackWidth * (1.0 - tPeel));
        }
    }

    return finalPos;
}

// ============================================================================
// Mode 3 Solenoidal Fluid Shear & Effective Velocity Entrainment
// Blends planetary GFS wind with manifold solenoidal curl noise during liquefaction
// ============================================================================
fn sampleEffectiveVelocity(lonRad: f32, latRad: f32, isJet: bool) -> vec2<f32> {
    let u_GFS = sampleVelocity(lonRad, latRad, isJet);
    let alpha_clamped = clamp(sim.u_unfurl, 0.0, 1.0);
    let alpha_fluid = select(0.0, sin(PI * alpha_clamped) * (1.0 - 0.35 * alpha_clamped), sim.u_mode == 3u);
    if (alpha_fluid <= 0.0001) {
        return u_GFS;
    }

    let cosLat = cos(latRad);
    let sinLat = sin(latRad);
    let cosLon = cos(lonRad);
    let sinLon = sin(lonRad);
    let n = vec3<f32>(cosLat * sinLon, sinLat, cosLat * cosLon);
    let pos3D = n * RADIUS;

    let u_curl = computeCurlNoise(pos3D, sim.u_time * 1.5);
    let u_fluid3D = u_curl - n * dot(n, u_curl);

    let eEast = vec3<f32>(cosLon, 0.0, -sinLon);
    let eNorth = cross(n, eEast);

    let u_fluid = vec2<f32>(dot(u_fluid3D, eEast), dot(u_fluid3D, eNorth));
    let beta_shear: f32 = 25.0;
    let u_vortex = vec2<f32>(0.0);

    let u_eff = (1.0 - alpha_fluid) * u_GFS + alpha_fluid * (beta_shear * u_fluid + u_vortex);
    return u_eff;
}

// ============================================================================
// Riemannian Exponential Map & Spherical Geodesic Displacement on S^2
// Transports coordinates along great-circle geodesics with zero polar singularities
// ============================================================================
fn geodesicDisplacement(lon: f32, lat: f32, dLamRad: f32, dPhiRad: f32) -> vec2<f32> {
    let sigma_sq = dLamRad * dLamRad + dPhiRad * dPhiRad;
    if (sigma_sq < 1e-12) {
        return vec2<f32>(lon, lat);
    }
    let cos_phi = cos(lat);
    let sin_phi = sin(lat);
    let sigma = sqrt(sigma_sq);
    let sinc = select(1.0 - sigma_sq * 0.16666667, sin(sigma) / max(sigma, 1e-7), sigma > 1e-4);
    let cos_sigma = cos(sigma);
    let c_lam = sinc * dLamRad;
    let c_phi = sinc * dPhiRad;
    let sin_phi_d = clamp(c_phi * cos_phi + cos_sigma * sin_phi, -1.0, 1.0);
    let phi_d = asin(sin_phi_d);
    let y = c_lam;
    let x = cos_sigma * cos_phi - c_phi * sin_phi;
    let delta_lambda = atan2(y, x);

    var lon_new = lon + delta_lambda;
    if (lon_new > PI) { lon_new = lon_new - TWO_PI; }
    if (lon_new < -PI) { lon_new = lon_new + TWO_PI; }

    return vec2<f32>(lon_new, phi_d);
}

fn advectSphericalGeodesic(lon: f32, lat: f32, velMps: vec2<f32>, dtSeconds: f32) -> vec2<f32> {
    let dLamRad = (velMps.x * dtSeconds) / EARTH_RADIUS;
    let dPhiRad = (velMps.y * dtSeconds) / EARTH_RADIUS;
    return geodesicDisplacement(lon, lat, dLamRad, dPhiRad);
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
    // Dynamic lifetime modulation: u_particleLifetime in seconds (calibrated default ~6.0s)
    let baseLifetime = select(6.0, sim.u_particleLifetime, sim.u_particleLifetime >= 0.5);
    let stratumLifetime = select(baseLifetime, baseLifetime * 1.5, isJetStream);
    let ageIncrement = dt / stratumLifetime;

    // Check if particle should respawn
    let shouldRespawn = age >= 1.0 || (lon != lon) || (lat != lat) || abs(lat) > (PI * 0.499);

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
        // 2nd-Order Runge-Kutta (RK2) Geodesic Advection forward on S^2
        let v0 = sampleEffectiveVelocity(lon, lat, isJetStream);
        let simScale = select(6000.0, 10000.0, isJetStream);
        let dtStep = dt * simScale;

        // Midpoint geodesic step
        let posMid = advectSphericalGeodesic(lon, lat, v0, dtStep * 0.5);
        let vMid = sampleEffectiveVelocity(posMid.x, posMid.y, isJetStream);

        // Full geodesic step from initial position using midpoint velocity
        let posNext = advectSphericalGeodesic(lon, lat, vMid, dtStep);

        lon = posNext.x;
        lat = posNext.y;
        age = age + ageIncrement;
    }

    let currentVel = sampleEffectiveVelocity(lon, lat, isJetStream);
    let speed = length(currentVel);

    // Orographic vertical velocity w = u_h · ∇h (in m/s) and terrain-lifted altitude
    let t0 = sampleTerrain(lon, lat);
    let wOrographic = dot(currentVel, t0.gradient);
    let alt0 = computeLiftedAltitude(lon, lat, currentVel, isJetStream);

    // Calculate fade alpha: smooth fade in at birth, fade out at end of life
    let fadeIn = smoothstep(0.0, 0.12, age);
    let fadeOut = 1.0 - smoothstep(0.85, 1.0, age);
    let polarFade = 1.0 - smoothstep(PI * 0.472, PI * 0.497, abs(lat));
    let alpha = fadeIn * fadeOut * polarFade;

    let worldPos0 = geodeticToManifold(lon, lat, alt0, sim.u_mode, sim.u_unfurl);

    // Dynamic physical streamline step length (in geographic radians) scaled with wind velocity
    // Surface winds: fine filament steps (0.020 rad) for crisp streamline continuity
    // Jet stream: long, continuous atmospheric river sweeps (0.046 rad)
    let baseStep = select(0.020, 0.046, isJetStream);
    let speedNorm = select(10.0, 32.0, isJetStream);
    let speedFactor = clamp(speed / speedNorm, select(0.5, 0.8, isJetStream), select(1.7, 2.6, isJetStream));
    let stepLen = baseStep * speedFactor;

    // Backward streamline integration (instantaneous streamline curve along great-circle geodesics)
    // Step 0 -> 1
    let dir0 = currentVel / max(speed, 0.01);
    let pos1 = geodesicDisplacement(lon, lat, -dir0.x * stepLen, -dir0.y * stepLen);
    let lon1 = pos1.x;
    let lat1 = clamp(pos1.y, -PI * 0.499, PI * 0.499);
    let v1 = sampleEffectiveVelocity(lon1, lat1, isJetStream);
    let alt1 = computeLiftedAltitude(lon1, lat1, v1, isJetStream);
    let worldPos1 = geodeticToManifold(lon1, lat1, alt1, sim.u_mode, sim.u_unfurl);

    // Step 1 -> 2
    let s1 = max(length(v1), 0.01);
    let dir1 = v1 / s1;
    let pos2 = geodesicDisplacement(lon1, lat1, -dir1.x * stepLen, -dir1.y * stepLen);
    let lon2 = pos2.x;
    let lat2 = clamp(pos2.y, -PI * 0.499, PI * 0.499);
    let v2 = sampleEffectiveVelocity(lon2, lat2, isJetStream);
    let alt2 = computeLiftedAltitude(lon2, lat2, v2, isJetStream);
    let worldPos2 = geodeticToManifold(lon2, lat2, alt2, sim.u_mode, sim.u_unfurl);

    // Step 2 -> 3
    let s2 = max(length(v2), 0.01);
    let dir2 = v2 / s2;
    let pos3 = geodesicDisplacement(lon2, lat2, -dir2.x * stepLen, -dir2.y * stepLen);
    let lon3 = pos3.x;
    let lat3 = clamp(pos3.y, -PI * 0.499, PI * 0.499);
    let v3 = sampleEffectiveVelocity(lon3, lat3, isJetStream);
    let alt3 = computeLiftedAltitude(lon3, lat3, v3, isJetStream);
    let worldPos3 = geodeticToManifold(lon3, lat3, alt3, sim.u_mode, sim.u_unfurl);

    // Jet stream retains high segment alpha to form continuous fluid ribbons;
    // Surface winds retain balanced alpha for clearly defined streamlines without noise.
    var a1 = select(0.76, 0.90, isJetStream);
    var a2 = select(0.50, 0.74, isJetStream);
    var a3 = select(0.25, 0.52, isJetStream);

    // Analytic antimeridian seam segmentation:
    // If consecutive history points cross the +/-180 deg boundary (|lambda_A - lambda_B| > pi),
    // set segment alpha to 0.0 to eliminate cross-canvas horizontal streak artifacts on flat and unrolled maps.
    if (abs(lon - lon1) > PI) {
        a1 = 0.0;
    }
    if (abs(lon1 - lon2) > PI) {
        a2 = 0.0;
    }
    if (abs(lon2 - lon3) > PI) {
        a3 = 0.0;
    }

    pOut.pos = vec4<f32>(lon, lat, alt0, age);
    pOut.vel = vec4<f32>(currentVel.x, currentVel.y, wOrographic, speed);
    pOut.history0 = vec4<f32>(worldPos0, alpha * 1.00);
    pOut.history1 = vec4<f32>(worldPos1, alpha * a1);
    pOut.history2 = vec4<f32>(worldPos2, alpha * a2);
    pOut.history3 = vec4<f32>(worldPos3, alpha * a3);

    particlesOut[index] = pOut;
}
