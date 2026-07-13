# Documentation Improvements

** Test the implementation of everything below **

## 1. Document the `[null, targetValue]` Pattern — DONE

**Status: closed.** `[null, target]` is real, is tested, and is now the documented
default everywhere.

- It is **not** a fake pattern. A `null` start resolves to the feature's current
  feature-state value, falling back to the layer's paint fallback if the feature has
  no state yet. Verified mid-flight, from rest, and after a completed transition.
- It is now the **only** pattern used in `examples/hover-effects.html`. The hover page
  carries **zero value bookkeeping**: a single `REST = { light, dark }` object is both
  the layer's initial paint spec and the release target, and every call in both
  directions is `[null, target]`. (It still keeps a reference to the hovered *feature
  object* — you need to know *which* feature to send home on an A→B move, since
  MapLibre fires no `mouseleave` for A — but it no longer remembers what that feature
  *looked like*.)
- Documented in `README.md` → "Using `null` as Start Value", and in the paint-ownership
  section: **always** use `[null, target]` to re-trigger mid-flight. An explicit start
  (`[0, 60]` on a feature currently at 45) builds a three-stop scale `[45, 0, 60]` that
  visibly dives to 0 first.
- Regression tests: `tests/e2e/interruptions.spec.ts`, `tests/e2e/hover-effects.spec.ts`.

The original text is kept below for context.

### Current Pattern (verbose, error-prone)

```javascript
// Manually tracking hover state
let hoveredFeatureState = null;

map.on("mousemove", "layer", (e) => {
  // Store end state manually
  hoveredFeatureState = { "circle-radius": 20, "circle-opacity": 1 };

  map.transition(feature, {
    paint: {
      "circle-radius": [12, 20],
      "circle-opacity": [0.7, 1],
    },
  });
});

map.on("mouseleave", "layer", () => {
  // Must remember what we transitioned TO in order to reverse
  map.transition(feature, {
    paint: {
      "circle-radius": [hoveredFeatureState["circle-radius"], 12],
      "circle-opacity": [hoveredFeatureState["circle-opacity"], 0.7],
    },
  });
});
```

### Recommended Pattern (simpler)

```javascript
// No need to track hover state - plugin queries it internally
map.on("mousemove", "layer", (e) => {
  map.transition(feature, {
    paint: {
      "circle-radius": [null, 20], // null = "from current state"
      "circle-opacity": [null, 1],
    },
  });
});

map.on("mouseleave", "layer", () => {
  map.transition(feature, {
    paint: {
      "circle-radius": [null, 12], // automatically knows current value
      "circle-opacity": [null, 0.7],
    },
  });
});
```

The plugin uses `getFeatureState()` and `getPaintProperty()` internally (lines 294-318, 374-389 in index.ts) to determine the current value when `null` is provided.

---

## 2. Document Auto-Reversal of In-Progress Transitions — DONE

**Status: closed**, and the mechanism described below is now out of date.

Interruption no longer works by "reversing a scale". A new call on a property that is
already in flight **supersedes** it: a fresh sampler is built starting from the current
feature-state value. `reverseScale()` is deprecated, retained only for API compatibility,
and is not on the interruption path. Documented in `README.md` → "Interrupting a Running
Transition" (which also spells out the `[0, 60]`-mid-flight footgun) and `CLAUDE.md` →
"The scheduler".

The important consequence, now documented: **a superseded call's `onComplete` never
fires.** That is what makes `onComplete` chains cancellable — `examples/chained-transitions.html`
stops a running chain purely by superseding its in-flight step, with no `clearTimeout`.

Original text below.

When `transition()` is called on a feature that already has a transition running, the plugin automatically reverses it using `reverseScale()` (lines 428-452). This isn't obvious from the API but is very useful.

### Example: Rapid Hover In/Out

```javascript
// User hovers in, then quickly hovers out before animation completes
// The plugin automatically:
// 1. Detects existing transition for this feature
// 2. Calculates current mid-animation value
// 3. Reverses from current position back to target

// No special handling needed - just call transition()
map.transition(feature, {
  duration: 150,
  ease: "linear",
  paint: { "circle-radius": [null, 12] },
});
// Plugin handles the smooth reversal automatically
```

---

## 3. Add Example: Mouse Movement Between Features — DONE

**Status: closed.** `examples/hover-effects.html` now stores the full feature object
from `e.features[0]` (never `queryRenderedFeatures()` on leave), handles the A→B move
where no `mouseleave` fires for A, and releases A with `[null, target]`. The pattern is
documented in `README.md` → "Best Practices for Hover Effects", and covered by
`tests/e2e/hover-effects.spec.ts`.

The page also demonstrates something this TODO did not anticipate: `delay` used as a
**hover-dwell threshold**. The effect is armed with `{ delay: dwellMs }`; leaving
supersedes every channel it scheduled, so a pending effect is cancelled outright and its
`onStart` / `onComplete` never fire. No timer arms, cancels, or fires anything.

Original text below.

The current hover example only handles single-feature hover with `mousemove`/`mouseleave`. It doesn't demonstrate the common case of moving directly from feature A to feature B without `mouseleave` firing for A.

### Important: Store the Feature Object, Not Just the ID

The current hover example stores `hoveredFeatureId` and uses `queryRenderedFeatures()` to find the feature later. This can be unreliable because:

1. `queryRenderedFeatures()` may not find the feature if it's outside the viewport
2. The query returns features in render order, which can vary
3. With many features, the `find()` operation may behave unexpectedly
4. The queried feature object may have different properties than the original

**Recommended**: Store the full feature object from the mousemove event and reuse it directly.

### Suggested Addition to hover-effects.html

```javascript
// Store the full feature object, not just the ID
let hoveredFeature = null;

map.on("mousemove", "cities-layer", (e) => {
  if (e.features.length === 0) return;

  const feature = e.features[0];

  // Early return if same feature - no action needed
  if (hoveredFeature && hoveredFeature.id === feature.id) return;

  // If moving from feature A to feature B, reverse A's animation first
  // Use stored feature object directly - no queryRenderedFeatures needed
  if (hoveredFeature !== null) {
    map.transition(hoveredFeature, {
      duration: 150,
      ease: "linear",
      paint: {
        "circle-radius": [null, defaults["circle-radius"]],
        "circle-opacity": [null, defaults["circle-opacity"]],
      },
    });
  }

  // Store the new feature object (not just the ID)
  hoveredFeature = feature;

  map.transition(feature, {
    duration: 400,
    ease: "bounce",
    paint: {
      "circle-radius": [null, 20],
      "circle-opacity": [null, 1],
    },
  });
});

map.on("mouseleave", "cities-layer", () => {
  if (hoveredFeature === null) return;

  // Use stored feature object directly - always reliable
  map.transition(hoveredFeature, {
    duration: 150,
    ease: "linear",
    paint: {
      "circle-radius": [null, defaults["circle-radius"]],
      "circle-opacity": [null, defaults["circle-opacity"]],
    },
  });

  hoveredFeature = null;
});
```

This pattern is essential for dense point layers where users frequently move between features without leaving the layer entirely.

### Why This Works Better

The feature object from `e.features[0]` contains all the properties the plugin needs:

- `feature.id` - for identifying the feature
- `feature.source` - for `setFeatureState()` calls
- `feature.layer.id` - for `getPaintProperty()` calls

By storing and reusing this object, you avoid the unreliable `queryRenderedFeatures()` lookup entirely.

---

## 4. Resolved: `null` Start Value After Transition Completion

**Status: fixed.** `[null, target]` after a transition has completed now animates
smoothly from the settled value instead of snapping to the target.

The refactor that replaced `reverseScale` with "start a fresh transition from the
current feature-state value" made the start value robust: it falls back through
feature state → the paint property's `coalesce` default → the target, so the
degenerate single-value scale that caused the snap no longer occurs in normal use.
On completion the animation writes the final value to feature state (`animateFeature`,
the `now >= endTime` branch in `src/index.ts`), so a later `[null, …]` reads it back
as the start value.

Regression test: `tests/e2e/interruptions.spec.ts` →
_"null start value after a completed transition animates from current state (no snap)"_.

One narrow edge remains: a malformed call with no target (e.g. `[null]`) on a feature
with no state and no readable paint default can still divide by zero in the domain
calc (`numericValues.length - 1 === 0`). Not a real usage pattern — guard it only if
it ever surfaces.

---

## 5. API Documentation Updates — DONE

**Status: closed.** All of the below is in `README.md`, plus four things this list did
not know about:

- **Paint ownership** — once the plugin has transitioned a `(layer, paint-property)`
  pair, `setPaintProperty` on it silently destroys every feature's animated state.
  This is now the loudest rule in the README.
- **`delay` semantics** — it genuinely defers work; staggering a mass trigger is
  *cheaper* than firing it flat, not more expensive.
- **Callback timing** — `onStart` fires synchronously iff `delay === 0`; a superseded
  call's `onComplete` never fires.
- **Color spaces** — the old README claimed HSL and LAB interpolation. That was never
  true (the branches were unreachable dead code and are now deleted). All interpolation
  is sRGB. CSS `lab()` is not even parseable. Corrected.

Original text below.

### TransitionOptions.paint

```typescript
paint: {
  // Standard: explicit start and end values
  'circle-radius': [12, 20],

  // Shorthand: null means "use current state as start"
  'circle-radius': [null, 20],

  // Multi-breakpoint: animate through multiple values
  'circle-radius': [12, 20, 16],
}
```

### Automatic Behaviors

- **Current state detection**: When first value is `null`, uses `getFeatureState()` or `getPaintProperty()`
- **Mid-animation reversal**: Calling `transition()` on a feature with active transition reverses it smoothly
- **Paint property modification**: Automatically wraps paint properties in `coalesce` expressions for feature-state support

---

## Still open

- **`poly` and `cubic` are the same curve.** d3's `easePoly` is `easePolyInOut` at its
  default exponent 3 — literally `easeCubicInOut`. So `ease` advertises 9 names but
  yields **8 distinct curves**. Fixing this means exposing the exponent, which is an
  API change. Until then, the docs should not imply 9 distinct curves.
- **Eased values are clamped to `[0, 1]` (`src/index.ts:178`), so `elastic` never
  overshoots the target.** `d3.easeElastic` naturally peaks at ~`1.373`; the clamp pins
  it at the target, so the characteristic spring-past-and-back is lost. Decide whether to
  unclamp (a real behaviour change — it would let any transition briefly exceed its target
  value, which callers may not expect for e.g. `circle-opacity` or `fill-extrusion-height`)
  or to keep documenting the clamp.
  **`bounce` is unaffected** — `d3.easeBounce` stays within `[0, 1]` by construction
  (verified: range `0.000 → 1.000`), so it behaves exactly as advertised. An earlier
  version of this note wrongly lumped it in with `elastic`.
  Documented for now in `README.md` → "Two honest caveats", which also gives the
  workaround: express overshoot explicitly as a breakpoint array, `[null, 24, 20]`.
- **The e2e suite is flaky against the Vite dev server**, because HMR broadcasts a
  `full-reload` to every open page on any HTML/JS save, wiping page state mid-assertion.
  Two independent agents reproduced this. Fix properly by running e2e against a built
  `vite preview`, or by disabling HMR for tests, rather than per-spec `page.route`
  workarounds.
- **`/favicon.ico` 404s on every example page.** Harmless, but noisy.
