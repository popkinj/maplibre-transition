import maplibregl from "maplibre-gl";
import MaplibreTransition from "../src/index.ts";

const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: [-95, 60], // Center on Canada
  zoom: 3,
});

// Sample Canadian cities with their coordinates
const canadianCities = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", id: "vancouver", properties: { name: "Vancouver" }, geometry: { type: "Point", coordinates: [-123.1207, 49.2827] } },
    { type: "Feature", id: "toronto", properties: { name: "Toronto" }, geometry: { type: "Point", coordinates: [-79.3832, 43.6532] } },
    { type: "Feature", id: "montreal", properties: { name: "Montreal" }, geometry: { type: "Point", coordinates: [-73.5673, 45.5017] } },
    { type: "Feature", id: "calgary", properties: { name: "Calgary" }, geometry: { type: "Point", coordinates: [-114.0719, 51.0447] } },
    { type: "Feature", id: "edmonton", properties: { name: "Edmonton" }, geometry: { type: "Point", coordinates: [-113.4909, 53.5444] } },
    { type: "Feature", id: "ottawa", properties: { name: "Ottawa" }, geometry: { type: "Point", coordinates: [-75.6972, 45.4215] } },
    { type: "Feature", id: "winnipeg", properties: { name: "Winnipeg" }, geometry: { type: "Point", coordinates: [-97.1385, 49.8951] } },
    { type: "Feature", id: "halifax", properties: { name: "Halifax" }, geometry: { type: "Point", coordinates: [-63.5752, 44.6488] } },
    { type: "Feature", id: "victoria", properties: { name: "Victoria" }, geometry: { type: "Point", coordinates: [-123.3656, 48.4284] } },
    { type: "Feature", id: "saskatoon", properties: { name: "Saskatoon" }, geometry: { type: "Point", coordinates: [-106.6700, 52.1332] } },
    { type: "Feature", id: "regina", properties: { name: "Regina" }, geometry: { type: "Point", coordinates: [-104.6177, 50.4452] } },
    { type: "Feature", id: "st-johns", properties: { name: "St. John's" }, geometry: { type: "Point", coordinates: [-52.7093, 47.5615] } },
    { type: "Feature", id: "whitehorse", properties: { name: "Whitehorse" }, geometry: { type: "Point", coordinates: [-135.0568, 60.7212] } },
    { type: "Feature", id: "yellowknife", properties: { name: "Yellowknife" }, geometry: { type: "Point", coordinates: [-114.3717, 62.4540] } },
    { type: "Feature", id: "iqaluit", properties: { name: "Iqaluit" }, geometry: { type: "Point", coordinates: [-68.5167, 63.7467] } }
  ]
};

// Initialize the plugin
MaplibreTransition.init(map);

map.on("load", () => {
  // Add the source
  map.addSource("cities", {
    type: "geojson",
    data: canadianCities,
    promoteId: "name"
  });

  // Add a circle layer
  map.addLayer({
    id: "cities",
    type: "circle",
    source: "cities",
    paint: {
      "circle-radius": 0, // Start with radius 0
      "circle-color": "#088",
      "circle-opacity": 0.9,
      "circle-stroke-width": 0,
      "circle-stroke-color": "rgba(255, 255, 255, 0.9)"
    }
  });

  // Add hover interaction
  let hoverCity;

  const unhover = (feature) => {
    map.T(feature, {
      duration: 200,
      ease: "linear",
      paint: {
        "circle-stroke-width": [5, 0]
      }
    });
  };

  map.on("mousemove", "cities", (e) => {
    if (e.features[0].id !== hoverCity?.id) {
      if (hoverCity) unhover(hoverCity);
      hoverCity = e.features[0];
      map.T(e.features[0], {
        duration: 200,
        ease: "exp",
        paint: {
          "circle-stroke-width": [0, 8]
        }
      });
    }
  });

  map.on("mouseleave", "cities", () => {
    const feature = map
      .queryRenderedFeatures(null, { layers: ["cities"] })
      .find((f) => f.id === hoverCity?.id);

    if (hoverCity && feature) unhover(feature);
    hoverCity = null;
  });

  // Add click interaction
  map.on("click", "cities", (e) => {
    console.log("Clicked on:", e.features[0]);
  });

  // Keep track of whether the transition has started
  // This is because the sourcedata event can be called multiple times
  let hasStartedTransition = false;

  map.on('sourcedata', (e) => {
    if (e.sourceId === 'cities' && e.isSourceLoaded && !hasStartedTransition) {
      hasStartedTransition = true;
      const features = map.queryRenderedFeatures(null, { layers: ["cities"] });
      features.forEach(feature => {
        map.T(feature, {
          duration: 1000,
          delay: Math.random() * 1000,  
          ease: "bounce",
          paint: {
            "circle-radius": [0, 16] // Transition from 0 to 8
          }
        });
      });
    }
  })
}); 