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

// Use the plugin with either method
map.transition(feature, {
  duration: 1000,
  delay: 500,
  ease: "linear",
  paint: {
    "fill-opacity": [0.1, 1],
  },
});

// Or use the shorthand method (deprecated)
map.T(feature, {
  duration: 1000,
  delay: 500,
  ease: "linear",
  paint: {
    "fill-opacity": [0.1, 1],
  },
});
```

> **Note**: The `map.T` method is deprecated and will be removed in a future version. Please use `map.transition` for new code.

## Transitioning Multiple Properties

You can transition multiple style properties simultaneously by specifying them in the `paint` object:

```javascript
map.transition(feature, {
  duration: 1000,
  paint: {
    "circle-radius": [8, 12],
    "circle-stroke-width": [2, 4],
    "circle-opacity": [1, 0.2],
  }
});
```

All specified properties will transition together using the same duration and easing function. This is useful for creating coordinated visual effects.

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
map.transition(feature, {
  duration: 1000,
  ease: "elastic", // Try different easing functions
  paint: {
    "fill-opacity": [0.1, 1],
  },
});
```

## Color Transitions

The plugin supports smooth color transitions using D3's color interpolation. It automatically detects color values and uses the appropriate color space for interpolation:

```javascript
map.transition(feature, {
  duration: 1000,
  ease: "linear",
  paint: {
    "fill-color": ["#ff0000", "#00ff00"],  // RGB color transition
    "fill-outline-color": ["hsl(0,100%,50%)", "hsl(120,100%,50%)"],  // HSL color transition
    "fill-opacity": [0.1, 1]  // LAB color transition
  }
});
```

The plugin supports the following color formats:
- RGB colors (e.g., "#ff0000", "rgb(255,0,0)")
- HSL colors (e.g., "hsl(0,100%,50%)")
- LAB colors (e.g., "lab(50,100,0)")

Each color format uses its appropriate interpolation method:
- RGB interpolation for RGB colors
- HSL interpolation for HSL colors (better for hue transitions)
- LAB interpolation for LAB colors (perceptually uniform)

## Chaining Transitions

You can chain transitions using the `onComplete` callback. This is useful for creating complex animations that need to happen in sequence:

```javascript
map.transition(feature, {
  duration: 600,
  ease: "elastic",
  paint: {
    "circle-radius": [8, 12],
    "circle-color": ["#ff0000", "#00ff00"]  // Color transition
  },
  onComplete: () => {
    // This transition will start after the radius transition completes
    map.transition(feature, {
      duration: 300,
      ease: "linear",
      paint: {
        "circle-stroke-width": [2, 4],
        "circle-opacity": [1, 0.2],
        "circle-color": ["#00ff00", "#0000ff"]  // Another color transition
      },
    });
  }
});
```

You can combine multiple properties in both the initial and chained transitions. This allows for complex animations where some properties change together, while others follow in sequence.

## Advanced Transitions with Multiple Breakpoints

The plugin supports multiple breakpoints in transition arrays, enabling complex animations and color cycles. This feature allows for smooth transitions between multiple states or creating color cycling effects.

### Color Transitions with Multiple Breakpoints

You can specify multiple colors to create smooth color cycles:

```javascript
map.transition(feature, {
  duration: 3000,
  ease: 'elastic',
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
});
```

The plugin automatically interpolates between adjacent colors, creating smooth transitions. The interpolation respects the color space (RGB, HSL, or LAB) of the input colors.

### Numeric Transitions with Multiple Breakpoints

Multiple breakpoints also work for numeric properties, creating piecewise linear interpolations:

```javascript
map.transition(feature, {
  duration: 2000,
  ease: 'cubic',
  paint: {
    "circle-radius": [0, 10, 5, 15, 8]  // Complex size animation
  }
});
```

This creates a smooth transition that:
1. Grows from 0 to 10
2. Shrinks to 5
3. Grows to 15
4. Finally settles at 8

### Best Practices for Multiple Breakpoints

1. **Duration**: Use longer durations (2000-3000ms) when working with multiple breakpoints to make transitions more visible and smooth.

2. **Easing Selection**:
   - `elastic` or `bounce`: Best for playful, dynamic effects
   - `cubic` or `sin`: Ideal for smooth, professional transitions
   - `linear`: Use for precise, mechanical movements

3. **Color Space Considerations**:
   - RGB: Best for direct color transitions
   - HSL: Better for hue-based transitions
   - LAB: Best for perceptually uniform transitions

4. **Performance**: While multiple breakpoints are supported, consider the number of breakpoints you use. More breakpoints mean more interpolation calculations.

Example combining multiple properties with breakpoints:
```javascript
map.transition(feature, {
  duration: 3000,
  ease: 'elastic',
  paint: {
    "fill-color": ["#088", "#f00", "#00f", "#088"],
    "circle-radius": [5, 15, 10, 20],
    "fill-opacity": [1, 0.5, 0.8, 1]
  }
});
```

## Examples
I've put together some simple working examples in Observable, [here](https://observablehq.com/d/b9a97acdf712a77b). 

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
