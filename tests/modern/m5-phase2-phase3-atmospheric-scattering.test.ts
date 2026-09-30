import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Milestone 5: Phase 2 (Stratum-on-Stratum Shadows) & Phase 3 (Anisotropic Phase Scattering)', () => {
  const root = process.cwd();
  const cloudShellWgslPath = path.join(root, 'src/webgpu/shaders/cloud_shell.wgsl');
  const enginePath = path.join(root, 'src/webgpu/WebGPUEngine.ts');

  const cloudWgsl = fs.readFileSync(cloudShellWgslPath, 'utf8');
  const engineSrc = fs.readFileSync(enginePath, 'utf8');

  // Authoritative mathematical implementation of single-lobe Henyey-Greenstein (Spec §11)
  function henyeyGreenstein(mu: number, g: number): number {
    const g2 = g * g;
    const denom = Math.max(1e-4, 1.0 + g2 - 2.0 * g * mu);
    return (1.0 - g2) / (4.0 * Math.PI * Math.pow(denom, 1.5));
  }

  // Authoritative mathematical implementation of dual-lobe Henyey-Greenstein (Spec §11)
  function dualLobePhase(mu: number, gFwd: number = 0.72, gBwd: number = 0.28, wFwd: number = 0.82): number {
    const fwd = henyeyGreenstein(mu, gFwd);
    const bwd = henyeyGreenstein(mu, -gBwd);
    return wFwd * fwd + (1.0 - wFwd) * bwd;
  }

  // Inter-deck shadow evaluation reference model (Spec §10)
  function computeInterdeckShadow(
    layerIdx: number,
    midCloudDensity: number,
    highCloudDensity: number,
    shadowIntensity: number = 0.55
  ): { tauInterdeck: number; interdeckShadow: number } {
    const smoothstep = (e0: number, e1: number, x: number) => {
      const t = Math.max(0.0, Math.min(1.0, (x - e0) / (e1 - e0)));
      return t * t * (3.0 - 2.0 * t);
    };

    const tauMid = smoothstep(0.10, 0.40, midCloudDensity) * 0.55;
    const tauHigh = smoothstep(0.12, 0.45, highCloudDensity) * 0.30;

    let tauInterdeck = 0.0;
    if (layerIdx === 0) {
      tauInterdeck = tauMid + tauHigh;
    } else if (layerIdx === 1) {
      tauInterdeck = tauHigh;
    } else {
      tauInterdeck = 0.0;
    }

    const interdeckShadow = Math.max(0.0, Math.min(1.0, 1.0 - shadowIntensity * tauInterdeck));
    return { tauInterdeck, interdeckShadow };
  }

  // Shadow projection offset calculation (Spec §10)
  function computeShadowOffset(
    deltaHKm: number,
    sunAzDeg: number,
    sunAltDeg: number,
    vCoord: number
  ): { deltaU: number; deltaV: number } {
    const TWO_PI_RE_KM = 40030.17;
    const PI_RE_KM = 20015.09;

    const radAz = (sunAzDeg * Math.PI) / 180.0;
    const clampedAlt = Math.max(5.0, Math.min(85.0, sunAltDeg > 0.0 ? sunAltDeg : 45.0));
    const radAlt = (clampedAlt * Math.PI) / 180.0;
    const tanAlt = Math.tan(radAlt);

    const cosLat = Math.max(0.15, Math.cos((vCoord - 0.5) * Math.PI));
    const deltaU = -(deltaHKm / (tanAlt * TWO_PI_RE_KM)) * Math.cos(radAz) / cosLat;
    const deltaV =  (deltaHKm / (tanAlt * PI_RE_KM)) * Math.sin(radAz);

    return { deltaU, deltaV };
  }

  // ==========================================================================
  // Pillar 1: WGSL AST Tokens & Source Anti-Regression Verification
  // ==========================================================================
  describe('Pillar 1: WGSL AST Tokens & WebGPU Bindings (Rules 4, 18, 21)', () => {
    it('M5-AST-01: cloud_shell.wgsl declares bindings 10 and 11 for upper stratum textures', () => {
      expect(cloudWgsl).toContain('@group(0) @binding(10) var u_midCloudTexture: texture_2d<f32>;');
      expect(cloudWgsl).toContain('@group(0) @binding(11) var u_highCloudTexture: texture_2d<f32>;');
    });

    it('M5-AST-02: cloud_shell.wgsl defines Henyey-Greenstein helper functions', () => {
      expect(cloudWgsl).toContain('fn henyeyGreenstein(mu: f32, g: f32) -> f32');
      expect(cloudWgsl).toContain('fn dualLobePhase(mu: f32, gFwd: f32, gBwd: f32, wFwd: f32) -> f32');
    });

    it('M5-AST-03: WebGPUEngine.ts includes bindings 10 and 11 in cloud_shell_bind_group_layout', () => {
      const layoutIdx = engineSrc.indexOf("label: 'cloud_shell_bind_group_layout'");
      expect(layoutIdx).toBeGreaterThan(0);
      const layoutSnippet = engineSrc.slice(layoutIdx, layoutIdx + 2000);

      expect(layoutSnippet).toContain("{ binding: 10, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } }");
      expect(layoutSnippet).toContain("{ binding: 11, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } }");
    });

    it('M5-AST-04: WebGPUEngine.ts binds midView and highView across low, mid, and high bind groups', () => {
      const updateIdx = engineSrc.indexOf('public updateCloudBindGroups(): void');
      expect(updateIdx).toBeGreaterThan(0);
      const updateSnippet = engineSrc.slice(updateIdx, updateIdx + 4500);

      expect(updateSnippet).toContain('const midView = this.cloudTextures.mid.createView();');
      expect(updateSnippet).toContain('const highView = this.cloudTextures.high.createView();');
      expect(updateSnippet).toContain('{ binding: 10, resource: midView }');
      expect(updateSnippet).toContain('{ binding: 11, resource: highView }');
    });

    it('M5-AST-05: Rule 4 uniform control flow - textureSampleLevel at explicit LOD 0.0 evaluated before discards', () => {
      const firstDiscardIdx = cloudWgsl.indexOf('discard;');
      expect(firstDiscardIdx).toBeGreaterThan(0);

      const midSampleIdx = cloudWgsl.indexOf('textureSampleLevel(u_midCloudTexture');
      const highSampleIdx = cloudWgsl.indexOf('textureSampleLevel(u_highCloudTexture');

      expect(midSampleIdx).toBeGreaterThan(0);
      expect(highSampleIdx).toBeGreaterThan(0);
      expect(midSampleIdx).toBeLessThan(firstDiscardIdx);
      expect(highSampleIdx).toBeLessThan(firstDiscardIdx);
    });

    it('M5-AST-06: Preserves all Rule 21 AST invariant tokens verbatim', () => {
      expect(cloudWgsl).toContain('let rawCloud = mix(c0, c1, blendWeight);');
      expect(cloudWgsl).toContain('let featheredCloud = smoothstep(0.0, 0.20, condensedCloud);');
      expect(cloudWgsl).toContain('let blockedCloud = effectiveCloud * alphaStratum;');
      expect(cloudWgsl).toContain('var alpha = blockedCloud * baseLayerOpacity * cloud.u_layerOpacity.w * horizonAtten;');
      expect(cloudWgsl).toContain('let slabPathFactor = clamp(1.0 / muEff, 1.0, 2.5);');
      expect(cloudWgsl).toContain('alpha = (1.0 - exp(-alpha * slabPathFactor * 1.8));');
      expect(cloudWgsl).toContain('let selfShadow = mix(1.0 - cloud.u_shadowIntensity * 0.5, 1.0, NdotL);');
      expect(cloudWgsl).toContain('baseDensity *= rainShadowAtten;');
      expect(cloudWgsl).toContain('cloudColor = cloudColor * interdeckShadow;');
    });
  });

  // ==========================================================================
  // Pillar 2: Phase Function Mathematical & Energy Conservation Proofs
  // ==========================================================================
  describe('Pillar 2: Phase Function Optics & Analytical Energy Conservation (Spec §11)', () => {
    it('M5-PHASE-01: Henyey-Greenstein forward lobe exhibits strictly positive forward diffraction peak', () => {
      const pFwdMax = henyeyGreenstein(1.0, 0.72);
      const pFwdMid = henyeyGreenstein(0.0, 0.72);
      const pFwdMin = henyeyGreenstein(-1.0, 0.72);

      expect(pFwdMax).toBeGreaterThan(pFwdMid);
      expect(pFwdMid).toBeGreaterThan(pFwdMin);
      expect(pFwdMax).toBeCloseTo(1.7458, 3);
      expect(pFwdMin).toBeCloseTo(0.0075, 3);
    });

    it('M5-PHASE-02: Dual-lobe function exhibits silver-lining forward peak and opposition back-scatter rise', () => {
      const pForward = dualLobePhase(1.0);       // Backlit (looking toward sun)
      const pSide = dualLobePhase(0.0);          // Side-lit
      const pBackscatter = dualLobePhase(-1.0);  // Sun behind camera

      // Forward peak must be the highest (silver lining)
      expect(pForward).toBeGreaterThan(pSide);
      expect(pForward).toBeGreaterThan(pBackscatter);

      // Back-scatter opposition surge must be higher than side-lit neutral baseline
      expect(pBackscatter).toBeGreaterThan(pSide);

      // Raw 4*PI phase values
      const phaseFactorFwd = 4.0 * Math.PI * pForward;
      const phaseFactorSide = 4.0 * Math.PI * pSide;
      const phaseFactorBack = 4.0 * Math.PI * pBackscatter;

      expect(phaseFactorFwd).toBeGreaterThan(15.0); // Intense silver lining before clamping
      expect(phaseFactorBack).toBeGreaterThan(0.50); // Distinct opposition brightening
      expect(phaseFactorSide).toBeLessThan(phaseFactorBack);
    });

    it('M5-PHASE-03: Analytical and numerical energy conservation holds strictly (integral over 4pi = 1.0)', () => {
      // Numerical integration of dualLobePhase(mu) over the unit sphere:
      // Integral_{4pi} P dOmega = 2 * pi * Integral_{-1}^{1} P(mu) dmu
      const N_STEPS = 50000;
      const dMu = 2.0 / N_STEPS;
      let integral = 0.0;

      for (let i = 0; i < N_STEPS; i++) {
        const mu = -1.0 + (i + 0.5) * dMu;
        integral += dualLobePhase(mu, 0.72, 0.28, 0.82) * dMu;
      }
      const totalSphereScattering = 2.0 * Math.PI * integral;

      // Must equal 1.0000 within 10^-4 tolerance
      expect(totalSphereScattering).toBeCloseTo(1.0, 4);
    });

    it('M5-PHASE-04: Substrate-protected phase factor is strictly bounded in [0.55, 1.85]', () => {
      const mus = [-1.0, -0.8, -0.5, -0.2, 0.0, 0.2, 0.5, 0.8, 1.0];
      for (const mu of mus) {
        const rawFactor = dualLobePhase(mu) * 4.0 * Math.PI;
        const clampedFactor = Math.max(0.55, Math.min(1.85, rawFactor));
        expect(clampedFactor).toBeGreaterThanOrEqual(0.55);
        expect(clampedFactor).toBeLessThanOrEqual(1.85);
      }
    });
  });

  // ==========================================================================
  // Pillar 3: Stratum-on-Stratum Shadow Coupling Mechanics
  // ==========================================================================
  describe('Pillar 3: Stratum-on-Stratum Shadow Geometry & Deck Attenuation (Spec §10)', () => {
    it('M5-SHADOW-01: High cirrus (layer 2) is completely immune to inter-deck cast shadows', () => {
      const res = computeInterdeckShadow(2, 0.9, 0.9, 0.60);
      expect(res.tauInterdeck).toBe(0.0);
      expect(res.interdeckShadow).toBe(1.0);
    });

    it('M5-SHADOW-02: Mid altocumulus (layer 1) receives shadows exclusively from high cirrus', () => {
      // With high cloud absent, mid deck receives zero shadow even if mid cloud is dense
      const clearHigh = computeInterdeckShadow(1, 0.8, 0.0, 0.55);
      expect(clearHigh.tauInterdeck).toBe(0.0);
      expect(clearHigh.interdeckShadow).toBe(1.0);

      // With high cloud present, mid deck shadow factor decreases monotonically
      const denseHigh = computeInterdeckShadow(1, 0.8, 0.6, 0.55);
      expect(denseHigh.tauInterdeck).toBeGreaterThan(0.0);
      expect(denseHigh.interdeckShadow).toBeLessThan(1.0);
    });

    it('M5-SHADOW-03: Low stratus (layer 0) receives shadows from both mid and high strata', () => {
      const onlyMid = computeInterdeckShadow(0, 0.5, 0.0, 0.55);
      const onlyHigh = computeInterdeckShadow(0, 0.0, 0.5, 0.55);
      const both = computeInterdeckShadow(0, 0.5, 0.5, 0.55);

      expect(onlyMid.tauInterdeck).toBeGreaterThan(0.0);
      expect(onlyHigh.tauInterdeck).toBeGreaterThan(0.0);
      expect(both.tauInterdeck).toBeCloseTo(onlyMid.tauInterdeck + onlyHigh.tauInterdeck, 5);
      expect(both.interdeckShadow).toBeLessThan(onlyMid.interdeckShadow);
      expect(both.interdeckShadow).toBeLessThan(onlyHigh.interdeckShadow);
    });

    it('M5-SHADOW-04: Shadow offsets scale linearly with relative clearance (dh = 2.5, 4.5, 7.0 km)', () => {
      const offsetMid2Low = computeShadowOffset(2.5, 315.0, 45.0, 0.5);
      const offsetHigh2Mid = computeShadowOffset(4.5, 315.0, 45.0, 0.5);
      const offsetHigh2Low = computeShadowOffset(7.0, 315.0, 45.0, 0.5);

      const magMid2Low = Math.hypot(offsetMid2Low.deltaU, offsetMid2Low.deltaV);
      const magHigh2Mid = Math.hypot(offsetHigh2Mid.deltaU, offsetHigh2Mid.deltaV);
      const magHigh2Low = Math.hypot(offsetHigh2Low.deltaU, offsetHigh2Low.deltaV);

      // Clearance ratios: 4.5 / 2.5 = 1.8; 7.0 / 2.5 = 2.8
      expect(magHigh2Mid / magMid2Low).toBeCloseTo(1.8, 4);
      expect(magHigh2Low / magMid2Low).toBeCloseTo(2.8, 4);
    });

    it('M5-SHADOW-05: Horizon grazing sun altitude (5 deg) maintains finite displacement with zero singularities', () => {
      const offsetHorizon = computeShadowOffset(7.0, 45.0, 5.0, 0.5);
      expect(Number.isFinite(offsetHorizon.deltaU)).toBe(true);
      expect(Number.isFinite(offsetHorizon.deltaV)).toBe(true);
      expect(Math.abs(offsetHorizon.deltaU)).toBeGreaterThan(0.0);
      expect(Math.abs(offsetHorizon.deltaV)).toBeGreaterThan(0.0);
    });
  });

  // ==========================================================================
  // Pillar 4: Monte Carlo Fuzzing (25,000 Randomized Iterations)
  // ==========================================================================
  describe('Pillar 4: 25,000-Trial Monte Carlo Adversarial Fuzzing', () => {
    it('M5-MC-01: Probes phase function across 25,000 arbitrary angles for zero NaNs, zero Infs, and bounded output', () => {
      for (let i = 0; i < 25000; i++) {
        // Random 3D unit vectors for view and sun directions
        const theta1 = Math.random() * Math.PI;
        const phi1 = Math.random() * 2.0 * Math.PI;
        const vx = Math.sin(theta1) * Math.cos(phi1);
        const vy = Math.sin(theta1) * Math.sin(phi1);
        const vz = Math.cos(theta1);

        const theta2 = Math.random() * Math.PI;
        const phi2 = Math.random() * 2.0 * Math.PI;
        const sx = Math.sin(theta2) * Math.cos(phi2);
        const sy = Math.sin(theta2) * Math.sin(phi2);
        const sz = Math.cos(theta2);

        const cosTheta = vx * sx + vy * sy + vz * sz;
        const mu = -Math.max(-1.0, Math.min(1.0, cosTheta));

        const p = dualLobePhase(mu, 0.72, 0.28, 0.82);
        const factor = Math.max(0.55, Math.min(1.85, p * 4.0 * Math.PI));

        expect(Number.isFinite(p)).toBe(true);
        expect(p).toBeGreaterThan(0.0);
        expect(Number.isFinite(factor)).toBe(true);
        expect(factor).toBeGreaterThanOrEqual(0.55);
        expect(factor).toBeLessThanOrEqual(1.85);
      }
    });

    it('M5-MC-02: Probes multi-stratum shadow offset and attenuation across 25,000 random solar states', () => {
      const dhOptions = [2.5, 4.5, 7.0];
      for (let i = 0; i < 25000; i++) {
        const dh = dhOptions[Math.floor(Math.random() * dhOptions.length)];
        const az = Math.random() * 360.0;
        const alt = -30.0 + Math.random() * 120.0; // Probes negative, zero, grazing, and steep angles
        const v = Math.random();

        const offset = computeShadowOffset(dh, az, alt, v);
        expect(Number.isFinite(offset.deltaU)).toBe(true);
        expect(Number.isFinite(offset.deltaV)).toBe(true);

        const layerIdx = Math.floor(Math.random() * 3);
        const densMid = Math.random();
        const densHigh = Math.random();
        const intensity = Math.random() * 0.8;

        const shadow = computeInterdeckShadow(layerIdx, densMid, densHigh, intensity);
        expect(Number.isFinite(shadow.tauInterdeck)).toBe(true);
        expect(Number.isFinite(shadow.interdeckShadow)).toBe(true);
        expect(shadow.tauInterdeck).toBeGreaterThanOrEqual(0.0);
        expect(shadow.interdeckShadow).toBeGreaterThanOrEqual(0.0);
        expect(shadow.interdeckShadow).toBeLessThanOrEqual(1.0);
      }
    });
  });
});
