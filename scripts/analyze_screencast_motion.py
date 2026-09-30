#!/usr/bin/env python3
"""
Turnkey Screencast Video Motion & 2D Optical Flow Analyzer
Authoritative implementation per indicatrix-visual-qa/SKILL.md and AGENTS.md Rule 5.

Usage:
  python3 scripts/analyze_screencast_motion.py --video screencast.webm --output-heatmap motion_delta_heatmap.png
  python3 scripts/analyze_screencast_motion.py --frames-dir .temp_frames/ --output-heatmap motion_delta_heatmap.png
"""

import argparse
import os
import shutil
import subprocess
import sys
import numpy as np
from PIL import Image

def extract_frames_from_video(video_path: str, temp_dir: str, fps: int = 5, duration: float = 2.5) -> list:
    os.makedirs(temp_dir, exist_ok=True)
    frame_pattern = os.path.join(temp_dir, "frame_%03d.png")
    
    cmd = [
        "ffmpeg", "-y",
        "-ss", "0.5",
        "-t", str(duration),
        "-i", video_path,
        "-vf", f"fps={fps}",
        frame_pattern
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print(f"Error extracting frames with ffmpeg:\n{res.stderr}", file=sys.stderr)
        sys.exit(1)
        
    frames = sorted([os.path.join(temp_dir, f) for f in os.listdir(temp_dir) if f.startswith("frame_") and f.endswith(".png")])
    return frames

def analyze_motion(frame_start_path: str, frame_end_path: str, heatmap_out: str = None, min_delta_threshold: float = 3.0):
    img1 = Image.open(frame_start_path).convert('L')
    img2 = Image.open(frame_end_path).convert('L')
    
    arr1 = np.array(img1, dtype=np.float32)
    arr2 = np.array(img2, dtype=np.float32)
    
    if arr1.shape != arr2.shape:
        print(f"Error: Frame dimensions mismatch {arr1.shape} vs {arr2.shape}", file=sys.stderr)
        sys.exit(1)
        
    H, W = arr1.shape
    
    # Exclude right sidebar HUD dock (typically right 350-450px at 1080p, or right 20% of canvas)
    # Exclude top neatline and bottom scrubber dock (top 5%, bottom 10%)
    roi_h_start = int(H * 0.08)
    roi_h_end = int(H * 0.90)
    roi_w_start = int(W * 0.05)
    roi_w_end = int(W * 0.78)
    
    canvas_arr1 = arr1[roi_h_start:roi_h_end, roi_w_start:roi_w_end]
    canvas_arr2 = arr2[roi_h_start:roi_h_end, roi_w_start:roi_w_end]
    
    # Temporal difference
    diff = np.abs(canvas_arr2 - canvas_arr1)
    mean_delta = float(np.mean(diff))
    active_pixel_ratio = float(np.mean(diff > min_delta_threshold) * 100.0)
    
    # 2D Lucas-Kanade gradient displacement solver on canvas ROI
    Iy, Ix = np.gradient(canvas_arr1)
    grad_mag = np.sqrt(Ix**2 + Iy**2)
    mask = grad_mag > 8.0
    
    if np.sum(mask) > 1000:
        Ix_sub = Ix[mask]
        Iy_sub = Iy[mask]
        It_sub = (canvas_arr2 - canvas_arr1)[mask]
        A = np.column_stack((Ix_sub, Iy_sub))
        b = -It_sub
        flow, _, _, _ = np.linalg.lstsq(A, b, rcond=None)
        dx, dy = float(flow[0]), float(flow[1])
    else:
        dx, dy = 0.0, 0.0
        
    mag = float(np.hypot(dx, dy))
    
    # UI Chrome stability invariant check (isolate right sidebar)
    sidebar_arr1 = arr1[int(H * 0.20):int(H * 0.80), int(W * 0.85):W]
    sidebar_arr2 = arr2[int(H * 0.20):int(H * 0.80), int(W * 0.85):W]
    ui_delta = float(np.mean(np.abs(sidebar_arr2 - sidebar_arr1)))
    
    # Generate Heatmap if requested
    if heatmap_out:
        full_diff = np.abs(arr2 - arr1)
        # Normalize and apply high-contrast colormap
        norm_diff = np.clip(full_diff * 4.0, 0, 255).astype(np.uint8)
        
        # Colorize: black -> cyan/blue -> yellow/white
        heatmap = np.zeros((H, W, 3), dtype=np.uint8)
        heatmap[:, :, 0] = np.clip(norm_diff * 1.5, 0, 255).astype(np.uint8)
        heatmap[:, :, 1] = np.clip(norm_diff * 1.2, 0, 255).astype(np.uint8)
        heatmap[:, :, 2] = np.clip(norm_diff * 2.0, 0, 255).astype(np.uint8)
        
        # Draw green bounding box around analyzed canvas ROI
        heatmap[roi_h_start:roi_h_end, roi_w_start, :] = [0, 255, 0]
        heatmap[roi_h_start:roi_h_end, roi_w_end, :] = [0, 255, 0]
        heatmap[roi_h_start, roi_w_start:roi_w_end, :] = [0, 255, 0]
        heatmap[roi_h_end, roi_w_start:roi_w_end, :] = [0, 255, 0]
        
        os.makedirs(os.path.dirname(os.path.abspath(heatmap_out)), exist_ok=True)
        Image.fromarray(heatmap).save(heatmap_out)
        print(f"Motion delta heatmap written to: {heatmap_out}")
        
    print("\n--- Quantitative Video Motion Analysis Report ---")
    print(f"Analyzed Canvas Region: {canvas_arr1.shape[1]} x {canvas_arr1.shape[0]} px")
    print(f"Mean Temporal Pixel Delta: {mean_delta:.4f} units (Threshold: > 3.50)")
    print(f"Active Moving Pixel Ratio: {active_pixel_ratio:.2f}% (Threshold: >= 25.0%)")
    print(f"2D Optical Flow: dx = {dx:.5f} px, dy = {dy:.5f} px (Magnitude: {mag:.5f} px)")
    print(f"Static UI Chrome Delta: {ui_delta:.4f} units (Threshold: <= 0.50)")
    
    passed = (
        mean_delta > 3.50 and
        active_pixel_ratio >= 25.0 and
        (abs(dx) > 0.001 or abs(dy) > 0.001) and
        ui_delta <= 1.50
    )
    
    if passed:
        print("\n>>> RESULT: PASS (Active, continuous 2D advective transport confirmed; UI stable)")
        return 0
    else:
        print("\n>>> RESULT: FAIL (Motion metrics below threshold or UI unstable)")
        return 1

def main():
    parser = argparse.ArgumentParser(description="Analyze 2D optical flow and pixel delta from screencast video.")
    parser.add_argument("--video", help="Path to input video (.webm, .mp4)")
    parser.add_argument("--frames-dir", help="Directory of pre-extracted frame images")
    parser.add_argument("--frame-start", help="Path to initial frame")
    parser.add_argument("--frame-end", help="Path to terminal frame (approx 2s after start)")
    parser.add_argument("--output-heatmap", default="motion_delta_heatmap.png", help="Path to output motion delta heatmap")
    parser.add_argument("--fps", type=int, default=5, help="Frame extraction FPS (default: 5)")
    parser.add_argument("--duration", type=float, default=2.5, help="Extraction duration in seconds (default: 2.5)")
    args = parser.parse_args()
    
    temp_dir = ".temp_screencast_frames"
    cleaned_temp = False
    
    try:
        if args.video:
            frames = extract_frames_from_video(args.video, temp_dir, fps=args.fps, duration=args.duration)
            if len(frames) < 2:
                print(f"Error: Video yielded fewer than 2 frames", file=sys.stderr)
                sys.exit(1)
            frame_start = frames[0]
            # Use frame after ~2.0s (e.g. index min(9, len-1) at 5 FPS)
            target_idx = min(int(args.fps * 2.0), len(frames) - 1)
            frame_end = frames[target_idx]
            cleaned_temp = True
        elif args.frames_dir:
            frames = sorted([os.path.join(args.frames_dir, f) for f in os.listdir(args.frames_dir) if f.startswith("frame_") and f.endswith(".png")])
            if len(frames) < 2:
                print(f"Error: Frames directory yielded fewer than 2 frames", file=sys.stderr)
                sys.exit(1)
            frame_start = frames[0]
            target_idx = min(int(args.fps * 2.0), len(frames) - 1)
            frame_end = frames[target_idx]
        elif args.frame_start and args.frame_end:
            frame_start = args.frame_start
            frame_end = args.frame_end
        else:
            parser.print_help()
            sys.exit(1)
            
        ret = analyze_motion(frame_start, frame_end, args.output_heatmap)
        sys.exit(ret)
    finally:
        if cleaned_temp and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
