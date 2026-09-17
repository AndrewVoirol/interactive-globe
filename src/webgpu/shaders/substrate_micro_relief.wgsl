// ============================================================================
// File: src/webgpu/shaders/substrate_micro_relief.wgsl
// Architecture: Substrate Micro-Relief Compute Pass (Milestone §6.2 / §6.3)
// Description: Evaluates 19th-century copperplate intaglio printing haptics:
//              - Neatline plate mark depression boundary B_neatline(u)
//              - 4-octave anisotropic Worley cellulose fiber cellular field F(u)
//              - Raised intaglio ink deposit ridges h_ink * smoothstep(0.2, 0.8, I_ink)
//              - Finite difference normal perturbation output (RG8Snorm / RGBA8Snorm)
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

struct SubstrateConfigUniforms {
    u_dimensions: vec2<f32>,       // offset 0  (width, height)
    u_theme: u32,                  // offset 8  (0 = Tharp, 1 = Cream, 2 = Cyanotype)
    u_enabled: f32,                // offset 12 (1.0 = active, 0.0 = bypassed)
};

@group(0) @binding(0) var u_sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var u_sceneSampler: sampler;
@group(0) @binding(2) var<uniform> substrate: PaperSubstrateUniforms;
@group(0) @binding(3) var<uniform> config: SubstrateConfigUniforms;
@group(0) @binding(4) var u_normalOutput: texture_storage_2d<rgba8snorm, write>;

// 2D pseudo-random hash for cellular jitter
fn hash2D(p: vec2<f32>) -> vec2<f32> {
    let q = vec2<f32>(
        dot(p, vec2<f32>(127.1, 311.7)),
        dot(p, vec2<f32>(269.5, 183.3))
    );
    return fract(sin(q) * 43758.5453123);
}

// Single-octave anisotropic Worley cellular network aligned along theta_grain
fn worleyAnisotropic(uv: vec2<f32>, theta: f32, anisotropy: f32) -> f32 {
    let cosT = cos(theta);
    let sinT = sin(theta);
    // Rotate coordinates along paper-milling grain direction
    let rot = vec2<f32>(
        uv.x * cosT + uv.y * sinT,
        -uv.x * sinT + uv.y * cosT
    );
    // Anisotropic aspect scaling: elongated along the grain (X), compressed across the grain (Y)
    let anisoClamped = clamp(anisotropy, 0.0, 0.95);
    let sx = 1.0 - anisoClamped * 0.70;
    let sy = 1.0 + anisoClamped * 2.50;
    let scaled = vec2<f32>(rot.x * sx, rot.y * sy);

    let cell = floor(scaled);
    let f = fract(scaled);
    var minDist = 1.0;

    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            let neighbor = vec2<f32>(f32(dx), f32(dy));
            let pt = hash2D(cell + neighbor);
            let diff = neighbor + pt - f;
            let d = length(diff);
            minDist = min(minDist, d);
        }
    }
    return minDist;
}

// 4-Octave Anisotropic Worley Cellular Field: F(u) = sum_{k=1}^4 (1/2^k) * W_aniso(2^k * u, theta_grain)
fn evaluateFiberGrain(uv: vec2<f32>, freq: f32, theta: f32, aniso: f32) -> f32 {
    var total = 0.0;
    var amp = 0.5;
    var f = max(1.0, freq);
    for (var k = 0u; k < 4u; k++) {
        total += amp * worleyAnisotropic(uv * f, theta, aniso);
        amp *= 0.5;
        f *= 2.0;
    }
    return total;
}

// Plate Mark Neatline Boundary: B_neatline(u) evaluates the beveled indentation where
// the engraved copper plate presses the damp paper inside the sheet border neatline
fn evaluatePlateMark(uv: vec2<f32>, dims: vec2<f32>) -> f32 {
    // 10px spatial clearance moat per DESIGN_ETHOS.md §15.2
    let margin = vec2<f32>(10.0 / max(1.0, dims.x), 10.0 / max(1.0, dims.y));
    let distLeft = uv.x - margin.x;
    let distRight = (1.0 - margin.x) - uv.x;
    let distTop = uv.y - margin.y;
    let distBottom = (1.0 - margin.y) - uv.y;
    let minDist = min(min(distLeft, distRight), min(distTop, distBottom));

    // 4px beveled plate edge profile
    let bevelWidth = 4.0 / max(1.0, min(dims.x, dims.y));
    return smoothstep(0.0, bevelWidth, minDist);
}

// Extract inked line intensity I_ink(u) from scene color
fn evaluateInkIntensity(color: vec3<f32>, theme: u32) -> f32 {
    let lum = dot(color, vec3<f32>(0.299, 0.587, 0.114));
    if (theme == 1u) {
        // Theme 1: Cream Rag — warm ivory paper (#F3ECE0 has lum ~0.91), dark sepia-charcoal ink (#38302A)
        return clamp((0.92 - lum) / 0.85, 0.0, 1.0);
    } else if (theme == 2u) {
        // Theme 2: Prussian Cyanotype — deep blue ground (#09131F), chalk/cyan ink lines
        return clamp((lum - 0.10) / 0.80, 0.0, 1.0);
    } else {
        // Theme 0: Marie Tharp — dark obsidian ground, physiographic relief/ink
        return clamp(lum, 0.0, 1.0);
    }
}

// Physical Sheet Micro-Elevation Profile:
// z_sheet(u) = -h_plate * B_neatline(u) + h_ink * smoothstep(0.2, 0.8, I_ink(u)) - h_tooth * F(u)
fn evaluateSheetElevation(uv: vec2<f32>, dims: vec2<f32>) -> f32 {
    let colorSample = textureSampleLevel(u_sceneTexture, u_sceneSampler, uv, 0.0);
    let bNeatline = evaluatePlateMark(uv, dims);
    let aspect = dims.x / max(1.0, dims.y);
    let fiberUV = vec2<f32>(uv.x * aspect, uv.y);
    let fiberField = evaluateFiberGrain(
        fiberUV,
        substrate.u_fiberFrequency,
        substrate.u_grainAngleRadians,
        substrate.u_fiberAnisotropy
    );

    var rawInk = 0.0;
    // Only evaluate inked deposit ridges where rendered ink/geometry exists (alpha > 0.05)
    // Avoids mistaking pure transparent black {0,0,0,0} for pitch-black intaglio ink lines
    if (colorSample.a > 0.05) {
        rawInk = evaluateInkIntensity(colorSample.rgb, config.u_theme);
    }
    // Capillary ink bleed into cellulose fibers
    let inkFeathered = mix(
        rawInk,
        rawInk * (1.0 - substrate.u_absorptionFeathering * 0.35 * fiberField),
        substrate.u_absorptionFeathering
    );
    let inkRidge = smoothstep(0.2, 0.8, inkFeathered);

    let hPlate = substrate.u_plateMarkDepthMeters;
    let hInk = substrate.u_inkRidgeHeightMeters;
    let hTooth = 0.0018;

    return -hPlate * bNeatline + hInk * inkRidge - hTooth * fiberField;
}

@compute @workgroup_size(16, 16)
fn cs_main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let dims = textureDimensions(u_sceneTexture);
    if (globalId.x >= dims.x || globalId.y >= dims.y) {
        return;
    }

    let coord = vec2<i32>(i32(globalId.x), i32(globalId.y));
    let fDims = vec2<f32>(f32(dims.x), f32(dims.y));
    let uv = (vec2<f32>(f32(coord.x) + 0.5, f32(coord.y) + 0.5)) / fDims;

    if (config.u_enabled < 0.5) {
        // Flat unperturbed normal when bypassed
        textureStore(u_normalOutput, coord, vec4<f32>(0.0, 0.0, 0.0, 1.0));
        return;
    }

    // 4-Tap Finite Difference Gradient Evaluation
    // In UV texture coordinates, uv.y decreases going North (top) and increases going South (bottom)
    let delta = vec2<f32>(1.0 / fDims.x, 1.0 / fDims.y);
    let uvR = vec2<f32>(min(1.0, uv.x + delta.x), uv.y); // East
    let uvL = vec2<f32>(max(0.0, uv.x - delta.x), uv.y); // West
    let uvN = vec2<f32>(uv.x, max(0.0, uv.y - delta.y)); // North
    let uvS = vec2<f32>(uv.x, min(1.0, uv.y + delta.y)); // South

    let zC = evaluateSheetElevation(uv, fDims);
    let zR = evaluateSheetElevation(uvR, fDims);
    let zL = evaluateSheetElevation(uvL, fDims);
    let zN = evaluateSheetElevation(uvN, fDims);
    let zS = evaluateSheetElevation(uvS, fDims);

    let dZ_dx = (zR - zL) / (2.0 * delta.x);
    let dZ_dy = (zN - zS) / (2.0 * delta.y);

    // Normal scale mapping micro-meter height slope to screen-space normal perturbation
    let normalScale = 0.16;
    let deltaNx = clamp(-dZ_dx * normalScale, -1.0, 1.0);
    let deltaNy = clamp(-dZ_dy * normalScale, -1.0, 1.0);

    // Store signed normal perturbation (deltaNx, deltaNy) and micro-elevation zC
    textureStore(u_normalOutput, coord, vec4<f32>(deltaNx, deltaNy, zC, 1.0));
}
