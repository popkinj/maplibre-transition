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
            'fill-color': '#088',
            'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                1.0,
                0.4
            ],
            'fill-outline-color': '#000'
        }
    });

    // Add hover interaction
    map.on('mousemove', 'provinces-fill', (e) => {
        console.log('Mousemove', e.features[0]);
        const features = map.querySourceFeatures(e.features[0].source);
        features.forEach(feature => {
            map.setFeatureState(
                { source: 'provinces', id: feature.id },
                { hover: false }
            );
        });
        map.setFeatureState(
            { source: 'provinces', id: e.features[0].id },
            { hover: true }
        );
    });

    map.on('mouseleave', 'provinces-fill', () => {
        console.log('Mouseleave');
    });

    // Test the plugin
    map.T(); // Should print "Hello from map.T!" to the console
}); 