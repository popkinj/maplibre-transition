import maplibregl from 'maplibre-gl';
import MaplibreTransition from '../src/index.ts';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [-95, 60], // Center on Canada
  zoom: 3
});

// Initialize the plugin
MaplibreTransition.init(map);

const provinces = [
  {
    name: 'Ontario',
    color: '#0000FF'
  },
  
]

// Load and display Canadian provinces
map.on('load', async () => {
  console.log('Map loaded');
  
  // Load the GeoJSON data
  const response = await fetch('./data/canada-provinces.json');
  const data = await response.json();
  
  // Add the source
  map.addSource('provinces', {
    type: 'geojson',
    data: data,
    promoteId: 'name'
  });

  // Add a fill layer
  map.addLayer({
    id: 'provinces-fill',
    type: 'fill',
    source: 'provinces',
    paint: {
        // 'fill-color': '#088',
      'fill-color': ['coalesce', ['get', 'color'], '#088'],
      'fill-opacity': 0.5,
    //   'fill-color': [
    //     'case', 
    //     ['==', ['get', 'name'], provinces[0].name],
    //     provinces[0].color,
    //     '#088'
    //   ],
      // 'fill-opacity': [
      //   'case',
      //   ['boolean', ['feature-state', 'hover'], false],
      //   1.0,
      //   0.4
      // ],
      'fill-outline-color': '#000'
    }
  });

  map.on('click', 'provinces-fill', (e) => {
    map.setFeatureState(
      { source: 'provinces', id: e.features[0].id },
      { 'fill-opacity': 1 }
    );
    map.setPaintProperty('provinces-fill', 'fill-opacity', ['coalesce', ['feature-state', 'fill-opacity'], 0.1]);
    console.log('Click', e.features[0]);
  });

  // Add hover interaction
  map.on('mousemove', 'provinces-fill', (e) => {
    // console.log('Mousemove', e.features[0]);
    const source = e.features[0].source;
    const layer = e.features[0].layer;
    const features = map.querySourceFeatures(e.features[0].source);

    // features.forEach(feature => {
    //   map.setFeatureState(
    //     { source: 'provinces', id: feature.id },
    //     { hover: false }
    //   );
    // });
    // map.setFeatureState(
    //   { source: 'provinces', id: e.features[0].id },
    //   { hover: true }
    // );
  });

  map.on('mouseleave', 'provinces-fill', () => {
    // console.log('Mouseleave');
  });

  // Test the plugin
  map.T(); // Should print "Hello from map.T!" to the console
}); 