# Indicatrix Engine Project Rules

## 1. Authoritative References
Always consult the following master specifications before proposing or making any changes:
- `DESIGN_ETHOS.md`: The 15 core design principles, rendering identities, hydrosphere physics, and framing hierarchy.
- `design-language.md`: Color spaces (OKLCH to Linear sRGB), theme tokens, typographic scale, and HUD geometry.

## 2. The Cartographic Sheet — What This Project Is
The Indicatrix Engine does not simulate a virtual 3D planet floating in dark video game space. It simulates an **archival drafting sheet** (310 GSM Cotton Rag, 1842 Blueprint, or 1977 Tharp Physiographic Chart) resting on a physical map board experiencing continuous Riemannian manifold deformations.
- **Vectors as Physical Ink**: Vector boundaries and graticules are copperplate intaglio ink absorbed into cellulose paper fibers, ruling-pen incisions, or bathymetric stippling — not 3D floating wire objects.
- **Framing Hierarchy**: The sheet neatline (`inset-2`, 10px from viewport edge) is the immovable master boundary; floating instruments hover above the drawing board with strict 10px spatial breathing moats.

## 3. Medium Identity — Non-Negotiable Visual Standards
Each cartographic medium has a **non-negotiable visual identity**. Before any shader change is merged, verify side-by-side that:
- **Cream Rag (Theme 1)**: Warm ivory paper tone, delicate sepia ink, visible paper tooth texture. Must evoke a hand-drafted 19th century survey map. 100% pitch black vectors are prohibited — use archival sepia-charcoal ink (`#38302A`).
- **Prussian Cyanotype (Theme 2)**: Cold blue-white on deep Prussian blue, sharp high-contrast linework, photochemical exposure aesthetic. Must evoke an 1842 blueprint. Zero warm yellow/gold/sepia contamination.
- **Marie Tharp (Theme 0)**: Warm earth tones, physiographic stippling, ocean floor painting aesthetic. Must evoke her 1977 hand-painted ocean floor panorama.

If any medium has visually regressed (lost contrast, lost identity, become "muddy"), the change must be reverted before addressing other issues.

## 4. WebGPU WGSL Uniform Control Flow
In WGSL fragment shaders, all finite difference derivatives (`fwidth()`, `dpdx()`, `dpdy()`) and implicit-LOD texture sampling operations MUST be evaluated at the top of `fs_main` in unconditional uniform control flow, before any dynamic branching or `discard` statements. Calling derivatives inside conditional branches triggers fatal GPU compilation errors.

Runtime feature toggles must use `select(fallback, active, condition)` rather than enclosing sampling in `if` statements.

## 5. Visual Verification Over Theory
No shader, geometry, or thematic refactor is complete based solely on compilation passes or theoretical documentation.
- **Test all 3 mediums**: No visual verification may pass based on captures of a single theme.
- **Live browser verification**: Use Chrome DevTools MCP (`take_screenshot`, `list_console_messages`) to confirm zero runtime errors and correct visual output.
- **Show real content**: A large screenshot file (> 50KB) is NOT proof of feature implementation. If a feature is claimed to be implemented, the screenshot must show that feature clearly visible.
- **No Uniform Placebos (End-to-End Shader Execution)**: Verifying that a React control updates component state or packs a float into `SimUniforms` is completely insufficient. The implementing agent must verify that the target fragment/vertex shader actually consumes that uniform in its **active, default execution path** without early `discard` statements, hardcoded masks, or bypassed branches. If a uniform is uploaded but discarded in the default view, it is a placebo.
- **Dual-State Visual Contrast**: For interactive parameters (e.g. Sea Level ±100m, Solar Angle, or Water Clarity), visual verification must capture before/after states at opposing parameter bounds and demonstrate an observable pixel delta on the canvas.

## 6. Cartographic Framing & HUD Layout
- **10px Spatial Clearance Moat**: All floating HUD instruments align to a 20px grid axis. The distance from neatline to panel edge is a strict 10px moat.
- **20px Inter-Instrument Gutters**: Adjacent floating panels maintain 20px clearance gutters.
- **Single-Border HUD Enclosure**: Floating panels render exactly one perimeter border. No nested inner neatline boxes.
- **Floating cards use ivory vellum**: HUD instruments render in ivory vellum card tone (`rgba(252, 249, 242, 0.94)`) with warm cast shadows, NOT the same background as the map sheet.

## 7. Zero-Standoff Surface Conformance & Horizon Falloff
- Vectors conform strictly to the DEM elevation surface ($z_{\text{standoff}} \le 0.002$). No fixed normal offsets.
- Vector fragments attenuate to zero before crossing the planetary horizon limb (`smoothstep(0.02, 0.20, in.facing)`).
- Resolve z-fighting exclusively through hardware depth bias (`depthBias: -120`, `depthBiasSlopeScale: -1.0`), not geometric standoffs.

## 8. Cross-Pipeline DEM Parity
Any secondary WebGPU render pass that conforms to the planetary crust must use the identical geoid decoding formula as `crust_hydrosphere.wgsl`:
$$\text{elevMeters} = \text{demSample.a} \cdot 19772.0 - 10924.0$$
Dynamic exponent and attenuation curves must match across all shaders.

## 9. No Unrequested Features
- **No feature may be added without explicit user request or approved plan.** If the user didn't ask for it and it's not in the current plan, don't build it.
- **Feature cuts are permanent.** When the user says "cut" or "get rid of" a feature, remove it completely. Don't disable it, comment it out, or hide it behind a flag.
- **Audit before adding.** Before adding any new sidebar control, verify all existing controls work first.

## 10. Swarm Agent Efficiency
- **No roleplay artifacts.** Subagents must NOT generate `BRIEFING.md`, `DISPATCH.md`, `progress.md`, or similar bureaucratic files. Report results via `send_message`.
- **Code first, rules second.** Read the actual source code and look at actual screenshots before citing rule numbers.
- **Trust subagent build verification; independently verify design intent.** Accept build/type-check results from subagents without re-running. But for design-driven refactors (UI audits, language surgery, layout changes), do a full read of modified files after the swarm completes. Grep-based acceptance criteria miss the long tail.
- **No self-certification.** Implementing agents cannot certify their own completion. An independent auditor must verify with live browser testing.

## 11. Staged Gating for Multi-Agent Swarms
- **No monolithic mandates.** Swarms must NOT be launched touching ingestion, tessellation, atmosphere, and fragment shaders simultaneously.
- **Sequential milestones.** Stage 1 → Stage 2 → Stage 3. No progression until the current stage passes visual review.
- **Cooling down.** Agents pause, report live MCP captures, and cool down context at each gate.

## 12. Iterative Correction Without Pendulum Swings
When the user reports a visual problem (e.g., "mountains are too spiky"), fix the specific problem without destroying the opposite quality. Do not swing from "too spiky" to "too flat." Make incremental adjustments and show the result before making further changes.

When in doubt, present 2-3 parameter options rather than picking one extreme.

## 13. Agent Directory, Server & Worktree Hygiene
- **Clean up agent directories.** After each swarm, archive or delete agent working directories from `.agents/`. Only `skills/` persists.
- **Kill dev servers.** Before ending any session or removing a worktree, kill all spawned dev servers. Run `lsof -i :3000 -i :5173` to verify ports are released.
- **Ephemeral Worktrees**: Treat worktrees as temporary execution environments. Always complete the full lifecycle: `Commit -> Merge -> Post-Merge Test Verification -> Kill Dev Server -> Remove Worktree -> Prune`. Never leave uncommitted files or unmerged branches in linked worktrees.
- **Commit and push.** Before launching complex refactoring, commit and push verified working state.

## 14. DEM-Coupled Hydrology
- Inland waterways must be derived from the DEM's discrete Laplacian curvature, not decoupled 2D vector river networks.
- Waterway widths scale according to Leopold-Maddock hydraulic power laws, naturally tapering from headwater rills to coastal estuaries.
- Rivers must sit in actual DEM valley floors, not wander across valley sidewalls.

## 15. WebGPU Canvas Compositing
When `alphaMode: 'premultiplied'` is enabled, all render passes targeting the swapchain texture MUST set `clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }`. Non-zero RGB with $a=0.0$ causes additive blowout against DOM paper backgrounds.

## 16. Camera-Distance Adaptive Linework
Line widths must scale dynamically with camera distance — ultra-fine hairlines at orbital scale, technical drafting weight when zoomed in. No fixed pixel widths.

## 17. Physical Strata Ordering
Rendering respects strict physical altitude order:
$$\text{Substrate} \to \text{Crust} \to \text{Hydrosphere} \to \text{Vector Ink} \to \text{Surface Wind} \to \text{Low Cloud} \to \text{Mid Cloud} \to \text{Jet Stream} \to \text{High Cloud} \to \text{Orbits} \to \text{HUD}$$
Users cannot reorder layers. This is physics, not Photoshop.

## 18. Uniform-Driven Theme Switching
Theme switching must NEVER trigger pipeline recompilation. All medium parameters are packed into uniform buffers and switched via `device.queue.writeBuffer()` in sub-millisecond time.

## 19. Cross-Session Memory
- Agents must read `DISCOVERY_LEDGER.md` at the start of any new session before planning or implementing changes.
- Never re-introduce previously eliminated anti-patterns or re-derive calibrated parameters.

## 20. Domain-Specific Skills (On-Demand)
For detailed technical rules in specific domains, consult the appropriate skill:
- **Shader engineering**: `.agents/skills/shader-engineering/SKILL.md` — WGSL alignment, texture formats, derivative evaluation, polar singularities, hydrosphere optics, relief shading, hypsometric ramps.
- **Data pipeline**: `.agents/skills/data-pipeline/SKILL.md` — Zarr ingestion, ring buffers, DEM resolution, Web Mercator reprojection, Float16 encoding, row pitch alignment.
- **HUD layout**: `.agents/skills/hud-layout/SKILL.md` — Cascading offsets, responsive breakpoints, drawer partitioning, accessibility, chronometric scrubbers.
- **Test integrity**: `.agents/skills/adversarial-challenger-protocol/SKILL.md` — Anti-cheating, test import integrity, defect injection, Monte Carlo fuzzing.

## 21. Source-Text-Scanning Test Fragility
Many test suites in this project use `fs.readFileSync` to read `.tsx` source files and check for specific strings (`expect(content).toContain('...')`). These are NOT runtime DOM tests — they are static source code scanners. Any refactor that moves controls, labels, or CSS classes between files WILL break these tests even when functionality is preserved. When planning a structural refactor:
- **Pre-flight**: Grep the test directory for `readFileSync` to identify all source-scanning tests that reference files being refactored.
- **Budget test harmonization**: Plan for a test update pass after the refactor lands. Don't expect refactored code to pass these tests without updating the scanned file paths or expected strings.
- **Never add synthetic comments**: If a source-scanning test expects a string that moved to a different file, update the test to scan the correct file — never add dead comments to satisfy the old assertion.
- **Shader Source-Scanning Regex Collisions**: Several test suites use regular expressions (e.g. `/else\s+if\s*\(\s*sim\.u_renderStyle\s*==\s*2u\s*\)/`) to assert that specific texture passes exist in shaders. Introducing new branching conditions with identical syntax higher up in the shader causes greedy regex matches to hit the wrong block and fail tests. When branching on uniform properties in shaders, prefer `select(fallback, active, condition)` or unique condition forms to prevent regex collisions.
- **Comprehensive Pre-Flight Token Grepping**: Before modifying or removing any DOM element, label, or layout class, grep `tests/` for literal class names, string labels, and element tags in a single pass. Harmonize all affected test files simultaneously alongside the component edits, avoiding the slow "edit -> test fail -> edit -> test fail" loop.

## 22. Experimental & Diagnostic Staging (Beta Tray)
Internal physics tuning levers, shader diagnostics, and uncalibrated tactile controls (such as procedural paper tooth sliders, raw friction multipliers, or cursor physics ripples) must not clutter primary instrument cards.
- **Beta Tray Containment**: Place experimental or developer-facing controls in a dedicated, collapsible `[BETA]` tray at the bottom of the relevant tab.
- **Aesthetic Status Tagging**: Controls active only in specific themes must explicitly display a status tag (e.g. `(Cream Rag only)`) when inactive, rather than silently disabling with zero explanation.
- **Retirement to Constants**: Once physical parameters are calibrated and validated in shader code, remove the UI slider completely and hardcode the optimal constant into WGSL. Do not expose internal engine plumbing to users permanently.

## 23. Fast-Path Iterative Test Scoping (Targeted vitest vs. Full Suite Gating)
The project test suite contains over 210 test files and 3,100+ tests, including intensive Monte Carlo DEM elevation decoders and uniform stress suites that take 35–45 seconds per run.
- **Targeted Iteration**: During active development, refactoring, or paper-cut fixes, NEVER run `npm test` (full suite) repeatedly. Run only the specific test files associated with the modified components: `npx vitest run tests/path/to/target.test.ts`.
- **Final Gating Only**: Reserve full `npm test` runs strictly for the final verification gate before pushing or reporting task completion.
- **Fast Filter Pattern**: When testing multiple related suites, pass them together in a single command (`npx vitest run test1.ts test2.ts`) rather than running individual suites serially or triggering the entire repo.
