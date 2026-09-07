import { describe, it, expect } from 'vitest';
import { AirDancerSim } from '../../src/components/tubeman/AirDancerSim';

describe('AirDancerSim - Inflatable Tube Man Physics Simulation', () => {
  it('initializes with correct node topology and non-zero dimensions', () => {
    const sim = new AirDancerSim(500, 800, 450);
    expect(sim.state.spine.length).toBe(24);
    expect(sim.state.leftArm.length).toBe(10);
    expect(sim.state.rightArm.length).toBe(10);
    expect(sim.state.headFringes.length).toBe(6);
    expect(sim.state.leftHandFringes.length).toBe(4);
    expect(sim.state.rightHandFringes.length).toBe(4);

    // Spine base is anchored at (500, 800)
    expect(sim.state.spine[0].x).toBe(500);
    expect(sim.state.spine[0].y).toBe(800);

    // Top spine node is elevated
    const topNode = sim.state.spine[23];
    expect(topNode.y).toBeLessThan(sim.state.spine[0].y);
  });

  it('runs 1,000 continuous simulation steps without NaNs or coordinate divergence', () => {
    const sim = new AirDancerSim(400, 700, 400);
    sim.blowerPower = 1.5;
    sim.windGust = 0.5;

    for (let frame = 0; frame < 1000; frame++) {
      sim.step(0.016);

      // Randomly grab and drag mid-run
      if (frame === 200) {
        sim.handlePointerDown(400, 500);
      } else if (frame === 250) {
        sim.handlePointerMove(450, 480);
      } else if (frame === 300) {
        sim.handlePointerUp();
      }

      // Check spine coordinates
      for (const node of sim.state.spine) {
        expect(Number.isFinite(node.x)).toBe(true);
        expect(Number.isFinite(node.y)).toBe(true);
        expect(Number.isFinite(node.vx)).toBe(true);
        expect(Number.isFinite(node.vy)).toBe(true);
      }

      // Check pupils
      expect(Number.isFinite(sim.state.leftEye.pupilX)).toBe(true);
      expect(Number.isFinite(sim.state.leftEye.pupilY)).toBe(true);
      expect(Number.isFinite(sim.state.rightEye.pupilX)).toBe(true);
      expect(Number.isFinite(sim.state.rightEye.pupilY)).toBe(true);
    }
  });

  it('correctly executes buckle collapse and backpressure whip-crack recovery', () => {
    const sim = new AirDancerSim(400, 700, 400);
    sim.blowerPower = 1.0;

    // Trigger buckle
    sim.triggerBuckle();
    expect(sim.state.isBuckled).toBe(true);
    expect(sim.state.kinkIndex).toBeGreaterThan(0);

    // Step until backpressure overcomes buckle and triggers snap
    let snapped = false;
    for (let frame = 0; frame < 120; frame++) {
      sim.step(0.016);
      if (sim.state.justSnapped) {
        snapped = true;
        break;
      }
    }

    expect(snapped).toBe(true);
    expect(sim.state.isBuckled).toBe(false);
    expect(sim.state.kinkIndex).toBe(-1);
  });

  it('keeps googly eye pupils strictly confined within sclera boundary', () => {
    const sim = new AirDancerSim(400, 700, 400);
    sim.blowerPower = 2.0; // Extreme chaos
    sim.windGust = 1.5;

    for (let i = 0; i < 300; i++) {
      sim.step(0.016);
      const maxLeft = sim.state.leftEye.scleraRadius - sim.state.leftEye.pupilRadius;
      const leftDist = Math.hypot(sim.state.leftEye.pupilX, sim.state.leftEye.pupilY);
      expect(leftDist).toBeLessThanOrEqual(maxLeft + 0.1);

      const maxRight = sim.state.rightEye.scleraRadius - sim.state.rightEye.pupilRadius;
      const rightDist = Math.hypot(sim.state.rightEye.pupilX, sim.state.rightEye.pupilY);
      expect(rightDist).toBeLessThanOrEqual(maxRight + 0.1);
    }
  });

  it('responds to pointer hit test and drag tracking', () => {
    const sim = new AirDancerSim(400, 700, 400);
    // Find coordinates of spine node 10
    const node10 = sim.state.spine[10];
    const hit = sim.handlePointerDown(node10.x, node10.y);
    expect(hit).toBe(true);
    expect(sim.grabbedNode).toEqual({ type: 'spine', index: 10 });

    sim.handlePointerMove(node10.x + 50, node10.y - 20);
    expect(sim.mousePos).toEqual({ x: node10.x + 50, y: node10.y - 20 });

    sim.handlePointerUp();
    expect(sim.grabbedNode).toBeNull();
  });
});
