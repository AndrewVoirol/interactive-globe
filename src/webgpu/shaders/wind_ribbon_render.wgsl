// ============================================================================
// File: src/webgpu/shaders/wind_ribbon_render.wgsl
// Target: WebGPU Instanced Vector Ribbon Render Pipeline
// Description: Zero-copy rendering of multi-stratum wind streamlines extruded as
//              screen-space anti-aliased 3D ribbon quads from particle history buffers.
// ============================================================================

struct SimUniforms {
    u_unfurl: f32,
    u_mode: u32,
    u_theme: u32,             // 0 = Obsidian Dark Cyber, 1 = Light Monochrome
    u_time: f32,
    u_viewport: vec4<f32>,     // x: width_px, y: height_px, z: 1/width, w: 1/height
    u_cameraPos: vec4<f32>,
    u_cursorHitPos: vec4<f32>,
    u_cursorVel: vec4<f32>,
    u_cursorActive: f32,
    u_displacementScale: f32,
    u_halfWidthPx: f32,
    u_dpr: f32,
    u_nearPlane: f32,
    u_pad0: f32,
    u_pad1: f32,
    u_pad2: f32,
    u_viewMatrix: mat4x4<f32>,
    u_projectionMatrix: mat4x4<f32>,
};

struct WindParticle {
    pos: vec4<f32>,      // x: lonRad, y: latRad, z: altitudeOffset, w: normalizedAge [0..1]
    vel: vec4<f32>,      // x: uMps, y: vMps, z: wMps, w: speedMagnitude
    history0: vec4<f32>, // xyz: worldPos 0, w: alpha
    history1: vec4<f32>, // xyz: worldPos 1, w: alpha
    history2: vec4<f32>, // xyz: worldPos 2, w: alpha
    history3: vec4<f32>, // xyz: worldPos 3, w: alpha
};

@group(0) @binding(0) var<uniform> sim: SimUniforms;
@group(0) @binding(1) var<storage, read> particles: array<WindParticle>;

struct VertexInput {
    // Quad corner: x in [0, 1] along segment, y in [-1, 1] across segment
    @location(0) corner: vec2<f32>,
    @builtin(instance_index) instanceIdx: u32,
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) alpha: f32,
    @location(2) speed: f32,
    @location(3) isJetStream: f32,
    @location(4) facing: f32,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;

    let particleIdx = in.instanceIdx / 3u;
    let segIdx = in.instanceIdx % 3u;

    if (particleIdx >= arrayLength(&particles)) {
        out.clipPos = vec4<f32>(0.0, 0.0, -1.0, 0.0);
        return out;
    }

    let p = particles[particleIdx];
    let isJet = select(0.0, 1.0, p.pos.z > 0.1);

    var ptA = p.history0;
    var ptB = p.history1;
    if (segIdx == 1u) {
        ptA = p.history1;
        ptB = p.history2;
    } else if (segIdx == 2u) {
        ptA = p.history2;
        ptB = p.history3;
    }

    // Degenerate checks: if segment alpha too low, endpoints identical, or crossing flat map seam
    let segLenSq = dot(ptA.xyz - ptB.xyz, ptA.xyz - ptB.xyz);
    if (ptA.w <= 0.01 || ptB.w <= 0.01 || segLenSq < 0.000001 || segLenSq > 2.5) {
        out.clipPos = vec4<f32>(0.0, 0.0, -1.0, 0.0);
        return out;
    }

    // Clip-space projection
    var clipA = sim.u_projectionMatrix * sim.u_viewMatrix * vec4<f32>(ptA.xyz, 1.0);
    var clipB = sim.u_projectionMatrix * sim.u_viewMatrix * vec4<f32>(ptB.xyz, 1.0);

    let nearGuard = max(sim.u_nearPlane, 0.05);
    let wA_ok = clipA.w >= nearGuard;
    let wB_ok = clipB.w >= nearGuard;

    if (!wA_ok && !wB_ok) {
        out.clipPos = vec4<f32>(0.0, 0.0, -1.0, 0.0);
        return out;
    }

    if (!wA_ok && wB_ok) {
        let t = (nearGuard - clipA.w) / (clipB.w - clipA.w);
        clipA = mix(clipA, clipB, t);
        clipA.w = nearGuard;
    } else if (wA_ok && !wB_ok) {
        let t = (nearGuard - clipA.w) / (clipB.w - clipA.w);
        clipB = mix(clipA, clipB, t);
        clipB.w = nearGuard;
    }

    // Screen-space NDC coordinates
    let ndcA = clipA.xy / clipA.w;
    let ndcB = clipB.xy / clipB.w;

    let vpSize = sim.u_viewport.xy;
    let screenA = (ndcA * 0.5 + 0.5) * vpSize;
    let screenB = (ndcB * 0.5 + 0.5) * vpSize;

    let dirPx = screenB - screenA;
    let lenPx = max(length(dirPx), 0.001);
    let unitDir = dirPx / lenPx;
    let unitNorm = vec2<f32>(-unitDir.y, unitDir.x);

    // Ribbon width in CSS pixels (Surface winds ~1.2px, Jet Stream ~1.8px)
    let baseHalfWidth = select(1.2, 1.8, isJet > 0.5) * sim.u_dpr;
    let widthAtten = clamp(p.vel.w / 26.0, 0.75, 1.40); // Scaled with speed
    let halfW = baseHalfWidth * widthAtten;

    let u = in.corner.x; // [0..1] along segment
    let v = in.corner.y; // [-1..1] across segment

    let centerPx = mix(screenA, screenB, u);
    let offsetPx = unitNorm * (v * halfW);
    let finalPx = centerPx + offsetPx;

    // Convert back to NDC and clip coordinates
    let finalNdc = (finalPx / vpSize) * 2.0 - 1.0;
    let finalW = mix(clipA.w, clipB.w, u);

    out.clipPos = vec4<f32>(finalNdc * finalW, mix(clipA.z, clipB.z, u), finalW);
    out.uv = in.corner;
    out.alpha = mix(ptA.w, ptB.w, u); // Smooth continuous head-to-tail alpha interpolation
    out.speed = p.vel.w;
    out.isJetStream = isJet;

    // Normal facing calculation across both spherical and flat manifold states
    let midWorld = mix(ptA.xyz, ptB.xyz, u);
    let sphereNorm = normalize(midWorld);
    let flatNorm = vec3<f32>(0.0, 0.0, 1.0);
    let surfNorm = normalize(mix(sphereNorm, flatNorm, clamp(sim.u_unfurl * 2.0, 0.0, 1.0)));
    let viewDir = normalize(sim.u_cameraPos.xyz - midWorld);
    out.facing = dot(surfNorm, viewDir);

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // In spherical globe mode, discard backfacing streamlines cleanly at the horizon
    if (sim.u_unfurl < 0.20 && in.facing < 0.02) {
        discard;
    }

    // Lateral anti-aliasing via parabolic box-filter
    let lateralDist = abs(in.uv.y);
    let edgeFeather = 1.0 - smoothstep(0.20, 0.95, lateralDist);

    var color: vec3<f32>;
    let normSpeed = clamp(in.speed / 35.0, 0.0, 1.0);

    if (in.isJetStream > 0.5) {
        // High-Altitude Jet Stream Palette:
        // Luminous Platinum Cyan to Solar Amber / Electric Violet
        if (sim.u_theme == 0u) {
            // Dark Obsidian theme: Electric Cyan -> Luminescent Amber -> Violet
            let calmJet = vec3<f32>(0.28, 0.78, 0.95);
            let fastJet = vec3<f32>(0.98, 0.82, 0.32);
            let coreJet = vec3<f32>(0.95, 0.45, 0.88);
            color = mix(calmJet, fastJet, smoothstep(0.2, 0.7, normSpeed));
            color = mix(color, coreJet, smoothstep(0.7, 1.0, normSpeed));
        } else {
            // Light Monochrome theme: Charcoal to Rich Indigo
            let calmJet = vec3<f32>(0.45, 0.48, 0.55);
            let fastJet = vec3<f32>(0.12, 0.18, 0.32);
            color = mix(calmJet, fastJet, normSpeed);
        }
    } else {
        // Surface Boundary Layer Palette:
        // Luminous cyan-white streamlines hugging terrain with high contrast
        if (sim.u_theme == 0u) {
            let calmSurf = vec3<f32>(0.38, 0.70, 0.95);
            let briskSurf = vec3<f32>(0.85, 0.95, 1.00);
            color = mix(calmSurf, briskSurf, normSpeed);
        } else {
            let calmSurf = vec3<f32>(0.50, 0.54, 0.60);
            let briskSurf = vec3<f32>(0.10, 0.12, 0.16);
            color = mix(calmSurf, briskSurf, normSpeed);
        }
    }

    let alphaBase = select(0.78, 0.65, in.isJetStream > 0.5);
    let finalAlpha = in.alpha * edgeFeather * alphaBase;
    return vec4<f32>(color, finalAlpha);
}
