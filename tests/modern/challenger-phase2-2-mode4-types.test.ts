import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import type { SimulationMode } from '../../src/types';

describe('Challenger 2 Phase 2.2: Mode 4 Type Boundary & Excision Stress Test', () => {
  const projectRoot = path.resolve(__dirname, '../..');

  function runTsCheck(code: string): { ok: boolean; output: string } {
    const tmpFile = path.join(projectRoot, `temp-typecheck-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`);
    fs.writeFileSync(tmpFile, code, 'utf8');
    try {
      const stdout = execSync(`npx tsc --noEmit --ignoreConfig "${tmpFile}"`, {
        encoding: 'utf8',
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { ok: true, output: stdout };
    } catch (err: any) {
      return { ok: false, output: (err.stdout || '') + (err.stderr || '') };
    } finally {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  }

  it('TYPE-01: Compile-time assignment of Mode 4 to SimulationMode fails with TS2322', () => {
    // Compile-time static assertion with @ts-expect-error
    // @ts-expect-error Mode 4 must NOT be assignable to SimulationMode (0 | 1 | 2 | 3)
    const invalidMode: SimulationMode = 4;
    expect(invalidMode).toBe(4);

    // Also verify valid modes compile cleanly
    const m0: SimulationMode = 0;
    const m1: SimulationMode = 1;
    const m2: SimulationMode = 2;
    const m3: SimulationMode = 3;
    expect([m0, m1, m2, m3]).toEqual([0, 1, 2, 3]);
  });

  it('TYPE-02: Programmatic TypeScript compiler diagnostic verifies Mode 4 is rejected', () => {
    const testCode = `
      import { SimulationMode } from '${path.join(projectRoot, 'src/types').replace(/\\/g, '/')}';
      const m: SimulationMode = 4;
    `;
    const res = runTsCheck(testCode);
    expect(res.ok).toBe(false);
    expect(res.output).toContain('TS2322');
    expect(res.output).toContain("Type '4' is not assignable to type 'SimulationMode'");
  });

  it('TYPE-03: Programmatic TypeScript compiler verifies Modes 0..3 compile with zero diagnostic errors', () => {
    const testCode = `
      import { SimulationMode } from '${path.join(projectRoot, 'src/types').replace(/\\/g, '/')}';
      const m0: SimulationMode = 0;
      const m1: SimulationMode = 1;
      const m2: SimulationMode = 2;
      const m3: SimulationMode = 3;
      export const modes = [m0, m1, m2, m3];
    `;
    const res = runTsCheck(testCode);
    expect(res.ok).toBe(true);
  });

  it('TYPE-04: DymaxionProjectionResult interface has been completely excised from types', () => {
    const testCode = `
      import { DymaxionProjectionResult } from '${path.join(projectRoot, 'src/types').replace(/\\/g, '/')}';
    `;
    const res = runTsCheck(testCode);
    expect(res.ok).toBe(false);
    expect(res.output).toContain('TS2305');
    expect(res.output).toContain("has no exported member 'DymaxionProjectionResult'");
  });

  it('TYPE-05: src/utils/dymaxion.ts module has been deleted and cannot be resolved', () => {
    const dymaxionPath = path.join(projectRoot, 'src/utils/dymaxion.ts');
    expect(fs.existsSync(dymaxionPath)).toBe(false);

    const testCode = `
      import { projectToDymaxion2D } from '${path.join(projectRoot, 'src/utils/dymaxion').replace(/\\/g, '/')}';
    `;
    const res = runTsCheck(testCode);
    expect(res.ok).toBe(false);
    expect(res.output).toContain('TS2307');
    expect(res.output).toContain("Cannot find module");
  });
});
