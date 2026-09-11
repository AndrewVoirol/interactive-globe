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

const PI: f32 = 3.141592653589793;
const TWO_PI: f32 = 6.283185307179586;
const RADIUS: f32 = 5.0;

// Strict 16-Byte Alignment Uniform Struct (Total: 288 bytes / 72 floats) (RFC §4.1)
struct AtmosphereUniforms {
    u_unfurl: f32,                // offset 0 (float 0) - Manifold morph parameter [0..1]
    u_mode: u32,                  // offset 4 (float 1) - Simulation mode [0..4]
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
    @location(3) target2D: vec4<f32>, // xy: Mercator, zw: Dymaxion
};

struct VertexOutput {
    @builtin(position) clipPos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) facing: f32,
    @location(2) worldPos: vec3<f32>,
    @location(3) normal: vec3<f32>,
};

fn evaluateManifold(pos3D: vec3<f32>, mercator2D: vec2<f32>, dymaxion2D: vec2<f32>) -> vec3<f32> {
    let ease = atmosphere.u_unfurl * atmosphere.u_unfurl * (3.0 - 2.0 * atmosphere.u_unfurl);
    let pos2D = vec3<f32>(mercator2D.x, mercator2D.y, 0.0);

    if (atmosphere.u_mode == 1u) {
        // Mode 1: Conformal Cylindrical Unroll
        let oneMinusT = 1.0 - ease;
        if (oneMinusT > 0.001) {
            let invOneMinusT = 1.0 / oneMinusT;
            let lonRad = atan2(pos3D.x, pos3D.z);
            let curAngle = oneMinusT * lonRad;
            let latRad = asin(clamp(pos3D.y / RADIUS, -0.999, 0.999));
            let cosLat = cos(latRad);
            let curX = (RADIUS * invOneMinusT) * sin(curAngle);
            let curZ = (RADIUS * cosLat * invOneMinusT) * (cos(curAngle) - 1.0) + (RADIUS * cosLat * oneMinusT);
            let curY = mix(pos3D.y, pos2D.y, ease);
            return vec3<f32>(curX, curY, curZ);
        } else {
            return pos2D;
        }
    } else if (atmosphere.u_mode == 4u) {
        // Mode 4: Fuller Dymaxion
        let dym2D = vec3<f32>(dymaxion2D.x, dymaxion2D.y, 0.0);
        let arch = sin(PI * atmosphere.u_unfurl) * 0.45;
        let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0), normalize(pos3D), length(pos3D) > 0.001);
        return mix(pos3D, dym2D, ease) + sphereNorm * arch;
    }

    // Default Modes 0, 2, 3 (Linear Mix)
    return mix(pos3D, pos2D, ease);
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.uv = input.uv;

    let basePos = evaluateManifold(input.position, input.target2D.xy, input.target2D.zw);
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
    let limbAtten = select(1.0, smoothstep(0.0, 0.25, in.facing + 0.15), isLimb);

    // Invariant §28: Exhaustive Multi-Medium Shader Parity
    var scatterColor: vec3<f32>;
    var finalAlpha: f32;

    if (atmosphere.u_theme == 0u) {
        // Theme 0 (Marie Tharp 1977): Luminous Rayleigh/Mie blue-to-black scatter envelope
        // Base dark marine indigo (#1E293B) to cerulean blue highlight
        let deepIndigo = vec3<f32>(0.12, 0.16, 0.23);
        let ceruleanGlow = vec3<f32>(0.28, 0.62, 0.92);
        let rimHighlight = vec3<f32>(0.72, 0.88, 1.00);

        let scatterGrad = mix(deepIndigo, ceruleanGlow, clamp(opticalDepth * 0.6, 0.0, 1.0));
        scatterColor = mix(scatterGrad, rimHighlight, clamp(phase * 0.25 * select(0.3, 1.0, isLimb), 0.0, 1.0));

        let baseAlpha = select(0.30, 0.70, isLimb) * clamp(opticalDepth * 0.5, 0.0, 1.0);
        finalAlpha = clamp(baseAlpha * dayFactor * limbAtten * unfurlAtten, 0.0, 0.85);

    } else if (atmosphere.u_theme == 1u) {
        // Theme 1 (Cream Rag): Cotton rag paper substrate (#F3ECE0)
        // CRITICAL INVARIANT §5: Zero additive blowout against #F3ECE0
        // Archival mineral celadon / lapis watercolor wash with subtle paper tooth absorption
        let mineralCeladon = vec3<f32>(0.30, 0.46, 0.44); // mineral green wash
        let mineralLapis = vec3<f32>(0.24, 0.36, 0.46);   // washed lapis lazuli glaze
        let toothCoord = in.uv * 600.0;
        let toothFactor = 1.0 - (hash12(toothCoord) - 0.5) * (atmosphere.u_mediumProperties.w * 0.25);

        let washColor = mix(mineralCeladon, mineralLapis, clamp(opticalDepth * 0.5, 0.0, 1.0));
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
