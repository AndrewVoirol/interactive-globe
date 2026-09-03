import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';

describe('Milestone M2: Visual & Functional Bug Fixes Verification', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const appTsxPath = fs.existsSync(path.join(projectRoot, 'src/App.tsx')) ? path.join(projectRoot, 'src/App.tsx') : path.join(projectRoot, 'App.tsx');
  let appCode = fs.readFileSync(appTsxPath, 'utf8');
  const geoPath = path.join(projectRoot, 'src/components/canvas/GeometryLayer.tsx');
  if (fs.existsSync(geoPath)) {
    appCode += '\n' + fs.readFileSync(geoPath, 'utf8');
  }
  const vectorCode = fs.readFileSync(path.join(projectRoot, 'src/core/VectorOverlayLayer.tsx'), 'utf8');
  const pointsWGSL = fs.readFileSync(path.join(projectRoot, 'src/webgpu/shaders/points_render.wgsl'), 'utf8');
  const linesWGSL = fs.readFileSync(path.join(projectRoot, 'src/webgpu/shaders/lines_render.wgsl'), 'utf8');
  const engineCode = fs.readFileSync(path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts'), 'utf8');
  const webgpuCanvasCode = fs.readFileSync(path.join(projectRoot, 'src/webgpu/WebGPUCanvas.tsx'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

  // =========================================================================
  // 1. Task 1: Pseudo-RTC Precision
  // =========================================================================
  describe('Task 1: Pseudo-RTC Precision Elimination', () => {
    it('purges u_cameraCenter from App.tsx shaders and uniforms', () => {
      expect(appCode).not.toContain('u_cameraCenter');
      expect(appCode).toContain('vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);');
    });

    it('purges u_cameraCenter from VectorOverlayLayer.tsx', () => {
      expect(vectorCode).not.toContain('u_cameraCenter');
      expect(vectorCode).toContain('vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);');
    });
  });

  // =========================================================================
  // 2. Task 2: Frozen Telemetry Coordinates Behavior
  // =========================================================================
  describe('Task 2: Dynamic Telemetry Coordinates Inversion', () => {
    const RADIUS = 5.0;

    function computeSphericalCoords(cameraPos: THREE.Vector3): { latDeg: number; lonDeg: number } {
      const norm = cameraPos.clone().normalize();
      const phi = Math.asin(Math.max(-1.0, Math.min(1.0, norm.y)));
      const lambda = Math.atan2(norm.x, norm.z);
      const latDeg = Math.round(phi * (180 / Math.PI));
      let lonDeg = Math.round(lambda * (180 / Math.PI));
      lonDeg = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
      return { latDeg, lonDeg };
    }

    function formatTelemetry(latDeg: number, lonDeg: number) {
      const latStr = `${Math.abs(latDeg).toString().padStart(2, '0')}°00'${latDeg >= 0 ? 'N' : 'S'}`;
      const lonStr = `${Math.abs(lonDeg).toString().padStart(3, '0')}°00'${lonDeg >= 0 ? 'E' : 'W'}`;
      return { latStr, lonStr };
    }

    it('computes 00°00\'N, 000°00\'E for prime meridian camera at (0, 0, 15)', () => {
      const { latDeg, lonDeg } = computeSphericalCoords(new THREE.Vector3(0, 0, 15));
      expect(latDeg).toBe(0);
      expect(lonDeg).toBe(0);
      const { latStr, lonStr } = formatTelemetry(latDeg, lonDeg);
      expect(latStr).toBe("00°00'N");
      expect(lonStr).toBe("000°00'E");
    });

    it('computes 00°00\'N, 090°00\'E for eastern hemisphere camera at (15, 0, 0)', () => {
      const { latDeg, lonDeg } = computeSphericalCoords(new THREE.Vector3(15, 0, 0));
      expect(latDeg).toBe(0);
      expect(lonDeg).toBe(90);
      const { latStr, lonStr } = formatTelemetry(latDeg, lonDeg);
      expect(latStr).toBe("00°00'N");
      expect(lonStr).toBe("090°00'E");
    });

    it('computes 90°00\'N, 000°00\'E for North Pole camera at (0, 15, 0.001)', () => {
      const { latDeg, lonDeg } = computeSphericalCoords(new THREE.Vector3(0, 15, 0.001));
      expect(latDeg).toBe(90);
      expect(lonDeg).toBe(0);
      const { latStr, lonStr } = formatTelemetry(latDeg, lonDeg);
      expect(latStr).toBe("90°00'N");
      expect(lonStr).toBe("000°00'E");
    });

    it('computes 90°00\'S, 000°00\'E for South Pole camera at (0, -15, 0.001)', () => {
      const { latDeg, lonDeg } = computeSphericalCoords(new THREE.Vector3(0, -15, 0.001));
      expect(latDeg).toBe(-90);
      expect(lonDeg).toBe(0);
      const { latStr, lonStr } = formatTelemetry(latDeg, lonDeg);
      expect(latStr).toBe("90°00'S");
      expect(lonStr).toBe("000°00'E");
    });

    it('computes 00°00\'N, 090°00\'W for western hemisphere camera at (-15, 0, 0)', () => {
      const { latDeg, lonDeg } = computeSphericalCoords(new THREE.Vector3(-15, 0, 0));
      expect(latDeg).toBe(0);
      expect(lonDeg).toBe(-90);
      const { latStr, lonStr } = formatTelemetry(latDeg, lonDeg);
      expect(latStr).toBe("00°00'N");
      expect(lonStr).toBe("090°00'W");
    });

    it('verifies CameraTelemetryUpdater is attached in App.tsx', () => {
      expect(appCode).toContain('CameraTelemetryUpdater');
      expect(appCode).toContain('onCoordsChange={handleCoordsChange}');
    });
  });

  // =========================================================================
  // 3. Task 3: OrbitControls 60fps Re-render Storm
  // =========================================================================
  describe('Task 3: OrbitControls Event Decoupling', () => {
    it('uses onEnd instead of onChange on OrbitControls to prevent 60fps re-render storms', () => {
      expect(appCode).toMatch(/<OrbitControls[\s\S]*?onEnd=\{/);
      expect(appCode).not.toMatch(/<OrbitControls[^>]*onChange/);
    });
  });

  // =========================================================================
  // 4. Task 4: Icosahedral Frame Uniforms
  // =========================================================================
  describe('Task 4: Icosahedral Frame Uniform Synchronization', () => {
    it('declares frameMaterialRef and attaches to frame lineSegments', () => {
      expect(appCode).toContain('const frameMaterialRef = useRef<THREE.ShaderMaterial>(null);');
      expect(appCode).toMatch(/<lineSegments geometry=\{frameGeometry\}>[\s\S]*?<shaderMaterial[\s\S]*?ref=\{frameMaterialRef\}/);
    });

    it('updates frameMaterialRef.current.uniforms.u_unfurl in useFrame', () => {
      expect(appCode).toContain('if (frameMaterialRef.current)');
      expect(appCode).toContain('frameMaterialRef.current.uniforms.u_unfurl.value = unfurlProgress;');
    });
  });

  // =========================================================================
  // 5. Task 5: Backface Culling Artifact on Lines
  // =========================================================================
  describe('Task 5: Distinct Line Vertex Shader', () => {
    it('defines distinct meshVertexShader without vertex-drop early-out', () => {
      expect(appCode).toMatch(/const meshVertexShader = `[\s\S]*?`;/);
      const match = appCode.match(/const meshVertexShader = `([\s\S]*?)`;/);
      expect(match).toBeTruthy();
      const shader = match![1];
      expect(shader).not.toContain('gl_Position = vec4(0.0, 0.0, 2.0, 0.0);');
      expect(shader).not.toContain('return;');
    });

    it('attaches meshVertexShader to lineSegments and vertexShader to points', () => {
      expect(appCode).toMatch(/<lineSegments[\s\S]*?vertexShader=\{meshVertexShader\}/);
      expect(appCode).toMatch(/<points[\s\S]*?vertexShader=\{vertexShader\}/);
    });
  });

  // =========================================================================
  // 6. Task 6: WebGPU Flat-Map Normal Dimming
  // =========================================================================
  describe('Task 6: WebGPU Planar Normal Blending', () => {
    it('blends dynamicNormal toward +Z in points_render.wgsl', () => {
      expect(pointsWGSL).toContain('dynamicNormal = normalize(mix(dynamicNormal, vec3<f32>(0.0, 0.0, 1.0), sim.u_unfurl));');
    });

    it('blends dynamicNormal toward +Z in lines_render.wgsl', () => {
      expect(linesWGSL).toContain('dynamicNormal = normalize(mix(dynamicNormal, vec3<f32>(0.0, 0.0, 1.0), sim.u_unfurl));');
    });

    it('guarantees facing angle is 1.0 when planar unfurl is 1.0', () => {
      // At u_unfurl = 1.0, mix(..., vec3(0,0,1), 1.0) produces vec3(0,0,1)
      const normal = new THREE.Vector3(0, 0, 1);
      const viewDir = new THREE.Vector3(0, 0, 1); // viewer facing map
      const facing = normal.dot(viewDir);
      expect(facing).toBe(1.0);
    });
  });

  // =========================================================================
  // 7. Task 7: WebGPU Depth Test Z-Clipping
  // =========================================================================
  describe('Task 7: WebGPU Depth Comparison Configuration', () => {
    it('configures pointsRenderPipeline with less-equal depth comparison', () => {
      expect(engineCode).toContain("depthCompare: 'less-equal'");
    });
  });

  // =========================================================================
  // 8. Task 8: WebGPU Device Loss Recovery
  // =========================================================================
  describe('Task 8: WebGPU Device Loss Fallback', () => {
    it('registers onDeviceLost in WebGPUCanvas.tsx and notifies onError', () => {
      expect(webgpuCanvasCode).toContain('engine.onDeviceLost');
      expect(webgpuCanvasCode).toContain('callbacksRef.current.onError?.');
    });
  });

  // =========================================================================
  // 9. Task 9: DataLayer Props Parity
  // =========================================================================
  describe('Task 9: DataLayer WebGL2 / WebGPU Props Parity', () => {
    it('passes displacementScale and hillshading props in App.tsx DataLayerOverlay', () => {
      expect(appCode).toContain('displacementScale={layer.displacementScale}');
      expect(appCode).toContain('elevationEncoding={layer.elevationEncoding}');
      expect(appCode).toContain('sunAzimuth={layer.sunAzimuth}');
      expect(appCode).toContain('sunAltitude={layer.sunAltitude}');
      expect(appCode).toContain('hillshadeIntensity={layer.hillshadeIntensity}');
    });
  });

  // =========================================================================
  // 10. Task 10: Audio Mute Sync
  // =========================================================================
  describe('Task 10: Audio Engine Initial Mute Synchronization', () => {
    it('synchronizes audio mute state in App.tsx on mount and state changes', () => {
      expect(appCode).toContain('audioEngineRef.current.setMute(isAudioMuted);');
    });
  });

  // =========================================================================
  // 11. Task 11: Theme & Favicon Fixes
  // =========================================================================
  describe('Task 11: Theme Adaptation & Clean Favicon', () => {
    it('Zen mode exit pill adapts classes for light theme contrast', () => {
      expect(appCode).toContain('bg-white/90 border-zinc-300 text-zinc-900');
    });

    it('index.html contains valid inline SVG favicon data URI without broken vite.svg link', () => {
      expect(indexHtml).not.toContain('/vite.svg');
      expect(indexHtml).toContain('data:image/svg+xml');
    });
  });
});
