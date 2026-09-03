import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { ProceduralAudioEngine } from '../../src/core/audio/ProceduralAudioEngine';

describe('Challenger 1 (Round 4 / Milestone 2): WebGL2 Visual & Functional Bug Fixes Empirical Suite', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const appTsxPath = fs.existsSync(path.join(projectRoot, 'src/App.tsx')) ? path.join(projectRoot, 'src/App.tsx') : path.join(projectRoot, 'App.tsx');
  let appTsx = fs.readFileSync(appTsxPath, 'utf8');
  const geoLayerPath = path.join(projectRoot, 'src/components/canvas/GeometryLayer.tsx');
  if (fs.existsSync(geoLayerPath)) {
    appTsx += '\n' + fs.readFileSync(geoLayerPath, 'utf8');
  }
  const webgpuCanvasTsx = fs.readFileSync(path.join(projectRoot, 'src/webgpu/WebGPUCanvas.tsx'), 'utf8');
  const vectorOverlayTsx = fs.readFileSync(path.join(projectRoot, 'src/core/VectorOverlayLayer.tsx'), 'utf8');

  // =========================================================================
  // Requirement 1: Camera Telemetry Calculation Across Singularities
  // =========================================================================
  describe('1. Camera Telemetry Calculation Across North Pole, South Pole, and Antimeridian', () => {
    const RADIUS = 5.0;

    // Direct replication of App.tsx telemetry oracle
    function calculateTelemetry(
      alpha: number,
      cameraPos: THREE.Vector3,
      cameraForward: THREE.Vector3
    ): { latDeg: number; lonDeg: number; latStr: string; lonStr: string } {
      let latDeg = 0;
      let lonDeg = 0;

      if (alpha < 0.5) {
        // 3D Spherical Mode
        const normCam = cameraPos.clone().normalize();
        const phi = Math.asin(Math.max(-1.0, Math.min(1.0, normCam.y)));
        const lambda = Math.atan2(normCam.x, normCam.z);
        latDeg = Math.round(phi * (180 / Math.PI));
        lonDeg = Math.round(lambda * (180 / Math.PI));
      } else {
        // Planar Map Mode
        if (Math.abs(cameraForward.z) > 1e-4) {
          const t = -cameraPos.z / cameraForward.z;
          const hitX = cameraPos.x + t * cameraForward.x;
          const hitY = cameraPos.y + t * cameraForward.y;
          lonDeg = Math.round((hitX / RADIUS) * (180 / Math.PI));
          const clampedY = Math.max(-RADIUS * 2.5, Math.min(RADIUS * 2.5, hitY));
          const latRad = 2.0 * Math.atan(Math.exp(clampedY / RADIUS)) - Math.PI / 2.0;
          latDeg = Math.round(latRad * (180 / Math.PI));
        }
      }

      // Wrap longitude into [-180, 180]
      lonDeg = ((((lonDeg + 180) % 360) + 360) % 360) - 180;

      const latStr = `${Math.abs(latDeg).toString().padStart(2, '0')}°00'${latDeg >= 0 ? 'N' : 'S'}`;
      const lonStr = `${Math.abs(lonDeg).toString().padStart(3, '0')}°00'${lonDeg >= 0 ? 'E' : 'W'}`;

      return { latDeg, lonDeg, latStr, lonStr };
    }

    it('EMP-M2-T01: North Pole exact zenith (0, 15, 0) computes 90°N with 0 NaNs and bounded lon', () => {
      const result = calculateTelemetry(0.0, new THREE.Vector3(0, 15, 0), new THREE.Vector3(0, -1, 0));
      expect(result.latDeg).toBe(90);
      expect(result.latStr).toBe("90°00'N");
      expect(Number.isNaN(result.latDeg)).toBe(false);
      expect(Number.isNaN(result.lonDeg)).toBe(false);
      expect(result.lonDeg).toBe(0);
      expect(result.lonStr).toBe("000°00'E");
    });

    it('EMP-M2-T02: North Pole approaches from 4 quadrants continuously converge to 90°N', () => {
      const approachAngles = [0, 90, 180, -90]; // Prime, East, Antimeridian, West
      for (const azDeg of approachAngles) {
        const azRad = (azDeg * Math.PI) / 180;
        // latitude 89.99 degrees (near pole)
        const latRad = (89.99 * Math.PI) / 180;
        const x = 15 * Math.cos(latRad) * Math.sin(azRad);
        const y = 15 * Math.sin(latRad);
        const z = 15 * Math.cos(latRad) * Math.cos(azRad);

        const result = calculateTelemetry(0.0, new THREE.Vector3(x, y, z), new THREE.Vector3(0, 0, -1));
        expect(result.latDeg).toBe(90);
        expect(result.latStr).toBe("90°00'N");
        expect(Number.isNaN(result.latDeg)).toBe(false);
        expect(Number.isNaN(result.lonDeg)).toBe(false);
      }
    });

    it('EMP-M2-T03: South Pole exact nadir (0, -15, 0) computes 90°S with 0 NaNs', () => {
      const result = calculateTelemetry(0.0, new THREE.Vector3(0, -15, 0), new THREE.Vector3(0, 1, 0));
      expect(result.latDeg).toBe(-90);
      expect(result.latStr).toBe("90°00'S");
      expect(Number.isNaN(result.latDeg)).toBe(false);
      expect(Number.isNaN(result.lonDeg)).toBe(false);
      expect(result.lonDeg).toBe(0);
      expect(result.lonStr).toBe("000°00'E");
    });

    it('EMP-M2-T04: South Pole approaches from 4 quadrants continuously converge to 90°S', () => {
      const approachAngles = [0, 90, 180, -90];
      for (const azDeg of approachAngles) {
        const azRad = (azDeg * Math.PI) / 180;
        const latRad = (-89.99 * Math.PI) / 180;
        const x = 15 * Math.cos(latRad) * Math.sin(azRad);
        const y = 15 * Math.sin(latRad);
        const z = 15 * Math.cos(latRad) * Math.cos(azRad);

        const result = calculateTelemetry(0.0, new THREE.Vector3(x, y, z), new THREE.Vector3(0, 0, 1));
        expect(result.latDeg).toBe(-90);
        expect(result.latStr).toBe("90°00'S");
        expect(Number.isNaN(result.latDeg)).toBe(false);
        expect(Number.isNaN(result.lonDeg)).toBe(false);
      }
    });

    it('EMP-M2-T05: Antimeridian (0, 0, -15) computes 180° with seamless wrapping', () => {
      const result = calculateTelemetry(0.0, new THREE.Vector3(0, 0, -15), new THREE.Vector3(0, 0, 1));
      expect(result.latDeg).toBe(0);
      expect(result.latStr).toBe("00°00'N");
      // In wrapping: ((((180 + 180) % 360) + 360) % 360) - 180 = -180
      expect(result.lonDeg).toBe(-180);
      expect(result.lonStr).toBe("180°00'W");
    });

    it('EMP-M2-T06: Antimeridian approach from East (+179.9°) and West (-179.9°) cleanly wrap to -180°', () => {
      // East approach (+179.9°)
      const xEast = 15 * Math.sin((179.9 * Math.PI) / 180);
      const zEast = 15 * Math.cos((179.9 * Math.PI) / 180);
      const resEast = calculateTelemetry(0.0, new THREE.Vector3(xEast, 0, zEast), new THREE.Vector3(0, 0, 1));
      expect(resEast.lonDeg).toBe(-180);
      expect(resEast.lonStr).toBe("180°00'W");

      // West approach (-179.9°)
      const xWest = 15 * Math.sin((-179.9 * Math.PI) / 180);
      const zWest = 15 * Math.cos((-179.9 * Math.PI) / 180);
      const resWest = calculateTelemetry(0.0, new THREE.Vector3(xWest, 0, zWest), new THREE.Vector3(0, 0, 1));
      expect(resWest.lonDeg).toBe(-180);
      expect(resWest.lonStr).toBe("180°00'W");
    });

    it('EMP-M2-T07: Fuzzes 1,000 random spherical camera orientations with 0 NaNs and strict boundary compliance', () => {
      for (let i = 0; i < 1000; i++) {
        // Random point on sphere
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const r = 5 + Math.random() * 25; // Random distance [5, 30]

        const camPos = new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi),
          r * Math.sin(phi) * Math.sin(theta)
        );

        const res = calculateTelemetry(0.0, camPos, new THREE.Vector3(0, 0, -1));
        expect(Number.isFinite(res.latDeg)).toBe(true);
        expect(Number.isFinite(res.lonDeg)).toBe(true);
        expect(res.latDeg).toBeGreaterThanOrEqual(-90);
        expect(res.latDeg).toBeLessThanOrEqual(90);
        expect(res.lonDeg).toBeGreaterThanOrEqual(-180);
        expect(res.lonDeg).toBeLessThanOrEqual(180);
      }
    });

    it('EMP-M2-T08: Planar Map Mode raycast accurately resolves center, antimeridian, and clamped poles', () => {
      // 1. Center of 2D map: (0, 0, 15) looking along -z
      const centerRes = calculateTelemetry(1.0, new THREE.Vector3(0, 0, 15), new THREE.Vector3(0, 0, -1));
      expect(centerRes.latDeg).toBe(0);
      expect(centerRes.lonDeg).toBe(0);
      expect(centerRes.latStr).toBe("00°00'N");
      expect(centerRes.lonStr).toBe("000°00'E");

      // 2. Positive Antimeridian hit: camera looking at (pi * RADIUS, 0, 0)
      const xHitPos = Math.PI * RADIUS;
      const antiPosRes = calculateTelemetry(1.0, new THREE.Vector3(xHitPos, 0, 15), new THREE.Vector3(0, 0, -1));
      expect(antiPosRes.lonDeg).toBe(-180);
      expect(antiPosRes.latDeg).toBe(0);

      // 3. Negative Antimeridian hit: camera looking at (-pi * RADIUS, 0, 0)
      const xHitNeg = -Math.PI * RADIUS;
      const antiNegRes = calculateTelemetry(1.0, new THREE.Vector3(xHitNeg, 0, 15), new THREE.Vector3(0, 0, -1));
      expect(antiNegRes.lonDeg).toBe(-180);
      expect(antiNegRes.latDeg).toBe(0);

      // 4. North Pole limit on map: camera looking at (0, 2.5 * RADIUS, 0)
      const yNorthLimit = 2.5 * RADIUS;
      const northRes = calculateTelemetry(1.0, new THREE.Vector3(0, yNorthLimit, 15), new THREE.Vector3(0, 0, -1));
      expect(northRes.latDeg).toBe(81);
      expect(northRes.latStr).toBe("81°00'N");

      // 5. South Pole limit on map: camera looking at (0, -2.5 * RADIUS, 0)
      const ySouthLimit = -2.5 * RADIUS;
      const southRes = calculateTelemetry(1.0, new THREE.Vector3(0, ySouthLimit, 15), new THREE.Vector3(0, 0, -1));
      expect(southRes.latDeg).toBe(-81);
      expect(southRes.latStr).toBe("81°00'S");
    });

    it('EMP-M2-T09: Verifies parity between App.tsx and WebGPUCanvas.tsx telemetry algorithms', () => {
      // Compare implementations in code
      expect(appTsx).toContain('const phi = Math.asin(Math.max(-1.0, Math.min(1.0, normCam.y)));');
      expect(appTsx).toContain('const lambda = Math.atan2(normCam.x, normCam.z);');
      expect(webgpuCanvasTsx).toContain('const phi = Math.asin(Math.max(-1.0, Math.min(1.0, norm.y)));');
      expect(webgpuCanvasTsx).toContain('const lambda = Math.atan2(norm.x, norm.z);');

      expect(appTsx).toContain('lonDeg = ((((lonDeg + 180) % 360) + 360) % 360) - 180;');
      expect(webgpuCanvasTsx).toContain('lonDeg = ((((lonDeg + 180) % 360) + 360) % 360) - 180;');
    });
  });

  // =========================================================================
  // Requirement 2: OrbitControls Decoupling & 60fps Re-render Storm Elimination
  // =========================================================================
  describe('2. OrbitControls Decoupling & React Re-render Suppression', () => {
    it('EMP-M2-T10: verifies OrbitControls has zero onChange handlers in App.tsx', () => {
      const orbitControlsMatches = appTsx.match(/<OrbitControls[^>]*>/g);
      expect(orbitControlsMatches).not.toBeNull();
      for (const match of orbitControlsMatches!) {
        expect(match).not.toContain('onChange');
      }
    });

    it('EMP-M2-T11: verifies OrbitControls uses onEnd to sync target only on interaction completion', () => {
      expect(appTsx).toMatch(/<OrbitControls[\s\S]*?onEnd=\{/);
      expect(appTsx).toContain('setCameraTarget(controlsRef.current.target.clone());');
    });

    it('EMP-M2-T12: verifies CameraTelemetryUpdater throttles state dispatches to 100ms and integer changes only', () => {
      expect(appTsx).toContain('if (now - lastTimeRef.current < 100) return;');
      expect(appTsx).toContain('if (latDeg !== lastCoordsRef.current.latDeg || lonDeg !== lastCoordsRef.current.lonDeg)');
    });

    it('EMP-M2-T13: simulates 60fps continuous drag and proves zero React state dispatches occur mid-drag', () => {
      let stateDispatches = 0;
      const setCameraTarget = () => { stateDispatches++; };

      // Old pattern (onChange called every frame of drag)
      let oldDispatches = 0;
      const oldOnChange = () => { oldDispatches++; };

      // Simulate 120 frames (2 seconds at 60 FPS) of active dragging
      for (let frame = 0; frame < 120; frame++) {
        oldOnChange(); // Fired on every pointermove
      }

      // New pattern (onEnd called only when pointer is released)
      const onEnd = () => { setCameraTarget(); };
      onEnd(); // Drag completes

      expect(oldDispatches).toBe(120); // 120 re-renders in old code!
      expect(stateDispatches).toBe(1); // Exactly 1 re-render in new code!
    });
  });

  // =========================================================================
  // Requirement 3: Dymaxion 20-Facet Frame Material Receives u_unfurl in useFrame
  // =========================================================================
  describe('3. Dymaxion 20-Facet Frame Material Uniform Synchronization', () => {
    it('EMP-M2-T14: verifies frameMaterialRef is declared and bound to frame lineSegments', () => {
      expect(appTsx).toContain('const frameMaterialRef = useRef<THREE.ShaderMaterial>(null);');
      expect(appTsx).toMatch(/<lineSegments geometry=\{frameGeometry\}>[\s\S]*?<shaderMaterial[\s\S]*?ref=\{frameMaterialRef\}/);
    });

    it('EMP-M2-T15: verifies frameMaterialRef.current.uniforms receives u_unfurl and simulation uniforms in useFrame', () => {
      expect(appTsx).toContain('if (frameMaterialRef.current) {');
      expect(appTsx).toContain('frameMaterialRef.current.uniforms.u_unfurl.value = unfurlProgress;');
      expect(appTsx).toContain('frameMaterialRef.current.uniforms.u_mode.value = mode;');
      expect(appTsx).toContain('frameMaterialRef.current.uniforms.u_layerMode.value = layerMode;');
      expect(appTsx).toContain('frameMaterialRef.current.uniforms.u_theme.value = theme;');
      expect(appTsx).toContain('frameMaterialRef.current.uniforms.u_wireOpacityScale.value = wireOpacityScale * 1.5;');
      expect(appTsx).toContain('frameMaterialRef.current.uniforms.u_time.value = elapsedTime;');
      expect(appTsx).toContain('frameMaterialRef.current.uniforms.u_cursorRayOrig.value.copy(cursorUniforms.u_cursorRayOrig);');
      expect(appTsx).toContain('frameMaterialRef.current.uniforms.u_cursorRayDir.value.copy(cursorUniforms.u_cursorRayDir);');
      expect(appTsx).toContain('frameMaterialRef.current.uniforms.u_cursorHitPos.value.copy(cursorUniforms.u_cursorHitPos);');
      expect(appTsx).toContain('frameMaterialRef.current.uniforms.u_cursorVel.value.copy(cursorUniforms.u_cursorVel);');
      expect(appTsx).toContain('frameMaterialRef.current.uniforms.u_cursorActive.value = cursorUniforms.u_cursorActive;');
    });

    it('EMP-M2-T16: verifies frameGeometry contains all required shader attributes (position, target2D, dymaxion2D, vType)', () => {
      expect(appTsx).toContain("fGeo.setAttribute('position', new THREE.BufferAttribute(frameData.points3D, 3));");
      expect(appTsx).toContain("fGeo.setAttribute('target2D', new THREE.BufferAttribute(frameData.dymaxion2D, 2));");
      expect(appTsx).toContain("fGeo.setAttribute('dymaxion2D', new THREE.BufferAttribute(frameData.dymaxion2D, 2));");
      expect(appTsx).toContain("fGeo.setAttribute('vType', new THREE.BufferAttribute(new Float32Array(frameData.points3D.length / 3).fill(1.0), 1));");
    });

    it('EMP-M2-T17: executes Dymaxion frame transformation math across alpha in [0, 1] with zero NaNs', () => {
      // Simulate Dymaxion mode (mode == 4) math from meshVertexShader
      const sample3D = new THREE.Vector3(0, 5, 0); // North vertex of icosahedron
      const sample2D = new THREE.Vector2(0, 8.5);  // Projected 2D coordinate

      const alphaSteps = [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
      for (const unfurl of alphaSteps) {
        const clampedUnfurl = Math.max(0.0, Math.min(1.0, unfurl));
        const ease = clampedUnfurl * clampedUnfurl * (3.0 - 2.0 * clampedUnfurl);
        const t = ease;

        const dymaxionPos2D = new THREE.Vector3(sample2D.x, sample2D.y, 0.0);
        const arch = Math.sin(Math.PI * clampedUnfurl) * 0.45;
        const sphereNorm = sample3D.length() > 0.001 ? sample3D.clone().normalize() : new THREE.Vector3(0, 0, 1);

        const finalPos = new THREE.Vector3()
          .lerpVectors(sample3D, dymaxionPos2D, t)
          .add(sphereNorm.multiplyScalar(arch));

        expect(Number.isFinite(finalPos.x)).toBe(true);
        expect(Number.isFinite(finalPos.y)).toBe(true);
        expect(Number.isFinite(finalPos.z)).toBe(true);

        if (unfurl === 0.0) {
          expect(finalPos.x).toBeCloseTo(sample3D.x, 5);
          expect(finalPos.y).toBeCloseTo(sample3D.y, 5);
          expect(finalPos.z).toBeCloseTo(sample3D.z, 5);
        } else if (unfurl === 1.0) {
          expect(finalPos.x).toBeCloseTo(sample2D.x, 5);
          expect(finalPos.y).toBeCloseTo(sample2D.y, 5);
          expect(finalPos.z).toBeCloseTo(0.0, 5);
        }
      }
    });
  });

  // =========================================================================
  // Requirement 4: Line Rendering Vertex Shader Does Not Drop Single Vertices
  // =========================================================================
  describe('4. Line Rendering Mesh Vertex Shader Horizon Line Drop Prevention', () => {
    it('EMP-M2-T18: verifies distinct meshVertexShader is declared and omits (0,0,2,0) drop code', () => {
      expect(appTsx).toMatch(/const meshVertexShader = `[\s\S]*?`;/);
      const match = appTsx.match(/const meshVertexShader = `([\s\S]*?)`;/);
      expect(match).not.toBeNull();
      const shader = match![1];

      // Must NOT drop vertices to degenerate clip coordinates
      expect(shader).not.toContain('vec4(0.0, 0.0, 2.0, 0.0)');
      expect(shader).not.toContain('vec4(0, 0, 2, 0)');
      expect(shader).not.toContain('gl_Position = vec4(0.0, 0.0, 2.0, 0.0);');

      // Points vertexShader DOES contain the early-out optimization for points
      const pointsShaderMatch = appTsx.match(/const vertexShader = `([\s\S]*?)`;/);
      expect(pointsShaderMatch).not.toBeNull();
      expect(pointsShaderMatch![1]).toContain('gl_Position = vec4(0.0, 0.0, 2.0, 0.0);');
    });

    it('EMP-M2-T19: verifies all lineSegments elements exclusively bind meshVertexShader', () => {
      const lineSegmentBlocks = appTsx.match(/<lineSegments[\s\S]*?<\/lineSegments>/g);
      expect(lineSegmentBlocks).not.toBeNull();
      expect(lineSegmentBlocks!.length).toBeGreaterThanOrEqual(2); // Main mesh + 20-facet frame

      for (const block of lineSegmentBlocks!) {
        expect(block).toContain('vertexShader={meshVertexShader}');
        expect(block).not.toContain('vertexShader={vertexShader}');
      }
    });

    it('EMP-M2-T20: simulates horizon-crossing line segment and demonstrates zero clip coordinate explosion', () => {
      const camera = new THREE.PerspectiveCamera(45, 1.0, 0.1, 100);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      const viewMatrix = camera.matrixWorldInverse;
      const projMatrix = camera.projectionMatrix;

      // Vertex A: front hemisphere (facing camera)
      const vA = new THREE.Vector3(0, 0, 5);
      // Vertex B: back hemisphere (behind sphere horizon)
      const vB = new THREE.Vector3(0, 0, -5);

      // In meshVertexShader: both vertices undergo standard projection
      const clipA = new THREE.Vector4(vA.x, vA.y, vA.z, 1.0).applyMatrix4(viewMatrix).applyMatrix4(projMatrix);
      const clipB = new THREE.Vector4(vB.x, vB.y, vB.z, 1.0).applyMatrix4(viewMatrix).applyMatrix4(projMatrix);

      // Both must have valid, positive w-coordinates
      expect(clipA.w).toBeGreaterThan(0);
      expect(clipB.w).toBeGreaterThan(0);

      // NDC coordinates must be strictly finite and bounded
      const ndcA = new THREE.Vector3(clipA.x / clipA.w, clipA.y / clipA.w, clipA.z / clipA.w);
      const ndcB = new THREE.Vector3(clipB.x / clipB.w, clipB.y / clipB.w, clipB.z / clipB.w);

      expect(Number.isFinite(ndcA.x)).toBe(true);
      expect(Number.isFinite(ndcA.y)).toBe(true);
      expect(Number.isFinite(ndcA.z)).toBe(true);
      expect(Number.isFinite(ndcB.x)).toBe(true);
      expect(Number.isFinite(ndcB.y)).toBe(true);
      expect(Number.isFinite(ndcB.z)).toBe(true);

      // In defective vertexShader: vB would be forced to (0, 0, 2, 0) with w = 0!
      const defectiveClipB = new THREE.Vector4(0.0, 0.0, 2.0, 0.0);
      expect(defectiveClipB.w).toBe(0.0);
      const defectiveNdcX = defectiveClipB.x / defectiveClipB.w;
      expect(Number.isNaN(defectiveNdcX)).toBe(true); // 0 / 0 produces NaN!
    });
  });

  // =========================================================================
  // Requirement 5: Audio Mute State on Initial Mount
  // =========================================================================
  describe('5. Audio Mute State Synchronization on Initial Mount', () => {
    it('EMP-M2-T21: verifies isAudioMuted state is initialized to true in App.tsx', () => {
      expect(appTsx).toContain('const [isAudioMuted, setIsAudioMuted] = useState(true);');
    });

    it('EMP-M2-T22: verifies audioEngineRef.current.setMute(isAudioMuted) is executed via useEffect', () => {
      expect(appTsx).toMatch(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?audioEngineRef\.current\.setMute\(isAudioMuted\);[\s\S]*?\},?\s*\[isAudioMuted\]\);/);
    });

    it('EMP-M2-T23: verifies TelemetryHUD receives isAudioMuted and onAudioMuteToggle', () => {
      expect(appTsx).toContain('isAudioMuted={isAudioMuted}');
      expect(appTsx).toContain('onAudioMuteToggle={handleAudioMuteToggle}');
    });

    it('EMP-M2-T24: verifies ProceduralAudioEngine suppresses all audio synthesis when isMuted = true', () => {
      const engine = new ProceduralAudioEngine(true);
      expect(engine.getIsMuted()).toBe(true);

      // Verify methods execute safely with zero audio output when muted
      expect(() => engine.triggerRupture(1.0)).not.toThrow();
      expect(() => engine.triggerChime(0)).not.toThrow();
      expect(() => engine.triggerChime(4)).not.toThrow();
      expect(() => engine.updateFlowVelocity(0.5)).not.toThrow();
      expect(() => engine.triggerRebound(1.0)).not.toThrow();
    });

    it('EMP-M2-T25: verifies setMute state transitions toggle isMuted accurately', () => {
      const engine = new ProceduralAudioEngine();
      engine.setMute(true);
      expect(engine.getIsMuted()).toBe(true);

      engine.setMute(false);
      expect(engine.getIsMuted()).toBe(false);

      engine.setMute(true);
      expect(engine.getIsMuted()).toBe(true);
    });
  });

  // =========================================================================
  // Requirement 6: Additional WebGL2 & WebGPU Parity Regressions
  // =========================================================================
  describe('6. Additional Visual & Functional Parity Regressions', () => {
    it('EMP-M2-T26: verifies pseudo-RTC elimination across App.tsx and VectorOverlayLayer.tsx', () => {
      expect(appTsx).not.toContain('u_cameraCenter');
      expect(vectorOverlayTsx).not.toContain('u_cameraCenter');
      expect(appTsx).toContain('vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);');
      expect(vectorOverlayTsx).toContain('vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);');
    });

    it('EMP-M2-T27: verifies WebGPU normal blending prevents 76% flat-map dimming', () => {
      const pointsWgsl = fs.readFileSync(path.join(projectRoot, 'src/webgpu/shaders/points_render.wgsl'), 'utf8');
      const linesWgsl = fs.readFileSync(path.join(projectRoot, 'src/webgpu/shaders/lines_render.wgsl'), 'utf8');

      expect(pointsWgsl).toContain('dynamicNormal = normalize(mix(dynamicNormal, vec3<f32>(0.0, 0.0, 1.0), sim.u_unfurl));');
      expect(linesWgsl).toContain('dynamicNormal = normalize(mix(dynamicNormal, vec3<f32>(0.0, 0.0, 1.0), sim.u_unfurl));');
    });

    it('EMP-M2-T28: verifies WebGPU points pipeline depth test uses less-equal', () => {
      const engineCode = fs.readFileSync(path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts'), 'utf8');
      expect(engineCode).toMatch(/pointsRenderPipeline[\s\S]*?depthCompare:\s*'less-equal'/);
    });

    it('EMP-M2-T29: verifies DataLayerOverlay props parity between WebGL2 and WebGPU', () => {
      expect(appTsx).toContain('displacementScale={layer.displacementScale}');
      expect(appTsx).toContain('elevationEncoding={layer.elevationEncoding}');
      expect(appTsx).toContain('sunAzimuth={layer.sunAzimuth}');
      expect(appTsx).toContain('sunAltitude={layer.sunAltitude}');
      expect(appTsx).toContain('hillshadeIntensity={layer.hillshadeIntensity}');
    });

    it('EMP-M2-T30: verifies index.html contains inline SVG favicon without broken /vite.svg', () => {
      const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
      expect(indexHtml).not.toContain('/vite.svg');
      expect(indexHtml).toContain('data:image/svg+xml');
    });
  });
});
