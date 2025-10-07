# MapLibre Transition Examples

Interactive examples showcasing all features of the MapLibre Transition plugin.

## View Live Examples

Visit [https://popkinj.github.io/maplibre-transition/](https://popkinj.github.io/maplibre-transition/) to see all examples in action.

## Running Examples Locally

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Serve examples locally
npm run serve:examples
```

The examples will open in your browser at `http://localhost:5173`

## Deploying Examples

To deploy the examples to GitHub Pages:

```bash
# Build and deploy
npm run deploy:examples
```

This will:
1. Build the plugin distribution
2. Build the examples site
3. Deploy to the `gh-pages` branch

## Examples Included

- **Basic Transition** - Learn the fundamentals with simple property transitions
- **Color Animation** - Smooth color transitions using D3's color interpolation
- **Color Cycling** - Create color cycles with multiple breakpoints
- **Easing Functions** - Explore all available easing functions
- **Multiple Properties** - Transition multiple style properties simultaneously
- **Chained Transitions** - Chain transitions using the onComplete callback
- **Hover Effects** - Interactive hover-triggered transitions
- **Multi-Breakpoint** - Advanced transitions with multiple breakpoints
- **Vector Tiles** - Transitions with vector tile sources

## Development

Each example is a standalone HTML file that imports the built plugin from `../dist/index.esm.js`. Make sure to build the plugin before running the examples.
