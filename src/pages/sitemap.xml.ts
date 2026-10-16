import type { APIRoute } from 'astro';
import { langs } from '../i18n';

export const GET: APIRoute = ({ site }) => {
  const url = (l: string) => new URL(`/${l}/`, site).href;
  const alternates = langs
    .map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${url(l)}"/>`)
    .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${url('hy')}"/>`)
    .join('\n');
  const body = langs
    .map((l) => `  <url>\n    <loc>${url(l)}</loc>\n${alternates}\n    <changefreq>monthly</changefreq>\n    <priority>${l === 'hy' ? '1.0' : '0.9'}</priority>\n  </url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${body}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
