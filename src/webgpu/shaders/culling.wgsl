// ============================================================================
// Indicatrix Engine — GPU-Driven CDLOD Quadtree Culling & Indirect Draw WGSL
// Frustum Culling, Distance-Based LOD Range Selection, Mode 4 Dynamic Bounding
// 2:1 Parametric Cylindrical CDLOD Quadtree in UV Space [0, 1] x [0, 1]
// ============================================================================

struct DrawIndexedIndirect {
    indexCount: u32,
    instanceCount: atomic<u32>,
    firstIndex: u32,
    baseVertex: i32,
    firstInstance: u32,
};

struct QuadtreeNode {
    center: vec3<f32>,     // offset 0..12
    radius: f32,           // offset 12..16
    minUV: vec2<f32>,      // offset 16..24
    sizeUV: vec2<f32>,     // offset 24..32
    lod: u32,              // offset 32..36
    morphStart: f32,       // offset 36..40
    invMorphRange: f32,    // offset 40..44
    _pad: f32,             // offset 44..48
};

struct CDLODInstance {
    minUV: vec2<f32>,      // offset 0..8
    sizeUV: vec2<f32>,     // offset 8..16
    lod: u32,              // offset 16..20
    morphStart: f32,       // offset 20..24
    invMorphRange: f32,    // offset 24..28
    lodFraction: f32,      // offset 28..32
};

struct CullingUniforms {
    cameraPos: vec4<f32>,               // offset 0..16
    frustumPlanes: array<vec4<f32>, 6>, // offset 16..112 (6 planes: ax + by + cz + d >= 0 is inside)
    fluidMaxDisplacement: f32,          // offset 112..116
    mode: u32,                          // offset 116..120
    nodeCount: u32,                     // offset 120..124
    maxInstances: u32,                  // offset 124..128
};

@group(0) @binding(0) var<uniform> uniforms: CullingUniforms;
@group(0) @binding(1) var<storage, read> nodes: array<QuadtreeNode>;
@group(0) @binding(2) var<storage, read_write> indirectCmd: DrawIndexedIndirect;
@group(0) @binding(3) var<storage, read_write> instances: array<CDLODInstance>;

@compute @workgroup_size(1)
fn cs_reset() {
    atomicStore(&indirectCmd.instanceCount, 0u);
    // Dual surface (crust + hydrosphere) 64x64 patch index count:
    // 64 * 64 quads * 2 tris * 3 indices * 2 surfaces = 49152 indices
    indirectCmd.indexCount = 49152u;
    indirectCmd.firstIndex = 0u;
    indirectCmd.baseVertex = 0;
    indirectCmd.firstInstance = 0u;
}

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let nodeIdx = global_id.x;
    if (nodeIdx >= uniforms.nodeCount) {
        return;
    }

    let node = nodes[nodeIdx];

    // Mode 4 (Fluid Advection) bounding sphere expansion:
    // Dynamically expand node bounding spheres by the maximum fluid displacement velocity
    // to prevent premature frustum clipping during severe vortex/wave displacement.
    var effectiveRadius = node.radius;
    if (uniforms.mode == 3u || uniforms.mode == 4u) {
        effectiveRadius += uniforms.fluidMaxDisplacement;
    }

    // View Frustum Culling against all 6 frustum planes
    var visible = true;
    for (var i = 0u; i < 6u; i++) {
        let plane = uniforms.frustumPlanes[i];
        let dist = dot(plane.xyz, node.center) + plane.w;
        if (dist < -effectiveRadius) {
            visible = false;
            break;
        }
    }

    let camDistToOrigin = length(uniforms.cameraPos.xyz);

    // Mode 0: Planetary Horizon Occlusion Culling (only valid on undeformed sphere when unfurl < 0.01)
    let unfurl = uniforms.cameraPos.w;
    if (uniforms.mode == 0u && unfurl < 0.01) {
        let cDotCam = dot(node.center, uniforms.cameraPos.xyz);
        if (cDotCam + effectiveRadius * camDistToOrigin < 24.5) {
            return;
        }
    }

    if (!visible) {
        return;
    }

    let instanceIdx = atomicAdd(&indirectCmd.instanceCount, 1u);
    if (instanceIdx >= uniforms.maxInstances) {
        atomicStore(&indirectCmd.instanceCount, uniforms.maxInstances);
        return;
    }

    instances[instanceIdx].minUV = node.minUV;
    instances[instanceIdx].sizeUV = node.sizeUV;
    instances[instanceIdx].lod = node.lod;
    instances[instanceIdx].morphStart = node.morphStart;
    instances[instanceIdx].invMorphRange = node.invMorphRange;
    instances[instanceIdx].lodFraction = f32(node.lod);
}
