// ============================================================================
// File: src/webgpu/shaders/points_render.wgsl
// Target: WebGPU Points Render Pipeline (Direct Compute Storage Buffer Ingestion)
// Description: Zero-copy rendering of 1,000,000 point sprites with GIS contrast & backface dimming
// ============================================================================

struct SimUniforms {
    u_unfurl: f32,
    u_mode: u32,
    u_layerMode: u32,
    u_time: f32,
    u_cursorActive: f32,
    u_numParticles: u32,
    u_theme: u32,            // 0 = Dark Cyber, 1 = Light Monochrome
    u_cursorHitPos: vec4<f32>,
    u_cursorVel: vec4<f32>,
    u_viewMatrix: mat4x4<f32>,
    u_projectionMatrix: mat4x4<f32>,
    u_cameraPos: vec4<f32>,
};

@group(0) @binding(0) var<uniform> sim: SimUniforms;

struct VertexInput {
    @location(0) position: vec4<f32>,     // xyz: Position, w: pointType
    @location(1) velocity: vec4<f32>,     // xyz: Velocity, w: metric
    // @location(2) rest_sphere: vec4<f32> (Separated into dedicated staticParticles storage buffer)
    // @location(3) rest_map: vec4<f32> (Separated into dedicated staticParticles storage buffer)
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) vPointType: f32,
    @location(1) vMetric: f32,
    @location(2) vFacing: f32,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let pos = in.position.xyz;
    let pointType = in.position.w;
    let metric = in.velocity.w;

    var dynamicNormal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos), length(pos) > 0.001);
    dynamicNormal = normalize(mix(dynamicNormal, vec3<f32>(0.0, 0.0, 1.0), sim.u_unfurl));

    // Slight radial offset above terrain to eliminate depth-fighting against 3D crust mesh
    let offsetPos = pos + dynamicNormal * (0.005 * (1.0 - sim.u_unfurl * 0.5));
    let worldPos = vec4<f32>(offsetPos, 1.0);
    let viewPos = sim.u_viewMatrix * worldPos;
    out.clipPos = sim.u_projectionMatrix * viewPos;

    let viewDir = normalize(sim.u_cameraPos.xyz - pos);
    out.vFacing = dot(dynamicNormal, viewDir);
    out.vPointType = pointType;
    out.vMetric = metric;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    if (sim.u_layerMode == 2u) {
        discard;
    }
    let backfaceDimming = mix(0.15, 1.0, smoothstep(-0.5, 0.2, in.vFacing));

    // Theme Palette: 0 = Obsidian & Celestial Platinum, 1 = Light Monochrome
    var geographicColor = vec3<f32>(0.49, 0.827, 0.988);
    var structuralColor = vec3<f32>(0.05, 0.12, 0.22);
    var baseAlpha = select(mix(0.03, 0.35, in.vPointType), mix(0.05, 0.95, in.vPointType), sim.u_layerMode == 1u);

    if (sim.u_theme == 0u) {
        // Theme 0: Obsidian & Celestial Platinum
        geographicColor = vec3<f32>(0.92, 0.90, 0.87);
        structuralColor = vec3<f32>(0.12, 0.15, 0.20);
    } else if (sim.u_theme == 1u) {
        // Light Monochrome: Architectural Charcoal Land on Misty Silver Ocean
        geographicColor = vec3<f32>(0.08, 0.09, 0.11);
        structuralColor = vec3<f32>(0.82, 0.85, 0.89);
        baseAlpha = select(mix(0.08, 0.35, in.vPointType), mix(0.12, 0.95, in.vPointType), sim.u_layerMode == 1u);
    }

    let baseColor = mix(structuralColor, geographicColor, in.vPointType);
    var finalColor = baseColor;
    var alpha = baseAlpha;

    // Mode 2: Griffith LEFM Fracture Palette
    if (sim.u_mode == 2u) {
        if (sim.u_theme == 1u) {
            let warmUmber = vec3<f32>(0.45, 0.25, 0.15);
            let carbonInk = vec3<f32>(0.02, 0.02, 0.02);
            finalColor = mix(baseColor, warmUmber, smoothstep(0.15, 0.55, in.vMetric));
            finalColor = mix(finalColor, carbonInk, smoothstep(0.55, 0.90, in.vMetric));
        } else {
            let tensionAmber = vec3<f32>(0.78, 0.43, 0.32);
            let ruptureCrimson = vec3<f32>(0.85, 0.28, 0.20);
            let activeCrackWhite = vec3<f32>(0.98, 0.96, 0.92);

            var stressColor = mix(baseColor, tensionAmber, smoothstep(0.12, 0.45, in.vMetric));
            stressColor = mix(stressColor, ruptureCrimson, smoothstep(0.45, 0.78, in.vMetric));
            stressColor = mix(stressColor, activeCrackWhite, smoothstep(0.78, 1.0, in.vMetric));
            finalColor = stressColor;
        }
        if (in.vMetric > 0.4) {
            alpha = mix(alpha, 1.0, (in.vMetric - 0.4) * 1.8);
        }
    }
    // Mode 3: Hydrodynamic Vorticity Palette
    else if (sim.u_mode == 3u) {
        if (sim.u_theme == 1u) {
            let charcoalStreamline = vec3<f32>(0.35, 0.38, 0.42);
            let obsidianCore = vec3<f32>(0.02, 0.03, 0.05);
            let fluidGray = mix(charcoalStreamline, obsidianCore, smoothstep(0.3, 0.9, in.vMetric));
            finalColor = mix(baseColor, fluidGray, smoothstep(0.05, 0.4, in.vMetric));
        } else {
            let oceanicIndigo = vec3<f32>(0.10, 0.14, 0.22);
            let biolumCyan = vec3<f32>(0.42, 0.68, 0.82);
            let eddyViolet = vec3<f32>(0.55, 0.48, 0.72);

            var fluidColor = mix(oceanicIndigo, biolumCyan, smoothstep(0.05, 0.50, in.vMetric));
            fluidColor = mix(fluidColor, eddyViolet, smoothstep(0.50, 0.95, in.vMetric));
            finalColor = mix(baseColor, fluidColor, smoothstep(0.0, 0.15, in.vMetric));
        }
        if (in.vMetric > 0.1) {
            alpha = mix(alpha, 1.0, in.vMetric);
        }
    }

    let camDist = length(sim.u_cameraPos.xyz);
    let distAtten = select(1.0, 1.0 - smoothstep(18.0, 45.0, camDist) * 0.70, sim.u_layerMode == 0u);

    return vec4<f32>(finalColor, alpha * backfaceDimming * distAtten);
}
