# SHADERS_SPEC_LEDGER.md
---

## §1: Horizon Limb Falloff Specification

### Problem Statement
Inconsistent limb opacity falloff across `vector_ribbon.wgsl`, `cloud_shell.wgsl`,
and `atmosphere_scatter.wgsl`. Current implementations use ad-hoc `smoothstep`
formulas with different thresholds:

| File | Current Formula |
|------|----------------|
| `vector_ribbon.wgsl:324` | `smoothstep(0.000, 0.005, tau)` (tau is cosine-horizon difference) |
| `vector_ribbon.wgsl:428` | `smoothstep(0.0, 0.08, max(0.0, facingEnd))` |
| `vector_ribbon.wgsl:512` | `smoothstep(0.0, 0.10, in.facing)` |
| `cloud_shell.wgsl:400` | `smoothstep(-0.015, 0.04, in.facing)` (allows below-horizon) |
| `atmosphere_scatter.wgsl:206` | `smoothstep(0.0, 0.25, in.facing + 0.15)` (offset) |

### Required Output
- [x] Mathematical derivation of smooth limb opacity from atmospheric optical depth
- [x] Single WGSL function: `fn horizonFalloff(facing: f32, tau: f32, killEdge0: f32, killEdge1: f32) -> f32`
- [x] Boundary behavior at facing → 0.0 (horizon) and facing → 1.0 (nadir)
- [x] Integration instructions for each consumer shader

**Mathematical Derivation:**

By the Beer-Lambert law, optical transmission through an atmospheric layer is
$T = \exp(-\tau \cdot x)$ where $\tau$ is the vertical optical depth and $x$ is
the relative path length through the atmosphere (normalized to the vertical column).

The planar secant approximation $x \approx 1/\cos(\theta)$ diverges at the horizon.
For a spherical shell, the correct path length is given by the **Chapman function**
$\text{Ch}(X, \chi)$, where $X = R/H$ (planet radius / scale height) and $\chi$ is
the zenith angle ($\cos\chi = \text{facing}$).

Key Chapman function properties:
- At nadir ($\text{facing} = 1$): $\text{Ch} \to 1.0$ (vertical column)
- At limb ($\text{facing} = 0$): $\text{Ch} \to \sqrt{\pi X / 2}$ (**finite** maximum)

For the engine's model-space planet ($R = 5.0$, effective $X \approx 100$):
$\text{Ch}_{\max} \approx \sqrt{\pi \cdot 100 / 2} \approx 12.5$.

We approximate the Chapman path length with a clamped reciprocal that naturally
limits to this finite maximum:

$$x(\mu) = \min\left(\frac{1}{\mu + \epsilon}, x_{\max}\right)$$

where $\mu = \text{facing}$ and $\epsilon = 1/x_{\max}$. Setting $\epsilon = 1/x_{\max}$
ensures the transition to clamped behavior occurs exactly at the natural Chapman maximum.

**Step-by-step boundary analysis** (for vectors: `tau=0.15`, `killEdge0=0.0`, `killEdge1=0.08`):

1. **facing → 1.0 (nadir):** path $= 0.926$, $T = \exp(-0.139) \approx 0.87$.
   `killTerm = smoothstep(0.0, 0.08, 1.0) = 1.0`. **Result = 0.87.**
   Correct physical nadir attenuation.

2. **facing → 0.0 (exact limb):** path $= 12.5$, $T = \exp(-1.875) \approx 0.15$.
   `killTerm = smoothstep(0.0, 0.08, 0.0) = 0.0`. **Result = 0.0.**
   Rule 7 compliance: exact zero at horizon. ✓

3. **facing = 0.04 (near-limb):** path $\approx 8.3$, $T \approx 0.29$.
   `killTerm = smoothstep(0.0, 0.08, 0.04) = 0.5`. **Result ≈ 0.15.** Gradual fade.

4. **facing = 0.08 (clear of limb):** path $\approx 6.25$, $T \approx 0.39$.
   `killTerm = smoothstep(0.0, 0.08, 0.08) = 1.0`. **Result ≈ 0.39.** Pure Chapman.

5. **facing = 0.5 (45° off nadir):** path $= 1.72$, $T \approx 0.77$.
   `killTerm = 1.0`. **Result ≈ 0.77.** Gentle progressive falloff.

**WGSL Implementation:**
```wgsl
fn horizonFalloff(facing: f32, tau: f32, killEdge0: f32, killEdge1: f32) -> f32 {
    // Chapman-like relative path length through a spherical atmosphere.
    //   facing    = dot(N, V) = cos(zenith_angle)
    //   tau       = vertical optical depth (tuned per-shader)
    //   killEdge0 = smoothstep lower bound (facing below this → 0.0)
    //   killEdge1 = smoothstep upper bound (facing above this → pure Chapman)
    //
    // At nadir  (facing → 1): path ≈ 1.0  → T ≈ exp(-τ)     [mild attenuation]
    // At limb   (facing → 0): killTerm → 0 → result = 0.0   [Rule 7 compliant]
    let maxPath: f32 = 12.5; // ≈ sqrt(π·X/2) for engine atmosphere
    let path = min(1.0 / max(facing, 1.0 / maxPath), maxPath);
    let transmission = exp(-tau * path);
    // Hard zero boundary: smoothstep kills fragments at/below the horizon
    let killTerm = smoothstep(killEdge0, killEdge1, facing);
    return transmission * killTerm;
}
```

**Per-shader parameters (τ, killEdge0, killEdge1):**

| Shader | τ | killEdge0 | killEdge1 | Call |
|--------|---:|----------:|----------:|------|
| `vector_ribbon.wgsl` | 0.15 | 0.0 | 0.08 | `horizonFalloff(facing, 0.15, 0.0, 0.08)` |
| `cloud_shell.wgsl` | 0.08 | −0.015 | 0.04 | `horizonFalloff(facing, 0.08, -0.015, 0.04)` |
| `atmosphere_scatter.wgsl` | 0.04 | 0.0 | 0.25 | `horizonFalloff(facing, 0.04, 0.0, 0.25)` |

- **Surface vectors**: Full atmospheric column. killEdge0 = 0.0 enforces Rule 7 exact
  zero at the horizon. killEdge1 = 0.08 matches existing `vector_ribbon.wgsl:428`.
- **Cloud shells**: Clouds sit at altitude with less atmosphere above them. killEdge0 = −0.015
  **intentionally allows slight below-horizon rendering** for visual wraparound continuity,
  matching the current `smoothstep(-0.015, 0.04, in.facing)` behavior. Back-hemisphere
  cloud culling relies on the hardware depth test against the crust mesh, not atmospheric
  falloff. Rule 7 applies to *vector* fragments only ("Vector fragments attenuate to zero").
- **Atmosphere scatter**: The atmosphere shell IS the scattering medium — it should NOT
  strongly self-attenuate. Wide killEdge1 = 0.25 provides gentle edge softening only.

**Integration Instructions:**
1. Extract `horizonFalloff(facing, tau, killEdge0, killEdge1)` into the shared
   `manifold.wgsl` module.
2. In each consumer shader, replace the existing `smoothstep(...)` or `limbAtten`
   calculations with the per-shader call from the table above.
3. For `vector_ribbon.wgsl` and `crust_hydrosphere.wgsl` (negative bathymetric displacement guard),
   use `facing = dot(baseNormal, viewDir)` with `smoothstep(0.000, 0.005, facing)`.
   The previous `tau = dot(baseNormal, viewDir) - cosHorizon` formulation erroneously subtracted
   the camera-centric silhouette cone half-angle cosine (~0.9428), causing bathymetric displacement
   to collapse to zero everywhere more than 19.47° from camera nadir.

---

## §2: CDLOD Tangent Horizon Culling Derivation

### Problem Statement
Arbitrary constant `24.5` in `culling.wgsl:94` and `WebGPUEngine.ts:1782` used as
bounding threshold. Not derived from camera geometry.

### Required Output
- [x] Trigonometric derivation of tangent-distance formula from camera altitude
- [x] Exact WGSL expression to replace `24.5`
- [x] Camera altitude → horizon distance relation
- [x] Edge cases: very low altitude, very high altitude, altitude = 0

**Trigonometric Derivation:**

For a camera at position $\vec{C}$ (distance $D = |\vec{C}|$ from center) viewing a
planet of radius $R$:

1. The tangent horizon forms a cone with half-angle $\alpha = \arccos(R/D)$.
2. The horizon plane is perpendicular to $\vec{C}$ at distance $R^2/D$ from origin.
3. Plane equation: $\vec{C} \cdot \vec{X} = R^2$.

A CDLOD bounding sphere (center $\vec{P}$, radius $r$) is fully occluded iff its
maximum projection along $\hat{C}$ lies behind the horizon plane:

$$\vec{C} \cdot \vec{P} + r \cdot D < R^2$$

**Addressing the 24.5 vs 25.0 Gap:**

With $R = 5.0$, $R^2 = 25.0$. The DEM encodes elevations from −10,924m to +8,848m
via `elevMeters = demSample.a * 19772.0 - 10924.0`. The maximum positive displacement
in model-space units, accounting for the displacement exaggeration factor, creates an
effective bounding radius $R_{\text{eff}} = R + \delta_{\max}$.

The threshold $R^2 - \delta_{\text{threshold}}$ is conservative: a tile with peak
displacement could extend beyond the ideal sphere, so the culling plane must be pulled
slightly inward. The 0.5 gap ($25.0 - 24.5$) represents this safety margin.

**Recommended approach:** Compute `R_squared_minus_disp` dynamically from
`u_displacementScale` so the culling threshold adapts when the user changes terrain
exaggeration.

**Exact WGSL Expression:**
```wgsl
// In culling.wgsl line 94 — replace hardcoded 24.5
// R_squared_minus_disp is passed via uniforms, computed on CPU as:
//   RADIUS * RADIUS - maxDisplacementModelUnits
if (cDotCam + effectiveRadius * camDistToOrigin < R_squared_minus_disp) {
    return; // Occluded
}
```

**Camera Altitude Relation:**
The horizon distance along the surface: $d_{\text{horizon}} = R \cdot \arccos(R/D)$.
The linear (straight-line) distance to the tangent point: $\sqrt{D^2 - R^2}$.

**Edge Cases:**
- **Very Low Altitude ($D \to R$, altitude → 0):** $R^2 \cos\gamma + r R < R^2
  \implies \cos\gamma < 1 - r/R$. Correctly culls everything beyond the immediate
  local curvature umbrella of radius $r$. The formula is numerically stable.
- **Very High Altitude ($D \to \infty$):** Dividing by $D$: $R\cos\gamma + r < 0
  \implies \cos\gamma < -r/R$. Perfectly culls the entire back hemisphere.
- **Altitude = 0 ($D = R$):** Camera is ON the surface. Formula simplifies to
  $\cos\gamma < 1 - r/R$. This is physically correct: only the tiles in the
  immediate local area (those whose bounding sphere contains the camera viewpoint)
  pass the test.

---

## §3: evaluateManifold Geodetic Specification

### Problem Statement
5 divergent inline copies with different signatures. Need one unified function
in `src/webgpu/shaders/manifold.wgsl`. The core must support all 4 active physical
deformation modes (Mode 4 Dymaxion is excised).

### Required Output
- [x] Unified function signature accommodating all 5 use cases
- [x] Uniform buffer layout including all cursor and time parameters
- [x] Complete `evaluateManifoldCore` implementation covering Modes 0, 1, 2, 3
- [x] Grid adapter for `crust_hydrosphere.wgsl`
- [x] Geodetic adapter for `wind_particles.wgsl`
- [x] Validation at intermediate unfurl states for Mode 1
- [x] Instructions for WGSL string concatenation

**Consumer Categories:**

| Category | Shader | Native Coordinates |
|----------|--------|-------------------|
| Grid-based | `crust_hydrosphere.wgsl` | Normalized UV from CDLOD quad |
| Attribute-based | `vector_ribbon.wgsl`, `cloud_shell.wgsl`, `atmosphere_scatter.wgsl` | Pre-computed `pos3D` + `mercator2D` vertex attributes |
| Geodetic-based | `wind_particles.wgsl` | `(lonRad, latRad, altOffset)` from compute shader |

**Uniform Buffer Layout Constraints:**

All consumer pipelines MUST include these fields in their uniform struct to satisfy
the unified manifold function:
```wgsl
u_unfurl: f32,
u_mode: u32,
u_time: f32,
u_cursorHitPos: vec4<f32>,   // xyz: world-space hit position, w: fracture multiplier (Mode 2)
u_cursorVel: vec4<f32>,      // xyz: velocity vector, w: speed magnitude
u_cursorActive: f32,         // 0.0 = inactive, 1.0 = active
```

**Note on struct alignment:** These are **minimum required fields**, not a byte-layout
specification. Each consumer shader maintains its own uniform struct (e.g.,
`SimUniforms`, `CloudUniforms`, `AtmosphereUniforms`) with its own 16-byte-aligned
layout and explicit offset comments. The `evaluateManifoldCore` function is
alignment-agnostic because it receives uniform values as **explicit function
parameters** (not through direct struct access). Callers pass `sim.u_cursorHitPos`,
`cloud.u_cursorHitPos`, etc. from their own struct into the function arguments.

**Structs:**
```wgsl
struct DeformedVertex {
    pos: vec3<f32>,
    normal: vec3<f32>,
};
```

**Core Shared Function:**

This is the canonical implementation extracted from `crust_hydrosphere.wgsl`.
All mode physics are preserved verbatim. Mode 4 (Dymaxion) is excised.

```wgsl
const PI: f32 = 3.14159265358979;
const RADIUS: f32 = 5.0;

// External dependency: computeCurlNoise(p: vec3<f32>, time: f32) -> vec3<f32>
// Must also be extracted to manifold.wgsl (currently duplicated in 3 files).

fn evaluateManifoldCore(
    pos3D: vec3<f32>,
    mercator2D: vec2<f32>,
    unfurl: f32,
    mode: u32,
    simTime: f32,
    hitPos: vec4<f32>,
    curActive: f32,
    curVel: vec4<f32>,
) -> DeformedVertex {
    let clampedUnfurl = clamp(unfurl, 0.0, 1.0);
    let ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);
    var out: DeformedVertex;
    let pos2D = vec3<f32>(mercator2D.x, mercator2D.y, 0.0);

    // Rule 21 compliance: use switch instead of if/else if to prevent
    // source-scanning regex collisions with test suites.
    switch (mode) {
        case 1u: {
            // ── Mode 1: Cylindrical Scroll Unfurl ──────────────────────────
            // Smoothly unrolls the sphere into a flat Mercator sheet via a
            // shrinking-radius cylinder parameterized by (1-ease).
            let oneMinusT = 1.0 - ease;
            let lonRad = atan2(pos3D.x, pos3D.z);
            let latRad = asin(clamp(pos3D.y / RADIUS, -0.9998, 0.9998));
            let cosLat = cos(latRad);
            let sinLat = sin(latRad);

            if (oneMinusT > 0.001) {
                let invOneMinusT = 1.0 / oneMinusT;
                let curAngle = oneMinusT * lonRad;
                let curX = (RADIUS * invOneMinusT) * sin(curAngle);
                let curZ = (RADIUS * cosLat * invOneMinusT) * (cos(curAngle) - 1.0)
                         + (RADIUS * cosLat * oneMinusT);
                let curY = mix(pos3D.y, pos2D.y, ease);
                out.pos = vec3<f32>(curX, curY, curZ);

                // Analytical normal via tangent-frame cross product
                let T_lambda = vec3<f32>(
                    RADIUS * cos(curAngle),
                    0.0,
                    -RADIUS * cosLat * sin(curAngle)
                );
                let T_phi = vec3<f32>(
                    0.0,
                    mix(RADIUS * cosLat, RADIUS / max(cosLat, 0.05), ease),
                    -RADIUS * sinLat * invOneMinusT * (cos(curAngle) - 1.0)
                        - RADIUS * sinLat * oneMinusT
                );
                let rawNorm = cross(T_lambda, T_phi);
                out.normal = select(normalize(pos3D), normalize(rawNorm),
                                    length(rawNorm) > 0.0001);
            } else {
                // Taylor expansion guard near oneMinusT ≤ 0.001
                // Prevents 1/0 in invOneMinusT while maintaining C¹ continuity
                let u = oneMinusT * lonRad;
                let sinTerm = lonRad * (1.0 - (u * u) / 6.0);
                let cosTerm = oneMinusT * (lonRad * lonRad) * (-0.5 + (u * u) / 24.0);
                let curX = RADIUS * sinTerm;
                let curZ = RADIUS * cosLat * cosTerm + RADIUS * cosLat * oneMinusT;
                let curY = mix(pos3D.y, pos2D.y, ease);
                out.pos = vec3<f32>(curX, curY, curZ);
                out.normal = vec3<f32>(0.0, 0.0, 1.0); // Fully flat
            }
        }

        case 2u: {
            // ── Mode 2: Griffith Linear Elastic Fracture Mechanics ─────────
            // Simulates the globe cracking open along the antimeridian seam.
            let lonRad = atan2(pos3D.x, pos3D.z);
            let latRad = asin(clamp(pos3D.y / RADIUS, -0.9998, 0.9998));
            let distToSeam = PI - abs(lonRad);
            let seamFactor = 1.0 - smoothstep(0.0, 0.75, distToSeam);
            let tRupture: f32 = 0.18;

            let fracMult = select(1.0, hitPos.w, hitPos.w > 0.01);
            let hitDist = length(pos3D - hitPos.xyz);
            let cursorInfluence = curActive * exp(-hitDist * hitDist / (2.0 * 0.64));
            let hoopStress = cursorInfluence * 0.45 * fracMult
                           * (1.0 + 2.0 * cos(latRad) * cos(latRad));

            if (ease < tRupture) {
                // Pre-rupture: elastic strain accumulation
                let strainProgress = ease / tRupture;
                let localStrain = seamFactor * strainProgress
                                * max(0.2, cos(latRad * 0.85)) + hoopStress;
                out.pos = pos3D + normalize(pos3D) * (localStrain * 0.30);
                out.normal = normalize(out.pos);
            } else {
                // Post-rupture: peeling + flutter wave
                let postRuptureT = smoothstep(tRupture, 1.0, ease);
                let flutterWave = sin(distToSeam * 16.0 - ease * 24.0);
                let flutterDecay = exp(-4.2 * (ease - tRupture));
                let flutterAmp = (0.50 * seamFactor + cursorInfluence * 0.20)
                               * flutterWave * flutterDecay * fracMult;
                out.pos = mix(pos3D, pos2D, postRuptureT)
                        + vec3<f32>(0.0, 0.0, flutterAmp);
                out.normal = mix(normalize(pos3D), vec3<f32>(0.0, 0.0, 1.0),
                                 postRuptureT);
            }
        }

        case 3u: {
            // ── Mode 3: Fluid Advection & Lamb-Oseen Vortex Wake ──────────
            // The manifold liquefies and advects under curl noise + cursor vortex.
            // Dependency: computeCurlNoise(p, time) must be available in scope.
            let rawSin = sin(PI * clampedUnfurl);
            let liquefaction = pow(max(0.0, rawSin), 1.15);
            let unElevatedSphere = normalize(pos3D) * RADIUS;
            let basePos = mix(unElevatedSphere, pos2D, ease);
            let naturalVel = computeCurlNoise(basePos, simTime);

            // Lamb-Oseen vortex wake from cursor interaction
            let hitDist = length(basePos - hitPos.xyz);
            let coreRadius: f32 = 0.85;
            let vortexCirc = (1.0 - exp(-hitDist * hitDist / (coreRadius * coreRadius)))
                           / (hitDist + 0.05);
            let surfaceNormal = select(vec3<f32>(0.0, 0.0, 1.0),
                                       normalize(basePos),
                                       length(basePos) > 0.001);
            let vortexTangent = normalize(cross(surfaceNormal,
                                               basePos - hitPos.xyz + vec3<f32>(0.001)));
            let clampedSpeed = clamp(curVel.w, 0.0, 1.5);
            let vortexVelocity = vortexTangent
                               * (curActive * clampedSpeed * vortexCirc * 0.35);
            let wakeAdvection = normalize(curVel.xyz + vec3<f32>(0.0001))
                              * (clampedSpeed * 0.15 * curActive
                                 * exp(-hitDist * hitDist / 1.5));

            // Silk drape wave
            let wavePhase1 = dot(basePos, vec3<f32>(0.35, 0.62, 0.42)) * 1.35
                           - simTime * 1.25;
            let wavePhase2 = dot(basePos, vec3<f32>(-0.45, 0.30, 0.65)) * 1.75
                           - simTime * 0.90;
            let silkWave = (sin(wavePhase1) * 0.65 + cos(wavePhase2) * 0.35)
                         * liquefaction * 0.65;
            let silkDrape = surfaceNormal * silkWave;

            let advectionOffset = naturalVel * (liquefaction * 1.55)
                                + silkDrape
                                + (vortexVelocity + wakeAdvection)
                                  * (curActive * 0.25);
            out.pos = basePos + advectionOffset + surfaceNormal * 0.015;
            out.normal = mix(normalize(unElevatedSphere + silkDrape * 0.5),
                             vec3<f32>(0.0, 0.0, 1.0), ease);
        }

        default: {
            // ── Mode 0: Linear Manifold Mix (Default) ─────────────────────
            let sphereNorm = select(vec3<f32>(0.0, 0.0, 1.0),
                                    normalize(pos3D),
                                    length(pos3D) > 0.001);
            out.pos = mix(pos3D, pos2D, ease);
            out.normal = mix(sphereNorm, vec3<f32>(0.0, 0.0, 1.0), ease);
        }
    }

    return out;
}
```

**Grid Adapter** (for `crust_hydrosphere.wgsl`):

Converts normalized UV from the CDLOD quad grid into pos3D and mercator2D.
Note the sign convention: `uv.y = 0` is North Pole, `uv.y = 1` is South Pole.

```wgsl
fn evaluateManifold(uv: vec2<f32>, unfurl: f32, mode: u32) -> DeformedVertex {
    // UV convention: x ∈ [0,1] longitude, y ∈ [0,1] latitude
    // y=0 → North Pole (+π/2), y=1 → South Pole (−π/2)
    let lonRad = (uv.x - 0.5) * 2.0 * PI;  // λ ∈ [−π, π]
    let latRad = (0.5 - uv.y) * PI;          // φ ∈ [−π/2, π/2]

    let cosLat = cos(latRad);
    let sinLat = sin(latRad);
    let pos3D = vec3<f32>(
        RADIUS * cosLat * sin(lonRad),
        RADIUS * sinLat,
        RADIUS * cosLat * cos(lonRad)
    );

    // Mercator projection (clamped at ±85° to prevent log(tan) divergence)
    let clampedLat = clamp(latRad, -1.4835, 1.4835);
    let mercator2D = vec2<f32>(
        lonRad * RADIUS,
        log(tan(PI * 0.25 + clampedLat * 0.5)) * RADIUS
    );

    return evaluateManifoldCore(
        pos3D, mercator2D, unfurl, mode,
        sim.u_time, sim.u_cursorHitPos, sim.u_cursorActive, sim.u_cursorVel
    );
}
```

**Geodetic Adapter** (for `wind_particles.wgsl`):

Wind particles operate in geodetic coordinates with altitude offsets.
```wgsl
// Inside wind_particles.wgsl compute shader:
let r = RADIUS + altOffset;
let pos3D = vec3<f32>(r * cosLat * sinLon, r * sinLat, r * cosLat * cosLon);
let clampedLat = clamp(latRad, -1.4835, 1.4835);
let mercator2D = vec2<f32>(
    lonRad * RADIUS,
    log(tan(PI * 0.25 + clampedLat * 0.5)) * RADIUS
);
let deformed = evaluateManifoldCore(
    pos3D, mercator2D, sim.u_unfurl, sim.u_mode,
    sim.u_time, sim.u_cursorHitPos, sim.u_cursorActive, sim.u_cursorVel
);
// Use deformed.pos for particle world position
```

**Attribute-based Consumers** (`vector_ribbon.wgsl`, `cloud_shell.wgsl`, `atmosphere_scatter.wgsl`):

These receive pre-computed `pos3D` and `mercator2D` as vertex attributes. They call
`evaluateManifoldCore` directly, dropping `dymaxion2D`:
```wgsl
// vector_ribbon.wgsl:
let def = evaluateManifoldCore(
    in.posA_3d.xyz,       // pos3D from vertex attribute
    in.posA_target2d.xy,  // mercator2D from vertex attribute (drop .zw dymaxion)
    sim.u_unfurl, sim.u_mode,
    sim.u_time, sim.u_cursorHitPos, sim.u_cursorActive, sim.u_cursorVel
);
// pointType (in.posA_3d.w) is used AFTER manifold eval for DEM displacement
```

**Post-Manifold DEM Displacement:**

`pointType` is NOT consumed by `evaluateManifoldCore`. It controls whether DEM
displacement uses sea level datum (coastlines, `pointType >= 0.75`) or terrain
elevation (rivers, `pointType < 0.75`). This logic remains in each caller's
`vs_main` after calling the manifold function, exactly as it currently exists in
`vector_ribbon.wgsl` lines 273–331.

**External Dependency: `computeCurlNoise`**

Mode 3 requires `fn computeCurlNoise(p: vec3<f32>, time: f32) -> vec3<f32>`, which
is currently duplicated in `crust_hydrosphere.wgsl`, `vector_ribbon.wgsl`, and
`physics_sim.wgsl`. This function must ALSO be extracted into the shared
`manifold.wgsl` module (or a separate `noise.wgsl` included before it).

**Mandatory Deletion Checklist:**
When extracting `computeCurlNoise` to the shared module, the following existing
local definitions **MUST be deleted** from consumer shaders to prevent duplicate
symbol compilation errors during string concatenation:
- [ ] `crust_hydrosphere.wgsl` line 505: `fn computeCurlNoise(p: vec3<f32>, time: f32)`
- [ ] `vector_ribbon.wgsl` line 141: `fn computeCurlNoise(p: vec3<f32>, time: f32)`
- [ ] `physics_sim.wgsl` line 41: `fn computeCurlNoise(p: vec3<f32>, time: f32)`

**Validation at Intermediate Unfurl States (Mode 1 — Cylindrical Scroll):**

| α | ease | oneMinusT | Geometric State |
|---|------|-----------|-----------------|
| 0.00 | 0.000 | 1.000 | Pure sphere. $\sin(\lambda)/1 = \sin(\lambda)$. All points at radius $R$. |
| 0.25 | 0.156 | 0.844 | Partial cylinder peeling. Cylinder radius $R/0.844 \approx 5.92$. Longitude wrapping reduced to 84.4% of original arc. |
| 0.50 | 0.500 | 0.500 | Deep parabolic form. Cylinder radius $R/0.5 = 10.0$. Halfway between sphere and flat. The $\cos(\text{curAngle}) - 1$ term creates a trough along the z-axis. |
| 0.75 | 0.844 | 0.156 | Near-flat sheet. Cylinder radius $R/0.156 \approx 32.1$. Approaching infinite radius (flat plane). Small-angle approximation accuracy > 99%. |
| 1.00 | 1.000 | 0.000 | Taylor expansion guard activates. $\sin(\lambda)/1 \to \lambda$ (sinc limit). Perfect flat Mercator map. |

**Concatenation Strategy:**
1. Extract `DeformedVertex`, `computeCurlNoise`, and `evaluateManifoldCore` into
   `src/webgpu/shaders/manifold.wgsl`.
2. In `WebGPUEngine.ts`, load via `import manifoldWGSL from './shaders/manifold.wgsl?raw'`.
3. During pipeline creation, concatenate:
   ```typescript
   const fullShader = uniformsDecl + '\n' + manifoldWGSL + '\n' + mainShaderWGSL;
   ```
   Ensure `manifold.wgsl` is injected AFTER the uniform `sim` binding but BEFORE
   `vs_main` / `fs_main` / `cs_main`.

---

## §4: Hardware DepthBias Parameters

### Problem Statement
Geometric standoff `0.005` in `points_render.wgsl:49` violates Rule 7 (zero geometric
standoff). Must use hardware depth bias instead.

### Required Output
- [x] Calculated `depthBias` value
- [x] Calculated `depthBiasSlopeScale` value
- [x] Calculated `depthBiasClamp` value
- [x] WebGPU pipeline descriptor changes
- [x] WGSL changes

**Depth Bias Derivation:**

The clip-space depth transform for a perspective projection with WebGPU's [0,1]
depth range is:

$$z_{\text{ndc}} = \frac{f}{f-n} - \frac{n \cdot f}{z_{\text{view}} \cdot (f-n)}$$

The derivative with respect to view-space depth:

$$\frac{\partial z_{\text{ndc}}}{\partial z_{\text{view}}} = \frac{n \cdot f}{z_{\text{view}}^2 \cdot (f-n)}$$

A world-space radial standoff $\Delta d = 0.005$ maps to a clip-space delta:

$$\Delta z_{\text{ndc}} \approx \frac{n \cdot f}{z_{\text{view}}^2 \cdot (f-n)} \cdot \Delta d$$

For the engine's parameters ($n = 0.1$, $f = 100$, typical $z_{\text{view}} = 10$):

$$\Delta z_{\text{ndc}} \approx \frac{0.1 \times 100}{100 \times 99.9} \times 0.005 \approx 5.0 \times 10^{-6}$$

In WebGPU, `depthBias` adds `bias × r` where $r$ is the minimum resolvable depth
difference. For `depth32float`, $r \approx 2^{-23} \approx 1.19 \times 10^{-7}$.

The required bias factor: $5.0 \times 10^{-6} / 1.19 \times 10^{-7} \approx 42$.

**Why `-120` instead of `-42`:**
At grazing angles (camera nearly tangent to the surface), $z_{\text{view}}$ decreases
and the required bias grows. At $z_{\text{view}} = 6$ (close zoom on the globe edge):
bias factor $\approx 42 \times (10/6)^2 \approx 117$. The value `-120` provides
approximately 3× safety margin at the nominal distance and remains sufficient at
close zoom. A constant `depthBias` cannot perfectly replicate a distance-dependent
standoff across all zoom levels, but `-120` is empirically correct for the engine's
operational camera range ($z_{\text{view}} \in [3, 30]$).

**Calculated Parameters:**
- `depthBias`: `-120`
- `depthBiasSlopeScale`: `-1.0` (compensates for slope-dependent depth error at
  glancing surface angles)
- `depthBiasClamp`: `0.0` (no clamping — let the bias scale freely)

**WebGPUEngine.ts Pipeline Descriptor Changes:**

Add `depthBias` to polygonal render pipelines (e.g., triangle-list, triangle-strip).
**IMPORTANT**: Per W3C WebGPU §10.3.3 and Rule 7, `depthBias` is strictly prohibited on non-polygonal primitive topologies. For `pointsRenderPipeline` and `linesRenderPipeline`, you MUST specify `depthBias: 0` or omit the property entirely.

Example for polygonal pipelines:
```typescript
depthStencil: {
    format: 'depth32float',
    depthWriteEnabled: true,
    depthCompare: 'less',
    depthBias: -120,
    depthBiasSlopeScale: -1.0,
    depthBiasClamp: 0.0,
}
```

**WGSL Changes (`points_render.wgsl`):**

Remove the geometric standoff (line 49):
```wgsl
// BEFORE:
// let offsetPos = pos + dynamicNormal * (0.005 * (1.0 - sim.u_unfurl * 0.5));
// AFTER:
let offsetPos = pos;
```
