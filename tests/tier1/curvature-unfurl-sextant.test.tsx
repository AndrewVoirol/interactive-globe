import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { CurvatureUnfurlSextant } from '../../src/components/hud/instruments/CurvatureUnfurlSextant';

describe('CurvatureUnfurlSextant Component', () => {
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

  it('1. Smooth Scrubbing Invariant: Pointer drags do not snap to magnetic detents', async () => {
    const onAlphaChange = vi.fn();
    
    await act(async () => {
      root.render(<CurvatureUnfurlSextant alpha={0} onAlphaChange={onAlphaChange} mode={0} />);
    });

    const slider = container.querySelector('div.cursor-pointer') as HTMLElement;
    expect(slider).not.toBeNull();
    
    // Mock the bounding client rect so we can do deterministic pointer math.
    // Let's assume a container 350px wide, and 36px tall (standard dock size).
    // The SVG is 240x36. This means there is 55px padding on each side.
    // arc starts at SVG x=15. So physical start = 55 + 15 = 70px.
    // arc width is 210 in SVG = 210px physically.
    // So if clientX = 70 + (210 * 0.15) = 70 + 31.5 = 101.5px, alpha should be exactly 0.1500.
    slider.getBoundingClientRect = () => ({
      width: 350,
      height: 36,
      top: 0,
      left: 0,
      bottom: 36,
      right: 350,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    await act(async () => {
      const event = new PointerEvent('pointerdown', { clientX: 101.5, button: 0, bubbles: true });
      slider.dispatchEvent(event);
    });

    expect(onAlphaChange).toHaveBeenCalledWith(0.15);
  });

  it('2. Aspect Ratio Letterbox Projection: Accurately projects coordinates regardless of stretched bounds', async () => {
    const onAlphaChange = vi.fn();
    
    await act(async () => {
      root.render(<CurvatureUnfurlSextant alpha={0} onAlphaChange={onAlphaChange} mode={0} />);
    });

    const slider = container.querySelector('div.cursor-pointer') as HTMLElement;
    
    // Now assume an extremely stretched container, 500px wide, 36px tall.
    // SVG is 240x36, so padding is (500 - 240) / 2 = 130px.
    // arc starts at 130 + 15 = 145px.
    // arc width is 210px.
    slider.getBoundingClientRect = () => ({
      width: 500,
      height: 36,
      top: 0,
      left: 0,
      bottom: 36,
      right: 500,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    // Clicking exactly at the start of the arc (145px) should yield 0.0
    await act(async () => {
      const event = new PointerEvent('pointerdown', { clientX: 145, button: 0, bubbles: true });
      slider.dispatchEvent(event);
    });
    expect(onAlphaChange).toHaveBeenCalledWith(0);

    // Clicking exactly at the end of the arc (145 + 210 = 355px) should yield 1.0
    await act(async () => {
      const event = new PointerEvent('pointermove', { clientX: 355, button: 0, bubbles: true });
      slider.dispatchEvent(event);
    });
    expect(onAlphaChange).toHaveBeenCalledWith(1);
    
    // Clicking exactly at the middle of the arc (145 + 105 = 250px) should yield 0.5
    await act(async () => {
      const event = new PointerEvent('pointermove', { clientX: 250, button: 0, bubbles: true });
      slider.dispatchEvent(event);
    });
    expect(onAlphaChange).toHaveBeenCalledWith(0.5);
  });
});
