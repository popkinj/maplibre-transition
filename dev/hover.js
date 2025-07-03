import maplibregl from "maplibre-gl";
import MaplibreTransition from "../src/index.ts";

const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: [-95, 60], // Center on Canada
  zoom: 3,
});

const originalFillOpacity = 0.1;

const unhover = (feature) => {
  map.transition(feature, {
    duration: 200,
    ease: "linear",
    paint: {
      "fillOpacity": [1, originalFillOpacity],
    },
  });
};
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
      "fill-opacity": originalFillOpacity,
      "fill-outline-color": "#000",
    },
  });

  let hoverProvince;

  // Add hover interaction
  map.on("mousemove", "provinces", (e) => {
    if (e.features[0].id !== hoverProvince?.id) {
      if (hoverProvince) unhover(hoverProvince);
      hoverProvince = e.features[0];
      map.transition(e.features[0], {
        duration: 500,
        ease: "linear",
        paint: {
          "fillOpacity": [originalFillOpacity, 1],
        },
      });
    }
  });

  map.on("mouseleave", "provinces", () => {
    const feature = map
      .queryRenderedFeatures(null, { layers: ["provinces"] })
      .find((f) => f.id === hoverProvince?.id);

    if (hoverProvince && feature) unhover(feature);
    hoverProvince = null;
  });
});
