import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

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
    plugins: [
        typescript(),
        terser()
    ]
}; 