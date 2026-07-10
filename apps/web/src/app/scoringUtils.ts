import type {BoardPosition} from '@ulugo/go-core';
import {
  isPointOnBoard,
  pointToVertex,
  type SgfDocument,
  type SgfNode,
  type SgfPoint,
  vertexToPoint,
} from '@ulugo/sgf-core';

type Stone = 'B' | 'W';

interface DeadStoneSets {
  black: Set<SgfPoint>;
  white: Set<SgfPoint>;
}

interface EmptyRegion {
  points: SgfPoint[];
  borderStones: SgfPoint[];
}

interface DeadStoneCandidate {
  color: Stone;
  points: SgfPoint[];
  pointSet: Set<SgfPoint>;
  adjacentRegions: EmptyRegion[];
  liberties: number;
}

export interface ScoringPoints {
  blackPoints: SgfPoint[];
  whitePoints: SgfPoint[];
}

export interface ScoringSummary {
  blackScore: number;
  whiteScore: number;
  result: string;
}

export function estimateScoringPoints(position: BoardPosition): ScoringPoints {
  return scoringPointsForDeadStones(position, estimateDeadStoneSets(position));
}

export function toggleScoringGroup(position: BoardPosition, node: SgfNode, point: SgfPoint): ScoringPoints | null {
  const color = position.stones.get(point);
  if (color == null) return null;

  const group = collectScoringStoneGroup(point, color, position.stones, position.size);
  const deadStones = deadStoneSetsFromNode(position, node);
  const targetSet = color === 'B' ? deadStones.black : deadStones.white;
  const currentlyDead = group.every((groupPoint) => targetSet.has(groupPoint));

  for (const groupPoint of group) targetSet.delete(groupPoint);
  if (!currentlyDead) {
    for (const groupPoint of group) targetSet.add(groupPoint);
  }

  return scoringPointsForDeadStones(position, deadStones);
}

export function scoringSummaryForNode(
  document: SgfDocument,
  node: SgfNode,
  position: BoardPosition
): ScoringSummary {
  const blackPoints = onBoardPointSet(node.data.TB ?? [], position.size);
  const whitePoints = onBoardPointSet(node.data.TW ?? [], position.size);
  const deadWhiteStones = countMarkedStones(blackPoints, position, 'W');
  const deadBlackStones = countMarkedStones(whitePoints, position, 'B');
  const blackScore = blackPoints.size + position.captures.B + deadWhiteStones;
  const whiteScore = whitePoints.size + position.captures.W + deadBlackStones;

  return {
    blackScore,
    whiteScore,
    result: formatScoringResult(blackScore - (whiteScore + komi(document))),
  };
}

export function formatScoringValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

function scoringPointsForDeadStones(position: BoardPosition, deadStones: DeadStoneSets): ScoringPoints {
  const blackPoints = new Set<SgfPoint>();
  const whitePoints = new Set<SgfPoint>();

  for (const point of deadStones.white) blackPoints.add(point);
  for (const point of deadStones.black) whitePoints.add(point);

  for (const region of collectEmptyRegions(position)) {
    const owners = new Set<Stone>();
    for (const borderPoint of region.borderStones) {
      const color = position.stones.get(borderPoint);
      if (color == null) continue;
      if ((color === 'B' && !deadStones.black.has(borderPoint)) || (color === 'W' && deadStones.white.has(borderPoint))) {
        owners.add('B');
      }
      if ((color === 'W' && !deadStones.white.has(borderPoint)) || (color === 'B' && deadStones.black.has(borderPoint))) {
        owners.add('W');
      }
    }

    if (owners.size !== 1) continue;
    const owner = [...owners][0];
    for (const point of region.points) {
      if (owner === 'B') {
        blackPoints.add(point);
      } else {
        whitePoints.add(point);
      }
    }
  }

  return {blackPoints: [...blackPoints], whitePoints: [...whitePoints]};
}

function estimateDeadStoneSets(position: BoardPosition): DeadStoneSets {
  const deadStones: DeadStoneSets = {black: new Set(), white: new Set()};
  const candidates: DeadStoneCandidate[] = [];
  const regions = collectEmptyRegions(position);
  const seen = new Set<SgfPoint>();

  for (const [point, color] of position.stones) {
    if (seen.has(point)) continue;
    const group = collectScoringStoneGroup(point, color, position.stones, position.size);
    for (const groupPoint of group) seen.add(groupPoint);

    const groupSet = new Set(group);
    const adjacentRegions = regions.filter((region) =>
      region.borderStones.some((borderPoint) => groupSet.has(borderPoint))
    );
    if (adjacentRegions.length === 0 || countEyes(adjacentRegions, groupSet, position) >= 2) continue;

    const opponent = color === 'B' ? 'W' : 'B';
    const surrounded = adjacentRegions.every((region) => {
      let hasOpponent = false;
      for (const borderPoint of region.borderStones) {
        if (groupSet.has(borderPoint)) continue;
        const borderColor = position.stones.get(borderPoint);
        if (borderColor === color) return false;
        if (borderColor === opponent) hasOpponent = true;
      }
      return hasOpponent;
    });

    if (!surrounded) continue;
    const targetSet = color === 'B' ? deadStones.black : deadStones.white;
    for (const groupPoint of group) targetSet.add(groupPoint);
    candidates.push({
      color,
      points: group,
      pointSet: groupSet,
      adjacentRegions,
      liberties: countGroupLiberties(group, position),
    });
  }

  resolveDeadGroupLibertyConflicts(candidates, deadStones, position);

  return deadStones;
}

function deadStoneSetsFromNode(position: BoardPosition, node: SgfNode): DeadStoneSets {
  const deadStones: DeadStoneSets = {black: new Set(), white: new Set()};

  for (const point of node.data.TW ?? []) {
    if (position.stones.get(point) === 'B') deadStones.black.add(point);
  }
  for (const point of node.data.TB ?? []) {
    if (position.stones.get(point) === 'W') deadStones.white.add(point);
  }

  return deadStones;
}

function countEyes(regions: EmptyRegion[], group: Set<SgfPoint>, position: BoardPosition): number {
  return regions.filter((region) =>
    region.borderStones.every((borderPoint) => group.has(borderPoint) || position.stones.get(borderPoint) == null)
  ).length;
}

function resolveDeadGroupLibertyConflicts(
  candidates: DeadStoneCandidate[],
  deadStones: DeadStoneSets,
  position: BoardPosition
): void {
  const aliveCandidates = new Set<DeadStoneCandidate>();

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      if (left.color === right.color) continue;
      if (left.liberties === right.liberties) continue;
      if (!groupsAreOpposingNeighbors(left, right, position.size) && !groupsShareEmptyRegion(left, right)) continue;

      aliveCandidates.add(left.liberties > right.liberties ? left : right);
    }
  }

  for (const candidate of aliveCandidates) {
    const targetSet = candidate.color === 'B' ? deadStones.black : deadStones.white;
    for (const point of candidate.points) targetSet.delete(point);
  }
}

function groupsAreOpposingNeighbors(left: DeadStoneCandidate, right: DeadStoneCandidate, size: number): boolean {
  for (const point of left.points) {
    for (const neighbor of orthogonalNeighbors(point, size)) {
      if (right.pointSet.has(neighbor)) return true;
    }
  }
  return false;
}

function groupsShareEmptyRegion(left: DeadStoneCandidate, right: DeadStoneCandidate): boolean {
  const leftRegions = new Set(left.adjacentRegions);
  return right.adjacentRegions.some((region) => leftRegions.has(region));
}

function countGroupLiberties(group: SgfPoint[], position: BoardPosition): number {
  const liberties = new Set<SgfPoint>();
  for (const point of group) {
    for (const neighbor of orthogonalNeighbors(point, position.size)) {
      if (!position.stones.has(neighbor)) liberties.add(neighbor);
    }
  }
  return liberties.size;
}

function collectScoringStoneGroup(
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

    for (const neighbor of scoringStoneNeighbors(point, color, stones, size)) {
      if (!seen.has(neighbor)) queue.push(neighbor);
    }
  }

  return [...seen];
}

function scoringStoneNeighbors(point: SgfPoint, color: Stone, stones: Map<SgfPoint, Stone>, size: number): SgfPoint[] {
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

    const opponent = color === 'B' ? 'W' : 'B';
    const cutOne = vertexToPoint(x + dx, y);
    const cutTwo = vertexToPoint(x, y + dy);
    if (stones.get(cutOne) === opponent && stones.get(cutTwo) === opponent) continue;
    result.push(neighbor);
  }

  return result;
}

function collectEmptyRegions(position: BoardPosition): EmptyRegion[] {
  const regions: EmptyRegion[] = [];
  const seen = new Set<SgfPoint>();

  for (let y = 0; y < position.size; y += 1) {
    for (let x = 0; x < position.size; x += 1) {
      const start = vertexToPoint(x, y);
      if (seen.has(start) || position.stones.has(start)) continue;

      const points: SgfPoint[] = [];
      const borderStones = new Set<SgfPoint>();
      const queue = [start];
      seen.add(start);

      while (queue.length > 0) {
        const point = queue.shift();
        if (point == null) continue;
        points.push(point);

        for (const neighbor of orthogonalNeighbors(point, position.size)) {
          if (position.stones.has(neighbor)) {
            borderStones.add(neighbor);
          } else if (!seen.has(neighbor)) {
            seen.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      regions.push({points, borderStones: [...borderStones]});
    }
  }

  return regions;
}

function orthogonalNeighbors(point: SgfPoint, size: number): SgfPoint[] {
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

function onBoardPointSet(points: SgfPoint[], size: number): Set<SgfPoint> {
  return new Set(points.filter((point) => isPointOnBoard(point, size)));
}

function countMarkedStones(points: Set<SgfPoint>, position: BoardPosition, color: Stone): number {
  let count = 0;
  for (const point of points) {
    if (position.stones.get(point) === color) count += 1;
  }
  return count;
}

function komi(document: SgfDocument): number {
  const value = Number((document.root.data.KM?.[0] ?? '0').trim().replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

function formatScoringResult(diff: number): string {
  if (diff > 0) return `B+${formatScoringValue(diff)}`;
  if (diff < 0) return `W+${formatScoringValue(Math.abs(diff))}`;
  return '0';
}

function isVertexOnBoard(x: number, y: number, size: number): boolean {
  return x >= 0 && x < size && y >= 0 && y < size;
}
