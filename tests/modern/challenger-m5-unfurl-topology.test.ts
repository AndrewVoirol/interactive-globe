// ============================================================================
// File: tests/modern/challenger-m5-unfurl-topology.test.ts
// Empirical Challenger M5 Modern Suite: 4 Unfurl Modes, TopologyControlDock & WGSL Audit
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import fs from 'fs';
import path from 'path';
describe('CHALLENGER-M5: WGSL Audit', () => {
  // --------------------------------------------------------------------------
  // 4. WGSL Shader Static Validation & Control Flow Audit
  // --------------------------------------------------------------------------
  describe('4. WGSL Uniform Control Flow Audit (Dawn/Metal Specification)', () => {
    it('CHALLENGE-WGSL-01: audits crust_hydrosphere.wgsl for textureSample uniform control flow violations', () => {
      const shaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
      const shaderCode = fs.readFileSync(shaderPath, 'utf-8');

      // Detect non-uniform control flow branch
      const hasSurfaceTypeBranch = /if\s*\(\s*input\.surfaceType\s*>\s*0\.5\s*\)/.test(shaderCode);
      expect(hasSurfaceTypeBranch).toBe(true);

      // Check if textureSample is called within the u_renderStyle == 2u block
      const renderStyleBlockMatch = shaderCode.match(/else\s+if\s*\(\s*sim\.u_renderStyle\s*==\s*2u\s*\)\s*\{([\s\S]*?)\}\s*else/);
      expect(renderStyleBlockMatch).not.toBeNull();

      if (renderStyleBlockMatch) {
        const blockContent = renderStyleBlockMatch[1];
        const usesTextureSample = /textureSample\s*\(/.test(blockContent);
        // Remediated: textureSample is eliminated from non-uniform control flow; textureSampleLevel is used
        expect(usesTextureSample).toBe(false);
        const usesTextureSampleLevel = /textureSampleLevel\s*\(/.test(blockContent);
        expect(usesTextureSampleLevel).toBe(true);
      }
    });
  });
});
