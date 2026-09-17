#!/usr/bin/env python3
"""
scripts/verify_data_assets.py: Standalone Verification & Anti-Self-Affirmation Protocol

Verifies generated WebGPU block-compressed BC4 and BC5 texture pyramids:
- Probe Point 1 (Mount Everest: 27.9881° N, 86.9250° E): 8840.0m <= elevation <= 8855.0m
- Probe Point 2 (Mariana Trench: 11.3733° N, 142.5917° E): -10935.0m <= elevation <= -10910.0m
- Probe Point 3 (Amazon River Mouth: 0.0° N, 50.0° W): Accumulation area A >= 5,000,000 km²
- Probe Point 4 (Lake Titicaca: 15.9254° S, 69.3354° W): 3800.0m <= z_lake <= 3820.0m
- Gate 5 (VRAM Footprint): Total on-disk size of all generated mipmap pyramids <= 110 MB
"""

import os
import sys
import math
import struct

Z_MIN_GLOBAL = -11000.0
Z_MAX_GLOBAL = 9000.0
Z_SPAN_GLOBAL = Z_MAX_GLOBAL - Z_MIN_GLOBAL  # 20,000.0m

A_MAX_GLOBAL = 7000000.0  # 7,000,000 km²
Z_LAKE_MAX = 9000.0       # 9,000.0m


class DDSReader:
    """Reads DDS headers and directly decodes individual pixels from BC4 / BC5 blocks."""

    def __init__(self, filepath: str):
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"DDS asset not found: {filepath}")
        self.filepath = filepath
        self.file_size = os.path.getsize(filepath)

        with open(filepath, "rb") as f:
            header_bytes = f.read(128)
            if len(header_bytes) < 128:
                raise ValueError(f"Invalid DDS header in {filepath}")

            magic, size, flags, height, width, linear_size, depth, num_mips = struct.unpack("<4sIIIIIII", header_bytes[:32])
            if magic != b"DDS ":
                raise ValueError(f"Not a valid DDS file: {filepath}")

            four_cc = struct.unpack("<4s", header_bytes[84:88])[0]

            self.width = width
            self.height = height
            self.num_mips = num_mips
            self.four_cc = four_cc
            self.is_bc5 = four_cc in (b"BC5U", b"ATI2")
            self.is_bc4 = four_cc in (b"BC4U", b"ATI1")
            self.block_size = 16 if self.is_bc5 else 8

    def _decode_bc4_channel(self, raw_8b: bytes, p: int) -> float:
        """Decodes the 8-bit unorm value for pixel p in [0, 15] from an 8-byte BC4 block."""
        e0 = raw_8b[0]
        e1 = raw_8b[1]
        indices_int = int.from_bytes(raw_8b[2:8], byteorder="little")
        idx = (indices_int >> (3 * p)) & 0x7

        if e0 > e1:
            if idx == 0:
                val = float(e0)
            elif idx == 1:
                val = float(e1)
            else:
                val = ((7 - (idx - 1)) * float(e0) + (idx - 1) * float(e1)) / 7.0
        else:
            if idx == 0:
                val = float(e0)
            elif idx == 1:
                val = float(e1)
            elif idx == 6:
                val = 0.0
            elif idx == 7:
                val = 255.0
            else:
                val = ((5 - (idx - 1)) * float(e0) + (idx - 1) * float(e1)) / 5.0

        return val

    def get_mip_offset_and_dims(self, mip_level: int = 0) -> tuple[int, int, int]:
        """
        Returns (byte_offset, width, height) for the specified mip_level.
        """
        if mip_level < 0 or mip_level >= self.num_mips:
            raise ValueError(f"Mip level {mip_level} out of range (total mips: {self.num_mips})")

        offset = 128
        w = self.width
        h = self.height

        for _ in range(mip_level):
            bx = max(1, (w + 3) // 4)
            by = max(1, (h + 3) // 4)
            offset += bx * by * self.block_size
            w = max(1, w // 2)
            h = max(1, h // 2)

        return offset, w, h

    def sample_lat_lon(self, lat: float, lon: float, mip_level: int = 0) -> tuple[float, float]:
        """
        Samples pixel value at (lat, lon) from the specified mip_level.
        Returns (channel_0, channel_1). For BC4, channel_1 is 0.0.
        """
        offset_base, w, h = self.get_mip_offset_and_dims(mip_level)

        # Equirectangular coordinate mapping
        col = int(min(max((lon + 180.0) / 360.0 * w, 0), w - 1))
        row = int(min(max((90.0 - lat) / 180.0 * h, 0), h - 1))

        bx = col // 4
        by = row // 4
        px = col % 4
        py = row % 4
        p = py * 4 + px

        blocks_x = max(1, (w + 3) // 4)
        block_idx = by * blocks_x + bx
        offset = offset_base + block_idx * self.block_size

        with open(self.filepath, "rb") as f:
            f.seek(offset)
            block_data = f.read(self.block_size)

        if self.is_bc4:
            r_val = self._decode_bc4_channel(block_data[:8], p)
            return r_val, 0.0
        elif self.is_bc5:
            r_val = self._decode_bc4_channel(block_data[:8], p)
            g_val = self._decode_bc4_channel(block_data[8:16], p)
            return r_val, g_val
        else:
            raise ValueError(f"Unsupported FourCC: {self.four_cc}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Verify generated BC4 and BC5 texture pyramids")
    parser.add_argument("--dir", type=str, default="public", help="Directory containing generated DDS assets")
    parser.add_argument("--dem", type=str, default=None, help="Path to DEM BC4 DDS file")
    parser.add_argument("--hydro", type=str, default=None, help="Path to Hydrology BC5 DDS file")
    parser.add_argument("--normals", type=str, default=None, help="Path to Normal BC5 DDS file")
    args = parser.parse_args()

    print("=" * 82)
    print("INDICATRIX ENGINE: STANDALONE DATA ASSET VERIFICATION PROTOCOL")
    print("=" * 82)

    dem_path = args.dem or os.path.join(args.dir, "earth-etopo2022-dem-bc4.dds")
    hydro_path = args.hydro or os.path.join(args.dir, "earth-hydrology-bc5.dds")
    normals_path = args.normals or os.path.join(args.dir, "earth-normals-bc5.dds")

    results = []
    all_passed = True

    # -----------------------------------------------------------------------
    # Probe 1: Mount Everest Elevation (BC4)
    # -----------------------------------------------------------------------
    try:
        reader_dem = DDSReader(dem_path)
        lat_ev, lon_ev = 27.9881, 86.9250
        r_raw, _ = reader_dem.sample_lat_lon(lat_ev, lon_ev)
        elev_ev = (r_raw / 255.0) * Z_SPAN_GLOBAL + Z_MIN_GLOBAL
        exp_min_ev, exp_max_ev = 8840.0, 8855.0
        pass_ev = exp_min_ev <= elev_ev <= exp_max_ev
        if not pass_ev:
            all_passed = False
        results.append({
            "gate": "Probe Gate 1",
            "target": "Mount Everest (27.9881°N, 86.9250°E)",
            "asset": "DEM (bc4-r-unorm)",
            "expected": f"[{exp_min_ev:.1f}m, {exp_max_ev:.1f}m]",
            "measured": f"{elev_ev:8.2f} m",
            "passed": pass_ev,
            "error": f"Out of bounds by {abs(elev_ev - 8848.86):.2f}m" if not pass_ev else "OK"
        })
    except Exception as e:
        all_passed = False
        results.append({
            "gate": "Probe Gate 1",
            "target": "Mount Everest (27.9881°N, 86.9250°E)",
            "asset": "DEM (bc4-r-unorm)",
            "expected": "[8840.0m, 8855.0m]",
            "measured": "ERROR",
            "passed": False,
            "error": str(e)
        })

    # -----------------------------------------------------------------------
    # Probe 2: Mariana Trench Elevation (BC4)
    # -----------------------------------------------------------------------
    try:
        reader_dem = DDSReader(dem_path)
        lat_ma, lon_ma = 11.3733, 142.5917
        r_raw, _ = reader_dem.sample_lat_lon(lat_ma, lon_ma)
        elev_ma = (r_raw / 255.0) * Z_SPAN_GLOBAL + Z_MIN_GLOBAL
        exp_min_ma, exp_max_ma = -10935.0, -10910.0
        pass_ma = exp_min_ma <= elev_ma <= exp_max_ma
        if not pass_ma:
            all_passed = False
        results.append({
            "gate": "Probe Gate 2",
            "target": "Mariana Trench (11.3733°N, 142.5917°E)",
            "asset": "DEM (bc4-r-unorm)",
            "expected": f"[{exp_min_ma:.1f}m, {exp_max_ma:.1f}m]",
            "measured": f"{elev_ma:8.2f} m",
            "passed": pass_ma,
            "error": f"Out of bounds by {abs(elev_ma - (-10924.0)):.2f}m" if not pass_ma else "OK"
        })
    except Exception as e:
        all_passed = False
        results.append({
            "gate": "Probe Gate 2",
            "target": "Mariana Trench (11.3733°N, 142.5917°E)",
            "asset": "DEM (bc4-r-unorm)",
            "expected": "[-10935.0m, -10910.0m]",
            "measured": "ERROR",
            "passed": False,
            "error": str(e)
        })

    # -----------------------------------------------------------------------
    # Probe 3: Amazon River Mouth Drainage Area (BC5 Red Channel)
    # -----------------------------------------------------------------------
    try:
        reader_hydro = DDSReader(hydro_path)
        lat_am, lon_am = 0.0, -50.0
        r_raw, _ = reader_hydro.sample_lat_lon(lat_am, lon_am)
        v_accum = r_raw / 255.0
        area_am = ((A_MAX_GLOBAL + 1.0) ** v_accum) - 1.0
        exp_min_am = 5000000.0
        pass_am = area_am >= exp_min_am
        if not pass_am:
            all_passed = False
        results.append({
            "gate": "Probe Gate 3",
            "target": "Amazon River Mouth (0.0°N, 50.0°W)",
            "asset": "Hydrology (bc5-rg Red)",
            "expected": f">= {exp_min_am:,.0f} km²",
            "measured": f"{area_am:,.0f} km²",
            "passed": pass_am,
            "error": "Below 5M km² threshold" if not pass_am else "OK"
        })
    except Exception as e:
        all_passed = False
        results.append({
            "gate": "Probe Gate 3",
            "target": "Amazon River Mouth (0.0°N, 50.0°W)",
            "asset": "Hydrology (bc5-rg Red)",
            "expected": ">= 5,000,000 km²",
            "measured": "ERROR",
            "passed": False,
            "error": str(e)
        })

    # -----------------------------------------------------------------------
    # Probe 4: Lake Titicaca Surface Datum (BC5 Green Channel)
    # -----------------------------------------------------------------------
    try:
        reader_hydro = DDSReader(hydro_path)
        lat_ti, lon_ti = -15.9254, -69.3354
        _, g_raw = reader_hydro.sample_lat_lon(lat_ti, lon_ti)
        z_lake_ti = (g_raw / 255.0) * Z_LAKE_MAX
        exp_min_ti, exp_max_ti = 3800.0, 3820.0
        pass_ti = exp_min_ti <= z_lake_ti <= exp_max_ti
        if not pass_ti:
            all_passed = False
        results.append({
            "gate": "Probe Gate 4",
            "target": "Lake Titicaca (15.9254°S, 69.3354°W)",
            "asset": "Hydrology (bc5-rg Green)",
            "expected": f"[{exp_min_ti:.1f}m, {exp_max_ti:.1f}m]",
            "measured": f"{z_lake_ti:8.2f} m",
            "passed": pass_ti,
            "error": f"Delta = {abs(z_lake_ti - 3812.0):.2f}m" if not pass_ti else "OK"
        })
    except Exception as e:
        all_passed = False
        results.append({
            "gate": "Probe Gate 4",
            "target": "Lake Titicaca (15.9254°S, 69.3354°W)",
            "asset": "Hydrology (bc5-rg Green)",
            "expected": "[3800.0m, 3820.0m]",
            "measured": "ERROR",
            "passed": False,
            "error": str(e)
        })

    # -----------------------------------------------------------------------
    # Gate 5: VRAM On-Disk Footprint (Total Mipmap Pyramids <= 110 MB)
    # -----------------------------------------------------------------------
    try:
        assets = [dem_path, hydro_path, normals_path]
        total_bytes = sum(os.path.getsize(p) for p in assets if os.path.exists(p))
        total_mb = total_bytes / (1024.0 * 1024.0)
        exp_max_mb = 110.0
        pass_fp = total_mb <= exp_max_mb
        if not pass_fp:
            all_passed = False
        results.append({
            "gate": "Probe Gate 5",
            "target": "VRAM Footprint (All 3 Texture Pyramids)",
            "asset": "DEM + Hydro + Normals",
            "expected": f"<= {exp_max_mb:.1f} MB",
            "measured": f"{total_mb:6.2f} MB",
            "passed": pass_fp,
            "error": f"Exceeded by {total_mb - exp_max_mb:.2f} MB" if not pass_fp else "OK"
        })
    except Exception as e:
        all_passed = False
        results.append({
            "gate": "Probe Gate 5",
            "target": "VRAM Footprint (All 3 Texture Pyramids)",
            "asset": "DEM + Hydro + Normals",
            "expected": "<= 110.0 MB",
            "measured": "ERROR",
            "passed": False,
            "error": str(e)
        })

    # -----------------------------------------------------------------------
    # Diagnostic Probes: Normal Map Orientation, Toksvig Length & Mip Chains
    # -----------------------------------------------------------------------
    diag_results = []
    try:
        reader_norm = DDSReader(normals_path)
        # 1. Flat ocean test (0°N, 0°E)
        r_nx, r_ny = reader_norm.sample_lat_lon(0.0, 0.0, mip_level=0)
        nx_ocean = (r_nx / 255.0) * 2.0 - 1.0
        ny_ocean = (r_ny / 255.0) * 2.0 - 1.0
        pass_ocean = abs(nx_ocean) < 0.05 and abs(ny_ocean) < 0.05
        diag_results.append({
            "check": "Flat Ocean Tangent Normal (0°N, 0°E)",
            "criterion": "|Nx| < 0.05, |Ny| < 0.05",
            "measured": f"Nx={nx_ocean:+.3f}, Ny={ny_ocean:+.3f}",
            "passed": pass_ocean,
        })

        # 2. Everest North face (28.0381°N, 86.9250°E) -> faces North (+Y)
        _, r_ny_n = reader_norm.sample_lat_lon(28.0381, 86.9250, mip_level=0)
        ny_north = (r_ny_n / 255.0) * 2.0 - 1.0
        pass_north = ny_north > 0.05
        diag_results.append({
            "check": "Everest North Slope Outward Normal",
            "criterion": "Ny > +0.05 (pointing North)",
            "measured": f"Ny={ny_north:+.3f}",
            "passed": pass_north,
        })

        # 3. Everest South face (27.9381°N, 86.9250°E) -> faces South (-Y)
        _, r_ny_s = reader_norm.sample_lat_lon(27.9381, 86.9250, mip_level=0)
        ny_south = (r_ny_s / 255.0) * 2.0 - 1.0
        pass_south = ny_south < -0.05
        diag_results.append({
            "check": "Everest South Slope Outward Normal",
            "criterion": "Ny < -0.05 (pointing South)",
            "measured": f"Ny={ny_south:+.3f}",
            "passed": pass_south,
        })

        # 4. Complete Mipmap chain down to 1x1 (resolution-adaptive)
        reader_dem = DDSReader(dem_path)
        reader_hydro = DDSReader(hydro_path)
        exp_mips_dem = math.floor(math.log2(max(reader_dem.width, reader_dem.height))) + 1
        exp_mips_hydro = math.floor(math.log2(max(reader_hydro.width, reader_hydro.height))) + 1
        exp_mips_norm = math.floor(math.log2(max(reader_norm.width, reader_norm.height))) + 1
        pass_mips = (
            reader_dem.num_mips == exp_mips_dem and
            reader_hydro.num_mips == exp_mips_hydro and
            reader_norm.num_mips == exp_mips_norm
        )
        diag_results.append({
            "check": "Complete Mip Chain Down to 1x1",
            "criterion": f"DEM={exp_mips_dem}, Hydro={exp_mips_hydro}, Norm={exp_mips_norm}",
            "measured": f"DEM={reader_dem.num_mips}, Hydro={reader_hydro.num_mips}, Norm={reader_norm.num_mips}",
            "passed": pass_mips,
        })

        # 5. Multi-resolution Toksvig sampling stability (Mip 2 sampling)
        r_nx2, r_ny2 = reader_norm.sample_lat_lon(28.0381, 86.9250, mip_level=2)
        nx_m2 = (r_nx2 / 255.0) * 2.0 - 1.0
        ny_m2 = (r_ny2 / 255.0) * 2.0 - 1.0
        pass_toksvig = (nx_m2 ** 2 + ny_m2 ** 2) <= 1.0
        diag_results.append({
            "check": "Mip 2 Filtered Vector Toksvig Bounded",
            "criterion": "||(Nx, Ny)|| <= 1.0",
            "measured": f"||N||={math.sqrt(nx_m2**2 + ny_m2**2):.3f}",
            "passed": pass_toksvig,
        })
    except Exception as ex:
        diag_results.append({
            "check": "Normal / Mip Diagnostic Checks",
            "criterion": "Zero exceptions",
            "measured": f"ERROR: {ex}",
            "passed": False,
        })

    # -----------------------------------------------------------------------
    # Render Structured Comparison Table
    # -----------------------------------------------------------------------
    print(f"\n{'GATE':<14} | {'TARGET PROBE':<36} | {'EXPECTED CRITERION':<22} | {'DECODED / MEASURED':<20} | {'STATUS'}")
    print("-" * 105)
    for r in results:
        status_str = "PASS [OK]" if r["passed"] else "FAIL [X]"
        print(f"{r['gate']:<14} | {r['target']:<36} | {r['expected']:<22} | {r['measured']:<20} | {status_str}")
    print("-" * 105)

    print(f"\n{'DIAGNOSTIC CHECK':<38} | {'CRITERION':<30} | {'MEASURED':<22} | {'STATUS'}")
    print("-" * 105)
    for d in diag_results:
        d_status = "PASS [OK]" if d["passed"] else "FAIL [X]"
        print(f"{d['check']:<38} | {d['criterion']:<30} | {d['measured']:<22} | {d_status}")
    print("-" * 105)

    if all_passed and all(d["passed"] for d in diag_results):
        print("\n>>> ALL 5 NUMERICAL ASSERTION GATES & DIAGNOSTIC PROBES PASSED AUTOMATED VERIFICATION <<<")
        print("Authoritative calibration confirmed across global elevation, hydrography, normals, and VRAM budget.\n")
        sys.exit(0)
    elif all_passed:
        print("\n>>> ALL 5 PRIMARY NUMERICAL ASSERTION GATES PASSED <<<")
        print("Authoritative calibration confirmed across global elevation, hydrography, and VRAM budget.\n")
        sys.exit(0)
    else:
        print("\n>>> VERIFICATION FAILED: ONE OR MORE NUMERICAL GATES DID NOT PASS <<<")
        sys.exit(1)


if __name__ == "__main__":
    main()
