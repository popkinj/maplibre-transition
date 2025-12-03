import { describe, it, expect } from 'vitest';
import { getColorInterpolator } from '../../src/index';

describe('getColorInterpolator', () => {
  describe('returns interpolator for valid color values', () => {
    it('returns interpolator for hex colors', () => {
      const interpolator = getColorInterpolator(['#ff0000', '#00ff00']);
      expect(interpolator).not.toBeNull();
      expect(typeof interpolator).toBe('function');
    });

    it('returns interpolator for rgb() colors', () => {
      const interpolator = getColorInterpolator(['rgb(255, 0, 0)', 'rgb(0, 255, 0)']);
      expect(interpolator).not.toBeNull();
    });

    it('returns interpolator for named colors', () => {
      const interpolator = getColorInterpolator(['red', 'blue']);
      expect(interpolator).not.toBeNull();
    });

    it('returns interpolator for multiple colors (3+)', () => {
      const interpolator = getColorInterpolator(['#ff0000', '#00ff00', '#0000ff']);
      expect(interpolator).not.toBeNull();
    });
  });

  describe('returns null for non-color values', () => {
    it('returns null for numeric values', () => {
      const interpolator = getColorInterpolator([10, 20, 30]);
      expect(interpolator).toBeNull();
    });

    it('returns null for mixed numeric and string values', () => {
      const interpolator = getColorInterpolator([10, '#ff0000']);
      expect(interpolator).toBeNull();
    });
  });

  describe('interpolation behavior', () => {
    it('returns start color at t=0', () => {
      const interpolator = getColorInterpolator(['#ff0000', '#00ff00']);
      expect(interpolator).not.toBeNull();
      const result = interpolator!(0);
      // Should be close to red
      expect(result).toMatch(/rgb\(255,\s*0,\s*0\)/);
    });

    it('returns end color at t=1', () => {
      const interpolator = getColorInterpolator(['#ff0000', '#00ff00']);
      expect(interpolator).not.toBeNull();
      const result = interpolator!(1);
      // Should be close to green
      expect(result).toMatch(/rgb\(0,\s*128,\s*0\)|rgb\(0,\s*255,\s*0\)/);
    });

    it('returns intermediate color at t=0.5', () => {
      const interpolator = getColorInterpolator(['#ff0000', '#00ff00']);
      expect(interpolator).not.toBeNull();
      const result = interpolator!(0.5);
      // Should be some intermediate color
      expect(result).toMatch(/rgb\(\d+,\s*\d+,\s*\d+\)/);
    });

    it('clamps t values below 0', () => {
      const interpolator = getColorInterpolator(['#ff0000', '#00ff00']);
      expect(interpolator).not.toBeNull();
      const result = interpolator!(-0.5);
      // Should return start color
      expect(result).toMatch(/rgb\(255,\s*0,\s*0\)/);
    });

    it('clamps t values above 1', () => {
      const interpolator = getColorInterpolator(['#ff0000', '#00ff00']);
      expect(interpolator).not.toBeNull();
      const result = interpolator!(1.5);
      // Should return end color
      expect(result).toMatch(/rgb\(0,\s*128,\s*0\)|rgb\(0,\s*255,\s*0\)/);
    });
  });

  describe('multi-breakpoint interpolation', () => {
    it('handles 3-color transitions', () => {
      const interpolator = getColorInterpolator(['#ff0000', '#00ff00', '#0000ff']);
      expect(interpolator).not.toBeNull();

      // At t=0, should be red
      expect(interpolator!(0)).toMatch(/rgb\(255,\s*0,\s*0\)/);

      // At t=1, should be blue
      expect(interpolator!(1)).toMatch(/rgb\(0,\s*0,\s*255\)/);
    });

    it('handles 4+ color transitions', () => {
      const interpolator = getColorInterpolator(['#ff0000', '#00ff00', '#0000ff', '#ffff00']);
      expect(interpolator).not.toBeNull();

      // Should return valid colors at various points
      expect(interpolator!(0.25)).toMatch(/rgb\(\d+,\s*\d+,\s*\d+\)/);
      expect(interpolator!(0.75)).toMatch(/rgb\(\d+,\s*\d+,\s*\d+\)/);
    });
  });
});
