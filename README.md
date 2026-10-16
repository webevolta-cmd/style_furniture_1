# Style Furniture — website

Bilingual (Armenian / English) website for **Style Furniture**, a custom furniture maker in Yerevan
([@style_furniture_1](https://www.instagram.com/style_furniture_1/), ☎ 033 26 33 66).

Static site built with [Astro](https://astro.build) — no server, no database, no API keys.

## Deploy (the only step left)

1. In Netlify: **Add new site → Import an existing project → GitHub →** choose this repository.
2. Click **Deploy**. Everything else is read from [`netlify.toml`](netlify.toml):
   build command `npm run build`, publish directory `dist`, Node `22.22.0`, redirects and headers.

Routes: `/hy/` (Armenian, default) and `/en/` (English). `/` redirects to `/hy/`, or to `/en/` for a
visitor who explicitly picked English before (cookie set by the language switch — no geo-guessing).
Canonical, `hreflang`, Open Graph and `sitemap.xml` URLs use Netlify's site URL automatically.

### Inquiry form

The request form works immediately after deploy:

- It first tries to submit to **Netlify Forms** (`name="inquiry"`, honeypot spam protection).
- Netlify only stores submissions when *form detection* is switched on for the site
  (**Site configuration → Forms → Enable form detection**, then redeploy; add an email under
  *Form notifications* to receive them by email). Netlify turns this off by default for new sites
  and it cannot be enabled from the repository. It's an optional setting.
- Whenever online delivery isn't confirmed (detection off, offline, error), the visitor never sees a fake
  "sent" message. Instead the complete request (type, contact, furniture, colour/configuration,
  dimensions, model, link, message) is shown and can be sent in one tap by **SMS** to 033 26 33 66,
  **copied into Instagram Direct**, or the visitor can call. So no inquiry is lost either way.

## What's inside

```
src/
  data/business.ts      verified business facts (phone, Instagram, locality) – see docs/research-log.md
  data/furniture.ts     furniture categories + colour-configurator products/finishes
  data/images.json      generated image manifest (sizes for CLS-free responsive images)
  data/hero.json        generated hero frame-sequence manifest
  i18n/hy.ts, en.ts     all copy, labels, errors, SEO text (en is type-checked against hy)
  components/           Header, Hero, Services, About, Furniture, Configurator, Process,
                        Craft, Projects, Inquiry, Contact, Footer, Picture, Icon, Logo
  scripts/hero.ts       scroll-controlled frame sequence (canvas)
  scripts/configurator.ts, inquiry.ts, site.ts, state.ts
  pages/[lang]/index.astro, index.astro (root fallback), 404.astro, sitemap.xml.ts, robots.txt.ts
public/
  media/hero/           hero frames: desktop (180×1600×900), desktop-lite (90×1280×720),
                        mobile (180×720×1280), mobile-lite (90×540×960) + start/end posters
  media/img/            responsive AVIF/WebP/JPEG photos   media/config/  colour-preview variants
  fonts/                self-hosted Cormorant Garamond, Manrope, Noto Serif/Sans Armenian (SIL OFL)
media-src/              masters (not deployed): Higgsfield video segments, keyframes,
                        original + upscaled photos, configurator variants and masks
scripts/media/          scripts that produced public/media from media-src (run manually)
docs/research-log.md    sources, verified facts, client-supplied facts, open points
```

### Hero (Higgsfield)

The hero is generated with Higgsfield from the client's bedroom photo: a bare-walls version of the
same room (floor and curtains kept) and four intermediate assembly keyframes were made with
GPT Image 2.5, colour-matched to the reference, then animated pairwise with **Kling 3.0 Omni
(first/last frame, 1080p, locked camera)** — 5 segments per orientation (16:9 desktop, 9:16 mobile):
MDF wall panels → wardrobe carcass → doors & bed base → headboard, mattress & bedside tables →
bedding, bench, art and decor. The frames are scrubbed by scroll (forward and backward), with a gentle
canvas dolly. Visitors with *reduced motion* get the finished room as a still image.
Constrained connections (Save-Data, 2G/3G, ≤2 GB RAM) get the lighter frame set automatically.

### Colour selector

Two real products (layered-headboard bed, rounded armchair). Variants were recoloured with
Higgsfield (Nano Banana 2) and composited back onto the original photo through a product mask,
so only the upholstery changes; everything else is pixel-identical. "Other colour" lets visitors
request any colour that isn't pre-rendered. The selection is carried into the inquiry form.

### Regenerating media (optional)

```bash
npm ci
node scripts/media/build-hero-frames.mjs   # needs ffmpeg; reads media-src/hero/*.mp4
node scripts/media/build-images.mjs        # photos, configurator previews, OG image
```

## Local development

```bash
npm ci
npm run dev          # http://localhost:4321/hy/
npm run build        # production build into dist/
npm run check:links  # verifies every referenced asset/anchor/hreflang in dist/
npm run preview
```

Node ≥ 22.22 (see `.nvmrc`).

## Content notes

- Only facts published by the business (Instagram) or supplied by the client are used; see
  [`docs/research-log.md`](docs/research-log.md). No address, opening hours, prices or reviews are
  shown because none are published. Add them in `src/data/business.ts` + `src/i18n/*` if needed.
- Visualisations (hero animation, some category images) are labelled as such on the site.
