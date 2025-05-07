import { Map } from "maplibre-gl";

interface TransitionOptions {
  duration?: number;
  ease?: string;
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
    function (layer: any, options?: TransitionOptions) {
      console.log("Hello from map.T!");
      if (options) {
        console.log(options);
      }
    },
    { transitions: new Set() } // Store the transitions in a set
  );
}

// Export a default object that can be used as a plugin
export default {
  init,
};
