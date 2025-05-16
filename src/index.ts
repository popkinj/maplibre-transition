import { Map } from "maplibre-gl";
import { scaleLinear } from "d3-scale";
import { easeLinear } from "d3-ease";

interface TransitionOptions {
  duration?: number;
  // ease?: string;
  delay?: number;
  paint?: Record<string, any>;
  onComplete?: () => void;
  onStart?: () => void;
}
declare module "maplibre-gl" {
  interface Map {
    T: {
      (feature: any, options?: TransitionOptions): void;
      transitions: Set<any>;
      listLayerTransitions: (layerId: string) => any[];
      calculateReverseFeatureTransition: (feature: any, options?: TransitionOptions) => void;
    };
  }
}

/**
 * Animates a feature's opacity transition over time.
 * @param map - The MapLibre map instance
 * @param feature - The feature to animate
 * @param keyName - Unique identifier for the transition
 */
function animateFeature(map: Map, feature: any, keyName: string) {
  const now = Date.now();

  // Get the transition from our set
  const transition = Array.from(map.T.transitions).find((t) => t[keyName]);
  if (!transition) return;

  const scale = transition[keyName];
  const endTime = scale.domain()[1];
  if (now >= endTime) {
    // Transition is complete - set final value and remove from transitions
    map.setFeatureState(
      { source: "provinces", id: feature.id },
      { fillOpacity: scale.range()[1] }
    );
    map.T.transitions.delete(transition);
  } else {
    // Update current value
    map.setFeatureState(
      { source: "provinces", id: feature.id },
      { fillOpacity: scale(now) }
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
     * Transitions a feature's opacity to a new value.
     * @param feature - The feature to transition
     * @param options - Transition options including duration, delay, and target paint properties
     */
    function (feature: any, options?: TransitionOptions) {
      const { duration = 1000, delay = 0 } = options || {};
      const now = Date.now() + delay;

      const currentOpacity = map.getPaintProperty(
        feature.layer.id,
        "fill-opacity"
      );
      const [oldOpacity, newOpacity] = options?.paint?.fillOpacity || [0.1, 1];

      // Set up the layer to use feature state for opacity
      map.setPaintProperty(feature.layer.id, "fill-opacity", [
        "coalesce",
        ["feature-state", "fillOpacity"],
        oldOpacity,
      ]);

      const scale = scaleLinear()
        .domain([now, now + duration])
        .range([oldOpacity, newOpacity]);

      const wrappedScale = (t: number) => {
        const progress = (t - now) / duration;
        const easedProgress = easeLinear(Math.min(Math.max(progress, 0), 1));
        return oldOpacity + easedProgress * (newOpacity - oldOpacity);
      };

      Object.assign(wrappedScale, scale);

      // Set the initial feature state
      map.setFeatureState(feature, { fillOpacity: oldOpacity });

      // Use feature ID for the key to ensure unique transitions per feature
      const keyName = feature.id + "-fill-opacity";

      // Remove any existing transition for this feature
      const existingTransition = Array.from(map.T.transitions).find(
        (t) => t[keyName]
      );
      if (existingTransition) {
        map.T.transitions.delete(existingTransition);
      }

      map.T.transitions.add({ [keyName]: wrappedScale });

      // Start the animation
      animateFeature(map, feature, keyName);
    },
    {
      transitions: new Set(),
      
      /**
       * Reverses a d3 scale transition by creating a new scale that transitions back to the original value.
       * @param scale - The original d3 scale to reverse
       * @param currentTime - The current timestamp
       * @returns A new scale that will transition back to the original value
       */
      reverseScale: (scale: any, currentTime: number) => {
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
          const easedProgress = easeLinear(Math.min(Math.max(progress, 0), 1));
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

      /**
       * Reverses an ongoing transition for a feature.
       * If a transition is in progress, it will smoothly transition back to the default state.
       * @param feature - The feature to reverse the transition for
       * @param options - Optional transition options for the reverse animation
       */
      calculateReverseFeatureTransition: (feature: any, options?: TransitionOptions) => {
        // Get the current opacity from feature state
        const currentState = map.getFeatureState(feature);
        const currentOpacity = currentState.fillOpacity || 0.1;

        // Find any existing transition for this feature
        const keyName = feature.id + "-fill-opacity";
        const existingTransition = Array.from(map.T.transitions).find(t => t[keyName]);
        
        let duration = options?.duration || 1000;
        
        // If there's an existing transition, calculate remaining time
        if (existingTransition) {
          const scale = existingTransition[keyName];
          const now = Date.now();
          const endTime = scale.domain()[1];
          const remainingTime = Math.max(0, endTime - now);
          // Use the remaining time as a base for our reverse transition
          duration = Math.max(remainingTime, duration);
        }

        return [currentOpacity, duration]

      }
    }
  );
}

// Export a default object that can be used as a plugin
export default {
  init,
};
