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

