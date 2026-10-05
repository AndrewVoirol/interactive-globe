import React, { useState, useCallback } from 'react';
import { getPresetById } from '../../../core/data/DataLayerCatalog';
import { CuratorsColophon } from '../CuratorsColophon';
import type { DataLayerItem } from '../UnifiedRightSidebar';

export interface DataLayersTabProps {
  theme: 0 | 1 | 2;
  dataLayers: DataLayerItem[];
  isCatalogOpen: boolean;
  setIsCatalogOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  onToggleDataLayer?: (id: string) => void;
  onRemoveDataLayer?: (id: string) => void;
  onOpacityChangeDataLayer?: (id: string, opacity: number) => void;
  onAmbientOcclusionChangeDataLayer?: (id: string, ao: number) => void;
  propShowClouds?: boolean;
  isNoaaActive: boolean;
  isRadarActive: boolean;
}

export const DataLayersTab: React.FC<DataLayersTabProps> = ({
  theme,
  dataLayers = [],
  isCatalogOpen,
  setIsCatalogOpen,
  onToggleDataLayer,
  onRemoveDataLayer,
  onOpacityChangeDataLayer,
  onAmbientOcclusionChangeDataLayer,
  propShowClouds,
  isNoaaActive,
  isRadarActive,
}) => {
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null);

  const getStratumBadge = useCallback(
    (category?: string) => {
      const cat = (category || '').toLowerCase();
      const isTopo = cat.includes('topo') || cat.includes('relief') || cat.includes('elevation');
      const isOcean = cat.includes('ocean') || cat.includes('hydro') || cat.includes('bathymetry');
      const isAtmo = cat.includes('atmo') || cat.includes('weather') || cat.includes('cloud') || cat.includes('wind') || cat.includes('radar');
      const isVect = cat.includes('vector') || cat.includes('boundary') || cat.includes('graticule');
      const isOrbit = cat.includes('orbit') || cat.includes('satellite') || cat.includes('trajectory');

      // Stratum categories use existing theme direction/status tokens which adapt per-medium
      if (isTopo) return { border: 'var(--theme-text-accent)', bg: 'var(--theme-control-active-ring)', text: 'var(--theme-text-accent)', label: 'TOPO' };
      if (isOcean) return { border: 'var(--theme-direction-b-border)', bg: 'var(--theme-direction-b-ring)', text: 'var(--theme-direction-b-text)', label: 'HYDRO' };
      if (isAtmo) return { border: 'var(--theme-status-sage)', bg: 'var(--theme-control-active-ring)', text: 'var(--theme-status-sage)', label: 'ATMO' };
      if (isVect) return { border: 'var(--theme-status-amber)', bg: 'var(--theme-control-active-ring)', text: 'var(--theme-status-amber)', label: 'VECT' };
      if (isOrbit) return { border: 'var(--theme-direction-c-border)', bg: 'var(--theme-direction-c-ring)', text: 'var(--theme-direction-c-text)', label: 'ORBIT' };
      return { border: 'var(--theme-text-muted)', bg: 'var(--theme-control-bg)', text: 'var(--theme-text-secondary)', label: 'DATA' };
    },
    [theme]
  );

  return (
    <>
      {/* Layers Header */}
      <div className="flex items-center justify-between">
        <span className="text-micro uppercase font-bold tracking-wider text-[var(--theme-text-muted)]">
          Layers ({dataLayers.length})
        </span>

        <button
          onClick={() => setIsCatalogOpen(!isCatalogOpen)}
          title={isCatalogOpen ? 'Close Catalog Sheet' : 'Open Data Layer Catalog'}
          className={`text-nano font-semibold px-2.5 py-1 rounded-[2px] border transition-all flex items-center gap-1.5 cursor-pointer ${
            isCatalogOpen
              ? 'bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] border-[var(--theme-control-active-border)] shadow-md font-semibold'
              : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-primary)] hover:border-[var(--theme-card-border-hover)]'
          }`}
        >
          {isCatalogOpen ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          )}
          <span>{isCatalogOpen ? 'Close Catalog' : '+ Catalog'}</span>
        </button>
      </div>

      {/* Active Layers Stack */}
      <div className="space-y-2">
        {dataLayers && dataLayers.length > 0 ? (
          (() => {
            const isRasterLayer = (l: DataLayerItem) =>
              !!(l.renderStyle || l.category === 'topo' || l.category === 'ocean' || l.category === 'satellite' || l.category === 'night');
            const activeRasterId = dataLayers.find((l) => l.visible && isRasterLayer(l))?.id;

            return dataLayers.map((layer) => {
              const preset = getPresetById(layer.id);
              const legend = preset?.legend;
              const isExpanded = expandedLayerId === layer.id;
              const isRaster = isRasterLayer(layer);
              const isPrimaryRaster = isRaster && layer.id === activeRasterId && layer.visible;
              const isShadowedRaster = isRaster && layer.visible && !isPrimaryRaster;

              const stratum = getStratumBadge(preset?.category || layer.category);

              return (
                <div
                  key={layer.id}
                  className={`rounded-[2px] border flex flex-col text-micro transition-all folio-strip ${
                    layer.visible
                      ? 'bg-[var(--theme-card-bg)] border-[var(--theme-card-border)] text-[var(--theme-text-primary)] shadow-sm'
                      : 'bg-[var(--theme-card-bg)]/50 border-[var(--theme-card-border)]/60 text-[var(--theme-text-muted)] opacity-60'
                  }`}
                  style={
                    layer.visible
                      ? { borderLeftWidth: '3px', borderLeftColor: stratum.border }
                      : undefined
                  }
                >
                  <div className="min-h-[34px] px-2 py-1.5 flex items-start justify-between gap-1.5 select-none">
                    <div className="flex items-start gap-1.5 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => setExpandedLayerId(isExpanded ? null : layer.id)}
                        className="cursor-pointer p-0.5 pt-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-transform rounded-[1px]"
                        title={isExpanded ? 'Collapse parameters' : 'Expand parameters'}
                        aria-expanded={isExpanded}
                      >
                        <svg
                          className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="text-nano font-mono font-bold px-1 py-px rounded-[1px] border shrink-0 uppercase tracking-wider select-none"
                            style={{
                              borderColor: stratum.border,
                              backgroundColor: stratum.bg,
                              color: stratum.text,
                            }}
                            title={`Stratum Category: ${preset?.category || layer.category || 'data'}`}
                          >
                            {stratum.label}
                          </span>

                          <span
                            className="leading-tight truncate text-nano font-bold cursor-pointer hover:text-[var(--theme-text-accent)] min-w-0 flex-1"
                            title={layer.name}
                            onClick={() => setExpandedLayerId(isExpanded ? null : layer.id)}
                          >
                            {layer.name}
                          </span>

                          {legend?.colorStops && legend.colorStops.length > 0 && (
                            <div
                              className="h-1.5 w-6 rounded-[1px] border border-black/20 shadow-2xs shrink-0 opacity-90 hover:opacity-100 transition-opacity ml-auto"
                              style={{
                                background: `linear-gradient(to right, ${legend.colorStops.join(', ')})`,
                              }}
                              title={`Pigment Preview: ${legend.minLabel || ''} → ${legend.maxLabel || ''} (${legend.unit || ''})`}
                            />
                          )}
                        </div>

                        {(isPrimaryRaster || isShadowedRaster || preset?.unsupported) && (
                          <div className="flex items-center gap-1.5 pl-0.5">
                            {isPrimaryRaster && (
                              <span
                                className="text-nano font-mono px-1.5 py-0.5 rounded-[2px] font-semibold bg-[var(--theme-status-sage)]/15 text-[var(--theme-status-sage)]"
                                title="Active Base Raster rendered on planetary crust"
                              >
                                (Active Raster)
                              </span>
                            )}
                            {isShadowedRaster && (
                              <span
                                className="text-nano font-mono px-1.5 py-0.5 rounded-[2px] font-medium bg-[var(--theme-status-amber)]/15 text-[var(--theme-status-amber)]"
                                title="This raster dataset is occluded by a higher active raster layer in the Z-order stack"
                              >
                                (Shadowed by higher raster layer)
                              </span>
                            )}
                            {preset?.unsupported && (
                              <span className="text-nano font-mono px-1.5 py-0.5 rounded-[2px] bg-[var(--theme-status-amber)]/15 text-[var(--theme-status-amber)] font-semibold">
                                [UNSUPPORTED]
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 pt-0.5">
                      <button
                        onClick={() => onToggleDataLayer?.(layer.id)}
                        title={layer.visible ? 'Hide layer' : 'Show layer'}
                        className={`p-1 rounded-[2px] border transition-all cursor-pointer ${
                          layer.visible
                            ? 'border-[var(--theme-control-active-border)] bg-[var(--theme-control-active-bg)] text-[var(--theme-control-active-text)] shadow-sm hover:border-[var(--theme-card-border-hover)]'
                            : 'border-[var(--theme-control-border)] bg-[var(--theme-control-bg)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] hover:border-[var(--theme-card-border-hover)]'
                        }`}
                      >
                        {layer.visible ? (
                          <svg className="w-3.5 h-3.5 text-[var(--theme-control-active-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.025 10.025 0 0111.122 1.937C20.268 9.057 16.478 12 12 12c-1.18 0-2.304-.2-3.344-.563M3 3l18 18" />
                          </svg>
                        )}
                      </button>

                      <button
                        onClick={() => onRemoveDataLayer?.(layer.id)}
                        title="Remove layer"
                        className="p-1 rounded-[2px] border transition-all cursor-pointer hover:border-[var(--theme-card-border-hover)] border-[var(--theme-status-amber)]/40 text-[var(--theme-status-amber)] hover:bg-[var(--theme-status-amber)]/15"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div
                    className={`transition-all duration-150 ease-out overflow-hidden ${
                      isExpanded
                        ? 'max-h-[600px] opacity-100 mt-1 border-t border-[var(--theme-panel-header-border)] p-2.5 pt-0 space-y-2 pointer-events-auto'
                        : 'max-h-0 opacity-0 border-t-0 p-0 m-0 pointer-events-none'
                    }`}
                    style={{ transitionTimingFunction: 'var(--theme-spring-switch, cubic-bezier(0.34, 1.35, 0.64, 1))' }}
                  >
                    <div className="flex items-center gap-1.5 text-nano pt-1.5">
                      <span className="text-[var(--theme-text-primary)] font-bold text-nano uppercase tracking-wider">Opacity:</span>
                      <input
                        id={`sidebar-opacity-${layer.id}`}
                        name={`opacity-${layer.id}`}
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={layer.opacity ?? 0.85}
                        aria-label="Layer Opacity"
                        title="Opacity (Double-click to reset: 85%)"
                        onDoubleClick={() => onOpacityChangeDataLayer?.(layer.id, 0.85)}
                        onChange={(e) => onOpacityChangeDataLayer?.(layer.id, parseFloat(e.target.value))}
                        className="flex-1 slider-archival cursor-pointer h-1 rounded-[1px]"
                      />
                      <span
                        className="w-8 text-right font-semibold tabular-nums text-[var(--theme-text-primary)] cursor-pointer select-none"
                        title="Double-click to reset: 85%"
                        onDoubleClick={() => onOpacityChangeDataLayer?.(layer.id, 0.85)}
                      >
                        {Math.round((layer.opacity ?? 0.85) * 100)}%
                      </span>
                    </div>

                    {(layer.renderStyle === 'architectural' || layer.id === 'architectural-topo-relief') && (
                      <div className="pt-1.5 border-t border-[var(--theme-panel-header-border)] space-y-1 text-micro">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[var(--theme-text-primary)] font-bold text-nano uppercase tracking-wider">
                            AO:
                          </span>
                          <input
                            id={`sidebar-layer-ao-${layer.id}`}
                            name={`layerAo-${layer.id}`}
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={layer.ambientOcclusion ?? 0.65}
                            aria-label="Ambient Occlusion"
                            title="Ambient Occlusion (Double-click to reset: 65%)"
                            onDoubleClick={() =>
                              onAmbientOcclusionChangeDataLayer?.(layer.id, 0.65)
                            }
                            onChange={(e) =>
                              onAmbientOcclusionChangeDataLayer?.(layer.id, parseFloat(e.target.value))
                            }
                            className="w-full slider-archival cursor-pointer h-1 rounded-[1px]"
                          />
                          <span
                            className="w-8 text-right font-semibold text-[var(--theme-text-primary)] tabular-nums cursor-pointer select-none"
                            title="Double-click to reset: 65%"
                            onDoubleClick={() =>
                              onAmbientOcclusionChangeDataLayer?.(layer.id, 0.65)
                            }
                          >
                            {Math.round((layer.ambientOcclusion ?? 0.65) * 100)}%
                          </span>
                        </div>
                      </div>
                    )}

                    {legend && (
                      <div className="space-y-1 pt-1 border-t border-[var(--theme-panel-header-border)]">
                        <div className="flex items-center justify-between text-nano text-[var(--theme-text-muted)] font-bold">
                          <span>{legend.minLabel}</span>
                          <span className="uppercase tracking-wider text-[var(--theme-text-accent)] font-semibold">{legend.unit}</span>
                          <span>{legend.maxLabel}</span>
                        </div>
                        <div
                          className="h-1.5 rounded-full w-full border border-[var(--theme-card-border)] shadow-inner"
                          style={{
                            background: `linear-gradient(to right, ${legend.colorStops.join(', ')})`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            });
          })()
        ) : (
          <div className="p-4 rounded-[2px] border text-micro text-center italic border-[var(--theme-card-border)] text-[var(--theme-text-muted)] bg-[var(--theme-card-bg)]/40">
            No active layers. Use + Catalog to add datasets.
          </div>
        )}
      </div>

      {/* Archival Footer Colophon */}
      <CuratorsColophon
        theme={theme}
        isWeatherActive={Boolean(propShowClouds || isNoaaActive)}
        isRadarActive={isRadarActive}
      />
    </>
  );
};
