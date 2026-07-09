import { Map } from "maplibre-gl";
import { scaleLinear } from "d3-scale";
import * as d3Ease from "d3-ease";
import { interpolateRgb, interpolateHsl, interpolateLab, interpolateArray } from "d3-interpolate";
import { rgb, hsl, lab } from "d3-color";

/**
 * Configuration options for feature transitions.
 * @interface TransitionOptions
 * @property {number} [duration=1000] - Duration of the transition in milliseconds
 * @property {string} [ease="linear"] - Easing function to use for the transition
 * @property {number} [delay=0] - Delay before starting the transition in milliseconds
 * @property {Record<string, (string | number)[]>} [paint] - Paint properties to transition, mapping property names to arrays of values
 * @property {() => void} [onComplete] - Callback function to execute when transition completes
 * @property {() => void} [onStart] - Callback function to execute when transition starts
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
  paint?: Record<string, (string | number)[]>;
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
 * Collection of d3 scales used for transitioning different properties.
 * @interface TransitionScales
 * @property {any} [key: string] - Maps transition keys to their corresponding d3 scales
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
      reverseScale: (scale: any, currentTime: number, easeFn: any) => any;
    };
    transition: {
      (feature: any, options?: TransitionOptions): void;
      transitions: Set<any>;
      listLayerTransitions: (layerId: string) => any[];
      reverseScale: (scale: any, currentTime: number, easeFn: any) => any;
    };
  }
}

/**
 * Converts a camelCase string to kebab-case.
 * @param {string} str - The string to convert
 * @returns {string} The converted kebab-case string
 */
function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Detects if values are colors and returns the appropriate interpolator
 * @param {Array<string | number>} values - Array of values to interpolate between
 * @returns {Function|null} The appropriate interpolator function or null if not colors
 */
function getColorInterpolator(values: (string | number)[]): ((t: number) => string) | null {
  // Only try color interpolation if all values are strings
  if (!values.every(v => typeof v === 'string')) {
    return null;
  }

  try {
    // Try parsing as RGB
    const rgbValues = values.map(v => rgb(v as string));
    if (rgbValues.every(v => v)) {
      return (t: number) => {
        const clampedT = Math.min(Math.max(t, 0), 1);
        if (clampedT === 1) return rgbValues[rgbValues.length - 1].toString();
        const i = Math.floor(clampedT * (rgbValues.length - 1));
        const j = Math.min(i + 1, rgbValues.length - 1);
        const localT = (clampedT * (rgbValues.length - 1)) % 1;
        return interpolateRgb(rgbValues[i], rgbValues[j])(localT);
      };
    }

    // Try parsing as HSL
    const hslValues = values.map(v => hsl(v as string));
    if (hslValues.every(v => v)) {
      return (t: number) => {
        const clampedT = Math.min(Math.max(t, 0), 1);
        if (clampedT === 1) return hslValues[hslValues.length - 1].toString();
        const i = Math.floor(clampedT * (hslValues.length - 1));
        const j = Math.min(i + 1, hslValues.length - 1);
        const localT = (clampedT * (hslValues.length - 1)) % 1;
        return interpolateHsl(hslValues[i], hslValues[j])(localT);
      };
    }

    // Try parsing as LAB
    const labValues = values.map(v => lab(v as string));
    if (labValues.every(v => v)) {
      return (t: number) => {
        const clampedT = Math.min(Math.max(t, 0), 1);
        if (clampedT === 1) return labValues[labValues.length - 1].toString();
        const i = Math.floor(clampedT * (labValues.length - 1));
        const j = Math.min(i + 1, labValues.length - 1);
        const localT = (clampedT * (labValues.length - 1)) % 1;
        return interpolateLab(labValues[i], labValues[j])(localT);
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Keys on a transition object that are metadata rather than per-property scales.
 */
const TRANSITION_META_KEYS = new Set(["options", "__raf"]);

/**
 * Drives a single feature's transition with one requestAnimationFrame loop.
 *
 * All properties on the feature are sampled and written in a single
 * `setFeatureState` call per frame, using the timestamp the browser passes to
 * the rAF callback (synchronized to the frame boundary). The loop bails
 * immediately if its transition has been superseded, so an interrupting call
 * that replaces the transition cannot leave a stale loop running.
 *
 * @param {Map} map - The MapLibre map instance
 * @param {any} feature - The feature to animate
 * @param {any} transition - The transition object holding this feature's scales
 * @param {Set<any>} transitionsSet - The set of all active transitions
 * @param {number} now - The frame timestamp (performance.now-based) from rAF
 */
function animateFeature(
  map: Map,
  feature: any,
  transition: any,
  transitionsSet: Set<any>,
  now: number
) {
  // Bail out if this transition has been superseded or removed.
  if (!transitionsSet.has(transition)) return;

  const keys = Object.keys(transition).filter(key => !TRANSITION_META_KEYS.has(key));
  if (keys.length === 0) {
    transitionsSet.delete(transition);
    return;
  }

  // The transition is done once every property has passed its own end time.
  let endTime = -Infinity;
  keys.forEach(key => {
    endTime = Math.max(endTime, transition[key].__end);
  });

  const target = {
    source: feature.source,
    sourceLayer: feature.sourceLayer,
    id: feature.id,
  };

  if (now >= endTime) {
    // Snap to the final value of every property and retire the transition.
    const finalState: TransitionState = {};
    keys.forEach(key => {
      const styleName = key.split("-").slice(1).join("-");
      finalState[styleName] = transition[key].__final;
    });
    map.setFeatureState(target, finalState);
    transitionsSet.delete(transition);

    const options = transition.options;
    if (options?.onComplete) {
      options.onComplete();
    }
    return;
  }

  // Sample every property at this frame's timestamp and write once.
  const currentState: TransitionState = {};
  keys.forEach(key => {
    const styleName = key.split("-").slice(1).join("-");
    currentState[styleName] = transition[key](now);
  });
  map.setFeatureState(target, currentState);

  // A single rAF loop drives every property on this feature.
  transition.__raf = requestAnimationFrame((frameTime: number) =>
    animateFeature(map, feature, transition, transitionsSet, frameTime)
  );
}

/**
 * Initializes the transition plugin on a MapLibre map instance.
 * This function adds the transition functionality to the map object and sets up
 * the necessary methods and properties.
 * 
 * @param {Map} map - The MapLibre map instance to initialize
 */
export function init(map: Map): void {
  // Create the shared properties object first
  const sharedProperties = {
    /** Set of all active transitions */
    transitions: new Set<any>(),

    /**
     * Reverses a d3 scale transition by creating a new scale that transitions back to the original value.
     *
     * @deprecated No longer used internally. Interruptions now start a fresh
     * transition from the property's current feature-state value to the new
     * target, which handles colors and multi-breakpoint scales correctly.
     * This method is retained only for API/type compatibility and does not
     * support color scales. It will be removed in a future major version.
     *
     * @param {any} scale - The original d3 scale to reverse
     * @param {number} currentTime - The current timestamp
     * @param {any} easeFn - The easing function to use for the reverse transition
     * @returns {any} A new scale that will transition back to the original value
     */
    reverseScale: (scale: any, currentTime: number, easeFn: any) => {
      const [startTime, endTime] = scale.domain();
      const [startValue, endValue] = scale.range();

      // Calculate how much time has passed in the original transition
      const elapsedTime = currentTime - startTime;
      const totalDuration = endTime - startTime;

      // Calculate the current value based on elapsed time
      const currentValue = scale(currentTime);

      // Create a new scale that goes from current value back to start value
      const newScale = scaleLinear()
        .domain([currentTime, currentTime + elapsedTime])
        .range([currentValue, startValue]);

      // Wrap the scale with the same easing function
      const wrappedScale = (t: number) => {
        const progress = (t - currentTime) / elapsedTime;
        const easedProgress = easeFn(Math.min(Math.max(progress, 0), 1));
        return currentValue + easedProgress * (startValue - currentValue);
      };

      Object.assign(wrappedScale, newScale);
      return wrappedScale;
    },

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
      const sourceId = layer.source;
      const layerTransitions = Array.from(sharedProperties.transitions).filter(
        (transition: any) => {
          const keys = Object.keys(transition);
          return keys.some((key) => {
            const feature = map
              .querySourceFeatures(sourceId)
              .find((f) => key.startsWith(`${f.id}-`));
            return feature !== undefined;
          });
        }
      );
      return layerTransitions;
    },
  };

  // Create the transition function
  const transitionFunction = function (feature: any, options?: TransitionOptions) {
    const { duration = 1000, delay = 0, ease = "linear" } = options || {};
    // performance.now() shares its time origin with the rAF timestamp used in
    // animateFeature, so the start time and every per-frame sample agree.
    const now = performance.now() + delay;

    // Get all paint properties from the options
    const paintProperties = options?.paint || {};

    // Get the current feature state to use as starting values
    const currentFeatureState = map.getFeatureState({
      source: feature.source,
      sourceLayer: feature.sourceLayer,
      id: feature.id
    }) || {};

    // Collect default paint values before modifying the paint properties
    const defaultPaintValues: Record<string, string | number> = {};
    Object.entries(paintProperties).forEach(([style, values]) => {
      const kebabStyle = camelToKebab(style);
      const currentPaint = map.getPaintProperty(feature.layer.id, kebabStyle);

      // Extract the default value - if it's already a coalesce expression, get the fallback
      if (Array.isArray(currentPaint) && currentPaint[0] === "coalesce") {
        defaultPaintValues[style] = currentPaint[2];
      } else if (currentPaint !== undefined && currentPaint !== null) {
        defaultPaintValues[style] = currentPaint as string | number;
      } else {
        // Fallback to first non-null value from the provided values array
        const firstValidValue = values.find(v => v !== null && v !== undefined);
        if (firstValidValue !== undefined) {
          defaultPaintValues[style] = firstValidValue;
        }
      }
    });

    // Set the initial feature state FIRST (before changing paint property to use feature-state)
    // This prevents a flash of incorrect color when the coalesce expression is first evaluated
    const initialState: TransitionState = {};
    Object.entries(paintProperties).forEach(([style, values]) => {
      const featureStateValue = currentFeatureState[style];
      const firstNonNullValue = values.find(v => v !== null && v !== undefined);
      const startValue = featureStateValue !== undefined
        ? featureStateValue
        : (defaultPaintValues[style] !== undefined ? defaultPaintValues[style] : firstNonNullValue);
      if (startValue !== undefined && startValue !== null) {
        initialState[style] = typeof startValue === 'string' ? startValue : Number(startValue);
      }
    });
    map.setFeatureState(
      { source: feature.source, sourceLayer: feature.sourceLayer, id: feature.id },
      initialState
    );

    // Now set up the layer to use feature state for each style
    Object.entries(paintProperties).forEach(([style, values]) => {
      const kebabStyle = camelToKebab(style);
      const currentPaint = map.getPaintProperty(
        feature.layer.id,
        kebabStyle
      );

      // Only modify the paint property if it's not already using feature state
      if (!Array.isArray(currentPaint) || currentPaint[0] !== "coalesce") {
        // Use the current paint value as the fallback, or the first value from the array
        const fallbackValue = (currentPaint !== undefined && currentPaint !== null)
          ? currentPaint
          : (defaultPaintValues[style] ?? values.find(v => v !== null && v !== undefined));

        map.setPaintProperty(feature.layer.id, kebabStyle, [
          "coalesce",
          ["feature-state", style],
          fallbackValue,
        ]);
      }
    });

    const easeName = `ease${
      ease.charAt(0).toUpperCase() + ease.slice(1)
    }` as keyof typeof d3Ease;
    const easeFn = d3Ease[easeName] || d3Ease.easeLinear;

    // Create scales for each property
    const scales: TransitionScales = {};
    Object.entries(paintProperties).forEach(([style, values]) => {
      // Get the starting value: use feature state if available, otherwise use the default paint value
      const featureStateValue = currentFeatureState[style];
      const startValue = featureStateValue !== undefined ? featureStateValue : defaultPaintValues[style];

      // Handle null/undefined first values by replacing them with the current state
      // This allows users to specify [null, targetValue] to mean "from current state to target"
      const firstValue = values[0];
      let effectiveValues: (string | number)[];

      if (firstValue === null || firstValue === undefined) {
        // Replace null/undefined with current state, keep the rest
        if (startValue !== undefined) {
          effectiveValues = [startValue, ...values.slice(1)];
        } else if (defaultPaintValues[style] !== undefined) {
          // Fall back to paint property default if feature state not found
          effectiveValues = [defaultPaintValues[style], ...values.slice(1)];
        } else {
          // Last resort: use target value as start to avoid single-value array (creates no-op)
          const targetValue = values[1];
          effectiveValues = targetValue !== undefined
            ? [targetValue, ...values.slice(1)]
            : values.slice(1);
        }
      } else {
        // Only prepend the starting value if it's different from the first value in the array
        // This avoids duplicating values when the user explicitly provides the start value
        const startsDifferent = startValue !== undefined && startValue !== firstValue &&
          (typeof startValue !== 'number' || typeof firstValue !== 'number' || startValue !== Number(firstValue));
        effectiveValues = startsDifferent ? [startValue, ...values] : values;
      }

      const colorInterpolator = getColorInterpolator(effectiveValues);

      if (colorInterpolator) {
        // Use color interpolation for color values
        const wrappedScale = (t: number) => {
          const progress = (t - now) / duration;
          const easedProgress = easeFn(Math.min(Math.max(progress, 0), 1));
          return colorInterpolator(easedProgress);
        };
        Object.assign(wrappedScale, scaleLinear().domain([now, now + duration]).range([0, 1]).clamp(true));
        // Record the true end time and final value directly on the scale, so the
        // completion path never has to re-derive them from a numeric range.
        (wrappedScale as any).__end = now + duration;
        (wrappedScale as any).__final = wrappedScale(now + duration);
        scales[`${feature.id}-${style}`] = wrappedScale;
      } else {
        // Use regular linear interpolation for non-color values
        const numericValues = effectiveValues.map(v => Number(v));

        // Create domain points that match the number of range values
        // For multi-breakpoint arrays like [10, 30, 10], we need matching domain points
        const domainPoints = numericValues.map((_, i) =>
          now + (duration * i) / (numericValues.length - 1)
        );

        const scale = scaleLinear()
          .domain(domainPoints)
          .range(numericValues)
          .clamp(true);

        const wrappedScale = (t: number) => {
          const progress = (t - now) / duration;
          const easedProgress = easeFn(Math.min(Math.max(progress, 0), 1));
          return scale(now + easedProgress * duration);
        };

        Object.assign(wrappedScale, scale);
        (wrappedScale as any).__end = now + duration;
        (wrappedScale as any).__final = wrappedScale(now + duration);
        scales[`${feature.id}-${style}`] = wrappedScale;
      }
    });

    // Merge these scales into this feature's transition, or start a fresh one.
    // Because each new scale already starts from the feature's *current* state
    // (see the effective-values handling above), interrupting a running
    // transition simply continues from wherever the property is right now —
    // no reverse scale required.
    const existing = Array.from(sharedProperties.transitions).find(
      (t) => Object.keys(t).some(
        key => !TRANSITION_META_KEYS.has(key) && key.startsWith(`${feature.id}-`)
      )
    );

    let activeTransition: any;
    if (existing) {
      // Cancel the in-flight frame and carry forward any properties this call
      // doesn't touch, so independent transitions on the same feature coexist.
      if (existing.__raf !== undefined) cancelAnimationFrame(existing.__raf);
      sharedProperties.transitions.delete(existing);

      activeTransition = {};
      Object.keys(existing).forEach(key => {
        if (!TRANSITION_META_KEYS.has(key)) activeTransition[key] = existing[key];
      });
      Object.assign(activeTransition, scales);
      activeTransition.options = options;
    } else {
      activeTransition = { ...scales, options };
    }

    sharedProperties.transitions.add(activeTransition);

    if (options?.onStart) {
      options.onStart();
    }

    // A single rAF loop drives every property on this feature.
    activeTransition.__raf = requestAnimationFrame((frameTime: number) =>
      animateFeature(map, feature, activeTransition, sharedProperties.transitions, frameTime)
    );
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
export { camelToKebab, getColorInterpolator };
