"""Repair the generated mobile segment 4 (media-src/hero/generated/m_seg4.mp4 -> media-src/hero/m_seg4.mp4).

Kling lowered the mattress through a hatch that opens in the ceiling, with a dark shadow on the
ceiling while it passes. The camera is locked in this clip, so the area above the headboard is
replaced with a clean plate (the bare room of the first frames, exposure-matched per frame) until
the mattress is just above the headboard; it is then lowered onto the bed as generated, and the
wall art fades in as in the source.

usage: PYTHONPATH=<dir with opencv-python-headless> python3 scripts/media/repair_mobile_seg4.py
(needs ffmpeg on PATH)
"""
import os
import subprocess

import cv2
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SRC = os.path.join(ROOT, 'media-src/hero/generated/m_seg4.mp4')
OUT = os.path.join(ROOT, 'media-src/hero/m_seg4.mp4')

Y0, Y1 = 492, 526     # plate above Y0, original below Y1 (smooth blend in between)
T_IN = (5, 9)         # plate fades in before the ceiling hatch outline appears (1-based frames)
T_OUT = (62, 70)      # plate fades out once the mattress is below the line
G_A, G_B = 30, 66     # exposure measured outside [G_A, G_B], interpolated across the lighting dip


def ss(a, b, t):
    x = np.clip((t - a) / (b - a), 0, 1)
    return x * x * (3 - 2 * x)


def main():
    cap = cv2.VideoCapture(SRC)
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f.astype(np.float32))
    H, W = frames[0].shape[:2]
    plate = np.mean(frames[:3], axis=0)
    y = np.arange(H, dtype=np.float32)
    s = np.clip((Y1 - y) / (Y1 - Y0), 0, 1)
    V = s * s * (3 - 2 * s)

    def gain_of(ft):
        a, b = ft[:520] + 1, plate[:520] + 1
        lum = a.mean(2) / b.mean(2)
        m = np.median(lum)
        for _ in range(3):
            sel = np.abs(lum / m - 1) < 0.035
            m = np.median(lum[sel])
        return np.array([np.median((a[..., c] / b[..., c])[sel]) for c in range(3)])

    n = len(frames)
    gains = {t: gain_of(frames[t - 1]) for t in list(range(1, G_A + 1)) + list(range(G_B, n + 1))}
    for t in range(G_A + 1, G_B):
        gains[t] = gains[G_A] + (gains[G_B] - gains[G_A]) * ss(G_A, G_B, t)

    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}',
                            '-r', '24', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '12',
                            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], stdin=subprocess.PIPE)
    for t in range(1, n + 1):
        ft = frames[t - 1]
        A = ss(*T_IN, t) * (1 - ss(*T_OUT, t))
        if A > 0:
            a = (A * V)[:, None, None]
            ft = ft * (1 - a) + plate * gains[t][None, None, :] * a
        enc.stdin.write(np.clip(ft, 0, 255).astype(np.uint8).tobytes())
    enc.stdin.close()
    enc.wait()
    print('wrote', OUT, n, 'frames')


if __name__ == '__main__':
    main()
