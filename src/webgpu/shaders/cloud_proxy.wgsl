// ============================================================================
// File: src/webgpu/shaders/cloud_proxy.wgsl
// Target: WebGPU Dual-Depth Cloud Bounding Proxy Shell Pipeline (Option 1)
// Description: Renders conservative low-poly tropospheric bounding shell
//              conforming to analytical manifold deformation (evaluateManifoldCore)
//              to output hardware depth for ray entry (t_entry) and ray exit (t_exit).
// ============================================================================

struct SimUniforms {
    u_unfurl: f32,
    u_mode: u32,
    u_layerMode: u32,
    u_time: f32,
    u_cursorActive: f32,
    u_numParticles: u32,
    u_theme: u32,
    _padTheme: f32,
    u_cursorHitPos: vec4<f32>,
    u_cursorVel: vec4<f32>,
    u_viewMatrix: mat4x4<f32>,
    u_projectionMatrix: mat4x4<f32>,
    u_cameraPos: vec4<f32>,
};

@group(0) @binding(0) var<uniform> sim: SimUniforms;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) surfaceType: f32, // 0.0 = Bottom / Inner Shell, 1.0 = Top / Outer Shell
    @location(3) target2D: vec4<f32>, // xy: Mercator 2D, zw: Reserved/Unused
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var out: VertexOutput;

    // 1. Evaluate analytical manifold deformation on planetary sphere (R = 5.0)
    let def = evaluateManifoldCore(
        input.position,
        input.target2D.xy,
        sim.u_unfurl,
        sim.u_mode,
        sim.u_time,
        sim.u_cursorHitPos,
        sim.u_cursorActive,
        sim.u_cursorVel
    );

    let basePos = def.pos;
    let normal = def.normal;

    // 2. Conservative Tropospheric Extrusion
    // Inner surface (surfaceType < 0.5): offset = -0.03 (below ocean floor and bathymetric depressions)
    // Outer surface (surfaceType >= 0.5): offset = +0.25 (above maximum troposphere ceiling + mountain relief)
    let isTop = input.surfaceType >= 0.5;
    let standoff = select(-0.03, 0.25, isTop);
    let worldPos = basePos + normal * standoff;

    // 3. Project to Clip Space
    out.clipPos = sim.u_projectionMatrix * sim.u_viewMatrix * vec4<f32>(worldPos, 1.0);
    return out;
}

@fragment
fn fs_main() {
    // Pure depth-pass rasterization: WebGPU hardware writes fragment depth into depth32float
}
