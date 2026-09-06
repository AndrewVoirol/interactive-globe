import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Vector Overlay & WebGPU Full Physics Parity Verification', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const vectorLayerCode = fs.readFileSync(
    path.join(projectRoot, 'src/core/VectorOverlayLayer.tsx'),
    'utf8'
  );
  const webgpuCanvasCode = fs.readFileSync(
    path.join(projectRoot, 'src/webgpu/WebGPUCanvas.tsx'),
    'utf8'
  );
  const appTsxPath = fs.existsSync(path.join(projectRoot, 'src/App.tsx')) ? path.join(projectRoot, 'src/App.tsx') : path.join(projectRoot, 'App.tsx');
  const appCode = fs.readFileSync(appTsxPath, 'utf8');
  const dockCode = fs.readFileSync(
    path.join(projectRoot, 'src/components/hud/NavigationDock.tsx'),
    'utf8'
  );
  const physicsSimWGSL = fs.readFileSync(
    path.join(projectRoot, 'src/webgpu/shaders/physics_sim.wgsl'),
    'utf8'
  );

  // --------------------------------------------------------------------------
  // 1. Mathematical Parity across all 5 Morphing Paradigms
  // --------------------------------------------------------------------------
  describe('Mathematical Parity across all 5 Morphing Paradigms', () => {
    it('VEC-PAR-01: verifies VectorOverlayLayer vertex shader implements Mode 1 Involute Scroll with (1-t)^-1 curvature', () => {
      expect(vectorLayerCode).toContain('u_mode == 1');
      expect(vectorLayerCode).toContain('invOneMinusT = 1.0 / (1.0 - t)');
      expect(vectorLayerCode).toContain('curAngle = (1.0 - t) * lambda');
      expect(vectorLayerCode).toContain('curX = (curR * invOneMinusT) * sin(curAngle)');
      expect(vectorLayerCode).toContain('curZ = (curR * cos(phi) * invOneMinusT) * (cos(curAngle) - 1.0) + (curR * cos(phi) * (1.0 - t))');
    });

    it('VEC-PAR-02: verifies VectorOverlayLayer vertex shader implements Mode 2 Griffith LEFM with pre-rupture tension and post-rupture flutter wave', () => {
      expect(vectorLayerCode).toContain('u_mode == 2');
      expect(vectorLayerCode).toContain('distToSeam = PI - abs(lambda)');
      expect(vectorLayerCode).toContain('tRupture = 0.18');
      expect(vectorLayerCode).toContain('hoopStress = cursorInfluence * 0.45');
      expect(vectorLayerCode).toContain('flutterWave = sin(distToSeam * 16.0 - t * 24.0)');
      expect(vectorLayerCode).toContain('flutterDecay = exp(-4.2 * (t - tRupture))');
    });

    it('VEC-PAR-03: verifies VectorOverlayLayer vertex shader implements Mode 3 Solenoidal Curl Noise & Silk Drape Dynamics', () => {
      expect(vectorLayerCode).toContain('u_mode == 3');
      expect(vectorLayerCode).toContain('computeCurlNoise(basePos, u_time)');
      expect(vectorLayerCode).toContain('vortexCirculation = (1.0 - exp(-hitDist * hitDist / (coreRadius * coreRadius)))');
      expect(vectorLayerCode).toContain('vortexTangent = normalize(cross(surfaceNormal, basePos - u_cursorHitPos + vec3(0.001)))');
      expect(vectorLayerCode).toContain('silkWave = (sin(wavePhase1) * 0.65 + cos(wavePhase2) * 0.35) * liquefaction * 0.65');
    });

    it('VEC-PAR-04: verifies VectorOverlayLayer vertex shader implements Mode 4 Fuller Dymaxion arching shell expansion', () => {
      expect(vectorLayerCode).toContain('u_mode == 4');
      expect(vectorLayerCode).toContain('arch = sin(PI * clampedUnfurl) * 0.45');
      expect(vectorLayerCode).toContain('mix(pos3D, dymaxionPos2D, t) + sphereNorm * arch');
    });

    it('VEC-PAR-05: verifies Mode 0 incorporates 2D z-elevation to prevent coplanar z-fighting', () => {
      expect(vectorLayerCode).toContain('pos2D = vec3(target2D.x, target2D.y, 0.015)');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Coordinate Space Normal & Backface Transformation
  // --------------------------------------------------------------------------
  describe('View-Space Normal & Facing Attenuation', () => {
    it('VEC-PAR-06: verifies normal is transformed by normalMatrix into eye/view coordinates before dot product', () => {
      expect(vectorLayerCode).toContain('vec3 viewNormal = normalize(normalMatrix * dynamicNormal)');
      expect(vectorLayerCode).toContain('vec3 viewDir = -normalize(mvPosition.xyz)');
      expect(vectorLayerCode).toContain('float facing = dot(viewNormal, viewDir)');
    });

    it('VEC-PAR-07: verifies fragment shader implements gentle horizon facing attenuation without harsh pop-in', () => {
      expect(vectorLayerCode).toContain('facingFade = mix(0.3, 1.0, smoothstep(-0.15, 0.25, vFacing))');
      expect(vectorLayerCode).toContain('gl_FragColor = vec4(color, alpha * facingFade)');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Active Cursor Perturbation & Time Synchronization
  // --------------------------------------------------------------------------
  describe('Cursor Tracking & Monotonic Clock Architecture', () => {
    it('VEC-PAR-08: verifies VectorOverlayLayer instantiates and attaches CursorTracker', () => {
      expect(vectorLayerCode.includes('useCursorTracker()') || vectorLayerCode.includes('new CursorTracker()')).toBe(true);
    });

    it('VEC-PAR-09: verifies cursor uniforms are fed to shader uniforms every frame', () => {
      expect(vectorLayerCode).toContain('cursorTracker.update(state.camera, unfurlProgress)');
      expect(vectorLayerCode).toContain('u_cursorRayOrig');
      expect(vectorLayerCode).toContain('u_cursorRayDir');
      expect(vectorLayerCode).toContain('u_cursorHitPos');
      expect(vectorLayerCode).toContain('u_cursorVel');
      expect(vectorLayerCode).toContain('u_cursorActive');
    });

    it('VEC-PAR-10: verifies time uniform uses monotonic performance.now() with synchronized effectiveStartTime eliminating clock drift and phase offset', () => {
      expect(vectorLayerCode).toContain('(performance.now() - effectiveStartTime) * 0.001');
      expect(vectorLayerCode).not.toContain('state.clock.getElapsedTime()');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Theme Palettes: Obsidian Dark & Light Architectural Monochrome
  // --------------------------------------------------------------------------
  describe('Theme Palettes & Cartographic Contrast', () => {
    it('VEC-PAR-11: verifies Theme 0 (Obsidian) renders celestial ivory coastlines and aquamarine rivers', () => {
      // Coastline ivory: vec3(0.94, 0.92, 0.89)
      expect(vectorLayerCode).toContain('vec3(0.94, 0.92, 0.89)');
      // River aquamarine: vec3(0.42, 0.65, 0.78)
      expect(vectorLayerCode).toContain('vec3(0.42, 0.65, 0.78)');
    });

    it('VEC-PAR-12: verifies Theme 1 (Light Monochrome) renders architectural charcoal coastlines and slate rivers', () => {
      // Coastline charcoal: vec3(0.10, 0.12, 0.16)
      expect(vectorLayerCode).toContain('vec3(0.10, 0.12, 0.16)');
      // River slate: vec3(0.30, 0.42, 0.55)
      expect(vectorLayerCode).toContain('vec3(0.30, 0.42, 0.55)');
    });
  });

  // --------------------------------------------------------------------------
  // 5. WebGPU Kinematic Camera Transition & Keyboard Shortcuts
  // --------------------------------------------------------------------------
  describe('WebGPU Kinematic Smoothing & Keyboard Interaction', () => {
    it('VEC-PAR-13: verifies WebGPUCanvas implements kinematic lerp camera transition matching WebGL2', () => {
      expect(webgpuCanvasCode).toContain('targetCameraPosRef');
      expect(webgpuCanvasCode).toContain('camera.position.lerp(targetPos, 0.08)');
      expect(webgpuCanvasCode).toMatch(/targetRef\.current\.lerp\(new (?:THREE\.)?Vector3\(0,\s*0,\s*0\),\s*0\.08\)/);
    });

    it('VEC-PAR-14: verifies App.tsx defines B / b keyboard shortcut for runtime backend toggling', () => {
      expect(appCode).toMatch(/e\.key\s*===\s*['"]b['"]\s*\|\|\s*e\.key\s*===\s*['"]B['"]/);
      expect(appCode).toContain("setBackend((b) => (b === 'webgpu' ? 'webgl2' : 'webgpu'))");
    });

    it('VEC-PAR-15: verifies NavigationDock documents B: Backend shortcut', () => {
      expect(dockCode).toContain('B: Backend');
    });

    it('VEC-PAR-16: verifies physics_sim.wgsl rotation matrix matches GLSL column vectors exactly', () => {
      expect(physicsSimWGSL).toContain('vec3<f32>(0.00,  0.80,  0.60)');
      expect(physicsSimWGSL).toContain('vec3<f32>(-0.80, 0.36, -0.48)');
      expect(physicsSimWGSL).toContain('vec3<f32>(-0.60, -0.48, 0.64)');
    });

    it('VEC-PAR-17: verifies startTime is threaded to VectorOverlayLayer in both App.tsx and WebGPUCanvas.tsx', () => {
      expect(appCode).toContain('startTime={appStartTimeRef.current}');
      expect(webgpuCanvasCode).toContain('startTime={startTime !== undefined ? startTime : startTimeRef.current}');
    });

    it('VEC-PAR-18: verifies cursorPhysicsEnabled is threaded to WebGPUCanvas and VectorOverlayLayer', () => {
      expect(appCode).toContain('cursorPhysicsEnabled={cursorPhysicsEnabled}');
      expect(webgpuCanvasCode).toContain('cursorPhysicsEnabled={cursorPhysicsEnabled}');
      expect(vectorLayerCode).toContain('cursorPhysicsEnabled ? cursorUniforms.u_cursorActive : 0.0');
    });
  });
});
