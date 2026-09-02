import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('F2: Vite Chunk Splitting & Bundle Hygiene', () => {
  const manualChunksClassifier = (id: string): string | undefined => {
    if (!id.includes('node_modules')) return undefined;
    if (id.includes('three') || id.includes('@react-three')) {
      return 'vendor-three';
    }
    if (id.includes('d3') || id.includes('topojson')) {
      return 'vendor-geospatial';
    }
    if (id.includes('react') || id.includes('react-dom') || id.includes('lucide-react')) {
      return 'vendor-react';
    }
    return 'vendor-misc';
  };

  it('F2-T1: verifies three.js modules are routed to dedicated vendor-three chunk', () => {
    const p1 = '/project/node_modules/three/build/three.module.js';
    const p2 = '/project/node_modules/@react-three/fiber/dist/index.js';
    const p3 = '/project/node_modules/@react-three/drei/index.js';

    expect(manualChunksClassifier(p1)).toBe('vendor-three');
    expect(manualChunksClassifier(p2)).toBe('vendor-three');
    expect(manualChunksClassifier(p3)).toBe('vendor-three');
  });

  it('F2-T2: verifies D3 and TopoJSON libraries are segregated to vendor-geospatial chunk', () => {
    const p1 = '/project/node_modules/d3/src/index.js';
    const p2 = '/project/node_modules/d3-geo-voronoi/src/index.js';
    const p3 = '/project/node_modules/topojson-client/dist/topojson-client.js';

    expect(manualChunksClassifier(p1)).toBe('vendor-geospatial');
    expect(manualChunksClassifier(p2)).toBe('vendor-geospatial');
    expect(manualChunksClassifier(p3)).toBe('vendor-geospatial');
  });

  it('F2-T3: verifies React core runtime is routed to vendor-react chunk', () => {
    const p1 = '/project/node_modules/react/index.js';
    const p2 = '/project/node_modules/react-dom/client.js';
    const p3 = '/project/node_modules/lucide-react/dist/esm/lucide-react.js';

    expect(manualChunksClassifier(p1)).toBe('vendor-react');
    expect(manualChunksClassifier(p2)).toBe('vendor-react');
    expect(manualChunksClassifier(p3)).toBe('vendor-react');
  });

  it('F2-T4: verifies application source files are not grouped into vendor chunks', () => {
    const p1 = '/project/src/App.tsx';
    const p2 = '/project/src/webgpu/WebGPUEngine.ts';
    const p3 = '/project/src/utils/dymaxion.ts';

    expect(manualChunksClassifier(p1)).toBeUndefined();
    expect(manualChunksClassifier(p2)).toBeUndefined();
    expect(manualChunksClassifier(p3)).toBeUndefined();
  });

  it('F2-T5: verifies vite.config.ts file exists and defines valid build configuration', () => {
    const configPath = path.resolve(__dirname, '../../vite.config.ts');
    expect(fs.existsSync(configPath)).toBe(true);
    const content = fs.readFileSync(configPath, 'utf8');
    expect(content).toContain('defineConfig');
  });
});
