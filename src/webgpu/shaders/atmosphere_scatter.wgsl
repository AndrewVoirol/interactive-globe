// ============================================================================
// File: src/webgpu/shaders/atmosphere_scatter.wgsl
// Target: WebGPU Planetary Atmospheric Scattering Envelope Pipeline
// Description: Concentric spherical shell (R = 5.080) evaluating spherical
//              ray-shell intersection, optical depth, and Rayleigh/Mie scattering.
// Invariants:
//   - Invariant §3:  Mandatory Unconditional Derivative Evaluation (fwidth, dpdx, dpdy)
//   - Invariant §5:  Premultiplied Alpha Transparent Clear & Compositing
//   - Invariant §10: Horizon Tangent Attenuation
//   - Invariant §18: Spherical Metric Consistency
//   - Invariant §20: 16-Byte WGSL Struct Alignment (288 bytes / 72 floats)
//   - Invariant §24: Uniform-Buffer-Driven Dynamic Theme Switching (Zero-Recompile)
//   - Invariant §28: Exhaustive Multi-Medium Shader Parity (Themes 0, 1, 2)
//   - Invariant §48: Dynamic Dimensions (No Hardcoded Literals)
// ============================================================================

const TWO_PI: f32 = 6.283185307179586;

// Strict 16-Byte Alignment Uniform Struct (Total: 288 bytes / 72 floats) (RFC §4.1)
struct AtmosphereUniforms {
    u_unfurl: f32,                // offset 0 (float 0) - Manifold morph parameter [0..1]
    u_mode: u32,                  // offset 4 (float 1) - Simulation mode [0..3]
    u_theme: u32,                 // offset 8 (float 2) - Active medium theme (0, 1, 2)
    u_time: f32,                  // offset 12 (float 3) - Elapsed simulation time in seconds
    u_cameraPos: vec4<f32>,       // offset 16 (floats 4..7) - Camera XYZ position + 1.0
    u_viewport: vec4<f32>,        // offset 32 (floats 8..11) - x: w, y: h, z: 1/w, w: 1/h
    u_cloudDrift: vec4<f32>,      // offset 48 (floats 12..15) - Drift parameters
    u_layerStandoff: vec4<f32>,   // offset 64 (floats 16..19) - Standoff parameters
    u_layerOpacity: vec4<f32>,    // offset 80 (floats 20..23) - Opacity parameters
    u_layerIndex: u32,            // offset 96 (float 24) - Layer index
    u_peakExponent: f32,          // offset 100 (float 25) - Peak Exponent
    u_atmosphericScale: f32,      // offset 104 (float 26) - Standoff Exaggeration [1.0 .. 12.0]
    u_shadowIntensity: f32,       // offset 108 (float 27) - Shadow Intensity [0.0 .. 0.60]
    u_sunDirection: vec4<f32>,    // offset 112 (floats 28..31) - xyz: normalized sun dir, w: sun altitude
    u_mediumProperties: vec4<f32>,// offset 128 (floats 32..35) - x: inkAbsorption, y: fiberDensity, z: exposureGamma, w: paperTooth
    u_pad: vec4<f32>,             // offset 144 (floats 36..39) - Reserved 16-byte pad
    u_viewMatrix: mat4x4<f32>,    // offset 160 (floats 40..55) - Camera view matrix (Column-major)
    u_projectionMatrix: mat4x4<f32>, // offset 224 (floats 56..71) - Camera projection matrix (Column-major)
};

@group(0) @binding(0) var<uniform> atmosphere: AtmosphereUniforms;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) surfaceType: f32,
    @location(3) target2D: vec4<f32>, // xy: Mercator 2D, zw: Reserved/Unused
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) facing: f32,
    @location(2) worldPos: vec3<f32>,
    @location(3) normal: vec3<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.uv = input.uv;

    let def = evaluateManifoldCore(
        input.position, input.target2D.xy,
        atmosphere.u_unfurl, atmosphere.u_mode, atmosphere.u_time,
        vec4<f32>(0.0), 0.0, vec4<f32>(0.0)
    );
    let basePos = def.pos;
    let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(input.position), length(input.position) > 0.001);
    let flatNorm = vec3<f32>(0.0, 0.0, 1.0);
    let normal = normalize(mix(sphereNorm, flatNorm, atmosphere.u_unfurl));
    out.normal = normal;

    // Atmospheric scattering shell radius (R = 5.080 at base scale 1.0)
    // Dynamic scale expands the envelope with u_atmosphericScale (RFC §1.3, §4.1)
    let scaleFactor = max(1.0, atmosphere.u_atmosphericScale);
    let shellStandoff = 0.080 * (1.0 + (scaleFactor - 1.0) * 0.15);
    let worldPos = basePos + normal * shellStandoff;
    out.worldPos = worldPos;

    let vCam = normalize(atmosphere.u_cameraPos.xyz - worldPos);
    out.facing = dot(normal, vCam);

    out.clipPos = atmosphere.u_projectionMatrix * atmosphere.u_viewMatrix * vec4<f32>(worldPos, 1.0);
    return out;
}

fn hash12(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
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

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Invariant §3: Mandatory Unconditional Derivative Evaluation
    // Finite difference derivatives MUST be evaluated at top of entry point before any branching or discard
    let du_dx = dpdx(in.uv.x);
    let du_dy = dpdy(in.uv.x);
    let dv_dx = dpdx(in.uv.y);
    let dv_dy = dpdy(in.uv.y);
    let dUv = fwidth(in.uv);
    let derivAnchor = (du_dx + du_dy + dv_dx + dv_dy + dUv.x) * 1.0e-7;

    // Planar unroll attenuation: fade out atmospheric 3D shell in flat map modes
    let unfurlAtten = 1.0 - smoothstep(0.05, 0.40, atmosphere.u_unfurl);
    if (unfurlAtten <= 0.001) {
        discard;
    }

    // Camera ray definition
    let rayOrigin = atmosphere.u_cameraPos.xyz;
    let rayDir = normalize(in.worldPos - rayOrigin);

    // Planet crust radius and atmospheric shell outer radius
    let scaleFactor = max(1.0, atmosphere.u_atmosphericScale);
    let rCrust = RADIUS; // 5.0
    let rAtm = RADIUS + 0.080 * (1.0 + (scaleFactor - 1.0) * 0.15); // 5.080+

    // Spherical ray-shell intersection
    // Ray: P(t) = O + t * D. Distance from origin: |O + t*D|^2 = r^2
    // t^2 + 2*(O·D)*t + (|O|^2 - r^2) = 0
    let b = dot(rayOrigin, rayDir);
    let cAtm = dot(rayOrigin, rayOrigin) - rAtm * rAtm;
    let cCrust = dot(rayOrigin, rayOrigin) - rCrust * rCrust;

    let discAtm = b * b - cAtm;
    if (discAtm < 0.0) {
        discard;
    }

    let discCrust = b * b - cCrust;

    // Outer atmosphere shell intersection intervals
    let tAtmEnter = -b - sqrt(max(0.0, discAtm));
    let tAtmExit = -b + sqrt(max(0.0, discAtm));
    let tAtmStart = max(0.0, tAtmEnter);

    var opticalDepth: f32 = 0.0;
    var isLimb: bool = false;

    if (discCrust > 0.0) {
        // Ray hits the planet crust
        let tCrustEnter = -b - sqrt(max(0.0, discCrust));
        let pathLength = max(0.0, tCrustEnter - tAtmStart);
        // On-disk path through atmosphere
        opticalDepth = clamp(pathLength / 0.80, 0.0, 1.5);
    } else {
        // Ray grazes the planet through the atmospheric limb halo
        isLimb = true;
        let dMin = sqrt(max(0.0, dot(rayOrigin, rayOrigin) - b * b));
        let altNorm = clamp((dMin - rCrust) / (rAtm - rCrust), 0.0, 1.0);
        let pathLength = max(0.0, tAtmExit - tAtmStart);
        let limbProfile = pow(1.0 - altNorm, 1.5);
        opticalDepth = clamp(pathLength * limbProfile * 0.90, 0.0, 2.5);
    }

    if (opticalDepth <= 0.001) {
        discard;
    }

    // Sun phase and diurnal lighting
    let sunDir = normalize(atmosphere.u_sunDirection.xyz);
    let cosTheta = dot(rayDir, sunDir);
    // Rayleigh scattering phase function: P_R = 3/(16*PI) * (1 + cos^2(theta))
    let pRayleigh = (3.0 / (16.0 * PI)) * (1.0 + cosTheta * cosTheta);
    // Mie forward-scattering phase function (aerosols)
    const gMie: f32 = 0.65;
    let pMie = (1.0 - gMie * gMie) / (4.0 * PI * pow(1.0 + gMie * gMie - 2.0 * gMie * cosTheta, 1.5));
    let phase = mix(pRayleigh, pMie, 0.45) * 4.0 * PI;

    // Sun altitude / day-night boundary attenuation
    let sunDotWorld = dot(normalize(in.worldPos), sunDir);
    let dayFactor = smoothstep(-0.20, 0.30, sunDotWorld);

    // Invariant §10: Horizon Tangent Attenuation for shell outer perimeter
    let limbAtten = select(1.0, horizonFalloff(in.facing, 0.04, 0.0, 0.25), isLimb);

    // Invariant §28: Exhaustive Multi-Medium Shader Parity
    var scatterColor: vec3<f32>;
    var finalAlpha: f32;

    if (atmosphere.u_theme == 0u) {
        // Theme 0 (Marie Tharp 1977): Warm ochre-sepia atmospheric wash
        let warmOchre = vec3<f32>(0.45, 0.35, 0.25);     // earthy warm base
        let parchmentGlow = vec3<f32>(0.65, 0.55, 0.40);  // warm parchment highlight
        let rimWarm = vec3<f32>(0.75, 0.65, 0.50);         // subtle warm rim

        let scatterGrad = mix(warmOchre, parchmentGlow, clamp(opticalDepth * 0.6, 0.0, 1.0));
        scatterColor = mix(scatterGrad, rimWarm, clamp(phase * 0.15 * select(0.2, 0.6, isLimb), 0.0, 1.0));

        let baseAlpha = select(0.10, 0.30, isLimb) * clamp(opticalDepth * 0.4, 0.0, 1.0);
        finalAlpha = clamp(baseAlpha * dayFactor * limbAtten * unfurlAtten, 0.0, 0.40);

    } else if (atmosphere.u_theme == 1u) {
        // Theme 1 (Cream Rag): Warm sepia watercolor atmospheric wash
        let warmSepia = vec3<f32>(0.42, 0.36, 0.28);      // sepia ink wash
        let creamWash = vec3<f32>(0.52, 0.44, 0.35);       // cream paper tint
        let cosLatAtm = max(0.05, cos((in.uv.y - 0.5) * PI));
        let toothCoord = vec2<f32>(in.uv.x * cosLatAtm, in.uv.y) * 600.0;
        let toothFactor = 1.0 - (hash12(toothCoord) - 0.5) * (atmosphere.u_mediumProperties.w * 0.25);

        let washColor = mix(warmSepia, creamWash, clamp(opticalDepth * 0.5, 0.0, 1.0));
        scatterColor = washColor * toothFactor;

        // Subtle archival pigment wash: low opacity (0.10 - 0.32) avoids white blowout
        let baseAlpha = select(0.12, 0.28, isLimb) * clamp(opticalDepth * 0.4, 0.0, 1.0);
        finalAlpha = clamp(baseAlpha * toothFactor * limbAtten * unfurlAtten, 0.0, 0.32);

    } else if (atmosphere.u_theme == 2u) {
        // Theme 2 (Prussian Cyanotype 1842): Blueprint substrate
        // Actinic cyan-blue photochemical atmospheric aura
        let actinicCyan = vec3<f32>(0.38, 0.76, 0.96);
        let deepActinic = vec3<f32>(0.15, 0.48, 0.78);
        let gamma = max(0.5, atmosphere.u_mediumProperties.z);

        let actinicGrad = mix(deepActinic, actinicCyan, clamp(opticalDepth * 0.6, 0.0, 1.0));
        scatterColor = actinicGrad * clamp(phase * 0.4, 0.5, 1.5);

        let actinicDepth = pow(clamp(opticalDepth * 0.45, 0.0, 1.0), gamma);
        let baseAlpha = select(0.25, 0.65, isLimb) * actinicDepth;
        finalAlpha = clamp(baseAlpha * dayFactor * limbAtten * unfurlAtten, 0.0, 0.75);

    } else {
        // Fallback branch
        scatterColor = vec3<f32>(0.25, 0.55, 0.85);
        finalAlpha = clamp(opticalDepth * 0.3 * dayFactor, 0.0, 0.5);
    }

    // Invariant §5: Premultiplied Alpha Transparent Clear & Compositing
    finalAlpha = clamp(finalAlpha + derivAnchor, 0.0, 1.0);
    return vec4<f32>(scatterColor * finalAlpha, finalAlpha);
}
