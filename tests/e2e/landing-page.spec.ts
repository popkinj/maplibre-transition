import { test, expect } from '@playwright/test';

/**
 * The six pages are the contract. If a card is added or removed, this spec and
 * `vite.examples.config.js` must move together — a page that is not in the vite
 * input silently never deploys.
 */
const EXPECTED = [
  { title: 'Playground', href: /playground\.html/ },
  { title: 'Color & Breakpoints', href: /color\.html/ },
  { title: 'Hover Effects', href: /hover-effects\.html/ },
  { title: 'Chained Transitions', href: /chained-transitions\.html/ },
  { title: 'Stress', href: /stress\.html/ },
  { title: 'Rising City', href: /rising-city\.html/ }
];

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/maplibre-transition/i);
  });

  test('displays hero section with title', async ({ page }) => {
    const heroSection = page.locator('.hero h1');
    await expect(heroSection).toContainText('Smooth Transitions');
  });

  test('displays all 6 feature cards', async ({ page }) => {
    const featureCards = page.locator('.feature-card');
    await expect(featureCards).toHaveCount(6);
  });

  test('feature cards have correct titles', async ({ page }) => {
    for (const { title } of EXPECTED) {
      await expect(
        page.locator('.feature-card', { hasText: title })
      ).toBeVisible();
    }
  });

  test('every feature card links to a page that exists', async ({ page }) => {
    for (const { title, href } of EXPECTED) {
      const card = page.locator('.feature-card', { hasText: title });
      await expect(card).toHaveAttribute('href', href);
    }
  });

  test('every feature card prints the API line it teaches', async ({ page }) => {
    const apis = page.locator('.feature-card .card-api');
    await expect(apis).toHaveCount(6);
    for (const line of await apis.allTextContents()) {
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  test('feature card links navigate to correct pages', async ({ page }) => {
    await page.locator('.feature-card', { hasText: 'Playground' }).click();
    await expect(page).toHaveURL(/playground\.html/);
  });

  test('displays installation code block', async ({ page }) => {
    const codeBlock = page.locator('pre code', {
      hasText: 'npm install maplibre-transition'
    });
    await expect(codeBlock).toBeVisible();
  });

  test('quick example shows the current API', async ({ page }) => {
    const quick = page.locator('pre code', { hasText: 'MaplibreTransition.init' });
    await expect(quick).toBeVisible();
    const text = await quick.innerText();
    // `[null, target]` is the documented way to re-trigger mid-flight.
    expect(text).toContain('[null, 28]');
    expect(text).toContain('onComplete');
  });

  test('theme toggle is present and flips the theme', async ({ page }) => {
    const toggle = page.locator('[data-testid="theme-toggle"]');
    await expect(toggle).toBeVisible();

    const before = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    await toggle.click();
    const after = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(after).not.toBe(before);
    expect(['light', 'dark']).toContain(after);
  });

  test('hero map runs a live transition wavefront', async ({ page }) => {
    await page.waitForFunction(() => (window as any).__testHooks?.map, null, {
      timeout: 20_000
    });
    await page.evaluate(() => (window as any).__testHooks.waitForLoad());

    // The wave auto-starts on load (no reduced-motion in the default context).
    await page.waitForFunction(
      () => (window as any).__testHooks.getTransitionCount() > 0,
      null,
      { timeout: 20_000 }
    );

    // ...and it is actually writing feature state, not just sitting in the Set.
    await page.waitForFunction(
      () => {
        const s = (window as any).__testHooks.state(0);
        return s && typeof s['circle-radius'] === 'number';
      },
      null,
      { timeout: 20_000 }
    );
  });

  test('GitHub link is present', async ({ page }) => {
    const githubLink = page
      .locator('a[href*="github.com/popkinj/maplibre-transition"]')
      .first();
    await expect(githubLink).toBeVisible();
  });

  test('npm link is present', async ({ page }) => {
    const npmLink = page
      .locator('a[href*="npmjs.com/package/maplibre-transition"]')
      .first();
    await expect(npmLink).toBeVisible();
  });
});
