import { Map } from "maplibre-gl";
import { scaleLinear } from "d3-scale";
import * as d3Ease from "d3-ease";

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
  paint?: Record<string, [number, number]>;
  onComplete?: () => void;
  onStart?: () => void;
}

interface TransitionState {
  [key: string]: number;
}

interface TransitionScales {
  [key: string]: any;
}

declare module "maplibre-gl" {
  interface Map {
    T: {
      (feature: any, options?: TransitionOptions): void;
      transitions: Set<any>;
      listLayerTransitions: (layerId: string) => any[];
      reverseScale: (scale: any, currentTime: number, easeFn: any) => any;
    };
  }
}

// Helper function to convert camelCase to kebab-case
function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Animates a feature's style transition over time.
 * @param map - The MapLibre map instance
 * @param feature - The feature to animate
 * @param keyName - Unique identifier for the transition
 */
function animateFeature(map: Map, feature: any, keyName: string) {
  const now = Date.now();
  const style = keyName.split("-").slice(1).join("-"); // Extract style from keyName

  // Get the transition from our set
  const transition = Array.from(map.T.transitions).find((t) => t[keyName]);
  if (!transition) return;

  const scale = transition[keyName];
  const endTime = scale.domain()[1];
  if (now >= endTime) {
    // Transition is complete - set final value and remove from transitions
    const finalState: TransitionState = {};
    Object.keys(transition).forEach(key => {
      if (key !== 'options') {
        const styleName = key.split('-').slice(1).join('-');
        finalState[styleName] = transition[key].range()[1];
      }
    });
    map.setFeatureState(
      { source: feature.source, id: feature.id },
      finalState
    );
    map.T.transitions.delete(transition);
    
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
    requestAnimationFrame(() => animateFeature(map, feature, keyName));
  }
}

/**
 * Initializes the transition plugin on a MapLibre map instance.
 * Adds transition-related functionality to the map object.
 * @param map - The MapLibre map instance to initialize
 */
export function init(map: Map): void {
  map.T = Object.assign(
    /**
     * Transitions a feature's style to a new value.
     * @param feature - The feature to transition
     * @param options - Transition options including duration, delay, and target paint properties
     */
    function (feature: any, options?: TransitionOptions) {
      const { duration = 1000, delay = 0, ease = "linear" } = options || {};
      const now = Date.now() + delay;

      // Get all paint properties from the options
      const paintProperties = options?.paint || {};
      
      // Set up the layer to use feature state for each style
      Object.entries(paintProperties).forEach(([style, [oldStyle, newStyle]]) => {
        const kebabStyle = camelToKebab(style);
        const currentPaint = map.getPaintProperty(
          feature.layer.id,
          kebabStyle
        ) as any[];
        if (currentPaint[0] !== "coalesce") {
          map.setPaintProperty(feature.layer.id, kebabStyle, [
            "coalesce",
            ["feature-state", style],
            oldStyle,
          ]);
        }
      });

      const easeName = `ease${
        ease.charAt(0).toUpperCase() + ease.slice(1)
      }` as keyof typeof d3Ease;
      const easeFn = d3Ease[easeName] || d3Ease.easeLinear;

      // Create scales for each property
      const scales: TransitionScales = {};
      Object.entries(paintProperties).forEach(([style, [oldStyle, newStyle]]) => {
        const scale = scaleLinear()
          .domain([now, now + duration])
          .range([oldStyle, newStyle]);

        const wrappedScale = (t: number) => {
          const progress = (t - now) / duration;
          const easedProgress = easeFn(Math.min(Math.max(progress, 0), 1));
          return oldStyle + easedProgress * (newStyle - oldStyle);
        };

        Object.assign(wrappedScale, scale);
        scales[`${feature.id}-${style}`] = wrappedScale;
      });

      // Set the initial feature state
      const initialState: TransitionState = {};
      Object.entries(paintProperties).forEach(([style, [oldStyle]]) => {
        initialState[style] = oldStyle;
      });
      map.setFeatureState(feature, initialState);

      // Check if there are existing transitions for this feature
      const existingTransitions = Array.from(map.T.transitions).filter(
        (t) => Object.keys(t).some(key => key.startsWith(`${feature.id}-`))
      );

      // If there are existing transitions, reverse them
      if (existingTransitions.length > 0) {
        existingTransitions.forEach(transition => {
          const reversedScales: TransitionScales = {};
          Object.keys(transition).forEach(key => {
            if (key !== 'options') {
              reversedScales[key] = map.T.reverseScale(
                transition[key],
                now,
                easeFn
              );
            }
          });
          map.T.transitions.delete(transition);
          map.T.transitions.add({ ...reversedScales, options });
        });
      } else {
        // Otherwise, add the new transitions
        map.T.transitions.add({ ...scales, options });
      }

      // Start the animation for each property
      Object.keys(scales).forEach(keyName => {
        animateFeature(map, feature, keyName);
      });
    },
    {
      transitions: new Set(),

      /**
       * Reverses a d3 scale transition by creating a new scale that transitions back to the original value.
       * @param scale - The original d3 scale to reverse
       * @param currentTime - The current timestamp
       * @param easeFn - The easing function to use for the reverse transition
       * @returns A new scale that will transition back to the original value
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
       * @param layerId - The ID of the layer to check for transitions
       * @returns Array of transition objects for the specified layer
       */
      listLayerTransitions: (layerId: string) => {
        const layer = map.getLayer(layerId);
        if (!layer) {
          console.warn(`Layer ${layerId} not found`);
          return [];
        }
        const sourceId = layer.source;
        const layerTransitions = Array.from(map.T.transitions).filter(
          (transition) => {
            const keys = Object.keys(transition);
            return keys.some((key) => {
              const feature = map
                .querySourceFeatures(sourceId)
                .find((f) => key.startsWith(`${f.id}-`));
              // Since we already have the layerId parameter, we don't need to check feature.layer.id
              return feature !== undefined;
            });
          }
        );
        return layerTransitions;
      },
    }
  );
}

// Export a default object that can be used as a plugin
export default {
  init,
};
