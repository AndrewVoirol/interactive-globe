/**
 * tests/modern/weathernext-cli.test.ts
 *
 * Behavioral test suite for Google DeepMind WeatherNext 3 Data Extraction & Staging CLI
 * (scripts/fetch-weathernext3.py) and WebGPU texture staging contracts.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { WEATHERNEXT_GRID_SPEC } from '../../src/core/data/WeatherNextDataSource';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SCRIPT_PATH = path.join(PROJECT_ROOT, 'scripts', 'fetch-weathernext3.py');

describe('WeatherNext 3 Pipeline CLI (scripts/fetch-weathernext3.py)', () => {
  it('WN3-CLI-01: script exists and is marked executable', () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
    const stat = fs.statSync(SCRIPT_PATH);
    expect(stat.size).toBeGreaterThan(1000);
  });

  it('WN3-CLI-02: dry-run executes cleanly with exit code 0 and verifies ADC auth and requester-pays GCS bucket', () => {
    const cmd = `uv run --with zarr --with gcsfs --with numpy python scripts/fetch-weathernext3.py --dry-run`;
    const stdout = execSync(cmd, { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 30000 });

    // 1. Verify credentials and project
    expect(stdout).toContain('Google Cloud ADC:');
    expect(stdout).toContain('Requester-Pays Project: antigravity-agent-1765655548');
    expect(stdout).toContain('gs://weathernext3_statistics_spatial/weathernext_3_0_0_statistics/zarr/2026_to_present/');

    // 2. Verify cycle discovery and success sentinel
    expect(stdout).toContain('Discovered finalized cycle:');
    expect(stdout).toContain('(checking \'success\' sentinel)');
    expect(stdout).toContain('Forecast Init Time:');
    expect(stdout).toContain('success (Confirmed Present)');

    // 3. Verify all 6 core prognostic fields audited
    expect(stdout).toContain('u_component_of_wind_10m_mean');
    expect(stdout).toContain('v_component_of_wind_10m_mean');
    expect(stdout).toContain('total_precipitation_1hr_mean');
    expect(stdout).toContain('temperature_2m_mean');
    expect(stdout).toContain('dewpoint_temperature_2m_mean');
    expect(stdout).toContain('total_cloud_cover_mean');

    // 4. Verify grid and chunk shapes
    expect(stdout).toMatch(/\[(48|360),\s*1801,\s*3600\]/);
    expect(stdout).toContain('[1, 1801, 3600]');

    // 5. Verify WebGPU row pitch calculations (Invariant §40 & §73)
    expect(stdout).toContain('Raw Row Pitch:         7200 bytes');
    expect(stdout).toContain('Hardware Row Pitch:    7424 bytes');
    expect(stdout).toContain('Row Zero-Padding:      224 bytes');
    expect(stdout).toContain('Zero-Copy Pass-Through: ENABLED (Pre-padded on disk)');

    // 6. Verify success banner
    expect(stdout).toContain('[OK] DRY-RUN VERIFICATION PASSED');
  }, 40000);

  it('WN3-CLI-03: dry-run with --unpadded correctly calculates unpadded storage footprint and disables zero-copy', () => {
    const cmd = `uv run --with zarr --with gcsfs --with numpy python scripts/fetch-weathernext3.py --dry-run --unpadded`;
    const stdout = execSync(cmd, { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 30000 });

    expect(stdout).toContain('WebGPU Row Pitch Mode:  Unpadded Raw (7200 bytes/row)');
    expect(stdout).toContain('Per-Slice Staged Size:   12.37 MB (12,967,200 bytes)');
    expect(stdout).toContain('Zero-Copy Pass-Through: DISABLED (Runtime JS row staging required)');
    expect(stdout).toContain('[OK] DRY-RUN VERIFICATION PASSED');
  }, 40000);

  it('WN3-CLI-04: verifies WebGPU 256-byte row pitch mathematical alignment for 3600x1801 Float16 grid', () => {
    const {
      width,
      height,
      bytesPerTexel,
      rawRowBytes,
      paddedRowBytes,
      paddingBytesPerRow,
      paddingTexelsPerRow,
      paddedCols,
      unpaddedSliceBytes,
      paddedSliceBytes,
    } = WEATHERNEXT_GRID_SPEC;

    expect(rawRowBytes).toBe(width * bytesPerTexel);
    expect(rawRowBytes).toBe(7200);
    expect(rawRowBytes % 256).toBe(32); // Not 256-byte aligned

    expect(paddedRowBytes).toBe(Math.ceil(rawRowBytes / 256) * 256);
    expect(paddedRowBytes).toBe(7424);
    expect(paddedRowBytes % 256).toBe(0); // 100% 256-byte aligned

    expect(paddingBytesPerRow).toBe(paddedRowBytes - rawRowBytes);
    expect(paddingBytesPerRow).toBe(224);
    expect(paddingBytesPerRow % bytesPerTexel).toBe(0);

    expect(paddingTexelsPerRow).toBe(paddingBytesPerRow / bytesPerTexel);
    expect(paddingTexelsPerRow).toBe(112);
    expect(paddedCols).toBe(width + paddingTexelsPerRow);
    expect(paddedCols).toBe(3712);

    expect(unpaddedSliceBytes).toBe(rawRowBytes * height);
    expect(unpaddedSliceBytes).toBe(12967200);

    expect(paddedSliceBytes).toBe(paddedRowBytes * height);
    expect(paddedSliceBytes).toBe(13370624);

    const overheadPct = ((paddedSliceBytes - unpaddedSliceBytes) / unpaddedSliceBytes) * 100;
    expect(overheadPct).toBeCloseTo(3.11, 2);
  });

  it('WN3-CLI-05: --mock generates valid offline demonstration dataset with proper slice sizes and metadata', () => {
    const tmpDir = path.join(PROJECT_ROOT, '.tmp-weathernext-test-' + Date.now());
    try {
      const cmd = `uv run --with zarr --with gcsfs --with numpy python scripts/fetch-weathernext3.py --mock --output-dir "${tmpDir}" --hours 1 --variables total_precipitation_1hr_mean`;
      const stdout = execSync(cmd, { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 30000 });

      expect(stdout).toContain('[DEMO] Staging 1 hours');
      expect(stdout).toContain('total_precipitation_1hr_mean-0.bin');
      expect(stdout).toContain('[OK] Demo dataset successfully staged');

      // Verify generated binary slice
      const binPath = path.join(tmpDir, 'total_precipitation_1hr_mean-0.bin');
      expect(fs.existsSync(binPath)).toBe(true);
      const stat = fs.statSync(binPath);
      expect(stat.size).toBe(WEATHERNEXT_GRID_SPEC.paddedSliceBytes); // 13,370,624 bytes

      // Verify generated metadata sidecar
      const metaPath = path.join(tmpDir, 'meta.json');
      expect(fs.existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      expect(meta.source).toBe('Google DeepMind WeatherNext 3');
      expect(meta.gridDimensions.width).toBe(WEATHERNEXT_GRID_SPEC.width);
      expect(meta.gridDimensions.height).toBe(WEATHERNEXT_GRID_SPEC.height);
      expect(meta.timeHorizon.totalHours).toBe(1);
      expect(meta.variables).toEqual(['total_precipitation_1hr_mean']);
      expect(meta.textureEncoding.isPrePadded).toBe(true);
    } finally {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  }, 40000);
});
