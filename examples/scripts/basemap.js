/**
 * basemap.js — theme-aware CARTO basemap that swaps WITHOUT destroying anything.
 *
 * Contract (CONTRACTS.md §3, §5):
 *   BASE_SOURCE_IDS: Set<string>
 *   BASE_LAYER_IDS:  Set<string>
 *   loadBasemap(theme): Promise<StyleSpecification>
 *   applyBasemap(map, theme): Promise<void>
 *   SKY, LIGHT: per-theme specs (already baked into the style by loadBasemap)
 *
 * WHY THIS WORKS
 * --------------
 * map.setStyle() normally tears down every source, layer and feature state — which
 * would wipe the plugin's ["coalesce", ["feature-state", …], fallback] paint
 * expressions and kill in-flight transitions.
 *
 * Positron and Dark Matter ship an IDENTICAL `carto` source spec and the same 93
 * layer ids. So we rebuild the next style with our own sources/layers re-attached
 * verbatim from map.getStyle() and take the diff path:
 *
 *   - diffSources only emits removeSource/addSource when a spec is not deepEqual.
 *     `carto` is byte-identical across the two styles, and our sources are copied
 *     straight out of the live style, so ZERO source commands are emitted.
 *     No source teardown => feature state survives, tiles are not refetched.
 *   - diffLayers walks the tails of both layer arrays and skips matching ids. Our
 *     layers are appended last in both, so they tail-match and are never touched.
 *     (The 93 basemap layers do get reordered — Positron and Dark Matter order
 *     `waterway_label` differently — but that only churns basemap layers, which
 *     carry no state of ours.)
 *   - Our layers are deepEqual before/after, so not even a setPaintProperty fires
 *     on them: the coalesce expressions survive byte-for-byte.
 *
 * Verified in Chromium; see tests/e2e/theme.spec.ts.
 */

const STYLE_URLS = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

/** Source ids that belong to the basemap. Captured from the first basemap fetched. */
export const BASE_SOURCE_IDS = new Set();
/** Layer ids that belong to the basemap. Captured from the first basemap fetched. */
export const BASE_LAYER_IDS = new Set();

/** maplibre-gl v5 sky spec, per theme. Applied inside the style object. */
export const SKY = {
  light: {
    "sky-color": "#a9c7dd",
    "sky-horizon-blend": 0.6,
    "horizon-color": "#e6ebef",
    "horizon-fog-blend": 0.5,
    "fog-color": "#eeece6",
    "fog-ground-blend": 0.6,
    "atmosphere-blend": 0.6,
  },
  dark: {
    "sky-color": "#06171a",
    "sky-horizon-blend": 0.5,
    "horizon-color": "#123d40",
    "horizon-fog-blend": 0.55,
    "fog-color": "#070d0e",
    "fog-ground-blend": 0.55,
    "atmosphere-blend": 0.7,
  },
};

/** maplibre-gl v5 light spec, per theme. Drives fill-extrusion shading. */
export const LIGHT = {
  light: {
    anchor: "viewport",
    color: "#ffffff",
    intensity: 0.35,
    position: [1.5, 210, 30],
  },
  dark: {
    anchor: "viewport",
    color: "#bfeee6",
    intensity: 0.22,
    position: [1.5, 210, 30],
  },
};

const cache = new Map(); // theme -> raw style JSON (never handed out directly)
const inflight = new Map(); // theme -> Promise

function normalize(theme) {
  return theme === "dark" ? "dark" : "light";
}

function clone(o) {
  return typeof structuredClone === "function"
    ? structuredClone(o)
    : JSON.parse(JSON.stringify(o));
}

function captureBaseIds(style) {
  // Once only, and only from a pristine basemap JSON — before any page layer exists.
  if (BASE_LAYER_IDS.size > 0) return;
  for (const id of Object.keys(style.sources || {})) BASE_SOURCE_IDS.add(id);
  for (const layer of style.layers || []) BASE_LAYER_IDS.add(layer.id);
}

/**
 * Fetch (and cache) the CARTO style for a theme. Always returns a fresh clone with
 * `sky` and `light` already applied, so `new maplibregl.Map({ style: await
 * loadBasemap(theme) })` and applyBasemap() share exactly one code path.
 * @param {"light"|"dark"} theme
 * @returns {Promise<object>} StyleSpecification
 */
export async function loadBasemap(theme) {
  const t = normalize(theme);

  if (!cache.has(t)) {
    if (!inflight.has(t)) {
      inflight.set(
        t,
        fetch(STYLE_URLS[t])
          .then((res) => {
            if (!res.ok) throw new Error(`basemap ${t}: HTTP ${res.status}`);
            return res.json();
          })
          .then((json) => {
            cache.set(t, json);
            captureBaseIds(json);
            inflight.delete(t);
            return json;
          })
          .catch((err) => {
            inflight.delete(t);
            throw err;
          })
      );
    }
    await inflight.get(t);
  }

  const style = clone(cache.get(t));
  style.sky = clone(SKY[t]);
  style.light = clone(LIGHT[t]);
  return style;
}

/**
 * Swap the basemap under a live map, preserving the page's sources, layers,
 * feature state and in-flight transitions.
 * @param {import("maplibre-gl").Map} map
 * @param {"light"|"dark"} theme
 */
export async function applyBasemap(map, theme) {
  const t = normalize(theme);

  // loadBasemap first: it is what populates BASE_SOURCE_IDS / BASE_LAYER_IDS.
  const next = await loadBasemap(t);

  const live = map.getStyle();
  if (!live) {
    map.setStyle(next);
    return;
  }

  const ourSourceIds = [];
  for (const [id, spec] of Object.entries(live.sources || {})) {
    if (BASE_SOURCE_IDS.has(id)) continue; // identical across themes -> leave the basemap's
    next.sources[id] = spec; // verbatim -> deepEqual -> no source command
    ourSourceIds.push(id);
  }

  const ourLayerIds = [];
  for (const layer of live.layers || []) {
    if (BASE_LAYER_IDS.has(layer.id)) continue;
    next.layers.push(layer); // verbatim, appended last -> tail-matched -> untouched
    ourLayerIds.push(layer.id);
  }

  // Skip validation: the input is a pristine CARTO style plus specs we just read
  // back out of the live map, and validating a 5k-feature inline GeoJSON source on
  // every theme flip is pure cost.
  map.setStyle(next, { diff: true, validate: false });

  // Guard: if the diff bailed out, maplibre rebuilds the style from scratch and our
  // sources/layers (and all feature state) are gone. That must be loud.
  const after = map.getStyle();
  const lostSources = ourSourceIds.filter((id) => !after?.sources?.[id]);
  const afterLayerIds = new Set((after?.layers || []).map((l) => l.id));
  const lostLayers = ourLayerIds.filter((id) => !afterLayerIds.has(id));

  if (lostSources.length || lostLayers.length) {
    console.error(
      "[basemap] setStyle diff fell back to a full restyle — page state was destroyed.",
      { lostSources, lostLayers }
    );
  }
}
