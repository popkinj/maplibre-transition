# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A MapLibre GL JS plugin for smooth transitions between map styles. The plugin extends MapLibre's Map interface to add transition functionality for animating paint properties using d3 interpolation and easing functions.

## Build & Development Commands

```bash
# Install dependencies
npm install

# Build the plugin (outputs to dist/)
npm run build

# Development mode with watch (auto-rebuilds on changes)
npm run dev

# Start Vite dev server (serves examples/ directory)
npm run serve:examples
```

## Testing Commands

```bash
# Run unit tests (Vitest)
npm test

# Run unit tests in watch mode
npm run test:watch

# Run E2E tests (Playwright - headless)
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Run E2E tests in headed browser
npm run test:e2e:headed

# Run all tests (unit + E2E)
npm run test:all
```

## Deployment Commands

```bash
# Deploy examples to GitHub Pages
npm run deploy:examples
```

## Architecture

### Core Functionality

The entire plugin is implemented in a single TypeScript file (`src/index.ts`) that:

1. **Extends MapLibre Map interface** - Adds `map.transition()` and deprecated `map.T()` methods via TypeScript module augmentation
2. **Uses d3 for interpolation** - Leverages d3-scale for linear interpolation, d3-ease for easing functions, and d3-interpolate/d3-color for color transitions
3. **Feature state-based animations** - Utilizes MapLibre's `setFeatureState()` to update feature properties, modifying layer paint properties to use `["coalesce", ["feature-state", ...], ...]` expressions
4. **RequestAnimationFrame loop** - The `animateFeature()` function drives animations via RAF, updating feature states until transitions complete

### Key Components

- **TransitionOptions interface** - Defines `duration`, `ease`, `delay`, `paint`, `onComplete`, `onStart`
- **Color interpolation** - `getColorInterpolator()` auto-detects color formats (RGB/HSL/LAB) and returns appropriate d3 interpolator
- **Multi-property transitions** - Supports transitioning multiple paint properties simultaneously with shared duration/easing
- **Multi-breakpoint support** - Arrays with 3+ values create piecewise interpolations (e.g., `[0, 10, 5, 15]` transitions through all values)
- **Transition reversal** - `reverseScale()` handles interrupting in-progress transitions by creating reversed scales

### Build Configuration

- **Rollup** - Builds both CJS (`dist/index.js`) and ESM (`dist/index.esm.js`) outputs with TypeScript compilation and terser minification
- **External dependencies** - maplibre-gl is marked external (peer dependency); d3 libraries are bundled
- **Type declarations** - Generated TypeScript definitions in `dist/index.d.ts`

### Demo Pages (examples/)

The `examples/` directory contains interactive demo pages deployed to GitHub Pages:
- `index.html` - Landing page with links to all demos
- `basic-transition.html` - Simple radius transitions on click
- `color-animation.html` - Color property transitions
- `color-cycle.html` - Multi-breakpoint color cycles
- `easing-functions.html` - Compare all 9 easing types
- `multiple-properties.html` - Animate several properties together
- `chained-transitions.html` - Sequential animation chains
- `hover-effects.html` - Mouse-triggered transitions
- `multi-breakpoint.html` - Complex piecewise animations
- `vector-tiles.html` - Transitions with vector tile sources

Vite serves these examples with base path `/maplibre-transition/`.

### Development Examples (dev/)

The `dev/` directory contains simpler example HTML/JS files for development:
- Simple transitions (`simple.html`)
- Hover-triggered transitions (`hover.html`)
- Point animations (`point-animation.html`)
- Chained transitions (`point-animation-chained.html`)
- Color animations (`colour-animation.html`)
- Color cycling with multiple breakpoints (`colour-cycle.html`)

## Important Implementation Details

### Paint Property Handling

The plugin modifies layer paint properties to enable feature-state transitions. For simple values, it wraps with `["coalesce", ["feature-state", style], defaultValue]`. For complex expressions (like case statements), it preserves the existing expression as the fallback.

### Transition State Management

- All active transitions stored in `map.transition.transitions` Set
- Each transition object contains scales keyed by `${featureId}-${style}`
- When new transition starts on a feature with existing transitions, existing ones are reversed
- Transitions are deleted from the Set when complete

### Color vs Numeric Interpolation

The plugin automatically detects color values (strings that parse as RGB/HSL/LAB) and uses appropriate d3 color interpolators. Numeric values use linear interpolation with easing applied.

## Testing Infrastructure

### Unit Tests (tests/unit/)

Unit tests use Vitest with jsdom environment:
- `camelToKebab.test.ts` - Tests for the camelToKebab utility function
- `colorInterpolator.test.ts` - Tests for color format detection and interpolation
- `easing.test.ts` - Tests for all 9 easing function mappings

### E2E Tests (tests/e2e/)

E2E tests use Playwright with WebGL support:
- Tests run against the Vite dev server serving `examples/`
- Uses `data-testid` attributes for reliable element selection
- Demo pages expose `window.__testHooks` for test access to map instance

Test files cover all 9 demo pages plus the landing page:
- `landing-page.spec.ts` - Landing page navigation and content
- `basic-transition.spec.ts` - Basic transition controls and behavior
- `color-animation.spec.ts` - Color picker and transitions
- `color-cycle.spec.ts` - Palette selection and cycling
- `easing-functions.spec.ts` - Easing selection and comparison
- `multiple-properties.spec.ts` - Property checkboxes and animation
- `chained-transitions.spec.ts` - Chain type selection and control
- `hover-effects.spec.ts` - Effect selection and hover behavior
- `multi-breakpoint.spec.ts` - Pattern selection and breakpoint display
- `vector-tiles.spec.ts` - Vector tile source and feature selection

### Test Helpers (tests/e2e/fixtures/test-helpers.ts)

Shared utilities for E2E tests:
- `waitForMapLoad(page)` - Waits for MapLibre map to fully load
- `getTransitionCount(page)` - Returns active transition count
- `waitForTransitionComplete(page)` - Waits for all transitions to finish

### CI/CD (.github/workflows/test.yml)

GitHub Actions workflow runs on push/PR to main:
- Unit tests with coverage upload
- E2E tests across chromium, firefox, webkit
- Playwright report artifact upload
