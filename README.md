# Maplibre Transition Plugin

A utility plugin for Maplibre GL JS that adds transition-related functionality.

## Installation

```bash
npm install maplibre-transition
```

## Usage

```javascript
import maplibregl from 'maplibre-gl';
import MaplibreTransition from 'maplibre-transition';

const map = new maplibregl.Map({
    container: 'map',
    style: 'https://demotiles.maplibre.org/style.json',
    center: [0, 0],
    zoom: 2
});

// Initialize the plugin
MaplibreTransition.init(map);

// Use the plugin
map.T(); // Will print "Hello from map.T!" to the console
```

## Development

```bash
# Install dependencies
npm install

# Build the plugin
npm run build
``` 