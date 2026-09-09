// ============================================================================
// File: tests/phase3/trajectory-camera-litmus.test.ts
// Architecture: Trajectory Camera Controller & Litmus Test Flight Verification Suite
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { TrajectoryCameraController } from '../../src/core/camera/TrajectoryCameraController';
import {
  geodeticToCartesian,
  buildSubdividedPath,
  HAWAII_KEYFRAMES,
  CAPE_COD_KEYFRAMES,
  HAWAII_WAYPOINTS,
  CAPE_COD_WAYPOINTS,
} from '../../src/core/camera/litmusWaypoints';
import { Vector3 } from '../../src/core/math/cameraMath';

describe('TrajectoryCameraController & Litmus Flights', () => {
  let controller: TrajectoryCameraController;

  beforeEach(() => {
    controller = new TrajectoryCameraController();
  });

  it('TCC-01: initializes with default mode and orbital state', () => {
    expect(controller.mode).toBe('orbital');
    expect(controller.position.z).toBe(15);
    expect(controller.getProgress()).toBe(0);
    expect(controller.isFinished()).toBe(false);
  });

  it('TCC-02: geodeticToCartesian maps known coordinates correctly', () => {
    // North pole: lat 90 -> y = radius, x = 0, z = 0
    const pole = geodeticToCartesian(0, 90, 10);
    expect(pole.x).toBeCloseTo(0, 4);
    expect(pole.y).toBeCloseTo(10, 4);
    expect(pole.z).toBeCloseTo(0, 4);

    // Prime meridian on equator: lat 0, lon 0 -> z = radius, x = 0, y = 0
    const primeEq = geodeticToCartesian(0, 0, 10);
    expect(primeEq.x).toBeCloseTo(0, 4);
    expect(primeEq.y).toBeCloseTo(0, 4);
    expect(primeEq.z).toBeCloseTo(10, 4);

    // 90 E on equator: lat 0, lon 90 -> x = radius, y = 0, z = 0
    const eastEq = geodeticToCartesian(90, 0, 10);
    expect(eastEq.x).toBeCloseTo(10, 4);
    expect(eastEq.y).toBeCloseTo(0, 4);
    expect(eastEq.z).toBeCloseTo(0, 4);
  });

  it('TCC-03: HAWAII_WAYPOINTS respects safety floor and covers the sequence', () => {
    expect(HAWAII_WAYPOINTS.length).toBeGreaterThan(10);
    // Verify every waypoint is above radius 5.8 to prevent globe clipping
    for (const wp of HAWAII_WAYPOINTS) {
      const r = wp.position.length();
      expect(r).toBeGreaterThanOrEqual(5.8 - 1e-4);
    }

    // First waypoint should be wide Pacific
    const first = HAWAII_WAYPOINTS[0];
    expect(first.position.length()).toBeGreaterThan(12.0);

    // Last waypoint should be near Hawaii litmus coords (19.65°N, -155.55°W, r ~ 6.1)
    const last = HAWAII_WAYPOINTS[HAWAII_WAYPOINTS.length - 1];
    expect(last.position.length()).toBeCloseTo(6.1, 1);
  });

  it('TCC-04: CAPE_COD_WAYPOINTS respects safety floor and covers the sequence', () => {
    expect(CAPE_COD_WAYPOINTS.length).toBeGreaterThan(10);
    for (const wp of CAPE_COD_WAYPOINTS) {
      const r = wp.position.length();
      expect(r).toBeGreaterThanOrEqual(5.8 - 1e-4);
    }

    // First waypoint should be wide Atlantic (radius ~ 13.0)
    const first = CAPE_COD_WAYPOINTS[0];
    expect(first.position.length()).toBeGreaterThan(11.0);

    // Last waypoint should be near Cape Cod litmus coords (42°N, -70°W, r ~ 6.2)
    const last = CAPE_COD_WAYPOINTS[CAPE_COD_WAYPOINTS.length - 1];
    expect(last.position.length()).toBeCloseTo(6.2, 1);
  });

  it('TCC-05: updateDollyCinematic progresses smoothly across duration', () => {
    controller.setMode('dolly-cinematic');
    const duration = 8.0; // 8 seconds
    controller.setWaypoints(HAWAII_WAYPOINTS, duration, false);

    expect(controller.getProgress()).toBe(0);
    expect(controller.isFinished()).toBe(false);

    // Advance 4 seconds (half duration)
    controller.update(4.0);
    expect(controller.getProgress()).toBeCloseTo(0.5, 2);
    expect(controller.isFinished()).toBe(false);

    // Advance remaining 4.1 seconds (exceeds duration)
    controller.update(4.1);
    expect(controller.getProgress()).toBe(1.0);
    expect(controller.isFinished()).toBe(true);
    expect(controller.getIsPlaying()).toBe(false);
  });

  it('TCC-06: setProgress directly computes intermediate camera state', () => {
    controller.setMode('dolly-cinematic');
    controller.setWaypoints(CAPE_COD_WAYPOINTS, 10.0, false);

    controller.setProgress(0.0);
    const startPos = controller.position.clone();
    expect(startPos.length()).toBeGreaterThan(11.0);

    controller.setProgress(1.0);
    const endPos = controller.position.clone();
    expect(endPos.length()).toBeCloseTo(6.2, 1);

    expect(startPos.distanceTo(endPos)).toBeGreaterThan(5.0);
  });

  it('TCC-07: reset() restores initial state', () => {
    controller.setMode('dolly-cinematic');
    controller.setWaypoints(HAWAII_WAYPOINTS, 5.0, false);
    controller.update(3.0);
    expect(controller.getProgress()).toBeGreaterThan(0.5);

    controller.reset();
    expect(controller.getProgress()).toBe(0);
    expect(controller.getIsPlaying()).toBe(false);
  });

  it('TCC-08: finished flight allows replay by resetting progress', () => {
    controller.setMode('dolly-cinematic');
    controller.setWaypoints(HAWAII_WAYPOINTS, 5.0, false);
    controller.update(5.5);
    expect(controller.isFinished()).toBe(true);
    expect(controller.getProgress()).toBe(1.0);
    expect(controller.getIsPlaying()).toBe(false);

    // Replay sequence by resetting progress
    controller.setProgress(0);
    controller.setIsPlaying(true);
    expect(controller.isFinished()).toBe(false);
    expect(controller.getProgress()).toBe(0);
    expect(controller.getIsPlaying()).toBe(true);

    controller.update(2.5);
    expect(controller.getProgress()).toBeCloseTo(0.5, 2);
  });

  it('TCC-09: loop mode wraps pathProgress seamlessly', () => {
    controller.setMode('dolly-cinematic');
    controller.setWaypoints(CAPE_COD_WAYPOINTS, 8.0, true);
    controller.update(10.0); // 10s on an 8s loop
    expect(controller.isFinished()).toBe(false);
    expect(controller.getIsPlaying()).toBe(true);
    expect(controller.getProgress()).toBeCloseTo(0.25, 2);
  });

  it('TCC-10: lookAt target and orientation update during trajectory flight', () => {
    controller.setMode('dolly-cinematic');
    controller.setWaypoints(HAWAII_WAYPOINTS, 8.0, false);
    controller.setProgress(0.0);
    const startTarget = controller.target.clone();

    controller.setProgress(0.5);
    const midTarget = controller.target.clone();

    expect(startTarget.distanceTo(midTarget)).toBeGreaterThan(0.01);
  });
});

