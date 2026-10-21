/**
 * Builds the scroll-scrubbed hero frame sequences from the Higgsfield (Kling 3.0 Omni)
 * assembly segments stored in media-src/hero/.
 *
 * Not part of the Netlify build: the generated frames are committed to public/media/hero/.
 * Run manually (requires ffmpeg + `npm i -D sharp`):  node scripts/media/build-hero-frames.mjs
 * Posters/stills only (fast):                          node scripts/media/build-hero-frames.mjs posters
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('../../', import.meta.url).pathname;
const SRC = join(ROOT, 'media-src/hero');
const OUT = join(ROOT, 'public/media/hero');
const TMP = join(ROOT, '.cache/hero-frames');
const FRAMES = 180;
const PER_STAGE = FRAMES / 5;
const POSTERS_ONLY = process.argv[2] === 'posters';
// poster widths; phones top out at 860: sharper than the 720 px frames that take over, and a
// 3x phone would otherwise fetch a 1080 px image on the critical path
const POSTER_WIDTHS = { desktop: [960, 1600, 1920], mobile: [540, 720, 860] };

const sets = {
  desktop: {
    segments: ['d_seg1', 'd_seg2', 'd_seg3', 'd_seg4', 'd_seg5'],
    keyframes: ['keyframes/desktop/d0.jpg', 'keyframes/desktop/d5.jpg'],
    tiers: [
      { name: 'desktop', w: 1600, h: 900, step: 1, q: 66 },
      { name: 'desktop-lite', w: 1280, h: 720, step: 2, q: 62 },
    ],
  },
  mobile: {
    segments: ['m_seg1', 'm_seg2', 'm_seg3', 'm_seg4', 'm_seg5'],
    keyframes: ['keyframes/mobile/k0.jpg', 'keyframes/mobile/k5.jpg'],
    tiers: [
      { name: 'mobile', w: 720, h: 1280, step: 2, q: 66 },
      { name: 'mobile-lite', w: 540, h: 960, step: 2, q: 62 },
    ],
  },
};

// Each segment (one assembly stage) gets the same number of frames, so the stage boundaries are
// identical on desktop and mobile and every stage ends exactly on its keyframe.
const stages = Array.from({ length: 5 }, (_, i) => i * PER_STAGE);
const manifest = POSTERS_ONLY
  ? JSON.parse(readFileSync(join(ROOT, 'src/data/hero.json'), 'utf8'))
  : { frames: FRAMES, stages, tiers: {} };
manifest.posters = POSTER_WIDTHS;

for (const [key, set] of Object.entries(sets)) {
  const dir = join(TMP, key);
  if (!POSTERS_ONLY) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    // Decode every segment. Segments 2..n start on the previous segment's end keyframe, so their
    // first frame is skipped (no duplicated, held frame at a seam).
    const picked = [];
    set.segments.forEach((seg, i) => {
      const segDir = join(dir, seg);
      mkdirSync(segDir);
      execFileSync('ffmpeg', ['-v', 'error', '-i', join(SRC, `${seg}.mp4`), join(segDir, '%04d.png')]);
      const files = readdirSync(segDir).sort().map((f) => join(segDir, f));
      const last = files.length - 1;
      for (let k = 0; k < PER_STAGE; k++) {
        const pos = i === 0 ? (k * last) / (PER_STAGE - 1) : ((k + 1) * last) / PER_STAGE;
        picked.push(files[Math.round(pos)]);
      }
    });

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
  }

  // Posters / stills: the opening and finished keyframes themselves (the start and end images the
  // clips were generated from: same geometry and colour as the first and last video frames, but
  // full resolution and without video compression).
  const [startKey, endKey] = set.keyframes.map((f) => join(ROOT, 'media-src', f));
  for (const [label, file] of [['start', startKey], ['end', endKey]]) {
    const base = set.tiers[0];
    for (const w of POSTER_WIDTHS[key]) {
      const h = Math.round((w * base.h) / base.w);
      // keyframes are crisp at full resolution: no extra sharpening (it only adds bytes)
      const img = sharp(file).resize(w, h, { fit: 'cover', kernel: 'lanczos3' });
      await img.clone().avif({ quality: 52, effort: 6 }).toFile(join(OUT, `${key}-${label}-${w}.avif`));
      await img.clone().webp({ quality: 72, effort: 6 }).toFile(join(OUT, `${key}-${label}-${w}.webp`));
      await img.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(join(OUT, `${key}-${label}-${w}.jpg`));
    }
  }
}

writeFileSync(join(ROOT, 'src/data/hero.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('done');
