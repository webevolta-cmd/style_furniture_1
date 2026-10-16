"""Build one product mask from the strong changes shared by several recoloured variants.
usage: master_mask.py base.png out_mask.png "x0,y0,x1,y1" thr var1.png var2.png [...]
"""
import sys
import numpy as np
from PIL import Image, ImageFilter, ImageCms

base_p, out_p, region, thr = sys.argv[1:5]
thr = float(thr)
vars_ = sys.argv[5:]
base = Image.open(base_p).convert('RGB'); W, H = base.size
to_lab = ImageCms.buildTransform(ImageCms.createProfile('sRGB'), ImageCms.createProfile('LAB'), 'RGB', 'LAB')
def lab(im):
    a = np.asarray(ImageCms.applyTransform(im, to_lab)).astype(np.float64)
    a[..., 0] *= 100 / 255; a[..., 1] -= 128; a[..., 2] -= 128
    return a
Lb = lab(base)
acc = np.ones((H, W), bool)
for v in vars_:
    im = Image.open(v).convert('RGB').resize((W, H), Image.LANCZOS)
    a = np.asarray(im)
    # same alignment search as composite_variant (vertical/horizontal integer shift)
    B = np.asarray(base).astype(np.float64)
    best = (1e9, 0, 0)
    for dy in range(-6, 7):
        for dx in range(-6, 7):
            e = np.abs(np.roll(np.roll(a.astype(np.float64), dy, 0), dx, 1)[::9, ::9] - B[::9, ::9]).mean()
            if e < best[0]: best = (e, dx, dy)
    a = np.roll(np.roll(a, best[2], 0), best[1], 1)
    d = np.sqrt(((Lb - lab(Image.fromarray(a))) ** 2).sum(-1))
    acc &= d > thr
x0, y0, x1, y1 = [float(v) for v in region.split(',')]
reg = np.zeros((H, W), bool); reg[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)] = True
m = Image.fromarray(((acc & reg) * 255).astype(np.uint8))
m = m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))      # drop speckle
m = m.filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.MinFilter(11))    # fill holes in fabric
m = m.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
m.save(out_p)
print('coverage', round(np.asarray(m).mean() / 2.55, 2), '%')
