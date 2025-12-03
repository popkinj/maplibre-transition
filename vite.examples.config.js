import { defineConfig } from 'vite';

export default defineConfig({
    root: 'examples',
    base: '/maplibre-transition/',
    build: {
        outDir: '../examples-dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: 'examples/index.html',
                'basic-transition': 'examples/basic-transition.html',
                'color-animation': 'examples/color-animation.html',
                'color-cycle': 'examples/color-cycle.html',
                'easing-functions': 'examples/easing-functions.html',
                'multiple-properties': 'examples/multiple-properties.html',
                'chained-transitions': 'examples/chained-transitions.html',
                'hover-effects': 'examples/hover-effects.html',
                'multi-breakpoint': 'examples/multi-breakpoint.html',
                'vector-tiles': 'examples/vector-tiles.html'
            }
        }
    },
    server: {
        open: '/maplibre-transition/'
    }
});
