// ============================================================================
// File: src/components/hud/DataLayersDrawer.tsx
// Modular Floating Widget C: Bottom-Right Sliding Data Layers Drawer & Sheet
// ============================================================================

import React, { useState } from 'react';
import { DATA_LAYER_CATALOG, DataLayerPreset, BlendModeType, getPresetById } from '../../core/data/DataLayerCatalog';

export interface DataLayerItem {
  id: string;
  name: string;
  category?: string;
  type: string;
  details: string;
  visible: boolean;
  opacity?: number;
  blendMode?: BlendModeType;
  displacementScale?: number;
  elevationEncoding?: 'luminance' | 'mapbox' | 'terrarium';
  sunAzimuth?: number;
  sunAltitude?: number;
  hillshadeIntensity?: number;
  url?: string;
  renderStyle?: 'architectural' | 'hybrid' | 'photoreal';
  seaLevelOffset?: number;
  waterClarity?: number;
  peakExponent?: number;
  ambientOcclusion?: number;
}

export interface DataLayersDrawerProps {
  isZenMode: boolean;
  theme: 0 | 1;
  dataLayers?: DataLayerItem[];
  onAddDataLayer?: (layer: DataLayerItem) => void;
  onToggleDataLayer?: (id: string) => void;
  onRemoveDataLayer?: (id: string) => void;
  onOpacityChangeDataLayer?: (id: string, opacity: number) => void;
  onBlendModeChangeDataLayer?: (id: string, blendMode: BlendModeType) => void;
  onDisplacementScaleChangeDataLayer?: (id: string, scale: number) => void;
  onHillshadeChangeDataLayer?: (id: string, azimuth: number, intensity: number) => void;
  onSeaLevelOffsetChangeDataLayer?: (id: string, offset: number) => void;
  onWaterClarityChangeDataLayer?: (id: string, clarity: number) => void;
  onPeakExponentChangeDataLayer?: (id: string, exponent: number) => void;
  onAmbientOcclusionChangeDataLayer?: (id: string, ao: number) => void;
  onReorderDataLayer?: (id: string, direction: 'up' | 'down') => void;
}

export const DataLayersDrawer: React.FC<DataLayersDrawerProps> = ({
  isZenMode,
  theme,
  dataLayers = [],
  onAddDataLayer,
  onToggleDataLayer,
  onRemoveDataLayer,
  onOpacityChangeDataLayer,
  onBlendModeChangeDataLayer,
  onDisplacementScaleChangeDataLayer,
  onHillshadeChangeDataLayer,
  onSeaLevelOffsetChangeDataLayer,
  onWaterClarityChangeDataLayer,
  onPeakExponentChangeDataLayer,
  onAmbientOcclusionChangeDataLayer,
  onReorderDataLayer,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const isLight = theme === 1;

  if (isZenMode) return null;

  return (
    <div className="fixed bottom-24 right-4 z-20 pointer-events-auto max-w-sm w-96 font-mono select-none transition-all duration-300 ease-out">
      <div
        className={`rounded-2xl border backdrop-blur-xl shadow-2xl p-4 text-xs transition-all duration-300 ${
          isLight
            ? 'bg-white/90 border-zinc-200/80 text-zinc-800 shadow-zinc-200/50'
            : 'bg-[#0F121A]/90 border-white/10 text-zinc-300 shadow-black/60'
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
          <div className="flex items-center gap-2 font-bold">
            <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0l-7 7m7-7l-7-7" />
            </svg>
            <span className="text-[11px] tracking-wider uppercase">Data Layers ({dataLayers.length})</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsCatalogOpen(true)}
              className={`text-[9px] font-bold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 ${
                isLight
                  ? 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100'
                  : 'border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25'
              }`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>+ Catalog</span>
            </button>
            <button
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${
                isLight ? 'border-zinc-300 text-zinc-600' : 'border-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              {isDrawerOpen ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>

        {/* Drawer Active Stack */}
        {isDrawerOpen && (
          <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-0.5">
            {dataLayers && dataLayers.length > 0 ? (
              dataLayers.map((layer, idx) => {
                const preset = getPresetById(layer.id);
                const legend = preset?.legend;
                const isFirst = idx === 0;
                const isLast = idx === dataLayers.length - 1;

                return (
                  <div
                    key={layer.id}
                    className={`p-2.5 rounded-xl border flex flex-col gap-2 text-[10px] transition-all ${
                      isLight
                        ? 'bg-zinc-50 border-zinc-200 text-zinc-800'
                        : 'bg-white/[0.04] border-white/10 text-zinc-200'
                    }`}
                  >
                    {/* Layer Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold truncate max-w-[190px]">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${layer.visible ? 'bg-sky-400 animate-pulse' : 'bg-zinc-500'}`}></span>
                        <span className="truncate">{layer.name}</span>
                        <span className="text-[8px] font-mono opacity-60 flex-shrink-0">Z:{dataLayers.length - idx}</span>
                      </div>
                      {/* Unified Right-Side Control Cluster */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          disabled={isFirst}
                          onClick={() => onReorderDataLayer?.(layer.id, 'up')}
                          title="Move Layer Up in Z-Order"
                          className={`p-1 rounded-lg border transition-all ${
                            isFirst
                              ? 'opacity-30 cursor-not-allowed border-white/5 text-zinc-600'
                              : 'border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          disabled={isLast}
                          onClick={() => onReorderDataLayer?.(layer.id, 'down')}
                          title="Move Layer Down in Z-Order"
                          className={`p-1 rounded-lg border transition-all ${
                            isLast
                              ? 'opacity-30 cursor-not-allowed border-white/5 text-zinc-600'
                              : 'border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => onToggleDataLayer?.(layer.id)}
                          className={`p-1 rounded-lg border transition-all ${
                            layer.visible
                              ? isLight
                                ? 'border-sky-300 bg-sky-100 text-sky-800'
                                : 'border-sky-500/40 bg-sky-500/25 text-sky-200'
                              : 'border-white/10 text-zinc-500'
                          }`}
                        >
                          {layer.visible ? (
                            <svg className="w-3 h-3 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.025 10.025 0 0111.122 1.937C20.268 9.057 16.478 12 12 12c-1.18 0-2.304-.2-3.344-.563M3 3l18 18" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => onRemoveDataLayer?.(layer.id)}
                          className="p-1 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 transition-all"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Opacity & Blend Mode Controls */}
                    <div className="grid grid-cols-2 gap-2 text-[9px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-500 font-bold">Opacity:</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={layer.opacity ?? 0.85}
                          onChange={(e) => onOpacityChangeDataLayer?.(layer.id, parseFloat(e.target.value))}
                          className="w-full accent-sky-400 cursor-pointer h-1 rounded"
                        />
                        <span className="w-7 text-right font-bold">{Math.round((layer.opacity ?? 0.85) * 100)}%</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-zinc-500 font-bold">Blend:</span>
                        <select
                          value={layer.blendMode ?? preset?.defaultBlendMode ?? 0}
                          onChange={(e) => onBlendModeChangeDataLayer?.(layer.id, parseInt(e.target.value) as BlendModeType)}
                          className={`w-full py-0.5 px-1 rounded text-[9px] font-bold border ${
                            isLight ? 'bg-white border-zinc-300 text-zinc-800' : 'bg-black/40 border-white/20 text-zinc-200'
                          }`}
                        >
                          <option value={0}>Normal</option>
                          <option value={1}>Additive</option>
                          <option value={2}>Multiply</option>
                          <option value={3}>Screen</option>
                        </select>
                      </div>
                    </div>

                    {/* Terrain 3D Relief & Sun Azimuth Controls for Topo/Raster/Ocean Layers */}
                    {(layer.category === 'topo' || layer.category === 'satellite' || layer.category === 'ocean' || !!layer.renderStyle || !!layer.elevationEncoding) && (
                      <div className="space-y-1.5 pt-1.5 border-t border-white/5 text-[9px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-400 font-bold text-[8px] uppercase tracking-wider">3D Relief:</span>
                          <input
                            type="range"
                            min="0"
                            max="0.30"
                            step="0.01"
                            value={layer.displacementScale ?? preset?.defaultDisplacementScale ?? 0.08}
                            onChange={(e) => onDisplacementScaleChangeDataLayer?.(layer.id, parseFloat(e.target.value))}
                            className="w-full accent-emerald-400 cursor-pointer h-1 rounded"
                          />
                          <span className="w-8 text-right font-bold text-emerald-300">{(layer.displacementScale ?? preset?.defaultDisplacementScale ?? 0.08).toFixed(2)}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-amber-400 font-bold text-[8px] uppercase tracking-wider">Sun Azimuth:</span>
                          <input
                            type="range"
                            min="0"
                            max="360"
                            step="5"
                            value={layer.sunAzimuth ?? 315}
                            onChange={(e) => onHillshadeChangeDataLayer?.(layer.id, parseFloat(e.target.value), layer.hillshadeIntensity ?? 0.65)}
                            className="w-full accent-amber-400 cursor-pointer h-1 rounded"
                          />
                          <span className="w-8 text-right font-bold text-amber-300">{Math.round(layer.sunAzimuth ?? 315)}°</span>
                        </div>

                        {/* Direction A: Valley Crevice Ambient Occlusion & Antialiased Contours */}
                        {(layer.renderStyle === 'architectural' || layer.id === 'architectural-topo-relief') && (
                          <div className="pt-1 border-t border-white/5 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-zinc-400 font-bold text-[8px] uppercase tracking-wider">Crevice AO:</span>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={layer.ambientOcclusion ?? 0.65}
                                onChange={(e) => onAmbientOcclusionChangeDataLayer?.(layer.id, parseFloat(e.target.value))}
                                className="w-full accent-zinc-400 cursor-pointer h-1 rounded"
                              />
                              <span className="w-8 text-right font-bold text-zinc-300">{Math.round((layer.ambientOcclusion ?? 0.65) * 100)}%</span>
                            </div>
                            <div className="flex items-center justify-between text-[8px] text-emerald-400 font-mono">
                              <span>Contour Filter:</span>
                              <span className="font-bold">fwidth() Anti-Aliased</span>
                            </div>
                          </div>
                        )}

                        {/* Direction B: Hydrosphere Depth, Sea Level, Clarity & Peak Exaggeration */}
                        {(layer.renderStyle === 'hybrid' || layer.id === 'hybrid-crust-hydrosphere') && (
                          <div className="pt-1 border-t border-white/5 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-cyan-400 font-bold text-[8px] uppercase tracking-wider">Sea Level:</span>
                              <input
                                type="range"
                                min="-150"
                                max="100"
                                step="5"
                                value={layer.seaLevelOffset ?? 0}
                                onChange={(e) => onSeaLevelOffsetChangeDataLayer?.(layer.id, parseFloat(e.target.value))}
                                className="w-full accent-cyan-400 cursor-pointer h-1 rounded"
                              />
                              <span className="w-8 text-right font-bold text-cyan-300">
                                {(layer.seaLevelOffset ?? 0) > 0 ? `+${layer.seaLevelOffset}m` : `${layer.seaLevelOffset ?? 0}m`}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="text-sky-400 font-bold text-[8px] uppercase tracking-wider">Clarity:</span>
                              <input
                                type="range"
                                min="0.10"
                                max="1.00"
                                step="0.05"
                                value={layer.waterClarity ?? 0.75}
                                onChange={(e) => onWaterClarityChangeDataLayer?.(layer.id, parseFloat(e.target.value))}
                                className="w-full accent-sky-400 cursor-pointer h-1 rounded"
                              />
                              <span className="w-8 text-right font-bold text-sky-300">{Math.round((layer.waterClarity ?? 0.75) * 100)}%</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="text-amber-400 font-bold text-[8px] uppercase tracking-wider">Peak Sharp:</span>
                              <input
                                type="range"
                                min="1.0"
                                max="2.0"
                                step="0.1"
                                value={layer.peakExponent ?? 1.4}
                                onChange={(e) => onPeakExponentChangeDataLayer?.(layer.id, parseFloat(e.target.value))}
                                className="w-full accent-amber-400 cursor-pointer h-1 rounded"
                              />
                              <span className="w-8 text-right font-bold text-amber-300">{(layer.peakExponent ?? 1.4).toFixed(1)}x</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Cartographic Legend Bar */}
                    {legend && (
                      <div className="space-y-1 pt-1 border-t border-white/5">
                        <div className="flex items-center justify-between text-[8px] text-zinc-400 font-bold">
                          <span>{legend.minLabel}</span>
                          <span className="text-sky-300 uppercase tracking-wider">{legend.unit}</span>
                          <span>{legend.maxLabel}</span>
                        </div>
                        <div
                          className="h-1.5 rounded-full w-full border border-white/10 shadow-inner"
                          style={{
                            background: `linear-gradient(to right, ${legend.colorStops.join(', ')})`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className={`p-3 rounded-xl border text-[10px] text-center italic ${isLight ? 'border-zinc-200 text-zinc-400' : 'border-white/10 text-zinc-500'}`}>
                No active data layers. Click [+ Catalog] to select cartographic datasets.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Catalog Modal */}
      {isCatalogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md pointer-events-auto">
          <div
            className={`max-w-md w-full rounded-2xl border p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col font-mono ${
              isLight ? 'bg-white text-zinc-900 border-zinc-300' : 'bg-[#0F121A] text-zinc-100 border-white/20'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-white/10">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
                <h3 className="text-xs font-bold uppercase tracking-wider">Cartographic Data Catalog</h3>
              </div>
              <button
                onClick={() => setIsCatalogOpen(false)}
                className="p-1 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto space-y-2.5 pr-1 flex-1">
              {DATA_LAYER_CATALOG.map((preset) => {
                const isAlreadyAdded = dataLayers.some((l) => l.id === preset.id);
                return (
                  <div
                    key={preset.id}
                    className={`p-3 rounded-xl border transition-all flex flex-col gap-1.5 ${
                      isLight
                        ? 'bg-zinc-50 border-zinc-200 hover:border-sky-300'
                        : 'bg-white/[0.03] border-white/10 hover:border-sky-500/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">{preset.name}</span>
                      <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                        {preset.category}
                      </span>
                    </div>
                    <p className={`text-[10px] ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                      {preset.details}
                    </p>
                    <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[9px]">
                      <span className="text-zinc-500 truncate max-w-[220px]">{preset.attribution}</span>
                      <button
                        disabled={isAlreadyAdded}
                        onClick={() => {
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
                              renderStyle: preset.renderStyle,
                              url: preset.url,
                            });
                          }
                          setIsCatalogOpen(false);
                        }}
                        className={`px-3 py-1 rounded-lg text-[9px] font-bold border transition-all flex items-center gap-1 ${
                          isAlreadyAdded
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 cursor-default'
                            : 'bg-sky-500/20 text-sky-200 border-sky-500/40 hover:bg-sky-500/30'
                        }`}
                      >
                        {isAlreadyAdded ? (
                          <>
                            <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Added</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            <span>Add Layer</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
