#!/usr/bin/env python3
"""
Precomputation script to generate public/earth-elevation-dem.webp
Packs NASA / GEBCO global topography (R) and bathymetry (G) with land mask (B)
and normalized signed elevation (A) into a single unified 2048x1024 DEM texture.
"""

import os
import urllib.request
from PIL import Image
import numpy as np

ELEV_URL = "https://assets.science.nasa.gov/dynamicimage/assets/science/esd/eo/images/bmng/topography/gebco_08_rev_elev_5400x2700.jpg?w=2048&h=1024&fit=crop"
BATH_URL = "https://assets.science.nasa.gov/dynamicimage/assets/science/esd/eo/images/bmng/bathymetry/gebco_08_rev_bath_5400x2700.jpg?w=2048&h=1024&fit=crop"

def main():
    tmp_elev = "/tmp/gebco_test.jpg"
    tmp_bath = "/tmp/gebco_bath.jpg"

    if not os.path.exists(tmp_elev):
        print("Fetching land elevation from NASA Earth Observatory...")
        urllib.request.urlretrieve(ELEV_URL, tmp_elev)

    if not os.path.exists(tmp_bath):
        print("Fetching ocean bathymetry from NASA Earth Observatory...")
        urllib.request.urlretrieve(BATH_URL, tmp_bath)

    print("Compositing DEM texture...")
    elev = np.array(Image.open(tmp_elev).convert('L'), dtype=np.float32)
    bath = np.array(Image.open(tmp_bath).convert('L'), dtype=np.float32)

    is_land = (elev > 2.0).astype(np.float32)

    r = np.clip(elev, 0, 255).astype(np.uint8)
    g = np.clip(bath, 0, 255).astype(np.uint8)
    b = (is_land * 255.0).astype(np.uint8)

    signed_elev = np.where(is_land > 0.5, (elev / 255.0) * 8848.0, - (1.0 - bath / 255.0) * 11000.0)
    norm_elev = signed_elev / 11000.0
    a = np.clip((norm_elev * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)

    rgba = np.stack([r, g, b, a], axis=-1)
    out_img = Image.fromarray(rgba, 'RGBA')

    os.makedirs('public', exist_ok=True)
    out_img.save('public/earth-elevation-dem.webp', quality=95, method=6)
    out_img.save('public/earth-elevation-dem.png', optimize=True)
    print("Done! Generated public/earth-elevation-dem.webp and public/earth-elevation-dem.png")

if __name__ == '__main__':
    main()
