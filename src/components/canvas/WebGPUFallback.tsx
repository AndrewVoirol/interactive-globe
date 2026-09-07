// ============================================================================
// File: src/components/canvas/WebGPUFallback.tsx
// Component: WebGPU Hardware Acceleration Fallback Interface
// Description: Architectural SVG vector globe & hardware compatibility diagnostics
// ============================================================================

import React from 'react';

export interface WebGPUFallbackProps {
  theme?: 0 | 1 | 2;
  errorMessage?: string;
  onRetry?: () => void;
}

export const WebGPUFallback: React.FC<WebGPUFallbackProps> = ({
  theme = 0,
  errorMessage,
  onRetry,
}) => {
  const isDark = theme !== 1;
  const themeName = theme === 2 ? 'cyanotype' : theme === 1 ? 'cream' : 'tharp';

  return (
    <div
      data-theme={themeName}
      className={`w-full h-full flex flex-col items-center justify-center p-6 select-none transition-colors duration-500 font-mono ${
        theme === 2
          ? 'paper-cyanotype bg-[#0C1520] text-[#E8EDF2]'
          : theme === 1
          ? 'paper-cream bg-[#F8F3E8] text-[#2B241A]'
          : 'paper-tharp bg-[#090B10] text-[#F0EDE6]'
      }`}
    >
      {/* Decorative SVG Vector Globe Wireframe */}
      <div className="relative w-64 h-64 mb-8 flex items-center justify-center">
        <svg
          viewBox="0 0 200 200"
          className={`w-full h-full animate-spin-slow ${
            theme === 2
              ? 'text-[#4F79A3]/60'
              : theme === 1
              ? 'text-[#8C4820]/40'
              : 'text-cyan-500/40'
          }`}
          style={{ animation: 'spin 20s linear infinite' }}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        >
          {/* Globe Boundary */}
          <circle
            cx="100"
            cy="100"
            r="90"
            strokeWidth="1.8"
            className={
              theme === 2
                ? 'text-[#4F79A3]'
                : theme === 1
                ? 'text-[#8C4820]'
                : 'text-cyan-400/80'
            }
          />
          
          {/* Parallels (Latitudes) */}
          <ellipse cx="100" cy="100" rx="90" ry="30" strokeDasharray="3 3" />
          <ellipse cx="100" cy="100" rx="90" ry="60" strokeDasharray="3 3" />
          <line x1="10" y1="100" x2="190" y2="100" strokeWidth="1.5" />
          <ellipse cx="100" cy="50" rx="78" ry="20" strokeDasharray="2 2" />
          <ellipse cx="100" cy="150" rx="78" ry="20" strokeDasharray="2 2" />

          {/* Meridians (Longitudes) */}
          <ellipse cx="100" cy="100" rx="30" ry="90" strokeDasharray="3 3" />
          <ellipse cx="100" cy="100" rx="60" ry="90" strokeDasharray="3 3" />
          <line x1="100" y1="10" x2="100" y2="190" strokeWidth="1.5" />

          {/* Polar Axis */}
          <circle cx="100" cy="10" r="3" fill="currentColor" />
          <circle cx="100" cy="190" r="3" fill="currentColor" />
        </svg>

        {/* Central Geometric Indicator */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className={`w-16 h-16 rounded-full border border-dashed flex items-center justify-center font-mono text-micro font-bold tracking-wider ${
              theme === 2
                ? 'border-[#4F79A3] bg-[#101C2B]/80 text-[#E8EDF2]'
                : theme === 1
                ? 'border-[#B8AD98] bg-[#FDFCF9]/80 text-[#2B241A]'
                : 'border-cyan-400/60 bg-cyan-950/30 text-cyan-300'
            }`}
          >
            S² ⟷ ℝ²
          </div>
        </div>
      </div>

      {/* Diagnostics Card */}
      <div
        className="max-w-md w-full rounded-[3px] p-6 border shadow-2xl backdrop-blur-md bg-[var(--theme-panel-bg)] border-[var(--theme-panel-border)] text-[var(--theme-text-primary)]"
      >
        <div className="flex items-center gap-3 mb-3">
          <span className="w-3 h-3 rounded-full bg-[var(--theme-text-accent)] animate-pulse" />
          <h2 className="text-body font-mono font-bold uppercase tracking-wider text-[var(--theme-text-primary)]">
            WebGPU Required
          </h2>
        </div>

        <p className="text-micro leading-relaxed text-[var(--theme-text-secondary)] mb-4">
          {errorMessage ||
            'The Indicatrix 3D Cartography Engine runs exclusively on native WebGPU hardware compute pipelines to simulate 1,000,000 to 16,700,000 matrix vertices at 120 FPS.'}
        </p>

        {/* Hardware & Browser Requirements List */}
        <div className="p-3 rounded-[2px] text-nano font-mono mb-5 space-y-1.5 border bg-[var(--theme-card-bg)] border-[var(--theme-card-border)]">
          <div className="flex justify-between items-center">
            <span className="text-[var(--theme-text-secondary)]">Pipeline Engine:</span>
            <span className="text-[var(--theme-text-accent)] font-bold">WebGPU WGSL SIMD32</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[var(--theme-text-secondary)]">Hardware Compute:</span>
            <span className="text-emerald-500 font-bold">Storage Buffers @ 256</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[var(--theme-text-secondary)]">Supported Browsers:</span>
            <span className="text-[var(--theme-text-primary)]">Chrome 113+, Safari 18+, Edge 113+</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onRetry && (
            <button
              onClick={onRetry}
              className="tactile-btn flex-1 py-2 px-4 rounded-[2px] font-mono text-micro font-bold transition-all border border-[var(--theme-control-active-border)] bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] shadow-sm"
            >
              Retry Detection
            </button>
          )}
          <a
            href="https://webgpu.io"
            target="_blank"
            rel="noopener noreferrer"
            className="tactile-btn py-2 px-4 rounded-[2px] font-mono text-micro text-center border transition-all border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)]"
          >
            WebGPU Guide
          </a>
        </div>
      </div>
    </div>
  );
};

export default WebGPUFallback;
