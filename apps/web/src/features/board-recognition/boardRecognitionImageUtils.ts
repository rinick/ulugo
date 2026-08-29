export interface NormalizedCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScanCropGeometry {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
}

export function cropPointFromViewport(
  rect: {left: number; top: number; width: number; height: number},
  clientX: number,
  clientY: number,
  rotatedClockwise: boolean
): {x: number; y: number} {
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  return rotatedClockwise ? {x: y, y: 1 - x} : {x, y};
}

export function scanCropGeometry(
  imageWidth: number,
  imageHeight: number,
  crop: NormalizedCrop,
  maxDimension: number
): ScanCropGeometry {
  const sourceX = Math.round(imageWidth * crop.x);
  const sourceY = Math.round(imageHeight * crop.y);
  const sourceWidth = Math.max(1, Math.min(imageWidth - sourceX, Math.round(imageWidth * crop.width)));
  const sourceHeight = Math.max(1, Math.min(imageHeight - sourceY, Math.round(imageHeight * crop.height)));
  const scale = Math.min(1, maxDimension / sourceWidth, maxDimension / sourceHeight);

  return {
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    outputWidth: Math.max(1, Math.round(sourceWidth * scale)),
    outputHeight: Math.max(1, Math.round(sourceHeight * scale)),
  };
}
