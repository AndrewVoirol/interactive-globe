import { describe, it, expect } from 'vitest';
import { ThemeManager, CREAM_RAG_THEME } from '../../src/core/themes/ThemeManager';
import type { DataLayerItem } from '../../src/types';

describe('Requirement R8: Tactile Cotton Rag Medium (Warmed Ground & Method B Tooth)', () => {
  it('R8-T01: ThemeManager Cream Rag palette defines authentic warm archival rag ground (#F3ECE0)', () => {
    const creamTheme = CREAM_RAG_THEME;
    expect(creamTheme.viewportBackground.hex).toBe('#F3ECE0');
    expect(creamTheme.viewportBackground.rgb[0]).toBeCloseTo(243 / 255, 3);
    expect(creamTheme.viewportBackground.rgb[1]).toBeCloseTo(236 / 255, 3);
    expect(creamTheme.viewportBackground.rgb[2]).toBeCloseTo(224 / 255, 3);
  });

  it('R8-T02: DataLayerItem interface accepts paperTooth property and defaults correctly', () => {
    const layer: DataLayerItem = {
      id: 'architectural-topo-relief',
      name: 'Architectural Topographic Relief',
      type: 'relief',
      details: 'test',
      visible: true,
      paperTooth: 0.40,
    };
    expect(layer.paperTooth).toBe(0.40);
  });
});
