# Style Furniture — website

Bilingual (Armenian / English) website for **Style Furniture**, a custom furniture maker in Yerevan
([@style_furniture_1](https://www.instagram.com/style_furniture_1/), ☎ 033 26 33 66).

Static site built with [Astro](https://astro.build) — no server, no database, no API keys.

## Deploy

1. In Netlify: **Add new site → Import an existing project → GitHub →** choose this repository.
2. Click **Deploy**. Everything else is read from [`netlify.toml`](netlify.toml):
   build command `npm run build`, publish directory `dist`, Node `22.22.0`, redirects and headers.
3. **Required to receive web inquiries:** in the site's Netlify dashboard open **Forms → Enable form
   detection**, then **Deploys → Trigger deploy** once, and under **Forms → Form notifications** add the
   email address that should receive requests. Netlify switches form detection off for new sites and it
   can't be switched on from the repository, so until this is done **no request reaches Netlify**: the
   form tells every visitor that online sending isn't available and offers to call, or to send the same
   request by Instagram Direct (see below). Nothing is lost, but nothing arrives by email either.

Routes: `/hy/` (Armenian, default) and `/en/` (English). `/` redirects to `/hy/`, or to `/en/` for a
visitor who explicitly picked English before (cookie set by the language switch — no geo-guessing).
Canonical, `hreflang`, Open Graph and `sitemap.xml` URLs use Netlify's site URL automatically
(redeploy after adding a custom domain so they update).

### Inquiry form

- Submits to **Netlify Forms** (`name="inquiry"`, honeypot spam protection). Success is shown only for
  an HTTP 200 from Netlify.
- Whenever online delivery isn't confirmed (form detection off, offline, error), the visitor never sees
  a fake "sent" message. The complete request (type, contact, furniture, colour/configuration,
  dimensions, model, link, message) is shown and can be passed on in one tap: **call** 033 26 33 66 or
  **copy it and open Instagram Direct**. Only the channels the business publishes are offered (its
  order phone and Instagram Direct). While form detection is off, the browser console also shows the
  404 of that form POST; it disappears once detection is on.

## What's inside

```
src/
  data/business.ts      verified business facts (phone, Instagram, locality) – see docs/research-log.md
  data/furniture.ts     furniture categories + colour-configurator products/finishes
  data/images.json      generated image manifest (sizes for CLS-free responsive images)
  data/hero.json        generated hero manifest (frame sets, stage boundaries, poster widths)
  i18n/hy.ts, en.ts     all copy, labels, errors, SEO text (en is type-checked against hy)
  components/           Header, Hero, Services, About, Furniture, Configurator, Process,
                        Craft, Projects, Inquiry, Contact, Footer, Picture, Icon, Logo
  scripts/hero.ts       scroll-controlled frame sequence (canvas)
  scripts/configurator.ts, inquiry.ts, site.ts, state.ts
  pages/[lang]/index.astro, index.astro (root fallback), 404.astro, sitemap.xml.ts, robots.txt.ts
public/
  media/hero/           hero frames: desktop (180×1600×900), desktop-lite (90×1280×720),
                        mobile (180×720×1280), mobile-lite (90×540×960) + start/end stills
  media/img/            responsive AVIF/WebP/JPEG photos   media/config/  colour-preview variants
  fonts/                self-hosted Cormorant Garamond, Manrope, Noto Serif/Sans Armenian (SIL OFL)
media-src/              masters (not deployed): Higgsfield video segments, keyframes,
                        original + upscaled photos, colour renders, masks
scripts/media/          scripts that produced public/media from media-src (run manually)
docs/research-log.md    sources, verified facts, client-supplied facts, open points
```

### Hero (Higgsfield)

Generated with Higgsfield from the client's bedroom photo. The finished room is the reference; a
bare-walls version of the same room (floor and curtains kept) and four intermediate stages were derived
from it **backwards** by masked inpainting (GPT Image 2.5, Nano Banana 2), so every piece of furniture
is pixel-identical from the stage it appears in to the end. Each pair of neighbouring stages was then
animated with **Kling 3.0 Omni (first/last frame, locked camera)** — 5 segments per orientation
(16:9 desktop, 9:16 phones): MDF wall panels → wardrobe → wardrobe doors & bed base → mattress,
headboard, bedside tables & bench → bedding, art & finishing touches.

- 180 frames per set, **36 per stage**, so every stage ends exactly on its keyframe and desktop and
  phones share the same stage boundaries. Scroll maps to whole frames (forward and backward); the
  first 5 % of the pinned scroll holds the bare room and the last 14 % holds the finished room, both
  shown as full-resolution stills (the keyframes themselves). One gentle camera move: a 5 % pull-back.
- Loading: a small coarse pass (every 15th frame) after the page has loaded and is idle; once the
  visitor scrolls, only a window around the current position (36 ahead, 12 behind). Compressed and
  decoded frames are both capped (desktop 72/16, phones 84/12), so memory stays bounded. Fetching
  pauses off-screen and in background tabs; failed frames are retried once, after 1.2 s.
- Adaptation: Save-Data, 2G/3G, ≤ 2 GB RAM or ≤ 2 CPU cores start on the lighter set; on any device,
  if scrubbing runs slower than ~40 fps (p95 frame time > 24 ms), it switches once to the lighter set,
  keeping the current position and the picture on screen.
- *Reduced motion*: the finished room as a still image, no pinned scrolling.
- The phone segment 4 was repaired after generation (`scripts/media/repair_mobile_seg4.py`): Kling
  lowered the mattress through a hatch opening in the ceiling. The camera is locked, so the area above
  the headboard is replaced by a clean, exposure-matched plate of the same room until the mattress is
  just above the headboard. The untouched generation is kept in `media-src/hero/generated/`.

### Colour selector

Two real products photographed by the business (layered-headboard bed, rounded clinic armchair).
Higgsfield (Nano Banana 2) renders in `media-src/config/raw/` serve only as **colour references**:
`scripts/media/recolor_variants.py` builds a soft upholstery matte from where the renders agree the
fabric changed (product regions only, specks removed, seams filled, anti-aliased edges), learns each
finish as a lightness → colour curve, and applies it to the **original photo**. Texture, folds, seams,
shading and everything outside the upholstery stay those of the real photograph — no generated
texture, no stray dots. *Black* is derived from the darkest render. "Other colour" lets visitors
request any colour; the selection (product, finish or custom colour) is carried into the inquiry form
and relabelled if the visitor switches language.

### Regenerating media (optional)

```bash
npm ci
node scripts/media/build-hero-frames.mjs           # needs ffmpeg; reads media-src/hero/*.mp4 (~6 min)
node scripts/media/build-hero-frames.mjs posters   # start/end stills only
node scripts/media/build-images.mjs                # photos, colour previews, OG image
node scripts/media/build-images.mjs config         # colour previews only
# Python 3 + opencv-python-headless + numpy:
python3 scripts/media/recolor_variants.py          # colour variants from media-src/config/raw/
python3 scripts/media/repair_mobile_seg4.py        # phone hero segment 4 repair (needs ffmpeg)
```

Fonts and media keep stable file names, so `netlify.toml` caches them with revalidation
(`/media/*` 1 day, `/fonts/*` 7 days, then refreshed in the background) rather than as immutable;
regenerated files reach returning visitors on their next visit. Hashed build assets (`/_astro/*`) are
cached for a year.

## Local development

```bash
npm ci
npm run dev          # http://localhost:4321/hy/
npm run build        # production build into dist/
npm run check:links  # verifies every referenced asset/anchor/hreflang in dist/
npm run preview
```

Node ≥ 22.22 (see `.nvmrc`).

## Verification (before handover)

Checked on a fresh clone of this branch: `npm ci` → `npm run build` → `npm run check:links`
(Node 22.22.0, Astro 7.3.8). It was served by a local static server that mimics Netlify: the headers
from `netlify.toml` (CSP, cache-control), brotli, the cookie-based `/` redirect, `404.html`, and `404`
for form POSTs (form detection off).

| Check | Result |
| --- | --- |
| End-to-end (Playwright) — Chromium 141, Firefox 142, WebKit 26 | All pass in all three engines: 14 colour swatches + "Other" for both products; configuration carried into the form; validation; honest fallback when not delivered; Netlify payload/success only on HTTP 200; language switch keeps section, colour, form draft and hero position; `/` redirect; reduced motion; keyboard; 404; mobile menu |
| Hero acceptance — Chromium 141 | 44/44: keyboard, slow and rapid wheel with reversals, real touch drags and flings with direction changes, no autoplay, held start/end stills, headline always visible, release into the next section, skip link, resize, rotation, refresh, back navigation, media-failure fallback, no blank frames, phone layouts 360/390/740×360 |
| Hero acceptance — Firefox 142 / WebKit 26 (desktop + phone profiles) | 42/42 in Firefox (refresh/back scroll restore not checked: Playwright's Firefox doesn't restore scroll even on a plain page); all checks pass in WebKit, which additionally logs a misleading "access control checks" message for frame requests cancelled by a reload |
| Accessibility (axe-core 4.10) | 0 violations — hy & en at 1280 px, hy at 390 px |
| Lighthouse 12.8 mobile (Moto G Power emulation, simulated slow 4G: 150 ms RTT, 1.6 Mbps; 4× CPU) | hy: 97–98 · LCP 2.3–2.4 s (3 runs) · CLS 0 · TBT 0 ms — en: 99 · LCP 2.1 s · CLS 0 · TBT 0 ms |
| Lighthouse 12.8 desktop | hy & en: 100 · LCP 0.4 s · CLS ≤ 0.001 · TBT 0 ms |
| Lighthouse a11y / best practices / SEO | 100 / 100 / 100 (all runs) |
| Interaction latency (Event Timing, same data as INP) | worst 88 ms on mobile with 4× CPU slowdown; 64 ms mobile; 32 ms desktop |
| Hero scrubbing, first pass (frames loading as you scroll) / second pass | desktop 1440×900: 59.8 / 59.9 fps, p95 16.8 ms, all 180 frames shown · phone 390×844 @3×: 60.0 / 60.2 fps, p95 16.8 ms · phone with 4× CPU slowdown: switches to the lighter set, 45 / 57 fps, p95 33 ms |
| Memory while scrubbing (renderer process RSS, 3 full forward + back passes) | desktop: 238 MB idle → peak 375 MB (+137 MB) · phone @3×: 221 MB → peak 292 MB (+71 MB), flat across passes · JS heap ≤ 4 MB · decoded frames never exceed the caps |
| Layout | no horizontal overflow at 24 widths from 320 to 1600 px (hy & en); also checked at 1920 and 2560; phone landscape 740×360 |

Conditions: headless browsers on Linux with software rendering (no GPU), Playwright 1.56 builds of
Chromium, Firefox and WebKit. Real phones with GPU compositing typically scroll the canvas more smoothly.
**Not tested:** Safari on a real iPhone/iPad, Chrome on a real Android phone, any physical device, and
field data (LCP/CLS/INP from real visitors) — check these after the first deploy (e.g. PageSpeed Insights).

### Known limitations

- **Hero motion** (no Higgsfield credits were left for regenerating):
  - The wall art fades in (desktop stage 5, phones end of stage 4) rather than being hung.
  - Phones, stage 4: the bench is carried in from the foreground, and after the repair the mattress
    appears from just above the headboard within about one frame of scrolling.
  - Desktop, stage 4: the bedside tables change shape for about three frames as they settle.
- **Resolution:** the phone stages 4–5 were generated at 720p, so all phone frames are 720×1280
  (sharper 1080×1920 stills are shown when the visitor stops at the start and the end). Some photos
  are limited by their sources: the bed colour preview (1200 px), kitchen crops (from a 1536 px photo)
  and Instagram crops (1080 px posts).

## Content notes

- Only facts published by the business (Instagram) or supplied by the client are used; see
  [`docs/research-log.md`](docs/research-log.md). No address, opening hours, prices or reviews are
  shown because none are published (to add them, see "Unresolved" in the research log).
- Visualisations (hero animation, colour previews, some category images) are labelled as such.
- Contact channels are the published ones only: phone 033 26 33 66 and Instagram Direct. If the
  business also wants SMS/WhatsApp/Viber offered, confirm them first (see the research log).
