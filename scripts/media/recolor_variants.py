"""Colour-selector previews: recolour the real product photo inside a precise, soft upholstery matte.

The Higgsfield (Nano Banana 2) renders in media-src/config/raw/ are used only as *references*:
  1. the matte is where most renders changed the photo (robust to one render's stray edits),
     limited to hand-drawn product regions, cleaned of specks and filled across seams;
  2. each finish's colour is learned from its render as a curve of the original lightness
     (L*) -> target L*, a*, b*, and applied to the ORIGINAL photo, so texture, seams, folds,
     shading and geometry stay those of the real photograph (no generated texture or specks).
'black' has no render: it is derived from the darkest render (graphite / charcoal).

usage: PYTHONPATH=<dir with opencv-python-headless> python3 scripts/media/recolor_variants.py
Writes media-src/config/<product>-<finish>.jpg and <product>-mask.png.
"""
import glob
import os

import cv2
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SRC = os.path.join(ROOT, 'media-src')
CFG = os.path.join(SRC, 'config')

PRODUCTS = {
    'bed': {
        'base': lambda: cv2.imread(os.path.join(CFG, 'bed-base.jpg')),
        'base_finish': 'ivory',
        'finishes': ['sand', 'mocha', 'olive', 'graphite', 'terracotta'],
        'dark': 'graphite',
        # matte = pixels changed by (all but one of) the renders, threshold in delta-E
        'rank': 1, 'thr': 7,
        # regions that may be recoloured (fractions of width/height): headboard, bed frame + legs
        'regions': [
            [(0.17, 0.06), (0.86, 0.06), (0.86, 0.31), (0.17, 0.31)],
            [(0.15, 0.455), (0.885, 0.455), (0.885, 0.70), (0.15, 0.70)],
        ],
        # never recolour: duvet/throw band and the bench (separate products)
        'exclude': [
            [(0.15, 0.295), (0.885, 0.295), (0.885, 0.462), (0.15, 0.462)],
            [(0.222, 0.462), (0.803, 0.462), (0.803, 0.76), (0.222, 0.76)],
        ],
        # fine detail in front of the fabric (dried flowers): soft difference matte only, no hole filling
        'detail': [[(0.10, 0.02), (0.32, 0.02), (0.32, 0.31), (0.10, 0.31)]],
    },
    'armchair': {
        'base': lambda: armchair_base(),
        'base_finish': 'taupe',
        'finishes': ['ivory', 'emerald', 'terracotta', 'charcoal', 'dustyblue'],
        'dark': 'charcoal',
        # dark renders sit close to the taupe in deep shadow: two agreeing renders are enough
        'rank': -2, 'thr': 9,
        'regions': [[(0.0, 0.19), (0.93, 0.19), (0.93, 0.83), (0.0, 0.83)]],
        'exclude': [],
        'detail': [],
    },
}


def armchair_base():
    """Real clinic photo crop (same framing as the previous 851x1063 preview) at 1.5x resolution."""
    m = cv2.imread(os.path.join(SRC, 'photos/upscaled/clinic.jpg'))
    crop = m[1342:4000, 10:2138]
    return cv2.resize(crop, (1276, 1594), interpolation=cv2.INTER_AREA)


def to_lab(img):
    return cv2.cvtColor(img.astype(np.float32) / 255, cv2.COLOR_BGR2LAB)


def from_lab(lab):
    return np.clip(cv2.cvtColor(lab.astype(np.float32), cv2.COLOR_LAB2BGR) * 255, 0, 255)


def align(ref, img):
    """Affine ECC on gradient magnitude (insensitive to the colour change itself)."""
    def grad(x):
        g = cv2.GaussianBlur(cv2.cvtColor(x, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.5)
        return cv2.magnitude(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
    s = 0.5
    a = cv2.resize(grad(ref), None, fx=s, fy=s)
    b = cv2.resize(grad(img), None, fx=s, fy=s)
    warp = np.eye(2, 3, dtype=np.float32)
    try:
        _, warp = cv2.findTransformECC(a, b, warp, cv2.MOTION_AFFINE,
                                       (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-7), None, 5)
    except cv2.error:
        pass
    warp[:, 2] /= s
    h, w = ref.shape[:2]
    return cv2.warpAffine(img, warp, (w, h), flags=cv2.INTER_LANCZOS4 | cv2.WARP_INVERSE_MAP,
                          borderMode=cv2.BORDER_REPLICATE)


def poly_mask(shape, polys):
    h, w = shape[:2]
    m = np.zeros((h, w), np.uint8)
    for p in polys:
        cv2.fillPoly(m, [np.array([(x * w, y * h) for x, y in p], np.int32)], 255)
    return m


def build_matte(base, renders, cfg):
    lb = to_lab(base)
    de = np.stack([np.linalg.norm(to_lab(r) - lb, axis=2) for r in renders])
    ranked = np.sort(de, axis=0)
    de2 = cv2.GaussianBlur(ranked[cfg['rank']], (0, 0), 1.2)
    hard = (de2 > cfg['thr']).astype(np.uint8) * 255
    hard &= poly_mask(base.shape, cfg['regions'])
    if cfg['exclude']:
        hard &= 255 - poly_mask(base.shape, cfg['exclude'])
    # drop specks, then fill pinholes inside the fabric (not gaps wider than a few px)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(hard, 8)
    keep = np.zeros_like(hard)
    min_area = 0.002 * hard.size
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            keep[lab == i] = 255
    keep = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    inv = 255 - keep
    n, lab, stats, _ = cv2.connectedComponentsWithStats(inv, 4)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 0.0015 * hard.size:
            keep[lab == i] = 255
    # smooth, anti-aliased edge that follows the real contour (guided by the soft difference)
    soft = np.clip((de2 - cfg['thr'] + 3) / 8, 0, 1)
    edge = cv2.GaussianBlur(keep.astype(np.float32) / 255, (0, 0), 1.0)
    core = cv2.erode(keep, np.ones((5, 5), np.uint8)).astype(np.float32) / 255
    alpha = np.maximum(core, np.minimum(edge, np.maximum(soft, edge * 0.85)))
    if cfg['detail']:
        zone = cv2.GaussianBlur(poly_mask(base.shape, cfg['detail']).astype(np.float32) / 255, (0, 0), 6)
        allowed = poly_mask(base.shape, cfg['regions']).astype(np.float32) / 255
        fine = np.clip((cv2.GaussianBlur(ranked[cfg['rank']], (0, 0), 0.7) - 6) / 8, 0, 1) * allowed
        alpha = alpha * (1 - zone) + fine * zone
    return np.clip(alpha, 0, 1)


def learn_curve(lb, lr, inside):
    """Median target L*a*b* per original-L* bin, smoothed; L kept monotonic."""
    L = lb[..., 0][inside]
    bins = np.arange(0, 101, 2.0)
    idx = np.clip(np.digitize(L, bins) - 1, 0, len(bins) - 2)
    out = np.full((len(bins) - 1, 3), np.nan)
    for k in range(len(bins) - 1):
        sel = idx == k
        if sel.sum() >= 40:
            out[k] = np.median(lr[inside][sel], axis=0)
    centers = (bins[:-1] + bins[1:]) / 2
    ok = ~np.isnan(out[:, 0])
    for c in range(3):
        out[:, c] = np.interp(centers, centers[ok], out[ok, c])
        out[:, c] = np.convolve(np.pad(out[:, c], 3, mode='edge'), np.ones(7) / 7, mode='valid')
    out[:, 0] = np.maximum.accumulate(out[:, 0])
    return centers, out


def apply_curve(lb, centers, curve, base_curve, chroma_keep=0.35):
    L = lb[..., 0]
    res = np.empty_like(lb)
    for c in range(3):
        res[..., c] = np.interp(L, centers, curve[:, c])
    # keep a little of the photo's own colour variation (reflections, fibre colour)
    for c in (1, 2):
        own = np.interp(L, centers, base_curve[:, c])
        res[..., c] += chroma_keep * (lb[..., c] - own)
    return res


def main():
    for product, cfg in PRODUCTS.items():
        base = cfg['base']()
        h, w = base.shape[:2]
        renders = {}
        for f in cfg['finishes']:
            path = sorted(glob.glob(os.path.join(CFG, 'raw', f'{product}-{f}.*')))[0]
            r = cv2.resize(cv2.imread(path), (w, h), interpolation=cv2.INTER_AREA)
            renders[f] = align(base, r)
        alpha = build_matte(base, list(renders.values()), cfg)
        cv2.imwrite(os.path.join(CFG, f'{product}-mask.png'), (alpha * 255).astype(np.uint8))
        lb = to_lab(base)
        inside = cv2.erode((alpha > 0.98).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
        centers, base_curve = learn_curve(lb, lb, inside)
        curves = {}
        for f, r in renders.items():
            centers, curves[f] = learn_curve(lb, to_lab(r), inside)
        # black: darker and more neutral than the darkest render, sheen preserved
        dark = curves[cfg['dark']].copy()
        black = dark.copy()
        black[:, 0] = 4 + (dark[:, 0] - dark[:, 0].min()) * 0.62
        black[:, 1] = dark[:, 1] * 0.25 + 0.4
        black[:, 2] = dark[:, 2] * 0.25 + 0.6
        curves['black'] = black
        a3 = alpha[..., None]
        cv2.imwrite(os.path.join(CFG, f"{product}-{cfg['base_finish']}.jpg"), base, [cv2.IMWRITE_JPEG_QUALITY, 95])
        for f, curve in curves.items():
            rec = from_lab(apply_curve(lb, centers, curve, base_curve, 0.2 if f == 'black' else 0.35))
            out = base.astype(np.float32) * (1 - a3) + rec * a3
            cv2.imwrite(os.path.join(CFG, f'{product}-{f}.jpg'), np.clip(out, 0, 255).astype(np.uint8),
                        [cv2.IMWRITE_JPEG_QUALITY, 95])
        print(product, 'matte coverage', round(float(alpha.mean()) * 100, 1), '%', 'finishes', list(curves))


if __name__ == '__main__':
    main()
