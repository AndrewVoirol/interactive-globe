// ============================================================================
// File: src/webgpu/shaders/vector_ribbon.wgsl
// Target: WebGPU Screen-Space Anti-Aliased Vector Line Ribbon Pipeline
// Pipeline Architecture: Instanced Quad Extrusion with Homogeneous Near-Plane Guard
// Mathematical Specification: Indicatrix Engine Frontier 1 Research Specification
// ============================================================================

struct SimUniforms {
    u_unfurl: f32,
    u_mode: u32,
    u_theme: u32,             // 0 = Obsidian Dark Cyber, 1 = Light Monochrome
    u_time: f32,
    u_viewport: vec4<f32>,     // x: width_px, y: height_px, z: 1/width, w: 1/height
    u_cameraPos: vec4<f32>,
    u_cursorHitPos: vec4<f32>,
    u_cursorVel: vec4<f32>,    // xyz: vel, w: speed
    u_cursorActive: f32,
    u_displacementScale: f32,
    u_halfWidthPx: f32,        // Nominal half-width in CSS pixels
    u_dpr: f32,                // Device Pixel Ratio (e.g. 2.0 for Retina)
    u_nearPlane: f32,          // Near clipping distance (e.g. 0.1)
    u_pad0: f32,
    u_pad1: f32,
    u_pad2: f32,
    u_viewMatrix: mat4x4<f32>,
    u_projectionMatrix: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> sim: SimUniforms;
@group(0) @binding(1) var u_demTexture: texture_2d<f32>;
@group(0) @binding(2) var u_demSampler: sampler;

// ----------------------------------------------------------------------------
// Vertex Input Structs
// Quad Base Geometry: 4 vertices per quad (Instanced Drawing)
// ----------------------------------------------------------------------------
struct VertexInput {
    // Instanced Quad Corner (Location 0)
    // x: u in [0, 1] (longitudinal), y: v in [-1, +1] (lateral)
    @location(0) corner: vec2<f32>,

    // Per-Segment Instance Attributes
    @location(1) posA_3d: vec4<f32>,         // xyz: sphere pos, w: pointType (0=river, 1=coast)
    @location(2) posA_target2d: vec4<f32>,   // xy: mercator 2D, zw: dymaxion 2D
    @location(3) posB_3d: vec4<f32>,         // xyz: sphere pos, w: pointType
    @location(4) posB_target2d: vec4<f32>,   // xy: mercator 2D, zw: dymaxion 2D
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) uv: vec2<f32>,              // x: normalized longitudinal, y: normalized lateral
    @location(1) uCapExcess: f32,            // longitudinal cap extension ratio
    @location(2) pointType: f32,
    @location(3) facing: f32,
    @location(4) alphaPeak: f32,             // Subpixel radiometric energy attenuation
};

const PI: f32 = 3.14159265358979323846;
const RADIUS: f32 = 5.0;

// ----------------------------------------------------------------------------
// Analytical 3D Solenoidal Curl Noise (div u = 0 guaranteed)
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

// ----------------------------------------------------------------------------
// Dynamic Manifold Transformation Across All 5 Engine Paradigms
// ----------------------------------------------------------------------------
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
            // Taylor Expansion Guard near oneMinusT <= 0.001
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
        // Mode 2: Griffith Linear Elastic Fracture Mechanics (LEFM)
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
        // Mode 3: Fluid Advection & Lamb-Oseen Vortex Wake
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

    // Topographic Elevation Coupling from ETOPO 2022 DEM
    let demUv = vec2<f32>((lambda + PI) / (2.0 * PI), (phi + PI * 0.5) / PI);
    let demSample = textureSampleLevel(u_demTexture, u_demSampler, demUv, 0.0);
    let isLand = demSample.b;
    let elevation = demSample.r;
    let displacement = isLand * elevation * sim.u_displacementScale * 1.5;
    out.pos += out.normal * (displacement + 0.012);

    return out;
}

// ----------------------------------------------------------------------------
// Vertex Shader: Screen-Space Quad Extrusion with Analytical Near-Plane Guard
// ----------------------------------------------------------------------------
@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;

    // 1. Manifold Deformations
    let defA = evaluateManifold(in.posA_3d.xyz, in.posA_target2d.xy, in.posA_target2d.zw);
    let defB = evaluateManifold(in.posB_3d.xyz, in.posB_target2d.xy, in.posB_target2d.zw);

    // 2. Homogeneous Clip-Space Coordinates
    var clipA = sim.u_projectionMatrix * sim.u_viewMatrix * vec4<f32>(defA.pos, 1.0);
    var clipB = sim.u_projectionMatrix * sim.u_viewMatrix * vec4<f32>(defB.pos, 1.0);

    let nearGuard = max(sim.u_nearPlane, 0.05);

    // 3. Analytical Near-Plane Guard (w_c >= nearGuard)
    let wA_ok = clipA.w >= nearGuard;
    let wB_ok = clipB.w >= nearGuard;

    // Early-out if segment lies completely behind the camera near plane
    if (!wA_ok && !wB_ok) {
        out.clipPos = vec4<f32>(0.0, 0.0, -1.0, 0.0); // Degenerate cull
        return out;
    }

    // Analytical line clipping against homogeneous plane w = nearGuard
    var uA_param: f32 = 0.0;
    var uB_param: f32 = 1.0;

    if (!wA_ok && wB_ok) {
        let tClip = (nearGuard - clipA.w) / (clipB.w - clipA.w);
        clipA = mix(clipA, clipB, tClip);
        clipA.w = nearGuard;
        uA_param = tClip;
    } else if (wA_ok && !wB_ok) {
        let tClip = (nearGuard - clipA.w) / (clipB.w - clipA.w);
        clipB = mix(clipA, clipB, tClip);
        clipB.w = nearGuard;
        uB_param = tClip;
    }

    // 4. Perspective Division to NDC Space
    let ndcA = clipA.xy / clipA.w;
    let ndcB = clipB.xy / clipB.w;

    // 5. Transformation to Physical Screen Pixels
    let halfVp = sim.u_viewport.xy * 0.5;
    let pxA = vec2<f32>((ndcA.x + 1.0) * halfVp.x, (1.0 - ndcA.y) * halfVp.y);
    let pxB = vec2<f32>((ndcB.x + 1.0) * halfVp.x, (1.0 - ndcB.y) * halfVp.y);

    let deltaPx = pxB - pxA;
    let lenPx = length(deltaPx);
    let tangent = select(vec2<f32>(1.0, 0.0), deltaPx / lenPx, lenPx > 1e-4);
    let normal = vec2<f32>(-tangent.y, tangent.x);

    // 6. Stroke Width and Subpixel Radiometric Clamping
    let nominalHalfWidthPhys = sim.u_halfWidthPx * sim.u_dpr;
    let geomHalfWidthPhys = max(nominalHalfWidthPhys, 0.5); // Minimum 0.5 physical px to prevent aliasing dropouts
    let featherPhys = 1.0;                                  // 1 physical pixel feather margin
    let totalRadiusPhys = geomHalfWidthPhys + featherPhys;

    // Cap extension ratio for round caps
    let capExcess = totalRadiusPhys / max(lenPx, 1.0);

    // Quad corner selection: in.corner.x in [0, 1], in.corner.y in [-1, +1]
    let isEndB = in.corner.x > 0.5;
    let baseClip = select(clipA, clipB, isEndB);

    // Longitudinal parameterization: extend unclipped ends by capExcess so round cap SDF can evaluate
    let baseU_A = select(uA_param - capExcess, uA_param, !wA_ok);
    let baseU_B = select(uB_param + capExcess, uB_param, !wB_ok);
    let baseU = select(baseU_A, baseU_B, isEndB);

    // Longitudinal and lateral screen-space displacements
    let lateralOffset = in.corner.y * totalRadiusPhys * normal;

    // Flush termination for near-plane clipped endpoints (zero longitudinal cap offset)
    let longOffsetA = select(-totalRadiusPhys * tangent, vec2<f32>(0.0), !wA_ok);
    let longOffsetB = select( totalRadiusPhys * tangent, vec2<f32>(0.0), !wB_ok);
    let longitudinalOffset = select(longOffsetA, longOffsetB, isEndB);
    let totalOffsetPx = lateralOffset + longitudinalOffset;

    // 7. Depth-Invariant Clip Offset Reconstruction (Offset * w_c)
    let offsetNdc = vec2<f32>(
        (totalOffsetPx.x / halfVp.x),
        -(totalOffsetPx.y / halfVp.y)
    );

    out.clipPos = vec4<f32>(
        baseClip.xy + offsetNdc * baseClip.w,
        baseClip.z,
        baseClip.w
    );

    // Interpolated Shading Coordinates
    out.uv = vec2<f32>(baseU, in.corner.y);
    out.uCapExcess = capExcess;
    out.pointType = select(in.posA_3d.w, in.posB_3d.w, isEndB);

    // Subpixel peak alpha attenuation to preserve radiometric flux
    out.alphaPeak = min(1.0, 2.0 * nominalHalfWidthPhys);

    // 8. Surface Facing & Horizon Culling
    let dynamicNormal = select(defA.normal, defB.normal, isEndB);
    let viewPos = sim.u_viewMatrix * vec4<f32>(select(defA.pos, defB.pos, isEndB), 1.0);
    let viewNormal = normalize((sim.u_viewMatrix * vec4<f32>(dynamicNormal, 0.0)).xyz);
    let viewDir = -normalize(viewPos.xyz);
    out.facing = dot(viewNormal, viewDir);

    return out;
}

// ----------------------------------------------------------------------------
// Fragment Shader: Screen-Pixel Analytical Distance & Anti-Aliased Feathering
// ----------------------------------------------------------------------------
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // 1. Planetary Horizon Backface Attenuation
    let sphereFactor = 1.0 - smoothstep(0.0, 0.35, sim.u_unfurl);
    if (sphereFactor > 0.0 && in.facing < -0.15) {
        discard;
    }
    let facingFade = mix(0.3, 1.0, smoothstep(-0.15, 0.25, in.facing));

    // 2. Analytical Distance Function with Circular Cap Evaluation
    // in.uv.x is longitudinal [0, 1], in.uv.y is lateral [-1, +1]
    let u = in.uv.x;
    let v = in.uv.y;

    // Longitudinal excess beyond segment endpoints (SIMD32 branchless)
    let uExcess = max(0.0, max(-u, u - 1.0)) / max(in.uCapExcess, 1e-5);

    // Normalized Euclidean distance metric from the ribbon spine
    let dNorm = sqrt(uExcess * uExcess + v * v);

    // 3. Screen-Pixel Derivative Feathering (Exact Physical Pixel Ramp)
    // fwidth(dNorm) measures the rate of change of dNorm across 1 physical screen pixel
    let delta = max(0.5 * fwidth(dNorm), 1e-4);

    // Linear coverage ramp over a 1.0 physical pixel boundary transition
    let coverage = clamp(1.0 - (dNorm - (1.0 - delta)) / (2.0 * delta), 0.0, 1.0);

    if (coverage <= 0.0) {
        discard;
    }

    // 4. Cartographic Color Theme Evaluation
    var strokeColor: vec3<f32>;
    var nominalAlpha: f32;

    if (sim.u_theme == 0u) {
        // Theme 0: Dark Palette Cartographic Hairlines
        if (in.pointType < 0.75) {
            // Major Hydrological Arteries: Mineral slate-blue
            strokeColor = vec3<f32>(0.28, 0.42, 0.54);
            nominalAlpha = 0.30;
        } else {
            // Continental Coastlines: Soft parchment ivory hairline
            strokeColor = vec3<f32>(0.88, 0.86, 0.82);
            nominalAlpha = 0.35;
        }
    } else {
        // Theme 1: Light Monochrome Architectural Print
        if (in.pointType < 0.75) {
            // Hydrology: Architectural indigo-slate
            strokeColor = vec3<f32>(0.25, 0.38, 0.50);
            nominalAlpha = 0.35;
        } else {
            // Coastlines: Crisp architectural charcoal ink
            strokeColor = vec3<f32>(0.15, 0.18, 0.22);
            nominalAlpha = 0.45;
        }
    }

    let finalAlpha = nominalAlpha * coverage * in.alphaPeak * facingFade;

    return vec4<f32>(strokeColor, finalAlpha);
}
