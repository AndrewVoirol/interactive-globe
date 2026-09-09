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
    @location(5) vertVel: f32,
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
    // Surface winds: refined ~0.95px half-width (total ~1.9px stroke) for crisp filament visibility
    // Jet stream: wider ~2.40px half-width (total ~4.8px stroke) for continuous atmospheric river
    let baseHalfWidth = select(0.95, 2.40, isJet > 0.5) * sim.u_dpr;
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
    out.vertVel = p.vel.z;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // AGENTS.md Invariant #3: Mandatory Unconditional Derivative Evaluation
    // All finite difference derivatives must be evaluated at the top of fs_main
    // in unconditional uniform control flow, strictly before any dynamic branching or discard.
    let dUv = fwidth(in.uv);
    let dVertVel = fwidth(in.vertVel);

    // In spherical globe mode, discard backfacing streamlines cleanly at the horizon
    if (sim.u_unfurl < 0.20 && in.facing < 0.02) {
        discard;
    }

    // Orographic condensation wash on windward slopes (w > 0)
    let condensation = smoothstep(0.2, 3.5, in.vertVel);

    // Lateral anti-aliasing via parabolic box-filter softened by condensation vapor
    let lateralDist = abs(in.uv.y);
    let featherMin = mix(0.18, 0.06, condensation * 0.5);
    let edgeFeather = 1.0 - smoothstep(featherMin, 0.95 + dUv.y * 0.02, lateralDist);

    var color: vec3<f32>;
    var alphaBase: f32;

    if (in.isJetStream > 0.5) {
        // High-Altitude Jet Stream (250 hPa, real speeds up to 92 m/s / 180 kt):
        // Disciplined Thermal Metal Palette (Zero magenta / candy pink)
        let normSpeed = clamp(in.speed / 80.0, 0.0, 1.0);

        if (sim.u_theme == 0u) {
            // Dark Obsidian / Marie Tharp theme:
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
            alphaBase = 0.75;
        } else if (sim.u_theme == 2u) {
            // Theme 2: Prussian Cyanotype (Blueprint architectural drafting traces)
            // Chalk cerulean (#7AA2C8) to crisp chalk ruling pen white (#E8EDF2)
            // Higher transparency (alpha ~ 0.50) suggesting blueprint drafting linework
            let ceruleanJet = vec3<f32>(0.478, 0.635, 0.784); // #7AA2C8
            let midChalk    = vec3<f32>(0.72, 0.84, 0.94);
            let coreChalk   = vec3<f32>(0.91, 0.93, 0.95);    // #E8EDF2
            color = mix(ceruleanJet, midChalk, smoothstep(0.2, 0.65, normSpeed));
            color = mix(color, coreChalk, smoothstep(0.65, 0.98, normSpeed));
            alphaBase = 0.50;
        } else {
            // Theme 1: Light Monochrome theme (Cream Rag): Charcoal to Deep Indigo-Navy
            let calmJet = vec3<f32>(0.42, 0.46, 0.54);
            let fastJet = vec3<f32>(0.12, 0.20, 0.38);
            let coreJet = vec3<f32>(0.04, 0.08, 0.18);
            color = mix(calmJet, fastJet, smoothstep(0.2, 0.7, normSpeed));
            color = mix(color, coreJet, smoothstep(0.7, 1.0, normSpeed));
            alphaBase = 0.75;
        }
    } else {
        // Surface Boundary Layer (10m, speeds up to 32 m/s):
        // Fine, delicate filaments hugging terrain
        let normSpeed = clamp(in.speed / 18.0, 0.0, 1.0);

        if (sim.u_theme == 0u) {
            // Subtle misty slate-pearl to crisp lunar silver
            // Low saturation prevents clashing with terrain relief or ocean blues
            let calmSurf  = vec3<f32>(0.56, 0.66, 0.76); // Muted slate-pearl
            let briskSurf = vec3<f32>(0.88, 0.94, 1.00); // Luminous silver filament
            color = mix(calmSurf, briskSurf, normSpeed);
            alphaBase = mix(0.38, 0.72, smoothstep(0.06, 0.60, normSpeed));
        } else if (sim.u_theme == 2u) {
            // Theme 2: Prussian Cyanotype: Chalk cerulean (#7AA2C8) to chalk white (#E8EDF2)
            let calmSurf  = vec3<f32>(0.38, 0.54, 0.70); // Muted blueprint cerulean
            let briskSurf = vec3<f32>(0.75, 0.88, 0.98); // Luminous chalk filament
            color = mix(calmSurf, briskSurf, normSpeed);
            alphaBase = mix(0.25, 0.50, smoothstep(0.06, 0.60, normSpeed));
        } else {
            let calmSurf  = vec3<f32>(0.58, 0.60, 0.64);
            let briskSurf = vec3<f32>(0.16, 0.18, 0.22);
            color = mix(calmSurf, briskSurf, normSpeed);
            alphaBase = mix(0.38, 0.72, smoothstep(0.06, 0.60, normSpeed));
        }
    }

    // Orographic condensation glaze (subtle archival moisture washes)
    if (condensation > 0.001) {
        if (sim.u_theme == 0u) {
            // Obsidian Dark Cyber / Marie Tharp: Crystalline silver mist vapor glaze
            let mistGlaze = vec3<f32>(0.92, 0.96, 1.00);
            color = mix(color, mistGlaze, condensation * 0.35);
        } else if (sim.u_theme == 2u) {
            // Prussian Cyanotype: Actinic chalk mist glaze
            let actinicGlaze = vec3<f32>(0.88, 0.93, 0.98);
            color = mix(color, actinicGlaze, condensation * 0.35);
        } else {
            // Cream Rag / Swiss Relief: Washed watercolor vapor glaze
            let vaporGlaze = vec3<f32>(0.68, 0.74, 0.80);
            color = mix(color, vaporGlaze, condensation * 0.30);
        }
        alphaBase = alphaBase + condensation * 0.18;
    }

    let finalAlpha = in.alpha * edgeFeather * alphaBase + dVertVel * 0.000001;
    return vec4<f32>(color, finalAlpha);
}
