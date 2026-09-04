// ============================================================================
// File: src/core/layers/useGlobeLayerManager.ts
// Architecture: React State & GlobeLayerManager Synchronization Hook
// Description: Unifies UI layer state mutations, z-index ordering, and toast feedback
// ============================================================================

import { useState, useRef, useCallback, useEffect } from 'react';
import { GlobeLayerManager } from './GlobeLayerManager';
import { DataLayerItem } from '../../components/hud/DataLayersDrawer';
import { ToastMessage } from '../../components/hud/DataLayerToastNotification';
import { BlendModeType, getPresetById, DataLayerRenderStyle } from '../data/DataLayerCatalog';
import { BaseGlobeOverlayLayer, VectorOverlayPluginLayer, GeodesicOverlayPluginLayer } from '../_deferred/adapters/GlobeOverlayAdapters';

export function useGlobeLayerManager(initialLayers?: DataLayerItem[]) {
  const managerRef = useRef<GlobeLayerManager>(new GlobeLayerManager());

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [dataLayers, setDataLayers] = useState<DataLayerItem[]>(
    initialLayers || [
      {
        id: 'architectural-topo-relief',
        name: 'Architectural Topographic Relief',
        category: 'topo',
        type: 'Monochrome Relief & Isolines',
        details: 'Cartographic Eduard Imhof relief shading, analytical elevation isocontours & bathymetric isobaths matching Theme 0/1',
        visible: true,
        url: '/earth-elevation-dem.webp',
        opacity: 0.95,
        blendMode: 0,
        displacementScale: 0.14,
        renderStyle: 'architectural',
      },
    ]
  );

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Initialize engine default base layers into GlobeLayerManager
  useEffect(() => {
    const manager = managerRef.current;
    manager.addLayer(new BaseGlobeOverlayLayer());
    manager.addLayer(new VectorOverlayPluginLayer());
    manager.addLayer(new GeodesicOverlayPluginLayer());
  }, []);

  const handleAddDataLayer = useCallback(
    (layer: DataLayerItem) => {
      setDataLayers((prev) => {
        if (prev.some((l) => l.id === layer.id)) return prev;
        return [...prev, layer];
      });
      addToast({
        type: 'success',
        title: 'Dataset Layer Added',
        message: `Activated ${layer.name} (${layer.type})`,
      });
    },
    [addToast]
  );

  const handleToggleDataLayer = useCallback(
    (id: string) => {
      managerRef.current.toggleLayerVisibility(id);
      setDataLayers((prev) => {
        const next = prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l));
        const target = next.find((l) => l.id === id);
        if (target) {
          addToast({
            type: 'info',
            title: `Layer ${target.visible ? 'Visible' : 'Hidden'}`,
            message: target.name,
          });
        }
        return next;
      });
    },
    [addToast]
  );

  const handleRemoveDataLayer = useCallback(
    (id: string) => {
      managerRef.current.removeLayer(id);
      setDataLayers((prev) => {
        const target = prev.find((l) => l.id === id);
        if (target) {
          addToast({
            type: 'warning',
            title: 'Layer Removed',
            message: `Removed ${target.name} from active stack`,
          });
        }
        return prev.filter((l) => l.id !== id);
      });
    },
    [addToast]
  );

  const handleOpacityChangeDataLayer = useCallback((id: string, opacity: number) => {
    managerRef.current.setLayerOpacity(id, opacity);
    setDataLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, opacity } : l))
    );
  }, []);

  const handleBlendModeChangeDataLayer = useCallback((id: string, blendMode: BlendModeType) => {
    const modeMap: Record<BlendModeType, 'opaque' | 'additive' | 'multiply' | 'screen'> = {
      0: 'opaque',
      1: 'additive',
      2: 'multiply',
      3: 'screen',
    };
    managerRef.current.setLayerBlendMode(id, modeMap[blendMode] || 'opaque');
    setDataLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, blendMode } : l))
    );
  }, []);

  const handleReorderDataLayer = useCallback(
    (id: string, direction: 'up' | 'down') => {
      setDataLayers((prev) => {
        const index = prev.findIndex((l) => l.id === id);
        if (index === -1) return prev;
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= prev.length) return prev;

        const updated = [...prev];
        const [moved] = updated.splice(index, 1);
        updated.splice(targetIndex, 0, moved);

        // Update z-index order in GlobeLayerManager
        updated.forEach((layer, idx) => {
          const zOrder = (updated.length - idx) * 10;
          managerRef.current.setLayerOrder(layer.id, zOrder);
        });
        managerRef.current.reorder();

        addToast({
          type: 'info',
          title: 'Z-Order Updated',
          message: `Moved ${moved.name} ${direction === 'up' ? 'closer to top' : 'down stack'}`,
        });

        return updated;
      });
    },
    [addToast]
  );

  const handleDisplacementScaleChangeDataLayer = useCallback((id: string, displacementScale: number) => {
    setDataLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, displacementScale } : l))
    );
  }, []);

  const handleHillshadeChangeDataLayer = useCallback((id: string, sunAzimuth: number, hillshadeIntensity: number) => {
    setDataLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, sunAzimuth, hillshadeIntensity } : l))
    );
  }, []);

  const handleSelectRenderStyle = useCallback(
    (style: DataLayerRenderStyle) => {
      const presetId =
        style === 'architectural'
          ? 'architectural-topo-relief'
          : style === 'hybrid'
          ? 'hybrid-crust-hydrosphere'
          : 'nasa-blue-marble';

      const preset = getPresetById(presetId);
      if (!preset) return;

      setDataLayers((prev) => {
        // Keep non-cartographic auxiliary layers if any, replacing cartographic base layers
        const filtered = prev.filter(
          (l) =>
            l.renderStyle !== 'architectural' &&
            l.renderStyle !== 'hybrid' &&
            l.renderStyle !== 'photoreal' &&
            l.id !== presetId
        );

        const newLayer: DataLayerItem = {
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
        };

        return [newLayer, ...filtered];
      });

      addToast({
        type: 'info',
        title: `Direction ${style === 'architectural' ? 'A' : style === 'hybrid' ? 'B' : 'C'} Activated`,
        message: `${preset.name}`,
      });
    },
    [addToast]
  );

  return {
    layerManager: managerRef.current,
    dataLayers,
    toasts,
    addToast,
    dismissToast,
    handleAddDataLayer,
    handleToggleDataLayer,
    handleRemoveDataLayer,
    handleOpacityChangeDataLayer,
    handleBlendModeChangeDataLayer,
    handleDisplacementScaleChangeDataLayer,
    handleHillshadeChangeDataLayer,
    handleReorderDataLayer,
    handleSelectRenderStyle,
  };
}
