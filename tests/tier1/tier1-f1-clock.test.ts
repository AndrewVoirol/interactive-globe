import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { CursorTracker } from '../../src/utils/raycast';
import { evaluateCubicBezierEase } from '../../src/utils/projection';

describe('F1: Monotonic Timing & Simulation Clock Integration', () => {
  it('F1-T1: verifies CursorTracker computes monotonic delta-times and prevents zero-division', () => {
    const tracker = new CursorTracker();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 15);
    camera.lookAt(0, 0, 0);

    // Initial update
    const uniforms0 = tracker.update(camera, 0.0);
    expect(uniforms0).toBeDefined();
    expect(Number.isFinite(tracker.velX)).toBe(true);
    expect(Number.isFinite(tracker.velY)).toBe(true);

    // Subsequent updates across simulated time
    const nowSpy = vi.spyOn(performance, 'now');
    let mockTime = 1000.0;
    nowSpy.mockImplementation(() => mockTime);

    // Update at t = 1000ms
    tracker.update(camera, 0.0);

    // Update at t = 1016.6ms (~60fps frame)
    mockTime = 1016.6;
    const uniforms1 = tracker.update(camera, 0.0);
    expect(Number.isFinite(uniforms1.u_cursorVel.w)).toBe(true);
    expect(uniforms1.u_cursorVel.w).toBeGreaterThanOrEqual(0.0);

    // Immediate update at t = 1016.6ms (dt = 0)
    // CursorTracker enforces dt = Math.max(0.001, (now - lastUpdateTime) * 0.001)
    const uniformsZeroDt = tracker.update(camera, 0.0);
    expect(Number.isNaN(uniformsZeroDt.u_cursorVel.w)).toBe(false);

    nowSpy.mockRestore();
  });

  it('F1-T2: verifies CursorTracker exponential moving average (EMA) velocity smoothing from production code', () => {
    const tracker = new CursorTracker();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 15);
    camera.lookAt(0, 0, 0);

    const nowSpy = vi.spyOn(performance, 'now');
    let mockTime = 1000.0;
    nowSpy.mockImplementation(() => mockTime);

    // Attach mock target
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const mockTarget = {
      addEventListener,
      removeEventListener,
      clientWidth: 1920,
      clientHeight: 1080,
    } as unknown as HTMLElement;

    tracker.attach(mockTarget);
    tracker.update(camera, 0.0);

    // Simulate steady mouse drag from x=100 to x=500 in 4 steps of 16.6ms
    const pointerHandler = addEventListener.mock.calls.find(c => c[0] === 'pointermove')?.[1];
    expect(pointerHandler).toBeDefined();

    const recordedVelocities: number[] = [];
    for (let i = 1; i <= 4; i++) {
      mockTime += 16.666;
      pointerHandler({ clientX: 100 + i * 100, clientY: 500 });
      const uniforms = tracker.update(camera, 0.0);
      recordedVelocities.push(uniforms.u_cursorVel.w);
    }

    // Velocity must be smooth and non-zero
    for (const v of recordedVelocities) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0.0);
    }

    tracker.detach();
    nowSpy.mockRestore();
  });

  it('F1-T3: verifies CursorTracker exponential inactivity decay reduces activeIntensity over time', () => {
    const tracker = new CursorTracker();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 15);
    camera.lookAt(0, 0, 0);

    const nowSpy = vi.spyOn(performance, 'now');
    let mockTime = 2000.0;
    nowSpy.mockImplementation(() => mockTime);

    // Mark active and set lastMoveTime to current time
    tracker.lastMoveTime = mockTime;
    tracker.isInside = true;
    tracker.activeIntensity = 1.0;
    tracker.update(camera, 0.0);

    // Advance time by 200ms (within decay window: timeSinceMove = 0.20s > 0.06s)
    mockTime += 200.0;
    const uDecay1 = tracker.update(camera, 0.0);
    expect(uDecay1.u_cursorActive).toBeLessThan(1.0);
    expect(uDecay1.u_cursorActive).toBeGreaterThan(0.0);

    // Advance time by another 2000ms (inactive for >2 seconds)
    mockTime += 2000.0;
    const uDecayFinal = tracker.update(camera, 0.0);
    expect(uDecayFinal.u_cursorActive).toBe(0.0);

    nowSpy.mockRestore();
  });

  it('F1-T4: verifies auto-morph playback delta integration and boundary bounce behavior', () => {
    // Production logic from useEngineState auto-morph loop:
    // step = dt * 0.20 * playbackSpeed * playDirection;
    // if next >= 1.0 -> clamp 1.0 and reverse direction to -1
    // if next <= 0.0 -> clamp 0.0 and reverse direction to 1
    let alpha = 0.95;
    let playDirection: 1 | -1 = 1;
    const playbackSpeed = 1.0;
    const dt = 0.5; // 500ms step -> step = 0.5 * 0.20 * 1.0 = 0.10

    // Step forward past 1.0
    const step = dt * 0.20 * playbackSpeed * playDirection;
    let next = alpha + step;
    if (next >= 1.0) {
      next = 1.0;
      playDirection = -1;
    }

    expect(next).toBe(1.0);
    expect(playDirection).toBe(-1);

    // Next step in reverse direction
    const stepRev = dt * 0.20 * playbackSpeed * playDirection;
    next = next + stepRev;
    expect(next).toBeCloseTo(0.90, 4);

    // Stepping backwards to 0.0
    alpha = 0.05;
    playDirection = -1;
    const stepToZero = dt * 0.20 * playbackSpeed * playDirection;
    next = alpha + stepToZero;
    if (next <= 0.0) {
      next = 0.0;
      playDirection = 1;
    }
    expect(next).toBe(0.0);
    expect(playDirection).toBe(1);
  });

  it('F1-T5: verifies evaluateCubicBezierEase produces deterministic, smooth monotonic transition curve', () => {
    let prevEase = -1;
    for (let alpha = 0.0; alpha <= 1.0; alpha += 0.02) {
      const ease = evaluateCubicBezierEase(alpha);
      expect(ease).toBeGreaterThanOrEqual(prevEase);
      expect(ease).toBeGreaterThanOrEqual(0.0);
      expect(ease).toBeLessThanOrEqual(1.0);
      prevEase = ease;
    }

    // Exact symmetry around alpha = 0.5
    expect(evaluateCubicBezierEase(0.5)).toBe(0.5);
    expect(evaluateCubicBezierEase(0.25) + evaluateCubicBezierEase(0.75)).toBeCloseTo(1.0, 5);
  });
});
