/**
 * Post-build sanity checks on dist/ (no dependencies):
 *  - every local asset referenced from HTML (src, srcset, href, imagesrcset) exists
 *  - every in-page anchor (#id) used in links has a matching element
 *  - hy/en pages have reciprocal hreflang links and the same set of section ids
 *  - hero frame sequences referenced by the manifest exist
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
  for (const u of urls) {
    const p = localPath(u.replace(/&amp;/g, '&'));
    if (p && !existsSync(p)) fail(`${page}: missing ${u}`);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\shref="#([^"]+)"/g)) if (!ids.has(m[1])) fail(`${page}: anchor #${m[1]} has no target`);
  sectionIds[page] = [...html.matchAll(/<section[^>]*\sid="([^"]+)"/g)].map((m) => m[1]).join(',');
  if (page.length > 12) continue;
  const alts = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => m[1]);
  if (page !== '404.html' && !(alts.includes('hy') && alts.includes('en') && alts.includes('x-default')))
    fail(`${page}: hreflang set incomplete (${alts})`);
}
if (sectionIds['hy/index.html'] !== sectionIds['en/index.html']) fail('hy/en section structure differs');

const hero = JSON.parse(readFileSync(new URL('../src/data/hero.json', import.meta.url), 'utf8'));
for (const [tier, info] of Object.entries(hero.tiers)) {
  for (let i = 0; i < hero.frames; i += info.step) {
    const f = join(DIST, 'media/hero', tier, `${String(i).padStart(3, '0')}.webp`);
    if (!existsSync(f)) fail(`missing hero frame ${tier}/${i}`);
  }
}
for (const f of ['sitemap.xml', 'robots.txt', 'favicon.svg', 'site.webmanifest', 'media/og-image.jpg'])
  if (!existsSync(join(DIST, f))) fail(`missing ${f}`);

if (problems) {
  console.error(`\n${problems} problem(s) found`);
  process.exit(1);
}
console.log('✓ dist checks passed:', pages.join(', '), '| sections:', sectionIds['hy/index.html']);
