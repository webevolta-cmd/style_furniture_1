import { defineConfig } from 'astro/config';

// Netlify exposes the site's primary address as `URL` during builds, so canonical,
// hreflang, Open Graph and sitemap URLs follow whatever domain the site is deployed on.
const site = process.env.URL || 'https://style-furniture.netlify.app';

// Static, prerendered build. Netlify serves `dist/` directly (see netlify.toml).
export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'always',
  // Keep regular HTML whitespace semantics (Astro 7 defaults to JSX-style stripping).
  compressHTML: true,
  build: {
    format: 'directory',
    inlineStylesheets: 'always',
  },
  devToolbar: { enabled: false },
});
