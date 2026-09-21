# CDLOD Crosshatch & Seam Translucency Investigation Archive

This visual archive documents the systematic isolation and resolution of the crosshatch and straight-edged swath artifact across the Indicatrix Engine's WebGPU rendering pipeline.

## 1. Initial State
- `01-initial-artifact-swaths.webp`: Full shader execution showing straight-line diagonal, horizontal, and vertical swaths cutting across land and oceans.

## 2. Isolated Cartographic Strata (via Shader Early Returns)
- `02-stratum-swiss-relief-diffuse.webp`: Pure Eduard Imhof multi-light hillshading (`diffuseTotal`) with screen-space DEM gradient derivatives. Completely clean of artifacts.
- `03-stratum-hypsometric-ramp.webp`: Pure continuous elevation hypsometric color ramp (`cRamp`) spanning −10,924m to +8,848m. Completely clean of artifacts.
- `04-stratum-terrestrial-crust-contours.webp`: Pure terrestrial geomorphology (`finalLand`) with analytical elevation contours and Moiré-guard suppression. Completely clean of artifacts.
- `05-stratum-oceanic-bathymetry.webp`: Pure oceanic bathymetry (`cBathy`) with Beer-Lambert absorption and 200m/1,000m isobaths. Completely clean of artifacts.
- `06-stratum-combined-crust-clean.webp`: Full combined lithosphere and hydrosphere crust (`finalCrust`) returned before alpha output. Completely clean of artifacts.

## 3. Mathematical Proof & Isolation
- `07-mathematical-diff-tile-boundaries.png`: Differential pixel image between isolated base crust (`06`) and full shader (`01`). Every single swath lights up in vivid relief along exact CDLOD quadtree tile boundaries and overlap margins caused by `finalAlpha = 0.95` translucency.
- `08-mathematical-diff-post-fix-clean.png`: Differential pixel image between isolated base crust and full shader after setting `return vec4<f32>(finalCrust, 1.0)`. Delta is exactly zero across all swath areas.

## 4. Multi-Medium & Multi-Angle Verification
- `09-verified-cream-rag-africa-atlantic.webp`: Theme 1 (Cream Rag / Swiss Relief) default Atlantic/Africa orientation.
- `10-verified-marie-tharp-physiographic.webp`: Theme 0 (Marie Tharp Physiographic Chart) Indian Ocean basin.
- `11-verified-prussian-cyanotype.webp`: Theme 2 (Prussian Cyanotype / 1842 Blueprint) with cold blue-white linework.
- `12-verified-pacific-ocean-ring-of-fire.webp`: Theme 1 rotated to the Pacific Ocean (169°W), showing Mariana Trench and mid-ocean ridges.
- `13-verified-himalayas-asia.webp`: Theme 1 rotated to Asia/Indian Ocean (084°E), showing the Himalayas, Tibetan Plateau, and Bay of Bengal.
