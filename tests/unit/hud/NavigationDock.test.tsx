// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { NavigationDock } from '../../../src/components/hud/NavigationDock';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('NavigationDock: 4-Segment Mode Selector & Glide Kinematics', () => {
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

  it('DOCK-01: renders 4-segment projection mode button group with aria-pressed states', async () => {
    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={vi.fn()}
          playbackSpeed={1.0}
          onToggleSpeed={vi.fn()}
          alpha={0.0}
          onAlphaChange={vi.fn()}
          onGlideToAlpha={vi.fn()}
          onGlideToMode={vi.fn()}
          onCancelGlide={vi.fn()}
          theme={1}
          mode={2} // Fracture
        />
      );
    });

    const modeGroup = container.querySelector('[role="group"][aria-label="Projection Mode Selection"]');
    expect(modeGroup).not.toBeNull();

    const buttons = modeGroup!.querySelectorAll('button');
    expect(buttons.length).toBe(4);

    const labels = Array.from(buttons).map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Linear', 'Scroll', 'Fracture', 'Fluid']);

    // mode=2 means Fracture should be pressed
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[3].getAttribute('aria-pressed')).toBe('false');
  });

  it('DOCK-02: clicking mode buttons invokes onGlideToMode with corresponding mode index', async () => {
    const onGlideToMode = vi.fn();

    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={vi.fn()}
          playbackSpeed={1.0}
          onToggleSpeed={vi.fn()}
          alpha={0.0}
          onAlphaChange={vi.fn()}
          onGlideToAlpha={vi.fn()}
          onGlideToMode={onGlideToMode}
          onCancelGlide={vi.fn()}
          theme={1}
          mode={0}
        />
      );
    });

    const modeGroup = container.querySelector('[role="group"][aria-label="Projection Mode Selection"]')!;
    const buttons = modeGroup.querySelectorAll('button');

    // Click Scroll (mode 1)
    await act(async () => {
      buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onGlideToMode).toHaveBeenLastCalledWith(1);

    // Click Fracture (mode 2)
    await act(async () => {
      buttons[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onGlideToMode).toHaveBeenLastCalledWith(2);

    // Click Fluid (mode 3)
    await act(async () => {
      buttons[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onGlideToMode).toHaveBeenLastCalledWith(3);

    // Click Linear (mode 0)
    await act(async () => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onGlideToMode).toHaveBeenLastCalledWith(0);
  });

  it('DOCK-03: quick snap buttons invoke onGlideToAlpha(0.0) and onGlideToAlpha(1.0)', async () => {
    const onGlideToAlpha = vi.fn();

    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={vi.fn()}
          playbackSpeed={1.0}
          onToggleSpeed={vi.fn()}
          alpha={0.5}
          onAlphaChange={vi.fn()}
          onGlideToAlpha={onGlideToAlpha}
          onGlideToMode={vi.fn()}
          onCancelGlide={vi.fn()}
          theme={1}
          mode={0}
        />
      );
    });

    // Globe button
    const globeBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Globe')
    );
    expect(globeBtn).toBeDefined();

    await act(async () => {
      globeBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onGlideToAlpha).toHaveBeenCalledWith(0.0);

    // Map button
    const mapBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Map')
    );
    expect(mapBtn).toBeDefined();

    await act(async () => {
      mapBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onGlideToAlpha).toHaveBeenCalledWith(1.0);
  });

  it('DOCK-04: passes onCancelGlide callback through to CurvatureUnfurlSextant', async () => {
    const onCancelGlide = vi.fn();

    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={vi.fn()}
          playbackSpeed={1.0}
          onToggleSpeed={vi.fn()}
          alpha={0.0}
          onAlphaChange={vi.fn()}
          onGlideToAlpha={vi.fn()}
          onGlideToMode={vi.fn()}
          onCancelGlide={onCancelGlide}
          theme={1}
          mode={0}
        />
      );
    });

    const sextantSlider = container.querySelector('[role="slider"]');
    expect(sextantSlider).not.toBeNull();

    await act(async () => {
      const down = new Event('pointerdown', { bubbles: true }) as any;
      down.pointerId = 1;
      down.clientX = 150;
      sextantSlider!.dispatchEvent(down);
    });

    expect(onCancelGlide).toHaveBeenCalled();
  });

  it('DOCK-05: adheres to single-border HUD enclosure standard', async () => {
    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={vi.fn()}
          playbackSpeed={1.0}
          onToggleSpeed={vi.fn()}
          alpha={0.0}
          onAlphaChange={vi.fn()}
          onGlideToAlpha={vi.fn()}
          onGlideToMode={vi.fn()}
          theme={1}
          mode={0}
        />
      );
    });

    // Outer dock bar should have single border, not nested neatlines
    const dockBar = container.querySelector('.scroll-curl-lip');
    expect(dockBar).not.toBeNull();
    const className = dockBar!.getAttribute('class') || '';
    expect(className).toContain('border');
    expect(className).not.toContain('border-double');
  });

  it('DOCK-06: clicking mode button when alpha < 0.01 directly switches mode without animation', async () => {
    const onGlideToMode = vi.fn();
    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={vi.fn()}
          playbackSpeed={1.0}
          onToggleSpeed={vi.fn()}
          alpha={0.0}
          onAlphaChange={vi.fn()}
          onGlideToAlpha={vi.fn()}
          onGlideToMode={onGlideToMode}
          theme={1}
          mode={0}
        />
      );
    });

    const modeGroup = container.querySelector('[role="group"][aria-label="Projection Mode Selection"]')!;
    const buttons = modeGroup.querySelectorAll('button');

    // Click Fluid (mode 3)
    await act(async () => {
      buttons[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onGlideToMode).toHaveBeenCalledWith(3);
  });

  it('DOCK-07: renders active indicator on currently active mode across all 4 modes', async () => {
    for (let m = 0; m < 4; m++) {
      await act(async () => {
        root.render(
          <NavigationDock
            isZenMode={false}
            isPlaying={false}
            onTogglePlay={vi.fn()}
            playbackSpeed={1.0}
            onToggleSpeed={vi.fn()}
            alpha={0.5}
            onAlphaChange={vi.fn()}
            onGlideToAlpha={vi.fn()}
            onGlideToMode={vi.fn()}
            theme={1}
            mode={m as any}
          />
        );
      });

      const modeGroup = container.querySelector('[role="group"][aria-label="Projection Mode Selection"]')!;
      const buttons = modeGroup.querySelectorAll('button');
      for (let i = 0; i < 4; i++) {
        expect(buttons[i].getAttribute('aria-pressed')).toBe(i === m ? 'true' : 'false');
      }
    }
  });
});
