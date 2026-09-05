// ============================================================================
// File: src/webgpu/shaders/contour_topology.wgsl
// Target: WebGPU Contour Topology, Spherical Excess & Analytical Wrap Culling
// Architecture: Apple Silicon M4 Pro Metal Backend (SIMD32 Workgroup 256)
// Mathematical Grounding: Indicatrix Research Dossier (Frontier 2: Sections 2.1–2.6)
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

const PI: f32 = 3.14159265358979323846;
const RADIUS: f32 = 5.0;

// ============================================================================
// 1. GPU Spherical Excess Functions: Simon l'Huilier & Van Oosterom
// ============================================================================

/**
 * Evaluates chordal arcsine distance d = 2 * asin(min(1.0, ||u - v|| / 2)) on S^2
 */
fn geodesicDistanceWGSL(u: vec3<f32>, v: vec3<f32>) -> f32 {
    let lenU = length(u);
    let lenV = length(v);
    let uNorm = select(vec3<f32>(0.0, 0.0, 1.0), u / lenU, lenU > 1e-7);
    let vNorm = select(vec3<f32>(0.0, 0.0, 1.0), v / lenV, lenV > 1e-7);
    let chord = length(uNorm - vNorm);
    let sinHalf = clamp(chord * 0.5, 0.0, 1.0);
    return 2.0 * asin(sinHalf);
}

/**
 * Van Oosterom & Strackee (1983) scalar triple product formula for sliver triangles
 */
fn computeSphericalExcessVanOosteromWGSL(vA: vec3<f32>, vB: vec3<f32>, vC: vec3<f32>) -> f32 {
    let lenA = length(vA);
    let lenB = length(vB);
    let lenC = length(vC);
    let uA = select(vec3<f32>(0.0, 0.0, 1.0), vA / lenA, lenA > 1e-7);
    let uB = select(vec3<f32>(0.0, 0.0, 1.0), vB / lenB, lenB > 1e-7);
    let uC = select(vec3<f32>(0.0, 0.0, 1.0), vC / lenC, lenC > 1e-7);

    let crossBC = cross(uB, uC);
    let num = abs(dot(uA, crossBC));
    let den = 1.0 + dot(uA, uB) + dot(uB, uC) + dot(uC, uA);
    return 2.0 * atan2(num, den);
}

/**
 * Simon l'Huilier spherical excess with Van Oosterom fallback for sliver triangles.
 * Computes solid angle DeltaOmega = E * radius^2 in steradians / area units.
 */
fn sphericalTriangleExcessWGSL(vA: vec3<f32>, vB: vec3<f32>, vC: vec3<f32>, radius: f32) -> f32 {
    let c = geodesicDistanceWGSL(vA, vB);
    let a = geodesicDistanceWGSL(vB, vC);
    let b = geodesicDistanceWGSL(vA, vC);

    let s = (a + b + c) * 0.5;
    let sa = s - a;
    let sb = s - b;
    let sc = s - c;

    // Degenerate triangle guard
    if (sa <= 0.0 || sb <= 0.0 || sc <= 0.0 || s <= 0.0) {
        return 0.0;
    }

    // Antipodal / hemisphere boundary guard
    if (s >= PI) {
        return 0.0;
    }

    // Subtractive cancellation guard: switch to Van Oosterom & Strackee when min(s-a,s-b,s-c) < 1e-6
    let minDiff = min(sa, min(sb, sc));
    if (minDiff < 1e-6) {
        let E_vo = computeSphericalExcessVanOosteromWGSL(vA, vB, vC);
        return E_vo * radius * radius;
    }

    let tan_s2  = tan(s * 0.5);
    let tan_sa2 = tan(sa * 0.5);
    let tan_sb2 = tan(sb * 0.5);
    let tan_sc2 = tan(sc * 0.5);

    let prod = tan_s2 * tan_sa2 * tan_sb2 * tan_sc2;
    if (prod <= 0.0) {
        return 0.0;
    }

    let tan_E4 = sqrt(prod);
    let E = 4.0 * atan(tan_E4);
    return E * radius * radius;
}

// ============================================================================
// 2. Analytical Cross-Seam Wrap Guard (Defense-in-Depth)
// ============================================================================

/**
 * Detects residual cross-seam segments that jump the antimeridian or Dymaxion cut boundaries.
 */
fn isCrossSeamSegment(target2DA: vec4<f32>, target2DB: vec4<f32>, mode: u32) -> bool {
    if (mode == 1u) {
        // Mode 1 Cylindrical Scroll: longitudinal Mercator jump > pi * R (~15.7)
        let deltaX = abs(target2DA.x - target2DB.x);
        if (deltaX > 15.0) {
            return true; // Cull screen-spanning antimeridian streak
        }
    } else if (mode == 4u) {
        // Mode 4 Fuller Dymaxion: net distance > facet edge length (~0.85)
        let deltaDym = target2DA.zw - target2DB.zw;
        if (dot(deltaDym, deltaDym) > 0.75) {
            return true; // Cull spiderweb streak crossing cut edges
        }
    }
    return false;
}

// ============================================================================
// 3. Render Pipeline Shaders: Line Rasterization with Wrap Culling
// ============================================================================

struct VertexInput {
    @location(0) pos_3d: vec4<f32>,       // xyz: sphere pos, w: type (normalized elevation)
    @location(1) target2d: vec4<f32>,     // xy: Mercator 2D, zw: Dymaxion 2D
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) normElev: f32,
    @location(1) worldZ: f32,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;

    let clampedUnfurl = clamp(sim.u_unfurl, 0.0, 1.0);
    let ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);
    let pos3D = in.pos_3d.xyz;
    let pos2D = vec3<f32>(in.target2d.x, in.target2d.y, 0.015);
    let dymaxion2D = vec3<f32>(in.target2d.z, in.target2d.w, 0.015);

    var worldPos: vec3<f32>;

    if (sim.u_mode == 4u) {
        // Mode 4 Fuller Dymaxion
        let arch = sin(PI * clampedUnfurl) * 0.45;
        let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);
        worldPos = mix(pos3D, dymaxion2D, ease) + sphereNorm * arch;
    } else if (sim.u_mode == 1u) {
        // Mode 1 Cylindrical Scroll
        let curR = max(length(pos3D), 0.001);
        let lambda = atan2(pos3D.x, pos3D.z);
        let phi = asin(clamp(pos3D.y / curR, -1.0, 1.0));
        let oneMinusT = 1.0 - ease;
        if (oneMinusT > 0.001) {
            let curAngle = oneMinusT * lambda;
            let invOneMinusT = 1.0 / oneMinusT;
            let curX = (curR * invOneMinusT) * sin(curAngle);
            let curZ = (curR * cos(phi) * invOneMinusT) * (cos(curAngle) - 1.0) + (curR * cos(phi) * oneMinusT);
            let curY = mix(pos3D.y, pos2D.y, ease);
            worldPos = vec3<f32>(curX, curY, curZ);
        } else {
            worldPos = vec3<f32>(pos2D.x, pos2D.y, 0.015);
        }
    } else {
        // Mode 0: Linear Mix
        worldPos = mix(pos3D, pos2D, ease);
    }

    let clip = sim.u_projectionMatrix * sim.u_viewMatrix * vec4<f32>(worldPos, 1.0);
    out.clipPos = clip;
    out.normElev = in.pos_3d.w;
    out.worldZ = worldPos.z;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let h = in.normElev;
    var color: vec3<f32>;

    if (sim.u_theme == 1u) {
        // Light Monochrome Theme
        if (h < 0.5525) {
            // Bathymetric: subtle slate-indigo
            color = mix(vec3<f32>(0.15, 0.25, 0.40), vec3<f32>(0.35, 0.45, 0.60), h / 0.5525);
        } else {
            // Topographic: warm charcoal-ochre
            color = mix(vec3<f32>(0.25, 0.20, 0.15), vec3<f32>(0.10, 0.10, 0.10), (h - 0.5525) / 0.4475);
        }
    } else {
        // Obsidian Dark Cyber Theme
        if (h < 0.5525) {
            // Bathymetry: deep cyan to electric sapphire
            color = mix(vec3<f32>(0.02, 0.20, 0.45), vec3<f32>(0.00, 0.65, 0.85), h / 0.5525);
        } else {
            // Topography: luminous emerald to bright gold-amber
            color = mix(vec3<f32>(0.05, 0.75, 0.45), vec3<f32>(0.95, 0.75, 0.20), (h - 0.5525) / 0.4475);
        }
    }

    return vec4<f32>(color, 0.85);
}

// ============================================================================
// 4. Compute Shader: SIMD32 Workgroup 256 Spherical Excess Evaluator
// ============================================================================

struct TriangleInput {
    vA: vec4<f32>,
    vB: vec4<f32>,
    vC: vec4<f32>,
};

struct ExcessOutput {
    solidAngle: f32,
    pad0: f32,
    pad1: f32,
    pad2: f32,
};

@group(0) @binding(1) var<storage, read> inTriangles: array<TriangleInput>;
@group(0) @binding(2) var<storage, read_write> outExcess: array<ExcessOutput>;

@compute @workgroup_size(256)
fn cs_spherical_excess(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= arrayLength(&inTriangles)) {
        return;
    }

    let tri = inTriangles[idx];
    let area = sphericalTriangleExcessWGSL(tri.vA.xyz, tri.vB.xyz, tri.vC.xyz, 1.0);
    outExcess[idx].solidAngle = area;
    outExcess[idx].pad0 = 0.0;
    outExcess[idx].pad1 = 0.0;
    outExcess[idx].pad2 = 0.0;
}
