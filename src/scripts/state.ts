/** Small helpers for per-tab state that must survive a language switch. */

export const KEYS = {
  config: 'sf-config',
  draft: 'sf-draft',
  heroY: 'sf-hero-y',
} as const;

export function load<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function save(key: string, value: unknown) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode / quota) – state simply isn't carried over */
  }
}

export interface ConfigSelection {
  product: string;
  finish: string; // finish id or 'other'
  other?: string;
}

export interface PrefillDetail {
  requestType?: string;
  furniture?: string;
  config?: { label: string; product: string; finish: string; colorText: string } | null;
  focus?: 'name' | 'model';
}

export const PREFILL_EVENT = 'sf:prefill';

export function prefill(detail: PrefillDetail) {
  document.dispatchEvent(new CustomEvent<PrefillDetail>(PREFILL_EVENT, { detail }));
}
