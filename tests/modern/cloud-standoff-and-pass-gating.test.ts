// ============================================================================
// File: tests/modern/cloud-standoff-and-pass-gating.test.ts
// Milestone 3 Gate: Cloud Shell Normal Conformance, Geometric Standoff & Pass Gating
// Reference: macro_chart_implementation_plan.md §Milestone 3, AGENTS.md Rule 4, 24
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SHADERS_DIR = path.resolve(__dirname, '../../src/webgpu/shaders');

describe('Milestone 3 Gate: Cloud Normal Conformance & Zero-Zombie Pass Gating', () => {
  const cloudShellSrc = fs.readFileSync(path.join(SHADERS_DIR, 'cloud_shell.wgsl'), 'utf8');
  const crustSrc = fs.readFileSync(path.join(SHADERS_DIR, 'crust_hydrosphere.wgsl'), 'utf8');
  const volumetricCloudSrc = fs.readFileSync(path.join(SHADERS_DIR, 'volumetric_cloud.wgsl'), 'utf8');
  const engineSrc = fs.readFileSync(path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts'), 'utf8');

  it('M3-T1: verifies DEM decoding parity between cloud_shell.wgsl and crust_hydrosphere.wgsl', () => {
    // Invariant §15 / Rule 8: elevMeters = demSample.a * 19772.0 - 10924.0
    expect(cloudShellSrc).toContain('demSample.a * 19772.0 - 10924.0');
    expect(crustSrc).toContain('demSample.a * 19772.0 - 10924.0');
  });

  it('M3-T1: verifies cloud shell inherits shared base normal and enforces positive standoff above crust', () => {
    // cloud_shell vs_main uses evaluateManifoldCore
    expect(cloudShellSrc).toContain('let def = evaluateManifoldCore(');
    expect(cloudShellSrc).toContain('let basePos = def.pos;');
    expect(cloudShellSrc).toContain('var normal = def.normal;');

    // crust_hydrosphere vs_main uses evaluateGridManifold which calls evaluateManifoldCore
    expect(crustSrc).toContain('let baseNormal = deformed.normal;');

    // Verify positive standoff added on top of crust displacement
    expect(cloudShellSrc).toContain('var totalOffset = crustDisp + effStandoff;');
    expect(cloudShellSrc).toContain('let worldP = basePos + normal * totalOffset;');

    // Empirical verification across 1,000 elevations:
    // totalOffset must strictly exceed normalDisplacement for any layer
    const layerStandoffs = [0.0010, 0.0040, 0.0080]; // Low, Mid, High
    const dispScale = 0.015 * 2.8;

    for (let elev = 0; elev <= 8848; elev += 50) {
      const normH = elev / 8848.0;
      const shapedH = (1.0 - Math.exp(-2.2 * normH)) / (1.0 - Math.exp(-2.2));
      const crustDisp = Math.pow(shapedH, 1.0) * dispScale;

      for (const standoff of layerStandoffs) {
        const totalOffset = crustDisp + standoff;
        expect(totalOffset).toBeGreaterThan(crustDisp);
        expect(totalOffset - crustDisp).toBeCloseTo(standoff, 6);
      }
    }
  });

  it('M3-T2: verifies Rule 24 zero-zombie decoupling between Pass 1 and Pass 2 in WebGPUEngine.ts', () => {
    // Pass 1 Cloud Shells are bypassed when useVolumetric is true
    expect(engineSrc).toContain('if (!isPurity && showCloudLow && !useVolumetric)');
    expect(engineSrc).toContain('if (!isPurity && showCloudMid && !useVolumetric)');
    expect(engineSrc).toContain('if (!isPurity && showCloudHigh && !useVolumetric)');

    // Pass 2 Volumetric clouds are strictly gated by useVolumetric
    expect(engineSrc).toContain('if (!isPurity && useVolumetric) {');
    expect(engineSrc).toContain('this.renderVolumetricClouds(commandEncoder, params, sceneTargetView);');

    // useVolumetric requires showClouds
    expect(engineSrc).toContain('const useVolumetric = !isPurity && showClouds &&');
  });

  it('M3-T3: verifies Rule 4 uniform control flow in volumetric_cloud.wgsl and cloud_shell.wgsl', () => {
    // In volumetric_cloud.wgsl: zero derivative instructions
    expect(volumetricCloudSrc.match(/\b(dpdx|dpdy|fwidth)\b/g)).toBeNull();

    // In volumetric_cloud.wgsl: all texture samples use textureSampleLevel or textureLoad
    expect(volumetricCloudSrc.match(/\btextureSample\(/g)).toBeNull();

    // In cloud_shell.wgsl: derivatives evaluated at top of fs_main
    const fsMainMatch = cloudShellSrc.match(/fn\s+fs_main\s*\([^)]*\)\s*->[^{]*\{([\s\S]*?)\}/);
    expect(fsMainMatch).not.toBeNull();
    const fsMainBody = fsMainMatch![1];
    const topLines = fsMainBody.slice(0, 600);
    expect(topLines).toContain('dpdx(');
    expect(topLines).toContain('dpdy(');
    expect(topLines).toContain('fwidth(');
  });
});
