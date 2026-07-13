/**
 * perf.js — the frame-budget rail.
 *
 * Contract (CONTRACTS.md §3):
 *   frameMeter(): { fps(): number, p95(): number, frames(): number[] }
 *   mountFrameRail(canvasEl, meter): void
 *
 * The rail is the one bold element on the site: a 28px strip pinned to the top of
 * every instrument card, drawing the last 120 frame times as vertical ticks
 * against the 16.7ms budget line. It is measuring frames, so it must not cost
 * them: one shared rAF (the meter's), one Path2D per colour, zero allocation in
 * the hot loop, and text updates throttled to 5Hz.
 */

const RING = 120;
const MAX_MS = 50; // rail ceiling; anything slower clamps to full height
const BUDGET_MS = 1000 / 60; // 16.67ms

/**
 * A 120-frame ring buffer fed by requestAnimationFrame.
 * @returns {{fps():number, p95():number, frames():number[], onFrame(fn):Function, stop():void}}
 */
export function frameMeter() {
  const buf = new Float64Array(RING);
  let count = 0; // how many samples are valid
  let head = 0; // next write index
  let last = -1;
  let raf = 0;
  let running = true;

  const subs = new Set();

  // Scratch array reused by frames()/p95() — no per-frame allocation.
  const scratch = new Float64Array(RING);

  function tick(t) {
    if (last >= 0) {
      const dt = t - last;
      // Ignore absurd deltas (tab was backgrounded, debugger paused, …).
      if (dt > 0 && dt < 1000) {
        buf[head] = dt;
        head = (head + 1) % RING;
        if (count < RING) count++;
      }
    }
    last = t;
    for (const fn of subs) fn(t);
    if (running) raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  /** Frame deltas in ms, oldest first. Length grows to 120 then stays there. */
  function frames() {
    const out = new Array(count);
    const start = (head - count + RING) % RING;
    for (let i = 0; i < count; i++) out[i] = buf[(start + i) % RING];
    return out;
  }

  /** Mean fps over the buffer. */
  function fps() {
    if (count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < count; i++) sum += buf[i];
    const mean = sum / count;
    return mean > 0 ? 1000 / mean : 0;
  }

  /** 95th-percentile frame time in ms — the number that actually tells you if it stutters. */
  function p95() {
    if (count === 0) return 0;
    for (let i = 0; i < count; i++) scratch[i] = buf[i];
    const view = scratch.subarray(0, count);
    view.sort();
    return view[Math.min(count - 1, Math.floor(count * 0.95))];
  }

  return {
    fps,
    p95,
    frames,
    /** Internal: piggyback on the meter's rAF instead of starting a second loop. */
    onFrame(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      subs.clear();
    },
  };
}

function cssVar(el, name, fallback) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Draw the rail into `canvasEl`, fed by `meter`.
 * Safe to call with a missing canvas (no-op) or to call twice on the same canvas.
 * @param {HTMLCanvasElement|null} canvasEl
 * @param {ReturnType<typeof frameMeter>} meter
 */
export function mountFrameRail(canvasEl, meter) {
  if (!canvasEl || !meter || typeof canvasEl.getContext !== "function") return;
  if (canvasEl.__railMounted) return;
  canvasEl.__railMounted = true;

  const ctx = canvasEl.getContext("2d", { alpha: true });
  if (!ctx) return;

  // Colours are read from the tokens, once per theme — never per frame.
  let accent, hot, guide;
  function readTokens() {
    accent = cssVar(canvasEl, "--accent", "#00696b");
    hot = cssVar(canvasEl, "--hot", "#b23a1e");
    guide = cssVar(canvasEl, "--hairline", "rgba(0,0,0,.14)");
  }
  readTokens();
  window.addEventListener("themechange", readTokens);

  let w = 0;
  let h = 0;
  let dpr = 1;

  function resize() {
    const rect = canvasEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width;
    h = rect.height;
    const nw = Math.round(w * dpr);
    const nh = Math.round(h * dpr);
    if (nw !== canvasEl.width || nh !== canvasEl.height) {
      canvasEl.width = nw;
      canvasEl.height = nh;
      // setting width/height resets the 2d context state
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return true;
  }
  resize();

  if (typeof ResizeObserver === "function") {
    new ResizeObserver(resize).observe(canvasEl);
  } else {
    window.addEventListener("resize", resize);
  }

  // Optional text readouts, if the page (or chrome.js) provided them.
  const root = canvasEl.closest(".panel-head") || canvasEl.parentElement;
  const fpsEl = root && root.querySelector("[data-rail-fps]");
  const p95El = root && root.querySelector("[data-rail-p95]");
  let lastText = 0;

  const budgetY = () => h - (BUDGET_MS / MAX_MS) * h;

  function draw() {
    if (!w || !h) {
      if (!resize()) return;
    }

    const f = meter.frames();
    const n = f.length;

    // The strip's own background comes from CSS (.frame-rail), so we only ever
    // clear and redraw the marks.
    ctx.clearRect(0, 0, w, h);

    const by = budgetY();
    ctx.strokeStyle = guide;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(by) + 0.5);
    ctx.lineTo(w, Math.round(by) + 0.5);
    ctx.stroke();

    if (n === 0) return;

    // Ticks. Two passes, one fillStyle change total.
    const slot = w / RING;
    const bw = Math.max(1, slot - 1);
    const offset = (RING - n) * slot; // newest sample sits flush right

    ctx.fillStyle = accent;
    for (let i = 0; i < n; i++) {
      const dt = f[i];
      if (dt > BUDGET_MS) continue;
      const y = h - (dt / MAX_MS) * h;
      ctx.fillRect(offset + i * slot, y, bw, h - y);
    }

    ctx.fillStyle = hot;
    for (let i = 0; i < n; i++) {
      const dt = f[i];
      if (dt <= BUDGET_MS) continue;
      const clamped = Math.min(dt, MAX_MS);
      const y = h - (clamped / MAX_MS) * h;
      ctx.fillRect(offset + i * slot, y, bw, h - y);
    }
  }

  meter.onFrame((t) => {
    draw();
    if (t - lastText > 200) {
      lastText = t;
      if (fpsEl) fpsEl.textContent = Math.round(meter.fps()).toString().padStart(2, "0");
      if (p95El) {
        const p = meter.p95();
        p95El.textContent = `${p.toFixed(1)}ms`;
        p95El.classList.toggle("over", p > BUDGET_MS);
      }
    }
  });
}
