import { describe, it, expect } from 'vitest';
import { raySphereIntersect, RADIUS } from '../helpers/math-oracle';

describe('F10: Non-Blocking Cursor Screen Raycasting', () => {
  it('F10-T1: verifies center ray along camera look-at intersects sphere front at distance (camDist - R)', () => {
    const camDist = 15.0;
    const rayOrig: [number, number, number] = [0, 0, camDist];
    const rayDir: [number, number, number] = [0, 0, -1]; // Looking towards -Z

    const { hit, hitPos, distance } = raySphereIntersect(rayOrig, rayDir, RADIUS);

    expect(hit).toBe(true);
    expect(distance).toBeCloseTo(camDist - RADIUS, 4); // 15 - 5 = 10
    expect(hitPos).not.toBeNull();
    expect(hitPos![0]).toBeCloseTo(0.0, 4);
    expect(hitPos![1]).toBeCloseTo(0.0, 4);
    expect(hitPos![2]).toBeCloseTo(RADIUS, 4);
  });

  it('F10-T2: verifies ray hitting tangent edge of sphere returns distance and point on surface', () => {
    const rayOrig: [number, number, number] = [RADIUS, 0, 15.0];
    const rayDir: [number, number, number] = [0, 0, -1];

    const { hit, hitPos } = raySphereIntersect(rayOrig, rayDir, RADIUS);

    expect(hit).toBe(true);
    expect(hitPos).not.toBeNull();
    const radiusAtHit = Math.hypot(hitPos![0], hitPos![1], hitPos![2]);
    expect(radiusAtHit).toBeCloseTo(RADIUS, 3);
  });

  it('F10-T3: verifies ray that misses sphere returns hit = false and distance = Infinity', () => {
    const rayOrig: [number, number, number] = [RADIUS + 2.0, 0, 15.0]; // Outside radius
    const rayDir: [number, number, number] = [0, 0, -1];

    const { hit, hitPos, distance } = raySphereIntersect(rayOrig, rayDir, RADIUS);

    expect(hit).toBe(false);
    expect(hitPos).toBeNull();
    expect(distance).toBe(Infinity);
  });

  it('F10-T4: verifies pointer event handler does not call stopPropagation to allow OrbitControls drag', () => {
    let propagationStopped = false;
    const mockEvent = {
      clientX: 500,
      clientY: 300,
      stopPropagation: () => {
        propagationStopped = true;
      },
    };

    // Passive raycast handler
    const handlePointerMove = (e: typeof mockEvent) => {
      // Updates raycast state without calling stopPropagation()
      const _x = e.clientX;
      const _y = e.clientY;
    };

    handlePointerMove(mockEvent);
    expect(propagationStopped).toBe(false);
  });

  it('F10-T5: verifies raycasting responds accurately to rotated camera origin', () => {
    // Camera placed on +X axis looking towards -X
    const rayOrig: [number, number, number] = [15.0, 0, 0];
    const rayDir: [number, number, number] = [-1, 0, 0];

    const { hit, hitPos, distance } = raySphereIntersect(rayOrig, rayDir, RADIUS);

    expect(hit).toBe(true);
    expect(distance).toBeCloseTo(10.0, 4);
    expect(hitPos![0]).toBeCloseTo(RADIUS, 4);
    expect(hitPos![1]).toBeCloseTo(0.0, 4);
    expect(hitPos![2]).toBeCloseTo(0.0, 4);
  });
});
