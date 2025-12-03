import { describe, it, expect } from 'vitest';
import { camelToKebab } from '../../src/index';

describe('camelToKebab', () => {
  it('converts circleRadius to circle-radius', () => {
    expect(camelToKebab('circleRadius')).toBe('circle-radius');
  });

  it('converts fillColor to fill-color', () => {
    expect(camelToKebab('fillColor')).toBe('fill-color');
  });

  it('converts circleStrokeWidth to circle-stroke-width', () => {
    expect(camelToKebab('circleStrokeWidth')).toBe('circle-stroke-width');
  });

  it('handles single word unchanged', () => {
    expect(camelToKebab('radius')).toBe('radius');
  });

  it('handles already kebab-case string', () => {
    expect(camelToKebab('circle-radius')).toBe('circle-radius');
  });

  it('converts fillOpacity to fill-opacity', () => {
    expect(camelToKebab('fillOpacity')).toBe('fill-opacity');
  });

  it('handles empty string', () => {
    expect(camelToKebab('')).toBe('');
  });

  it('handles multiple consecutive capitals correctly', () => {
    // Consecutive uppercase letters are treated as a group
    expect(camelToKebab('lineURL')).toBe('line-url');
  });
});
