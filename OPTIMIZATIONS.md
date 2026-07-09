# Animation Optimization Findings

Analysis of jank sources in `src/index.ts` and recommendations for improvement.

> **Revision (2026-07-09):** Reviewed against the code and the shipped `hover-effects.html`
> demo. Points 1–3 confirmed; **points 4 and 5 were corrected** (the original diagnoses were
> wrong); a sixth finding — the real primary jank source — was added. The implementation
> section at the bottom is the spec we are building against.

---

## 1. `Date.now()` inside the rAF callback

**Severity: Low — sub-millisecond jitter, polish item**

`requestAnimationFrame` passes a high-precision `DOMHighResTimeStamp` to its callback,
synchronized to the frame boundary. The code ignores this parameter and samples `Date.now()`
inside the callback instead (`src/index.ts:146`), which is taken at call-time in the JS task
queue rather than at vsync.

This is real but small — on its own it is sub-millisecond jitter, not the dominant jank. Fix
it, but treat it as cleanup that rides along with the loop rewrite (finding 6), not the
headline.

**Recommendation:** Thread the rAF timestamp into the animation loop and use it directly.
**Critically, construction must switch to `performance.now()` at the same time** — `Date.now()`
is Unix-epoch based while the rAF timestamp and `performance.now()` are time-origin based. If
only one side changes, the two time bases won't match and every transition breaks.

```typescript
// Construction
const now = performance.now() + delay;

// Animation loop — use the timestamp the browser hands us
requestAnimationFrame((frameTime) => animateFeature(map, feature, transition, transitions, frameTime));
```

---

## 2. N independent rAF loops per feature

**Severity: High — redundant per-frame work**

When a feature animates multiple properties, the code spawns one `requestAnimationFrame` loop
*per property* (`src/index.ts:464-466`), and each loop already writes **all** properties in one
`setFeatureState` (`src/index.ts:191-200`). So a 3-property feature does 3 identical
`setFeatureState` calls per frame.

Mechanism nit vs. the original write-up: MapLibre coalesces repaints through its own render
loop, so this is **not** "3 GPU renders per frame." It is redundant CPU — feature-state
reprocessing — plus the cross-loop timestamp drift from finding 1. The conclusion still stands.

**Recommendation:** Run a single rAF loop per feature and batch all properties into one
`setFeatureState` per frame. (This is folded into finding 6's rewrite.)

---

## 3. Reversal logic silently discards the new target

**Severity: High — interrupted transitions animate/settle to the wrong value**

When `transition()` interrupts a running animation, the code computes *reversed* scales from the
old transition, stores them under the **old** keys with the **new** options, and never adds the
newly-computed target scales (`src/index.ts:443-461`). Then it starts `animateFeature` for the
new keys, which find the reversed transition and animate that. Confirmed worse than first
described:

- **Cross-property interruption fully breaks.** If the interrupting call targets a *different*
  property than the running one (running `radius`, new call `color`), the new property's loop
  finds no matching transition and returns immediately — **it never animates** — while the old
  property reverses. Simultaneous independent transitions on one feature are impossible today.
- **The completion snap goes to the wrong value.** The reversed transition is stored with the
  *new* options, so at completion the final-value logic (`src/index.ts:164-166`) reads the new
  target's last value and **snaps there**, even though it animated toward the old start the whole
  way. Position-continuous mid-flight, discontinuous at the end.

For symmetric hover in/out this happens to look right only because the reversed destination and
the new target coincide.

**Recommendation:** Don't reverse. Start a fresh transition from the property's *current* value
to the *new* target. This is already almost free: the feature-state written each frame means a
`[null, target]` call reads the current mid-animation value as its start (see the effective-values
logic at `src/index.ts:368-398`). Replacing the reversal branch with a plain "merge new scales in
and restart" dissolves this finding — and findings 4 and 5 with it.

---

## 4. `reverseScale` velocity discontinuity — and the original fix was wrong

**Severity: Moot once finding 3 is applied (reverseScale is dropped internally)**

The valid observation: `reverseScale` re-applies the easing function from zero
(`src/index.ts:246-250`), so with an ease-*in* curve the reversal restarts at **zero velocity**
regardless of how fast the property was moving at the cut point — a visible "stop and reverse"
lurch. This is **double easing**, and it is the real defect, not the duration.

**Correction to the original doc:** the first recommended fix — "use the *remaining* duration" —
is backwards. Interrupt a 400 ms tween at 380 ms and you are near the target and *far* from the
start; reversing should take *longer*, not the 20 ms of remaining time. The current elapsed-time
duration is actually a reasonable proxy for distance-from-start under linear easing. Only the
distance-proportional option was correct.

**Resolution:** We are removing internal use of `reverseScale` entirely (finding 3), so both the
double-easing lurch and the duration question disappear. The method stays on the public API for
back-compat but is no longer called; mark it deprecated.

---

## 5. `reverseScale` is broken for **colors**, not multi-breakpoint

**Severity: High (was mislabeled "Low / multi-breakpoint")**

The original doc said `reverseScale` breaks for multi-breakpoint numeric transitions because it
destructures only the first two domain/range values. **That diagnosis is wrong:**

- For **numeric multi-breakpoint** (e.g. `[12, 20, 12]`), the extra destructured values
  (`endValue`, `totalDuration`) are simply **unused dead code**. `startValue = range()[0]` is
  already the correct reversal target and `currentValue = scale(currentTime)` is computed
  correctly across all breakpoints. Numeric multi-breakpoint reversal basically **already works**.

- The real break is **colors**. Color scales store `.range()` as `[0, 1]`, not the colors
  (`src/index.ts:409`). So `reverseScale` sets `startValue = 0` while `currentValue` is a color
  *string*, then computes `"rgb(...)" + t * (0 - "rgb(...)")` → **`NaN`/garbage** fed straight
  into `setFeatureState`.

This is not theoretical: it is reachable in the shipped `hover-effects.html` demo. The
**color-shift** and **glow** effects animate `circle-color`/`circle-stroke-color`, and hovering
away mid-animation runs `reverseScale` on a color. That garbage-color path is a prime suspect for
the "jenky" colors that kicked off this review.

**Resolution:** Also dissolved by finding 3 — the fresh transition runs `circle-color` through the
color interpolator from the current color to the target, no numeric arithmetic on strings.

---

## 6. No `cancelAnimationFrame` — rAF loops accumulate on interruption (NEW)

**Severity: High — the most likely primary source of hover jank**

There is no `cancelAnimationFrame` anywhere in the plugin. A loop only stops when the transition
it references leaves the `transitions` Set. But on interruption the old transition is *replaced
under the same keys*, so the old loops find the replacement and **keep running** — and the
interrupting call starts *more* loops on top (`src/index.ts:464-466`).

Rapid hover in/out therefore stacks 2×, 3×, … overlapping rAF loops, all hammering
`setFeatureState` on the same feature every frame, draining only when a transition finally
completes uninterrupted. This compounds finding 2 and is specifically the behavior you'd feel as
hover jank.

**Recommendation:** Give each feature's transition explicit loop ownership: store the rAF handle,
`cancelAnimationFrame` it before starting/merging a new one, and have the loop bail if its
transition has been superseded. This is the same structural change that fixes findings 2 and 3.

---

## Summary

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 6 | No rAF cancellation → loops accumulate on interrupt | **High** | New — likely primary hover jank |
| 2 | One rAF loop + `setFeatureState` per property, not per feature | **High** | Confirmed |
| 3 | Reversal discards new target (+ cross-property + completion snap) | **High** | Confirmed, worse than described |
| 5 | `reverseScale` produces `NaN` for **color** transitions | **High** | Corrected (was "Low / multi-breakpoint") |
| 4 | `reverseScale` double-easing lurch; "remaining duration" fix was wrong | Moot | Corrected; resolved by removal |
| 1 | `Date.now()` vs rAF timestamp | Low | Confirmed; downgraded from High |

---

## Implementation plan

One structural change carries most of the value; the rest ride along.

1. **One cancellable rAF loop per feature** (fixes 2 + 6, and gives 3 a clean home).
   - Store the rAF handle on the transition object; `cancelAnimationFrame` before restart.
   - The loop bails immediately if its transition is no longer in the Set (supersession guard).
   - Gather every property into a single `setFeatureState` per frame.
   - Drive the loop with the rAF `frameTime`; switch construction to `performance.now()` (fixes 1).

2. **Replace reversal with restart-from-current** (fixes 3, and dissolves 4 + 5).
   - On interrupt, build fresh scales for the new target (they already start from current
     feature state) and **merge** them into the feature's transition, carrying forward any
     still-running properties the new call doesn't mention so independent transitions coexist.
   - Retire internal use of `reverseScale`; keep the method on the public API, marked deprecated.

3. **Robust final values.** Attach the true end time and final value to each wrapped scale at
   construction (works for numbers *and* colors) instead of re-deriving them from `.range()` at
   completion — the old range-based path is exactly what broke color reversal.

**Known limitation (accepted):** with the merge model, `options.onComplete` is latest-call-wins,
so a prior call's `onComplete` is dropped if a *different* call merges in before it settles. No
example hits this (chaining waits for completion, so transitions never overlap), and it is
strictly better than today's behavior. Revisit with per-property options only if a real use case
appears.
