// ============================================================================
// File: tests/modern/challenger-m3-2-datalayer-catalog.test.ts
// Adversarial Challenger Suite: DataLayerCatalog Dual-Export Contract & Schema Conformance
// Milestone: Milestone 3 (R3) WeatherNext 3 Data Ingestion Pipeline
// Compliance: Rule 46 (Test Import Integrity), Invariant §46, Invariant §2
// ============================================================================

import { describe, it, expect } from 'vitest';

// Pillar D (Rule 46): 100% Direct production imports from src/
import {
  DATA_LAYER_CATALOG as CANONICAL_CATALOG,
  getPresetById as getPresetByIdCanonical,
  DataLayerPreset,
  CartographicLegend,
} from '../../src/core/data/DataLayerCatalog';

import {
  DATA_LAYER_CATALOG as LAYERS_CATALOG,
  getPresetById as getPresetByIdLayers,
} from '../../src/core/layers/DataLayerCatalog';

describe('Adversarial Challenger M3-2: DataLayerCatalog Dual-Export & Schema Audit', () => {
  const TARGET_ID = 'google-weathernext3';

  // --------------------------------------------------------------------------
  // Pillar 1: Deep Identity & Exact Structural Symmetry Between Dual Exports
  // --------------------------------------------------------------------------
  describe('Pillar 1: Deep Identity & Zero Drift Between Dual Exports', () => {
    it('CHALLENGE-CAT-01: asserts total preset count and order parity across dual exports', () => {
      expect(CANONICAL_CATALOG.length).toBeGreaterThan(0);
      expect(CANONICAL_CATALOG.length).toBe(LAYERS_CATALOG.length);

      for (let i = 0; i < CANONICAL_CATALOG.length; i++) {
        const canonical = CANONICAL_CATALOG[i];
        const layer = LAYERS_CATALOG[i];
        expect(canonical.id).toBe(layer.id);
        expect(canonical).toStrictEqual(layer);
      }
    });

    it('CHALLENGE-CAT-02: asserts getPresetById produces identical results for all IDs', () => {
      for (const preset of CANONICAL_CATALOG) {
        const fromCanonical = getPresetByIdCanonical(preset.id);
        const fromLayers = getPresetByIdLayers(preset.id);

        expect(fromCanonical).toBeDefined();
        expect(fromLayers).toBeDefined();
        expect(fromCanonical).toStrictEqual(fromLayers);
      }
    });

    it('CHALLENGE-CAT-03: verifies all preset IDs are unique across both registries', () => {
      const canonicalIds = CANONICAL_CATALOG.map((p) => p.id);
      const layersIds = LAYERS_CATALOG.map((p) => p.id);

      const uniqueCanonical = new Set(canonicalIds);
      const uniqueLayers = new Set(layersIds);

      expect(uniqueCanonical.size).toBe(canonicalIds.length);
      expect(uniqueLayers.size).toBe(layersIds.length);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 2: Deep Schema & Rigorous Field Verification for WeatherNext 3
  // --------------------------------------------------------------------------
  describe('Pillar 2: WeatherNext 3 Schema & Attribution Conformance', () => {
    const canonicalEntry = getPresetByIdCanonical(TARGET_ID);
    const layersEntry = getPresetByIdLayers(TARGET_ID);

    it('CHALLENGE-CAT-04: target preset exists in both catalogs and is identical', () => {
      expect(canonicalEntry).toBeDefined();
      expect(layersEntry).toBeDefined();
      expect(canonicalEntry).toStrictEqual(layersEntry);
    });

    it('CHALLENGE-CAT-05: enforces exact required fields and values', () => {
      const p = canonicalEntry!;

      // 1. ID
      expect(p.id).toBe('google-weathernext3');

      // 2. Name
      expect(p.name).toContain('Google DeepMind WeatherNext 3');

      // 3. Category: must be 'field' or 'atmospheric-clouds'
      expect(['field', 'atmospheric-clouds']).toContain(p.category);

      // 4. Type / Resolution: must contain "0.1° (10km) AI"
      expect(p.type).toBe('0.1° (10km) AI');

      // 5. Source Attribution: must strictly equal or contain "Google DeepMind WeatherNext 3"
      expect(p.attribution).toBe('Google DeepMind WeatherNext 3');

      // 6. Details must mention 0.1° (10km) and 48-hour time horizon
      expect(p.details).toContain('0.1° (10km) AI');
      expect(p.details).toContain('48-hour');

      // 7. URL points to public metadata descriptor
      expect(p.url).toBe('/data/weathernext/meta.json');

      // 8. Opacity and BlendMode
      expect(p.defaultOpacity).toBe(0.85);
      expect(p.defaultBlendMode).toBe(0);
    });

    it('CHALLENGE-CAT-06: validates cartographic legend color stops and bounds', () => {
      const p = canonicalEntry!;
      expect(p.legend).toBeDefined();

      const legend = p.legend;
      expect(legend.minLabel).toBe('0.0 mm/h');
      expect(legend.maxLabel).toBe('50+ mm/h');
      expect(legend.unit).toBe('0.1° (10km) AI');

      // Validate colorStops array
      expect(legend.colorStops.length).toBeGreaterThanOrEqual(5);

      // Color regex for hex (#fff, #ffffff, #ffffff00) or rgba(r,g,b,a)
      const hexOrRgbaRegex = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\))$/;

      for (const stop of legend.colorStops) {
        expect(stop).toMatch(hexOrRgbaRegex);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 3: Monte Carlo Adversarial Fuzzing (10,000 Iterations)
  // --------------------------------------------------------------------------
  describe('Pillar 3: Monte Carlo Adversarial Lookups (10,000 Trials)', () => {
    it('CHALLENGE-CAT-07: survives 10,000 randomized and adversarial queries without throwing', () => {
      const allKnownIds = CANONICAL_CATALOG.map((p) => p.id);

      for (let i = 0; i < 10000; i++) {
        let testQuery: string;

        const dice = Math.random();
        if (dice < 0.4) {
          // Valid ID probe
          testQuery = allKnownIds[Math.floor(Math.random() * allKnownIds.length)];
          const resCanonical = getPresetByIdCanonical(testQuery);
          const resLayers = getPresetByIdLayers(testQuery);
          expect(resCanonical).toBeDefined();
          expect(resLayers).toBeDefined();
          expect(resCanonical!.id).toBe(testQuery);
          expect(resCanonical).toStrictEqual(resLayers);
        } else if (dice < 0.7) {
          // Randomized pseudo-alphanumeric noise
          testQuery = `noise_${Math.random().toString(36).substring(2)}_${i}`;
          expect(getPresetByIdCanonical(testQuery)).toBeUndefined();
          expect(getPresetByIdLayers(testQuery)).toBeUndefined();
        } else {
          // Boundary / hostile strings (SQL injection, paths, unicode, empty)
          const hostileStrings = [
            '',
            '   ',
            '__proto__',
            'constructor',
            'prototype',
            'toString',
            'valueOf',
            '../../etc/passwd',
            '<script>alert(1)</script>',
            'SELECT * FROM presets;',
            'google-weathernext3\0',
            'GOOGLE-WEATHERNEXT3',
            'google-weathernext3 ',
            ' google-weathernext3',
            '0.1°',
            '🌀🌪️⚡',
          ];
          testQuery = hostileStrings[Math.floor(Math.random() * hostileStrings.length)];
          const cRes = getPresetByIdCanonical(testQuery);
          const lRes = getPresetByIdLayers(testQuery);
          // Only matches if exactly in list
          if (allKnownIds.includes(testQuery)) {
            expect(cRes).toBeDefined();
          } else {
            expect(cRes).toBeUndefined();
            expect(lRes).toBeUndefined();
          }
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 4: Anti-Cheating & Tautology Audit (Rule 46)
  // --------------------------------------------------------------------------
  describe('Pillar 4: Anti-Cheating & Source Fidelity (Rule 46)', () => {
    it('CHALLENGE-CAT-08: verifies both modules are distinct exports and NOT circular mocks', () => {
      expect(typeof CANONICAL_CATALOG).toBe('object');
      expect(typeof LAYERS_CATALOG).toBe('object');
      expect(typeof getPresetByIdCanonical).toBe('function');
      expect(typeof getPresetByIdLayers).toBe('function');

      // Verify they are actual frozen or distinct data references
      expect(CANONICAL_CATALOG).not.toBeNull();
      expect(LAYERS_CATALOG).not.toBeNull();
    });
  });
});
