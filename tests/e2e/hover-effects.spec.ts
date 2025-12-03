import { test, expect } from '@playwright/test';
import { waitForMapLoad } from './fixtures/test-helpers';

test.describe('Hover Effects Demo', () => {
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

  test('duration slider is functional', async ({ page }) => {
    const durationSlider = page.getByTestId('duration-slider');
    await expect(durationSlider).toHaveValue('400');

    await durationSlider.fill('600');
    await expect(durationSlider).toHaveValue('600');
  });

  test('effect dropdown has correct options', async ({ page }) => {
    const effectSelect = page.getByTestId('effect-select');
    await expect(effectSelect).toBeVisible();

    const options = effectSelect.locator('option');
    await expect(options).toHaveCount(4);

    // Verify options exist in the DOM
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
  });

  test('map loads with cities layer', async ({ page }) => {
    await waitForMapLoad(page);

    const hasLayer = await page.evaluate(() => {
      return window.__testHooks?.map?.getLayer('cities-layer') !== undefined;
    });
    expect(hasLayer).toBe(true);
  });
});
