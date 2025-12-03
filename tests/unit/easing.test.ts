import { describe, it, expect } from 'vitest';
import * as d3Ease from 'd3-ease';

// Test that all easing functions referenced in the plugin exist and work correctly
describe('Easing Functions', () => {
  const easingNames = [
    'linear',
    'quad',
    'cubic',
    'elastic',
    'bounce',
    'circle',
    'exp',
    'poly',
    'sin'
  ];

  describe('d3-ease function availability', () => {
    easingNames.forEach(ease => {
      const easeFnName = `ease${ease.charAt(0).toUpperCase() + ease.slice(1)}` as keyof typeof d3Ease;

      it(`has ${easeFnName} function available`, () => {
        expect(d3Ease[easeFnName]).toBeDefined();
        expect(typeof d3Ease[easeFnName]).toBe('function');
      });
    });
  });

  describe('easing function behavior', () => {
    it('linear easing returns same value as input', () => {
      expect(d3Ease.easeLinear(0)).toBe(0);
      expect(d3Ease.easeLinear(0.5)).toBe(0.5);
      expect(d3Ease.easeLinear(1)).toBe(1);
    });

    it('all easings start at 0 and end at 1', () => {
      easingNames.forEach(ease => {
        const easeFnName = `ease${ease.charAt(0).toUpperCase() + ease.slice(1)}` as keyof typeof d3Ease;
        const easeFn = d3Ease[easeFnName] as (t: number) => number;

        expect(easeFn(0)).toBeCloseTo(0, 5);
        expect(easeFn(1)).toBeCloseTo(1, 5);
      });
    });

    it('quad easing uses InOut curve by default', () => {
      // d3 easeQuad uses InOut by default, which is symmetric around 0.5
      const value = d3Ease.easeQuad(0.5);
      expect(value).toBeCloseTo(0.5, 5);
      // But at t=0.25, it should be less than 0.25 (accelerating)
      expect(d3Ease.easeQuadIn(0.5)).toBeLessThan(0.5);
    });

    it('bounce easing bounces at the end', () => {
      // Bounce easing oscillates near the end
      const value1 = d3Ease.easeBounce(0.9);
      const value2 = d3Ease.easeBounce(0.95);
      // Values should both be close to 1 but with some bounce behavior
      expect(value1).toBeGreaterThan(0.5);
      expect(value2).toBeGreaterThan(0.5);
    });

    it('elastic easing overshoots', () => {
      // Elastic easing can go above 1 briefly
      const values = [];
      for (let t = 0; t <= 1; t += 0.01) {
        values.push(d3Ease.easeElastic(t));
      }
      // Check if any value exceeds 1 (overshoot)
      const hasOvershoot = values.some(v => v > 1);
      expect(hasOvershoot).toBe(true);
    });
  });

  describe('easing function mapping', () => {
    it('maps ease name to correct d3 function', () => {
      // This simulates the mapping logic in the plugin
      const getEaseFunction = (ease: string) => {
        const easeName = `ease${ease.charAt(0).toUpperCase() + ease.slice(1)}` as keyof typeof d3Ease;
        return d3Ease[easeName] || d3Ease.easeLinear;
      };

      expect(getEaseFunction('linear')).toBe(d3Ease.easeLinear);
      expect(getEaseFunction('quad')).toBe(d3Ease.easeQuad);
      expect(getEaseFunction('cubic')).toBe(d3Ease.easeCubic);
      expect(getEaseFunction('elastic')).toBe(d3Ease.easeElastic);
      expect(getEaseFunction('bounce')).toBe(d3Ease.easeBounce);
      expect(getEaseFunction('circle')).toBe(d3Ease.easeCircle);
      expect(getEaseFunction('exp')).toBe(d3Ease.easeExp);
      expect(getEaseFunction('poly')).toBe(d3Ease.easePoly);
      expect(getEaseFunction('sin')).toBe(d3Ease.easeSin);
    });

    it('defaults to linear for unknown easing', () => {
      const getEaseFunction = (ease: string) => {
        const easeName = `ease${ease.charAt(0).toUpperCase() + ease.slice(1)}` as keyof typeof d3Ease;
        return d3Ease[easeName] || d3Ease.easeLinear;
      };

      expect(getEaseFunction('unknown')).toBe(d3Ease.easeLinear);
      expect(getEaseFunction('invalid')).toBe(d3Ease.easeLinear);
    });
  });
});
