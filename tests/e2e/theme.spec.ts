import { test, expect, Page } from '@playwright/test';

/**
 * Theme + basemap-swap infrastructure (examples/scripts/{theme,chrome,basemap,perf}.js).
 *
 * These specs drive a self-contained probe page that is *route-fulfilled* from this
 * file rather than a demo page. That is deliberate:
 *
 *   - the probe is served from the Vite origin, so `./scripts/*.js` and `./styles/shared.css`
 *     are the REAL modules under test (no mocks, no bundling);
 *   - it does not depend on any demo page's markup, so a page redesign cannot silently
 *     break — or silently pass — the theming contract.
 *
 * The "feature state survives a mid-flight restyle" assertion lives here because the
 * design-system agent must prove the setStyle-diff trick works at all. The *page-level*
 * version of that test (5000 buildings mid-rise) belongs to rising-city.spec.ts.
 */

const PROBE_PATH = 'theme-probe.html';

// dist/ lives outside the Vite root (examples/), so Vite exposes it under /@fs.
const PLUGIN_URL = `./@fs${process.cwd()}/dist/index.esm.js`;

const PROBE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Theme Probe — maplibre-transition</title>
  <script>
    (function(){var t=null;try{t=localStorage.getItem("mlt-theme")}catch(e){}
    if(t!=="light"&&t!=="dark"){t=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}
    var r=document.documentElement;r.setAttribute("data-theme",t);r.style.colorScheme=t})();
  </script>
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css" />
  <link rel="stylesheet" href="./styles/shared.css" />
  <script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
</head>
<body>
  <main>
    <div class="example-container">
      <div class="map-container">
        <div id="map" data-testid="map-container"></div>
        <div class="controls">
          <h2>Theme Probe</h2>
          <p>Exercises <code class="paint-prop">circle-radius</code> across a basemap swap.</p>
          <div class="control-group">
            <label><span class="paint-prop">circle-radius</span>
              <span class="value-display" data-testid="radius-readout">8</span></label>
            <button data-testid="kick-btn">Kick</button>
          </div>
        </div>
      </div>
    </div>
  </main>

  <script type="module">
    import MaplibreTransition from '${PLUGIN_URL}';
    import { initialTheme, setTheme } from './scripts/theme.js';
    import { mountChrome } from './scripts/chrome.js';
    import { loadBasemap, applyBasemap, BASE_LAYER_IDS, BASE_SOURCE_IDS } from './scripts/basemap.js';
    import { frameMeter, mountFrameRail } from './scripts/perf.js';

    mountChrome({ title: 'Theme Probe', kicker: 'map.transition(f, { paint })' });

    const theme = initialTheme();
    const map = new maplibregl.Map({
      container: 'map',
      style: await loadBasemap(theme),
      center: [-95, 55],
      zoom: 3,
      attributionControl: false,
    });

    MaplibreTransition.init(map);

    const meter = frameMeter();
    mountFrameRail(document.querySelector('.frame-rail'), meter);

    const cities = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', id: 0, properties: {}, geometry: { type: 'Point', coordinates: [-75.7, 45.4] } },
        { type: 'Feature', id: 1, properties: {}, geometry: { type: 'Point', coordinates: [-79.4, 43.7] } },
        { type: 'Feature', id: 2, properties: {}, geometry: { type: 'Point', coordinates: [-123.1, 49.3] } },
      ],
    };

    const feature = (i) => ({
      id: i,
      source: 'cities',
      sourceLayer: undefined,
      layer: { id: 'cities-layer' },
    });

    window.__basemapSwaps = 0;
    window.__errors = [];
    const realError = console.error.bind(console);
    console.error = (...a) => {
      const line = a.map(String).join(' ');
      if (line.includes('[basemap]')) window.__errors.push(line);
      realError(...a);
    };

    window.addEventListener('themechange', async (e) => {
      await applyBasemap(map, e.detail.theme);
      window.__basemapSwaps++;
    });

    map.on('load', () => {
      map.addSource('cities', { type: 'geojson', data: cities });
      map.addLayer({
        id: 'cities-layer',
        type: 'circle',
        source: 'cities',
        paint: {
          'circle-radius': 8,
          'circle-color': '#26547c',
          'circle-opacity': 0.9,
        },
      });
    });

    const kick = (duration = 4000) =>
      map.transition(feature(0), {
        duration,
        ease: 'linear',
        paint: { 'circle-radius': [null, 40] },
      });

    document.querySelector('[data-testid="kick-btn"]').addEventListener('click', () => kick());

    window.__testHooks = {
      map,
      meter,
      kick,
      setTheme,
      baseLayerIds: () => [...BASE_LAYER_IDS],
      baseSourceIds: () => [...BASE_SOURCE_IDS],
      radius: () => map.getFeatureState({ source: 'cities', id: 0 })['circle-radius'],
      getTransitionCount: () => map.transition.transitions.size,
      waitForLoad: () => new Promise((r) => (map.loaded() ? r() : map.once('load', r))),
    };
  </script>
</body>
</html>`;

async function probeReady(page: Page) {
  await page.waitForFunction(() => (window as any).__testHooks?.map?.isStyleLoaded?.() === true, {
    timeout: 60000,
  });
  await page.waitForFunction(() => !!(window as any).__testHooks.map.getSource('cities'), {
    timeout: 60000,
  });
}

async function gotoProbe(page: Page) {
  await page.route(`**/${PROBE_PATH}`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: PROBE_HTML })
  );
  await page.goto(PROBE_PATH);
  await probeReady(page);
}

const bgColor = (page: Page) =>
  page.evaluate(() =>
    (window as any).__testHooks.map.getPaintProperty('background', 'background-color')
  );

// ---------------------------------------------------------------------------
// 1. prefers-color-scheme is the default
// ---------------------------------------------------------------------------

test.describe('theme — OS preference', () => {
  test.describe('dark OS', () => {
    test.use({ colorScheme: 'dark' });

    test('defaults to dark with no stored preference', async ({ page }) => {
      await gotoProbe(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect(await page.evaluate(() => localStorage.getItem('mlt-theme'))).toBeNull();
      expect(await bgColor(page)).toBe('#0e0e0e'); // Dark Matter
    });
  });

  test.describe('light OS', () => {
    test.use({ colorScheme: 'light' });

    test('defaults to light with no stored preference', async ({ page }) => {
      await gotoProbe(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      expect(await bgColor(page)).toBe('#fafaf8'); // Positron
    });
  });
});

// ---------------------------------------------------------------------------
// 2. the toggle
// ---------------------------------------------------------------------------

test.describe('theme — toggle', () => {
  test.use({ colorScheme: 'light' });

  test('flips data-theme, aria-pressed, and the basemap', async ({ page }) => {
    await gotoProbe(page);

    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await bgColor(page)).toBe('#fafaf8');

    await toggle.click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.waitForFunction(() => (window as any).__basemapSwaps >= 1);
    expect(await bgColor(page)).toBe('#0e0e0e');

    await toggle.click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.waitForFunction(() => (window as any).__basemapSwaps >= 2);
    expect(await bgColor(page)).toBe('#fafaf8');
  });

  test('is keyboard operable', async ({ page }) => {
    await gotoProbe(page);
    const toggle = page.getByTestId('theme-toggle');
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('persists across a reload', async ({ page }) => {
    await gotoProbe(page);
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('mlt-theme'))).toBe('dark');

    await page.reload();
    // The inline head snippet must have applied it before first paint.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await probeReady(page);
    await expect(page.getByTestId('theme-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect(await bgColor(page)).toBe('#0e0e0e'); // dark basemap chosen at construction
  });
});

// ---------------------------------------------------------------------------
// 3. THE LOAD-BEARING ONE: the swap must not destroy page state
// ---------------------------------------------------------------------------

test.describe('basemap swap — diff path', () => {
  test.use({ colorScheme: 'light' });

  test('captures the 93 base layer ids and the single carto source', async ({ page }) => {
    await gotoProbe(page);
    const layers = await page.evaluate(() => (window as any).__testHooks.baseLayerIds());
    const sources = await page.evaluate(() => (window as any).__testHooks.baseSourceIds());
    expect(layers.length).toBe(93);
    expect(sources).toEqual(['carto']);
    expect(layers).not.toContain('cities-layer');
  });

  test('preserves sources, coalesce paint, feature state and in-flight transitions', async ({
    page,
  }) => {
    await gotoProbe(page);

    // Start a slow transition so we are guaranteed to swap mid-flight.
    await page.evaluate(() => (window as any).__testHooks.kick(5000));
    await page.waitForFunction(() => (window as any).__testHooks.radius() > 10, { timeout: 5000 });

    const before = await page.evaluate(() => ({
      radius: (window as any).__testHooks.radius(),
      transitions: (window as any).__testHooks.getTransitionCount(),
      paint: (window as any).__testHooks.map.getPaintProperty('cities-layer', 'circle-radius'),
    }));
    expect(before.transitions).toBe(1);
    expect(before.paint[0]).toBe('coalesce');
    expect(before.radius).toBeGreaterThan(10);
    expect(before.radius).toBeLessThan(40);

    // Swap the basemap under it.
    await page.getByTestId('theme-toggle').click();
    await page.waitForFunction(() => (window as any).__basemapSwaps >= 1, { timeout: 30000 });

    const after = await page.evaluate(() => {
      const m = (window as any).__testHooks.map;
      return {
        bg: m.getPaintProperty('background', 'background-color'),
        hasSource: !!m.getSource('cities'),
        hasLayer: !!m.getLayer('cities-layer'),
        paint: m.getPaintProperty('cities-layer', 'circle-radius'),
        state: m.getFeatureState({ source: 'cities', id: 0 }),
        radius: (window as any).__testHooks.radius(),
        transitions: (window as any).__testHooks.getTransitionCount(),
        errors: (window as any).__errors,
        // our layer must still sit above every basemap layer
        lastLayerId: m.getStyle().layers[m.getStyle().layers.length - 1].id,
      };
    });

    // The basemap really did change …
    expect(after.bg).toBe('#0e0e0e');
    // … and nothing of ours was touched.
    expect(after.errors).toEqual([]);
    expect(after.hasSource).toBe(true);
    expect(after.hasLayer).toBe(true);
    expect(after.paint).toEqual(['coalesce', ['feature-state', 'circle-radius'], 8]);
    expect(after.state['circle-radius']).toBeGreaterThan(before.radius - 0.001);
    expect(after.transitions).toBe(1);
    expect(after.lastLayerId).toBe('cities-layer');

    // And the transition runs straight through the swap to its target.
    await page.waitForFunction(() => (window as any).__testHooks.getTransitionCount() === 0, {
      timeout: 15000,
    });
    expect(await page.evaluate(() => (window as any).__testHooks.radius())).toBeCloseTo(40, 1);
  });

  test('does not refetch basemap tiles on swap', async ({ page }) => {
    const tileRequests: string[] = [];
    page.on('request', (r) => {
      if (/tiles\.basemaps\.cartocdn\.com\/.*\.(mvt|pbf)/.test(r.url())) tileRequests.push(r.url());
    });

    await gotoProbe(page);
    await page.waitForTimeout(1500); // let the initial tiles settle
    const beforeCount = tileRequests.length;

    await page.getByTestId('theme-toggle').click();
    await page.waitForFunction(() => (window as any).__basemapSwaps >= 1, { timeout: 30000 });
    await page.waitForTimeout(1500);

    // Vector tiles are geometry, not style: the same source spec must be reused.
    expect(tileRequests.length).toBe(beforeCount);
  });
});

// ---------------------------------------------------------------------------
// 4. the frame rail
// ---------------------------------------------------------------------------

test.describe('frame rail', () => {
  test('mounts, fills its ring buffer, and reports fps', async ({ page }) => {
    await gotoProbe(page);

    const rail = page.getByTestId('frame-rail');
    await expect(rail).toBeVisible();

    await page.waitForFunction(() => (window as any).__testHooks.meter.frames().length > 20, {
      timeout: 10000,
    });

    const stats = await page.evaluate(() => {
      const m = (window as any).__testHooks.meter;
      return { n: m.frames().length, fps: m.fps(), p95: m.p95() };
    });
    expect(stats.n).toBeGreaterThan(20);
    expect(stats.n).toBeLessThanOrEqual(120);
    expect(stats.fps).toBeGreaterThan(0);
    expect(stats.p95).toBeGreaterThan(0);

    await expect(page.getByTestId('rail-fps')).not.toHaveText('--');

    // The canvas is actually painted (non-empty pixel buffer).
    const painted = await page.evaluate(() => {
      const c = document.querySelector('.frame-rail') as HTMLCanvasElement;
      const ctx = c.getContext('2d')!;
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
      return false;
    });
    expect(painted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. THE MONEY TEST: swap the basemap while a real city is mid-rise.
//
// The probe above proves the setStyle-diff trick on ONE feature and ONE channel.
// This proves it on the real page, at scale: thousands of buildings, two channels
// each (fill-extrusion-height + fill-extrusion-color), all in flight, while the
// whole style is torn down and rebuilt underneath them.
//
// If this fails, the theming architecture is wrong — nothing else on the branch
// matters until it is fixed.
// ---------------------------------------------------------------------------

test.describe('basemap swap — mid-rise, on the real page', () => {
  test.use({ colorScheme: 'light' });
  // 5000 fill-extrusions on a software rasterizer (CI has no GPU) is slow to load.
  test.describe.configure({ timeout: 120_000 });

  test('a city mid-rise survives a full basemap swap', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e.message)));

    // Suppress the page's auto-grow/auto-orbit so WE own the timeline.
    // page.emulateMedia(), not test.use({ reducedMotion }) — the fixture option is
    // silently ignored under this runner (see rising-city.spec.ts).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('rising-city.html');

    await page.waitForFunction(() => (window as any).__testHooks?.map?.loaded() === true, {
      timeout: 60000,
    });
    await page.waitForFunction(
      () => !!(window as any).__testHooks.map.getLayer('buildings-layer'),
      { timeout: 60000 }
    );

    // Warm basemap.js's dark-style cache through a dynamic import of the very same
    // module instance the page uses (ES modules are keyed by URL). Without this the
    // CARTO fetch would sit inside the mid-flight window and could outlast the
    // transition on a slow network — the test would then pass or fail on CDN
    // latency rather than on the thing it is supposed to be measuring.
    await page.evaluate(async () => {
      const m: any = await import('./scripts/basemap.js');
      await m.loadBasemap('dark');
    });

    // 500 buildings x 2 channels, all mid-flight, for a 20s linear rise.
    //
    // 20s is deliberately far longer than the slider's 3000ms ceiling. Rebuilding the
    // style around a 1.8MB inline GeoJSON source (getStyle serialises it, diffSources
    // deepEquals it) is genuinely slow on a software rasterizer, and under parallel
    // CI load the whole swap can outlast a 3s transition — which would silently turn
    // every assertion below into a vacuous at-rest check that passes even if the swap
    // wiped the feature state and the plugin simply re-ran to completion afterwards.
    // Linear also never overshoots, so `< target` is exact.
    await page.getByTestId('buildings-slider').fill('0'); // 500 buildings
    const target = await page.evaluate(() => (window as any).__testHooks.targetHeight(0));
    expect(target).toBeGreaterThan(0);

    await page.evaluate(() =>
      (window as any).__testHooks.growWith({ duration: 20000, stagger: 0, effect: 'linear' })
    );
    await page.waitForFunction(
      () => ((window as any).__testHooks.stateOf(0)['fill-extrusion-height'] ?? 0) > 0,
      { timeout: 30000 }
    );

    const before = await page.evaluate(() => {
      const h: any = window.__testHooks;
      return {
        transitions: h.getTransitionCount(),
        height: h.stateOf(0)['fill-extrusion-height'],
        bg: h.map.getPaintProperty('background', 'background-color'),
      };
    });
    expect(before.bg).toBe('#fafaf8'); // Positron
    expect(before.transitions).toBe(500);
    expect(before.height).toBeGreaterThan(0);
    expect(before.height).toBeLessThan(target);

    // ---- rip the whole style out from under 500 mid-flight buildings ----
    await page.getByTestId('theme-toggle').click();
    await page.waitForFunction(() => (window as any).__testHooks.basemapSwaps >= 1, {
      timeout: 30000,
    });
    await page.waitForTimeout(400);

    const after = await page.evaluate(() => {
      const h: any = window.__testHooks;
      const m = h.map;
      const style = m.getStyle();
      return {
        hasSource: !!m.getSource('buildings'),
        hasLayer: !!m.getLayer('buildings-layer'),
        paintHeight: m.getPaintProperty('buildings-layer', 'fill-extrusion-height'),
        paintColor: m.getPaintProperty('buildings-layer', 'fill-extrusion-color'),
        state0: h.stateOf(0),
        transitions: h.getTransitionCount(),
        bg: m.getPaintProperty('background', 'background-color'),
        lastLayerId: style.layers[style.layers.length - 1].id,
        filter: m.getFilter('buildings-layer'),
      };
    });

    // The basemap really did swap …
    expect(after.bg).toBe('#0e0e0e'); // Dark Matter

    // … and nothing of ours was touched.
    expect(after.hasSource).toBe(true);
    expect(after.hasLayer).toBe(true);
    expect(after.paintHeight[0]).toBe('coalesce');
    expect(after.paintHeight).toEqual([
      'coalesce',
      ['feature-state', 'fill-extrusion-height'],
      0,
    ]);
    expect(after.paintColor[0]).toBe('coalesce');
    expect(after.filter).toEqual(['<', ['id'], 500]);
    expect(after.lastLayerId).toBe('buildings-layer'); // still above every basemap layer

    // The feature state survived the restyle — mid-rise, not reset, not finished.
    const h0 = after.state0['fill-extrusion-height'];
    expect(h0).toBeGreaterThan(0);
    expect(h0).toBeLessThan(target);
    expect(h0).toBeGreaterThanOrEqual(before.height); // it kept climbing across the swap
    expect(after.state0['fill-extrusion-color']).toBeTruthy();

    // The transitions never died.
    expect(after.transitions).toBeGreaterThan(0);
    expect(after.transitions).toBe(500);

    // …and they run through to their targets, exactly.
    await page.waitForFunction(() => (window as any).__testHooks.getTransitionCount() === 0, {
      timeout: 30000,
    });
    const final = await page.evaluate(() => {
      const h: any = window.__testHooks;
      return [0, 17, 499].map((id) => ({
        id,
        got: h.stateOf(id)['fill-extrusion-height'],
        want: h.targetHeight(id),
      }));
    });
    for (const f of final) expect(f.got).toBe(f.want);

    // A diff that fell back to a full restyle logs '[basemap] …'; MapLibre logs
    // 'Unable to compute style diff'. Neither may appear.
    const relevant = errors.filter((t) =>
      /feature-state|expression|Unable to compute style diff|\[basemap\]/i.test(t)
    );
    expect(relevant).toEqual([]);
  });
});
