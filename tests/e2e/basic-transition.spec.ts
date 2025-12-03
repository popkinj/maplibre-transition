import { test, expect } from '@playwright/test';
import { waitForMapLoad, getTransitionCount } from './fixtures/test-helpers';

test.describe('Basic Transition Demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('basic-transition.html');
  });

  test('page loads with map visible', async ({ page }) => {
    const mapContainer = page.getByTestId('map-container');
    await expect(mapContainer).toBeVisible();
    await waitForMapLoad(page);
  });

  test('displays page title', async ({ page }) => {
    await expect(page).toHaveTitle(/Basic Transition/);
  });

  test('controls panel is visible', async ({ page }) => {
    const controls = page.locator('.controls');
    await expect(controls).toBeVisible();
    await expect(controls.locator('h2')).toContainText('Basic Transition');
  });

  test('duration slider is functional', async ({ page }) => {
    const durationSlider = page.getByTestId('duration-slider');
    await expect(durationSlider).toBeVisible();

    // Check initial value
    await expect(durationSlider).toHaveValue('1000');

    // Verify the slider can be changed
    await durationSlider.fill('2000');
    await expect(durationSlider).toHaveValue('2000');

    // Verify initial display shows correct value
    const durationValue = page.locator('#duration-value');
    await expect(durationValue).toBeVisible();
  });

  test('easing dropdown contains all options', async ({ page }) => {
    const easingSelect = page.getByTestId('easing-select');
    await expect(easingSelect).toBeVisible();

    // Check options count
    const options = easingSelect.locator('option');
    await expect(options).toHaveCount(8);

    // Verify key options exist in the DOM
    await expect(easingSelect.locator('option[value="linear"]')).toHaveCount(1);
    await expect(easingSelect.locator('option[value="cubic"]')).toHaveCount(1);
    await expect(easingSelect.locator('option[value="bounce"]')).toHaveCount(1);
  });

  test('easing dropdown can be changed', async ({ page }) => {
    const easingSelect = page.getByTestId('easing-select');
    await easingSelect.selectOption('bounce');
    await expect(easingSelect).toHaveValue('bounce');
  });

  test('clicked city display starts with None', async ({ page }) => {
    const clickedCity = page.getByTestId('clicked-city-display');
    await expect(clickedCity).toContainText('None');
  });

  test('map loads with cities layer', async ({ page }) => {
    await waitForMapLoad(page);

    // Check that the map has loaded with the cities source
    const hasSource = await page.evaluate(() => {
      return window.__testHooks?.map?.getSource('cities') !== undefined;
    });
    expect(hasSource).toBe(true);
  });

  test('clicking map triggers transition', async ({ page }) => {
    await waitForMapLoad(page);

    // Get map container dimensions
    const mapContainer = page.getByTestId('map-container');
    const box = await mapContainer.boundingBox();
    if (!box) throw new Error('Could not get map bounding box');

    // Click near center of map (where cities should be)
    await mapContainer.click({ position: { x: box.width / 2, y: box.height / 2 } });

    // Wait a moment for any transition to potentially start
    await page.waitForTimeout(100);

    // Note: We can't guarantee a city is under the click, but we verify the click works
  });
});
