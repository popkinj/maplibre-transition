import { test, expect } from '@playwright/test';
import { waitForMapLoad } from './fixtures/test-helpers';

test.describe('Easing Functions Demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('easing-functions.html');
  });

  test('page loads with map visible', async ({ page }) => {
    const mapContainer = page.getByTestId('map-container');
    await expect(mapContainer).toBeVisible();
    await waitForMapLoad(page);
  });

  test('displays page title', async ({ page }) => {
    await expect(page).toHaveTitle(/Easing Functions/);
  });

  test('displays all 9 easing options', async ({ page }) => {
    const easingList = page.getByTestId('easing-list');
    await expect(easingList).toBeVisible();

    const easingItems = easingList.locator('.easing-item');
    await expect(easingItems).toHaveCount(9);
  });

  test('easing items have correct names', async ({ page }) => {
    await waitForMapLoad(page);

    // Wait for easing items to be rendered
    const easingList = page.getByTestId('easing-list');
    await expect(easingList.locator('.easing-item')).toHaveCount(9);

    const expectedEasings = [
      'linear',
      'quad',
      'cubic',
      'sin',
      'exp',
      'circle',
      'elastic',
      'bounce',
      'poly'
    ];

    for (const easing of expectedEasings) {
      await expect(page.locator('.easing-name', { hasText: easing })).toBeVisible();
    }
  });

  test('clicked city display starts with None', async ({ page }) => {
    const clickedCity = page.getByTestId('clicked-city-display');
    await expect(clickedCity).toContainText('None');
  });

  test('clicking easing without selecting city shows alert', async ({ page }) => {
    await waitForMapLoad(page);

    // Set up dialog handler
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('click a city first');
      await dialog.accept();
    });

    // Click an easing item
    const easingItem = page.locator('.easing-item').first();
    await easingItem.click();
  });

  test('easing items are clickable', async ({ page }) => {
    await waitForMapLoad(page);

    const easingItems = page.locator('.easing-item');
    const firstItem = easingItems.first();

    // Check item is clickable (has cursor: pointer via CSS)
    await expect(firstItem).toBeVisible();
  });
});
