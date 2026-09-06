// ============================================================================
// File: src/webgpu/shaders/origami_crane.wgsl
// Target: WebGPU Origami Paper Crane & Flight Crease Trail Render Pipeline
// Description: Renders the low-poly folded paper crane geometry with dynamic wing flex,
//              Imhof cartographic lighting (315° NW sun), and terrain shadow projection.
// ============================================================================

struct CraneUniforms {
    u_worldPos: vec4<f32>,     // xyz: position, w: wingFlex angle
    u_forward: vec4<f32>,      // xyz: forward vector, w: airspeed
    u_up: vec4<f32>,           // xyz: surface normal up vector, w: variometer
    u_right: vec4<f32>,        // xyz: right vector, w: roll angle
    u_shadowPos: vec4<f32>,    // xyz: terrain ground shadow position, w: altitude (m)
    u_viewMatrix: mat4x4<f32>,
    u_projectionMatrix: mat4x4<f32>,
    u_cameraPos: vec4<f32>,
    u_theme: u32,              // 0 = Obsidian Dark, 1 = Light Monochrome
    u_isShadowPass: u32,       // 0 = Main Crane, 1 = Ground Shadow
    u_unfurl: f32,             // Cartographic morph progress [0..1]
    u_pad1: f32,
};

@group(0) @binding(0) var<uniform> crane: CraneUniforms;

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) viewDir: vec3<f32>,
    @location(2) foldShading: f32,
    @location(3) isShadow: f32,
};

// Procedural 14-facet folded origami crane geometry
// 14 triangles = 42 vertices
fn getCraneVertex(vertexIndex: u32, S: f32) -> vec4<f32> {
    // Key origami vertices
    let vBeak       = vec3<f32>( 0.00,  0.035,  0.130) * S;
    let vNeckBase   = vec3<f32>( 0.00,  0.015,  0.045) * S;
    let vBodyCenter = vec3<f32>( 0.00, -0.010,  0.000) * S;
    let vBodyTop    = vec3<f32>( 0.00,  0.020, -0.010) * S;
    let vTailTip    = vec3<f32>( 0.00,  0.028, -0.120) * S;
    let vTailBase   = vec3<f32>( 0.00,  0.005, -0.045) * S;

    // Wing fold hinges
    let vLeftHinge  = vec3<f32>(-0.025,  0.012,  0.005) * S;
    let vRightHinge = vec3<f32>( 0.025,  0.012,  0.005) * S;

    // Wing tips (with wing flex applied)
    let flex = crane.u_worldPos.w;
    let flexOffset = flex * 0.06 * S;

    let vLeftWingTip  = vec3<f32>(-0.165,  0.045 + flexOffset,  0.010) * S;
    let vRightWingTip = vec3<f32>( 0.165,  0.045 + flexOffset,  0.010) * S;
    let vLeftWingMid  = vec3<f32>(-0.095,  0.028 + flexOffset * 0.5, -0.035) * S;
    let vRightWingMid = vec3<f32>( 0.095,  0.028 + flexOffset * 0.5, -0.035) * S;

    // Triangles:
    // 0: Neck Left (vBeak, vNeckBase, vBodyTop)
    // 1: Neck Right (vBeak, vBodyTop, vNeckBase)
    // 2: Body Left (vBodyTop, vNeckBase, vLeftHinge)
    // 3: Body Right (vBodyTop, vRightHinge, vNeckBase)
    // 4: Body Keel Left (vNeckBase, vBodyCenter, vLeftHinge)
    // 5: Body Keel Right (vNeckBase, vRightHinge, vBodyCenter)
    // 6: Left Wing Front (vLeftHinge, vLeftWingTip, vLeftWingMid)
    // 7: Left Wing Back (vLeftHinge, vLeftWingMid, vTailBase)
    // 8: Right Wing Front (vRightHinge, vRightWingMid, vRightWingTip)
    // 9: Right Wing Back (vRightHinge, vTailBase, vRightWingMid)
    // 10: Tail Top Left (vBodyTop, vLeftHinge, vTailTip)
    // 11: Tail Top Right (vBodyTop, vTailTip, vRightHinge)
    // 12: Tail Keel Left (vLeftHinge, vTailBase, vTailTip)
    // 13: Tail Keel Right (vRightHinge, vTailTip, vTailBase)

    let tri = vertexIndex / 3u;
    let vert = vertexIndex % 3u;

    var pos = vec3<f32>(0.0);
    var foldTone: f32 = 1.0;

    switch (tri) {
        case 0u: {
            if (vert == 0u) { pos = vBeak; } else if (vert == 1u) { pos = vNeckBase; } else { pos = vBodyTop; }
            foldTone = 0.95;
        }
        case 1u: {
            if (vert == 0u) { pos = vBeak; } else if (vert == 1u) { pos = vBodyTop; } else { pos = vNeckBase; }
            foldTone = 0.88;
        }
        case 2u: {
            if (vert == 0u) { pos = vBodyTop; } else if (vert == 1u) { pos = vNeckBase; } else { pos = vLeftHinge; }
            foldTone = 1.0;
        }
        case 3u: {
            if (vert == 0u) { pos = vBodyTop; } else if (vert == 1u) { pos = vRightHinge; } else { pos = vNeckBase; }
            foldTone = 0.85;
        }
        case 4u: {
            if (vert == 0u) { pos = vNeckBase; } else if (vert == 1u) { pos = vBodyCenter; } else { pos = vLeftHinge; }
            foldTone = 0.80;
        }
        case 5u: {
            if (vert == 0u) { pos = vNeckBase; } else if (vert == 1u) { pos = vRightHinge; } else { pos = vBodyCenter; }
            foldTone = 0.75;
        }
        case 6u: {
            if (vert == 0u) { pos = vLeftHinge; } else if (vert == 1u) { pos = vLeftWingTip; } else { pos = vLeftWingMid; }
            foldTone = 1.02;
        }
        case 7u: {
            if (vert == 0u) { pos = vLeftHinge; } else if (vert == 1u) { pos = vLeftWingMid; } else { pos = vTailBase; }
            foldTone = 0.92;
        }
        case 8u: {
            if (vert == 0u) { pos = vRightHinge; } else if (vert == 1u) { pos = vRightWingMid; } else { pos = vRightWingTip; }
            foldTone = 0.82;
        }
        case 9u: {
            if (vert == 0u) { pos = vRightHinge; } else if (vert == 1u) { pos = vTailBase; } else { pos = vRightWingMid; }
            foldTone = 0.78;
        }
        case 10u: {
            if (vert == 0u) { pos = vBodyTop; } else if (vert == 1u) { pos = vLeftHinge; } else { pos = vTailTip; }
            foldTone = 0.96;
        }
        case 11u: {
            if (vert == 0u) { pos = vBodyTop; } else if (vert == 1u) { pos = vTailTip; } else { pos = vRightHinge; }
            foldTone = 0.86;
        }
        case 12u: {
            if (vert == 0u) { pos = vLeftHinge; } else if (vert == 1u) { pos = vTailBase; } else { pos = vTailTip; }
            foldTone = 0.80;
        }
        case 13u: {
            if (vert == 0u) { pos = vRightHinge; } else if (vert == 1u) { pos = vTailTip; } else { pos = vTailBase; }
            foldTone = 0.72;
        }
        default: {
            pos = vec3<f32>(0.0);
            foldTone = 1.0;
        }
    }

    return vec4<f32>(pos, foldTone);
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var out: VertexOutput;

    if (vertexIndex >= 84u) {
        out.clipPos = vec4<f32>(0.0, 0.0, -1.0, 0.0);
        return out;
    }

    // In spherical globe mode, discard crane if on the back of the sphere
    let midWorld = crane.u_worldPos.xyz;
    let sphereNorm = normalize(midWorld);
    let viewDir = normalize(crane.u_cameraPos.xyz - midWorld);
    let facing = dot(sphereNorm, viewDir);
    if (crane.u_unfurl < 0.15 && facing < 0.02) {
        out.clipPos = vec4<f32>(0.0, 0.0, -2.0, 0.0);
        return out;
    }

    // Screen-adaptive wingspan scaling: scales comfortably with camera distance
    let camDist = length(crane.u_cameraPos.xyz - midWorld);
    let S: f32 = clamp(camDist * 0.08, 0.45, 1.8);

    let isShadow = vertexIndex < 42u;
    let modelIdx = select(vertexIndex - 42u, vertexIndex, isShadow);

    let rawV = getCraneVertex(modelIdx, S);
    let localPos = rawV.xyz;
    let foldTone = rawV.w;

    let fwd = normalize(crane.u_forward.xyz);
    let up = normalize(crane.u_up.xyz);
    let right = normalize(crane.u_right.xyz);

    // If shadow pass (first 42 vertices), project onto terrain with subtle scale expansion
    if (isShadow) {
        let shadowBase = crane.u_shadowPos.xyz;
        // Flatten local Y against terrain normal
        let worldX = right * (localPos.x * 1.15);
        let worldZ = fwd * (localPos.z * 1.15);
        let shadowPos = shadowBase + worldX + worldZ + up * 0.012; // slight standoff

        out.clipPos = crane.u_projectionMatrix * crane.u_viewMatrix * vec4<f32>(shadowPos, 1.0);
        out.normal = up;
        out.viewDir = viewDir;
        out.foldShading = 0.2;
        out.isShadow = 1.0;
        return out;
    }

    // Main Crane Geometry (vertices 42..83)
    let worldX = right * localPos.x;
    let worldY = up * localPos.y;
    let worldZ = fwd * localPos.z;
    let worldPos = crane.u_worldPos.xyz + worldX + worldY + worldZ;

    // Normal approximation from face orientation
    let tri = modelIdx / 3u;
    let vert0 = getCraneVertex(tri * 3u + 0u, S).xyz;
    let vert1 = getCraneVertex(tri * 3u + 1u, S).xyz;
    let vert2 = getCraneVertex(tri * 3u + 2u, S).xyz;
    let localEdge1 = vert1 - vert0;
    let localEdge2 = vert2 - vert0;
    let localNorm = normalize(cross(localEdge1, localEdge2));

    let worldNorm = normalize(right * localNorm.x + up * localNorm.y + fwd * localNorm.z);

    out.clipPos = crane.u_projectionMatrix * crane.u_viewMatrix * vec4<f32>(worldPos, 1.0);
    out.normal = worldNorm;
    out.viewDir = viewDir;
    out.foldShading = foldTone;
    out.isShadow = 0.0;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Ground Shadow Pass
    if (in.isShadow > 0.5) {
        // Soft diffuse shadow based on altitude
        let altMeters = crane.u_shadowPos.w;
        let altFade = clamp(1.0 - (altMeters / 12000.0), 0.15, 0.75);
        let shadowColor = vec3<f32>(0.02, 0.03, 0.05);
        return vec4<f32>(shadowColor, 0.45 * altFade);
    }

    // Eduard Imhof Directional NW 315° Sun Lighting
    let sunDir = normalize(vec3<f32>(-0.65, 0.65, 0.40));
    let fillDir = normalize(vec3<f32>(0.50, -0.40, 0.30));

    let nDotSun = max(0.0, dot(in.normal, sunDir));
    let nDotFill = max(0.0, dot(in.normal, fillDir));

    // Crisp paper fold illumination
    let lighting = (nDotSun * 0.70 + nDotFill * 0.25 + 0.20) * in.foldShading;

    var paperColor: vec3<f32>;
    if (crane.u_theme == 0u) {
        // Dark Obsidian Theme: Warm Washi Rice Paper with golden edge reflection
        let washiBase = vec3<f32>(0.92, 0.90, 0.86);
        let washiCrease = vec3<f32>(0.78, 0.74, 0.68);
        paperColor = mix(washiCrease, washiBase, clamp(lighting, 0.0, 1.0));
    } else {
        // Light Monochrome Theme: Architectural Charcoal Ink Paper
        let inkBase = vec3<f32>(0.12, 0.14, 0.18);
        let inkCrease = vec3<f32>(0.04, 0.05, 0.07);
        paperColor = mix(inkCrease, inkBase, clamp(lighting, 0.0, 1.0));
    }

    return vec4<f32>(paperColor, 1.0);
}
