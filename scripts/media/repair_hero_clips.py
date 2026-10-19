"""Repair defects in generated hero clips (media-src/hero/generated/*.mp4 -> media-src/hero/*.mp4).

The camera is locked in every clip, so a defect that touches a region with no furniture moving
through it can be replaced with a clean plate of the same room, exposure-matched per frame:

- m_seg4 (phones, stage 4): Kling lowered the mattress through a hatch that opens in the ceiling
  (with a dark shadow on the ceiling), and opened the finished wardrobe's doors to slide a headboard
  panel out of it. The area above the headboard and the wardrobe column (around the bedside table
  in front of it) keep the bare room of the first frames until the mattress is just above the
  headboard, then fade together into the original; the panel appears from behind the wardrobe's edge.
- m_seg5 (phones, stage 5): a smoke-like stain spreads over the left of the headboard in its first
  frames; that patch keeps the clean headboard of the first frame until the stain has gone, except
  where the duvet slides into it.
- d_seg1-3 (desktop, stages 1-3): the curtain fabric drifts from clean folds to a crinkled texture
  and snaps back at the start of stage 4. The curtain area takes its folds from the opening frame,
  turning gradually into those of stage 4, under each frame's own lighting.

usage: PYTHONPATH=<dir with opencv-python-headless> python3 scripts/media/repair_hero_clips.py
(needs ffmpeg on PATH)
"""
import os
import subprocess

import cv2
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
HERO = os.path.join(ROOT, 'media-src/hero')


def read(path):
    """All frames as 8-bit arrays (a full-HD clip as floats would not fit in memory)."""
    cap = cv2.VideoCapture(path)
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            return frames
        frames.append(f)


def write(path, frames):
    """Encode an iterable of float frames, streaming them to ffmpeg. 4:4:4 with accurate rounding:
    the default RGB→4:2:0 conversion darkens every pixel by ~2 levels, which would show as a step
    where a repaired clip meets an untouched one; this keeps the round trip within ~0.3 levels."""
    enc = None
    count = 0
    for f in frames:
        if enc is None:
            h, w = f.shape[:2]
            enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24',
                                    '-s', f'{w}x{h}', '-r', '24', '-i', '-',
                                    '-sws_flags', 'accurate_rnd+full_chroma_int+bitexact', '-c:v', 'libx264',
                                    '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv444p', '-movflags', '+faststart',
                                    path], stdin=subprocess.PIPE)
        enc.stdin.write(np.clip(f, 0, 255).astype(np.uint8).tobytes())
        count += 1
    enc.stdin.close()
    enc.wait()
    print('wrote', os.path.relpath(path, ROOT), count, 'frames')


def ss(a, b, t):
    """smoothstep from 0 at a to 1 at b"""
    x = np.clip((t - a) / (b - a), 0, 1)
    return x * x * (3 - 2 * x)


def soft_mask(shape, polys, feather):
    m = np.zeros(shape[:2], np.float32)
    for p in polys:
        cv2.fillPoly(m, [np.array(p, np.int32)], 1.0)
    return cv2.GaussianBlur(m, (0, 0), feather) if feather else m


def gain_of(ft, plate, where):
    """Per-channel exposure ratio of a frame to the plate, over the pixels in `where` whose
    content is unchanged (robust median)."""
    a, b = ft[where] + 1, plate[where] + 1
    lum = a.mean(-1) / b.mean(-1)
    m = np.median(lum)
    for _ in range(3):
        sel = np.abs(lum / m - 1) < 0.035
        m = np.median(lum[sel])
    return np.array([np.median((a[..., c] / b[..., c])[sel]) for c in range(3)])


def repair_m_seg4():
    frames = read(os.path.join(HERO, 'generated/m_seg4.mp4'))
    n = len(frames)
    H, W = frames[0].shape[:2]
    plate = np.mean([f.astype(np.float32) for f in frames[:3]], axis=0)
    # 1) above the headboard, full width: plate above y 492, original below y 526. The pendant lamp's
    #    globe (centre 582,517) sits on that boundary while the mattress passes it (frames ~53-58),
    #    so the whole globe stays on the plate instead of being cut in half
    y = np.arange(H, dtype=np.float32)
    s = np.clip((526 - y) / (526 - 492), 0, 1)
    upper = np.repeat((s * s * (3 - 2 * s))[:, None], W, axis=1)
    globe = np.zeros((H, W), np.float32)
    cv2.circle(globe, (582, 517), 18, 1.0, -1)
    upper = np.maximum(upper, cv2.GaussianBlur(globe, (0, 0), 1.5))
    # 2) the wardrobe column (left edge at x ~606) down to the floor line, minus the bedside table that
    #    slides in front of it from frame ~28: top of its rim, left and right side (measured on the
    #    frames; until ~53 it runs past the frame's edge). Right of the table, once it moves away,
    #    the column keeps the wardrobe down to where it meets the floor
    table = {28: (820, 701, 800), 30: (806, 687, 800), 32: (790, 668, 800), 34: (781, 656, 800),
             36: (768, 647, 800), 38: (757, 636, 800), 40: (746, 629, 800), 42: (737, 620, 800),
             44: (728, 614, 800), 46: (720, 607, 800), 48: (711, 601, 800), 50: (704, 596, 800),
             52: (697, 591, 800), 54: (690, 586, 716), 56: (684, 581, 703), 58: (678, 577, 694),
             60: (673, 573, 685), 62: (670, 570, 677), 64: (663, 566, 669), 66: (661, 565, 663),
             68: (659, 563, 656), 70: (657, 561, 650)}
    keys = sorted(table)

    def column(t):
        m = np.zeros((H, W), np.float32)
        m[:824, 606:] = 1.0
        if t < keys[0]:
            return cv2.GaussianBlur(m, (0, 0), 2.0)
        top, left, right = (np.interp(t, keys, [table[k][i] for k in keys]) for i in range(3))
        r = int(right) + 4
        m[int(top) - 1:, int(left) - 4:r] = 0
        if r < W:  # the wardrobe meets the floor along (606,732)-(718,844)
            cv2.fillPoly(m, [np.array([(r, 732 + r - 606), (W, 732 + W - 606), (W, H), (r, H)], np.int32)], 0)
        m = cv2.GaussianBlur(m, (0, 0), 2.0)
        # the dark shadow the table casts on the wardrobe to its right stays, fading out over ~34 px
        x = np.arange(W, dtype=np.float32)
        shade = (x >= left) * (1 - ss(right, right + 34, x)) * ss(top - 12, top + 8, y[:, None])
        return m * (1 - shade)

    # the wardrobe's bar pulls (first frames) and knobs (from the end of the doors' opening)
    handles = soft_mask((H, W), [[(628, 590), (653, 590), (653, 604), (628, 604)],
                                 [(652, 580), (676, 580), (676, 599), (652, 599)],
                                 [(680, 600), (706, 600), (706, 614), (680, 614)],
                                 [(709, 598), (W, 598), (W, 612), (709, 612)]], 1.0)

    # exposure measured outside the lighting dip (frames 31-65) and interpolated across it
    upper_rows = np.zeros((H, W), bool)
    upper_rows[:520] = True
    gains = {t: gain_of(frames[t - 1].astype(np.float32), plate, upper_rows)
             for t in list(range(1, 31)) + list(range(66, n + 1))}
    for t in range(31, 66):
        gains[t] = gains[30] + (gains[66] - gains[30]) * ss(30, 66, t)

    def fixed():
        for t in range(1, n + 1):
            ft = frames[t - 1].astype(np.float32)
            # ceiling hatch, mattress, shadow; wardrobe doors open (frames 13-42), then shaded by the
            # mattress and the table (to ~64). One schedule for both, so the wardrobe has no seam
            a_t = ss(5, 9, t) * (1 - ss(62, 70, t))
            if a_t > 0:
                a = a_t * np.maximum(upper, column(t))
                # the handles change style from one frame to the next instead of cross-fading
                a = (a * (1 - handles) + float(a_t >= 0.5) * handles)[..., None]
                ft = ft * (1 - a) + plate * gains[t] * a
            yield ft

    write(os.path.join(HERO, 'm_seg4.mp4'), fixed())


def repair_m_seg5():
    frames = read(os.path.join(HERO, 'generated/m_seg5.mp4'))
    H, W = frames[0].shape[:2]
    plate = frames[0].astype(np.float32)
    # the stain covers the left of the headboard down to the bedside table and the mattress, and has
    # gone by frame ~28
    patch = soft_mask((H, W), [[(70, 488), (272, 488), (272, 642), (230, 642), (206, 662), (70, 662)]], 0)
    # from frame ~19 the duvet slides into the patch from the right: its top-left corner (measured on
    # the frames) and everything right of and below it keep the original frame
    duvet = {18: (292, 595), 20: (265, 599), 22: (249, 603), 24: (236, 603), 26: (223, 606),
             28: (212, 597), 30: (203, 588), 31: (198, 586)}
    keys = sorted(duvet)

    def mask(t):
        x, y = (np.interp(t, keys, [duvet[k][i] for k in keys]) for i in range(2))
        m = patch.copy()
        m[int(y) - 8:, int(x) - 8:] = 0
        return cv2.GaussianBlur(m, (0, 0), 5.0)

    # exposure from the surroundings of the patch
    ring = np.zeros((H, W), bool)
    ring[440:690, 40:330] = True
    ring &= cv2.GaussianBlur(patch, (0, 0), 5.0) < 0.01

    def fixed():
        for t, ft in enumerate(frames, start=1):
            ft = ft.astype(np.float32)
            a_t = ss(1, 3, t) * (1 - ss(24, 31, t))
            if a_t > 0:
                g = gain_of(ft, plate, ring)
                a = (a_t * mask(t))[..., None]
                ft = ft * (1 - a) + plate * g * a
            yield ft

    write(os.path.join(HERO, 'm_seg5.mp4'), fixed())


def repair_desktop_curtains():
    ok, a = cv2.VideoCapture(os.path.join(HERO, 'generated/d_seg1.mp4')).read()
    A = a.astype(np.float32)  # opening frame (= the start keyframe): clean folds
    cap = cv2.VideoCapture(os.path.join(HERO, 'd_seg4.mp4'))
    for _ in range(4):  # the stage-4 frame shown right after stage 3: clean folds again
        ok, b = cap.read()
    B = b.astype(np.float32)
    H, W = A.shape[:2]
    # window, sheers and curtains on the left: no furniture comes there during stages 1-3
    mask = soft_mask((H, W), [[(0, 0), (636, 0), (636, 740), (578, 740), (578, 860), (0, 860)]], 8.0)[..., None]

    def low(x):
        return cv2.GaussianBlur(x, (0, 0), 24)

    low_b = low(B)

    def fixed(i, frames):
        n = len(frames)
        for j, ft in enumerate(frames):
            ft = ft.astype(np.float32)
            g = 36 * i + 36 * j / (n - 1)  # position in the 180-frame timeline
            w = np.clip(g / 108, 0, 1)
            plate = (1 - w) * A + w * B  # folds: opening frame -> stage 4
            k = ss(88, 108, g)  # the frame's own lighting, easing into stage 4's
            light = (1 - k) * low(ft) + k * low_b
            fixed_ = plate * (light + 1) / (low(plate) + 1)
            yield ft * (1 - mask) + fixed_ * mask

    for i in range(3):
        frames = read(os.path.join(HERO, f'generated/d_seg{i + 1}.mp4'))
        write(os.path.join(HERO, f'd_seg{i + 1}.mp4'), fixed(i, frames))
        del frames


if __name__ == '__main__':
    repair_m_seg4()
    repair_m_seg5()
    repair_desktop_curtains()
