import { test, expect } from '@playwright/test';
import { waitForMapLoad } from './fixtures/test-helpers';

test.describe('Vector Tiles Demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('vector-tiles.html');
  });

  test('page loads with map visible', async ({ page }) => {
    const mapContainer = page.getByTestId('map-container');
    await expect(mapContainer).toBeVisible();
    await waitForMapLoad(page);
  });

  test('displays page title', async ({ page }) => {
    await expect(page).toHaveTitle(/Vector Tiles/);
  });

  test('duration slider is functional', async ({ page }) => {
    const durationSlider = page.getByTestId('duration-slider');
    await expect(durationSlider).toHaveValue('1000');

    await durationSlider.fill('2000');
    await expect(durationSlider).toHaveValue('2000');
  });

  test('color picker is visible', async ({ page }) => {
    const colorPicker = page.getByTestId('color-picker');
    await expect(colorPicker).toBeVisible();
    await expect(colorPicker).toHaveValue('#ff1493');
  });

  test('easing dropdown has cubic selected by default', async ({ page }) => {
    const easingSelect = page.getByTestId('easing-select');
    await expect(easingSelect).toHaveValue('cubic');
  });

  test('reset button is present', async ({ page }) => {
    const resetBtn = page.getByTestId('reset-button');
    await expect(resetBtn).toBeVisible();
    await expect(resetBtn).toContainText('Reset All Countries');
  });

  test('map loads successfully', async ({ page }) => {
    await waitForMapLoad(page);

    const mapLoaded = await page.evaluate(() => {
      return window.__testHooks?.map?.loaded() === true;
    });
    expect(mapLoaded).toBe(true);
  });
});
