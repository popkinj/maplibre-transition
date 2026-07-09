import { test, expect } from '@playwright/test';
import { waitForMapLoad } from './fixtures/test-helpers';

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
    await waitForMapLoad(page);
    await expect(page.getByTestId('building-count')).toHaveText('450');
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
