/**
 * Business facts used across the site.
 *
 * `verified`  – published by the business itself on its official Instagram profile
 *               (bio, captions, posts), checked on 2026-10-16. See docs/research-log.md.
 * `client`    – supplied directly by the client for this website (authoritative).
 *
 * Nothing here is inferred. Fields that could not be verified (street address,
 * opening hours, ratings/reviews, prices, delivery terms) are intentionally absent.
 */
export const business = {
  name: 'Style Furniture',
  legalDisplayName: 'Style Furniture',

  // verified: Instagram bio "📞 Պատվերներ՝ 033 26 33 66"
  phone: {
    display: '033 26 33 66',
    displayIntl: '+374 33 26 33 66',
    e164: '+37433263366',
  },

  // verified: official profile
  instagram: {
    handle: 'style_furniture_1',
    url: 'https://www.instagram.com/style_furniture_1/',
    // ig.me opens a Direct conversation with the account (captions: "write to Direct")
    direct: 'https://ig.me/m/style_furniture_1',
  },

  // verified: posts tagged #erevan / #կահույքհայաստանում; Armenian phone number.
  // No street address or showroom is published, so none is shown.
  locality: { hy: 'Երևան, Հայաստան', en: 'Yerevan, Armenia' },
  addressLocality: 'Yerevan',
  addressCountry: 'AM',
} as const;

export type Business = typeof business;
