import { KEYS, load, save, prefill, type ConfigSelection } from './state';

interface ProductData {
  id: string;
  formValue: string;
  name: string;
  alt: string;
  width: number;
  height: number;
  widths: number[];
  defaultFinish: string;
  finishes: { id: string; name: string }[];
}

export function initConfigurator() {
  const root = document.querySelector<HTMLElement>('[data-config]');
  if (!root) return;
  const products: ProductData[] = JSON.parse(root.dataset.products || '[]');
  const sizes = root.dataset.sizes || '100vw';
  const frame = root.querySelector<HTMLElement>('[data-config-frame]')!;
  const img = root.querySelector<HTMLImageElement>('[data-config-img]')!;
  const next = root.querySelector<HTMLImageElement>('[data-config-next]')!;
  const summary = root.querySelector<HTMLElement>('[data-config-summary]')!;
  const otherBox = root.querySelector<HTMLElement>('[data-config-other]')!;
  const otherInput = root.querySelector<HTMLInputElement>('[data-config-other-input]')!;
  const otherFlag = root.querySelector<HTMLElement>('[data-config-other-flag]')!;
  const cta = root.querySelector<HTMLAnchorElement>('[data-config-cta]')!;
  const status = root.querySelector<HTMLElement>('[data-config-status]')!;
  const otherLabel = root.querySelector('.swatch--other .swatch__name')?.textContent?.trim() ?? '';

  const state: ConfigSelection & { lastPreset: Record<string, string> } = {
    product: products[0].id,
    finish: products[0].defaultFinish,
    other: '',
    lastPreset: Object.fromEntries(products.map((p) => [p.id, p.defaultFinish])),
  };

  const product = () => products.find((p) => p.id === state.product)!;
  const srcset = (p: ProductData, f: string) =>
    p.widths.map((w) => `/media/config/${p.id}/${f}-${w}.webp ${w}w`).join(', ');

  let token = 0;
  let spinnerTimer = 0;

  /** Swap the preview image without a blank frame: preload, then cross-fade. */
  const showImage = (p: ProductData, finish: string, instant = false) => {
    const my = ++token;
    const set = srcset(p, finish);
    const finishName = p.finishes.find((f) => f.id === finish)?.name ?? '';
    const alt = `${p.alt}: ${finishName}`;
    if (img.getAttribute('srcset') === set) return;
    frame.style.setProperty('--ar', `${p.width}/${p.height}`);
    frame.style.setProperty('--arn', String(p.width / p.height));
    const probe = new Image();
    probe.sizes = sizes;
    probe.srcset = set;
    probe.src = `/media/config/${p.id}/${finish}-${p.widths[p.widths.length - 1]}.webp`;
    clearTimeout(spinnerTimer);
    spinnerTimer = window.setTimeout(() => frame.classList.add('is-loading'), 160);
    const done = () => {
      if (my !== token) return;
      clearTimeout(spinnerTimer);
      frame.classList.remove('is-loading');
      if (instant) {
        img.sizes = sizes;
        img.srcset = set;
        img.alt = alt;
        return;
      }
      next.sizes = sizes;
      next.srcset = set;
      next.classList.add('is-visible');
      window.setTimeout(() => {
        if (my !== token) return;
        img.sizes = sizes;
        img.srcset = set;
        img.alt = alt;
        // keep the overlay until the base image has the same pixels, then drop it
        img.decode().catch(() => {}).finally(() => {
          if (my === token) next.classList.remove('is-visible');
        });
      }, 360);
    };
    probe.decode().then(done, done);
  };

  const render = (announce = true, instant = false) => {
    const p = product();
    root.querySelectorAll<HTMLElement>('[data-swatches]').forEach((fs) => {
      fs.hidden = fs.dataset.swatches !== p.id;
    });
    const isOther = state.finish === 'other';
    const preset = isOther ? state.lastPreset[p.id] : state.finish;
    showImage(p, preset, instant);
    frame.classList.toggle('is-other', isOther);
    otherBox.hidden = !isOther;
    otherFlag.hidden = !isOther;
    const colorName = isOther ? state.other?.trim() || otherLabel : p.finishes.find((f) => f.id === state.finish)?.name;
    // Announce selection changes politely, but not every keystroke of the custom colour field.
    if (!announce) status.setAttribute('aria-live', 'off');
    summary.textContent = `${p.name} · ${colorName}`;
    if (!announce) requestAnimationFrame(() => status.setAttribute('aria-live', 'polite'));
    save(KEYS.config, { product: state.product, finish: state.finish, other: state.other });
  };

  // restore (e.g. after switching language)
  const saved = load<ConfigSelection>(KEYS.config);
  if (saved && products.some((p) => p.id === saved.product)) {
    state.product = saved.product;
    const p = product();
    state.finish = saved.finish === 'other' || p.finishes.some((f) => f.id === saved.finish) ? saved.finish : p.defaultFinish;
    state.other = saved.other || '';
    if (state.finish !== 'other') state.lastPreset[p.id] = state.finish;
    root.querySelector<HTMLInputElement>(`[name="cfg-product"][value="${state.product}"]`)!.checked = true;
    const radio = root.querySelector<HTMLInputElement>(`[name="cfg-finish-${state.product}"][value="${state.finish}"]`);
    if (radio) radio.checked = true;
    otherInput.value = state.other;
    render(false, true);
  }

  root.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.name === 'cfg-product') {
      state.product = input.value;
      const checked = root.querySelector<HTMLInputElement>(`[name="cfg-finish-${input.value}"]:checked`);
      state.finish = checked?.value ?? product().defaultFinish;
      render();
    } else if (input.name.startsWith('cfg-finish-')) {
      state.finish = input.value;
      if (input.value !== 'other') state.lastPreset[state.product] = input.value;
      render();
      if (input.value === 'other') otherInput.focus();
    }
  });
  otherInput.addEventListener('input', () => {
    state.other = otherInput.value;
    render(false);
  });

  // Warm the cache for the other finishes of the visible product once the section is near.
  const warm = () => {
    const p = product();
    const w = p.widths.find((x) => x >= Math.min(1200, frame.clientWidth * Math.min(2, devicePixelRatio))) ?? p.widths.at(-1);
    p.finishes.forEach((f) => {
      const i = new Image();
      i.src = `/media/config/${p.id}/${f.id}-${w}.webp`;
    });
  };
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        window.setTimeout(warm, 400);
      }
    },
    { rootMargin: '400px 0px' },
  );
  io.observe(root);

  cta.addEventListener('click', () => {
    const p = product();
    const isOther = state.finish === 'other';
    const finishName = isOther ? state.other?.trim() || '' : p.finishes.find((f) => f.id === state.finish)?.name || '';
    prefill({
      requestType: 'quote',
      furniture: p.formValue,
      config: {
        label: `${p.name} · ${finishName || otherLabel}`,
        product: p.id,
        finish: state.finish,
        colorText: finishName,
      },
      focus: 'name',
    });
  });
}
