import {describe, expect, it} from 'vitest';
import {intensityChartScale, makeIntensityAreaPath} from './CommentsPanel';

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

describe('makeIntensityAreaPath', () => {
  it('draws White intensity above, Black intensity below, and both sides at the endpoints', () => {
    const data = [
      {moveNumber: 0, series: 'intensity' as const, value: 10, color: 'B' as const},
      {moveNumber: 1, series: 'intensity' as const, value: 5, color: 'W' as const},
      {moveNumber: 2, series: 'intensity' as const, value: 5, color: 'B' as const},
      {moveNumber: 3, series: 'intensity' as const, value: 10, color: 'W' as const},
    ];

    expect(makeIntensityAreaPath(data, 100, {top: 0, right: 0, bottom: 0, left: 0}, 3, 10, 100)).toBe(
      'M0,50L0,0L33.33333333333333,25L100,0L100,50Z' + 'M0,50L0,100L66.66666666666666,75L100,100L100,50Z'
    );
  });
});
