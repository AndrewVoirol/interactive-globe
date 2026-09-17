// ============================================================================
// File: tests/modern/challenger-m5-catalog-and-synthetic-purge.test.ts
// Architecture: Milestone 5 Adversarial Challenger Suite (Challenger 2)
// Topic: Dual-Export Catalog Symmetry, DEM U16 Uniformity, and Synthetic Comment Purge
// Compliance: Rule 46 (Test Import Integrity), Invariant §8, Rule 21
// ============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Direct production imports from src/ (Rule 46)
import {
  DATA_LAYER_CATALOG as DATA_CATALOG,
  LEGACY_PRESETS as DATA_LEGACY,
  getPresetById as getPresetByIdData,
  type DataLayerPreset,
} from '../../src/core/data/DataLayerCatalog';

import {
  DATA_LAYER_CATALOG as LAYERS_CATALOG,
  LEGACY_PRESETS as LAYERS_LEGACY,
  getPresetById as getPresetByIdLayers,
} from '../../src/core/layers/DataLayerCatalog';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

describe('Adversarial Challenger M5-2: Catalog Symmetry, DEM Parity & Comment Purge', () => {
  // --------------------------------------------------------------------------
  // Pillar 1: Deep Structural Symmetry Between Dual Exports
  // --------------------------------------------------------------------------
  describe('Pillar 1: Deep Identity & Exact Structural Symmetry Between Dual Catalogs', () => {
    it('CHALLENGE-M5-SYM-01: enforces identical catalog length and exact element order', () => {
      expect(DATA_CATALOG.length).toBeGreaterThan(0);
      expect(DATA_CATALOG.length).toBe(LAYERS_CATALOG.length);

      for (let i = 0; i < DATA_CATALOG.length; i++) {
        const dataPreset = DATA_CATALOG[i];
        const layersPreset = LAYERS_CATALOG[i];

        expect(dataPreset.id).toBe(layersPreset.id);
        // Deep strict equality assertion
        expect(dataPreset).toStrictEqual(layersPreset);
      }
    });

    it('CHALLENGE-M5-SYM-02: asserts complete symmetry in LEGACY_PRESETS map', () => {
      expect(DATA_LEGACY.size).toBe(LAYERS_LEGACY.size);

      for (const [key, val] of DATA_LEGACY.entries()) {
        expect(LAYERS_LEGACY.has(key)).toBe(true);
        const layersVal = LAYERS_LEGACY.get(key);
        expect(val).toStrictEqual(layersVal);
      }
    });

    it('CHALLENGE-M5-SYM-03: verifies getPresetById equivalence on all known catalog and legacy entries', () => {
      const allIds = [
        ...DATA_CATALOG.map((p) => p.id),
        ...Array.from(DATA_LEGACY.keys()),
      ];

      for (const id of allIds) {
        const fromData = getPresetByIdData(id);
        const fromLayers = getPresetByIdLayers(id);

        expect(fromData).toBeDefined();
        expect(fromLayers).toBeDefined();
        expect(fromData).toStrictEqual(fromLayers);
      }
    });

    it('CHALLENGE-M5-SYM-04: Monte Carlo 10,000 trials confirm getPresetById query stability & symmetry', () => {
      const allIds = [
        ...DATA_CATALOG.map((p) => p.id),
        ...Array.from(DATA_LEGACY.keys()),
      ];

      const adversarialProbes = [
        '',
        '   ',
        '__proto__',
        'constructor',
        'prototype',
        'toString',
        'valueOf',
        '../../etc/passwd',
        'earth-etopo2022-dem-u16.bin',
        'null',
        'undefined',
        'ARCHITECTURAL-TOPO-RELIEF',
        'architectural-topo-relief\0',
        'hybrid-crust-hydrosphere ',
      ];

      for (let i = 0; i < 10000; i++) {
        const dice = Math.random();
        let query: string;

        if (dice < 0.4) {
          query = allIds[Math.floor(Math.random() * allIds.length)];
        } else if (dice < 0.7) {
          query = adversarialProbes[Math.floor(Math.random() * adversarialProbes.length)];
        } else {
          query = `rand_${Math.random().toString(36).slice(2)}_${i}`;
        }

        const resData = getPresetByIdData(query);
        const resLayers = getPresetByIdLayers(query);

        if (resData === undefined) {
          expect(resLayers).toBeUndefined();
        } else {
          expect(resData).toStrictEqual(resLayers);
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 2: Global DEM Presets & Default Layer URL Invariant §8 Verification
  // --------------------------------------------------------------------------
  describe('Pillar 2: Global DEM Presets & Cold-Boot URL Invariants', () => {
    const GLOBAL_DEM_PRESET_IDS = [
      'architectural-topo-relief',
      'hybrid-crust-hydrosphere',
      'global-dem-crust',
    ];

    it('CHALLENGE-M5-DEM-01: all 3 global DEM presets in src/core/data/DataLayerCatalog specify /earth-etopo2022-dem-u16.bin', () => {
      for (const id of GLOBAL_DEM_PRESET_IDS) {
        const preset = DATA_CATALOG.find((p) => p.id === id);
        expect(preset, `Preset ${id} must exist in data catalog`).toBeDefined();
        expect(preset!.url).toBe('/earth-etopo2022-dem-u16.bin');
      }
    });

    it('CHALLENGE-M5-DEM-02: all 3 global DEM presets in src/core/layers/DataLayerCatalog specify /earth-etopo2022-dem-u16.bin', () => {
      for (const id of GLOBAL_DEM_PRESET_IDS) {
        const preset = LAYERS_CATALOG.find((p) => p.id === id);
        expect(preset, `Preset ${id} must exist in layers catalog`).toBeDefined();
        expect(preset!.url).toBe('/earth-etopo2022-dem-u16.bin');
      }
    });

    it('CHALLENGE-M5-DEM-03: verifies src/core/layers/useGlobeLayerManager.ts line 26 uses /earth-etopo2022-dem-u16.bin', () => {
      const hookPath = path.join(projectRoot, 'src/core/layers/useGlobeLayerManager.ts');
      const hookContent = fs.readFileSync(hookPath, 'utf8');
      const lines = hookContent.split('\n');

      // Check line 26 (1-indexed: lines[25])
      const line26 = lines[25];
      expect(line26).toContain("url: '/earth-etopo2022-dem-u16.bin'");

      // Verify no deprecated webp DEM references exist in hook
      expect(hookContent).not.toContain('earth-etopo2022-dem.webp');
      expect(hookContent).not.toContain('earth-elevation-dem.webp');
    });

    it('CHALLENGE-M5-DEM-04: confirms zero active references to deprecated DEM webp files exist anywhere in src/', () => {
      const srcDir = path.join(projectRoot, 'src');
      const checkDir = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            checkDir(fullPath);
          } else if (entry.isFile() && /\.(ts|tsx|wgsl|js)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            expect(content).not.toContain('earth-etopo2022-dem.webp');
            expect(content).not.toContain('earth-elevation-dem.webp');
          }
        }
      };
      checkDir(srcDir);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 3: Synthetic Comment Purge & AST Logic Verification (Rule 21)
  // --------------------------------------------------------------------------
  describe('Pillar 3: Synthetic Comment Purge & Authentic Shader Code Verification', () => {
    const shadersDir = path.join(projectRoot, 'src/webgpu/shaders');
    const wgslFiles = fs.readdirSync(shadersDir).filter((f) => f.endsWith('.wgsl'));

    it('CHALLENGE-M5-PURGE-01: confirms all WGSL shaders contain zero synthetic comment patterns', () => {
      expect([15, 17]).toContain(wgslFiles.length);

      const forbiddenCommentSubstrings = [
        'Baseline kinetic energy conservation',
        'Contract baseline: if (cloud.u_unfurl',
        'Baseline raw feathering:',
        'Preserved for legacy test assertion:',
        'Preserved for legacy',
      ];

      for (const file of wgslFiles) {
        const fullPath = path.join(shadersDir, file);
        const content = fs.readFileSync(fullPath, 'utf8');

        for (const substring of forbiddenCommentSubstrings) {
          expect(
            content.includes(substring),
            `File ${file} must NOT contain synthetic comment substring: "${substring}"`
          ).toBe(false);
        }
      }
    });

    it('CHALLENGE-M5-PURGE-02: verifies production WGSL replacement statements are active and valid', () => {
      // 1. wind_particles.wgsl: must use active uSteered kinetic energy scaling
      const windWGSL = fs.readFileSync(path.join(shadersDir, 'wind_particles.wgsl'), 'utf8');
      expect(windWGSL).toContain('let uSteered =');
      expect(windWGSL).toContain(
        'return select(uSteered, uSteered * (rawSpeed / max(defSpeed, 1e-6)), rawSpeed > 1e-5 && defSpeed > 1e-6);'
      );

      // 2. cloud_shell.wgsl: must use active production expressions
      const cloudWGSL = fs.readFileSync(path.join(shadersDir, 'cloud_shell.wgsl'), 'utf8');
      expect(cloudWGSL).toContain('var totalOffset = crustDisp + effStandoff;');
      expect(cloudWGSL).toContain('if (cloud.u_unfurl < 0.20 && in.facing < -0.015)');
      expect(cloudWGSL).toContain('let featheredCloud = smoothstep(0.0, 0.20, condensedCloud);');

      // 3. crust_hydrosphere.wgsl: must use active river width variable
      const crustWGSL = fs.readFileSync(path.join(shadersDir, 'crust_hydrosphere.wgsl'), 'utf8');
      expect(crustWGSL).toContain('var riverWidthPx = mix(0.40, 1.98, descentAccum);');
    });
  });
});
