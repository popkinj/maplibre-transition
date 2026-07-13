import { test, expect, Page } from '@playwright/test';
import { waitForMapLoad, waitForTransitionComplete } from './fixtures/test-helpers';

type Spot = { x: number; y: number; id: number; name: string };

/**
 * Find a city that is clear of the instrument card (top-right) and hit-testable, and
 * return both its canvas position and the id `generateId` gave it. Polled, because
 * querySourceFeatures only sees what is in loaded tiles.
 */
async function pickCity(page: Page): Promise<Spot> {
  const handle = await page.waitForFunction(
    () => {
      const map = (window as any).__testHooks?.map;
      if (!map || !map.getLayer('cities-layer')) return null;

      const canvas = map.getCanvas();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      for (const f of map.querySourceFeatures('cities')) {
        const p = map.project(f.geometry.coordinates);
        if (p.x < 60 || p.x > w - 380) continue; // keep clear of the controls panel
        if (p.y < 80 || p.y > h - 80) continue;
        const hit = map.queryRenderedFeatures(p, { layers: ['cities-layer'] });
        if (hit.length && hit[0].id === f.id) {
          return { x: p.x, y: p.y, id: f.id, name: f.properties.name };
        }
      }
      return null;
    },
    null,
    { timeout: 20000 }
  );
  return (await handle.jsonValue()) as Spot;
}

/**
 * Put the pointer on a city and confirm the page saw it. One direct jump, no
 * intermediate steps, so no other city is grazed on the way.
 *
 * The retry is not papering over a product bug: it covers the pointer missing a 9px
 * circle because the canvas moved between projecting the point and moving the mouse
 * (a late web-font load can add a scrollbar and shift the map by a few px). If the
 * pointer lands on *a* city, we take that one — nothing here depends on which.
 */
async function hoverCity(page: Page): Promise<Spot> {
  // A late web-font load is the one thing that reflows this page. Settle it first.
  await page.evaluate(async () => {
    await (document as any).fonts?.ready;
  });

  for (let attempt = 0; attempt < 4; attempt++) {
    const spot = await pickCity(page);
    const box = (await page.getByTestId('map-container').boundingBox())!;
    await page.mouse.move(box.x + spot.x, box.y + spot.y);

    const landed = await page.evaluate(() => (window as any).__testHooks.hoveredId());
    if (landed !== null && landed !== undefined) return { ...spot, id: landed };

    await leaveMap(page);
  }
  throw new Error('the pointer never landed on a city');
}

/** Off the canvas entirely -> mouseout -> the layer's mouseleave. */
async function leaveMap(page: Page): Promise<void> {
  await page.mouse.move(5, 5);
}

async function featureState(page: Page, id: number): Promise<Record<string, any>> {
  return page.evaluate(
    (fid) => (window as any).__testHooks.map.getFeatureState({ source: 'cities', id: fid }) || {},
    id
  );
}

type Dwell = { id: number; delay: number; armed: number; fired: number | null; abandoned: number | null };

/**
 * The page's own record of each hover, timestamped with performance.now() inside the
 * page. Whether the dwell threshold held is a fact about the page's clock — asserting
 * it by sampling the DOM from the test process would just be measuring how quickly
 * Playwright got round to looking, which under parallel load is not quick at all.
 */
async function dwellLog(page: Page): Promise<Dwell[]> {
  return page.evaluate(() => (window as any).__testHooks.dwellLog.map((d: any) => ({ ...d })));
}

test.describe('Hover Effects Demo', () => {
  // The resting values asserted below are the light-theme ones.
  test.use({ colorScheme: 'light' });

  test.beforeEach(async ({ page }) => {
    await page.goto('hover-effects.html');
  });

  test('page loads with map visible', async ({ page }) => {
    const mapContainer = page.getByTestId('map-container');
    await expect(mapContainer).toBeVisible();
    await waitForMapLoad(page);
  });

  test('displays page title', async ({ page }) => {
    await expect(page).toHaveTitle(/Hover Effects/);
  });

  test('mounts the shared chrome', async ({ page }) => {
    await expect(page.getByTestId('theme-toggle')).toBeVisible();
    await expect(page.getByTestId('frame-rail')).toBeAttached();
    await expect(page.getByTestId('kicker')).toContainText("[null, 20]");
  });

  test('duration slider is functional', async ({ page }) => {
    const durationSlider = page.getByTestId('duration-slider');
    await expect(durationSlider).toHaveValue('400');

    await durationSlider.fill('600');
    await expect(durationSlider).toHaveValue('600');
    await expect(page.getByTestId('duration-value')).toHaveText('600ms');
  });

  test('dwell slider is functional', async ({ page }) => {
    const dwell = page.getByTestId('dwell-slider');
    await expect(dwell).toHaveValue('220');

    await dwell.fill('500');
    await expect(dwell).toHaveValue('500');
    await expect(page.getByTestId('dwell-value')).toHaveText('500ms');
  });

  test('effect dropdown has correct options', async ({ page }) => {
    const effectSelect = page.getByTestId('effect-select');
    await expect(effectSelect).toBeVisible();

    const options = effectSelect.locator('option');
    await expect(options).toHaveCount(4);

    await expect(effectSelect.locator('option[value="grow"]')).toHaveCount(1);
    await expect(effectSelect.locator('option[value="pulse"]')).toHaveCount(1);
    await expect(effectSelect.locator('option[value="color-shift"]')).toHaveCount(1);
    await expect(effectSelect.locator('option[value="glow"]')).toHaveCount(1);
  });

  test('effect dropdown can be changed', async ({ page }) => {
    const effectSelect = page.getByTestId('effect-select');
    await effectSelect.selectOption('glow');
    await expect(effectSelect).toHaveValue('glow');
  });

  test('easing dropdown has quad selected by default', async ({ page }) => {
    const easingSelect = page.getByTestId('easing-select');
    await expect(easingSelect).toHaveValue('quad');
  });

  test('hover count starts at 0', async ({ page }) => {
    const hoverCount = page.getByTestId('hover-count-display');
    await expect(hoverCount).toContainText('0');
    await expect(page.getByTestId('dwell-status')).toHaveText('idle');
  });

  test('map loads with cities layer', async ({ page }) => {
    await waitForMapLoad(page);

    const hasLayer = await page.evaluate(() => {
      return window.__testHooks?.map?.getLayer('cities-layer') !== undefined;
    });
    expect(hasLayer).toBe(true);
  });

  test('dwell: the effect does not fire before the delay elapses', async ({ page }) => {
    await waitForMapLoad(page);
    await page.getByTestId('dwell-slider').fill('700');

    const spot = await hoverCity(page);

    // The start value is written to feature state synchronously (that is what makes
    // `delay` free), but nothing moves until the threshold is up. Then it fires on its
    // own, with no further input.
    await expect(page.getByTestId('hover-count-display')).toHaveText('1', { timeout: 10000 });
    await expect(page.getByTestId('dwell-status')).toHaveText('engaged');

    const [rec] = await dwellLog(page);
    expect(rec.id).toBe(spot.id);
    expect(rec.delay).toBe(700);
    expect(rec.fired).not.toBeNull();
    // The load-bearing assertion: the effect started no earlier than the threshold.
    expect(rec.fired! - rec.armed).toBeGreaterThanOrEqual(700);
    // ...and then promptly. Generous slack: a starved rAF under parallel load can be
    // hundreds of ms late, and that is not what this test is about.
    expect(rec.fired! - rec.armed).toBeLessThan(700 + 1500);

    await waitForTransitionComplete(page);
    expect((await featureState(page, spot.id))['circle-radius']).toBeCloseTo(20, 5);
  });

  test('dwell: leaving before the threshold cancels the pending effect outright', async ({ page }) => {
    await waitForMapLoad(page);
    await page.getByTestId('dwell-slider').fill('2000');

    // Hover, then leave immediately — two pointer moves back to back, nothing in
    // between, so the leave lands well inside the 2s threshold.
    const spot = await hoverCity(page);
    await leaveMap(page);

    await expect(page.getByTestId('dwell-status')).toHaveText('idle');
    await expect(page.getByTestId('abandoned-count')).toHaveText('1');

    const [rec] = await dwellLog(page);
    expect(rec.abandoned).not.toBeNull();
    // Prove the premise: the pointer really did leave before the threshold was up.
    expect(rec.abandoned! - rec.armed).toBeLessThan(2000);

    // The pending transition was superseded by the release, so it can never fire.
    // Wait out the whole delay and prove nothing happened.
    await page.waitForTimeout(2400);
    expect((await dwellLog(page))[0].fired).toBeNull();
    await expect(page.getByTestId('hover-count-display')).toHaveText('0');
    expect((await featureState(page, spot.id))['circle-radius']).toBeCloseTo(9, 5);
  });

  test('dwell 0 fires the effect immediately', async ({ page }) => {
    await waitForMapLoad(page);
    await page.getByTestId('dwell-slider').fill('0');
    await page.getByTestId('duration-slider').fill('300');

    const spot = await hoverCity(page);

    await expect(page.getByTestId('hover-count-display')).toHaveText('1');
    await expect(page.getByTestId('dwell-status')).toHaveText('engaged');

    await waitForTransitionComplete(page);
    expect((await featureState(page, spot.id))['circle-radius']).toBeCloseTo(20, 5);
  });

  test('leaving after the effect fired returns the circle to rest', async ({ page }) => {
    await waitForMapLoad(page);
    await page.getByTestId('dwell-slider').fill('0');
    await page.getByTestId('duration-slider').fill('300');

    const spot = await hoverCity(page);
    await waitForTransitionComplete(page);
    expect((await featureState(page, spot.id))['circle-radius']).toBeCloseTo(20, 5);

    await leaveMap(page);
    await waitForTransitionComplete(page);

    const state = await featureState(page, spot.id);
    expect(state['circle-radius']).toBeCloseTo(9, 5);
    expect(state['circle-opacity']).toBeCloseTo(0.85, 5);
    // Nothing was abandoned: the effect had already fired.
    await expect(page.getByTestId('abandoned-count')).toHaveText('0');
  });

  test('glow effect animates the stroke, not the radius', async ({ page }) => {
    await waitForMapLoad(page);
    await page.getByTestId('dwell-slider').fill('0');
    await page.getByTestId('duration-slider').fill('300');
    await page.getByTestId('effect-select').selectOption('glow');

    const spot = await hoverCity(page);
    await waitForTransitionComplete(page);

    const state = await featureState(page, spot.id);
    expect(state['circle-stroke-width']).toBeCloseTo(7, 5);
    expect(state['circle-opacity']).toBeCloseTo(1, 5);
    // The plugin only writes feature state for the properties of that call, so a
    // property this effect never mentions has no state at all — it still renders from
    // the layer's paint fallback.
    expect(state['circle-radius']).toBeUndefined();
  });
});
