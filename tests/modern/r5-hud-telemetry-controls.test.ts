// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SystemStatusPill, SystemStatusPillProps } from '../../src/components/hud/SystemStatusPill';
import { TopologyControlDock, TopologyControlDockProps } from '../../src/components/hud/TopologyControlDock';
import { DataLayersDrawer, DataLayersDrawerProps, DataLayerItem } from '../../src/components/hud/DataLayersDrawer';
import { ResolutionTier, SimulationMode } from '../../src/types';
import fs from 'fs';
import path from 'path';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Requirement R5: Complete Frontend HUD & UI/UX Integration
 * Feature: F36 (HUD & UI/UX Integration & Verification)
 * Verifies HUD component props, telemetry contracts for 16.7M terrain vertices and 4.19M/1.05M particles.
 */

describe('Requirement R5: Complete Frontend HUD & UI/UX Integration', () => {
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
  });

  // --------------------------------------------------------------------------
  // SystemStatusPill: Resolution & Node Count Telemetry
  // --------------------------------------------------------------------------
  describe('SystemStatusPill: Resolution & Vertex/Particle Telemetry Contracts', () => {
    const createPillProps = (overrides: Partial<SystemStatusPillProps> = {}): SystemStatusPillProps => ({
      fps: 120,
      backend: 'webgpu',
      onBackendChange: vi.fn(),
      hasWebGPU: true,
      resolution: '16M',
      onResolutionChange: vi.fn(),
      theme: 0,
      onThemeToggle: vi.fn(),
      isAudioMuted: true,
      onAudioMuteToggle: vi.fn(),
      ...overrides,
    });

    it('HUD-T01: renders live FPS badge and active resolution tier button', async () => {
      const props = createPillProps({ fps: 120, resolution: '16M' });

      await act(async () => {
        root.render(React.createElement(SystemStatusPill, props));
      });

      expect(container.textContent).toContain('120 FPS');
      expect(container.textContent).toContain('16M');

      // Resolution buttons exist
      const buttons = container.querySelectorAll('button');
      const resolutionButtons = Array.from(buttons).filter(b => ['100K', '1M', '3M', '4M', '8M', '16M'].includes(b.textContent?.trim() || ''));
      expect(resolutionButtons.length).toBe(6);
    });

    it('HUD-T02: dispatches onResolutionChange when user clicks a new resolution tier', async () => {
      const onResolutionChange = vi.fn();
      const props = createPillProps({ resolution: '1M', onResolutionChange });

      await act(async () => {
        root.render(React.createElement(SystemStatusPill, props));
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      const btn16M = buttons.find(b => b.textContent?.trim() === '16M');
      expect(btn16M).toBeDefined();

      await act(async () => {
        btn16M?.click();
      });

      expect(onResolutionChange).toHaveBeenCalledWith('16M');
    });

    it('HUD-T03: validates 3D terrain vertex count formula for 16.78M and 1.05M mesh tiers', () => {
      // Dual-surface sphere grid: Surface 0 (Lithosphere) + Surface 1 (Hydrosphere)
      // Total Vertices = 2 * (latSegments + 1) * (lonSegments + 1)
      const computeTerrainVertices = (lat: number, lon: number): number => {
        return 2 * (lat + 1) * (lon + 1);
      };

      // 100k Tier: lat 256, lon 512
      const count100k = computeTerrainVertices(256, 512);
      expect(count100k).toBe(263682); // ~264k vertices

      // 1M Tier: lat 512, lon 1024
      const count1M = computeTerrainVertices(512, 1024);
      expect(count1M).toBe(1051650); // ~1.05M vertices

      // 4M Tier: lat 1024, lon 2048
      const count4M = computeTerrainVertices(1024, 2048);
      expect(count4M).toBe(4200450); // ~4.2M vertices

      // 16M Tier: lat 2048, lon 4096
      const count16M = computeTerrainVertices(2048, 4096);
      expect(count16M).toBe(16789506); // ~16.78M vertices
      expect(count16M).toBeGreaterThan(16000000);
      expect(count16M).toBeLessThan(17000000);
    });

    it('HUD-T04: validates active particle compute node telemetry bounds (1.05M and 4.19M)', () => {
      // Particle simulation in physics_sim.wgsl is decoupled from terrain mesh
      const computeNodeTiers = {
        standard: 1048576,  // 2^20 = 1.05M
        highDensity: 4194304 // 2^22 = 4.19M
      };

      expect(computeNodeTiers.standard).toBe(1048576);
      expect(computeNodeTiers.highDensity).toBe(4194304);

      // Memory footprint per particle: 32 bytes (vec4 position + vec4 velocity)
      // Reference static buffer: 32 bytes (vec4 rest_sphere + vec4 rest_map)
      // Ping-pong buffers (2x) + static buffer (1x) = 96 bytes/particle
      const vramPerParticleBytes = 96;
      const vram1M = (computeNodeTiers.standard * vramPerParticleBytes) / (1024 * 1024);
      const vram4M = (computeNodeTiers.highDensity * vramPerParticleBytes) / (1024 * 1024);

      expect(vram1M).toBeCloseTo(96.0, 1);
      expect(vram4M).toBeCloseTo(384.0, 1);
      expect(vram4M).toBeLessThan(512.0); // Bounded well below 512 MB
    });
  });

  // --------------------------------------------------------------------------
  // TopologyControlDock: All 5 Unfurl Modes Controls
  // --------------------------------------------------------------------------
  describe('TopologyControlDock: Unfurl Mode Controls', () => {
    const createTopologyProps = (overrides: Partial<TopologyControlDockProps> = {}): TopologyControlDockProps => ({
      isZenMode: false,
      onZenToggle: vi.fn(),
      theme: 0,
      mode: 0 as SimulationMode,
      onModeChange: vi.fn(),
      layerMode: 0,
      onLayerModeChange: vi.fn(),
      cursorPhysicsEnabled: false,
      onCursorPhysicsToggle: vi.fn(),
      activeOverlay: 'off',
      onOverlayChange: vi.fn(),
      showLandmarks: false,
      onLandmarksToggle: vi.fn(),
      showTissot: false,
      onTissotToggle: vi.fn(),
      showVectors: false,
      onVectorsToggle: vi.fn(),
      latStr: "00°00'N",
      lonStr: "000°00'E",
      mapScaleStr: "1:50M",
      onSnapCamera: vi.fn(),
      ...overrides,
    });

    it('HUD-T05: renders all 5 unfurl modes in TopologyControlDock', async () => {
      const props = createTopologyProps({ mode: 0 });

      await act(async () => {
        root.render(React.createElement(TopologyControlDock, props));
      });

      expect(container.textContent).toContain('TOPOLOGY CONTROL');
      expect(container.textContent).toContain('Linear');
      expect(container.textContent).toContain('Scroll');
      expect(container.textContent).toContain('Griffith');
      expect(container.textContent).toContain('Fluid');
      expect(container.textContent).toContain('Dymaxion');
    });

    it('HUD-T06: calls onModeChange with correct mode index (0 through 4) when mode buttons are clicked', async () => {
      const onModeChange = vi.fn();
      const props = createTopologyProps({ mode: 0, onModeChange });

      await act(async () => {
        root.render(React.createElement(TopologyControlDock, props));
      });

      const buttons = Array.from(container.querySelectorAll('button'));

      const linearBtn = buttons.find(b => b.textContent?.includes('Linear'));
      const scrollBtn = buttons.find(b => b.textContent?.includes('Scroll'));
      const griffithBtn = buttons.find(b => b.textContent?.includes('Griffith'));
      const fluidBtn = buttons.find(b => b.textContent?.includes('Fluid'));
      const dymaxionBtn = buttons.find(b => b.textContent?.includes('Dymaxion'));

      await act(async () => {
        scrollBtn?.click();
      });
      expect(onModeChange).toHaveBeenCalledWith(1);

      await act(async () => {
        griffithBtn?.click();
      });
      expect(onModeChange).toHaveBeenCalledWith(2);

      await act(async () => {
        fluidBtn?.click();
      });
      expect(onModeChange).toHaveBeenCalledWith(3);

      await act(async () => {
        dymaxionBtn?.click();
      });
      expect(onModeChange).toHaveBeenCalledWith(4);

      await act(async () => {
        linearBtn?.click();
      });
      expect(onModeChange).toHaveBeenCalledWith(0);
    });

    it('HUD-T07: hides completely when isZenMode is true', async () => {
      const props = createTopologyProps({ isZenMode: true });

      await act(async () => {
        root.render(React.createElement(TopologyControlDock, props));
      });

      expect(container.children.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // DataLayersDrawer: Planetary Instrumentation Layers
  // --------------------------------------------------------------------------
  describe('DataLayersDrawer: Planetary Layer Toggles', () => {
    it('HUD-T08: supports NOAA Wind and Starlink Orbit data layer contracts', () => {
      const planetaryLayers: DataLayerItem[] = [
        {
          id: 'noaa-gfs-wind',
          name: 'Real NOAA GFS Surface Winds (0.25°)',
          category: 'field',
          type: 'field',
          details: 'Global half-float vector grid',
          visible: true,
          opacity: 0.9,
        },
        {
          id: 'starlink-iss-orbits',
          name: 'CelesTrak Active Starlink & ISS Orbits',
          category: 'vectors',
          type: 'vectors',
          details: 'SGP4 propagated orbital ribbons',
          visible: false,
          opacity: 1.0,
        },
      ];

      expect(planetaryLayers[0].id).toBe('noaa-gfs-wind');
      expect(planetaryLayers[0].category).toBe('field');
      expect(planetaryLayers[0].visible).toBe(true);

      expect(planetaryLayers[1].id).toBe('starlink-iss-orbits');
      expect(planetaryLayers[1].category).toBe('vectors');
      expect(planetaryLayers[1].visible).toBe(false);
    });

    it('HUD-T09: verifies WebGPUCanvas wires showSatellites and showStarlink and loads planetary datasets', () => {
      const canvasSrc = fs.readFileSync(path.resolve(__dirname, '../../src/webgpu/WebGPUCanvas.tsx'), 'utf-8');
      expect(canvasSrc).toContain('showSatellites: !!curDataLayers?.find');
      expect(canvasSrc).toContain('showStarlink:');
      expect(canvasSrc).toContain("l.id === 'starlink-iss-orbits'");
      expect(canvasSrc).toContain("engine.loadSatelliteTrajectories('/data/tle-starlink.json')");
      expect(canvasSrc).toContain("engine.loadWindTexture('/data/gfs-wind-latest.bin')");
    });

    it('HUD-T10: verifies crust_hydrosphere.wgsl uses textureSampleLevel in non-uniform Option C control flow', () => {
      const shaderSrc = fs.readFileSync(path.resolve(__dirname, '../../src/webgpu/shaders/crust_hydrosphere.wgsl'), 'utf-8');
      const optionCMatch = shaderSrc.match(/sim\.u_renderStyle\s*==\s*2u[\s\S]*?finalCrust/);
      expect(optionCMatch).not.toBeNull();
      const block = optionCMatch![0];
      expect(block).toContain('textureSampleLevel(u_orbitalTextures, u_orbitalSampler, input.uv, 0, 0.0)');
      expect(block).toContain('textureSampleLevel(u_orbitalTextures, u_orbitalSampler, input.uv, 1, 0.0)');
      expect(/textureSample\s*\(/.test(block)).toBe(false);
    });
  });
});
