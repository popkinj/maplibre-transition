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

      let oldOpacity; // default

      if (Array.isArray(currentOpacity)) {
        // If it's an array, take the third value (default value in coalesce)
        oldOpacity = currentOpacity[2] || 0.1;
      } else if (typeof currentOpacity === "number") {
        // If it's a number, use it directly
        oldOpacity = currentOpacity;
      } else {
        oldOpacity = 0.1;
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

      // Use feature ID instead of layer ID for the key
      const keyName = feature.layer.id + "-fill-opacity";
      map.T.transitions.add({ [keyName]: wrappedScale });

      // Start the animation
      animateFeature(map, feature, keyName);
    },
    { transitions: new Set() }
  );
}

// Export a default object that can be used as a plugin
export default {
  init,
};
