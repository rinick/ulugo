import {pointToVertex, type SgfPoint, vertexToPoint} from '@ulugo/sgf-core';
import type {EmptyRegion, Stone} from './types';

export function collectEstimateStoneGroup(
  start: SgfPoint,
  color: Stone,
  stones: Map<SgfPoint, Stone>,
  size: number
): SgfPoint[] {
  const seen = new Set<SgfPoint>();
  const queue = [start];

  while (queue.length > 0) {
    const point = queue.shift();
    if (point == null || seen.has(point)) continue;
    if (stones.get(point) !== color) continue;
    seen.add(point);

    for (const neighbor of estimateStoneNeighbors(point, color, stones, size)) {
      if (!seen.has(neighbor)) queue.push(neighbor);
    }
  }

  return [...seen];
}

export function estimateStoneNeighbors(
  point: SgfPoint,
  color: Stone,
  stones: Map<SgfPoint, Stone>,
  size: number
): SgfPoint[] {
  const vertex = pointToVertex(point);
  if (vertex == null) return [];

  const [x, y] = vertex;
  const result: SgfPoint[] = [];
  for (const [nx, ny] of [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ]) {
    if (isVertexOnBoard(nx, ny, size) && stones.get(vertexToPoint(nx, ny)) === color) {
      result.push(vertexToPoint(nx, ny));
    }
  }

  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    if (!isVertexOnBoard(nx, ny, size)) continue;

    const neighbor = vertexToPoint(nx, ny);
    if (stones.get(neighbor) !== color) continue;
    if (estimateDiagonalConnection(x, y, nx, ny, color, stones, size)) result.push(neighbor);
  }

  return result;
}

export function orthogonalNeighbors(point: SgfPoint, size: number): SgfPoint[] {
  const vertex = pointToVertex(point);
  if (vertex == null) return [];
  const [x, y] = vertex;
  const result: SgfPoint[] = [];
  if (x > 0) result.push(vertexToPoint(x - 1, y));
  if (x < size - 1) result.push(vertexToPoint(x + 1, y));
  if (y > 0) result.push(vertexToPoint(x, y - 1));
  if (y < size - 1) result.push(vertexToPoint(x, y + 1));
  return result;
}

export function diagonalNeighbors(point: SgfPoint, size: number): SgfPoint[] {
  const vertex = pointToVertex(point);
  if (vertex == null) return [];
  const [x, y] = vertex;
  const result: SgfPoint[] = [];
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    if (isVertexOnBoard(nx, ny, size)) result.push(vertexToPoint(nx, ny));
  }
  return result;
}

export function touchesEdge(region: EmptyRegion, size: number): boolean {
  return region.points.some((point) => {
    const vertex = pointToVertex(point);
    return vertex != null && (vertex[0] === 0 || vertex[1] === 0 || vertex[0] === size - 1 || vertex[1] === size - 1);
  });
}

export function oppositeStone(color: Stone): Stone {
  return color === 'B' ? 'W' : 'B';
}

export function sortPoints(points: SgfPoint[]): SgfPoint[] {
  return [...points].sort();
}

export function isVertexOnBoard(x: number, y: number, size: number): boolean {
  return x >= 0 && x < size && y >= 0 && y < size;
}

function estimateDiagonalConnection(
  x: number,
  y: number,
  nx: number,
  ny: number,
  color: Stone,
  stones: Map<SgfPoint, Stone>,
  size: number
): boolean {
  const opponent = oppositeStone(color);
  const cutOne = vertexToPoint(nx, y);
  const cutTwo = vertexToPoint(x, ny);
  const cutOneStone = stones.get(cutOne);
  const cutTwoStone = stones.get(cutTwo);

  if (cutOneStone === opponent && cutTwoStone === opponent) return false;
  if (cutOneStone == null && cutTwoStone == null) return true;

  if (cutOneStone === opponent || cutTwoStone === opponent) {
    const emptyCut = cutOneStone === opponent ? cutTwo : cutOne;
    const opponentCut = cutOneStone === opponent ? cutOne : cutTwo;
    if (stones.has(emptyCut)) return true;
    return singleCutDiagonalConnection(
      emptyCut,
      opponentCut,
      vertexToPoint(x, y),
      vertexToPoint(nx, ny),
      color,
      stones,
      size
    );
  }

  return true;
}

function singleCutDiagonalConnection(
  emptyCut: SgfPoint,
  opponentCut: SgfPoint,
  point: SgfPoint,
  diagonalPoint: SgfPoint,
  color: Stone,
  stones: Map<SgfPoint, Stone>,
  size: number
): boolean {
  if (
    countOrthogonalGroupLiberties(point, color, stones, size) === 1 ||
    countOrthogonalGroupLiberties(diagonalPoint, color, stones, size) === 1
  ) {
    return false;
  }

  const opponent = oppositeStone(color);
  const sidePoints = orthogonalNeighbors(emptyCut, size).filter(
    (neighbor) => neighbor !== point && neighbor !== diagonalPoint
  );

  if (sidePoints.some((sidePoint) => stones.get(sidePoint) === opponent)) return false;
  if (sidePoints.some((sidePoint) => stones.get(sidePoint) === color)) return true;

  const emptyVertex = pointToVertex(emptyCut);
  const opponentVertex = pointToVertex(opponentCut);
  if (emptyVertex == null || opponentVertex == null) return false;

  const oppositeX = emptyVertex[0] + (emptyVertex[0] - opponentVertex[0]);
  const oppositeY = emptyVertex[1] + (emptyVertex[1] - opponentVertex[1]);
  return isVertexOnBoard(oppositeX, oppositeY, size) && stones.get(vertexToPoint(oppositeX, oppositeY)) === color;
}

function countOrthogonalGroupLiberties(
  start: SgfPoint,
  color: Stone,
  stones: Map<SgfPoint, Stone>,
  size: number
): number {
  const seen = new Set<SgfPoint>();
  const liberties = new Set<SgfPoint>();
  const queue = [start];

  while (queue.length > 0) {
    const point = queue.shift();
    if (point == null || seen.has(point) || stones.get(point) !== color) continue;
    seen.add(point);

    for (const neighbor of orthogonalNeighbors(point, size)) {
      const neighborColor = stones.get(neighbor);
      if (neighborColor == null) {
        liberties.add(neighbor);
      } else if (neighborColor === color && !seen.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return liberties.size;
}
