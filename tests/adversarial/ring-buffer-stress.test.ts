/**
 * tests/adversarial/ring-buffer-stress.test.ts
 *
 * Adversarial Challenger Stress Suite for TemporalTextureRingBuffer (Pillar A).
 * Enforces:
 * 1. 10,000 rapid advance() calls with zero aliasing between slots
 * 2. Upload of distinct known patterns across slots and tracking through cyclic advances
 * 3. Robust post-disposal defense across all methods without unhandled process crashes
 */

import { describe, it, expect } from 'vitest';
import { MockGPUDevice } from '../helpers/webgpu-mock';
import { TemporalTextureRingBuffer } from '../../src/webgpu/TemporalTextureRingBuffer';

describe('Adversarial Challenger: TemporalTextureRingBuffer Stress Suite', () => {
  it('Pillar A: 10,000 rapid advance() calls ensuring slot indices never alias', () => {
    const device = new MockGPUDevice();
    const ring = new TemporalTextureRingBuffer(device as any, 256, 128, 'r16float');

    const initT0 = ring.getTexture(0);
    const initT1 = ring.getTexture(1);
    const initT2 = ring.getTexture(2);

    // Initial slot textures must be strictly distinct
    expect(initT0).not.toBe(initT1);
    expect(initT1).not.toBe(initT2);
    expect(initT0).not.toBe(initT2);

    const TOTAL_CALLS = 10_000;
    const t0 = performance.now();

    for (let k = 1; k <= TOTAL_CALLS; k++) {
      ring.advance();

      const cur0 = ring.getTexture(0);
      const cur1 = ring.getTexture(1);
      const cur2 = ring.getTexture(2);

      // Invariant: Two logical slots must NEVER point to the same physical texture (no aliasing)
      if (cur0 === cur1 || cur1 === cur2 || cur0 === cur2) {
        throw new Error(
          `Slot aliasing detected at step ${k}: slot0 === slot1 (${cur0 === cur1}), ` +
          `slot1 === slot2 (${cur1 === cur2}), slot0 === slot2 (${cur0 === cur2})`
        );
      }

      // Cyclic 3-permutation check:
      // advance() maps [S0, S1, S2] <- [S1, S2, S0]
      const rem = k % 3;
      if (rem === 1) {
        if (cur0 !== initT1 || cur1 !== initT2 || cur2 !== initT0) {
          throw new Error(`Permutation mismatch at step ${k} (rem=1)`);
        }
      } else if (rem === 2) {
        if (cur0 !== initT2 || cur1 !== initT0 || cur2 !== initT1) {
          throw new Error(`Permutation mismatch at step ${k} (rem=2)`);
        }
      } else {
        if (cur0 !== initT0 || cur1 !== initT1 || cur2 !== initT2) {
          throw new Error(`Permutation mismatch at step ${k} (rem=0)`);
        }
      }
    }

    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(1000); // 10,000 pointer swaps should take < 1s
    expect(device.textures.length).toBe(3); // Zero new texture reallocations
  });

  it('Pillar A: Upload distinct known patterns, advance multiple times, verify data is in the correct logical slot', () => {
    const device = new MockGPUDevice();
    const width = 64;
    const height = 64;
    const ring = new TemporalTextureRingBuffer(device as any, width, height, 'r16float');

    // Associate each physical texture with an ID to track data mapping
    const tex0 = ring.getTexture(0);
    const tex1 = ring.getTexture(1);
    const tex2 = ring.getTexture(2);

    const textureIdMap = new Map<any, string>([
      [tex0, 'PHYSICAL_TEX_0'],
      [tex1, 'PHYSICAL_TEX_1'],
      [tex2, 'PHYSICAL_TEX_2'],
    ]);

    // Track written patterns by physical texture
    const texturePayloads = new Map<string, number>();

    // Helper to upload a distinct pattern (marker value) to a given logical slot
    function uploadPattern(slot: 0 | 1 | 2, marker: number) {
      const activeTexture = ring.getTexture(slot);
      const textureId = textureIdMap.get(activeTexture)!;
      texturePayloads.set(textureId, marker);

      const buf = new Uint16Array(width * height);
      buf[0] = marker;
      ring.uploadSlice(slot, buf.buffer);

      // Verify the write target on GPU queue matches active physical texture
      const lastCall = device.queue.writeTextureCalls[device.queue.writeTextureCalls.length - 1];
      expect(lastCall.destination.texture).toBe(activeTexture);
    }

    // Upload distinct patterns to all 3 slots:
    // Slot 0 -> 0x1111 (on tex0)
    // Slot 1 -> 0x2222 (on tex1)
    // Slot 2 -> 0x3333 (on tex2)
    uploadPattern(0, 0x1111);
    uploadPattern(1, 0x2222);
    uploadPattern(2, 0x3333);

    expect(texturePayloads.get(textureIdMap.get(ring.getTexture(0))!)).toBe(0x1111);
    expect(texturePayloads.get(textureIdMap.get(ring.getTexture(1))!)).toBe(0x2222);
    expect(texturePayloads.get(textureIdMap.get(ring.getTexture(2))!)).toBe(0x3333);

    // Advance 1:
    // Slot 0 should now hold what was in Slot 1 (0x2222, tex1)
    // Slot 1 should now hold what was in Slot 2 (0x3333, tex2)
    // Slot 2 should now hold what was in Slot 0 (0x1111, tex0)
    ring.advance();
    expect(ring.getTexture(0)).toBe(tex1);
    expect(ring.getTexture(1)).toBe(tex2);
    expect(ring.getTexture(2)).toBe(tex0);
    expect(texturePayloads.get(textureIdMap.get(ring.getTexture(0))!)).toBe(0x2222);
    expect(texturePayloads.get(textureIdMap.get(ring.getTexture(1))!)).toBe(0x3333);
    expect(texturePayloads.get(textureIdMap.get(ring.getTexture(2))!)).toBe(0x1111);

    // Advance 2:
    // Slot 0 -> tex2 (0x3333)
    // Slot 1 -> tex0 (0x1111)
    // Slot 2 -> tex1 (0x2222)
    ring.advance();
    expect(ring.getTexture(0)).toBe(tex2);
    expect(ring.getTexture(1)).toBe(tex0);
    expect(ring.getTexture(2)).toBe(tex1);
    expect(texturePayloads.get(textureIdMap.get(ring.getTexture(0))!)).toBe(0x3333);
    expect(texturePayloads.get(textureIdMap.get(ring.getTexture(1))!)).toBe(0x1111);
    expect(texturePayloads.get(textureIdMap.get(ring.getTexture(2))!)).toBe(0x2222);

    // Advance 3 (completes 3-cycle, returns to base):
    ring.advance();
    expect(ring.getTexture(0)).toBe(tex0);
    expect(ring.getTexture(1)).toBe(tex1);
    expect(ring.getTexture(2)).toBe(tex2);
    expect(texturePayloads.get(textureIdMap.get(ring.getTexture(0))!)).toBe(0x1111);
    expect(texturePayloads.get(textureIdMap.get(ring.getTexture(1))!)).toBe(0x2222);
    expect(texturePayloads.get(textureIdMap.get(ring.getTexture(2))!)).toBe(0x3333);

    // Stress test over 500 streaming cycles:
    // Upload next frame to staging Slot 2, advance, verify it appears in Slot 1 then Slot 0
    for (let cycle = 1; cycle <= 500; cycle++) {
      const pattern = (0x4000 + cycle) & 0xffff;
      uploadPattern(2, pattern);

      // Advance 1: staging slot 2 data must move to slot 1 (current frame)
      ring.advance();
      expect(texturePayloads.get(textureIdMap.get(ring.getTexture(1))!)).toBe(pattern);

      // Advance 2: slot 1 data must move to slot 0 (previous frame)
      ring.advance();
      expect(texturePayloads.get(textureIdMap.get(ring.getTexture(0))!)).toBe(pattern);
    }
  });

  it('Pillar A: dispose() followed by any method call — should not crash', () => {
    const device = new MockGPUDevice();
    const ring = new TemporalTextureRingBuffer(device as any, 128, 128, 'r16float');

    // Initial state
    expect(ring.disposed).toBe(false);

    // Dispose once
    expect(() => ring.dispose()).not.toThrow();
    expect(ring.disposed).toBe(true);

    // Idempotent: Calling dispose() multiple times should never crash or throw
    expect(() => ring.dispose()).not.toThrow();
    expect(() => ring.dispose()).not.toThrow();
    expect(ring.disposed).toBe(true);

    // Any method call after dispose must handle disposal safely without uncaught crashes
    // getTexture() defends cleanly with descriptive error
    expect(() => {
      try {
        ring.getTexture(0);
      } catch (err: any) {
        expect(err.message).toMatch(/disposed/i);
        return;
      }
      throw new Error('Expected getTexture to reject on disposed buffer');
    }).not.toThrow();

    expect(() => {
      try {
        ring.getTexture(1);
      } catch (err: any) {
        expect(err.message).toMatch(/disposed/i);
        return;
      }
      throw new Error('Expected getTexture to reject on disposed buffer');
    }).not.toThrow();

    expect(() => {
      try {
        ring.getTexture(2);
      } catch (err: any) {
        expect(err.message).toMatch(/disposed/i);
        return;
      }
      throw new Error('Expected getTexture to reject on disposed buffer');
    }).not.toThrow();

    // getTextureView() defends cleanly
    expect(() => {
      try {
        ring.getTextureView(0);
      } catch (err: any) {
        expect(err.message).toMatch(/disposed/i);
        return;
      }
      throw new Error('Expected getTextureView to reject on disposed buffer');
    }).not.toThrow();

    // advance() defends cleanly
    expect(() => {
      try {
        ring.advance();
      } catch (err: any) {
        expect(err.message).toMatch(/disposed/i);
        return;
      }
      throw new Error('Expected advance to reject on disposed buffer');
    }).not.toThrow();

    // uploadSlice() defends cleanly
    expect(() => {
      try {
        ring.uploadSlice(0, new Uint8Array(128 * 128 * 2));
      } catch (err: any) {
        expect(err.message).toMatch(/disposed/i);
        return;
      }
      throw new Error('Expected uploadSlice to reject on disposed buffer');
    }).not.toThrow();

    // Dispose on already destroyed GPU texture context
    const ring2 = new TemporalTextureRingBuffer(device as any, 64, 64, 'r16float');
    const t0 = ring2.getTexture(0);
    t0.destroy = () => {
      throw new Error('Device lost simulation');
    };
    expect(() => ring2.dispose()).not.toThrow();
    expect(ring2.disposed).toBe(true);
  });
});
