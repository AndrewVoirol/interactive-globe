import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import path from 'path';
import fs from 'fs';
import type { SimulationMode } from '../../src/types';

describe('Challenger 2 Phase 2.2: Mode 4 Type Boundary & Excision Stress Test', () => {
  const projectRoot = path.resolve(__dirname, '../..');

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

    const options: ts.CompilerOptions = {
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    };

    const host = ts.createCompilerHost(options);
    const originalGetSourceFile = host.getSourceFile;
    host.getSourceFile = (fileName, languageVersion) => {
      if (fileName === 'test-mode4-rejection.ts') {
        return ts.createSourceFile(fileName, testCode, languageVersion);
      }
      return originalGetSourceFile(fileName, languageVersion);
    };

    const program = ts.createProgram(['test-mode4-rejection.ts'], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);

    const typeErrors = diagnostics.filter(d => d.code === 2322); // TS2322: Type '4' is not assignable to type 'SimulationMode'.
    expect(typeErrors.length).toBeGreaterThanOrEqual(1);

    const message = ts.flattenDiagnosticMessageText(typeErrors[0].messageText, '\n');
    expect(message).toContain("Type '4' is not assignable to type 'SimulationMode'");
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

    const options: ts.CompilerOptions = {
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    };

    const host = ts.createCompilerHost(options);
    const originalGetSourceFile = host.getSourceFile;
    host.getSourceFile = (fileName, languageVersion) => {
      if (fileName === 'test-valid-modes.ts') {
        return ts.createSourceFile(fileName, testCode, languageVersion);
      }
      return originalGetSourceFile(fileName, languageVersion);
    };

    const program = ts.createProgram(['test-valid-modes.ts'], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);

    const errors = diagnostics.filter(d => d.file?.fileName === 'test-valid-modes.ts');
    expect(errors.length).toBe(0);
  });

  it('TYPE-04: DymaxionProjectionResult interface has been completely excised from types', () => {
    const testCode = `
      import { DymaxionProjectionResult } from '${path.join(projectRoot, 'src/types').replace(/\\/g, '/')}';
    `;

    const options: ts.CompilerOptions = {
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    };

    const host = ts.createCompilerHost(options);
    const originalGetSourceFile = host.getSourceFile;
    host.getSourceFile = (fileName, languageVersion) => {
      if (fileName === 'test-dymaxion-types.ts') {
        return ts.createSourceFile(fileName, testCode, languageVersion);
      }
      return originalGetSourceFile(fileName, languageVersion);
    };

    const program = ts.createProgram(['test-dymaxion-types.ts'], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);

    // TS2305: Module has no exported member 'DymaxionProjectionResult'
    const exportErrors = diagnostics.filter(d => d.code === 2305);
    expect(exportErrors.length).toBeGreaterThanOrEqual(1);
    const message = ts.flattenDiagnosticMessageText(exportErrors[0].messageText, '\n');
    expect(message).toContain("has no exported member 'DymaxionProjectionResult'");
  });

  it('TYPE-05: src/utils/dymaxion.ts module has been deleted and cannot be resolved', () => {
    const dymaxionPath = path.join(projectRoot, 'src/utils/dymaxion.ts');
    expect(fs.existsSync(dymaxionPath)).toBe(false);

    const testCode = `
      import { projectToDymaxion2D } from '${path.join(projectRoot, 'src/utils/dymaxion').replace(/\\/g, '/')}';
    `;

    const options: ts.CompilerOptions = {
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    };

    const host = ts.createCompilerHost(options);
    const originalGetSourceFile = host.getSourceFile;
    host.getSourceFile = (fileName, languageVersion) => {
      if (fileName === 'test-dymaxion-module.ts') {
        return ts.createSourceFile(fileName, testCode, languageVersion);
      }
      return originalGetSourceFile(fileName, languageVersion);
    };

    const program = ts.createProgram(['test-dymaxion-module.ts'], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);

    // TS2307: Cannot find module
    const moduleErrors = diagnostics.filter(d => d.code === 2307);
    expect(moduleErrors.length).toBeGreaterThanOrEqual(1);
  });
});
