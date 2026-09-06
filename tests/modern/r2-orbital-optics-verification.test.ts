import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('R2: 4K Orbital Textures & Atmospheric Terminator Verification', () => {
  const projectRoot = path.resolve(__dirname, '../..');

  it('R2-OPT-01: verifies real 4K NASA Blue Marble and Night Lights WebP assets exist in public/', () => {
    const dayPath = path.join(projectRoot, 'public/earth-blue-marble-4k.webp');
    const nightPath = path.join(projectRoot, 'public/earth-night-lights-4k.webp');

    expect(fs.existsSync(dayPath)).toBe(true);
    expect(fs.existsSync(nightPath)).toBe(true);

    const dayStats = fs.statSync(dayPath);
    const nightStats = fs.statSync(nightPath);

    // Verify assets are non-empty and reasonably sized (compressed 4K WebP)
    expect(dayStats.size).toBeGreaterThan(500 * 1024); // > 500 KB
    expect(nightStats.size).toBeGreaterThan(200 * 1024); // > 200 KB
  });

  it('R2-OPT-02: verifies WebGPUCanvas wires loadOrbitalTextures into boot and dynamic layer pipelines', () => {
    const canvasSrc = fs.readFileSync(path.join(projectRoot, 'src/webgpu/WebGPUCanvas.tsx'), 'utf8');

    expect(canvasSrc).toContain("engine.loadOrbitalTextures('/earth-blue-marble-4k.webp', '/earth-night-lights-4k.webp')");
    expect(canvasSrc).toContain("engine.isOrbitalTexturesLoaded()");
  });

  it('R2-OPT-03: verifies WebGPUEngine provides isOrbitalTexturesLoaded and procedural fallback has zero yellow bounding boxes', () => {
    const engineSrc = fs.readFileSync(path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts'), 'utf8');

    expect(engineSrc).toContain('isOrbitalTexturesLoaded(): boolean');
    expect(engineSrc).toContain('orbitalTexturesLoaded = true');

    // Verify crude hardcoded bounding boxes are eliminated from procedural fallback
    expect(engineSrc).not.toContain('lat > 10.0 && lat < 32.0 && lon > 70.0 && lon < 88.0');
    expect(engineSrc).not.toContain('lat > 22.0 && lat < 42.0 && lon > 105.0 && lon < 142.0');
  });

  it('R2-OPT-04: verifies crust_hydrosphere.wgsl uses refined twilight atmospheric scattering and balanced night radiance', () => {
    const shaderSrc = fs.readFileSync(path.join(projectRoot, 'src/webgpu/shaders/crust_hydrosphere.wgsl'), 'utf8');

    // Shader Option C contracts
    expect(shaderSrc).toContain('textureSampleLevel(u_orbitalTextures, u_orbitalSampler, input.uv, 0, 0.0)');
    expect(shaderSrc).toContain('textureSampleLevel(u_orbitalTextures, u_orbitalSampler, input.uv, 1, 0.0)');
    expect(shaderSrc).toContain('let nightLit = nightColor * (nightWeight * 1.25);');
    expect(shaderSrc).toContain('let twilightColor = vec3<f32>(1.0, 0.60, 0.28) * (twilightBand * 0.12);');
  });

  it('R2-OPT-05: verifies universal engine code contains no raw Node.js fs/path literals', () => {
    const engineSrc = fs.readFileSync(path.join(projectRoot, 'src/webgpu/WebGPUEngine.ts'), 'utf8');
    expect(engineSrc).not.toMatch(/import\(\s*\/\*[\s\S]*?\*\/\s*['"]fs['"]\s*\)/);
    expect(engineSrc).not.toMatch(/import\(\s*\/\*[\s\S]*?\*\/\s*['"]path['"]\s*\)/);
  });
});
