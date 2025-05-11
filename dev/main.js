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
      "fill-opacity": 0.1,
      "fill-outline-color": "#000"
    },
  });

  map.on("click", "provinces", (e) => {
    const options = {
      duration: 1000,
      ease: 'linear',
      delay: Math.random() * 1000,
      paint: {
        "fill-opacity": 1,
      }
    };

    // Transition the feature
    map.T(e.features[0], options);
  });

  // Add hover interaction
  map.on("mousemove", "provinces", (e) => {
    const source = e.features[0].source;
    const layer = e.features[0].layer;
    const features = map.querySourceFeatures(e.features[0].source);
    // console.log('layer', layer.paint);
    // console.log('feature state', e.features[0].state);
    // console.log('layer style', map.getLayer(layer.id).paint['fill-opacity']);
  });

  map.on("mouseleave", "provinces", () => {
    // console.log('Mouseleave');
  });
});
