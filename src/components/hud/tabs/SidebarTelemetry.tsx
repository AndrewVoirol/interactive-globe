import React, { useState, useEffect, useMemo } from 'react';
import { ResolutionTier } from '../../../types';

export interface SidebarTelemetryProps {
  theme: 0 | 1 | 2;
  resolution: ResolutionTier;
  onResolutionChange: (r: ResolutionTier) => void;
  latStr: string;
  lonStr: string;
  mapScaleStr: string;
  fps: number;
  backend: 'webgl2' | 'webgpu';
  gpuReport?: any;
}

export const SidebarTelemetry: React.FC<SidebarTelemetryProps> = ({
  theme,
  resolution,
  onResolutionChange,
  latStr,
  lonStr,
  mapScaleStr,
  fps,
  backend,
  gpuReport,
}) => {
  const [liveVram, setLiveVram] = useState<{
    totalMb: number;
    subsystems: Record<string, { mb: number; bufferCount: number; textureCount: number }>;
  } | null>(null);

  useEffect(() => {
    const pollVram = () => {
      if (typeof window !== 'undefined') {
        const engine = (window as any).__INDICATRIX_WEBGPU_ENGINE__;
        if (engine && typeof engine.getVramLedger === 'function') {
          const ledger = engine.getVramLedger();
          setLiveVram({ totalMb: ledger.totalMb, subsystems: ledger.subsystems });
        }
      }
    };
    pollVram();
    const timer = setInterval(pollVram, 1000);
    return () => clearInterval(timer);
  }, []);

  const resolutionVramLabel = useMemo(() => {
    const tierConfig: Record<ResolutionTier, { verts: string; nodes: number }> = {
      '100k': { verts: '262K Verts', nodes: 262_144 },
      '1M': { verts: '1.05M Verts', nodes: 1_048_576 },
      '3M': { verts: '2.98M Verts', nodes: 2_980_000 },
      '4M': { verts: '4.19M Verts', nodes: 4_194_304 },
      '8M': { verts: '8.38M Verts', nodes: 8_388_608 },
      '16M': { verts: '16.7M Verts', nodes: 16_777_216 },
    };
    const c = tierConfig[resolution] || tierConfig['1M'];
    const mb = liveVram ? liveVram.totalMb : Math.round((c.nodes * 104) / (1024 * 1024));
    const sizeStr = mb >= 1000 ? `${(mb / 1024).toFixed(2)}GB` : `${mb.toFixed(1)}MB`;
    return `${c.verts} · ${sizeStr}`;
  }, [resolution, liveVram]);

  return (
    <div className="pt-2 border-t border-[var(--theme-card-border)] text-nano space-y-2 shrink-0">
      <div className="space-y-1">
        <div className="flex items-center justify-between text-nano font-mono">
          <span className="uppercase font-bold tracking-wider opacity-60">Resolution</span>
          <span
            className="text-[var(--theme-text-accent)] font-medium cursor-help"
            title={
              liveVram
                ? `VRAM Subsystems:\n• DEM: ${liveVram.subsystems.DEM?.mb ?? 0} MB\n• Atmosphere: ${liveVram.subsystems.Atmosphere?.mb ?? 0} MB\n• Hydrology: ${liveVram.subsystems.Hydrology?.mb ?? 0} MB\n• Simulation: ${liveVram.subsystems.Simulation?.mb ?? 0} MB\n• Pipelines: ${liveVram.subsystems.Pipelines?.mb ?? 0} MB`
                : undefined
            }
          >
            {resolutionVramLabel}
          </span>
        </div>
        <div className="grid grid-cols-6 gap-1">
          {(['100k', '1M', '3M', '4M', '8M', '16M'] as ResolutionTier[]).map((tier) => (
            <button
              key={tier}
              onClick={() => onResolutionChange(tier)}
              aria-pressed={resolution === tier}
              aria-label={`Resolution tier ${tier.toUpperCase()}`}
              className={`py-1 px-0.5 rounded-[2px] text-center flex flex-col items-center justify-center border transition-all cursor-pointer font-mono ${
                resolution === tier
                  ? tier === '16M'
                    ? theme === 1
                      ? 'bg-[#7D4700] text-[#FDFCF9] border-[#5A3300] font-semibold shadow-sm'
                      : 'bg-[var(--theme-status-amber)] text-black border-[var(--theme-status-amber)] font-semibold shadow-sm'
                    : 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] font-semibold shadow-sm ring-1 ring-[var(--theme-control-active-ring)]'
                  : 'bg-[var(--theme-control-bg)] border-[var(--theme-control-border)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)]'
              }`}
            >
              <span className="text-nano font-semibold">{tier.toUpperCase()}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 tabular-nums text-[var(--theme-text-secondary)]">
        <div>
          <span className="block text-nano uppercase font-bold tracking-wider opacity-60">
            Center Coordinate
          </span>
          <span className="font-bold text-[var(--theme-text-primary)]">
            {latStr} {lonStr}
          </span>
        </div>
        <div className="text-right">
          <span className="block text-nano uppercase font-bold tracking-wider opacity-60">
            Nominal Scale
          </span>
          <span className="font-bold text-[var(--theme-text-primary)]">{mapScaleStr}</span>
        </div>
      </div>

      <div className="pt-1.5 mt-0.5 border-t border-[var(--theme-card-border)] flex flex-col gap-1 text-nano text-[var(--theme-text-secondary)]">
        <div className="flex items-center justify-between font-bold">
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--theme-status-slate)] flex items-center gap-1">
              GPU Profiler
            </span>
            <div
              title={`Rendering Frame Rate: ${fps} FPS`}
              aria-label={`Rendering Frame Rate: ${fps} FPS`}
              className="flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-[2px] border border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] font-bold text-nano tabular-nums transition-colors"
            >
              <span
                className={`w-5 text-right tabular-nums font-semibold ${
                  fps >= 100
                    ? 'text-[var(--theme-text-accent)]'
                    : fps >= 55
                    ? 'text-[var(--theme-status-sage)]'
                    : 'text-[var(--theme-status-amber)]'
                }`}
              >
                {fps}
              </span>
              <span className="text-nano font-normal opacity-60">FPS</span>
            </div>
          </div>
          {backend === 'webgpu' && gpuReport && (
            <span className="text-[var(--theme-status-sage)] font-mono">Total: {(gpuReport.totalGpuMs ?? 0).toFixed(2)}ms</span>
          )}
        </div>
        {backend === 'webgpu' && gpuReport && (
          <div className="grid grid-cols-4 gap-1 font-mono opacity-80 text-nano">
            <span>Sim: {(gpuReport.computeMs ?? 0).toFixed(1)}ms</span>
            <span>Crust: {(gpuReport.reliefMs ?? 0).toFixed(1)}ms</span>
            <span>Lines: {(gpuReport.linesMs ?? 0).toFixed(1)}ms</span>
            <span>Cont: {(gpuReport.contoursMs ?? 0).toFixed(1)}ms</span>
          </div>
        )}
      </div>
    </div>
  );
};
