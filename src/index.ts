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
      (layer: any, options?: TransitionOptions): void;
      transitions: Set<any>;
    };
  }
}

export function init(map: Map): void {
  // Add the T namespace to the map object
  map.T = Object.assign(
    function (feature: any, options?: TransitionOptions) {
      console.log('transitioning feature', feature);

      const {duration = 1000, delay = 0} = options || {};

      const now = Date.now() + delay;

      const oldOpacity = feature.paint['fill-opacity'] || 0.1;
      const newOpacity = options?.paint?.['fill-opacity'] || 1;

      const scale = scaleLinear()
        .domain([now, now + duration])
        .range([oldOpacity, newOpacity]);

      const wrappedScale = (t: number) => {
        const progress = (t - now) / duration;
        const easedProgress = easeLinear(Math.min(Math.max(progress, 0), 1));
        return oldOpacity + (easedProgress * oldOpacity);
      }

      Object.assign(wrappedScale, scale);

      map.setPaintProperty(feature.id, 'fill-opacity', [
        "coalesce",
        ["feature-state", "fillOpacity"],
        oldOpacity,
      ]);

      // Set the initial feature state
      map.setFeatureState(feature, {fillOpacity: oldOpacity});

      const keyName = feature.id + '-fill-opacity';
      map.T.transitions.add({[keyName]: wrappedScale});

    },
    { transitions: new Set() } // Store the transitions in a set
  );
}

// Export a default object that can be used as a plugin
export default {
  init,
};
