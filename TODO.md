# Documentation Improvements

** Test the implementation of everything below **

## 1. Document the `[null, targetValue]` Pattern

The hover example doesn't demonstrate that `null` can be used as the first value to mean "from current state". This is a powerful feature that avoids manual state tracking.

Something tells me that using null is a fake pattern. There's a good chance the plugin ignores the first value if there is a current transition in place.

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

## 2. Document Auto-Reversal of In-Progress Transitions

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

## 3. Add Example: Mouse Movement Between Features

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

## 5. API Documentation Updates

Consider adding to README or API docs:

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
