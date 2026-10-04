import React, { useState, useEffect, useCallback } from 'react';
import { TactileSwitch } from '../../ui/TactileSwitch';
import { SegmentedControl } from '../../ui/SegmentedControl';

export interface InspectionTabProps {
  theme: 0 | 1 | 2;
  purityMode?: boolean;
  onPurityModeToggle?: () => void;
  cdlodEnabled?: boolean;
  onCdlodToggle?: (enabled: boolean) => void;
  cursorPhysicsEnabled?: boolean;
  onCursorPhysicsToggle?: (enabled: boolean) => void;
  cdlodDiagnosticMode?: number;
  onCdlodDiagnosticModeChange?: (mode: number) => void;
  setCdlodDiagnosticMode?: (mode: number) => void;
}

export const InspectionTab: React.FC<InspectionTabProps> = ({
  theme,
  purityMode = false,
  onPurityModeToggle,
  cdlodEnabled = true,
  onCdlodToggle,
  cursorPhysicsEnabled = false,
  onCursorPhysicsToggle,
  cdlodDiagnosticMode: cdlodDiagnosticModeProp,
  onCdlodDiagnosticModeChange,
  setCdlodDiagnosticMode,
}) => {
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(true);

  const [internalCdlodDiagnosticMode, setInternalCdlodDiagnosticMode] = useState<number>(() => {
    if (typeof window !== 'undefined' && typeof (window as any).__INDICATRIX_CDLOD_DIAGNOSTIC_MODE__ === 'number') {
      return (window as any).__INDICATRIX_CDLOD_DIAGNOSTIC_MODE__;
    }
    return cdlodDiagnosticModeProp ?? 0;
  });

  useEffect(() => {
    if (cdlodDiagnosticModeProp !== undefined) {
      setInternalCdlodDiagnosticMode(cdlodDiagnosticModeProp);
    }
  }, [cdlodDiagnosticModeProp]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      const mode = (e as CustomEvent).detail;
      if (typeof mode === 'number') {
        setInternalCdlodDiagnosticMode(mode);
      }
    };
    window.addEventListener('indicatrix:cdlod-diag', handler);
    return () => window.removeEventListener('indicatrix:cdlod-diag', handler);
  }, []);

  const activeCdlodDiagnosticMode = cdlodDiagnosticModeProp !== undefined ? cdlodDiagnosticModeProp : internalCdlodDiagnosticMode;

  const handleCdlodDiagnosticModeChange = useCallback((mode: number) => {
    setInternalCdlodDiagnosticMode(mode);
    onCdlodDiagnosticModeChange?.(mode);
    setCdlodDiagnosticMode?.(mode);
    if (typeof window !== 'undefined') {
      (window as any).__INDICATRIX_CDLOD_DIAGNOSTIC_MODE__ = mode;
      window.dispatchEvent(new CustomEvent('indicatrix:cdlod-diag', { detail: mode }));
    }
  }, [onCdlodDiagnosticModeChange, setCdlodDiagnosticMode]);

  return (
    <div className="rounded-[3px] border border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] transition-all shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setIsDiagnosticsOpen(!isDiagnosticsOpen)}
        className="w-full p-2.5 flex items-center justify-between text-left cursor-pointer hover:bg-[var(--theme-card-border)]/15 transition-colors"
        title="Toggle Inspection & WebGPU CDLOD Diagnostics tools"
      >
        <div className="flex items-center gap-2">
          <span className="text-nano font-mono font-bold px-1.5 py-0.5 rounded-[2px] bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border border-[var(--theme-control-active-border)] shadow-sm">
            DIAGNOSTICS
          </span>
          <span className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-secondary)]">
            Inspection & Mesh
          </span>
        </div>
        <span className="text-nano font-mono text-[var(--theme-text-muted)]">
          {isDiagnosticsOpen ? '▲ Collapse' : '▼ Expand'}
        </span>
      </button>
      {isDiagnosticsOpen && (
        <div className="p-2.5 pt-0 space-y-3 border-t border-[var(--theme-card-border)]/50 mt-1">
          {/* Raw DEM Purity Switch */}
          <div className="pt-2 flex items-center justify-between">
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-micro font-bold uppercase tracking-wider text-[var(--theme-text-primary)]">
                  Purity · DEM Only
                </span>
                <span className="text-nano font-mono px-1 py-px rounded-[2px] bg-[var(--theme-control-bg)] border border-[var(--theme-control-border)] text-[var(--theme-text-accent)] font-bold">
                  RAW
                </span>
              </div>
              <span className="text-nano opacity-65 font-mono text-[var(--theme-text-secondary)]">
                Archival substrate + pure DEM mesh (zero atmosphere/water)
              </span>
            </div>
            <TactileSwitch
              checked={Boolean(purityMode)}
              onChange={onPurityModeToggle || (() => {})}
              title="Toggle Raw DEM Purity Mode (Strips water, atmosphere, clouds, and wind)"
              label={purityMode ? 'Active' : 'Off'}
              indicatorColor={theme === 1 ? '#1A4457' : theme === 2 ? '#38BDF8' : '#10B981'}
            />
          </div>

          {/* CDLOD Tessellation Switch */}
          <div className="pt-2 border-t border-[var(--theme-card-border)]/50">
            <TactileSwitch
              id="sidebar-cdlod-toggle"
              checked={Boolean(cdlodEnabled)}
              onChange={(checked) => onCdlodToggle?.(checked)}
              title="Toggle CDLOD Tessellation"
              label="CDLOD Tessellation"
              sublabel="Distance-dependent quadtree mesh LOD"
              indicatorColor={theme === 1 ? '#1A4457' : theme === 2 ? '#38BDF8' : '#10B981'}
            />
          </div>

          {/* Cursor Physics Switch */}
          <div className="pt-2 border-t border-[var(--theme-card-border)]/50">
            <TactileSwitch
              id="sidebar-cursor-physics-toggle"
              checked={Boolean(cursorPhysicsEnabled)}
              onChange={(checked) => onCursorPhysicsToggle?.(checked)}
              title="Toggle Cursor Physics"
              label="Cursor Physics"
              sublabel="Kinematic damping and elastic spring reticle"
              indicatorColor={theme === 1 ? '#1A4457' : theme === 2 ? '#38BDF8' : '#10B981'}
            />
          </div>

          {/* CDLOD Mesh Diagnostics */}
          <div className="pt-2 border-t border-[var(--theme-card-border)]/50">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-micro font-bold uppercase tracking-wider text-[var(--theme-text-primary)]">
                  CDLOD Mesh Diagnostics
                </span>
                <span className="text-nano font-mono text-[var(--theme-status-amber)] font-bold">
                  {activeCdlodDiagnosticMode === 0 ? 'OFF' : activeCdlodDiagnosticMode === 1 ? 'LOD' : activeCdlodDiagnosticMode === 2 ? 'MORPH' : 'COMBINED'}
                </span>
              </div>
              <SegmentedControl
                size="sm"
                value={activeCdlodDiagnosticMode}
                onChange={handleCdlodDiagnosticModeChange}
                options={[
                  { id: 0, label: 'Off', title: 'Normal Cartographic Rendering' },
                  { id: 1, label: 'LOD', title: 'Color patches by integer LOD level' },
                  { id: 2, label: 'Morph α', title: 'Render geomorphing transition factor alpha' },
                  { id: 3, label: 'All', title: 'Combined LOD hue + morph gradient + relief' },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
