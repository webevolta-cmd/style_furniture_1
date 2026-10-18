import { KEYS, load, save, PREFILL_EVENT, type PrefillDetail } from './state';

interface Text {
  errors: Record<string, string>;
  summaryTitle: string;
  summary: Record<string, string>;
  types: Record<string, string>;
  types2: Record<string, string>;
  methods: Record<string, string>;
  units: Record<string, string>;
  sending: string;
  submit: string;
  success: string;
  copied: string;
  copyFailed: string;
  langName: string;
}

/**
 * Netlify Forms endpoint. Netlify only accepts the submission when form handling is
 * active for the site; otherwise this path is a plain 404, which we treat as
 * "not delivered" and hand the request off to SMS / Instagram / phone instead.
 */
const ENDPOINT = '/forms/inquiry/';
const DRAFT_FIELDS = [
  'request_type',
  'name',
  'contact_method',
  'phone',
  'instagram',
  'furniture',
  'furniture_other',
  'color',
  'width',
  'depth',
  'height',
  'unit',
  'model',
  'reference_link',
  'message',
  'configuration',
];

export function initInquiry() {
  const form = document.querySelector<HTMLFormElement>('[data-inquiry]');
  if (!form) return;
  form.noValidate = true;
  const text: Text = JSON.parse(form.dataset.text || '{}');
  const phoneE164 = form.dataset.phone!;
  const igDirect = form.dataset.instagram!;
  const el = <T extends Element = HTMLInputElement>(sel: string) => form.querySelector<T>(sel)!;
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | RadioNodeList | null;
  const val = (name: string) => {
    const f = field(name);
    return f ? String((f as HTMLInputElement).value ?? '').trim() : '';
  };

  const card = form.parentElement!;
  const result = card.querySelector<HTMLElement>('[data-result]')!;
  const success = card.querySelector<HTMLElement>('[data-result-success]')!;
  const fallback = card.querySelector<HTMLElement>('[data-result-fallback]')!;
  const summaryBox = card.querySelector<HTMLTextAreaElement>('[data-summary]')!;
  const smsLink = card.querySelector<HTMLAnchorElement>('[data-sms]')!;
  const igBtn = card.querySelector<HTMLButtonElement>('[data-instagram-send]')!;
  const copyStatus = card.querySelector<HTMLElement>('[data-copy-status]')!;
  const errorSummary = el<HTMLElement>('[data-error-summary]');
  const submitBtn = el<HTMLButtonElement>('[data-submit]');
  const submitLabel = el<HTMLElement>('[data-submit-label]');
  const configField = el<HTMLInputElement>('[data-config-field]');
  const configChip = el<HTMLElement>('[data-config-chip]');
  const configChipText = el<HTMLElement>('[data-config-chip-text]');
  const phoneWrap = el<HTMLElement>('[data-field="phone"]');
  const igWrap = el<HTMLElement>('[data-field="instagram"]');
  const otherWrap = el<HTMLElement>('[data-field="furniture_other"]');
  const phoneInput = el<HTMLInputElement>('#f-phone');
  const igInput = el<HTMLInputElement>('#f-instagram');
  const otherInput = el<HTMLInputElement>('#f-other');
  const furnitureSelect = el<HTMLSelectElement>('#f-furniture');
  const colorInput = el<HTMLInputElement>('#f-color');
  let colorFromConfig = '';

  /* ---------- dependent fields ---------- */
  const syncDependent = () => {
    const method = val('contact_method') || 'call';
    const ig = method === 'instagram';
    igWrap.hidden = !ig;
    phoneWrap.hidden = ig;
    phoneInput.required = !ig;
    igInput.required = ig;
    const other = furnitureSelect.value === 'other';
    otherWrap.hidden = !other;
    otherInput.required = other;
  };

  // The configuration is kept as ids so it can be re-labelled in the page language after a
  // language switch; only text the visitor typed (a custom colour) is kept verbatim.
  type ConfigRef = { product: string; finish: string; other?: string };
  let configRef: ConfigRef | null = null;
  const setConfig = (label: string, ref: ConfigRef | null = null) => {
    configRef = label ? ref : null;
    configField.value = label;
    configChipText.textContent = label;
    configChip.hidden = !label;
  };
  const localizeConfig = (ref: ConfigRef) => {
    const root = document.querySelector<HTMLElement>('[data-config]');
    const products: { id: string; name: string; finishes: { id: string; name: string }[] }[] = JSON.parse(
      root?.dataset.products || '[]',
    );
    const p = products.find((x) => x.id === ref.product);
    if (!p) return null;
    const otherLabel = root?.querySelector('.swatch--other .swatch__name')?.textContent?.trim() ?? '';
    const color = ref.finish === 'other' ? ref.other?.trim() || '' : p.finishes.find((f) => f.id === ref.finish)?.name || '';
    return { label: `${p.name} · ${color || otherLabel}`, color };
  };

  /* ---------- draft persistence (survives a language switch) ---------- */
  const saveDraft = () => {
    const data: Record<string, string> = {};
    for (const name of DRAFT_FIELDS) data[name] = val(name);
    data.colorFromConfig = colorFromConfig;
    data.configRef = configRef ? JSON.stringify(configRef) : '';
    save(KEYS.draft, data);
  };
  const restoreDraft = () => {
    const data = load<Record<string, string>>(KEYS.draft);
    if (!data) return;
    for (const name of DRAFT_FIELDS) {
      const f = field(name);
      if (!f || data[name] === undefined || data[name] === '') continue;
      if (f instanceof RadioNodeList) f.value = data[name];
      else (f as HTMLInputElement).value = data[name];
    }
    colorFromConfig = data.colorFromConfig || '';
    let ref: ConfigRef | null = null;
    try {
      ref = data.configRef ? (JSON.parse(data.configRef) as ConfigRef) : null;
    } catch {
      ref = null;
    }
    const localized = ref && localizeConfig(ref);
    if (ref && localized) {
      // an auto-filled colour follows the language; a colour the visitor typed stays as typed
      if (colorFromConfig && colorInput.value === colorFromConfig) {
        colorInput.value = localized.color;
        colorFromConfig = localized.color;
      }
      setConfig(localized.label, ref);
    } else {
      setConfig(data.configuration || '', ref);
    }
  };
  restoreDraft();
  syncDependent();

  let draftTimer = 0;
  let attempted = false;
  form.addEventListener('input', (e) => {
    clearTimeout(draftTimer);
    draftTimer = window.setTimeout(saveDraft, 250);
    // After a failed submit, clear errors while the visitor types (never on blur, so the
    // layout can't shift under a pointer that is about to press the submit button).
    if (attempted && (e.target as HTMLElement).getAttribute('aria-invalid') === 'true') validate(true);
  });
  form.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t === colorInput) colorFromConfig = '';
    syncDependent();
    saveDraft();
    if (attempted && (t.tagName === 'SELECT' || t.type === 'radio')) validate(true);
  });

  /* ---------- prefill from CTAs and the colour configurator ---------- */
  document.addEventListener(PREFILL_EVENT, (e) => {
    const detail = (e as CustomEvent<PrefillDetail>).detail;
    if (detail.requestType) {
      const rt = field('request_type') as RadioNodeList;
      rt.value = detail.requestType;
    }
    if (detail.furniture) furnitureSelect.value = detail.furniture;
    if (detail.config !== undefined) {
      const c0 = detail.config;
      setConfig(c0?.label ?? '', c0 ? { product: c0.product, finish: c0.finish, other: c0.other } : null);
      const c = detail.config?.colorText ?? '';
      if (c && (!colorInput.value || colorInput.value === colorFromConfig)) {
        colorInput.value = c;
        colorFromConfig = c;
      }
    }
    syncDependent();
    saveDraft();
    resetResult();
    const target = detail.focus === 'model' ? el<HTMLTextAreaElement>('#f-model') : el<HTMLInputElement>('#f-name');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => target.focus({ preventScroll: true }), reduce ? 50 : 700);
  });

  el<HTMLButtonElement>('[data-config-remove]').addEventListener('click', () => {
    setConfig('');
    if (colorInput.value === colorFromConfig) colorInput.value = '';
    colorFromConfig = '';
    saveDraft();
    furnitureSelect.focus();
  });

  /* ---------- validation ---------- */
  const setError = (name: string, input: HTMLElement | null, message: string) => {
    const out = form.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
    if (out) out.textContent = message;
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  };

  const validate = (quiet = false) => {
    const invalid: HTMLElement[] = [];
    const check = (name: string, input: HTMLElement, ok: boolean, msg: string) => {
      setError(name, input, ok ? '' : msg);
      if (!ok) invalid.push(input);
    };
    const nameInput = el<HTMLInputElement>('#f-name');
    check('name', nameInput, val('name').length >= 2, text.errors.name);
    const method = val('contact_method');
    if (method === 'instagram') {
      setError('phone', phoneInput, '');
      check('instagram', igInput, /^@?[A-Za-z0-9._]{1,30}$/.test(val('instagram')), text.errors.instagram);
    } else {
      setError('instagram', igInput, '');
      const digits = val('phone').replace(/[\s\-().]/g, '');
      check('phone', phoneInput, /^\+?\d{8,15}$/.test(digits), text.errors.phone);
    }
    check('furniture', furnitureSelect, !!furnitureSelect.value, text.errors.furnitureType);
    if (furnitureSelect.value === 'other') check('furniture_other', otherInput, val('furniture_other').length >= 2, text.errors.otherType);
    else setError('furniture_other', otherInput, '');
    const link = val('reference_link');
    const linkInput = el<HTMLInputElement>('#f-link');
    let linkOk = !link;
    if (link) {
      try {
        linkOk = /^https?:$/.test(new URL(link).protocol);
      } catch {
        linkOk = false;
      }
    }
    check('reference_link', linkInput, linkOk, text.errors.link);
    const dimsBad = ['width', 'depth', 'height'].filter((n) => {
      const v = val(n).replace(',', '.');
      return v !== '' && !(Number(v) > 0);
    });
    const dimsMsg = dimsBad.length ? text.errors.dimension : '';
    form.querySelector<HTMLElement>('[data-error-for="dims"]')!.textContent = dimsMsg;
    ['width', 'depth', 'height'].forEach((n) => {
      const i = field(n) as HTMLInputElement;
      i.setAttribute('aria-invalid', dimsBad.includes(n) ? 'true' : 'false');
      if (dimsBad.includes(n)) invalid.push(i);
    });

    if (!quiet || !invalid.length) {
      errorSummary.hidden = !invalid.length;
      errorSummary.textContent = invalid.length ? text.errors.summary : '';
    }
    if (invalid.length && !quiet) invalid[0].focus();
    return invalid.length === 0;
  };

  /* ---------- summary used for SMS / Instagram hand-off ---------- */
  const buildSummary = () => {
    const s = text.summary;
    const method = val('contact_method');
    const contact = method === 'instagram' ? `Instagram ${val('instagram')}` : `${text.methods[method] ?? ''} ${val('phone')}`;
    const furniture = furnitureSelect.value === 'other' ? val('furniture_other') : text.types2[furnitureSelect.value] ?? '';
    const dims = ['width', 'depth', 'height'].map((n) => val(n)).filter(Boolean);
    const lines = [
      text.summaryTitle,
      `${s.request}: ${text.types[val('request_type')] ?? ''}`,
      `${s.name}: ${val('name')}`,
      `${s.contact}: ${contact.trim()}`,
      `${s.furniture}: ${furniture}`,
      val('configuration') && `${s.config}: ${val('configuration')}`,
      val('color') && `${s.color}: ${val('color')}`,
      dims.length && `${s.dimensions}: ${dims.join(' × ')} ${text.units[val('unit')] ?? ''}`,
      val('model') && `${s.model}: ${val('model')}`,
      val('reference_link') && `${s.link}: ${val('reference_link')}`,
      val('message') && `${s.message}: ${val('message')}`,
      `${s.lang}: ${text.langName}`,
    ];
    return lines.filter(Boolean).join('\n');
  };

  /* ---------- submit ---------- */
  const resetResult = () => {
    result.hidden = true;
    success.hidden = true;
    fallback.hidden = true;
    form.hidden = false;
  };

  const showFallback = (summary: string) => {
    summaryBox.value = summary;
    smsLink.href = `sms:${phoneE164}?&body=${encodeURIComponent(summary)}`;
    copyStatus.textContent = '';
    result.hidden = false;
    fallback.hidden = false;
    success.hidden = true;
    result.focus({ preventScroll: false });
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    attempted = true;
    if (!validate()) return;
    const summary = buildSummary();
    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');
    submitLabel.textContent = text.sending;
    const body = new URLSearchParams();
    new FormData(form).forEach((v, k) => body.append(k, String(v)));
    body.set('summary', summary);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    let delivered = false;
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
        body: body.toString(),
        signal: controller.signal,
      });
      delivered = res.ok;
    } catch {
      delivered = false;
    } finally {
      clearTimeout(timer);
      submitBtn.disabled = false;
      submitBtn.removeAttribute('aria-busy');
      submitLabel.textContent = text.submit;
    }
    if (delivered) {
      form.reset();
      setConfig('');
      colorFromConfig = '';
      save(KEYS.draft, null);
      save(KEYS.config, null);
      syncDependent();
      form.hidden = true;
      result.hidden = false;
      success.hidden = false;
      fallback.hidden = true;
      result.focus();
    } else {
      showFallback(summary);
    }
  });

  igBtn.addEventListener('click', async () => {
    const summary = summaryBox.value;
    let ok = false;
    try {
      await navigator.clipboard.writeText(summary);
      ok = true;
    } catch {
      summaryBox.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
    }
    copyStatus.textContent = ok ? text.copied : text.copyFailed;
    window.open(igDirect, '_blank', 'noopener');
  });
}
