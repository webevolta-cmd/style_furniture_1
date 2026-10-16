"""Blend an aligned variant into the base through a fixed product mask.
usage: apply_mask.py base.png variant_raw.png mask.png out.png [feather]"""
import sys
import numpy as np
from PIL import Image, ImageFilter
base_p, var_p, mask_p, out_p = sys.argv[1:5]
feather = float(sys.argv[5]) if len(sys.argv) > 5 else 1.5
base = Image.open(base_p).convert('RGB'); W, H = base.size
B = np.asarray(base).astype(np.float64)
V = np.asarray(Image.open(var_p).convert('RGB').resize((W, H), Image.LANCZOS)).astype(np.float64)
best = (1e9, 0, 0)
for dy in range(-6, 7):
    for dx in range(-6, 7):
        e = np.abs(np.roll(np.roll(V, dy, 0), dx, 1)[::9, ::9] - B[::9, ::9]).mean()
        if e < best[0]: best = (e, dx, dy)
V = np.roll(np.roll(V, best[2], 0), best[1], 1)
m = np.asarray(Image.open(mask_p).convert('L').filter(ImageFilter.GaussianBlur(feather))).astype(np.float64)[..., None] / 255
out = B * (1 - m) + V * m
Image.fromarray(np.clip(out, 0, 255).round().astype(np.uint8)).save(out_p)
print(out_p, 'shift', best[1:], 'residual', round(best[0], 2))
