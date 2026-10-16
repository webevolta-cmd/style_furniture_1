/**
 * Scroll-controlled hero: maps scroll progress through the pinned hero section to a
 * pre-rendered frame sequence (bare room → finished bedroom) drawn on a canvas.
 *
 * - Deterministic: the same scroll position always shows the same frame; scrolling back
 *   reverses the sequence. No autoplay.
 * - Bounded memory: frames are fetched as compressed blobs; only a small window around the
 *   current position is decoded to ImageBitmaps (LRU-evicted and closed).
 * - Progressive loading: a coarse pass first (so any position has a nearby frame), then the
 *   frames nearest to the current position. Work pauses when the hero is off-screen or the
 *   tab is hidden.
 * - Smoothness: drawing happens in requestAnimationFrame only while something changes; the
 *   two frames around the exact position are blended for sub-frame interpolation.
 */

interface TierInfo {
  width: number;
  height: number;
  step: number;
  count: number;
}

const HOLD_START = 0.05; // fraction of the pinned scroll spent on the bare room
const ASSEMBLY_END = 0.86; // after this the finished room is held
const DOLLY = 0.05; // gentle push-in over the assembly
const FOCUS_Y = 0.55; // matches the poster's object-position

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const x = clamp((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};

class FrameSource {
  readonly blobs: (Blob | null)[];
  private state: Uint8Array; // 0 idle · 1 loading · 2 loaded · 3 failed
  private bitmaps = new Map<number, ImageBitmap>();
  private decoding = new Set<number>();
  private inflight = 0;
  private failures = 0;
  private coarse: number[];
  paused = false;
  /** Until the visitor engages, only the coarse pass is fetched. */
  coarseOnly = true;
  current = 0;
  onDecoded: () => void = () => {};
  onFatal: () => void = () => {};

  constructor(
    readonly dir: string,
    readonly tier: TierInfo,
    private readonly concurrency: number,
    private readonly maxBitmaps: number,
  ) {
    this.blobs = new Array(tier.count).fill(null);
    this.state = new Uint8Array(tier.count);
    const stride = Math.max(1, Math.round(tier.count / 22));
    this.coarse = [];
    for (let k = 0; k < tier.count; k += stride) this.coarse.push(k);
    this.coarse.push(tier.count - 1);
  }

  url(k: number) {
    return `/media/hero/${this.dir}/${String(k * this.tier.step).padStart(3, '0')}.webp`;
  }

  private next(): number {
    const pending = (k: number) => this.state[k] === 0;
    const c = this.current;
    const coarse = this.coarse.filter(pending).sort((a, b) => Math.abs(a - c) - Math.abs(b - c));
    if (coarse.length) return coarse[0];
    if (this.coarseOnly) return -1;
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < this.tier.count; k++) {
      if (!pending(k)) continue;
      const d = k >= c ? k - c : (c - k) * 1.4; // slight forward bias
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  }

  pump() {
    while (!this.paused && this.inflight < this.concurrency) {
      const k = this.next();
      if (k < 0) return;
      this.load(k);
    }
  }

  private async load(k: number, retry = true) {
    this.state[k] = 1;
    this.inflight++;
    try {
      const res = await fetch(this.url(k));
      if (!res.ok) throw new Error(String(res.status));
      this.blobs[k] = await res.blob();
      this.state[k] = 2;
      if (Math.abs(k - this.current) <= 6) this.ensureDecoded();
    } catch {
      if (retry) {
        this.state[k] = 0;
        setTimeout(() => this.load(k, false), 1200);
      } else {
        this.state[k] = 3;
        if (++this.failures > 8) this.onFatal();
      }
    } finally {
      this.inflight--;
      this.pump();
    }
  }

  /** Decode a small window around the current frame (biased in the scroll direction). */
  ensureDecoded(direction = 1) {
    const c = Math.round(this.current);
    const ahead = 5;
    const behind = 2;
    const lo = clamp(c - (direction >= 0 ? behind : ahead), 0, this.tier.count - 1);
    const hi = clamp(c + (direction >= 0 ? ahead : behind), 0, this.tier.count - 1);
    const order: number[] = [];
    for (let d = 0; d <= Math.max(c - lo, hi - c); d++) {
      if (c + d <= hi) order.push(c + d);
      if (d && c - d >= lo) order.push(c - d);
    }
    for (const k of order) {
      if (this.bitmaps.has(k) || this.decoding.has(k) || !this.blobs[k]) continue;
      this.decoding.add(k);
      createImageBitmap(this.blobs[k]!)
        .then((bmp) => {
          this.decoding.delete(k);
          this.bitmaps.set(k, bmp);
          this.evict();
          this.onDecoded();
        })
        .catch(() => this.decoding.delete(k));
    }
  }

  private evict() {
    if (this.bitmaps.size <= this.maxBitmaps) return;
    const c = this.current;
    const keys = [...this.bitmaps.keys()].sort((a, b) => Math.abs(b - c) - Math.abs(a - c));
    while (this.bitmaps.size > this.maxBitmaps) {
      const k = keys.shift()!;
      this.bitmaps.get(k)!.close();
      this.bitmaps.delete(k);
    }
  }

  bitmap(k: number) {
    return this.bitmaps.get(k);
  }

  /** Nearest decoded frame to k (used while the exact frame is still decoding). */
  nearest(k: number): [number, ImageBitmap] | null {
    let best: [number, ImageBitmap] | null = null;
    let bestD = Infinity;
    for (const [i, bmp] of this.bitmaps) {
      const d = Math.abs(i - k);
      if (d < bestD) {
        bestD = d;
        best = [i, bmp];
      }
    }
    return best;
  }

  dispose() {
    this.paused = true;
    for (const b of this.bitmaps.values()) b.close();
    this.bitmaps.clear();
    this.blobs.fill(null);
  }
}

function connectionIsConstrained() {
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };
  const c = nav.connection;
  if (c?.saveData) return true;
  if (c?.effectiveType && /(^|-)2g|3g/.test(c.effectiveType)) return true;
  if (nav.deviceMemory && nav.deviceMemory <= 2) return true;
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return true;
  return false;
}

export function initHero() {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!hero) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce.matches || !('createImageBitmap' in window)) return;

  const stage = hero.querySelector<HTMLElement>('[data-hero-stage]')!;
  const canvas = hero.querySelector<HTMLCanvasElement>('[data-hero-canvas]')!;
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: false });
  if (!ctx) return;
  const progressEl = hero.querySelector<HTMLElement>('[data-hero-progress]')!;
  const ticks = [...progressEl.querySelectorAll<HTMLElement>('[data-stage]')];
  const stageNum = hero.querySelector<HTMLElement>('[data-hero-stage-num]')!;
  const stageName = hero.querySelector<HTMLElement>('[data-hero-stage-name]')!;
  const stageNames: string[] = JSON.parse(progressEl.dataset.stageNames || '[]');
  const tiers: Record<string, TierInfo> = JSON.parse(hero.dataset.tiers || '{}');

  const portraitMq = window.matchMedia('(orientation: portrait)');
  const constrained = connectionIsConstrained();

  let source: FrameSource | null = null;
  let degraded = false;
  let top = 0;
  let travel = 1;
  let target = 0; // target frame position (float, tier index space)
  let shown = -1; // currently displayed frame position
  let progress = 0;
  let lastStage = -1;
  let raf = 0;
  let lastTime = 0;
  let visible = true;
  let lastDrawKey = '';

  const pickTier = () => {
    if (portraitMq.matches) return constrained ? 'mobile-lite' : 'mobile';
    return constrained || window.innerWidth < 900 ? 'desktop-lite' : 'desktop';
  };

  const setSource = () => {
    const name = pickTier();
    if (source?.dir === name) return;
    const prevFraction = source ? target / Math.max(1, source.tier.count - 1) : null;
    source?.dispose();
    const tier = tiers[name];
    const isDesktop = name.startsWith('desktop');
    source = new FrameSource(name, tier, isDesktop ? 4 : 3, isDesktop ? 16 : 12);
    source.onDecoded = () => request();
    source.onFatal = () => {
      if (degraded) return;
      // Media failure: keep the page usable and show the finished room fading in with progress.
      degraded = true;
      hero.classList.add('is-degraded');
      const img = new Image();
      img.className = 'hero__fallback';
      img.alt = '';
      img.decoding = 'async';
      img.src = portraitMq.matches ? '/media/hero/mobile-end-720.webp' : '/media/hero/desktop-end-1600.webp';
      canvas.after(img);
    };
    source.coarseOnly = !engaged;
    if (prevFraction !== null) target = prevFraction * (tier.count - 1);
    shown = -1;
    lastDrawKey = '';
    source.current = target;
    source.pump();
  };

  const measure = () => {
    top = hero.offsetTop;
    travel = Math.max(1, hero.offsetHeight - stage.offsetHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const tier = source?.tier;
    // Size the backing store so a cover-fitted frame is drawn at ~1:1 pixels: sharper is
    // impossible (the frame has no more detail) and anything larger only costs fill-rate.
    const native = tier ? Math.min(tier.width / w, tier.height / h) : dpr;
    const scale = Math.max(1, Math.min(dpr, native));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    lastDrawKey = '';
  };

  const readScroll = () => {
    progress = clamp((window.scrollY - top) / travel);
    const fp = clamp((progress - HOLD_START) / (ASSEMBLY_END - HOLD_START));
    if (source) target = fp * (source.tier.count - 1);
    return fp;
  };

  const cache = new Map<string, string>();
  const setVar = (el: HTMLElement, key: string, name: string, value: string) => {
    if (cache.get(key) === value) return; // avoid needless style invalidation
    cache.set(key, value);
    el.style.setProperty(name, value);
  };
  const updateChrome = (fp: number) => {
    setVar(hero, 'intro', '--intro', (1 - smooth(0.025, 0.11, progress)).toFixed(3));
    setVar(hero, 'chrome', '--chrome', smooth(0.03, 0.09, progress).toFixed(3));
    setVar(hero, 'final', '--final', smooth(0.875, 0.94, progress).toFixed(3));
    if (degraded) setVar(hero, 'fp', '--fp', fp.toFixed(3));
    const n = stageNames.length || 5;
    const st = Math.min(n - 1, Math.floor(fp * n));
    ticks.forEach((t, i) => setVar(t, `t${i}`, '--fill', clamp(fp * n - i).toFixed(2)));
    if (st !== lastStage) {
      lastStage = st;
      stageNum.textContent = String(st + 1).padStart(2, '0');
      if (stageNames[st]) stageName.textContent = stageNames[st];
    }
  };

  const draw = (pos: number, fp: number) => {
    if (!source || degraded) return;
    const count = source.tier.count;
    const i0 = clamp(Math.floor(pos), 0, count - 1);
    const i1 = Math.min(i0 + 1, count - 1);
    const a = pos - i0;
    let b0 = source.bitmap(i0);
    // Blend neighbouring frames only while moving slowly / settling – during fast scrubbing
    // the blend isn't perceptible and would double the fill cost.
    const settling = Math.abs(target - pos) < 1.5;
    let b1 = a > 0.02 && settling ? source.bitmap(i1) : undefined;
    let key = `${i0}:${b1 ? a.toFixed(2) : 0}`;
    if (!b0) {
      const near = source.nearest(pos);
      if (!near) return;
      b0 = near[1];
      b1 = undefined;
      key = `n${near[0]}`;
    }
    const cw = canvas.width;
    const ch = canvas.height;
    key += `|${cw}x${ch}|${fp.toFixed(3)}`;
    if (key === lastDrawKey) return;
    lastDrawKey = key;
    const iw = b0.width;
    const ih = b0.height;
    const cover = Math.max(cw / iw, ch / ih) * (1 + DOLLY * fp);
    const dw = iw * cover;
    const dh = ih * cover;
    const dx = (cw - dw) * 0.5;
    const dy = (ch - dh) * FOCUS_Y;
    ctx.globalAlpha = 1;
    ctx.drawImage(b0, dx, dy, dw, dh);
    if (b1) {
      ctx.globalAlpha = a;
      ctx.drawImage(b1, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
    }
    hero.dataset.frame = String(i0);
    if (!hero.classList.contains('is-ready')) hero.classList.add('is-ready');
  };

  const tick = (time: number) => {
    raf = 0;
    const dt = lastTime ? Math.min(64, time - lastTime) : 16;
    lastTime = time;
    const fp = readScroll();
    if (!source) return;
    const prev = shown;
    if (shown < 0) shown = target;
    else {
      // Critically damped easing toward the scroll target: smooths coarse wheel steps,
      // settles quickly and exactly on the target when scrolling stops.
      const k = 1 - Math.exp(-dt / 70);
      shown += (target - shown) * k;
      if (Math.abs(target - shown) < 0.01) shown = target;
    }
    source.current = shown;
    source.ensureDecoded(shown >= prev ? 1 : -1);
    source.pump();
    const fpShown = degraded ? fp : clamp(shown / Math.max(1, source.tier.count - 1));
    updateChrome(fpShown);
    draw(shown, fpShown);
    if (shown !== target) request();
    else lastTime = 0;
  };

  function request() {
    if (!raf && visible) raf = requestAnimationFrame(tick);
  }

  // Frames must not compete with the critical path (poster image, fonts, CSS):
  // start downloading once the page has loaded and is idle, or as soon as the visitor scrolls.
  let started = false;
  let engaged = false;
  const engage = () => {
    engaged = true;
    if (source) {
      source.coarseOnly = false;
      source.pump();
    }
  };
  const begin = () => {
    if (started) return;
    started = true;
    setSource();
    measure();
    readScroll();
    shown = -1;
    request();
    // Fetch the full sequence once the visitor scrolls; on fast connections also after a short pause.
    if (!constrained) window.setTimeout(engage, 3500);
  };
  const whenIdle = () => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    const go = () => (idle ? idle(begin, { timeout: 1500 }) : window.setTimeout(begin, 300));
    const fonts = document.fonts?.ready ?? Promise.resolve();
    if (document.readyState === 'complete') fonts.then(go);
    else window.addEventListener('load', () => fonts.then(go), { once: true });
  };
  whenIdle();

  // Chrome (text, stage indicator) follows scroll even before frames arrive.
  const onScroll = () => {
    if (!started) begin();
    if (!engaged) engage();
    request();
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // The hero's height follows the viewport, so after a rotation or window resize the same scrollY
  // would land on a different assembly state. Remember where the visitor was and return there.
  // Mobile URL-bar changes don't alter the layout (svh units), so they never move the page.
  let resizeTimer = 0;
  let anchor: { progress: number; top: number; travel: number } | null = null;
  const onResize = () => {
    if (started && !anchor) anchor = { progress, top, travel };
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (!started) return;
      setSource();
      measure();
      const a = anchor;
      anchor = null;
      const changed = a && (Math.abs(top - a.top) > 1 || Math.abs(travel - a.travel) > 1);
      if (a && changed && a.progress > 0 && a.progress < 1) {
        window.scrollTo({ top: Math.round(top + a.progress * travel), behavior: 'instant' as ScrollBehavior });
      }
      request();
    }, 120);
  };
  window.addEventListener('resize', onResize);
  portraitMq.addEventListener('change', onResize);

  const io = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (source) source.paused = !visible || document.hidden;
      if (visible) {
        source?.pump();
        request();
      }
    },
    { rootMargin: '25% 0px' },
  );
  io.observe(hero);

  document.addEventListener('visibilitychange', () => {
    if (!source) return;
    source.paused = document.hidden || !visible;
    if (!source.paused) {
      source.pump();
      request();
    }
  });

  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) {
      measure();
      request();
    }
  });

  reduce.addEventListener('change', () => {
    if (reduce.matches) {
      source?.dispose();
      source = null;
    }
  });
}
