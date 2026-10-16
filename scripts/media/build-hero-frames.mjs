/**
 * Builds the scroll-scrubbed hero frame sequences from the Higgsfield (Kling 3.0 Omni)
 * assembly segments stored in media-src/hero/.
 *
 * Not part of the Netlify build: the generated frames are committed to public/media/hero/.
 * Run manually (requires ffmpeg + `npm i -D sharp`):  node scripts/media/build-hero-frames.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('../../', import.meta.url).pathname;
const SRC = join(ROOT, 'media-src/hero');
const OUT = join(ROOT, 'public/media/hero');
const TMP = join(ROOT, '.cache/hero-frames');
const FRAMES = 180;

const sets = {
  desktop: {
    segments: ['d_seg1', 'd_seg2', 'd_seg3', 'd_seg4', 'd_seg5'],
    tiers: [
      { name: 'desktop', w: 1600, h: 900, step: 1, q: 66 },
      { name: 'desktop-lite', w: 1280, h: 720, step: 2, q: 62 },
    ],
  },
  mobile: {
    segments: ['m_seg1', 'm_seg2', 'm_seg3', 'm_seg4', 'm_seg5'],
    tiers: [
      { name: 'mobile', w: 720, h: 1280, step: 1, q: 66 },
      { name: 'mobile-lite', w: 540, h: 960, step: 2, q: 62 },
    ],
  },
};

const manifest = { frames: FRAMES, tiers: {} };

for (const [key, set] of Object.entries(sets)) {
  const dir = join(TMP, key);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // Decode every segment; segments 2..n start on the previous segment's end keyframe,
  // so their first frame is dropped to avoid a duplicated (held) frame at each seam.
  const all = [];
  set.segments.forEach((seg, i) => {
    const segDir = join(dir, seg);
    mkdirSync(segDir);
    execFileSync('ffmpeg', ['-v', 'error', '-i', join(SRC, `${seg}.mp4`), join(segDir, '%04d.png')]);
    const files = readdirSync(segDir).sort().map((f) => join(segDir, f));
    all.push(...(i === 0 ? files : files.slice(1)));
  });
  const picked = Array.from({ length: FRAMES }, (_, i) => all[Math.round((i * (all.length - 1)) / (FRAMES - 1))]);

  for (const tier of set.tiers) {
    const tierDir = join(OUT, tier.name);
    rmSync(tierDir, { recursive: true, force: true });
    mkdirSync(tierDir, { recursive: true });
    let bytes = 0;
    let count = 0;
    for (let i = 0; i < FRAMES; i += tier.step) {
      const buf = await sharp(picked[i])
        .resize(tier.w, tier.h, { fit: 'cover', kernel: 'lanczos3' })
        .sharpen({ sigma: 0.5 })
        .webp({ quality: tier.q, effort: 5, smartSubsample: true })
        .toBuffer();
      writeFileSync(join(tierDir, `${String(i).padStart(3, '0')}.webp`), buf);
      bytes += buf.length;
      count++;
    }
    manifest.tiers[tier.name] = { width: tier.w, height: tier.h, step: tier.step, count, bytes };
    console.log(`${tier.name}: ${count} frames, ${(bytes / 1048576).toFixed(2)} MB`);
  }

  // Posters: opening (bare room) and finished room, in AVIF/WebP/JPEG.
  for (const [label, file] of [['start', picked[0]], ['end', picked[FRAMES - 1]]]) {
    const base = set.tiers[0];
    const widths = key === 'desktop' ? [960, 1600, 1920] : [540, 720, 1080];
    for (const w of widths) {
      const h = Math.round((w * base.h) / base.w);
      const img = sharp(file).resize(w, h, { fit: 'cover', kernel: 'lanczos3' }).sharpen({ sigma: 0.5 });
      await img.clone().avif({ quality: 52, effort: 6 }).toFile(join(OUT, `${key}-${label}-${w}.avif`));
      await img.clone().webp({ quality: 72, effort: 6 }).toFile(join(OUT, `${key}-${label}-${w}.webp`));
      await img.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(join(OUT, `${key}-${label}-${w}.jpg`));
    }
  }
}

writeFileSync(join(ROOT, 'src/data/hero.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('done');
