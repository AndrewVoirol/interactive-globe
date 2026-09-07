// ============================================================================
// File: src/components/tubeman/AirDancerSim.ts
// Inflatable Tube Man Physics Simulation Engine
// Multi-segment inverted pendulum with internal pneumatic pressure,
// Euler column buckling, kink flow-choking, chaotic arm flailing,
// and centrifugal googly eye inertia.
// ============================================================================

export interface SimNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // Angle relative to vertical
  angVel: number;
  length: number;
  radius: number;
}

export interface GooglyEye {
  scleraX: number;
  scleraY: number;
  scleraRadius: number;
  pupilX: number;
  pupilY: number;
  pupilVx: number;
  pupilVy: number;
  pupilRadius: number;
}

export interface FringeStreamer {
  nodes: Array<{ x: number; y: number; vx: number; vy: number }>;
}

export interface TubeManState {
  spine: SimNode[];
  leftArm: SimNode[];
  rightArm: SimNode[];
  headFringes: FringeStreamer[];
  leftHandFringes: FringeStreamer[];
  rightHandFringes: FringeStreamer[];
  leftEye: GooglyEye;
  rightEye: GooglyEye;
  pressure: number; // Global internal air pressure [0..1]
  kinkIndex: number; // Index where buckling has choked flow (-1 if none)
  backPressure: number; // Accumulated pressure behind kink
  mouthOpen: number; // 0..1 open mouth ratio
  isBuckled: boolean;
  buckleTimer: number;
  justSnapped: boolean;
  angularActivity: number; // Metric for fabric flapping audio
}

export class AirDancerSim {
  public state: TubeManState;
  
  // Physics parameters
  public blowerPower: number = 1.0; // 0.0 to 2.0
  public gravity: number = 280.0;
  public basePos: { x: number; y: number } = { x: 0, y: 0 };
  public totalHeight: number = 420;
  public baseRadius: number = 32;
  
  private spineCount = 24;
  private armCount = 10;
  private headFringeCount = 6;
  private handFringeCount = 4;
  
  // Interaction
  public grabbedNode: { type: 'spine' | 'leftArm' | 'rightArm'; index: number } | null = null;
  public mousePos: { x: number; y: number } = { x: 0, y: 0 };
  public windGust: number = 0; // External lateral wind
  
  private time: number = 0;
  private nextAutoBuckleTime: number = 5.0;

  constructor(baseX: number, baseY: number, totalHeight: number = 420) {
    this.basePos = { x: baseX, y: baseY };
    this.totalHeight = totalHeight;
    this.state = this.createInitialState();
  }

  public setBase(x: number, y: number, height: number = 420) {
    this.basePos.x = x;
    this.basePos.y = y;
    this.totalHeight = height;
  }

  private createInitialState(): TubeManState {
    const segLen = this.totalHeight / this.spineCount;
    const spine: SimNode[] = [];
    
    for (let i = 0; i < this.spineCount; i++) {
      // Radius tapers slightly towards top (base is 32, top is 26)
      const r = this.baseRadius * (1.0 - 0.22 * (i / this.spineCount));
      spine.push({
        x: this.basePos.x,
        y: this.basePos.y - i * segLen,
        vx: 0,
        vy: 0,
        angle: 0,
        angVel: 0,
        length: segLen,
        radius: r,
      });
    }

    const armSegLen = (this.totalHeight * 0.38) / this.armCount;
    const leftArm: SimNode[] = [];
    const rightArm: SimNode[] = [];
    const shoulderIdx = 15;
    const shoulderY = spine[shoulderIdx].y;
    const shoulderR = spine[shoulderIdx].radius;

    for (let i = 0; i < this.armCount; i++) {
      const armR = 14 * (1.0 - 0.3 * (i / this.armCount));
      leftArm.push({
        x: this.basePos.x - shoulderR - (i + 1) * armSegLen,
        y: shoulderY + i * 4,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 2,
        angVel: 0,
        length: armSegLen,
        radius: armR,
      });
      rightArm.push({
        x: this.basePos.x + shoulderR + (i + 1) * armSegLen,
        y: shoulderY + i * 4,
        vx: 0,
        vy: 0,
        angle: Math.PI / 2,
        angVel: 0,
        length: armSegLen,
        radius: armR,
      });
    }

    // Fringes
    const makeFringes = (count: number, len: number, segs = 4): FringeStreamer[] => {
      const res: FringeStreamer[] = [];
      for (let i = 0; i < count; i++) {
        const nodes: Array<{ x: number; y: number; vx: number; vy: number }> = [];
        for (let s = 0; s < segs; s++) {
          nodes.push({ x: 0, y: 0, vx: 0, vy: 0 });
        }
        res.push({ nodes });
      }
      return res;
    };

    return {
      spine,
      leftArm,
      rightArm,
      headFringes: makeFringes(this.headFringeCount, 40),
      leftHandFringes: makeFringes(this.handFringeCount, 25),
      rightHandFringes: makeFringes(this.handFringeCount, 25),
      leftEye: {
        scleraX: 0,
        scleraY: 0,
        scleraRadius: 11,
        pupilX: 0,
        pupilY: 0,
        pupilVx: 0,
        pupilVy: 0,
        pupilRadius: 5.5,
      },
      rightEye: {
        scleraX: 0,
        scleraY: 0,
        scleraRadius: 11,
        pupilX: 0,
        pupilY: 0,
        pupilVx: 0,
        pupilVy: 0,
        pupilRadius: 5.5,
      },
      pressure: 1.0,
      kinkIndex: -1,
      backPressure: 0,
      mouthOpen: 0.8,
      isBuckled: false,
      buckleTimer: 0,
      justSnapped: false,
      angularActivity: 0,
    };
  }

  public triggerBuckle(): void {
    // Force a dramatic mid-spine buckle
    this.state.isBuckled = true;
    this.state.kinkIndex = Math.floor(this.spineCount * 0.38);
    this.state.backPressure = 0;
    this.state.buckleTimer = 1.1; // Duration of collapse before snap
    const side = Math.random() > 0.5 ? 1 : -1;
    // Give a dramatic lateral & downward shove to upper segments
    for (let i = this.state.kinkIndex; i < this.spineCount; i++) {
      const segRatio = (i - this.state.kinkIndex) / (this.spineCount - this.state.kinkIndex);
      this.state.spine[i].vx += side * (350.0 + segRatio * 600.0);
      this.state.spine[i].vy += 450.0 * segRatio;
    }
  }

  public step(dt: number): void {
    const subDt = Math.min(dt, 0.025);
    this.time += subDt;
    this.state.justSnapped = false;

    // 1. Update Blower Pressure & Buckling Kinetics
    const targetPressure = Math.min(1.0, this.blowerPower);
    this.state.pressure += (targetPressure - this.state.pressure) * Math.min(1.0, subDt * 4.0);

    // If blower is near zero, whole body collapses
    if (this.blowerPower < 0.1) {
      this.state.isBuckled = true;
      this.state.kinkIndex = 1;
    } else if (this.state.isBuckled) {
      this.state.buckleTimer -= subDt;
      this.state.backPressure += subDt * 1.8 * this.blowerPower;
      
      // When backpressure exceeds threshold or timer expires -> violent snap-back!
      if (this.state.backPressure > 1.2 || this.state.buckleTimer <= 0) {
        this.state.isBuckled = false;
        this.state.kinkIndex = -1;
        this.state.backPressure = 0;
        this.state.justSnapped = true;

        // Upward impulse to all upper segments (the signature snap whip!)
        const snapSide = Math.random() > 0.5 ? 1 : -1;
        for (let i = 2; i < this.spineCount; i++) {
          const boost = (i / this.spineCount) * 850 * this.blowerPower;
          this.state.spine[i].vy -= boost;
          this.state.spine[i].vx += snapSide * (Math.random() - 0.5) * 450;
        }
      }
    } else {
      // Natural Euler buckling detection
      let maxBend = 0;
      let sharpestIdx = -1;
      for (let i = 2; i < this.spineCount - 2; i++) {
        const dx1 = this.state.spine[i].x - this.state.spine[i - 1].x;
        const dy1 = this.state.spine[i].y - this.state.spine[i - 1].y;
        const dx2 = this.state.spine[i + 1].x - this.state.spine[i].x;
        const dy2 = this.state.spine[i + 1].y - this.state.spine[i].y;
        
        const a1 = Math.atan2(dx1, -dy1);
        const a2 = Math.atan2(dx2, -dy2);
        let diff = Math.abs(a2 - a1);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        
        if (diff > maxBend) {
          maxBend = diff;
          sharpestIdx = i;
        }
      }

      // If bend angle exceeds critical kink threshold (~38 degrees)
      if (maxBend > 0.65 && this.blowerPower > 0.3 && sharpestIdx > 3) {
        this.state.isBuckled = true;
        this.state.kinkIndex = sharpestIdx;
        this.state.buckleTimer = 0.5 + Math.random() * 0.6;
        this.state.backPressure = 0.1;
      } else if (this.blowerPower > 0.45 && this.time > this.nextAutoBuckleTime) {
        // Natural periodic car-dealership collapse cycle
        this.triggerBuckle();
        this.nextAutoBuckleTime = this.time + 4.5 + Math.random() * 4.0;
      }
    }

    // 2. Spine Dynamics
    this.updateSpinePhysics(subDt);

    // 3. Arms Dynamics
    this.updateArmsPhysics(subDt);

    // 4. Fringes / Streamers
    this.updateFringes(subDt);

    // 5. Googly Eyes Inertia
    this.updateGooglyEyes(subDt);

    // 6. Mouth / Face
    this.state.mouthOpen = this.state.isBuckled 
      ? 0.3 + 0.2 * Math.sin(this.time * 15)
      : Math.min(1.0, 0.4 + 0.6 * this.state.pressure + 0.15 * Math.sin(this.time * 20));
  }

  private updateSpinePhysics(dt: number): void {
    const spine = this.state.spine;
    const n = spine.length;
    const segLen = this.totalHeight / n;

    // Anchor base
    spine[0].x = this.basePos.x;
    spine[0].y = this.basePos.y;
    spine[0].vx = 0;
    spine[0].vy = 0;

    let totalAngActivity = 0;

    // Apply forces
    for (let i = 1; i < n; i++) {
      const node = spine[i];
      const frac = i / n;

      let effectivePressure = this.state.pressure;
      if (this.state.isBuckled && i > this.state.kinkIndex) {
        effectivePressure = 0.0;
        node.vy += (this.gravity * 2.4) * dt;
      }

      const upwardBuoyancy = effectivePressure * (1200.0 * this.blowerPower);
      const effectiveGravity = this.gravity * (1.0 - 0.7 * effectivePressure);

      node.vy += (effectiveGravity - upwardBuoyancy * frac) * dt;

      // Aerodynamic turbulence & traveling S-curves
      const wave1 = Math.sin(this.time * 2.8 - frac * 5.0) * (380.0 * Math.pow(this.blowerPower, 1.2) * Math.pow(frac, 1.3));
      const wave2 = Math.cos(this.time * 4.2 + frac * 8.0) * (240.0 * Math.pow(this.blowerPower, 1.1) * frac);
      const swirlAmp = 180.0 * Math.pow(this.blowerPower, 1.3) * frac;
      const swirlForce = Math.sin(this.time * 6.5 + frac * 10.0) * swirlAmp;
      
      node.vx += (wave1 + wave2 + swirlForce + this.windGust * 180.0) * dt;

      // Mouse drag force if grabbed
      if (this.grabbedNode && this.grabbedNode.type === 'spine' && this.grabbedNode.index === i) {
        const dmx = this.mousePos.x - node.x;
        const dmy = this.mousePos.y - node.y;
        node.vx += dmx * 25.0 * dt;
        node.vy += dmy * 25.0 * dt;
      }

      // Air resistance / damping
      const damping = 0.965;
      node.vx *= Math.pow(damping, dt * 60);
      node.vy *= Math.pow(damping, dt * 60);

      node.x += node.vx * dt;
      node.y += node.vy * dt;
    }

    // Constraint Satisfaction
    const iterations = 8;
    for (let iter = 0; iter < iterations; iter++) {
      spine[0].x = this.basePos.x;
      spine[0].y = this.basePos.y;

      for (let i = 1; i < n; i++) {
        const pA = spine[i - 1];
        const pB = spine[i];

        let dx = pB.x - pA.x;
        let dy = pB.y - pA.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const diff = (dist - segLen) / dist;

        const weightA = i === 1 ? 0.0 : 0.45;
        const weightB = i === 1 ? 1.0 : 0.55;

        pA.x += dx * diff * weightA;
        pA.y += dy * diff * weightA;
        pB.x -= dx * diff * weightB;
        pB.y -= dy * diff * weightB;

        if (pB.y > this.basePos.y) {
          pB.y = this.basePos.y;
          pB.vy = 0;
        }

        // Angular stiffness restoring to vertical
        if (!this.state.isBuckled || i <= this.state.kinkIndex) {
          const stiffness = 0.06 * this.state.pressure * this.blowerPower;
          const targetX = pA.x;
          const targetY = pA.y - segLen;
          pB.x += (targetX - pB.x) * stiffness;
          pB.y += (targetY - pB.y) * stiffness;
        }
      }
    }

    // Update angles and calculate angular activity
    for (let i = 1; i < n; i++) {
      const dx = spine[i].x - spine[i - 1].x;
      const dy = spine[i].y - spine[i - 1].y;
      const angle = Math.atan2(dx, -dy);
      const prevAng = spine[i].angle;
      spine[i].angle = angle;
      const angVel = (angle - prevAng) / dt;
      spine[i].angVel = angVel;
      totalAngActivity += Math.abs(angVel);
    }

    this.state.angularActivity = totalAngActivity;
  }

  private updateArmsPhysics(dt: number): void {
    const spine = this.state.spine;
    const shoulderIdx = 15;
    const shoulderNode = spine[shoulderIdx];
    const shoulderR = shoulderNode.radius;
    const spineAng = shoulderNode.angle;

    const perpX = Math.cos(spineAng);
    const perpY = Math.sin(spineAng);

    const leftShoulderX = shoulderNode.x - perpX * (shoulderR * 0.8);
    const leftShoulderY = shoulderNode.y - perpY * (shoulderR * 0.8);

    const rightShoulderX = shoulderNode.x + perpX * (shoulderR * 0.8);
    const rightShoulderY = shoulderNode.y + perpY * (shoulderR * 0.8);

    this.simulateArm(this.state.leftArm, leftShoulderX, leftShoulderY, -1, dt, 'leftArm');
    this.simulateArm(this.state.rightArm, rightShoulderX, rightShoulderY, 1, dt, 'rightArm');
  }

  private simulateArm(
    arm: SimNode[],
    shoulderX: number,
    shoulderY: number,
    side: number,
    dt: number,
    armType: 'leftArm' | 'rightArm'
  ): void {
    const n = arm.length;
    const segLen = arm[0].length;

    arm[0].x = shoulderX;
    arm[0].y = shoulderY;

    const baseFreq = 4.5 * this.blowerPower;
    const chaosPhase = side * 1.8;

    for (let i = 1; i < n; i++) {
      const node = arm[i];
      const frac = i / n;

      const swirlAng = this.time * baseFreq * 1.5 + frac * 4.5 + chaosPhase;
      const whipForceX = (side * Math.cos(swirlAng) * 440.0 + Math.sin(this.time * 3.5) * 220.0) * this.blowerPower;
      const whipForceY = (Math.sin(swirlAng) * 380.0 - 220.0 * Math.pow(this.blowerPower, 1.2) + Math.cos(this.time * 2.8) * 160.0) * this.blowerPower;

      const exhaustOutward = side * 180.0 * this.blowerPower;
      const exhaustUpward = -160.0 * this.blowerPower;

      node.vx += (whipForceX + exhaustOutward + this.windGust * 120.0) * dt;
      node.vy += (whipForceY + exhaustUpward + this.gravity * 0.35) * dt;

      if (this.grabbedNode && this.grabbedNode.type === armType && this.grabbedNode.index === i) {
        node.vx += (this.mousePos.x - node.x) * 25.0 * dt;
        node.vy += (this.mousePos.y - node.y) * 25.0 * dt;
      }

      node.vx *= Math.pow(0.95, dt * 60);
      node.vy *= Math.pow(0.95, dt * 60);

      node.x += node.vx * dt;
      node.y += node.vy * dt;
    }

    const iterations = 6;
    for (let iter = 0; iter < iterations; iter++) {
      arm[0].x = shoulderX;
      arm[0].y = shoulderY;

      for (let i = 1; i < n; i++) {
        const pA = arm[i - 1];
        const pB = arm[i];

        let dx = pB.x - pA.x;
        let dy = pB.y - pA.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const diff = (dist - segLen) / dist;

        const weightA = i === 1 ? 0.0 : 0.45;
        const weightB = i === 1 ? 1.0 : 0.55;

        pA.x += dx * diff * weightA;
        pA.y += dy * diff * weightA;
        pB.x -= dx * diff * weightB;
        pB.y -= dy * diff * weightB;
      }
    }

    for (let i = 1; i < n; i++) {
      const dx = arm[i].x - arm[i - 1].x;
      const dy = arm[i].y - arm[i - 1].y;
      arm[i].angle = Math.atan2(dx, -dy);
    }
  }

  private updateFringes(dt: number): void {
    const headNode = this.state.spine[this.spineCount - 1];
    const headAngle = headNode.angle;
    const headPerpX = Math.cos(headAngle);
    const headPerpY = Math.sin(headAngle);

    for (let f = 0; f < this.headFringeCount; f++) {
      const spread = (f / (this.headFringeCount - 1) - 0.5) * headNode.radius * 1.5;
      const rootX = headNode.x + headPerpX * spread;
      const rootY = headNode.y + headPerpY * spread - headNode.radius * 0.3;
      this.simulateFringe(this.state.headFringes[f], rootX, rootY, headAngle, dt, 8.0);
    }

    const leftHand = this.state.leftArm[this.armCount - 1];
    for (let f = 0; f < this.handFringeCount; f++) {
      const spread = (f / (this.handFringeCount - 1) - 0.5) * 8;
      this.simulateFringe(this.state.leftHandFringes[f], leftHand.x + spread, leftHand.y, leftHand.angle, dt, 12.0);
    }

    const rightHand = this.state.rightArm[this.armCount - 1];
    for (let f = 0; f < this.handFringeCount; f++) {
      const spread = (f / (this.handFringeCount - 1) - 0.5) * 8;
      this.simulateFringe(this.state.rightHandFringes[f], rightHand.x + spread, rightHand.y, rightHand.angle, dt, 12.0);
    }
  }

  private simulateFringe(
    fringe: FringeStreamer,
    rootX: number,
    rootY: number,
    baseAngle: number,
    dt: number,
    flutterSpeed: number
  ): void {
    const segs = fringe.nodes;
    segs[0].x = rootX;
    segs[0].y = rootY;

    const segLen = 7;
    for (let i = 1; i < segs.length; i++) {
      const p = segs[i];
      const flutter = Math.sin(this.time * flutterSpeed * 3.0 + i * 2.5) * (180.0 * this.blowerPower);
      p.vx += flutter * dt;
      p.vy += -180.0 * this.blowerPower * dt;

      p.vx *= 0.90;
      p.vy *= 0.90;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const pPrev = segs[i - 1];
      const dx = p.x - pPrev.x;
      const dy = p.y - pPrev.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      p.x = pPrev.x + (dx / dist) * segLen;
      p.y = pPrev.y + (dy / dist) * segLen;
    }
  }

  private updateGooglyEyes(dt: number): void {
    const headNode = this.state.spine[this.spineCount - 2];
    const headAngle = headNode.angle;
    const perpX = Math.cos(headAngle);
    const perpY = Math.sin(headAngle);

    const eyeSpacing = headNode.radius * 0.55;
    const eyeForwardOffset = headNode.radius * 0.2;

    const lx = headNode.x - perpX * eyeSpacing - Math.sin(headAngle) * eyeForwardOffset;
    const ly = headNode.y - perpY * eyeSpacing - Math.cos(headAngle) * eyeForwardOffset;

    const rx = headNode.x + perpX * eyeSpacing - Math.sin(headAngle) * eyeForwardOffset;
    const ry = headNode.y + perpY * eyeSpacing - Math.cos(headAngle) * eyeForwardOffset;

    this.state.leftEye.scleraX = lx;
    this.state.leftEye.scleraY = ly;
    this.state.rightEye.scleraX = rx;
    this.state.rightEye.scleraY = ry;

    this.updatePupil(this.state.leftEye, headNode.vx, headNode.vy, headNode.angVel, dt);
    this.updatePupil(this.state.rightEye, headNode.vx, headNode.vy, headNode.angVel, dt);
  }

  private updatePupil(eye: GooglyEye, headVx: number, headVy: number, headAngVel: number, dt: number): void {
    const maxOffset = eye.scleraRadius - eye.pupilRadius - 1;

    eye.pupilVx += (-headVx * 0.4 + (Math.random() - 0.5) * 20.0) * dt;
    eye.pupilVy += (this.gravity * 0.8 - headVy * 0.4) * dt;

    eye.pupilVx += Math.sin(this.time * 12) * Math.abs(headAngVel) * 5.0 * dt;

    eye.pupilVx *= 0.94;
    eye.pupilVy *= 0.94;

    eye.pupilX += eye.pupilVx * dt;
    eye.pupilY += eye.pupilVy * dt;

    const dist = Math.hypot(eye.pupilX, eye.pupilY);
    if (dist > maxOffset) {
      const nx = eye.pupilX / dist;
      const ny = eye.pupilY / dist;
      eye.pupilX = nx * maxOffset;
      eye.pupilY = ny * maxOffset;

      const dot = eye.pupilVx * nx + eye.pupilVy * ny;
      eye.pupilVx = (eye.pupilVx - 1.5 * dot * nx) * 0.45;
      eye.pupilVy = (eye.pupilVy - 1.5 * dot * ny) * 0.45;
    }
  }

  public handlePointerDown(x: number, y: number): boolean {
    this.mousePos = { x, y };
    let closestDist = Infinity;
    let closestTarget: { type: 'spine' | 'leftArm' | 'rightArm'; index: number } | null = null;

    // Check hit test on spine nodes
    for (let i = 1; i < this.spineCount; i++) {
      const node = this.state.spine[i];
      const d = Math.hypot(node.x - x, node.y - y);
      if (d < node.radius * 1.6 && d < closestDist) {
        closestDist = d;
        closestTarget = { type: 'spine', index: i };
      }
    }

    // Check arms
    for (let i = 1; i < this.armCount; i++) {
      const lNode = this.state.leftArm[i];
      const ld = Math.hypot(lNode.x - x, lNode.y - y);
      if (ld < 24 && ld < closestDist) {
        closestDist = ld;
        closestTarget = { type: 'leftArm', index: i };
      }
      const rNode = this.state.rightArm[i];
      const rd = Math.hypot(rNode.x - x, rNode.y - y);
      if (rd < 24 && rd < closestDist) {
        closestDist = rd;
        closestTarget = { type: 'rightArm', index: i };
      }
    }

    this.grabbedNode = closestTarget;
    return closestTarget !== null;
  }

  public handlePointerMove(x: number, y: number): void {
    this.mousePos = { x, y };
  }

  public handlePointerUp(): void {
    this.grabbedNode = null;
  }
}
