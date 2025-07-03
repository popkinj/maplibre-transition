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
      duration: 1000,
      ease: 'linear',
      paint: {
        "fill-color": ["#088", "#f00"]
      }
    };
    map.transition(e.features[0], options);
  });

}); 