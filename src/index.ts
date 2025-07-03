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
interface TransitionOptions {
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
interface TransitionState {
  [key: string]: string | number;
}

/**
 * Collection of d3 scales used for transitioning different properties.
 * @interface TransitionScales
 * @property {any} [key: string] - Maps transition keys to their corresponding d3 scales
 */
interface TransitionScales {
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
 * Animates a feature's style transition over time using requestAnimationFrame.
 * This function handles the actual animation loop and updates feature states.
 * 
 * @param {Map} map - The MapLibre map instance
 * @param {any} feature - The feature to animate
 * @param {string} keyName - Unique identifier for the transition
 */
function animateFeature(map: Map, feature: any, keyName: string, transitionsSet: Set<any>) {
  const now = Date.now();
  const style = keyName.split("-").slice(1).join("-"); // Extract style from keyName

  // Get the transition from our set
  const transition = Array.from(transitionsSet).find((t: any) => t[keyName]);
  if (!transition) return;

  const scale = transition[keyName];
  const endTime = scale.domain()[1];
  
  if (now >= endTime) {
    // Transition is complete - set final value and remove from transitions
    const finalState: TransitionState = {};
    Object.keys(transition).forEach(key => {
      if (key !== 'options') {
        const styleName = key.split('-').slice(1).join('-');
        const values = transition.options.paint[styleName];
        finalState[styleName] = values[values.length - 1];
      }
    });
    map.setFeatureState(
      { source: feature.source, id: feature.id },
      finalState
    );
    transitionsSet.delete(transition);
    
    // Call onComplete callback if it exists
    const options = transition.options;
    if (options?.onComplete) {
      options.onComplete();
    }
  } else {
    // Update current values for all properties
    const currentState: TransitionState = {};
    Object.keys(transition).forEach(key => {
      if (key !== 'options') {
        const styleName = key.split('-').slice(1).join('-');
        currentState[styleName] = transition[key](now);
      }
    });
    map.setFeatureState(
      { source: feature.source, id: feature.id },
      currentState
    );

    // Schedule the next tick
    requestAnimationFrame(() => animateFeature(map, feature, keyName, transitionsSet));
  }
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
     * This is used when a new transition is started while an existing one is still in progress.
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
    const now = Date.now() + delay;

    // Get all paint properties from the options
    const paintProperties = options?.paint || {};
    
    // Set up the layer to use feature state for each style
    Object.entries(paintProperties).forEach(([style, values]) => {
      const kebabStyle = camelToKebab(style);
      const currentPaint = map.getPaintProperty(
        feature.layer.id,
        kebabStyle
      ) as any[];
      if (currentPaint[0] !== "coalesce") {
        map.setPaintProperty(feature.layer.id, kebabStyle, [
          "coalesce",
          ["feature-state", style],
          values[0],
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
      const colorInterpolator = getColorInterpolator(values);
      
      if (colorInterpolator) {
        // Use color interpolation for color values
        const wrappedScale = (t: number) => {
          const progress = (t - now) / duration;
          const easedProgress = easeFn(Math.min(Math.max(progress, 0), 1));
          return colorInterpolator(easedProgress);
        };
        Object.assign(wrappedScale, scaleLinear().domain([now, now + duration]).range([0, 1]).clamp(true));
        scales[`${feature.id}-${style}`] = wrappedScale;
      } else {
        // Use regular linear interpolation for non-color values
        const numericValues = values.map(v => Number(v));
        const scale = scaleLinear()
          .domain([now, now + duration])
          .range(numericValues)
          .clamp(true);

        const wrappedScale = (t: number) => {
          const progress = (t - now) / duration;
          const easedProgress = easeFn(Math.min(Math.max(progress, 0), 1));
          return scale(now + easedProgress * duration);
        };

        Object.assign(wrappedScale, scale);
        scales[`${feature.id}-${style}`] = wrappedScale;
      }
    });

    // Set the initial feature state
    const initialState: TransitionState = {};
    Object.entries(paintProperties).forEach(([style, values]) => {
      initialState[style] = typeof values[0] === 'string' ? values[0] : Number(values[0]);
    });
    map.setFeatureState(feature, initialState);

    // Check if there are existing transitions for this feature
    const existingTransitions = Array.from(sharedProperties.transitions).filter(
      (t) => Object.keys(t).some(key => key.startsWith(`${feature.id}-`))
    );

    // If there are existing transitions, reverse them
    if (existingTransitions.length > 0) {
      existingTransitions.forEach(transition => {
        const reversedScales: TransitionScales = {};
        Object.keys(transition).forEach(key => {
          if (key !== 'options') {
            reversedScales[key] = sharedProperties.reverseScale(
              transition[key],
              now,
              easeFn
            );
          }
        });
        sharedProperties.transitions.delete(transition);
        sharedProperties.transitions.add({ ...reversedScales, options });
      });
    } else {
      // Otherwise, add the new transitions
      sharedProperties.transitions.add({ ...scales, options });
    }

    // Start the animation for each property
    Object.keys(scales).forEach(keyName => {
      animateFeature(map, feature, keyName, sharedProperties.transitions);
    });
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
