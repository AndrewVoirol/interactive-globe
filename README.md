# Interactive Globe

![Demo](screenshots/demo.gif)

> **Part of the [Cartography Featured Project](https://andrewvoirol.com/work/cartography) on [andrewvoirol.com](https://andrewvoirol.com) • [Live Interactive Lab](https://andrewvoirol.com/lab/dot-matrix)**

A continuous projection morphing laboratory transitioning between a 3D rotating globe and a 2D flat map on HTML5 Canvas 2D — featuring dual Vector and Poisson Dot-Matrix rendering pipelines.

Drag to rotate, scroll to zoom, scrub the continuous morph slider or click the 1-click toggle to unfurl the globe into an equirectangular projection. Back-face features emerge dynamically from the Pythagorean limb ($\sqrt{R^2 - y^2}$) with an adaptive Lamé superellipse boundary envelope ($n: 2 \to 32$).

![Globe View](screenshots/globe-view.png)
![Map View](screenshots/map-view.png)

## Quick Start

```bash
git clone https://github.com/AndrewVoirol/interactive-globe.git
cd interactive-globe
npm install
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000). Requires Node.js 18+.

## How It Works

**Use it:** Drag the globe to spin it. Scroll to zoom. Scrub the bottom slider from 0% to 100% or click the Unfurl/Collapse button to morph between Orthographic 3D and Equirectangular 2D. Toggle between sharp Vector landmasses and Poisson-disc Dot Matrix point sampling.

The app uses two D3 projections — `geoOrthographic` (globe) and `geoEquirectangular` (flat map) — unified through a custom mathematical stream interpolator:
- **Front-face points** interpolate directly: $p(t) = (1 - t) p_0 + t p_1$.
- **Back-face points** depart the Pythagorean limb ($x_{\text{start}} = c_x \pm \sqrt{R^2 - y^2}$), creating a fluid geometric unfurling motion without mesh tearing.
- **Poisson disc buffers** dynamically shade front/back nodes using 3D spherical unit normals and depth attenuation.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 |
| Visualization | D3.js v7 (`d3-geo`, `d3-transition`) |
| Geo Data | TopoJSON (world-atlas 50m) |
| Rendering | HTML5 Canvas 2D (Retina HiDPI) |
| Styling | Tailwind CSS 3 |
| Build | Vite 6 |
| Language | TypeScript |

