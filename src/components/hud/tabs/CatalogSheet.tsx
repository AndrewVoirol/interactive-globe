import React, { useState, useEffect, useRef } from 'react';
import { DATA_LAYER_CATALOG } from '../../../core/data/DataLayerCatalog';
import type { DataLayerItem } from '../UnifiedRightSidebar';

export interface CatalogSheetProps {
  isCatalogOpen: boolean;
  setIsCatalogOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  theme: 0 | 1 | 2;
  dataLayers: DataLayerItem[];
  onAddDataLayer?: (layer: DataLayerItem) => void;
  onShowCloudsChange?: (v: boolean) => void;
}

export const CatalogSheet: React.FC<CatalogSheetProps> = ({
  isCatalogOpen,
  setIsCatalogOpen,
  theme,
  dataLayers = [],
  onAddDataLayer,
  onShowCloudsChange,
}) => {
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'topo' | 'vectors' | 'satellite'>('all');
  const catalogSheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isCatalogOpen) setIsCatalogOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCatalogOpen, setIsCatalogOpen]);

  if (!isCatalogOpen) return null;

  return (
    <>
      {/* Modal Backdrop below xl breakpoint (stacks over sidebar z-30) */}
      <div
        className="fixed inset-0 bg-black/20 z-35 z-[35] xl:hidden pointer-events-auto backdrop-blur-[1px] transition-opacity duration-300"
        onClick={() => setIsCatalogOpen(false)}
        aria-hidden="true"
      />
      <div
        ref={catalogSheetRef}
        className="fixed top-5 right-5 xl:right-[26.5rem] z-40 pointer-events-auto w-96 max-w-[calc(100vw-2.5rem)] xl:max-w-[calc(100vw-28rem)] max-h-[calc(100vh-2.5rem)] xl:max-h-[calc(100vh-8.5rem)] 2xl:max-h-[calc(100vh-8.5rem)] flex flex-col font-mono select-none rounded-[3px] border backdrop-blur-2xl shadow-2xl p-4 text-micro transition-all duration-300 ease-out animate-in fade-in slide-in-from-right-4 border-[var(--theme-panel-border)] bg-[var(--theme-panel-bg)] text-[var(--theme-text-primary)]"
      >
        <div className="flex items-center justify-between pb-3 border-b border-[var(--theme-panel-border)]">
          <div>
            <h3 className="text-micro font-semibold uppercase tracking-wider text-[var(--theme-text-primary)]">Catalog</h3>
            <span className="text-nano opacity-60 text-[var(--theme-text-muted)]">
              {DATA_LAYER_CATALOG.length} datasets
            </span>
          </div>

          <button
            type="button"
            aria-label="Close catalog"
            onClick={() => setIsCatalogOpen(false)}
            title="Close Catalog Sheet (Esc)"
            className="p-1.5 rounded-[2px] border transition-all cursor-pointer border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 pt-2 pb-2 border-b border-[var(--theme-panel-border)]">
          {(['all', 'topo', 'vectors', 'satellite'] as const).map((cat) => {
            const isSelected = catalogFilter === cat;
            const labels = {
              all: 'ALL',
              topo: 'TOPO',
              vectors: 'VECTORS',
              satellite: 'SATELLITE',
            };
            return (
              <button
                key={cat}
                onClick={() => setCatalogFilter(cat)}
                className={`domain-chip cursor-pointer px-2 py-0.5 rounded-[2px] text-nano font-mono font-bold tracking-wider uppercase border transition-all ${
                  isSelected
                    ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-sm ring-1 ring-[var(--theme-control-active-ring)]'
                    : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-control-text)] hover:bg-[var(--theme-control-hover-bg)] hover:text-[var(--theme-control-hover-text)] hover:border-[var(--theme-card-border-hover)]'
                }`}
              >
                [{labels[cat]}]
              </button>
            );
          })}
        </div>

        {/* Catalog List */}
        <div className="overflow-y-auto space-y-2.5 pr-1 mt-3 flex-1 min-h-0 pb-4 scroll-fade-mask pt-1">
          {DATA_LAYER_CATALOG.filter((preset) => {
            if (catalogFilter === 'all') return true;
            if (catalogFilter === 'topo') {
              return preset.category === 'topo' || preset.category === 'ocean' || preset.category === 'point';
            }
            if (catalogFilter === 'vectors') {
              return preset.category === 'vectors' || preset.category === 'field' || preset.category === 'trajectory' || preset.category === 'point';
            }
            if (catalogFilter === 'satellite') {
              return preset.category === 'satellite' || preset.category === 'night' || preset.category === 'trajectory' || preset.id === 'starlink-iss-orbits';
            }
            return true;
          }).map((preset) => {
            const isAlreadyAdded = dataLayers.some((l) => l.id === preset.id);

            return (
              <div
                key={preset.id}
                className="p-2.5 rounded-[2px] border transition-all border-[var(--theme-card-border)] bg-[var(--theme-card-bg)] hover:border-[var(--theme-card-border-hover)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          theme === 1
                            ? (preset.category === 'topo'
                                ? 'bg-[#8c4820]'
                                : preset.category === 'satellite'
                                ? 'bg-[#2b6b88]'
                                : preset.category === 'vectors'
                                ? 'bg-[#7d4700]'
                                : 'bg-[#2e6b47]')
                            : theme === 2
                            ? (preset.category === 'topo'
                                ? 'bg-[#7dd3fc]'
                                : preset.category === 'satellite'
                                ? 'bg-[#38bdf8]'
                                : preset.category === 'vectors'
                                ? 'bg-[#b8d0e8]'
                                : 'bg-[#9fc2e4]')
                            : (preset.category === 'topo'
                                ? 'bg-[#c86d51]'
                                : preset.category === 'satellite'
                                ? 'bg-[#38bdf8]'
                                : preset.category === 'vectors'
                                ? 'bg-[#f59e0b]'
                                : 'bg-[var(--theme-status-sage)]')
                        }`}
                      />
                      <span className="font-semibold text-nano tracking-tight text-[var(--theme-text-primary)] truncate block">
                        {preset.name}
                      </span>
                    </div>
                    <span className="text-nano opacity-60 text-[var(--theme-text-muted)] block mt-0.5 truncate">
                      {preset.type}
                    </span>
                  </div>

                  <span
                    className={`text-nano px-1.5 py-0.5 rounded-[2px] border font-bold uppercase shrink-0 ${
                      theme === 2
                        ? preset.category === 'topo'
                          ? 'bg-[#3b6b99]/25 text-[#9fc2e4] border-[#5c82a6]/40'
                          : preset.category === 'satellite'
                          ? 'bg-[#38bdf8]/20 text-[#bae6fd] border-[#38bdf8]/40'
                          : preset.category === 'vectors'
                          ? 'bg-[#7dd3fc]/20 text-[#e0f2fe] border-[#7dd3fc]/40'
                          : 'bg-[#4a729e]/20 text-[#caddf0] border-[#4a729e]/40'
                        : theme === 0
                        ? preset.category === 'topo'
                          ? 'bg-[#c86d51]/20 text-[#fdba74] border-[#c86d51]/40'
                          : preset.category === 'satellite'
                          ? 'bg-[#10b981]/20 text-[#6ee7b7] border-[#10b981]/40'
                          : preset.category === 'vectors'
                          ? 'bg-[#f59e0b]/20 text-[#fcd34d] border-[#f59e0b]/40'
                          : 'bg-[var(--theme-status-sage)]/20 text-[var(--theme-status-sage)] border-[var(--theme-status-sage)]/40'
                        : preset.category === 'topo'
                        ? 'bg-[#2e6b47]/15 text-[#1b432b] border-[#2e6b47]/30'
                        : preset.category === 'satellite'
                        ? 'bg-[#2b6b88]/15 text-[#1a4457] border-[#2b6b88]/30'
                        : preset.category === 'vectors'
                        ? 'bg-[#96641e]/15 text-[#52350c] border-[#96641e]/30'
                        : 'bg-[var(--theme-status-sage)]/15 text-[var(--theme-status-sage)] border-[var(--theme-status-sage)]/30'
                    }`}
                  >
                    {preset.category}
                  </span>
                </div>

                <p className="text-nano opacity-75 text-[var(--theme-text-secondary)] mt-1.5 leading-relaxed line-clamp-2">
                  {preset.details}
                </p>

                <div className="mt-2.5 pt-2 border-t flex items-center justify-between gap-2 border-[var(--theme-card-border)]">
                  <span className="text-nano opacity-50 text-[var(--theme-text-muted)]">
                    {preset.elevationEncoding ? `Format: ${preset.elevationEncoding.toUpperCase()}` : 'Format: Float32'}
                  </span>

                  <button
                    type="button"
                    disabled={isAlreadyAdded || preset.unsupported}
                    onClick={() => {
                      if (isAlreadyAdded || preset.unsupported) return;
                      if (onAddDataLayer) {
                        onAddDataLayer({
                          id: preset.id,
                          name: preset.name,
                          category: preset.category,
                          type: preset.type,
                          details: preset.details,
                          visible: true,
                          opacity: preset.defaultOpacity,
                          blendMode: preset.defaultBlendMode,
                          displacementScale: preset.defaultDisplacementScale,
                          elevationEncoding: preset.elevationEncoding,
                          sunAzimuth: 315,
                          sunAltitude: 45,
                          hillshadeIntensity: 0.65,
                          url: preset.url,
                          renderStyle: preset.renderStyle,
                        });
                      }
                      if (preset.id === 'noaa-gfs-clouds') {
                        onShowCloudsChange?.(true);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-[2px] text-nano font-bold border transition-all flex items-center gap-1.5 ${
                      preset.unsupported
                        ? theme === 1
                          ? 'opacity-50 cursor-not-allowed bg-[#e2dcce] text-[#787062] border-[#c4bcac]'
                          : theme === 2
                          ? 'opacity-40 cursor-not-allowed bg-[#142334] text-[#6b8aa8] border-[#20364d]'
                          : 'opacity-40 cursor-not-allowed bg-zinc-800 text-zinc-400 border-zinc-700'
                        : isAlreadyAdded
                        ? theme === 1
                          ? 'bg-[#2e6b47]/15 text-[#1b432b] border-[#2e6b47]/30 cursor-default font-semibold'
                          : theme === 2
                          ? 'bg-[#2a5540]/30 text-[#8ee0b1] border-[#387256]/40 cursor-default font-semibold'
                          : 'bg-[var(--theme-status-sage)]/20 text-[var(--theme-status-sage)] border-[var(--theme-status-sage)]/40 cursor-default ring-1 ring-[var(--theme-status-sage)]/30 font-semibold'
                        : 'cursor-pointer bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] hover:border-[var(--theme-card-border-hover)] shadow-sm font-semibold'
                    }`}
                  >
                    {preset.unsupported ? (
                      <span>Unsupported</span>
                    ) : isAlreadyAdded ? (
                      <>
                        <svg className="w-3.5 h-3.5 text-[var(--theme-status-sage)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>✓ Added to Stack</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                        </svg>
                        <span>+ Add Layer to Stack</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};
