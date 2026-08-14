import {describe, expect, it} from 'vitest';
import {intensityChartScale} from './CommentsPanel';

function intensity(value: number) {
  return {moveNumber: 0, series: 'intensity' as const, value};
}

describe('intensityChartScale', () => {
  it('grows only as far as the actual intensity', () => {
    expect(intensityChartScale(10, [intensity(15)], 25)).toBe(15);
  });

  it('rounds a fractional axis maximum upward to an integer', () => {
    expect(intensityChartScale(10, [intensity(13.3)], 25)).toBe(14);
  });

  it('clips intensity at the display limit', () => {
    expect(intensityChartScale(10, [intensity(50)], 25)).toBe(25);
  });

  it('allows the point axis to raise the intensity limit', () => {
    expect(intensityChartScale(35, [intensity(50)], 25)).toBe(35);
  });

  it('does not enlarge an already wider point axis', () => {
    expect(intensityChartScale(35, [intensity(20)], 25)).toBe(35);
  });
});
