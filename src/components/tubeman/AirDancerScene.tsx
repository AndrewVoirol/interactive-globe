// ============================================================================
// File: src/components/tubeman/AirDancerScene.tsx
// High-Energy Interactive Dealership Scene featuring the
// Wacky Wavy Inflatable Arm-Flailing Tube Man ("Air Dancer")
// ============================================================================

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { AirDancerSim, SimNode, FringeStreamer } from './AirDancerSim';
import { AirDancerAudio } from './AirDancerAudio';
import { 
  Volume2, VolumeX, Wind, Zap, RefreshCw, 
  ArrowLeft, Glasses, Sun, Sunset, Moon, Sparkles
} from 'lucide-react';

export interface AirDancerSceneProps {
  onClose: () => void;
  initialTheme?: 'day' | 'sunset' | 'night';
}

type Colorway = 'red' | 'lime' | 'orange' | 'cyan' | 'magenta' | 'patriotic';

interface ColorTheme {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  shadow: string;
  highlight: string;
}

const COLORWAYS: Record<Colorway, ColorTheme> = {
  red: {
    name: 'Dealership Red',
    primary: '#EF4444',
    secondary: '#DC2626',
    accent: '#FDE047',
    shadow: '#991B1B',
    highlight: '#FCA5A5',
  },
  lime: {
    name: 'Electric Lime',
    primary: '#84CC16',
    secondary: '#65A30D',
    accent: '#38BDF8',
    shadow: '#3F6212',
    highlight: '#BEF264',
  },
  orange: {
    name: 'Safety Orange',
    primary: '#F97316',
    secondary: '#EA580C',
    accent: '#3B82F6',
    shadow: '#9A3412',
    highlight: '#FDBA74',
  },
  cyan: {
    name: 'High-Voltage Cyan',
    primary: '#06B6D4',
    secondary: '#0891B2',
    accent: '#F43F5E',
    shadow: '#155E75',
    highlight: '#67E8F9',
  },
  magenta: {
    name: 'Hot Pink Fiesta',
    primary: '#EC4899',
    secondary: '#DB2777',
    accent: '#FACC15',
    shadow: '#9D174D',
    highlight: '#F472B6',
  },
  patriotic: {
    name: 'Stars & Stripes',
    primary: '#2563EB',
    secondary: '#DC2626',
    accent: '#FFFFFF',
    shadow: '#1E3A8A',
    highlight: '#93C5FD',
  },
};

interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angVel: number;
  color: string;
  size: number;
}

export const AirDancerScene: React.FC<AirDancerSceneProps> = ({ onClose, initialTheme = 'day' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Audio Engine
  const audioRef = useRef<AirDancerAudio>(new AirDancerAudio(false));
  const [isMuted, setIsMuted] = useState(false);

  // Simulation Engine
  const simRef = useRef<AirDancerSim | null>(null);

  // Scene States
  const [blowerPower, setBlowerPower] = useState(1.0);
  const [colorway, setColorway] = useState<Colorway>('red');
  const [showGlasses, setShowGlasses] = useState(false);
  const [sceneTime, setSceneTime] = useState<'day' | 'sunset' | 'night'>(initialTheme);
  const [crosswind, setCrosswind] = useState(0);
  const [dealershipBannerIndex, setDealershipBannerIndex] = useState(0);

  // Telemetry
  const [telemetry, setTelemetry] = useState({
    pressure: '100%',
    status: 'OPTIMAL CAR LOT HYSTERIA',
    flailRate: '12.4 Hz',
    isBuckled: false,
  });

  const BANNERS = [
    '💥 BOB\'S MEGA CAR EMPORIUM — EVERYTHING MUST GO! 💥',
    '🚗 0% APR DOWN! NO CREDIT? BAD CREDIT? WE FINANCE! 🚗',
    '🔥 FREE OIL CHANGES FOR LIFE WITH ANY TRUCK PURCHASE! 🔥',
    '🎉 GUARANTEED HIGHEST TRADE-IN VALUE IN THE COUNTY! 🎉',
  ];

  // Rotate banners periodically
  useEffect(() => {
    const timer = setInterval(() => {
      setDealershipBannerIndex((prev) => (prev + 1) % BANNERS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [BANNERS.length]);

  // Audio Sync
  const handleToggleMute = useCallback(() => {
    audioRef.current.ensureRunning();
    setIsMuted((prev) => {
      const next = !prev;
      audioRef.current.setMute(next);
      return next;
    });
  }, []);

  const handleTriggerBuckle = useCallback(() => {
    audioRef.current.ensureRunning();
    if (simRef.current) {
      simRef.current.triggerBuckle();
    }
  }, []);

  // Keyboard shortcut listener (ESC to exit, Space to buckle, M to mute)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.code === 'Space') {
        e.preventDefault();
        handleTriggerBuckle();
      } else if (e.key === 'm' || e.key === 'M') {
        handleToggleMute();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTriggerBuckle, handleToggleMute, onClose]);

  // Canvas render & animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Confetti particles
    const confettiColors = ['#EF4444', '#3B82F6', '#FBBF24', '#10B981', '#EC4899', '#FFFFFF'];
    const confetti: ConfettiPiece[] = Array.from({ length: 45 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight * 0.8,
      vx: (Math.random() - 0.5) * 60,
      vy: 20 + Math.random() * 40,
      angle: Math.random() * Math.PI * 2,
      angVel: (Math.random() - 0.5) * 6,
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
      size: 6 + Math.random() * 6,
    }));

    let animationFrameId: number;
    let lastTime = performance.now();

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const baseX = width * 0.5;
      const baseY = height - 120;
      const totalH = Math.min(height * 0.68, 520);

      if (!simRef.current) {
        simRef.current = new AirDancerSim(baseX, baseY, totalH);
      } else {
        simRef.current.setBase(baseX, baseY, totalH);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Main Animation Loop
    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const sim = simRef.current;
      if (!sim) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // Update sim params
      sim.blowerPower = blowerPower;
      sim.windGust = crosswind;
      sim.step(dt);

      // Audio sync
      audioRef.current.update(blowerPower, sim.state.angularActivity, sim.state.isBuckled);
      if (sim.state.justSnapped) {
        audioRef.current.triggerSnapWhoosh();
      }

      // Update Telemetry
      const flailHz = (sim.state.angularActivity / 2.5).toFixed(1);
      setTelemetry({
        pressure: `${Math.round(sim.state.pressure * 100)}%`,
        status: sim.state.isBuckled
          ? 'CRITICAL BUCKLE COLLAPSE / COMPRESSION'
          : blowerPower > 1.4
          ? 'SUPER-SONIC MEGA SALE CHAOS'
          : blowerPower < 0.2
          ? 'DEFLATED DEPRESSED FABRIC HEAP'
          : 'OPTIMAL CAR LOT HYSTERIA',
        flailRate: `${flailHz} Hz`,
        isBuckled: sim.state.isBuckled,
      });

      // Clear & Draw Scene
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      // 1. Draw Sky & Backdrop
      drawDealershipBackdrop(ctx, w, h, sceneTime, now);

      // 2. Draw Overhead Pennant Bunting Strings
      drawPennantStrings(ctx, w, h, now);

      // 3. Draw Asphalt & Car Dealership Ground
      drawAsphaltGround(ctx, w, h, sim.basePos.y);

      // 4. Draw Industrial Blower Base
      drawBlowerFan(ctx, sim.basePos.x, sim.basePos.y, blowerPower, now);

      // 5. Draw Confetti (Behind & Around)
      drawConfetti(ctx, confetti, w, h, dt, sim);

      // 6. Draw Tube Man
      const themeColors = COLORWAYS[colorway];
      drawTubeMan(ctx, sim, themeColors, showGlasses, colorway, now);

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [blowerPower, colorway, showGlasses, sceneTime, crosswind]);

  // Pointer Interaction Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    audioRef.current.ensureRunning();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !simRef.current) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    simRef.current.handlePointerDown(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !simRef.current) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    simRef.current.handlePointerMove(x, y);
  };

  const handlePointerUp = () => {
    simRef.current?.handlePointerUp();
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col font-mono select-none overflow-hidden bg-black text-white"
    >
      {/* Top Retro Dealership Marquee Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex flex-col items-center pointer-events-none p-3">
        {/* Dealership Name Signboard */}
        <div className="flex items-center gap-3 px-6 py-2 rounded-xl bg-gradient-to-r from-red-600 via-amber-500 to-red-600 border-2 border-yellow-300 shadow-[0_0_30px_rgba(239,68,68,0.6)] animate-pulse pointer-events-auto">
          <span className="text-xl">🚗💨</span>
          <span className="text-lg md:text-xl font-extrabold tracking-wider text-black drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]">
            HONEST BOB'S CAR EMPORIUM
          </span>
          <span className="text-xl">🎈</span>
        </div>

        {/* Flashing Promo Banner */}
        <div className="mt-1 px-4 py-1 rounded-full bg-black/80 backdrop-blur border border-yellow-400/60 text-yellow-300 text-xs font-bold tracking-wide shadow-md pointer-events-auto">
          {BANNERS[dealershipBannerIndex]}
        </div>
      </div>

      {/* Top-Right Control Actions */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2 pointer-events-auto">
        {/* Lighting Selector */}
        <div className="flex items-center bg-black/70 backdrop-blur-md rounded-lg border border-white/20 p-1">
          <button
            onClick={() => setSceneTime('day')}
            title="Sunny Dealership Day"
            className={`p-1.5 rounded transition ${sceneTime === 'day' ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:text-white'}`}
          >
            <Sun size={15} />
          </button>
          <button
            onClick={() => setSceneTime('sunset')}
            title="Golden Sunset Sale"
            className={`p-1.5 rounded transition ${sceneTime === 'sunset' ? 'bg-orange-500 text-black' : 'text-zinc-400 hover:text-white'}`}
          >
            <Sunset size={15} />
          </button>
          <button
            onClick={() => setSceneTime('night')}
            title="Neon Midnight Madness"
            className={`p-1.5 rounded transition ${sceneTime === 'night' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'}`}
          >
            <Moon size={15} />
          </button>
        </div>

        {/* Audio Mute Toggle */}
        <button
          onClick={handleToggleMute}
          title={isMuted ? 'Unmute Blower & Flap SFX (M)' : 'Mute Sound (M)'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg backdrop-blur-md border text-xs font-semibold transition shadow-lg ${
            isMuted 
              ? 'bg-red-950/80 border-red-500/50 text-red-300 hover:bg-red-900/80' 
              : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/80'
          }`}
        >
          {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          <span>{isMuted ? 'SFX MUTED' : 'SFX ON'}</span>
        </button>

        {/* Return to Globe Button */}
        <button
          onClick={onClose}
          title="Return to Globe & Wind Simulation (ESC)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-white/20 text-white text-xs font-semibold transition shadow-lg"
        >
          <ArrowLeft size={15} />
          <span>BACK TO GLOBE</span>
        </button>
      </div>

      {/* Top-Left Dealership Telemetry HUD */}
      <div className="absolute top-4 left-4 z-20 hidden md:flex flex-col gap-1 p-3 rounded-xl bg-black/75 backdrop-blur-md border border-white/10 text-[11px] pointer-events-none shadow-xl">
        <div className="flex items-center gap-2 text-zinc-400 font-bold border-b border-white/10 pb-1 mb-0.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>AIR DANCER PNEUMATICS HUD</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-400">STATUS:</span>
          <span className={`font-bold ${telemetry.isBuckled ? 'text-amber-400' : 'text-emerald-400'}`}>
            {telemetry.status}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-400">INTERNAL PRESSURE:</span>
          <span className="font-bold text-cyan-300">{telemetry.pressure}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-400">WHIP FREQUENCY:</span>
          <span className="font-bold text-purple-300">{telemetry.flailRate}</span>
        </div>
        <div className="text-[9px] text-zinc-500 mt-1">
          HINT: Click & drag tube man to stretch! Spacebar to trigger buckle.
        </div>
      </div>

      {/* Interactive Render Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
      />

      {/* Bottom Controls Dashboard */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center justify-center gap-3 p-3 rounded-2xl bg-black/85 backdrop-blur-xl border border-white/15 shadow-2xl max-w-[95vw] pointer-events-auto">
        {/* Blower Power Throttle */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
          <Wind size={16} className="text-cyan-400" />
          <div className="flex flex-col">
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>BLOWER THROTTLE</span>
              <span className="font-bold text-white">{Math.round(blowerPower * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="2.0"
              step="0.05"
              value={blowerPower}
              onChange={(e) => {
                audioRef.current.ensureRunning();
                setBlowerPower(parseFloat(e.target.value));
              }}
              className="w-28 sm:w-36 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>
        </div>

        {/* Action Trigger: Dramatic Buckle Collapse */}
        <button
          onClick={handleTriggerBuckle}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-black font-extrabold text-xs tracking-wider transition transform active:scale-95 shadow-[0_0_15px_rgba(245,158,11,0.5)]"
        >
          <Zap size={16} className="fill-black" />
          <span>TRIGGER BUCKLE (SPACE)</span>
        </button>

        {/* Colorway Palette */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10">
          <Sparkles size={15} className="text-yellow-400 mr-1" />
          {(Object.keys(COLORWAYS) as Colorway[]).map((c) => (
            <button
              key={c}
              onClick={() => setColorway(c)}
              title={COLORWAYS[c].name}
              className={`w-6 h-6 rounded-full border-2 transition transform hover:scale-110 ${
                colorway === c ? 'border-white scale-110 shadow-[0_0_8px_white]' : 'border-transparent opacity-75'
              }`}
              style={{
                background: c === 'patriotic' 
                  ? 'linear-gradient(135deg, #2563EB 33%, #FFFFFF 33%, #FFFFFF 66%, #DC2626 66%)' 
                  : COLORWAYS[c].primary,
              }}
            />
          ))}
        </div>

        {/* Sunglasses Accessory Toggle */}
        <button
          onClick={() => setShowGlasses((prev) => !prev)}
          title="Toggle Aviator Sunglasses"
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition ${
            showGlasses 
              ? 'bg-amber-500/20 border-amber-400 text-amber-300' 
              : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
          }`}
        >
          <Glasses size={16} />
          <span className="hidden sm:inline">COOL GUY</span>
        </button>

        {/* Crosswind Slider */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
          <div className="flex flex-col">
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>CROSSWIND</span>
              <span className="font-bold text-white">
                {crosswind === 0 ? 'CALM' : `${crosswind > 0 ? '+' : ''}${crosswind.toFixed(1)}`}
              </span>
            </div>
            <input
              type="range"
              min="-1.5"
              max="1.5"
              step="0.1"
              value={crosswind}
              onChange={(e) => setCrosswind(parseFloat(e.target.value))}
              className="w-20 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Canvas Scene Drawing Utilities
// ============================================================================

function drawDealershipBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: 'day' | 'sunset' | 'night',
  now: number
) {
  // Sky Gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  if (time === 'day') {
    sky.addColorStop(0, '#38BDF8'); // Crisp clear blue
    sky.addColorStop(0.55, '#BAE6FD');
    sky.addColorStop(0.85, '#E0F2FE');
  } else if (time === 'sunset') {
    sky.addColorStop(0, '#4C1D95'); // Deep purple
    sky.addColorStop(0.35, '#BE185D'); // Magenta
    sky.addColorStop(0.65, '#F97316'); // Bright orange
    sky.addColorStop(0.85, '#FDE047'); // Golden horizon
  } else {
    sky.addColorStop(0, '#020617'); // Dark obsidian night
    sky.addColorStop(0.6, '#0F172A');
    sky.addColorStop(0.85, '#1E1B4B');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Distant City / Dealership Skyline Silhouettes
  ctx.fillStyle = time === 'night' ? '#090D16' : time === 'sunset' ? '#2A1038' : '#64748B';
  ctx.globalAlpha = 0.35;

  // Showroom roof & light poles
  ctx.beginPath();
  const groundY = h - 120;
  ctx.rect(w * 0.05, groundY - 140, w * 0.22, 140);
  ctx.rect(w * 0.72, groundY - 180, w * 0.24, 180);
  ctx.fill();

  // Car lot light poles
  const polePositions = [w * 0.15, w * 0.35, w * 0.65, w * 0.85];
  polePositions.forEach((px) => {
    ctx.fillStyle = time === 'night' ? '#1E293B' : '#475569';
    ctx.fillRect(px - 3, groundY - 260, 6, 260);
    // Crossbar
    ctx.fillRect(px - 22, groundY - 260, 44, 5);

    // Light floodlights
    if (time === 'night' || time === 'sunset') {
      ctx.save();
      const flood = ctx.createRadialGradient(px, groundY - 260, 5, px, groundY - 260, 180);
      flood.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
      flood.addColorStop(1, 'rgba(254, 240, 138, 0.0)');
      ctx.fillStyle = flood;
      ctx.beginPath();
      ctx.moveTo(px - 15, groundY - 260);
      ctx.lineTo(px - 140, groundY);
      ctx.lineTo(px + 140, groundY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });

  // Dealership Row of Parked Cars Silhouette in background
  ctx.fillStyle = time === 'night' ? '#040711' : time === 'sunset' ? '#1B0826' : '#475569';
  ctx.globalAlpha = 0.55;
  const carWidth = 90;
  const carCount = Math.ceil(w / (carWidth + 24));
  for (let c = 0; c < carCount; c++) {
    const cx = c * (carWidth + 24) + 12;
    // Don't draw car directly behind the tube man blower
    if (Math.abs(cx + carWidth / 2 - w * 0.5) < 140) continue;
    drawCarSilhouette(ctx, cx, groundY - 45, carWidth, 45);
  }

  ctx.globalAlpha = 1.0;
}

function drawCarSilhouette(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.beginPath();
  // Wheels
  ctx.arc(x + width * 0.22, y + height, 10, 0, Math.PI * 2);
  ctx.arc(x + width * 0.78, y + height, 10, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.beginPath();
  ctx.moveTo(x, y + height * 0.65);
  ctx.lineTo(x + width * 0.2, y + height * 0.65);
  ctx.lineTo(x + width * 0.35, y + height * 0.15);
  ctx.lineTo(x + width * 0.68, y + height * 0.15);
  ctx.lineTo(x + width * 0.82, y + height * 0.65);
  ctx.lineTo(x + width, y + height * 0.65);
  ctx.lineTo(x + width, y + height * 0.9);
  ctx.lineTo(x, y + height * 0.9);
  ctx.closePath();
  ctx.fill();
}

function drawPennantStrings(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
  const t = now * 0.002;
  const flagColors = ['#EF4444', '#3B82F6', '#FACC15', '#10B981', '#FFFFFF', '#F97316'];
  const wireRows = [
    { startY: 85, sag: 45, count: 28 },
    { startY: 135, sag: 60, count: 32 },
  ];

  wireRows.forEach((row, rowIdx) => {
    ctx.save();
    // Catenary wire
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, row.startY);
    ctx.quadraticCurveTo(w * 0.5, row.startY + row.sag, w, row.startY);
    ctx.stroke();

    // Triangle Flags
    const step = w / row.count;
    for (let i = 1; i < row.count; i++) {
      const x = i * step;
      const normalizedX = (x / w) * 2 - 1;
      const sagY = row.startY + (1 - normalizedX * normalizedX) * row.sag;

      // Fluttering angle
      const flutter = Math.sin(t * 3.5 + i * 0.8 + rowIdx) * 0.35;
      const color = flagColors[(i + rowIdx * 2) % flagColors.length];

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x - 9, sagY);
      ctx.lineTo(x + 9, sagY);
      ctx.lineTo(x + Math.sin(flutter) * 12, sagY + 22);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawAsphaltGround(ctx: CanvasRenderingContext2D, w: number, h: number, groundY: number) {
  ctx.save();
  // Asphalt gradient
  const asphalt = ctx.createLinearGradient(0, groundY, 0, h);
  asphalt.addColorStop(0, '#1E232D');
  asphalt.addColorStop(0.3, '#151921');
  asphalt.addColorStop(1, '#0B0D12');
  ctx.fillStyle = asphalt;
  ctx.fillRect(0, groundY, w, h - groundY);

  // Yellow painted parking lines
  ctx.strokeStyle = '#FACC15';
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.75;
  const stallWidth = 160;
  for (let x = 40; x < w; x += stallWidth) {
    ctx.beginPath();
    ctx.moveTo(x, groundY + 5);
    ctx.lineTo(x + 35, h);
    ctx.stroke();
  }

  // Safety Clearance Zone Box for Tube Man Blower
  ctx.strokeStyle = '#EF4444';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(w * 0.5 - 130, groundY + 15, 260, 75);
  ctx.setLineDash([]);

  // Stencil Text
  ctx.fillStyle = '#FBBF24';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CAUTION: 2000 CFM INFLATABLE ATTENTION ZONE', w * 0.5, groundY + 65);

  ctx.restore();
}

function drawBlowerFan(
  ctx: CanvasRenderingContext2D,
  baseX: number,
  baseY: number,
  blowerPower: number,
  now: number
) {
  ctx.save();
  const fanRadius = 42;
  const barrelHeight = 36;

  // Cast shadow on asphalt
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  ctx.ellipse(baseX, baseY + 18, fanRadius * 1.5, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Blower Metallic Body
  const metalGrad = ctx.createLinearGradient(baseX - fanRadius, 0, baseX + fanRadius, 0);
  metalGrad.addColorStop(0, '#1F2937');
  metalGrad.addColorStop(0.3, '#4B5563');
  metalGrad.addColorStop(0.7, '#9CA3AF');
  metalGrad.addColorStop(1, '#111827');

  ctx.fillStyle = metalGrad;
  ctx.beginPath();
  ctx.roundRect(baseX - fanRadius, baseY - barrelHeight, fanRadius * 2, barrelHeight + 10, 6);
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Yellow & Black Hazard Caution Stripes across base
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(baseX - fanRadius, baseY - 12, fanRadius * 2, 14, 2);
  ctx.clip();
  ctx.fillStyle = '#FACC15';
  ctx.fillRect(baseX - fanRadius, baseY - 12, fanRadius * 2, 14);

  ctx.fillStyle = '#000000';
  for (let s = -fanRadius - 20; s < fanRadius + 20; s += 16) {
    ctx.beginPath();
    ctx.moveTo(baseX + s, baseY + 4);
    ctx.lineTo(baseX + s + 10, baseY + 4);
    ctx.lineTo(baseX + s + 20, baseY - 14);
    ctx.lineTo(baseX + s + 10, baseY - 14);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Spinning Fan Blade Grill at intake rim
  const spinSpeed = blowerPower * 0.035;
  const fanAngle = now * spinSpeed;

  ctx.save();
  ctx.translate(baseX, baseY - barrelHeight);
  ctx.scale(1.0, 0.45); // Perspective ellipse

  // Grill circle
  ctx.fillStyle = '#030712';
  ctx.beginPath();
  ctx.arc(0, 0, fanRadius - 2, 0, Math.PI * 2);
  ctx.fill();

  // Spinning blades
  if (blowerPower > 0.05) {
    ctx.fillStyle = 'rgba(209, 213, 219, 0.5)';
    const bladeCount = 5;
    for (let b = 0; b < bladeCount; b++) {
      const a = fanAngle + (b * Math.PI * 2) / bladeCount;
      ctx.beginPath();
      ctx.arc(0, 0, fanRadius - 6, a, a + 0.55);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Metal grill mesh spokes
  ctx.strokeStyle = '#6B7280';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * (fanRadius - 3), Math.sin(a) * (fanRadius - 3));
    ctx.stroke();
  }
  ctx.restore();

  ctx.restore();
}

function drawConfetti(
  ctx: CanvasRenderingContext2D,
  confetti: ConfettiPiece[],
  w: number,
  h: number,
  dt: number,
  sim: AirDancerSim
) {
  ctx.save();
  const groundY = sim.basePos.y;

  confetti.forEach((p) => {
    // Airflow turbulence from tube man & blower
    const dxToTube = p.x - sim.basePos.x;
    const dyToTube = p.y - (sim.basePos.y - sim.totalHeight * 0.5);
    const distToTube = Math.hypot(dxToTube, dyToTube);

    if (distToTube < 200 && sim.blowerPower > 0.2) {
      // Repel and blow upwards
      p.vy -= 140.0 * sim.blowerPower * dt;
      p.vx += (dxToTube > 0 ? 1 : -1) * 90.0 * sim.blowerPower * dt;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle += p.angVel * dt;

    // Wrap horizontally & bounce on ground
    if (p.x < 0) p.x = w;
    if (p.x > w) p.x = 0;
    if (p.y > groundY + 20) {
      p.y = 10;
      p.x = Math.random() * w;
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size * 0.5, -p.size * 0.25, p.size, p.size * 0.5);
    ctx.restore();
  });

  ctx.restore();
}

function drawTubeMan(
  ctx: CanvasRenderingContext2D,
  sim: AirDancerSim,
  theme: ColorTheme,
  showGlasses: boolean,
  colorway: Colorway,
  now: number
) {
  const spine = sim.state.spine;
  const n = spine.length;

  ctx.save();

  // 1. Draw Arms (Behind and Front)
  drawArm(ctx, sim.state.leftArm, theme, sim.state.leftHandFringes, colorway);
  drawArm(ctx, sim.state.rightArm, theme, sim.state.rightHandFringes, colorway);

  // 2. Draw Main Torso Spine Tube Segments
  for (let i = 0; i < n - 1; i++) {
    const p0 = spine[i];
    const p1 = spine[i + 1];

    const perp0X = Math.cos(p0.angle);
    const perp0Y = Math.sin(p0.angle);
    const perp1X = Math.cos(p1.angle);
    const perp1Y = Math.sin(p1.angle);

    const left0X = p0.x - perp0X * p0.radius;
    const left0Y = p0.y - perp0Y * p0.radius;
    const right0X = p0.x + perp0X * p0.radius;
    const right0Y = p0.y + perp0Y * p0.radius;

    const left1X = p1.x - perp1X * p1.radius;
    const left1Y = p1.y - perp1Y * p1.radius;
    const right1X = p1.x + perp1X * p1.radius;
    const right1Y = p1.y + perp1Y * p1.radius;

    // Segment quad
    ctx.beginPath();
    ctx.moveTo(left0X, left0Y);
    ctx.lineTo(right0X, right0Y);
    ctx.lineTo(right1X, right1Y);
    ctx.lineTo(left1X, left1Y);
    ctx.closePath();

    // Cylindrical shaded nylon gradient
    const grad = ctx.createLinearGradient(left0X, left0Y, right0X, right0Y);
    if (colorway === 'patriotic') {
      const stripeIdx = Math.floor(i / 4) % 3;
      const stripeColor = stripeIdx === 0 ? '#2563EB' : stripeIdx === 1 ? '#FFFFFF' : '#DC2626';
      grad.addColorStop(0, '#1E293B');
      grad.addColorStop(0.35, stripeColor);
      grad.addColorStop(0.7, stripeColor);
      grad.addColorStop(1, '#0F172A');
    } else {
      grad.addColorStop(0, theme.shadow);
      grad.addColorStop(0.25, theme.primary);
      grad.addColorStop(0.55, theme.highlight);
      grad.addColorStop(0.85, theme.secondary);
      grad.addColorStop(1, theme.shadow);
    }

    ctx.fillStyle = grad;
    ctx.fill();

    // Seam lines & Fabric Wrinkles
    if (i % 2 === 0) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(left0X, left0Y);
      ctx.lineTo(right0X, right0Y);
      ctx.stroke();
    }

    // Dynamic wrinkle crease if angle is sharp
    const angDiff = Math.abs(p1.angle - p0.angle);
    if (angDiff > 0.18) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = Math.min(3.5, angDiff * 6);
      ctx.beginPath();
      ctx.moveTo((left0X + left1X) * 0.5, (left0Y + left1Y) * 0.5);
      ctx.lineTo((right0X + right1X) * 0.5, (right0Y + right1Y) * 0.5);
      ctx.stroke();
    }
  }

  // 3. Draw Head Fringes / Streamers
  sim.state.headFringes.forEach((fringe, fIdx) => {
    ctx.save();
    ctx.strokeStyle = fIdx % 2 === 0 ? theme.accent : theme.highlight;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fringe.nodes[0].x, fringe.nodes[0].y);
    for (let s = 1; s < fringe.nodes.length; s++) {
      ctx.lineTo(fringe.nodes[s].x, fringe.nodes[s].y);
    }
    ctx.stroke();
    ctx.restore();
  });

  // 4. Draw Goofy Face (Googly Eyes + Gaping O-Mouth)
  drawFace(ctx, sim, theme, showGlasses);

  ctx.restore();
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  arm: SimNode[],
  theme: ColorTheme,
  fringes: FringeStreamer[],
  colorway: Colorway
) {
  ctx.save();
  const n = arm.length;

  // Arm Segments
  for (let i = 0; i < n - 1; i++) {
    const p0 = arm[i];
    const p1 = arm[i + 1];

    const perp0X = Math.cos(p0.angle);
    const perp0Y = Math.sin(p0.angle);
    const perp1X = Math.cos(p1.angle);
    const perp1Y = Math.sin(p1.angle);

    const left0X = p0.x - perp0X * p0.radius;
    const left0Y = p0.y - perp0Y * p0.radius;
    const right0X = p0.x + perp0X * p0.radius;
    const right0Y = p0.y + perp0Y * p0.radius;

    const left1X = p1.x - perp1X * p1.radius;
    const left1Y = p1.y - perp1Y * p1.radius;
    const right1X = p1.x + perp1X * p1.radius;
    const right1Y = p1.y + perp1Y * p1.radius;

    ctx.beginPath();
    ctx.moveTo(left0X, left0Y);
    ctx.lineTo(right0X, right0Y);
    ctx.lineTo(right1X, right1Y);
    ctx.lineTo(left1X, left1Y);
    ctx.closePath();

    const grad = ctx.createLinearGradient(left0X, left0Y, right0X, right0Y);
    grad.addColorStop(0, theme.shadow);
    grad.addColorStop(0.3, theme.primary);
    grad.addColorStop(0.7, theme.highlight);
    grad.addColorStop(1, theme.shadow);

    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Hand Fringes
  fringes.forEach((fringe, fIdx) => {
    ctx.save();
    ctx.strokeStyle = fIdx % 2 === 0 ? theme.accent : theme.highlight;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fringe.nodes[0].x, fringe.nodes[0].y);
    for (let s = 1; s < fringe.nodes.length; s++) {
      ctx.lineTo(fringe.nodes[s].x, fringe.nodes[s].y);
    }
    ctx.stroke();
    ctx.restore();
  });

  ctx.restore();
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  sim: AirDancerSim,
  theme: ColorTheme,
  showGlasses: boolean
) {
  const spine = sim.state.spine;
  const n = spine.length;
  const eyeNode = spine[n - 2];
  const mouthNode = spine[n - 4];

  // 1. Funny Arched Cartoon Eyebrows above eyes
  if (!showGlasses) {
    [sim.state.leftEye, sim.state.rightEye].forEach((eye, idx) => {
      ctx.save();
      ctx.translate(eye.scleraX, eye.scleraY);
      ctx.rotate(eyeNode.angle);

      ctx.strokeStyle = '#18181B';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const slant = idx === 0 ? -4 : 4;
      ctx.moveTo(-eye.scleraRadius * 0.9, -eye.scleraRadius * 1.35 + slant);
      ctx.quadraticCurveTo(0, -eye.scleraRadius * 1.65, eye.scleraRadius * 0.9, -eye.scleraRadius * 1.35 - slant);
      ctx.stroke();
      ctx.restore();
    });
  }

  // 2. Googly Eyes with Centrifugal Loose Pupils
  [sim.state.leftEye, sim.state.rightEye].forEach((eye) => {
    ctx.save();
    // Drop shadow under sclera
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(eye.scleraX + 1.5, eye.scleraY + 2.5, eye.scleraRadius, 0, Math.PI * 2);
    ctx.fill();

    // White Sclera with crisp outline
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(eye.scleraX, eye.scleraY, eye.scleraRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    // Loose Inertial Pupil
    ctx.fillStyle = '#09090B';
    ctx.beginPath();
    ctx.arc(
      eye.scleraX + eye.pupilX,
      eye.scleraY + eye.pupilY,
      eye.pupilRadius,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Specular eye glint
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(
      eye.scleraX + eye.pupilX - eye.pupilRadius * 0.35,
      eye.scleraY + eye.pupilY - eye.pupilRadius * 0.35,
      eye.pupilRadius * 0.4,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  });

  // 3. Gaping O-Mouth / Screaming Laugh on lower face (mouthNode)
  ctx.save();
  const mouthAngle = mouthNode.angle;
  ctx.translate(mouthNode.x, mouthNode.y);
  ctx.rotate(mouthAngle);

  const mouthOpen = sim.state.mouthOpen;
  const mw = mouthNode.radius * 0.65;
  const mh = mouthNode.radius * (0.4 + mouthOpen * 0.5);

  // Black mouth cavity
  ctx.fillStyle = '#0B0B0F';
  ctx.beginPath();
  ctx.ellipse(0, 0, mw, mh, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#18181B';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Funny red tongue inside
  ctx.fillStyle = '#DC2626';
  ctx.beginPath();
  ctx.arc(0, mh * 0.3, mw * 0.55, 0, Math.PI);
  ctx.fill();

  // White tooth highlight
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(-mw * 0.3, -mh + 1, mw * 0.6, mh * 0.4, 2);
  ctx.fill();

  ctx.restore();

  // 3. Optional Aviator Sunglasses ("Dealership Cool Guy")
  if (showGlasses) {
    ctx.save();
    const eyeMidX = (sim.state.leftEye.scleraX + sim.state.rightEye.scleraX) * 0.5;
    const eyeMidY = (sim.state.leftEye.scleraY + sim.state.rightEye.scleraY) * 0.5;

    ctx.translate(eyeMidX, eyeMidY);
    ctx.rotate(eyeNode.angle);

    // Gold frames
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 2.5;

    // Bridge
    ctx.beginPath();
    ctx.moveTo(-10, -2);
    ctx.lineTo(10, -2);
    ctx.stroke();

    // Left lens
    ctx.fillStyle = 'rgba(17, 24, 39, 0.92)';
    ctx.beginPath();
    ctx.roundRect(-24, -8, 20, 18, 5);
    ctx.fill();
    ctx.stroke();

    // Right lens
    ctx.beginPath();
    ctx.roundRect(4, -8, 20, 18, 5);
    ctx.fill();
    ctx.stroke();

    // Lens glare reflection
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-20, -4);
    ctx.lineTo(-10, 6);
    ctx.moveTo(8, -4);
    ctx.lineTo(18, 6);
    ctx.stroke();

    ctx.restore();
  }
}
