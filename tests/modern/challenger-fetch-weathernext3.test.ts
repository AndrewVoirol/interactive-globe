/**
 * tests/modern/challenger-fetch-weathernext3.test.ts
 *
 * Adversarial Challenger empirical stress-test suite for scripts/fetch-weathernext3.py.
 * Probes CLI flags, bounds checking, nonexistent cycles, custom variables,
 * dry-run zero-mutation guarantee, and exact row-pitch hardware arithmetic.
 */

import { describe, it, expect } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { WEATHERNEXT_GRID_SPEC } from '../../src/core/data/WeatherNextDataSource';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SCRIPT_PATH = path.join(PROJECT_ROOT, 'scripts', 'fetch-weathernext3.py');
const PUBLIC_WEATHERNEXT_DIR = path.join(PROJECT_ROOT, 'public', 'data', 'weathernext');

describe('Adversarial Challenge: scripts/fetch-weathernext3.py', () => {
  it('ADV-CLI-01: --help exits with code 0 and documents all essential CLI options', () => {
    const res = spawnSync('uv', ['run', '--with', 'zarr', '--with', 'gcsfs', '--with', 'numpy', 'python', SCRIPT_PATH, '--help'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('usage: fetch-weathernext3.py');
    expect(res.stdout).toContain('--dry-run');
    expect(res.stdout).toContain('--cycle');
    expect(res.stdout).toContain('--hours');
    expect(res.stdout).toContain('--variables');
    expect(res.stdout).toContain('--unpadded');
    expect(res.stdout).toContain('--force');
  });

  it('ADV-CLI-02: invalid flag exits with code 2 and usage error', () => {
    const res = spawnSync('uv', ['run', '--with', 'zarr', '--with', 'gcsfs', '--with', 'numpy', 'python', SCRIPT_PATH, '--nonexistent-flag'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('unrecognized arguments: --nonexistent-flag');
  });

  it('ADV-CLI-03: out-of-bounds --hours (0, -1, 361) exit with code 2 and range error', () => {
    const testCases = ['0', '-1', '361'];
    for (const val of testCases) {
      const res = spawnSync('uv', ['run', '--with', 'zarr', '--with', 'gcsfs', '--with', 'numpy', 'python', SCRIPT_PATH, '--hours', val], {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
      });
      expect(res.status).toBe(2);
      expect(res.stderr).toContain('--hours must be an integer between 1 and 360');
    }
  });

  it('ADV-CLI-04: multi-argument --hours (e.g. --hours 1 2 3) exits with code 2', () => {
    const res = spawnSync('uv', ['run', '--with', 'zarr', '--with', 'gcsfs', '--with', 'numpy', 'python', SCRIPT_PATH, '--hours', '1', '2', '3'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('unrecognized arguments: 2 3');
  });

  it('ADV-CLI-05: nonexistent cycle name throws ValueError and exits with non-zero code', () => {
    const res = spawnSync('uv', ['run', '--with', 'zarr', '--with', 'gcsfs', '--with', 'numpy', 'python', SCRIPT_PATH, '--dry-run', '--cycle', 'nonexistent_cycle_test_9999'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 30000,
    });
    expect(res.status).not.toBe(0);
    const combinedOutput = (res.stdout || '') + (res.stderr || '');
    expect(combinedOutput).toContain('ValueError: Requested cycle directory does not exist');
  }, 35000);

  it('ADV-CLI-06: invalid variable name throws KeyError and exits with non-zero code', () => {
    const res = spawnSync('uv', ['run', '--with', 'zarr', '--with', 'gcsfs', '--with', 'numpy', 'python', SCRIPT_PATH, '--dry-run', '--variables', 'completely_invalid_field'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 30000,
    });
    expect(res.status).not.toBe(0);
    const combinedOutput = (res.stdout || '') + (res.stderr || '');
    expect(combinedOutput).toContain("KeyError: \"Requested variable 'completely_invalid_field' not found in predictions.zarr!\"");
  }, 35000);

  it('ADV-CLI-07: custom variable subset and trailing comma whitespace executes cleanly', () => {
    const res = spawnSync('uv', ['run', '--with', 'zarr', '--with', 'gcsfs', '--with', 'numpy', 'python', SCRIPT_PATH, '--dry-run', '--hours', '1', '--variables', 'temperature_2m_mean, '], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 30000,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('temperature_2m_mean');
    expect(res.stdout).toContain('Total Tensors to Fetch: 1 slices (1 fields × 1 hours)');
    expect(res.stdout).toContain('[OK] DRY-RUN VERIFICATION PASSED');
  }, 35000);

  it('ADV-CLI-08: --dry-run guarantees zero filesystem mutation in public/data/weathernext/', () => {
    const existsBefore = fs.existsSync(PUBLIC_WEATHERNEXT_DIR);
    const filesBefore = existsBefore ? fs.readdirSync(PUBLIC_WEATHERNEXT_DIR) : [];

    const res = spawnSync('uv', ['run', '--with', 'zarr', '--with', 'gcsfs', '--with', 'numpy', 'python', SCRIPT_PATH, '--dry-run'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 30000,
    });
    expect(res.status).toBe(0);

    const existsAfter = fs.existsSync(PUBLIC_WEATHERNEXT_DIR);
    const filesAfter = existsAfter ? fs.readdirSync(PUBLIC_WEATHERNEXT_DIR) : [];

    expect(existsAfter).toBe(existsBefore);
    expect(filesAfter).toEqual(filesBefore);
  }, 35000);

  it('ADV-CLI-09: verifies mathematical parity of storage and row-pitch equations', () => {
    const {
      width: cols,
      height: rows,
      bytesPerTexel: texelBytes,
      rawRowBytes: rawPitch,
      paddedRowBytes: paddedPitch,
      paddingBytesPerRow: padBytes,
      unpaddedSliceBytes: unpaddedSlice,
      paddedSliceBytes: paddedSlice,
    } = WEATHERNEXT_GRID_SPEC;

    expect(rawPitch).toBe(7200);
    expect(paddedPitch).toBe(7424);
    expect(padBytes).toBe(224);
    expect(paddedPitch % 256).toBe(0);
    expect(unpaddedSlice).toBe(12967200);
    expect(paddedSlice).toBe(13370624);

    // 48 hours * 6 variables = 288 slices
    const totalSlices = 48 * 6;
    const totalPaddedBytes = totalSlices * paddedSlice;
    const totalUnpaddedBytes = totalSlices * unpaddedSlice;

    expect(totalPaddedBytes).toBe(3850739712);
    expect(totalUnpaddedBytes).toBe(3734553600);

    const paddedGB = totalPaddedBytes / (1024 * 1024 * 1024);
    const unpaddedGB = totalUnpaddedBytes / (1024 * 1024 * 1024);

    expect(paddedGB).toBeCloseTo(3.59, 2);
    expect(unpaddedGB).toBeCloseTo(3.48, 2);
  });

  it('ADV-CLI-10: verifies longitude rolling occurs prior to padding, preserving zero-padding purity and slice dimensions', () => {
    const pythonCode = `
import sys; sys.path.insert(0, 'scripts')
import importlib
fetch_wn = importlib.import_module('fetch-weathernext3')
import numpy as np

GRID_WIDTH = fetch_wn.GRID_WIDTH
GRID_HEIGHT = fetch_wn.GRID_HEIGHT
PADDED_COLS = fetch_wn.PADDED_COLS

# Create synthetic data with coordinate identifiers: lat * 10000 + lon
data = np.fromfunction(lambda r, c: (r + 1.0) * 1000.0 + (c + 1.0), (GRID_HEIGHT, GRID_WIDTH), dtype=np.float32)

# Production process_slice execution
padded_grid, padded_bytes = fetch_wn.process_slice(data, "u_component_of_wind_10m_mean", padded=True)
unpadded_grid, unpadded_bytes = fetch_wn.process_slice(data, "u_component_of_wind_10m_mean", padded=False)

# Assert slice dimensions
assert unpadded_grid.shape == (1801, 3600), f"Expected unpadded shape (1801, 3600), got {unpadded_grid.shape}"
assert padded_grid.shape == (1801, 3712), f"Expected padded shape (1801, 3712), got {padded_grid.shape}"

# Assert byte length matches WebGPU hardware requirements
assert len(padded_bytes) == 13370624, f"Padded byte length must be 13370624, got {len(padded_bytes)}"
assert len(unpadded_bytes) == 12967200, f"Unpadded byte length must be 12967200, got {len(unpadded_bytes)}"

# Assert all 112 padding columns across all 1801 rows are strictly zero
pad_slice = padded_grid[:, GRID_WIDTH:]
assert pad_slice.shape == (1801, 112)
assert np.count_nonzero(pad_slice) == 0, "Corrupted padding: non-zero values found in padding region!"
assert np.all(pad_slice == 0.0), "Padding region is not strictly zero!"

print("ADV-CLI-10 PASSED")
`;
    const res = spawnSync('uv', ['run', '--with', 'numpy', 'python', '-c', pythonCode], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 30000,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('ADV-CLI-10 PASSED');
  }, 35000);

  it('ADV-CLI-11: verifies longitude rolling correctly maps antimeridian to col 0 and prime meridian to col 1800', () => {
    const pythonCode = `
import sys; sys.path.insert(0, 'scripts')
import importlib
fetch_wn = importlib.import_module('fetch-weathernext3')
import numpy as np

raw = np.zeros((fetch_wn.GRID_HEIGHT, fetch_wn.GRID_WIDTH), dtype=np.float32)
# Tag Greenwich (Prime Meridian: lon 0.0) with marker 101.0
raw[:, 0] = 101.0
# Tag Antimeridian (lon 180.0) with marker 202.0
raw[:, 1800] = 202.0

# Process through production process_slice
unpadded_grid, _ = fetch_wn.process_slice(raw, "u_component_of_wind_10m_mean", padded=False)

# In rolled slice:
# Col 0 must be Antimeridian (-180.0 deg) -> marker 202.0
assert np.all(unpadded_grid[:, 0] == 202.0), "Column 0 is not the Antimeridian!"
# Col 1800 must be Prime Meridian (0.0 deg) -> marker 101.0
assert np.all(unpadded_grid[:, 1800] == 101.0), "Column 1800 is not the Prime Meridian!"

print("ADV-CLI-11 PASSED")
`;
    const res = spawnSync('uv', ['run', '--with', 'numpy', 'python', '-c', pythonCode], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 30000,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('ADV-CLI-11 PASSED');
  }, 35000);

  it('ADV-CLI-12: verifies physical unit conversions for temperature (K -> °C) and precipitation (m -> mm/hr)', () => {
    const pythonCode = `
import sys; sys.path.insert(0, 'scripts')
import importlib
fetch_wn = importlib.import_module('fetch-weathernext3')
import numpy as np

# 1. Temperature: 293.15 K -> 20.0 °C
raw_kelvin = np.full((fetch_wn.GRID_HEIGHT, fetch_wn.GRID_WIDTH), 293.15, dtype=np.float32)
temp_grid, _ = fetch_wn.process_slice(raw_kelvin, "temperature_2m_mean", padded=False)
assert np.allclose(temp_grid, 20.0, atol=0.05), f"Expected 20.0°C, got {temp_grid[0,0]}"

# 2. Dewpoint: 283.15 K -> 10.0 °C
dew_kelvin = np.full((fetch_wn.GRID_HEIGHT, fetch_wn.GRID_WIDTH), 283.15, dtype=np.float32)
dew_grid, _ = fetch_wn.process_slice(dew_kelvin, "dewpoint_temperature_2m_mean", padded=False)
assert np.allclose(dew_grid, 10.0, atol=0.05), f"Expected 10.0°C, got {dew_grid[0,0]}"

# 3. Precipitation: 0.025 m -> 25.0 mm/hr
raw_meters = np.full((fetch_wn.GRID_HEIGHT, fetch_wn.GRID_WIDTH), 0.025, dtype=np.float32)
precip_grid, _ = fetch_wn.process_slice(raw_meters, "total_precipitation_1hr_mean", padded=False)
assert np.allclose(precip_grid, 25.0, atol=0.05), f"Expected 25.0 mm/hr, got {precip_grid[0,0]}"

print("ADV-CLI-12 PASSED")
`;
    const res = spawnSync('uv', ['run', '--with', 'numpy', 'python', '-c', pythonCode], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 30000,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('ADV-CLI-12 PASSED');
  }, 35000);
});

