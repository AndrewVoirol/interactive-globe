/**
 * Indicatrix Engine — Procedural Web Audio API Synthesis Engine
 * 
 * Implements zero-dependency Web Audio synthesizers for physical and geometric events:
 * - Mode 2: Griffith LEFM Fracture Acoustic Rupture Synthesizer
 * - Mode 3: Hydrodynamic Flow Pink-Noise Lowpass Synthesizer
 * - Mode 4: 5-Tone Icosahedral Harmonic Dymaxion Chime Synthesizer
 * - Signature Interaction: Resonant Damped Spring Pinch Rebound Ping Synthesizer
 * 
 * Conforms strictly to design-language.md Section 4.
 */

export const DYMAXION_CHIME_FREQUENCIES: readonly number[] = [
  261.63, // C4 (f0)
  329.63, // E4 (f1)
  392.00, // G4 (f2)
  493.88, // B4 (f3)
  523.25, // C5 (f4)
];

export class ProceduralAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  
  // Continuous Flow Synthesizer Nodes
  private flowNoiseNode: AudioBufferSourceNode | null = null;
  private flowFilterNode: BiquadFilterNode | null = null;
  private flowGainNode: GainNode | null = null;
  private isFlowActive: boolean = false;

  constructor(initialMuted: boolean = false) {
    this.isMuted = initialMuted;
    if (!this.isMuted) {
      this.initAudioContext();
    }
  }

  private initAudioContext(): void {
    if (this.ctx) return;
    if (typeof window !== 'undefined' || typeof globalThis !== 'undefined') {
      const AudioCtxClass =
        (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) ||
        (globalThis as any).AudioContext;
      if (AudioCtxClass) {
        try {
          this.ctx = new AudioCtxClass();
        } catch {
          this.ctx = null;
        }
      }
    }
  }

  public getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  public ensureContextRunning(): void {
    if (!this.ctx && !this.isMuted) {
      this.initAudioContext();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMute(muted: boolean): void {
    this.isMuted = muted;
    if (!muted && !this.ctx) {
      this.initAudioContext();
    }
    if (muted && this.flowGainNode && this.ctx) {
      this.flowGainNode.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Mode 2: Griffith LEFM Fracture Acoustic Rupture Synthesizer
   * Noise buffer source -> Highpass 1200Hz -> Exponential bandpass sweep (3500Hz -> 800Hz) upon fracture.
   */
  public triggerRupture(intensity: number = 1.0): void {
    if (this.isMuted || !this.ctx) return;
    this.ensureContextRunning();

    try {
      const duration = 0.12;
      const sampleRate = this.ctx.sampleRate || 44100;
      const bufferSize = Math.floor(sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const hpFilter = this.ctx.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.setValueAtTime(1200, this.ctx.currentTime);
      hpFilter.Q.setValueAtTime(4.0, this.ctx.currentTime);

      const bpFilter = this.ctx.createBiquadFilter();
      bpFilter.type = 'bandpass';
      const startFreq = Math.min(18000, Math.max(100, 3500 * intensity));
      bpFilter.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
      bpFilter.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.10);

      const gain = this.ctx.createGain();
      const peakGain = Math.max(0.001, 0.4 * intensity);
      gain.gain.setValueAtTime(peakGain, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.10);

      noise.connect(hpFilter);
      hpFilter.connect(bpFilter);
      bpFilter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start();
    } catch {
      // Graceful fallback if Web Audio fails in restricted environments
    }
  }

  /**
   * Mode 3: Hydrodynamic Flow Synthesizer (Pink noise generator with lowpass sweep)
   * Modulates cutoff frequency [180 Hz, 1400 Hz] based on velocity magnitude.
   */
  public updateFlowVelocity(velocityMagnitude: number): void {
    if (this.isMuted || !this.ctx) return;
    this.ensureContextRunning();

    const normalizedVel = Math.max(0.0, Math.min(1.0, velocityMagnitude / 1.5));

    if (!this.isFlowActive && normalizedVel > 0.02) {
      this.startFlowSynthesizer();
    }

    if (this.flowFilterNode && this.flowGainNode && this.ctx) {
      const now = this.ctx.currentTime;
      // Lowpass cutoff modulated between 180 Hz and 1400 Hz
      const targetCutoff = 180 + normalizedVel * (1400 - 180);
      this.flowFilterNode.frequency.setTargetAtTime(targetCutoff, now, 0.05);

      const targetGain = normalizedVel * 0.25;
      this.flowGainNode.gain.setTargetAtTime(targetGain, now, 0.05);
    }
  }

  private startFlowSynthesizer(): void {
    if (!this.ctx || this.isFlowActive) return;

    try {
      const sampleRate = this.ctx.sampleRate || 44100;
      const bufferSize = sampleRate * 2; // 2 second looping buffer
      const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      // Generate Pink Noise using Voss-McCartney algorithm approximation
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }

      this.flowNoiseNode = this.ctx.createBufferSource();
      this.flowNoiseNode.buffer = buffer;
      this.flowNoiseNode.loop = true;

      this.flowFilterNode = this.ctx.createBiquadFilter();
      this.flowFilterNode.type = 'lowpass';
      this.flowFilterNode.frequency.setValueAtTime(180, this.ctx.currentTime);

      this.flowGainNode = this.ctx.createGain();
      this.flowGainNode.gain.setValueAtTime(0.0001, this.ctx.currentTime);

      this.flowNoiseNode.connect(this.flowFilterNode);
      this.flowFilterNode.connect(this.flowGainNode);
      this.flowGainNode.connect(this.ctx.destination);

      this.flowNoiseNode.start();
      this.isFlowActive = true;
    } catch {
      this.isFlowActive = false;
    }
  }

  public stopFlowSynthesizer(): void {
    if (this.flowNoiseNode) {
      try {
        this.flowNoiseNode.stop();
        this.flowNoiseNode.disconnect();
      } catch {}
      this.flowNoiseNode = null;
    }
    this.flowFilterNode = null;
    this.flowGainNode = null;
    this.isFlowActive = false;
  }

  /**
   * Mode 4: Dymaxion Facet Chime Synthesizer
   * Triggers sine wave chimes tuned to icosahedral symmetry frequencies (261.63Hz .. 523.25Hz).
   */
  public triggerChime(facetIndex: number = 0): void {
    if (this.isMuted || !this.ctx) return;
    this.ensureContextRunning();

    try {
      const idx = Math.abs(facetIndex) % DYMAXION_CHIME_FREQUENCIES.length;
      const freq = DYMAXION_CHIME_FREQUENCIES[idx];

      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.40);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.40);
    } catch {}
  }

  /**
   * Signature Interaction: Damped Harmonic Rebound Resonant Ping
   * Triggers a sine ping f0 = 440 Hz * (1 + pinchDepth).
   */
  public triggerRebound(pinchDepth: number = 0.5): void {
    if (this.isMuted || !this.ctx) return;
    this.ensureContextRunning();

    try {
      const freq = 440 * (1.0 + Math.max(0.0, Math.min(1.0, pinchDepth)));

      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    } catch {}
  }

  public dispose(): void {
    this.stopFlowSynthesizer();
    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        this.ctx.close();
      } catch {}
    }
    this.ctx = null;
  }
}
