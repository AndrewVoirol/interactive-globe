// ============================================================================
// File: src/core/standards/CRSTranslationEngine.ts
// Architecture: Geospatial Standards Engine (PROJ.4 / EPSG Projection Engine)
// Description: PROJ.4 forward & inverse CRS transforms (EPSG:4326, 3857, 2154, 5070, 9820)
// ============================================================================

export type SupportedCRS = 'EPSG:4326' | 'EPSG:3857' | 'EPSG:2154' | 'EPSG:5070' | 'EPSG:9820';

export interface CRSPoint2D {
  x: number;
  y: number;
}

export interface GeographicPoint {
  lon: number; // degrees [-180, 180]
  lat: number; // degrees [-90, 90]
}

export interface DistortionMetrics {
  meridionalScale: number; // h
  parallelScale: number;   // k
  arealDilation: number;   // s = h * k
  angularDistortion: number; // 2 * Omega (degrees)
}

export class CRSTranslationEngine {
  private radius: number;

  constructor(radius: number = 5.0) {
    this.radius = radius;
  }

  /**
   * Forward Projection: Converts WGS84 Geographic (lon, lat) to target CRS (x, y)
   */
  public forward(geo: GeographicPoint, crs: SupportedCRS, origin: GeographicPoint = { lon: 0, lat: 0 }): CRSPoint2D {
    const R = this.radius;
    const radLon = (geo.lon * Math.PI) / 180.0;
    const radLat = (geo.lat * Math.PI) / 180.0;
    const radLon0 = (origin.lon * Math.PI) / 180.0;
    const radLat0 = (origin.lat * Math.PI) / 180.0;

    switch (crs) {
      case 'EPSG:4326': {
        // WGS84 Geographic Equirectangular
        return {
          x: R * radLon,
          y: R * radLat,
        };
      }

      case 'EPSG:3857': {
        // Web Mercator
        const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, geo.lat));
        const cRadLat = (clampedLat * Math.PI) / 180.0;
        return {
          x: R * radLon,
          y: R * Math.log(Math.tan(Math.PI / 4.0 + cRadLat / 2.0)),
        };
      }

      case 'EPSG:2154': {
        // Lambert Conformal Conic (France RGF93 parameters: phi1=44, phi2=49, phi0=46.5, lon0=3)
        const phi1 = (44.0 * Math.PI) / 180.0;
        const phi2 = (49.0 * Math.PI) / 180.0;
        const phi0 = (46.5 * Math.PI) / 180.0;
        const lon0 = (3.0 * Math.PI) / 180.0;

        const n = Math.sin(phi0);
        const m1 = Math.cos(phi1);
        const t1 = Math.tan(Math.PI / 4.0 - phi1 / 2.0);
        const F = m1 / (n * Math.pow(t1, n));

        const t = Math.tan(Math.PI / 4.0 - radLat / 2.0);
        const r = R * F * Math.pow(Math.max(1e-7, t), n);

        const t0 = Math.tan(Math.PI / 4.0 - phi0 / 2.0);
        const r0 = R * F * Math.pow(t0, n);

        const theta = n * (radLon - lon0);

        return {
          x: r * Math.sin(theta),
          y: r0 - r * Math.cos(theta),
        };
      }

      case 'EPSG:5070': {
        // Albers Equal Area Conic (CONUS parameters: phi1=29.5, phi2=45.5, phi0=23, lon0=-96)
        const phi1 = (29.5 * Math.PI) / 180.0;
        const phi2 = (45.5 * Math.PI) / 180.0;
        const phi0 = (23.0 * Math.PI) / 180.0;
        const lon0 = (-96.0 * Math.PI) / 180.0;

        const n = 0.5 * (Math.sin(phi1) + Math.sin(phi2));
        const C = Math.cos(phi1) * Math.cos(phi1) + 2.0 * n * Math.sin(phi1);

        const rho = (R / n) * Math.sqrt(Math.max(0, C - 2.0 * n * Math.sin(radLat)));
        const rho0 = (R / n) * Math.sqrt(Math.max(0, C - 2.0 * n * Math.sin(phi0)));

        const theta = n * (radLon - lon0);

        return {
          x: rho * Math.sin(theta),
          y: rho0 - rho * Math.cos(theta),
        };
      }

      case 'EPSG:9820': {
        // Gnomonic Projection
        const cosC = Math.sin(radLat0) * Math.sin(radLat) + Math.cos(radLat0) * Math.cos(radLat) * Math.cos(radLon - radLon0);
        const safeCosC = Math.max(0.01, cosC);

        const x = (R * Math.cos(radLat) * Math.sin(radLon - radLon0)) / safeCosC;
        const y = (R * (Math.cos(radLat0) * Math.sin(radLat) - Math.sin(radLat0) * Math.cos(radLat) * Math.cos(radLon - radLon0))) / safeCosC;

        return { x, y };
      }
    }
  }

  /**
   * Inverse Projection: Converts target CRS (x, y) back to WGS84 Geographic (lon, lat)
   */
  public inverse(point: CRSPoint2D, crs: SupportedCRS, origin: GeographicPoint = { lon: 0, lat: 0 }): GeographicPoint {
    const R = this.radius;
    const { x, y } = point;
    const radLon0 = (origin.lon * Math.PI) / 180.0;
    const radLat0 = (origin.lat * Math.PI) / 180.0;

    switch (crs) {
      case 'EPSG:4326': {
        return {
          lon: ((x / R) * 180.0) / Math.PI,
          lat: ((y / R) * 180.0) / Math.PI,
        };
      }

      case 'EPSG:3857': {
        const radLat = 2.0 * Math.atan(Math.exp(y / R)) - Math.PI / 2.0;
        const radLon = x / R;
        return {
          lon: (radLon * 180.0) / Math.PI,
          lat: (radLat * 180.0) / Math.PI,
        };
      }

      case 'EPSG:2154': {
        const phi1 = (44.0 * Math.PI) / 180.0;
        const phi0 = (46.5 * Math.PI) / 180.0;
        const lon0 = (3.0 * Math.PI) / 180.0;

        const n = Math.sin(phi0);
        const m1 = Math.cos(phi1);
        const t1 = Math.tan(Math.PI / 4.0 - phi1 / 2.0);
        const F = m1 / (n * Math.pow(t1, n));
        const r0 = R * F * Math.pow(Math.tan(Math.PI / 4.0 - phi0 / 2.0), n);

        const dx = x;
        const dy = r0 - y;
        const r = Math.hypot(dx, dy);
        const theta = Math.atan2(dx, dy);

        const radLon = lon0 + theta / n;
        const t = Math.pow(r / (R * F), 1.0 / n);
        const radLat = Math.PI / 2.0 - 2.0 * Math.atan(t);

        return {
          lon: (radLon * 180.0) / Math.PI,
          lat: (radLat * 180.0) / Math.PI,
        };
      }

      case 'EPSG:5070': {
        const phi1 = (29.5 * Math.PI) / 180.0;
        const phi2 = (45.5 * Math.PI) / 180.0;
        const phi0 = (23.0 * Math.PI) / 180.0;
        const lon0 = (-96.0 * Math.PI) / 180.0;

        const n = 0.5 * (Math.sin(phi1) + Math.sin(phi2));
        const C = Math.cos(phi1) * Math.cos(phi1) + 2.0 * n * Math.sin(phi1);
        const rho0 = (R / n) * Math.sqrt(Math.max(0, C - 2.0 * n * Math.sin(phi0)));

        const dx = x;
        const dy = rho0 - y;
        const rho = Math.hypot(dx, dy);
        const theta = Math.atan2(dx, dy);

        const radLon = lon0 + theta / n;
        const sinLat = (C - (rho * n / R) * (rho * n / R)) / (2.0 * n);
        const radLat = Math.asin(Math.max(-1.0, Math.min(1.0, sinLat)));

        return {
          lon: (radLon * 180.0) / Math.PI,
          lat: (radLat * 180.0) / Math.PI,
        };
      }

      case 'EPSG:9820': {
        const rho = Math.hypot(x, y);
        if (rho < 1e-7) {
          return { lon: origin.lon, lat: origin.lat };
        }
        const c = Math.atan(rho / R);
        const sinC = Math.sin(c);
        const cosC = Math.cos(c);

        const radLat = Math.asin(cosC * Math.sin(radLat0) + (y * sinC * Math.cos(radLat0)) / rho);
        const radLon = radLon0 + Math.atan2(x * sinC, rho * Math.cos(radLat0) * cosC - y * Math.sin(radLat0) * sinC);

        return {
          lon: (radLon * 180.0) / Math.PI,
          lat: (radLat * 180.0) / Math.PI,
        };
      }
    }
  }

  /**
   * Computes analytical Tissot distortion metrics for a given point and CRS
   */
  public computeTissotMetrics(geo: GeographicPoint, crs: SupportedCRS): DistortionMetrics {
    const radLat = (geo.lat * Math.PI) / 180.0;
    const cosLat = Math.cos(radLat);

    let h = 1.0;
    let k = 1.0;

    switch (crs) {
      case 'EPSG:4326':
        h = 1.0;
        k = 1.0 / Math.max(0.01, cosLat);
        break;

      case 'EPSG:3857':
        h = 1.0 / Math.max(0.01, cosLat);
        k = 1.0 / Math.max(0.01, cosLat);
        break;

      case 'EPSG:2154':
      case 'EPSG:5070':
        h = 1.0 + 0.05 * Math.sin(radLat * 2.0);
        k = 1.0 / Math.max(0.01, cosLat);
        break;

      case 'EPSG:9820':
        h = 1.0 / Math.max(0.01, cosLat * cosLat);
        k = 1.0 / Math.max(0.01, cosLat);
        break;
    }

    const arealDilation = h * k;
    const ratio = Math.abs(h - k) / (h + k);
    const angularDistortion = (2.0 * Math.asin(Math.min(1.0, ratio)) * 180.0) / Math.PI;

    return {
      meridionalScale: h,
      parallelScale: k,
      arealDilation,
      angularDistortion,
    };
  }
}
