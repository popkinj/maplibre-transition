import { describe, it, expect } from 'vitest';
import { createNumericSampler } from '../../src/index';
import { easeLinear, easeCubic, easeElastic } from 'd3-ease';

/**
 * The numeric sampler replaces the old d3 `scaleLinear()` hot path. It is the
 * thing that runs once per animating property per frame, so it must be both
 * allocation-free and exact at its endpoints.
 */
describe('createNumericSampler', () => {
  describe('two-value lerp', () => {
    const sampler = createNumericSampler([10, 30], 1000, 500, easeLinear);

    it('returns the start value at t = start', () => {
      expect(sampler(1000)).toBe(10);
    });

    it('returns the end value exactly at t = start + duration', () => {
      expect(sampler(1500)).toBe(30);
    });

    it('interpolates linearly at the midpoint', () => {
      expect(sampler(1250)).toBeCloseTo(20, 10);
    });

    it('is monotonic across the duration', () => {
      let prev = -Infinity;
      for (let t = 1000; t <= 1500; t += 25) {
        const v = sampler(t) as number;
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    });
  });

  describe('clamping outside [start, end]', () => {
    const sampler = createNumericSampler([10, 30], 1000, 500, easeLinear);

    it('clamps below the start time to the first value', () => {
      expect(sampler(0)).toBe(10);
      expect(sampler(999)).toBe(10);
      expect(sampler(-5000)).toBe(10);
    });

    it('clamps above the end time to the final value', () => {
      expect(sampler(1501)).toBe(30);
      expect(sampler(999999)).toBe(30);
    });

    it('clamps easing overshoot (elastic) into the value range', () => {
      const elastic = createNumericSampler([10, 30], 0, 100, easeElastic);
      for (let t = -50; t <= 200; t += 5) {
        const v = elastic(t) as number;
        expect(v).toBeGreaterThanOrEqual(10);
        expect(v).toBeLessThanOrEqual(30);
      }
      expect(elastic(100)).toBe(30);
    });
  });

  describe('multi-breakpoint piecewise interpolation', () => {
    // The regression that tests/e2e/interruptions.spec.ts pins with toBe(10):
    // a [10, 30, 10] pulse must land back on EXACTLY 10, not 9.99999.
    const pulse = createNumericSampler([10, 30, 10], 0, 300, easeLinear);

    it('lands exactly on the final breakpoint at t = 1', () => {
      expect(pulse(300)).toBe(10);
      expect(pulse(300)).not.toBeCloseTo(9.999999, 6);
      expect(Object.is(pulse(300), 10)).toBe(true);
    });

    it('starts on the first breakpoint', () => {
      expect(pulse(0)).toBe(10);
    });

    it('peaks on the middle breakpoint halfway through', () => {
      expect(pulse(150)).toBeCloseTo(30, 10);
    });

    it('rises then falls', () => {
      expect(pulse(75)).toBeCloseTo(20, 10);
      expect(pulse(225)).toBeCloseTo(20, 10);
    });

    it('handles 4 breakpoints', () => {
      const s = createNumericSampler([0, 10, 20, 30], 0, 300, easeLinear);
      expect(s(0)).toBe(0);
      expect(s(100)).toBeCloseTo(10, 10);
      expect(s(200)).toBeCloseTo(20, 10);
      expect(s(300)).toBe(30);
    });
  });

  describe('easing', () => {
    it('applies the easing function to progress', () => {
      const linear = createNumericSampler([0, 100], 0, 1000, easeLinear);
      const cubic = createNumericSampler([0, 100], 0, 1000, easeCubic);
      // easeCubic is slow at the start, so it must trail linear at t = 0.25.
      expect(cubic(250) as number).toBeLessThan(linear(250) as number);
      // Endpoints agree exactly regardless of easing.
      expect(cubic(0)).toBe(0);
      expect(cubic(1000)).toBe(100);
    });
  });

  describe('degenerate inputs', () => {
    it('duration 0 returns the final value immediately', () => {
      const s = createNumericSampler([10, 40], 1000, 0, easeLinear);
      expect(s(1000)).toBe(40);
      expect(s(0)).toBe(40);
      expect(s(5000)).toBe(40);
    });

    it('a single value is a constant', () => {
      const s = createNumericSampler([7], 0, 500, easeLinear);
      expect(s(0)).toBe(7);
      expect(s(250)).toBe(7);
      expect(s(500)).toBe(7);
    });

    it('handles a descending range', () => {
      const s = createNumericSampler([30, 6], 0, 800, easeLinear);
      expect(s(0)).toBe(30);
      expect(s(400)).toBeCloseTo(18, 10);
      expect(s(800)).toBe(6);
    });
  });
});
