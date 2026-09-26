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
    expect(card?.textContent).toContain('Camera Pitch / Hdg:');
    expect(card?.textContent).toContain('Tropospheric Regime:');
    expect(card?.textContent).toContain('Current Stratum:');
    expect(card?.textContent).toContain('Raymarch Interval:');
    expect(card?.textContent).toContain('Forecast Cycle:');
    expect(card?.textContent).toContain('Strata Color Mode:');
    expect(card?.textContent).toContain('Grid Resolution:');
    expect(card?.textContent).toContain('Wind Vector Field:');
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

    await act(async () => {
      p78!.click();
    });

    expect(pitchMock).toHaveBeenCalledWith(78.0);
  });

  it('conforms strictly to Rule 6 Single-Border HUD Enclosure', async () => {
    await act(async () => {
      root.render(<StratosphericTelemetryInstrument theme={0} />);
    });

    const card = container.querySelector('[data-testid="stratospheric-telemetry-instrument"]');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('bg-[var(--theme-card-bg)]');
    expect(card?.className).toContain('border-[var(--theme-card-border)]');
    expect(card?.querySelectorAll('.border-current\\/15, .inset-\\[2px\\]').length).toBe(0);
  });
});
