import { Map } from "maplibre-gl";
interface TransitionOptions {
    duration?: number;
    ease?: (t: number) => number;
    delay?: number;
    onComplete?: () => void;
}
declare module "maplibre-gl" {
    interface Map {
        T: {
            (layer: any, options?: TransitionOptions): void;
            transitions: Set<any>;
        };
    }
}
export declare function init(map: Map): void;
declare const _default: {
    init: typeof init;
};
export default _default;
