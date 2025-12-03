import { test, expect } from '@playwright/test';
import { waitForMapLoad } from './fixtures/test-helpers';

test.describe('Color Animation Demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('color-animation.html');
  });

  test('page loads with map visible', async ({ page }) => {
    const mapContainer = page.getByTestId('map-container');
    await expect(mapContainer).toBeVisible();
    await waitForMapLoad(page);
  });

  test('displays page title', async ({ page }) => {
    await expect(page).toHaveTitle(/Color Animation/);
  });

  test('duration slider is functional', async ({ page }) => {
    const durationSlider = page.getByTestId('duration-slider');
    await expect(durationSlider).toBeVisible();
    await expect(durationSlider).toHaveValue('1000');

    await durationSlider.fill('3000');
    await expect(durationSlider).toHaveValue('3000');
  });

  test('color picker is visible and functional', async ({ page }) => {
    const colorPicker = page.getByTestId('target-color-picker');
    await expect(colorPicker).toBeVisible();
    await expect(colorPicker).toHaveValue('#ff0000');
  });

  test('easing dropdown is functional', async ({ page }) => {
    const easingSelect = page.getByTestId('easing-select');
    await expect(easingSelect).toBeVisible();
    await easingSelect.selectOption('cubic');
    await expect(easingSelect).toHaveValue('cubic');
  });

  test('click count starts at 0', async ({ page }) => {
    const clickCount = page.getByTestId('click-count-display');
    await expect(clickCount).toContainText('0');
  });

  test('map loads with provinces source', async ({ page }) => {
    await waitForMapLoad(page);

    // Wait a bit more for data to load
    await page.waitForTimeout(500);

    const hasSource = await page.evaluate(() => {
      return window.__testHooks?.map?.getSource('provinces') !== undefined;
    });
    expect(hasSource).toBe(true);
  });
});
