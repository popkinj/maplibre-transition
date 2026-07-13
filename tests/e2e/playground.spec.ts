import { test, expect, Page } from '@playwright/test';
import {
  waitForMapLoad,
  getTransitionCount,
  waitForTransitionComplete,
} from './fixtures/test-helpers';

/**
 * examples/playground.html — the flagship "learn the API" page.
 *
 * It replaces basic-transition / multiple-properties / easing-functions, so this
 * spec has to cover what all three covered (duration, easing, multi-property) plus
 * what none of them did: `delay`, and the theme recolour going through
 * map.transition() rather than setPaintProperty().
 */

// The nine easings the engine accepts (CONTRACTS §1), in panel order.
const EASINGS = [
  'linear',
  'quad',
  'cubic',
  'poly',
  'sin',
  'exp',
  'circle',
  'elastic',
  'bounce',
];

const PROPS = [
  'circle-radius',
  'circle-color',
  'circle-opacity',
  'circle-stroke-width',
  'circle-stroke-color',
];

const TORONTO = 4; // capitals[4] — well clear of the instrument card

async function ready(page: Page) {
  await page.goto('playground.html');
  await waitForMapLoad(page);
  // The source + layer are added on the map's `load` event.
  await page.waitForFunction(
    () => !!(window as any).__testHooks?.map?.getLayer('cities-layer'),
    { timeout: 30000 }
  );
}

const state = (page: Page, id: number) =>
  page.evaluate((i) => (window as any).__testHooks.featureState(i), id);

const count = (page: Page) => getTransitionCount(page);

// ---------------------------------------------------------------------------
// 1. Shell
// ---------------------------------------------------------------------------

test.describe('playground — shell', () => {
  test('loads the map, the chrome and the instrument card', async ({ page }) => {
    await ready(page);

    await expect(page).toHaveTitle('Playground — maplibre-transition');
    await expect(page.getByTestId('map-container')).toBeVisible();
    await expect(page.locator('.controls h2')).toHaveText('Playground');

    // chrome.js
    await expect(page.getByTestId('kicker')).toHaveText(
      'map.transition(feature, options)'
    );
    await expect(page.getByTestId('theme-toggle')).toBeVisible();
    await expect(page.getByTestId('frame-rail')).toBeVisible();

    // the 58-city layer
    const info = await page.evaluate(() => {
      const h = (window as any).__testHooks;
      return {
        cities: h.cityCount,
        hasSource: !!h.map.getSource('cities'),
        // our layer must sit above every basemap layer
        lastLayer: h.map.getStyle().layers.at(-1).id,
      };
    });
    expect(info.cities).toBe(58);
    expect(info.hasSource).toBe(true);
    expect(info.lastLayer).toBe('cities-layer');
  });

  test('the frame rail reports frames', async ({ page }) => {
    await ready(page);
    await page.waitForFunction(
      () => (window as any).__testHooks.meter.frames().length > 20,
      { timeout: 15000 }
    );
    await expect(page.getByTestId('rail-fps')).not.toHaveText('--');
  });

  test('exposes every control with a data-testid', async ({ page }) => {
    await ready(page);

    for (const p of PROPS) {
      await expect(page.getByTestId(`prop-${p}`)).toBeAttached();
      await expect(page.getByTestId(`target-${p}`)).toBeAttached();
    }

    await expect(page.getByTestId('duration-slider')).toHaveValue('1200');
    await expect(page.getByTestId('delay-slider')).toHaveValue('0');
    await expect(page.getByTestId('easing-select')).toHaveValue('cubic');
    await expect(page.getByTestId('paint-preview')).toBeVisible();
    await expect(page.getByTestId('compare-easings')).toBeEnabled();
    await expect(page.getByTestId('reset-btn')).toBeEnabled();
    await expect(page.getByTestId('transition-count')).toHaveText('0');
  });

  test('sliders drive their readouts', async ({ page }) => {
    await ready(page);

    await page.getByTestId('duration-slider').fill('2500');
    await expect(page.getByTestId('duration-value')).toHaveText('2500ms');

    await page.getByTestId('delay-slider').fill('900');
    await expect(page.getByTestId('delay-value')).toHaveText('900ms');
  });
});

// ---------------------------------------------------------------------------
// 2. Easing — all nine, plotted
// ---------------------------------------------------------------------------

test.describe('playground — easing', () => {
  test('the select offers all 9 engine easings', async ({ page }) => {
    await ready(page);

    const select = page.getByTestId('easing-select');
    await expect(select.locator('option')).toHaveCount(9);

    const values = await select.locator('option').evaluateAll((els) =>
      els.map((e) => (e as HTMLOptionElement).value)
    );
    expect(values).toEqual(EASINGS);
  });

  test('the curve is redrawn for every easing', async ({ page }) => {
    await ready(page);

    const path = page.getByTestId('easing-path');
    const seen = new Map<string, string>();

    for (const ease of EASINGS) {
      await page.getByTestId('easing-select').selectOption(ease);
      await expect(page.getByTestId('ease-value')).toHaveText(ease);

      const d = await path.getAttribute('d');
      expect(d, `${ease}: curve path`).toBeTruthy();
      expect(d!.length, `${ease}: curve path`).toBeGreaterThan(50);
      seen.set(ease, d!);
    }

    // `poly` is d3's easePolyInOut at its DEFAULT exponent 3 — which is exactly
    // easeCubicInOut. The plugin exposes no exponent, so `poly` and `cubic` are
    // the same animation, and honestly plot the same curve. Pin that, and say so
    // in the UI (see the ease-note assertion below) rather than fake a
    // difference. The other eight are mutually distinct.
    expect(seen.get('poly')).toBe(seen.get('cubic'));
    expect(new Set(seen.values()).size).toBe(8);

    // Overshoot must be drawn, not clipped: elastic/bounce leave the unit box.
    expect(seen.get('elastic')).not.toBe(seen.get('bounce'));
  });

  test('names the real d3 function, including the two that surprise people', async ({
    page,
  }) => {
    await ready(page);
    const note = page.getByTestId('ease-note');

    await page.getByTestId('easing-select').selectOption('poly');
    await expect(note).toContainText('the same curve as cubic');

    // d3's easeElastic/easeBounce are the *Out* variants, not InOut.
    await page.getByTestId('easing-select').selectOption('elastic');
    await expect(note).toContainText('elasticOut');

    await page.getByTestId('easing-select').selectOption('bounce');
    await expect(note).toContainText('bounceOut');
  });

  test('the progress dot rides the curve while a transition runs', async ({
    page,
  }) => {
    await ready(page);

    await page.getByTestId('duration-slider').fill('2000');
    await page.evaluate((id) => (window as any).__testHooks.runOn(id), TORONTO);

    const dot = page.getByTestId('easing-dot');
    await expect(dot).toHaveClass(/live/);

    const cx1 = Number(await dot.getAttribute('cx'));
    await page.waitForTimeout(600);
    const cx2 = Number(await dot.getAttribute('cx'));
    expect(cx2).toBeGreaterThan(cx1);

    await waitForTransitionComplete(page, 15000);
  });
});

// ---------------------------------------------------------------------------
// 3. The paint object, live
// ---------------------------------------------------------------------------

test.describe('playground — the live call', () => {
  test('shows the exact call the panel will make', async ({ page }) => {
    await ready(page);

    const pre = page.getByTestId('paint-preview');

    // Defaults: radius, color, stroke-width checked; opacity + stroke-color not.
    await expect(pre).toContainText('map.transition(feature, {');
    await expect(pre).toContainText('duration: 1200');
    await expect(pre).toContainText('delay: 0');
    await expect(pre).toContainText('ease: "cubic"');
    await expect(pre).toContainText('"circle-radius": [null, 30]');
    await expect(pre).toContainText('"circle-color": [null, "#f4703a"]');
    await expect(pre).toContainText('"circle-stroke-width": [null, 6]');
    await expect(pre).not.toContainText('circle-opacity');
    await expect(page.getByTestId('paint-count')).toHaveText('3 / 5');
  });

  test('checkboxes add and remove properties from the paint object', async ({
    page,
  }) => {
    await ready(page);

    const pre = page.getByTestId('paint-preview');

    await page.getByTestId('prop-circle-opacity').check();
    await expect(pre).toContainText('"circle-opacity": [null, 1]');
    await expect(page.getByTestId('paint-count')).toHaveText('4 / 5');

    await page.getByTestId('prop-circle-color').uncheck();
    await expect(pre).not.toContainText('"circle-color"');
    await expect(page.getByTestId('paint-count')).toHaveText('3 / 5');

    // Everything off => an empty paint object, and nothing to fire.
    for (const p of PROPS) {
      await page.getByTestId(`prop-${p}`).uncheck();
    }
    await expect(pre).toContainText('paint: {}');
    await expect(page.getByTestId('paint-count')).toHaveText('0 / 5');
    await expect(page.getByTestId('compare-easings')).toBeDisabled();
    await expect(page.getByTestId('hint')).toContainText(
      'check at least one paint property'
    );

    const fired = await page.evaluate((id) =>
      (window as any).__testHooks.runOn(id)
    , TORONTO);
    expect(fired).toBe(false);
    expect(await count(page)).toBe(0);
  });

  test('editing a target updates the call and the transition', async ({ page }) => {
    await ready(page);

    await page.getByTestId('target-circle-radius').fill('44');
    await expect(page.getByTestId('paint-preview')).toContainText(
      '"circle-radius": [null, 44]'
    );

    const call = await page.evaluate(() =>
      (window as any).__testHooks.paintCall()
    );
    expect(call.paint['circle-radius']).toEqual([null, 44]);
    expect(call.duration).toBe(1200);
    expect(call.ease).toBe('cubic');
  });
});

// ---------------------------------------------------------------------------
// 4. Firing — the real click path
// ---------------------------------------------------------------------------

test.describe('playground — transitions', () => {
  test('clicking a city starts a transition that drains to 0 on target', async ({
    page,
  }) => {
    await ready(page);

    expect(await count(page)).toBe(0);

    // Pick the most isolated marker on screen rather than hardcoding one: at fit
    // zoom the Windsor–Quebec corridor overlaps (a click on Toronto lands on
    // Niagara Falls), and this also proves the hit-test resolves the exact
    // feature under the cursor.
    const target = await page.evaluate(() => {
      const h = (window as any).__testHooks;
      const box = document.getElementById('map')!.getBoundingClientRect();
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < h.cityCount; i++) pts.push(h.cityPoint(i));

      let best = -1;
      let bestGap = -1;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        // Stay well inside the map, and clear of the instrument card on the right.
        if (p.x < 60 || p.y < 60 || p.y > box.height - 60) continue;
        if (p.x > box.width - 360) continue;

        let gap = Infinity;
        for (let j = 0; j < pts.length; j++) {
          if (i === j) continue;
          const d = Math.hypot(p.x - pts[j].x, p.y - pts[j].y);
          if (d < gap) gap = d;
        }
        if (gap > bestGap) {
          bestGap = gap;
          best = i;
        }
      }
      return { id: best, name: h.cityName(best), point: pts[best], gap: bestGap };
    });

    // No other marker within 20px, so the click is unambiguous.
    expect(target.gap).toBeGreaterThan(20);

    await page.getByTestId('map-container').click({ position: target.point });

    // The transition is registered synchronously by the click handler.
    expect(await count(page)).toBeGreaterThan(0);
    await expect(page.getByTestId('readout-city')).toContainText(
      `${target.name} · id ${target.id}`
    );

    await waitForTransitionComplete(page, 15000);
    expect(await count(page)).toBe(0);

    // …and it landed exactly on the panel's targets, on all three properties.
    const s = await state(page, target.id);
    expect(s['circle-radius']).toBeCloseTo(30, 5);
    expect(s['circle-stroke-width']).toBeCloseTo(6, 5);
    expect(s['circle-color']).toMatch(/rgb\(244,\s*112,\s*58\)/);

    // The plugin owns the property now.
    const paint = await page.evaluate(() =>
      (window as any).__testHooks.map.getPaintProperty(
        'cities-layer',
        'circle-radius'
      )
    );
    expect(paint).toEqual(['coalesce', ['feature-state', 'circle-radius'], 8]);

    // onStart and onComplete each fired once for the call.
    const cb = await page.evaluate(() => (window as any).__testHooks.callbacks());
    expect(cb.starts).toBe(1);
    expect(cb.completes).toBe(1);
  });

  test('delay truly defers: feature state is unchanged before it elapses', async ({
    page,
  }) => {
    await ready(page);

    // One property, so the assertion is unambiguous.
    await page.getByTestId('prop-circle-color').uncheck();
    await page.getByTestId('prop-circle-stroke-width').uncheck();
    await page.getByTestId('duration-slider').fill('400');
    await page.getByTestId('delay-slider').fill('2000');
    await expect(page.getByTestId('paint-preview')).toContainText('delay: 2000');

    const t0 = Date.now();
    await page.evaluate((id) => (window as any).__testHooks.runOn(id), TORONTO);

    // A delayed transition enters the Set synchronously (CONTRACTS §1)…
    expect(await count(page)).toBe(1);

    // …and its start value is written once, synchronously, so the feature is
    // pinned at the base value until the delay elapses.
    const early = await state(page, TORONTO);
    expect(early['circle-radius']).toBe(8);

    await page.waitForTimeout(900);
    expect(Date.now() - t0).toBeLessThan(2000); // still inside the delay
    const mid = await state(page, TORONTO);
    expect(mid['circle-radius']).toBe(8);
    expect(await count(page)).toBe(1);

    // Then it runs.
    await waitForTransitionComplete(page, 15000);
    const done = await state(page, TORONTO);
    expect(done['circle-radius']).toBeCloseTo(30, 5);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(2000);
  });

  test('reset returns every touched feature to the layer base', async ({ page }) => {
    await ready(page);

    await page.evaluate((id) => (window as any).__testHooks.runOn(id), TORONTO);
    await waitForTransitionComplete(page, 15000);
    expect((await state(page, TORONTO))['circle-radius']).toBeCloseTo(30, 5);

    const n = await page.evaluate(() => (window as any).__testHooks.reset());
    expect(n).toBe(1);
    await waitForTransitionComplete(page, 15000);

    const s = await state(page, TORONTO);
    expect(s['circle-radius']).toBeCloseTo(8, 5);
    expect(s['circle-stroke-width']).toBeCloseTo(1.5, 5);
  });
});

// ---------------------------------------------------------------------------
// 5. Compare all easings — the old easing-functions page, in one button
// ---------------------------------------------------------------------------

test.describe('playground — compare all easings', () => {
  test('fires 9 transitions, one easing each, on 9 distinct cities', async ({
    page,
  }) => {
    await ready(page);
    expect(await count(page)).toBe(0);

    await page.getByTestId('compare-easings').click();

    // Nine features => nine entries in the Set, synchronously.
    expect(await count(page)).toBe(9);

    const pairs = await page.evaluate(() =>
      (window as any).__testHooks.lastCompare()
    );
    expect(pairs).toHaveLength(9);
    expect(pairs.map((p: any) => p.ease)).toEqual(EASINGS);
    expect(new Set(pairs.map((p: any) => p.id)).size).toBe(9);

    // The legend names all nine cities.
    const legend = page.getByTestId('race-legend');
    await expect(legend.locator('.row')).toHaveCount(9);
    for (const p of pairs) {
      await expect(legend).toContainText(p.name);
    }

    await waitForTransitionComplete(page, 20000);

    // Every racer landed on the same target, whatever curve it took.
    for (const p of pairs) {
      const s = await state(page, p.id);
      expect(s['circle-radius'], `${p.ease} / ${p.name}`).toBeCloseTo(30, 5);
    }
  });

  test('the racers are mid-flight at different values (the curves differ)', async ({
    page,
  }) => {
    await ready(page);

    await page.getByTestId('duration-slider').fill('3000');
    await page.getByTestId('compare-easings').click();

    // Frame-driven, NOT wall-clock. Under parallel load this box's rAF stalls for
    // hundreds of ms (software WebGL), so `waitForTimeout(700)` can read a frame
    // that is 600ms stale and every racer still looks unstarted. Wait until the
    // engine has actually advanced the linear racer, then sample.
    await page.waitForFunction(
      () => {
        const h = (window as any).__testHooks;
        const p = h.lastCompare().find((x: any) => x.ease === 'linear');
        return (h.featureState(p.id)['circle-radius'] ?? 8) > 13;
      },
      { timeout: 20000 }
    );

    // All nine in ONE evaluate, so they are read at a single instant.
    const { eases, values } = await page.evaluate(() => {
      const h = (window as any).__testHooks;
      const pairs = h.lastCompare();
      return {
        eases: pairs.map((p: any) => p.ease),
        values: pairs.map((p: any) => h.featureState(p.id)['circle-radius'] as number),
      };
    });

    expect(values).toHaveLength(9);
    const at = (ease: string) => values[eases.indexOf(ease)];

    // Same instant, same 8 -> 30 ramp, nine curves — and they are genuinely apart.
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(3);

    // `poly` IS `cubic` (easePolyInOut at its default exponent 3): on a spread of
    // >3 they sit on top of each other. They are not bit-identical because the two
    // map.transition() calls are ~1.5ms apart in the loop, and each call stamps its
    // own performance.now() start — so ~0.02 of radius separates them. The exact
    // identity of the two curves is pinned in the SVG test above.
    expect(Math.abs(at('poly') - at('cubic'))).toBeLessThan(0.2);

    // Curve shape, read straight off the map: exp crawls out of the gate, cubic is
    // still behind linear at t≈0.3, bounce and elastic are way ahead.
    expect(at('exp')).toBeLessThan(at('cubic'));
    expect(at('cubic')).toBeLessThan(at('linear'));
    expect(at('bounce')).toBeGreaterThan(at('linear'));

    // elastic overshoots 1 — but the engine clamps the eased value to [0,1], so it
    // is pinned AT the target, never past it. Nothing may exceed the target.
    expect(at('elastic')).toBeGreaterThan(at('linear'));
    for (const v of values) expect(v).toBeLessThanOrEqual(30);
  });

  test('the curve plots what the engine runs: elastic is clamped, and says so', async ({
    page,
  }) => {
    await ready(page);

    // 8 of 9 easings stay inside [0,1]: no ghost curve to draw.
    await page.getByTestId('easing-select').selectOption('cubic');
    await expect(page.getByTestId('curve-ghost')).toHaveAttribute('d', '');

    // elastic overshoots, the engine clamps it, so the plot shows the flattened
    // curve solid and ghosts the raw d3 curve that got cut off.
    await page.getByTestId('easing-select').selectOption('elastic');
    const ghost = await page.getByTestId('curve-ghost').getAttribute('d');
    expect(ghost!.length).toBeGreaterThan(50);
    expect(ghost).not.toBe(await page.getByTestId('easing-path').getAttribute('d'));
    await expect(page.getByTestId('ease-note')).toContainText('clamps');
  });
});

// ---------------------------------------------------------------------------
// 6. The theme swap — recoloured BY the plugin, not by setPaintProperty
// ---------------------------------------------------------------------------

test.describe('playground — theme', () => {
  test.use({ colorScheme: 'light' });

  test('toggling the theme recolours all 58 markers with map.transition()', async ({
    page,
  }) => {
    await ready(page);

    expect(await count(page)).toBe(0);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByTestId('theme-toggle').click();

    // The recolour is fired synchronously on themechange — one transition per
    // city — and it runs *through* the basemap swap.
    await page.waitForFunction(
      () => (window as any).__testHooks.getTransitionCount() > 0,
      { timeout: 10000 }
    );
    expect(await page.evaluate(() => (window as any).__testHooks.recolours())).toBe(1);

    // The basemap really swapped (Dark Matter's background).
    await page.waitForFunction(
      () =>
        (window as any).__testHooks.map.getPaintProperty(
          'background',
          'background-color'
        ) === '#0e0e0e',
      { timeout: 30000 }
    );

    await waitForTransitionComplete(page, 20000);

    // Every marker interpolated to the dark palette (#38e0c8 / #0d1517) …
    for (const id of [0, 29, 57]) {
      const s = await state(page, id);
      expect(s['circle-color'], `city ${id}`).toMatch(/rgb\(56,\s*224,\s*200\)/);
      expect(s['circle-stroke-color'], `city ${id}`).toMatch(/rgb\(13,\s*21,\s*23\)/);
    }

    // … and the paint property is still the plugin's coalesce expression, i.e.
    // nobody called setPaintProperty behind its back (CONTRACTS §1).
    const paint = await page.evaluate(() =>
      (window as any).__testHooks.map.getPaintProperty(
        'cities-layer',
        'circle-color'
      )
    );
    expect(paint).toEqual([
      'coalesce',
      ['feature-state', 'circle-color'],
      '#26547c',
    ]);

    // The source and layer survived the setStyle diff.
    const alive = await page.evaluate(() => {
      const m = (window as any).__testHooks.map;
      return {
        source: !!m.getSource('cities'),
        layer: !!m.getLayer('cities-layer'),
        last: m.getStyle().layers.at(-1).id,
      };
    });
    expect(alive).toEqual({
      source: true,
      layer: true,
      last: 'cities-layer',
    });
  });

  test('a transition fired after the swap still works', async ({ page }) => {
    await ready(page);

    await page.getByTestId('theme-toggle').click();
    await page.waitForFunction(
      () =>
        (window as any).__testHooks.map.getPaintProperty(
          'background',
          'background-color'
        ) === '#0e0e0e',
      { timeout: 30000 }
    );
    await waitForTransitionComplete(page, 20000);

    await page.evaluate((id) => (window as any).__testHooks.runOn(id), TORONTO);
    expect(await count(page)).toBe(1);
    await waitForTransitionComplete(page, 15000);

    expect((await state(page, TORONTO))['circle-radius']).toBeCloseTo(30, 5);
  });
});

// ---------------------------------------------------------------------------
// 7. Nothing throws
// ---------------------------------------------------------------------------

test.describe('playground — console', () => {
  test.use({ colorScheme: 'light' });

  test('no console errors across a full session', async ({ page }) => {
    // Under heavy parallel load this box drops to software WebGL (SwiftShader) and
    // Chromium can fail to compile a shader — "Could not compile fragment shader".
    // That is the rasterizer dying, not the page: it cannot be caused by anything
    // this page's JS does. Everything else must be clean.
    const GPU_NOISE =
      /could not compile (fragment|vertex) shader|swiftshader|webgl|GroupMarker|GL Driver/i;

    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !GPU_NOISE.test(m.text())) errors.push(m.text());
    });
    page.on('pageerror', (e) => {
      if (!GPU_NOISE.test(e.message)) errors.push(`pageerror: ${e.message}`);
    });

    await ready(page);

    // click a city
    const pt = await page.evaluate(
      (id) => (window as any).__testHooks.cityPoint(id),
      TORONTO
    );
    await page.getByTestId('map-container').click({ position: pt });
    await waitForTransitionComplete(page, 15000);

    // race
    await page.getByTestId('compare-easings').click();
    await waitForTransitionComplete(page, 20000);

    // theme (basemap swap + 58 recolours)
    await page.getByTestId('theme-toggle').click();
    await page.waitForFunction(
      () =>
        (window as any).__testHooks.map.getPaintProperty(
          'background',
          'background-color'
        ) === '#0e0e0e',
      { timeout: 30000 }
    );
    await waitForTransitionComplete(page, 20000);

    // reset
    await page.getByTestId('reset-btn').click();
    await waitForTransitionComplete(page, 20000);

    expect(errors).toEqual([]);
  });
});
