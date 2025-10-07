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

# Start Vite dev server (serves dev/ directory with examples)
npm run serve

# Run tests
npm test
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

### Development Examples

The `dev/` directory contains example HTML/JS files demonstrating:
- Simple transitions (`simple.html`)
- Hover-triggered transitions (`hover.html`)
- Point animations (`point-animation.html`)
- Chained transitions (`point-animation-chained.html`)
- Color animations (`colour-animation.html`)
- Color cycling with multiple breakpoints (`colour-cycle.html`)

Vite serves these examples from the `dev/` directory root.

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
