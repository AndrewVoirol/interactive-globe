// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  CurvatureUnfurlSextant,
} from '../../src/components/hud/instruments/CurvatureUnfurlSextant';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('CurvatureUnfurlSextant: 120Hz Decoupled Scrubbing & Dynamic Ticks', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    if (!Element.prototype.setPointerCapture) {
      Element.prototype.setPointerCapture = vi.fn();
    }
    if (!Element.prototype.releasePointerCapture) {
      Element.prototype.releasePointerCapture = vi.fn();
    }
    if (!Element.prototype.hasPointerCapture) {
      Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(true);
    }
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
    delete (window as any).__INDICATRIX_SCRUB_ALPHA__;
    vi.restoreAllMocks();
  });

  const mockBoxRect = (el: Element, rect = { left: 100, right: 340, width: 240, top: 50, bottom: 86, height: 36 }) => {
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(rect as any);
  };

  it('SEXTANT-01: writes instantaneously to window.__INDICATRIX_SCRUB_ALPHA__ during pointer dragging', async () => {
    const onAlphaChange = vi.fn();
    const onCancelGlide = vi.fn();

    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.0}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={vi.fn()}
          onCancelGlide={onCancelGlide}
          mode={0}
          theme={1}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]');
    expect(slider).not.toBeNull();
    mockBoxRect(slider!);

    // Start drag at midpoint: clientX = 100 + 14 + (240 - 28) * 0.5 = 220
    await act(async () => {
      const downEvent = new Event('pointerdown', { bubbles: true }) as any;
      downEvent.pointerId = 1;
      downEvent.clientX = 220;
      downEvent.clientY = 68;
      slider!.dispatchEvent(downEvent);
    });

    expect(onCancelGlide).toHaveBeenCalledTimes(1);
    expect((window as any).__INDICATRIX_SCRUB_ALPHA__).toBeCloseTo(0.5, 2);

    // Drag further to clientX = 100 + 14 + (240 - 28) * 0.75 = 273
    await act(async () => {
      const moveEvent = new Event('pointermove', { bubbles: true }) as any;
      moveEvent.pointerId = 1;
      moveEvent.clientX = 273;
      moveEvent.clientY = 68;
      slider!.dispatchEvent(moveEvent);
    });

    expect((window as any).__INDICATRIX_SCRUB_ALPHA__).toBeCloseTo(0.75, 2);
  });

  it('SEXTANT-02: dispatches unthrottled React state emission onAlphaChange immediately during active drag', async () => {
    const onAlphaChange = vi.fn();

    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.0}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={vi.fn()}
          mode={0}
          theme={1}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]')!;
    mockBoxRect(slider);

    // Pointer down at x=0.2 (clientX = 114 + 212 * 0.2 = 156.4)
    await act(async () => {
      const down = new Event('pointerdown', { bubbles: true }) as any;
      down.pointerId = 1;
      down.clientX = 156.4;
      slider.dispatchEvent(down);
    });

    // Initial down fires onAlphaChange
    expect(onAlphaChange).toHaveBeenCalledTimes(1);

    // Rapid moves within 50ms should emit immediately without 50ms throttle delay
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        const move = new Event('pointermove', { bubbles: true }) as any;
        move.pointerId = 1;
        move.clientX = 156.4 + (i + 1) * 10;
        slider.dispatchEvent(move);
        vi.advanceTimersByTime(5); // Only 5ms per move
      }
    });

    // Unthrottled: fired 1 (down) + 5 (moves) = 6 times immediately
    expect(onAlphaChange).toHaveBeenCalledTimes(6);
  });

  it('SEXTANT-03: clears window.__INDICATRIX_SCRUB_ALPHA__ on pointerup, pointercancel, and lostpointercapture', async () => {
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.0}
          onAlphaChange={vi.fn()}
          onGlideToAlpha={vi.fn()}
          mode={0}
          theme={1}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]')!;
    mockBoxRect(slider);

    // Pointer down
    await act(async () => {
      const down = new Event('pointerdown', { bubbles: true }) as any;
      down.pointerId = 1;
      down.clientX = 150;
      slider.dispatchEvent(down);
    });
    expect((window as any).__INDICATRIX_SCRUB_ALPHA__).toBeDefined();

    // Pointer up clears it
    await act(async () => {
      const up = new Event('pointerup', { bubbles: true }) as any;
      up.pointerId = 1;
      slider.dispatchEvent(up);
    });
    expect((window as any).__INDICATRIX_SCRUB_ALPHA__).toBeUndefined();

    // Pointer down again then pointercancel
    await act(async () => {
      const down = new Event('pointerdown', { bubbles: true }) as any;
      down.pointerId = 2;
      down.clientX = 150;
      slider.dispatchEvent(down);
    });
    expect((window as any).__INDICATRIX_SCRUB_ALPHA__).toBeDefined();

    await act(async () => {
      const cancel = new Event('pointercancel', { bubbles: true }) as any;
      cancel.pointerId = 2;
      slider.dispatchEvent(cancel);
    });
    expect((window as any).__INDICATRIX_SCRUB_ALPHA__).toBeUndefined();

    // Pointer down again then lostpointercapture
    await act(async () => {
      const down = new Event('pointerdown', { bubbles: true }) as any;
      down.pointerId = 3;
      down.clientX = 150;
      slider.dispatchEvent(down);
    });
    expect((window as any).__INDICATRIX_SCRUB_ALPHA__).toBeDefined();

    await act(async () => {
      const lostCapture = new Event('lostpointercapture', { bubbles: true }) as any;
      lostCapture.pointerId = 3;
      slider.dispatchEvent(lostCapture);
    });
    expect((window as any).__INDICATRIX_SCRUB_ALPHA__).toBeUndefined();
  });

  it('SEXTANT-04: reticle thumb circle has no transition-all duration-150 class', async () => {
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.5}
          onAlphaChange={vi.fn()}
          onGlideToAlpha={vi.fn()}
          mode={0}
          theme={1}
        />
      );
    });

    const circles = container.querySelectorAll('circle');
    const thumb = Array.from(circles).find(
      (c) => c.getAttribute('r') === '4.5' || c.getAttribute('r') === '5.5'
    );
    expect(thumb).toBeDefined();
    const className = thumb!.getAttribute('class') || '';
    expect(className).not.toContain('transition-all');
    expect(className).not.toContain('duration-150');
  });

  it('SEXTANT-05: dynamic quadratic Bezier tick coordinates match curvature at alpha=0.0 and alpha=1.0', async () => {
    // Render at alpha = 0.0: peakY = 6.0, tickY = 15.08 + 0.42 * 6.0 = 17.60
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.0}
          onAlphaChange={vi.fn()}
          onGlideToAlpha={vi.fn()}
          mode={0}
          theme={1}
        />
      );
    });

    let circles = container.querySelectorAll('circle');
    const tick0_30 = Array.from(circles).find((c) => c.getAttribute('cx') === '78');
    const tick0_70 = Array.from(circles).find((c) => c.getAttribute('cx') === '162');
    expect(tick0_30).toBeDefined();
    expect(tick0_70).toBeDefined();
    expect(parseFloat(tick0_30!.getAttribute('cy')!)).toBeCloseTo(17.6, 1);
    expect(parseFloat(tick0_70!.getAttribute('cy')!)).toBeCloseTo(17.6, 1);

    // Render at alpha = 1.0: peakY = 26.0, tickY = 15.08 + 0.42 * 26.0 = 26.00
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={1.0}
          onAlphaChange={vi.fn()}
          onGlideToAlpha={vi.fn()}
          mode={0}
          theme={1}
        />
      );
    });

    circles = container.querySelectorAll('circle');
    const tickFlat0_30 = Array.from(circles).find((c) => c.getAttribute('cx') === '78');
    const tickFlat0_70 = Array.from(circles).find((c) => c.getAttribute('cx') === '162');
    expect(parseFloat(tickFlat0_30!.getAttribute('cy')!)).toBeCloseTo(26.0, 1);
    expect(parseFloat(tickFlat0_70!.getAttribute('cy')!)).toBeCloseTo(26.0, 1);
  });

  it('SEXTANT-06: milestone 4 triggers at alpha >= 0.85, not at alpha = 0.80', async () => {
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.80}
          onAlphaChange={vi.fn()}
          onGlideToAlpha={vi.fn()}
          mode={0}
          theme={1}
        />
      );
    });
    // At alpha=0.80 in mode 0, milestone is PLANAR TRANSITION, not milestone 4 (PLANAR MAP)
    expect(container.textContent).toContain('PLANAR TRANSITION');
    expect(container.textContent).not.toContain('PLANAR MAP (K = 0)');

    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.85}
          onAlphaChange={vi.fn()}
          onGlideToAlpha={vi.fn()}
          mode={0}
          theme={1}
        />
      );
    });
    expect(container.textContent).toContain('PLANAR MAP (K = 0)');
  });

  it('SEXTANT-07: handles keyboard navigation via Arrow and Home/End keys', async () => {
    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.50}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={vi.fn()}
          mode={0}
          theme={1}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]')!;
    expect(slider).not.toBeNull();

    // ArrowRight (+0.01)
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenLastCalledWith(0.51);

    // ArrowLeft (-0.01)
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenLastCalledWith(0.49);

    // Shift + ArrowRight (+0.05)
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenLastCalledWith(0.55);

    // Home (0.00)
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenLastCalledWith(0.0);

    // End (1.00)
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(onAlphaChange).toHaveBeenLastCalledWith(1.0);
  });

  it('SEXTANT-08: re-rendering with stale alpha prop during drag does NOT clobber active drag position or resting alpha', async () => {
    const onAlphaChange = vi.fn();
    let currentAlpha = 0.10;

    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={currentAlpha}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={vi.fn()}
          mode={0}
          theme={1}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]')!;
    mockBoxRect(slider, { left: 0, right: 240, width: 240, top: 0, bottom: 36, height: 36 });

    // 1. Pointer down and move to alpha = 0.80
    // x = 0 + 240 * (15 / 240 + (210 / 240) * 0.80) = 15 + 168 = 183
    await act(async () => {
      const down = new Event('pointerdown', { bubbles: true }) as any;
      down.pointerId = 10;
      down.clientX = 183;
      slider.dispatchEvent(down);
    });
    expect((window as any).__INDICATRIX_SCRUB_ALPHA__).toBeCloseTo(0.80, 2);

    // 2. Simulate parent re-render with STALE alpha prop (0.10) while drag is still active
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.10} // Stale prop!
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={vi.fn()}
          mode={0}
          theme={1}
        />
      );
    });

    // 3. Pointer up: must commit the dragged position (~0.80), NOT the stale prop (0.10)!
    await act(async () => {
      const up = new Event('pointerup', { bubbles: true }) as any;
      up.pointerId = 10;
      slider.dispatchEvent(up);
    });

    expect(onAlphaChange).toHaveBeenLastCalledWith(expect.closeTo(0.80, 2));
  });

  it('SEXTANT-09: accurately maps coordinates across responsive container widths (e.g. 350px width)', async () => {
    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.0}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={vi.fn()}
          mode={0}
          theme={1}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]')!;
    const width350 = 350;
    mockBoxRect(slider, { left: 50, right: 400, width: width350, top: 0, bottom: 36, height: 36 });

    // Track start in viewBox (x=15 out of 240) -> left + 350 * (15/240) = 50 + 21.875 = 71.875
    await act(async () => {
      const down = new Event('pointerdown', { bubbles: true }) as any;
      down.pointerId = 20;
      down.clientX = 71.875;
      slider.dispatchEvent(down);
    });
    expect((window as any).__INDICATRIX_SCRUB_ALPHA__).toBeCloseTo(0.0, 2);

    // Track end in viewBox (x=225 out of 240) -> left + 350 * (225/240) = 50 + 328.125 = 378.125
    await act(async () => {
      const move = new Event('pointermove', { bubbles: true }) as any;
      move.pointerId = 20;
      move.clientX = 378.125;
      slider.dispatchEvent(move);
    });
    expect((window as any).__INDICATRIX_SCRUB_ALPHA__).toBeCloseTo(1.0, 2);

    // Midpoint -> left + 350 * (120/240) = 50 + 175 = 225
    await act(async () => {
      const move = new Event('pointermove', { bubbles: true }) as any;
      move.pointerId = 20;
      move.clientX = 225;
      slider.dispatchEvent(move);
    });
    expect((window as any).__INDICATRIX_SCRUB_ALPHA__).toBeCloseTo(0.5, 2);
  });

  it('SEXTANT-10: does not fire duplicate onAlphaChange commits when pointerup is followed by lostpointercapture', async () => {
    const onAlphaChange = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.0}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={vi.fn()}
          mode={0}
          theme={1}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]')!;
    mockBoxRect(slider);

    await act(async () => {
      const down = new Event('pointerdown', { bubbles: true }) as any;
      down.pointerId = 30;
      down.clientX = 220;
      slider.dispatchEvent(down);
    });

    const callsAfterDown = onAlphaChange.mock.calls.length;

    // Dispatch pointerup
    await act(async () => {
      const up = new Event('pointerup', { bubbles: true }) as any;
      up.pointerId = 30;
      slider.dispatchEvent(up);
    });

    const callsAfterUp = onAlphaChange.mock.calls.length;
    expect(callsAfterUp).toBe(callsAfterDown + 1);

    // Dispatch subsequent lostpointercapture (browser standard sequence)
    await act(async () => {
      const lostCapture = new Event('lostpointercapture', { bubbles: true }) as any;
      lostCapture.pointerId = 30;
      slider.dispatchEvent(lostCapture);
    });

    // Should NOT have fired a second commit!
    expect(onAlphaChange.mock.calls.length).toBe(callsAfterUp);
  });

  it('SEXTANT-11: keyboard navigation invokes onCancelGlide', async () => {
    const onCancelGlide = vi.fn();
    await act(async () => {
      root.render(
        <CurvatureUnfurlSextant
          alpha={0.50}
          onAlphaChange={vi.fn()}
          onGlideToAlpha={vi.fn()}
          onCancelGlide={onCancelGlide}
          mode={0}
          theme={1}
        />
      );
    });

    const slider = container.querySelector('[role="slider"]')!;
    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(onCancelGlide).toHaveBeenCalledTimes(1);
  });
});
