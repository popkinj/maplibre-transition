import { test, expect, Page } from '@playwright/test';
import {
  waitForMapLoad,
  waitForTransitionComplete,
  getTransitionCount
} from './fixtures/test-helpers';

async function stepLog(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as any).__testHooks.stepLog.slice());
}

/** The ordered highlight changes: ['0:running', '0:done', '1:running', …] */
async function stateLog(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__testHooks.stateLog.slice());
}

async function featureState(page: Page, id: number): Promise<Record<string, any>> {
  return page.evaluate(
    (fid) => (window as any).__testHooks.map.getFeatureState({ source: 'cities', id: fid }) || {},
    id
  );
}

test.describe('Chained Transitions Demo', () => {
  // The resting values asserted below are the light-theme ones.
  test.use({ colorScheme: 'light' });

  test.beforeEach(async ({ page }) => {
    await page.goto('chained-transitions.html');
  });

  test('page loads with map visible', async ({ page }) => {
    const mapContainer = page.getByTestId('map-container');
    await expect(mapContainer).toBeVisible();
    await waitForMapLoad(page);
  });

  test('displays page title', async ({ page }) => {
    await expect(page).toHaveTitle(/Chained Transitions/);
  });

  test('mounts the shared chrome', async ({ page }) => {
    await expect(page.getByTestId('theme-toggle')).toBeVisible();
    await expect(page.getByTestId('frame-rail')).toBeAttached();
    await expect(page.getByTestId('kicker')).toHaveText('{ onComplete }');
  });

  test('chain type dropdown has correct options', async ({ page }) => {
    const chainTypeSelect = page.getByTestId('chain-type-select');
    await expect(chainTypeSelect).toBeVisible();

    const options = chainTypeSelect.locator('option');
    await expect(options).toHaveCount(3);

    await expect(chainTypeSelect.locator('option[value="simple"]')).toHaveCount(1);
    await expect(chainTypeSelect.locator('option[value="complex"]')).toHaveCount(1);
    await expect(chainTypeSelect.locator('option[value="loop"]')).toHaveCount(1);
  });

  test('duration slider is functional', async ({ page }) => {
    const durationSlider = page.getByTestId('duration-slider');
    await expect(durationSlider).toHaveValue('800');

    await durationSlider.fill('1200');
    await expect(durationSlider).toHaveValue('1200');
    await expect(page.getByTestId('duration-value')).toHaveText('1200ms');
  });

  test('stop button is hidden by default', async ({ page }) => {
    const stopBtn = page.getByTestId('stop-button');
    await expect(stopBtn).toBeHidden();
  });

  test('the timeline mirrors the selected chain', async ({ page }) => {
    const timeline = page.getByTestId('chain-timeline');
    const steps = timeline.locator('.step');

    await expect(steps).toHaveCount(2); // simple
    await expect(page.getByTestId('chain-step-0')).toContainText('grow');
    await expect(page.getByTestId('chain-step-0')).toContainText('circle-radius');

    await page.getByTestId('chain-type-select').selectOption('complex');
    await expect(steps).toHaveCount(4);
    await expect(page.getByTestId('chain-step-3')).toContainText('settle');

    await page.getByTestId('chain-type-select').selectOption('loop');
    await expect(steps).toHaveCount(2);
    await expect(page.getByTestId('chain-step-0')).toContainText('swell');
  });

  test('the chain timeline advances, step by step, on onComplete', async ({ page }) => {
    await waitForMapLoad(page);
    await page.getByTestId('duration-slider').fill('2000');
    await page.getByTestId('run-button').click();

    const step0 = page.getByTestId('chain-step-0');
    const step1 = page.getByTestId('chain-step-1');

    // Both of these are monotone ("eventually and then forever"), so they cannot race
    // the way a snapshot of the *current* step would: step 2 only ever starts once
    // step 1's onComplete has fired, and step 1 is done by then.
    await expect(step1).toHaveAttribute('data-state', 'running', { timeout: 10000 });
    await expect(step0).toHaveAttribute('data-state', 'done');
    await expect(page.getByTestId('chain-status')).toHaveText('step 2/2');

    await waitForTransitionComplete(page);
    await expect(step0).toHaveAttribute('data-state', 'done');
    await expect(step1).toHaveAttribute('data-state', 'done');
    await expect(page.getByTestId('chain-status')).toHaveText('idle');

    // The exact highlight sequence. This is the timeline advancing, with no sampling.
    expect(await stateLog(page)).toEqual(['0:running', '0:done', '1:running', '1:done']);
    expect(await stepLog(page)).toEqual([0, 1]);
  });

  test('a 4-step chain runs every step, in order, and lands back at rest', async ({ page }) => {
    await waitForMapLoad(page);
    await page.getByTestId('chain-type-select').selectOption('complex');
    await page.getByTestId('duration-slider').fill('300');
    await page.getByTestId('run-button').click();

    await expect(page.getByTestId('chain-status')).toHaveText('idle', { timeout: 10000 });
    expect(await stepLog(page)).toEqual([0, 1, 2, 3]);

    const state = await featureState(page, 0); // run-button targets Ottawa, id 0
    expect(state['circle-radius']).toBeCloseTo(9, 5);
    expect(state['circle-opacity']).toBeCloseTo(0.85, 5);
    expect(state['circle-stroke-width']).toBeCloseTo(1.5, 5);
  });

  test('clicking a city retargets the chain', async ({ page }) => {
    await waitForMapLoad(page);
    await page.getByTestId('duration-slider').fill('300');

    const spot = await page.waitForFunction(() => {
      const map = (window as any).__testHooks?.map;
      if (!map || !map.getLayer('cities-layer')) return null;
      const canvas = map.getCanvas();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      for (const f of map.querySourceFeatures('cities')) {
        const p = map.project(f.geometry.coordinates);
        if (p.x < 60 || p.x > w - 380) continue;
        if (p.y < 80 || p.y > h - 80) continue;
        const hit = map.queryRenderedFeatures(p, { layers: ['cities-layer'] });
        if (hit.length && hit[0].id === f.id) {
          return { x: p.x, y: p.y, id: f.id, name: f.properties.name };
        }
      }
      return null;
    }, null, { timeout: 20000 });

    const city = (await spot.jsonValue()) as { x: number; y: number; id: number; name: string };
    const box = (await page.getByTestId('map-container').boundingBox())!;
    await page.mouse.click(box.x + city.x, box.y + city.y);

    await expect(page.getByTestId('target-name')).toHaveText(city.name);

    await expect(page.getByTestId('chain-status')).toHaveText('idle', { timeout: 10000 });
    expect(await stepLog(page)).toEqual([0, 1]);
    // The clicked city ran the chain and came home...
    expect((await featureState(page, city.id))['circle-radius']).toBeCloseTo(9, 5);
    // ...and the default target (Ottawa, id 0) was never touched at all.
    if (city.id !== 0) expect(await featureState(page, 0)).toEqual({});
  });

  test('the loop repeats on onComplete, and the stop button really stops it', async ({ page }) => {
    await waitForMapLoad(page);
    await page.getByTestId('chain-type-select').selectOption('loop');
    await page.getByTestId('duration-slider').fill('300');
    await page.getByTestId('run-button').click();

    const stopBtn = page.getByTestId('stop-button');
    await expect(stopBtn).toBeVisible();

    // It re-arms itself purely from onComplete — no setTimeout anywhere on the page.
    await expect(page.getByTestId('lap-count')).toHaveText('1', { timeout: 10000 });
    expect(await getTransitionCount(page)).toBeGreaterThan(0);

    await stopBtn.click();
    await expect(stopBtn).toBeHidden();

    // The release supersedes the in-flight step, so that step's onComplete never fires
    // and the loop cannot re-arm. Transitions must drain to zero and stay there.
    await waitForTransitionComplete(page, 5000);
    await expect(page.getByTestId('chain-status')).toHaveText('idle');

    const laps = await page.getByTestId('lap-count').textContent();
    await page.waitForTimeout(900); // ~1.5 laps' worth
    expect(await getTransitionCount(page)).toBe(0);
    expect(await page.getByTestId('lap-count').textContent()).toBe(laps);
    expect((await featureState(page, 0))['circle-radius']).toBeCloseTo(9, 5);
  });
});
