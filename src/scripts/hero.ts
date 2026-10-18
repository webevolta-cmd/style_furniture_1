/**
 * Scroll-controlled hero: maps scroll progress through the pinned hero section to a
 * pre-rendered frame sequence (bare room → finished bedroom) drawn on a canvas.
 *
 * - Deterministic: the same scroll position always shows the same frame; scrolling back
 *   reverses the sequence. No autoplay. Only whole frames are drawn (no blending).
 * - Bounded memory and bandwidth: a small coarse pass is fetched after load (so any position
 *   has a nearby frame); after the visitor starts scrolling, only a window of frames around
 *   the current position is fetched. Compressed blobs and decoded ImageBitmaps are both
 *   LRU-capped. Work pauses when the hero is off-screen or the tab is hidden.
 * - The held bare room and the held finished room are shown as full-resolution stills.
 * - Slow connections (measured on the first fetches) and devices that cannot keep up while
 *   scrubbing switch (once) to the lighter frame set.
 * - The stage label, progress and data-frame always describe the frame actually on screen.
 */

interface TierInfo {
  width: number;
  height: number;
  step: number;
  count: number;
}

const HOLD_START = 0.05; // fraction of the pinned scroll spent on the bare room
const ASSEMBLY_END = 0.86; // after this the finished room is held
const DOLLY = 0.05; // gentle pull-back that settles exactly on the reference framing
const FOCUS_Y = 0.55; // matches the poster's object-position
const AHEAD = 36; // frames fetched ahead of the current position (in scroll direction)
const BEHIND = 12;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const x = clamp((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};

class FrameSource {
  private blobs: (Blob | null)[];
  private state: Uint8Array; // 0 idle · 1 loading · 2 loaded · 3 failed
  private bitmaps = new Map<number, ImageBitmap>();
  private decoding = new Set<number>();
  private inflight = 0;
  private failures = 0;
  private coarse: Set<number>;
  private disposed = false;
  private aborter = new AbortController();
  private stopped = false; // gave up after repeated failures
  paused = false;
  /** Until the visitor engages, only the coarse pass is fetched. */
  coarseOnly = true;
  current = 0;
  direction = 1;
  onDecoded: () => void = () => {};
  onFatal: () => void = () => {};
  /** Called once with the measured throughput (bytes/ms) of the first fetches. */
  onSpeed: (bytesPerMs: number) => void = () => {};
  private speed = { n: 0, bytes: 0, start: Infinity, end: 0 };

  constructor(
    readonly dir: string,
    readonly tier: TierInfo,
    private readonly concurrency: number,
    private readonly maxBitmaps: number,
    private readonly maxBlobs: number,
  ) {
    this.blobs = new Array(tier.count).fill(null);
    this.state = new Uint8Array(tier.count);
    const stride = Math.max(1, Math.round(tier.count / 12));
    this.coarse = new Set<number>();
    for (let k = 0; k < tier.count; k += stride) this.coarse.add(k);
    this.coarse.add(tier.count - 1);
  }

  url(k: number) {
    return `/media/hero/${this.dir}/${String(k * this.tier.step).padStart(3, '0')}.webp`;
  }

  private next(): number {
    const c = Math.round(this.current);
    let best = -1;
    let bestD = Infinity;
    for (const k of this.coarse) {
      if (this.state[k] !== 0) continue;
      const d = Math.abs(k - c);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best >= 0 || this.coarseOnly) return best;
    // Sliding window around the current position, biased in the scroll direction. The two
    // nearest frames come first, then every 4th and every 2nd frame of the window, then the
    // rest: on a slow connection a fast scroll still gets evenly spaced frames to show.
    const dir = this.direction >= 0 ? 1 : -1;
    const lo = Math.max(0, c - (dir > 0 ? BEHIND : AHEAD));
    const hi = Math.min(this.tier.count - 1, c + (dir > 0 ? AHEAD : BEHIND));
    for (const [reach, stride] of [[2, 1], [AHEAD, 4], [AHEAD, 2], [AHEAD, 1]]) {
      for (let d = 0; d <= Math.min(reach, Math.max(c - lo, hi - c)); d++) {
        const fwd = c + d * dir;
        const back = c - d * dir;
        if (fwd >= lo && fwd <= hi && fwd % stride === 0 && this.state[fwd] === 0) return fwd;
        if (back >= lo && back <= hi && back % stride === 0 && this.state[back] === 0) return back;
      }
    }
    return -1;
  }

  pump() {
    while (!this.paused && !this.stopped && this.inflight < this.concurrency) {
      const k = this.next();
      if (k < 0) return;
      this.load(k);
    }
  }

  private async load(k: number, retry = true) {
    this.state[k] = 1;
    this.inflight++;
    try {
      const t0 = performance.now();
      const res = await fetch(this.url(k), { signal: this.aborter.signal });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      if (this.disposed) return;
      this.measureSpeed(blob.size, t0, performance.now());
      this.blobs[k] = blob;
      this.state[k] = 2;
      this.trimBlobs();
      this.ensureDecoded(this.direction);
    } catch (err) {
      if (this.disposed) return;
      if ((err as Error).name === 'AbortError') {
        this.state[k] = 0; // cancelled (page hidden / left), fetched again when needed
        return;
      }
      if (retry) {
        // one retry after a pause; the frame stays marked as loading meanwhile, so pump()
        // doesn't fetch it again in a tight loop while the network is down
        setTimeout(() => !this.disposed && this.load(k, false), 1200);
      } else {
        this.state[k] = 3;
        if (++this.failures > 8) {
          this.stopped = true;
          this.onFatal();
        }
      }
    } finally {
      this.inflight--;
      this.pump();
    }
  }

  /** Throughput of the first 8 fetches (the coarse pass: back-to-back, several in parallel). */
  private measureSpeed(bytes: number, t0: number, t1: number) {
    const m = this.speed;
    if (m.n >= 8) return;
    m.n++;
    m.bytes += bytes;
    m.start = Math.min(m.start, t0);
    m.end = Math.max(m.end, t1);
    if (m.n === 8) this.onSpeed(m.bytes / Math.max(1, m.end - m.start));
  }

  /** Drop compressed frames far from the current position (re-fetched from HTTP cache if needed). */
  private trimBlobs() {
    let held = 0;
    for (const b of this.blobs) if (b) held++;
    if (held <= this.maxBlobs) return;
    const c = this.current;
    const order = this.blobs
      .map((b, k) => (b && !this.coarse.has(k) && !this.bitmaps.has(k) ? k : -1))
      .filter((k) => k >= 0)
      .sort((a, b) => Math.abs(b - c) - Math.abs(a - c));
    for (const k of order) {
      if (held <= this.maxBlobs) break;
      this.blobs[k] = null;
      this.state[k] = 0;
      held--;
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
    for (const k of order) this.decode(k);
    this.ensureNearest();
  }

  /** Until the exact frame arrives, the closest frame fetched so far must be decoded and drawable. */
  private ensureNearest() {
    const c = Math.round(this.current);
    let best = -1;
    let bestD = Infinity;
    this.blobs.forEach((b, k) => {
      const d = Math.abs(k - c);
      if (b && d < bestD) {
        bestD = d;
        best = k;
      }
    });
    const near = this.nearest(c);
    if (best >= 0 && !(near && Math.abs(near[0] - c) <= bestD)) this.decode(best);
  }

  private decode(k: number) {
    if (this.disposed || this.bitmaps.has(k) || this.decoding.has(k) || !this.blobs[k]) return;
    this.decoding.add(k);
    createImageBitmap(this.blobs[k]!)
      .then((bmp) => {
        this.decoding.delete(k);
        if (this.disposed) return bmp.close();
        this.bitmaps.set(k, bmp);
        this.evict();
        this.onDecoded();
      })
      .catch(() => this.decoding.delete(k));
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

  /** Cancel in-flight requests (page being left or frozen); they are re-requested on demand. */
  abort() {
    this.aborter.abort();
    this.aborter = new AbortController();
  }

  dispose() {
    this.abort();
    this.disposed = true;
    this.paused = true;
    for (const b of this.bitmaps.values()) b.close();
    this.bitmaps.clear();
    this.blobs.fill(null);
  }
}

function connectionIsConstrained() {
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string; downlink?: number };
    deviceMemory?: number;
  };
  const c = nav.connection;
  if (c?.saveData) return true;
  if (c?.effectiveType && /(^|-)2g|3g/.test(c.effectiveType)) return true;
  if (c?.downlink && c.downlink < 2) return true; // Mbit/s, measured by the browser
  if (nav.deviceMemory && nav.deviceMemory <= 2) return true;
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return true;
  return false;
}

export function initHero() {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!hero || !('createImageBitmap' in window)) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  // With reduced motion the CSS shows the finished room as a still and nothing below runs;
  // the preference can change while the page is open (handled at the end).
  let off = reduce.matches;

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
  // first frame of each assembly stage, as fractions of the sequence
  const stageStarts: number[] = (JSON.parse(hero.dataset.stages || '[]') as number[]).map((f) => f / 179);
  const still = hero.querySelector<HTMLElement>('.hero__still');
  const stillImg = hero.querySelector<HTMLImageElement>('[data-hero-still]');

  const portraitMq = window.matchMedia('(orientation: portrait)');
  let constrained = connectionIsConstrained();

  let source: FrameSource | null = null;
  // After a switch to another frame set, the previous set's decoded frames stay on screen until
  // the new set has the exact frame (no blank canvas, no flash of the poster).
  let retired: FrameSource | null = null;
  let degraded = false;
  let top = 0;
  let travel = 1;
  let target = 0; // target frame (whole frame index in tier space)
  let shown = -1; // position easing toward the target (frame index, fractional while moving)
  let drawnIndex = 0; // frame actually on screen (tier space)
  let drawnFrac = 0; // the same as a fraction of the sequence
  let behindSince = 0;
  let catchTimer = 0;
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

  const showFallback = () => {
    if (degraded) return;
    // Media failure: keep the page usable; the finished room replaces the bare room as soon
    // as the visitor scrolls into the assembly.
    degraded = true;
    hero.classList.add('is-degraded');
    const img = new Image();
    img.className = 'hero__fallback';
    img.alt = '';
    img.decoding = 'async';
    img.sizes = '100vw';
    const set = portraitMq.matches
      ? still?.querySelector<HTMLSourceElement>('source[type="image/webp"][media]')?.dataset.srcset
      : stillImg?.dataset.srcset;
    if (set) img.srcset = set;
    img.src = portraitMq.matches ? '/media/hero/mobile-end-720.webp' : '/media/hero/desktop-end-1600.webp';
    canvas.after(img);
  };

  const setSource = () => {
    const name = pickTier();
    if (source?.dir === name) return;
    const prevFraction = source ? target / Math.max(1, source.tier.count - 1) : null;
    if (source) {
      retired?.dispose();
      retired = source;
      retired.paused = true;
    }
    const tier = tiers[name];
    const isDesktop = name.startsWith('desktop');
    source = new FrameSource(name, tier, isDesktop ? 4 : 3, isDesktop ? 16 : 12, isDesktop ? 72 : 84);
    source.onDecoded = () => request();
    source.onFatal = showFallback;
    // Below ~0.8 MB/s the full set can't keep up with normal scrolling: use the lighter one.
    source.onSpeed = (bytesPerMs) => {
      if (constrained || bytesPerMs >= 800) return;
      constrained = true;
      setSource();
      measure();
      request();
    };
    source.coarseOnly = !engaged;
    hero.dataset.tier = name;
    syncPaused();
    if (prevFraction !== null) target = Math.round(prevFraction * (tier.count - 1));
    shown = -1;
    lastDrawKey = '';
    source.current = target;
    source.pump();
  };

  // Fetching pauses while the hero is off-screen or the tab is hidden. Recomputed on every
  // tick as well as on the events, so a page restored while hidden can never stay paused.
  const syncPaused = () => {
    if (source) source.paused = !visible || document.hidden;
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
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    if (canvas.width === cw && canvas.height === ch) return;
    // resizing clears the canvas: redraw in the same task so no empty frame is painted
    canvas.width = cw;
    canvas.height = ch;
    lastDrawKey = '';
    if (source && shown >= 0) draw(shown, clamp(shown / Math.max(1, source.tier.count - 1)));
  };

  const readScroll = () => {
    progress = clamp((window.scrollY - top) / travel);
    const fp = clamp((progress - HOLD_START) / (ASSEMBLY_END - HOLD_START));
    if (source) target = Math.round(fp * (source.tier.count - 1));
    return fp;
  };

  const cache = new Map<string, string>();
  const setVar = (el: HTMLElement, key: string, name: string, value: string) => {
    if (cache.get(key) === value) return; // avoid needless style invalidation
    cache.set(key, value);
    el.style.setProperty(name, value);
  };
  const stageOf = (fp: number) => {
    let st = 0;
    stageStarts.forEach((s, i) => {
      if (fp >= s) st = i;
    });
    return st;
  };
  /** Text and indicators follow the frame on screen (`onScreen`), not the scroll target. */
  const updateChrome = (onScreen: number) => {
    const held = hero.classList.contains('is-held-end') && !!still?.classList.contains('is-loaded');
    const done = held ? 1 : smooth(0.9, 1, onScreen);
    setVar(hero, 'intro', '--intro', (1 - smooth(0.025, 0.11, progress)).toFixed(3));
    setVar(hero, 'chrome', '--chrome', smooth(0.03, 0.09, progress).toFixed(3));
    setVar(hero, 'final', '--final', (smooth(0.875, 0.94, progress) * done).toFixed(3));
    const n = stageStarts.length || 5;
    ticks.forEach((t, i) => {
      const a = stageStarts[i] ?? i / n;
      const b = stageStarts[i + 1] ?? 1;
      setVar(t, `t${i}`, '--fill', clamp((onScreen - a) / Math.max(1e-6, b - a)).toFixed(2));
    });
    const st = Math.min(n - 1, stageOf(onScreen));
    if (st !== lastStage) {
      lastStage = st;
      stageNum.textContent = String(st + 1).padStart(2, '0');
      if (stageNames[st]) stageName.textContent = stageNames[st];
    }
  };

  // Full-resolution still of the finished room, requested once the visitor is past the middle.
  let stillRequested = false;
  const requestStill = () => {
    if (stillRequested || !still || !stillImg) return;
    stillRequested = true;
    still.querySelectorAll<HTMLSourceElement | HTMLImageElement>('[data-srcset]').forEach((el) => {
      el.srcset = el.dataset.srcset!;
    });
    const done = () => still.classList.add('is-loaded');
    if (stillImg.complete && stillImg.naturalWidth) done();
    else stillImg.addEventListener('load', done, { once: true });
  };

  /** Draws the frame at `pos` (or the closest one already decoded) as one whole frame. */
  const draw = (pos: number, fp: number) => {
    if (!source || degraded) return;
    const count = source.tier.count;
    const i0 = clamp(Math.round(pos), 0, count - 1);
    let b0 = source.bitmap(i0);
    let index = i0;
    if (b0 && retired) {
      retired.dispose();
      retired = null;
    }
    if (!b0) {
      // closest decoded frame, from this set or from the set it just replaced
      const near = source.nearest(pos);
      const rs = retired ? (retired.tier.count - 1) / Math.max(1, count - 1) : 0;
      const old = retired?.nearest(pos * rs);
      const dNew = near ? Math.abs(near[0] - pos) / Math.max(1, count - 1) : Infinity;
      const dOld = old ? Math.abs(old[0] - pos * rs) / Math.max(1, retired!.tier.count - 1) : Infinity;
      if (!near && !old) return;
      if (old && dOld < dNew) {
        b0 = old[1];
        index = Math.round(old[0] / rs);
      } else {
        b0 = near![1];
        index = near![0];
      }
    }
    const cw = canvas.width;
    const ch = canvas.height;
    const key = `${index}:${b0.width}|${cw}x${ch}|${fp.toFixed(3)}`;
    if (key === lastDrawKey) return;
    lastDrawKey = key;
    const iw = b0.width;
    const ih = b0.height;
    const cover = Math.max(cw / iw, ch / ih) * (1 + DOLLY * (1 - fp));
    const dw = iw * cover;
    const dh = ih * cover;
    ctx.drawImage(b0, (cw - dw) * 0.5, (ch - dh) * FOCUS_Y, dw, dh);
    drawnIndex = index;
    drawnFrac = index / Math.max(1, count - 1);
    hero.dataset.frame = String(index);
    if (!hero.classList.contains('is-ready')) hero.classList.add('is-ready');
  };

  // One-way adaptation: if frames take too long while the visitor scrubs, move to the lighter
  // frame set (the position is kept).
  const slow: number[] = [];
  let adapted = false;
  const sample = (dt: number) => {
    if (adapted) return;
    slow.push(dt);
    if (slow.length < 90) return;
    const p95 = [...slow].sort((x, y) => x - y)[Math.floor(slow.length * 0.95)];
    slow.length = 0;
    if (p95 > 24) {
      adapted = true;
      if (!constrained) {
        constrained = true;
        setSource();
        measure();
      }
    }
  };

  const tick = (time: number) => {
    raf = 0;
    if (off) return;
    const dt = lastTime ? Math.min(64, time - lastTime) : 16;
    if (lastTime) sample(time - lastTime);
    lastTime = time;
    const fp = readScroll();
    if (!source) return;
    syncPaused();
    const prev = shown;
    if (shown < 0) shown = target;
    else {
      // Critically damped easing toward the scroll target: smooths coarse wheel steps,
      // settles quickly and exactly on the target when scrolling stops.
      const k = 1 - Math.exp(-dt / 70);
      shown += (target - shown) * k;
      if (Math.abs(target - shown) < 0.02) shown = target;
    }
    source.current = shown;
    source.direction = shown >= prev ? 1 : -1;
    source.ensureDecoded(source.direction);
    source.pump();
    const last = source.tier.count - 1;
    draw(shown, clamp(shown / Math.max(1, last)));
    if (fp > 0.5) requestStill();
    hero.classList.toggle('is-held-start', shown === 0 && target === 0);
    hero.classList.toggle('is-held-end', shown === last && target === last);
    hero.classList.toggle('is-past-start', fp > 0);
    // a subtle cue while the frame on screen lags the scroll position (slow connection)
    const behind = !degraded && Math.abs(drawnIndex - target) > 3;
    if (!behind) behindSince = 0;
    else if (!behindSince) behindSince = time;
    hero.classList.toggle('is-catching-up', behind && time - behindSince > 250);
    updateChrome(degraded ? fp : drawnFrac);
    if (shown !== target) request();
    else lastTime = 0;
    // arriving frames re-tick through onDecoded; this only turns the loading cue on in time
    if (behind && !catchTimer) {
      catchTimer = window.setTimeout(() => {
        catchTimer = 0;
        request();
      }, 300);
    }
  };

  function request() {
    if (!raf && visible && !off) raf = requestAnimationFrame(tick);
  }

  // Frames must not compete with the critical path (poster image, fonts, CSS):
  // the small coarse pass starts once the page has loaded and is idle; the windowed
  // fetching starts when the visitor scrolls.
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
    if (started || off) return;
    started = true;
    setSource();
    measure();
    readScroll();
    // opened mid-hero (restored scroll position, back navigation): no scroll event may follow,
    // so load the frames around this position straight away
    if (progress > 0) engage();
    shown = -1;
    request();
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
    if (off) return;
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
    if (off) return;
    if (started && !anchor) anchor = { progress, top, travel };
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (!started || off) return;
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
      syncPaused();
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
    syncPaused();
    if (!source.paused) {
      source.pump();
      request();
    }
  });

  window.addEventListener('pagehide', () => {
    source?.abort();
    retired?.abort();
  });
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) {
      measure();
      request();
    }
  });

  // Reduced motion switched on: stop and release everything (CSS shows the finished room).
  // Switched off: start the animation from the current scroll position.
  reduce.addEventListener('change', () => {
    off = reduce.matches;
    if (off) {
      cancelAnimationFrame(raf);
      raf = 0;
      source?.dispose();
      retired?.dispose();
      source = null;
      retired = null;
      hero.classList.remove('is-ready', 'is-held-start', 'is-held-end', 'is-past-start', 'is-catching-up');
      return;
    }
    if (!started) {
      begin();
      return;
    }
    setSource();
    measure();
    readScroll();
    if (progress > 0) engage();
    shown = -1;
    request();
  });
}
