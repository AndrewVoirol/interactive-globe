// ============================================================================
// File: src/components/tubeman/AirDancerAudio.ts
// Procedural Web Audio API Synthesizer for Inflatable Tube Man
// Generates:
// - Industrial blower fan motor drone & vibration
// - Turbulent rushing air through nylon cylinder
// - Ripstop nylon fabric flapping & crinkling rustle
// - High-speed whip-crack snap whoosh on buckle recovery
// ============================================================================

export class AirDancerAudio {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterGain: GainNode | null = null;

  // Blower Fan Nodes
  private motorOsc1: OscillatorNode | null = null;
  private motorOsc2: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;

  // Airflow Noise Nodes
  private airNoiseNode: AudioBufferSourceNode | null = null;
  private airFilterNode: BiquadFilterNode | null = null;
  private airGainNode: GainNode | null = null;

  // Flapping / Rustle Nodes
  private flapNoiseNode: AudioBufferSourceNode | null = null;
  private flapFilterNode: BiquadFilterNode | null = null;
  private flapGainNode: GainNode | null = null;

  private isRunning: boolean = false;

  constructor(initialMuted: boolean = false) {
    this.isMuted = initialMuted;
  }

  public init(): void {
    if (this.ctx) return;
    try {
      const AudioContextClass =
        (typeof window !== 'undefined' && ((window as any).AudioContext || (window as any).webkitAudioContext)) || null;
      if (!AudioContextClass) return;

      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0.0 : 0.45, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.setupBlowerMotor();
      this.setupAirRush();
      this.setupFlapRustle();
      this.isRunning = true;
    } catch (err) {
      console.warn('AirDancerAudio init failed:', err);
    }
  }

  public ensureRunning(): void {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private setupBlowerMotor(): void {
    if (!this.ctx || !this.masterGain) return;

    // 55 Hz fundamental motor rumble
    this.motorOsc1 = this.ctx.createOscillator();
    this.motorOsc1.type = 'sawtooth';
    this.motorOsc1.frequency.setValueAtTime(55.0, this.ctx.currentTime);

    // 110 Hz harmonic buzz
    this.motorOsc2 = this.ctx.createOscillator();
    this.motorOsc2.type = 'triangle';
    this.motorOsc2.frequency.setValueAtTime(110.0, this.ctx.currentTime);

    const motorFilter = this.ctx.createBiquadFilter();
    motorFilter.type = 'lowpass';
    motorFilter.frequency.setValueAtTime(180, this.ctx.currentTime);
    motorFilter.Q.setValueAtTime(2.5, this.ctx.currentTime);

    this.motorGain = this.ctx.createGain();
    this.motorGain.gain.setValueAtTime(0.12, this.ctx.currentTime);

    this.motorOsc1.connect(motorFilter);
    this.motorOsc2.connect(motorFilter);
    motorFilter.connect(this.motorGain);
    this.motorGain.connect(this.masterGain);

    this.motorOsc1.start();
    this.motorOsc2.start();
  }

  private setupAirRush(): void {
    if (!this.ctx || !this.masterGain) return;

    // Generate looping 4-second pinkish/white noise buffer
    const bufferSize = this.ctx.sampleRate * 3.0;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.96300 * b1 + white * 0.160000;
      b2 = 0.57000 * b2 + white * 0.560000;
      output[i] = (b0 + b1 + b2 + white * 0.5362) * 0.11;
    }

    this.airNoiseNode = this.ctx.createBufferSource();
    this.airNoiseNode.buffer = noiseBuffer;
    this.airNoiseNode.loop = true;

    this.airFilterNode = this.ctx.createBiquadFilter();
    this.airFilterNode.type = 'bandpass';
    this.airFilterNode.frequency.setValueAtTime(450, this.ctx.currentTime);
    this.airFilterNode.Q.setValueAtTime(1.8, this.ctx.currentTime);

    this.airGainNode = this.ctx.createGain();
    this.airGainNode.gain.setValueAtTime(0.18, this.ctx.currentTime);

    this.airNoiseNode.connect(this.airFilterNode);
    this.airFilterNode.connect(this.airGainNode);
    this.airGainNode.connect(this.masterGain);

    this.airNoiseNode.start();
  }

  private setupFlapRustle(): void {
    if (!this.ctx || !this.masterGain) return;

    // Highpass noise for fabric crinkling
    const bufferSize = this.ctx.sampleRate * 2.0;
    const flapBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const out = flapBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      out[i] = (Math.random() * 2 - 1) * 0.2;
    }

    this.flapNoiseNode = this.ctx.createBufferSource();
    this.flapNoiseNode.buffer = flapBuffer;
    this.flapNoiseNode.loop = true;

    this.flapFilterNode = this.ctx.createBiquadFilter();
    this.flapFilterNode.type = 'highpass';
    this.flapFilterNode.frequency.setValueAtTime(1400, this.ctx.currentTime);
    this.flapFilterNode.Q.setValueAtTime(0.8, this.ctx.currentTime);

    this.flapGainNode = this.ctx.createGain();
    this.flapGainNode.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.flapNoiseNode.connect(this.flapFilterNode);
    this.flapFilterNode.connect(this.flapGainNode);
    this.flapGainNode.connect(this.masterGain);

    this.flapNoiseNode.start();
  }

  public update(blowerPower: number, angularActivity: number, isBuckled: boolean): void {
    if (!this.ctx || !this.isRunning) return;

    const now = this.ctx.currentTime;

    // Motor sound tracks blower power
    if (this.motorGain && this.motorOsc1 && this.motorOsc2) {
      const targetMotorGain = blowerPower < 0.05 ? 0.0 : 0.08 + blowerPower * 0.12;
      this.motorGain.gain.setTargetAtTime(targetMotorGain, now, 0.08);

      const targetPitch = 48.0 + blowerPower * 18.0;
      this.motorOsc1.frequency.setTargetAtTime(targetPitch, now, 0.1);
      this.motorOsc2.frequency.setTargetAtTime(targetPitch * 2.0, now, 0.1);
    }

    // Airflow noise tracks blower and pressure
    if (this.airGainNode && this.airFilterNode) {
      const flowGain = blowerPower < 0.05 ? 0.0 : (isBuckled ? 0.08 : 0.22) * blowerPower;
      this.airGainNode.gain.setTargetAtTime(flowGain, now, 0.06);

      const filterFreq = isBuckled ? 280 : 380 + blowerPower * 250;
      this.airFilterNode.frequency.setTargetAtTime(filterFreq, now, 0.08);
    }

    // Fabric flapping rustle proportional to angular motion
    if (this.flapGainNode) {
      const activityNorm = Math.min(1.0, angularActivity / 24.0);
      const flapGain = blowerPower > 0.1 ? activityNorm * 0.25 * blowerPower : 0.0;
      this.flapGainNode.gain.setTargetAtTime(flapGain, now, 0.03);
    }
  }

  public triggerSnapWhoosh(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    try {
      const now = this.ctx.currentTime;

      // Whip-crack swoosh: fast bandpass sweep down then up
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.18);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.35);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0, now);
      gain.gain.linearRampToValueAtTime(0.32, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch {
      // Audio node cleanup safeguard
    }
  }

  public setMute(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0.0 : 0.45, this.ctx.currentTime, 0.05);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public dispose(): void {
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {}
      this.ctx = null;
    }
    this.isRunning = false;
  }
}
