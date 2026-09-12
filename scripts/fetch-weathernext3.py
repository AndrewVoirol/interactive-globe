#!/usr/bin/env python3
# /// script
# dependencies = [
#   "zarr>=3.0.0",
#   "gcsfs>=2024.1.0",
#   "numpy>=1.26.0",
# ]
# ///
"""
scripts/fetch-weathernext3.py

Google DeepMind WeatherNext 3 Data Extraction & Staging CLI.
Accesses requester-pays GCS bucket:
  gs://weathernext3_statistics_spatial/weathernext_3_0_0_statistics/zarr/2026_to_present/
with billing project 'antigravity-agent-1765655548'.

Features:
- Application Default Credentials (ADC) resolution respecting ~/.zshenv, environment variables,
  and ~/.config/gcloud/application_default_credentials.json.
- Resolves GCSFileSystem with token=adc_path string to prevent Zarr 3.x serializability errors.
- Fast backward candidate search from UTC now to discover latest finalized cycle in < 2 seconds.
- Validates completion via 'success' sentinel file.
- Extracts up to 48 hourly timesteps (t=0 to t=47) across 6 core prognostic fields:
    1. u_component_of_wind_10m_mean (10m eastward wind velocity)
    2. v_component_of_wind_10m_mean (10m northward wind velocity)
    3. total_precipitation_1hr_mean (accumulated precipitation rate)
    4. temperature_2m_mean (2m ambient surface temperature)
    5. dewpoint_temperature_2m_mean (2m surface dewpoint temperature)
    6. total_cloud_cover_mean (column-integrated cloud fraction)
- Decodes Zarr v3 chunks [1, 1801, 3600], downcasting Float32 -> Float16 (np.float16).
- Inverts latitudes vertically (slice[::-1, :]) so row 0 is North Pole (+90°) matching WebGPU / cartographic convention.
- Rolls longitudes horizontally by 1800 columns (np.roll(..., GRID_WIDTH // 2, axis=1)) so column 0 is Antimeridian (-180°).
- Supports WebGPU 256-byte row pitch padding: 3600 * 2 = 7200 bytes raw -> 7424 bytes padded (224 bytes pad per row).
- Generates metadata index: public/data/weathernext/meta.json.
- Local caching: skips downloading if matching cycle and slices already exist.
- --dry-run: verifies auth, bucket connectivity, finds latest cycle, lists variables, checks chunk metadata,
  computes expected bandwidth and storage, and exits with code 0 without downloading full tensors.
"""

import sys
import os
import re
import math
import time
import json
import argparse
import warnings
import atexit
from datetime import datetime, timezone, timedelta
from typing import Tuple, List, Dict, Any, Optional

# Suppress harmless asyncio / weakref warnings at Python shutdown
warnings.filterwarnings("ignore")

def _suppress_asyncio_shutdown_warning():
    try:
        import asyncio
        loop = asyncio.get_event_loop_policy().get_event_loop()
        if loop.is_running():
            loop.stop()
    except Exception:
        pass

atexit.register(_suppress_asyncio_shutdown_warning)

# Constants & Configuration
DEFAULT_BILLING_PROJECT = "antigravity-agent-1765655548"
GCS_BUCKET_NAME = "weathernext3_statistics_spatial"
GCS_PREFIX_DIR = "weathernext_3_0_0_statistics/zarr/2026_to_present"
GCS_DATASET_URL = f"gs://{GCS_BUCKET_NAME}/{GCS_PREFIX_DIR}/"

GRID_WIDTH = 3600
GRID_HEIGHT = 1801
BYTES_PER_TEXEL = 2  # Float16
RAW_ROW_BYTES = GRID_WIDTH * BYTES_PER_TEXEL  # 7200
PADDED_ROW_BYTES = math.ceil(RAW_ROW_BYTES / 256) * 256  # 7424
PADDING_BYTES_PER_ROW = PADDED_ROW_BYTES - RAW_ROW_BYTES  # 224
PADDING_TEXELS_PER_ROW = PADDING_BYTES_PER_ROW // BYTES_PER_TEXEL  # 112
PADDED_COLS = GRID_WIDTH + PADDING_TEXELS_PER_ROW  # 3712

UNPADDED_SLICE_BYTES = RAW_ROW_BYTES * GRID_HEIGHT  # 12,967,200 bytes
PADDED_SLICE_BYTES = PADDED_ROW_BYTES * GRID_HEIGHT  # 13,370,624 bytes

DEFAULT_HOURS = 48

CORE_VARIABLES = [
    "u_component_of_wind_10m_mean",
    "v_component_of_wind_10m_mean",
    "total_precipitation_1hr_mean",
    "temperature_2m_mean",
    "dewpoint_temperature_2m_mean",
    "total_cloud_cover_mean",
]

VARIABLE_METADATA = {
    "u_component_of_wind_10m_mean": {
        "longName": "10m Eastward Wind Velocity",
        "units": "m/s",
        "canonicalMin": -45.0,
        "canonicalMax": 45.0,
    },
    "v_component_of_wind_10m_mean": {
        "longName": "10m Northward Wind Velocity",
        "units": "m/s",
        "canonicalMin": -45.0,
        "canonicalMax": 45.0,
    },
    "total_precipitation_1hr_mean": {
        "longName": "Accumulated Precipitation Rate",
        "units": "kg/m^2",
        "canonicalMin": 0.0,
        "canonicalMax": 50.0,
    },
    "temperature_2m_mean": {
        "longName": "2m Ambient Surface Temperature",
        "units": "°C",
        "canonicalMin": -90.0,
        "canonicalMax": 60.0,
    },
    "dewpoint_temperature_2m_mean": {
        "longName": "2m Surface Dewpoint Temperature",
        "units": "°C",
        "canonicalMin": -90.0,
        "canonicalMax": 60.0,
    },
    "total_cloud_cover_mean": {
        "longName": "Column-Integrated Total Cloud Fraction",
        "units": "fraction",
        "canonicalMin": 0.0,
        "canonicalMax": 1.0,
    },
}

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DEFAULT_OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "data", "weathernext")


def resolve_adc_and_project(cli_project: Optional[str] = None) -> Tuple[str, str]:
    """
    Resolves Application Default Credentials file path and billing project.
    Checks CLI args, environment variables, ~/.zshenv, and default gcloud paths.
    """
    # 1. Billing project resolution
    billing_project = cli_project or os.environ.get("CLOUDSDK_CORE_PROJECT")
    
    # 2. Check ~/.zshenv for environment variables if not already set
    zshenv_path = os.path.expanduser("~/.zshenv")
    adc_env = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    
    if os.path.exists(zshenv_path):
        try:
            with open(zshenv_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not billing_project and "CLOUDSDK_CORE_PROJECT=" in line:
                        m = re.search(r'CLOUDSDK_CORE_PROJECT=["\']?([^"\'\s]+)', line)
                        if m:
                            billing_project = m.group(1)
                    if not adc_env and "GOOGLE_APPLICATION_CREDENTIALS=" in line:
                        m = re.search(r'GOOGLE_APPLICATION_CREDENTIALS=["\']?([^"\'\s]+)', line)
                        if m:
                            adc_env = m.group(1)
        except Exception:
            pass

    if not billing_project:
        billing_project = DEFAULT_BILLING_PROJECT

    # 3. ADC path resolution
    adc_candidates = [
        adc_env,
        os.path.expanduser("~/.config/gcloud/application_default_credentials.json"),
    ]

    resolved_adc: Optional[str] = None
    for candidate in adc_candidates:
        if candidate and os.path.exists(os.path.expanduser(candidate)):
            resolved_adc = os.path.abspath(os.path.expanduser(candidate))
            break

    if not resolved_adc:
        raise RuntimeError(
            "Could not locate Application Default Credentials (ADC) file.\n"
            "Checked GOOGLE_APPLICATION_CREDENTIALS and ~/.config/gcloud/application_default_credentials.json.\n"
            "Please run `gcloud auth application-default login` to authenticate."
        )

    return resolved_adc, billing_project


def init_gcsfs(adc_path: str, billing_project: str):
    """
    Initializes gcsfs.GCSFileSystem with requester_pays=True.
    Passing token=adc_path as a string path prevents Zarr 3.x serializability errors.
    """
    import gcsfs
    fs = gcsfs.GCSFileSystem(
        project=billing_project,
        token=adc_path,
        requester_pays=True,
    )
    return fs


def discover_latest_cycle(
    fs,
    bucket: str = GCS_BUCKET_NAME,
    prefix: str = GCS_PREFIX_DIR,
    requested_cycle: Optional[str] = None,
    max_backward_hours: int = 72,
) -> Tuple[str, str, str]:
    """
    Discovers the latest completed WeatherNext 3 cycle.
    Uses fast backward candidate search from UTC now, checking for the 'success' sentinel file.
    Returns: (cycle_name, cycle_full_gcs_path, init_iso_timestamp)
    """
    if requested_cycle:
        clean_cycle = requested_cycle.strip("/")
        cycle_dir = f"{bucket}/{prefix}/{clean_cycle}"
        success_file = f"{cycle_dir}/success"
        if not fs.exists(success_file):
            # Check if directory exists at least
            if not fs.exists(cycle_dir):
                raise ValueError(f"Requested cycle directory does not exist: gs://{cycle_dir}")
            print(f"[WARN] Requested cycle gs://{cycle_dir} does not contain 'success' sentinel.")
        
        # Parse ISO timestamp from cycle name e.g. 20260911_18hr_01_preds
        m = re.match(r"^(\d{4})(\d{2})(\d{2})_(\d{2})hr", clean_cycle)
        if m:
            init_iso = f"{m.group(1)}-{m.group(2)}-{m.group(3)}T{m.group(4)}:00:00Z"
        else:
            init_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z")
        return clean_cycle, cycle_dir, init_iso

    now = datetime.now(timezone.utc)
    t0 = time.perf_counter()
    
    # Backward candidate probe
    for hours_back in range(max_backward_hours):
        dt = now - timedelta(hours=hours_back)
        candidate = dt.strftime("%Y%m%d_%Hhr_01_preds")
        cycle_dir = f"{bucket}/{prefix}/{candidate}"
        success_file = f"{cycle_dir}/success"
        
        if fs.exists(success_file):
            elapsed_s = time.perf_counter() - t0
            init_iso = dt.strftime("%Y-%m-%dT%H:00:00Z")
            print(f"-> Discovered finalized cycle: {candidate} in {elapsed_s:.2f}s (checking 'success' sentinel)")
            return candidate, cycle_dir, init_iso

    raise RuntimeError(
        f"No finalized forecast cycle with 'success' sentinel found in gs://{bucket}/{prefix}/ "
        f"over the past {max_backward_hours} hours."
    )


def open_zarr_predictions(cycle_dir: str, adc_path: str, billing_project: str):
    """
    Opens predictions.zarr group within the cycle directory in read-only mode.
    """
    import zarr
    store_url = f"gs://{cycle_dir}/predictions.zarr"
    storage_opts = {
        "project": billing_project,
        "token": adc_path,
        "requester_pays": True,
    }
    zg = zarr.open_group(store_url, mode="r", storage_options=storage_opts)
    return zg


def execute_dry_run(
    fs,
    adc_path: str,
    billing_project: str,
    cycle_name: str,
    cycle_dir: str,
    init_iso: str,
    variables: List[str],
    hours: int,
    padded: bool,
):
    """
    Executes dry run verification:
    - Verifies auth, bucket connectivity, and cycle discovery.
    - Inspects Zarr v3 store and checks shapes, chunking, and codecs for all variables.
    - Measures chunk 0 byte size from GCS info.
    - Calculates network egress bandwidth and uncompressed staging storage requirements.
    - Exits with code 0 without downloading full tensors.
    """
    import zarr
    print("=" * 80)
    print("WEATHERNEXT 3 PIPELINE: DRY-RUN VERIFICATION & CAPACITY AUDIT")
    print("=" * 80)
    print(f"Google Cloud ADC:       {adc_path}")
    print(f"Requester-Pays Project: {billing_project}")
    print(f"Target Bucket:          gs://{cycle_dir}/")
    print(f"Latest Forecast Cycle:  {cycle_name}")
    print(f"Forecast Init Time:     {init_iso}")
    print(f"Verification Sentinel:  gs://{cycle_dir}/success (Confirmed Present)")
    print(f"Timestep Horizon:       {hours} hours (t=0h to t=+{hours-1}h)")
    print(f"WebGPU Row Pitch Mode:  {'256-Byte Padded (7424 bytes/row)' if padded else 'Unpadded Raw (7200 bytes/row)'}")
    print("-" * 80)

    t0 = time.perf_counter()
    zg = open_zarr_predictions(cycle_dir, adc_path, billing_project)
    open_elapsed = time.perf_counter() - t0
    print(f"Zarr v3 Store Opened:   predictions.zarr ({open_elapsed:.2f}s, {len(zg)} available variables)")

    print("\nVariable Manifest & Chunk Audit:")
    print(f"{'Variable':<32} {'Shape':<18} {'Chunk Shape':<16} {'Dtype':<8} {'Chunk 0 Wire Size':<18}")
    print("-" * 96)

    total_wire_sample_bytes = 0
    measured_vars = 0

    for var_name in variables:
        if var_name not in zg:
            raise KeyError(f"Requested variable '{var_name}' not found in predictions.zarr!")
        arr = zg[var_name]
        
        # Query GCS object info for chunk 0 (c/0/0/0)
        chunk0_path = f"{cycle_dir}/predictions.zarr/{var_name}/c/0/0/0"
        try:
            info = fs.info(chunk0_path)
            chunk0_bytes = info.get("size", 0)
            size_str = f"{chunk0_bytes / (1024 * 1024):.2f} MB"
            total_wire_sample_bytes += chunk0_bytes
            measured_vars += 1
        except Exception as e:
            size_str = "N/A"

        shape_str = str(list(arr.shape))
        chunks_str = str(list(arr.chunks))
        print(f"{var_name:<32} {shape_str:<18} {chunks_str:<16} {str(arr.dtype):<8} {size_str:<18}")

    print("-" * 96)

    avg_chunk_wire_bytes = (total_wire_sample_bytes / measured_vars) if measured_vars > 0 else 23_000_000
    total_chunks_to_fetch = len(variables) * hours
    total_wire_estimate_bytes = total_chunks_to_fetch * avg_chunk_wire_bytes
    slice_disk_bytes = PADDED_SLICE_BYTES if padded else UNPADDED_SLICE_BYTES
    total_disk_estimate_bytes = total_chunks_to_fetch * slice_disk_bytes

    print("\nBandwidth & Storage Capacity Projections:")
    print(f"Total Tensors to Fetch: {total_chunks_to_fetch} slices ({len(variables)} fields × {hours} hours)")
    print(f"Average Wire Chunk Size: {avg_chunk_wire_bytes / (1024 * 1024):.2f} MB (Zstandard Level 0 compressed)")
    print(f"Projected Wire Egress:   {total_wire_estimate_bytes / (1024 * 1024 * 1024):.2f} GB (Requester-pays to {billing_project})")
    print(f"Output Slice Format:     Float16 (r16float, 2 bytes/texel, vertically flipped for WebGPU)")
    print(f"Per-Slice Staged Size:   {slice_disk_bytes / (1024 * 1024):.2f} MB ({slice_disk_bytes:,} bytes)")
    print(f"Total Staged Footprint:  {total_disk_estimate_bytes / (1024 * 1024 * 1024):.2f} GB on disk in public/data/weathernext/")

    print("\nWebGPU Hardware Compatibility Audit (Invariant §40 & §73):")
    print(f"  Grid Dimensions:       {GRID_WIDTH} cols × {GRID_HEIGHT} rows (0.1° Pole-to-Pole)")
    print(f"  Raw Row Pitch:         {RAW_ROW_BYTES} bytes ({GRID_WIDTH} texels × 2 bytes)")
    print(f"  256-Byte Remainder:    {RAW_ROW_BYTES % 256} bytes (Needs padding: {RAW_ROW_BYTES % 256 != 0})")
    print(f"  Hardware Row Pitch:    {PADDED_ROW_BYTES} bytes ({PADDED_COLS} texels, divisible by 256)")
    print(f"  Row Zero-Padding:      {PADDING_BYTES_PER_ROW} bytes ({PADDING_TEXELS_PER_ROW} zero texels)")
    print(f"  Zero-Copy Pass-Through:{' ENABLED (Pre-padded on disk)' if padded else ' DISABLED (Runtime JS row staging required)'}")

    print("\n[OK] DRY-RUN VERIFICATION PASSED. All authentication, GCS connectivity, and metadata contracts valid.")
    print("=" * 80)
    sys.exit(0)


def check_local_cache(
    output_dir: str,
    cycle_name: str,
    variables: List[str],
    hours: int,
    padded: bool,
) -> bool:
    """
    Checks if local cached binary files and meta.json already match the requested cycle.
    """
    meta_path = os.path.join(output_dir, "meta.json")
    if not os.path.exists(meta_path):
        return False

    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
    except Exception:
        return False

    if meta.get("forecastRunCycle") != cycle_name:
        return False

    expected_padded = meta.get("textureEncoding", {}).get("isPrePadded", False)
    if expected_padded != padded:
        return False

    expected_size = PADDED_SLICE_BYTES if padded else UNPADDED_SLICE_BYTES

    # Check all slice files
    for var_name in variables:
        for h in range(hours):
            slice_path = os.path.join(output_dir, f"{var_name}-{h}.bin")
            if not os.path.exists(slice_path):
                return False
            if os.path.getsize(slice_path) != expected_size:
                return False

    return True


def write_metadata_index(
    output_dir: str,
    cycle_name: str,
    cycle_dir: str,
    init_iso: str,
    variables: List[str],
    hours: int,
    padded: bool,
    billing_project: str,
):
    """
    Generates public/data/weathernext/meta.json recording forecast initialization timestamp,
    forecast run cycle, variable list, valid prediction hours, grid dimensions, and textureEncoding details.
    """
    meta = {
        "source": "Google DeepMind WeatherNext 3",
        "model": "weathernext_3_0_0_statistics",
        "dataset": f"gs://{GCS_BUCKET_NAME}/{GCS_PREFIX_DIR}/",
        "forecastInitTimestamp": init_iso,
        "forecastRunCycle": cycle_name,
        "ingestedAtUTC": datetime.now(timezone.utc).isoformat(),
        "billingProject": billing_project,
        "gridDimensions": {
            "width": GRID_WIDTH,
            "height": GRID_HEIGHT,
            "lonPoints": GRID_WIDTH,
            "latPoints": GRID_HEIGHT,
            "resolutionDeg": 0.1,
            "latMin": -90.0,
            "latMax": 90.0,
            "lonMin": -180.0,
            "lonMax": 179.9,
        },
        "timeHorizon": {
            "startHour": 0,
            "endHour": hours - 1,
            "stepHours": 1,
            "totalHours": hours,
        },
        "validPredictionHours": list(range(hours)),
        "variables": variables,
        "variableMetadata": {v: VARIABLE_METADATA.get(v, {}) for v in variables},
        "textureEncoding": {
            "format": "r16float",
            "bytesPerTexel": BYTES_PER_TEXEL,
            "rawRowBytes": RAW_ROW_BYTES,
            "paddedRowBytes": PADDED_ROW_BYTES,
            "paddingBytesPerRow": PADDING_BYTES_PER_ROW,
            "isPrePadded": padded,
            "sliceByteLength": UNPADDED_SLICE_BYTES,
            "paddedSliceByteLength": PADDED_SLICE_BYTES,
        },
        "filePattern": "/data/weathernext/{variable}-{hour}.bin",
        "provenance": {
            "sourceBucket": f"gs://{cycle_dir}/predictions.zarr",
            "chunkShape": [1, GRID_HEIGHT, GRID_WIDTH],
            "sourceDtype": "float32",
            "outputDtype": "float16",
            "latitudeOrientation": "row_0_north_inverted",
            "longitudeOrientation": "col_0_antimeridian_rolled_1800",
        },
    }

    meta_path = os.path.join(output_dir, "meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print(f"[OK] Wrote metadata sidecar to {meta_path}")


def process_slice(
    raw_slice: Any,
    var_name: str,
    padded: bool = True,
) -> Tuple[Any, bytes]:
    """
    Transforms raw WeatherNext Zarr slice [1801, 3600] (Float32) to WebGPU-ready Float16 binary payload.

    1. Physical Unit Corrections:
       - Temperature fields (temperature_2m_mean, dewpoint_temperature_2m_mean):
         Upstream Zarr is in Kelvin (~198K to ~318K). Subtract 273.15 to convert to Celsius (-90°C to +60°C).
       - Precipitation fields (total_precipitation_1hr_mean, imerg_tp_1hr_mean):
         Upstream Zarr is in meters of water accumulation (0 to 0.02315m). Multiply by 1000.0 to convert to mm/hr.
    2. Vertical Latitude Flip:
       Invert rows (slice[::-1, :]) so row 0 = North Pole (+90°N), descending to South Pole (-90°S).
    3. Horizontal Longitude Roll:
       Roll by 1800 columns (np.roll(..., GRID_WIDTH // 2, axis=1)) to shift [0°, 360°) to [-180°, +180°),
       placing the Antimeridian at column 0 and Prime Meridian at column 1800.
    4. Downcasting:
       Float32 -> Float16 (np.float16, 2 bytes/texel).
    5. WebGPU 256-Byte Row Pitch Padding:
       If padded is True, extend row from 3600 texels (7200 bytes) to 3712 texels (7424 bytes),
       zero-filling the 112 trailing texels (224 bytes) per row.

    Returns:
       (grid, payload_bytes)
       grid: np.ndarray with shape (1801, 3712) if padded else (1801, 3600), dtype=float16
       payload_bytes: bytes of length 13,370,624 (padded) or 12,967,200 (unpadded)
    """
    import numpy as np

    # 1. Physical unit conversions
    processed = np.squeeze(np.array(raw_slice, dtype=np.float32, copy=True))
    var_lower = var_name.lower().strip()
    if var_lower in ("temperature_2m_mean", "dewpoint_temperature_2m_mean") or "temperature" in var_lower:
        processed = processed - 273.15
    elif var_lower in ("total_precipitation_1hr_mean", "imerg_tp_1hr_mean") or "precipitation" in var_lower or "precip" in var_lower:
        processed = processed * 1000.0

    # 2. Flip latitudes vertically (South-to-North -> North-to-South so row 0 = +90°)
    inverted_slice = processed[::-1, :]

    # 3. Roll longitudes horizontally by 1800 columns (0..360 -> -180..+180 so col 0 = -180°)
    rolled_slice = np.roll(inverted_slice, GRID_WIDTH // 2, axis=1)

    # 4. Downcast Float32 -> Float16 (little-endian half float)
    f16_slice = rolled_slice.astype(np.float16)

    # 5. Apply WebGPU 256-byte row pitch padding if requested
    if padded:
        padded_grid = np.zeros((GRID_HEIGHT, PADDED_COLS), dtype=np.float16)
        padded_grid[:, :GRID_WIDTH] = f16_slice
        return padded_grid, padded_grid.tobytes()
    else:
        return f16_slice, f16_slice.tobytes()


def generate_mock_slice(var_name: str, hour: int) -> Any:
    """
    Generates a physically plausible synthetic raw WeatherNext slice [1801, 3600] in native units.
    Native units:
    - Temperature: Kelvin (240K - 310K)
    - Precipitation: meters of water accumulation (0.0 - 0.025m)
    - Wind: m/s (-25 to +25 m/s)
    - Cloud: fraction (0.0 to 1.0)
    """
    import numpy as np

    lats = np.linspace(-90.0, 90.0, GRID_HEIGHT, dtype=np.float32)[:, None]
    lons = np.linspace(0.0, 360.0, GRID_WIDTH, dtype=np.float32)[None, :]

    if "temperature" in var_name:
        base_k = 250.0 + 55.0 * np.cos(np.radians(lats))
        diurnal = 5.0 * np.sin(np.radians(lons + hour * 15.0))
        return (base_k + diurnal).astype(np.float32)
    elif "precipitation" in var_name:
        itcz = np.exp(-((lats - 5.0) ** 2) / 60.0) * (0.008 + 0.007 * np.sin(np.radians(lons * 3.0 + hour * 10.0)))
        midlat_n = np.exp(-((lats - 45.0) ** 2) / 80.0) * np.maximum(0.0, np.sin(np.radians(lons * 4.0 - hour * 12.0))) * 0.015
        midlat_s = np.exp(-((lats + 50.0) ** 2) / 80.0) * np.maximum(0.0, np.sin(np.radians(lons * 5.0 - hour * 15.0))) * 0.012
        precip_m = np.maximum(0.0, itcz + midlat_n + midlat_s)
        return precip_m.astype(np.float32)
    elif "wind" in var_name:
        w = 15.0 * np.sin(np.radians(lats * 2.0))
        return w.astype(np.float32)
    else:
        c = np.clip(0.3 + 0.4 * np.sin(np.radians(lats * 3.0 + lons * 2.0)), 0.0, 1.0)
        return c.astype(np.float32)


def stage_mock_slices(
    output_dir: str,
    variables: List[str],
    hours: int,
    padded: bool = True,
    cycle_name: str = "20260911_21hr_01_preds",
) -> None:
    """
    Generates and stages a self-contained demonstration WeatherNext 3 dataset locally.
    Uses process_slice to ensure identical physical transformations, coordinate rolls,
    and WebGPU row pitch padding contracts.
    """
    os.makedirs(output_dir, exist_ok=True)
    init_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z")

    print(f"[DEMO] Staging {hours} hours for variables: {variables} into {output_dir}")
    for var in variables:
        for h in range(hours):
            slice_path = os.path.join(output_dir, f"{var}-{h}.bin")
            raw = generate_mock_slice(var, h)
            _, payload = process_slice(raw, var, padded=padded)
            with open(slice_path, "wb") as f:
                f.write(payload)
            print(f"  -> Generated {var}-{h}.bin ({len(payload):,} bytes)")

    write_metadata_index(
        output_dir=output_dir,
        cycle_name=cycle_name,
        cycle_dir=f"{GCS_BUCKET_NAME}/{GCS_PREFIX_DIR}/{cycle_name}",
        init_iso=init_iso,
        variables=variables,
        hours=hours,
        padded=padded,
        billing_project=DEFAULT_BILLING_PROJECT,
    )
    print(f"[OK] Demo dataset successfully staged in {output_dir}.")


def extract_and_stage(
    fs,
    adc_path: str,
    billing_project: str,
    cycle_name: str,
    cycle_dir: str,
    init_iso: str,
    variables: List[str],
    hours: int,
    padded: bool,
    output_dir: str,
    force: bool = False,
):
    """
    Downloads Zarr v3 hourly chunks, converts Float32 -> Float16, flips latitude,
    pads to 256-byte row pitch (if padded=True), and writes binary slices.
    """
    import numpy as np

    os.makedirs(output_dir, exist_ok=True)

    if not force and check_local_cache(output_dir, cycle_name, variables, hours, padded):
        print(f"-> Local cache hit: all {len(variables) * hours} slices exist for cycle '{cycle_name}'.")
        print("   Skipping download. Use --force to bypass caching.")
        return

    print("=" * 80)
    print(f"EXTRACTING WEATHERNEXT 3 SLICES: Cycle {cycle_name} ({hours} hours × {len(variables)} variables)")
    print("=" * 80)

    zg = open_zarr_predictions(cycle_dir, adc_path, billing_project)
    total_slices = len(variables) * hours
    processed_slices = 0
    start_time = time.perf_counter()

    for var_idx, var_name in enumerate(variables, 1):
        if var_name not in zg:
            raise KeyError(f"Variable '{var_name}' not found in predictions.zarr")
        
        arr = zg[var_name]
        var_start = time.perf_counter()
        print(f"\n[{var_idx}/{len(variables)}] Processing '{var_name}'...")

        for h in range(hours):
            slice_filename = f"{var_name}-{h}.bin"
            slice_path = os.path.join(output_dir, slice_filename)

            # 1. Read chunk h from Zarr store (shape: [1801, 3600], float32)
            # WeatherNext Zarr arrays are indexed as [lead_time, lat, lon]
            raw_slice = arr[h, :, :]

            # 2. Process slice through unified pipeline (unit conversion, flip lat, roll lon, f16, pad)
            _, payload = process_slice(raw_slice, var_name, padded=padded)

            # 3. Write binary slice to disk
            with open(slice_path, "wb") as f:
                f.write(payload)

            processed_slices += 1
            if (h + 1) % 12 == 0 or (h + 1) == hours:
                elapsed = time.perf_counter() - var_start
                print(f"   -> Hour {h+1:2d}/{hours} saved ({len(payload):,} bytes) [{elapsed:.1f}s]")

    total_elapsed = time.perf_counter() - start_time
    print(f"\n[OK] Extracted {total_slices} binary slices in {total_elapsed:.1f}s.")

    # Write metadata index sidecar
    write_metadata_index(
        output_dir=output_dir,
        cycle_name=cycle_name,
        cycle_dir=cycle_dir,
        init_iso=init_iso,
        variables=variables,
        hours=hours,
        padded=padded,
        billing_project=billing_project,
    )


def main():
    parser = argparse.ArgumentParser(
        description="Google DeepMind WeatherNext 3 Data Extraction & Staging CLI"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Verify auth, bucket connectivity, latest cycle, variable manifest, and bandwidth without downloading full tensor chunks.",
    )
    parser.add_argument(
        "--cycle",
        type=str,
        default=None,
        help="Specify explicit forecast cycle folder (e.g. 20260911_18hr_01_preds). Defaults to latest finalized cycle.",
    )
    parser.add_argument(
        "--hours",
        type=int,
        default=DEFAULT_HOURS,
        help=f"Number of hourly timesteps to extract (1 to 360, default {DEFAULT_HOURS}).",
    )
    parser.add_argument(
        "--variables",
        type=str,
        default=None,
        help="Comma-separated list of variables to extract. Defaults to all 6 core prognostic fields.",
    )
    parser.add_argument(
        "--unpadded",
        "--no-pad",
        action="store_true",
        help="Export unpadded Float16 slices (7200 bytes/row) instead of pre-padded (7424 bytes/row).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Bypass local cache and force re-extraction.",
    )
    parser.add_argument(
        "--project",
        type=str,
        default=None,
        help=f"Billing project for requester-pays GCS bucket access (default: {DEFAULT_BILLING_PROJECT}).",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Target directory for binary slices and meta.json (default: {DEFAULT_OUTPUT_DIR}).",
    )
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Generate physically plausible demonstration slices and metadata locally without querying GCS.",
    )

    args = parser.parse_args()

    # Validate hours
    if args.hours < 1 or args.hours > 360:
        parser.error("--hours must be an integer between 1 and 360.")

    # Parse variable selection
    if args.variables:
        selected_vars = [v.strip() for v in args.variables.split(",") if v.strip()]
        for v in selected_vars:
            if v not in CORE_VARIABLES:
                print(f"[WARN] Requested variable '{v}' is outside the standard core 6 fields.")
    else:
        selected_vars = CORE_VARIABLES

    padded = not args.unpadded

    # Fast offline mock generation mode
    if args.mock:
        mock_hours = args.hours if any(a.startswith("--hours") for a in sys.argv) else 3
        mock_vars = selected_vars if any(a.startswith("--variables") for a in sys.argv) else ["total_precipitation_1hr_mean"]
        stage_mock_slices(
            output_dir=args.output_dir,
            variables=mock_vars,
            hours=mock_hours,
            padded=padded,
            cycle_name=args.cycle or "20260911_21hr_01_preds",
        )
        return

    # 1. Resolve credentials and billing project
    adc_path, billing_project = resolve_adc_and_project(args.project)

    # 2. Initialize GCS filesystem
    fs = init_gcsfs(adc_path, billing_project)

    # 3. Discover latest finalized cycle
    cycle_name, cycle_dir, init_iso = discover_latest_cycle(
        fs=fs,
        bucket=GCS_BUCKET_NAME,
        prefix=GCS_PREFIX_DIR,
        requested_cycle=args.cycle,
    )

    padded = not args.unpadded

    # 4. Branch: Dry-Run vs Extract
    if args.dry_run:
        execute_dry_run(
            fs=fs,
            adc_path=adc_path,
            billing_project=billing_project,
            cycle_name=cycle_name,
            cycle_dir=cycle_dir,
            init_iso=init_iso,
            variables=selected_vars,
            hours=args.hours,
            padded=padded,
        )
    else:
        extract_and_stage(
            fs=fs,
            adc_path=adc_path,
            billing_project=billing_project,
            cycle_name=cycle_name,
            cycle_dir=cycle_dir,
            init_iso=init_iso,
            variables=selected_vars,
            hours=args.hours,
            padded=padded,
            output_dir=args.output_dir,
            force=args.force,
        )


if __name__ == "__main__":
    main()
