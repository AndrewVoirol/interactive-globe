#!/usr/bin/env python3
"""
scripts/fetch-real-gfs.py
Ingests live operational NOAA GFS 0.25° high-resolution global atmospheric fields directly from NOAA NOMADS.
Extracts:
  1. 10m Surface Wind (UGRD, VGRD) -> public/data/gfs-wind-latest.bin (4,152,960 bytes, 1440x721)
  2. 250 hPa Jet Stream Wind (UGRD, VGRD) -> public/data/gfs-jetstream-latest.bin (4,152,960 bytes, 1440x721)
  3. Multi-stratum Composite -> public/data/gfs-multistratum-latest.bin (8,305,920 bytes, 1440x721x4)
  4. Low Cloud Cover (LCDC) -> public/data/gfs-cloud-low-latest.bin (2,076,480 bytes, 1440x721, float16)
  5. Mid Cloud Cover (MCDC) -> public/data/gfs-cloud-mid-latest.bin (2,076,480 bytes, 1440x721, float16)
  6. High Cloud Cover (HCDC) -> public/data/gfs-cloud-high-latest.bin (2,076,480 bytes, 1440x721, float16)
  7. Provenance Metadata -> public/data/gfs-wind-meta.json
"""

import sys
import os
import json
import argparse
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta
import numpy as np
import eccodes

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "data")
os.makedirs(OUTPUT_DIR, exist_ok=True)

NOMADS_FILTER_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"

def find_latest_gfs_cycle():
    """Finds the most recent available NOAA GFS 0.25° operational cycle."""
    now_utc = datetime.now(timezone.utc)
    candidates = []
    
    # Check last 3 days in reverse chronological order
    for day_offset in range(3):
        dt = now_utc - timedelta(days=day_offset)
        date_str = dt.strftime("%Y%m%d")
        for cycle in ["18", "12", "06", "00"]:
            candidates.append((date_str, cycle))
            
    print(f"Scanning NOAA NOMADS for latest available 0.25° GFS cycle...")
    for date_str, cycle in candidates:
        test_url = (
            f"{NOMADS_FILTER_URL}?file=gfs.t{cycle}z.pgrb2.0p25.f000"
            f"&lev_10_m_above_ground=on&var_UGRD=on"
            f"&dir=%2Fgfs.{date_str}%2F{cycle}%2Fatmos"
        )
        try:
            req = urllib.request.Request(
                test_url,
                headers={"User-Agent": "Indicatrix-NOAA-Ingestion/1.0"}
            )
            with urllib.request.urlopen(req, timeout=6) as response:
                content_desc = response.headers.get("Content-Description", "")
                content_len = int(response.headers.get("Content-Length", 0))
                # Check if it returns a grib2 file
                if response.status == 200 and ("grib" in content_desc.lower() or content_len > 1000):
                    print(f"-> Found available NOAA GFS 0.25° cycle: {date_str} {cycle}Z")
                    return date_str, cycle
        except Exception as e:
            continue
            
    raise RuntimeError("No available NOAA GFS 0.25° cycle found on NOMADS in the last 72 hours.")

def download_grib(date_str: str, cycle: str, level_param: str, temp_path: str):
    url = (
        f"{NOMADS_FILTER_URL}?file=gfs.t{cycle}z.pgrb2.0p25.f000"
        f"&{level_param}&var_UGRD=on&var_VGRD=on"
        f"&dir=%2Fgfs.{date_str}%2F{cycle}%2Fatmos"
    )
    print(f"Downloading 0.25° grid from NOAA NOMADS: {level_param} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "Indicatrix-NOAA-Ingestion/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
        if len(data) < 10000:
            raise RuntimeError(f"Download returned insufficient data ({len(data)} bytes) from {url}")
        with open(temp_path, "wb") as f:
            f.write(data)
    print(f"-> Saved {len(data):,} bytes to {temp_path}")

def parse_uv_from_grib(grib_path: str):
    """Parses U and V component fields from 0.25° GRIB2 file using eccodes."""
    u_field = None
    v_field = None
    
    with open(grib_path, "rb") as f:
        while True:
            gid = eccodes.codes_grib_new_from_file(f)
            if gid is None:
                break
            short_name = eccodes.codes_get(gid, "shortName")
            ni = eccodes.codes_get(gid, "Ni")
            nj = eccodes.codes_get(gid, "Nj")
            
            if ni != 1440 or nj != 721:
                eccodes.codes_release(gid)
                raise ValueError(f"Unexpected grid dimensions: {ni}x{nj}, expected 1440x721")
                
            vals = eccodes.codes_get_values(gid)
            grid = np.array(vals, dtype=np.float32).reshape((nj, ni))
            
            if "u" in short_name.lower():
                u_field = grid
            elif "v" in short_name.lower():
                v_field = grid
                
            eccodes.codes_release(gid)
            
    if u_field is None or v_field is None:
        raise RuntimeError(f"Failed to find both U and V fields in {grib_path}")
        
    return u_field, v_field

def download_clouds_grib(date_str: str, cycle: str, temp_path: str):
    """Downloads LCDC, MCDC, and HCDC 0.25° cloud grids from NOAA NOMADS in a single request."""
    url = (
        f"{NOMADS_FILTER_URL}?file=gfs.t{cycle}z.pgrb2.0p25.f000"
        f"&lev_low_cloud_layer=on&var_LCDC=on"
        f"&lev_middle_cloud_layer=on&var_MCDC=on"
        f"&lev_high_cloud_layer=on&var_HCDC=on"
        f"&dir=%2Fgfs.{date_str}%2F{cycle}%2Fatmos"
    )
    print(f"Downloading 0.25° cloud grids from NOAA NOMADS (LCDC, MCDC, HCDC) ...")
    req = urllib.request.Request(url, headers={"User-Agent": "Indicatrix-NOAA-Ingestion/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
        if len(data) < 10000:
            raise RuntimeError(f"Download returned insufficient data ({len(data)} bytes) from {url}")
        with open(temp_path, "wb") as f:
            f.write(data)
    print(f"-> Saved {len(data):,} bytes of cloud GRIB2 data to {temp_path}")

def parse_clouds_from_grib(grib_path: str):
    """Parses LCDC, MCDC, HCDC fields from 0.25° GRIB2 file using eccodes."""
    low_field = None
    mid_field = None
    high_field = None

    with open(grib_path, "rb") as f:
        while True:
            gid = eccodes.codes_grib_new_from_file(f)
            if gid is None:
                break
            short_name = eccodes.codes_get(gid, "shortName")
            ni = eccodes.codes_get(gid, "Ni")
            nj = eccodes.codes_get(gid, "Nj")

            if ni != 1440 or nj != 721:
                eccodes.codes_release(gid)
                raise ValueError(f"Unexpected grid dimensions: {ni}x{nj}, expected 1440x721")

            vals = eccodes.codes_get_values(gid)
            grid = np.array(vals, dtype=np.float32).reshape((nj, ni))

            # Normalize percentage [0..100] to [0.0..1.0]
            norm_grid = np.clip(grid / 100.0, 0.0, 1.0)

            type_of_level = ""
            try:
                type_of_level = eccodes.codes_get(gid, "typeOfLevel")
            except Exception:
                pass

            if short_name == "lcc" or type_of_level == "lowCloudLayer" or "low" in short_name.lower():
                low_field = norm_grid
            elif short_name == "mcc" or type_of_level == "middleCloudLayer" or "mid" in short_name.lower() or "medium" in short_name.lower():
                mid_field = norm_grid
            elif short_name == "hcc" or type_of_level == "highCloudLayer" or "high" in short_name.lower():
                high_field = norm_grid

            eccodes.codes_release(gid)

    if low_field is None or mid_field is None or high_field is None:
        missing = []
        if low_field is None: missing.append("LCDC/lcc")
        if mid_field is None: missing.append("MCDC/mcc")
        if high_field is None: missing.append("HCDC/hcc")
        raise RuntimeError(f"Missing cloud fields in {grib_path}: {missing}")

    return low_field, mid_field, high_field

def fetch_wind(date_str: str, cycle: str):
    """Fetches, packs, and writes surface, jetstream, and multistratum wind fields."""
    surf_grib = "/tmp/gfs_surf_0p25_latest.grib2"
    jet_grib = "/tmp/gfs_jet_0p25_latest.grib2"

    # 1. Download Surface Wind (10m above ground)
    download_grib(date_str, cycle, "lev_10_m_above_ground=on", surf_grib)
    u_surf, v_surf = parse_uv_from_grib(surf_grib)

    # 2. Download Jet Stream (250 hPa)
    download_grib(date_str, cycle, "lev_250_mb=on", jet_grib)
    u_jet, v_jet = parse_uv_from_grib(jet_grib)

    # Dimensions: 721 latitudes (90 to -90 at 0.25°), 1440 longitudes (0 to 359.75 at 0.25°)
    nj, ni = u_surf.shape

    # 3. Pack Surface Grid (u, v in float16) -> 1440x721x2 = 1,038,240 pairs = 4,152,960 bytes
    surf_packed = np.zeros((nj, ni, 2), dtype="<f2")
    surf_packed[:, :, 0] = u_surf.astype("<f2")
    surf_packed[:, :, 1] = v_surf.astype("<f2")

    surf_bin_path = os.path.join(OUTPUT_DIR, "gfs-wind-latest.bin")
    with open(surf_bin_path, "wb") as f:
        f.write(surf_packed.tobytes())
    print(f"[OK] Wrote 0.25° surface wind grid: {os.path.getsize(surf_bin_path):,} bytes to {surf_bin_path}")

    # 4. Pack Jet Stream Grid (u, v in float16) -> 4,152,960 bytes
    jet_packed = np.zeros((nj, ni, 2), dtype="<f2")
    jet_packed[:, :, 0] = u_jet.astype("<f2")
    jet_packed[:, :, 1] = v_jet.astype("<f2")

    jet_bin_path = os.path.join(OUTPUT_DIR, "gfs-jetstream-latest.bin")
    with open(jet_bin_path, "wb") as f:
        f.write(jet_packed.tobytes())
    print(f"[OK] Wrote 0.25° jet stream grid: {os.path.getsize(jet_bin_path):,} bytes to {jet_bin_path}")

    # 5. Pack Multi-Stratum Grid (u_surf, v_surf, u_jet, v_jet) -> 8,305,920 bytes
    multi_packed = np.zeros((nj, ni, 4), dtype="<f2")
    multi_packed[:, :, 0] = u_surf.astype("<f2")
    multi_packed[:, :, 1] = v_surf.astype("<f2")
    multi_packed[:, :, 2] = u_jet.astype("<f2")
    multi_packed[:, :, 3] = v_jet.astype("<f2")

    multi_bin_path = os.path.join(OUTPUT_DIR, "gfs-multistratum-latest.bin")
    with open(multi_bin_path, "wb") as f:
        f.write(multi_packed.tobytes())
    print(f"[OK] Wrote 0.25° multi-stratum grid: {os.path.getsize(multi_bin_path):,} bytes to {multi_bin_path}")

    # Calculate statistics
    speed_surf = np.hypot(u_surf, v_surf)
    speed_jet = np.hypot(u_jet, v_jet)

    meta = {
        "source": "NOAA NCEP Global Forecast System (GFS) 0.25° Operational Grid",
        "provenance": "Live NOMADS 0.25° Ingestion",
        "modelRunDate": date_str,
        "modelRunCycle": f"{cycle}Z",
        "forecastHour": "f000 (Analysis / Real-Time Initialization)",
        "ingestedAtUTC": datetime.now(timezone.utc).isoformat(),
        "gridDimensions": {"lonPoints": ni, "latPoints": nj, "resolutionDeg": 0.25},
        "surfaceWindStats": {
            "maxSpeedMps": float(np.max(speed_surf)),
            "meanSpeedMps": float(np.mean(speed_surf)),
            "uMin": float(np.min(u_surf)),
            "uMax": float(np.max(u_surf)),
            "vMin": float(np.min(v_surf)),
            "vMax": float(np.max(v_surf)),
        },
        "jetStreamStats": {
            "maxSpeedMps": float(np.max(speed_jet)),
            "meanSpeedMps": float(np.mean(speed_jet)),
            "uMin": float(np.min(u_jet)),
            "uMax": float(np.max(u_jet)),
            "vMin": float(np.min(v_jet)),
            "vMax": float(np.max(v_jet)),
        }
    }

    meta_path = os.path.join(OUTPUT_DIR, "gfs-wind-meta.json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"[OK] Wrote 0.25° metadata to {meta_path}")
    print(f"0.25° Surface Wind: Max {meta['surfaceWindStats']['maxSpeedMps']:.1f} m/s, Mean {meta['surfaceWindStats']['meanSpeedMps']:.1f} m/s")
    print(f"0.25° Jet Stream:   Max {meta['jetStreamStats']['maxSpeedMps']:.1f} m/s, Mean {meta['jetStreamStats']['meanSpeedMps']:.1f} m/s")

def fetch_clouds(date_str: str, cycle: str):
    """Fetches, normalizes, and writes LCDC, MCDC, and HCDC cloud fraction grids."""
    clouds_grib = "/tmp/gfs_clouds_0p25_latest.grib2"
    download_clouds_grib(date_str, cycle, clouds_grib)
    low, mid, high = parse_clouds_from_grib(clouds_grib)

    # Pack as float16 little-endian arrays (<f2)
    # Total size per file: 1440 * 721 * 1 * 2 = 2,076,480 bytes
    low_bin_path = os.path.join(OUTPUT_DIR, "gfs-cloud-low-latest.bin")
    mid_bin_path = os.path.join(OUTPUT_DIR, "gfs-cloud-mid-latest.bin")
    high_bin_path = os.path.join(OUTPUT_DIR, "gfs-cloud-high-latest.bin")

    low_packed = low.astype("<f2")
    mid_packed = mid.astype("<f2")
    high_packed = high.astype("<f2")

    with open(low_bin_path, "wb") as f:
        f.write(low_packed.tobytes())
    print(f"[OK] Wrote 0.25° low cloud grid: {os.path.getsize(low_bin_path):,} bytes to {low_bin_path}")

    with open(mid_bin_path, "wb") as f:
        f.write(mid_packed.tobytes())
    print(f"[OK] Wrote 0.25° mid cloud grid: {os.path.getsize(mid_bin_path):,} bytes to {mid_bin_path}")

    with open(high_bin_path, "wb") as f:
        f.write(high_packed.tobytes())
    print(f"[OK] Wrote 0.25° high cloud grid: {os.path.getsize(high_bin_path):,} bytes to {high_bin_path}")

    print(f"0.25° Low Clouds:  Min {float(np.min(low)):.3f}, Mean {float(np.mean(low)):.3f}, Max {float(np.max(low)):.3f}")
    print(f"0.25° Mid Clouds:  Min {float(np.min(mid)):.3f}, Mean {float(np.mean(mid)):.3f}, Max {float(np.max(mid)):.3f}")
    print(f"0.25° High Clouds: Min {float(np.min(high)):.3f}, Mean {float(np.mean(high)):.3f}, Max {float(np.max(high)):.3f}")

def main():
    parser = argparse.ArgumentParser(description="Ingests live operational NOAA GFS 0.25° atmospheric data from NOMADS.")
    parser.add_argument("--clouds", action="store_true", help="Fetch cloud fraction layers (LCDC, MCDC, HCDC)")
    parser.add_argument("--wind", action="store_true", help="Fetch wind velocity layers (Surface, Jet Stream, Multi-Stratum)")
    parser.add_argument("--all", action="store_true", help="Fetch both wind and cloud layers")
    args = parser.parse_args()

    # Default to wind if neither clouds nor all is specified (backward-compatible)
    do_clouds = args.clouds or args.all
    do_wind = args.wind or args.all or (not args.clouds and not args.all)

    date_str, cycle = find_latest_gfs_cycle()

    if do_wind:
        fetch_wind(date_str, cycle)

    if do_clouds:
        fetch_clouds(date_str, cycle)

if __name__ == "__main__":
    main()
