import { test, expect, Page } from '@playwright/test';
import { waitForMapLoad } from './fixtures/test-helpers';

/**
 * Rising City — the flagship 3D page.
 *
 * ~5000 real OSM buildings on a CARTO basemap, each running TWO feature-state
 * channels at once (fill-extrusion-height + fill-extrusion-color), i.e. ~10,000
 * samplers on the engine's single rAF.
 *
 * The theme-swap-mid-rise proof ("the money test") lives in theme.spec.ts, next to
 * the rest of the basemap-diff contract.
 */

/** The buildings layer is added only after the geojson fetch resolves. */
async function waitForCity(page: Page) {
  await waitForMapLoad(page);
  await page.waitForFunction(() => !!(window as any).__testHooks.map.getLayer('buildings-layer'), {
    timeout: 60000,
  });
}

/**
 * Set the panel's controls, then read them back and assert they took.
 *
 * The read-back is not paranoia: a silently-dropped `fill()` on a range input turns
 * a "no stagger" test into a "1600ms of random stagger" test, which then fails as a
 * baffling off-by-99 in a count. Fail loudly at the cause instead.
 */
async function setControls(
  page: Page,
  opts: { buildings?: number; stagger?: number; duration?: number; effect?: string; pattern?: string }
) {
  const STEPS = [500, 1500, 3000, 5000];
  if (opts.buildings !== undefined)
    await page.getByTestId('buildings-slider').fill(String(opts.buildings));
  if (opts.stagger !== undefined)
    await page.getByTestId('stagger-slider').fill(String(opts.stagger));
  if (opts.duration !== undefined)
    await page.getByTestId('duration-slider').fill(String(opts.duration));
  if (opts.effect) await page.getByTestId('effect-select').selectOption(opts.effect);
  if (opts.pattern) await page.getByTestId('pattern-select').selectOption(opts.pattern);

  const got = await page.evaluate(() => ({
    buildings: Number((document.getElementById('buildings') as HTMLInputElement).value),
    stagger: Number((document.getElementById('stagger') as HTMLInputElement).value),
    duration: Number((document.getElementById('duration') as HTMLInputElement).value),
    effect: (document.getElementById('effect') as HTMLSelectElement).value,
    pattern: (document.getElementById('pattern') as HTMLSelectElement).value,
    active: (window as any).__testHooks.buildingCount,
  }));

  if (opts.buildings !== undefined) {
    expect(got.buildings).toBe(opts.buildings);
    // the slider's `input` handler must have run, not just its value been poked
    expect(got.active).toBe(STEPS[opts.buildings]);
  }
  if (opts.stagger !== undefined) expect(got.stagger).toBe(opts.stagger);
  if (opts.duration !== undefined) expect(got.duration).toBe(opts.duration);
  if (opts.effect) expect(got.effect).toBe(opts.effect);
  if (opts.pattern) expect(got.pattern).toBe(opts.pattern);
}

// 5000 fill-extrusions on a software rasterizer (headless chromium falls back to
// SwiftShader, and CI has no GPU) needs well over the 30s default just to reach
// map.loaded(). On a real GPU the same page holds 60fps.
test.describe.configure({ timeout: 120_000 });

test.describe('Rising City Demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('rising-city.html');
  });

  test('page loads with map visible', async ({ page }) => {
    await expect(page.getByTestId('map-container')).toBeVisible();
    await waitForMapLoad(page);
  });

  test('displays page title', async ({ page }) => {
    await expect(page).toHaveTitle(/Rising City/);
  });

  test('controls panel is visible', async ({ page }) => {
    const controls = page.locator('.controls');
    await expect(controls).toBeVisible();
    await expect(controls.locator('h2')).toContainText('Rising City');
  });

  test('grow button and controls are present', async ({ page }) => {
    await expect(page.getByTestId('grow-btn')).toBeVisible();
    await expect(page.getByTestId('orbit-btn')).toBeVisible();
    await expect(page.getByTestId('buildings-slider')).toBeVisible();
    await expect(page.getByTestId('stagger-slider')).toBeVisible();
    await expect(page.getByTestId('duration-slider')).toBeVisible();
    await expect(page.getByTestId('pattern-select')).toBeVisible();
    await expect(page.getByTestId('effect-select')).toBeVisible();
  });

  test('pattern and effect selects have expected options', async ({ page }) => {
    const pattern = page.getByTestId('pattern-select');
    await expect(pattern.locator('option')).toHaveCount(3);
    const effect = page.getByTestId('effect-select');
    await expect(effect.locator('option')).toHaveCount(4);
  });

  test('reports the full building count once loaded', async ({ page }) => {
    await waitForCity(page);

    // Assert against the hook, never a hardcoded literal: re-running
    // scripts/fetch-buildings.mjs changes N and must not break the suite.
    const { count, total, readout } = await page.evaluate(() => {
      const h: any = window.__testHooks;
      return {
        count: h.buildingCount,
        total: h.totalBuildings,
        readout: document.querySelector('[data-testid="building-count"]')!.textContent,
      };
    });

    expect(total).toBeGreaterThan(1000); // the data file has a hard floor of 1000
    expect(count).toBe(total); // the slider starts at max
    expect(readout).toBe(count.toLocaleString('en-US'));
    await expect(page.getByTestId('loading')).toBeHidden();
  });

  test('growing raises fill-extrusion-height via feature-state, with no MapLibre errors', async ({
    page,
  }) => {
    // Attach the console listener BEFORE navigating so nothing is missed.
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('rising-city.html');
    await waitForMapLoad(page);

    // Drive a deterministic grow ourselves (independent of the demo's one-shot
    // auto-grow, whose timing would otherwise race the assertion).
    const result = await page.evaluate(async () => {
      const h: any = window.__testHooks;
      const map = h.map;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      // The fill-extrusion layer is added in the map 'load' handler.
      for (let i = 0; i < 150 && !map.getLayer('buildings-layer'); i++) await sleep(20);

      for (const id of [0, 1, 2, 3, 4]) {
        map.transition(
          { id, source: 'buildings', sourceLayer: undefined, layer: { id: 'buildings-layer' }, properties: {} },
          { duration: 500, ease: 'cubic', paint: { 'fill-extrusion-height': [0, 60] } }
        );
      }
      const during = map.transition.transitions.size; // synchronously present
      await sleep(1500);
      const heightOf = (id: number) =>
        map.getFeatureState({ source: 'buildings', id })['fill-extrusion-height'];
      return { during, h0: heightOf(0), h4: heightOf(4) };
    });

    // Transitions registered, and the buildings actually grew (height > 0).
    expect(result.during).toBeGreaterThan(0);
    expect(typeof result.h0).toBe('number');
    expect(result.h0).toBeGreaterThan(0);
    expect(result.h4).toBeGreaterThan(0);

    // If MapLibre had rejected feature-state on fill-extrusion-height it would log here.
    const relevant = errors.filter((t) =>
      /feature-state|fill-extrusion|expression|expected/i.test(t)
    );
    expect(relevant).toEqual([]);
  });
});

/**
 * Deterministic behaviour, driven by hand.
 *
 * Reduced motion suppresses the page's auto-grow and auto-orbit (CONTRACTS §7), which
 * makes every assertion below race-free — and incidentally pins the reduced-motion
 * contract itself.
 *
 * NB: it is emulated with page.emulateMedia(), NOT test.use({ reducedMotion }). The
 * fixture option is silently ignored under this runner — matchMedia() still reports
 * no-preference — while colorScheme from the same test.use() applies fine. Verified
 * on @playwright/test 1.57.0. Don't "simplify" this back to test.use().
 */
test.describe('Rising City — two channels, driven', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('rising-city.html');
    await waitForCity(page);
  });
  // The emulation itself is asserted in 'respects prefers-reduced-motion' below; if it
  // ever silently stops applying, that test fails loudly and explains why.

  test('respects prefers-reduced-motion: no auto-grow, no auto-orbit', async ({ page }) => {
    await page.waitForTimeout(1200);
    const state = await page.evaluate(() => {
      const h: any = window.__testHooks;
      return {
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        transitions: h.getTransitionCount(),
        state0: h.stateOf(0),
        grown: h.isGrown(),
        orbiting: document
          .querySelector('[data-testid="orbit-btn"]')!
          .getAttribute('aria-pressed'),
      };
    });
    expect(state.reduced).toBe(true);
    expect(state.transitions).toBe(0);
    expect(state.state0).toEqual({}); // nothing has been written at all
    expect(state.grown).toBe(false);
    expect(state.orbiting).not.toBe('true');

    // The button is the entry point.
    await expect(page.getByTestId('grow-btn')).toHaveText('Grow city');
  });

  test('both animated paint properties are plugin-owned coalesce over a LITERAL fallback', async ({
    page,
  }) => {
    await page.getByTestId('grow-btn').click();

    const paint = await page.evaluate(() => {
      const m = (window as any).__testHooks.map;
      return {
        height: m.getPaintProperty('buildings-layer', 'fill-extrusion-height'),
        color: m.getPaintProperty('buildings-layer', 'fill-extrusion-color'),
      };
    });

    // If the layer's base colour were an ["interpolate", …, ["get","height"]] the
    // fallback here would be that expression — a mixed coalesce/expression construct.
    // It must be a plain literal.
    expect(paint.height).toEqual(['coalesce', ['feature-state', 'fill-extrusion-height'], 0]);
    expect(paint.color).toEqual([
      'coalesce',
      ['feature-state', 'fill-extrusion-color'],
      '#111a2e',
    ]);
  });

  test('grow drives BOTH channels to their targets, then collapse returns them', async ({
    page,
  }) => {
    await setControls(page, { buildings: 1, stagger: 0, duration: 400, effect: 'cubic' });

    const targets = await page.evaluate(() => {
      const h: any = window.__testHooks;
      return [0, 7, 123].map((id) => ({ id, height: h.targetHeight(id) }));
    });
    expect(targets.every((t) => t.height > 0)).toBe(true);

    // Trigger and count in ONE evaluate. CONTRACTS §1: a transition enters the Set
    // synchronously. Reading it from a second round-trip would instead measure CDP
    // latency against a page that is already animating 3000 channels.
    const registered = await page.evaluate(() => {
      const h: any = window.__testHooks;
      h.grow();
      return h.getTransitionCount();
    });
    // One entry per FEATURE, not per channel — 1500 buildings, 3000 channels.
    expect(registered).toBe(1500);
    await expect(page.getByTestId('grow-btn')).toHaveText('Collapse');

    // Drain, and land exactly on target — the engine writes a precomputed final value.
    await page.waitForFunction(() => (window as any).__testHooks.getTransitionCount() === 0, {
      timeout: 60000,
    });
    const grown = await page.evaluate(
      (ids) => ids.map((id) => (window as any).__testHooks.stateOf(id)),
      targets.map((t) => t.id)
    );
    grown.forEach((s: any, i: number) => {
      expect(s['fill-extrusion-height']).toBe(targets[i].height);
      expect(s['fill-extrusion-color']).toBeTruthy();
    });

    // Collapse takes both channels back — height to 0, colour to COLD.
    await page.getByTestId('grow-btn').click();
    await expect(page.getByTestId('grow-btn')).toHaveText('Grow city');
    await page.waitForFunction(() => (window as any).__testHooks.getTransitionCount() === 0, {
      timeout: 60000,
    });

    const collapsed = await page.evaluate(() => (window as any).__testHooks.stateOf(0));
    expect(collapsed['fill-extrusion-height']).toBe(0);
    expect(collapsed['fill-extrusion-color']).toBe('rgb(17, 26, 46)'); // COLD, via d3
  });

  test('mid-flight, both channels sit strictly between their endpoints', async ({ page }) => {
    await setControls(page, { buildings: 0 }); // 500 buildings

    const target = await page.evaluate(() => (window as any).__testHooks.targetHeight(0));
    expect(target).toBeGreaterThan(0);

    // A 20s linear rise. Deliberately far longer than the slider allows: under 8
    // parallel headless workers on a software rasterizer, a 3s transition can finish
    // before the next CDP round-trip lands, which would turn this into a vacuous
    // at-rest assertion. Linear also never overshoots, so `< target` is exact.
    await page.evaluate(() =>
      (window as any).__testHooks.growWith({ duration: 20000, stagger: 0, effect: 'linear' })
    );

    await page.waitForFunction(
      () => ((window as any).__testHooks.stateOf(0)['fill-extrusion-height'] ?? 0) > 0,
      { timeout: 30000 }
    );

    const mid = await page.evaluate(() => {
      const h: any = window.__testHooks;
      return { state: h.stateOf(0), transitions: h.getTransitionCount() };
    });

    expect(mid.transitions).toBe(500);
    expect(mid.state['fill-extrusion-height']).toBeGreaterThan(0);
    expect(mid.state['fill-extrusion-height']).toBeLessThan(target);
    expect(mid.state['fill-extrusion-color']).toBeTruthy();
    expect(mid.state['fill-extrusion-color']).not.toBe('#111a2e'); // it has ignited
    expect(mid.state['fill-extrusion-color']).not.toBe('rgb(17, 26, 46)');
  });

  test('the buildings slider filters — it never calls setData, so feature state survives', async ({
    page,
  }) => {
    await setControls(page, { buildings: 0, stagger: 0, duration: 400, effect: 'cubic' }); // 500

    await page.evaluate(() => (window as any).__testHooks.grow());
    await page.waitForFunction(() => (window as any).__testHooks.getTransitionCount() === 0, {
      timeout: 30000,
    });

    const before = await page.evaluate(() => (window as any).__testHooks.stateOf(0));
    expect(before['fill-extrusion-height']).toBeGreaterThan(0);

    // Reveal 2500 more. They must be lifted to meet the skyline, and building 0 must
    // not lose the state it already has.
    await setControls(page, { buildings: 2 }); // 3000
    await page.waitForFunction(() => (window as any).__testHooks.getTransitionCount() === 0, {
      timeout: 30000,
    });

    const after = await page.evaluate(() => {
      const h: any = window.__testHooks;
      const m = h.map;
      return {
        filter: m.getFilter('buildings-layer'),
        count: h.buildingCount,
        readout: document.querySelector('[data-testid="building-count"]')!.textContent,
        channels: document.querySelector('[data-testid="channel-count"]')!.textContent,
        state0: h.stateOf(0),
        // the newly revealed buildings were grown to meet the skyline
        state2999: h.stateOf(2999),
      };
    });

    expect(after.filter).toEqual(['<', ['id'], 3000]);
    expect(after.count).toBe(3000);
    expect(after.readout).toBe('3,000');
    expect(after.channels).toBe('6,000');
    // Building 0's state was NOT destroyed by the filter change.
    expect(after.state0['fill-extrusion-height']).toBeCloseTo(
      before['fill-extrusion-height'],
      5
    );
    // …and the delta was lifted to meet it, rather than sitting flat.
    expect(after.state2999['fill-extrusion-height']).toBeGreaterThan(0);
  });

  test('orbit toggles, and a user gesture on the map cancels it', async ({ page }) => {
    const orbit = page.getByTestId('orbit-btn');
    await expect(orbit).toHaveAttribute('aria-pressed', 'false');

    await orbit.click();
    await expect(orbit).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('camera-state')).toHaveText('orbit');

    const b0 = await page.evaluate(() => (window as any).__testHooks.map.getBearing());
    await page.waitForTimeout(900);
    const b1 = await page.evaluate(() => (window as any).__testHooks.map.getBearing());
    expect(Math.abs(b1 - b0)).toBeGreaterThan(0.5); // the camera really is moving

    // Any drag on the canvas takes the camera away from the choreography, for good.
    await page.getByTestId('map-container').hover({ position: { x: 300, y: 400 } });
    await page.mouse.down();
    await page.mouse.move(360, 430, { steps: 5 });
    await page.mouse.up();

    await expect(orbit).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('camera-state')).toHaveText('manual');
  });
});
