import {describe, expect, it} from 'vitest';
import {scanCropGeometry} from './boardRecognitionImageUtils';

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
