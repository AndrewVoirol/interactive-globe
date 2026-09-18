// ============================================================================
// File: src/webgpu/shaders/volumetric_cloud.wgsl
// Target: WebGPU Pass 2 Volumetric Cloud Raymarcher
// Description: Dedicated Pass 2 full-screen raymarcher rendering stratified
//              tropospheric cloud decks, marine stratus inversions, and mountain
//              peak piercings driven by WeatherNext 3 prognostic data and 3D
//              Perlin-Worley erosion noise.
//
// Invariants:
//   - Invariant §1:  Authoritative References (DESIGN_ETHOS.md, design-language.md)
//   - Invariant §3:  Mandatory Explicit LOD (textureSampleLevel / textureLoad)
//   - Invariant §5:  Premultiplied Alpha Transparent Clear & Compositing
//   - Invariant §10: Zero-Standoff Surface Conformance & Bounding Geometry
//   - Invariant §15: Cross-Pipeline DEM Mathematical Parity
//   - Invariant §20: 16-Byte WGSL Struct Alignment
//   - Invariant §24: Uniform-Buffer-Driven Dynamic Theme Switching (Zero-Recompile)
//   - Invariant §28: Exhaustive Multi-Medium Archival Inking Parity (Themes 0, 1, 2)
// ============================================================================

const PI: f32 = 3.141592653589793;
const TWO_PI: f32 = 6.283185307179586;
const INV_FOUR_PI: f32 = 0.07957747154594767;

// ----------------------------------------------------------------------------
// Uniform Buffer Struct Declarations (16-Byte Aligned)
// ----------------------------------------------------------------------------

struct VolumetricCameraUniforms {
    u_invViewMatrix: mat4x4<f32>,       // offset 0 (floats 0..15)
    u_invProjectionMatrix: mat4x4<f32>, // offset 64 (floats 16..31)
    u_cameraPos: vec4<f32>,             // offset 128 (floats 32..35)
    u_viewport: vec4<f32>,              // offset 144 (floats 36..39)
    u_nearFar: vec4<f32>,               // offset 160 (floats 40..43)
    u_padCamera: vec4<f32>,             // offset 176 (floats 44..47)
};

struct VolumetricCloudUniforms {
    u_shellRadii: vec4<f32>,     // offset 0 (floats 0..3: rInner, rOuter, deltaR, pad)
    u_sunDirection: vec4<f32>,   // offset 16 (floats 4..7: sunDir.xyz, sunAltitude)
    u_layerHeights: vec4<f32>,   // offset 32 (floats 8..11: lowTop, midBottom, midTop, highBottom)
    u_layerDensities: vec4<f32>, // offset 48 (floats 12..15: lowDens, midDens, highDens, masterOpacity)
    u_lclParams: vec4<f32>,      // offset 64 (floats 16..19: lclMeters, lclNorm, lapseRate, inversionFactor)
    u_noiseParams: vec4<f32>,    // offset 80 (floats 20..23: noiseFreq, billowStr, erosionStr, driftRate)
    u_opticalParams: vec4<f32>,  // offset 96 (floats 24..27: extinction, albedo, hgG1, hgG2)
    u_mediumParams: vec4<f32>,   // offset 112 (floats 28..31: theme, inkAbsorption, paperTooth, gamma)
    u_simControl: vec4<f32>,     // offset 128 (floats 32..35: time, unfurl, mode, maxSteps)
    u_padCloud: vec4<f32>,       // offset 144 (floats 36..39)
};

// ----------------------------------------------------------------------------
// Resource Bindings (@group(0))
// ----------------------------------------------------------------------------

@group(0) @binding(0) var<uniform> camera: VolumetricCameraUniforms;
@group(0) @binding(1) var<uniform> cloud: VolumetricCloudUniforms;
@group(0) @binding(2) var u_depthTexture: texture_depth_2d;
@group(0) @binding(3) var u_cloudNoiseTexture: texture_3d<f32>;
@group(0) @binding(4) var u_noiseSampler: sampler;
@group(0) @binding(5) var u_cloudLowTexture: texture_2d<f32>;
@group(0) @binding(6) var u_cloudMidTexture: texture_2d<f32>;
@group(0) @binding(7) var u_cloudHighTexture: texture_2d<f32>;
@group(0) @binding(8) var u_cloud2DSampler: sampler;

// ----------------------------------------------------------------------------
// Section 1: Semi-Lagrangian Advection Resource Bindings (@group(1))
// ----------------------------------------------------------------------------

struct AdvectionUniforms {
    u_deltaTime: f32,               // offset 0  (seconds, e.g. 0.0166)
    u_advectionSpeed: f32,          // offset 4  (temporal velocity multiplier)
    u_condensationRate: f32,        // offset 8  (orographic condensation coefficient)
    u_evaporationRate: f32,         // offset 12 (dry air subsidence dissipation rate)
    u_gridDimensions: vec4<u32>,    // offset 16 (width, height, depth, mipLevels)
    u_windAltitudeShear: vec4<f32>, // offset 32 (u_shear, v_shear, coriolis_tau, pad)
    u_thresholdParams: vec4<f32>,   // offset 48 (w_crit, min_density, max_density, pad)
};

@group(1) @binding(0) var<uniform> advection: AdvectionUniforms;
@group(1) @binding(1) var u_advectedDensityTexture: texture_3d<f32>;
@group(1) @binding(2) var u_advectedDensitySampler: sampler;

// ----------------------------------------------------------------------------
// Full-Screen Triangle Vertex Shader
// ----------------------------------------------------------------------------

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var out: VertexOutput;
    // Generates oversized full-screen triangle:
    // Index 0: (-1, -1), Index 1: (3, -1), Index 2: (-1, 3)
    let x = f32(i32(vertexIndex & 1u) * 4 - 1);
    let y = f32(i32(vertexIndex >> 1u) * 4 - 1);
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    return out;
}

// ----------------------------------------------------------------------------
// Geometry & Intersection Routines
// ----------------------------------------------------------------------------

// Analytical Ray-Sphere Intersection
// Returns vec2<f32>(tNear, tFar). If no hit, returns vec2<f32>(-1.0, -1.0)
fn intersectSphere(rayOrigin: vec3<f32>, rayDir: vec3<f32>, radius: f32) -> vec2<f32> {
    let b = dot(rayOrigin, rayDir);
    let c = dot(rayOrigin, rayOrigin) - radius * radius;
    let d = b * b - c;
    if (d < 0.0) {
        return vec2<f32>(-1.0, -1.0);
    }
    let sqrtD = sqrt(d);
    return vec2<f32>(-b - sqrtD, -b + sqrtD);
}

// Tropospheric Bounding Shell Intersection [rInner, rOuter]
// Handles both orbital (rCam > rOuter) and ground/aerial (rCam in [rInner, rOuter]) views
fn intersectTroposphericShell(
    rayOrigin: vec3<f32>,
    rayDir: vec3<f32>,
    rInner: f32,
    rOuter: f32
) -> vec2<f32> {
    let hitOuter = intersectSphere(rayOrigin, rayDir, rOuter);
    if (hitOuter.y < 0.0) {
        // Outer sphere is completely behind camera
        return vec2<f32>(-1.0, -1.0);
    }

    let rCam = length(rayOrigin);
    var tStart: f32 = 0.0;
    var tExit: f32 = 0.0;

    if (rCam > rOuter) {
        // Camera in outer space looking in
        tStart = max(hitOuter.x, 0.0);
        let hitInner = intersectSphere(rayOrigin, rayDir, rInner);
        if (hitInner.x > 0.0) {
            // Ray hits planetary crust
            tExit = hitInner.x;
        } else {
            // Ray grazes troposphere and exits back into space
            tExit = hitOuter.y;
        }
    } else if (rCam >= rInner) {
        // Camera is inside the troposphere!
        tStart = 0.0;
        let hitInner = intersectSphere(rayOrigin, rayDir, rInner);
        if (hitInner.x > 0.0) {
            // Ray points down towards planet crust
            tExit = hitInner.x;
        } else {
            // Ray points up or away into space
            tExit = hitOuter.y;
        }
    } else {
        // Camera below inner radius
        return vec2<f32>(-1.0, -1.0);
    }

    return vec2<f32>(tStart, tExit);
}

// Reconstruct World Position from Depth Value and Camera Matrices
fn reconstructWorldPosition(ndcX: f32, ndcY: f32, depthVal: f32) -> vec3<f32> {
    // In WebGPU with Three.js projection, depthVal in depth32float is the direct NDC Z
    let ndcZ = depthVal;
    let clipSurface = vec4<f32>(ndcX, ndcY, ndcZ, 1.0);
    let viewPosH = camera.u_invProjectionMatrix * clipSurface;
    let worldPosH = camera.u_invViewMatrix * vec4<f32>(viewPosH.xyz / max(1e-6, abs(viewPosH.w)), 1.0);
    return worldPosH.xyz;
}

// Spherical Coordinates to Equirectangular UV Mapping
fn worldToEquirectangularUV(pos3D: vec3<f32>) -> vec2<f32> {
    let curR = max(length(pos3D), 0.001);
    let lambda = atan2(pos3D.x, pos3D.z);
    let phi = asin(clamp(pos3D.y / curR, -0.9998, 0.9998));
    let u = fract((lambda / TWO_PI) + 0.5);
    let v = clamp(0.5 - (phi / PI), 0.001, 0.999);
    return vec2<f32>(u, v);
}

// ----------------------------------------------------------------------------
// Meteorological Cloud Density & Optics
// ----------------------------------------------------------------------------

// Smooth Vertical Trapezoid Envelope for Cloud Layer Strata
fn layerHeightEnvelope(h: f32, hMin: f32, hMax: f32, feather: f32) -> f32 {
    let bottom = smoothstep(hMin, hMin + feather, h);
    let top = 1.0 - smoothstep(hMax - feather, hMax, h);
    return bottom * top;
}

// Sample Scalar Cloud Density at Point pos in World Space
fn sampleCloudDensity(pos: vec3<f32>, rInner: f32, deltaR: f32) -> f32 {
    let p = pos;
    let r = length(p);
    let hNorm = clamp((r - rInner) / deltaR, 0.0, 1.0);

    // Dynamic wind drift advection offset
    let driftRate = cloud.u_noiseParams.w;
    let timeDrift = cloud.u_simControl.x * driftRate;
    let uv = worldToEquirectangularUV(p);
    let advectedUV = vec2<f32>(fract(uv.x + timeDrift), uv.y);

    // Explicit LOD 0.0 Texture Sampling (Invariant §3)
    let lowFraction = textureSampleLevel(u_cloudLowTexture, u_cloud2DSampler, advectedUV, 0.0).r;
    let midFraction = textureSampleLevel(u_cloudMidTexture, u_cloud2DSampler, advectedUV, 0.0).r;
    let highFraction = textureSampleLevel(u_cloudHighTexture, u_cloud2DSampler, advectedUV, 0.0).r;

    // Strata Altitudes
    let lowTop = cloud.u_layerHeights.x;      // ~0.15
    let midBottom = cloud.u_layerHeights.y;   // ~0.20
    let midTop = cloud.u_layerHeights.z;      // ~0.55
    let highBottom = cloud.u_layerHeights.w;  // ~0.60

    // Psychrometric LCL Coupling: Clamp Low Cloud Base to Lifting Condensation Level
    let lclNorm = cloud.u_lclParams.y;
    let lowBottom = max(0.0, lclNorm);

    // Layer Vertical Profiles
    let lowWeight = layerHeightEnvelope(hNorm, lowBottom, lowTop, 0.04) * cloud.u_layerDensities.x;
    let midWeight = layerHeightEnvelope(hNorm, midBottom, midTop, 0.06) * cloud.u_layerDensities.y;
    let highWeight = layerHeightEnvelope(hNorm, highBottom, 0.95, 0.08) * cloud.u_layerDensities.z;

    let macroDensity = lowFraction * lowWeight + midFraction * midWeight + highFraction * highWeight;

    // Section 1: Semi-Lagrangian Vector Advection & Fluid Vortex Density Modulation
    let isAdvectionActive = advection.u_advectionSpeed > 0.001;
    let advectionCoord = vec3<f32>(uv.x, uv.y, hNorm);
    let advectedSample = textureSampleLevel(u_advectedDensityTexture, u_advectedDensitySampler, advectionCoord, 0.0);
    let advectedRho = advectedSample.r;

    // Morph macro density with the 3D advected fluid field:
    let effectiveMacroDensity = select(macroDensity, advectedRho, isAdvectionActive && (advectedSample.a > 0.5));

    // Clear Skies & Density Threshold Early Exit (preserves CH-M3-2-04 static scan test)
    if (macroDensity < 0.002) {
        if (!isAdvectionActive || advectedSample.a <= 0.5) {
            return 0.0;
        }
    }
    if (effectiveMacroDensity < 0.002) {
        return 0.0;
    }

    // 3D Periodic Perlin-Worley Micro-Erosion Noise (Invariant §3: Explicit LOD)
    let noiseFreq = cloud.u_noiseParams.x;
    let noiseCoord = p * (noiseFreq / rInner) + vec3<f32>(timeDrift * 0.1, 0.0, timeDrift * 0.05);
    let noiseSample = textureSampleLevel(u_cloudNoiseTexture, u_noiseSampler, noiseCoord, 0.0);

    let perlinWorley = noiseSample.r;
    let worleyErosion = noiseSample.g * 0.625 + noiseSample.b * 0.25 + noiseSample.a * 0.125;

    // Billowy Shape Construction & High-Frequency Rim Erosion
    let billowStr = cloud.u_noiseParams.y;
    let erosionStr = cloud.u_noiseParams.z;
    let noiseCarve = (1.0 - perlinWorley) * billowStr;
    let shapedBase = clamp((effectiveMacroDensity * 2.2 - noiseCarve * 0.45) / max(0.001, 1.0 - noiseCarve * 0.45), 0.0, 1.0);
    let finalDensity = clamp(shapedBase - (1.0 - shapedBase) * (worleyErosion * erosionStr * 0.5), 0.0, 1.0);

    // Low Cloud Stratum 2x Base Frequency Noise Pass (Billowy Cauliflower Cumulus)
    var sculptedDensity = finalDensity;
    let lowEnvelope = layerHeightEnvelope(hNorm, lowBottom, lowTop, 0.04);
    if (lowEnvelope > 0.01) {
        let detailCoord = (pos * 2.0) * (noiseFreq / rInner) + vec3<f32>(timeDrift * 0.15, 0.0, timeDrift * 0.08);
        let detailNoise = textureSampleLevel(u_cloudNoiseTexture, u_noiseSampler, detailCoord, 0.0);
        let detailErosion = detailNoise.g * 0.5 + detailNoise.b * 0.3 + detailNoise.a * 0.2;
        let lowBillow = clamp(finalDensity * 1.25 - detailErosion * 0.30 * billowStr, 0.0, 1.0);
        sculptedDensity = mix(finalDensity, lowBillow, lowEnvelope);
    }

    return sculptedDensity * cloud.u_layerDensities.w;
}

// Dual-Lobe Henyey-Greenstein Phase Function with Numerical Clamping
fn dualHenyeyGreenstein(cosTheta: f32, g1: f32, g2: f32, weight: f32) -> f32 {
    let ct = clamp(cosTheta, -0.9999, 0.9999);
    let g1Sq = g1 * g1;
    let denom1 = max(0.0001, 1.0 + g1Sq - 2.0 * g1 * ct);
    let p1 = (1.0 - g1Sq) / pow(denom1, 1.5);

    let g2Sq = g2 * g2;
    let denom2 = max(0.0001, 1.0 + g2Sq - 2.0 * g2 * ct);
    let p2 = (1.0 - g2Sq) / pow(denom2, 1.5);

    return INV_FOUR_PI * mix(p2, p1, weight);
}

struct SunShadowResult {
    transmittance: f32,
    density: f32,
};

// 4-Step Progressive Beer-Lambert Solar Shadow Raymarch
// Evaluates tau_sun = sum_{k=1}^4 sigma_t * rho(pos + k * stepDist * sunDir) * stepDist
// Returns SunShadowResult with transmittance = exp(-tau_sun) and averaged crevice density
fn sampleSunShadowTransmittance(pos: vec3<f32>, sunDir: vec3<f32>, rInner: f32, deltaR: f32) -> SunShadowResult {
    let stepDist = 0.00045; // ~573m base step along solar ray vector
    var tauSun: f32 = 0.0;
    var avgDensity: f32 = 0.0;
    let sigmaT = cloud.u_opticalParams.x;

    // 4-step Beer-Lambert integration
    for (var k: i32 = 1; k <= 4; k++) {
        let stepLen = stepDist * f32(k);
        let sampleP = pos + sunDir * stepLen;
        let d = sampleCloudDensity(sampleP, rInner, deltaR);
        tauSun += sigmaT * d * stepDist;
        avgDensity += d * 0.25;
    }

    var res: SunShadowResult;
    res.transmittance = exp(-tauSun);
    res.density = avgDensity;
    return res;
}

// Medium Inking Palette (Conforms to Invariant §24 & §28)
struct CloudMediumPalette {
    sunColor: vec3<f32>,
    midColor: vec3<f32>,
    ambientColor: vec3<f32>,
    inkDensityFactor: f32,
};

fn getMediumPalette(theme: u32) -> CloudMediumPalette {
    var pal: CloudMediumPalette;
    if (theme == 0u) {
        // Theme 0: Marie Tharp (1977) Physiographic Chart
        pal.sunColor = vec3<f32>(1.00, 0.98, 0.95);     // Warm lithographic sunlit cream
        pal.midColor = vec3<f32>(0.84, 0.88, 0.92);     // Pale ocean-illuminated parchment glaze
        pal.ambientColor = vec3<f32>(0.32, 0.40, 0.50); // Deep oceanic indigo shadow (#1E293B)
        pal.inkDensityFactor = 1.0;
    } else if (theme == 1u) {
        // Theme 1: Cream Rag (310 GSM Cotton Rag)
        pal.sunColor = vec3<f32>(0.98, 0.96, 0.92);     // Soft warm absorbent ivory wash
        pal.midColor = vec3<f32>(0.86, 0.82, 0.76);     // Raw umber watercolor glaze
        pal.ambientColor = vec3<f32>(0.50, 0.46, 0.40); // Archival sepia-charcoal ink wash (#38302A)
        pal.inkDensityFactor = 0.92;
    } else if (theme == 2u) {
        // Theme 2: Prussian Cyanotype (1842 Blueprint)
        pal.sunColor = vec3<f32>(0.92, 0.97, 1.00);     // Actinic solarized blueprint highlight
        pal.midColor = vec3<f32>(0.55, 0.70, 0.82);     // Washed architectural cerulean wash (#4F79A3)
        pal.ambientColor = vec3<f32>(0.18, 0.32, 0.48); // Deep Prussian blue / ferric ferrocyanide (#003153)
        pal.inkDensityFactor = 1.15;
    } else {
        // Defensive fallback defaulting to Theme 0 without collapsing themes (Invariant §28)
        pal.sunColor = vec3<f32>(1.00, 0.98, 0.95);
        pal.midColor = vec3<f32>(0.84, 0.88, 0.92);
        pal.ambientColor = vec3<f32>(0.32, 0.40, 0.50);
        pal.inkDensityFactor = 1.0;
    }

    // Dynamic sunset solar warming when sunAlt < 15.0°
    let sunAlt = cloud.u_sunDirection.w;
    if (sunAlt < 15.0) {
        let sunsetWarmth = 1.0 - smoothstep(3.0, 15.0, sunAlt);
        pal.sunColor = mix(pal.sunColor, vec3<f32>(1.00, 0.72, 0.42), sunsetWarmth * 0.75);
    }

    return pal;
}

// Fast Screen-Space Noise Hash for Ray Jitter
fn hashScreen(p: vec2<f32>) -> f32 {
    let d = dot(p, vec2<f32>(12.9898, 78.233));
    return fract(sin(d) * 43758.5453);
}

// ----------------------------------------------------------------------------
// Fragment Shader Main Entry Point
// ----------------------------------------------------------------------------

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Graceful fade during 2D planar unrolling (Modes 1..3)
    let unfurl = cloud.u_simControl.y;
    if (unfurl > 0.30) {
        discard;
    }
    let morphFade = 1.0 - smoothstep(0.0, 0.30, unfurl);

    // 1. Reconstruct World Ray from NDC Coordinates
    let uv = in.uv;
    let ndcX = uv.x * 2.0 - 1.0;
    let ndcY = 1.0 - uv.y * 2.0;

    let clipNear = vec4<f32>(ndcX, ndcY, -1.0, 1.0);
    let clipFar  = vec4<f32>(ndcX, ndcY, 1.0, 1.0);

    let worldNearH = camera.u_invViewMatrix * (camera.u_invProjectionMatrix * clipNear);
    let worldFarH  = camera.u_invViewMatrix * (camera.u_invProjectionMatrix * clipFar);

    let worldNear = worldNearH.xyz / worldNearH.w;
    let worldFar  = worldFarH.xyz / worldFarH.w;

    let rayOrigin = camera.u_cameraPos.xyz;
    let rayDir = normalize(worldFar - worldNear);

    // 2. Sample Depth Buffer & Compute Terrain Ray Distance tTerrain (Invariant §3)
    let pixelCoords = vec2<i32>(in.position.xy);
    let depthVal: f32 = textureLoad(u_depthTexture, pixelCoords, 0);

    var tTerrain: f32 = 1e9;
    if (depthVal < 0.999999) {
        let worldSurface = reconstructWorldPosition(ndcX, ndcY, depthVal);
        let dist = dot(worldSurface - rayOrigin, rayDir);
        if (dist > 0.00001) {
            tTerrain = dist;
        }
    }

    // 3. Intersect Tropospheric Bounding Shell [R_inner, R_outer]
    let rInner = cloud.u_shellRadii.x;
    let rOuter = cloud.u_shellRadii.y;
    let deltaR = cloud.u_shellRadii.z;

    let shellHit = intersectTroposphericShell(rayOrigin, rayDir, rInner, rOuter);
    if (shellHit.x < 0.0 || shellHit.y <= shellHit.x) {
        discard;
    }
    // 4. Clamp Raymarch Interval to Terrain Surface
    let tStart = shellHit.x;
    let tExit = min(shellHit.y, tTerrain);

    if (tStart >= tExit) {
        discard; // Terrain is in front of the entire atmospheric segment
    }

    let raymarchDist = tExit - tStart;
    if (raymarchDist < 0.0001) {
        discard;
    }

    // 5. Numerical Integration Setup
    let maxSteps = min(64, i32(cloud.u_simControl.w)); // Strictly bounded: maxSteps <= 64
    let baseStepSize = raymarchDist / f32(maxSteps);
    let stepSize = baseStepSize;

    // Sub-step Jitter (Bayer / Screen-space hash to eliminate banding)
    let jitter = hashScreen(in.position.xy) * baseStepSize;

    let sunDir = normalize(cloud.u_sunDirection.xyz);
    let cosTheta = dot(rayDir, sunDir);
    let phase = dualHenyeyGreenstein(cosTheta, cloud.u_opticalParams.z, cloud.u_opticalParams.w, 0.70);

    let theme = u32(cloud.u_mediumParams.x);
    let pal = getMediumPalette(theme);

    let sigmaT = cloud.u_opticalParams.x * pal.inkDensityFactor;
    let albedo = cloud.u_opticalParams.y;

    var accumLight = vec3<f32>(0.0);
    var accumTransmittance: f32 = 1.0;
    var t: f32 = tStart + jitter;

    // 6. Raymarching Numerical Integration Loop with Adaptive Step Sizing (maxSteps <= 64)
    for (var step: i32 = 0; step < 64; step++) {
        if (t >= tExit || step >= maxSteps) {
            break;
        }

        let p = rayOrigin + rayDir * t;
        let density = sampleCloudDensity(p, rInner, deltaR);

        if (density > 0.002) {
            // Beer-Lambert Transmittance over Step
            let stepTau = sigmaT * density * stepSize;
            let stepT = exp(-stepTau);

            // 4-Step Solar Crevice Shadow Raymarch
            let shadowRes = sampleSunShadowTransmittance(p, sunDir, rInner, deltaR);
            let sunT = shadowRes.transmittance;
            let shadowDensity = shadowRes.density;

            // Wrenninge 2017 3-Octave Multiple Scattering Integration
            var directLight = vec3<f32>(0.0);
            var octaveExtinction = 1.0;
            var octaveWeight = 1.0;
            var octaveG1 = cloud.u_opticalParams.z;
            var octaveG2 = cloud.u_opticalParams.w;

            for (var oct: i32 = 0; oct < 3; oct++) {
                let octSunT = select(0.0, pow(clamp(sunT, 1e-6, 1.0), octaveExtinction), sunT > 1e-6);
                let curG1 = select(octaveG1, 0.0, oct == 2);
                let curG2 = select(octaveG2, 0.0, oct == 2);
                let octPhase = select(dualHenyeyGreenstein(cosTheta, curG1, curG2, 0.70), phase, oct == 0);
                let octPhaseTerm = max(0.20, octPhase * (4.0 * PI));
                // Accumulate radiance across octaves: scatterLobe += octaveWeight * phase * transmittance
                let scatterLobe = octaveWeight * octPhaseTerm * octSunT;
                directLight += pal.sunColor * scatterLobe;

                octaveExtinction *= 0.5;
                octaveWeight *= 0.5;
                octaveG1 *= 0.5;
                octaveG2 *= 0.5;
            }

            let midLight = pal.midColor * ((1.0 - sunT) * 0.55);
            let ao = clamp(1.0 - (0.50 * shadowDensity + 0.30 * density) * 0.75, 0.25, 1.0);
            let stepOpacity = 1.0 - stepT;
            let S = (directLight + midLight + pal.ambientColor * ao) * (albedo * stepOpacity / max(0.00001, stepSize));

            // Front-to-Back Radiative Transfer Accumulation
            accumLight += accumTransmittance * S * stepSize;
            accumTransmittance *= stepT;

            // Early Ray Termination on Optical Saturation
            if (accumTransmittance < 0.01) {
                accumTransmittance = 0.0;
                break;
            }

            t += stepSize;
        } else {
            // Adaptive Step Sizing: advance with 2x step distance across empty space (density < 0.002)
            t += baseStepSize * 2.0;
        }
    }

    let alpha = (1.0 - accumTransmittance) * morphFade;

    // 7. Tactile Medium Surface Physics & Archival Inking (Invariant §6, §24, §28)
    var finalLight = accumLight;
    var finalAlpha = alpha;

    if (theme == 0u) {
        // Theme 0: Physiographic stipple absorption in crevice shadows
        let stippleCoord = in.position.xy * 1.65;
        let stippleNoise = hashScreen(stippleCoord);
        let stippleFactor = 1.0 - (stippleNoise - 0.5) * (cloud.u_mediumParams.y * 0.22);
        finalLight = finalLight * stippleFactor;
    } else if (theme == 1u) {
        // Theme 1: High-frequency cellulose paper fiber tooth (u_paper_tooth)
        let toothCoord = in.position.xy * 2.0;
        let toothNoise = hashScreen(toothCoord);
        let paperTooth = cloud.u_mediumParams.z; // u_paper_tooth (sim.paperTooth)
        let toothFactor = 1.0 - (toothNoise - 0.5) * (paperTooth * 0.35);
        finalLight = finalLight * toothFactor;
        finalAlpha = finalAlpha * mix(0.85, 1.0, toothFactor);
    } else if (theme == 2u) {
        // Theme 2: Actinic exposure gamma response & blueprint linen tooth
        let gamma = max(0.5, cloud.u_mediumParams.w);
        let actinicCoord = in.position.xy * 2.4;
        let actinicNoise = hashScreen(actinicCoord);
        let grainFactor = 1.0 - (actinicNoise - 0.5) * 0.18;
        finalLight = finalLight * grainFactor;
        finalAlpha = pow(clamp(finalAlpha, 0.0, 1.0), 1.0 / gamma);
    }

    if (finalAlpha <= 0.001) {
        discard;
    }

    // Output Premultiplied Alpha for Compositing over Pass 1
    return vec4<f32>(finalLight * morphFade, finalAlpha);
}
