import { test, expect } from '@playwright/test';
import { waitForMapLoad, getTransitionCount } from './fixtures/test-helpers';

test.describe('Color Cycle Demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('color-cycle.html');
  });

  test('page loads with map visible', async ({ page }) => {
    const mapContainer = page.getByTestId('map-container');
    await expect(mapContainer).toBeVisible();
    await waitForMapLoad(page);
  });

  test('displays page title', async ({ page }) => {
    await expect(page).toHaveTitle(/Color Cycling/);
  });

  test('duration slider is functional', async ({ page }) => {
    const durationSlider = page.getByTestId('duration-slider');
    await expect(durationSlider).toBeVisible();
    await expect(durationSlider).toHaveValue('3000');

    await durationSlider.fill('5000');
    await expect(durationSlider).toHaveValue('5000');
  });

  test('easing dropdown has linear selected by default', async ({ page }) => {
    const easingSelect = page.getByTestId('easing-select');
    await expect(easingSelect).toHaveValue('linear');
  });

  test('palette dropdown is functional', async ({ page }) => {
    const paletteSelect = page.getByTestId('palette-select');
    await expect(paletteSelect).toBeVisible();
    await expect(paletteSelect).toHaveValue('rainbow');

    await paletteSelect.selectOption('warm');
    await expect(paletteSelect).toHaveValue('warm');
  });

  test('map loads with cities layer', async ({ page }) => {
    await waitForMapLoad(page);

    const hasLayer = await page.evaluate(() => {
      return window.__testHooks?.map?.getLayer('cities-layer') !== undefined;
    });
    expect(hasLayer).toBe(true);
  });
});
