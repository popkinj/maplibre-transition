import { test, expect, Page } from '@playwright/test';
import {
  waitForMapLoad,
  getTransitionCount,
  waitForTransitionComplete,
} from './fixtures/test-helpers';

/**
 * stress.html — the page that proves the engine.
 *
 * The load-bearing assertion is `lastKickMs()`: the synchronous cost of firing the
 * whole batch. On the pre-refactor engine that was O(N^2) and ran into seconds; the
 * threshold here (400ms for 2000 features x 3 channels) is deliberately generous —
 * a slow CI box passes, the old engine does not.
 *
 * Frame-rate assertions are kept soft on purpose: headless chromium renders MapLibre
 * through a software rasterizer, so wall-clock frame times measure SwiftShader, not
 * this plugin. What we pin here is that the readouts are wired to real data.
 */

// This file measures frame time and the synchronous cost of a batch. Running its
// own tests in parallel would have a dozen chromiums fighting for the same cores
// and make every number here a measurement of the box, not of the engine. Run the
// file in one worker, in order. (Failures do not cascade in 'default' mode.)
test.describe.configure({ mode: 'default' });

const PAGE = 'stress.html';

async function gotoStress(page: Page) {
  await page.goto(PAGE);
  await waitForMapLoad(page);
  // The source + layer are added on `load`; the page flips `ready` there.
  await page.waitForFunction(
    () => !!(window as any).__testHooks?.map?.getLayer('field-layer'),
    { timeout: 30000 }
  );
}

// ---------------------------------------------------------------------------
// 1. The page
// ---------------------------------------------------------------------------

test.describe('stress — page', () => {
  test('loads the field, the chrome and the rail', async ({ page }) => {
    await gotoStress(page);

    await expect(page).toHaveTitle('Stress — maplibre-transition');
    await expect(page.getByTestId('map-container')).toBeVisible();
    await expect(page.getByTestId('kicker')).toHaveText('map.transition(f, { delay })');
    await expect(page.getByTestId('theme-toggle')).toBeVisible();
    await expect(page.getByTestId('frame-rail')).toBeVisible();
    await expect(page.getByTestId('kick')).toBeVisible();

    const info = await page.evaluate(() => {
      const h = (window as any).__testHooks;
      const layer = h.map.getStyle().layers;
      return {
        total: h.total,
        count: h.featureCount(),
        source: h.map.getStyle().sources.field.type,
        filter: h.map.getFilter('field-layer'),
        // our layer must sit above every basemap layer, for the theme swap
        lastLayerId: layer[layer.length - 1].id,
      };
    });

    expect(info.total).toBe(8000);
    expect(info.count).toBe(2500);
    expect(info.source).toBe('geojson');
    expect(info.filter).toEqual(['<', ['id'], 2500]);
    expect(info.lastLayerId).toBe('field-layer');
  });

  test('the field really is 8000 points with contiguous numeric ids', async ({ page }) => {
    await gotoStress(page);

    // Read the source data back out of the live style.
    const data = await page.evaluate(() => {
      const json = (window as any).__testHooks.map.getStyle().sources.field.data;
      const ids = json.features.map((f: any) => f.id);
      const unique = new Set(ids);
      return {
        n: json.features.length,
        unique: unique.size,
        min: Math.min(...ids),
        max: Math.max(...ids),
        allNumeric: ids.every((i: any) => typeof i === 'number'),
        geometry: json.features[0].geometry.type,
      };
    });

    expect(data.n).toBe(8000);
    expect(data.unique).toBe(8000);
    expect(data.min).toBe(0);
    expect(data.max).toBe(7999);
    expect(data.allNumeric).toBe(true);
    expect(data.geometry).toBe('Point');
  });
});

// ---------------------------------------------------------------------------
// 2. THE HEADLINE: the cost of the batch
// ---------------------------------------------------------------------------

test.describe('stress — kick', () => {
  test('2000 features start, drain to 0, and the batch is cheap', async ({ page }) => {
    await gotoStress(page);

    await page.evaluate(() => (window as any).__testHooks.setCount(2000));
    expect(await page.evaluate(() => (window as any).__testHooks.featureCount())).toBe(2000);

    // What the batch scheduled is snapshotted *inside the page*, at kick time. A
    // round-trip to the test process is a frame or more — under load the fastest
    // channels have already retired by the time a separate evaluate lands, so
    // reading the live Set from here would be measuring the round-trip.
    const fired = await page.evaluate(() => {
      const h = (window as any).__testHooks;
      const ms = h.kick();
      return {
        ms,
        size: h.lastKickSize(),
        channels: h.lastKickChannels(),
        last: h.lastKickMs(),
      };
    });

    // One transition record per feature, regardless of how many channels it runs …
    expect(fired.size).toBe(2000);
    // … 2000 features x 3 default channels = 6000 map.transition() calls.
    expect(fired.channels).toBe(6000);

    // The number the whole page exists to show. Old engine: O(N^2), seconds.
    expect(fired.ms).toBeGreaterThan(0);
    expect(fired.ms).toBeLessThan(400);
    expect(fired.last).toBeCloseTo(fired.ms, 3);

    // …and it is on screen, in mono, where nobody can miss it.
    const shown = Number(await page.getByTestId('kick-ms').textContent());
    expect(shown).toBeCloseTo(fired.ms, 0);

    const ms = fired.ms;

    await waitForTransitionComplete(page, 25000);
    expect(await getTransitionCount(page)).toBe(0);

    // Every one of them settled back to the resting radius.
    const settled = await page.evaluate(() => {
      const h = (window as any).__testHooks;
      return [0, 999, 1999].map((id) => h.state(id)['circle-radius']);
    });
    settled.forEach((r) => expect(r).toBeCloseTo(2.6, 1));

    // eslint-disable-next-line no-console
    console.log(`[stress] kick(2000 x 3 channels) = ${ms.toFixed(1)}ms`);
  });

  test('the button fires the batch', async ({ page }) => {
    await gotoStress(page);

    await page.evaluate(() => (window as any).__testHooks.setCount(500));
    expect(await getTransitionCount(page)).toBe(0);

    await page.getByTestId('kick').click();

    const fired = await page.evaluate(() => {
      const h = (window as any).__testHooks;
      return { size: h.lastKickSize(), ms: h.lastKickMs(), kicks: h.kicks() };
    });
    expect(fired.kicks).toBe(1);
    expect(fired.size).toBe(500);
    expect(fired.ms).toBeGreaterThan(0);

    await waitForTransitionComplete(page, 25000);
  });

  test('every stagger pattern fires n transitions and drains', async ({ page }) => {
    await gotoStress(page);
    await page.evaluate(() => (window as any).__testHooks.setCount(600));

    for (const pattern of ['radial', 'sweep', 'scatter', 'all']) {
      await page.getByTestId('pattern').selectOption(pattern);

      const fired = await page.evaluate(() => {
        const h = (window as any).__testHooks;
        const ms = h.kick();
        return { ms, size: h.lastKickSize() };
      });

      // Delayed transitions enter the Set synchronously — all n of them, at once.
      expect(fired.size).toBe(600);
      expect(fired.ms).toBeLessThan(400);

      await waitForTransitionComplete(page, 25000);
    }
  });

  test('a 3s stagger still costs the same to fire, and takes longer to drain', async ({
    page,
  }) => {
    await gotoStress(page);
    await page.evaluate(() => (window as any).__testHooks.setCount(1000));
    await page.getByTestId('pattern').selectOption('radial');

    const drain = async () => {
      const t0 = Date.now();
      await waitForTransitionComplete(page, 30000);
      return Date.now() - t0;
    };

    await page.getByTestId('stagger').fill('0');
    const flatMs = await page.evaluate(() => (window as any).__testHooks.kick());
    const flatDrain = await drain();

    await page.getByTestId('stagger').fill('3000');
    await expect(page.getByTestId('stagger-value')).toHaveText('3000ms');
    const stagMs = await page.evaluate(() => (window as any).__testHooks.kick());
    const stagDrain = await drain();

    // The synchronous cost of the batch does not depend on the delay …
    expect(flatMs).toBeLessThan(400);
    expect(stagMs).toBeLessThan(400);
    // … but the work is genuinely spread out over the 3s window. The floor is
    // structural: the last feature in a radial wave does not even start until
    // t=3000ms, and then runs for at least 900ms.
    expect(stagDrain).toBeGreaterThan(3500);
    expect(stagDrain).toBeGreaterThan(flatDrain);

    // eslint-disable-next-line no-console
    console.log(
      `[stress] 1000 feats — flat: kick ${flatMs.toFixed(1)}ms / drain ${flatDrain}ms | ` +
        `stagger 3000: kick ${stagMs.toFixed(1)}ms / drain ${stagDrain}ms`
    );
  });

  test('THE POINT: a stagger cuts the per-frame work', async ({ page }) => {
    await gotoStress(page);
    await page.evaluate(() => (window as any).__testHooks.setCount(2000));
    await page.getByTestId('pattern').selectOption('radial');

    // setFeatureState/frame is the engine's real per-frame cost: one write per
    // *running* feature. It is not rasterizer-bound, so unlike fps it is a sound
    // assertion in headless chromium.
    const sample = async (stagger: number) => {
      await page.getByTestId('stagger').fill(String(stagger));
      await page.evaluate(() => (window as any).__testHooks.kick());
      // ~1s in: the flat batch is at full tilt; the staggered one has only let
      // through the features whose delay has already elapsed.
      await page.waitForTimeout(1000);
      const w = await page.evaluate(() => (window as any).__testHooks.writesPerFrame());
      await waitForTransitionComplete(page, 30000);
      return w;
    };

    const flat = await sample(0);
    const staggered = await sample(3000);

    // Every one of the 2000 features is being written, every frame.
    expect(flat).toBeGreaterThan(1200);
    // With the delay deferring them, most of the batch is costing nothing yet.
    expect(staggered).toBeLessThan(flat * 0.7);

    await expect(page.getByTestId('writes')).toBeVisible();

    // eslint-disable-next-line no-console
    console.log(
      `[stress] 2000 feats — setFeatureState/frame: flat=${flat.toFixed(0)} ` +
        `stagger3000=${staggered.toFixed(0)} (${((staggered / flat) * 100).toFixed(0)}%)`
    );
  });
});

// ---------------------------------------------------------------------------
// 3. The feature-count slider must not touch the source
// ---------------------------------------------------------------------------

test.describe('stress — feature count', () => {
  test('changes the filter, not the data, and keeps feature state', async ({ page }) => {
    await gotoStress(page);

    await page.evaluate(() => (window as any).__testHooks.setCount(400));
    await page.getByTestId('stagger').fill('0');

    // Long, slow transition so we are certainly mid-flight when the slider moves.
    await page.evaluate(() => {
      const h = (window as any).__testHooks;
      for (let i = 0; i < 400; i++) {
        h.map.transition(
          { id: i, source: 'field', sourceLayer: undefined, layer: { id: 'field-layer' } },
          { duration: 6000, ease: 'linear', paint: { 'circle-radius': [null, 20] } }
        );
      }
    });

    await page.waitForFunction(() => (window as any).__testHooks.state(0)['circle-radius'] > 4, {
      timeout: 10000,
    });

    const before = await page.evaluate(() => ({
      radius: (window as any).__testHooks.state(0)['circle-radius'],
      transitions: (window as any).__testHooks.getTransitionCount(),
    }));
    expect(before.transitions).toBe(400);

    // Move the slider through the UI.
    await page.getByTestId('count').fill('6000');
    await expect(page.getByTestId('count-value')).toHaveText('6,000');

    const after = await page.evaluate(() => {
      const h = (window as any).__testHooks;
      return {
        filter: h.map.getFilter('field-layer'),
        radius: h.state(0)['circle-radius'],
        transitions: h.getTransitionCount(),
        paint: h.map.getPaintProperty('field-layer', 'circle-radius'),
      };
    });

    // The filter moved …
    expect(after.filter).toEqual(['<', ['id'], 6000]);
    // … the feature state did not reset (a setData would have wiped it) …
    expect(after.radius).toBeGreaterThanOrEqual(before.radius);
    expect(after.radius).toBeLessThan(20);
    // … the transitions kept running through it …
    expect(after.transitions).toBe(400);
    // … and the plugin still owns the paint property.
    expect(after.paint).toEqual(['coalesce', ['feature-state', 'circle-radius'], 2.6]);

    // And it runs to its target.
    await waitForTransitionComplete(page, 25000);
    expect(
      await page.evaluate(() => (window as any).__testHooks.state(0)['circle-radius'])
    ).toBeCloseTo(20, 1);
  });

  test('the slider bounds the batch: only ids < n are kicked', async ({ page }) => {
    await gotoStress(page);
    await page.getByTestId('count').fill('300');
    const size = await page.evaluate(() => {
      const h = (window as any).__testHooks;
      h.kick();
      return h.lastKickSize();
    });

    expect(size).toBe(300);

    const states = await page.evaluate(() => {
      const h = (window as any).__testHooks;
      return { inside: h.state(299), outside: h.state(300) };
    });
    expect(states.inside['circle-radius']).toBeDefined();
    // id 300 is outside the filter and was never touched.
    expect(states.outside['circle-radius']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Channels
// ---------------------------------------------------------------------------

test.describe('stress — channels', () => {
  test('checkboxes drive the channels/frame readout', async ({ page }) => {
    await gotoStress(page);
    await page.evaluate(() => (window as any).__testHooks.setCount(1000));

    // 1000 features x 3 default channels
    await expect(page.getByTestId('channels')).toHaveText('3,000');
    await expect(page.getByTestId('channels-armed')).toHaveText('3');

    await page.getByTestId('chan-stroke').check();
    await expect(page.getByTestId('channels')).toHaveText('4,000');
    await expect(page.getByTestId('channels-armed')).toHaveText('4');

    await page.getByTestId('chan-color').uncheck();
    await page.getByTestId('chan-opacity').uncheck();
    await expect(page.getByTestId('channels')).toHaveText('2,000');
    await expect(page.getByTestId('channels-armed')).toHaveText('2');
  });

  test('each channel is a separate call on the same feature, and they coexist', async ({
    page,
  }) => {
    await gotoStress(page);
    await page.evaluate(() => (window as any).__testHooks.setCount(200));
    await page.getByTestId('chan-stroke').check(); // all four
    await page.getByTestId('stagger').fill('0');

    const fired = await page.evaluate(() => {
      const h = (window as any).__testHooks;
      h.kick();
      return { size: h.lastKickSize(), channels: h.lastKickChannels() };
    });

    // One transition record per feature …
    expect(fired.size).toBe(200);
    // … carrying four independent channels each.
    expect(fired.channels).toBe(800);

    // Mid-flight, all four properties are live on the same feature at once.
    await page.waitForFunction(
      () => {
        const s = (window as any).__testHooks.state(0);
        return (
          s['circle-radius'] > 3 &&
          s['circle-opacity'] > 0.5 &&
          s['circle-stroke-width'] > 0 &&
          typeof s['circle-color'] === 'string'
        );
      },
      { timeout: 8000 }
    );

    await waitForTransitionComplete(page, 25000);

    // Every channel settled back to its resting value.
    const rest = await page.evaluate(() => (window as any).__testHooks.state(0));
    expect(rest['circle-radius']).toBeCloseTo(2.6, 1);
    expect(rest['circle-opacity']).toBeCloseTo(0.5, 1);
    expect(rest['circle-stroke-width']).toBeCloseTo(0, 1);
  });
});

// ---------------------------------------------------------------------------
// 5. Loop + readouts
// ---------------------------------------------------------------------------

test.describe('stress — loop and readouts', () => {
  test('loop re-kicks when the last transition drains', async ({ page }) => {
    await gotoStress(page);
    await page.evaluate(() => (window as any).__testHooks.setCount(200));
    await page.getByTestId('stagger').fill('0');

    expect(await page.evaluate(() => (window as any).__testHooks.kicks())).toBe(0);

    await page.getByTestId('loop').check();

    // Two full cycles, purely on onComplete-free drain detection.
    await page.waitForFunction(() => (window as any).__testHooks.kicks() >= 2, {
      timeout: 25000,
    });

    await page.getByTestId('loop').uncheck();
    await waitForTransitionComplete(page, 25000);
  });

  test('fps and p95 are real numbers wired to the frame meter', async ({ page }) => {
    await gotoStress(page);

    // The meter's 120-frame ring starts filling at page construction, so it is
    // initially full of style-parse and tile-fetch frames. Wait for it to settle
    // into a plausible idle rate. This is the assertion: with 2500 sensors on
    // screen and nothing animating, the page must be able to reach 20fps+ — if it
    // were burning frames at idle (a runaway rAF, a kick on load, a second meter),
    // the ring would never get there and this times out.
    //
    // waitForFunction (rather than one long evaluate) also survives the Vite dev
    // server pushing a full-reload while other pages are being edited.
    // Gate on the DOM readout too, not just the meter: it repaints at 5Hz, so the
    // number on screen trails the ring buffer by up to 200ms.
    await page.waitForFunction(
      () => {
        const h = (window as any).__testHooks;
        if (!h || !h.map.loaded() || h.perf.frames().length <= 60) return false;
        const shown = Number(
          document.querySelector('[data-testid="fps"]')?.textContent ?? '0'
        );
        return h.perf.fps() > 30 && shown > 30;
      },
      { timeout: 30000 }
    );

    const stats = await page.evaluate(() => {
      const h = (window as any).__testHooks;
      return { fps: h.perf.fps(), p95: h.perf.p95(), frames: h.perf.frames().length };
    });

    expect(stats.fps).toBeGreaterThan(20);
    expect(stats.fps).toBeLessThan(200); // a plausible rate, not a broken clock
    expect(stats.p95).toBeGreaterThan(0);
    expect(stats.frames).toBeLessThanOrEqual(120);

    // The big number on the card is the meter, not a decoration.
    const shownFps = Number(await page.getByTestId('fps').textContent());
    expect(shownFps).toBeGreaterThan(20);
    expect(Math.abs(shownFps - stats.fps)).toBeLessThan(25);

    await expect(page.getByTestId('p95')).toContainText('ms');
    await expect(page.getByTestId('rail-fps')).not.toHaveText('--');

    // eslint-disable-next-line no-console
    console.log(`[stress] idle fps=${stats.fps.toFixed(1)} p95=${stats.p95.toFixed(1)}ms`);
  });
});
