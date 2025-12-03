import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/MapLibre Transition/);
  });

  test('displays hero section with title', async ({ page }) => {
    const heroSection = page.locator('.hero h1');
    await expect(heroSection).toContainText('Smooth Transitions');
  });

  test('displays all 9 feature cards', async ({ page }) => {
    const featureCards = page.locator('.feature-card');
    await expect(featureCards).toHaveCount(9);
  });

  test('feature cards have correct titles', async ({ page }) => {
    const expectedTitles = [
      'Basic Transition',
      'Color Animation',
      'Color Cycling',
      'Easing Functions',
      'Multiple Properties',
      'Chained Transitions',
      'Hover Effects',
      'Multi-Breakpoint',
      'Vector Tiles'
    ];

    for (const title of expectedTitles) {
      await expect(page.locator('.feature-card', { hasText: title })).toBeVisible();
    }
  });

  test('feature card links navigate to correct pages', async ({ page }) => {
    // Click on Basic Transition card
    await page.locator('.feature-card', { hasText: 'Basic Transition' }).click();
    await expect(page).toHaveURL(/basic-transition\.html/);
  });

  test('displays installation code block', async ({ page }) => {
    const codeBlock = page.locator('pre code', { hasText: 'npm install maplibre-transition' });
    await expect(codeBlock).toBeVisible();
  });

  test('GitHub link is present', async ({ page }) => {
    const githubLink = page.locator('a[href*="github.com/popkinj/maplibre-transition"]').first();
    await expect(githubLink).toBeVisible();
  });

  test('npm link is present', async ({ page }) => {
    const npmLink = page.locator('a[href*="npmjs.com/package/maplibre-transition"]').first();
    await expect(npmLink).toBeVisible();
  });
});
