// ============================================================================
// File: src/webgpu/shaders/manifold.wgsl
// Target: Unified Manifold Kinematics & Solenoidal Vector Noise
// Authoritative Reference: SHADERS_SPEC_LEDGER.md §3
// Dispatches: Mode 0 (Linear), Mode 1 (Cylindrical), Mode 2 (LEFM), Mode 3 (Fluid)
// Modes 0..3 active; 4-mode architecture.
// ============================================================================

const PI: f32 = 3.14159265358979;
const RADIUS: f32 = 5.0;

// Analytical 3D Solenoidal Vector Field (div u = 0 guaranteed, zero Cartesian lattice)
// Canonical implementation extracted from physics_sim.wgsl & crust_hydrosphere.wgsl
fn computeCurlNoise(p: vec3<f32>, time: f32) -> vec3<f32> {
    let t: f32 = time * 0.75;
    
    let rot = mat3x3<f32>(
        vec3<f32>(0.00,  0.80,  0.60),
        vec3<f32>(-0.80, 0.36, -0.48),
        vec3<f32>(-0.60, -0.48, 0.64)
    );
    let rotT = transpose(rot);

    let q1 = rot * (p * 0.45);
    let q2 = rot * (rot * (p * 0.95));

    let ux = -0.55 * cos(0.55 * q1.y + t * 0.7) - 0.45 * cos(0.95 * q1.z - t * 0.5);
    let uy = -0.55 * cos(0.55 * q1.z + t * 0.9) - 0.45 * cos(0.95 * q1.x - t * 0.6);
    let uz = -0.55 * cos(0.55 * q1.x + t * 0.8) - 0.45 * cos(0.95 * q1.y - t * 0.4);

    let u2x = 0.25 * sin(1.5 * q2.y - t * 1.2);
    let u2y = 0.25 * sin(1.5 * q2.z - t * 1.1);
    let u2z = 0.25 * sin(1.5 * q2.x - t * 1.3);

    let out1 = rotT * vec3<f32>(ux, uy, uz);
    let out2 = rotT * (rotT * vec3<f32>(u2x, u2y, u2z));

    return out1 + out2;
}

struct DeformedVertex {
    pos: vec3<f32>,
    normal: vec3<f32>,
};

// ----------------------------------------------------------------------------
// Horizon Limb Falloff Specification (§1)
// ----------------------------------------------------------------------------
fn horizonFalloff(facing: f32, tau: f32, killEdge0: f32, killEdge1: f32) -> f32 {
    let maxPath: f32 = 12.5; // ≈ sqrt(π·X/2) for engine atmosphere
    let path = min(1.0 / max(facing, 1.0 / maxPath), maxPath);
    let transmission = exp(-tau * path);
    let killTerm = smoothstep(killEdge0, killEdge1, facing);
    return transmission * killTerm;
}

// Unified manifold deformation core evaluating Modes 0..3
fn evaluateManifoldCore(
    pos3D: vec3<f32>,
    mercator2D: vec2<f32>,
    unfurl: f32,
    mode: u32,
    simTime: f32,
    hitPos: vec4<f32>,
    curActive: f32,
    curVel: vec4<f32>,
) -> DeformedVertex {
    let clampedUnfurl = clamp(unfurl, 0.0, 1.0);
    let ease = clampedUnfurl;
    var out: DeformedVertex;
    let pos2D = vec3<f32>(mercator2D.x, mercator2D.y, 0.0);

    // Rule 21 & Rule 28 compliance: switch dispatch prevents source-scanning regex collisions
    switch (mode) {
        case 1u: {
            // ── Mode 1: Parchment Scroll Unfurl with Tight Roll Dynamics (§3) ──
            // Rapid cylinder formation by alpha = 0.20 eliminates polar puckering;
            // cylinder rolls up tightly like parchment before unfurling flat onto drafting sheet.
            let lonRad = select(atan2(pos3D.x, pos3D.z), mercator2D.x / RADIUS, abs(mercator2D.x) > 0.00001 || abs(mercator2D.y) > 0.00001);
            let clampedY = clamp(pos3D.y / RADIUS, -0.9998, 0.9998);
            let latRad = asin(clampedY);
            let cosLat = cos(latRad);
            let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);

            // Phase 1: Rapid cylinder formation (alpha in [0.0, 0.20])
            let tCyl = smoothstep(0.0, 0.20, ease);
            let rCyl = mix(RADIUS * cosLat, RADIUS, tCyl);

            // Phase 2: Parchment tight roll-up compression (tightens cylinder radius before unrolling)
            let tRoll = sin(PI * smoothstep(0.15, 0.40, ease));
            let rScroll = rCyl * (1.0 - 0.20 * tRoll);

            // Phase 3: Unrolling curvature relaxation onto drafting table (alpha in [0.20, 1.00])
            let tUnroll = smoothstep(0.20, 1.0, ease);
            let s = 1.0 - tUnroll;
            let u = s * lonRad;

            var curX: f32;
            var curZ: f32;

            if (abs(u) > 0.02) {
                let sDiv = max(0.0001, s);
                curX = rScroll * (sin(u) / sDiv);
                curZ = rScroll * ((cos(u) - 1.0) / sDiv + s);
            } else {
                let u2 = u * u;
                curX = rScroll * lonRad * (1.0 - u2 / 6.0);
                curZ = -s * rScroll * (lonRad * lonRad) * (0.5 - u2 / 24.0) + rScroll * s;
            }

            // Polar Puckering Elimination: Y stays cylindrical during formation, then unrolls to Mercator
            let curY = mix(pos3D.y, mercator2D.y, tUnroll);
            out.pos = vec3<f32>(curX, curY, curZ);

            let cylNorm = vec3<f32>(sin(u), 0.0, cos(u));
            let rawNorm = mix(sphereNorm, select(vec3<f32>(0.0, 0.0, 1.0), normalize(cylNorm), length(cylNorm) > 0.0001), tCyl);
            out.normal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(rawNorm), length(rawNorm) > 0.001);
        }

        case 2u: {
            // ── Mode 2: Tectonic Crust Fracture (Mid-Atlantic Ridge Calving, §4) ──
            // Single geological seam along Mid-Atlantic Ridge (lambda_rift ≈ -28° ≈ -0.48869 rad)
            let lambdaRift: f32 = -0.48869219;
            let lonRad = select(atan2(pos3D.x, pos3D.z), mercator2D.x / RADIUS, abs(mercator2D.x) > 0.00001 || abs(mercator2D.y) > 0.00001);
            let clampedY = clamp(pos3D.y / RADIUS, -0.9998, 0.9998);
            let latRad = asin(clampedY);
            let cosLat = cos(latRad);
            let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);

            let dRift = abs(lonRad - lambdaRift);
            let fSeam = 1.0 - smoothstep(0.0, 0.70, dRift);
            let crackSign = select(-1.0, 1.0, lonRad >= lambdaRift);

            // Eastward surface tangent vector on sphere
            let tEast = normalize(vec3<f32>(sphereNorm.z, 0.0, -sphereNorm.x));

            let fracMult = select(1.0, hitPos.w, hitPos.w > 0.01);
            let hitDist = length(pos3D - hitPos.xyz);
            let cursorInfluence = curActive * exp(-hitDist * hitDist / (2.0 * 0.64));
            let hoopStress = cursorInfluence * 0.45 * fracMult * (1.0 + 2.0 * cosLat * cosLat);

            if (ease <= 0.15) {
                // Pre-Rupture Dilatation & Crack Nucleation (alpha in [0.00, 0.15])
                let deltaR = 0.06 * RADIUS * (ease / 0.15) + hoopStress * (1.0 - ease);
                let crackProg = smoothstep(0.01, 0.15, ease);
                let crackDilation = crackSign * fSeam * (0.08 * crackProg);

                out.pos = pos3D + sphereNorm * deltaR + tEast * crackDilation;
                out.normal = sphereNorm;
            } else {
                // Crustal Plate Peeling & Calving (alpha in [0.15, 1.00])
                let tPeel = smoothstep(0.15, 1.0, ease);
                let baseSphereDilated = pos3D + sphereNorm * (0.06 * RADIUS);
                let basePos = mix(baseSphereDilated, pos2D, tPeel);

                let flutterWave = sin(18.0 * dRift - 20.0 * ease);
                let flutterDecay = exp(-3.5 * ease);
                let wFlutter = flutterWave * flutterDecay * fSeam * fracMult * (tPeel * (1.0 - tPeel));

                let crackWidth = crackSign * fSeam * (0.08 + 0.40 * tPeel);
                let rawNorm = mix(sphereNorm, vec3<f32>(0.0, 0.0, 1.0), tPeel);
                let baseNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(rawNorm), length(rawNorm) > 0.001);

                out.pos = basePos + baseNorm * wFlutter + tEast * (crackWidth * (1.0 - tPeel));
                out.normal = baseNorm;
            }
        }

        case 3u: {
            // ── Mode 3: Hydrodynamic Fluid Relaxation & Viscous Streamline Shear (§5) ──
            let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);
            let rawSin = sin(PI * clampedUnfurl);
            let liquefaction = rawSin * (1.0 - 0.35 * ease);
            let volumePreserve = sphereNorm * (RADIUS * 0.50 * rawSin);
            let basePos = mix(pos3D, pos2D, ease) + volumePreserve;

            let baseLen = length(basePos);
            let surfaceNormal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(basePos), baseLen > 0.001);

            // Solenoidal curl noise projected strictly onto the surface tangent plane
            // (Eliminates radial bunching and knobby marbles while delivering authentic fluid streamline flow)
            let rawCurl = computeCurlNoise(basePos, simTime * 1.5);
            let normalComp = dot(rawCurl, surfaceNormal);
            let tangentCurl = rawCurl - surfaceNormal * normalComp;
            let fluidShear = tangentCurl * (RADIUS * 0.28 * liquefaction);

            // 3-Octave dispersion-coupled gravity-capillary surface waves (multi-axis 3D traveling wave harmonics with faster undulation)
            let phi1 = dot(basePos, vec3<f32>(0.35, 0.62, 0.42)) * 1.35 - simTime * 2.8;
            let phi2 = dot(basePos, vec3<f32>(-0.45, 0.30, 0.65)) * 1.75 - simTime * 2.2;
            let phi3 = dot(basePos, vec3<f32>(0.55, -0.40, 0.35)) * 2.10 - simTime * 3.4;
            let capillaryDecay = 1.0 - smoothstep(0.85, 1.0, ease);
            let zCapillary = (0.45 * sin(phi1) + 0.30 * cos(phi2) + 0.20 * sin(phi3)) * liquefaction * capillaryDecay;

            // Cursor Lamb-Oseen vortex interaction in fluid medium
            var cursorOffset = vec3<f32>(0.0);
            if (curActive > 0.001) {
                let hitDist = length(basePos - hitPos.xyz);
                let coreRadius: f32 = 0.85;
                let vortexCirc = (1.0 - exp(-hitDist * hitDist / (coreRadius * coreRadius))) / (hitDist + 0.05);
                let vortexTangent = normalize(cross(surfaceNormal, basePos - hitPos.xyz + vec3<f32>(0.001)));
                let clampedSpeed = clamp(curVel.w, 0.0, 1.5);
                let vortexVel = vortexTangent * (curActive * clampedSpeed * vortexCirc * 0.35);
                let wakeAdv = normalize(curVel.xyz + vec3<f32>(0.0001)) * (clampedSpeed * 0.15 * curActive * exp(-hitDist * hitDist / 1.5));
                cursorOffset = (vortexVel + wakeAdv) * (rawSin * capillaryDecay * 0.25);
            }

            out.pos = basePos + fluidShear + surfaceNormal * zCapillary + cursorOffset;

            let rawNorm = mix(surfaceNormal, vec3<f32>(0.0, 0.0, 1.0), ease);
            out.normal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(rawNorm), length(rawNorm) > 0.001);
        }

        default: {
            // ── Mode 0: Polar-Convergent Geodesic Unfolding with Tactile Peeling Lip (§2) ──
            // Eliminates polar bat/cat ears, needle spindle, and normal collapse at antimeridian
            let lonRad = select(atan2(pos3D.x, pos3D.z), mercator2D.x / RADIUS, abs(mercator2D.x) > 0.00001 || abs(mercator2D.y) > 0.00001);
            let clampedY = clamp(pos3D.y / RADIUS, -0.9998, 0.9998);
            let latRad = asin(clampedY);
            let cosLat = cos(latRad);

            // Staged meridional unbending:
            // Prevents premature polar height explosion and vertical cat ears/spikes
            let tUnbend = smoothstep(0.15, 0.85, ease);
            let yPhysical = mix(pos3D.y, RADIUS * latRad, tUnbend);
            let tMercator = smoothstep(0.60, 1.0, ease);
            let curY = mix(yPhysical, pos2D.y, tMercator);

            // Decoupled intermediate parallel expansion (eliminates intermediate diamond/rhombus silhouette):
            let tParallel = smoothstep(0.18, 0.82, ease);
            let parallelWidth = mix(cosLat, 1.0, tParallel);
            let curX = mix(pos3D.x, pos2D.x * parallelWidth, ease);

            // Planar depth convergence with latitude-tapered chord lift:
            let chordLiftZ = cosLat * RADIUS * (1.0 - ease) * sin(PI * ease) * 0.28;
            let curZ = mix(pos3D.z, 0.0, ease) + chordLiftZ;
            let basePos = vec3<f32>(curX, curY, curZ);

            // ── Tactile Boundary Peel Envelope (Happy Middle Space) ──
            // 1. Time envelope: smooth C1 onset (smoothstep 0.0 to 0.45) and relaxation back to planar map
            let uAlpha = clampedUnfurl;
            let alphaPeel = smoothstep(0.0, 0.45, uAlpha);
            let ePeel = sin(PI * alphaPeel) * (1.0 - uAlpha);

            // 2. Continuous power-law peel propagation (Option C: Whole-Manifold Participation):
            // Smooth dynamic exponent rolls curvature wave from seam inward across 100% of the globe.
            // Eliminates any artificial step threshold; curvature decays continuously to zero at prime meridian.
            let lonNorm = abs(lonRad) / PI;
            let tPeel = smoothstep(0.0, 0.50, uAlpha);
            let peelExp = 3.5 - tPeel * 1.7;
            let fPeel = select(0.0, pow(lonNorm, peelExp), lonNorm > 0.0001);

            // 3. Strict polar attenuation (proportional to cosLat):
            // Ensures peeling displacement vanishes at the polar singularities (cosLat -> 0).
            // Completely eliminates layer buckling, folding over into itself, and inverted polar points!
            let polarScale = cosLat;

            // 4. Outward radial normal in horizontal plane (points strictly AWAY from globe core):
            let horizLen = length(vec2<f32>(pos3D.x, pos3D.z));
            let horizNorm = select(vec3<f32>(0.0, 0.0, -1.0),
                                   vec3<f32>(pos3D.x / horizLen, 0.0, pos3D.z / horizLen),
                                   horizLen > 0.001);

            // 5. Outward radial lift (lifts peel outward from the body):
            let liftMag = RADIUS * 0.14 * ePeel * fPeel * polarScale;
            let liftVec = horizNorm * liftMag;

            // 6. Tangent parallel flare (peel margins flare outward along latitude lines):
            let flareSign = select(-1.0, 1.0, lonRad >= 0.0);
            let flareMag = flareSign * RADIUS * 0.16 * ePeel * fPeel * polarScale;

            out.pos = basePos + liftVec + vec3<f32>(flareMag, 0.0, 0.0);

            // Unrolling rotational surface normal:
            // Eliminates (0,0,0) normal collapse at antimeridian equator at alpha=0.5
            let thetaNormLon = (1.0 - ease) * lonRad;
            let thetaNormLat = (1.0 - ease) * latRad;
            let cp = cos(thetaNormLat);
            let sp = sin(thetaNormLat);
            let cl = cos(thetaNormLon);
            let sl = sin(thetaNormLon);
            let unrollNorm = vec3<f32>(cp * sl, sp, cp * cl);
            out.normal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(unrollNorm), length(unrollNorm) > 0.001);
        }
    }

    return out;
}
