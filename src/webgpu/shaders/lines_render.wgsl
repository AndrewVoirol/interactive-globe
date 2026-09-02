// ============================================================================
// File: src/webgpu/shaders/lines_render.wgsl
// Target: WebGPU Lines Render Pipeline (Indexed Delaunay Mesh Lattice)
// Description: Zero-copy indexed line segment rasterization with wireframe density attenuation
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
    @location(1) vFacing: f32,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let pos = in.position.xyz;
    let pointType = in.position.w;

    let worldPos = vec4<f32>(pos, 1.0);
    let viewPos = sim.u_viewMatrix * worldPos;
    out.clipPos = sim.u_projectionMatrix * viewPos;

    let dynamicNormal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos), length(pos) > 0.001);
    let viewDir = normalize(sim.u_cameraPos.xyz - pos);
    out.vFacing = dot(dynamicNormal, viewDir);
    out.vPointType = pointType;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    if (sim.u_layerMode == 1u) {
        discard; // Discard wireframe lines when in [Points Only] mode
    }

    let densityFactor = sqrt(100000.0 / max(f32(sim.u_numParticles), 1.0));
    let backfaceDimming = mix(0.15, 1.0, smoothstep(-0.5, 0.2, in.vFacing));

    let structuralWire = vec3<f32>(0.05, 0.15, 0.25);
    let geographicWire = vec3<f32>(0.25, 0.55, 0.85);
    let wireColor = mix(structuralWire, geographicWire, in.vPointType);

    let alpha = mix(0.04, 0.35, in.vPointType) * densityFactor;

    return vec4<f32>(wireColor, alpha * backfaceDimming);
}
