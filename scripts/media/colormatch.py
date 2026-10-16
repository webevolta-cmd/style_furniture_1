"""Match keyframe colour to the finished reference.

1. Fit a per-channel linear map (gain/offset) on regions that must not change
   between keyframes (ceiling, curtains, floor, rug) and apply it globally.
2. Optionally pull the wall-panel colour toward the reference panel colour with a
   soft, colour-keyed mask restricted to the back-wall rectangle.
Usage: colormatch.py ref.png in.png out.png W H "static rects" ["wall rect"] [wall_target r,g,b]
Rects are fractions x0,y0,x1,y1 separated by ';'.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

ref_p, in_p, out_p, W, H, static = sys.argv[1:7]
W, H = int(W), int(H)
wall = sys.argv[7] if len(sys.argv) > 7 and sys.argv[7] else None
wall_target = np.array([float(v) for v in sys.argv[8].split(',')]) if len(sys.argv) > 8 else None

def load(p):
    im = Image.open(p).convert('RGB')
    # cover-resize to exact W x H
    s = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    l = (im.width - W) // 2; t = (im.height - H) // 2
    return np.asarray(im.crop((l, t, l + W, t + H))).astype(np.float64)

def rects(spec):
    out = []
    for r in spec.split(';'):
        x0, y0, x1, y1 = [float(v) for v in r.split(',')]
        out.append((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)))
    return out

ref = load(ref_p); img = load(in_p)
mask = np.zeros((H, W), bool)
for x0, y0, x1, y1 in rects(static):
    mask[y0:y1, x0:x1] = True
res = img.copy()
for c in range(3):
    a = img[..., c][mask]; b = ref[..., c][mask]
    A = np.vstack([a, np.ones_like(a)]).T
    g, o = np.linalg.lstsq(A, b, rcond=None)[0]
    res[..., c] = img[..., c] * g + o
    print(f'ch{c}: gain={g:.3f} offset={o:.1f}')

if wall and wall_target is not None:
    (x0, y0, x1, y1), = rects(wall)
    region = res[y0:y1, x0:x1]
    # key on pixels close to the median wall colour (excludes furniture in front of it)
    med = np.median(region.reshape(-1, 3), axis=0)
    d = np.linalg.norm(res - med, axis=2)
    key = np.clip(1 - (d - 18) / 22, 0, 1)
    rect = np.zeros((H, W)); rect[y0:y1, x0:x1] = 1
    rect_img = Image.fromarray((rect * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(W * 0.01))
    soft = np.asarray(rect_img).astype(np.float64) / 255 * key
    soft = np.asarray(Image.fromarray((soft * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))).astype(np.float64) / 255
    shift = wall_target - med
    res = res + soft[..., None] * shift
    print('wall median', med.round(1), '-> target', wall_target, 'shift', shift.round(1))

Image.fromarray(np.clip(res, 0, 255).round().astype(np.uint8)).save(out_p)
