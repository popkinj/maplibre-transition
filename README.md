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
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: [0, 0],
  zoom: 2,
});

// Initialize the plugin
MaplibreTransition.init(map);

// Use the plugin
map.T(feature, {
  duration: 1000,
  delay: 500,
  ease: "linear",
  paint: {
    "fill-opacity": [0.1, 1],
  },
});
```

## Easing Types

The plugin supports the following easing functions from d3-ease:

- `"linear"` - Linear interpolation (no easing)
- `"quad"` - Quadratic easing (smooth acceleration/deceleration)
- `"cubic"` - Cubic easing (stronger acceleration/deceleration)
- `"elastic"` - Elastic easing (bouncy effect)
- `"bounce"` - Bounce easing (multiple bounces)
- `"circle"` - Circular easing (circular acceleration/deceleration)
- `"exp"` - Exponential easing (exponential acceleration/deceleration)
- `"poly"` - Polynomial easing (configurable power)
- `"sin"` - Sinusoidal easing (smooth sine wave)

Example with different easing:
```javascript
map.T(feature, {
  duration: 1000,
  ease: "elastic", // Try different easing functions
  paint: {
    "fill-opacity": [0.1, 1],
  },
});
```

## Development

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Run the development environment
npm run dev

# Open the development webserver that refreshes on saving.
npm run serve
``` 
