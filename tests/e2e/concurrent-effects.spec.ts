import { test, expect } from '@playwright/test';
import { waitForMapLoad } from './fixtures/test-helpers';

test.describe('Concurrent Effects Demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('concurrent-effects.html');
  });

  test('page loads with map visible', async ({ page }) => {
    await expect(page.getByTestId('map-container')).toBeVisible();
    await waitForMapLoad(page);
  });

  test('displays page title', async ({ page }) => {
    await expect(page).toHaveTitle(/Concurrent Effects/);
  });

  test('controls panel is visible', async ({ page }) => {
    const controls = page.locator('.controls');
    await expect(controls).toBeVisible();
    await expect(controls.locator('h2')).toContainText('Concurrent Effects');
  });

  test('all four channels are present and checked by default', async ({ page }) => {
    for (const id of ['chan-radius', 'chan-color', 'chan-opacity', 'chan-stroke']) {
      const checkbox = page.getByTestId(id);
      await expect(checkbox).toBeVisible();
      await expect(checkbox).toBeChecked();
    }
  });

  test('channels can be toggled', async ({ page }) => {
    const radius = page.getByTestId('chan-radius');
    await radius.uncheck();
    await expect(radius).not.toBeChecked();
  });

  test('calm all button is present', async ({ page }) => {
    await expect(page.getByTestId('calm-all')).toBeVisible();
  });

  test('map loads with cities source', async ({ page }) => {
    await waitForMapLoad(page);
    const hasSource = await page.evaluate(
      () => window.__testHooks?.map?.getSource('cities') !== undefined
    );
    expect(hasSource).toBe(true);
  });

  test('alive count starts at zero', async ({ page }) => {
    await expect(page.getByTestId('alive-count')).toHaveText('0');
  });

  test('clicking a marker brings it to life and starts transitions', async ({ page }) => {
    await waitForMapLoad(page);

    // Find a marker whose projected position is on the visible canvas.
    const coords = await page.evaluate(() => {
      const map = window.__testHooks?.map;
      if (!map) return null;
      const canvas = map.getCanvas();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      for (const f of map.querySourceFeatures('cities')) {
        const p = map.project(f.geometry.coordinates);
        if (p.x >= 5 && p.x <= w - 5 && p.y >= 5 && p.y <= h - 5) {
          return { x: p.x, y: p.y };
        }
      }
      return null;
    });
    test.skip(coords === null, 'no marker visible on canvas to click');

    await page.getByTestId('map-container').click({ position: coords! });
    await expect(page.getByTestId('alive-count')).toHaveText('1');

    const count = await page.evaluate(
      () => window.__testHooks?.getTransitionCount() ?? 0
    );
    expect(count).toBeGreaterThan(0);
  });
});
