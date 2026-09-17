// ============================================================================
// File: src/webgpu/shaders/paper_composition.wgsl
// Architecture: Final Cartographic Composition Pass (Milestone §6.2 / §6.3)
// Description: Evaluates the Anisotropic Fiber BRDF (Kajiya-Kay / Marschner model)
//              integrating the perturbed normal from the Substrate Micro-Relief Pass,
//              simulating physical raking light over intaglio plate impressions,
//              ink deposit ridges, and cellulose paper sheen at oblique camera angles.
// ============================================================================

struct PaperSubstrateUniforms {
    u_fiberFrequency: f32,         // offset 0  (cellulose fiber spatial density)
    u_fiberAnisotropy: f32,        // offset 4  (grain orientation eccentricity [0, 1])
    u_plateMarkDepthMeters: f32,   // offset 8  (neatline boundary depression depth)
    u_inkRidgeHeightMeters: f32,   // offset 12 (intaglio ink deposit elevation)
    u_grainAngleRadians: f32,      // offset 16 (fiber milling angle theta_grain)
    u_sheenIntensity: f32,         // offset 20 (anisotropic cellulose reflection weight)
    u_absorptionFeathering: f32,   // offset 24 (capillary ink bleed into fibers)
    _pad: f32,                     // offset 28 (16-byte alignment)
};

struct CompositionLightingUniforms {
    u_sunAzimuth: f32,             // offset 0  (degrees, key light azimuth)
    u_sunAltitude: f32,            // offset 4  (degrees, key light altitude)
    u_cameraPitchDeg: f32,         // offset 8  (camera pitch angle from nadir)
    u_theme: u32,                  // offset 12 (0 = Tharp, 1 = Cream, 2 = Cyanotype)
    u_cameraPos: vec4<f32>,        // offset 16 (xyz = position, w = distance)
    u_screenDimensions: vec2<f32>, // offset 32 (width, height)
    u_hapticsActive: f32,          // offset 40 (1.0 = enabled, 0.0 = bypassed)
    _padComp: f32,                 // offset 44 (16-byte alignment)
};

@group(0) @binding(0) var u_sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var u_normalTexture: texture_2d<f32>;
@group(0) @binding(2) var u_linearSampler: sampler;
@group(0) @binding(3) var<uniform> substrate: PaperSubstrateUniforms;
@group(0) @binding(4) var<uniform> lighting: CompositionLightingUniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var out: VertexOutput;
    // Fullscreen single triangle covering [-1, 1] NDC without clipping seams
    var pos = vec2<f32>(-1.0, -1.0);
    if (vertexIndex == 1u) {
        pos = vec2<f32>(3.0, -1.0);
    } else if (vertexIndex == 2u) {
        pos = vec2<f32>(-1.0, 3.0);
    }
    out.position = vec4<f32>(pos, 0.0, 1.0);
    out.uv = vec2<f32>(pos.x * 0.5 + 0.5, 1.0 - (pos.y * 0.5 + 0.5));
    return out;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // 1. Unconditional texture sampling at top of fs_main for WGSL uniform control flow conformance (Rule 4)
    let sceneColor = textureSample(u_sceneTexture, u_linearSampler, input.uv);
    let normalSample = textureSample(u_normalTexture, u_linearSampler, input.uv);

    // Bypassed path: pass through unmodulated scene color
    if (lighting.u_hapticsActive < 0.5) {
        return sceneColor;
    }

    // 2. Resolve Base Substrate Color (warm ivory cotton rag, prussian blue, or tharp chart)
    var paperGround = vec3<f32>(0.953, 0.925, 0.878); // Theme 1: Cream Rag ivory (#F3ECE0)
    if (lighting.u_theme == 2u) {
        paperGround = vec3<f32>(0.047, 0.082, 0.125); // Theme 2: Prussian Cyanotype deep ground (#0C1520)
    } else if (lighting.u_theme == 0u) {
        paperGround = vec3<f32>(0.047, 0.071, 0.098); // Theme 0: Marie Tharp obsidian ground (#0C1219)
    }

    // Composite scene color over archival paper ground where transparent
    let baseColor = mix(paperGround, sceneColor.rgb, sceneColor.a);

    // 3. Unpack Perturbed Normal and Micro-Elevation
    let deltaN = normalSample.xy;
    let zSheet = normalSample.z;
    let nPerturbed = normalize(vec3<f32>(deltaN.x, deltaN.y, 1.0));

    // 4. Evaluate Incident Solar Direction omega_i (aligned with crust_hydrosphere computeSunLightDir)
    let azRad = lighting.u_sunAzimuth * 0.017453292519943295;
    let altRad = max(0.05, lighting.u_sunAltitude * 0.017453292519943295);
    let cosAlt = cos(altRad);
    let sinAlt = sin(altRad);
    let omega_i = normalize(vec3<f32>(sin(azRad) * cosAlt, cos(azRad) * cosAlt, sinAlt));

    // 5. Evaluate Outgoing View Vector omega_o
    // When camera pitches into oblique angles, the view vector approaches grazing incidence to the paper plane
    let pitchRad = clamp(lighting.u_cameraPitchDeg, 0.0, 85.0) * 0.017453292519943295;
    let vX = (input.uv.x - 0.5) * 0.35;
    let vY = -sin(pitchRad) + (input.uv.y - 0.5) * 0.20;
    let vZ = cos(pitchRad);
    let omega_o = normalize(vec3<f32>(vX, vY, max(0.08, vZ)));

    // 6. Evaluate Local Cellulose Fiber Tangent Vector t
    // Fiber direction aligned along the milling grain angle theta_grain
    let theta = substrate.u_grainAngleRadians;
    let t0 = vec3<f32>(cos(theta), sin(theta), 0.0);
    // Gram-Schmidt orthogonalization against the perturbed surface normal
    let t = normalize(t0 - nPerturbed * dot(nPerturbed, t0));

    // 7. Anisotropic Micro-Cylinder Fiber BRDF (Kajiya-Kay / Marschner Formulation)
    // f_r(omega_i, omega_o) = k_d / pi + k_sheen * (sqrt(1 - (t . omega_i)^2) * sqrt(1 - (t . omega_o)^2) + (t . omega_i)(t . omega_o)) / (cos theta_i + cos theta_o)
    let tDotL = clamp(dot(t, omega_i), -0.999, 0.999);
    let tDotV = clamp(dot(t, omega_o), -0.999, 0.999);
    let sinL = sqrt(max(0.0, 1.0 - tDotL * tDotL));
    let sinV = sqrt(max(0.0, 1.0 - tDotV * tDotV));

    let cosL = max(0.01, dot(nPerturbed, omega_i));
    let cosV = max(0.01, dot(nPerturbed, omega_o));

    let cylinderSpecular = max(0.0, sinL * sinV + tDotL * tDotV);
    let specularLobe = pow(cylinderSpecular, 6.0); // Focused cellulose fiber sheen highlight

    let brdfSheen = substrate.u_sheenIntensity * (specularLobe / (cosL + cosV));

    // 8. Raking Key Light Modulation Across Plate Bevel & Ink Ridges
    let baseCosL = max(0.01, omega_i.z);
    let slopeRatio = clamp(cosL / baseCosL, 0.50, 1.50);
    let rakingFactor = clamp(0.70 + 0.30 * slopeRatio, 0.70, 1.08);

    // 9. Thematic Cellulose Sheen Chrominance Selection
    var sheenColor = vec3<f32>(0.98, 0.95, 0.88); // Default: Theme 1 Warm Ivory cellulose sheen
    if (lighting.u_theme == 2u) {
        // Theme 2: Prussian Cyanotype — Cold actinic cyan-white photochemical sheen
        sheenColor = vec3<f32>(0.75, 0.88, 1.0);
    } else if (lighting.u_theme == 0u) {
        // Theme 0: Marie Tharp — Drafting bristol vellum subtle sheen
        sheenColor = vec3<f32>(0.92, 0.90, 0.85);
    }

    // 10. Composite Final Pixel (Energy-Conserving Cellulose Fiber Micro-Cylinder)
    let sheenWeight = clamp(brdfSheen * 0.22, 0.0, 0.35);
    let diffuseLit = baseColor * rakingFactor * (1.0 - sheenWeight);
    let specularSheen = sheenColor * sheenWeight;
    let litColor = clamp(diffuseLit + specularSheen, vec3<f32>(0.0), vec3<f32>(1.0));

    let finalRGB = mix(baseColor, litColor, lighting.u_hapticsActive);
    return vec4<f32>(finalRGB, 1.0);
}
