// ============================================================================
// File: tests/modern/stratospheric-telemetry-instrument.test.tsx
// Stratospheric Telemetry Caliper Instrument Tests
// Tests: Component rendering, telemetry rows, pitch presets, Rule 6 single-border
// ============================================================================

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { StratosphericTelemetryInstrument } from '../../src/components/hud/instruments/StratosphericTelemetryInstrument';
import { Vector3 } from '../../src/core/math/cameraMath';
import { computeManifoldHit } from '../../src/utils/raycast';
import { invertMacroChart } from '../../src/core/math/volumetricMath';

describe('StratosphericTelemetryInstrument', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (window as any).__INDICATRIX_CAMERA__;
    delete (window as any).__INDICATRIX_ENGINE__;
    delete (window as any).__INDICATRIX_SCRUB_ALPHA__;
    vi.restoreAllMocks();
  });

  it('renders with header and all telemetry metadata rows', async () => {
    await act(async () => {
      root.render(<StratosphericTelemetryInstrument theme={0} />);
    });

    const card = container.querySelector('[data-testid="stratospheric-telemetry-instrument"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('Stratospheric Telemetry');
    expect(card?.textContent).toContain('Cursor Target:');
    expect(card?.textContent).toContain('Camera Elevation:');
    expect(card?.textContent).toContain('Camera Pitch:');
    expect(card?.textContent).not.toContain('Hdg');
    expect(card?.textContent).not.toContain('60 FPS');
    expect(card?.textContent).toContain('Tropospheric Regime:');
    expect(card?.textContent).toContain('Current Stratum:');
    expect(card?.textContent).toContain('Raymarch Interval:');
    expect(card?.textContent).toContain('Raymarch Step Budget:');
    expect(card?.textContent).not.toContain('Forecast Cycle:');
    expect(card?.textContent).toContain('Strata Color Mode:');
    expect(card?.textContent).toContain('Grid Resolution:');
    expect(card?.textContent).toContain('Wind Vector Field:');

    // Regression Guard: Header must feature canonical pulsating status dot and live pitch readout
    const pulseDot = card?.querySelector('.bg-\\[var\\(--theme-pulse-indicator\\)\\]');
    expect(pulseDot).not.toBeNull();
    expect(card?.textContent).not.toContain('◬');
    expect(card?.textContent).toContain('Pitch:');
  });

  it('enforces tabular numerals on dynamic telemetry metrics for pixel-stable alignment', async () => {
    await act(async () => {
      root.render(<StratosphericTelemetryInstrument theme={0} />);
    });

    const card = container.querySelector('[data-testid="stratospheric-telemetry-instrument"]');
    expect(card).not.toBeNull();
    const tabularElements = card?.querySelectorAll('.tabular-nums');
    // Ensure all numeric readouts (elevation, pitch, interval, steps, resolution, cursor, header pitch) use tabular-nums
    expect(tabularElements && tabularElements.length).toBeGreaterThanOrEqual(6);
  });

  it('reflects Doppler Spectral vs Archival Ink Wash in Strata Color Mode row', async () => {
    await act(async () => {
      root.render(<StratosphericTelemetryInstrument theme={1} cloudFalseColor={true} />);
    });
    expect(container.textContent).toContain('Doppler Spectral');

    await act(async () => {
      root.render(<StratosphericTelemetryInstrument theme={1} cloudFalseColor={false} />);
    });
    expect(container.textContent).toContain('Archival Ink Wash');
  });

  it('renders quick pitch presets (0° Nadir, 45° Oblique, 78° Horizon, 85° Grazing) and fires onPitchChange', async () => {
    const pitchMock = vi.fn();
    await act(async () => {
      root.render(<StratosphericTelemetryInstrument theme={2} onPitchChange={pitchMock} />);
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const p78 = buttons.find((b) => b.textContent?.includes('78° Horizon'));
    expect(p78).toBeDefined();

    const p85 = buttons.find((b) => b.textContent?.includes('85° Grazing'));
    expect(p85).toBeDefined();
    // Regression Guard: Defensive lateral clearance on 11-char button label
    expect(p85?.className).toContain('tracking-tight');

    await act(async () => {
      p78!.click();
    });

    expect(pitchMock).toHaveBeenCalledWith(78.0);
  });

  it('conforms strictly to Rule 6 Single-Border HUD Enclosure and eliminates label collision', async () => {
    await act(async () => {
      root.render(<StratosphericTelemetryInstrument theme={0} />);
    });

    const card = container.querySelector('[data-testid="stratospheric-telemetry-instrument"]');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('bg-[var(--theme-card-bg)]');
    expect(card?.className).toContain('border-[var(--theme-card-border)]');
    expect(card?.querySelectorAll('.border-current\\/15, .inset-\\[2px\\]').length).toBe(0);

    // Regression Guard: VernierSlider must not introduce a nested border box within the HUD card
    const sliderContainer = card?.querySelector('#camera-horizon-pitch')?.closest('.p-2.rounded-\\[2px\\]');
    expect(sliderContainer?.className).toContain('!border-0');
    expect(sliderContainer?.className).toContain('!bg-transparent');

    // Regression Guard: Section subheader must not duplicate slider label
    expect(card?.textContent).not.toContain('HORIZON PITCH ANGLE');
    expect(card?.textContent).toContain('Camera Horizon Pitch');
  });

  it('updates cursor target coordinates continuously when activeCoords change', async () => {
    vi.useFakeTimers();
    (window as any).__INDICATRIX_CAMERA__ = {
      activeCoords: { lat: 35.6895, lon: 139.6917 },
      pitch: 15.0,
      getSpherical: () => ({ radius: 15.0 }),
    };

    await act(async () => {
      root.render(<StratosphericTelemetryInstrument theme={0} />);
      vi.advanceTimersByTime(150);
    });

    const card = container.querySelector('[data-testid="stratospheric-telemetry-instrument"]');
    expect(card?.textContent).toContain('35.69°N, 139.69°E');

    // Simulate drag / unfurl coordinate movement to Seattle / Puget Sound
    (window as any).__INDICATRIX_CAMERA__.activeCoords = { lat: 47.6062, lon: -122.3321 };

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(card?.textContent).toContain('47.61°N, 122.33°W');
    vi.useRealTimers();
  });

  it('updates tropospheric regime continuously across orbital, troposphere, and sub-cloud states', async () => {
    vi.useFakeTimers();
    let mockAltitudeUnits = 10.0; // Orbital space (h = 10 units)
    (window as any).__INDICATRIX_CAMERA__ = {
      activeCoords: { lat: 0, lon: 0 },
      pitch: 0,
      getCamDist: () => 5.0 + mockAltitudeUnits,
      getAltitudeUnits: () => mockAltitudeUnits,
    };

    await act(async () => {
      root.render(<StratosphericTelemetryInstrument theme={0} />);
      vi.advanceTimersByTime(150);
    });

    const card = container.querySelector('[data-testid="stratospheric-telemetry-instrument"]');
    expect(card?.textContent).toContain('REGIME 1: ORBITAL SPACE');

    // Descend into troposphere (h = 0.02 units, between 0 and 0.035)
    mockAltitudeUnits = 0.02;
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(card?.textContent).toContain('REGIME 2: INSIDE TROPOSPHERE');

    // Descend below cloud ceiling (h = -0.005 units)
    mockAltitudeUnits = -0.005;
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(card?.textContent).toContain('REGIME 3: SUB-CLOUD CEILING');

    vi.useRealTimers();
  });

  it('updates cursor coordinates and regime continuously while dragging and scrubbing unfurl slider', async () => {
    vi.useFakeTimers();
    let scrubAlpha = 0.0;
    (window as any).__INDICATRIX_SCRUB_ALPHA__ = scrubAlpha;

    const getHitAndInvert = (screenNdcX: number, screenNdcY: number, alpha: number) => {
      const rayOrig = new Vector3(screenNdcX * 2.0, screenNdcY * 2.0, 15);
      const rayDir = new Vector3(0, 0, -1);
      const { hitPos } = computeManifoldHit(rayOrig, rayDir, alpha, 5.0);
      const inv = invertMacroChart([hitPos.x, hitPos.y, hitPos.z], alpha, 5.0);
      let lon = inv.lambda * (180 / Math.PI);
      lon = ((((lon + 180) % 360) + 360) % 360) - 180;
      const lat = Math.max(-85, Math.min(85, inv.phi * (180 / Math.PI)));
      return { lat, lon, hitPos };
    };

    const initialCoord = getHitAndInvert(0, 0, 0.0);
    (window as any).__INDICATRIX_CAMERA__ = {
      activeCoords: { lat: initialCoord.lat, lon: initialCoord.lon },
      pitch: 0,
      getCamDist: () => 15.0,
      getAltitudeUnits: () => 10.0,
    };

    await act(async () => {
      root.render(<StratosphericTelemetryInstrument theme={0} />);
      vi.advanceTimersByTime(150);
    });

    const card = container.querySelector('[data-testid="stratospheric-telemetry-instrument"]');
    expect(card?.textContent).toContain('0.00°N, 0.00°E');
    expect(card?.textContent).toContain('REGIME 1: ORBITAL SPACE');

    // Scrub unfurl slider to 0.5 and move cursor / raycast to (0.5, 0.2)
    scrubAlpha = 0.5;
    (window as any).__INDICATRIX_SCRUB_ALPHA__ = scrubAlpha;
    const midCoord = getHitAndInvert(0.5, 0.2, scrubAlpha);
    expect(Number.isFinite(midCoord.lat)).toBe(true);
    expect(Number.isFinite(midCoord.lon)).toBe(true);

    (window as any).__INDICATRIX_CAMERA__.activeCoords = { lat: midCoord.lat, lon: midCoord.lon };
    // Camera zooms into troposphere during inspection
    (window as any).__INDICATRIX_CAMERA__.getCamDist = () => 5.025;

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(card?.textContent).not.toContain('Hover over globe...');
    expect(card?.textContent).toContain(`${Math.abs(midCoord.lat).toFixed(2)}°`);
    expect(card?.textContent).toContain('REGIME 2: INSIDE TROPOSPHERE');

    // Scrub unfurl slider to 1.0 (planar map) and move cursor
    scrubAlpha = 1.0;
    (window as any).__INDICATRIX_SCRUB_ALPHA__ = scrubAlpha;
    const flatCoord = getHitAndInvert(-0.8, -0.4, scrubAlpha);
    (window as any).__INDICATRIX_CAMERA__.activeCoords = { lat: flatCoord.lat, lon: flatCoord.lon };

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(card?.textContent).toContain(`${Math.abs(flatCoord.lat).toFixed(2)}°`);
    expect(card?.textContent).toContain(`${Math.abs(flatCoord.lon).toFixed(2)}°`);

    vi.useRealTimers();
  });
});
