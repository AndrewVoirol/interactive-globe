// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import { NavigationDock } from '../../../src/components/hud/NavigationDock';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('NavigationDock Mode Selector (Milestone 4 Verification)', () => {
  const dockPath = path.resolve(__dirname, '../../../src/components/hud/NavigationDock.tsx');
  const dockCode = fs.readFileSync(dockPath, 'utf-8');
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

  it('verifies compact 4-segment mode pill selector contains Linear, Scroll, Fracture, Fluid', () => {
    expect(dockCode).toContain("'Linear'");
    expect(dockCode).toContain("'Scroll'");
    expect(dockCode).toContain("'Fracture'");
    expect(dockCode).toContain("'Fluid'");
  });

  it('verifies Cartographic HUD styling standards (mono typography, ivory vellum background, 10px breathing clearance, single perimeter border)', () => {
    // Mono typography
    expect(dockCode).toContain('font-mono');
    expect(dockCode).toContain('text-nano');

    // Ivory vellum background
    expect(dockCode).toContain('rgba(252, 249, 242, 0.94)');

    // 10px breathing clearance (gap-2.5 = 10px)
    expect(dockCode).toContain('gap-2.5');

    // Single perimeter border on pill
    expect(dockCode).toContain('border-[var(--theme-card-border)]');
  });

  it('renders all 4 segments into the DOM with proper accessibility roles and aria-checked states', async () => {
    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={() => {}}
          playbackSpeed={1}
          onToggleSpeed={() => {}}
          alpha={0}
          onAlphaChange={() => {}}
          onGlideToAlpha={() => {}}
          theme={1}
          mode={2}
        />
      );
    });

    const radioGroup = container.querySelector('[role="radiogroup"]');
    expect(radioGroup).not.toBeNull();
    expect(radioGroup?.getAttribute('aria-label')).toBe('Projection Mode Selector');

    const buttons = container.querySelectorAll('[role="radio"]');
    expect(buttons.length).toBe(4);

    const labels = Array.from(buttons).map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Linear', 'Scroll', 'Fracture', 'Fluid']);

    // mode=2 is Fracture, so 3rd button must have aria-checked="true"
    expect(buttons[0].getAttribute('aria-checked')).toBe('false');
    expect(buttons[1].getAttribute('aria-checked')).toBe('false');
    expect(buttons[2].getAttribute('aria-checked')).toBe('true');
    expect(buttons[3].getAttribute('aria-checked')).toBe('false');
  });

  it('calls onModeChange and onSelectMode when a mode button is clicked', async () => {
    const onModeChange = vi.fn();
    const onSelectMode = vi.fn();

    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={() => {}}
          playbackSpeed={1}
          onToggleSpeed={() => {}}
          alpha={0}
          onAlphaChange={() => {}}
          onGlideToAlpha={() => {}}
          theme={1}
          mode={0}
          onModeChange={onModeChange}
          onSelectMode={onSelectMode}
        />
      );
    });

    const buttons = container.querySelectorAll('[role="radio"]');

    // Click "Scroll" (mode 1)
    await act(async () => {
      (buttons[1] as HTMLButtonElement).click();
    });
    expect(onModeChange).toHaveBeenCalledWith(1);
    expect(onSelectMode).toHaveBeenCalledWith(1);

    // Click "Fluid" (mode 3)
    await act(async () => {
      (buttons[3] as HTMLButtonElement).click();
    });
    expect(onModeChange).toHaveBeenCalledWith(3);
    expect(onSelectMode).toHaveBeenCalledWith(3);
  });

  it('renders with theme-specific styling classes across all 3 cartographic mediums without style contamination', async () => {
    // Theme 2: Cyanotype
    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={() => {}}
          playbackSpeed={1}
          onToggleSpeed={() => {}}
          alpha={0}
          onAlphaChange={() => {}}
          onGlideToAlpha={() => {}}
          theme={2}
          mode={0}
        />
      );
    });

    let radioGroup = container.querySelector('[role="radiogroup"]') as HTMLDivElement;
    expect(radioGroup.className).toContain('paper-cyanotype');
    // Ensure zero inline warm background contamination in Cyanotype
    expect(radioGroup.style.backgroundColor).toBe('');

    // Theme 0: Marie Tharp
    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={() => {}}
          playbackSpeed={1}
          onToggleSpeed={() => {}}
          alpha={0}
          onAlphaChange={() => {}}
          onGlideToAlpha={() => {}}
          theme={0}
          mode={0}
        />
      );
    });

    radioGroup = container.querySelector('[role="radiogroup"]') as HTMLDivElement;
    expect(radioGroup.className).toContain('paper-tharp');
    expect(radioGroup.style.backgroundColor).toBe('');
  });

  it('verifies clicking active mode pill is a no-op (R4)', async () => {
    const onModeChange = vi.fn();
    const onSelectMode = vi.fn();
    const onAlphaChange = vi.fn();

    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={() => {}}
          playbackSpeed={1}
          onToggleSpeed={() => {}}
          alpha={0.5}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={() => {}}
          theme={1}
          mode={1} // Active mode is Scroll
          onModeChange={onModeChange}
          onSelectMode={onSelectMode}
        />
      );
    });

    const buttons = container.querySelectorAll('[role="radio"]');
    // Click button 1 (Scroll, which is already active mode 1)
    await act(async () => {
      (buttons[1] as HTMLButtonElement).click();
    });

    expect(onModeChange).not.toHaveBeenCalled();
    expect(onSelectMode).not.toHaveBeenCalled();
    expect(onAlphaChange).not.toHaveBeenCalled();
  });

  it('verifies switching projection modes at alpha = 0.50 executes auto-glide sequence (R4)', async () => {
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

    const onModeChange = vi.fn();
    const onSelectMode = vi.fn();
    const onAlphaChange = vi.fn();

    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={() => {}}
          playbackSpeed={1}
          onToggleSpeed={() => {}}
          alpha={0.5}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={() => {}}
          theme={1}
          mode={0} // Active mode Linear
          onModeChange={onModeChange}
          onSelectMode={onSelectMode}
        />
      );
    });

    const buttons = container.querySelectorAll('[role="radio"]');

    // Click Fracture (mode 2) at alpha = 0.50
    await act(async () => {
      (buttons[2] as HTMLButtonElement).click();
    });

    expect(callbacks.length).toBeGreaterThan(0);

    // Phase 1 (0 to 250ms): At t = 100ms, alpha is gliding towards 0.00
    fakeNow = 1100;
    let nextCb = callbacks.shift();
    await act(async () => {
      nextCb?.(fakeNow);
    });
    expect(onAlphaChange).toHaveBeenCalled();
    // In Phase 1, mode has NOT been switched yet
    expect(onModeChange).not.toHaveBeenCalled();

    // At t = 250ms: alpha hits 0.00 and mode switch executes
    fakeNow = 1250;
    nextCb = callbacks.shift();
    await act(async () => {
      nextCb?.(fakeNow);
    });
    expect(onAlphaChange).toHaveBeenCalledWith(0.0);
    expect(onModeChange).toHaveBeenCalledWith(2);
    expect(onSelectMode).toHaveBeenCalledWith(2);

    // Phase 2 (250 to 600ms): At t = 425ms (halfway through restore), alpha is restoring towards 0.50
    fakeNow = 1425;
    nextCb = callbacks.shift();
    await act(async () => {
      nextCb?.(fakeNow);
    });
    const midAlpha = onAlphaChange.mock.calls[onAlphaChange.mock.calls.length - 1][0];
    expect(midAlpha).toBeGreaterThan(0.0);
    expect(midAlpha).toBeLessThanOrEqual(0.5);

    // At t = 600ms (end of 350ms Phase 2): alpha is restored to prior 0.50
    fakeNow = 1600;
    nextCb = callbacks.shift();
    await act(async () => {
      nextCb?.(fakeNow);
    });
    expect(onAlphaChange).toHaveBeenLastCalledWith(0.5);

    rafSpy.mockRestore();
    cancelRafSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it('verifies interacting with sextant during in-flight mode glide cancels glide immediately (R4)', async () => {
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

    const onModeChange = vi.fn();
    const onSelectMode = vi.fn();
    const onAlphaChange = vi.fn();

    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={() => {}}
          playbackSpeed={1}
          onToggleSpeed={() => {}}
          alpha={0.5}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={() => {}}
          theme={1}
          mode={0}
          onModeChange={onModeChange}
          onSelectMode={onSelectMode}
        />
      );
    });

    const buttons = container.querySelectorAll('[role="radio"]');

    // Click Fluid (mode 3)
    await act(async () => {
      (buttons[3] as HTMLButtonElement).click();
    });
    expect(callbacks.length).toBeGreaterThan(0);

    // Step 50ms into glide
    fakeNow = 1050;
    const cb = callbacks.shift();
    await act(async () => {
      cb?.(fakeNow);
    });

    // User interacts with the sextant slider
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

    await act(async () => {
      slider.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 120, // 0.50
          pointerId: 1,
          bubbles: true,
        })
      );
    });

    // In-flight glide must have been cancelled (cancelAnimationFrame called, callbacks cleared)
    expect(callbacks.length).toBe(0);
    // Mode must NOT have been switched because glide was cancelled before reaching 0.00
    expect(onModeChange).not.toHaveBeenCalled();

    rafSpy.mockRestore();
    cancelRafSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it('verifies rapid mode switching during in-flight glide restores to original resting alpha (adversarial adverse timing)', async () => {
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

    const onModeChange = vi.fn();
    const onSelectMode = vi.fn();
    let currentAlpha = 0.50;
    const onAlphaChange = vi.fn((val: number) => {
      currentAlpha = val;
    });

    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={() => {}}
          playbackSpeed={1}
          onToggleSpeed={() => {}}
          alpha={currentAlpha}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={() => {}}
          theme={1}
          mode={0}
          onModeChange={onModeChange}
          onSelectMode={onSelectMode}
        />
      );
    });

    const buttons = container.querySelectorAll('[role="radio"]');

    // Click Scroll (mode 1) at alpha = 0.50
    await act(async () => {
      (buttons[1] as HTMLButtonElement).click();
    });
    expect(callbacks.length).toBeGreaterThan(0);

    // Step 245ms into glide: alpha is down near 0.029 (< 0.05)
    fakeNow = 1245;
    const cb1 = callbacks.shift();
    await act(async () => {
      cb1?.(fakeNow);
    });
    expect(currentAlpha).toBeLessThan(0.05);

    // Re-render NavigationDock with current alpha (< 0.05) to simulate React parent state propagation
    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={() => {}}
          playbackSpeed={1}
          onToggleSpeed={() => {}}
          alpha={currentAlpha}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={() => {}}
          theme={1}
          mode={0}
          onModeChange={onModeChange}
          onSelectMode={onSelectMode}
        />
      );
    });

    // NOW: User rapidly clicks Fracture (mode 2) while alpha is <= 0.05 mid-glide!
    await act(async () => {
      (buttons[2] as HTMLButtonElement).click();
    });

    // The glide MUST continue to Phase 2 and restore back to original 0.50, NOT get stuck at alpha <= 0.05!
    expect(callbacks.length).toBeGreaterThan(0);

    // Step to Phase 1 completion for second glide (t = 250ms from 1245 -> 1495ms)
    fakeNow = 1495;
    let cb = callbacks.shift();
    await act(async () => {
      cb?.(fakeNow);
    });
    expect(onModeChange).toHaveBeenCalledWith(2);

    // Step to Phase 2 completion (t = 600ms from 1245 -> 1845ms)
    fakeNow = 1845;
    cb = callbacks.shift();
    await act(async () => {
      cb?.(fakeNow);
    });

    // Must restore to original 0.50 resting alpha
    expect(onAlphaChange).toHaveBeenLastCalledWith(0.5);

    rafSpy.mockRestore();
    cancelRafSpy.mockRestore();
    nowSpy.mockRestore();
  });

  it('verifies activating isPlaying cancels in-flight mode glide immediately (adversarial test)', async () => {
    let callbacks: Array<FrameRequestCallback> = [];
    let rafId = 0;
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      callbacks.push(cb);
      return ++rafId;
    });
    const cancelRafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      callbacks = [];
    });

    const onModeChange = vi.fn();
    const onSelectMode = vi.fn();
    const onAlphaChange = vi.fn();

    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={() => {}}
          playbackSpeed={1}
          onToggleSpeed={() => {}}
          alpha={0.5}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={() => {}}
          theme={1}
          mode={0}
          onModeChange={onModeChange}
          onSelectMode={onSelectMode}
        />
      );
    });

    const buttons = container.querySelectorAll('[role="radio"]');

    // Click Fracture (mode 2) at alpha = 0.50
    await act(async () => {
      (buttons[2] as HTMLButtonElement).click();
    });
    expect(callbacks.length).toBeGreaterThan(0);

    // Now auto-morph playback activates (isPlaying = true)
    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={true}
          onTogglePlay={() => {}}
          playbackSpeed={1}
          onToggleSpeed={() => {}}
          alpha={0.5}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={() => {}}
          theme={1}
          mode={0}
          onModeChange={onModeChange}
          onSelectMode={onSelectMode}
        />
      );
    });

    // In-flight mode glide must have been cancelled
    expect(callbacks.length).toBe(0);
    expect(onModeChange).not.toHaveBeenCalled();

    rafSpy.mockRestore();
    cancelRafSpy.mockRestore();
  });

  it('verifies external alpha jump (e.g. from glideToAlpha) cancels in-flight mode glide (adversarial test)', async () => {
    let callbacks: Array<FrameRequestCallback> = [];
    let rafId = 0;
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      callbacks.push(cb);
      return ++rafId;
    });
    const cancelRafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      callbacks = [];
    });

    const onModeChange = vi.fn();
    const onSelectMode = vi.fn();
    const onAlphaChange = vi.fn();

    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={() => {}}
          playbackSpeed={1}
          onToggleSpeed={() => {}}
          alpha={0.5}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={() => {}}
          theme={1}
          mode={0}
          onModeChange={onModeChange}
          onSelectMode={onSelectMode}
        />
      );
    });

    const buttons = container.querySelectorAll('[role="radio"]');

    // Click Fluid (mode 3) at alpha = 0.50
    await act(async () => {
      (buttons[3] as HTMLButtonElement).click();
    });
    expect(callbacks.length).toBeGreaterThan(0);

    // External jump to alpha = 0.00 (e.g. user pressed 'G' for Globe)
    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={() => {}}
          playbackSpeed={1}
          onToggleSpeed={() => {}}
          alpha={0.0}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={() => {}}
          theme={1}
          mode={0}
          onModeChange={onModeChange}
          onSelectMode={onSelectMode}
        />
      );
    });

    // In-flight mode glide must have been cancelled
    expect(callbacks.length).toBe(0);
    expect(onModeChange).not.toHaveBeenCalled();

    rafSpy.mockRestore();
    cancelRafSpy.mockRestore();
  });

  it('verifies clicking a mode pill while playing pauses auto-morph via onTogglePlay (adversarial test)', async () => {
    const onTogglePlay = vi.fn();
    const onModeChange = vi.fn();
    const onSelectMode = vi.fn();

    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={true}
          onTogglePlay={onTogglePlay}
          playbackSpeed={1}
          onToggleSpeed={() => {}}
          alpha={0.5}
          onAlphaChange={() => {}}
          onGlideToAlpha={() => {}}
          theme={1}
          mode={0}
          onModeChange={onModeChange}
          onSelectMode={onSelectMode}
        />
      );
    });

    const buttons = container.querySelectorAll('[role="radio"]');

    // Click Scroll (mode 1)
    await act(async () => {
      (buttons[1] as HTMLButtonElement).click();
    });

    // Must have called onTogglePlay to pause playback
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('verifies auto-glide initiated at alpha = 1.0 completes full glide without premature cancellation under React state loopback (adversarial test)', async () => {
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

    let currentAlpha = 1.0;
    const onAlphaChange = vi.fn((val: number) => {
      currentAlpha = val;
    });
    const onModeChange = vi.fn();
    const onSelectMode = vi.fn();

    await act(async () => {
      root.render(
        <NavigationDock
          isZenMode={false}
          isPlaying={false}
          onTogglePlay={() => {}}
          playbackSpeed={1}
          onToggleSpeed={() => {}}
          alpha={currentAlpha}
          onAlphaChange={onAlphaChange}
          onGlideToAlpha={() => {}}
          theme={1}
          mode={0}
          onModeChange={onModeChange}
          onSelectMode={onSelectMode}
        />
      );
    });

    const buttons = container.querySelectorAll('[role="radio"]');

    // Click Fracture (mode 2) at alpha = 1.00
    await act(async () => {
      (buttons[2] as HTMLButtonElement).click();
    });
    expect(callbacks.length).toBeGreaterThan(0);

    // Step through each 16.6ms frame, simulating realistic React re-renders with emitted alpha
    while (callbacks.length > 0 && fakeNow < 1650) {
      fakeNow += 16.6;
      const cb = callbacks.shift();
      await act(async () => {
        cb?.(fakeNow);
      });
      // Simulate React parent state propagation
      await act(async () => {
        root.render(
          <NavigationDock
            isZenMode={false}
            isPlaying={false}
            onTogglePlay={() => {}}
            playbackSpeed={1}
            onToggleSpeed={() => {}}
            alpha={currentAlpha}
            onAlphaChange={onAlphaChange}
            onGlideToAlpha={() => {}}
            theme={1}
            mode={onModeChange.mock.calls.length > 0 ? onModeChange.mock.calls[0][0] : 0}
            onModeChange={onModeChange}
            onSelectMode={onSelectMode}
          />
        );
      });
    }

    // Must have successfully switched mode at alpha = 0.00
    expect(onModeChange).toHaveBeenCalledWith(2);
    // Must have fully completed Phase 2 and restored to alpha = 1.00
    expect(currentAlpha).toBe(1.0);

    rafSpy.mockRestore();
    cancelRafSpy.mockRestore();
    nowSpy.mockRestore();
  });
});

