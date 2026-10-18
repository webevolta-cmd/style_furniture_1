/**
 * Builds responsive web derivatives (AVIF / WebP / JPEG) from the masters in media-src/
 * and writes src/data/images.json (intrinsic sizes + available widths).
 *
 * Not part of the Netlify build: outputs are committed to public/media/img and
 * public/media/config. Run manually: node scripts/media/build-images.mjs
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('../../', import.meta.url).pathname;
const M = (p) => join(ROOT, 'media-src', p);
const OUT_IMG = join(ROOT, 'public/media/img');
const OUT_CFG = join(ROOT, 'public/media/config');
mkdirSync(OUT_IMG, { recursive: true });
mkdirSync(OUT_CFG, { recursive: true });

// crop = fractions [x0, y0, x1, y1] of the master
const images = {
  // furniture categories (4:5)
  'cat-bed': { src: 'photos/upscaled/bedroom.jpg', crop: [0, 0.17, 1, 0.876], widths: [480, 800, 1100] },
  'cat-sofa': { src: 'photos/upscaled/living.jpg', crop: [0.25, 0.3, 1, 0.83], widths: [480, 800, 1100] },
  'cat-armchair': { src: 'photos/upscaled/clinic.jpg', crop: [0, 0.22, 1, 0.796], widths: [480, 800, 1100] },
  'cat-kitchen': { src: 'photos/original/kitchen.webp', crop: [0.3, 0, 0.833, 1], widths: [480, 800] },
  'cat-wardrobe': { src: 'keyframes/desktop/d5.jpg', crop: [0.55, 0, 1, 1], widths: [480, 800] },
  'cat-other': { src: 'photos/instagram/bed-frame-DdHnM6gOBnY.jpg', crop: [0, 0.215, 0.52, 0.865], widths: [480, 560] },
  // projects
  'proj-kitchen': { src: 'photos/original/kitchen.webp', crop: [0, 0, 1, 1], widths: [640, 1000, 1536] },
  'proj-clinic': { src: 'photos/upscaled/clinic.jpg', crop: [0, 0.2, 1, 0.814], widths: [480, 800, 1200] },
  'proj-living': { src: 'photos/upscaled/living.jpg', crop: [0, 0.15, 1, 0.856], widths: [480, 800, 1200] },
  'proj-bedframe': { src: 'photos/instagram/bed-frame-DdHnM6gOBnY.jpg', crop: [0, 0.17, 1, 0.837], widths: [640, 1080] },
  'proj-armchair-sofa': { src: 'photos/instagram/armchair-sofa-DdUsUHcukel.jpg', crop: [0, 0.28, 1, 0.947], widths: [640, 1080] },
  // about
  about: { src: 'photos/upscaled/lounge.jpg', crop: [0, 0.05, 1, 0.885], widths: [560, 900, 1300] },
  // craftsmanship details (1:1)
  'craft-fabric': { src: 'photos/instagram/bed-frame-DdHnM6gOBnY.jpg', crop: [0.04, 0.43, 0.46, 0.85], widths: [400, 454] },
  'craft-fronts': { src: 'photos/original/kitchen.webp', crop: [0.3, 0.23, 0.573, 0.64], widths: [400] },
  'craft-forms': { src: 'photos/upscaled/clinic.jpg', crop: [0.55, 0.33, 0.95, 0.514], widths: [400, 700] },
  'craft-modules': { src: 'photos/upscaled/lounge.jpg', crop: [0.05, 0.6, 0.45, 0.867], widths: [400, 700] },
  // process: real work (square)
  'proc-fabrics': { src: 'photos/instagram/fabric-samples-DdHoNROu6ks.jpg', crop: [0, 0.05, 1, 0.6125], widths: [405] },
  'proc-build': { src: 'photos/instagram/bed-frame-DdHnM6gOBnY.jpg', crop: [0.18, 0.17, 0.83, 0.82], widths: [420, 702] },
  'proc-installed': { src: 'photos/upscaled/clinic.jpg', crop: [0.05, 0.33, 0.95, 0.745], widths: [420, 720] },
};

// Optional CLI filter: node build-images.mjs cat-bed proj-kitchen (rebuilds only those),
// or node build-images.mjs config (colour-selector previews only)
const only = process.argv.slice(2);
const onlyConfig = only.length === 1 && only[0] === 'config';
const manifest = JSON.parse(readFileSync(join(ROOT, 'src/data/images.json'), 'utf8'));
for (const [name, cfg] of Object.entries(images)) {
  if (onlyConfig || (only.length && !only.includes(name))) continue;
  const img = sharp(M(cfg.src));
  const { width: W, height: H } = await img.metadata();
  const [x0, y0, x1, y1] = cfg.crop;
  const left = Math.round(x0 * W);
  const top = Math.round(y0 * H);
  const cw = Math.round((x1 - x0) * W);
  const ch = Math.round((y1 - y0) * H);
  const widths = cfg.widths.filter((w) => w <= cw);
  if (!widths.length) widths.push(cw);
  // drop stale sizes of this image from earlier runs
  for (const f of readdirSync(OUT_IMG)) if (f.startsWith(`${name}-`) && /^\d+\./.test(f.slice(name.length + 1))) rmSync(join(OUT_IMG, f));
  for (const w of widths) {
    const h = Math.round((w * ch) / cw);
    const base = sharp(M(cfg.src))
      .extract({ left, top, width: cw, height: ch })
      .resize(w, h, { kernel: 'lanczos3' })
      .sharpen({ sigma: 0.45 });
    await base.clone().avif({ quality: 52, effort: 6 }).toFile(join(OUT_IMG, `${name}-${w}.avif`));
    await base.clone().webp({ quality: 74, effort: 6 }).toFile(join(OUT_IMG, `${name}-${w}.webp`));
    await base.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(join(OUT_IMG, `${name}-${w}.jpg`));
  }
  manifest[name] = { width: widths.at(-1), height: Math.round((widths.at(-1) * ch) / cw), widths };
  console.log(name, manifest[name]);
}

if (only.length && !onlyConfig) {
  writeFileSync(join(ROOT, 'src/data/images.json'), JSON.stringify(manifest, null, 2) + '\n');
  process.exit(0);
}

// Open Graph images (1200x630) from the finished hero frame
if (!onlyConfig) await sharp(join(ROOT, 'public/media/hero/desktop-end-1920.jpg'))
  .resize(1200, 630, { fit: 'cover', position: 'centre' })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(join(ROOT, 'public/media/og-image.jpg'));

// Colour configurator previews
const config = {
  bed: { finishes: ['ivory', 'sand', 'mocha', 'olive', 'graphite', 'terracotta', 'black'], widths: [600, 900, 1200] },
  armchair: { finishes: ['taupe', 'ivory', 'emerald', 'terracotta', 'charcoal', 'dustyblue', 'black'], widths: [480, 851, 1276] },
};
for (const [id, c] of Object.entries(config)) {
  rmSync(join(OUT_CFG, id), { recursive: true, force: true }); // no stale variants
  mkdirSync(join(OUT_CFG, id), { recursive: true });
  for (const f of c.finishes) {
    for (const w of c.widths) {
      await sharp(M(`config/${id}-${f}.jpg`)).resize(w, null, { kernel: 'lanczos3' }).sharpen({ sigma: 0.4 }).webp({ quality: 78, effort: 6 }).toFile(join(OUT_CFG, id, `${f}-${w}.webp`));
    }
  }
}

writeFileSync(join(ROOT, 'src/data/images.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('done');
