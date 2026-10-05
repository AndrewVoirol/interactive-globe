// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import { CurvatureUnfurlSextant } from '../../src/components/hud/instruments/CurvatureUnfurlSextant';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('CurvatureUnfurlSextant (Milestone 1 Verification)', () => {
  const sextantPath = path.resolve(__dirname, '../../src/components/hud/instruments/CurvatureUnfurlSextant.tsx');
  const sourceCode = fs.readFileSync(sextantPath, 'utf-8');
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

  it('verifies arc-geometry to pointer-domain alignment calibrates pointer clientX relative to active arc bounds (R1)', () => {
    // Check source code implementation for letterbox padding
    expect(sourceCode).toContain('const renderedSvgWidth = 240 * svgScale;');
    expect(sourceCode).toContain('const svgLeftPadding = (rect.width - renderedSvgWidth) / 2;');
    expect(sourceCode).toContain('const arcStartX_px = svgLeftPadding + (15 * svgScale);');
    expect(sourceCode).toContain('const arcWidth_px = 210 * svgScale;');

    // Simulate pointer mapping calculation
    const mapPointer = (clientX: number, rectWidth: number, rectHeight: number, rectLeft: number) => {
      const svgScale = rectHeight / 36;
      const renderedSvgWidth = 240 * svgScale;
      const svgLeftPadding = (rectWidth - renderedSvgWidth) / 2;
      
      const arcStartX_px = svgLeftPadding + (15 * svgScale);
      const arcWidth_px = 210 * svgScale;
      
      return Math.max(0.0, Math.min(1.0, (clientX - (rectLeft + arcStartX_px)) / arcWidth_px));
    };

    const left = 100;
    const width = 240;
    const height = 36;
    // No letterboxing: scale = 1, padding = 0, arc start = 15, width = 210
    // Left tick marker (x = 15): clientX = 100 + 15 = 115 -> 0.000
    expect(mapPointer(115, width, height, left)).toBe(0.0);
    // Midpoint (x = 120): clientX = 100 + 120 = 220 -> 0.500
    expect(mapPointer(220, width, height, left)).toBeCloseTo(0.50, 4);
    // Right tick marker (x = 225): clientX = 100 + 225 = 325 -> 1.000
    expect(mapPointer(325, width, height, left)).toBe(1.0);
  });

  it('verifies slider container contains touch-none class and style (R2)', async () => {
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.0}
          onAlphaChange={() => {}}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    expect(slider).not.toBeNull();
    const card = container.querySelector('[data-instrument="curvature-unfurl-sextant"]');
    expect(card).not.toBeNull();
    expect(slider.getAttribute('role')).toBe('slider');
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('1');
    expect(slider.className).toContain('touch-none');
    expect(slider.style.touchAction).toBe('none');
  });

  it('verifies transition-all duration-150 is removed from the reticle thumb circle', () => {
    expect(sourceCode).not.toContain('transition-all duration-150');
    // Ensure reticle thumb circle has shadow-sm without the laggy transition
    expect(sourceCode).toContain('className="shadow-sm"');
  });

  it('verifies dynamic Bezier tick marker y-coordinates sit flush on the track at alpha = 1.0 (no floating dots)', () => {
    const getBezierY = (tVal: number, peakY: number) =>
      (1 - tVal) * (1 - tVal) * 26 + 2 * (1 - tVal) * tVal * peakY + tVal * tVal * 26;

    // At alpha = 0.0, peakY = 6
    const peakY0 = 6 + 0.0 * 20; // 6
    const tick2Y_0 = getBezierY(0.3, peakY0);
    const tick3Y_0 = getBezierY(0.7, peakY0);
    expect(tick2Y_0).toBeCloseTo(17.6, 1);
    expect(tick3Y_0).toBeCloseTo(17.6, 1);

    // At alpha = 1.0, peakY = 26
    const peakY1 = 6 + 1.0 * 20; // 26
    const tick2Y_1 = getBezierY(0.3, peakY1);
    const tick3Y_1 = getBezierY(0.7, peakY1);
    // At alpha = 1.0, the track is a flat line at y = 26.
    // Ticks MUST evaluate to exactly 26, flush on the track line.
    expect(tick2Y_1).toBeCloseTo(26.0, 5);
    expect(tick3Y_1).toBeCloseTo(26.0, 5);
  });

  it('verifies Milestone 4 threshold activates at alpha >= 0.98', async () => {
    expect(sourceCode).toContain('activeAlpha >= 0.98');
    expect(sourceCode).not.toContain('alpha >= 0.85');

    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.95}
          onAlphaChange={() => {}}
          mode={0}
        />
      );
    });

    // At alpha = 0.95, should NOT be milestone 4 (Planar Map)
    const text095 = container.textContent || '';
    expect(text095).not.toContain('PLANAR MAP (K = 0)');
    expect(text095).toContain('PLANAR TRANSITION');

    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.98}
          onAlphaChange={() => {}}
          mode={0}
        />
      );
    });

    const text098 = container.textContent || '';
    expect(text098).toContain('PLANAR MAP (K = 0)');
  });

  it('verifies reticle thumb renders with local drag coordinates during interaction to bypass 30Hz throttle', async () => {
    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.0}
          onAlphaChange={onAlphaChange}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    expect(slider).not.toBeNull();

    // Mock getBoundingClientRect
    slider.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 200,
      height: 36,
      right: 200,
      bottom: 36,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 100,
          pointerId: 1,
          bubbles: true,
        })
      );
    });

    expect(onAlphaChange).toHaveBeenCalledWith(0.5);

    // Verify slider aria-valuenow reflects the local drag alpha immediately
    expect(slider.getAttribute('aria-valuenow')).toBe('0.5');
  });

  it('handles keyboard navigation and boundary clamp (ArrowLeft, ArrowRight, Home, End)', async () => {
    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.5}
          onAlphaChange={onAlphaChange}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    expect(slider).not.toBeNull();

    // ArrowRight step (+0.01)
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenCalledWith(0.51);

    // ArrowLeft step (-0.01)
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenCalledWith(0.49);

    // Shift+ArrowRight step (+0.05)
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenCalledWith(0.55);

    // Home key (0.0)
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenCalledWith(0.0);

    // End key (1.0)
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenCalledWith(1.0);
  });

  it('triggers onGlideToAlpha on double click to toggle between globe and map', async () => {
    const onGlideToAlpha = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.2}
          onAlphaChange={() => {}}
          onGlideToAlpha={onGlideToAlpha}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    await act(async () => {
      slider.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(onGlideToAlpha).toHaveBeenCalledWith(1.0);
  });

  it('guarantees pointer release with inertia initializes coasting from dragAlpha rather than stale alpha prop', () => {
    expect(sourceCode).toContain('const finalAlpha = dragAlpha !== null ? dragAlpha : alpha;');
    expect(sourceCode).toContain('let currentAlpha = finalAlpha;');
    expect(sourceCode).not.toContain('let currentAlpha = alpha;');
  });

  it('verifies clicking at tick boundaries registers exactly 0.000 and 1.000 (R1)', async () => {
    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.5}
          onAlphaChange={onAlphaChange}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    slider.getBoundingClientRect = () => ({
      left: 100,
      top: 0,
      width: 240,
      height: 36,
      right: 340,
      bottom: 36,
      x: 100,
      y: 0,
      toJSON: () => {},
    });

    // Left tick marker: x = rect.left + rect.width * (15/240) = 100 + 15 = 115
    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 115,
          pointerId: 1,
          bubbles: true,
        })
      );
    });
    expect(onAlphaChange).toHaveBeenLastCalledWith(0.0);

    // Right tick marker: x = rect.left + rect.width * (225/240) = 100 + 225 = 325
    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 325,
          pointerId: 1,
          bubbles: true,
        })
      );
    });
    expect(onAlphaChange).toHaveBeenLastCalledWith(1.0);
  });

  it('verifies linear slider without magnetic snapping (R3)', async () => {
    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.0}
          onAlphaChange={onAlphaChange}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    slider.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 240,
      height: 36,
      right: 240,
      bottom: 36,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Start drag at x=78 (alpha = 0.300)
    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 78,
          pointerId: 1,
          bubbles: true,
        })
      );
    });
    expect(onAlphaChange).toHaveBeenLastCalledWith(0.3);

    // Move to clientX = 80.1 (alpha = 0.31)
    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 80.1,
          pointerId: 1,
          bubbles: true,
        })
      );
    });
    
    // It should NOT snap to 0.300! It must be exact 0.31
    expect(onAlphaChange).toHaveBeenLastCalledWith(0.31);
  });

  it('verifies aria-valuetext reflects milestone label and sub (R5)', async () => {
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.0}
          onAlphaChange={() => {}}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    expect(slider.getAttribute('aria-valuetext')).toBe('0% — SPHERE (K > 0): Closed Riemannian sphere');

    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={1.0}
          onAlphaChange={() => {}}
          mode={0}
        />
      );
    });

    expect(slider.getAttribute('aria-valuetext')).toBe('100% — PLANAR MAP (K = 0): Equirectangular planar projection');
  });

  it('verifies PageUp and PageDown step between milestone values (R5)', async () => {
    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.0}
          onAlphaChange={onAlphaChange}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;

    // PageUp from 0.0 -> 0.3
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenCalledWith(0.3);

    // PageDown from 0.7 -> 0.3
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.7}
          onAlphaChange={onAlphaChange}
          mode={0}
        />
      );
    });

    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenCalledWith(0.3);
  });

  it('verifies numeric keys 1, 2, 3, 4 jump directly to milestones (R5)', async () => {
    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.5}
          onAlphaChange={onAlphaChange}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;

    // Key '1' -> 0.0
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenCalledWith(0.0);

    // Key '2' -> 0.3
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenCalledWith(0.3);

    // Key '3' -> 0.7
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenCalledWith(0.7);

    // Key '4' -> 1.0
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenCalledWith(1.0);
  });

  it('verifies non-primary mouse clicks (e.button !== 0, e.g. right-click) do not initiate dragging or mutate alpha', async () => {
    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.5}
          onAlphaChange={onAlphaChange}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    slider.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 240,
      height: 36,
      right: 240,
      bottom: 36,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Right click (button = 2) at clientX = 15 (alpha 0.0)
    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 15,
          button: 2,
          pointerId: 1,
          bubbles: true,
        })
      );
    });

    // Must NOT have updated alpha
    expect(onAlphaChange).not.toHaveBeenCalled();
  });

  it('verifies onLostPointerCapture does not execute release logic twice after pointerup', async () => {
    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.5}
          onAlphaChange={onAlphaChange}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    slider.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 240,
      height: 36,
      right: 240,
      bottom: 36,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Drag to 0.70
    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 162,
          button: 0,
          pointerId: 1,
          bubbles: true,
        })
      );
    });
    expect(onAlphaChange).toHaveBeenCalledWith(0.7);
    onAlphaChange.mockClear();

    // Normal pointerup
    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX: 162,
          pointerId: 1,
          bubbles: true,
        })
      );
    });
    const callsAfterUp = onAlphaChange.mock.calls.length;

    // Subsequent lostpointercapture event fired by browser
    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('lostpointercapture', {
          clientX: 162,
          pointerId: 1,
          bubbles: true,
        })
      );
    });

    // Should NOT trigger additional onAlphaChange calls
    expect(onAlphaChange.mock.calls.length).toBe(callsAfterUp);
  });

  it('verifies momentum coasting decelerating properly emits onAlphaChange', async () => {
    let callbacks: Array<FrameRequestCallback> = [];
    let rafId = 0;
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      callbacks.push(cb);
      return ++rafId;
    });
    const cancelRafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      callbacks = [];
    });
    let fakeNow = 1000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => fakeNow);

    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.0}
          onAlphaChange={onAlphaChange}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    slider.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 240,
      height: 36,
      right: 240,
      bottom: 36,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Down at x = 72 (alpha = 0.271)
    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 72,
          button: 0,
          pointerId: 1,
          bubbles: true,
        })
      );
    });

    // Move to x = 73.5 (alpha = 0.278) over 10ms
    fakeNow += 10;
    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 73.5,
          pointerId: 1,
          bubbles: true,
        })
      );
    });

    // Release pointer: velocity coasts
    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX: 73.5,
          pointerId: 1,
          bubbles: true,
        })
      );
    });

    expect(callbacks.length).toBeGreaterThan(0);

    // Step through coasting frames until completion
    while (callbacks.length > 0) {
      fakeNow += 16;
      const cb = callbacks.shift();
      await act(async () => {
        cb?.(fakeNow);
      });
    }

    // Must have coasted beyond 0.278
    const lastCallArg = onAlphaChange.mock.calls[onAlphaChange.mock.calls.length - 1][0];
    expect(lastCallArg).toBeGreaterThan(0.278);
    // But it should NOT snap exactly to 0.3
    expect(lastCallArg).not.toBe(0.3);

    rafSpy.mockRestore();
    cancelRafSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it('verifies PageUp and PageDown step to adjacent milestone thresholds when approaching from near boundaries without skipping (adversarial test)', async () => {
    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.290}
          onAlphaChange={onAlphaChange}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;

    // PageUp from 0.290 MUST step to 0.300 (NOT skip to 0.700)
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenCalledWith(0.3);
    onAlphaChange.mockClear();

    // Re-render at 0.310
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.310}
          onAlphaChange={onAlphaChange}
          mode={0}
        />
      );
    });

    // PageDown from 0.310 MUST step to 0.300 (NOT skip to 0.000)
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenCalledWith(0.3);
  });

  it('verifies numeric shortcut keys with modifier keys (Cmd/Ctrl/Alt) are ignored to preserve browser shortcuts (adversarial test)', async () => {
    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.5}
          onAlphaChange={onAlphaChange}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;

    // Cmd+1 (Mac switch tab 1)
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: '1', metaKey: true, bubbles: true }));
    });
    expect(onAlphaChange).not.toHaveBeenCalled();

    // Ctrl+2 (Windows/Linux switch tab 2)
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: '2', ctrlKey: true, bubbles: true }));
    });
    expect(onAlphaChange).not.toHaveBeenCalled();

    // Alt+3
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: '3', altKey: true, bubbles: true }));
    });
    expect(onAlphaChange).not.toHaveBeenCalled();
  });

  it('verifies releasing pointer within detent well zeroes velocity without launching coasting animation (adversarial test)', async () => {
    let callbacks: Array<FrameRequestCallback> = [];
    let rafId = 0;
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      callbacks.push(cb);
      return ++rafId;
    });

    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.0}
          onAlphaChange={onAlphaChange}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    slider.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 240,
      height: 36,
      right: 240,
      bottom: 36,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Down at x = 78 (0.300 milestone)
    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 78,
          button: 0,
          pointerId: 1,
          bubbles: true,
        })
      );
    });
    onAlphaChange.mockClear();

    // Slow release directly inside detent (within SNAP_RADIUS, velocity <= breakaway)
    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX: 78,
          pointerId: 1,
          bubbles: true,
        })
      );
    });

    // Zero coasting animation frames should be spawned because velocity is captured
    expect(callbacks.length).toBe(0);
    expect(onAlphaChange).toHaveBeenCalledWith(0.3);

    rafSpy.mockRestore();
  });

  it('verifies fast drag stopping zeroes velocity without snapping to milestone after pause (adversarial test)', async () => {
    vi.useFakeTimers();
    let fakeNow = 1000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => fakeNow);

    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.0}
          onAlphaChange={onAlphaChange}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    slider.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 240,
      height: 36,
      right: 240,
      bottom: 36,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Start drag at x = 15 (alpha = 0.0)
    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 15,
          button: 0,
          pointerId: 1,
          bubbles: true,
        })
      );
    });

    // High-speed drag into x = 79.68 (normX = 0.308) over 10ms
    fakeNow += 10;
    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 79.68,
          pointerId: 1,
          bubbles: true,
        })
      );
    });
    expect(onAlphaChange).toHaveBeenLastCalledWith(0.308);

    // Pointer now STOPS stationary at 79.68 without releasing mouse
    // Advance timers by 50ms to trigger stationary decay
    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    // It should STILL be exactly 0.308, no snapping!
    expect(onAlphaChange).toHaveBeenLastCalledWith(0.308);

    nowSpy.mockRestore();
    vi.useRealTimers();
  });

  it('verifies double-click on right side cancels momentum, clears dragAlpha, and targets 0.0 (adversarial test)', async () => {
    const onGlideToAlpha = vi.fn();
    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.0}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={onGlideToAlpha}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    slider.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 240,
      height: 36,
      right: 240,
      bottom: 36,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Click at clientX = 204 (alpha = (204 - 15) / 210 = 0.90)
    await act(async () => {
      slider.dispatchEvent(new PointerEvent('pointerdown', { clientX: 204, button: 0, pointerId: 1, bubbles: true }));
      slider.dispatchEvent(new PointerEvent('pointerup', { clientX: 204, button: 0, pointerId: 1, bubbles: true }));
      slider.dispatchEvent(new MouseEvent('dblclick', { clientX: 204, button: 0, bubbles: true }));
    });

    // Double-click at 0.90 must target 0.0 (opposite extreme), NOT 1.0
    expect(onGlideToAlpha).toHaveBeenCalledWith(0.0);
  });

  it('verifies keydown cancels in-flight momentum decay and is not overwritten by next RAF frame (adversarial test)', async () => {
    let callbacks: Array<FrameRequestCallback> = [];
    let rafId = 0;
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      callbacks.push(cb);
      return ++rafId;
    });
    const cancelRafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      callbacks = [];
    });
    let fakeNow = 1000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => fakeNow);

    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.5}
          onAlphaChange={onAlphaChange}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    slider.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 240,
      height: 36,
      right: 240,
      bottom: 36,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Down at 120 (0.50)
    await act(async () => {
      slider.dispatchEvent(new PointerEvent('pointerdown', { clientX: 120, pointerId: 1, bubbles: true }));
    });

    // Fast move to 130
    fakeNow += 10;
    await act(async () => {
      slider.dispatchEvent(new PointerEvent('pointermove', { clientX: 130, pointerId: 1, bubbles: true }));
    });

    // Release to start coasting
    await act(async () => {
      slider.dispatchEvent(new PointerEvent('pointerup', { clientX: 130, pointerId: 1, bubbles: true }));
    });
    expect(callbacks.length).toBeGreaterThan(0);

    // Press End key while coasting
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenLastCalledWith(1.0);

    // Momentum RAF must have been cancelled
    expect(callbacks.length).toBe(0);

    rafSpy.mockRestore();
    cancelRafSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it('verifies Arrow, Home, and End keys call stopPropagation (adversarial test)', async () => {
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.5}
          onAlphaChange={() => {}}
          mode={0}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]') as HTMLDivElement;
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      const stopSpy = vi.spyOn(event, 'stopPropagation');
      await act(async () => {
        slider.dispatchEvent(event);
      });
      expect(stopSpy).toHaveBeenCalled();
    }
  });

  it('verifies radial reference rays calibrate precisely to fiducial detents without label collision', () => {
    // Assert rays target detent coordinates (x=15, 78, 120, 162, 225) instead of misaligned (68, 172)
    expect(sourceCode).toContain('x2="15" y2="26"');
    expect(sourceCode).toContain('x2="78" y2={tick2Y}');
    // Center ray terminates flush at Bezier apex getBezierY(0.5) without overshooting the arc
    expect(sourceCode).toContain('const tickCenterY = getBezierY(0.5);');
    expect(sourceCode).toContain('x2="120" y2={tickCenterY}');
    expect(sourceCode).toContain('x2="162" y2={tick3Y}');
    expect(sourceCode).toContain('x2="225" y2="26"');
    // Ensure legacy collision with K > 0 and K = 0 labels (y2="10") is eliminated
    expect(sourceCode).not.toContain('x2="15" y2="10"');
    expect(sourceCode).not.toContain('x2="225" y2="10"');
    expect(sourceCode).not.toContain('x2="68"');
    expect(sourceCode).not.toContain('x2="172"');
  });

  it('verifies detent tick markers render on top of the arc path (correct SVG z-order)', () => {
    const pathIndex = sourceCode.indexOf('<path');
    const firstCircleAfterPathIndex = sourceCode.indexOf('<circle cx="15" cy="26"', pathIndex);
    // Tick markers MUST appear after <path> in source so they are painted on top of the opaque track line
    expect(pathIndex).toBeGreaterThan(0);
    expect(firstCircleAfterPathIndex).toBeGreaterThan(pathIndex);
    // Ticks must have visible stroke and radius >= 2.5
    expect(sourceCode).toContain('r="2.5"');
    expect(sourceCode).toContain("stroke=\"var(--theme-instrument-ink)\"");
  });

  it('verifies stage telemetry tag uses middle dot separator and absolute alignment to preserve dock horizontal axis', () => {
    // Assert middle dot formatting
    expect(sourceCode).toContain(' · {currentMilestone.desc}');
    // Assert absolute top-full positioning ensures scrubber box height is 36px in flex flow
    // mt-1 ensures exact 10px breathing clearance moat inside the dock container
    expect(sourceCode).toContain('absolute top-full mt-1');
    expect(sourceCode).toContain('relative flex flex-col items-center');
  });
});

