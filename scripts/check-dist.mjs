/**
 * Post-build sanity checks on dist/ (no dependencies):
 *  - every local asset referenced from HTML (src, srcset, href, imagesrcset) or inline CSS (url())
 *    exists
 *  - every in-page anchor (#id) used in links has a matching element
 *  - hy/en pages have reciprocal hreflang links, self-referencing canonicals and the same set of
 *    section ids
 *  - files the scripts build URLs for exist: hero frame sequences and stills (hero manifest) and
 *    every colour-preview image (src/data/furniture.ts)
 * Usage: npm run build && npm run check:links
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const pages = ['hy/index.html', 'en/index.html', 'index.html', '404.html'];
let problems = 0;
const fail = (msg) => {
  problems++;
  console.error('✗', msg);
};

const localPath = (url) => {
  if (!url || /^(https?:|mailto:|tel:|sms:|data:|#|javascript:)/.test(url)) return null;
  const clean = url.split('#')[0].split('?')[0];
  if (!clean.startsWith('/')) return null;
  let p = join(DIST, clean);
  if (clean.endsWith('/')) p = join(p, 'index.html');
  return p;
};

const sectionIds = {};
for (const page of pages) {
  const html = readFileSync(join(DIST, page), 'utf8');
  const urls = new Set();
  for (const m of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) urls.add(m[1]);
  for (const m of html.matchAll(/\s(?:srcset|imagesrcset)="([^"]+)"/g))
    m[1].split(',').forEach((part) => urls.add(part.trim().split(/\s+/)[0]));
  for (const m of html.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) urls.add(m[2]);
  for (const u of urls) {
    const p = localPath(u.replace(/&amp;/g, '&'));
    if (p && !existsSync(p)) fail(`${page}: missing ${u}`);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\shref="#([^"]+)"/g)) if (!ids.has(m[1])) fail(`${page}: anchor #${m[1]} has no target`);
  sectionIds[page] = [...html.matchAll(/<section[^>]*\sid="([^"]+)"/g)].map((m) => m[1]).join(',');
  if (page === '404.html') continue;
  const alts = Object.fromEntries(
    [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );
  const expected = { hy: '/hy/', en: '/en/', 'x-default': '/hy/' };
  for (const [lang, path] of Object.entries(expected))
    if (!alts[lang]?.endsWith(path)) fail(`${page}: hreflang ${lang} should point to ${path} (${alts[lang]})`);
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  const own = page === 'en/index.html' ? '/en/' : '/hy/'; // the root fallback is canonicalised to /hy/
  if (!canonical?.endsWith(own)) fail(`${page}: canonical should point to ${own} (${canonical})`);
}
if (sectionIds['hy/index.html'] !== sectionIds['en/index.html']) fail('hy/en section structure differs');

const hero = JSON.parse(readFileSync(new URL('../src/data/hero.json', import.meta.url), 'utf8'));
for (const [tier, info] of Object.entries(hero.tiers)) {
  for (let i = 0; i < hero.frames; i += info.step) {
    const f = join(DIST, 'media/hero', tier, `${String(i).padStart(3, '0')}.webp`);
    if (!existsSync(f)) fail(`missing hero frame ${tier}/${i}`);
  }
}
for (const [key, widths] of Object.entries(hero.posters))
  for (const label of ['start', 'end'])
    for (const w of widths)
      for (const ext of ['avif', 'webp', 'jpg']) {
        const f = `media/hero/${key}-${label}-${w}.${ext}`;
        if (!existsSync(join(DIST, f))) fail(`missing hero still ${f}`);
      }

// colour previews: the configurator builds /media/config/<product>/<finish>-<width>.webp
const furniture = readFileSync(new URL('../src/data/furniture.ts', import.meta.url), 'utf8');
const products = furniture.split(/\n  \{\n    id: '/).slice(1);
if (products.length < 2) fail('could not read the configurator products from src/data/furniture.ts');
for (const block of products) {
  const id = block.slice(0, block.indexOf("'"));
  const widths = /widths: \[([\d, ]+)\]/.exec(block)?.[1].split(',').map(Number) ?? [];
  const finishes = [...block.matchAll(/\{ id: '([\w-]+)', swatch:/g)].map((m) => m[1]);
  if (!widths.length || !finishes.length) fail(`configurator product ${id}: no widths or finishes found`);
  for (const f of finishes)
    for (const w of widths)
      if (!existsSync(join(DIST, 'media/config', id, `${f}-${w}.webp`))) fail(`missing colour preview ${id}/${f}-${w}.webp`);
}

for (const f of ['sitemap.xml', 'robots.txt', 'favicon.svg', 'site.webmanifest', 'media/og-image.jpg'])
  if (!existsSync(join(DIST, f))) fail(`missing ${f}`);

if (problems) {
  console.error(`\n${problems} problem(s) found`);
  process.exit(1);
}
console.log('✓ dist checks passed:', pages.join(', '), '| sections:', sectionIds['hy/index.html']);
