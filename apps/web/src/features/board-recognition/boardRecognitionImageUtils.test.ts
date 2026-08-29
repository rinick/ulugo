import {describe, expect, it} from 'vitest';
import {cropPointFromViewport, scanCropGeometry} from './boardRecognitionImageUtils';

describe('cropPointFromViewport', () => {
  const rect = {left: 100, top: 200, width: 300, height: 600};

  it('uses viewport axes when the page is not rotated', () => {
    expect(cropPointFromViewport(rect, 190, 320, false)).toEqual({x: 0.3, y: 0.2});
  });

  it('maps viewport axes back after the portrait minimal-mode rotation', () => {
    expect(cropPointFromViewport(rect, 190, 320, true)).toEqual({x: 0.2, y: 0.7});
  });
});

describe('scanCropGeometry', () => {
  it('maps the preview crop to the original image before resizing', () => {
    expect(scanCropGeometry(8000, 6000, {x: 0.25, y: 0.25, width: 0.25, height: 0.25}, 2048)).toEqual({
      sourceX: 2000,
      sourceY: 1500,
      sourceWidth: 2000,
      sourceHeight: 1500,
      outputWidth: 2000,
      outputHeight: 1500,
    });
  });

  it('limits a large crop while preserving its aspect ratio', () => {
    expect(scanCropGeometry(8000, 6000, {x: 0, y: 0, width: 0.5, height: 0.5}, 2048)).toEqual({
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 4000,
      sourceHeight: 3000,
      outputWidth: 2048,
      outputHeight: 1536,
    });
  });
});
