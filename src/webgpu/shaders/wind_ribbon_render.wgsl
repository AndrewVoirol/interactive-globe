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

    // Ribbon width in CSS pixels
    // Surface winds: ultra-fine ~0.60px half-width (total ~1.2px) for fine filament texture
    // Jet stream: wider ~2.40px half-width (total ~4.8px) for continuous atmospheric river
    let baseHalfWidth = select(0.60, 2.40, isJet > 0.5) * sim.u_dpr;
    let widthAtten = select(
        clamp(p.vel.w / 16.0, 0.70, 1.25),
        clamp(p.vel.w / 40.0, 0.75, 1.60),
        isJet > 0.5
    );
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
    let edgeFeather = 1.0 - smoothstep(0.18, 0.95, lateralDist);

    var color: vec3<f32>;
    var alphaBase: f32;

    if (in.isJetStream > 0.5) {
        // High-Altitude Jet Stream (250 hPa, real speeds up to 92 m/s / 180 kt):
        // Disciplined Thermal Metal Palette (Zero magenta / candy pink)
        let normSpeed = clamp(in.speed / 80.0, 0.0, 1.0);

        if (sim.u_theme == 0u) {
            // Dark Obsidian theme:
            // Subdued slate-blue (< 35 m/s) -> Luminescent platinum-cyan (~55 m/s) -> Solar amber core (> 70 m/s)
            let coolJet = vec3<f32>(0.22, 0.50, 0.70); // Deep aerospace slate-blue
            let midJet  = vec3<f32>(0.55, 0.82, 0.92); // Luminescent platinum
            let coreJet = vec3<f32>(1.00, 0.82, 0.38); // Warm solar gold
            let peakJet = vec3<f32>(1.00, 0.94, 0.82); // Core highlight

            if (normSpeed < 0.45) {
                color = mix(coolJet, midJet, normSpeed / 0.45);
            } else if (normSpeed < 0.82) {
                color = mix(midJet, coreJet, (normSpeed - 0.45) / 0.37);
            } else {
                color = mix(coreJet, peakJet, (normSpeed - 0.82) / 0.18);
            }
        } else {
            // Light Monochrome theme: Charcoal to Deep Indigo-Navy
            let calmJet = vec3<f32>(0.42, 0.46, 0.54);
            let fastJet = vec3<f32>(0.12, 0.20, 0.38);
            let coreJet = vec3<f32>(0.04, 0.08, 0.18);
            color = mix(calmJet, fastJet, smoothstep(0.2, 0.7, normSpeed));
            color = mix(color, coreJet, smoothstep(0.7, 1.0, normSpeed));
        }
        alphaBase = 0.75;
    } else {
        // Surface Boundary Layer (10m, speeds up to 32 m/s):
        // Fine, delicate filaments hugging terrain
        let normSpeed = clamp(in.speed / 18.0, 0.0, 1.0);

        if (sim.u_theme == 0u) {
            // Subtle misty slate-pearl to crisp lunar silver
            // Low saturation prevents clashing with terrain relief or ocean blues
            let calmSurf  = vec3<f32>(0.48, 0.58, 0.68); // Muted slate-pearl
            let briskSurf = vec3<f32>(0.84, 0.90, 0.96); // Silver filament
            color = mix(calmSurf, briskSurf, normSpeed);
        } else {
            let calmSurf  = vec3<f32>(0.58, 0.60, 0.64);
            let briskSurf = vec3<f32>(0.16, 0.18, 0.22);
            color = mix(calmSurf, briskSurf, normSpeed);
        }
        // Speed-modulated opacity: calm breeze is subtle; active storms illuminate
        alphaBase = mix(0.18, 0.58, smoothstep(0.08, 0.60, normSpeed));
    }

    let finalAlpha = in.alpha * edgeFeather * alphaBase;
    return vec4<f32>(color, finalAlpha);
}
