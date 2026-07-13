# MapLibre Transition Examples

Six interactive pages, each one teaching a single idea about the plugin.

## View Live Examples

Visit [https://popkinj.github.io/maplibre-transition/](https://popkinj.github.io/maplibre-transition/) to see them in action.

## Running Examples Locally

```bash
# Install dependencies
npm install

# Build the plugin — the pages import ../dist/index.esm.js, so this is required
npm run build

# Serve examples locally
npm run serve:examples
```

The examples open at `http://localhost:5173/maplibre-transition/`.

> The pages import the **built** plugin. After any change to `src/`, re-run
> `npm run build` or the demos will keep running the old engine.

## Examples Included

| Page | The one line it teaches |
| --- | --- |
| **Playground** (`playground.html`) | `map.transition(f, { duration, ease, delay, paint })` — every option, live, printing the exact `paint` object it runs. Races all 9 easings side by side. |
| **Color & Breakpoints** (`color.html`) | `'circle-color': ['#26547c', '#e9c46a', '#f4703a']` — a stop editor whose UI *is* the array you pass. 2–6 stops, colors and numbers. |
| **Hover Effects** (`hover-effects.html`) | `map.transition(f, { delay: dwellMs })` — `delay` as a hover-dwell threshold. Leaving supersedes the pending transition, so it never fires. No timers. |
| **Chained Transitions** (`chained-transitions.html`) | `map.transition(f, { onComplete: next })` — sequences built purely on `onComplete`. No `setTimeout` anywhere. |
| **Stress** (`stress.html`) | `map.transition(f, { delay: i * 0.4 })` — 8,000 features × 3 channels on one rAF. Raise the stagger, watch `setFeatureState` calls per frame collapse. |
| **Rising City** (`rising-city.html`) | `paint: { 'fill-extrusion-height': [null, h] }` — 5,000 real Vancouver buildings rising in 3D. |

`_test-harness.html` is **not** a demo. It is a deterministic rig driven by
`tests/e2e/interruptions.spec.ts` and `tests/e2e/engine-perf.spec.ts`, and it is
deliberately excluded from the production build.

## How the pages are built

Everything shared lives in `examples/scripts/` and `examples/styles/`:

- **`styles/shared.css`** — design tokens (`--bg`, `--surface`, `--ink`, `--accent`,
  `--ramp-0…3`, …) defined on `:root` and overridden on `:root[data-theme="dark"]`.
  Pages never hardcode a color.
- **`scripts/theme.js`** — `initialTheme()` / `setTheme()`. Follows
  `prefers-color-scheme` until the user toggles, then persists to
  `localStorage["mlt-theme"]` and fires a `themechange` event on `window`.
- **`scripts/chrome.js`** — `mountChrome({ title, kicker })` injects the shared
  header (with the theme toggle), the footer, and the frame rail at the top of the
  control panel.
- **`scripts/basemap.js`** — `loadBasemap(theme)` / `applyBasemap(map, theme)`. Swaps
  CARTO Positron ⇄ Dark Matter **without destroying anything** (see below).
- **`scripts/perf.js`** — `frameMeter()` / `mountFrameRail(canvas, meter)`. The rail
  on every page is a real 120-frame ring buffer, not a decoration.

Every page inlines a small theme script in `<head>` **before** the stylesheet, as a
plain non-deferred `<script>`, so there is no flash of the wrong theme on first paint.

### Why the theme swap does not destroy the map

`map.setStyle()` normally tears down every source, layer, and **all feature state** —
which would wipe the plugin's `["coalesce", ["feature-state", …], fallback]` paint
expressions and kill in-flight transitions.

Positron and Dark Matter ship a byte-identical `carto` source spec and the same layer
ids. So `applyBasemap` rebuilds the next style with the page's own sources and layers
re-attached verbatim from `map.getStyle()`, and calls
`map.setStyle(next, { diff: true })`:

- `diffSources` only emits a command when a source spec is not `deepEqual` — so **zero**
  source commands fire, no tiles are refetched, and feature state survives.
- `diffLayers` skips tail-matched layers — and page layers are always appended **last**
  — so the `coalesce` expressions survive byte-for-byte.

Verified in `tests/e2e/theme.spec.ts`, including a swap performed with 500 buildings
mid-rise: they keep climbing straight through it.

Two rules follow, and every page honours them:

1. Keep your own sources and layers **appended last**.
2. Recolor overlays on `themechange` with `map.transition(f, { paint: { … } })` using
   `[null, target]` — **never** `setPaintProperty` on a property the plugin owns.

## Data

| Source id | Data | ids |
| --- | --- | --- |
| `cities` | `examples/data/canadian-cities.js` — capitals (13) + major cities (45) | `generateId: true` |
| `provinces` | `examples/public/data/canada-provinces.json` — 13 MultiPolygons | `promoteId: 'name'` |
| `buildings` | `examples/public/data/vancouver-buildings.geojson` — 5,000 OSM polygons | baked into the file |
| `field` / `hero` | procedural point grids (`stress.html`, `index.html`) | baked in |

The building footprints are fetched from Overpass and are **committed**, so the demos
need no network beyond the basemap. To regenerate them:

```bash
npm run data:buildings
```

Feature ids must be numeric, or strings with no hyphens (the plugin keys internal
state as `${featureId}-${paintProperty}`).
