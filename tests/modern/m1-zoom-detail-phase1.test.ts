import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 1 Zoom Detail: Procedural Geomorphic Synthesis & Topocentric Inspection', () => {
  const crustShaderPath = path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl');
  const enginePath = path.resolve(__dirname, '../../src/webgpu/WebGPUEngine.ts');
  const canvasPath = path.resolve(__dirname, '../../src/webgpu/WebGPUCanvas.tsx');

  const crustShaderSrc = fs.readFileSync(crustShaderPath, 'utf8');
  const engineSrc = fs.readFileSync(enginePath, 'utf8');
  const canvasSrc = fs.readFileSync(canvasPath, 'utf8');

  describe('1. WGSL Uniform Layout & Alignment (Track A / Group 1 Binding 7)', () => {
    it('declares struct GeomorphicMicroUniforms with exact 16-byte alignment', () => {
      expect(crustShaderSrc).toContain('struct GeomorphicMicroUniforms');
      expect(crustShaderSrc).toMatch(/u_microDetailStrength:\s*f32/);
      expect(crustShaderSrc).toMatch(/u_rockSlopeThreshold:\s*f32/);
      expect(crustShaderSrc).toMatch(/u_contourBaseInterval:\s*f32/);
      expect(crustShaderSrc).toMatch(/u_contourActive:\s*f32/);
    });

    it('binds u_geomorphicMicro at @group(1) @binding(7)', () => {
      expect(crustShaderSrc).toMatch(/@group\(1\)\s+@binding\(7\)\s+var<uniform>\s+u_geomorphicMicro:\s*GeomorphicMicroUniforms;/);
    });

    it('declares group 1 layout with 8 bindings (0..7) in WebGPUEngine', () => {
      expect(engineSrc).toContain('terrainShadowBindGroupLayout');
      expect(engineSrc).toMatch(/binding:\s*7,\s*visibility:\s*GPUShaderStage\.FRAGMENT,\s*buffer:\s*\{\s*type:\s*'uniform'\s*\}/);
    });

    it('binds geomorphicMicroUniformBuffer across all crustGroup1BindGroups', () => {
      const match = engineSrc.match(/binding:\s*7,\s*resource:\s*\{\s*buffer:\s*this\.geomorphicMicroUniformBuffer!\s*\}/g);
      // Group 1 has 4 bind groups for themes (0, 1, 2, 3)
      expect(match).not.toBeNull();
      expect(match!.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('2. Track A.1 Eduard Imhof Alpine Rock Strata & Couloir Fluting', () => {
    it('defines slope factor activating on steep rock walls', () => {
      expect(crustShaderSrc).toContain('let rockThreshold = select(0.610865, u_geomorphicMicro.u_rockSlopeThreshold, u_geomorphicMicro.u_rockSlopeThreshold > 0.01);');
      expect(crustShaderSrc).toContain('let rockWeight = smoothstep(rockThreshold - 0.08, rockThreshold + 0.15, slopeAngle) * 0.95;');
    });

    it('derives rock strata flow direction perpendicular to elevation gradient', () => {
      expect(crustShaderSrc).toContain('let gradDir = normalize(vec2<f32>(effDHx, effDHy) + vec2<f32>(1e-6, 1e-6));');
      expect(crustShaderSrc).toContain('let strikeDir = vec2<f32>(-gradDir.y, gradDir.x);');
    });

    it('derives couloir fall-line fluting parallel to elevation gradient', () => {
      expect(crustShaderSrc).toContain('let uFall = dot(pMetric.xy, gradDir) + pMetric.z * 0.45;');
      expect(crustShaderSrc).toContain('let uStrike = dot(pMetric.xy, strikeDir) + pMetric.z * 0.25;');
    });

    it('modulates rock shading via multi-octave bedding strata and couloir fluting', () => {
      expect(crustShaderSrc).toContain('let couloirTotal = joint1 * 0.65 + joint2 * 0.35;');
      expect(crustShaderSrc).toContain('let strataTotal = strata1 * 0.50 + strata2 * 0.35 + strata3 * 0.15;');
      expect(crustShaderSrc).toContain('let hachureModulation = clamp(0.55 + 0.45 * (couloirTotal * 0.60 + strataTotal * 0.40), 0.15, 1.35);');
    });
  });

  describe('3. Track A.3 Multi-Octave Micro-Roughness Perturbation', () => {
    it('activates micro-roughness perturbation at high zoom (pixel footprint < 3200m)', () => {
      expect(crustShaderSrc).toContain('let microRoughWeight = (1.0 - smoothstep(250.0, 3200.0, pixelFootprintM)) * slopeNormWeight * u_geomorphicMicro.u_microDetailStrength;');
    });

    it('couples micro-roughness with terrain slope weighting', () => {
      expect(crustShaderSrc).toContain('let slopeNormWeight = (1.0 - smoothstep(0.55, 0.75, cosNormSlope));');
    });

    it('perturbs surface normal in-place preserving unit length', () => {
      expect(crustShaderSrc).toContain('let microN_enhanced = normalize(microN + (tangentX * pGradX + tangentY * pGradY));');
    });
  });

  describe('4. Track A.2 Dynamic 1-2-5 Decimal Contour Series', () => {
    it('implements Swiss Topo decimal 1-2-5 series (500m -> 200m -> 100m -> 50m -> 20m)', () => {
      expect(crustShaderSrc).toContain('let deltaH = select(500.0,');
      expect(crustShaderSrc).toContain('select(200.0,');
      expect(crustShaderSrc).toContain('select(100.0,');
      expect(crustShaderSrc).toContain('select(50.0, 20.0, camAltKm < 12.0),');
    });

    it('implements index contour bolding every 5th contour', () => {
      expect(crustShaderSrc).toContain('let majorIndex = elevIndex * 0.20;');
      expect(crustShaderSrc).toContain('let isMajor = 1.0 - smoothstep(0.0, halfW * 1.6, distMajor);');
    });

    it('fades contours on steep slopes (>50 deg) to prevent clutter where Imhof rock hachures rule', () => {
      expect(crustShaderSrc).toContain('let hachureFade = 1.0 - smoothstep(0.70, 0.98, slopeAngle);');
    });

    it('evaluates screen-space derivative width without dynamic fwidth inside conditionals (Rule 4)', () => {
      expect(crustShaderSrc).toContain('let dElevMetersPx = length(vec2<f32>(dDemLandX * pxPerTexel.x, dDemLandY * pxPerTexel.y)) * 8848.0;');
      expect(crustShaderSrc).toContain('let dElevPx = dElevMetersPx / deltaH;');
      expect(crustShaderSrc).toContain('let halfW = max(0.012, dElevPx * 0.85);');
    });
  });

  describe('5. Track E Topocentric Camera Kinematics', () => {
    it('damps orbit rotation speed adaptively with camera altitude', () => {
      expect(canvasSrc).toContain('const altRatio = Math.max(0.04, Math.min(1.0, (sphericalRef.current.radius - 5.0) / 7.0));');
      expect(canvasSrc).toContain('const rotateSpeed = 0.005 * (curUnfurl < 0.01 ? (0.04 + 0.96 * altRatio) : 1.0);');
    });

    it('does not reset camera target to origin on close inspection drag (radius < 16.0)', () => {
      expect(canvasSrc).toContain('if (curUnfurl < 0.01 && sphericalRef.current.radius >= 16.0) {');
      expect(canvasSrc).toContain('targetRef.current.set(0, 0, 0);');
    });
  });

  describe('6. Zero-GC Memory Discipline (Rule 26)', () => {
    it('preallocates geomorphicMicroFloats Float32Array mirror on engine class', () => {
      expect(engineSrc).toContain('public geomorphicMicroFloats = new Float32Array([0.65, 0.61, 50.0, 1.0]);');
    });

    it('updates geomorphic micro uniforms in-place via Float32Array mirror and writeBuffer', () => {
      expect(engineSrc).toContain('updateGeomorphicMicroUniforms(params: {');
      expect(engineSrc).toContain('this.device.queue.writeBuffer(this.geomorphicMicroUniformBuffer, 0, this.geomorphicMicroFloats.buffer);');
    });
  });

  describe('7. Camera-Coupled Dynamic Relief Attenuation & Altitude Clearance', () => {
    it('attenuates relief multiplier from 2.8x (orbit) to 1.0x (close zoom)', () => {
      expect(canvasSrc).toContain('const alphaRelief = Math.min(1.0, Math.max(0.0, (currentCamRadius - 5.05) / (5.50 - 5.05)));');
      expect(canvasSrc).toContain('const reliefMultiplier = 1.0 + 1.8 * alphaRelief;');
      expect(canvasSrc).toContain('const displacementScale = baseDisplacementScale * (reliefMultiplier / 2.8);');
    });

    it('scales look-ahead target distance proportionally to camera altitude', () => {
      expect(canvasSrc).toContain('const targetDist = Math.min(3.5, Math.max(0.08, (safeRadius - 5.0) * 1.5));');
    });

    it('passes camera radius into computeGroundClearanceFloor', () => {
      expect(canvasSrc).toContain('const r = camRadius ?? sphericalRef.current.radius;');
      expect(canvasSrc).toContain('return computeGroundClearanceFloor(elevM, dispScale, r);');
    });
  });
});
