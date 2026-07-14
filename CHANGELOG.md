# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0] - 2026-07-14

### Removed (breaking)

- **`reverseScale()` is gone, and the bundle is 41% smaller** (26,706 → 15,883 bytes
  minified ESM). It was deprecated in 2.0.0, but it was worse than deprecated: its first
  statement was `scale.domain()`, and since the scheduler rewrite the samplers this plugin
  produces are plain `(t) => value` closures with no `.domain()` / `.range()`. It threw
  `TypeError: scale.domain is not a function` on **every sampler the plugin creates**, so
  it could not have had a working caller. It was also the only importer of `d3-scale` —
  which quietly dragged `d3-array` and `d3-format` (currency formatting, tick generation)
  into every consumer's bundle.

  Interruption is, and since 2.0.0 has been, "start a fresh transition from the current
  feature-state value" — see [Interrupting](README.md#interrupting-a-transition). If you
  have a `map.transition.reverseScale(...)` call in your source, delete it: it was
  throwing.

  This is a major bump because an exported, type-declared method was removed, even though
  no working caller was possible. The version number should say what happened.

- `d3-scale` dropped from `dependencies`, `@types/d3-scale` from `devDependencies`. The
  only remaining runtime deps are `d3-color`, `d3-ease` and `d3-interpolate`.

- **The `dev/` directory is gone**, along with `vite.config.js` and the `npm run serve`
  script that existed solely to serve it. Its six pages predated the 2.0 rewrite and
  taught patterns the README now explicitly warns against (explicit `[start, target]`
  values instead of `[null, target]`; hand-rolled `mouseleave` bookkeeping that
  supersession makes unnecessary). One of them, `colour-cycle.js`, passed
  `ease: "ease-in-out"`, which is not a valid easing name and silently fell back to
  linear. `examples/` covers everything it did, correctly.

## [2.0.0] - 2026-07-13

### A note on versioning

Everything below first shipped as `1.2.0` / `1.2.1`. That was a mistake. The rewrite
carries breaking changes — `onStart` timing, `onComplete` on superseded calls, and the
sampler objects exposed on `map.transition.transitions` — and breaking changes require a
major bump under semver.

`2.0.0` is that same engine, correctly versioned. There is no behavioural difference
between `1.2.1` and `2.0.0`; the version number is the fix. `1.2.1` is deprecated on npm
and points here. `1.2.0` was tagged but never published to npm at all.

If you are coming from `1.0.x` or `1.1.x` — and if you have `^1.0.0` in your
`package.json`, you are, because `1.0.x` was the published version for seven months —
read **Changed (breaking)** below before upgrading.

### Engine rewrite: the scheduler

The animation core (`src/index.ts`) was rewritten around a single, global
requestAnimationFrame loop with per-map scheduler state. The public surface is
unchanged (`map.transition` / `map.T`, the `transitions` Set,
`listLayerTransitions`, `reverseScale`), but the engine now survives a mass
trigger of thousands of features.

Measured in headless chromium on the 2000-point `bulk` source in
`examples/_test-harness.html` (see `tests/e2e/engine-perf.spec.ts`):

| | before | after |
|---|---|---|
| 2000 synchronous `map.transition()` calls | 139.6 ms | 10.6 ms |
| cost ratio 2000 calls vs 200 calls | 19.1x (superlinear) | ~2-7x (linear) |
| rAF callbacks scheduled per frame @2000 features | **2093** | **3** |
| feature-state writes per frame, 2000 features x 2 properties | 2091 | 2050 (one per feature) |
| engine main-thread ms per frame @2000 x 2 | 3.5 ms | 3.0 ms |
| feature-state writes per frame during a 2.5 s stagger | **2333 (no deferral)** | **246** |

### Fixed

- **`delay` now genuinely defers work.** Previously the rAF loop started
  immediately and wrote the clamped start value on every frame while
  "waiting", so a longer stagger meant *more* work, not less. The start value is
  now written once, synchronously, at call time; the transition then sits in a
  `pending` list accruing zero per-frame cost until its start time arrives.
  Staggering a mass trigger is now *cheaper* than firing it all at once.
- **`onComplete` is no longer silently lost when a second call lands on the same
  feature.** The old merge path did `activeTransition.options = options`, which
  overwrote the previous call's options object, so a carried-forward property's
  `onComplete` never fired. Callbacks now belong to the *call* that created them
  (an internal "group"), not to the per-feature transition object. Chaining on
  `onComplete` is reliable; hand-rolled `setTimeout` re-arming is no longer
  necessary.
- **One rAF per feature is now one rAF for the whole map.** `animateFeature`
  rescheduled its own rAF per feature, allocating a fresh closure, an
  `Object.keys().filter()` array, a `target` object and a `currentState` object
  every frame, per feature. The per-feature `target` and state objects are now
  allocated once and reused, and the frame loop allocates nothing.
- **The mass-trigger path is no longer O(N^2).** Finding a feature's in-flight
  transition scanned the entire `transitions` Set with an `Object.keys()`
  allocation per candidate. It is now a `Map` lookup keyed by feature.
- **The same numeric feature id in two different sources no longer collides.**
  The internal feature key now includes the source and source layer.
- **`map.getPaintProperty()` is no longer called on every transition.** It
  deep-clones the coalesce expression on each call. Paint fallbacks are now
  memoized per `(layer, property)` and invalidated on `style.load`.
- **Color interpolators are built once, not every frame.**
  `getColorInterpolator` used to construct a new `interpolateRgb` inside the
  returned sampler, i.e. on every frame, for every color channel. The
  per-segment interpolators are now precomputed.
- **Unparseable colors are now rejected.** d3-color's `rgb()` never returns
  `null` - it returns an `Rgb` with `NaN` channels - so the old HSL and LAB
  fallback branches were unreachable dead code and garbage input produced `NaN`
  colors. They are removed, replaced by a real `Number.isNaN` parse guard.
- **A transition callback that throws no longer kills the frame loop.**
  Callbacks are queued during a frame and flushed after it, so a re-entrant
  `map.transition()` from `onStart`/`onComplete` (i.e. chaining) can no longer
  corrupt the scheduler's arrays mid-iteration.

### Changed (breaking)

These are deliberate corrections, but they change behaviour. They are the reason this is
a major release.

- **`onStart` timing.** It now fires synchronously *only* when `delay === 0`.
  With a delay, it fires on the frame the transition actually begins - previously
  it fired synchronously regardless, which was wrong.
- **`onComplete` and superseded calls.** If any paint property from a call is
  superseded by a later call on the same property, that call's `onComplete`
  never fires. Previously the behaviour was incidental and depended on which
  options object happened to win.
- **Samplers no longer carry d3 scale methods.** The objects stored in
  `map.transition.transitions` map `${featureId}-${style}` to a plain
  `(t: number) => value` sampler. They no longer have `.domain()` / `.range()`
  (the numeric path no longer uses `d3-scale`, which was copying ~20 methods
  onto each sampler via `Object.assign` on every call). `reverseScale()` is
  retained for API compatibility but is deprecated and only works on d3 scales
  you pass in yourself.
- **`map.transition(feature, options)` with no `paint` is now a no-op.** It
  previously added an empty transition to the Set for one frame.
- `TransitionOptions["paint"]` is typed `Record<string, (string | number | null)[]>`,
  admitting the already-supported `[null, target]` form.

### Added

- `createNumericSampler` is exported for testing (`tests/unit/sampler.test.ts`).
- `tests/e2e/engine-perf.spec.ts` - mass-trigger linearity, per-frame work under
  load, and a falsifiable proof that `delay` defers.
- `examples/_test-harness.html` gains a 2000-point `bulk` source and the
  `ensureBulk()`, `bulkTransition()`, `bulkState()`, `sampleFrames()` and
  `rafCalls()` hooks.

### Documentation

- **The README's color-space claim was false and has been corrected.** It advertised
  HSL and LAB interpolation, selected automatically from the input format. The plugin
  has only ever interpolated in sRGB (`interpolateRgb`); the HSL and LAB branches were
  unreachable dead code. `hsl(...)` input still parses (it is a legal way to *spell* a
  color) but does not change the interpolation space, and CSS `lab()` / `lch()` cannot
  be parsed by `d3-color` at all.
- **Paint ownership is now documented.** Once the plugin has transitioned a
  `(layer, paint-property)` pair it rewrites that property to a `coalesce` expression
  and owns it; calling `map.setPaintProperty()` on it afterwards silently discards every
  feature's animated state. Animate it with `map.transition()` instead.
- `delay` semantics, the `onStart` timing change, and cancel-by-supersession are
  documented in `README.md`; the scheduler and the theme-swap strategy are documented in
  `CLAUDE.md`.
- **The README claimed the plugin "automatically reverses" an interrupted transition.**
  It does not, and has not since the scheduler rewrite — a new call *supersedes* the old
  one and starts a fresh sampler from the current feature-state value. The old wording
  also implied you could re-trigger with an explicit start value; doing that mid-flight
  builds a three-stop ramp (`[45, 0, 60]`) that visibly dives to zero first. The README
  now says **always re-trigger with `[null, target]`** and explains why.
- **The easing list over-promised, twice.** It advertised nine easings, but `"poly"` is
  byte-identical to `"cubic"` (d3's `easePoly` defaults to exponent 3, which *is*
  `easeCubic`), so there are nine names but **eight distinct curves** — and it described
  `"poly"` as having a "configurable power" when nothing can configure it. Separately,
  `"elastic"` cannot overshoot its target, because the eased value is clamped to `[0, 1]`
  (`src/index.ts:178`). Both are now documented, with `[null, 24, 20]` given as the way to
  get real overshoot. (`"bounce"` is unaffected — it stays within `[0, 1]` naturally.)
  Tracked in `TODO.md`; fixing either properly is an API change.
- **A `Performance` section was added to the README**, documenting the three scheduler
  guarantees (one rAF per map, one `setFeatureState` per feature per frame, `delay` truly
  defers), the measured 5,000 × 3 @ 60fps figure, and the two honest caveats: firing a
  very large batch still blocks for ~100ms, and MapLibre's own repaint — not this plugin —
  is usually what binds the frame budget.
- `npm run deploy:examples` publishes the **built** `examples-dist/`, not the `examples/`
  sources. The README said otherwise.

### Examples — rebuilt

The demo site is now **six pages instead of ten**, each teaching one idea, on a shared
design system with a light/dark theme and a live frame-budget rail.

- **New:** `playground.html` (replaces `basic-transition`, `multiple-properties`,
  `easing-functions`), `color.html` (replaces `color-animation`, `color-cycle`,
  `multi-breakpoint`), `stress.html` (replaces `concurrent-effects`) — 8,000 features
  × 3 channels, showing writes-per-frame collapse under a stagger. `hover-effects.html`,
  `chained-transitions.html` and `rising-city.html` were rewritten; the landing page
  gained a live map hero.
- **Removed:** `basic-transition`, `multiple-properties`, `easing-functions`,
  `color-animation`, `color-cycle`, `multi-breakpoint`, `concurrent-effects` (and their
  e2e specs).
- **New shared modules** in `examples/scripts/` (`theme.js`, `basemap.js`, `chrome.js`,
  `perf.js`) and a fully tokenised `examples/styles/shared.css`. The basemap swaps
  light ⇄ dark under running transitions via `setStyle({ diff: true })` without
  destroying sources, layers, feature state, or in-flight transitions.
- `rising-city` now renders **5,000** real Vancouver buildings, up from 450, fetched from
  Overpass by `scripts/fetch-buildings.mjs` (`npm run data:buildings`). The old bundled
  `examples/data/vancouver-buildings.js` is removed.
- Examples now pin `maplibre-gl@5` (required for `setSky`). This affects the demos only;
  the plugin's peer range is unchanged (`>=3.0.0`).
