# Maplibre Transition Plugin

A utility plugin for Maplibre GL JS that adds feature level transition-related functionality.

## Compatibility

This plugin is compatible with MapLibre GL JS version 3.0.0 and above.

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

## Automatic Behaviors

### Mid-Animation Reversal

When `transition()` is called on a feature that already has a transition running, the plugin automatically reverses it. This enables smooth interactions like hover effects:

```javascript
// User hovers in, then quickly hovers out before animation completes
// No special handling needed - just call transition()
map.on('mouseleave', 'layer', () => {
  map.transition(feature, {
    duration: 150,
    ease: 'linear',
    paint: { 'circle-radius': [null, 12] }
  });
  // Plugin handles smooth reversal from current mid-animation position
});
```

### Best Practices for Hover Effects

When implementing hover effects on dense point layers:

1. **Store the full feature object**, not just the ID:

```javascript
let hoveredFeature = null;

map.on('mousemove', 'layer', (e) => {
  if (e.features.length === 0) return;
  const feature = e.features[0];

  // Early return if same feature
  if (hoveredFeature?.id === feature.id) return;

  // Clean up previous feature when moving A → B
  if (hoveredFeature !== null) {
    map.transition(hoveredFeature, {
      duration: 150,
      paint: { 'circle-radius': [null, 12] }
    });
  }

  hoveredFeature = feature;
  map.transition(feature, {
    duration: 400,
    paint: { 'circle-radius': [null, 20] }
  });
});

map.on('mouseleave', 'layer', () => {
  if (hoveredFeature === null) return;

  // Use stored feature directly - no queryRenderedFeatures needed
  map.transition(hoveredFeature, {
    duration: 150,
    paint: { 'circle-radius': [null, 12] }
  });

  hoveredFeature = null;
});
```

2. **Avoid `queryRenderedFeatures()`** on mouseleave - it may not find the feature if it's outside the viewport or return unexpected results with many features.

3. **Use the `[null, target]` pattern** to let the plugin handle current state detection and mid-animation reversal.

## Easing Types

The plugin supports the following easing functions from d3-ease:

- `"linear"` - Linear interpolation (no easing)
- `"quad"` - Quadratic easing (smooth acceleration/deceleration)
- `"cubic"` - Cubic easing (stronger acceleration/deceleration)
- `"elastic"` - Elastic easing (bouncy effect)
- `"bounce"` - Bounce easing (multiple bounces)
- `"circle"` - Circular easing (circular acceleration/deceleration)
- `"exp"` - Exponential easing (exponential acceleration/deceleration)
- `"poly"` - Polynomial easing (configurable power)
- `"sin"` - Sinusoidal easing (smooth sine wave)

Example with different easing:

```javascript
map.transition(feature, {
  duration: 1000,
  ease: "elastic", // Try different easing functions
  paint: {
    "fill-opacity": [0.1, 1],
  },
});
```

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

# Build the plugin
npm run build

# Run the development environment
npm run dev

# Open the development webserver that refreshes on saving.
npm run serve
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

This deploys the `examples/` directory to the `gh-pages` branch, making demos available at `https://popkinj.github.io/maplibre-transition/`.
