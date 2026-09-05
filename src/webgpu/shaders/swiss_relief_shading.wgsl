// ============================================================================
// File: src/webgpu/shaders/swiss_relief_shading.wgsl
// Cartographic Eduard Imhof Classical Swiss Relief Shading Engine
// Fully branchless, SIMD32-optimized for Apple Silicon M4 Pro WebGPU
// ============================================================================

struct ReliefUniforms {
    u_sunAzimuthPrimary: f32,    // Degrees (Default: 315.0 NW)
    u_sunAltitudePrimary: f32,   // Degrees (Default: 45.0)
    u_sunAzimuthFill: f32,       // Degrees (Default: 225.0 SW)
    u_sunAltitudeFill: f32,      // Degrees (Default: 35.0)
    u_displacementScale: f32,    // Terrain height exaggeration
    u_hillshadeIntensity: f32,   // 0.0 to 1.5
    u_texelWidth: f32,           // 1.0 / texture_width
    u_texelHeight: f32,          // 1.0 / texture_height
    u_rockCliffStrength: f32,    // 0.0 to 1.0
    u_ambientOcclusion: f32,     // Valley darkening factor (0.0 to 1.0)
    u_aerialPerspective: f32,    // Warm/cool elevation haze factor
    u_theme: u32,                // 0 = Dark Obsidian, 1 = Archival Light
};

@group(0) @binding(0) var u_demTexture: texture_2d<f32>;
@group(0) @binding(1) var u_demSampler: sampler;
@group(0) @binding(2) var<uniform> params: ReliefUniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) worldPos: vec3<f32>,
};

// Normalized sun direction from azimuth and altitude angles
fn computeLightDir(azimuthDeg: f32, altitudeDeg: f32) -> vec3<f32> {
    let radAz = radians(azimuthDeg);
    let radAlt = radians(altitudeDeg);
    let cosAlt = cos(radAlt);
    return normalize(vec3<f32>(
        sin(radAz) * cosAlt,
        cos(radAz) * cosAlt,
        sin(radAlt)
    ));
}

// Procedural high-frequency pseudo-random hash
fn hash2D(p: vec2<f32>) -> f32 {
    let d = dot(p, vec2<f32>(127.1, 311.7));
    return fract(sin(d) * 43758.5453123);
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var pos = array<vec2<f32>, 4>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>( 1.0,  1.0)
    );
    var uvs = array<vec2<f32>, 4>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0)
    );
    var out: VertexOutput;
    out.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
    out.uv = uvs[vertexIndex];
    out.worldPos = vec3<f32>(pos[vertexIndex], 0.0);
    return out;
}

@fragment
fn fs_swiss_relief(in: VertexOutput) -> @location(0) vec4<f32> {
    let uv = in.uv;
    let ts = vec2<f32>(params.u_texelWidth, params.u_texelHeight);
    
    // Sample 5-tap cross for central difference normal and discrete Laplacian
    let demC = textureSample(u_demTexture, u_demSampler, uv);
    let demR = textureSample(u_demTexture, u_demSampler, uv + vec2<f32>(ts.x, 0.0));
    let demL = textureSample(u_demTexture, u_demSampler, uv - vec2<f32>(ts.x, 0.0));
    let demU = textureSample(u_demTexture, u_demSampler, uv + vec2<f32>(0.0, ts.y));
    let demD = textureSample(u_demTexture, u_demSampler, uv - vec2<f32>(0.0, ts.y));
    
    let isLand = demC.b;
    let landElev = demC.r; // 0.0 to 1.0 (representing 0 to 8848m)
    let oceanDepth = demC.g; // 0.0 to 1.0 (representing 0 to 10924m)
    
    // Effective physical elevation for gradient calculation
    // Continents: positive land elevation. Oceans: smooth submerged gradient.
    let hC = select(-oceanDepth * 0.25, landElev, isLand > 0.45);
    let hR = select(-demR.g * 0.25, demR.r, demR.b > 0.45);
    let hL = select(-demL.g * 0.25, demL.r, demL.b > 0.45);
    let hU = select(-demU.g * 0.25, demU.r, demU.b > 0.45);
    let hD = select(-demD.g * 0.25, demD.r, demD.b > 0.45);
    
    // Analytical Gradient & Surface Normal
    let dHx = (hR - hL) * 0.5 * (params.u_displacementScale * 75.0 + 1.0);
    let dHy = (hU - hD) * 0.5 * (params.u_displacementScale * 75.0 + 1.0);
    let surfaceNormal = normalize(vec3<f32>(-dHx, -dHy, 1.0));
    
    // Discrete Laplacian Curvature
    // Negative = Convex Ridge Crest; Positive = Concave Valley Bottom
    let laplacian = (hR + hL + hU + hD) - 4.0 * hC;
    let kRidge  = clamp(-laplacian * 45.0, 0.0, 1.0);
    let kValley = clamp(laplacian * 45.0, 0.0, 1.0);
    
    // Light Vectors
    let sunPrimary = computeLightDir(params.u_sunAzimuthPrimary, params.u_sunAltitudePrimary);
    let sunFill    = computeLightDir(params.u_sunAzimuthFill, params.u_sunAltitudeFill);
    
    // Diffuse Terms
    let NdotL1 = max(0.0, dot(surfaceNormal, sunPrimary));
    let NdotL2 = max(0.0, dot(surfaceNormal, sunFill));
    
    // Multidirectional Oblique Shading Formulation
    let wAmbient = 0.08;
    let wPrimary = 0.72;
    let wFill    = 0.20;
    var diffuseTotal = wAmbient + wPrimary * NdotL1 + wFill * NdotL2;
    
    // Ridge Crest Contrast Enhancement
    // Accentuate sunlit flanks of crests, deepen shadowed flanks
    let ridgeEnhance = (NdotL1 - 0.5) * kRidge * 0.45;
    diffuseTotal = clamp(diffuseTotal + ridgeEnhance, 0.04, 1.40);
    
    // Valley Crevice Ambient Occlusion
    let creviceAO = 1.0 - kValley * params.u_ambientOcclusion * 0.65;
    diffuseTotal *= creviceAO;
    
    // Apply user intensity scaling
    diffuseTotal = mix(1.0, diffuseTotal, params.u_hillshadeIntensity);
    
    // ========================================================================
    // Aerial Perspective & Hypsometric Tinting
    // ========================================================================
    let tElev = clamp(landElev, 0.0, 1.0);
    
    // Cartographic Color Palettes (OKLCH-derived linear RGB)
    // Dark Obsidian Theme (u_theme == 0u) vs Light Archival Parchment (u_theme == 1u)
    let isDark = params.u_theme == 0u;
    let cLowland = select(vec3<f32>(0.95, 0.96, 0.94), vec3<f32>(0.11, 0.14, 0.18), isDark);
    let cMidland = select(vec3<f32>(0.82, 0.84, 0.86), vec3<f32>(0.28, 0.32, 0.38), isDark);
    let cAlpine  = select(vec3<f32>(0.52, 0.55, 0.60), vec3<f32>(0.58, 0.62, 0.68), isDark);
    let cSummit  = select(vec3<f32>(0.16, 0.18, 0.22), vec3<f32>(0.92, 0.90, 0.86), isDark);
    
    // Branchless altitude color ramp via linear smoothstep blends
    let tLow = smoothstep(0.0, 0.35, tElev);
    let tMid = smoothstep(0.35, 0.70, tElev);
    let tHigh = smoothstep(0.70, 0.95, tElev);
    let cRamp = mix(mix(mix(cLowland, cMidland, tLow), cAlpine, tMid), cSummit, tHigh);
    
    // Aerial Perspective Tinting:
    // Sunlit faces receive warm golden warmth; shadowed valleys receive cool blue-gray haze
    let cWarmSun = vec3<f32>(1.04, 0.98, 0.88);
    let cCoolHaze = vec3<f32>(0.84, 0.90, 1.06);
    
    let sunLitFactor = clamp(NdotL1 * 1.5, 0.0, 1.0);
    let skyHaze = mix(cCoolHaze, cWarmSun, sunLitFactor);
    let tintedColor = mix(cRamp * diffuseTotal, cRamp * diffuseTotal * skyHaze, params.u_aerialPerspective * 0.40);
    
    // ========================================================================
    // Slope-Dependent Rock Cliff Exposure (theta > 35 degrees)
    // ========================================================================
    // cos(48 deg) = 0.66913 (low bound), cos(35 deg) = 0.81915 (high bound)
    // W3C WGSL §14.4 requires low < high; inverted via (1.0 - smoothstep)
    let cosSlope = surfaceNormal.z;
    let rockWeight = (1.0 - smoothstep(0.66913, 0.81915, cosSlope)) * params.u_rockCliffStrength;
    
    // Procedural Rock Hachure / Strata Synthesis
    // Local gradient frame: fall-line vector and strike vector
    let gradDir = normalize(vec2<f32>(dHx, dHy) + vec2<f32>(1e-6, 1e-6));
    let strikeDir = vec2<f32>(-gradDir.y, gradDir.x);
    
    let uFall   = dot(uv * 1200.0, gradDir);
    let uStrike = dot(uv * 1200.0, strikeDir);
    
    // Harmonic geological strata lines
    let strata1 = sin(uStrike * 0.85);
    let strata2 = sin(uStrike * 2.10 + 0.8);
    let strataTotal = strata1 * 0.6 + strata2 * 0.4;
    
    // Vertical gravity rock joints and scree gullies
    let joint1 = sin(uFall * 1.40 + strataTotal * 1.2);
    let hachurePattern = clamp(0.5 + 0.5 * (joint1 * 0.65 + strataTotal * 0.35), 0.0, 1.0);
    
    // High-frequency micro-grain
    let rockNoise = hash2D(floor(uv * 3200.0));
    let finalHachure = hachurePattern * (0.80 + 0.20 * rockNoise);
    
    let cRockDark = select(vec3<f32>(0.22, 0.23, 0.25), vec3<f32>(0.08, 0.09, 0.11), isDark);
    let cRockLit  = select(vec3<f32>(0.60, 0.58, 0.54), vec3<f32>(0.35, 0.36, 0.38), isDark);
    let cRockShaded = mix(cRockDark, cRockLit, finalHachure * diffuseTotal);
    
    // Composite rock cliffs onto terrain
    let finalLandColor = mix(tintedColor, cRockShaded, rockWeight);
    
    // ========================================================================
    // Ocean Basin Shading (Smooth Bathymetric Isobaths & Depth Absorption)
    // ========================================================================
    let cOceanDeep = select(vec3<f32>(0.86, 0.90, 0.94), vec3<f32>(0.02, 0.03, 0.06), isDark);
    let cOceanShelf = select(vec3<f32>(0.94, 0.96, 0.98), vec3<f32>(0.06, 0.16, 0.26), isDark);
    let cOcean = mix(cOceanShelf, cOceanDeep, clamp(oceanDepth, 0.0, 1.0));
    
    // Final Composite between land and ocean via anti-aliased shoreline mask
    let finalRGB = mix(cOcean, finalLandColor, smoothstep(0.40, 0.60, isLand));
    
    return vec4<f32>(finalRGB, 1.0);
}
