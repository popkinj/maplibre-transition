import maplibregl from "maplibre-gl";
import MaplibreTransition from "../src/index.ts";

const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: [-95, 60], // Center on Canada
  zoom: 3,
});

// Initialize the plugin
MaplibreTransition.init(map);

// Load and display Canadian provinces
map.on("load", async () => {
  // Load the GeoJSON data
  const response = await fetch("./data/canada-provinces.json");
  const data = await response.json();

  // Add the source
  map.addSource("provinces", {
    type: "geojson",
    data: data,
    promoteId: "name",
  });

  // Add a fill layer
  map.addLayer({
    id: "provinces",
    type: "fill",
    source: "provinces",
    paint: {
      "fill-color": "#088",
      "fill-outline-color": "#000"
    },
  });

  // Add click effect
  map.on("click", "provinces", (e) => {
    const options = {
      duration: 3000, // Longer duration for more dramatic effect
      ease: 'ease-in-out', // Elastic easing for a bouncy effect
      paint: {
        "fill-color": [
          "#088",    // Start with green
          "#f00",    // Then red
          "#00f",    // Then blue
          "#ff0",    // Then yellow
          "#f0f",    // Then magenta
          "#0ff",    // Then cyan
          "#088"     // Back to green
        ]
      }
    };
    map.transition(e.features[0], options);
  });

  // Add a title to the map
  const title = document.createElement('div');
  title.className = 'map-title';
  title.innerHTML = 'Click any province to see a color cycle animation';
  map.getContainer().appendChild(title);

  // Add some CSS for the title
  const style = document.createElement('style');
  style.textContent = `
    .map-title {
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(255, 255, 255, 0.8);
      padding: 10px 20px;
      border-radius: 4px;
      font-family: Arial, sans-serif;
      font-size: 16px;
      z-index: 1;
    }
  `;
  document.head.appendChild(style);
}); 