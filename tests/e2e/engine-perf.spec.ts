import { test, expect, Page } from '@playwright/test';

/**
 * Engine performance regression tests.
 *
 * These pin the properties that make a mass trigger (thousands of features)
 * survivable:
 *
 *  1. The synchronous cost of N map.transition() calls is LINEAR in N, not
 *     quadratic. The old engine scanned the whole transitions Set (with an
 *     Object.keys() allocation per candidate) on every call, so kicking off
 *     2000 features was ~2M string comparisons in one synchronous loop.
 *  2. The engine runs ONE global rAF and does ONE setFeatureState per feature
 *     per frame, whatever the feature count. The old engine rescheduled one rAF
 *     PER FEATURE, each allocating a closure, an Object.keys().filter() array,
 *     and two fresh objects.
 *  3. `delay` genuinely defers work. The old engine started every rAF loop
 *     immediately and wrote the clamped start value every frame while
 *     "waiting", so a longer stagger meant MORE work, not less.
 *
 * A NOTE ON WHAT IS MEASURED, AND WHY IT IS NOT rAF WALL TIME.
 *
 * These run in headless chromium on software GL (SwiftShader). On that stack
 * this map repaints at ~66ms/frame with ZERO feature-state churn - a bare
 * `map.triggerRepaint()` loop with no plugin at all costs exactly as much as
 * 2000 features animating. Wall-clock rAF deltas here measure the software
 * rasterizer and are quantised to vsync multiples, so they cannot falsify an
 * engine regression: the old, quadratic, one-rAF-per-feature engine posts the
 * SAME rAF deltas as the new one.
 *
 * So the per-frame tests below assert on what the engine actually controls and
 * what actually regressed:
 *   - rAF schedulings per frame (O(1), not O(N)),
 *   - setFeatureState calls per frame (one per animating feature),
 *   - main-thread ms the engine spends per frame,
 * and the render-only baseline is measured in-test and reported alongside.
 *
 * Driven by _test-harness.html's `bulk` source (2000 points, ids 0..1999).
 * Timing-sensitive and WebGL-heavy: chromium only.
 */

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

// Measures frame time and per-frame engine cost. Running these in parallel with
// each other just measures how loaded the box is (same reason stress.spec.ts is
// serial).
test.describe.configure({ mode: 'default' });

test.describe('Engine performance under mass trigger', () => {
  test.beforeEach(async ({ page, browserName }: { page: Page; browserName: string }) => {
    test.skip(browserName !== 'chromium', 'Headless WebGL is unreliable outside chromium');
    await page.goto('_test-harness.html');
    await page.waitForFunction(() => window.__testHooks?.map !== undefined);
    await page.evaluate(() => window.__testHooks!.waitForLoad());
    // Add the 2000-point bulk source and let its tile settle before we measure.
    await page.evaluate(() => (window.__testHooks as any).ensureBulk());
    await page.waitForTimeout(500);
  });

  test('mass trigger cost is linear in feature count, not quadratic', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const h: any = window.__testHooks;
      const sleep = (ms: number) => new Promise((x) => setTimeout(x, ms));
      const drain = async () => {
        for (let i = 0; i < 400 && h.getTransitionCount() > 0; i++) await sleep(25);
      };

      // Warm-up: the first call installs the coalesce paint expressions.
      h.bulkTransition(1, { duration: 60, paint: { 'circle-radius': [3, 4] } });
      await drain();
      await sleep(100);

      const t200 = h.bulkTransition(200, { duration: 200, paint: { 'circle-radius': [3, 9] } });
      await drain();
      await sleep(200);

      const t2000 = h.bulkTransition(2000, { duration: 200, paint: { 'circle-radius': [3, 9] } });
      const count = h.getTransitionCount();
      await drain();

      return { t200, t2000, count, after: h.getTransitionCount() };
    });

    console.log(
      `[perf] mass trigger: 200 calls = ${r.t200.toFixed(1)}ms, 2000 calls = ${r.t2000.toFixed(1)}ms ` +
        `(ratio ${(r.t2000 / r.t200).toFixed(1)}x; linear predicts ~10x, O(N^2) predicts 100x+)`
    );

    // All 2000 features registered synchronously, and everything drained.
    expect(r.count).toBe(2000);
    expect(r.after).toBe(0);

    // Absolute budget (generous): 2000 synchronous calls must not stall the main
    // thread for hundreds of ms.
    expect(r.t2000).toBeLessThan(400);
    // Relative: linear predicts ~10x. O(N^2) predicts 100x+.
    expect(r.t2000).toBeLessThan(r.t200 * 30);
  });

  test('one rAF and one feature-state write per feature per frame at 2000 features x 2 channels', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const h: any = window.__testHooks;
      const map = h.map;
      const sleep = (ms: number) => new Promise((x) => setTimeout(x, ms));

      // Instrument the engine's only egress into MapLibre.
      const origSFS = map.setFeatureState.bind(map);
      let writes = 0;
      let writeMs = 0;
      map.setFeatureState = (target: any, state: any) => {
        const t0 = performance.now();
        origSFS(target, state);
        writeMs += performance.now() - t0;
        writes++;
      };

      // --- render-only baseline: repaint every frame, nothing animating -------
      let stop = false;
      const repaint = () => {
        if (!stop) {
          map.triggerRepaint();
          requestAnimationFrame(repaint);
        }
      };
      requestAnimationFrame(repaint);
      const baselineFrames: number[] = await h.sampleFrames(40);
      stop = true;
      await sleep(300);

      // --- under load ---------------------------------------------------------
      // Every one of the 2000 must still be animating when the sampling window
      // closes, or the per-frame averages below get diluted by idle frames.
      //
      // The window is 40 FRAMES, not a fixed wall time, so its duration is
      // whatever the box gives us: ~66ms/frame locally (~2.6s), but ~250ms/frame
      // on a CI runner's software GL (~10s). A hardcoded duration cannot be right
      // on both, so size it from the baseline we just measured, with 3x headroom.
      const sortedBase = [...baselineFrames].sort((a, b) => a - b);
      const baseMedian = sortedBase[Math.floor(sortedBase.length / 2)] || 16;
      const duration = Math.max(6000, Math.ceil(40 * baseMedian * 3));

      h.bulkTransition(2000, {
        duration,
        ease: 'cubic',
        paint: {
          'circle-radius': [3, 10],
          'circle-color': ['#3366cc', '#ff3366'],
        },
      });
      const during = h.getTransitionCount(); // synchronous
      await sleep(150); // skip the install/first-upload frames

      writes = 0;
      writeMs = 0;
      const raf0 = h.rafCalls();
      const loadedFrames: number[] = await h.sampleFrames(40);
      const rafCalls = h.rafCalls() - raf0;
      const stillLive = h.getTransitionCount(); // must still be animating

      map.setFeatureState = origSFS;

      // `duration` may now be far longer than we want to sit here waiting for, so
      // supersede it with an instant call rather than letting it run its course.
      // A later call on the same properties replaces the sampler and completes in
      // a frame or two, which drains the Set.
      h.bulkTransition(2000, {
        duration: 1,
        paint: {
          'circle-radius': [3, 3],
          'circle-color': ['#3366cc', '#3366cc'],
        },
      });
      for (let i = 0; i < 500 && h.getTransitionCount() > 0; i++) await sleep(25);

      const frames = loadedFrames.length;
      return {
        baselineFrames,
        loadedFrames,
        during,
        stillLive,
        duration,
        after: h.getTransitionCount(),
        writesPerFrame: writes / frames,
        engineMsPerFrame: writeMs / frames,
        rafPerFrame: rafCalls / frames,
      };
    });

    const baseMed = median(r.baselineFrames);
    const loadMed = median(r.loadedFrames);
    const loadP90 = quantile(r.loadedFrames, 0.9);
    console.log(
      `[perf] frame @2000x2: writes/frame ${r.writesPerFrame.toFixed(1)}, ` +
        `rAF schedulings/frame ${r.rafPerFrame.toFixed(1)}, ` +
        `engine ms/frame ${r.engineMsPerFrame.toFixed(2)} | ` +
        `wall median ${loadMed.toFixed(1)}ms vs render-only baseline ${baseMed.toFixed(1)}ms (p90 ${loadP90.toFixed(1)}ms) | ` +
        `window 40 frames =~${(loadMed * 40).toFixed(0)}ms inside a ${r.duration}ms transition, ${r.stillLive} still live`
    );

    expect(r.during).toBe(2000);
    // The whole sampling window ran with all 2000 features live, so the
    // per-frame numbers below are measured under full load.
    expect(r.stillLive).toBe(2000);
    expect(r.after).toBe(0);

    // ONE write per feature per frame - not one per channel (2 channels here),
    // and not one per property as separate calls.
    expect(r.writesPerFrame).toBeGreaterThan(1900);
    expect(r.writesPerFrame).toBeLessThan(2100);

    // ONE global rAF. The page also runs MapLibre's render loop and the sampler
    // itself, so a handful per frame is expected - but NOT one per feature.
    // Old engine: ~2000 per frame. This is the structural fix.
    expect(r.rafPerFrame).toBeLessThan(10);

    // Main-thread ms the engine itself burns per frame, independent of the
    // rasterizer. Budget is generous; measured ~3ms on software GL.
    expect(r.engineMsPerFrame).toBeLessThan(12);

    // End-to-end sanity only. On software GL the render-only baseline IS the
    // budget (~66ms/frame to repaint this map with NO plugin at all), and the
    // engine adds ~3ms on top, so a tight wall-clock threshold here would just
    // be measuring SwiftShader and CPU contention from parallel test workers.
    // This catches a catastrophic regression and nothing finer; the real
    // per-frame guarantees are the three structural assertions above.
    expect(loadMed).toBeLessThan(baseMed * 4);
  });

  test('delay is free: a staggered mass trigger does far less per-frame work than an unstaggered one', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const h: any = window.__testHooks;
      const map = h.map;
      const sleep = (ms: number) => new Promise((x) => setTimeout(x, ms));
      const drain = async () => {
        for (let i = 0; i < 600 && h.getTransitionCount() > 0; i++) await sleep(25);
      };

      const origSFS = map.setFeatureState.bind(map);
      let writes = 0;
      let writeMs = 0;
      map.setFeatureState = (target: any, state: any) => {
        const t0 = performance.now();
        origSFS(target, state);
        writeMs += performance.now() - t0;
        writes++;
      };

      // Count the engine's per-frame work over `ms` milliseconds of frames.
      const measure = (ms: number) =>
        new Promise<{ writesPerFrame: number; msPerFrame: number; frames: number[] }>((resolve) => {
          writes = 0;
          writeMs = 0;
          const frames: number[] = [];
          let last: number | null = null;
          const t0 = performance.now();
          const tick = (t: number) => {
            if (last !== null) frames.push(t - last);
            last = t;
            if (performance.now() - t0 < ms) requestAnimationFrame(tick);
            else {
              const n = Math.max(1, frames.length);
              resolve({ writesPerFrame: writes / n, msPerFrame: writeMs / n, frames });
            }
          };
          requestAnimationFrame(tick);
        });

      const paint = { 'circle-radius': [3, 10], 'circle-color': ['#3366cc', '#ff3366'] };

      // Warm-up so neither run pays the paint-property install.
      h.bulkTransition(1, { duration: 60, paint });
      await drain();
      await sleep(200);

      // A: everything fires at once. Every feature is live from frame 0.
      h.bulkTransition(2000, { duration: 1500, paint });
      const flat = await measure(500);
      await drain();
      await sleep(400);

      // B: identical work, spread over a 2.5s stagger. In the first 500ms only
      // ~20% of the features should have started; the rest must cost NOTHING.
      h.bulkTransition(2000, { duration: 1500, delay: () => Math.random() * 2500, paint });
      const staggeredCount = h.getTransitionCount(); // scheduled, synchronously
      const staggered = await measure(500);
      await drain();

      map.setFeatureState = origSFS;
      return { flat, staggered, staggeredCount, after: h.getTransitionCount() };
    });

    console.log(
      `[perf] delay: unstaggered ${r.flat.writesPerFrame.toFixed(0)} writes/frame ` +
        `(${r.flat.msPerFrame.toFixed(2)}ms engine) vs staggered ${r.staggered.writesPerFrame.toFixed(0)} writes/frame ` +
        `(${r.staggered.msPerFrame.toFixed(2)}ms engine) | wall median ` +
        `${median(r.flat.frames).toFixed(1)}ms vs ${median(r.staggered.frames).toFixed(1)}ms`
    );

    // Delayed transitions are in the Set immediately (frozen public surface).
    expect(r.staggeredCount).toBe(2000);
    expect(r.after).toBe(0);

    // The unstaggered run drives all 2000 every frame.
    expect(r.flat.writesPerFrame).toBeGreaterThan(1900);

    // The whole point of the fix: a pending transition costs nothing. Over the
    // first 500ms of a 2500ms stagger only a fraction of the features are live.
    // The old engine ran ALL 2000 rAF loops from frame 0 and wrote the clamped
    // start value every frame, so this number was ~2000 there too.
    expect(r.staggered.writesPerFrame).toBeLessThan(r.flat.writesPerFrame * 0.6);
    expect(r.staggered.msPerFrame).toBeLessThanOrEqual(r.flat.msPerFrame);
  });

  test('2000 delayed transitions register synchronously and drain after duration + max delay', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const h: any = window.__testHooks;
      const sleep = (ms: number) => new Promise((x) => setTimeout(x, ms));

      h.bulkTransition(2000, {
        duration: 400,
        delay: (i: number) => (i / 2000) * 600,
        paint: { 'circle-radius': [3, 12] },
      });
      const immediate = h.getTransitionCount();

      // Not yet finished: the last feature does not even start until t=600ms.
      await sleep(300);
      const midway = h.getTransitionCount();

      // duration (400) + max delay (600) + slack.
      await sleep(1200);
      const after = h.getTransitionCount();
      const last = h.bulkState(1999)['circle-radius'];
      return { immediate, midway, after, last };
    });

    expect(r.immediate).toBe(2000);
    expect(r.midway).toBeGreaterThan(0);
    expect(r.after).toBe(0);
    expect(r.last).toBe(12);
  });
});
