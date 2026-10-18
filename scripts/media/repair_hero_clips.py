"""Repair defects in generated hero clips (media-src/hero/generated/*.mp4 -> media-src/hero/*.mp4).

The camera is locked in every clip, so a defect that touches a region with no furniture moving
through it can be replaced with a clean plate of the same room, exposure-matched per frame:

- m_seg4 (phones, stage 4): Kling lowered the mattress through a hatch that opens in the ceiling
  (with a dark shadow on the ceiling), and opened the finished wardrobe's doors to slide a headboard
  panel out of it. The area above the headboard and the wardrobe column keep the bare room of the
  first frames until the mattress is just above the headboard; the panel appears from behind the
  wardrobe's edge.
- m_seg5 (phones, stage 5): a smoke-like stain spreads over the left of the headboard in its first
  frames; that patch keeps the clean headboard of the first frame.
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
    # 1) above the headboard, full width: plate above y 492, original below y 526
    y = np.arange(H, dtype=np.float32)
    s = np.clip((526 - y) / (526 - 492), 0, 1)
    upper = np.repeat((s * s * (3 - 2 * s))[:, None], W, axis=1)
    # 2) the wardrobe column (left edge at x ~606) down to the floor line, and from frame ~32 down to
    #    the top of the bedside table sliding in front of it (its rim, measured on the frames)
    rim = {30: 830, 32: 790, 34: 785, 36: 762, 38: 752, 40: 740, 42: 727, 44: 718, 46: 708, 48: 700}
    keys = sorted(rim)

    def column(t):
        bottom = np.interp(t, keys, [rim[k] for k in keys]) - 6
        return soft_mask((H, W), [[(606, 0), (W, 0), (W, bottom), (606, bottom)]], 2.0)

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
            a_up = ss(5, 9, t) * (1 - ss(62, 70, t))  # ceiling hatch, mattress, shadow
            a_wd = ss(6, 10, t) * (1 - ss(43, 48, t))  # wardrobe doors open (frames 13-42)
            a = np.maximum(a_up * upper, a_wd * column(t))[..., None]
            if a.max() > 0:
                ft = ft * (1 - a) + plate * gains[t] * a
            yield ft

    write(os.path.join(HERO, 'm_seg4.mp4'), fixed())


def repair_m_seg5():
    frames = read(os.path.join(HERO, 'generated/m_seg5.mp4'))
    H, W = frames[0].shape[:2]
    plate = frames[0].astype(np.float32)
    # the stain covers the left of the headboard; later the duvet passes just to its right
    early = soft_mask((H, W), [[(70, 488), (272, 488), (272, 642), (70, 642)]], 5.0)
    late = soft_mask((H, W), [[(70, 488), (212, 488), (212, 620), (70, 620)]], 5.0)
    # exposure from the surroundings of the patch
    ring = np.zeros((H, W), bool)
    ring[440:690, 40:330] = True
    ring &= early < 0.01

    def fixed():
        for t, ft in enumerate(frames, start=1):
            ft = ft.astype(np.float32)
            a_t = ss(1, 3, t) * (1 - ss(24, 31, t))
            if a_t > 0:
                g = gain_of(ft, plate, ring)
                a = (a_t * (early if t <= 16 else late))[..., None]
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
