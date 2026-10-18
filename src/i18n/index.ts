import hy, { type Dict } from './hy';
import en from './en';

export type Lang = 'hy' | 'en';
export const langs: Lang[] = ['hy', 'en'];
export const defaultLang: Lang = 'hy';

const dicts: Record<Lang, Dict> = { hy, en };

export function t(lang: Lang): Dict {
  return dicts[lang];
}

/**
 * For text that CSS renders in capitals (eyebrows, badges, small labels). Browsers uppercase the
 * Armenian ligature «և» to the classical «ԵՒ»; spelled «եվ» it becomes «ԵՎ», the modern spelling
 * used everywhere else on the site (screen readers read both the same).
 */
export const caps = (text: string) => text.replace(/և/g, 'եվ');

export const langLabels: Record<Lang, { short: string; long: string }> = {
  hy: { short: 'Հայ', long: 'Հայերեն' },
  en: { short: 'EN', long: 'English' },
};

export type { Dict };
