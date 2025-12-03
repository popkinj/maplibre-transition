import { test, expect } from '@playwright/test';
import { waitForMapLoad } from './fixtures/test-helpers';

test.describe('Chained Transitions Demo', () => {
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

  test('chain type dropdown has correct options', async ({ page }) => {
    const chainTypeSelect = page.getByTestId('chain-type-select');
    await expect(chainTypeSelect).toBeVisible();

    const options = chainTypeSelect.locator('option');
    await expect(options).toHaveCount(3);

    // Verify options exist in the DOM
    await expect(chainTypeSelect.locator('option[value="simple"]')).toHaveCount(1);
    await expect(chainTypeSelect.locator('option[value="complex"]')).toHaveCount(1);
    await expect(chainTypeSelect.locator('option[value="loop"]')).toHaveCount(1);
  });

  test('duration slider is functional', async ({ page }) => {
    const durationSlider = page.getByTestId('duration-slider');
    await expect(durationSlider).toHaveValue('800');

    await durationSlider.fill('1200');
    await expect(durationSlider).toHaveValue('1200');
  });

  test('stop button is hidden by default', async ({ page }) => {
    const stopBtn = page.getByTestId('stop-button');
    await expect(stopBtn).toBeHidden();
  });
});
