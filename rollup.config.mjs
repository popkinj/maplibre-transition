import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
    input: 'src/index.ts',
    output: [
        {
            file: 'dist/index.js',
            format: 'cjs',
            sourcemap: true,
            exports: 'named'
        },
        {
            file: 'dist/index.esm.js',
            format: 'esm',
            sourcemap: true,
            exports: 'named'
        }
    ],
    external: [
        'maplibre-gl'
    ],
    onwarn(warning, warn) {
        // Suppress circular dependency warnings from d3
        if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.message.includes('d3-')) {
            return;
        }
        warn(warning);
    },
    plugins: [
        nodeResolve(),
        typescript(),
        terser()
    ]
}; 