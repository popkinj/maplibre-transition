# Examples Site Deployment Guide

This guide explains how to deploy the MapLibre Transition examples to GitHub Pages.

## Quick Start

```bash
# Serve examples locally
npm run serve:examples

# Deploy to GitHub Pages (popkinj.github.io/maplibre-transition/)
npm run deploy:examples
```

## What Gets Deployed

The examples site includes:
- Modern landing page with all examples linked
- 9 interactive example pages showcasing different features
- Shared CSS for consistent styling
- Built plugin files (dist/)

## Deployment Process

When you run `npm run deploy:examples`, the following happens:

1. **Build Plugin** - Runs `npm run build` to create `dist/index.esm.js`
2. **Build Examples** - Runs Vite build on the examples directory
3. **Deploy** - Uses `gh-pages` package to deploy `examples-dist/` to the `gh-pages` branch

## GitHub Pages Configuration

After first deployment, configure GitHub Pages:

1. Go to your repository settings
2. Navigate to Pages section
3. Set source to `gh-pages` branch
4. The site will be available at: `https://popkinj.github.io/maplibre-transition/`

## Directory Structure

```
examples/
├── index.html                  # Landing page
├── basic-transition.html       # Individual example pages
├── color-animation.html
├── color-cycle.html
├── easing-functions.html
├── multiple-properties.html
├── chained-transitions.html
├── hover-effects.html
├── multi-breakpoint.html
├── vector-tiles.html
├── styles/
│   └── shared.css             # Shared styling
├── .nojekyll                  # Tells GitHub Pages not to use Jekyll
└── README.md
```

## NPM Scripts

- `npm run serve:examples` - Start local dev server (hot reload)
- `npm run build:examples` - Build examples for production
- `npm run deploy:examples` - Build and deploy to GitHub Pages

## Customization

### Base URL
The base URL is configured in `vite.examples.config.js`:
```javascript
base: '/maplibre-transition/'
```

Change this if deploying to a different URL.

### Examples List
To add a new example:
1. Create the HTML file in `examples/`
2. Add it to `vite.examples.config.js` in the `rollupOptions.input` object
3. Add a feature card to `examples/index.html`

## Troubleshooting

### Styles not loading
- Ensure `base` path in `vite.examples.config.js` matches your GitHub Pages URL
- Check that `.nojekyll` file exists in the examples directory

### Plugin not found
- Make sure to run `npm run build` before deploying
- Verify `dist/index.esm.js` exists

### gh-pages command fails
- Ensure you have push permissions to the repository
- Check that gh-pages package is installed: `npm install --save-dev gh-pages`
