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
      reverseFeatureTransition: (feature: any, options?: TransitionOptions) => void;
    };
  }
}

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

export function init(map: Map): void {
  map.T = Object.assign(
    function (feature: any, options?: TransitionOptions) {
      const { duration = 1000, delay = 0 } = options || {};
      const now = Date.now() + delay;

      const currentOpacity = map.getPaintProperty(
        feature.layer.id,
        "fill-opacity"
      );
      let oldOpacity = 0.1; // default

      if (Array.isArray(currentOpacity)) {
        oldOpacity = currentOpacity[2] || 0.1;
      } else if (typeof currentOpacity === "number") {
        oldOpacity = currentOpacity;
      }

      // Set up the layer to use feature state for opacity
      map.setPaintProperty(feature.layer.id, "fill-opacity", [
        "coalesce",
        ["feature-state", "fillOpacity"],
        oldOpacity,
      ]);

      const newOpacity = options?.paint?.["fill-opacity"] || 1;

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
      reverseFeatureTransition: (feature: any, options?: TransitionOptions) => {
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

        // Create a new transition that goes back to the default opacity
        const reverseOptions = {
          ...options,
          duration,
          paint: {
            'fill-opacity': currentOpacity // Default opacity
          }
        };

        // Start the reverse transition
        map.T(feature, reverseOptions);
      }
    }
  );
}

// Export a default object that can be used as a plugin
export default {
  init,
};
