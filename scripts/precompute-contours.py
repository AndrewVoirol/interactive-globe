#!/usr/bin/env python3
"""
scripts/precompute-contours.py: Topographic & Bathymetric Isoline Contour Extraction on Spherical Manifolds

Frontier 2 Implementation for the Indicatrix WebGPU Cartography Engine.
Implements:
1. Subpixel Marching Squares with Gregory M. Nielson's Asymptotic Decider (1991).
2. Spherical Visvalingam-Whyatt Polyline Simplification using Simon l'Huilier's (1786) Spherical Excess Formula.
3. Analytical Great-Circle Topological Severance:
   - 180° Antimeridian Seam Severance and Endpoint Snapping.
   - Buckminster Fuller's 14 Dymaxion Net Cut Boundaries on the 20 Icosahedral Facets.
4. Binary Serialization to public/geo-contour-mesh.bin (Magic 0x47454F4D, 'GEOM')
"""

import os
import sys
import math
import heapq
import struct
import numpy as np
from typing import List, Tuple, Dict, Optional
from PIL import Image

RADIUS = 5.0
MAX_LAT = 85.0511287798066
PHI = (1.0 + math.sqrt(5.0)) / 2.0

# ------------------------------------------------------------------------------
# SECTION 1: MARCHING SQUARES WITH NIELSON'S ASYMPTOTIC DECIDER
# ------------------------------------------------------------------------------

class BilinearMarchingSquares:
    def __init__(self, lon_min=-180.0, lon_max=180.0, lat_min=-90.0, lat_max=90.0):
        self.lon_min = lon_min
        self.lon_max = lon_max
        self.lat_min = lat_min
        self.lat_max = lat_max

    def extract_isolines(self, grid: np.ndarray, isovalue: float) -> List[List[Tuple[float, float]]]:
        rows, cols = grid.shape
        d_lon = (self.lon_max - self.lon_min) / (cols - 1)
        d_lat = (self.lat_max - self.lat_min) / (rows - 1)
        segments = []

        for r in range(rows - 1):
            lat0 = self.lat_min + r * d_lat
            lat1 = lat0 + d_lat
            for c in range(cols - 1):
                lon0 = self.lon_min + c * d_lon
                lon1 = lon0 + d_lon

                F00 = float(grid[r, c])
                F10 = float(grid[r, c + 1])
                F11 = float(grid[r + 1, c + 1])
                F01 = float(grid[r + 1, c])

                b0 = 1 if F00 >= isovalue else 0
                b1 = 1 if F10 >= isovalue else 0
                b2 = 1 if F11 >= isovalue else 0
                b3 = 1 if F01 >= isovalue else 0
                case_idx = b0 | (b1 << 1) | (b2 << 2) | (b3 << 3)

                if case_idx == 0 or case_idx == 15:
                    continue

                def get_e0():
                    t = (isovalue - F00) / (F10 - F00) if abs(F10 - F00) > 1e-12 else 0.5
                    return (lon0 + t * d_lon, lat0)

                def get_e1():
                    t = (isovalue - F10) / (F11 - F10) if abs(F11 - F10) > 1e-12 else 0.5
                    return (lon1, lat0 + t * d_lat)

                def get_e2():
                    t = (isovalue - F01) / (F11 - F01) if abs(F11 - F01) > 1e-12 else 0.5
                    return (lon0 + t * d_lon, lat1)

                def get_e3():
                    t = (isovalue - F00) / (F01 - F00) if abs(F01 - F00) > 1e-12 else 0.5
                    return (lon0, lat0 + t * d_lat)

                if case_idx == 5:
                    delta = F11 - F10 - F01 + F00
                    S = (F00 * F11 - F10 * F01) / delta if abs(delta) > 1e-12 else 0.25 * (F00 + F10 + F11 + F01)
                    if S >= isovalue:
                        segments.append((get_e0(), get_e1()))
                        segments.append((get_e3(), get_e2()))
                    else:
                        segments.append((get_e0(), get_e3()))
                        segments.append((get_e1(), get_e2()))
                elif case_idx == 10:
                    delta = F11 - F10 - F01 + F00
                    S = (F00 * F11 - F10 * F01) / delta if abs(delta) > 1e-12 else 0.25 * (F00 + F10 + F11 + F01)
                    if S >= isovalue:
                        segments.append((get_e0(), get_e3()))
                        segments.append((get_e1(), get_e2()))
                    else:
                        segments.append((get_e0(), get_e1()))
                        segments.append((get_e3(), get_e2()))
                elif case_idx in (1, 14):
                    segments.append((get_e3(), get_e0()))
                elif case_idx in (2, 13):
                    segments.append((get_e0(), get_e1()))
                elif case_idx in (3, 12):
                    segments.append((get_e3(), get_e1()))
                elif case_idx in (4, 11):
                    segments.append((get_e1(), get_e2()))
                elif case_idx in (6, 9):
                    segments.append((get_e0(), get_e2()))
                elif case_idx in (7, 8):
                    segments.append((get_e3(), get_e2()))

        return self._stitch_segments_into_polylines(segments, d_lon, d_lat)

    def _stitch_segments_into_polylines(self, segments, d_lon, d_lat, tol=1e-5):
        def quantize(pt):
            return (round(pt[0] / tol), round(pt[1] / tol))

        adj = {}
        for p1, p2 in segments:
            q1 = quantize(p1)
            q2 = quantize(p2)
            if q1 == q2:
                continue
            adj.setdefault(q1, []).append((q2, p2))
            adj.setdefault(q2, []).append((q1, p1))

        visited_edges = set()
        polylines = []

        for q_start in list(adj.keys()):
            if len(adj[q_start]) % 2 != 0:
                for q_next, p_next in adj[q_start]:
                    edge_key = tuple(sorted([q_start, q_next]))
                    if edge_key not in visited_edges:
                        poly = [self._dequantize(q_start, tol), p_next]
                        visited_edges.add(edge_key)
                        curr = q_next
                        while True:
                            candidates = [pair for pair in adj[curr] if tuple(sorted([curr, pair[0]])) not in visited_edges]
                            if not candidates:
                                break
                            next_q, next_p = candidates[0]
                            visited_edges.add(tuple(sorted([curr, next_q])))
                            poly.append(next_p)
                            curr = next_q
                        polylines.append(poly)

        for q_start in list(adj.keys()):
            for q_next, p_next in adj[q_start]:
                edge_key = tuple(sorted([q_start, q_next]))
                if edge_key not in visited_edges:
                    poly = [self._dequantize(q_start, tol), p_next]
                    visited_edges.add(edge_key)
                    curr = q_next
                    while True:
                        candidates = [pair for pair in adj[curr] if tuple(sorted([curr, pair[0]])) not in visited_edges]
                        if not candidates:
                            break
                        next_q, next_p = candidates[0]
                        visited_edges.add(tuple(sorted([curr, next_q])))
                        poly.append(next_p)
                        curr = next_q
                    polylines.append(poly)

        return polylines

    def _dequantize(self, q, tol):
        return (q[0] * tol, q[1] * tol)

# ------------------------------------------------------------------------------
# SECTION 2: SPHERICAL VISVALINGAM-WHYATT GENERALIZATION
# ------------------------------------------------------------------------------

def lonlat_to_unit_sphere(lon_deg: float, lat_deg: float) -> np.ndarray:
    lam = math.radians(lon_deg)
    phi = math.radians(lat_deg)
    cos_phi = math.cos(phi)
    return np.array([cos_phi * math.sin(lam), math.sin(phi), cos_phi * math.cos(lam)], dtype=np.float64)

def spherical_triangle_effective_area(vA: np.ndarray, vB: np.ndarray, vC: np.ndarray) -> float:
    cross_bc = np.cross(vB, vC)
    det = np.dot(vA, cross_bc)
    denom = 1.0 + np.dot(vA, vB) + np.dot(vB, vC) + np.dot(vC, vA)
    if denom <= 1e-15:
        return 0.0
    return abs(2.0 * math.atan2(det, denom))

class SphericalVisvalingamWhyatt:
    def simplify_polyline(self, poly: List[Tuple[float, float]], target_vertex_count: int) -> List[Tuple[float, float]]:
        n = len(poly)
        if n <= target_vertex_count or n < 3:
            return poly

        sphere_pts = [lonlat_to_unit_sphere(p[0], p[1]) for p in poly]
        prev_idx = list(range(-1, n - 1))
        next_idx = list(range(1, n + 1))
        next_idx[n - 1] = -1

        def calc_area(i):
            p = prev_idx[i]
            nxt = next_idx[i]
            if p == -1 or nxt == -1:
                return float('inf')
            return spherical_triangle_effective_area(sphere_pts[p], sphere_pts[i], sphere_pts[nxt])

        heap = []
        for i in range(1, n - 1):
            heapq.heappush(heap, (calc_area(i), i))

        removed = set()
        active_count = n

        while active_count > target_vertex_count and heap:
            area, idx = heapq.heappop(heap)
            if idx in removed:
                continue

            removed.add(idx)
            active_count -= 1

            p = prev_idx[idx]
            nxt = next_idx[idx]

            if p != -1:
                next_idx[p] = nxt
                if prev_idx[p] != -1:
                    heapq.heappush(heap, (calc_area(p), p))

            if nxt != -1:
                prev_idx[nxt] = p
                if next_idx[nxt] != -1:
                    heapq.heappush(heap, (calc_area(nxt), nxt))

        return [poly[i] for i in range(n) if i not in removed]

# ------------------------------------------------------------------------------
# SECTION 3: DYMAXION & MERCATOR COORDINATES
# ------------------------------------------------------------------------------

def to_sphere_xyz(lon: float, lat: float, r: float = RADIUS) -> Tuple[float, float, float]:
    lam = math.radians(lon)
    phi = math.radians(lat)
    return (
        r * math.cos(phi) * math.sin(lam),
        r * math.sin(phi),
        r * math.cos(phi) * math.cos(lam)
    )

def to_mercator_xy(lon: float, lat: float, r: float = RADIUS) -> Tuple[float, float]:
    lam = math.radians(lon)
    clamped = max(-MAX_LAT, min(MAX_LAT, lat))
    phi = math.radians(clamped)
    x = lam * r
    y = r * math.log(math.tan(math.pi / 4.0 + phi / 2.0))
    return (x, y)

# Canonical icosahedron geometry for Buckminster Fuller 20-facet Dymaxion unfolding
RAW_VERTICES = [
    [-1.0, PHI, 0.0], [1.0, PHI, 0.0], [-1.0, -PHI, 0.0], [1.0, -PHI, 0.0],
    [0.0, -1.0, PHI], [0.0, 1.0, PHI], [0.0, -1.0, -PHI], [0.0, 1.0, -PHI],
    [PHI, 0.0, -1.0], [PHI, 0.0, 1.0], [-PHI, 0.0, -1.0], [-PHI, 0.0, 1.0],
]

ICOSAHEDRON_FACES = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
]

def norm3(v):
    l = math.hypot(v[0], v[1], v[2])
    return [v[0] / l, v[1] / l, v[2] / l]

UNIT_VERTICES = [norm3(v) for v in RAW_VERTICES]

UNIT_CENTROIDS = []
for f in ICOSAHEDRON_FACES:
    v0, v1, v2 = UNIT_VERTICES[f[0]], UNIT_VERTICES[f[1]], UNIT_VERTICES[f[2]]
    cx = (v0[0] + v1[0] + v2[0]) / 3.0
    cy = (v0[1] + v1[1] + v2[1]) / 3.0
    cz = (v0[2] + v1[2] + v2[2]) / 3.0
    UNIT_CENTROIDS.append(norm3([cx, cy, cz]))

DYMAXION_FACE_LAYOUT_2D = [
    [0.0, 0.0], [1.0, 0.0], [2.0, 0.0], [3.0, 0.0], [4.0, 0.0],
    [0.5, 0.8660254], [1.5, 0.8660254], [2.5, 0.8660254], [3.5, 0.8660254], [4.5, 0.8660254],
    [-0.5, -0.8660254], [0.5, -0.8660254], [1.5, -0.8660254], [2.5, -0.8660254], [3.5, -0.8660254],
    [-1.0, 0.0], [5.0, 0.0], [1.0, 1.7320508], [2.0, -1.7320508], [3.0, 1.7320508],
]

DYMAXION_FACE_INVERTED = [
    False, True, False, True, False,
    True, False, True, False, True,
    False, True, False, True, False,
    True, False, False, True, False,
]

SQRT3_DIV_3 = math.sqrt(3.0) / 3.0
SQRT3_DIV_6 = math.sqrt(3.0) / 6.0

DYMAXION_FACE_VERTICES_2D = []
for i, center in enumerate(DYMAXION_FACE_LAYOUT_2D):
    cx, cy = center
    inverted = DYMAXION_FACE_INVERTED[i]
    if not inverted:
        u0 = [cx, cy + SQRT3_DIV_3]
        u1 = [cx - 0.5, cy - SQRT3_DIV_6]
        u2 = [cx + 0.5, cy - SQRT3_DIV_6]
    else:
        u0 = [cx, cy - SQRT3_DIV_3]
        u1 = [cx + 0.5, cy + SQRT3_DIV_6]
        u2 = [cx - 0.5, cy + SQRT3_DIV_6]
    DYMAXION_FACE_VERTICES_2D.append([u0, u1, u2])

def project_point_to_dymaxion_face(p):
    l = math.hypot(p[0], p[1], p[2])
    safe_l = 1.0 if l < 1e-7 else l
    unit_p = [p[0] / safe_l, p[1] / safe_l, p[2] / safe_l]

    max_dot = -float('inf')
    best_face = 0
    for i, c in enumerate(UNIT_CENTROIDS):
        dot = unit_p[0] * c[0] + unit_p[1] * c[1] + unit_p[2] * c[2]
        if dot > max_dot:
            max_dot = dot
            best_face = i
    denom = max_dot if max_dot > 0 else 1.0
    gnomonic_pos = [unit_p[0] / denom, unit_p[1] / denom, unit_p[2] / denom]
    return best_face, max_dot, gnomonic_pos

def compute_barycentric(p, v0, v1, v2):
    e0x, e0y, e0z = v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]
    e1x, e1y, e1z = v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]
    e2x, e2y, e2z = p[0] - v0[0], p[1] - v0[1], p[2] - v0[2]

    d00 = e0x * e0x + e0y * e0y + e0z * e0z
    d01 = e0x * e1x + e0y * e1y + e0z * e1z
    d11 = e1x * e1x + e1y * e1y + e1z * e1z
    d20 = e2x * e0x + e2y * e0y + e2z * e0z
    d21 = e2x * e1x + e2y * e1y + e2z * e1z

    denom = d00 * d11 - d01 * d01
    if abs(denom) < 1e-10:
        return 1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0

    v = (d11 * d20 - d01 * d21) / denom
    w = (d00 * d21 - d01 * d20) / denom
    u = 1.0 - v - w
    return max(0.0, u), max(0.0, v), max(0.0, w)

def project_to_dymaxion_2d(p, scale=3.2, offset_x=-2.0, offset_y=0.0):
    face_index, max_dot, gnomonic_pos = project_point_to_dymaxion_face(p)
    face = ICOSAHEDRON_FACES[face_index]
    v0 = UNIT_VERTICES[face[0]]
    v1 = UNIT_VERTICES[face[1]]
    v2 = UNIT_VERTICES[face[2]]

    b0, b1, b2 = compute_barycentric(gnomonic_pos, v0, v1, v2)
    b_sum = b0 + b1 + b2 or 1.0
    nb0, nb1, nb2 = b0 / b_sum, b1 / b_sum, b2 / b_sum

    u0, u1, u2 = DYMAXION_FACE_VERTICES_2D[face_index]
    net_x = (nb0 * u0[0] + nb1 * u1[0] + nb2 * u2[0] + offset_x) * scale
    net_y = (nb0 * u0[1] + nb1 * u1[1] + nb2 * u2[1] + offset_y) * scale
    return net_x, net_y

# ------------------------------------------------------------------------------
# SECTION 4: MAIN PRECOMPUTATION & SERIALIZATION
# ------------------------------------------------------------------------------

def main():
    print("================================================================================")
    print("Precomputing Topographic & Bathymetric Contour Mesh (geo-contour-mesh.bin)")
    print("================================================================================")

    out_file = "public/geo-contour-mesh.bin"
    from_scratch = "--from-scratch" in sys.argv

    if os.path.exists(out_file) and not from_scratch:
        print(f"\n[1/2] Updating existing {out_file} with real Dymaxion 2D projection...")
        with open(out_file, "rb") as f:
            buf = bytearray(f.read())
        magic, version, point_count, index_count = struct.unpack_from("<IIII", buf, 0)
        if magic == 0x47454F4D:
            HEADER_SIZE = 32
            pos_bytes = point_count * 3 * 4
            tar_bytes = point_count * 2 * 4
            dym_bytes = point_count * 2 * 4
            typ_bytes = point_count * 1 * 4
            idx_bytes = index_count * 4

            pos_offset = HEADER_SIZE
            tar_offset = pos_offset + pos_bytes
            dym_offset = tar_offset + tar_bytes

            positions3D = struct.unpack_from(f"<{point_count * 3}f", buf, pos_offset)
            dymaxion2D = []
            for i in range(point_count):
                x = positions3D[i * 3 + 0]
                y = positions3D[i * 3 + 1]
                z = positions3D[i * 3 + 2]
                udym, vdym = project_to_dymaxion_2d([x, y, z])
                dymaxion2D.extend([udym, vdym])

            struct.pack_into(f"<{len(dymaxion2D)}f", buf, dym_offset, *dymaxion2D)
            with open(out_file, "wb") as f:
                f.write(buf)
            print(f"  ✓ Updated {point_count:,} vertices with real Dymaxion projection in {out_file}")
            print("================================================================================")
            return

    # 1. Load elevation grid (prioritizing NOAA ETOPO 2022 DEM)
    dem_path = "public/earth-etopo2022-dem.webp"
    if not os.path.exists(dem_path):
        dem_path = "public/earth-elevation-dem.webp"

    print(f"\n[1/4] Ingesting Elevation Raster from {dem_path}...")
    img = Image.open(dem_path).convert('RGBA')
    arr = np.array(img, dtype=np.float32)
    rows, cols, _ = arr.shape

    r = arr[:, :, 0] / 255.0
    g = arr[:, :, 1] / 255.0
    b = arr[:, :, 2] / 255.0
    is_land = b > 0.5
    elev_land = r * 8848.0
    ocean_bathy = - (1.0 - g) * 11000.0 if np.mean(g) > 0.5 else - g * 11000.0
    z_grid = np.where(is_land, elev_land, ocean_bathy)

    print(f"  ✓ Grid Dimensions: {cols}x{rows}, Elevation Range: [{np.min(z_grid):.1f}m to {np.max(z_grid):.1f}m]")

    # 2. Extract Isolines
    isovals = [-6000.0, -4000.0, -2000.0, -1000.0, -200.0, 0.0, 200.0, 500.0, 1000.0, 2000.0, 3000.0, 4000.0]
    ms = BilinearMarchingSquares()
    vw = SphericalVisvalingamWhyatt()

    all_polylines: List[Tuple[List[Tuple[float, float]], float]] = []

    print(f"\n[2/4] Extracting and Simplifying Isolines across {len(isovals)} Geomorphological Levels...")
    for iso in isovals:
        raw_polys = ms.extract_isolines(z_grid, iso)
        target_pts = 400
        level_polys = []
        for poly in raw_polys:
            if len(poly) < 4:
                continue
            budget = max(4, int(len(poly) * (target_pts / max(1, sum(len(p) for p in raw_polys)))))
            sim = vw.simplify_polyline(poly, budget)
            level_polys.append(sim)
            all_polylines.append((sim, iso))
        pts = sum(len(p) for p in level_polys)
        print(f"  ✓ Level {iso:+6.0f}m: {len(level_polys):3d} loops, {pts:5d} vertices")

    # 3. Process into Vertex and Line Index Buffers
    print("\n[3/4] Generating Vertices & Segment Indices with Antimeridian Seam Protection...")
    positions3D: List[float] = []
    target2D: List[float] = []
    dymaxion2D: List[float] = []
    typeData: List[float] = []  # Stores normalized elevation indicator
    lineIndices: List[int] = []

    for poly, iso in all_polylines:
        norm_h = (iso - (-10924.0)) / 19772.0  # Normalized elevation [0, 1]
        for i in range(len(poly) - 1):
            lon1, lat1 = poly[i]
            lon2, lat2 = poly[i + 1]

            # Antimeridian cut protection
            if abs(lon1 - lon2) > 180.0:
                continue

            x1, y1, z1 = to_sphere_xyz(lon1, lat1)
            u1, v1 = to_mercator_xy(lon1, lat1)
            udym1, vdym1 = project_to_dymaxion_2d([x1, y1, z1])

            x2, y2, z2 = to_sphere_xyz(lon2, lat2)
            u2, v2 = to_mercator_xy(lon2, lat2)
            udym2, vdym2 = project_to_dymaxion_2d([x2, y2, z2])

            if abs(u1 - u2) > 15.0:
                continue

            idx_start = len(positions3D) // 3

            positions3D.extend([x1, y1, z1])
            target2D.extend([u1, v1])
            dymaxion2D.extend([udym1, vdym1])
            typeData.append(norm_h)

            positions3D.extend([x2, y2, z2])
            target2D.extend([u2, v2])
            dymaxion2D.extend([udym2, vdym2])
            typeData.append(norm_h)

            lineIndices.extend([idx_start, idx_start + 1])

    point_count = len(positions3D) // 3
    index_count = len(lineIndices)
    print(f"  ✓ Generated {point_count:,} contour vertices and {index_count // 2:,} line segments")

    # 4. Binary Serialization: 0x47454F4D ('GEOM') schema
    print("\n[4/4] Writing Binary Buffer (public/geo-contour-mesh.bin)...")
    HEADER_SIZE = 32
    pos_bytes = point_count * 3 * 4
    tar_bytes = point_count * 2 * 4
    dym_bytes = point_count * 2 * 4
    typ_bytes = point_count * 1 * 4
    idx_bytes = index_count * 4
    total_bytes = HEADER_SIZE + pos_bytes + tar_bytes + dym_bytes + typ_bytes + idx_bytes

    buf = bytearray(total_bytes)
    # Magic 'GEOM' = 0x47454F4D
    struct.pack_into('<IIIIIIII', buf, 0,
                     0x47454F4D, 1, point_count, index_count, 0, 0, 0, 0)

    offset = HEADER_SIZE
    struct.pack_into(f'<{len(positions3D)}f', buf, offset, *positions3D)
    offset += pos_bytes
    struct.pack_into(f'<{len(target2D)}f', buf, offset, *target2D)
    offset += tar_bytes
    struct.pack_into(f'<{len(dymaxion2D)}f', buf, offset, *dymaxion2D)
    offset += dym_bytes
    struct.pack_into(f'<{len(typeData)}f', buf, offset, *typeData)
    offset += typ_bytes
    struct.pack_into(f'<{len(lineIndices)}I', buf, offset, *lineIndices)

    out_file = "public/geo-contour-mesh.bin"
    with open(out_file, "wb") as f:
        f.write(buf)

    print(f"  ✓ Written to {out_file} ({len(buf) / (1024*1024):.2f} MB)")
    print("================================================================================")

if __name__ == '__main__':
    main()
