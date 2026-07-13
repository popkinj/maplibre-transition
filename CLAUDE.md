# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A MapLibre GL JS plugin for smooth transitions between map styles. The plugin extends MapLibre's Map interface to add transition functionality for animating paint properties using d3 interpolation and easing functions.

## Build & Development Commands

```bash
# Install dependencies
npm install

# Build the plugin (outputs to dist/)
npm run build

# Development mode with watch (auto-rebuilds on changes)
npm run dev

# Start Vite dev server (serves examples/ directory)
npm run serve:examples

# Re-fetch the Vancouver building footprints from Overpass (5,000 polygons ->
# examples/public/data/vancouver-buildings.geojson). The file is committed; you
# only need this to regenerate it.
npm run data:buildings
```

## Testing Commands

```bash
# Run unit tests (Vitest)
npm test

# Run unit tests in watch mode
npm run test:watch

# Run E2E tests (Playwright - headless)
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Run E2E tests in headed browser
npm run test:e2e:headed

# Run all tests (unit + E2E)
npm run test:all
```

## Deployment Commands

### Publish to npm (automated via OIDC)

Publishing runs in GitHub Actions via OIDC Trusted Publishing (`.github/workflows/publish.yml`) —
there is no local `npm login`/`npm publish` and no tokens or 2FA. Cut a release by
tagging a version; the GitHub Release triggers the publish workflow.

```bash
npm version patch                            # bump version, create commit + tag
git push origin main --follow-tags           # push commit and tag
gh release create v1.2.3 --generate-notes    # triggers publish workflow
```

See `DEPLOYMENT.md` for the full flow, the one-time trusted-publisher setup, and gotchas.

### Deploy examples to GitHub Pages

```bash
# Deploy examples to GitHub Pages
npm run deploy:examples
```

## Architecture

### Core Functionality

The entire plugin is implemented in a single TypeScript file (`src/index.ts`) that:

1. **Extends MapLibre Map interface** - Adds `map.transition()` and deprecated `map.T()` methods via TypeScript module augmentation
2. **Feature state-based animations** - Utilizes MapLibre's `setFeatureState()` to update feature properties, modifying layer paint properties to use `["coalesce", ["feature-state", ...], ...]` expressions
3. **Uses d3 for interpolation** - d3-ease for easing, d3-interpolate/d3-color for colors. (d3-scale is no longer in the hot path; the numeric path is a direct piecewise lerp.)

### The scheduler (important)

The engine runs on a **single global `requestAnimationFrame` loop**, with per-map
scheduler state hanging off a `Symbol` on the map. This is load-bearing — do not
reintroduce a per-feature rAF.

- **One rAF for the whole map**, not one per feature. A per-feature record holds a
  dense `Channel[]` plus a `target`/`state` scratch object allocated once and reused,
  so the frame loop allocates nothing.
- **One `setFeatureState` write per animating feature per frame** — not one per
  channel. A feature with three animating properties still costs one write.
- **`delay` genuinely defers.** The start value is written once, synchronously; the
  transition then sits in a `pending` list accruing zero per-frame cost until its
  start time arrives. Staggering a mass trigger is *cheaper* than firing it flat
  (measured: 2,000 writes/frame flat vs ~250 across a 3s stagger).
- **Callbacks belong to the call, not the feature.** Each `map.transition()` call
  creates an internal *group* holding its `options`, a `remaining` count, and a
  `cancelled` flag. `onComplete` fires once, when every property of *that call*
  finishes — and never, if any of them is superseded by a later call. That is what
  makes `onComplete` chains reliable and cancellable-by-supersession. Do not
  hand-roll `setTimeout` re-arming.
- **`onStart` fires synchronously iff `delay === 0`**; otherwise on the start frame.
- Callbacks are queued during a frame and flushed after it, so a re-entrant
  `map.transition()` from `onStart`/`onComplete` cannot corrupt the scheduler's
  arrays mid-iteration.
- `map.transition.transitions` is still a `Set`, and a delayed transition enters it
  **synchronously**. Its samplers are plain `(t) => value` functions — they no longer
  carry d3 scale methods (`.domain()` / `.range()`).

### Key Components

- **TransitionOptions interface** - Defines `duration`, `ease`, `delay`, `paint`, `onComplete`, `onStart`
- **Color interpolation** - `getColorInterpolator()` detects color values and interpolates them **in sRGB** via `interpolateRgb`, with per-segment interpolators precomputed once per call. There is no HSL or LAB path: `d3-color`'s `rgb()` never returns `null` (it returns an `Rgb` with `NaN` channels), so those branches were unreachable dead code and have been deleted. `hsl(...)` input still *parses*; it just interpolates in sRGB like everything else. Unparseable strings (e.g. CSS `lab()`) are rejected by a `Number.isNaN` guard.
- **Multi-property transitions** - Supports transitioning multiple paint properties simultaneously with shared duration/easing
- **Multi-breakpoint support** - Arrays with 3+ values create piecewise interpolations (e.g., `[0, 10, 5, 15]` transitions through all values)
- **`[null, target]`** - A `null` start resolves to the feature's current state, falling back to the layer's paint fallback. **Always use it to re-trigger mid-flight** — an explicit start (`[0, 60]` on a feature currently at 45) produces a three-stop scale that visibly dives to 0 first.
- **Paint ownership** - Once the plugin has transitioned a `(layer, paint-property)` pair, that property is a `coalesce` expression it owns. **Never call `setPaintProperty` on it** — animate it with `map.transition()`. This is what makes the theme swap safe.
- **Transition reversal** - `reverseScale()` is deprecated and retained only for API compatibility; interruption is now handled by starting a fresh transition from the current feature-state value.

### Build Configuration

- **Rollup** - Builds both CJS (`dist/index.js`) and ESM (`dist/index.esm.js`) outputs with TypeScript compilation and terser minification
- **External dependencies** - maplibre-gl is marked external (peer dependency); d3 libraries are bundled
- **Type declarations** - Generated TypeScript definitions in `dist/index.d.ts`

### Demo Pages (examples/)

Six pages, deployed to GitHub Pages. Each teaches one idea.
- `index.html` - Landing page. Live map hero: a 1,012-point field running a delayed wavefront.
- `playground.html` - Every option on the call, printing the `paint` object it runs. All 9 easings raced.
- `color.html` - Breakpoint editor whose UI *is* the array you pass. Colors + numbers, 2–6 stops.
- `hover-effects.html` - `delay` as a hover-dwell threshold; leaving supersedes the pending transition.
- `chained-transitions.html` - Sequences built purely on `onComplete`. No `setTimeout` anywhere.
- `stress.html` - 8,000 points × 3 channels on one rAF. Stagger collapses writes/frame.
- `rising-city.html` - 5,000 real Vancouver buildings rising in 3D (`fill-extrusion-height`).
- `_test-harness.html` - Deterministic rig for the interruptions/engine-perf specs. **Not a demo, not built.**

**Adding or removing a page means editing three files together:**
`examples/index.html` (the card), `vite.examples.config.js` (`rollupOptions.input` — a
missing entry silently never deploys; a stale one is a hard build failure), and
`tests/e2e/landing-page.spec.ts` (the expected-titles list).

Vite serves these examples with base path `/maplibre-transition/`.

### Shared example modules (examples/scripts/, examples/styles/)

Pages never hardcode a color or hand-roll chrome. `styles/shared.css` defines design
tokens on `:root`, overridden on `:root[data-theme="dark"]`.

- `theme.js` — `initialTheme()` / `setTheme()`. Follows `prefers-color-scheme` until the
  user toggles; persists to `localStorage["mlt-theme"]`; fires `themechange` on `window`.
  Every page also inlines a tiny theme script in `<head>` *before* the stylesheet (plain,
  non-deferred) to avoid a flash of the wrong theme.
- `basemap.js` — `loadBasemap(theme)` / `applyBasemap(map, theme)`.
- `chrome.js` — `mountChrome({ title, kicker })`: header, footer, theme toggle, frame rail.
- `perf.js` — `frameMeter()` / `mountFrameRail(canvas, meter)`.

#### The theme swap (setStyle diff) — load-bearing

`map.setStyle()` normally destroys every source, layer, and **all feature state**, which
would wipe the plugin's `coalesce` paint expressions and kill in-flight transitions.

CARTO Positron and Dark Matter ship a byte-identical `carto` source spec and the same
layer ids. So `applyBasemap` rebuilds the next style with the page's own sources/layers
re-attached **verbatim** from `map.getStyle()` and calls `map.setStyle(next, { diff: true })`:
`diffSources` emits nothing (specs are `deepEqual` → no teardown → feature state survives,
no tile refetch), and `diffLayers` tail-matches our layers (always appended **last**) so
the `coalesce` expressions survive byte-for-byte.

Two rules every page must honour:
1. Keep your own sources and layers **appended last**.
2. Recolor overlays on `themechange` with `map.transition(f, { paint: { … } })` using
   `[null, target]` — **never** `setPaintProperty` on a property the plugin owns.

Verified in `tests/e2e/theme.spec.ts`, including a swap with 500 buildings mid-rise.
(Note: the ~93 basemap layers *are* reordered on a swap — Positron and Dark Matter order
`waterway_label` differently — which is harmless, since basemap layers carry no state of
ours. Don't be surprised by that churn in a profiler.)

### Development Examples (dev/)

The `dev/` directory contains simpler example HTML/JS files for development:
- Simple transitions (`simple.html`)
- Hover-triggered transitions (`hover.html`)
- Point animations (`point-animation.html`)
- Chained transitions (`point-animation-chained.html`)
- Color animations (`colour-animation.html`)
- Color cycling with multiple breakpoints (`colour-cycle.html`)

## Important Implementation Details

### Paint Property Handling

The plugin modifies layer paint properties to enable feature-state transitions. For simple values, it wraps with `["coalesce", ["feature-state", style], defaultValue]`. For complex expressions (like case statements), it preserves the existing expression as the fallback.

### Transition State Management

- All active transitions stored in `map.transition.transitions` Set. A delayed transition enters it **synchronously**, so `.size` right after a call reflects it.
- Each transition object exposes samplers keyed by `${featureId}-${style}` — hence feature ids must be numeric, or strings with no hyphens.
- When a new call lands on a property already in flight, it **supersedes** it: a fresh sampler starts from the current feature-state value. The superseded call's `onComplete` never fires.
- Transitions are deleted from the Set when complete.

### Color vs Numeric Interpolation

Color values (strings that `d3-color`'s `rgb()` can parse — hex, `rgb()`, `hsl()`, named)
are interpolated **in sRGB** via `interpolateRgb`. There is no HSL or LAB path. Numeric
values use piecewise-linear interpolation with the eased `t`.

## Testing Infrastructure

### Unit Tests (tests/unit/)

Unit tests use Vitest with jsdom environment:
- `camelToKebab.test.ts` - Tests for the camelToKebab utility function
- `colorInterpolator.test.ts` - Tests for color format detection and interpolation
- `easing.test.ts` - Tests for all 9 easing function mappings
- `sampler.test.ts` - Tests for `createNumericSampler`: piecewise breakpoints, easing, clamping

### E2E Tests (tests/e2e/)

E2E tests use Playwright with WebGL support:
- Tests run against the Vite dev server serving `examples/`
- Uses `data-testid` attributes for reliable element selection
- Demo pages expose `window.__testHooks` for test access to map instance

Test files cover the demo pages plus the landing page and behavior-focused specs:
- `landing-page.spec.ts` - Landing page: the six cards, the live hero, the theme toggle
- `playground.spec.ts` - The full option surface; all 9 easings
- `color.spec.ts` - Breakpoint editor, string feature ids (`promoteId`), presets
- `hover-effects.spec.ts` - Dwell threshold via `delay`; cancel-by-supersession
- `chained-transitions.spec.ts` - `onComplete` chains, stop, loop
- `stress.spec.ts` - 8,000 features; batch cost; writes/frame collapsing under stagger
- `rising-city.spec.ts` - Extrusion height + color; camera; reduced motion
- `theme.spec.ts` - The `setStyle({diff:true})` swap preserves sources, layers, coalesce expressions, feature state, and in-flight transitions
- `interruptions.spec.ts` - Mid-transition interruption/reversal, driven by `_test-harness.html`
- `engine-perf.spec.ts` - Mass-trigger linearity, rAF schedulings/frame, and a falsifiable proof that `delay` defers

`stress.spec.ts` sets `test.describe.configure({ mode: 'default' })` — it measures frame
time and batch cost, so running its own tests in parallel would just measure the box. Do
the same for any new perf-sensitive spec.
- `interruptions.spec.ts` - Mid-transition interruption/reversal, driven by `_test-harness.html`

### Test Helpers (tests/e2e/fixtures/test-helpers.ts)

Shared utilities for E2E tests:
- `waitForMapLoad(page)` - Waits for MapLibre map to fully load
- `getTransitionCount(page)` - Returns active transition count
- `waitForTransitionComplete(page)` - Waits for all transitions to finish

### CI/CD

**`.github/workflows/test.yml`** runs on push/PR to main:
- Unit tests with coverage upload
- E2E tests on chromium only (Firefox/WebKit have unreliable headless WebGL on Linux, which MapLibre requires)
- Playwright report artifact upload

**`.github/workflows/publish.yml`** runs on GitHub Release publish (or manual dispatch):
- Builds, runs unit tests, verifies the release tag matches `package.json`
- Publishes to npm via OIDC Trusted Publishing with provenance (no tokens/2FA)
- See `DEPLOYMENT.md` for details
