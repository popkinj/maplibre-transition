import { test, expect } from '@playwright/test';
import { waitForMapLoad } from './fixtures/test-helpers';

test.describe('Multiple Properties Demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('multiple-properties.html');
  });

  test('page loads with map visible', async ({ page }) => {
    const mapContainer = page.getByTestId('map-container');
    await expect(mapContainer).toBeVisible();
    await waitForMapLoad(page);
  });

  test('displays page title', async ({ page }) => {
    await expect(page).toHaveTitle(/Multiple Properties/);
  });

  test('all property checkboxes are checked by default', async ({ page }) => {
    await expect(page.locator('#radius')).toBeChecked();
    await expect(page.locator('#color')).toBeChecked();
    await expect(page.locator('#opacity')).toBeChecked();
    await expect(page.locator('#stroke')).toBeChecked();
  });

  test('property checkboxes can be toggled', async ({ page }) => {
    const radiusCheckbox = page.locator('#radius');
    await radiusCheckbox.uncheck();
    await expect(radiusCheckbox).not.toBeChecked();

    await radiusCheckbox.check();
    await expect(radiusCheckbox).toBeChecked();
  });

  test('duration slider is functional', async ({ page }) => {
    const durationSlider = page.getByTestId('duration-slider');
    await expect(durationSlider).toHaveValue('1500');

    await durationSlider.fill('3000');
    await expect(durationSlider).toHaveValue('3000');
  });

  test('easing dropdown has cubic selected by default', async ({ page }) => {
    const easingSelect = page.getByTestId('easing-select');
    await expect(easingSelect).toHaveValue('cubic');
  });

  test('animate button is present', async ({ page }) => {
    const animateBtn = page.getByTestId('animate-button');
    await expect(animateBtn).toBeVisible();
    await expect(animateBtn).toContainText('Animate Selected Properties');
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

  test('all checkboxes can be unchecked', async ({ page }) => {
    // Uncheck all properties
    await page.locator('#radius').uncheck();
    await page.locator('#color').uncheck();
    await page.locator('#opacity').uncheck();
    await page.locator('#stroke').uncheck();

    // Verify all are unchecked
    await expect(page.locator('#radius')).not.toBeChecked();
    await expect(page.locator('#color')).not.toBeChecked();
    await expect(page.locator('#opacity')).not.toBeChecked();
    await expect(page.locator('#stroke')).not.toBeChecked();
  });
});
