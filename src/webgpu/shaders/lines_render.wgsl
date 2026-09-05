// ============================================================================
// File: src/webgpu/shaders/lines_render.wgsl
// Target: WebGPU Lines Render Pipeline (Indexed Delaunay Mesh & Isoline Contours)
// Description: Zero-copy indexed line segment rasterization with hypsometric/bathymetric tinting
// ============================================================================

struct SimUniforms {
    u_unfurl: f32,
    u_mode: u32,
    u_layerMode: u32,
    u_time: f32,
    u_cursorActive: f32,
    u_numParticles: u32,
    u_theme: u32,            // 0 = Dark Obsidian, 1 = Light Monochrome (swisstopo)
    u_cursorHitPos: vec4<f32>,
    u_cursorVel: vec4<f32>,
    u_viewMatrix: mat4x4<f32>,
    u_projectionMatrix: mat4x4<f32>,
    u_cameraPos: vec4<f32>,
};

@group(0) @binding(0) var<uniform> sim: SimUniforms;

struct VertexInput {
    @location(0) position: vec4<f32>,     // xyz: Position, w: pointType / normalized elevation
    @location(1) velocity: vec4<f32>,     // xyz: Velocity, w: metric
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) vPointType: f32,
    @location(1) vFacing: f32,
    @location(2) vElevation: f32,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let pos = in.position.xyz;
    let pointType = in.position.w;

    let worldPos = vec4<f32>(pos, 1.0);
    let viewPos = sim.u_viewMatrix * worldPos;
    out.clipPos = sim.u_projectionMatrix * viewPos;

    var dynamicNormal = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos), length(pos) > 0.001);
    dynamicNormal = normalize(mix(dynamicNormal, vec3<f32>(0.0, 0.0, 1.0), sim.u_unfurl));
    let viewDir = normalize(sim.u_cameraPos.xyz - pos);
    out.vFacing = dot(dynamicNormal, viewDir);
    out.vPointType = pointType;
    out.vElevation = pointType * 19772.0 - 10924.0; // Map [0, 1] to [-10924m .. +8848m]

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    if (sim.u_layerMode == 1u) {
        discard;
    }
    let densityFactor = sqrt(100000.0 / max(f32(sim.u_numParticles), 1.0));
    let backfaceDimming = mix(0.18, 1.0, smoothstep(-0.4, 0.2, in.vFacing));

    var wireColor = vec3<f32>(0.35, 0.42, 0.52);
    var alpha = 0.35;

    if (sim.u_theme == 1u) {
        // Light Monochrome (swisstopo): Subtle graphite isobaths
        let h = in.vElevation;
        if (h < 0.0) {
            wireColor = vec3<f32>(0.45, 0.58, 0.70); // Bathymetric blue-gray
            alpha = 0.28;
        } else if (h < 1000.0) {
            wireColor = vec3<f32>(0.55, 0.52, 0.48); // Lowland sepia-graphite
            alpha = 0.32;
        } else {
            wireColor = vec3<f32>(0.35, 0.33, 0.30); // Alpine dark charcoal
            alpha = 0.45;
        }
    } else {
        // Dark Obsidian with Hypsometric Depth Tint
        let h = in.vElevation;
        if (h < -3000.0) {
            wireColor = vec3<f32>(0.10, 0.25, 0.55); // Abyssal navy
            alpha = 0.40;
        } else if (h < 0.0) {
            wireColor = vec3<f32>(0.15, 0.65, 0.75); // Continental shelf cyan
            alpha = 0.45;
        } else if (h < 1500.0) {
            wireColor = vec3<f32>(0.85, 0.65, 0.25); // Highland amber/ochre
            alpha = 0.50;
        } else {
            wireColor = vec3<f32>(0.92, 0.95, 0.98); // Alpine platinum/snow
            alpha = 0.65;
        }
    }

    let finalAlpha = alpha * densityFactor * backfaceDimming;
    return vec4<f32>(wireColor, clamp(finalAlpha, 0.01, 1.0));
}
