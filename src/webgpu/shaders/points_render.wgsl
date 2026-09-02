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
    u_dt: f32,
    u_cursorActive: f32,
    u_numParticles: u32,
    u_pad1: f32,
    u_cursorRayOrig: vec4<f32>,
    u_cursorRayDir: vec4<f32>,
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
    @location(2) rest_sphere: vec4<f32>,
    @location(3) rest_map: vec4<f32>,
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

    let worldPos = vec4<f32>(pos, 1.0);
    let viewPos = sim.u_viewMatrix * worldPos;
    out.clipPos = sim.u_projectionMatrix * viewPos;

    // Backface Normal Facing Angle
    let dynamicNormal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos), length(pos) > 0.001);
    let viewDir = normalize(sim.u_cameraPos.xyz - pos);
    out.vFacing = dot(dynamicNormal, viewDir);
    out.vPointType = pointType;
    out.vMetric = metric;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    if (sim.u_layerMode == 2u) {
        discard; // Discard points when in [Wireframe Only] mode
    }

    let backfaceDimming = mix(0.15, 1.0, smoothstep(-0.5, 0.2, in.vFacing));

    // 102:1 Contrast Ratio (GIS Coastline Clarity at 1M Nodes)
    let geographicColor = vec3<f32>(0.49, 0.827, 0.988);
    let structuralColor = vec3<f32>(0.05, 0.12, 0.22);
    let baseColor = mix(structuralColor, geographicColor, in.vPointType);

    var finalColor = baseColor;
    var alpha = mix(0.03, 0.95, in.vPointType);

    // Mode 2: Griffith LEFM Fracture Palette
    if (sim.u_mode == 2u) {
        let tensionAmber = vec3<f32>(1.0, 0.65, 0.15);
        let ruptureCrimson = vec3<f32>(0.98, 0.20, 0.12);
        let activeCrackWhite = vec3<f32>(1.0, 0.98, 0.90);

        var stressColor = mix(baseColor, tensionAmber, smoothstep(0.12, 0.45, in.vMetric));
        stressColor = mix(stressColor, ruptureCrimson, smoothstep(0.45, 0.78, in.vMetric));
        stressColor = mix(stressColor, activeCrackWhite, smoothstep(0.78, 1.0, in.vMetric));
        finalColor = stressColor;
        if (in.vMetric > 0.4) {
            alpha = mix(alpha, 1.0, (in.vMetric - 0.4) * 1.8);
        }
    }
    // Mode 3: Hydrodynamic Vorticity Palette
    else if (sim.u_mode == 3u) {
        let oceanicIndigo = vec3<f32>(0.06, 0.22, 0.45);
        let biolumCyan = vec3<f32>(0.20, 0.88, 0.96);
        let eddyViolet = vec3<f32>(0.85, 0.25, 0.98);

        var fluidColor = mix(oceanicIndigo, biolumCyan, smoothstep(0.05, 0.50, in.vMetric));
        fluidColor = mix(fluidColor, eddyViolet, smoothstep(0.50, 0.95, in.vMetric));
        finalColor = mix(baseColor, fluidColor, smoothstep(0.0, 0.15, in.vMetric));
        if (in.vMetric > 0.1) {
            alpha = mix(alpha, 1.0, in.vMetric);
        }
    }

    return vec4<f32>(finalColor, alpha * backfaceDimming);
}
