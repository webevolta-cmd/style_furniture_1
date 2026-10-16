import { KEYS, load, save, prefill } from './state';

/** Header: transparent over the hero, solid afterwards; mobile menu; active section link. */
function initHeader() {
  const header = document.querySelector<HTMLElement>('[data-header]');
  if (!header) return;
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  const btn = header.querySelector<HTMLButtonElement>('[data-menu-button]')!;
  const menu = header.querySelector<HTMLElement>('[data-menu]')!;
  const label = header.querySelector<HTMLElement>('[data-menu-label]')!;

  let ticking = false;
  const update = () => {
    ticking = false;
    const limit = hero ? hero.offsetTop + hero.offsetHeight - window.innerHeight * 0.85 : 40;
    const solid = window.scrollY > Math.max(40, limit) || !menu.hidden;
    header.toggleAttribute('data-solid', solid);
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
  window.addEventListener('resize', update);
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

export function initSite() {
  initHeader();
  initReveal();
  initRequestLinks();
  initLanguageSwitch();
}
