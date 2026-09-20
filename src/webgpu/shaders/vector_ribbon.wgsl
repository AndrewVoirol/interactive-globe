// ============================================================================
// File: src/webgpu/shaders/vector_ribbon.wgsl
// Target: WebGPU Screen-Space Anti-Aliased Vector Line Ribbon Pipeline
// Pipeline Architecture: Instanced Quad Extrusion with Homogeneous Near-Plane Guard
// Mathematical Specification: Indicatrix Engine Frontier 1 Research Specification
// ============================================================================

struct SimUniforms {
    u_unfurl: f32,
    u_mode: u32,
    u_theme: u32,             // 0 = Obsidian Dark Cyber, 1 = Light Monochrome
    u_time: f32,
    u_viewport: vec4<f32>,     // x: width_px, y: height_px, z: 1/width, w: 1/height
    u_cameraPos: vec4<f32>,
    u_cursorHitPos: vec4<f32>,
    u_cursorVel: vec4<f32>,    // xyz: vel, w: speed
    u_cursorActive: f32,
    u_displacementScale: f32,
    u_halfWidthPx: f32,        // Nominal half-width in CSS pixels
    u_dpr: f32,                // Device Pixel Ratio (e.g. 2.0 for Retina)
    u_nearPlane: f32,          // Near clipping distance (e.g. 0.1)
    u_peakExponent: f32,       // Peak exponent matching crust_hydrosphere.wgsl
    u_seaLevel: f32,           // Dynamic sea level in meters
    u_pad2: f32,
    u_viewMatrix: mat4x4<f32>,
    u_projectionMatrix: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> sim: SimUniforms;
@group(0) @binding(1) var u_demTexture: texture_2d<f32>;
@group(0) @binding(2) var u_demSampler: sampler;
@group(0) @binding(3) var u_regionalDEMTexture: texture_2d<f32>;

struct RegionalOverlayUniforms {
    u_regionalBounds: vec4<f32>,
    u_pad0: vec4<f32>,
    u_pad1: vec4<f32>,
    u_regionalActive: u32,
    u_pad2: u32,
    u_pad3: u32,
    u_pad4: u32,
};

@group(0) @binding(4) var<uniform> u_regionalOverlay: RegionalOverlayUniforms;

// ----------------------------------------------------------------------------
// Vertex Input Structs
// Quad Base Geometry: 4 vertices per quad (Instanced Drawing)
// ----------------------------------------------------------------------------
struct VertexInput {
    // Instanced Quad Corner (Location 0)
    // x: u in [0, 1] (longitudinal), y: v in [-1, +1] (lateral)
    @location(0) corner: vec2<f32>,

    // Per-Segment Instance Attributes
    @location(1) posA_3d: vec4<f32>,         // xyz: sphere pos, w: pointType (0=river, 1=coast)
    @location(2) posA_target2d: vec4<f32>,   // xy: Mercator 2D, zw: Reserved/Unused
    @location(3) posB_3d: vec4<f32>,         // xyz: sphere pos, w: pointType
    @location(4) posB_target2d: vec4<f32>,   // xy: Mercator 2D, zw: Reserved/Unused
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) uv: vec2<f32>,              // x: normalized longitudinal, y: normalized lateral
    @location(1) uCapExcess: f32,            // longitudinal cap extension ratio
    @location(2) pointType: f32,
    @location(3) facing: f32,
    @location(4) alphaPeak: f32,             // Subpixel radiometric energy attenuation
};

// ----------------------------------------------------------------------------
// Analytical 3D Solenoidal Curl Noise (div u = 0 guaranteed)
// ----------------------------------------------------------------------------
fn getRegionalBlendWeight(uv: vec2<f32>) -> f32 {
    if (u_regionalOverlay.u_regionalActive != 1u) {
        return 0.0;
    }

    let bounds = u_regionalOverlay.u_regionalBounds;
    let minLon = bounds.x;
    let minLat = bounds.y;
    let maxLon = bounds.z;
    let maxLat = bounds.w;

    // Strict bounds validation: require non-inverted valid geographic coordinates
    if (minLon >= maxLon || minLat >= maxLat ||
        minLat < -90.0 || maxLat > 90.0 ||
        minLon < -180.0 || maxLon > 180.0) {
        return 0.0;
    }

    let lon = uv.x * 360.0 - 180.0;
    let lat = 90.0 - uv.y * 180.0;

    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) {
        return 0.0;
    }

    let regU = (lon - minLon) / (maxLon - minLon);
    let regV = (maxLat - lat) / (maxLat - minLat);

    let blendDeg = 0.5;
    let lonSpan = maxLon - minLon;
    let latSpan = maxLat - minLat;
    let marginU = clamp(blendDeg / lonSpan, 0.001, 0.49);
    let marginV = clamp(blendDeg / latSpan, 0.001, 0.49);

    let distU = min(regU, 1.0 - regU);
    let distV = min(regV, 1.0 - regV);

    let weightU = smoothstep(0.0, marginU, distU);
    let weightV = smoothstep(0.0, marginV, distV);
    return weightU * weightV;
}

fn sampleRegionalComposite(uv: vec2<f32>, globalSample: vec4<f32>, lod: f32) -> vec4<f32> {
    let weight = getRegionalBlendWeight(uv);
    if (weight <= 0.0001) {
        return globalSample;
    }

    let bounds = u_regionalOverlay.u_regionalBounds;
    let minLon = bounds.x;
    let minLat = bounds.y;
    let maxLon = bounds.z;
    let maxLat = bounds.w;

    let lon = uv.x * 360.0 - 180.0;
    let lat = 90.0 - uv.y * 180.0;

    let regU = clamp((lon - minLon) / (maxLon - minLon), 0.0, 1.0);
    let regV = clamp((maxLat - lat) / (maxLat - minLat), 0.0, 1.0);

    let regSample = textureSampleLevel(u_regionalDEMTexture, u_demSampler, vec2<f32>(regU, regV), lod);
    return mix(globalSample, regSample, weight);
}

fn applyVectorDisplacement(basePos: vec3<f32>, baseNormal: vec3<f32>, pointType: f32) -> vec3<f32> {
    let curR = RADIUS;
    let lambda = atan2(basePos.x, basePos.z);
    let phi = asin(clamp(basePos.y / curR, -0.9998, 0.9998));
    let demUv = vec2<f32>((lambda + PI) / (2.0 * PI), 0.5 - phi / PI);
    let patchDist = length(sim.u_cameraPos.xyz - basePos);
    let patchLOD = clamp(log2(max(1.0, patchDist * 0.2)), 0.0, 4.0);
    let demSampleGlobal = textureSampleLevel(u_demTexture, u_demSampler, demUv, patchLOD);
    let demSample = sampleRegionalComposite(demUv, demSampleGlobal, patchLOD);

    let poleDist = abs(demUv.y - 0.5) * 2.0;
    let poleAtten = 1.0 - smoothstep(0.85, 0.98, poleDist);
    let elevMeters = demSample.a * 19772.0 - 10924.0;
    var normalDisplacement: f32 = 0.0;
    let dispScale = sim.u_displacementScale * 2.8;

    if (pointType >= 0.75) {
        let coastDatum = max(0.0, sim.u_seaLevel);
        normalDisplacement = (coastDatum / 8848.0) * dispScale * poleAtten;
    } else {
        if (sim.u_pad2 > 0.5) {
            if (elevMeters >= 0.0) {
                let logNormH = log(1.0 + elevMeters / 1200.0) / log(1.0 + 8848.0 / 1200.0);
                normalDisplacement = logNormH * dispScale * poleAtten;
            } else {
                let logNormD = log(1.0 + (-elevMeters) / 1500.0) / log(1.0 + 10924.0 / 1500.0);
                normalDisplacement = -logNormD * dispScale * poleAtten;
            }
        } else {
            if (elevMeters >= 0.0) {
                let normH = elevMeters / 8848.0;
                normalDisplacement = normH * dispScale * poleAtten;
            } else {
                let normD = clamp(-elevMeters / 10924.0, 0.0, 1.0);
                let shelfD = normD / (1.0 + 1.5 * (1.0 - normD));
                normalDisplacement = -shelfD * dispScale * poleAtten;
            }
        }
    }

    let viewDir = normalize(sim.u_cameraPos.xyz - basePos);
    let facing = dot(baseNormal, viewDir);
    let limbAtten = select(1.0, smoothstep(0.000, 0.005, facing), sim.u_unfurl < 0.01);
    if (normalDisplacement < 0.0) {
        normalDisplacement = normalDisplacement * limbAtten;
    }

    // Eliminated 0.025 normal standoff: set standoff = 0.0 to conform directly to terrain surface without floating spikes
    let standoff = 0.0;
    return basePos + baseNormal * (normalDisplacement + standoff);
}

// ----------------------------------------------------------------------------
// Vertex Shader: Screen-Space Quad Extrusion with Analytical Near-Plane Guard
// ----------------------------------------------------------------------------
@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;

    // 1. Manifold Deformations
    let defA = evaluateManifoldCore(
        in.posA_3d.xyz, in.posA_target2d.xy,
        sim.u_unfurl, sim.u_mode, sim.u_time,
        sim.u_cursorHitPos, sim.u_cursorActive, sim.u_cursorVel
    );
    let dispPosA = applyVectorDisplacement(defA.pos, defA.normal, in.posA_3d.w);

    let defB = evaluateManifoldCore(
        in.posB_3d.xyz, in.posB_target2d.xy,
        sim.u_unfurl, sim.u_mode, sim.u_time,
        sim.u_cursorHitPos, sim.u_cursorActive, sim.u_cursorVel
    );
    let dispPosB = applyVectorDisplacement(defB.pos, defB.normal, in.posB_3d.w);

    // Compute view-space positions, normals, and horizon facing for both endpoints
    let viewPosA = sim.u_viewMatrix * vec4<f32>(dispPosA, 1.0);
    let viewNormalA = normalize((sim.u_viewMatrix * vec4<f32>(defA.normal, 0.0)).xyz);
    let facingA = dot(viewNormalA, -normalize(viewPosA.xyz));

    let viewPosB = sim.u_viewMatrix * vec4<f32>(dispPosB, 1.0);
    let viewNormalB = normalize((sim.u_viewMatrix * vec4<f32>(defB.normal, 0.0)).xyz);
    let facingB = dot(viewNormalB, -normalize(viewPosB.xyz));

    let sphereFactor = 1.0 - smoothstep(0.0, 0.35, sim.u_unfurl);

    // Early-out backface culling on spherical globe: if both endpoints are behind the horizon limb, cull segment completely
    if (sphereFactor > 0.5 && facingA < 0.0 && facingB < 0.0) {
        out.clipPos = vec4<f32>(0.0, 0.0, -1.0, 0.0); // Degenerate cull
        return out;
    }

    // 2. Homogeneous Clip-Space Coordinates
    var clipA = sim.u_projectionMatrix * viewPosA;
    var clipB = sim.u_projectionMatrix * viewPosB;

    let nearGuard = max(sim.u_nearPlane, 0.00002);

    // 3. Analytical Near-Plane Guard (w_c >= nearGuard)
    let wA_ok = clipA.w >= nearGuard;
    let wB_ok = clipB.w >= nearGuard;

    // Early-out if segment lies completely behind the camera near plane
    if (!wA_ok && !wB_ok) {
        out.clipPos = vec4<f32>(0.0, 0.0, -1.0, 0.0); // Degenerate cull
        return out;
    }

    // Analytical line clipping against homogeneous plane w = nearGuard
    var uA_param: f32 = 0.0;
    var uB_param: f32 = 1.0;

    if (!wA_ok && wB_ok) {
        let tClip = (nearGuard - clipA.w) / (clipB.w - clipA.w);
        clipA = mix(clipA, clipB, tClip);
        clipA.w = nearGuard;
        uA_param = tClip;
    } else if (wA_ok && !wB_ok) {
        let tClip = (nearGuard - clipA.w) / (clipB.w - clipA.w);
        clipB = mix(clipA, clipB, tClip);
        clipB.w = nearGuard;
        uB_param = tClip;
    }

    // 4. Perspective Division to NDC Space
    let ndcA = clipA.xy / clipA.w;
    let ndcB = clipB.xy / clipB.w;

    // 5. Transformation to Physical Screen Pixels
    let halfVp = sim.u_viewport.xy * 0.5;
    let pxA = vec2<f32>((ndcA.x + 1.0) * halfVp.x, (1.0 - ndcA.y) * halfVp.y);
    let pxB = vec2<f32>((ndcB.x + 1.0) * halfVp.x, (1.0 - ndcB.y) * halfVp.y);

    let deltaPx = pxB - pxA;
    let lenPx = length(deltaPx);
    let tangent = select(vec2<f32>(1.0, 0.0), deltaPx / lenPx, lenPx > 1e-4);
    let normal = vec2<f32>(-tangent.y, tangent.x);

    // Quad corner selection: in.corner.x in [0, 1], in.corner.y in [-1, +1]
    let isEndB = in.corner.x > 0.5;
    let baseClip = select(clipA, clipB, isEndB);
    let facingEnd = select(facingA, facingB, isEndB);

    // 6. Camera-Distance-Adaptive Stroke Scaling & Subpixel Radiometric Clamping
    // Rivers (pointType < 0.75) are drawn at 58% nominal stroke width for delicate hydrological hierarchy
    let widthScale = select(1.0, 0.58, in.posA_3d.w < 0.75);

    // Camera-distance adaptive stroke scaling:
    // 0.45px physical/CSS stroke scaling at planetary orbit (camDist >= 25.0)
    // 1.30px zoomed in (camDist <= 8.0)
    let camDist = length(sim.u_cameraPos.xyz);
    let orbitT = clamp((camDist - 8.0) / (25.0 - 8.0), 0.0, 1.0);
    let targetHalfWidthCss = mix(0.65, 0.225, orbitT); // 1.30px -> 0.45px full stroke width
    let effectiveHalfWidthCss = select(targetHalfWidthCss, sim.u_halfWidthPx, sim.u_halfWidthPx > 0.001);

    // Smooth limb horizon width taper: prevent ribbons from extruding past the planetary silhouette
    let limbTaper = select(1.0, smoothstep(0.0, 0.08, max(0.0, facingEnd)), sphereFactor > 0.5);

    let nominalHalfWidthPhys = effectiveHalfWidthCss * sim.u_dpr * widthScale;
    let geomHalfWidthPhys = max(nominalHalfWidthPhys, 0.25) * limbTaper;
    let featherPhys = 0.65 * limbTaper;
    let totalRadiusPhys = geomHalfWidthPhys + featherPhys;

    // Cap extension ratio for round caps
    let capExcess = totalRadiusPhys / max(lenPx, 1.0);

    // Longitudinal parameterization: extend unclipped ends by capExcess so round cap SDF can evaluate
    let baseU_A = select(uA_param - capExcess, uA_param, !wA_ok);
    let baseU_B = select(uB_param + capExcess, uB_param, !wB_ok);
    let baseU = select(baseU_A, baseU_B, isEndB);

    // Longitudinal and lateral screen-space displacements
    let lateralOffset = in.corner.y * totalRadiusPhys * normal;

    // Flush termination for near-plane clipped endpoints (zero longitudinal cap offset)
    let longScale = smoothstep(0.1, 1.0, lenPx);
    let longOffsetA = select(-totalRadiusPhys * tangent, vec2<f32>(0.0), !wA_ok);
    let longOffsetB = select( totalRadiusPhys * tangent, vec2<f32>(0.0), !wB_ok);
    let longitudinalOffset = select(longOffsetA, longOffsetB, isEndB) * longScale;
    let totalOffsetPx = lateralOffset + longitudinalOffset;

    // 7. Depth-Invariant Clip Offset Reconstruction (Offset * w_c)
    let offsetNdc = vec2<f32>(
        (totalOffsetPx.x / halfVp.x),
        -(totalOffsetPx.y / halfVp.y)
    );

    out.clipPos = vec4<f32>(
        baseClip.xy + offsetNdc * baseClip.w,
        baseClip.z,
        baseClip.w
    );

    // Interpolated Shading Coordinates
    out.uv = vec2<f32>(baseU, in.corner.y);
    out.uCapExcess = capExcess;
    out.pointType = select(in.posA_3d.w, in.posB_3d.w, isEndB);

    // Subpixel peak alpha attenuation to preserve radiometric flux
    out.alphaPeak = min(1.0, 2.0 * nominalHalfWidthPhys);

    // 8. Surface Facing & Horizon Culling
    out.facing = facingEnd;

    return out;
}

// ----------------------------------------------------------------------------
// Horizon Limb Falloff Specification (§1)
// ----------------------------------------------------------------------------
fn horizonFalloff(facing: f32, tau: f32, killEdge0: f32, killEdge1: f32) -> f32 {
    let maxPath: f32 = 12.5; // ≈ sqrt(π·X/2) for engine atmosphere
    let path = min(1.0 / max(facing, 1.0 / maxPath), maxPath);
    let transmission = exp(-tau * path);
    let killTerm = smoothstep(killEdge0, killEdge1, facing);
    return transmission * killTerm;
}

// ----------------------------------------------------------------------------
// Fragment Shader: Screen-Pixel Analytical Distance & Anti-Aliased Feathering
// ----------------------------------------------------------------------------
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // ------------------------------------------------------------------------
    // 1. UNIFORM CONTROL FLOW EVALUATION (Invariant #3)
    // All finite difference derivatives (fwidth) MUST be evaluated unconditionally
    // at the very top of fs_main before ANY branching, conditional blocks, or discard.
    // ------------------------------------------------------------------------
    let u = in.uv.x;
    let v = in.uv.y;

    // Longitudinal excess beyond segment endpoints (SIMD32 branchless)
    let uExcess = max(0.0, max(-u, u - 1.0)) / max(in.uCapExcess, 1e-5);

    // Normalized Euclidean distance metric from the ribbon spine
    let dNorm = sqrt(uExcess * uExcess + v * v);

    // Screen-Pixel Derivative Feathering (Exact Physical Pixel Ramp)
    // Evaluated in unconditional uniform control flow
    let delta = max(0.5 * fwidth(dNorm), 1e-4);

    // Linear coverage ramp over a 1.0 physical pixel boundary transition
    let coverage = clamp(1.0 - (dNorm - (1.0 - delta)) / (2.0 * delta), 0.0, 1.0);

    // ------------------------------------------------------------------------
    // 2. Horizon Facing Falloff & Backface Attenuation
    // ------------------------------------------------------------------------
    let sphereFactor = 1.0 - smoothstep(0.0, 0.35, sim.u_unfurl);

    // Smooth limb horizon falloff: cleanly attenuates to 0.0 at the silhouette
    // Completely eliminates detached spikes, floating slivers, or disconnected geometry
    let horizonAtten = horizonFalloff(in.facing, 0.15, 0.0, 0.08);
    let facingFade = mix(1.0, horizonAtten, sphereFactor);

    // Discard non-covered pixels or geometry behind the planetary horizon
    if (coverage <= 0.0 || (sphereFactor > 0.0 && in.facing <= 0.0)) {
        discard;
    }

    // 4. Cartographic Color Theme Evaluation
    var strokeColor: vec3<f32>;
    var nominalAlpha: f32;

    if (sim.u_theme == 0u) {
        // Theme 0: Dark Palette Cartographic Hairlines (Marie Tharp)
        if (in.pointType < 0.75) {
            // Major Hydrological Arteries: Mineral cyan/slate-blue
            strokeColor = vec3<f32>(0.38, 0.58, 0.78);
            nominalAlpha = 0.65;
        } else {
            // Continental Coastlines: High-contrast soft parchment ivory
            strokeColor = vec3<f32>(0.94, 0.92, 0.88);
            nominalAlpha = 0.80;
        }
    } else if (sim.u_theme == 2u) {
        // Theme 2: Prussian Cyanotype (Actinic unexposed resist / Photographic negative)
        // STRICTLY MONOCHROMATIC — only Prussian blue + white
        if (in.pointType < 0.75) {
            // Major Hydrological Arteries: Washed cerulean (#4F79A3)
            strokeColor = vec3<f32>(0.31, 0.475, 0.64);
            nominalAlpha = 0.60;
        } else {
            // Continental Coastlines: Chalk ruling pen white (#E8EDF2 / unexposed resist)
            strokeColor = vec3<f32>(0.91, 0.93, 0.95);
            nominalAlpha = 0.98;
        }
    } else {
        // Theme 1: Light Monochrome Architectural / Swiss Relief (Cream Rag)
        if (in.pointType < 0.75) {
            // Hydrology: Washed mineral lapis/celadon glaze
            strokeColor = vec3<f32>(0.24, 0.38, 0.50);
            nominalAlpha = 0.50;
        } else {
            // Coastlines: Archival bistre / sepia-charcoal technical drafting ink (#261E18)
            strokeColor = vec3<f32>(0.15, 0.12, 0.10);
            nominalAlpha = 0.88;
        }
    }

    let finalAlpha = nominalAlpha * coverage * in.alphaPeak * facingFade;

    return vec4<f32>(strokeColor, finalAlpha);
}
