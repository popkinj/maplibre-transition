import { test, expect, Page } from "@playwright/test";
import { waitForMapLoad, waitForTransitionComplete } from "./fixtures/test-helpers";

/**
 * examples/color.html — "Color & Breakpoints".
 *
 * The page's organising idea is that the breakpoint editor IS the API: an ordered
 * list of 2–6 stops that is passed verbatim as `paint: { 'fill-color': [...] }`.
 * So the specs check three things the page cannot fake:
 *
 *   1. the editor's bounds and reordering,
 *   2. that the rendered call matches the editor state exactly,
 *   3. that clicking a real feature on the canvas actually drives the plugin —
 *      a transition enters the Set, drains, and the feature-state lands on the
 *      LAST stop of the array shown in the panel.
 *
 * Provinces use `promoteId: 'name'`, i.e. STRING feature ids. That path is exercised
 * by a real click, not a synthetic event.
 */

const PAGE = "color.html";

/** Collect console.error / uncaught errors for the lifetime of a test. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/**
 * Load the page and wait until both overlays are actually on screen.
 *
 * `map.loaded()` goes true as soon as the *basemap* style is up — the page adds its
 * own sources afterwards, from a fetch, inside its `load` handler. Waiting for the
 * layer object to exist is still not enough: a click is routed by
 * queryRenderedFeatures, so the features have to be RENDERED before a click can hit
 * one. Gate on that, or the clicking specs race the geojson worker.
 */
async function open(page: Page): Promise<void> {
  await page.goto(PAGE);
  await waitForMapLoad(page);
  await waitForScene(page);
}

/** The overlays are added, rendered, and their anchors are known. */
async function waitForScene(page: Page, timeout = 30000): Promise<void> {
  await page.waitForFunction(
    () => {
      const h = (window as any).__testHooks;
      const m = h?.map;
      if (!m?.getLayer("provinces-fill") || !m?.getLayer("cities-layer")) return false;
      if (!h.provinceNames || h.provinceNames().length === 0) return false;
      return (
        m.queryRenderedFeatures({ layers: ["provinces-fill"] }).length > 0 &&
        m.queryRenderedFeatures({ layers: ["cities-layer"] }).length > 0
      );
    },
    { timeout }
  );
}

/**
 * Click a feature on the canvas for real (no synthetic map events) and wait until
 * the plugin has actually picked it up. Retries the click: a miss means the map was
 * not ready, and a silent miss would turn every downstream assertion into a
 * confusing `undefined`.
 */
async function clickFeature(
  page: Page,
  kind: "province" | "city"
): Promise<string | number> {
  const target = await pickClickable(page, kind);

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.mouse.click(target.x, target.y);
    const started = await page
      .waitForFunction(() => (window.__testHooks?.getTransitionCount() ?? 0) > 0, null, {
        timeout: 3000,
      })
      .then(() => true)
      .catch(() => false);
    if (started) return target.id;
  }

  throw new Error(
    `clicking ${kind} ${String(target.id)} at (${target.x}, ${target.y}) never started a transition`
  );
}

/**
 * Find a feature whose anchor projects into the canvas, clear of the floating
 * instrument card, and returns its page coordinates for a REAL mouse click.
 */
async function pickClickable(
  page: Page,
  kind: "province" | "city"
): Promise<{ id: string | number; x: number; y: number }> {
  // NOTE: the shared Vite dev server broadcasts a full-reload to EVERY open page
  // whenever any examples/*.html is saved. That cannot happen in CI (nothing writes
  // during the run), but while several agents edit the examples tree it can drop a
  // page back to a fresh context mid-test. Re-gate on the scene before reading.
  await waitForScene(page);

  const mapBox = await page.getByTestId("map-container").boundingBox();
  const panel = await page.locator(".controls").boundingBox();
  expect(mapBox, "map container must be laid out").not.toBeNull();
  expect(panel, "instrument card must be laid out").not.toBeNull();

  const candidates = await page.evaluate((k) => {
    const h = (window as any).__testHooks;
    const ids: (string | number)[] =
      k === "province"
        ? h.provinceNames()
        : Array.from({ length: 13 }, (_, i) => i);
    return ids
      .map((id) => ({ id, ...(h.anchor(k, id) || {}) }))
      .filter((c: any) => typeof c.x === "number");
  }, kind);

  expect(candidates.length, "page must expose feature anchors").toBeGreaterThan(0);

  // Panel coordinates, relative to the map container.
  const panelLeft = panel!.x - mapBox!.x - 12;
  const panelTop = panel!.y - mapBox!.y - 12;

  const hit = candidates.find(
    (c: any) =>
      c.x > 24 &&
      c.y > 24 &&
      c.x < mapBox!.width - 24 &&
      c.y < mapBox!.height - 24 &&
      !(c.x > panelLeft && c.y > panelTop)
  );
  expect(hit, `no ${kind} projects clear of the instrument card`).toBeTruthy();

  return { id: hit.id, x: mapBox!.x + hit.x, y: mapBox!.y + hit.y };
}

/** Set an <input type="color"> without opening the OS color picker. */
async function setColorStop(page: Page, index: number, hex: string): Promise<void> {
  await page.getByTestId(`color-stop-${index}`).evaluate((el, v) => {
    (el as HTMLInputElement).value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, hex);
}

async function colorArray(page: Page): Promise<string[]> {
  return JSON.parse((await page.getByTestId("color-array").textContent()) ?? "[]");
}

async function numberArray(page: Page): Promise<number[]> {
  return JSON.parse((await page.getByTestId("number-array").textContent()) ?? "[]");
}

/** The editor's own state, straight off the page. */
async function editorStops(page: Page): Promise<{ color: string[]; number: number[] }> {
  return page.evaluate(() => (window as any).__testHooks.stops());
}

test.describe("Color & Breakpoints", () => {
  /**
   * Neutralise Vite's HMR client.
   *
   * The dev server broadcasts a full page reload to EVERY open client whenever any
   * `examples/*.html` is saved — not just the page that changed (verified). Nothing
   * writes to the tree during a CI run, so this is invisible there; but during
   * development a save in another example resets the page under test mid-assertion
   * and produces failures that look like product bugs (an editor back at its
   * defaults, a click that hits a map with no layers yet).
   *
   * These specs do not test HMR, and the page does not use `import.meta.hot`, so the
   * client is stubbed with an empty module. Everything else is the real dev server.
   */
  test.beforeEach(async ({ page }) => {
    await page.route("**/@vite/client", (route) =>
      route.fulfill({ contentType: "application/javascript", body: "export {}" })
    );
  });

  test("loads: title, kicker, both sources, both layers, no console errors", async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await open(page);

    await expect(page).toHaveTitle("Color & Breakpoints — maplibre-transition");
    await expect(page.getByTestId("kicker")).toContainText("fill-color");
    await expect(page.getByTestId("map-container")).toBeVisible();
    await expect(page.getByTestId("frame-rail")).toBeVisible();
    await expect(page.getByTestId("theme-toggle")).toBeVisible();

    const scene = await page.evaluate(() => {
      const m = (window as any).__testHooks.map;
      const provinces = m.getSource("provinces");
      const cities = m.getSource("cities");
      const style = m.getStyle();
      const ids = style.layers.map((l: any) => l.id);
      return {
        provinces: !!provinces,
        cities: !!cities,
        promoteId: (provinces as any)?.promoteId ?? (provinces as any)?._options?.promoteId,
        provinceCount: m.querySourceFeatures("provinces").length,
        // our layers must be appended last, after every basemap layer (CONTRACTS §5)
        tail: ids.slice(-2),
      };
    });

    expect(scene.provinces).toBe(true);
    expect(scene.cities).toBe(true);
    expect(scene.promoteId).toBe("name");
    expect(scene.provinceCount).toBeGreaterThan(0);
    expect(scene.tail).toEqual(["provinces-fill", "cities-layer"]);

    expect(errors).toEqual([]);
  });

  test("breakpoint editor: defaults, add up to 6, remove down to 2", async ({ page }) => {
    await open(page);

    // Default: the cartographic ramp, 4 stops.
    await expect(page.getByTestId("color-count")).toHaveText("4 stops");
    expect((await editorStops(page)).color).toHaveLength(4);
    await expect(page.getByTestId("color-stop-3")).toBeVisible();
    await expect(page.getByTestId("color-stop-4")).toHaveCount(0);

    // Add to the ceiling.
    await page.getByTestId("color-add").click();
    await expect(page.getByTestId("color-count")).toHaveText("5 stops");
    await page.getByTestId("color-add").click();
    await expect(page.getByTestId("color-count")).toHaveText("6 stops");
    await expect(page.getByTestId("color-add")).toBeDisabled();
    expect(await colorArray(page)).toHaveLength(6);

    // Remove down to the floor.
    for (let i = 0; i < 4; i++) {
      await page.getByTestId("color-remove-0").click();
    }
    await expect(page.getByTestId("color-count")).toHaveText("2 stops");
    await expect(page.getByTestId("color-remove-0")).toBeDisabled();
    await expect(page.getByTestId("color-remove-1")).toBeDisabled();
    await expect(page.getByTestId("color-add")).toBeEnabled();
    expect(await colorArray(page)).toHaveLength(2);

    // The numeric editor is the same component, same bounds.
    await expect(page.getByTestId("number-count")).toHaveText("4 stops");
    await page.getByTestId("number-add").click();
    await page.getByTestId("number-add").click();
    await expect(page.getByTestId("number-add")).toBeDisabled();
    expect(await numberArray(page)).toHaveLength(6);
    for (let i = 0; i < 4; i++) {
      await page.getByTestId("number-remove-0").click();
    }
    await expect(page.getByTestId("number-remove-0")).toBeDisabled();
    expect(await numberArray(page)).toHaveLength(2);
  });

  test("reordering a stop reorders the array", async ({ page }) => {
    await open(page);

    const before = await colorArray(page);
    await page.getByTestId("color-down-0").click(); // swap 0 and 1

    const after = await colorArray(page);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
    expect(after.slice(2)).toEqual(before.slice(2));

    // The inputs themselves moved, not just the printed array.
    await expect(page.getByTestId("color-stop-0")).toHaveValue(before[1]);
    await expect(page.getByTestId("color-stop-1")).toHaveValue(before[0]);

    // First row cannot move up; last row cannot move down.
    await expect(page.getByTestId("color-up-0")).toBeDisabled();
    await expect(page.getByTestId(`color-down-${after.length - 1}`)).toBeDisabled();

    // ...and back.
    await page.getByTestId("color-up-1").click();
    expect(await colorArray(page)).toEqual(before);
  });

  test("presets replace both arrays and light the chip", async ({ page }) => {
    await open(page);

    const initial = await colorArray(page);

    await page.getByTestId("preset-ocean").click();
    await expect(page.getByTestId("preset-ocean")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("preset-name")).toHaveText("ocean");

    const ocean = await colorArray(page);
    expect(ocean).not.toEqual(initial);
    expect(ocean.length).toBeGreaterThanOrEqual(2);
    expect(ocean.length).toBeLessThanOrEqual(6);
    expect(ocean).toEqual((await editorStops(page)).color);
    await expect(page.getByTestId("color-count")).toHaveText(`${ocean.length} stops`);

    // Only one preset is ever active.
    await page.getByTestId("preset-pulse").click();
    await expect(page.getByTestId("preset-ocean")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("preset-pulse")).toHaveAttribute("aria-pressed", "true");

    const pulse = await colorArray(page);
    expect(pulse).not.toEqual(ocean);
    expect(await numberArray(page)).toEqual((await editorStops(page)).number);

    // Editing a stop by hand takes the page off-preset.
    await setColorStop(page, 0, "#123456");
    await expect(page.getByTestId("preset-pulse")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("preset-name")).toHaveText("—");
  });

  test("the rendered paint array is exactly the editor state", async ({ page }) => {
    await open(page);

    await setColorStop(page, 0, "#ff00aa");
    await setColorStop(page, 1, "#00ff88");
    await page.getByTestId("number-stop-1").fill("42");

    const stops = await editorStops(page);
    expect(stops.color[0]).toBe("#ff00aa");
    expect(stops.color[1]).toBe("#00ff88");

    // What the panel prints is what the page passes to map.transition().
    expect(await colorArray(page)).toEqual(stops.color);
    expect(await numberArray(page)).toEqual(stops.number);
    expect(stops.number[1]).toBe(42);

    // Every color input agrees with the array, in order.
    for (let i = 0; i < stops.color.length; i++) {
      await expect(page.getByTestId(`color-stop-${i}`)).toHaveValue(stops.color[i]);
      await expect(page.getByTestId(`color-hex-${i}`)).toHaveText(stops.color[i]);
    }

    // The ramp preview interpolates across every stop.
    const ramp = await page.getByTestId("ramp-preview").evaluate(
      (el) => getComputedStyle(el).backgroundImage
    );
    expect(ramp).toContain("linear-gradient");
    expect(ramp.match(/rgb\(/g) ?? []).toHaveLength(stops.color.length);
  });

  test("clicking a province (string id) runs fill-color through the ramp and drains", async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await open(page);

    await page.getByTestId("preset-traffic").click();
    const stops = await colorArray(page);
    const last = stops[stops.length - 1];

    // A real canvas click enters a transition into the Set...
    const id = await clickFeature(page, "province");
    await expect(page.getByTestId("last-target")).toHaveText(String(id));

    // ...the plugin took ownership of the paint property...
    const paint = await page.evaluate(() =>
      window.__testHooks!.map.getPaintProperty("provinces-fill", "fill-color")
    );
    expect(paint).toEqual(["coalesce", ["feature-state", "fill-color"], expect.anything()]);

    // ...and it drains, landing exactly on the LAST stop of the editor's array.
    await waitForTransitionComplete(page, 15000);

    const state = await page.evaluate(
      (fid) => window.__testHooks!.map.getFeatureState({ source: "provinces", id: fid }),
      id
    );
    expect(hexOf(state["fill-color"])).toBe(last.toLowerCase());

    // onComplete fired, and persisted the settled color.
    await expect(page.getByTestId("settled-count")).toHaveText("1");
    await expect(page.getByTestId("painted-count")).toHaveText("1");
    await expect(page.getByTestId("active-count")).toHaveText("0");

    expect(errors).toEqual([]);
  });

  test("clicking a capital runs circle-color and circle-radius together", async ({
    page,
  }) => {
    await open(page);

    await page.getByTestId("preset-sunset").click();
    const colors = await colorArray(page);
    const radii = await numberArray(page);
    expect(radii.length).toBeGreaterThan(2); // a real multi-breakpoint pattern

    const id = await clickFeature(page, "city");

    // One feature, two properties → one entry in the Set.
    expect(await page.evaluate(() => window.__testHooks!.getTransitionCount())).toBe(1);

    await waitForTransitionComplete(page, 15000);

    const state = await page.evaluate(
      (fid) => window.__testHooks!.map.getFeatureState({ source: "cities", id: fid }),
      id
    );

    expect(state["circle-radius"]).toBeCloseTo(radii[radii.length - 1], 5);
    expect(hexOf(state["circle-color"])).toBe(colors[colors.length - 1].toLowerCase());
  });

  test("reset returns everything to the theme's idle color", async ({ page }) => {
    await open(page);

    const id = await clickFeature(page, "province");
    await waitForTransitionComplete(page, 15000);
    await expect(page.getByTestId("painted-count")).toHaveText("1");

    const painted = await page.evaluate(
      (fid) =>
        window.__testHooks!.map.getFeatureState({ source: "provinces", id: fid })["fill-color"],
      id
    );

    await page.getByTestId("reset-btn").click();
    await waitForTransitionComplete(page, 15000);

    const idle = await page.evaluate(
      (fid) =>
        window.__testHooks!.map.getFeatureState({ source: "provinces", id: fid })["fill-color"],
      id
    );

    expect(idle).not.toBe(painted);
    await expect(page.getByTestId("painted-count")).toHaveText("0");
  });

  test("theme swap: overlays survive, painted features keep their color", async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await open(page);

    const id = await clickFeature(page, "province");
    await waitForTransitionComplete(page, 15000);

    const before = await page.evaluate(
      (fid) =>
        window.__testHooks!.map.getFeatureState({ source: "provinces", id: fid })["fill-color"],
      id
    );

    // The basemap's own background color is the tell: if it changes, setStyle ran.
    // Null-safe: the diff reorders ~54 basemap layers, so `background` is briefly
    // absent while the swap is applied.
    const readBg = () =>
      page.evaluate(() => {
        const m = window.__testHooks!.map;
        if (!m.getLayer("background")) return null;
        return JSON.stringify(m.getPaintProperty("background", "background-color"));
      });

    const bgBefore = await readBg();
    expect(bgBefore).not.toBeNull();

    const themeBefore = await page.locator("html").getAttribute("data-theme");
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", themeBefore!);

    // applyBasemap() is async (it fetches the other CARTO style). Wait for it to land.
    await expect
      .poll(async () => {
        const bg = await readBg();
        return bg !== null && bg !== bgBefore;
      }, { timeout: 20000 })
      .toBe(true);

    // Unpainted features follow the theme — recolored through map.transition(),
    // never setPaintProperty(). Wait for that staggered sweep to finish.
    await expect
      .poll(
        () =>
          page.evaluate((fid) => {
            const m = window.__testHooks!.map;
            const other = (window as any).__testHooks
              .provinceNames()
              .find((n: string) => n !== fid);
            return !!m.getFeatureState({ source: "provinces", id: other })["fill-color"];
          }, id),
        { timeout: 20000 }
      )
      .toBe(true);

    await waitForTransitionComplete(page, 20000);

    const after = await page.evaluate(
      (fid) => {
        const m = window.__testHooks!.map;
        const style = m.getStyle();
        return {
          provinces: !!m.getSource("provinces"),
          cities: !!m.getSource("cities"),
          tail: style.layers.slice(-2).map((l: any) => l.id),
          // the plugin's coalesce expression must survive the setStyle diff
          paint: m.getPaintProperty("provinces-fill", "fill-color"),
          state: m.getFeatureState({ source: "provinces", id: fid })["fill-color"],
        };
      },
      id
    );

    expect(after.provinces).toBe(true);
    expect(after.cities).toBe(true);
    expect(after.tail).toEqual(["provinces-fill", "cities-layer"]);
    expect(after.paint[0]).toBe("coalesce");
    // The user's color is the user's color: a theme flip must not repaint it.
    expect(after.state).toBe(before);

    expect(errors).toEqual([]);
  });
});

/** "rgb(244, 112, 58)" | "#f4703a" -> "#f4703a" */
function hexOf(value: string): string {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!m) return value.toLowerCase();
  return (
    "#" +
    [m[1], m[2], m[3]]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
  );
}
