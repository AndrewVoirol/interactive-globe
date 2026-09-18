// ============================================================================
// Indicatrix Engine — GPU-Driven CDLOD Quadsphere Culling & Indirect Draw WGSL
// Frustum Culling, Distance-Based LOD Range Selection, Mode 4 Dynamic Bounding
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
    minCoord: vec2<f32>,   // offset 16..24
    nodeSize: f32,         // offset 24..28
    range_L: f32,          // offset 28..32
    faceIndex: u32,        // offset 32..36
    lod: u32,              // offset 36..40
    hasChildren: u32,      // offset 40..44
    childRange_L: f32,     // offset 44..48
};

struct CDLODInstance {
    minCoord: vec2<f32>,   // offset 0..8
    nodeSize: f32,         // offset 8..12
    range_L: f32,          // offset 12..16
    center: vec3<f32>,     // offset 16..28
    radius: f32,           // offset 28..32
    faceIndex: u32,        // offset 32..36
    lod: u32,              // offset 36..40
    _pad: vec2<f32>,       // offset 40..48
};

struct CullingUniforms {
    cameraPos: vec4<f32>,              // offset 0..16
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

    // Mode 0: Planetary Horizon Occlusion Culling
    if (uniforms.mode == 0u) {
        let cDotCam = dot(node.center, uniforms.cameraPos.xyz);
        if (cDotCam + effectiveRadius * camDistToOrigin < 24.5) {
            return;
        }
    }

    if (!visible) {
        return;
    }

    // Distance from camera to node bounding sphere surface
    let camDist = length(uniforms.cameraPos.xyz - node.center);
    let surfaceDist = max(0.0, camDist - effectiveRadius);

    // Distance-Based LOD Range Selection:
    // If this node has children and the camera is close enough that children are active,
    // this node must not be rendered (its children will be rendered or further subdivided).
    if (node.hasChildren == 1u && surfaceDist < node.childRange_L) {
        return;
    }

    // If the node is outside its own LOD range, it is too far for this LOD level.
    if (surfaceDist >= node.range_L) {
        return;
    }

    // Node is selected as an active leaf in the LOD cut!
    let instanceIdx = atomicAdd(&indirectCmd.instanceCount, 1u);
    if (instanceIdx >= uniforms.maxInstances) {
        atomicStore(&indirectCmd.instanceCount, uniforms.maxInstances);
        return;
    }

    instances[instanceIdx].minCoord = node.minCoord;
    instances[instanceIdx].nodeSize = node.nodeSize;
    instances[instanceIdx].range_L = node.range_L;
    instances[instanceIdx].center = node.center;
    instances[instanceIdx].radius = effectiveRadius;
    instances[instanceIdx].faceIndex = node.faceIndex;
    instances[instanceIdx].lod = node.lod;
    instances[instanceIdx]._pad = vec2<f32>(0.0, 0.0);
}
