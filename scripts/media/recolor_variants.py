"""Colour-selector previews: recolour the real product photo inside a precise, soft upholstery matte.

The Higgsfield (Nano Banana 2) renders in media-src/config/raw/ are used only as *references*:
  1. the matte is where most renders changed the photo (robust to one render's stray edits),
     limited to hand-drawn product regions, cleaned of specks and filled across seams, then
     corrected by outlines traced on the photo (objects that keep their colour, fabric it misses);
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


def px(points, w, h):
    """Outline traced in pixels of the w x h base -> fractions."""
    return [(x / w, y / h) for x, y in points]


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
            [(0.17, 0.06), (0.86, 0.06), (0.86, 0.32), (0.17, 0.32)],
            [(0.15, 0.455), (0.885, 0.455), (0.885, 0.70), (0.15, 0.70)],
        ],
        # never recolour (outline traced on the photo, through the first pixels of the object): the duvet,
        # throw and pillows below the headboard
        'exclude': [
            px([(180, 286), (290, 286), (296, 284), (300, 281), (304, 278), (308, 276), (312, 275), (316, 273),
                (320, 272), (326, 271), (332, 270), (338, 269), (344, 266), (350, 264), (356, 261), (362, 260),
                (366, 259), (872, 260), (876, 260), (882, 261), (888, 263), (894, 266), (900, 270), (906, 271),
                (912, 273), (918, 274), (924, 276), (930, 277), (936, 279), (942, 282), (946, 284), (950, 286),
                (952, 279), (968, 280), (972, 272), (976, 273), (980, 269), (984, 262), (990, 263), (996, 265),
                (1062, 265), (1062, 416), (180, 416)], 1200, 900),
        ],
        # the upholstered bench in front of the bed takes the bed's finish (traced outline with its rounded
        # corners, its sides down to the dark wooden feet, the inner faces down to their shadow line; the
        # opening between the sides shows the bed's plinth and the floor). The renders kept it ivory, so it
        # is recoloured from the bed's curve and never used to learn it
        'solid': [
            px([(337, 412), (337, 424), (332, 427), (328, 430), (325, 433), (323, 436), (319, 440), (315, 445),
                (311, 450), (306, 455), (301, 460), (295, 466), (290, 472), (286, 478), (283, 484), (280, 490),
                (278, 496), (277, 502), (276, 508), (274, 516), (274, 524), (273, 531), (272, 540), (273, 667),
                (337, 667), (373, 615), (372, 520), (373, 517), (375, 515), (376, 514), (865, 514), (867, 516),
                (868, 518), (867, 607), (894, 667), (959, 667), (958, 540), (956, 531), (956, 524), (955, 516), (954, 508), (953, 502),
                (951, 496), (949, 490), (946, 484), (943, 478), (938, 472), (933, 466), (927, 460), (922, 455),
                (918, 450), (914, 445), (910, 440), (907, 436), (905, 433), (902, 430), (898, 427), (893, 424),
                (893, 412)], 1200, 900),
        ],
        # always recolour: headboard right of the vase, seen around and through the stems (the renders
        # disagree there; inside the detail zone its thin bright stems keep their colour), and the plinth
        # under the bench down to its dark bottom edge (in deep shadow the difference matte stops short)
        'include': [px([(373, 516), (867, 516), (867, 532), (373, 532)], 1200, 900),
                    px([(238, 202), (242, 199), (242, 184), (262, 176), (300, 170), (300, 275), (284, 275), (279, 271),
                        (270, 268), (256, 268), (250, 269), (244, 272), (238, 272)], 1200, 900)],
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
        # the far chair's dark-green cushion (an accessory, like the other two cushions)
        'exclude': [px([(243, 341), (245, 340), (247, 340), (250, 342), (254, 344), (258, 345), (262, 346),
                        (268, 346), (272, 347), (277, 348), (284, 347), (289, 348), (293, 347), (298, 346),
                        (302, 345), (304, 344), (306, 342), (309, 341), (310, 344), (311, 348), (311, 351),
                        (306, 352), (302, 352), (297, 353), (293, 354), (288, 355), (283, 356), (278, 357),
                        (272, 358), (266, 359), (261, 360), (256, 361), (250, 362), (245, 363), (240, 364),
                        (241, 360), (241, 355), (239, 352), (240, 348), (240, 345), (241, 343)], 1276, 1594)],
        # always recolour: the chair fabric around that cushion (the renders moved its edge by 1-2 px), and the
        # near chair's backrest rim above its cushion (a thin separate strip the speck filter would drop)
        'include': [px([(235, 343), (241, 342), (252, 340), (304, 339), (314, 339), (316, 355), (304, 356), (297, 357),
                        (288, 359), (278, 361), (266, 363), (250, 366), (240, 368), (235, 368)], 1276, 1594),
                    px([(803, 383), (835, 382), (880, 381), (950, 382), (1012, 385), (1012, 387), (960, 392),
                        (900, 393), (865, 389), (835, 385), (812, 384), (803, 384)], 1276, 1594)],
        'detail': [],
        'solid': [],
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
        cv2.fillPoly(m, [np.round([(x * w, y * h) for x, y in p]).astype(np.int32)], 255)
    return m


def build_matte(base, renders, cfg):
    lb = to_lab(base)
    de = np.stack([np.linalg.norm(to_lab(r) - lb, axis=2) for r in renders])
    ranked = np.sort(de, axis=0)
    de2 = cv2.GaussianBlur(ranked[cfg['rank']], (0, 0), 1.2)
    hard = (de2 > cfg['thr']).astype(np.uint8) * 255
    hard &= poly_mask(base.shape, cfg['regions'])
    inc = poly_mask(base.shape, cfg['include'])
    hard |= inc
    # drop specks (not the hand-marked fabric), then fill pinholes inside the fabric (not gaps wider than a few px)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(hard, 8)
    keep = np.zeros_like(hard)
    min_area = 0.002 * hard.size
    marked = set(np.unique(lab[inc > 0]))
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_area or i in marked:
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
        # hand-marked fabric here is recoloured at full strength except thin bright strands (white top-hat)
        L = lb[..., 0]
        tophat = L - cv2.morphologyEx(L, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
        strands = np.clip((cv2.GaussianBlur(tophat, (0, 0), 0.7) - 4) / 6, 0, 1)
        fine = np.maximum(fine, cv2.GaussianBlur(inc.astype(np.float32) / 255, (0, 0), 0.8) * (1 - strands))
        alpha = alpha * (1 - zone) + fine * zone
    # excluded objects stay out (also where they were small holes in the fabric), with a crisp traced edge
    excl = poly_mask(base.shape, cfg['exclude']).astype(np.float32) / 255
    alpha *= 1 - cv2.GaussianBlur(excl, (0, 0), 0.5)
    learn = np.clip(alpha, 0, 1)
    # outlined pieces recoloured as a whole (their own crisp traced edge), not used to learn the colour
    if cfg['solid']:
        solid = cv2.GaussianBlur(poly_mask(base.shape, cfg['solid']).astype(np.float32) / 255, (0, 0), 0.5)
        alpha = np.maximum(alpha, solid)
        learn *= 1 - (solid > 0)
    return np.clip(alpha, 0, 1), learn


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
    # brighter than any fabric the curve was learned on (e.g. the sunlit top of the bed's bench): carry the
    # lightness on with the curve's recent slope rather than flattening those highlights
    top = centers[ok].max()
    near = ok & (centers > top - 12)
    if (centers > top).any() and near.sum() >= 2:
        slope = np.clip(np.polyfit(centers[near], out[near, 0], 1)[0], 0.2, 1.2)
        hi = centers > top
        out[hi, 0] = np.minimum(100, out[centers == top, 0] + (centers[hi] - top) * slope)
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
        alpha, learn = build_matte(base, list(renders.values()), cfg)
        cv2.imwrite(os.path.join(CFG, f'{product}-mask.png'), (alpha * 255).astype(np.uint8))
        lb = to_lab(base)
        inside = cv2.erode((learn > 0.98).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
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
