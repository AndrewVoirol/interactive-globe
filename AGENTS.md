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
- **Unconditional Multi-Frame & Advective Texture Sampling**: Any multi-frame texture sampling functions (such as semi-Lagrangian great-circle advection `sampleAdvectedPrecipitationField`) MUST likewise be evaluated unconditionally prior to dynamic branching or discard. Runtime feature toggles (e.g., `sim.u_advectionActive`) must select between sampled values using the WGSL `select(fallback, active, condition)` intrinsic rather than enclosing sampling operations inside `if` statements.
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
- **Prohibition of Headless Core & Unmounted UI Implementations**: Creating controllers, kinematics engines, or math utilities in `src/core/`, or UI instruments, drawers, and controls in `src/components/` (e.g. `TimelineScrubber.tsx`), that pass isolated unit tests but are unimported and unmounted in the active React component tree (`App.tsx`, `TelemetryHUD.tsx`, `AtmosphereDrawer.tsx`) or render loop is strictly prohibited.
- **Mandatory Call-Site & Mounting Verification**: Any task introducing a controller (e.g. `TrajectoryCameraController`), shader pipeline, or HUD instrument must include the call site wiring (in `WebGPUCanvas.tsx`, `App.tsx`, or active drawer), an interactive trigger or autonomous loop, and verified live browser invocation. Dead code or orphaned files are treated as an automatic **AUDIT FAILURE**.

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
- **Decoupled Forward-Compatible CPU Buffer Staging**: When staging new uniform data on the CPU before downstream WGSL shaders are modified, the CPU allocation (`Float32Array`) and GPU buffer size (`device.createBuffer({ size })`) may be expanded ahead of WGSL struct declarations provided that:
  1. Strict 16-byte alignment is preserved (e.g. `vec3<f32>` at byte offset 288 + 4-byte scalar pad $\to$ 304 bytes).
  2. The buffer size satisfies $\text{size} \ge \text{minBindingSize}$ of current pipelines.
  3. Legacy code comment signatures are retained if historical challenger suites perform static pattern validation.
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

## 50. Multi-Stratum Atmospheric Shell Stratification & Optical Separation
- **Prohibition of Composite Strata Collapse**: Multi-altitude planetary atmospheric layers (e.g. Low Stratus 1–2 km, Mid Altocumulus 4–6 km, High Cirrus 10–12 km) must NEVER be collapsed into a single 2D composite texture or rendered on a single geometric shell. Collapsing strata destroys optical depth, parallax, and meteorological readability.
- **Discrete Geometric Shells & Standoffs**: Each atmospheric stratum must evaluate as a distinct geometric shell with an explicit physical altitude standoff:
  $$R_{\text{stratum}} = R_0 + z_{\text{standoff}}, \quad z_{\text{stratus}} \approx 1.5\text{km}, \quad z_{\text{altocumulus}} \approx 5.0\text{km}, \quad z_{\text{cirrus}} \approx 11.0\text{km}$$
- **Stratum-Specific Optical Identities**: Shaders must apply distinct optical and physical treatments per layer:
  - *Low Stratus*: High-density billowy scattering, hypsometric grounding, terrain shadow interaction.
  - *Mid Altocumulus*: Cellular wave textures, medium translucency, moderate drift.
  - *High Cirrus*: Directional fibrous streaks, high transparency, accelerated jet-stream shear drift.
- **Depth-Sorted Render Pass Ordering**: Strata must execute in back-to-front or altitude-sorted order with premultiplied alpha blending (`one`, `one-minus-src-alpha`), supporting independent layer toggling via HUD controls.

## 51. WebGPU End-to-End Render Loop Uniform Dispatch Invariant
- **Prohibition of Isolated-Only Method Testing**: Unit tests asserting that a secondary pipeline's uniform update method (e.g. `updateCloudUniforms()`) executes correctly in isolation are insufficient. Testing helpers without testing the main `engine.render(params)` frame loop allows uninvoked uniform updates to pass unnoticed.
- **The Silent Zero-Matrix Hazard**: In WebGPU, unwritten uniform buffers contain all zeros. Transforming vertices by a zero `viewMatrix` or `projectionMatrix` results in `(0, 0, 0, 0)` clip coordinates. The GPU rasterizer discards these vertices without generating any validation errors, driver warnings, or console logs, producing an invisible render pass while reporting high frame rates.
- **Mandatory Frame-Loop Wiring Verification**:
  1. Any secondary render pass MUST have its uniform update explicitly wired inside `WebGPUEngine.render()` or `updateUniforms()`.
  2. Integration test suites MUST invoke `engine.render(params)` directly and assert that the underlying uniform buffer contains non-zero matrix floats (`matrix[0] !== 0` or determinant $\ne 0$).

## 52. WebGPU Texture Lifecycle & Rebind-First Destruction Contract
- **Prohibition of Premature Texture Destruction**: Calling `texture.destroy()` while any active `GPUBindGroup` holds a reference to its texture view causes fatal WebGPU driver validation panics (`Texture is destroyed`) at `queue.submit()` time.
- **Strict Rebind-First Sequence**: When swapping or updating textures dynamically (e.g., placeholder $\to$ real DEM, or updating dynamic cloud textures):
  1. Allocate new `GPUTexture` and write payload data.
  2. Construct all new `GPUBindGroup` instances across both primary and secondary pipelines (e.g. `demBindGroup`, `vectorDEMBindGroup`, and `cloudBindGroups`).
  3. Assign the new bind groups to active engine fields.
  4. Only after all references are replaced in the active render pass, invoke `oldTexture.destroy()`.
- **Cross-Pipeline Secondary Bind Group Synchronization**: Whenever a shared resource (such as the planetary DEM texture) is updated, all secondary pipelines that bind it (terrain-lifted vectors, cloud elevation coupling) MUST have their bind groups rebuilt in the same atomic operation.

## 53. Physical Strata Ordering & UI Immutability
- **Prohibition of Arbitrary User Layer Reordering**: Cartographic and planetary physical layers are bound by strict geocentric altitude coordinates ($r = R_0 + z$). The engine must NEVER expose UI controls or data structures that allow users or scripts to reorder strata arbitrarily (e.g., placing cloud decks below sea level or vector ink above satellites).
- **Physical Strata Hierarchy**: Rendering and blending must respect the strict physical order:
  $$\text{L0 (Substrate)} \to \text{L1 (Crust)} \to \text{L2 (Hydrosphere)} \to \text{L3 (Vector Ink)} \to \text{L4 (Surface Wind)} \to \text{L5 (Low Stratus)} \to \text{L6 (Mid Alto)} \to \text{L7 (Jet Stream)} \to \text{L8 (High Cirrus)} \to \text{L9 (Orbits)} \to \text{L10 (Glass HUD)}$$
- **Atmospheric Scale Modulator Contract**: Vertical exaggeration of atmospheric layers for cartographic cutaways or horizon viewing must be controlled exclusively via a dedicated uniform multiplier (`u_atmosphericScale` $\in [1.0, 12.0]$) in the Atmosphere drawer, scaling relative to Mean Sea Level without reordering or inverting any strata.

## 54. First-Principles Continuum & Cloud Depth Cues
- **Prohibition of Decoupled 2D Cloud Decals**: Cloud layers must never be rendered as disconnected, flat, floating billboards or decal textures without ground-coupling cues.
- **Mandatory Cloud Ground Shadow Projection**: The primary terrain/ocean shader (`crust_hydrosphere.wgsl`) MUST sample the cloud coverage texture with a sun-projected UV offset:
  $$\Delta \mathbf{uv}_{\text{shadow}} = \frac{z_{\text{cloud}}}{\tan(\theta_{\text{sun}})} \cdot [-\cos(\phi_{\text{sun}}), \sin(\phi_{\text{sun}})] \cdot \text{scale}$$
  modulating direct diffuse terrain irradiance with a physically calibrated penumbra (~20 km blur).
- **Horizontal Topographic Barrier Deflection**: Atmospheric winds (`wind_particles.wgsl`, `wind_ribbons`) must evaluate the local DEM gradient $\nabla h$ and deflect horizontal velocity $\mathbf{u}_h$ around terrain barriers ($(\mathbf{u}_h \cdot \mathbf{n}_{\text{slope}}) > 0$) while conserving kinetic energy $\|\mathbf{u}_h\|$, preventing wind particles from passing through solid mountain rock.
- **Orographic Cloud Modulations**: Cloud condensation and density must couple with vertical orographic lift $w = \mathbf{u}_h \cdot \nabla h$, creating windward cloud buildup and leeward rain shadows.

## 55. Metal-3 GPU Verification Protocol
- **Prohibition of Headless CPU/SwiftShader for WebGPU Verification**: Unit test mocks and headless SwiftShader WebGPU software emulators cannot evaluate Apple Silicon Metal-3 driver behavior, WGSL uniform control flow constraints (Invariant §3), texture row pitch alignment (Invariant §40), or actual frame render times.
- **Mandatory Hardware Adapter Pre-Flight**: Prior to capturing visual verification screenshots or certifying any WebGPU milestone, autonomous agents MUST query the browser GPU adapter via Chrome DevTools MCP:
  ```javascript
  const adapter = await navigator.gpu.requestAdapter();
  const info = await adapter.requestAdapterInfo();
  // Must verify: info.vendor === "apple" && info.architecture === "metal-3" && !adapter.isFallbackAdapter
  ```
  If `isFallbackAdapter` is true or `architecture` is not native hardware, the capture session is invalid.
- **Console Log Hygiene Gate**: Verification must include `list_console_messages` asserting zero uncaptured WebGPU validation errors, WGSL compilation warnings, or texture binding mismatches.

## 56. Defensive TypedArray Uniform Scalar Guards & NaN Immunity
- **Prohibition of Direct Object-to-TypedArray Assignment**: In WebGPU engines utilizing packed `Float32Array` or `Uint32Array` uniform backing stores, never assign external parameter values directly into typed array indices (e.g. `this.uniformFloats[offset] = params.value`). Under ECMAScript `IntegerIndexedElementSet` semantics, if `params.value` is non-primitive (such as an empty object or `Object.create(null)`), the JavaScript engine throws a synchronous, uncatchable `TypeError: Cannot convert object to primitive value`, terminating the requestAnimationFrame render loop.
- **Mandatory Pre-Assignment Scalar Guard**: All uniform setters and frame update methods MUST validate scalar types and finite numbers strictly prior to typed array indexing:
  ```typescript
  const rawValue = params.property;
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    this.uniformFloats[offset] = Math.max(MIN_VAL, Math.min(MAX_VAL, rawValue));
  }
  ```
- **Adversarial Fuzzing Contract**: Any method that writes interactive or HUD parameters to GPU uniform buffers must pass 50,000 Monte Carlo fuzzing iterations verifying immunity against `NaN`, `±Infinity`, `null`, `undefined`, empty objects, and circular references.

## 57. Terrain-Conforming Altitude Floors & Anti-Facade Displacement Testing
- **Prohibition of Fixed Spherical Cloud Geometries Over High Relief**: Atmospheric strata (Low Stratus, Mid Altocumulus, High Cirrus) must never be modeled as rigid spherical shells at static geocentric radius ($r = R_0 + z_0$). Over high continental massifs (Himalayas, Andes, Alps), static radius shells clip through summits, creating subterranean cloud artifacts inside solid rock.
- **Dynamic Terrain Clearance Floors**: Atmospheric vertex shaders and raymarching pipelines must evaluate the underlying DEM crust elevation $h(\mathbf{x})$ and enforce a terrain-following clearance floor:
  $$z_{\text{cloud}}(\mathbf{x}) \ge h(\mathbf{x}) + z_{\text{deck}}$$
  ensuring that cloud decks elevate naturally over mountain barriers while tapering to sea-level altitudes over maritime basins.
- **Prohibition of Test Clamping Facades**: Test suites validating atmospheric geometry and collision envelopes must NEVER artificially clamp terrain displacement scales or altitude bounds to mask clipping failures. Tests must assert against real 8K DEM relief models and production vertical exaggeration factors ($[1.0, 12.0]$).

## 58. Subsystem Visibility Masking & Anti-Ghost Shadow Invariant
- **Prohibition of Orphaned Downstream Shading Artifacts**: When a planetary layer or physical stratum (e.g. atmospheric clouds, surface wind particles, vegetation canopy) is disabled via HUD controls or frame parameters (`showClouds: false`), all downstream secondary effects across primary shaders (such as cloud ground shadows in `crust_hydrosphere.wgsl`, specular glints, or orographic condensation factors) MUST be explicitly masked to zero in their respective uniform buffers (`crustFloats[68] = 0.0`).
- **Dynamic Drift Synchronization**: Cast ground shadows must never remain stationary while parent cloud geometry moves. The shadow coordinate evaluation must incorporate the exact drift offset over time:
  $$\mathbf{uv}_{\text{shadow}} = \operatorname{fract}(\mathbf{uv} + \mathbf{u}_{\text{drift}} \cdot t + \Delta \mathbf{uv}_{\text{sun}})$$
  guaranteeing that ground shadows travel across terrain and oceans synchronously with drifting cloud decks.

## 59. Geometric Horizon Tangent Attenuation Domain Scoping
- **Domain Scoping of Invariant §10**: The strict surface-facing attenuation defined in Invariant §10 (`smoothstep(0.02, 0.20, in.facing)` and `facing < 0.02` discard) applies EXCLUSIVELY to coplanar surface-conforming vector linework (coastlines, contours, graticules, administrative borders) to prevent detached 3D vertex spikes outside the geoid silhouette.
- **Prohibition of Premature Silhouette Discard on Elevated Strata**: Tropospheric cloud shells ($z \in [1.5\text{km}, 12\text{km}]$), atmospheric scattering envelopes, and orbital craft ($z > 12\text{km}$) MUST NEVER be subjected to crust-level facing discard. Applying surface-facing discard to elevated geometry erases strata right at the horizon limb ($75^\circ - 85^\circ$ pitch), destroying limb cutaways.
- **Elevated Shell Silhouette Thresholds**: Elevated shells must evaluate true geometric limb tangency or use relaxed thresholds (`smoothstep(-0.015, 0.04, in.facing)` with discard only at $<-0.015$), ensuring that Low, Mid, and High cloud strata and the Jet Stream remain distinctly visible against the horizon.

## 60. Authoritative RFC Specification Hierarchy & Anti-Drift Contract
- **Master RFC Primacy**: When implementing complex physical models or cross-pipeline architectures, the Master Architectural RFC in the brain repository (`*_rfc.md`) is the supreme authoritative specification. Intermediate sprint notes (`docs/*_SPEC.md`) and local developer scratchpads are secondary convenience documents.
- **Prohibition of Silent Physical Truncation**: Implementing agents and test authors must NEVER truncate multi-dimensional physical equations (e.g. replacing 2D vector wind coupling $\mathbf{u} \cdot \nabla h$ with 1D longitude differences, or omitting along-contour valley steering terms) or alter 16-byte aligned WGSL uniform layouts (e.g. cutting 288-byte structs to 256 bytes by deleting fields) to simplify implementation or match flawed intermediate drafts.
- **Test Alignment Gate**: Unit and adversarial test suites must be constructed to assert the physical and mathematical rubric defined in the Master RFC, preventing false-positive victory declarations where tests pass against a degraded intermediate specification.

## 61. Compounding Geodetic Co-Registration Invariant
- **Cross-Tier Spatial Parity**: When introducing high-resolution dynamic atmospheric data (0.1° / ~10km Google DeepMind WeatherNext 3 hourly predictions or 1km live Doppler radar nowcasts), the underlying terrain substrate and vector cartography MUST maintain proportional geodetic precision.
- **Prohibition of Multi-Kilometer Displacement Incongruity**: Rendering sub-10km atmospheric phenomena (e.g., tropical cyclone eyes, frontal precipitation bands, convective storm cells) against generalized 1:10m vectors (such as Natural Earth with 10–20km coastal displacement errors) or low-resolution spherical geoids creates severe visual and spatial incongruity. Coastlines and hydrological boundaries must be co-registered using high-precision vector datasets (e.g. Overture Maps GeoParquet 1.1 / PMTiles v3 sub-meter shorelines) and high-resolution relief insets (Copernicus GLO-30 30m / USGS 3DEP) in active litmus basins.
- **Geocentric Co-Registration Anchor**: Atmospheric, vector, and crust pipelines must share the exact WGS84 ellipsoidal/spherical coordinate mappings, ensuring that coastal rainfall radar echoes terminate precisely at the physical shoreline.

## 62. Requester-Pays Cloud Storage & Zarr v3 Ingestion Discipline
- **Mandatory Billing Project Header**: When accessing public scientific repositories hosted on Google Cloud Storage Requester Pays buckets (e.g. `gs://weathernext3_spatial/`, `gs://weathernext3_statistics_spatial/`), API clients and Python ingestion scripts (`scripts/fetch-weathernext3.py`) MUST explicitly supply the active billing project header (`userProject: antigravity-agent-1765655548`) via Application Default Credentials (`~/.config/gcloud/application_default_credentials.json`).
- **Prohibition of Unbounded Client Streaming from Cloud Buckets**: Web clients must never stream raw remote Zarr chunks directly from Requester Pays cloud buckets during interactive frame loops, which would incur latency and per-request network egress charges.
- **Local Pre-Staged Temporal Slices**: Ingestion pipelines must extract the required variables (`temperature_2m_mean`, `station_head_temperature_2m_mean`, `u_component_of_wind_10m_mean`, `v_component_of_wind_10m_mean`, `total_precipitation_1hr_mean`, `imerg_tp_1hr_mean`, `low_cloud_cover_mean`, `medium_cloud_cover_mean`, `high_cloud_cover_mean`, `surface_solar_radiation_downwards_1hr_mean`) and time horizons ($t \in [0, 48\text{h}]$) into optimized, local pre-staged binary slices in `public/data/weathernext/` for zero-latency WebGPU texture upload.

## 63. Empirical Payload Grounding & Network Budget Verification
- **Prohibition of Speculative Streaming Over-Engineering**: Architectural decisions regarding spatial indexing, quadtree streaming, or tiled chunk protocols must NEVER be based on unmeasured or hypothetical payload assumptions.
- **Mandatory Over-The-Wire Measurement**: Prior to proposing or architecting streaming infrastructure, engineers and agents MUST empirically measure compressed payload sizes via real network requests:
  - Live Doppler radar mosaics (e.g., RainViewer 12-frame loop: ~1.6 MB total, 8.7 KB / 256×256 WebP tile).
  - Atmospheric AI forecast fields (e.g., WeatherNext 3 global grid: 18.53 MB compressed / 12.9 MB Float16 WebGPU texture).
  - Global wind vectors (e.g., GFS 0.25° grid: 3.96 MB Float16).
  - Regional 30m DEM insets (~3.5 MB per 1° tile).
- If aggregate network footprints fit within standard modern web bandwidth and VRAM budgets (< 30 MB initial load), implementations must use simple, robust static slice fetching rather than introducing multi-tier quadtree hierarchies that risk manifold tear seams.

## 64. "Living Relief" Coupled Orographic Precipitation & DEM Hydrology
- **Physical Orographic Precipitation Modulation**: In the WebGPU crust/hydrosphere rendering pipeline (`crust_hydrosphere.wgsl`), dynamic atmospheric precipitation fields must not be rendered as detached, flat overlays. Precipitation density and optical attenuation must couple directly with the terrain elevation gradient $\nabla h$ and surface horizontal wind vector $\mathbf{u}_h$:
  $$w = \mathbf{u}_h \cdot \nabla h$$
  $$P_{\text{surface}} = P_{\text{raw}} \cdot \left(1.0 + \alpha \cdot \max(0.0, w)\right) \cdot \exp\left(-\beta \cdot \max(0.0, -w)\right)$$
  amplifying rain on windward mountain slopes ($w > 0$) and suppressing precipitation in leeward rain shadows ($w < 0$).
- **DEM-Valley Runoff Entrainment**: Overland storm runoff must couple with the in-shader Laplacian curvature $k_{\text{valley}}$ (Invariant §9 & §16), brightening and swelling river rills during active precipitation events while maintaining the 58.24% hydrological-to-coastline width ratio.

## 65. Manifold Dock Purity & Drawer HUD Partitioning
- **Prohibition of Manifold Dock Encroachment**: The bottom dock is strictly reserved for the primary Riemannian manifold morphing controls (continuous unroll parameter $t \in [0, 1]$, projection selector, and core framing).
- **Secondary Temporal & Sensor Drawer Placement**: Specialized temporal scrubbers (e.g. Doppler radar $[-60\text{m} \to \text{NOW}]$ and WeatherNext forecast $[\text{NOW} \to +48\text{h}]$), dual-mode optical toggles (Archival Watercolor vs. Doppler), and real-time station verniers must be encapsulated inside `AtmosphereDrawer.tsx`. This preserves the clean cartographic sheet neatline and avoids cluttering the map board during projection deformation.

## 66. Manifold Metric Tensor Pushforward for Tangent Vector Fields ($S^2 \to \mathbb{R}^2$)
- **Prohibition of Unprojected Vector Fields**: Atmospheric wind velocities $\mathbf{u}_h = (u_\lambda, u_\phi)$, streamlines, and radar advection vectors must NEVER be rendered on planar unrolled projections (Mercator, Cylindrical Scroll, Dymaxion net) using raw spherical tangent coordinates.
- **Differential Jacobian Pushforward**: As the manifold unrolls ($\alpha \in [0, 1]$), vector fields must be transformed by the differential Jacobian matrix of the active projection ($J_{\text{proj}} = \frac{\partial(x, y)}{\partial(\lambda, \phi)}$):
  $$\mathbf{u}_{\text{planar}} = J_{\text{proj}} \cdot \mathbf{u}_{S^2}$$
  preventing discontinuous vector rotations (up to $60^\circ$) across Dymaxion facet edges and directional distortions on planar sheets.

## 67. Semi-Lagrangian Advective Temporal Morphing & Anti-Ghosting Invariant
- **Prohibition of Naive Discrete Frame Cross-Fading**: When scrubbing or animating temporal datasets (hourly WeatherNext 3 predictions or 10-minute Doppler radar loops) at 120 FPS, shaders must NEVER use linear alpha cross-fading ($\operatorname{mix}(I_k, I_{k+1}, \tau)$). Naive cross-fading produces temporal ghosting where storm cells dissolve and reappear across basins.
- **The Riemannian Exponential Map on $S^2$**: Intermediate fractional time-steps $\tau \in [0, 1]$ must be reconstructed via bidirectional semi-Lagrangian advection along exact great-circle geodesics on the unit sphere $S^2$, strictly avoiding flat tangent-plane division by $\cos\phi_a$:
  $$\lambda' = \frac{u \Delta t}{R_E}, \quad \phi' = \frac{v \Delta t}{R_E}, \quad \sigma = \sqrt{(\lambda')^2 + (\phi')^2}$$
  $$\sin\phi_d = \operatorname{sinc}(\sigma)\phi' \cos\phi_a + \cos\sigma \sin\phi_a$$
  $$\Delta\lambda = \operatorname{atan2}\left(\operatorname{sinc}(\sigma)\lambda', \; \cos\sigma \cos\phi_a - \operatorname{sinc}(\sigma)\phi' \sin\phi_a\right)$$
  where $\operatorname{sinc}(\sigma) \approx 1.0 - \frac{\sigma^2}{6}$ for $\sigma \le 10^{-4}$.
- **Defensive Wrapping & Single-Pass Budget**:
  - UV coordinate wrapping must evaluate as `fract(arrivalUV.x + delta_lambda / (2.0 * PI) + 1.0)` to eliminate negative coordinate corruption under driver fast-math.
  - The entire bidirectional advection operator must execute within exactly 3 texture taps (`windTexture`, `precipTexture0`, `precipTexture1`) with explicit LOD 0.0 evaluated unconditionally at the top of `fs_main` (Invariant §3).


## 68. Sliding-Window WebGPU Texture Ring Buffer & VRAM Ceiling
- **Prohibition of Monolithic Multi-Horizon Texture Arrays**: Never allocate monolithic 2D texture arrays for all 48 forecast hours across multiple variables simultaneously ($>1.5\text{ GB}$ VRAM allocation).
- **The 3-Slot Ring Buffer Contract**: The active WebGPU pipeline must maintain a compact 3-layer texture array (`texture_2d_array<f32>`):
  - Layer 0: Active bracket start ($t_k$)
  - Layer 1: Active bracket end ($t_{k+1}$)
  - Layer 2: Asynchronous staging slot ($t_{k+2}$)
  Background Web Workers stream upcoming hourly slices via `fetch()` and upload using `device.queue.writeTexture()` with 256-byte row padding (Invariant §40), strictly bounding active atmospheric VRAM under $200\text{ MB}$.

## 69. Thermodynamic Condensation Thresholds (LCL & Froude Blocking)
- **Prohibition of Purely Kinematic Lift Without Moisture Verification**: Shaders must not evaluate slope rain condensation ($w = \mathbf{u}_h \cdot \nabla h$) independently of atmospheric humidity.
- **Analytical Lifting Condensation Level (LCL)**: In `crust_hydrosphere.wgsl`, evaluate the local dewpoint deficit from WeatherNext 2m temperature $T$ and dewpoint $T_d$:
  $$\text{LCL} \approx 125.0 \cdot (T - T_d) \quad \text{meters}$$
  Orographic cloud buildup and rain amplification must trigger only when terrain summit elevation $h(\mathbf{x}) \ge \text{LCL}$. If $h(\mathbf{x}) < \text{LCL}$, air remains unsaturated and precipitation amplification is suppressed.

## 70. Archival Ink Pigmentation of Dynamic Atmospheric Fields
- **Prohibition of Unharmonized Video-Game Heatmaps**: Atmospheric radar, precipitation, and cloud overlays must NEVER render as generic saturated neon ribbons or video-game heatmaps by default.
- **Substrate-Absorbed Drafting Inks**: Atmospheric scalar fields must absorb into the active cartographic substrate via `u_mediumProperties` (Invariant §24 & §28):
  - **Theme 0 (Marie Tharp 1977)**: Hand-engraved lithographic stippling density and bathymetric cross-hatching.
  - **Theme 1 (Cream Rag 310 GSM)**: Archival sepia-charcoal ink wash (`#38302A`) modulated by paper tooth roughness ($u_{\text{tooth}}$).
  - **Theme 2 (Prussian Cyanotype 1842)**: Photochemical actinic solarization and ferroprussiate inversion (`#0A192F`).
  A standard "Meteorological Spectral Doppler" toggle remains isolated in `AtmosphereDrawer.tsx` for real-world severe storm tracking.

## 71. Astronomical Ephemeris Coordinate Parity & IEEE-754 Safe Ingestion Invariant
- **Geocentric Sphere Coordinate Frame Parity**: Astronomical solar direction vectors ($\mathbf{s}$) must strictly match the Indicatrix Engine's geocentric coordinate conventions:
  $$x = \cos(\delta)\sin(\lambda_{\text{sun}}), \quad y = \sin(\delta), \quad z = \cos(\delta)\cos(\lambda_{\text{sun}})$$
  where $\delta$ is solar declination, $\lambda_{\text{sun}}$ is subsolar longitude, $+Y$ points to the North Pole, and $+Z$ points to the Greenwich Prime Meridian at solar noon ($12:00\text{ UTC}$).
- **Prohibition of View-Space Relief Inversion via Ephemeris**: Subsolar coordinates ($\lambda_{\text{sun}}, \delta$) must NEVER be mapped directly into cartographic hillshading angles (`u_sunAzimuth`, `u_sunAltitude`) in view space. By Swiss cartographic convention (Imhof standard, *Design Ethos §1*), terrain relief lighting must remain fixed from the northwest (315° azimuth, 45° altitude) to prevent catastrophic optical relief inversion (mountain ridges rendering as recessed trenches or craters). Astronomical ephemeris vectors belong strictly in world-space atmospheric scattering (`atmosphere.u_sunDirection`), orbital celestial terminators, and HUD telemetry (`engine.currentSolarPosition`).
- **Multi-Millennium Timestamp Robustness**:
  - Non-finite inputs (`NaN`, $\pm\infty$) and out-of-range epoch timestamps exceeding ECMAScript's date limits ($\pm 8.64 \times 10^{15}\text{ ms}$) must be guarded using both `Number.isFinite(utcEpochMs)` and `Number.isFinite(date.getTime())`, safely returning a fallback unit vector (`[0, 0, 1]`) and zero angles to prevent `NaN` cascades into uniform buffers.
  - To support historical/classical cartography ($0 \le \text{year} \le 99$), avoid `Date.UTC(year, ...)` which automatically offsets 2-digit years by $+1900$; use explicit `setUTCFullYear(year, 0, 1)` to evaluate the correct day of the year.
- **IEEE-754 Negative-Zero Neutralization**:
  Trigonometric and diurnal calculations at exact zero-crossings (e.g. $-15^\circ \times (12.0 - 12.0) = -0$) produce IEEE-754 negative zeros. All returned angles and vector components must be sanitized with `(val || 0)` to guarantee positive zero ($+0$) across telemetry HUD displays and uniform buffers.

## 72. Dual-Zone Chronometric HUD Instruments & 120 FPS React Scrubber Invariants
- **Dependency Grounding vs. Codebase Primitives**: When a specification references a third-party UI library (e.g. `@radix-ui/react-slider`) as existing in `package.json` or sidebar controls, agents MUST inspect `package.json` before adding imports or dependencies. If the library is absent, agents must strictly conform to existing codebase primitives (`slider-archival`, `VernierSlider`, semantic HTML/CSS range inputs) rather than hallucinating imports or installing redundant dependencies.
- **Direction-Aware Keyboard Navigation Across Asymmetric Datum Boundaries**: In piecewise non-linear sliders bridging disparate time scales (e.g. past radar $[-60\text{m}, 0\text{m}]$ at 10-minute cadence and forecast $[0\text{m}, +48\text{h}]$ at 1-hour cadence), stepping behavior at datum ($t = 0$) must check the navigation direction:
  - Pressing `ArrowLeft` / `ArrowDown` at $0$ MUST step into the radar zone ($-10\text{m}$, or $-1\text{m}$ with `Shift`).
  - Pressing `ArrowRight` / `ArrowUp` at $0$ MUST step into the forecast zone ($+60\text{m}$, or $+15\text{m}$ with `Shift`).
  Evaluating domain solely by `currentMinutes < 0` at $t = 0$ incorrectly routes leftward steps through coarse forecast increments.
- **Strict Monotonic Hour Bracket & $\tau$ Continuity**: In time bracket calculations ($\lfloor t / 60 \rfloor$), implementations must NEVER add arbitrary floating-point offsets (such as `+ 1e-6`) to the numerator. Offsets cause fractional minutes approaching hour transitions (e.g. $59.9999\text{m}$) to round up prematurely to the subsequent bracket while `tau` collapses to $0.0$, producing visual and data discontinuities.
- **Decoupled 120 FPS requestAnimationFrame Loops in Controlled Components**: When driving high-frequency animation loops in React components that accept a controlled `value` prop:
  - The `requestAnimationFrame` loop inside `useEffect` MUST NOT include `value` or rapidly mutating state in its dependency array.
  - Doing so causes `cancelAnimationFrame` and loop reconstruction on every rendered frame, producing severe frame drops, stutter, or freezes.
  - The loop must read from and write to synchronized mutable refs (`minutesRef.current`) that update independently of the React rendering cycle.
- **Dual-Control Accessibility Tree Hygiene**: When combining a custom interactive slider element (`role="slider"`) with a hidden native `<input type="range">` for testing and automation compatibility, the hidden input MUST specify `tabIndex={-1}` and `aria-hidden="true"`. Omitting these attributes causes duplicate consecutive slider nodes in the accessibility tree and breaks single-tab-stop keyboard navigation.
- **Substrate-Adaptive Vernier Ticks on Light Archival Grounds**: Minor tick marks and fine calibrations must NEVER use hardcoded translucent white utility classes (e.g. `bg-white/10`). On light paper substrates (Theme 1: Cream Rag `#F3ECE0`), white markings wash out into invisible specks. All ticks must reference CSS theme tokens (`var(--theme-slider-tick)` or theme border tokens).

## 73. Discrete 3-Slot GPUTexture Ring Buffering & Dynamic Parameter Allocation Guard
- **Prohibition of Monolithic Texture Arrays for Temporal Sequences**: Streaming dynamic weather, radar, and cloud forecasts must NOT use multi-layer `texture_2d_array` allocations that trigger binding complexities and driver-level allocation stalls.
- **Discrete 3-Slot Ring Buffer Contract**:
  Temporal streams must be managed by `TemporalTextureRingBuffer.ts` using 3 discrete `GPUTexture` instances:
  - Slot 0: Previous frame ($t_k$)
  - Slot 1: Current frame ($t_{k+1}$)
  - Slot 2: Asynchronous staging slot ($t_{k+2}$)
- **Order-3 Cyclic Permutation Invariance**:
  Advancing the buffer (`advance()`) must execute as a zero-copy pointer/index swap following forward chronological progression:
  $$s_0' = s_1 \quad (\text{Current} \to \text{Previous}), \quad s_1' = s_2 \quad (\text{Staging} \to \text{Current}), \quad s_2' = s_0 \quad (\text{Previous} \to \text{Recycled Staging})$$
  guaranteeing $(\sigma)^3 = \text{id}$ with zero memory allocations during runtime rendering loops. The reverse permutation ($s_0' = s_2, s_1' = s_0$) is strictly prohibited as it routes staged data into Previous instead of Current, causing a 1-step lag in rendering.
- **Strict 256-Byte WebGPU Row Pitch Padding**:
  Texture uploads (`uploadSlice()`) must evaluate `bytesPerRow = Math.ceil((width \cdot \text{bpp}) / 256) \cdot 256`. Unpadded incoming buffers must be repacked into a padded stride buffer before calling `device.queue.writeTexture()` with `{ offset: 0, bytesPerRow }`.
- **Eager Lazy-Resource Allocation Trigger Guard**:
  When UI controls or external APIs mutate a simulation coupling coefficient from zero to non-zero (e.g. `setPluvialGamma(gamma)` with `gamma > 0.0`), the engine setter MUST eagerly invoke the corresponding subsystem lazy allocator (`ensurePrecipCrustTexture()`) rather than deferring to render passes, preventing black fallback textures or uninitialized bind group stalls upon user interaction.

## 74. Prohibition of Uniform Buffer Field Multiplexing & Dual-Use Memory Aliasing
- **Strict 1-to-1 Semantic Memory Mapping**: Uniform buffer offsets must maintain an invariant, unconditional 1-to-1 correspondence with declared WGSL struct fields. Multiplexing buffer offsets to carry different data depending on dynamic conditions (e.g. packing orbital vectors into weather simulation slots when weather is inactive) is strictly prohibited.
- **Type-Casting Corruption Prevention**: Buffer packing routines must never write floating-point values into offsets declared as integer types (`u32`, `i32`) in WGSL, or vice-versa. Writing IEEE-754 floats into integer offsets creates bit-cast values exceeding $10^9$, producing catastrophic shader state corruption.
- **Speculative Field Prohibition**: TypeScript packing arrays must NEVER write data to offsets that do not correspond to explicitly declared fields in the active WGSL struct. Any test or implementation relying on phantom buffer offsets is an automatic **AUDIT FAILURE**.

## 75. WebGPU Dynamic Texture Binding Lifecycle & Rebind Invariant
- **Prohibition of Static-Only Bind Group Instantiation**: WebGPU bind groups that bind dynamic textures, streaming data layers, or temporal ring buffers (`TemporalTextureRingBuffer`) must NEVER be treated as write-once initialization artifacts.
- **Dynamic Resource Invalidation & Rebinding**:
  1. Whenever a streaming subsystem initializes or assigns a backing resource (e.g. attaching `precipRingBuffer` or updating `precipTexture`), the engine MUST immediately invalidate and rebuild the corresponding `GPUBindGroup` (e.g. `crustBindGroup`).
  2. Whenever a temporal ring buffer advances (`advance()`), the engine MUST update the active slot texture view in the render pass bind group before the next draw call.
- **Triple-Cached Bind Group Ring Architecture**: To achieve zero-allocation $120\text{ FPS}$ rendering, engines coupling a 3-slot ring buffer must pre-allocate 3 distinct `GPUBindGroup` instances mapped 1:1 to physical ring buffer textures ($p \in \{0, 1, 2\}$). During `renderPass`, the engine dynamically indexes `this.crustPrecipBindGroups[ring.getActivePhysicalIndex(1)]` in $O(1)$ time without per-frame WebGPU API allocations.
- **Universal Auxiliary Subsystem Disposal Defense**: Every engine method and render pass accessing an attached auxiliary buffer or texture stream MUST defensively verify `!buffer.disposed`. If a buffer is disposed externally, all references (`precipTextureView`, `crustPrecipBindGroups`, `isPrecipActive`) must be safely nullified or ignored, falling back cleanly to default dummy textures (`dummyPrecipTextureView`, `crustBindGroup`) without throwing unhandled runtime exceptions.
- **Mock-Proof Lifecycle Verification**: Unit tests asserting binding integrity must not merely verify layout entries in `GPUBindGroupLayout`. Tests must assert that `device.createBindGroup` is called with the active texture view when dynamic data streams attach or cycle.

## 76. Anti-Cheating Defect Injection & Non-Tautological Test Contract
- **Prohibition of Duplicate Math and Shadow Oracles**: Unit and adversarial tests must NEVER duplicate WGSL shader algorithms or TypeScript math functions into test-local helper functions (Rule 46). All mathematical evaluations must test production modules imported directly from `src/core/` or `src/webgpu/`.
- **Prohibition of Tautological Branch Assertions**: Tests asserting fallback or error-handling logic must NEVER duplicate the engine's conditional logic in the test body (e.g. `const bg = ring.disposed ? fallback : active; expect(bg).toBe(fallback);`). Tests must actively execute the real engine entry points (e.g. `engine.render()`) and spy on GPU driver calls (e.g. `renderPass.setBindGroup`) to verify real system behavior.
- **Mandatory Defect Injection Verification**: When implementing a guard against a runtime bug or unhandled exception, test authors and challengers must verify test sensitivity via defect injection: commenting out or reverting the production guard MUST cause the test suite to immediately fail. Any test that continues to pass when the production fix is removed is a fraudulent test and an automatic **AUDIT FAILURE**.

## 77. Equirectangular Longitude Phase Alignment & Zarr Geodetic Transformation Invariant
- **Prohibition of Unshifted $[0^\circ, 360^\circ)$ Scalar Ingestion**: Climate and numerical weather prediction models (e.g. Google DeepMind WeatherNext 3, ECMWF IFS) natively output global grid tensors indexed along longitude $[0^\circ, 360^\circ)$ ($0^\circ$ Greenwich $\to 180^\circ\text{E} \to 360^\circ$). Shaders and DEM relief surfaces in the Indicatrix Engine evaluate equirectangular coordinates spanning $[-180^\circ, +180^\circ)$ ($u = (\text{lon} + 180)/360$, where $u=0$ is the antimeridian and $u=0.5$ is the Prime Meridian). Ingesting raw $[0^\circ, 360^\circ)$ tensors without transformation produces a fatal $180^\circ$ geographical phase offset, placing Pacific typhoons over the Sahara and Atlantic depressions over East Asia.
- **Mandatory Horizontal Phase Roll & Latitude Normalization**:
  All scalar downcasting and extraction pipelines ingesting $[0^\circ, 360^\circ)$ global grids MUST perform an exact $180^\circ$ horizontal roll:
  $$\text{rolled\_slice} = \operatorname{roll}\left(\text{slice}, \; \frac{W}{2}, \; \text{axis}=1\right)$$
  For a $0.1^\circ$ grid ($W = 3600$), this requires shifting by exactly $+1,800$ columns. Pipelines must additionally verify row ordering such that $\text{row}_0 = +90^\circ\text{N}$ (North Pole) descending monotonically to $\text{row}_{H-1} = -90^\circ\text{S}$ (South Pole) to conform with WebGPU texture $V$-coordinate origin ($V=0$ at top).

## 78. Microtask FIFO Serialization & Sequence Guards for Streaming Ring Buffers
- **Prohibition of Unsynchronized Asynchronous Slot Rotation**: In 3-slot GPU texture ring buffers (`TemporalTextureRingBuffer`), callers must NEVER invoke synchronous pointer rotation (`advance()`) while asynchronous data slice downloads (`getSlice()`) are pending. Under continuous timeline scrubbing or high-frequency scrubber dragging, asynchronous downloads complete out-of-order, causing physical GPU textures to swap ahead of incoming buffers and corrupting the active display slot with historical frames.
- **Promise FIFO Serialization Queue**:
  Advancement operations across bracket transitions MUST be sequenced through a continuous microtask Promise queue:
  $$\text{advanceQueue} = \text{advanceQueue}.\text{then}(\text{async ()} \implies \{ \dots \})$$
  ensuring that texture upload and physical slot rotation execute in strict FIFO sequence.
- **Sequence Generation Token Cancellation**:
  Every scrub event, seek jump, or variable toggle must increment a monotonic `currentSequenceId`. Asynchronous background prefetch completions must verify that their capture token matches `currentSequenceId` before uploading to Slot 2, silently discarding stale network responses.
- **Resident Slot Continuity & Self-Healing**:
  Data sources must track currently loaded forecast hours across physical slots (`residentHours: [number, number, number]`). When incoming scrub events detect non-contiguous jumps ($|h_{\text{new}} - h_{\text{resident}}| > 1$), the data source must immediately invalidate the ring and perform a synchronous triple-slot re-seed (`seekHour`) rather than attempting incremental rotation.

## 79. Web Mercator Conformal Inversion & Equirectangular Reprojection Invariant
- **Prohibition of Direct Web Mercator Tile Sampling on Equirectangular Geoids**:
  Web mapping APIs (e.g. RainViewer, OpenStreetMap, Mapbox) deliver global tiles in Web Mercator (EPSG:3857 / Spherical Mercator) projection, where vertical coordinates follow:
  $$y_{\text{merc}} = \frac{1}{2} - \frac{\ln\left(\tan\left(\frac{\pi}{4} + \frac{\phi}{2}\right)\right)}{2\pi}$$
  The Indicatrix Engine 3D crust mesh samples precipitation textures using Equirectangular (Plate Carrée / EPSG:4326) coordinates ($v = (90^\circ - \phi) / 180^\circ$). Drawing Web Mercator tiles directly into texture buffers without spherical reprojection causes catastrophic north-south latitudinal warping of 26 to 32 pixels in mid-latitudes ($18^\circ$ to $22^\circ$ displacement, or 2,000–2,500 km), displacing mid-latitude storm tracks into subtropical zones.
- **Mandatory Conformal Inversion & Resampling**:
  All tile ingestion scripts converting Mercator tiles to equirectangular texture atlases MUST perform continuous row-by-row spherical latitude reprojection:
  $$\phi(y_{\text{equi}}) = \left(0.5 - \frac{y_{\text{equi}}}{H}\right) \cdot \pi$$
  $$y_{\text{merc}}(\phi) = \operatorname{clamp}\left(\left(0.5 - \frac{\ln\left(\tan\left(\frac{\pi}{4} + \frac{\phi}{2}\right)\right)}{2\pi}\right) \cdot H, \; 0, \; H - 1\right)$$
  Rows corresponding to latitudes beyond the Web Mercator domain limit ($|\phi| > 85.051129^\circ$) must be clamped and zero-filled (transparent reflectivity) to guarantee clean, uncorrupted polar caps.

## 80. Multi-Scale Ring Buffer Geometry Guard & CLI Dry-Run Integrity Invariant
- **Multi-Resolution Buffer Dimension Validation**:
  Streaming data sources operating at different spatial resolutions (e.g. $256 \times 256$ radar mosaics vs. $3600 \times 1801$ WeatherNext prognostic fields) must NEVER share or bind to mismatched `TemporalTextureRingBuffer` instances. Data sources must defensively validate dimensions during `bindRingBuffer()`:
  $$\text{if } (\text{ring.width} \ne \text{self.width} \parallel \text{ring.height} \ne \text{self.height}) \implies \text{throw RangeError}$$
  and must provide a dedicated factory method (`createRingBuffer(device: GPUDevice)`) to allocate textures matching the native data source stride.
- **Dual-Zone Timeline Scrubbing Dispatch**:
  Timeline scrubbers spanning observation and forecast zones (e.g. $[-60\text{m}, 0\text{m}]$ radar nowcast vs. $[0\text{m}, +48\text{h}]$ NWP forecast) must isolate data dispatch by domain. In the radar zone ($t < 0$), updates must stream into the radar ring buffer and bind to the active shader texture; in the forecast zone ($t \ge 0$), updates must stream from the prognostic model.
- **Prohibition of Error-Swallowing in CLI Dry-Runs**:
  Ingestion script dry-run flags (`--dry-run`) must verify real remote API connectivity and schema validity without downloading full payload binaries. Dry-run routines must NEVER catch network exceptions to synthesize fake mock success; network failures must throw non-zero exit codes to prevent broken automation pipelines from reporting false health.

## 81. Prognostic Scalar Physical Unit Scaling & Ingestion Parity Invariant
- **Prohibition of Unscaled Base-SI Ingestion**: Numerical weather prediction models and global climate datasets (e.g. Google DeepMind WeatherNext 3, ECMWF IFS) store prognostic atmospheric fields in raw base-SI units (temperature in Kelvin $K \in [190, 325]$, precipitation accumulation in meters $m \in [0.0, 0.035]$). WebGPU fragment shaders (`crust_hydrosphere.wgsl`) and cartographic hypsometric scales expect derived physical units (temperature in $^\circ\text{C}$, precipitation in $\text{mm/hr}$ or $\text{kg/m}^2/\text{hr}$). Ingesting unscaled SI values without transformation causes fatal rendering defects:
  - Raw precipitation in meters ($\le 0.025\text{ m}$) falls below WebGPU fragment shader activation thresholds (`intensity = clamp(precipRate / 50.0, 0.0, 1.0); if (intensity <= 0.001) return vec4(0.0)`), causing complete precipitation blackout across the globe.
  - Raw temperature in Kelvin ($190\text{ K} - 325\text{ K}$) produces Float16 values that violate physical terrestrial validation constraints ($-90^\circ\text{C}$ to $+60^\circ\text{C}$) and distort color LUT sampling.
- **Mandatory Pre-Downcast Canonical Conversions**:
  Extraction and staging pipelines MUST perform canonical mathematical conversions on raw Float32 slices strictly before Float16 downcasting:
  $$T_{^\circ\text{C}} = T_{\text{K}} - 273.15$$
  $$R_{\text{mm/hr}} = R_{\text{m}} \times 1000.0$$
- **Offline Mock Generation Mode**:
  Extraction scripts must provide an offline `--mock` mode with smart lightweight defaults (e.g. 3 hourly slices of 1 active variable $\approx 40.1\text{ MB}$) generating physically plausible synthetic data for local development, CI verification, and repository demo staging without requiring multi-gigabyte cloud egress or cloud credentials.

## 82. Anti-Cheating Invariant & Test Oracle Integrity Contract
- **Prohibition of In-Test Shadow Implementations (Rule 46 & Pillar D)**:
  Test suites must NEVER re-implement algorithmic functions, parsers, or binary decoders within test files. All tests must import production functions directly from `src/` or `scripts/`. Specifically prohibited:
  1. *Shadow algorithms*: Local functions in test files mirroring production methods (e.g. `evaluatePrecipActive`).
  2. *Duplicate decoders*: In-test bit manipulation routines (e.g. local `decodeFloat16` instead of `src/core/math/float16`).
  3. *Inline script string re-implementation*: Executing python/node subshells with inline scripts that duplicate production steps (`np.roll`, vertical slice inversion, row pitch padding) rather than importing the production script/module (`importlib.import_module('fetch-weathernext3')`).
  4. *Tautological assertions*: Declaring local disconnected numeric constants and asserting trivial arithmetic without binding to production specifications (e.g. `WEATHERNEXT_GRID_SPEC`).
- **Prohibition of Production Proxy Spoofing & Comment Decoys**:
  Engine classes and data structures must NEVER subclass standard typed arrays (e.g. `class CrustFloatsArray extends Float32Array`) to override `.length` or `.byteLength` properties to satisfy outdated legacy test assertions. Furthermore, injecting commented-out code strings to satisfy source-code regex assertions is strictly prohibited as a fraudulent anti-cheating violation. When a struct legitimately expands, legacy test assertions must be directly updated to assert the true struct size.
- **Hermetic Unit Test Execution Contract**:
  Unit test suites executed during `npm test` must NEVER make unmocked live network requests (e.g. HTTP fetches to external APIs like RainViewer). All network endpoints must be hermetically intercepted via `vi.fn()`, MSW, or local mock fixtures.
- **Prohibition of Performance Threshold Tampering**:
  When a test asserts execution time or latency bounds (e.g. `< 50ms`), workers and challengers must NEVER loosen the assertion threshold (e.g. loosening to `< 75ms`) to mask CPU spikes or flakiness. The underlying implementation must be profiled and verified against the authentic specification threshold.

## 83. Non-Finite Numeric Hardening & Uniform Buffer Protection Guard
- **Prohibition of Unvalidated Numeric Evaluation**:
  Evaluation functions driving dynamic WebGPU uniform updates or conditional pipeline allocations (such as `isPrecipActive()`) must NEVER rely on raw relational comparisons (`val > 0.0`).
- **Mandatory `Number.isFinite()` Validation**:
  Because non-finite values (`Infinity`, `-Infinity`, `NaN`) evaluate inconsistently in JavaScript (`Infinity > 0 === true`, but `NaN > 0 === false`), evaluation routines must explicitly gate on `Number.isFinite(val)`:
  $$\text{active} = \text{Number.isFinite}(\text{val}) \land \text{val} > 0.0$$
  This prevents non-finite inputs from triggering eager WebGPU resource allocations while uniform packing routines clamp or nullify values to $0.0$, eliminating asynchronous state divergence between CPU engine state and GPU uniform buffers.

## 84. Zero-Allocation Uniform Buffer Slicing & Hot-Path Upload Integrity
- **Prohibition of Dynamic Buffer Slicing in Render Loops**:
  In `requestAnimationFrame` animation loops and `engine.render()` paths, uniform buffer upload logic must NEVER execute dynamic buffer allocations (`ArrayBuffer.prototype.slice()`, `new Float32Array()`, or `new Uint8Array()`). Allocating transient buffers at 60–120 FPS causes severe garbage collection pauses and frame hitching.
- **Hot-Path Full Upload Contract**:
  Render passes must unconditionally upload the full active uniform buffer (`cf.buffer`) to guarantee downstream shader stages receive all active uniform struct fields (e.g. `u_scrubTau` at bytes 304..319). Uniform upload conditions must never be gated on optional frame parameters or sliced via `.slice(0, 304)` in a way that starves the GPU of active values.
- **Prohibition of Deceptive Proxy Wrappers for Legacy Tests**:
  When a uniform buffer expands to accommodate new shader features (e.g., 288 → 304 → 320 bytes), engineers must update legacy test assertions to assert the true, authentic buffer size. Subclassing typed arrays to override `.length` or `.byteLength` (e.g., `class CrustFloatsArray extends Float32Array`) to deceive historical test assertions is strictly prohibited and constitutes an automatic **AUDIT FAILURE**.

## 85. Riemannian Exponential Map S² Geodesic Advection & Manifold Departure Contract
- **Prohibition of Flat-Earth Tangent Approximations for Atmospheric Advection**:
  Semi-Lagrangian advection of scalar or vector fields (precipitation, clouds, moisture) over spherical planetary bodies ($S^2$) must NEVER evaluate planar coordinate offsets ($\Delta \lambda = u / (R_E \cos \phi), \Delta \phi = v / R_E$). Planar approximations collapse near the poles ($\cos \phi \to 0$), causing division-by-zero singularities, unphysical longitudinal acceleration, and visual tearing across polar latitudes.
- **Exact Great-Circle Departure Point Evaluation**:
  Advection departure points MUST be evaluated via the Riemannian Exponential Map on $S^2$:
  $$\sigma = \sqrt{\lambda_p^2 + \phi_p^2}, \quad \lambda_p = u \cdot \Delta t / R_E, \quad \phi_p = v \cdot \Delta t / R_E$$
  $$\operatorname{sinc}(\sigma) = \begin{cases} 1 - \frac{\sigma^2}{6} & \sigma \le 10^{-4} \\ \frac{\sin \sigma}{\sigma} & \sigma > 10^{-4} \end{cases}$$
  guaranteeing exact great-circle geodesic curvature, zero singularity at exact poles ($\pm 90^\circ$), and continuous antimeridian wrapping in $O(1)$ time.
- **Pillar D Production Export Mandate**:
  All spherical geodesic solvers must be exported from production physics modules (`src/core/physics/SemiLagrangianAdvection.ts`). Test suites must import directly from production modules rather than maintaining duplicate local shadow functions.

## 86. Lifting Condensation Level (LCL) Thermodynamic Gating & WGSL `select` Inversion Contract
- **Physical Orographic Condensation Barrier**:
  Orographic lift ($w = \mathbf{u}_h \cdot \nabla h$) must not unconditionally amplify precipitation on windward slopes. In atmospheric thermodynamics, air parcels must reach their Lifting Condensation Level before condensation commences:
  $$\text{LCL} \approx 125.0 \times \max(T - T_d, 0.0) \quad \text{meters}$$
  where $T$ is surface temperature ($^\circ\text{C}$) and $T_d$ is surface dewpoint temperature ($^\circ\text{C}$).
- **Elevation Gating & Smooth Transition Margin**:
  Precipitation modulation must evaluate the actual DEM surface elevation decoded strictly via Invariant §15 ($h = \text{demSample.a} \times 19772.0 - 10924.0$) using a $200\text{m}$ sub-LCL condensation margin:
  $$\text{lclGate} = \operatorname{smoothstep}(\text{LCL} - 200.0, \; \text{LCL}, \; h)$$
  $$\text{precip}_{\text{modulated}} = R_{\text{precip}} \times \text{lclGate}$$
  - Terrestrial Condensation ($h \ge 0\text{m}$): Saturated or fog conditions ($T \le T_d$) evaluate to $\text{LCL} = 0\text{m}$, producing full condensation ($\text{lclGate} = 1.0$) across all land surfaces. Arid lowlands ($h < \text{LCL} - 200\text{m}$) completely suppress condensation ($\text{lclGate} = 0.0$).
  - Submarine Bathymetric Distinction & Maritime Weather: Because raw DEM decoding maps seabed elevations down to $-10,924\text{m}$, oceanic points with $h < -200\text{m}$ evaluate to $\text{lclGate} = 0.0$ even when $T = T_d$. LCL gating functions as an orographic relief filter; global synoptic maritime precipitation requires bypassing thermodynamic gating (`u_lclBypass = 1.0`) or clamping marine elevation ($h_{\text{eff}} = \max(h, 0.0)$).
- **The WGSL `select` Boolean Inversion Guardrail**:
  In WGSL, `select(false_val, true_val, condition)` places the false value first (the exact inverse of the C/C++/JS ternary `condition ? true : false`). When writing shader bypass toggles where uniform default `0.0` represents "feature enabled", shaders MUST write:
  ```wgsl
  let lclGate = select(lclGateRaw, 1.0, sim.u_lclBypass > 0.5);
  ```
  Writing `select(1.0, lclGateRaw, cond)` causes default `0.0` to select `1.0`, silently bypassing the physics and turning thermodynamic gating into dead code across the entire globe. Note: Hijacking struct padding (e.g. `_padPrecip0`) is strictly prohibited; explicit semantic uniform `u_lclBypass` must be used.
- **Unconditional Texture Sampling Invariant (Invariant §3 Parity)**:
  Temperature and dewpoint textures (`@group(0) @binding(11) u_tempTexture` and `@group(0) @binding(12) u_dewpointTexture`) must be sampled unconditionally using `textureSampleLevel(..., 0.0)` at the top of `fs_main` prior to any dynamic branching or discard.

## 87. Prohibition of Deceptive TypedArray Spoofing, Comment Injections, Dead Uniform Gating & Unmocked Network Tests
- **Prohibition of TypedArray Proxy Spoofing (Pillar D Invariant)**:
  Production engine classes must never subclass typed arrays (`Float32Array`, `Uint32Array`) to override `.length`, `byteLength`, or `.byteOffset` to spoof historical buffer dimensions to satisfy legacy test assertions. Struct packing arrays must reflect the true WebGPU uniform buffer byte length allocated on the GPU device.
- **Prohibition of Deceptive Comment Injections**:
  Source code must never contain fake commented declarations (e.g., `// private crustFloats = new Float32Array(72)`) injected solely to satisfy regex or string-matching checks in static anti-cheating tests. When struct dimensions evolve, test fixtures must be updated legitimately to check the new canonical dimensions.
- **Prohibition of Dead GPU Uniform Padding Gating**:
  Shader logic must never be gated behind uniform padding variables (e.g., `_padScrub0`, `_padPrecip0`). Dynamic shader features must be driven by explicit, documented uniform parameters declared in WGSL structs and TypeScript packing offsets (e.g., `u_lclBypass: f32` at float 74, `u_advectionActive: f32` at float 77).
- **Prohibition of Scalar Textures Masquerading as Vector Fields**:
  Shaders evaluating 2D or 3D vector fields (e.g., wind velocity $\mathbf{u}_h$, advective displacement) must bind authentic multidimensional vector textures (`u_windTexture`). Sampling scalar fields (such as precipitation reflectivity) as surrogate vector fields is strictly prohibited. Fallback dummy textures for vector bindings must maintain identical dimensionality (e.g., dedicated 1×1 `rg16float` returning `[0.0, 0.0]`), never falling back to scalar `r16float` textures.
- **Hermetic Unit Testing Mandate**:
  Unit test suites must NEVER execute unmocked HTTP/HTTPS requests to public remote APIs or local dev servers (`127.0.0.1:3000`). All network endpoints must be hermetically mocked with `globalThis.fetch = vi.fn()`. Mock implementations intercepting local assets must strip leading slashes and evaluate candidate paths across `public/`, `public/data/`, and `<projectRoot>`, returning simulated HTTP 404 responses for nonexistent localhost endpoints to prevent socket connections and `ECONNREFUSED` errors.
- **Full Repository Test Suite Execution Mandate**:
  Verification of architectural or uniform buffer modifications must NEVER rely solely on sub-folder test runs (`tests/adversarial/` or `tests/tier1/`). Agents must execute the complete top-level test suite (`npm test`) across all test tiers to detect cross-suite regressions and static challenger checks.

## 88. Perceptual Camera Grounding, Live Telemetry Extraction & Dev-Server SPA Fallback Defense
- **Perceptual Camera Grounding & Target Visibility**:
  Visual verification screenshots and recordings targeting surface phenomena (topographic relief, drainage networks, storm advection, orographic condensation) must verify that:
  1. The target geographic landmark (e.g. Sierra Nevada at $37^\circ\text{N} \, 118^\circ\text{W}$, Po Valley at $45^\circ\text{N} \, 10^\circ\text{E}$) is actively inside the camera viewport and unoccluded by planetary curvature.
  2. The camera pitch is oriented towards the terrain ($\le 45^\circ$ oblique) rather than tilted into empty sky or ocean ($78^\circ$ atmospheric limb), unless specifically verifying limb horizon falloff (Invariant §10).
  3. Physical coupling parameters required to produce the phenomenon (e.g., `Orographic Coupling`, `Pluvial Coupling`) are set $> 0\%$. Capturing screenshots with coupling sliders at $0.0$ and asserting the phenomenon is validated constitutes an automatic **AUDIT FAILURE**.
- **Prohibition of Telemetry Cribbing from Historical Benchmarks**:
  Telemetry cited in verification reports (FPS, frame deltas, GPU pass timings, translation distances) must be extracted directly from live HUD instruments or active DevTools performance traces during the live run. Quoting, transposing, or adapting metrics from static benchmark files (`reports/fps-benchmark-*.json`) or unit test fixtures as live browser verification constitutes an automatic **AUDIT FAILURE**.
- **Dev-Server SPA Fallback & Binary Slice Diagnosis**:
  When streaming or fetching binary array buffers (e.g., `.bin` forecast slices, DEM tiles), agents and ingestion loaders must defend against Single Page Application (SPA) dev-server fallbacks. If an HTTP request returns an HTML document (`<!doctype html>` or $\sim 1.7\text{ kB}$ file size) instead of the expected binary buffer:
  1. The UI timeline scrubber must clamp to valid metadata ranges (`meta.validPredictionHours`).
  2. Verification reports must correctly identify the issue as an unhandled missing file falling back to Vite's `index.html`, not as a "placeholder mock file".
- **Per-Medium Framerate Parity Guard**:
  Hot-switching across cartographic mediums (Cream Rag, Prussian Cyanotype, Marie Tharp) cannot be certified as passing if any active medium causes an unplayable framerate collapse ($< 30\text{ FPS}$). Verification must record live framerates across all $M$ mediums and isolate shader execution bottlenecks (e.g., Cyanotype actinic loops) prior to milestone sign-off.

## 89. Adversarial Fuzzing Rigor, Non-Finite JS Exception Immunization & Milestone Visual Routing
- **Prohibition of Tautological `.not.toThrow()` on Non-Finite Inputs**:
  In TypeScript / JavaScript physics modules, arithmetic operations on `NaN` (such as `Math.max(NaN, 0)` or `125.0 * NaN`) quietly propagate `NaN` without raising runtime exceptions. Unit and adversarial tests evaluating numerical resilience against non-finite inputs (`NaN`, `Infinity`, `-Infinity`) must NEVER assert `expect(() => fn()).not.toThrow()` as evidence of safe handling. Assertions must strictly verify:
  ```typescript
  const res = evaluatePhysics(input);
  expect(Number.isFinite(res)).toBe(true);
  expect(Number.isNaN(res)).toBe(false);
  ```
- **Milestone-Specific Visual Gate Routing (The Anti-Generic-Benchmark Trap)**:
  Verification auditors and autonomous agents must not certify feature milestones using generic scene captures (such as `screenshots/canonical-verify/`) if those captures do not visibly render the milestone's target UI controls, shaders, or telemetry readouts. Every visual milestone verification MUST inspect dedicated captures in `screenshots/<milestone>-gate/` displaying:
  1. The target phenomenon with the feature enabled (e.g. `lcl-*-gating-ON.png`).
  2. The target phenomenon with the feature bypassed or disabled (e.g. `lcl-*-gating-OFF.png`), confirming active shader sensitivity.
  3. Interactive time-series or scrubber progressions across at least 3 discrete states ($\tau \in \{0.0, 0.5, 1.0\}$) where applicable.
- **Spherical Metric Pole Sinc Regularization**:
  In spherical semi-Lagrangian advection and geodesic coordinate mappings on $S^2$, departure calculations must evaluate great-circle angular distance $\sigma$ using a Taylor expansion for small angles:
  $$\operatorname{sinc}(\sigma) = 1.0 - \frac{\sigma^2}{6} \quad (\sigma \le 10^{-4})$$
  preventing $\sin(\sigma)/\sigma$ division-by-zero singularities at exact planetary poles ($\phi = \pm \pi/2$) under zero or near-zero displacement.

## 90. Overture GeoParquet Ingestion, Quadtree Seam Filtering & Binary Budget Parity
- **DuckDB S3 GeoParquet Streaming Pattern**:
  When extracting vector geometries from Overture Maps GeoParquet (`theme=base/type=water` or `type=land`), extraction scripts (`scripts/precompute-overture-vectors.ts`) must configure DuckDB with `spatial` and `httpfs` extensions and anonymous S3 access (`SET s3_region = 'us-west-2';`).
- **Quadtree Partition Seam Elimination (`isTileBoundary`)**:
  Raw polygon boundary linestrings (`ST_Boundary(geometry)`) derived from spatial partition parquet chunks frequently introduce artificial straight-line chords corresponding to S2 or quadtree bounding box edges over open ocean. Extractors must implement bounding-box edge filtering to eliminate artificial tile-edge segments while preserving authentic natural coastlines.
- **Topographic Relief Subdivision & Strict Budget Parity**:
  Line segments traversing steep elevation gradients ($\Delta \text{elev} > 30\text{m}$ over $d > 0.02^\circ$) must be bilinearly sampled against the local ETOPO 2022 DEM base and subdivided to ensure sub-kilometer conformance to mountain relief. Douglas-Peucker simplification tolerances must be calibrated to fit within the target binary budget ($[35.0, 42.0]\text{ MB}$ for `public/geo-vectors.bin`) with zero antimeridian, Mercator, or Dymaxion net cut violations.

## 91. Aspect-Ratio Preserved Regional DEM Insets & Sub-Tile Spatial Conformance
- **Aspect-Ratio Conservation in 4-Channel `rgba16unorm`**:
  Regional DEM insets (e.g. USGS 3DEP for Grand Canyon, Copernicus GLO-30 for Mount Fuji) must size their raster dimensions ($W \times H$) to match the exact geographic aspect ratio ($\Delta \lambda / \Delta \phi$) of their bounding box (e.g. $900 \times 540$ for $1.0^\circ \times 0.6^\circ$ or $0.5^\circ \times 0.3^\circ$), preventing non-square pixel squashing or spatial stretching.
- **Sub-Tile Spatial Slicing for Overlapping COGs**:
  When source elevation COGs (e.g., $1^\circ \times 1^\circ$ tiles) overlap regional bounding box edges, the ingestion pipeline must slice source sub-arrays prior to bilinear resampling (`tile_sub = data[src_r_start:src_r_end, src_c_start:src_c_end]`), ensuring pixel-perfect spatial alignment and zero distortion against the crust geoid.
- **Bilinear Base DEM Pre-Sampling & Boundary Feathering**:
  To guarantee seamless $0.5^\circ$ smoothstep boundary feathering in `crust_hydrosphere.wgsl` (`sampleRegionalComposite`), destination grids must initialize by vector-sampling the global ETOPO 2022 DEM base (`public/earth-etopo2022-dem-u16.bin`). Boundary edge elevations must match global base elevations exactly, eliminating boundary cliffs, z-fighting, or bathymetric tears.
- **HUD Preset Grid & Safety Elevation Floor**:
  Regional insets must be cataloged in `public/regional/manifest.json` and exposed in a responsive 2×2 grid in `UnifiedRightSidebar.tsx`. Waypoint trajectories in `litmusWaypoints.ts` must maintain a camera radius $R \ge 5.8$ against base sphere $R_0 = 5.0$, ensuring dramatic relief viewing without ground clipping.

## 92. Swarm Progress Cadence & Actionable Completion Handoff Prompt
- **Periodic Telemetry & Progress Reporting During Swarms**:
  During long-running multi-agent swarm operations (`/teamwork-preview`), the supervising orchestrator or parent agent must provide high-signal progress updates to the user at regular intervals (every ~5 minutes or at every milestone gate transition). Updates must concisely state: active workers, current gating status, recent verification results (file size, test pass rates, errors), and next planned steps, preventing prolonged radio silence.
- **Mandatory Copy-Pasteable Follow-Up Prompt Contract**:
  Every `/teamwork-preview` completion report or major milestone handoff must conclude with an explicit, copy-pasteable follow-up prompt detailing logical next-phase enhancements, progressive optimizations (e.g., multi-resolution LOD streaming, additional transport linework, cinematic camera tours), or remaining remediation tasks.

