// ============================================================================
// File: src/webgpu/shaders/physics_sim.wgsl
// Target: Dedicated WebGPU WGSL Compute Pipeline (@compute @workgroup_size(256))
// Description: 1,000,000-Node Continuum Physics Simulation for Globe-to-Map Morphing
// ============================================================================

struct Particle {
    position: vec4<f32>,     // xyz: Position, w: pointType (1.0 = Land, 0.0 = Ocean)
    velocity: vec4<f32>,     // xyz: Velocity, w: metric (vStrain / vVorticity)
};

struct StaticParticle {
    rest_sphere: vec4<f32>,  // xyz: S² Coordinate, w: Rest Radius (5.0)
    rest_map: vec4<f32>,     // xy: Mercator 2D, zw: Reserved/Unused
};

struct SimUniforms {
    u_unfurl: f32,           // Morph Progress [0.0 -> 1.0]
    u_mode: u32,             // 0=Linear, 1=Scroll, 2=Griffith, 3=Fluid
    u_layerMode: u32,        // 0=Both, 1=Points Only, 2=Wireframe Only
    u_time: f32,             // Elapsed Time (s)
    u_cursorActive: f32,     // 1.0 = Active Hover, 0.0 = Inactive
    u_numParticles: u32,     // Node Count (e.g. 1,000,000)
    u_theme: u32,            // 0 = Dark Cyber, 1 = Light Monochrome
    u_vortexStrength: f32,   // Fluid swirl & advection strength multiplier
    u_cursorHitPos: vec4<f32>, // xyz: Hit Pos, w: Fracture intensity multiplier
    u_cursorVel: vec4<f32>,
};

@group(0) @binding(0) var<uniform> sim: SimUniforms;
@group(0) @binding(1) var<storage, read> particlesIn: array<Particle>;
@group(0) @binding(2) var<storage, read_write> particlesOut: array<Particle>;
@group(0) @binding(3) var<storage, read> staticParticles: array<StaticParticle>;
@group(0) @binding(4) var u_windTexture: texture_2d<f32>;
@group(0) @binding(5) var u_windSampler: sampler;


@compute @workgroup_size(256, 1, 1)
fn cs_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if (index >= sim.u_numParticles) {
        return;
    }

    let pIn = particlesIn[index];
    let pStatic = staticParticles[index];
    let pos3D = pStatic.rest_sphere.xyz;
    let pos2D = vec3<f32>(pStatic.rest_map.xy, 0.0);
    let pointType = pIn.position.w;

    let clampedUnfurl = clamp(sim.u_unfurl, 0.0, 1.0);
    let ease = clampedUnfurl;

    var finalPos = pos3D;
    var finalVel = vec3<f32>(0.0);
    var metric = 0.0;

    // NOAA GFS 1.0° Wind Velocity Grid Sampling & Surface Tangent Conversion (F34)
    let windLon = atan2(pos3D.x, pos3D.z);
    let windLat = asin(clamp(pos3D.y / RADIUS, -1.0, 1.0));
    let windUV = vec2<f32>(
        (windLon + PI) / (2.0 * PI),
        (windLat + PI * 0.5) / PI
    );
    let windSample = textureSampleLevel(u_windTexture, u_windSampler, windUV, 0.0).xy;
    let uWind = windSample.x;
    let vWind = windSample.y;

    // Orthonormal tangent basis on sphere (eEast, eNorth) strictly preserving dot(vTangent, normal) == 0
    let normal = normalize(pos3D);
    let eEast = normalize(vec3<f32>(normal.z, 0.0, -normal.x));
    let eNorth = cross(normal, eEast);
    let vTangent = uWind * eEast + vWind * eNorth;

    // Evaluate unified manifold position from manifold.wgsl
    let deformed = evaluateManifoldCore(
        pos3D,
        pos2D.xy,
        sim.u_unfurl,
        sim.u_mode,
        sim.u_time,
        sim.u_cursorHitPos,
        sim.u_cursorActive,
        sim.u_cursorVel
    );
    finalPos = deformed.pos;

    let fracMult = select(1.0, sim.u_cursorHitPos.w, sim.u_cursorHitPos.w > 0.01);
    let vortexMult = select(1.0, sim.u_vortexStrength, sim.u_vortexStrength > 0.01);

    // Mode-specific velocity and metric
    if (sim.u_mode == 1u) {
        finalVel = vec3<f32>(0.0);
        metric = 0.0;
    } else if (sim.u_mode == 2u) {
        let lambdaRift: f32 = -0.48869219;
        let lonRad = select(atan2(pos3D.x, pos3D.z), pos2D.x / RADIUS, abs(pos2D.x) > 0.00001 || abs(pos2D.y) > 0.00001);
        let dRift = abs(lonRad - lambdaRift);
        let fSeam = 1.0 - smoothstep(0.0, 0.70, dRift);
        let localStrain = fSeam * sin(PI * ease) * fracMult;
        finalVel = vec3<f32>(0.0);
        metric = clamp(localStrain, 0.0, 1.0);
    } else if (sim.u_mode == 3u) {
        let rawSin = sin(PI * clampedUnfurl);
        let windAdvection = vTangent * (0.45 * (1.0 - ease));
        let naturalVel = computeCurlNoise(finalPos, sim.u_time) * vortexMult;
        finalVel = naturalVel + windAdvection;
        metric = clamp(length(naturalVel) * 0.3 * rawSin, 0.0, 1.0);
    } else {
        finalVel = vTangent * 0.01;
        metric = 0.0;
    }

    // Write computed state to output storage buffer (halved VRAM bandwidth write)
    var pOut: Particle;
    pOut.position = vec4<f32>(finalPos, pointType);
    pOut.velocity = vec4<f32>(pos3D, metric);

    particlesOut[index] = pOut;
}

// ============================================================================
// Procedural VRAM Fibonacci Sphere Particle Spawn Kernel (Feature F31)
// Dispatches directly in VRAM with 0 MB CPU allocation and 0 MB network transfer
// ============================================================================
@compute @workgroup_size(256, 1, 1)
fn cs_spawn(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let index = global_id.x;
    if (index >= sim.u_numParticles) {
        return;
    }

    let N = f32(sim.u_numParticles);
    let fi = f32(index);
    let phi = 1.618033988749895; // Golden Ratio

    // Fibonacci Sphere Distribution (uniform area density on S²)
    let y = 1.0 - (2.0 * fi + 1.0) / N;
    let r = sqrt(max(0.0, 1.0 - y * y));
    let theta = 2.0 * PI * fi * (1.0 - 1.0 / phi);

    let p3D = vec3<f32>(r * cos(theta) * RADIUS, y * RADIUS, r * sin(theta) * RADIUS);

    let lambda = atan2(p3D.x, p3D.z);
    let lat = asin(clamp(p3D.y / RADIUS, -0.9998, 0.9998));
    let isLand = select(0.0, 1.0, abs(p3D.y) > 0.5 || abs(p3D.x) > 1.2);

    var p: Particle;
    p.position = vec4<f32>(p3D, isLand);
    p.velocity = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    particlesOut[index] = p;
}

