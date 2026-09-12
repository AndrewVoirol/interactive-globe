// ============================================================================
// File: tests/modern/r3-datalayer-catalog-weathernext3.test.ts
// Milestone 3 (R3): DataLayerCatalog Registration & Verification
// Compliance: Rule 46 (Test Import Integrity) & Invariant §46
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  DATA_LAYER_CATALOG as CANONICAL_CATALOG,
  getPresetById as getPresetByIdCanonical,
  DataLayerPreset,
} from '../../src/core/data/DataLayerCatalog';
import {
  DATA_LAYER_CATALOG as LAYERS_CATALOG,
  getPresetById as getPresetByIdLayers,
} from '../../src/core/layers/DataLayerCatalog';

describe('Milestone 3 (R3) - DataLayerCatalog WeatherNext 3 Registration', () => {
  const TARGET_ID = 'google-weathernext3';

  // --------------------------------------------------------------------------
  // Suite 1: Direct Production Ingestion & Dual-Export Parity (Rule 46)
  // --------------------------------------------------------------------------
  describe('1. Direct Module Ingestion & Dual-Export Parity (Rule 46)', () => {
    it('CATALOG-01: imports directly from production modules under src/ with zero mocks', () => {
      expect(Array.isArray(CANONICAL_CATALOG)).toBe(true);
      expect(Array.isArray(LAYERS_CATALOG)).toBe(true);
      expect(typeof getPresetByIdCanonical).toBe('function');
      expect(typeof getPresetByIdLayers).toBe('function');
    });

    it('CATALOG-02: maintains strict export parity between canonical and layers catalogs', () => {
      expect(CANONICAL_CATALOG.length).toBe(LAYERS_CATALOG.length);
      const canonicalPreset = CANONICAL_CATALOG.find((p) => p.id === TARGET_ID);
      const layersPreset = LAYERS_CATALOG.find((p) => p.id === TARGET_ID);

      expect(canonicalPreset).toBeDefined();
      expect(layersPreset).toBeDefined();
      expect(canonicalPreset).toStrictEqual(layersPreset);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 2: Required Field Verification & Schema Conformance
  // --------------------------------------------------------------------------
  describe('2. Metadata Schema & Required Attributes (§R3)', () => {
    it('CATALOG-03: registers google-weathernext3 with valid id, name, and category', () => {
      const preset = getPresetByIdCanonical(TARGET_ID);
      expect(preset).toBeDefined();
      expect(preset!.id).toBe(TARGET_ID);
      expect(preset!.name).toMatch(/Google DeepMind WeatherNext 3|WeatherNext 3/i);
      expect(['field', 'atmospheric-clouds']).toContain(preset!.category);
    });

    it('CATALOG-04: verifies exact source attribution and resolution tag', () => {
      const preset = getPresetByIdCanonical(TARGET_ID)!;
      // Mandate: Source attribution "Google DeepMind WeatherNext 3"
      expect(preset.attribution).toContain('Google DeepMind WeatherNext 3');

      // Mandate: Resolution tag "0.1° (10km) AI"
      const combinedMeta = `${preset.details} ${preset.type} ${preset.legend.unit}`;
      expect(combinedMeta).toContain('0.1° (10km) AI');
    });

    it('CATALOG-05: verifies rendering parameters, url, opacity, and blend mode', () => {
      const preset = getPresetByIdCanonical(TARGET_ID)!;
      expect(preset.url).toMatch(/^\/data\/weathernext\//);
      expect(preset.defaultOpacity).toBeGreaterThan(0.0);
      expect(preset.defaultOpacity).toBeLessThanOrEqual(1.0);
      expect([0, 1, 2, 3]).toContain(preset.defaultBlendMode);
    });

    it('CATALOG-06: verifies cartographic legend conforms to multi-tier color stops', () => {
      const preset = getPresetByIdCanonical(TARGET_ID)!;
      expect(preset.legend).toBeDefined();
      expect(Array.isArray(preset.legend.colorStops)).toBe(true);
      expect(preset.legend.colorStops.length).toBeGreaterThanOrEqual(3);
      expect(typeof preset.legend.minLabel).toBe('string');
      expect(typeof preset.legend.maxLabel).toBe('string');
      expect(typeof preset.legend.unit).toBe('string');
      expect(preset.legend.minLabel.length).toBeGreaterThan(0);
      expect(preset.legend.maxLabel.length).toBeGreaterThan(0);
    });
  });
});
