import { test, expect } from '@playwright/test';
import { waitForMapLoad } from './fixtures/test-helpers';

test.describe('Multi-Breakpoint Demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('multi-breakpoint.html');
  });

  test('page loads with map visible', async ({ page }) => {
    const mapContainer = page.getByTestId('map-container');
    await expect(mapContainer).toBeVisible();
    await waitForMapLoad(page);
  });

  test('displays page title', async ({ page }) => {
    await expect(page).toHaveTitle(/Multi-Breakpoint/);
  });

  test('pattern dropdown has correct options', async ({ page }) => {
    const patternSelect = page.getByTestId('pattern-select');
    await expect(patternSelect).toBeVisible();

    const options = patternSelect.locator('option');
    await expect(options).toHaveCount(4);

    // Verify options exist in the DOM
    await expect(patternSelect.locator('option[value="wave"]')).toHaveCount(1);
    await expect(patternSelect.locator('option[value="bounce"]')).toHaveCount(1);
    await expect(patternSelect.locator('option[value="spiral"]')).toHaveCount(1);
    await expect(patternSelect.locator('option[value="custom"]')).toHaveCount(1);
  });

  test('pattern dropdown and breakpoint info display', async ({ page }) => {
    const patternSelect = page.getByTestId('pattern-select');
    const breakpointInfo = page.getByTestId('breakpoint-info');

    // Verify pattern dropdown is functional
    await expect(patternSelect).toBeVisible();
    await expect(patternSelect).toHaveValue('wave');

    // Verify breakpoint info is displayed
    await expect(breakpointInfo).toBeVisible();
    await expect(breakpointInfo).toContainText('values');

    // Verify can select different patterns
    await patternSelect.selectOption('bounce');
    await expect(patternSelect).toHaveValue('bounce');

    await patternSelect.selectOption('spiral');
    await expect(patternSelect).toHaveValue('spiral');
  });

  test('duration slider is functional', async ({ page }) => {
    const durationSlider = page.getByTestId('duration-slider');
    await expect(durationSlider).toHaveValue('3000');

    await durationSlider.fill('5000');
    await expect(durationSlider).toHaveValue('5000');
  });

  test('easing dropdown has sin selected by default', async ({ page }) => {
    const easingSelect = page.getByTestId('easing-select');
    await expect(easingSelect).toHaveValue('sin');
  });

  test('animate button is present', async ({ page }) => {
    const animateBtn = page.getByTestId('animate-button');
    await expect(animateBtn).toBeVisible();
    await expect(animateBtn).toContainText('Start Animation');
  });

  test('clicking animate without city shows alert', async ({ page }) => {
    await waitForMapLoad(page);

    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('click a city first');
      await dialog.accept();
    });

    const animateBtn = page.getByTestId('animate-button');
    await animateBtn.click();
  });
});
