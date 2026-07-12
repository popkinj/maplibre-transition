import { test, expect, Page } from '@playwright/test';

/**
 * Regression tests for the animation-jank fixes (see OPTIMIZATIONS.md):
 *  - #3 interruption must not discard the new target
 *  - #5 interrupting a color transition must not produce NaN
 *  - #6 rAF loops / transition objects must not accumulate on interruption
 *  - merge model: independent properties on one feature coexist
 *  - onStart / onComplete fire exactly once
 *
 * These drive the deterministic _test-harness.html rather than a demo UI, so
 * feature ids and base paint values are fixed.
 */

const norm = (c: string) => c.replace(/\s/g, '');

test.describe('Transition interruption & concurrency', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.goto('_test-harness.html');
    await page.waitForFunction(() => window.__testHooks?.map !== undefined);
    await page.evaluate(() => window.__testHooks!.waitForLoad());
  });

  test('interrupting a color transition never yields NaN and settles on the new target', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const h: any = window.__testHooks;
      const sleep = (ms: number) => new Promise((x) => setTimeout(x, ms));

      h.transition(0, { duration: 600, ease: 'cubic', paint: { 'circle-color': [null, '#ff0000'] } });
      await sleep(150);
      const mid = h.state(0)['circle-color'];

      // Interrupt with a different target mid-flight (the path that used to NaN).
      h.transition(0, { duration: 600, ease: 'cubic', paint: { 'circle-color': [null, '#00ff00'] } });
      await sleep(120);
      const afterInterrupt = h.state(0)['circle-color'];
      const during = h.getTransitionCount();

      for (let i = 0; i < 100 && h.getTransitionCount() > 0; i++) await sleep(20);
      return { mid, afterInterrupt, final: h.state(0)['circle-color'], during, after: h.getTransitionCount() };
    });

    for (const v of [r.mid, r.afterInterrupt, r.final]) {
      expect(typeof v).toBe('string');
      expect(v).not.toContain('NaN');
      expect(v).not.toContain('undefined');
    }
    // One transition object for the feature, drained on completion.
    expect(r.during).toBe(1);
    expect(r.after).toBe(0);
    // Settled on green (the interrupting target), not red (the discarded one).
    expect(norm(r.final)).toBe('rgb(0,255,0)');
  });

  test('rapid repeated interrupts keep exactly one transition object and drain to zero', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const h: any = window.__testHooks;
      const sleep = (ms: number) => new Promise((x) => setTimeout(x, ms));

      const sizes: number[] = [];
      for (let i = 0; i < 8; i++) {
        h.transition(0, {
          duration: 400,
          paint: { 'circle-radius': [null, 12 + (i % 2) * 12], 'circle-opacity': [null, 0.5 + (i % 2) * 0.5] },
        });
        await sleep(25);
        sizes.push(h.getTransitionCount());
      }
      for (let i = 0; i < 100 && h.getTransitionCount() > 0; i++) await sleep(20);
      return { max: Math.max(...sizes), after: h.getTransitionCount() };
    });

    // One feature animating => never more than one object, whatever the interrupt rate.
    expect(r.max).toBe(1);
    expect(r.after).toBe(0);
  });

  test('independent properties from separate calls coexist and each reaches its own target', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const h: any = window.__testHooks;
      const sleep = (ms: number) => new Promise((x) => setTimeout(x, ms));

      // Let initial tile rendering settle so setTimeout sampling isn't skewed.
      await sleep(250);

      // Long radius transition, then a short color transition on the SAME feature.
      // Radius is deliberately long (2s) so it is unambiguously still mid-flight
      // when we sample, even under main-thread contention.
      h.transition(0, { duration: 2000, ease: 'linear', paint: { 'circle-radius': [null, 30] } });
      await sleep(100);
      h.transition(0, { duration: 300, ease: 'linear', paint: { 'circle-color': [null, '#00ff00'] } });

      // ~550ms into the radius tween: color has finished, radius is still going.
      await sleep(450);
      const midColor = h.state(0)['circle-color'];
      const midRadius = h.state(0)['circle-radius'];
      const countMid = h.getTransitionCount();

      for (let i = 0; i < 200 && h.getTransitionCount() > 0; i++) await sleep(20);
      return {
        midColor,
        midRadius,
        countMid,
        finalRadius: h.state(0)['circle-radius'],
        finalColor: h.state(0)['circle-color'],
        after: h.getTransitionCount(),
      };
    });

    // Color completed while radius was still animating (not frozen, not cancelled).
    expect(norm(r.midColor)).toBe('rgb(0,255,0)');
    expect(r.midRadius).toBeGreaterThan(10);
    expect(r.midRadius).toBeLessThan(29);
    expect(r.countMid).toBe(1);
    // Radius reached its own target despite the interleaved color call.
    expect(r.finalRadius).toBe(30);
    expect(norm(r.finalColor)).toBe('rgb(0,255,0)');
    expect(r.after).toBe(0);
  });

  test('onStart and onComplete each fire exactly once', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const h: any = window.__testHooks;
      const sleep = (ms: number) => new Promise((x) => setTimeout(x, ms));

      const counts = { start: 0, complete: 0 };
      h.transition(0, {
        duration: 200,
        paint: { 'circle-radius': [null, 20] },
        onStart: () => counts.start++,
        onComplete: () => counts.complete++,
      });
      for (let i = 0; i < 60 && h.getTransitionCount() > 0; i++) await sleep(20);
      await sleep(50);
      return counts;
    });

    expect(r.start).toBe(1);
    expect(r.complete).toBe(1);
  });

  test('multi-breakpoint numeric transition settles on its final breakpoint', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const h: any = window.__testHooks;
      const sleep = (ms: number) => new Promise((x) => setTimeout(x, ms));

      // [10, 30, 10] pulses up and must return exactly to 10.
      h.transition(0, { duration: 300, ease: 'linear', paint: { 'circle-radius': [10, 30, 10] } });
      for (let i = 0; i < 60 && h.getTransitionCount() > 0; i++) await sleep(20);
      return { final: h.state(0)['circle-radius'], after: h.getTransitionCount() };
    });

    expect(r.final).toBe(10);
    expect(r.after).toBe(0);
  });

  // Regression for the "null start value after completion" snap (TODO #4).
  // Once a transition has fully completed, only feature state (no active scale)
  // describes the current value. A follow-up [null, target] must read that
  // settled value and ramp from it, not jump straight to the target.
  test('null start value after a completed transition animates from current state (no snap)', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const h: any = window.__testHooks;
      const sleep = (ms: number) => new Promise((x) => setTimeout(x, ms));

      // 1. Radius up to 20, then let it fully complete (transition count drains).
      h.transition(0, { duration: 250, ease: 'linear', paint: { 'circle-radius': [null, 20] } });
      for (let i = 0; i < 100 && h.getTransitionCount() > 0; i++) await sleep(20);
      const settled = h.state(0)['circle-radius'];

      // 2. Back down with a null start — must ramp 20 -> 6, not snap.
      h.transition(0, { duration: 800, ease: 'linear', paint: { 'circle-radius': [null, 6] } });
      await sleep(200);
      const mid = h.state(0)['circle-radius'];
      const during = h.getTransitionCount();

      for (let i = 0; i < 100 && h.getTransitionCount() > 0; i++) await sleep(20);
      return { settled, mid, during, final: h.state(0)['circle-radius'], after: h.getTransitionCount() };
    });

    // Precondition: the first transition settled exactly on its target.
    expect(r.settled).toBe(20);
    // The old bug snapped instantly to 6. Assert we are still partway between the
    // settled start (20) and the target (6) mid-flight -> it animated from current state.
    expect(r.during).toBe(1);
    expect(r.mid).toBeGreaterThan(7);
    expect(r.mid).toBeLessThan(20);
    // And it still lands exactly on the new target.
    expect(r.final).toBe(6);
    expect(r.after).toBe(0);
  });
});
