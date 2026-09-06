// ============================================================================
// File: src/components/canvas/WebGPUFallback.tsx
// Component: WebGPU Hardware Acceleration Fallback Interface
// Description: Architectural SVG vector globe & hardware compatibility diagnostics
// ============================================================================

import React from 'react';

export interface WebGPUFallbackProps {
  theme?: 0 | 1;
  errorMessage?: string;
  onRetry?: () => void;
}

export const WebGPUFallback: React.FC<WebGPUFallbackProps> = ({
  theme = 0,
  errorMessage,
  onRetry,
}) => {
  const isDark = theme === 0;

  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center p-6 select-none transition-colors duration-500 ${
        isDark ? 'bg-[#090B10] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'
      }`}
    >
      {/* Decorative SVG Vector Globe Wireframe */}
      <div className="relative w-64 h-64 mb-8 flex items-center justify-center">
        <svg
          viewBox="0 0 200 200"
          className={`w-full h-full animate-spin-slow ${
            isDark ? 'text-cyan-500/40' : 'text-slate-400'
          }`}
          style={{ animation: 'spin 20s linear infinite' }}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        >
          {/* Globe Boundary */}
          <circle cx="100" cy="100" r="90" strokeWidth="1.8" className={isDark ? 'text-cyan-400/80' : 'text-slate-600'} />
          
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
            className={`w-16 h-16 rounded-full border border-dashed flex items-center justify-center font-mono text-xs font-bold tracking-wider ${
              isDark
                ? 'border-cyan-400/60 bg-cyan-950/30 text-cyan-300'
                : 'border-slate-500 bg-slate-200/50 text-slate-700'
            }`}
          >
            S² ⟷ ℝ²
          </div>
        </div>
      </div>

      {/* Diagnostics Card */}
      <div
        className={`max-w-md w-full rounded-2xl p-6 border shadow-2xl backdrop-blur-md ${
          isDark
            ? 'bg-slate-900/80 border-cyan-500/20 shadow-cyan-950/50'
            : 'bg-white/90 border-slate-200 shadow-slate-300/50'
        }`}
      >
        <div className="flex items-center gap-3 mb-3">
          <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse"></span>
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider">
            WebGPU Required
          </h2>
        </div>

        <p className="text-xs leading-relaxed text-slate-400 mb-4">
          {errorMessage ||
            'The Indicatrix 3D Cartography Engine runs exclusively on native WebGPU hardware compute pipelines to simulate 1,000,000 to 16,700,000 matrix vertices at 120 FPS.'}
        </p>

        {/* Hardware & Browser Requirements List */}
        <div className={`p-3 rounded-lg text-xs font-mono mb-5 space-y-1.5 ${
          isDark ? 'bg-slate-950/60 border border-slate-800' : 'bg-slate-50 border border-slate-200'
        }`}>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Pipeline Engine:</span>
            <span className="text-cyan-400">WebGPU WGSL SIMD32</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Hardware Compute:</span>
            <span className="text-emerald-400">Storage Buffers @ 256</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Supported Browsers:</span>
            <span>Chrome 113+, Safari 18+, Edge 113+</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onRetry && (
            <button
              onClick={onRetry}
              className={`flex-1 py-2 px-4 rounded-xl font-mono text-xs font-semibold transition-all ${
                isDark
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              Retry Detection
            </button>
          )}
          <a
            href="https://webgpu.io"
            target="_blank"
            rel="noopener noreferrer"
            className={`py-2 px-4 rounded-xl font-mono text-xs text-center border transition-all ${
              isDark
                ? 'border-slate-700 hover:border-cyan-500/50 text-slate-300'
                : 'border-slate-300 hover:border-slate-500 text-slate-700'
            }`}
          >
            WebGPU Guide
          </a>
        </div>
      </div>
    </div>
  );
};

export default WebGPUFallback;
