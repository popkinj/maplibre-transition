import { Map } from 'maplibre-gl';
declare module 'maplibre-gl' {
    interface Map {
        T: {
            (): void;
        };
    }
}
export declare function init(map: Map): void;
declare const _default: {
    init: typeof init;
};
export default _default;
