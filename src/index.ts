import type { Map as MapLibreMap } from "maplibre-gl";
import * as d3Ease from "d3-ease";
import { interpolateRgb } from "d3-interpolate";
import { rgb } from "d3-color";

/**
 * Configuration options for feature transitions.
 * @interface TransitionOptions
 * @property {number} [duration=1000] - Duration of the transition in milliseconds
 * @property {string} [ease="linear"] - Easing function to use for the transition
 * @property {number} [delay=0] - Delay before starting the transition in milliseconds.
 *   The start value is written once, synchronously; no per-frame work is done until
 *   the delay elapses.
 * @property {Record<string, (string | number | null)[]>} [paint] - Paint properties to
 *   transition, mapping property names to arrays of values. A leading `null` means
 *   "start from the feature's current value".
 * @property {() => void} [onComplete] - Called once, when every paint property from
 *   *this* call has finished. Never called if any of them is superseded by a later call.
 * @property {() => void} [onStart] - Called once. Synchronously iff `delay === 0`;
 *   otherwise on the frame the transition actually begins.
 */
export interface TransitionOptions {
  duration?: number;
  ease?:
    | "linear"
    | "quad"
    | "cubic"
    | "elastic"
    | "bounce"
    | "circle"
    | "exp"
    | "poly"
    | "sin";
  delay?: number;
  paint?: Record<string, (string | number | null)[]>;
  onComplete?: () => void;
  onStart?: () => void;
}

/**
 * Represents the current state of a feature's transition properties.
 * @interface TransitionState
 * @property {string | number} [key: string] - Maps style property names to their current values
 */
export interface TransitionState {
  [key: string]: string | number;
}

/**
 * Collection of samplers used for transitioning different properties.
 * @interface TransitionScales
 * @property {any} [key: string] - Maps transition keys to their corresponding samplers
 */
export interface TransitionScales {
  [key: string]: any;
}

// Extend MapLibre's Map interface to include our transition functionality
declare module "maplibre-gl" {
  interface Map {
    T: {
      (feature: any, options?: TransitionOptions): void;
      transitions: Set<any>;
      listLayerTransitions: (layerId: string) => any[];
    };
    transition: {
      (feature: any, options?: TransitionOptions): void;
      transitions: Set<any>;
      listLayerTransitions: (layerId: string) => any[];
    };
  }
}

/** A sampler maps a timestamp (performance.now-based) to a paint value. */
export type Sampler = (t: number) => string | number;

/** An easing function: [0,1] -> roughly [0,1] (elastic/back may overshoot). */
type EaseFn = (t: number) => number;

/**
 * Converts a camelCase string to kebab-case.
 * @param {string} str - The string to convert
 * @returns {string} The converted kebab-case string
 */
function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * Detects if values are colors and returns the appropriate interpolator.
 *
 * The per-segment d3 interpolators are built ONCE, here, rather than on every
 * frame. `rgb()` from d3-color never returns null - it returns an Rgb with NaN
 * channels for unparseable input - so the parse guard checks for NaN.
 *
 * @param {Array<string | number>} values - Array of values to interpolate between
 * @returns {Function|null} The interpolator over t in [0,1], or null if not colors
 */
function getColorInterpolator(
  values: (string | number)[]
): ((t: number) => string) | null {
  // Only try color interpolation if all values are strings
  if (!values.every((v) => typeof v === "string")) {
    return null;
  }
  if (values.length === 0) return null;

  const colors: any[] = [];
  for (let i = 0; i < values.length; i++) {
    const c = rgb(values[i] as string);
    // Unparseable input yields an Rgb with NaN channels, not null.
    if (!c || Number.isNaN(c.r) || Number.isNaN(c.g) || Number.isNaN(c.b)) {
      return null;
    }
    colors.push(c);
  }

  const last = colors[colors.length - 1].toString();
  if (colors.length === 1) return () => last;

  // One interpolator per segment, precomputed.
  const segments: ((t: number) => string)[] = [];
  for (let i = 0; i < colors.length - 1; i++) {
    segments.push(interpolateRgb(colors[i], colors[i + 1]));
  }
  const n = segments.length;

  return (t: number) => {
    const ct = clamp01(t);
    if (ct === 1) return last;
    const pos = ct * n;
    let i = pos | 0;
    if (i >= n) i = n - 1;
    return segments[i](pos - i);
  };
}

/**
 * Builds a numeric sampler: a direct piecewise linear interpolation over
 * `values`, driven by `easeFn` across [start, start + duration].
 *
 * Replaces the old d3 `scaleLinear()` path, which allocated ~20 scale methods
 * onto every sampler via `Object.assign`.
 *
 * Guarantees:
 *  - at t >= start + duration the sampler returns `values[values.length - 1]`
 *    EXACTLY (so `[10, 30, 10]` lands on 10, not 9.999...).
 *  - t outside [start, start + duration] is clamped to the endpoint values.
 *  - `duration <= 0` returns the final value immediately.
 *
 * @param {number[]} values - Breakpoint values (2+ for a tween, 1 for a constant)
 * @param {number} start - Start timestamp, delay included
 * @param {number} duration - Duration in ms
 * @param {EaseFn} easeFn - Easing function
 * @returns {Sampler} The sampler
 */
function createNumericSampler(
  values: number[],
  start: number,
  duration: number,
  easeFn: EaseFn
): Sampler {
  const n = values.length;
  const finalValue = values[n - 1];
  if (n === 1) return () => finalValue;

  const segments = n - 1;

  return (t: number) => {
    const progress = duration > 0 ? clamp01((t - start) / duration) : 1;
    // Easing can overshoot (elastic, back); clamping the eased value reproduces
    // d3's `.clamp(true)` domain clamping exactly.
    const eased = clamp01(easeFn(progress));
    if (eased >= 1) return finalValue;
    if (eased <= 0) return values[0];

    const pos = eased * segments;
    let i = pos | 0;
    if (i >= segments) i = segments - 1;
    const a = values[i];
    const b = values[i + 1];
    return a + (b - a) * (pos - i);
  };
}

/**
 * One animating paint property on one feature.
 *
 * `start` already includes the call's `delay`. `key` is the back-compat facade
 * key (`${featureId}-${style}`) exposed on the object in `map.transition.transitions`.
 */
interface Channel {
  style: string;
  key: string;
  sample: Sampler;
  start: number;
  end: number;
  final: string | number;
  begun: boolean;
  group: Group;
}

/**
 * One `map.transition()` call. Callbacks live here, not on the per-feature
 * transition object, so a later call on a *different* property can never clobber
 * an earlier call's `onComplete`.
 */
interface Group {
  options: TransitionOptions | undefined;
  remaining: number;
  cancelled: boolean;
  started: boolean;
}

/** Per-feature scheduling record. `state` and `target` are allocated once and reused. */
interface FeatureRecord {
  key: string;
  target: { source: string; sourceLayer: string | undefined; id: any };
  state: TransitionState;
  channels: Channel[];
  facade: any;
  startMin: number;
  /** 0 = pending (delay not elapsed), 1 = running, -1 = retired/unscheduled */
  list: 0 | 1 | -1;
}

/** Internal state hangs off a Symbol so it stays invisible to Object.keys(). */
const RECORD = Symbol("maplibre-transition:record");

/**
 * Initializes the transition plugin on a MapLibre map instance.
 * This function adds the transition functionality to the map object and sets up
 * the necessary methods and properties.
 *
 * @param {MapLibreMap} map - The MapLibre map instance to initialize
 */
export function init(map: MapLibreMap): void {
  // ---------------------------------------------------------------------------
  // Scheduler state (one set per map)
  // ---------------------------------------------------------------------------

  /** The public Set. One entry per feature with a scheduled-or-running transition. */
  const transitions = new Set<any>();
  /** featureKey -> record. Replaces the old O(N) scan of `transitions`. */
  const byFeature = new Map<string, FeatureRecord>();
  /** Records actively sampling. */
  const running: FeatureRecord[] = [];
  /** Records whose delay has not elapsed. These cost nothing per frame. */
  const pending: FeatureRecord[] = [];
  /** `${layerId}\0${kebabStyle}` -> { fallback, installed } (getPaintProperty deep-clones). */
  const paintFallbacks = new Map<string, { fallback: any; installed: boolean }>();
  /** Callbacks are queued during a frame and flushed after it, so a re-entrant
   *  map.transition() from onStart/onComplete cannot mutate arrays mid-iteration. */
  const callbackQueue: (() => void)[] = [];
  /** Scratch, reused: channels that finished on the current frame. */
  const finished: Channel[] = [];

  let rafId: number | null = null;

  // The source is part of the key: the same numeric id in two different sources
  // is two different features.
  const featureKey = (f: any): string =>
    `${f.source}\u0000${f.sourceLayer ?? ""}\u0000${f.id}`;

  // The style may be re-loaded (e.g. a theme swap via setStyle). Paint fallbacks
  // and "have we installed the coalesce expression" must be re-derived after that.
  map.on("style.load", () => {
    paintFallbacks.clear();
  });

  /**
   * Cached read of a layer's paint property. `map.getPaintProperty()` deep-clones
   * the expression on every call, which is unaffordable on a mass trigger.
   */
  function getPaintEntry(layerId: string, kebabStyle: string) {
    const cacheKey = `${layerId}\u0000${kebabStyle}`;
    let entry = paintFallbacks.get(cacheKey);
    if (entry !== undefined) return entry;

    const current = map.getPaintProperty(layerId, kebabStyle);
    if (Array.isArray(current) && current[0] === "coalesce") {
      // Already ours: the fallback is the third element.
      entry = { fallback: current[2], installed: true };
    } else {
      // A scalar, a plain expression (preserved as the fallback), or undefined.
      entry = { fallback: current, installed: false };
    }
    paintFallbacks.set(cacheKey, entry);
    return entry;
  }

  // ---------------------------------------------------------------------------
  // The single global rAF loop
  // ---------------------------------------------------------------------------

  function ensureRaf() {
    if (rafId === null) rafId = requestAnimationFrame(frame);
  }

  function retire(rec: FeatureRecord) {
    rec.list = -1;
    byFeature.delete(rec.key);
    transitions.delete(rec.facade);
  }

  /**
   * Samples one feature and writes ONE setFeatureState for it. Returns false when
   * the record has no channels left and should be retired.
   */
  function step(rec: FeatureRecord, now: number): boolean {
    const channels = rec.channels;
    const state = rec.state;
    let write = 0;
    let keep = 0;

    for (let i = 0; i < channels.length; i++) {
      const c = channels[i];

      if (!c.begun) {
        if (now < c.start) {
          // Still waiting. Its start value was written once, synchronously, at
          // call time - there is nothing to do.
          channels[keep++] = c;
          continue;
        }
        c.begun = true;
        const g = c.group;
        if (!g.started) {
          g.started = true;
          if (g.options && g.options.onStart) callbackQueue.push(g.options.onStart);
        }
      }

      if (now >= c.end) {
        // Snap to the exact final value, write it this frame, then drop it.
        state[c.style] = c.final;
        write++;
        finished.push(c);
      } else {
        state[c.style] = c.sample(now);
        write++;
        channels[keep++] = c;
      }
    }
    channels.length = keep;

    if (write > 0) map.setFeatureState(rec.target, state);

    for (let i = 0; i < finished.length; i++) {
      const c = finished[i];
      // Stop re-writing a settled property every frame.
      delete state[c.style];
      delete rec.facade[c.key];
      const g = c.group;
      g.remaining--;
      if (g.remaining === 0 && !g.cancelled && g.options && g.options.onComplete) {
        callbackQueue.push(g.options.onComplete);
      }
    }
    finished.length = 0;

    return channels.length > 0;
  }

  function frame(now: number) {
    rafId = null;

    // Promote pending -> running. A pending record does zero per-frame work.
    if (pending.length > 0) {
      let keep = 0;
      for (let i = 0; i < pending.length; i++) {
        const rec = pending[i];
        // list !== 0 means it was promoted early (a delay-0 call arrived) or retired.
        if (rec.list !== 0) continue;
        if (now >= rec.startMin) {
          rec.list = 1;
          running.push(rec);
        } else {
          pending[keep++] = rec;
        }
      }
      pending.length = keep;
    }

    // Step every running record, compacting the array in place. No closures, no
    // per-feature rAF, no per-frame allocation.
    let keep = 0;
    for (let i = 0; i < running.length; i++) {
      const rec = running[i];
      if (rec.list !== 1) continue;
      if (step(rec, now)) running[keep++] = rec;
      else retire(rec);
    }
    running.length = keep;

    // Callbacks run after the frame is fully settled, so they may safely start
    // new transitions (chaining) without corrupting the arrays we just walked.
    if (callbackQueue.length > 0) {
      for (let i = 0; i < callbackQueue.length; i++) {
        try {
          callbackQueue[i]();
        } catch (e) {
          console.error("maplibre-transition: transition callback threw", e);
        }
      }
      callbackQueue.length = 0;
    }

    // A callback may already have scheduled the next frame via map.transition().
    if (rafId === null && (running.length > 0 || pending.length > 0)) {
      rafId = requestAnimationFrame(frame);
    }
  }

  // ---------------------------------------------------------------------------
  // Public object
  // ---------------------------------------------------------------------------

  const sharedProperties = {
    /** Set of all active transitions: one entry per feature. */
    transitions,

    /**
     * Lists all active transitions for a specific layer.
     * This is useful for debugging and monitoring transition states.
     *
     * @param {string} layerId - The ID of the layer to check for transitions
     * @returns {any[]} Array of transition objects for the specified layer
     */
    listLayerTransitions: (layerId: string) => {
      const layer = map.getLayer(layerId);
      if (!layer) {
        console.warn(`Layer ${layerId} not found`);
        return [];
      }
      const sourceId = (layer as any).source;
      const sourceFeatures = map.querySourceFeatures(sourceId);
      return Array.from(transitions).filter((transition: any) => {
        const keys = Object.keys(transition);
        return keys.some((key) =>
          sourceFeatures.some((f) => key.startsWith(`${f.id}-`))
        );
      });
    },
  };

  // ---------------------------------------------------------------------------
  // map.transition()
  // ---------------------------------------------------------------------------

  const transitionFunction = function (feature: any, options?: TransitionOptions) {
    const { duration = 1000, delay = 0, ease = "linear" } = options || {};
    const paintProperties = options?.paint;
    if (!paintProperties) return;

    const styles = Object.keys(paintProperties);
    if (styles.length === 0) return;

    // performance.now() shares its time origin with the rAF timestamp, so the
    // start time and every per-frame sample agree.
    const start = performance.now() + delay;
    const end = start + duration;

    const easeName = `ease${
      ease.charAt(0).toUpperCase() + ease.slice(1)
    }` as keyof typeof d3Ease;
    const easeFn = ((d3Ease as any)[easeName] || d3Ease.easeLinear) as EaseFn;

    const source = feature.source;
    const sourceLayer = feature.sourceLayer;
    const id = feature.id;
    const layerId = feature.layer.id;

    const currentFeatureState =
      map.getFeatureState({ source, sourceLayer, id }) || {};

    // --- 1. resolve start values -------------------------------------------
    // The paint fallback is read from the (memoized) layer paint property.
    const initialState: TransitionState = {};
    const startValues: (string | number | undefined)[] = new Array(styles.length);
    const entries: { fallback: any; installed: boolean }[] = new Array(styles.length);

    for (let i = 0; i < styles.length; i++) {
      const style = styles[i];
      const values = paintProperties[style];
      const entry = getPaintEntry(layerId, camelToKebab(style));
      entries[i] = entry;

      const firstNonNull = values.find((v) => v !== null && v !== undefined);
      // Only a scalar paint value can seed a numeric/color start; a raw
      // expression (e.g. a `case`) is preserved as the coalesce fallback but is
      // not a value we can interpolate from.
      const scalarDefault =
        typeof entry.fallback === "string" || typeof entry.fallback === "number"
          ? entry.fallback
          : undefined;
      const defaultValue = scalarDefault !== undefined ? scalarDefault : firstNonNull;

      const featureStateValue = currentFeatureState[style];
      const startValue =
        featureStateValue !== undefined ? featureStateValue : defaultValue;
      startValues[i] = startValue as string | number | undefined;

      if (startValue !== undefined && startValue !== null) {
        initialState[style] =
          typeof startValue === "string" ? startValue : Number(startValue);
      }
    }

    // --- 2. write the start value ONCE, synchronously -----------------------
    // This happens BEFORE the paint property is rewritten, so the coalesce
    // expression never evaluates against an empty feature state (no flash). It
    // is also what makes `delay` free: the feature already looks right while it
    // waits, and no frame work accrues until its start time arrives.
    map.setFeatureState({ source, sourceLayer, id }, initialState);

    // --- 3. install the coalesce paint expressions (once per layer+property) -
    for (let i = 0; i < styles.length; i++) {
      const entry = entries[i];
      if (entry.installed) continue;
      const style = styles[i];
      const values = paintProperties[style];
      const fallbackValue =
        entry.fallback !== undefined && entry.fallback !== null
          ? entry.fallback
          : values.find((v) => v !== null && v !== undefined);

      map.setPaintProperty(layerId, camelToKebab(style), [
        "coalesce",
        ["feature-state", style],
        fallbackValue,
      ]);
      entry.installed = true;
    }

    // --- 4. build the channels ----------------------------------------------
    const group: Group = {
      options,
      remaining: styles.length,
      cancelled: false,
      started: false,
    };
    const channels: Channel[] = new Array(styles.length);

    for (let i = 0; i < styles.length; i++) {
      const style = styles[i];
      const values = paintProperties[style];
      const startValue = startValues[i];

      // A leading null/undefined means "from wherever the property is right now".
      // Because every new sampler starts from the feature's *current* state,
      // interrupting a running transition simply continues from there - no
      // reverse scale required.
      const firstValue = values[0];
      let effectiveValues: (string | number)[];

      if (firstValue === null || firstValue === undefined) {
        if (startValue !== undefined && startValue !== null) {
          effectiveValues = [startValue, ...(values.slice(1) as (string | number)[])];
        } else {
          // Last resort: use the target as the start (a no-op tween) rather than
          // producing a single-value array.
          const targetValue = values[1];
          effectiveValues =
            targetValue !== undefined && targetValue !== null
              ? [targetValue, ...(values.slice(1) as (string | number)[])]
              : (values.slice(1) as (string | number)[]);
        }
      } else {
        // Only prepend the current value if it actually differs from the
        // explicit first value, so the user's own start value isn't duplicated.
        const startsDifferent =
          startValue !== undefined &&
          startValue !== null &&
          startValue !== firstValue &&
          (typeof startValue !== "number" ||
            typeof firstValue !== "number" ||
            startValue !== Number(firstValue));
        effectiveValues = startsDifferent
          ? [startValue, ...(values as (string | number)[])]
          : (values as (string | number)[]);
      }

      let sample: Sampler;
      const colorInterpolator = getColorInterpolator(effectiveValues);
      if (colorInterpolator) {
        sample = (t: number) => {
          const progress = duration > 0 ? clamp01((t - start) / duration) : 1;
          return colorInterpolator(easeFn(progress));
        };
      } else {
        const numericValues: number[] = new Array(effectiveValues.length);
        for (let k = 0; k < effectiveValues.length; k++) {
          numericValues[k] = Number(effectiveValues[k]);
        }
        sample = createNumericSampler(numericValues, start, duration, easeFn);
      }

      channels[i] = {
        style,
        key: `${id}-${style}`,
        sample,
        start,
        end,
        final: sample(end),
        begun: false,
        group,
      };
    }

    // --- 5. merge into this feature's record --------------------------------
    const fKey = featureKey(feature);
    let rec = byFeature.get(fKey);

    if (rec === undefined) {
      const facade: any = {};
      rec = {
        key: fKey,
        target: { source, sourceLayer, id },
        state: {},
        channels: [],
        facade,
        startMin: start,
        list: -1,
      };
      facade[RECORD] = rec;
      byFeature.set(fKey, rec);
      transitions.add(facade);
    }

    const existingChannels = rec.channels;
    for (let i = 0; i < channels.length; i++) {
      const c = channels[i];
      // Supersede any in-flight channel for the same property. Its whole group
      // is cancelled: that call's onComplete must never fire.
      for (let j = 0; j < existingChannels.length; j++) {
        if (existingChannels[j].style === c.style) {
          const old = existingChannels[j].group;
          old.cancelled = true;
          old.remaining--;
          existingChannels.splice(j, 1);
          break;
        }
      }
      existingChannels.push(c);
      rec.facade[c.key] = c.sample;
    }

    // --- 6. schedule ---------------------------------------------------------
    if (rec.list === -1) {
      if (delay > 0) {
        rec.startMin = start;
        rec.list = 0;
        pending.push(rec);
      } else {
        rec.startMin = start;
        rec.list = 1;
        running.push(rec);
      }
    } else if (rec.list === 0) {
      if (delay > 0) {
        if (start < rec.startMin) rec.startMin = start;
      } else {
        // A delay-0 call on a pending record promotes it immediately. The stale
        // reference left in `pending` is dropped on the next promotion pass.
        rec.list = 1;
        running.push(rec);
      }
    }

    ensureRaf();

    // onStart fires synchronously only when there is no delay; otherwise it fires
    // on the frame the transition actually begins (see step()).
    if (delay <= 0) {
      group.started = true;
      if (options?.onStart) options.onStart();
    }
  };

  // Assign both map.T and map.transition with the same functionality
  map.T = Object.assign(transitionFunction, sharedProperties);
  map.transition = Object.assign(transitionFunction, sharedProperties);
}

/**
 * Default export object that can be used as a plugin.
 * This allows the library to be used as a MapLibre GL plugin.
 */
export default {
  init,
};

// Export internal functions for testing
export { camelToKebab, getColorInterpolator, createNumericSampler };
