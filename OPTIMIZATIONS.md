# Animation Optimization Findings

Analysis of jank sources in `src/index.ts` and recommendations for improvement.

---

## 1. `Date.now()` inside the rAF callback

**Severity: High — frame-by-frame micro-stutter**

`requestAnimationFrame` passes a high-precision `DOMHighResTimeStamp` to its callback, synchronized to when the frame was *actually rendered* by the browser compositor. The code ignores this parameter and calls `Date.now()` instead:

```typescript
function animateFeature(map: Map, feature: any, keyName: string, transitionsSet: Set<any>) {
  const now = Date.now();  // sampled AFTER rAF fires, not at the frame boundary
```

`Date.now()` is sampled at call-time in the JS task queue, not at the vsync boundary. This introduces micro-jitter on every frame — the time step between frames becomes uneven even on a 60Hz display.

**Recommendation:** Thread the rAF timestamp through to `animateFeature` and use it instead of `Date.now()`. The transition domain (currently built with `Date.now()` at construction time) should also be switched to `performance.now()` so both the start time and per-frame sample share the same time base.

```typescript
// Construction
const now = performance.now() + delay;

// Animation loop
requestAnimationFrame((frameTime) => animateFeature(map, feature, keyName, transitionsSet, frameTime));

function animateFeature(map, feature, keyName, transitionsSet, now: number) {
  // use `now` directly instead of Date.now()
}
```

---

## 2. N independent rAF loops per feature

**Severity: High — redundant renders and timestamp drift between properties**

When a feature has multiple properties animating simultaneously, the code spawns one `requestAnimationFrame` loop per property:

```typescript
Object.keys(scales).forEach(keyName => {
  animateFeature(map, feature, keyName, transitionsSet);
});
```

Each loop independently calls `Date.now()` and calls `setFeatureState` with **all** properties in the transition. For a feature with 3 animating properties, this means:
- 3 separate rAF callbacks per display frame
- 3 `setFeatureState` calls per frame for the same feature
- Each call samples a slightly different timestamp, so properties are technically out of sync
- MapLibre may re-render up to 3 times per frame for a single feature

**Recommendation:** Run a single rAF loop per feature (keyed on `feature.id`), not per property. All properties in the transition should be batched into one `setFeatureState` call per frame.

```typescript
// One loop per feature, not per property
animateFeature(map, feature, sharedProperties.transitions);

function animateFeature(map, feature, transitionsSet, frameTime) {
  // gather all properties for this feature in one pass
  // call setFeatureState once
  // schedule one requestAnimationFrame
}
```

---

## 3. Reversal logic silently discards the new target

**Severity: Medium — interrupted transitions ignore the intended destination**

When `transition()` is called on a feature that already has an animation running, the code computes reversed scales, removes the old transition, and adds the reversed one — but then starts `animateFeature` for the *new* scales. Since both share the same key format (`${feature.id}-${style}`), `animateFeature` finds the reversed transition in the Set (not the new one) and animates that, completely discarding the new call's `paint` values:

```typescript
if (existingTransitions.length > 0) {
  existingTransitions.forEach(transition => {
    sharedProperties.transitions.add({ ...reversedScales, options });  // reversed scale added
  });
} else {
  sharedProperties.transitions.add({ ...scales, options });  // new scales only added on clean start
}

// animateFeature runs but finds reversedScales, not scales — new target is lost
Object.keys(scales).forEach(keyName => {
  animateFeature(map, feature, keyName, transitionsSet);
});
```

For hover in/out this happens to work by coincidence — reversing the hover animation does go back toward the default value. But any case where the new target differs from the interrupted transition's original start value will silently animate to the wrong destination.

**Recommendation:** On interruption, start a new transition from the current mid-animation value to the *new* target (from the interrupting call), rather than reversing back to the original start. If true reversal is the desired API contract, it should be clearly documented and the discarding of the new `paint` values should be intentional and explicit.

---

## 4. `reverseScale` duration based on elapsed time, not value progress

**Severity: Medium — velocity discontinuity at reversal point**

```typescript
const elapsedTime = currentTime - startTime;
.domain([currentTime, currentTime + elapsedTime])
```

The reversal duration equals however long the original transition had been running. A hover interrupted after 50ms of a 400ms animation produces a 50ms reversal; interrupted after 380ms produces a 380ms reversal. With non-linear easing (elastic, bounce, cubic), the value's velocity at the cut point does not match the velocity at the start of the reversed easing curve, creating a visible snap or lurch at the moment of reversal.

**Recommendation:** Either:
- Use the *remaining* duration for the reversal (so the reversal feels as "long" as the transition had left to go), or
- Calculate the proportional remaining distance and use a duration proportional to that distance

---

## 5. `reverseScale` broken for multi-breakpoint transitions

**Severity: Low — affects pulse/cycle-style animations**

```typescript
const [startTime, endTime] = scale.domain();
const [startValue, endValue] = scale.range();
```

For multi-breakpoint transitions (e.g. `[12, 20, 12]`), the domain has 3+ points and the range has 3+ values. Destructuring only the first two elements means `reverseScale` uses incorrect start/end values for any piecewise animation. Reversing a pulse or color-cycle mid-animation will jump to an unexpected value.

**Recommendation:** When reversing a multi-breakpoint transition, use `scale(currentTime)` as the start (current mid-animation value) and the *first* range value as the end target. The reversal should always be a simple two-point transition from current → original start, regardless of how many breakpoints the original had.

---

## Summary

| # | Issue | Severity | Root Cause |
|---|-------|----------|------------|
| 1 | `Date.now()` vs rAF timestamp | High | Time sampled outside vsync boundary |
| 2 | N rAF loops → N `setFeatureState` calls/frame | High | One loop spawned per property |
| 3 | Reversal discards new target | Medium | New scales never added to transitions Set on interruption |
| 4 | Reversal duration based on elapsed, not remaining | Medium | Velocity discontinuity with non-linear easing |
| 5 | `reverseScale` broken for multi-breakpoint | Low | Destructures only first two domain/range values |

Issues 1 and 2 together are the primary source of visible jitter. Fixing both would significantly smooth out animations before addressing the reversal logic.
