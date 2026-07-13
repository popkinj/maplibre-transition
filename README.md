# maplibre-transition

[![npm](https://img.shields.io/npm/v/maplibre-transition.svg)](https://www.npmjs.com/package/maplibre-transition)
[![Tests](https://github.com/popkinj/maplibre-transition/actions/workflows/test.yml/badge.svg)](https://github.com/popkinj/maplibre-transition/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Animate MapLibre GL JS **paint properties per feature** — radius, colour, opacity,
extrusion height — with a duration, an easing, and a delay.

MapLibre can transition a paint property for a whole *layer*. This plugin lets you
transition it for a single *feature*, by driving `setFeatureState()` from a single
animation loop and rewriting the layer's paint property to read from that state.

```javascript
map.transition(feature, {
  duration: 800,
  ease: "cubic",
  paint: { "circle-radius": [null, 20], "circle-color": [null, "#38e0c8"] },
});
```

Built to scale: **5,000 features × 3 animated properties at 60fps**, on one
`requestAnimationFrame` for the entire map. See [Performance](#performance).

**[Live demos →](https://popkinj.github.io/maplibre-transition/)**

## Compatibility

MapLibre GL JS **3.0.0 and above** (declared as a peer dependency).

The demo site pins MapLibre 5 because it uses `setSky()`, but the plugin itself does not
require it.

## Installation

```bash
npm install maplibre-transition
```

## Usage

```javascript
import maplibregl from "maplibre-gl";
import MaplibreTransition from "maplibre-transition";

const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: [0, 0],
  zoom: 2,
});

// Initialize the plugin
MaplibreTransition.init(map);

// Use the plugin with either method
map.transition(feature, {
  duration: 1000,
  delay: 500,
  ease: "linear",
  paint: {
    "fill-opacity": [0.1, 1],
  },
});

// Or use the shorthand method (deprecated)
map.T(feature, {
  duration: 1000,
  delay: 500,
  ease: "linear",
  paint: {
    "fill-opacity": [0.1, 1],
  },
});
```

> **Note**: The `map.T` method is deprecated and will be removed in a future version. Please use `map.transition` for new code.

## Transitioning Multiple Properties

You can transition multiple style properties simultaneously by specifying them in the `paint` object:

```javascript
map.transition(feature, {
  duration: 1000,
  paint: {
    "circle-radius": [8, 12],
    "circle-stroke-width": [2, 4],
    "circle-opacity": [1, 0.2],
  },
});
```

All specified properties will transition together using the same duration and easing function. This is useful for creating coordinated visual effects.

## Paint Property Value Formats

The `paint` object accepts arrays in several formats:

```javascript
paint: {
  // Standard: explicit start and end values
  'circle-radius': [12, 20],

  // Null start: use current state as starting value
  'circle-radius': [null, 20],

  // Multi-breakpoint: animate through multiple values
  'circle-radius': [12, 20, 16, 25],
}
```

### Using `null` as Start Value

Use `null` as the first value to animate from the current state. This avoids manual state tracking:

```javascript
// Instead of manually tracking state:
let currentRadius = 12;
map.transition(feature, {
  paint: { 'circle-radius': [currentRadius, 20] }
});
currentRadius = 20;

// Just use null - the plugin queries the current state internally:
map.transition(feature, {
  paint: { 'circle-radius': [null, 20] }
});
```

The plugin uses `getFeatureState()` and `getPaintProperty()` to determine the current value when `null` is provided.

## Paint Ownership

**This is the most important rule in the library.**

To animate a paint property per feature, the plugin rewrites it on the layer to read
from feature state:

```js
// before
"circle-radius": 8

// after the first map.transition() touching circle-radius on that layer
"circle-radius": ["coalesce", ["feature-state", "circle-radius"], 8]
```

From that moment on, the `(layer, paint-property)` pair **belongs to the plugin**.

> **Never call `map.setPaintProperty()` on a property you have transitioned.**
> Animate it with `map.transition()` instead.

Calling `setPaintProperty` on an owned property replaces the `coalesce` expression
with a flat value. Every feature's animated state is then ignored — silently, with
no error — and the layer goes uniform. If you need to move an owned property, even
just to recolor it for a theme switch, do it through the plugin:

```js
// wrong — destroys the coalesce expression, kills every feature's state
map.setPaintProperty("cities-layer", "circle-color", "#38e0c8");

// right — animates every feature from wherever it is, to the new value
for (const f of features) {
  map.transition(f, { duration: 400, paint: { "circle-color": [null, "#38e0c8"] } });
}
```

Properties the plugin has *not* transitioned are yours; `setPaintProperty` on those
is fine. (In the demos, `circle-stroke-color` and `fill-outline-color` are set that
way, because nothing animates them.)

This rule is also what makes a live basemap swap safe: because the plugin owns those
expressions and nothing else writes them, the demos can restyle the map underneath
running transitions without dropping a frame.

### What cannot be animated

- **Layer-constant paint properties** — notably `fill-extrusion-opacity`. They are not
  data-driven, so feature state cannot reach them.
- **Any layout property** (`icon-size`, `text-size`, `icon-rotate`, …). The plugin only
  calls `setPaintProperty`.

Data-driven paint properties all work: `circle-*`, `fill-color` / `fill-opacity`,
`line-*`, `fill-extrusion-height` / `-base` / `-color`, and symbol `text-*` / `icon-color`.

## Delay and Staggering

`delay` (ms, default `0`) defers the *start* of a transition. It genuinely defers the
work: the start value is written once, synchronously, at call time, and the transition
then costs nothing per frame until its delay elapses.

This means **staggering a mass trigger is cheaper than firing it all at once**, not
more expensive:

```js
// 8,000 features, swept west to east over 3 seconds.
features.forEach((f, i) => {
  map.transition(f, {
    duration: 900,
    delay: (i / features.length) * 3000,
    paint: { "circle-radius": [null, 18] },
  });
});
```

Measured on the `stress` demo with 2,000 features: firing flat costs 2,000
`setFeatureState` calls per frame; the same batch spread over a 3-second stagger costs
around 250 — roughly an eighth of the per-frame work, because only the features whose
delay has elapsed are doing anything.

A delayed transition still enters `map.transition.transitions` **synchronously**, so
reading `.size` right after the call reflects it.

## Callbacks

```js
map.transition(feature, {
  paint: { "circle-radius": [null, 20] },
  onStart: () => {},
  onComplete: () => {},
});
```

- **`onStart`** fires synchronously *iff* `delay === 0`. With a delay, it fires on the
  frame the transition actually begins. (It used to fire synchronously regardless,
  which was simply wrong.)
- **`onComplete`** fires **once**, when every paint property from *that one call* has
  finished.
- **A superseded call never completes.** If a later call takes over any property from
  an earlier call, the earlier call's `onComplete` never fires.

That last point is a feature, not a caveat: it is what makes `onComplete` chains
cancellable. To stop a running chain, just start a new transition on the same
property — the in-flight step is superseded, its `onComplete` never runs, and the chain
cannot re-arm itself. No `cancelled` flags, no `clearTimeout`.

`onComplete` chaining is reliable; **do not hand-roll `setTimeout` re-arming.**

## Interrupting a Running Transition

Call `transition()` on a feature that is already animating and the new call **supersedes**
the old one on any property they share. The old call's `onComplete` never fires; the new
transition starts from wherever the property currently *is*.

> **Always use `[null, target]` to re-trigger.**

This is the single easiest thing to get wrong. An explicit start value is taken literally:

```javascript
// The feature is mid-flight, currently at radius 45.

// WRONG — you get a three-stop ramp [45, 0, 60]:
// it dives to 0 first, then climbs to 60. Visible, ugly, and surprising.
map.transition(feature, { paint: { 'circle-radius': [0, 60] } });

// RIGHT — resumes from 45 and goes to 60.
map.transition(feature, { paint: { 'circle-radius': [null, 60] } });
```

With `[null, target]` the plugin reads the live feature state, so an interrupted grow
becomes a smooth shrink from wherever it got to — no bookkeeping, no reversal logic:

```javascript
// User hovers in, then leaves before the grow finishes. Nothing special needed.
map.on('mouseleave', 'cities-layer', () => {
  map.transition(feature, {
    duration: 150,
    paint: { 'circle-radius': [null, 12] }
  });
});
```

> **Note on `reverseScale()`**: earlier versions reversed the running scale in place.
> They no longer do — interruption is just "start a fresh transition from the current
> value". `reverseScale` remains exported for API compatibility, is deprecated, and is
> not used internally. Do not build on it.

### Best Practices for Hover Effects

The only state you need is **which** feature is under the pointer — never **what it
looked like**. `hovered` is a transition target, not a snapshot:

```javascript
let hovered = null;

map.on('mousemove', 'cities-layer', (e) => {
  const feature = e.features[0];
  if (!feature || hovered?.id === feature.id) return;

  // Moving A → B: send A back. [null, …] means "from wherever it is now",
  // so a half-grown marker shrinks smoothly instead of snapping.
  if (hovered) {
    map.transition(hovered, { duration: 150, paint: { 'circle-radius': [null, 12] } });
  }

  hovered = feature;
  map.transition(feature, { duration: 400, paint: { 'circle-radius': [null, 20] } });
});

map.on('mouseleave', 'cities-layer', () => {
  if (!hovered) return;
  map.transition(hovered, { duration: 150, paint: { 'circle-radius': [null, 12] } });
  hovered = null;
});
```

1. **Never record the previous value.** `[null, target]` reads live feature state, so
   there is nothing to remember and nothing to get out of sync.
2. **Avoid `queryRenderedFeatures()` on mouseleave** — it may miss a feature that has
   left the viewport. Keep the object from `mousemove` instead.
3. **You don't need a real MapLibre feature.** The plugin only reads `id`, `source`,
   `sourceLayer`, and `layer.id`, so a bare object literal works and is cheaper:
   `{ id: 3, source: 'cities', layer: { id: 'cities-layer' } }`.

### `delay` as a dwell threshold

Because `delay` costs nothing until it elapses, it doubles as a "did the user actually
mean this?" filter — the effect only fires if the pointer *rests* on a feature:

```javascript
map.transition(feature, {
  delay: 220,                                    // ignore a pointer just passing through
  duration: 400,
  paint: { 'circle-radius': [null, 20] },
});
```

If the pointer leaves before the delay elapses, the mouseleave transition supersedes the
pending one and it simply never starts. No `clearTimeout`, no cancellation flag. This is
what the **Hover Effects** demo does.

## Easing Types

`ease` takes one of nine names, mapped to the in-out variant of the matching `d3-ease`
function (`"quad"` → `d3.easeQuad`, and so on). Default is `"linear"`.

| `ease` | Curve |
| --- | --- |
| `"linear"` | No easing. |
| `"sin"` | Gentlest ease-in-out. |
| `"quad"` | Mild acceleration and deceleration. |
| `"cubic"` | Stronger. A good default when `"linear"` looks mechanical. |
| `"poly"` | **Identical to `"cubic"`** — see below. |
| `"exp"` | Sharp: slow start, fast middle, slow end. |
| `"circle"` | Sharpest of the symmetric curves. |
| `"bounce"` | Bounces as it settles. |
| `"elastic"` | Springy settle — but **does not overshoot**; see below. |

```javascript
map.transition(feature, {
  duration: 1000,
  ease: "cubic",
  paint: { "fill-opacity": [0.1, 1] },
});
```

### Two honest caveats

**`"poly"` is the same curve as `"cubic"`.** `d3.easePoly` takes an exponent, which
defaults to 3 — and an exponent of 3 *is* `easeCubic`. The plugin exposes no way to set
the exponent, so the two names are interchangeable. There are nine names but eight
distinct curves.

**`"elastic"` cannot overshoot its target.** `d3.easeElastic` naturally ranges beyond
`[0, 1]` (it peaks around `1.37`), which is what produces the characteristic spring-past-
and-back. The plugin clamps the eased value to `[0, 1]`, so a transition to radius `20`
settles *at* `20` — it never springs past it. Elastic still reads as a distinctly
"springy" settle, but if you want true overshoot today, express it as a breakpoint array
instead:

```javascript
// Explicit overshoot: past the target, then back to it.
paint: { "circle-radius": [null, 24, 20] }
```

(`"bounce"` is unaffected — `d3.easeBounce` stays within `[0, 1]` by construction, so it
behaves exactly as advertised.)

## Color Transitions

The plugin detects when a property's values are colors and interpolates them with
D3's `interpolateRgb`:

```javascript
map.transition(feature, {
  duration: 1000,
  ease: "linear",
  paint: {
    "fill-color": ["#ff0000", "#00ff00"],
    "fill-outline-color": ["hsl(0,100%,50%)", "hsl(120,100%,50%)"],
    "fill-opacity": [0.1, 1],
  },
});
```

**Accepted color formats** — anything `d3-color` can parse:

- hex — `"#ff0000"`, `"#f00"`
- `rgb()` / `rgba()` — `"rgb(255,0,0)"`
- `hsl()` / `hsla()` — `"hsl(0,100%,50%)"`
- CSS named colors — `"tomato"`

**Interpolation is always sRGB.** Whatever format you write, values are parsed to
sRGB and interpolated there. Earlier versions of this README claimed the plugin
switched to HSL or LAB interpolation depending on the input format. It never did:
those branches were unreachable dead code (`d3-color`'s `rgb()` never returns
`null`, so the `null` checks that guarded them could not fire) and they have been
removed. Writing `"hsl(...)"` is a legal way to *spell* a color; it does not change
the interpolation space.

CSS `lab()` and `lch()` strings are **not** supported — `d3-color` cannot parse
them. A string the parser rejects is not treated as a color, so pass hex, `rgb()`,
`hsl()`, or a named color.

## Chaining Transitions

You can chain transitions using the `onComplete` callback. This is useful for creating complex animations that need to happen in sequence:

```javascript
map.transition(feature, {
  duration: 600,
  ease: "elastic",
  paint: {
    "circle-radius": [8, 12],
    "circle-color": ["#ff0000", "#00ff00"], // Color transition
  },
  onComplete: () => {
    // This transition will start after the radius transition completes
    map.transition(feature, {
      duration: 300,
      ease: "linear",
      paint: {
        "circle-stroke-width": [2, 4],
        "circle-opacity": [1, 0.2],
        "circle-color": ["#00ff00", "#0000ff"], // Another color transition
      },
    });
  },
});
```

You can combine multiple properties in both the initial and chained transitions. This allows for complex animations where some properties change together, while others follow in sequence.

## Advanced Transitions with Multiple Breakpoints

The plugin supports multiple breakpoints in transition arrays, enabling complex animations and color cycles. This feature allows for smooth transitions between multiple states or creating color cycling effects.

### Color Transitions with Multiple Breakpoints

You can specify multiple colors to create smooth color cycles:

```javascript
map.transition(feature, {
  duration: 3000,
  ease: "elastic",
  paint: {
    "fill-color": [
      "#088", // Start with green
      "#f00", // Then red
      "#00f", // Then blue
      "#ff0", // Then yellow
      "#f0f", // Then magenta
      "#0ff", // Then cyan
      "#088", // Back to green
    ],
  },
});
```

The plugin automatically interpolates between adjacent colors, creating smooth transitions. Each adjacent pair is one segment of the ramp, and every segment is interpolated in sRGB.

### Numeric Transitions with Multiple Breakpoints

Multiple breakpoints also work for numeric properties, creating piecewise linear interpolations:

```javascript
map.transition(feature, {
  duration: 2000,
  ease: "cubic",
  paint: {
    "circle-radius": [0, 10, 5, 15, 8], // Complex size animation
  },
});
```

This creates a smooth transition that:

1. Grows from 0 to 10
2. Shrinks to 5
3. Grows to 15
4. Finally settles at 8

### Best Practices for Multiple Breakpoints

1. **Duration**: Use longer durations (2000-3000ms) when working with multiple breakpoints to make transitions more visible and smooth.

2. **Easing Selection**:
   - `elastic` or `bounce`: Best for playful, dynamic effects
   - `cubic` or `sin`: Ideal for smooth, professional transitions
   - `linear`: Use for precise, mechanical movements

3. **Color Ramps**: Interpolation is sRGB, so a two-stop ramp between distant hues
   can pass through a muddy midpoint. Add an intermediate stop to steer it — that
   is exactly what multiple breakpoints are for.

4. **Performance**: Segment interpolators are built once per call, not per frame,
   so extra breakpoints are cheap. The per-frame cost of a transition does not
   depend on how many breakpoints it has.

Example combining multiple properties with breakpoints:

```javascript
map.transition(feature, {
  duration: 3000,
  ease: "elastic",
  paint: {
    "fill-color": ["#088", "#f00", "#00f", "#088"],
    "circle-radius": [5, 15, 10, 20],
    "fill-opacity": [1, 0.5, 0.8, 1],
  },
});
```

## Performance

The plugin is built to animate thousands of features at once. Three guarantees, all
pinned by tests in `tests/e2e/engine-perf.spec.ts`:

**One `requestAnimationFrame` for the whole map** — not one per feature. Animating 2,000
features schedules ~3 rAF callbacks per frame, not 2,000. The frame loop allocates
nothing: per-feature scratch objects are created once and reused.

**One `setFeatureState` write per animating feature per frame** — not one per property. A
feature animating radius, colour, and opacity together costs a single write.

**`delay` genuinely defers work.** A delayed transition writes its start value once,
synchronously, then costs nothing per frame until it begins. So staggering is *cheaper*
than firing flat — 2,000 features spread over a 3-second stagger do roughly an eighth of
the per-frame work of the same 2,000 fired at once.

Measured on a mid-range GPU with the `stress` demo: 5,000 features × 3 animated
properties (15,000 concurrent property transitions) holds 60fps, and the synchronous cost
of firing that whole batch is ~67ms. Cost scales linearly with feature count.

Two things worth knowing:

- **Firing a very large batch is not free.** Kicking 8,000 features × 3 properties is
  ~24,000 `transition()` calls and blocks for ~100ms — a visible hitch. It is linear, not
  quadratic, but if you are triggering tens of thousands of transitions from a click,
  spread the *calls* across a few frames.
- **The renderer usually binds before the plugin does.** While anything is animating,
  MapLibre repaints the whole map every frame. At high feature counts that repaint, not
  this plugin, is what costs you the frame budget.

## Live Demo

Interactive demos are available at: **[https://popkinj.github.io/maplibre-transition/](https://popkinj.github.io/maplibre-transition/)**

The demo site includes six pages:

| Page | What it teaches |
| --- | --- |
| **Playground** | Every option on the call, live — duration, ease, delay, multi-property `paint` — printing the exact object it runs. All 9 easings raced side by side. |
| **Color & Breakpoints** | A stop editor whose UI *is* the array you pass. Colors and numbers, 2–6 stops, piecewise ramps. |
| **Hover Effects** | `delay` as a hover-dwell threshold, and `[null, target]` as the reason you never need to remember what a feature looked like. |
| **Chained Transitions** | Sequences built purely on `onComplete` — no `setTimeout` anywhere. |
| **Stress** | 8,000 features, three channels each, on one rAF. Raise the stagger and watch `setFeatureState` calls per frame collapse. |
| **Rising City** | 5,000 real Vancouver buildings rising in 3D on staggered `fill-extrusion-height` transitions. |


## Development

```bash
# Install dependencies
npm install

# Build the plugin to dist/ (examples import the BUILT plugin, so run this
# after any change to src/ or the demos will not see it)
npm run build

# Rebuild on save
npm run dev

# Serve the demo site (examples/) at http://localhost:5173/maplibre-transition/
npm run serve:examples

# Re-fetch the Vancouver building footprints from OpenStreetMap.
# The result is committed; you only need this to regenerate it.
npm run data:buildings
```

## Testing

The project includes comprehensive unit and E2E tests.

### Unit Tests (Vitest)

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch
```

### E2E Tests (Playwright)

```bash
# Run E2E tests (headless)
npm run test:e2e

# Run E2E tests with interactive UI
npm run test:e2e:ui

# Run E2E tests in headed browser
npm run test:e2e:headed

# Run all tests (unit + E2E)
npm run test:all
```

## Deployment

### Publishing a release to npm

Publishing is automated via GitHub Actions using OIDC Trusted Publishing — no
local `npm login`, tokens, or 2FA required.

```bash
npm version patch                      # bump version, create commit + tag
git push origin main --follow-tags     # push both
gh release create v1.2.3 --generate-notes   # triggers the publish workflow
```

Creating the GitHub Release runs `.github/workflows/publish.yml`, which builds,
tests, verifies the tag matches `package.json`, and publishes with provenance.
See [DEPLOYMENT.md](DEPLOYMENT.md) for the full flow and the one-time trusted-publisher setup.

### Deploy demo pages to GitHub Pages

```bash
npm run deploy:examples
```

This builds the plugin and the demo site, then publishes the built output
(`examples-dist/`, *not* the `examples/` sources) to the `gh-pages` branch — so the demos
land at `https://popkinj.github.io/maplibre-transition/`.

> Adding or removing a demo page means editing **three** files together:
> `examples/index.html` (the card), `vite.examples.config.js` (`rollupOptions.input` — a
> missing entry silently never deploys; a stale one fails the build), and
> `tests/e2e/landing-page.spec.ts` (the expected-titles list).
