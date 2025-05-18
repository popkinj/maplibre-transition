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
      reverseScale: (scale: any, currentTime: number) => any;
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
      { source: feature.source, id: feature.id },
      { fillOpacity: scale.range()[1] }
    );
    map.T.transitions.delete(transition);
  } else {
    // Update current value
    map.setFeatureState(
      { source: feature.source, id: feature.id },
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

      const [oldOpacity, newOpacity] = options?.paint?.fillOpacity || [0.1, 1];

      // Set up the layer to use feature state for opacity
      const currentPaint = map.getPaintProperty(feature.layer.id, "fill-opacity") as any[];
      if (currentPaint[0] !== 'coalesce') {
        map.setPaintProperty(feature.layer.id, "fill-opacity", [
          "coalesce",
          ["feature-state", "fillOpacity"],
          oldOpacity,
        ]);
      }

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

      // Check if there is an existing transition for this feature
      const existingTransition = Array.from(map.T.transitions).find(
        (t) => t[keyName]
      );
      // If there is an existing transition, reverse it
      if (existingTransition) {
        const reversedScale = map.T.reverseScale(existingTransition[keyName], now);
        map.T.transitions.delete(existingTransition);
        map.T.transitions.add({ [keyName]: reversedScale });
      } else { // Otherwise, add the new transition
        map.T.transitions.add({ [keyName]: wrappedScale });
      }

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
    }
  );
}

// Export a default object that can be used as a plugin
export default {
  init,
};
