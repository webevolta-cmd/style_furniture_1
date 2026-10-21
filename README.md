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
  i18n/hy.ts, en.ts     all copy, labels, errors, SEO text (en is type-checked against hy in the build)
  components/           Header, Hero, Services, About, Furniture, Configurator, Process,
                        Craft, Projects, Inquiry, Contact, Footer, Picture, Icon, Logo
  scripts/hero.ts       scroll-controlled frame sequence (canvas)
  scripts/configurator.ts, inquiry.ts, site.ts, state.ts
  pages/[lang]/index.astro, index.astro (root fallback), 404.astro, sitemap.xml.ts, robots.txt.ts
public/
  media/hero/           hero frames: desktop (180×1600×900), desktop-lite (90×1280×720),
                        mobile (90×720×1280), mobile-lite (90×540×960) + start/end stills
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
from it **backwards** by masked inpainting (GPT Image 2.5, Nano Banana 2), so in every keyframe each
piece of furniture is identical from the stage it appears in to the end. Each pair of neighbouring stages was then
animated with **Kling 3.0 Omni (first/last frame, locked camera)** — 5 segments per orientation
(16:9 desktop, 9:16 phones): MDF wall panels → wardrobe → wardrobe doors & bed base → mattress,
headboard, bedside tables & bench → bedding, art & finishing touches.

- 180 frames, **36 per stage**, so every stage ends exactly on its keyframe and desktop and phones
  share the same stage boundaries; phones use every second frame (90, about 26 px of scrolling each:
  half the data, the same motion). Scroll maps to whole frames, forward and backward, with no
  blending between frames; the first 5 % of the pinned scroll holds the bare room and the last 14 %
  holds the finished room, both shown as full-resolution stills (the keyframes themselves, which match
  the first and last frames, so the hand-over is instant). One gentle camera move: a 5 % pull-back.
- Loading: nothing before the page has loaded and is idle; then a small coarse pass (one frame in
  twelve, so any position has a nearby frame) and the window ahead of the current position, so the
  first flick finds its frames ready; as the visitor scrolls, the window follows (36 frames ahead,
  12 behind): the nearest frames first, then every 4th and every 2nd frame ahead, so a fast scroll on
  a slow connection still gets evenly spaced frames. Six requests run at a time (three on the
  lighter sets), which keeps a high-latency mobile link busy. Frames are decoded in a worker thread
  (Safari and Firefox would otherwise decode on the main thread and stall scrolling), further ahead
  while the visitor scrolls fast. On touch the picture follows the finger almost directly; wheel
  steps are eased over the frames in between. The stage name and progress always describe the
  frame on screen; while it lags the scroll position, the progress bar breathes. Fetched frames are
  kept compressed (at most the whole set: 9.2 MB desktop, 4.3 MB phones) and only a few are decoded at a
  time (desktop 16, phones 12), so memory stays bounded and flat however often the visitor scrubs.
  Fetching pauses off-screen and in background
  tabs, and requests are cancelled when the page is left. A failed request is treated as a dropped
  connection: requests continue one at a time with growing pauses (1, 1, 2, 4, 8 s), and at once when
  the browser reports it is back online.
- Adaptation: Save-Data, 2G/3G, a browser-reported downlink < 2 Mbit/s, ≤ 2 GB RAM or ≤ 2 CPU cores
  start on the lighter set; a throughput below ~0.8 MB/s measured on the first frames (time spent
  paused off-screen or after a failure doesn't count), or scrubbing
  slower than ~40 fps (p95 frame time > 24 ms), switches once to the lighter set, keeping the current
  position and the picture on screen.
- *Reduced motion*: the finished room as a still image, no pinned scrolling (also when the setting is
  changed while the page is open). If no frame loads for about 2 s (offline, blocked), the finished room
  is shown as one still image once the visitor scrolls in, with the stage indicator on the last stage;
  the animation comes back as soon as frames load again.
- Repairs after generation (`scripts/media/repair_hero_clips.py`; the camera is locked, so a defect in
  a region no furniture moves through is replaced by a clean, exposure-matched plate of the same room;
  the untouched generations are kept in `media-src/hero/generated/`):
  - phones, stage 4: Kling lowered the mattress through a hatch opening in the ceiling and opened the
    finished wardrobe to slide a headboard panel out of it. The ceiling and the closed wardrobe (around
    the bedside table sliding in front of it) are kept until the mattress is just above the headboard,
    then hand back to the generated frames together, so the wardrobe has no seam; its handles change
    style in one frame; the panel appears from behind the wardrobe;
  - phones, stage 5: a smoke-like stain on the headboard is removed until the duvet covers that area;
  - desktop, stages 1–3: the curtains drifted into a crinkled texture and snapped back at stage 4; they
    now keep clean folds, turning gradually into those of stage 4.

### Colour selector

Two real products photographed by the business (layered-headboard bed, rounded clinic armchair).
Higgsfield (Nano Banana 2) renders in `media-src/config/raw/` serve only as **colour references**:
`scripts/media/recolor_variants.py` builds a soft upholstery matte from where the renders agree the
fabric changed (product regions only, specks removed, seams filled, anti-aliased edges; bedding, vase
stems and the far chair's cushion are cut out along traced outlines, and the bench in front of the
bed is traced and always takes the bed's finish), learns each
finish as a lightness → colour curve, and applies it to the **original photo**. Texture, folds, seams,
shading and everything outside the upholstery stay those of the real photograph — no generated
texture, no stray dots. *Black* is derived from the darkest render. "Other colour" lets visitors
request any colour; the selection (product, finish or custom colour) is carried into the inquiry form
and relabelled if the visitor switches language.

### Loading

- First paint needs only the HTML (CSS inline), the self-hosted fonts (each page preloads the ones its
  text uses; all `font-display: swap`) and the opening still (preloaded per orientation, at most
  860 px wide on phones).
  The page script is a single 10 KB module; the hero frames start only once the page has loaded and
  is idle.
- Sections below the hero (`content-visibility: auto`) are laid out only when they come near the
  screen, so the first layout covers the header and the hero alone: on a phone with a 4× slower CPU
  the longest startup task drops from ~210 ms to ~65 ms (Armenian text is costly to lay out). Once
  the page is idle, `site.ts` lays each section out once, one per idle slot, so real heights are
  known and in-page links land exactly in every browser (also Safari, which doesn't correct the
  scroll position when content above changes size); a link followed before that, or a page opened
  at a section, lays out the whole page first.

### Regenerating media (optional)

```bash
npm ci
node scripts/media/build-hero-frames.mjs           # needs ffmpeg; reads media-src/hero/*.mp4 (~6 min)
node scripts/media/build-hero-frames.mjs posters   # start/end stills only
node scripts/media/build-images.mjs                # photos, colour previews, OG image
node scripts/media/build-images.mjs config         # colour previews only
# Python 3 + opencv-python-headless + numpy:
python3 scripts/media/recolor_variants.py          # colour variants from media-src/config/raw/
python3 scripts/media/repair_hero_clips.py         # hero clip repairs, generated/ → hero/ (needs ffmpeg)
# Python 3 + Pillow + numpy (keyframe work only; usage in the script's docstring):
python3 scripts/media/colormatch.py …              # matches a keyframe's colour to the finished room
```

JPEG and WebP outputs are reproduced byte for byte with the locked `sharp` 0.35.5. AVIF files made
before the update from 0.34.5 come out visually the same but not byte-identical (newer AVIF encoder),
so they were left as committed.

Fonts and media keep stable file names, so `netlify.toml` caches them with revalidation
(`/media/*` 1 day, `/fonts/*` 7 days, then refreshed in the background) rather than as immutable;
regenerated files reach returning visitors on their next visit. Hashed build assets (`/_astro/*`) are
cached for a year.

## Local development

```bash
npm ci
npm run dev          # http://localhost:4321/hy/
npm run build        # type-check (tsc) + production build into dist/
npm run check:types  # type-check only: e.g. a key missing from en.ts fails here and in the build
npm run check:links  # checks dist/: referenced assets (HTML and CSS), anchors, hreflang/canonical,
                     # hero frames and stills, every colour-preview image
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
| End-to-end (Playwright) — Chromium 141, Firefox 142, WebKit 26 | 38/38 in each engine: 14 colour swatches + "Other" for both products; configuration carried into the form; validation; honest fallback when not delivered; Netlify payload/success only on HTTP 200; language switch keeps section, colour, form draft and hero position; `/` redirect; reduced motion; keyboard; 404; mobile menu |
| Colour selector and form edge cases — all three engines | 16/16 in each: switching back to the colour on screen during a swap (also with a slow or failing preview); the "Other colour" backdrop after reload and language switch; "Other colour" without a name; the hand-off text following edits made after the fallback; the first invalid field shown with its label (1440 and 390 px), hy and en |
| Hero acceptance — Chromium 141 / WebKit 26 / Firefox 142 | 43/43 / 43/43 / 41/41 — keyboard, slow and rapid wheel with reversals, real touch drags and flings, no autoplay, held start/end stills, headline always visible, release into the next section, skip link, resize, rotation, refresh, back navigation, media-failure fallback, no blank frames, phone layouts 360/390/740×360. Firefox skips the refresh/back scroll-restore check (Playwright's Firefox doesn't restore scroll even on a plain page) |
| Hero runtime — Chromium / Firefox / WebKit | 16/16 / 15/15 / 15/15: only whole frames drawn; stage label follows the painted frame on a slow network, with a loading cue; slow 4G switches to the lighter set (Chromium only, CDP throttling); media failure shows one aligned still; reduced motion toggled live both ways; a 1.5 s network drop doesn't stop the animation and a 4.5 s one shows the still, then recovers; canvas never stretched during resize/rotation; leaving the hero during the first fetches keeps the full set; fallback stage indicator. Frames are decoded in the worker in all three engines (checked: no fallbacks) |
| Hero on a phone, first visit, real touch flings (emulated network, local build) | LTE (25 Mbps, 50 ms): the picture is within 2.6 frames of the scroll position 90 % of the time (was 5.2), never more than 4 behind, 60 fps, 4.3 MB of frames (was 8.4 MB) · 4G (9 Mbps, 85 ms) with a 4× slower CPU: 2.5 frames (was 4.7), 56 fps · 4 Mbps / 120 ms: more than 6 frames behind 2 % of the time (was 7 %) |
| In-page links — all three engines | 18/18 in each: header links right after load and after the page is idle, between sections, the phone menu and hero button, direct loads with `#section`: the section starts exactly below the fixed header |
| Touch targets and Armenian line breaks — all three engines | every header, contact and footer target ≥ 44×44 px at 320–1024 px and on landscape phones (hy & en); «Instagram-ի», «Pinterest-ի», «Direct-ով» … never break before the suffix at 320–420, 768 and 1280 px |
| Accessibility (axe-core 4.10) | 0 violations — hy & en at 1280 px, hy at 390 px |
| Lighthouse 12.8 mobile, live site (Moto G Power emulation, simulated slow 4G: 150 ms RTT, 1.6 Mbps; 4× CPU) | hy: 99–100 · LCP 1.5–2.0 s · TBT 20–50 ms · CLS 0–0.035 (3 runs) — en: 100 · LCP 1.7 s · TBT 20–40 ms · CLS 0 |
| Lighthouse 12.8 desktop, live site | hy & en: 100 · LCP 0.4–0.5 s · CLS ≤ 0.001 · TBT 0 ms |
| Lighthouse a11y / best practices / SEO | 100 / 100 / 100 (all runs) |
| Interaction latency (Event Timing, same data as INP) | worst 104 ms on mobile with 4× CPU slowdown; 64 ms mobile; 48 ms desktop |
| Hero scrubbing, first pass (frames loading as you scroll) / second pass (local) | desktop 1440×900: 59.5 / 59.6 fps, p95 16.8 ms, all 180 frames shown, each fetched once · phone 390×844 @3×: 60.0 / 60.2 fps, p95 16.8 ms, all 90 phone frames · phone with 4× CPU slowdown: switches to the lighter set, 55 / 60 fps |
| Memory while scrubbing (renderer process RSS) | desktop: 260 MB idle → peak 347 MB (+87 MB), flat over repeated passes (339–342 MB) · phone @3×: 230 MB → peak 279 MB (+49 MB) · JS heap ≤ 2 MB · decoded frames never exceed the caps |
| Layout | no horizontal overflow at 24 widths from 320 to 1600 px (hy & en); also checked at 1920 and 2560; phone landscape 740×360 |
| Build tooling | `tsc` passes (a key missing from `en.ts` fails the build); `check:links` fails on a removed font, colour preview, hero still, hreflang or canonical (mutation-tested) |
| Deployed site (stylefurniture.netlify.app) | every asset byte-identical to the tested build; headers, redirects, 404, sitemap/canonical/hreflang on the live domain; Chromium, WebKit and Firefox on desktop and phone: no console errors, CSP violations, failed requests or third-party requests |

Conditions: headless browsers on Linux with software rendering (no GPU), Playwright 1.56 builds of
Chromium, Firefox and WebKit; frame-rate, memory and Lighthouse figures are from Chromium. Headless
Firefox paints at only ~20 fps here, so while scrubbing it moves to the lighter frame set as designed.
Real phones with GPU compositing typically scroll the canvas more smoothly.
**Not tested:** Safari on a real iPhone/iPad, Chrome on a real Android phone, any physical device, and
field data (LCP/CLS/INP from real visitors) — check these after the first deploy (e.g. PageSpeed Insights).

### Known limitations

- **Hero motion.** Kling animates the movement between the keyframes, and some pieces do not arrive
  as installed parts: they grow, change shape or fade for a few frames (frame numbers of the 180-frame
  sequence; one frame is about 14 px of scrolling on a 1440×900 screen):
  - desktop, stage 2 (≈ 40–62): the wardrobe side panels rise out of the floor and bend before
    standing, and shelves appear between them before the carcass is complete;
  - desktop, stage 3 (≈ 73–80): the bed base first shows as a faint outline and grows out of the rug;
    door fronts and a shelf appear out of the wardrobe carcass;
  - desktop, stage 4 (≈ 114–135): the headboard changes shape several times before it settles, the
    bedside tables change shape for about three frames (≈ 124–128), the bench appears within two;
  - desktop, stage 5: the wall art fades in rather than being hung (≈ 147–150), the vase grows on the
    bedside table and the pillows rise out of the mattress (≈ 163–170);
  - phones, stage 2 (≈ 38–51): a wardrobe panel tilts up from the floor with a dark outline;
  - phones, stage 3 (≈ 75–85): the bed base shows as a faint outline before its rails appear; a
    wardrobe door briefly appears on the back wall over the pendant lamp, whose cord and globe fade out
    and come back;
  - phones, stage 4 (≈ 111–134): the headboard panels slide out from behind the closed wardrobe, the
    bedside tables and the bench are carried in from the foreground, the mattress appears from just
    above the headboard within about one frame, and the wall art fades in at the end;
  - phones, stage 5: the duvet rises from behind the headboard and the throw forms from soft shapes on
    the bed (≈ 146–160); the vase grows on the bedside table and the pillows rise out of the mattress
    (≈ 167–178).

  Clean versions need new Higgsfield generations with more intermediate keyframes (carcass standing,
  doors hung, base placed, headboard placed): roughly 40–60 credits. The account used has 0.22 credits
  left, so these were repaired where a clean plate could fix them and are disclosed here otherwise.
- **Resolution:** the phone stages 4–5 were generated at 720p, so all phone frames are 720×1280
  (sharper 860×1529 stills are shown when the visitor stops at the start and the end). Some photos
  are limited by their sources: the bed colour preview (1200 px), kitchen crops (from a 1536 px photo)
  and Instagram crops (1080 px posts; the fabric-samples image comes from a 405×720 cover, so it is
  slightly upscaled on high-DPI screens).

## Content notes

- Only facts published by the business (Instagram) or supplied by the client are used; see
  [`docs/research-log.md`](docs/research-log.md). No address, opening hours, prices or reviews are
  shown because none are published (to add them, see "Unresolved" in the research log).
- Visualisations (hero animation, colour previews, some category images) are labelled as such.
- Contact channels are the published ones only: phone 033 26 33 66 and Instagram Direct. If the
  business also wants SMS/WhatsApp/Viber offered, confirm them first (see the research log).
