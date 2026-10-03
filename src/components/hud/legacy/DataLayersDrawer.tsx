import React, { useState } from 'react';
import { DATA_LAYER_CATALOG, BlendModeType, getPresetById } from '../../../core/data/DataLayerCatalog';
import { TactileSelect } from '../../ui/TactileSelect';
import { isWeatherNextModel } from '../../AtmosphereDrawer';
import type { DataLayerItem } from '../UnifiedRightSidebar';

export interface DataLayersDrawerProps {
  isZenMode: boolean;
  theme: 0 | 1 | 2;
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
  prognosticModel?: string;
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
  prognosticModel,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const isLight = theme === 1;
  const isWnModel = isWeatherNextModel(prognosticModel);

  const noaaLayer = dataLayers.find((l) => l.id === 'noaa-gfs-wind');
  const isNoaaActive = noaaLayer ? noaaLayer.visible : false;

  const starlinkLayer = dataLayers.find((l) => l.id === 'starlink-iss-orbits');
  const isStarlinkActive = starlinkLayer ? starlinkLayer.visible : false;

  const jetstreamLayer = dataLayers.find((l) => l.id === 'noaa-gfs-jetstream');
  const isJetstreamActive = jetstreamLayer ? jetstreamLayer.visible : false;

  const handleTogglePlanetaryLayer = (
    id: 'noaa-gfs-wind' | 'starlink-iss-orbits' | 'noaa-gfs-jetstream'
  ) => {
    const existing = dataLayers.find((l) => l.id === id);
    if (existing) {
      onToggleDataLayer?.(id);
    } else {
      const preset = getPresetById(id);
      if (preset && onAddDataLayer) {
        onAddDataLayer({
          id: preset.id,
          name: preset.name,
          category: preset.category,
          type: preset.type,
          details: preset.details,
          visible: true,
          opacity: preset.defaultOpacity,
          blendMode: preset.defaultBlendMode,
          url: preset.url,
        });
      }
    }
  };

  if (isZenMode) return null;

  return (
    <div className="fixed bottom-24 right-4 z-20 pointer-events-auto max-w-sm w-96 font-mono select-none transition-all duration-300 ease-out">
      <div
        className={`rounded-2xl border backdrop-blur-xl shadow-2xl p-4 text-micro transition-all duration-300 ${
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
            <span className="text-title tracking-wider uppercase">Data Layers ({dataLayers.length})</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsCatalogOpen(true)}
              className={`text-micro font-bold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 ${
                isLight
                  ? 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100'
                  : 'border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25'
              }`}
              title="Add New Layer from Catalog"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>+ Catalog</span>
            </button>

            <button
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              className={`p-1.5 rounded-lg border transition-colors ${
                isLight ? 'bg-zinc-100 border-zinc-300 hover:bg-zinc-200 text-zinc-700' : 'bg-white/5 border-white/10 hover:bg-white/10 text-zinc-300'
              }`}
            >
              <svg className={`w-3.5 h-3.5 transform transition-transform ${isDrawerOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Planetary Instrumentation (Dedicated Live Synced Toggles) */}
        <div className="mt-2.5 pt-2 border-t border-white/10 space-y-1.5">
          <div className="flex items-center justify-between text-micro font-bold uppercase tracking-wider text-zinc-400">
            <span>Planetary Instrumentation</span>
            <span className="flex items-center gap-1 text-nano font-mono text-teal-400">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse"></span>
              Live Synced
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {/* Real NOAA GFS Wind Toggle */}
            <button
              onClick={() => handleTogglePlanetaryLayer('noaa-gfs-wind')}
              className={`p-2 rounded-xl border transition-all text-left flex flex-col justify-between gap-1 ${
                isNoaaActive
                  ? 'border-sky-500/60 bg-sky-500/20 text-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.25)]'
                  : isLight
                  ? 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                  : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-bold text-micro truncate">
                  {isWnModel ? 'Surface Winds' : 'NOAA Wind'}
                </span>
                <span className="flex items-center gap-1 text-nano font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40">
                  {isWnModel ? 'DeepMind AI' : 'Physics Model'}
                </span>
              </div>
              <span className="text-nano text-zinc-400 truncate">
                {isWnModel ? '0.1° (10km) AI Grid' : '0.25° Operational Grid'}
              </span>
            </button>

            {/* Starlink & ISS Orbits Toggle */}
            <button
              onClick={() => handleTogglePlanetaryLayer('starlink-iss-orbits')}
              className={`p-2 rounded-xl border transition-all text-left flex flex-col justify-between gap-1 ${
                isStarlinkActive
                  ? 'border-purple-500/60 bg-purple-500/20 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.25)]'
                  : isLight
                  ? 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                  : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-bold text-micro truncate">Starlink & ISS</span>
                <span className="flex items-center gap-1 text-nano font-bold px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/40 animate-pulse">
                  <span className="w-1 h-1 rounded-full bg-teal-400 animate-ping"></span>
                  Live Synced
                </span>
              </div>
              <span className="text-nano text-zinc-400 truncate">CelesTrak (110 Sats as of 2026)</span>
            </button>

            {/* NOAA GFS 250 hPa Jet Stream Toggle */}
            <button
              onClick={() => handleTogglePlanetaryLayer('noaa-gfs-jetstream')}
              className={`p-2 rounded-xl border transition-all text-left flex flex-col justify-between gap-1 ${
                isJetstreamActive
                  ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-200 shadow-[0_0_10px_rgba(99,102,241,0.25)]'
                  : isLight
                  ? 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                  : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-bold text-micro truncate">Jet Stream</span>
                <span className="flex items-center gap-1 text-nano font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  250 hPa
                </span>
              </div>
              <span className="text-nano text-zinc-400 truncate">High-Altitude Core</span>
            </button>
          </div>
        </div>

        {/* Drawer Active Stack */}
        {isDrawerOpen && (
          <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-0.5">
            {dataLayers && dataLayers.length > 0 ? (
              (() => {
                const isRasterLayer = (l: DataLayerItem) =>
                  !!(l.renderStyle || l.category === 'topo' || l.category === 'ocean' || l.category === 'satellite' || l.category === 'night');
                const activeRasterId = dataLayers.find((l) => l.visible && isRasterLayer(l))?.id;

                return dataLayers.map((layer, idx) => {
                  const preset = getPresetById(layer.id);
                  const legend = preset?.legend;
                  const isFirst = idx === 0;
                  const isLast = idx === dataLayers.length - 1;
                  const isRaster = isRasterLayer(layer);
                  const isPrimaryRaster = isRaster && layer.id === activeRasterId && layer.visible;
                  const isShadowedRaster = isRaster && layer.visible && !isPrimaryRaster;

                  return (
                    <div
                      key={layer.id}
                      className={`p-2.5 rounded-xl border flex flex-col gap-2 text-micro transition-all ${
                        isLight
                          ? 'bg-zinc-50 border-zinc-200 text-zinc-800'
                          : 'bg-white/[0.04] border-white/10 text-zinc-200'
                      }`}
                    >
                      {/* Layer Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 font-bold">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${layer.visible ? 'bg-sky-400 animate-pulse' : 'bg-zinc-500'}`}></span>
                            <span className="text-micro font-bold break-words leading-tight" title={layer.name}>
                              {layer.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 flex-wrap pl-3.5">
                            {isPrimaryRaster && (
                              <span className="text-nano font-mono px-1.5 py-px rounded border bg-teal-500/20 text-teal-300 border-teal-500/40 font-semibold" title="Active Base Raster rendered on planetary crust">
                                (Active Raster)
                              </span>
                            )}
                            {isShadowedRaster && (
                              <span className="text-nano font-mono px-1.5 py-px rounded border bg-[var(--theme-status-amber)]/20 text-[var(--theme-status-amber)] border-[var(--theme-status-amber)]/40" title="This raster dataset is occluded by a higher active raster layer in the Z-order stack">
                                (Shadowed by higher raster layer)
                              </span>
                            )}
                            {preset?.unsupported && (
                              <span className="text-nano font-mono px-1.5 py-px rounded border bg-rose-500/20 text-rose-300 border-rose-500/40">
                                [UNSUPPORTED]
                              </span>
                            )}
                            {layer.id === 'starlink-iss-orbits' && (
                              <span className="flex items-center gap-1 text-nano uppercase tracking-wider font-semibold px-1.5 py-px rounded border bg-teal-500/20 text-teal-400 border-teal-500/40 shadow-[0_0_8px_rgba(20,184,166,0.4)] animate-pulse shrink-0">
                                <span className="w-1 h-1 rounded-full bg-teal-400 animate-ping"></span>
                                Live Synced
                              </span>
                            )}
                            {(layer.id === 'noaa-gfs-wind' || layer.id === 'noaa-grib2-wind') && (
                              <span className="flex items-center gap-1 text-nano uppercase tracking-wider font-semibold px-1.5 py-px rounded border bg-sky-500/20 text-sky-400 border-sky-500/40 shadow-[0_0_8px_rgba(56,189,248,0.4)] shrink-0">
                                Physics Model
                              </span>
                            )}
                            {layer.id === 'noaa-gfs-jetstream' && (
                              <span className="flex items-center gap-1 text-nano uppercase tracking-wider font-semibold px-1.5 py-px rounded border bg-indigo-500/20 text-indigo-400 border-indigo-500/40 shadow-[0_0_8px_rgba(99,102,241,0.4)] shrink-0">
                                250 hPa Core
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onToggleDataLayer?.(layer.id)}
                            className={`p-1 rounded-lg border transition-all ${
                              layer.visible
                                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                : 'bg-white/5 text-zinc-500 border-white/10'
                            }`}
                            title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={layer.visible ? 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' : 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18'} />
                            </svg>
                          </button>

                          <button
                            onClick={() => onRemoveDataLayer?.(layer.id)}
                            className="p-1 rounded-lg border border-white/10 hover:border-rose-500/40 hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400 transition-all"
                            title="Remove Layer"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Controls (Opacity, Reorder) */}
                      {layer.visible && (
                        <div className="space-y-1.5 pt-1 border-t border-white/5">
                          {/* Opacity Slider */}
                          <div className="flex items-center justify-between gap-2 text-nano font-mono">
                            <span className="text-zinc-400">Opacity:</span>
                            <div className="flex items-center gap-2 flex-1 max-w-[140px]">
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={layer.opacity !== undefined ? layer.opacity : 1.0}
                                onChange={(e) => onOpacityChangeDataLayer?.(layer.id, parseFloat(e.target.value))}
                                className="w-full accent-sky-400 h-1 bg-white/10 rounded appearance-none cursor-pointer"
                              />
                              <span className="w-8 text-right text-zinc-300">
                                {Math.round((layer.opacity !== undefined ? layer.opacity : 1.0) * 100)}%
                              </span>
                            </div>
                          </div>

                          {/* Reordering */}
                          <div className="flex items-center justify-between text-nano font-mono pt-1">
                            <span className="text-zinc-500 text-nano">Reorder Depth:</span>
                            <div className="flex items-center gap-1">
                              <button
                                disabled={isFirst}
                                onClick={() => onReorderDataLayer?.(layer.id, 'up')}
                                className={`px-1.5 py-0.5 rounded border text-nano ${
                                  isFirst ? 'opacity-30 border-transparent text-zinc-600' : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
                                }`}
                                title="Bring Forward (Higher Priority)"
                              >
                                ▲ Up
                              </button>
                              <button
                                disabled={isLast}
                                onClick={() => onReorderDataLayer?.(layer.id, 'down')}
                                className={`px-1.5 py-0.5 rounded border text-nano ${
                                  isLast ? 'opacity-30 border-transparent text-zinc-600' : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
                                }`}
                                title="Send Backward (Lower Priority)"
                              >
                                ▼ Down
                              </button>
                            </div>
                          </div>

                          {/* Optional Legend Swatch */}
                          {legend && (
                            <div className="pt-1.5 border-t border-white/5 space-y-1">
                              <div className="flex items-center justify-between text-nano font-mono text-zinc-400">
                                <span>{legend.minLabel}</span>
                                <span className="text-sky-300 uppercase tracking-wider">{legend.unit}</span>
                                <span>{legend.maxLabel}</span>
                              </div>
                              <div
                                className="h-1.5 rounded-full border border-white/10"
                                style={{
                                  background: `linear-gradient(to right, ${legend.colorStops.join(', ')})`,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
              })()
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-white/10 text-center text-zinc-500 text-nano space-y-1">
                <div>No active cartographic layers.</div>
                <div className="text-nano text-zinc-600">Click '+ Catalog' or select a planetary preset above.</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Catalog Slide-out Modal / Sheet */}
      {isCatalogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div
            className={`max-w-2xl w-full max-h-[85vh] rounded-2xl border shadow-2xl flex flex-col font-mono overflow-hidden ${
              isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-[#0F121A] border-white/10 text-zinc-100'
            }`}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0l-7 7m7-7l-7-7" />
                </svg>
                <span className="text-title font-bold tracking-wider uppercase">Cartographic Data Catalog</span>
              </div>
              <button
                onClick={() => setIsCatalogOpen(false)}
                className="p-1 rounded-lg border border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Catalog Presets Grid */}
            <div className="p-4 overflow-y-auto space-y-2.5">
              {DATA_LAYER_CATALOG.map((preset) => {
                const isAlreadyAdded = dataLayers?.some((l) => l.id === preset.id);

                return (
                  <div
                    key={preset.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-4 transition-all ${
                      isLight
                        ? 'bg-zinc-50 border-zinc-200 hover:border-zinc-300'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-micro truncate">{preset.name}</span>
                        <span className="text-nano uppercase font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-400">
                          {preset.category}
                        </span>
                        {preset.id === 'starlink-iss-orbits' && (
                          <span className="flex items-center gap-1 text-nano uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border bg-teal-500/20 text-teal-400 border-teal-500/40 animate-pulse">
                            <span className="w-1 h-1 rounded-full bg-teal-400 animate-ping"></span>
                            Live Synced
                          </span>
                        )}
                        {(preset.id === 'noaa-gfs-wind' || preset.id === 'noaa-grib2-wind') && (
                          <span className="flex items-center gap-1 text-nano uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border bg-sky-500/20 text-sky-400 border-sky-500/40">
                            Physics Model
                          </span>
                        )}
                        {preset.unsupported && (
                          <span className="text-nano font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            Unsupported
                          </span>
                        )}
                      </div>
                      <div className="text-nano text-zinc-400 line-clamp-2">{preset.details}</div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        disabled={isAlreadyAdded || preset.unsupported}
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
                        className={`px-3 py-1 rounded-lg text-nano font-bold border transition-all flex items-center gap-1 ${
                          preset.unsupported
                            ? 'opacity-40 cursor-not-allowed bg-zinc-800 text-zinc-400 border-zinc-700'
                            : isAlreadyAdded
                            ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 cursor-default'
                            : 'bg-sky-500/20 text-sky-200 border-sky-500/40 hover:bg-sky-500/30'
                        }`}
                      >
                        {preset.unsupported ? (
                          <span>Unsupported</span>
                        ) : isAlreadyAdded ? (
                          <>
                            <svg className="w-3 h-3 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
