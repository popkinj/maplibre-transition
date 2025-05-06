import { Map } from 'maplibre-gl';

declare module 'maplibre-gl' {
    interface Map {
        T: {
            (): void;
        }
    }
}

export function init(map: Map): void {
    // Add the T namespace to the map object
    map.T = function() {
        console.log('Hello from map.T!');
    };
}

// Export a default object that can be used as a plugin
export default {
    init
}; 