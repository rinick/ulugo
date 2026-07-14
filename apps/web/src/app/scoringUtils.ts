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

interface EmptyRegionCollection {
  regions: EmptyRegion[];
  tunnelInfos: Map<SgfPoint, TunnelInfo>;
}

interface TunnelInfo {
  sidePoints: SgfPoint[];
}

interface TunnelGroup {
  owner: Stone;
  points: SgfPoint[];
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

  const group = collectEstimateStoneGroup(point, color, position.stones, position.size);
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

  const emptyRegions = collectScoringEmptyRegions(position, deadStones);
  const pointOwners = new Map<SgfPoint, Stone>();

  for (const region of emptyRegions.regions) {
    const owner = emptyRegionOwner(region, position, deadStones, emptyRegions.tunnelInfos);
    if (owner == null) continue;

    for (const point of region.points) {
      pointOwners.set(point, owner);
      addOwnedPoint(point, owner, blackPoints, whitePoints);
    }
  }

  for (const tunnelGroup of collectTunnelGroups(emptyRegions.tunnelInfos, position, deadStones)) {
    if (tunnelGroup.points.length === 1) {
      const point = tunnelGroup.points[0];
      const tunnel = emptyRegions.tunnelInfos.get(point);
      if (tunnel == null || !tunnel.sidePoints.some((sidePoint) => pointOwners.get(sidePoint) === tunnelGroup.owner)) {
        continue;
      }
    }

    for (const point of tunnelGroup.points) {
      addOwnedPoint(point, tunnelGroup.owner, blackPoints, whitePoints);
    }
  }

  return {blackPoints: [...blackPoints], whitePoints: [...whitePoints]};
}

function addOwnedPoint(
  point: SgfPoint,
  owner: Stone,
  blackPoints: Set<SgfPoint>,
  whitePoints: Set<SgfPoint>
): void {
  if (owner === 'B') {
    blackPoints.add(point);
  } else {
    whitePoints.add(point);
  }
}

function emptyRegionOwner(
  region: EmptyRegion,
  position: BoardPosition,
  deadStones: DeadStoneSets,
  tunnelInfos: Map<SgfPoint, TunnelInfo>
): Stone | null {
  const owners = new Set<Stone>();
  for (const borderPoint of region.borderStones) {
    const color = position.stones.get(borderPoint);
    if (color == null) continue;
    owners.add(effectiveStoneColor(borderPoint, color, deadStones));
  }

  if (owners.size === 1) return [...owners][0];
  if (owners.size > 1) return null;

  if (region.points.length !== 1) return null;
  const point = region.points[0];
  const surroundedByTunnels = orthogonalNeighbors(point, position.size).every((neighbor) => tunnelInfos.has(neighbor));
  return surroundedByTunnels ? eightNeighborOwner(point, position, deadStones) : null;
}

function eightNeighborOwner(point: SgfPoint, position: BoardPosition, deadStones: DeadStoneSets): Stone | null {
  const vertex = pointToVertex(point);
  if (vertex == null) return null;

  const [x, y] = vertex;
  const owners = new Set<Stone>();
  for (let ny = y - 1; ny <= y + 1; ny += 1) {
    for (let nx = x - 1; nx <= x + 1; nx += 1) {
      if (nx === x && ny === y) continue;
      if (!isVertexOnBoard(nx, ny, position.size)) continue;

      const neighbor = vertexToPoint(nx, ny);
      const color = position.stones.get(neighbor);
      if (color == null) continue;
      owners.add(effectiveStoneColor(neighbor, color, deadStones));
    }
  }

  return owners.size === 1 ? [...owners][0] : null;
}

function estimateDeadStoneSets(position: BoardPosition): DeadStoneSets {
  const deadStones: DeadStoneSets = {black: new Set(), white: new Set()};
  const candidates: DeadStoneCandidate[] = [];
  const regions = collectEmptyRegions(position);
  const seen = new Set<SgfPoint>();

  for (const [point, color] of position.stones) {
    if (seen.has(point)) continue;
    const group = collectEstimateStoneGroup(point, color, position.stones, position.size);
    for (const groupPoint of group) seen.add(groupPoint);

    const groupSet = new Set(group);
    const adjacentRegions = regions.filter((region) =>
      region.borderStones.some((borderPoint) => groupSet.has(borderPoint))
    );
    const liberties = countGroupLiberties(group, position);
    if (liberties === 1 && neighboringOpponentGroupsHaveMoreThanOneLiberty(group, color, position)) {
      const targetSet = color === 'B' ? deadStones.black : deadStones.white;
      for (const groupPoint of group) targetSet.add(groupPoint);
      candidates.push({
        color,
        points: group,
        pointSet: groupSet,
        adjacentRegions,
        liberties,
      });
      continue;
    }

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
      liberties,
    });
  }

  resolveDeadGroupLibertyConflicts(candidates, deadStones, position);

  return deadStones;
}

function neighboringOpponentGroupsHaveMoreThanOneLiberty(
  group: SgfPoint[],
  color: Stone,
  position: BoardPosition
): boolean {
  const opponent = color === 'B' ? 'W' : 'B';
  const seen = new Set<SgfPoint>();
  let hasOpponentGroup = false;

  for (const point of group) {
    for (const neighbor of orthogonalNeighbors(point, position.size)) {
      if (seen.has(neighbor) || position.stones.get(neighbor) !== opponent) continue;

      const opponentGroup = collectEstimateStoneGroup(neighbor, opponent, position.stones, position.size);
      for (const opponentPoint of opponentGroup) seen.add(opponentPoint);
      hasOpponentGroup = true;

      if (countGroupLiberties(opponentGroup, position) <= 1) return false;
    }
  }

  return hasOpponentGroup;
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

function collectEstimateStoneGroup(
  start: SgfPoint,
  color: Stone,
  stones: Map<SgfPoint, Stone>,
  size: number
): SgfPoint[] {
  return collectStoneGroup(start, color, stones, size, estimateStoneNeighbors);
}

function collectStoneGroup(
  start: SgfPoint,
  color: Stone,
  stones: Map<SgfPoint, Stone>,
  size: number,
  neighbors: (point: SgfPoint, color: Stone, stones: Map<SgfPoint, Stone>, size: number) => SgfPoint[]
): SgfPoint[] {
  const seen = new Set<SgfPoint>();
  const queue = [start];

  while (queue.length > 0) {
    const point = queue.shift();
    if (point == null || seen.has(point)) continue;
    if (stones.get(point) !== color) continue;
    seen.add(point);

    for (const neighbor of neighbors(point, color, stones, size)) {
      if (!seen.has(neighbor)) queue.push(neighbor);
    }
  }

  return [...seen];
}

function estimateStoneNeighbors(point: SgfPoint, color: Stone, stones: Map<SgfPoint, Stone>, size: number): SgfPoint[] {
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

function estimateDiagonalConnection(
  x: number,
  y: number,
  nx: number,
  ny: number,
  color: Stone,
  stones: Map<SgfPoint, Stone>,
  size: number
): boolean {
  const opponent = color === 'B' ? 'W' : 'B';
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
    return singleCutDiagonalConnection(emptyCut, opponentCut, vertexToPoint(x, y), vertexToPoint(nx, ny), color, stones, size);
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
  const opponent = color === 'B' ? 'W' : 'B';
  const sidePoints = orthogonalNeighbors(emptyCut, size).filter(
    (neighbor) => neighbor !== point && neighbor !== diagonalPoint
  );

  if (sidePoints.some((sidePoint) => stones.get(sidePoint) === opponent)) return false;
  if (sidePoints.some((sidePoint) => stones.get(sidePoint) === color)) return true;

  const emptyVertex = pointToVertex(emptyCut);
  const opponentVertex = pointToVertex(opponentCut);
  if (emptyVertex == null || opponentVertex == null) return true;

  const oppositeX = emptyVertex[0] + (emptyVertex[0] - opponentVertex[0]);
  const oppositeY = emptyVertex[1] + (emptyVertex[1] - opponentVertex[1]);
  return !isVertexOnBoard(oppositeX, oppositeY, size) || stones.get(vertexToPoint(oppositeX, oppositeY)) !== opponent;
}

function collectEmptyRegions(position: BoardPosition, blockedPoints = new Set<SgfPoint>()): EmptyRegion[] {
  const regions: EmptyRegion[] = [];
  const seen = new Set<SgfPoint>();

  for (let y = 0; y < position.size; y += 1) {
    for (let x = 0; x < position.size; x += 1) {
      const start = vertexToPoint(x, y);
      if (seen.has(start) || position.stones.has(start) || blockedPoints.has(start)) continue;

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
          } else if (blockedPoints.has(neighbor)) {
            continue;
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

function collectScoringEmptyRegions(position: BoardPosition, deadStones: DeadStoneSets): EmptyRegionCollection {
  const tunnelPoints = new Set<SgfPoint>();
  const tunnelInfos = new Map<SgfPoint, TunnelInfo>();

  for (let y = 0; y < position.size; y += 1) {
    for (let x = 0; x < position.size; x += 1) {
      const point = vertexToPoint(x, y);
      if (position.stones.has(point)) continue;

      const tunnel = tunnelInfo(point, position, deadStones);
      if (tunnel == null) continue;

      tunnelPoints.add(point);
      tunnelInfos.set(point, tunnel);
    }
  }

  return {
    regions: collectEmptyRegions(position, tunnelPoints),
    tunnelInfos,
  };
}

function tunnelInfo(point: SgfPoint, position: BoardPosition, deadStones: DeadStoneSets): TunnelInfo | null {
  const vertex = pointToVertex(point);
  if (vertex == null || position.stones.has(point)) return null;

  const [x, y] = vertex;
  const verticalEmpty = isEmptyVertex(x, y - 1, position) && isEmptyVertex(x, y + 1, position);
  const horizontalEmpty = isEmptyVertex(x - 1, y, position) && isEmptyVertex(x + 1, y, position);
  const verticalBlocked = isBlockedVertex(x, y - 1, position) && isBlockedVertex(x, y + 1, position);
  const horizontalBlocked = isBlockedVertex(x - 1, y, position) && isBlockedVertex(x + 1, y, position);
  const regularSidePoints = verticalEmpty && horizontalBlocked
    ? [vertexToPoint(x, y - 1), vertexToPoint(x, y + 1)]
    : horizontalEmpty && verticalBlocked
      ? [vertexToPoint(x - 1, y), vertexToPoint(x + 1, y)]
      : null;
  if (regularSidePoints != null) {
    return regularTunnelOwner(point, position, deadStones) == null ? null : {sidePoints: regularSidePoints};
  }

  const oneSidePoints = oneSideTunnelSidePoints(x, y, position, deadStones);
  return oneSidePoints == null ? null : {sidePoints: oneSidePoints};
}

function oneSideTunnelSidePoints(
  x: number,
  y: number,
  position: BoardPosition,
  deadStones: DeadStoneSets
): SgfPoint[] | null {
  const verticalOwner = solidAxisOwner(
    [
      [x, y - 1],
      [x, y + 1],
    ],
    position,
    deadStones
  );
  const horizontalOwner = solidAxisOwner(
    [
      [x - 1, y],
      [x + 1, y],
    ],
    position,
    deadStones
  );

  return (
    (verticalOwner == null ? null : oneEmptyOneOpponentSidePoint(x - 1, y, x + 1, y, verticalOwner, position, deadStones)) ??
    (horizontalOwner == null ? null : oneEmptyOneOpponentSidePoint(x, y - 1, x, y + 1, horizontalOwner, position, deadStones))
  );
}

function solidAxisOwner(
  vertices: Array<[number, number]>,
  position: BoardPosition,
  deadStones: DeadStoneSets
): Stone | null {
  const colors = new Set<Stone>();

  for (const [x, y] of vertices) {
    if (!isVertexOnBoard(x, y, position.size)) continue;

    const point = vertexToPoint(x, y);
    const color = position.stones.get(point);
    if (color == null || isDeadStone(point, color, deadStones)) return null;
    colors.add(color);
  }

  return colors.size === 1 ? [...colors][0] : null;
}

function oneEmptyOneOpponentSidePoint(
  leftX: number,
  leftY: number,
  rightX: number,
  rightY: number,
  owner: Stone,
  position: BoardPosition,
  deadStones: DeadStoneSets
): SgfPoint[] | null {
  const left = sideVertexInfo(leftX, leftY, position, deadStones);
  const right = sideVertexInfo(rightX, rightY, position, deadStones);
  const opponent = owner === 'B' ? 'W' : 'B';

  if (left.kind === 'empty' && right.kind === 'stone' && right.color === opponent) return [left.point];
  if (right.kind === 'empty' && left.kind === 'stone' && left.color === opponent) return [right.point];
  return null;
}

function sideVertexInfo(
  x: number,
  y: number,
  position: BoardPosition,
  deadStones: DeadStoneSets
): {kind: 'empty'; point: SgfPoint} | {kind: 'stone'; color: Stone} | {kind: 'boundary'} {
  if (!isVertexOnBoard(x, y, position.size)) return {kind: 'boundary'};

  const point = vertexToPoint(x, y);
  const color = position.stones.get(point);
  if (color == null) return {kind: 'empty', point};
  return isDeadStone(point, color, deadStones) ? {kind: 'boundary'} : {kind: 'stone', color};
}

function regularTunnelOwner(point: SgfPoint, position: BoardPosition, deadStones: DeadStoneSets): Stone | null {
  const neighborColors = new Set<Stone>();
  for (const neighbor of orthogonalNeighbors(point, position.size)) {
    const color = position.stones.get(neighbor);
    if (color == null) continue;
    if (isDeadStone(neighbor, color, deadStones)) return null;
    neighborColors.add(color);
  }
  if (neighborColors.size !== 1) return null;

  return [...neighborColors][0];
}

function collectTunnelGroups(
  tunnelInfos: Map<SgfPoint, TunnelInfo>,
  position: BoardPosition,
  deadStones: DeadStoneSets
): TunnelGroup[] {
  const groups: TunnelGroup[] = [];
  const seen = new Set<SgfPoint>();

  for (const point of tunnelInfos.keys()) {
    if (seen.has(point)) continue;

    const owner = eightNeighborOwner(point, position, deadStones);
    seen.add(point);
    if (owner == null) continue;

    const group: SgfPoint[] = [];
    const queue = [point];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current == null) continue;
      group.push(current);

      for (const neighbor of orthogonalNeighbors(current, position.size)) {
        if (seen.has(neighbor) || !tunnelInfos.has(neighbor)) continue;
        if (eightNeighborOwner(neighbor, position, deadStones) !== owner) continue;

        seen.add(neighbor);
        queue.push(neighbor);
      }
    }

    groups.push({owner, points: group});
  }

  return groups;
}

function isEmptyVertex(x: number, y: number, position: BoardPosition): boolean {
  return isVertexOnBoard(x, y, position.size) && !position.stones.has(vertexToPoint(x, y));
}

function isBlockedVertex(x: number, y: number, position: BoardPosition): boolean {
  return !isVertexOnBoard(x, y, position.size) || position.stones.has(vertexToPoint(x, y));
}

function effectiveStoneColor(point: SgfPoint, color: Stone, deadStones: DeadStoneSets): Stone {
  return isDeadStone(point, color, deadStones) ? oppositeStone(color) : color;
}

function isDeadStone(point: SgfPoint, color: Stone, deadStones: DeadStoneSets): boolean {
  return color === 'B' ? deadStones.black.has(point) : deadStones.white.has(point);
}

function oppositeStone(color: Stone): Stone {
  return color === 'B' ? 'W' : 'B';
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
