export const notebook = {
  title: "MapLibre Transition Plugin - Basic Example",
  description: "A simple demonstration of the MapLibre Transition plugin",
  cells: [
    {
      type: "md",
      content: `# MapLibre Transition Plugin Demo
This notebook demonstrates the basic usage of the MapLibre Transition plugin for smooth style transitions.`
    },
    {
      type: "js",
      content: `import { Map } from "maplibre-gl";
import { init } from "npm:maplibre-transition";

// Create map instance
const map = new Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [-74.5, 40],
  zoom: 9
});

// Initialize the transition plugin
init(map);`
    },
    {
      type: "js",
      content: `// Add a simple polygon layer
map.on('load', () => {
  map.addSource('polygon', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[-75, 40], [-74, 40], [-74, 41], [-75, 41], [-75, 40]]]
      }
    }
  });

  map.addLayer({
    id: 'polygon-layer',
    type: 'fill',
    source: 'polygon',
    paint: {
      'fill-color': '#088',
      'fill-opacity': 0.1
    }
  });
});`
    },
    {
      type: "js",
      content: `// Add interactive transition
const button = document.createElement('button');
button.textContent = 'Toggle Opacity';
button.onclick = () => {
  const feature = {
    source: 'polygon',
    id: 'polygon-1',
    layer: map.getLayer('polygon-layer')
  };
  
  map.T(feature, {
    duration: 1000,
    paint: {
      fillOpacity: [0.1, 0.8]
    }
  });
};

document.body.appendChild(button);`
    }
  ]
}; 