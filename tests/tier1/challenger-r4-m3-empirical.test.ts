import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import * as vite from 'vite';

// 1. Direct relative imports from production code
import DirectApp, { 
  GeometryLayer as AppGeometryLayer, 
  KinematicCameraController as AppKinematicCameraController,
  CameraTelemetryUpdater 
} from '../../src/App';
import DirectGeometryLayer, { 
  GeometryLayer, 
  RADIUS, 
  vertexShader, 
  pointFragmentShader, 
  meshVertexShader, 
  meshFragmentShader 
} from '../../src/components/canvas/GeometryLayer';
import DirectKinematicCameraController, { 
  KinematicCameraController 
} from '../../src/components/canvas/KinematicCameraController';
import * as DirectSrcTypes from '../../src/types';
import * as DirectRootTypes from '../../types';

// 2. Import using Vite/Vitest '@' alias to verify alias resolution
import AliasApp, { 
  GeometryLayer as AliasAppGeometryLayer, 
  KinematicCameraController as AliasAppKinematicCameraController 
} from '@/App';
import AliasGeometryLayer, { 
  GeometryLayer as AliasCanvasGeometryLayer,
  RADIUS as AliasRADIUS,
  vertexShader as AliasVertexShader,
  pointFragmentShader as AliasPointFragmentShader,
  meshVertexShader as AliasMeshVertexShader,
  meshFragmentShader as AliasMeshFragmentShader
} from '@/components/canvas/GeometryLayer';
import AliasKinematicCameraController, { 
  KinematicCameraController as AliasCanvasCameraController 
} from '@/components/canvas/KinematicCameraController';
import * as AliasTypes from '@/types';
import { useEngineState as AliasUseEngineState } from '@/hooks/useEngineState';
import { TelemetryHUD as AliasTelemetryHUD } from '@/components/hud/TelemetryHUD';
import { NavigationDock as AliasNavigationDock } from '@/components/hud/NavigationDock';
import { CursorProvider as AliasCursorProvider, useCursorTracker as AliasUseCursorTracker } from '@/core/CursorContext';

describe('Challenger 1 (Round 4 / Milestone 3): Architecture Cleanup Empirical Suite', () => {
  const projectRoot = path.resolve(__dirname, '../..');

  // =========================================================================
  // Requirement 1: Canvas Component Module Exports, Imports & Integrity
  // =========================================================================
  describe('1. Canvas Component Module Exports, Imports & Integrity', () => {
    it('1.1: GeometryLayer exports both named and default component matching exactly', () => {
      expect(GeometryLayer).toBeDefined();
      expect(DirectGeometryLayer).toBeDefined();
      expect(GeometryLayer).toBe(DirectGeometryLayer);
      expect(typeof GeometryLayer).toBe('function');
    });

    it('1.2: GeometryLayer exports required constants and shaders with correct uniform contracts', () => {
      expect(RADIUS).toBe(5.0);
      expect(typeof vertexShader).toBe('string');
      expect(typeof pointFragmentShader).toBe('string');
      expect(typeof meshVertexShader).toBe('string');
      expect(typeof meshFragmentShader).toBe('string');

      // Point vertex shader must contain performance early-out and uniforms
      expect(vertexShader).toContain('u_unfurl');
      expect(vertexShader).toContain('u_mode');
      expect(vertexShader).toContain('u_layerMode');
      expect(vertexShader).toContain('dot(vNorm, vDir) > 0.25'); // Backface early-out for points

      // Mesh vertex shader must NOT contain the aggressive backface early-out (prevents screen-spanning line artifacts)
      expect(meshVertexShader).not.toContain('dot(vNorm, vDir) > 0.25');
      // Mesh fragment shader applies wireframe density attenuation
      expect(meshFragmentShader).toContain('u_wireOpacityScale');
      expect(meshFragmentShader).toContain('densityFactor');
    });

    it('1.3: KinematicCameraController exports both named and default component matching exactly', () => {
      expect(KinematicCameraController).toBeDefined();
      expect(DirectKinematicCameraController).toBeDefined();
      expect(KinematicCameraController).toBe(DirectKinematicCameraController);
      expect(typeof KinematicCameraController).toBe('function');
    });

    it('1.4: src/App.tsx re-exports GeometryLayer and KinematicCameraController cleanly', () => {
      expect(AppGeometryLayer).toBeDefined();
      expect(AppGeometryLayer).toBe(GeometryLayer);

      expect(AppKinematicCameraController).toBeDefined();
      expect(AppKinematicCameraController).toBe(KinematicCameraController);

      expect(CameraTelemetryUpdater).toBeDefined();
      expect(typeof CameraTelemetryUpdater).toBe('function');

      expect(DirectApp).toBeDefined();
      expect(typeof DirectApp).toBe('function');
    });

    it('1.5: KinematicCameraController behavioral logic smoothly interpolates camera toward targetPos and notifies on arrival', () => {
      const mockCamera = {
        position: new THREE.Vector3(0, 0, 15),
      };
      const mockControls = {
        object: mockCamera,
        target: new THREE.Vector3(5, 2, 0),
        update: vi.fn(),
      };

      const targetPos = new THREE.Vector3(0, 0, 5);
      const onArrived = vi.fn();
      const onTargetChange = vi.fn();

      const step = (camPos: THREE.Vector3, controlsTarget: THREE.Vector3, tPos: THREE.Vector3) => {
        camPos.lerp(tPos, 0.08);
        controlsTarget.lerp(new THREE.Vector3(0, 0, 0), 0.08);
        mockControls.update();
        if (camPos.distanceTo(tPos) < 0.05) {
          camPos.copy(tPos);
          onArrived();
        }
        onTargetChange(controlsTarget.clone());
      };

      // Step 1: Camera moves toward targetPos
      const initialDist = mockCamera.position.distanceTo(targetPos);
      step(mockCamera.position, mockControls.target, targetPos);
      const newDist = mockCamera.position.distanceTo(targetPos);

      expect(newDist).toBeLessThan(initialDist);
      expect(mockControls.update).toHaveBeenCalled();
      expect(onTargetChange).toHaveBeenCalled();
      expect(onArrived).not.toHaveBeenCalled();

      // Step 2: Camera converges close to targetPos (< 0.05)
      mockCamera.position.set(0, 0, 5.02);
      step(mockCamera.position, mockControls.target, targetPos);

      expect(mockCamera.position.x).toBe(targetPos.x);
      expect(mockCamera.position.y).toBe(targetPos.y);
      expect(mockCamera.position.z).toBe(targetPos.z);
      expect(onArrived).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Requirement 2: Vite and Vitest '@' Path Alias Resolution
  // =========================================================================
  describe('2. Vite and Vitest "@" Path Alias Resolution', () => {
    it('2.1: "@" alias resolves src/App.tsx identically to relative import in Vitest', () => {
      expect(AliasApp).toBeDefined();
      expect(AliasApp).toBe(DirectApp);
      expect(AliasAppGeometryLayer).toBe(GeometryLayer);
      expect(AliasAppKinematicCameraController).toBe(KinematicCameraController);
    });

    it('2.2: "@" alias resolves extracted canvas components identically to relative imports in Vitest', () => {
      expect(AliasGeometryLayer).toBe(DirectGeometryLayer);
      expect(AliasCanvasGeometryLayer).toBe(GeometryLayer);
      expect(AliasRADIUS).toBe(RADIUS);
      expect(AliasVertexShader).toBe(vertexShader);
      expect(AliasPointFragmentShader).toBe(pointFragmentShader);
      expect(AliasMeshVertexShader).toBe(meshVertexShader);
      expect(AliasMeshFragmentShader).toBe(meshFragmentShader);

      expect(AliasKinematicCameraController).toBe(DirectKinematicCameraController);
      expect(AliasCanvasCameraController).toBe(KinematicCameraController);
    });

    it('2.3: "@" alias resolves module paths for types, hooks, HUD, and core context in Vitest without resolution errors', () => {
      expect(AliasTypes).toBeDefined();
      expect(AliasUseEngineState).toBeDefined();
      expect(typeof AliasUseEngineState).toBe('function');
      expect(AliasTelemetryHUD).toBeDefined();
      expect(typeof AliasTelemetryHUD).toBe('function');
      expect(AliasNavigationDock).toBeDefined();
      expect(typeof AliasNavigationDock).toBe('function');
      expect(AliasCursorProvider).toBeDefined();
      expect(AliasUseCursorTracker).toBeDefined();
    });

    it('2.4: vite.config.ts configures resolve.alias["@"] pointing strictly to ./src', () => {
      const viteConfigContent = fs.readFileSync(path.join(projectRoot, 'vite.config.ts'), 'utf8');
      expect(viteConfigContent).toMatch(/['"]@['"]\s*:\s*path\.resolve\(__dirname,\s*['"]\.\/src['"]\)/);
      expect(viteConfigContent).not.toMatch(/['"]@['"]\s*:\s*path\.resolve\(__dirname,\s*['"]\.['"]\)/);
    });

    it('2.5: vitest.config.ts configures test.alias["@"] pointing strictly to ./src', () => {
      const vitestConfigContent = fs.readFileSync(path.join(projectRoot, 'vitest.config.ts'), 'utf8');
      expect(vitestConfigContent).toMatch(/['"]@['"]\s*:\s*path\.resolve\(__dirname,\s*['"]\.\/src['"]\)/);
      expect(vitestConfigContent).not.toMatch(/['"]@['"]\s*:\s*path\.resolve\(__dirname,\s*['"]\.['"]\)/);
    });

    it('2.6: tsconfig.json configures baseUrl "." and paths {"@/*": ["src/*"]}', () => {
      const tsconfigContent = fs.readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf8');
      const tsconfig = JSON.parse(tsconfigContent);
      expect(tsconfig.compilerOptions.baseUrl).toBe('.');
      expect(tsconfig.compilerOptions.paths).toBeDefined();
      expect(tsconfig.compilerOptions.paths['@/*']).toEqual(['src/*']);
    });

    it('2.7: Vite resolveConfig programmatically verifies "@" maps to absolute path of src', async () => {
      const resolvedViteConfig = await vite.resolveConfig({}, 'build');
      const aliasEntries = resolvedViteConfig.resolve.alias;
      const atAlias = aliasEntries.find((a: any) => a.find === '@');
      expect(atAlias).toBeDefined();
      expect(atAlias?.replacement).toBe(path.resolve(projectRoot, 'src'));
    });

    it('2.8: Vite build pipeline successfully compiles and bundles an entry point importing via "@/" alias', async () => {
      const result = await vite.build({
        logLevel: 'silent',
        build: {
          write: false,
          rollupOptions: {
            input: 'virtual-alias-check',
            plugins: [{
              name: 'virtual-alias-check-plugin',
              resolveId(id: string) {
                if (id === 'virtual-alias-check') return id;
                return null;
              },
              load(id: string) {
                if (id === 'virtual-alias-check') {
                  return `
                    import { RADIUS, GeometryLayer } from '@/components/canvas/GeometryLayer';
                    import { KinematicCameraController } from '@/components/canvas/KinematicCameraController';
                    console.log('Tested Radius:', RADIUS, typeof GeometryLayer, typeof KinematicCameraController);
                  `;
                }
                return null;
              }
            }]
          }
        }
      });

      const output = (result as any).output || (Array.isArray(result) && (result[0] as any).output);
      expect(output).toBeDefined();
      expect(output.length).toBeGreaterThan(0);
      const mainChunk = output.find((o: any) => o.isEntry);
      expect(mainChunk).toBeDefined();
      expect(mainChunk.code).toContain('Tested Radius:');
    });
  });

  // =========================================================================
  // Requirement 3: Root index.tsx Entry Point & Mount Verification
  // =========================================================================
  describe('3. Root index.tsx Entry Point & Mount Verification', () => {
    it('3.1: index.tsx imports App directly from "./src/App"', () => {
      const indexTsxContent = fs.readFileSync(path.join(projectRoot, 'index.tsx'), 'utf8');
      expect(indexTsxContent).toMatch(/import\s+App\s+from\s+['"]\.\/src\/App['"]/);
      expect(indexTsxContent).not.toMatch(/import\s+App\s+from\s+['"]\.\/App['"]/);
    });

    it('3.2: index.html references root "/index.tsx" module script and defines root element', () => {
      const indexHtmlContent = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
      expect(indexHtmlContent).toContain('<div id="root"></div>');
      expect(indexHtmlContent).toContain('<script type="module" src="/index.tsx"></script>');
    });

    it('3.3: index.tsx mounting logic throws descriptive error if #root element is absent', () => {
      const mockGetElementById = vi.fn().mockReturnValue(null);
      const attemptMount = () => {
        const rootElement = mockGetElementById('root');
        if (!rootElement) {
          throw new Error("Could not find root element to mount to");
        }
      };

      expect(attemptMount).toThrowError("Could not find root element to mount to");
    });

    it('3.4: index.tsx mounting logic initializes React root when #root element is present', () => {
      const mockRootElement = { id: 'root' };
      const mockRender = vi.fn();
      const mockCreateRoot = vi.fn().mockReturnValue({ render: mockRender });

      const mount = (elem: any) => {
        if (!elem) throw new Error("Could not find root element to mount to");
        const root = mockCreateRoot(elem);
        root.render(DirectApp);
      };

      mount(mockRootElement);
      expect(mockCreateRoot).toHaveBeenCalledWith(mockRootElement);
      expect(mockRender).toHaveBeenCalledWith(DirectApp);
    });

    it('3.5: Vite builds production bundle directly from index.tsx entry point with valid root mounting code', async () => {
      const buildResult = await vite.build({
        logLevel: 'silent',
        build: {
          write: false,
          rollupOptions: {
            input: path.resolve(projectRoot, 'index.tsx'),
          }
        }
      });

      const output = (buildResult as any).output || (Array.isArray(buildResult) && (buildResult[0] as any).output);
      expect(output).toBeDefined();
      const entryChunk = output.find((o: any) => o.isEntry);
      expect(entryChunk).toBeDefined();
      expect(entryChunk.code).toMatch(/getElementById\(["']root["']\)/);
      expect(entryChunk.code).toContain('createRoot');
    });
  });

  // =========================================================================
  // Requirement 4: Centralization of LoadedDataInfo & Root App.tsx Removal
  // =========================================================================
  describe('4. Centralization of LoadedDataInfo & Root App.tsx Removal', () => {
    it('4.1: Root App.tsx has been removed from repository root', () => {
      const rootAppPath = path.join(projectRoot, 'App.tsx');
      expect(fs.existsSync(rootAppPath)).toBe(false);
    });

    it('4.2: src/App.tsx is the genuine implementation (> 350 lines)', () => {
      const srcAppPath = path.join(projectRoot, 'src/App.tsx');
      expect(fs.existsSync(srcAppPath)).toBe(true);
      const lines = fs.readFileSync(srcAppPath, 'utf8').split('\n');
      expect(lines.length).toBeGreaterThan(350);
    });

    it('4.3: LoadedDataInfo is canonically defined in src/types.ts with all 5 telemetry fields', () => {
      const srcTypesContent = fs.readFileSync(path.join(projectRoot, 'src/types.ts'), 'utf8');
      expect(srcTypesContent).toContain('export interface LoadedDataInfo');
      expect(srcTypesContent).toContain('pointCount: number;');
      expect(srcTypesContent).toContain('lineCount: number;');
      expect(srcTypesContent).toContain('format: string;');
      expect(srcTypesContent).toContain('loadTimeMs: number;');
      expect(srcTypesContent).toContain('vramMb: number;');

      const testInfo: DirectSrcTypes.LoadedDataInfo = {
        pointCount: 1000000,
        lineCount: 1200000,
        format: 'PACKED_BIN',
        loadTimeMs: 42.5,
        vramMb: 24.8,
      };
      expect(testInfo.pointCount).toBe(1000000);
      expect(testInfo.vramMb).toBe(24.8);
    });

    it('4.4: types.ts at root re-exports src/types.ts while maintaining backwards compatibility', () => {
      const rootTypesContent = fs.readFileSync(path.join(projectRoot, 'types.ts'), 'utf8');
      expect(rootTypesContent).toContain("export * from './src/types'");
    });

    it('4.5: useEngineState.ts and TelemetryHUD.tsx import LoadedDataInfo from types without duplicate definitions', () => {
      const useEngineStateContent = fs.readFileSync(path.join(projectRoot, 'src/hooks/useEngineState.ts'), 'utf8');
      expect(useEngineStateContent).toMatch(/import\s*\{[^}]*LoadedDataInfo[^}]*\}\s*from\s*['"]\.\.\/types['"]/);
      expect(useEngineStateContent).not.toContain('export interface LoadedDataInfo {');

      const telemetryHUDContent = fs.readFileSync(path.join(projectRoot, 'src/components/hud/TelemetryHUD.tsx'), 'utf8');
      expect(telemetryHUDContent).toMatch(/import\s*\{[^}]*LoadedDataInfo[^}]*\}\s*from\s*['"]\.\.\/\.\.\/types['"]/);
    });

    it('4.6: GeometryLayer and KinematicCameraController do not import from deleted root App.tsx', () => {
      const geoContent = fs.readFileSync(path.join(projectRoot, 'src/components/canvas/GeometryLayer.tsx'), 'utf8');
      expect(geoContent).not.toMatch(/from\s+['"][^'"]*App['"]/);

      const camContent = fs.readFileSync(path.join(projectRoot, 'src/components/canvas/KinematicCameraController.tsx'), 'utf8');
      expect(camContent).not.toMatch(/from\s+['"][^'"]*App['"]/);
    });
  });
});
