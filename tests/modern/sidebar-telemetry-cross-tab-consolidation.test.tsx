// @vitest-environment happy-dom
// ============================================================================
// File: tests/modern/sidebar-telemetry-cross-tab-consolidation.test.tsx
// Verification suite for consolidated cross-tab telemetry in SidebarTelemetry footer:
// 1. Manifold & Medium Provenance (Medium, Projection Mode, Manifold Deformation)
// 2. Atmospheric & Flight Kinematics (Stratum from camera altitude, NOAA Grid, Wind Vector Field)
// 3. Agentic navigation hooks (data-testid, aria labels, tooltips)
// 4. Compact single-line status reads & layout integrity
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SidebarTelemetry, SidebarTelemetryProps } from '../../src/components/hud/tabs/SidebarTelemetry';
import { ResolutionTier, SimulationMode } from '../../src/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('SidebarTelemetry Cross-Tab Telemetry Consolidation', () => {
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
    delete (window as any).__INDICATRIX_WEBGPU_ENGINE__;
    vi.restoreAllMocks();
  });

  const defaultProps: SidebarTelemetryProps = {
    theme: 1,
    resolution: '1M' as ResolutionTier,
    onResolutionChange: vi.fn(),
    latStr: '42.36°N',
    lonStr: '71.06°W',
    mapScaleStr: '1:10,000,000',
    fps: 60,
    backend: 'webgpu',
    gpuReport: {
      totalGpuMs: 4.2,
      computeMs: 1.1,
      reliefMs: 1.8,
      linesMs: 0.8,
      contoursMs: 0.5,
    },
  };

  describe('1. Manifold & Medium Provenance Readouts', () => {
    it('renders Marie Tharp medium name in Theme 0', async () => {
      await act(async () => {
        root.render(<SidebarTelemetry {...defaultProps} theme={0} />);
      });

      const mediumEl = container.querySelector('[data-testid="telemetry-medium"]');
      expect(mediumEl).not.toBeNull();
      expect(mediumEl?.textContent).toBe('Marie Tharp');
      expect(mediumEl?.getAttribute('title')).toContain('Marie Tharp (Physiographic)');
    });

    it('renders Cotton Rag medium name in Theme 1', async () => {
      await act(async () => {
        root.render(<SidebarTelemetry {...defaultProps} theme={1} />);
      });

      const mediumEl = container.querySelector('[data-testid="telemetry-medium"]');
      expect(mediumEl).not.toBeNull();
      expect(mediumEl?.textContent).toBe('Cotton Rag');
      expect(mediumEl?.getAttribute('title')).toContain('Cotton Rag (Swiss Relief)');
    });

    it('renders Prussian Cyanotype medium name in Theme 2', async () => {
      await act(async () => {
        root.render(<SidebarTelemetry {...defaultProps} theme={2} />);
      });

      const mediumEl = container.querySelector('[data-testid="telemetry-medium"]');
      expect(mediumEl).not.toBeNull();
      expect(mediumEl?.textContent).toBe('Cyanotype');
      expect(mediumEl?.getAttribute('title')).toContain('Prussian Cyanotype (Blueprint)');
    });

    it('promotes Purity mode when purityMode is true', async () => {
      await act(async () => {
        root.render(<SidebarTelemetry {...defaultProps} purityMode={true} />);
      });

      const mediumEl = container.querySelector('[data-testid="telemetry-medium"]');
      expect(mediumEl).not.toBeNull();
      expect(mediumEl?.textContent).toBe('Purity');
      expect(mediumEl?.getAttribute('title')).toContain('Purity Mode (Raw DEM Topography)');
    });

    it('renders projection modes across Linear, Scroll, Fracture, and Fluid', async () => {
      const modes: SimulationMode[] = [0, 1, 2, 3];
      const expectedNames = ['Linear', 'Scroll', 'Fracture', 'Fluid'];

      for (let i = 0; i < modes.length; i++) {
        await act(async () => {
          root.render(<SidebarTelemetry {...defaultProps} mode={modes[i]} />);
        });

        const projEl = container.querySelector('[data-testid="telemetry-projection"]');
        expect(projEl).not.toBeNull();
        expect(projEl?.textContent).toBe(expectedNames[i]);
      }
    });

    it('renders manifold deformation state for Spherical, Planar, and Morph', async () => {
      // Spherical (alpha < 0.02)
      await act(async () => {
        root.render(<SidebarTelemetry {...defaultProps} alpha={0.0} />);
      });
      let manifoldEl = container.querySelector('[data-testid="telemetry-manifold"]');
      expect(manifoldEl?.textContent).toBe('Spherical');

      // Planar (alpha > 0.98)
      await act(async () => {
        root.render(<SidebarTelemetry {...defaultProps} alpha={1.0} />);
      });
      manifoldEl = container.querySelector('[data-testid="telemetry-manifold"]');
      expect(manifoldEl?.textContent).toBe('Planar');

      // Morphing (alpha = 0.42)
      await act(async () => {
        root.render(<SidebarTelemetry {...defaultProps} alpha={0.42} />);
      });
      manifoldEl = container.querySelector('[data-testid="telemetry-manifold"]');
      expect(manifoldEl?.textContent).toBe('Morph (α=0.42)');
    });
  });

  describe('2. Atmospheric & Flight Kinematics Readouts', () => {
    it('computes stratum dynamically from camera distance in window.__INDICATRIX_CAMERA__', async () => {
      // 1. Orbital (>100 km altitude)
      (window as any).__INDICATRIX_CAMERA__ = {
        getCamDist: () => 15.0, // (15 - 5) * 1274.2 = 12,742 km
      };

      await act(async () => {
        root.render(<SidebarTelemetry {...defaultProps} />);
      });

      const stratumEl = container.querySelector('[data-testid="telemetry-stratum"]');
      expect(stratumEl).not.toBeNull();
      expect(stratumEl?.textContent).toBe('ORBITAL SPACE');

      // 2. Stratosphere (between 20 km and 100 km)
      (window as any).__INDICATRIX_CAMERA__ = {
        getCamDist: () => 5.0 + 35.0 / 1274.2, // ~35 km altitude
      };

      await act(async () => {
        root.unmount();
        root = createRoot(container);
        root.render(<SidebarTelemetry {...defaultProps} />);
      });

      const stratumEl2 = container.querySelector('[data-testid="telemetry-stratum"]');
      expect(stratumEl2?.textContent).toBe('STRATOSPHERE');
    });

    it('renders NOAA GFS / WeatherNext 3 Grid resolution', async () => {
      await act(async () => {
        root.render(<SidebarTelemetry {...defaultProps} />);
      });

      const gridEl = container.querySelector('[data-testid="telemetry-grid-resolution"]');
      expect(gridEl).not.toBeNull();
      expect(gridEl?.textContent).toBe('3600 × 1801 (0.1°)');
    });

    it('renders Wind Vector Field status reflecting isWindActive prop', async () => {
      // Wind active
      await act(async () => {
        root.render(<SidebarTelemetry {...defaultProps} isWindActive={true} />);
      });

      let windEl = container.querySelector('[data-testid="telemetry-wind-field"]');
      expect(windEl).not.toBeNull();
      expect(windEl?.textContent).toBe('rg16f (On)');
      expect(windEl?.className).toContain('theme-status-sage');

      // Wind inactive
      await act(async () => {
        root.render(<SidebarTelemetry {...defaultProps} isWindActive={false} />);
      });

      windEl = container.querySelector('[data-testid="telemetry-wind-field"]');
      expect(windEl?.textContent).toBe('Off');
      expect(windEl?.className).toContain('theme-text-muted');
    });
  });

  describe('3. Core Resolution, Geodetic Datum, and Profiler Continuity', () => {
    it('preserves resolution buttons and triggers onResolutionChange', async () => {
      const onResChangeMock = vi.fn();
      await act(async () => {
        root.render(<SidebarTelemetry {...defaultProps} onResolutionChange={onResChangeMock} />);
      });

      const btn4m = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('4M'));
      expect(btn4m).toBeDefined();

      await act(async () => {
        btn4m!.click();
      });

      expect(onResChangeMock).toHaveBeenCalledWith('4M');
    });

    it('displays geodetic center coordinate and scale with tabular numerals', async () => {
      await act(async () => {
        root.render(<SidebarTelemetry {...defaultProps} latStr="19.89°N" lonStr="155.58°W" mapScaleStr="1:250,000" />);
      });

      expect(container.textContent).toContain('19.89°N 155.58°W');
      expect(container.textContent).toContain('1:250,000');
    });

    it('displays GPU profiler timings and FPS badge', async () => {
      await act(async () => {
        root.render(<SidebarTelemetry {...defaultProps} fps={118} />);
      });

      expect(container.textContent).toContain('118');
      expect(container.textContent).toContain('FPS');
      expect(container.textContent).toContain('Total: 4.20ms');
      expect(container.textContent).toContain('Sim: 1.1ms');
      expect(container.textContent).toContain('Crust: 1.8ms');
      expect(container.textContent).toContain('Lines: 0.8ms');
      expect(container.textContent).toContain('Cont: 0.5ms');
    });
  });
});
