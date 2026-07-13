import { defineConfig } from 'vite';

export default defineConfig({
    root: 'examples',
    base: '/maplibre-transition/',
    build: {
        outDir: '../examples-dist',
        emptyOutDir: true,
        // Every page boots with `style: await loadBasemap(theme)` at module top level.
        // Vite's default build target is es2020/chrome87, which has no top-level await,
        // so the production build fails even though the dev server (esbuild @ esnext)
        // serves the pages fine. es2022 is the first target esbuild will emit TLA for.
        // Do not lower this without first de-await-ing every examples/*.html boot.
        target: 'es2022',
        rollupOptions: {
            // Every page that ships. `_test-harness.html` is deliberately absent:
            // it is a dev-server-only rig for the e2e suite, not a demo.
            input: {
                main: 'examples/index.html',
                playground: 'examples/playground.html',
                color: 'examples/color.html',
                'hover-effects': 'examples/hover-effects.html',
                'chained-transitions': 'examples/chained-transitions.html',
                stress: 'examples/stress.html',
                'rising-city': 'examples/rising-city.html'
            }
        }
    },
    server: {
        open: '/maplibre-transition/'
    }
});
