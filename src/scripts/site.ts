import { KEYS, load, save, prefill } from './state';

/** Header: transparent over the hero, solid afterwards; mobile menu; active section link. */
function initHeader() {
  const header = document.querySelector<HTMLElement>('[data-header]');
  if (!header) return;
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  const btn = header.querySelector<HTMLButtonElement>('[data-menu-button]')!;
  const menu = header.querySelector<HTMLElement>('[data-menu]')!;
  const label = header.querySelector<HTMLElement>('[data-menu-label]')!;

  // The threshold is measured on load/resize only: reading layout inside the scroll handler
  // would force a synchronous re-layout on every frame while the hero animates.
  let limit = 40;
  const measure = () => {
    limit = Math.max(40, hero ? hero.offsetTop + hero.offsetHeight - window.innerHeight * 0.85 : 40);
  };
  let ticking = false;
  let solid: boolean | null = null;
  const update = () => {
    ticking = false;
    const next = window.scrollY > limit || !menu.hidden;
    if (next !== solid) {
      solid = next;
      header.toggleAttribute('data-solid', next);
    }
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  window.addEventListener('resize', () => {
    measure();
    update();
  });
  window.addEventListener('load', () => {
    measure();
    update();
  });
  measure();
  update();

  const setOpen = (open: boolean) => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    label.textContent = open ? btn.dataset.labelClose! : btn.dataset.labelOpen!;
    update();
    if (open) menu.querySelector<HTMLElement>('a')?.focus();
  };
  btn.addEventListener('click', () => setOpen(menu.hidden));
  menu.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-menu-link]')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      btn.focus();
    }
    // While the menu covers the page, Tab cycles between the menu button and the menu's links
    // instead of moving to page content hidden behind it.
    if (e.key === 'Tab' && !menu.hidden) {
      const items = [btn, ...menu.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (i === -1) return;
      e.preventDefault();
      items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !header.contains(e.target as Node)) setOpen(false);
  });
  window.matchMedia('(min-width: 1061px)').addEventListener('change', (mq) => {
    if (mq.matches) setOpen(false);
  });

  // Highlight the nav link of the section in view
  const navLinks = [...header.querySelectorAll<HTMLAnchorElement>('.header__nav a[href^="#"]')];
  const sections = navLinks
    .map((a) => document.querySelector<HTMLElement>(a.getAttribute('href')!))
    .filter((s): s is HTMLElement => !!s);
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = `#${entry.target.id}`;
        navLinks.forEach((a) => a.toggleAttribute('aria-current', a.getAttribute('href') === id));
      }
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  sections.forEach((s) => io.observe(s));
}

/** Fade/slide-in of content blocks as they enter the viewport. */
function initReveal() {
  const els = document.querySelectorAll<HTMLElement>('.reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  els.forEach((el) => io.observe(el));
}

/** Links that open the inquiry form with a request type / furniture pre-selected. */
function initRequestLinks() {
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-request], [data-furniture]');
    if (!a || a.hasAttribute('data-config-cta')) return;
    prefill({
      requestType: a.dataset.request,
      furniture: a.dataset.furniture,
      focus: a.dataset.request === 'custom' ? 'model' : 'name',
    });
  });
}

/**
 * Language switch: go to the equivalent page and section, remember an explicit choice
 * (cookie read by the Netlify redirect for "/"), and keep the hero position.
 * The colour selection and any unsent form draft are kept in sessionStorage.
 */
function initLanguageSwitch() {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('[data-lang-switch]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const lang = a.dataset.langSwitch!;
    if (a.getAttribute('aria-current') === 'true') {
      e.preventDefault();
      return;
    }
    try {
      document.cookie =
        lang === 'en'
          ? 'sf_lang_en=1; path=/; max-age=31536000; samesite=lax'
          : 'sf_lang_en=; path=/; max-age=0; samesite=lax';
      localStorage.setItem('sf-lang', lang);
    } catch {
      /* ignore */
    }
    let hash = '';
    const heroEnd = hero ? hero.offsetTop + hero.offsetHeight - window.innerHeight : 0;
    if (hero && window.scrollY < heroEnd) {
      save(KEYS.heroY, { y: window.scrollY });
    } else {
      const sections = [...document.querySelectorAll<HTMLElement>('main section[id]')];
      const mark = window.innerHeight * 0.3;
      let current: HTMLElement | undefined;
      for (const s of sections) if (s.getBoundingClientRect().top <= mark) current = s;
      if (current) hash = `#${current.id}`;
    }
    e.preventDefault();
    window.location.href = `/${lang}/${hash}`;
  });

  const heroY = load<{ y: number }>(KEYS.heroY);
  if (heroY && !location.hash) {
    save(KEYS.heroY, null);
    requestAnimationFrame(() => window.scrollTo({ top: heroY.y, behavior: 'instant' as ScrollBehavior }));
  } else if (heroY) {
    save(KEYS.heroY, null);
  }
}

/**
 * Sections below the hero skip layout until they come near the screen (content-visibility in
 * global.css). Once the page is idle, each is laid out once, one per idle slot, so its real height
 * is remembered and in-page links land exactly (Safari doesn't correct the scroll position when
 * content above changes size). A link followed before that lays out the whole page first.
 */
function initLazyLayout() {
  const root = document.documentElement;
  if (root.classList.contains('cv-off') || !CSS.supports('content-visibility', 'auto')) return;
  const sections = [...document.querySelectorAll<HTMLElement>('main > section:not(.hero), .footer')];
  document.addEventListener(
    'click',
    (e) => {
      if ((e.target as HTMLElement).closest('a[href^="#"]')) root.classList.add('cv-off');
    },
    true,
  );
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  const idle = (cb: () => void) => (ric ? ric(cb, { timeout: 2000 }) : window.setTimeout(cb, 100));
  let i = 0;
  const next = () => {
    if (root.classList.contains('cv-off') || i >= sections.length) return;
    const el = sections[i++];
    el.style.contentVisibility = 'visible';
    // laid out in the next frame, which records its size; then it may skip again
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.style.contentVisibility = '';
        idle(next);
      }),
    );
  };
  const start = () => idle(next);
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
  // heights change with the width: record them again after a resize or rotation
  let timer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      i = 0;
      start();
    }, 500);
  });
}

export function initSite() {
  initHeader();
  initReveal();
  initRequestLinks();
  initLanguageSwitch();
  initLazyLayout();
}
