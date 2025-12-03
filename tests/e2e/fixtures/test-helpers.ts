import { Page, expect } from '@playwright/test';

declare global {
  interface Window {
    __testHooks?: {
      map: any;
      getTransitionCount: () => number;
      waitForLoad: () => Promise<void>;
    };
  }
}

/**
 * Wait for the MapLibre map to fully load
 */
export async function waitForMapLoad(page: Page, timeout = 30000): Promise<void> {
  await page.waitForFunction(
    () => window.__testHooks?.map?.loaded() === true,
    { timeout }
  );
}

/**
 * Get the current number of active transitions
 */
export async function getTransitionCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__testHooks?.getTransitionCount() ?? 0);
}

/**
 * Wait for all transitions to complete
 */
export async function waitForTransitionComplete(page: Page, timeout = 10000): Promise<void> {
  await page.waitForFunction(
    () => window.__testHooks?.getTransitionCount() === 0,
    { timeout }
  );
}

/**
 * Wait for at least one transition to be active
 */
export async function waitForTransitionStart(page: Page, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    () => (window.__testHooks?.getTransitionCount() ?? 0) > 0,
    { timeout }
  );
}

/**
 * Set a slider value by test ID
 */
export async function setSliderValue(
  page: Page,
  testId: string,
  value: number
): Promise<void> {
  const slider = page.getByTestId(testId);
  await slider.fill(String(value));
}

/**
 * Select an option from a dropdown by test ID
 */
export async function selectOption(
  page: Page,
  testId: string,
  value: string
): Promise<void> {
  const select = page.getByTestId(testId);
  await select.selectOption(value);
}

/**
 * Click on the map at specific coordinates (relative to map container)
 */
export async function clickOnMap(
  page: Page,
  x: number,
  y: number
): Promise<void> {
  const mapContainer = page.getByTestId('map-container');
  await mapContainer.click({ position: { x, y } });
}

/**
 * Hover over the map at specific coordinates
 */
export async function hoverOnMap(
  page: Page,
  x: number,
  y: number
): Promise<void> {
  const mapContainer = page.getByTestId('map-container');
  await mapContainer.hover({ position: { x, y } });
}

/**
 * Move mouse away from the map
 */
export async function moveAwayFromMap(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
}

/**
 * Get a feature's center coordinates on the map canvas
 * This requires the map to expose a method to get feature coordinates
 */
export async function getFeatureCanvasPosition(
  page: Page,
  featureId: string | number
): Promise<{ x: number; y: number } | null> {
  return page.evaluate((id) => {
    const map = window.__testHooks?.map;
    if (!map) return null;

    // Query for the feature
    const features = map.querySourceFeatures('cities', {
      filter: ['==', ['id'], id]
    });

    if (features.length === 0) return null;

    const feature = features[0];
    const coords = feature.geometry.coordinates;
    const point = map.project(coords);

    return { x: point.x, y: point.y };
  }, featureId);
}

/**
 * Verify that a page has loaded successfully with map
 */
export async function verifyPageLoaded(page: Page): Promise<void> {
  // Wait for map container to be visible
  await expect(page.getByTestId('map-container')).toBeVisible();

  // Wait for map to load
  await waitForMapLoad(page);
}

/**
 * Get the current value of a paint property for a layer
 */
export async function getLayerPaintProperty(
  page: Page,
  layerId: string,
  property: string
): Promise<any> {
  return page.evaluate(
    ({ layerId, property }) => {
      const map = window.__testHooks?.map;
      if (!map) return null;
      return map.getPaintProperty(layerId, property);
    },
    { layerId, property }
  );
}
