# Indicatrix Engine Project Rules

## 1. Authoritative References
Always consult the following master specifications before proposing or making any changes:
- `DESIGN_ETHOS.md`: The 15 core design principles, rendering identities, hydrosphere physics, and framing hierarchy.
- `design-language.md`: Color spaces (OKLCH to Linear sRGB), theme tokens, typographic scale, and HUD geometry.

## 2. Cartographic Framing & HUD Layout Invariants
- **Sheet Neatline Geometry**: The outer neatline is the master boundary (`inset-2` / 8px outer border with `inset-[2px]` inner hairline, sitting 10px from window edge). Corner marks (`00.00°`, `90.00°`, `180.00°`, `270.00°`) must clear floating panels dynamically.
- **The 10px Spatial Clearance Moat**: All floating HUD instruments align to a 20px grid axis (`top-5`, `left-5`, `right-5`). The distance from sheet neatline (10px) to panel edge (20px) is a strict 10px uniform cartographic moat. Never place floating cards within 2–4px of the neatline.
- **Inter-Instrument Clearance (20px Gutters)**: Adjacent floating panels must maintain a 20px (`1.25rem`) clearance gutter:
  - Top header to sidebar: `md:right-[26.5rem]`
  - Top header to catalog sheet on 2xl: `2xl:right-[51.75rem]`
  - Slide-out catalog sheet to sidebar: `2xl:right-[26.5rem]`
- **Single-Border HUD Enclosure Contract**: Floating panels render exactly one perimeter border (`border border-[var(--theme-panel-border)]`). Never add nested inner neatline boxes (`inset-1` or `inset-[2px]`).
- **Defensive Telemetry Flexbox Hierarchy**: Primary survey titles must use `min-w-0 font-bold truncate` with `gap-4` separation from coordinates, with auxiliary metadata hiding responsively below `sm:` (`hidden sm:inline`).

## 3. WebGPU WGSL Uniform Control Flow & Verification Invariant
- **Mandatory Unconditional Derivative Evaluation**: In WGSL fragment shaders, all finite difference derivatives (`fwidth()`, `dpdx()`, `dpdy()`) and implicit-LOD texture sampling operations MUST be evaluated at the top of the entry point function (`fs_main`) in unconditional uniform control flow, strictly before any dynamic branching, conditional blocks, or `discard` statements. Calling derivatives inside or downstream of conditional branches triggers fatal driver-level WebGPU compilation errors (`'fwidth' must only be called from uniform control flow`).
- **Browser GPU Runtime Verification**: Unit tests using mocked WebGPU environments cannot evaluate GPU driver or Dawn WGSL compiler rejections. Whenever modifying WGSL shaders, live browser verification using Chrome DevTools MCP (`list_console_messages` + `take_screenshot`) is mandatory to confirm zero uncaptured runtime errors.

## 4. Cartographic Precision & Tissot Invariants
- **Tissot Indicatrix Conjugate Axes**: Tissot indicatrices must display their internal principal conjugate axes (projected N-S meridian and E-W parallel crosshairs) using dashed technical drafting styling (`[2, 2]`).
- **Neutral Archival Drafting Ink**: Deformation ellipses must be rendered in period-accurate technical drafting inks (warm sepia in Cream Rag, washed architectural cerulean in Cyanotype, marine cyan in Tharp) rather than moralized green/amber/red status indicators, respecting that conformal scale dilation is a mathematical property of Riemannian manifold projection ($K > 0 \to K = 0$).

## 5. WebGPU Canvas Compositing & Substrate Clear Invariants
- **Premultiplied Alpha Transparent Clear Contract**: When `alphaMode: 'premultiplied'` is enabled to allow underlying DOM paper substrates (e.g., Cream Rag `#F3ECE0`) to show through, all render passes targeting the swapchain texture MUST set `clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }`. Specifying non-zero RGB values with $a=0.0$ causes additive blowout against DOM backgrounds ($\text{Color}_{\text{result}} = \text{Color}_{\text{canvas}} + (1-A)\cdot\text{Color}_{\text{DOM}}$), washing out paper tones to `#FFFFFF`.

## 6. Cartographic Substrate & HUD Optical Hierarchy
- **Tactile Sheet Ground vs. Floating Card Separation**: The main sheet ground uses continuous warm paper watercolor washes without repeating Cartesian dot-grids or tile patterns. To ensure optical legibility, floating HUD instruments (sidebar, vernier telemetry, detail panels) must NOT share the exact sheet background; they must render in an ivory vellum card tone (`.paper-cream-panel` / `rgba(252, 249, 242, 0.94)`) with warm cast shadows (`rgba(70, 55, 35, 0.14)`), preserving the visual metaphor of physical drafting instruments resting on the map board.
- **Procedural Micro-Fiber Tooth Allocation**: High-frequency tactile paper tooth belongs exclusively to the WebGPU fragment shader on 3D geometry and terrain surfaces, modulated by the interactive tooth slider (`u_paper_tooth`), rather than CSS repeating tiling which clashes with cartographic neatlines and graticules.

## 7. Vector Hierarchy & Archival Drafting Inks
- **Hydrological vs. Maritime Line Extrusion Ratio**: Major river network line widths must be strictly proportioned below coastline widths (vertex extrusion set to 55–60% of coastline width, e.g., 2.0px vs 3.4px) to preserve physical cartographic scale hierarchy and avoid obscuring coastal estuaries.
- **Archival Inks for Light Substrates**: In light paper modes (Theme 1: Cream Rag), 100% pitch black vectors are prohibited. Coastlines and neatline boundaries must use archival sepia-charcoal ink (`#38302A` with alpha ~0.58), and drainage networks must use washed mineral celadon/lapis glazes (alpha ~0.45) to maintain visual harmony with delicate relief shading.

## 8. The Cartographic Sheet Ontological Reference Frame
- **Master Reference Frame is the Paper Sheet**: The Indicatrix Engine does not simulate a virtual 3D planet floating in dark video game space. It simulates an archival drafting sheet (310 GSM Cotton Rag, 1842 Blueprint, or 1977 Tharp Physiographic Chart) resting on a physical map board experiencing continuous Riemannian manifold deformations.
- **Vectors as Physical Ink**: Vector boundaries and graticules are not 3D floating wire objects; they must be rendered as copperplate intaglio ink absorbed into cellulose paper fibers, ruling-pen incisions, or bathymetric stippling.
- **Framing Hierarchy**: The sheet neatline (`inset-2`, 10px from viewport edge) is the immovable master boundary; floating instruments hover above the drawing board with strict 10px spatial breathing moats.

## 9. Geomorphic Hydrology & DEM-Coupled Drainage Invariant
- **Prohibition of Decoupled 2D Vector River Networks**: In 3D relief cartography, generalized 2D vector river centerlines (such as Natural Earth) must NEVER be used as the primary inland waterway geometry. 2D polylines wander across valley sidewalls and fail to match the physical terrain carved by the Digital Elevation Model (DEM).
- **In-Shader Valley Drainage**: Inland waterways must be derived directly from the DEM's discrete Laplacian curvature ($k_{\text{valley}} = \text{clamp}(\nabla^2 h \cdot 45.0, 0.0, 1.0)$) and elevation descent gradients in the fragment shader (`crust_hydrosphere.wgsl`).
- **Hydraulic Geometry Tapering**: Waterway widths must scale according to Leopold-Maddock hydraulic power laws ($w \propto A^{0.4}$), naturally tapering from headwater rills to coastal estuaries and nesting 100% in the actual DEM valley troughs.

## 10. Zero-Standoff Surface Conformance & Horizon Silhouette Falloff
- **Prohibition of Fixed Normal Elevation Standoffs**: Applying fixed normal offsets (e.g. `standoff = 0.025`) to vector geometry causes lines to detach into the void at the horizon limb (~32 km above the crust), producing jagged, floating black spikes outside the planet silhouette.
- **Surface Conformance**: Vectors must conform strictly to the underlying DEM elevation surface ($z_{\text{standoff}} \le 0.002$).
- **Horizon Tangent Attenuation**: Vector fragments must evaluate surface facing ($\mathbf{n} \cdot \mathbf{v}$) and smoothly attenuate to zero before crossing the planetary horizon limb (`smoothstep(0.02, 0.20, in.facing)`), guaranteeing clean, uncorrupted planetary neatline silhouettes at all camera angles.

## 11. Camera-Distance Adaptive Linework Scaling
- **Prohibition of Fixed Screen-Space Stroke Widths**: Screen-space line extrusions must not remain static (e.g. 3.4px) across all camera altitudes. Static line widths obscure continental geography at orbital scale and appear coarse when zoomed into regional basins.
- **Distance-Invariant Hairline Modulation**: Nominal line width must scale dynamically with camera orbit distance ($\|\mathbf{c}_{\text{cam}}\|$):
  - Orbital/Global View: Attenuates to an ultra-fine, non-intrusive hairline ($\sim 0.35\text{px}$).
  - Regional/Zoomed View: Expands smoothly to technical drafting weight ($\sim 0.75\text{px} - 1.0\text{px}$) without pixel bloat or blunt circular end-caps.

## 12. Canonical Multi-Angle Perceptual Regression Harness (The Anti-Theory Gate)
- **Visual Verification Over Markdown Theory**: No shader, geometry, or thematic refactor is complete based solely on compilation passes or theoretical documentation.
- **The 4 Canonical Benchmark Viewpoints**: Live browser verification via Chrome DevTools MCP (`take_screenshot`) is mandatory across:
  1. *Viewpoint 1 (Limb Horizon)*: Pitch $75^\circ$ oblique view verifying zero detached spikes outside the silhouette.
  2. *Viewpoint 2 (Alpine Basin Zoom)*: $3.5\times$ zoom on the Alps / Po Valley verifying waterways sit in actual DEM valley floors.
  3. *Viewpoint 3 (Planar Unroll)*: Mode 1 $t=1.0$ verifying zero antimeridian seam tearing.
  4. *Viewpoint 4 (1-Frame Medium Hot Switch)*: Rapid shift between Cream Rag, Prussian Cyanotype, and Marie Tharp verifying 120 FPS sustained and zero shader compilation stalls.

## 13. Staged Gating & Context Management for Multi-Agent Swarms
- **Prohibition of Monolithic Multi-System Convergence**: Autonomous multi-agent swarms (`/teamwork-preview`) must NEVER be launched with open-ended mandates touching ingestion, tessellation, atmosphere, and fragment shaders simultaneously.
- **Sequential Gated Milestones**: Complex transformations must be executed in strictly gated, sequential stages (Stage 1: Substrate $\to$ Stage 2: Medium as Ink $\to$ Stage 3: Dynamics $\to$ Stage 4: Kinetic Demo).
- **Cooling Down Protocol**: Agents must pause, report live MCP benchmark captures, and cool down context at each gate. Progression to Stage $(N+1)$ is strictly prohibited until Stage $N$ passes visual review.

## 14. Hardware Depth Bias for Coplanar Cartographic Overlays
- **Prohibition of Geometric Standoff for Z-Fighting**: Never apply 3D vertex normal offsets or elevation shims to prevent z-fighting between coplanar cartographic layers (vectors, graticules, boundary ribbons) and the underlying terrain.
- **Hardware Rasterizer Depth Bias**: Resolve coplanar depth resolution exclusively through the WebGPU pipeline's hardware depth bias in `WebGPUEngine.ts`:
  - `depthBias: -120`
  - `depthBiasSlopeScale: -1.0`
  This guarantees that vector ribbons sit at the true mathematical crust elevation ($z_{\text{standoff}} = 0.0$) while rendering cleanly in front of terrain without z-fighting or horizon detachment.

## 15. Cross-Pipeline DEM Mathematical Parity Invariant
- **Strict Decoding Parity**: Any secondary WebGPU render pass that conforms to the planetary crust (vector ribbons, particle seeders, contour slices, atmospheric interaction) must use the identical geoid decoding formula as `crust_hydrosphere.wgsl`:
  $$\text{elevMeters} = \text{demSample.a} \cdot 19772.0 - 10924.0$$
- **Dynamic Exponent & Attenuation Mirroring**: Orbit-dependent peak exponent formulas ($\text{normH}^{\text{dynamicExp}}$) and polar attenuation curves must match across all shaders. Discrepancies between vertex extrusion in vector shaders and crust vertex/fragment shaders produce subtle submergence or mid-air floating.

## 16. Sub-Texel Parabolic Trough Centering for Geomorphic Hydrology
- **Prohibition of Discrete Grid Staircasing**: Inland waterways derived from discrete DEM Laplacian curvature ($\nabla^2 h$) must not snap rigidly to texel boundaries, which creates jagged diagonal steps.
- **Parabolic Sub-Texel Centering**: Hydrological drainage must compute the continuous local trough minimum using 1D parabolic sub-texel interpolation:
  $$\Delta x = -\frac{h_R - h_L}{2(h_R + h_L - 2h_C)}, \quad \Delta y = -\frac{h_D - h_U}{2(h_D + h_U - 2h_C)}$$
  Waterways must taper according to Leopold-Maddock power laws ($w \in [0.40\text{px}, 1.98\text{px}]$) and maintain Invariant #7 ($58.24\%$ river-to-coastline width ratio).

## 17. Multi-Agent Sentinel & Independent Victory Auditor Contract
- **Prohibition of Self-Certification**: Implementing worker agents or orchestrators must NEVER be permitted to certify their own task completion.
- **Three-Phase Independent Audit Protocol**: Before any `/teamwork-preview` victory is reported, an independent Victory Auditor with a completely clean context must execute and pass three blocking verification phases:
  1. *Phase A (Timeline & Mandate)*: Verify all user requirements and invariant constraints were addressed without dropping tasks.
  2. *Phase B (Integrity & Anti-Cheating)*: Verify tests were not modified to be trivial, no mocked fallbacks were introduced to bypass failures, and implementation code genuinely meets the physical/mathematical rubric.
  3. *Phase C (Independent Test & Live MCP Browser Run)*: Independently execute `npx tsc --noEmit`, full `npm test` across all test tiers, Vite production build, and capture live Chrome DevTools MCP screenshots and console logs.

## 18. Coupled Orographic Lift & Spherical Metric Terrain Gradients
- **Prohibition of Flat-Grid Central Differences on Spherical Geoids**: When coupling 2D horizontal vector fields (e.g. NOAA GFS wind velocity $\mathbf{u}_h$) with 3D elevation models, elevation gradients $\nabla h$ must NEVER be computed as unweighted texel or degree differences ($\Delta h / \Delta \text{lon}$). This causes fatal polar distortion as meridian spacing collapses ($\cos \text{lat} \to 0$).
- **Spherical Metric Arc-Length Evaluation**: Topographic central difference gradients must divide by the true spherical metric tensor:
  $$\Delta x = 2 R_E \cos(\text{lat}) \Delta \lambda, \quad \Delta y = 2 R_E \Delta \phi$$
  Vertical orographic velocity must evaluate as:
  $$w = \mathbf{u}_h \cdot \nabla h(\mathbf{x}) = u_\lambda \frac{\partial h}{\partial x} + u_\phi \frac{\partial h}{\partial y}$$
  generating physically accurate ridge lift over mountain barriers (Alps, Andes) and leeward rain shadows.

## 19. Dynamic Vehicle Ground Clearance Safety Envelope & Shadow Scaling
- **Prohibition of Unbounded Vertical Physics over Variable Relief**: Dynamic aerial vehicles (e.g. origami crane, camera probes) coupled to orographic lift fields must enforce a strict terrain-following safety floor:
  $$z_{\text{vehicle}} \ge h(\mathbf{x}) + z_{\text{min}} \quad (z_{\text{min}} \ge 80\text{m})$$
- **Dynamic Ground Shadow Scaling**: Ground projection shadows must modulate radius with terrain elevation and altitude:
  $$R_{\text{shadow}} = R_{\text{base}} + c_1 + \max(0, h) \cdot c_2$$
  ensuring visible spatial grounding without clipping through summits or submerging into bathymetric troughs.

## 20. WebGPU Core vs. Lazy Dynamic Buffer Discipline & 16-Byte Uniform Packing
- **The 5-Core-Buffer Startup Invariant**: The WebGPU engine must initialize with exactly 5 core buffers (`simUniforms`, `crustUniforms`, `sphereVertexBuffer`, `sphereIndexBuffer`, `quadCornerBuffer`). Auxiliary subsystems (wind ribbons, particles, dynamic vehicles) must allocate lazily upon first activation (`ensureWindBuffers()`, `ensureCraneBuffers()`) and cleanly destroy buffers on `engine.dispose()` with zero VRAM leaks.
- **Strict 16-Byte WGSL Struct Alignment**: All uniform structs expanded with vector fields (e.g. `u_mediumProperties: vec4<f32>` at byte offset 256) must adhere to 16-byte alignment boundaries. TypeScript float packing (`Float32Array`) must maintain exact parity between float index ($offset / 4$) and WGSL byte offsets.

## 21. Cartographic HUD Dynamic Cascading & Responsive Boundary Occlusion
- **The 20px Vertical Cascading Contract**: In stacked left-column instruments (Cartouche $\to$ Aside Rosette $\to$ Toast Notifications), upper elements must dynamically cascade their bottom offsets based on the visibility of elements beneath them:
  - Aside: `showCartouche ? 'bottom-[112px]' : 'bottom-5'` (maintaining $\ge 20$px from Cartouche top at `h - 92px`).
  - Toast: `showCartouche ? 'bottom-[170px]' : 'bottom-[78px]'` (maintaining $\ge 20$px from Aside top).
- **Responsive Collision Suppression**: On viewports below `md:` ($< 768$px), floating headers and right geodetic corner marks that collide with or become trapped under the fixed 384px sidebar must dynamically hide (`max-md:hidden`).
- **Corner Mark Clearance**: Neatline corner marks (`⌜ ⌝ ⌞ ⌟`) belong to the outer neatline layer (`inset-2`, 10px from edge) and must never encroach or overlap with floating HUD cards.

## 22. Comprehensive Multi-Medium Verification Gate Contract (The Anti-Single-Medium Trap)
- **Prohibition of Single-Theme Verification**: When an application or simulation engine supports multiple visual themes, physical mediums, or optical modes (e.g. Cream Rag, Prussian Cyanotype, Marie Tharp), no visual verification gate, adversarial review, or independent audit may pass based on captures of a single default or hero theme.
- **The M-Way Capture Matrix**: Every visual verification milestone requires an $M$-way capture matrix capturing the target viewpoint across ALL active mediums, explicitly inspecting color contrast, text legibility, linework sharpness, and shader compilation.
- **Empirical Hot-Switch Telemetry**: Verification must measure theme switching latency using high-resolution performance timers (`performance.now()`), verifying that switching completes within $\le 1\text{ frame}$ ($< 8.3\text{ms}$ at 120 Hz) with zero pipeline recompilations and zero console warnings.

## 23. Concrete Metric Grounding for Layout & HUD Refactors
- **Prohibition of Abstract Layout Mandates**: Autonomous agents and swarms must NEVER be dispatched with open-ended or subjective layout directives (e.g. "audit and clean up HUD margins", "ensure good responsiveness").
- **Mandatory Pre-Flight Pixel Auditing**: Prior to dispatching an implementation agent for layout changes, pre-flight research MUST evaluate computed DOM boundaries, exact bounding box positions, and calculate specific pixel gaps:
  - Identify the exact current measurement vs. required invariant (e.g., current gap $= 6\text{px}$, invariant requires $\ge 20\text{px} \implies \text{delta} = +14\text{px}$).
  - Name the target file, line number, and exact Tailwind/CSS classes to replace (e.g., shift `bottom-[98px]` to `bottom-[112px]`).
  - Provide programmatic unit test assertions (e.g., verifying bounding box distance $\ge 20\text{px}$) that implementation workers must satisfy.

## 24. Uniform-Buffer-Driven Dynamic Medium Switching (Zero-Recompile Contract)
- **Prohibition of Pipeline Recompilation on Thematic Changes**: Switching themes, physical materials, or drafting mediums must NEVER trigger pipeline re-creation (`device.createRenderPipeline()`), pipeline layout changes, or shader module recompilation.
- **Uniform Buffer Parameterization**: All physical medium parameters (Kubelka-Munk absorption/scattering coefficients, paper fiber tooth frequency, cyanotype sensitometric exposure gamma, physiographic stipple density) must be packed into 16-byte aligned uniform structs (e.g. `u_mediumProperties: vec4<f32>`).
- **Sub-Millisecond Switching Performance**: Dynamic theme switching must execute exclusively via single-pass uniform buffer updates (`device.queue.writeBuffer()`), guaranteeing average transition latency $\le 0.05\text{ms}$ without dropping a single frame during interactive user toggling.

## 25. Lossless Dossier Gating & Telemetry Macro-Capture Invariant
- **Prohibition of Compound Deliverable Prompts**: When translating master dossiers or specifications into `/teamwork-preview` prompts, never combine multiple visual deliverables into compound sentences (e.g. "capture Viewpoint X and confirm telemetry"). Every numbered capture (Capture 1, 2, ... N) MUST be an independent, checkable acceptance criterion with an explicit target image filename in `screenshots/`.
- **Mandatory Active HUD Instrument Captures**: When a milestone deliverable involves dynamic telemetry, sensors, or physics readouts (e.g. variometer climb rate, bathymetric tide gauge, coordinate verniers), verification MUST provide both:
  1. The macro scene/viewpoint capture.
  2. A dedicated, focused capture of the active HUD drawer or telemetry badge displaying the non-zero, measured metric (e.g. `▲ +1.5 m/s`).

## 26. Predictive Lookahead & DEM-Coupled Vehicle Ground Shadow Invariant
- **Predictive Terrain Following**: Aerial craft and camera probes traversing 3D digital elevation models must sample ground elevation along their forward ground-track velocity vector:
  $$\mathbf{x}_{\text{pred}} = \mathbf{x} + \mathbf{v}_g \cdot \tau \quad (\tau \ge 2.0\text{s})$$
  initiating aerodynamic climb before encountering mountain faces, supplemented by a hard-clamped ground clearance floor ($z \ge h(\mathbf{x}) + 80\text{m}$).
- **Orographic Scale-Height Attenuation**: Vertical kinematic updraft must attenuate with altitude above terrain:
  $$w(z) = (\mathbf{u}_h \cdot \nabla h) \cdot \exp\left(-\frac{\max(0, z - h)}{2500\text{m}}\right)$$
- **Dynamic DEM Ground Shadow Projection**: Vehicle ground shadows must never be clamped to a static sphere radius. The shadow quad position must evaluate the underlying DEM crust elevation $h(\mathbf{x})$:
  $$\mathbf{p}_{\text{shadow}} = \frac{\mathbf{p}_{\text{vehicle}}}{\|\mathbf{p}_{\text{vehicle}}\|} \cdot (R_0 + z_{\text{standoff}} + h(\mathbf{x}) \cdot \text{scale})$$
  modulating shadow radius and opacity inversely with AGL altitude to ground the craft accurately across summits and valleys.

## 27. Independent Victory Auditor Capture Count Accounting
- **The Capture Count Gate**: In addition to running test suites and checking console logs, the Victory Auditor MUST perform an exact file count comparison between the master specification's capture inventory and the files present in `screenshots/`.
- **Automatic Audit Failure**: If the specification requires $K$ viewpoints across $M$ active themes, the presence of fewer than $K \times M$ unique visual captures constitutes an automatic **AUDIT FAILURE**, preventing premature victory certification.

## 28. Exhaustive Multi-Medium Shader Parity & Historical Identity Conservation
- **Prohibition of Binary Theme Branching**: When the engine supports $M \ge 3$ drafting mediums (Theme 0: Marie Tharp 1977, Theme 1: Cream Rag, Theme 2: Prussian Cyanotype 1842), shaders must NEVER use binary branching (`if (theme == 1) ... else ...`) or default fallthroughs that collapse two distinct mediums into identical rendering.
- **Dedicated Inks Across All Render Passes**: Every renderable shader (`vector_ribbon`, `wind_ribbon_render`, `points_render`, `lines_render`, `contour_topology`, `origami_crane`, `crust_hydrosphere`) MUST contain an explicit branch for every supported medium, rendering in that medium's period-accurate archival ink:
  - Theme 0 (Marie Tharp): Dark marine indigo (`#1E293B`), ocean bathymetric stippling, continental pen-and-ink physiographic hatching.
  - Theme 1 (Cream Rag): Archival sepia-charcoal ink (`#38302A`), cotton rag cellulose fiber absorption, Lehmann slope hachuring.
  - Theme 2 (Prussian Cyanotype): Photochemical actinic white-on-Prussian inversion, washed cerulean vectors (`#A5D5FF`), blueprint linen tooth.
- **Cartographic Precision Conservation**: Medium physics (tooth, absorption, actinic gamma) must remain strictly orthogonal to geometric precision. Adding tactile medium effects must NEVER soften coastline zero-standoff, blur DEM valley trough drainage, or alter elevation decoding parity.

## 29. The Zero-Orphan Integration Contract (The Anti-Disconnected-Code Invariant)
- **Prohibition of Headless Core Implementations**: Creating controllers, kinematics engines, or math utilities in `src/core/` that pass unit tests but are unimported in the active React component tree or render loop is strictly prohibited.
- **Mandatory Call-Site Verification**: Any task introducing a controller (e.g. `TrajectoryCameraController`) or shader pipeline must include the call site wiring (in `WebGPUCanvas.tsx`, `App.tsx`, or a dedicated hook), an interactive trigger or autonomous loop, and verified live browser invocation. Dead code or orphaned files are treated as an automatic **AUDIT FAILURE**.

## 30. Pre-Profiling Semantic Realization Gate (When to Profile vs. When to Complete)
- **Prohibition of Premature Profiling**: Performance profiling and canonical demo capture (Stage 4) must NEVER be executed while the underlying engine has incomplete shader branches, unrepresented mediums, or unwired demo controllers.
- **Semantic Completeness Prerequisite**: Before initiating GPU profiling or demo media generation, the engine must pass a Semantic Parity Audit:
  1. All $M$ mediums render correctly across all $P$ active render passes.
  2. The rapid medium hot-switch test passes with zero visual artifacts.
  3. The camera flight path is actively connected and controllable.
  Only after semantic completeness is verified may performance metrics be treated as valid ground truth.

## 31. Frontier Deferral & Substrate Stability Protocol
- **Prohibition of Architectural Stack Ambition**: When completing physical medium or UI refinement stages, agents must NEVER prematurely introduce unrequested architectural overhauls (e.g. dynamic CLOD sphere tessellation, compute pass flow accumulation).
- **Substrate Preservation**: Foundational geometry and elevation decoding must remain deterministic and stable while tuning fragment shaders and medium optics. Major structural frontiers must be scheduled as independent, isolated milestones only after current medium stages pass canonical visual verification.

## 32. DEM Resolution Tracking & Cross-Pipeline Parity Invariant
- **Single Source of Truth for DEM Dimensions**: The WebGPU DEM texture dimensions are defined in `WebGPUEngine.ts` (texture creation size and uniform buffer writes). ALL shader files that reference texel dimensions MUST consume these values from uniform buffers rather than hardcoding `vec2<f32>(2048.0, 1024.0)` or similar constants.
- **Mandatory Cross-File Update Protocol**: When the DEM texture resolution changes (e.g., from 2048×1024 to 8192×4096), the following files MUST be updated atomically in a single commit:
  1. `scripts/precompute-etopo2022.py` (output dimensions)
  2. `src/webgpu/WebGPUEngine.ts` (texture creation + uniform writes)
  3. `src/webgpu/shaders/crust_hydrosphere.wgsl` (texSize constant)
  4. `src/webgpu/shaders/wind_particles.wgsl` (dLon/dLat constants)
  5. Any other shader consuming DEM texel spacing
- **Prefer Uniform-Driven Resolution**: When feasible, pass DEM texture dimensions via the existing uniform buffer rather than hardcoding in WGSL, so future resolution changes require only TypeScript-side updates.

## 33. Video Capture QA Gate for Medium-Identity Verification
- **Prohibition of Screenshot-Only QA for Motion-Dependent Effects**: When verifying medium physics that involve continuous rendering (paper tooth under camera rotation, stippling density across zoom transitions, actinic exposure gradients during panning), static screenshots are insufficient. A 5-10 second screencast MUST be captured per medium per viewpoint.
- **Litmus Test Locations**: Hawaii (20°N, 156°W) and Cape Cod (42°N, 70°W) serve as primary litmus tests. If geographic features at these locations are not identifiable at regional zoom, the rendering detail is insufficient.
- **Medium-Identity Questions**: Each captured video must be evaluated against:
  1. Does the output read as the intended physical reproduction technology?
  2. Is the substrate (paper/linen/board) visually present?
  3. Are medium-specific showcase features active (contours, stippling, exposure inversion)?
  4. Zero theme bleed from other mediums?

## 34. High-Relief Proximity & Near-Plane Clipping Floor
- **Prohibition of Unbounded Close Camera Orbits on Relief Peaks**: When targeting or zooming into extreme elevations ($h \ge 3500\text{m}$, e.g. Hawaii, Mt. Rainier, Alps, Himalayas), camera orbit radius must NEVER be positioned arbitrarily close to base sphere radius ($R_0 = 5.0$).
- **Near-Plane Safety Margin**: The camera perspective projection defines a strict near clipping plane ($z_{\text{near}} = 0.1$). Because vertical terrain displacement pushes summits outwards to $R_{\text{summit}} \approx R_0 + h \cdot \text{scale} \approx 5.18$, camera orbit distance must enforce a strict geometric clearance floor:
  $$R_{\text{cam}} \ge R_0 + h_{\text{max}} \cdot \text{scale} + z_{\text{near}} + \Delta_{\text{margin}} \ge 5.8$$
  Camera radius $< 5.8$ at summit coordinates breaches the near plane, producing massive pitch-black polygonal clipping voids across mountain massifs.

## 35. Lossless Compressed Texture Fallback Decoding & HTTP Status Contract
- **Explicit Network Status Validation**: When streaming binary textures or fallbacks via `fetch()`, `res.ok` MUST be explicitly validated before consuming payloads. HTTP 404/500 responses do not reject the `fetch()` promise; proceeding to read response bodies without `res.ok` causes 404 error text to corrupt binary buffers and bypass fallback catch blocks.
- **Lossless Image Container Decompression**: When loading compressed fallback image containers (`.webp`, `.png`, `.jpg`), raw container bytes must NEVER be fed directly into raw WebGPU buffer typed arrays (`Uint8Array`). In browser environments, textures must be decoded via `createImageBitmap(blob)`, rasterized through `OffscreenCanvas` to extract raw RGBA8 pixels, and processed through multi-level mipmap generation (`generateMipsRGBA8`) before queue upload.

## 36. Dynamic Multi-Resolution CPU DEM Sampling Resilience
- **Prohibition of Static Grid Dimensions in CPU Sampling**: Analytical CPU-side elevation queries (`sampleCPUElevation(lon, lat)`) must never assume fixed or hardcoded grid dimensions ($2048 \times 1024$ or $8192 \times 4096$).
- **Dynamic Dimension Deduction**: If `cpuDEMData.length` does not match the engine's nominal $W \times H \times 4$ byte footprint (e.g. during synthetic tests or tiered fallbacks), the sampler must dynamically derive grid dimensions:
  $$N_{\text{pixels}} = \lfloor L / 4 \rfloor, \quad H = \max(1, \operatorname{round}(\sqrt{N_{\text{pixels}} / 2})), \quad W = 2H$$
  preventing out-of-bounds array reads and zero-elevation returns.

## 37. WebGPU Uniform Struct Alignment & Anti-Speculative Declaration Invariant
- **Strict Byte-Exact Parity**: Any uniform struct defined in WGSL (`SimUniforms`, `CrustUniforms`, `CraneUniforms`) MUST maintain exact byte-for-byte and float-count parity with its corresponding TypeScript packing buffer (`Float32Array`) and layout constants.
- **Prohibition of Speculative WGSL Fields**: Never declare unused, planned, or speculative uniform struct members in WGSL before the TypeScript packing logic is wired and committed. Adding unwritten padding or auxiliary fields alters struct size, causing buffer write out-of-bounds or assertions in uniform stress tests (e.g. `r11-materials-medium-stress.test.ts`).
- **No Dismissal of Size Mismatches**: If a test suite fails with a buffer or struct size mismatch (e.g. `expected 304 to be 272`), do NOT treat it as pre-existing or benign; verify the exact byte layout against the CPU writer and restore byte alignment.

## 38. Monochromatic Photochemical Illumination & Solar Bleed Elimination
- **Comprehensive Illumination Coupling**: When implementing strictly monochromatic chemical or photographic reproduction mediums (e.g. Theme 2: Prussian Cyanotype), thematic branching MUST NOT be restricted to surface albedo or pigment tinting.
- **Prohibition of Solar Warmth Bleed**: The direct and indirect illumination models (`cSunLight`, `cWarmSun`, ambient sky bounce) must also evaluate the theme. In photochemical resist mediums, direct illumination must evaluate as pure cool actinic direct radiation (`cActinicDirect`, e.g. `vec3(0.96, 0.98, 1.02)`) and indirect shadow as ferroprussiate fill (`cActinicShadow`, e.g. `vec3(0.18, 0.32, 0.48)`), guaranteeing zero warm yellow, gold, or sepia contamination across both continental crust and bathymetric oceans.

## 39. WebGPU Texture Format & Sampler Type Compatibility Contract (Dawn Validation)
- **SampleType Binding Parity**: When creating dynamic or high-resolution textures sampled in WGSL shaders, the texture format MUST be compatible with the `sampleType` declared in the pipeline bind group layout.
- **Filterable Float Compatibility**: Formats such as `rgba16unorm` are classified as `unfilterable-float` by WebGPU specifications. Using them in bind group layouts declared with `sampleType: 'float'` or sampling them with filterable samplers triggers fatal Dawn validation rejections (`None of the supported sample types (UnfilterableFloat) match the expected sample types (Float)`).
- **Format Discipline**: Use standard filterable formats (e.g. `rgba8unorm`) for sampled elevation or albedo textures, downsampling 16-bit source buffers when needed, or explicitly declare `sampleType: 'unfilterable-float'` with non-filtering comparison/point samplers when 16-bit precision is strictly required.

## 40. WebGPU Texture Row Pitch Alignment Invariant (256-Byte Stride)
- **The 256-Byte Pitch Contract**: In WebGPU `device.queue.writeTexture()` and buffer-to-texture copies, `bytesPerRow` MUST be an exact integer multiple of 256.
- **Mandatory Row Padding**: Passing unpadded byte widths (e.g. $5400 \times 4 = 21600$ or $2400 \times 4 = 9600$, neither divisible by 256) causes fatal WebGPU driver validation panics. When `(width * bytesPerPixel) % 256 !== 0`, image rows must be copied into a padded buffer before upload:
  $$\text{paddedRowBytes} = \left\lceil \frac{\text{width} \times \text{bytesPerPixel}}{256} \right\rceil \times 256$$

## 41. Multi-Source Topobathy Ingestion & Continuous Global Basemap Backfilling
- **Coastal Lidar Spatial Coverage Gaps**: Public high-resolution topobathy collections (such as NOAA CUDEM NCEI 9429) often survey coastal fringes exclusively, leaving inland mountain massifs (e.g. interior Hawaii summits) completely unmapped.
- **Mandatory Global Basemap Sampling**: Regional DEM precomputation scripts must never assume regional topobathy tiles span the complete bounding box. Regional grids must always initialize from a continuous global basemap (e.g. ETOPO 2022 8K), mosaicing high-resolution tiles on top with nodata masking:
  $$\text{DEM}_{\text{final}}(x, y) = \begin{cases} \text{Tile}(x, y) & \text{if } \text{valid}(\text{Tile}(x, y)) \\ \text{GlobalBase}(x, y) & \text{otherwise} \end{cases}$$
  guaranteeing continuous, non-zero elevation profiles across both coastline and inland summits.

## 42. Seasonal Weather Variance & Live Planetary Ingestion Bounds
- **Synoptic & Seasonal Metric Fluctuation**: Live planetary atmospheric models (such as NOAA GFS 0.25° operational analysis updated every 6 hours) represent real physical Earth conditions, which undergo substantial seasonal and synoptic shifts (e.g., peak surface westerlies dipping to $\sim 13\text{ m/s}$ in summer vs. $> 25\text{ m/s}$ during winter storm tracks).
- **Tolerance Calibration**: Verification test assertions evaluating live NOAA GFS data must evaluate physical atmospheric circulation models with tolerance envelopes that account for real-world seasonal shifts, rather than hardcoding wintertime velocity minimums that fail during summer runs.

## 43. Unscaled Raw-Field Central Differences for Screen-Space Isolines & Anti-Moiré Guards
- **Prohibition of Scaled Normal Gradients for Isoline Derivatives**: When computing screen-space derivative pixel widths ($dElevPx$, $dDepthPx$) for analytical contours, isobaths, or anti-Moiré guards in fragment shaders, derivatives must NEVER be derived from 3D normal-mapping slope variables ($dHx$, $dHy$).
- **The Derivative Inflation Hazard**: Normal displacement slopes are multiplied by vertical exaggeration and displacement factors ($dispScale \times slopeScale \approx 17.0 \times 2.5 \approx 42.5\times$). Feeding these scaled derivatives into line width or Moiré attenuation functions inflates half-widths by $>40\times$, driving anti-Moiré smoothstep guards to zero and completely extinguishing contours across all slopes.
- **Unscaled 5-Tap Central Differences**: Screen-space isoline derivatives MUST evaluate raw, unscaled field differences extracted directly from 5-tap texture taps at `fs_main` entry:
  $$dDemLandX = (dem_R.r - dem_L.r) \cdot 0.5, \quad dDemLandY = (dem_D.r - dem_U.r) \cdot 0.5$$
  guaranteeing precise sub-pixel feathering and preserving visible contours on slopes up to $25^\circ$.

## 44. Spherical Metric Latitude Scaling for Procedural Substrates & Noise
- **Prohibition of Uncorrected UV Coordinates for Substrates**: High-frequency procedural 2D noise functions generating paper tooth, cellulose fibers, illustration board grain, or chemical precipitate crystals must NEVER consume unscaled UV coordinates ($\mathbf{uv} \cdot \text{freq}$).
- **Longitudinal Polar Distortion**: Because meridians converge toward the poles ($\Delta x = R_E \cos(\text{lat}) \Delta \lambda$), unscaled UV coordinates cause severe horizontal stretching and elongation into longitudinal streaks at high latitudes ($\phi \to \pm 90^\circ$).
- **Metric Tensor Scaling**: All procedural substrate coordinates on spherical geoids MUST multiply the longitudinal coordinate by $\cos(\text{lat})$:
  $$\mathbf{coord}_{\text{substrate}} = \begin{pmatrix} \text{uv}_x \cdot \cos(\text{lat}) \\ \text{uv}_y \end{pmatrix} \cdot \text{freq}$$
  guaranteeing isotropic tooth, uniform fiber distribution, and identical tactile grain from the equator to polar basins.

## 45. Oceanographic Depth-Tiered Shelf Break Isobaths
- **Prohibition of Uniform Coarse Isobaths Across Coastal Shelves**: In oceanographic bathymetry passes, isobath generation must not rely solely on coarse intervals (e.g. $1,000\text{m}$).
- **Continental Shelf Demarcation**: Because continental shelves lie almost entirely at depths $d \le 200\text{m}$, uniform $1,000\text{m}$ intervals leave coastal waters completely devoid of bathymetric linework.
- **Dual-Tier Shelf Break Coupling**: Bathymetric contour passes must generate both:
  1. Abyssal & trench isobaths at major $1,000\text{m}$ intervals.
  2. A dedicated $200\text{m}$ continental shelf break isobath active across shallow margins ($d \le 600\text{m}$), rendered in thin marine drafting ink to clearly differentiate the continental shelf from the abyssal plain.

## 46. The Test Import Integrity Contract (Anti-Self-Certification Rule)
- **Prohibition of Local Algorithmic Duplication in Tests**: Test files (`*.test.ts`) must NEVER re-implement, duplicate, or copy-paste core algorithms, parsers, or mathematical transforms locally within the test file to achieve a pass.
- **Mandatory Production Module Ingestion**: Tests asserting feature correctness MUST import directly from `src/`. If a module cannot be imported without browser dependencies, the module must be refactored into pure mathematical/logical units that can be cleanly imported. Any test that re-implements production logic locally is an automatic **AUDIT FAILURE**.

## 47. The Multi-Step Automation State Reset Contract
- **State Cleanliness Between Automation Steps**: Any test script, benchmark runner, or DevTools automation harness that sequences through multiple viewpoints, camera modes, or data layers within a single browser session MUST explicitly reset internal state controllers (camera target vector `targetRef.current.set(0, 0, 0)`, velocities, unfurl alpha, active overlays) at the start of each step.
- **Pre-Capture State Assertion**: Scripts must poll or assert that camera position, target, and zoom match the intended step configuration before initiating screenshots or screencasts.

## 48. Dynamic Uniform-Driven Grid Dimensions (Elimination of Hardcoded Shader Literals)
- **Prohibition of Hardcoded Texture Dimension Literals**: Shaders must NEVER contain hardcoded texture resolution constants (e.g. `vec2<f32>(8192.0, 4096.0)` or `360.0 / 8192.0`).
- **Uniform Pipeline Ingestion**: Grid width, height, $dLon$, and $dLat$ must be passed dynamically through the uniform buffer (`u_gridDimensions: vec4<f32>`). Changing texture resolutions from 2K to 8K or 16K will then require changing exactly one configuration constant in TypeScript, completely eliminating resolution desynchronization across shaders.

## 49. Large Binary Asset Footprint & Git LFS Enforcement
- **Prohibition of Unmanaged >100MB Binaries**: No binary file exceeding 100 MB (e.g. `earth-etopo2022-dem-u16.bin` at 268 MB) may be staged or committed to Git without active Git LFS tracking configured in `.gitattributes`.
- **Pre-Commit Enforcement**: Commits containing unmanaged files $>50\text{ MB}$ must be rejected by pre-commit hooks to avoid breaking remote git pushes.


