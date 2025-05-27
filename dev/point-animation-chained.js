import maplibregl from "maplibre-gl";
import MaplibreTransition from "../src/index.ts";
import { canadianCapitalCities, canadianMajorCities } from "./data/canadian-cities.js";

const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: [-95, 60], // Center on Canada
  zoom: 3,
});

// Initialize the plugin
MaplibreTransition.init(map);

map.on("load", () => {
  // Add the sources
  map.addSource("capitals", {
    type: "geojson",
    data: canadianCapitalCities,
    promoteId: "name",
  });

  map.addSource("major-cities", {
    type: "geojson",
    data: canadianMajorCities,
    promoteId: "name",
  });

  // Add circle layers for both types of cities
  map.addLayer({
    id: "capitals",
    type: "circle",
    source: "capitals",
    paint: {
      "circle-radius": 0, // Start with radius 0
      "circle-color": "#c2523c",
      "circle-opacity": 1,
      "circle-stroke-width": 0,
      "circle-stroke-color": "rgba(255, 255, 255, 0.9)",
    },
  });

  map.addLayer({
    id: "major-cities",
    type: "circle",
    source: "major-cities",
    paint: {
      "circle-radius": 0, // Start with radius 0
      "circle-color": "#4d5799",
      "circle-opacity": 1,
      "circle-stroke-width": 0,
      "circle-stroke-color": "rgba(255, 255, 255, 0.9)",
    },
  });

  // Add hover interaction for both layers
  let hoverCity;

  const unhover = (feature) => {
    map.T(feature, {
      duration: 100,
      ease: "linear",
      paint: {
        "circle-stroke-width": [5, 0],
      },
    });
  };

  const handleHover = (e) => {
    if (e.features[0].id !== hoverCity?.id) {
      if (hoverCity) unhover(hoverCity);
      hoverCity = e.features[0];
      map.T(e.features[0], {
        duration: 200,
        ease: "cubic",
        paint: {
          "circle-stroke-width": [0, 8],
        },
      });
    }
  };

  map.on("mousemove", "capitals", handleHover);
  map.on("mousemove", "major-cities", handleHover);

  map.on("mouseleave", "capitals", () => {
    const feature = map
      .queryRenderedFeatures(null, { layers: ["capitals"] })
      .find((f) => f.id === hoverCity?.id);

    if (hoverCity && feature) unhover(feature);
    hoverCity = null;
  });

  map.on("mouseleave", "major-cities", () => {
    const feature = map
      .queryRenderedFeatures(null, { layers: ["major-cities"] })
      .find((f) => f.id === hoverCity?.id);

    if (hoverCity && feature) unhover(feature);
    hoverCity = null;
  });

  // Add click interaction for both layers
  map.on("click", "capitals", (e) => {
    console.log("Clicked on capital:", e.features[0]);
  });

  map.on("click", "major-cities", (e) => {
    console.log("Clicked on major city:", e.features[0]);
  });

  // Keep track of whether the transition has started
  let hasStartedCapitalsTransition = false;
  let hasStartedMajorCitiesTransition = false;

  map.on("sourcedata", (e) => {
    if ((e.sourceId === "capitals" || e.sourceId === "major-cities") && e.isSourceLoaded && !hasStartedCapitalsTransition) {
      hasStartedCapitalsTransition = true;
      
      // Animate capitals
      const capitalFeatures = map.queryRenderedFeatures(null, { layers: ["capitals"] });
      capitalFeatures.forEach((feature) => {
        map.T(feature, {
          duration: 1000,
          delay: Math.random() * 1000 + 2000,
          ease: "bounce",
          paint: {
            "circle-radius": [0, 8],
          },
        });
      });

    }
      if ((e.sourceId === "major-cities") && e.isSourceLoaded && !hasStartedMajorCitiesTransition) {
        hasStartedMajorCitiesTransition = true;

        // Animate major cities
        const majorCityFeatures = map.queryRenderedFeatures(null, { layers: ["major-cities"] });
        majorCityFeatures.forEach((feature) => {
          map.T(feature, {
            duration: 1000,
            delay: Math.random() * 1000,
            ease: "bounce",
            paint: {
              "circle-radius": [0, 6], // Slightly smaller than capitals
            },
          });
        });
      }
  });
});
