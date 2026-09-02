import type {BoardPosition} from '@ulugo/go-core';
import {pointToVertex, type SgfPoint, vertexToPoint} from '@ulugo/sgf-core';
import {
  collectEstimateStoneGroup,
  diagonalNeighbors,
  oppositeStone,
  orthogonalNeighbors,
  touchesEdge,
} from './geometry';
import type {DeadStoneSets, EmptyRegion, GroupStatus, ScoringAnalysis, Stone, StoneGroup} from './types';

interface EyeValue {
  min: number;
  max: number;
}

export function analyzeScoringPosition(position: BoardPosition, deadStones: DeadStoneSets): ScoringAnalysis {
  const groups = collectStoneGroups(position, deadStones);
  const groupByPoint = new Map<SgfPoint, StoneGroup>();
  for (const group of groups) {
    for (const point of group.points) groupByPoint.set(point, group);
  }

  const emptyRegions = collectEmptyRegions(position, groupByPoint);
  linkGroupsAndRegions(groups, emptyRegions, groupByPoint, position);
  classifyGroups(groups, emptyRegions, position, deadStones);

  return {position, groups, emptyRegions};
}

export function effectiveGroupColor(group: StoneGroup, criticalOwner?: Stone): Stone {
  if (group.status === 'dead') return oppositeStone(group.color);
  if (group.status === 'critical' && criticalOwner != null) return criticalOwner;
  return group.color;
}

export function regionBorderColors(region: EmptyRegion, groups: StoneGroup[], criticalOwner?: Stone): Set<Stone> {
  const colors = new Set<Stone>();
  for (const id of region.borderGroupIds) {
    const group = groups[id];
    if (group != null) colors.add(effectiveGroupColor(group, criticalOwner));
  }
  return colors;
}

export function isSekiRegion(region: EmptyRegion, groups: StoneGroup[]): boolean {
  const borderGroups = borderStoneGroups(region, groups).filter((group) => group.status !== 'dead');
  const colors = new Set(borderGroups.map((group) => group.color));
  if (colors.size < 2) return false;

  return borderGroups.some(
    (group) => group.status === 'seki' && region.points.some((point) => group.liberties.has(point))
  );
}

function collectStoneGroups(position: BoardPosition, deadStones: DeadStoneSets): StoneGroup[] {
  const groups: StoneGroup[] = [];
  const seen = new Set<SgfPoint>();

  for (const [point, color] of position.stones) {
    if (seen.has(point)) continue;

    const points = collectEstimateStoneGroup(point, color, position.stones, position.size);
    for (const groupPoint of points) seen.add(groupPoint);

    groups.push({
      id: groups.length,
      color,
      points,
      liberties: collectLiberties(points, position),
      adjacentOpponentIds: new Set(),
      adjacentRegionIds: new Set(),
      eyeMin: 0,
      eyeMax: 0,
      status: manualGroupStatus({color, points}, deadStones) ?? 'unknown',
    });
  }

  return groups;
}

function collectEmptyRegions(position: BoardPosition, groupByPoint: Map<SgfPoint, StoneGroup>): EmptyRegion[] {
  const regions: EmptyRegion[] = [];
  const seen = new Set<SgfPoint>();

  for (let y = 0; y < position.size; y += 1) {
    for (let x = 0; x < position.size; x += 1) {
      const start = vertexToPoint(x, y);
      if (seen.has(start) || position.stones.has(start)) continue;

      const points: SgfPoint[] = [];
      const borderGroupIds = new Set<number>();
      const queue = [start];
      seen.add(start);

      for (let index = 0; index < queue.length; index += 1) {
        const point = queue[index];
        points.push(point);

        for (const neighbor of orthogonalNeighbors(point, position.size)) {
          const neighborGroup = groupByPoint.get(neighbor);
          if (neighborGroup != null) {
            borderGroupIds.add(neighborGroup.id);
          } else if (!seen.has(neighbor)) {
            seen.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      regions.push({id: regions.length, points, borderGroupIds});
    }
  }

  return regions;
}

function linkGroupsAndRegions(
  groups: StoneGroup[],
  emptyRegions: EmptyRegion[],
  groupByPoint: Map<SgfPoint, StoneGroup>,
  position: BoardPosition
): void {
  for (const group of groups) {
    group.adjacentRegionIds.clear();
    group.adjacentOpponentIds.clear();
  }

  for (const region of emptyRegions) {
    for (const groupId of region.borderGroupIds) groups[groupId]?.adjacentRegionIds.add(region.id);
  }

  for (const group of groups) {
    for (const point of group.points) {
      for (const neighbor of orthogonalNeighbors(point, position.size)) {
        const neighborGroup = groupByPoint.get(neighbor);
        if (neighborGroup != null && neighborGroup.color !== group.color)
          group.adjacentOpponentIds.add(neighborGroup.id);
      }
    }
  }
}

function classifyGroups(
  groups: StoneGroup[],
  emptyRegions: EmptyRegion[],
  position: BoardPosition,
  deadStones: DeadStoneSets
): void {
  for (const group of groups) {
    const manual = manualGroupStatus(group, deadStones);
    if (manual != null) {
      group.status = manual;
      group.eyeMin = 0;
      group.eyeMax = 0;
      continue;
    }

    const eyeValue = groupEyeValue(group, groups, emptyRegions, position);
    group.eyeMin = eyeValue.min;
    group.eyeMax = eyeValue.max;
  }

  for (const group of groups) {
    if (manualGroupStatus(group, deadStones) != null) continue;
    group.status = classifyGroup(group, groups, emptyRegions, position, deadStones);
  }

  markSekiGroups(groups, emptyRegions, deadStones);
  markSurroundedSmallDeadGroups(groups, emptyRegions, deadStones);
  promoteGroupsWithResolvedOwnSpace(groups, emptyRegions, deadStones);
  resolveAdjacentDeadGroupConflicts(groups, emptyRegions, position, deadStones);
}

function classifyGroup(
  group: StoneGroup,
  groups: StoneGroup[],
  emptyRegions: EmptyRegion[],
  position: BoardPosition,
  deadStones: DeadStoneSets
): GroupStatus {
  if (group.eyeMin >= 2) return 'alive';

  const opponentGroups = adjacentOpponentGroups(group, groups);
  if (
    group.liberties.size <= 1 &&
    opponentGroups.length > 0 &&
    opponentGroups.every((opponent) => opponent.liberties.size > 1) &&
    !hasPotentialSeki(group, groups, emptyRegions, deadStones)
  ) {
    return 'dead';
  }

  const ownSpace = countOwnRegionSpace(group, groups, emptyRegions);
  const contestedEscape = countContestedEscapeSpace(group, groups, emptyRegions, position.size);
  if (
    group.eyeMax <= 1 &&
    ownSpace <= 5 &&
    group.liberties.size <= 3 &&
    contestedEscape < 5 &&
    opponentGroups.length > 0 &&
    !hasPotentialSeki(group, groups, emptyRegions, deadStones)
  ) {
    return 'dead';
  }

  if (
    group.eyeMax < 1 &&
    group.liberties.size <= 2 &&
    ownSpace <= 1 &&
    contestedEscape < 3 &&
    opponentGroups.some((opponent) => opponent.liberties.size >= group.liberties.size) &&
    !hasPotentialSeki(group, groups, emptyRegions, deadStones)
  ) {
    return 'dead';
  }

  if (group.eyeMax >= 2) return 'critical';
  if (group.eyeMin >= 1 && (ownSpace >= 3 || group.liberties.size >= 4)) return 'alive';
  if (ownSpace >= 8 || contestedEscape >= 10 || group.liberties.size >= 7) return 'alive';
  if (group.liberties.size <= 3 && opponentGroups.length > 0) return 'critical';
  return 'unknown';
}

function markSekiGroups(groups: StoneGroup[], emptyRegions: EmptyRegion[], deadStones: DeadStoneSets): void {
  for (const region of emptyRegions) {
    if (!isPotentialSekiRegion(region, groups)) continue;

    for (const group of sekiCandidateGroups(region, groups)) {
      if (manualGroupStatus(group, deadStones) != null) continue;
      group.status = 'seki';
    }
  }

  for (const group of groups) {
    if (manualGroupStatus(group, deadStones) != null) continue;

    for (const opponent of adjacentOpponentGroups(group, groups)) {
      if (manualGroupStatus(opponent, deadStones) != null) continue;
      if (!isSharedLibertySekiPair(group, opponent, emptyRegions)) continue;

      group.status = 'seki';
      opponent.status = 'seki';
    }
  }
}

function markSurroundedSmallDeadGroups(
  groups: StoneGroup[],
  emptyRegions: EmptyRegion[],
  deadStones: DeadStoneSets
): void {
  for (const group of groups) {
    if (manualGroupStatus(group, deadStones) != null) continue;
    if (!isSurroundedSmallDeadGroup(group, groups, emptyRegions, deadStones)) continue;
    group.status = 'dead';
  }
}

function promoteGroupsWithResolvedOwnSpace(
  groups: StoneGroup[],
  emptyRegions: EmptyRegion[],
  deadStones: DeadStoneSets
): void {
  for (const group of groups) {
    if (manualGroupStatus(group, deadStones) != null) continue;
    if (group.status !== 'critical' && group.status !== 'unknown') continue;

    const ownSpace = countOwnRegionSpace(group, groups, emptyRegions);
    if (group.eyeMin >= 1 && (ownSpace >= 3 || group.liberties.size >= 4)) {
      group.status = 'alive';
    } else if (ownSpace >= 8 || group.liberties.size >= 7) {
      group.status = 'alive';
    }
  }
}

function resolveAdjacentDeadGroupConflicts(
  groups: StoneGroup[],
  emptyRegions: EmptyRegion[],
  position: BoardPosition,
  deadStones: DeadStoneSets
): void {
  const seen = new Set<number>();

  for (const group of groups) {
    if (seen.has(group.id) || !isAutomaticDeadGroup(group, deadStones)) continue;

    const component = collectAdjacentDeadComponent(group, groups, deadStones);
    for (const item of component) seen.add(item.id);
    if (component.length < 2 || new Set(component.map((item) => item.color)).size < 2) continue;

    const blackScore = component
      .filter((item) => item.color === 'B')
      .reduce((sum, item) => sum + deadConflictStrength(item, groups, emptyRegions, position), 0);
    const whiteScore = component
      .filter((item) => item.color === 'W')
      .reduce((sum, item) => sum + deadConflictStrength(item, groups, emptyRegions, position), 0);
    if (Math.abs(blackScore - whiteScore) < 4) continue;

    const survivorColor = blackScore > whiteScore ? 'B' : 'W';
    for (const item of component) {
      if (item.color !== survivorColor) continue;
      item.status = deadConflictSurvivorStatus(item, groups, emptyRegions);
    }
  }
}

function collectAdjacentDeadComponent(
  start: StoneGroup,
  groups: StoneGroup[],
  deadStones: DeadStoneSets
): StoneGroup[] {
  const component: StoneGroup[] = [];
  const seen = new Set<number>([start.id]);
  const queue = [start];

  for (let index = 0; index < queue.length; index += 1) {
    const group = queue[index];
    component.push(group);

    for (const opponent of adjacentOpponentGroups(group, groups)) {
      if (seen.has(opponent.id) || !isAutomaticDeadGroup(opponent, deadStones)) continue;
      seen.add(opponent.id);
      queue.push(opponent);
    }
  }

  return component;
}

function isAutomaticDeadGroup(group: StoneGroup, deadStones: DeadStoneSets): boolean {
  return group.status === 'dead' && manualGroupStatus(group, deadStones) == null;
}

function deadConflictStrength(
  group: StoneGroup,
  groups: StoneGroup[],
  emptyRegions: EmptyRegion[],
  position: BoardPosition
): number {
  return (
    group.eyeMin * 10 +
    group.eyeMax * 5 +
    Math.min(8, group.liberties.size) * 2 +
    Math.min(10, countOwnRegionSpace(group, groups, emptyRegions)) +
    Math.min(8, countContestedEscapeSpace(group, groups, emptyRegions, position.size)) +
    Math.min(12, group.points.length)
  );
}

function deadConflictSurvivorStatus(group: StoneGroup, groups: StoneGroup[], emptyRegions: EmptyRegion[]): GroupStatus {
  const ownSpace = countOwnRegionSpace(group, groups, emptyRegions);
  return group.eyeMax >= 1 || ownSpace >= 3 || group.liberties.size >= 4 || group.points.length >= 4
    ? 'alive'
    : 'critical';
}

function groupEyeValue(
  group: StoneGroup,
  groups: StoneGroup[],
  emptyRegions: EmptyRegion[],
  position: BoardPosition
): EyeValue {
  let min = 0;
  let max = 0;

  for (const regionId of group.adjacentRegionIds) {
    const region = emptyRegions[regionId];
    if (region == null || !isOwnEyespace(region, group, groups)) continue;

    const value = eyespaceValue(region, group.color, position);
    min += value.min;
    max += value.max;
  }

  return {min: Math.min(2, min), max: Math.min(2, max)};
}

function isOwnEyespace(region: EmptyRegion, group: StoneGroup, groups: StoneGroup[]): boolean {
  const colors = regionBorderColors(region, groups);
  return colors.size === 1 && colors.has(group.color);
}

function eyespaceValue(region: EmptyRegion, color: Stone, position: BoardPosition): EyeValue {
  const size = region.points.length;
  if (size === 0) return {min: 0, max: 0};

  const falseEyeCount = region.points.filter((point) => isFalseEyePoint(point, color, position)).length;
  if (falseEyeCount === size) return {min: 0, max: 1};
  if (size === 1) return falseEyeCount === 0 ? {min: 1, max: 1} : {min: 0, max: 1};
  if (size === 2) return {min: 1, max: 1};
  if (size === 3) return {min: 1, max: 1};

  const separateEyeCandidates = independentEyeCandidateCount(region, color, position);
  if (size <= 5 && separateEyeCandidates < 2) return {min: 1, max: 1};
  if (size <= 5) return {min: 1, max: 2};
  if (separateEyeCandidates >= 2 || size >= 7) return {min: 2, max: 2};
  if (size >= 6) return {min: 1, max: 2};
  return {min: 1, max: 1};
}

function borderStoneGroups(region: EmptyRegion, groups: StoneGroup[]): StoneGroup[] {
  return [...region.borderGroupIds].map((id) => groups[id]).filter((value): value is StoneGroup => value != null);
}

function hasPotentialSeki(
  group: StoneGroup,
  groups: StoneGroup[],
  emptyRegions: EmptyRegion[],
  deadStones: DeadStoneSets
): boolean {
  const regionSeki = [...group.adjacentRegionIds].some((regionId) => {
    const region = emptyRegions[regionId];
    return (
      region != null && isPotentialSekiRegion(region, groups) && sekiCandidateGroups(region, groups).includes(group)
    );
  });
  if (regionSeki) return true;

  return adjacentOpponentGroups(group, groups).some(
    (opponent) =>
      manualGroupStatus(opponent, deadStones) == null && isSharedLibertySekiPair(group, opponent, emptyRegions)
  );
}

function isPotentialSekiRegion(region: EmptyRegion, groups: StoneGroup[]): boolean {
  if (region.points.length !== 2) return false;

  const colors = new Set(sekiCandidateGroups(region, groups).map((group) => group.color));
  return colors.has('B') && colors.has('W');
}

function sekiCandidateGroups(region: EmptyRegion, groups: StoneGroup[]): StoneGroup[] {
  return borderStoneGroups(region, groups).filter((group) => {
    if (group.eyeMin >= 2) return false;

    const regionLiberties = region.points.filter((point) => group.liberties.has(point)).length;
    return regionLiberties >= 2 || (group.eyeMin >= 1 && regionLiberties >= 1);
  });
}

function isSharedLibertySekiPair(group: StoneGroup, opponent: StoneGroup, emptyRegions: EmptyRegion[]): boolean {
  if (group.color === opponent.color || group.eyeMin >= 2 || opponent.eyeMin >= 2) return false;
  if (group.status === 'alive' && opponent.status === 'alive') return false;

  const sharedLiberties = [...group.liberties].filter(
    (point) => opponent.liberties.has(point) && isLocalSharedLiberty(point, group, opponent, emptyRegions)
  );
  if (sharedLiberties.length < 2) return false;

  return hasMostlySharedLiberties(group, sharedLiberties) && hasMostlySharedLiberties(opponent, sharedLiberties);
}

function isLocalSharedLiberty(
  point: SgfPoint,
  group: StoneGroup,
  opponent: StoneGroup,
  emptyRegions: EmptyRegion[]
): boolean {
  const region = emptyRegions.find((item) => item.points.includes(point));
  return (
    region != null &&
    region.points.length <= 2 &&
    region.borderGroupIds.has(group.id) &&
    region.borderGroupIds.has(opponent.id)
  );
}

function hasMostlySharedLiberties(group: StoneGroup, sharedLiberties: SgfPoint[]): boolean {
  return group.liberties.size - sharedLiberties.length <= 1;
}

function isSurroundedSmallDeadGroup(
  group: StoneGroup,
  groups: StoneGroup[],
  emptyRegions: EmptyRegion[],
  deadStones: DeadStoneSets
): boolean {
  if (group.points.length > 2 || group.eyeMax > 0 || group.liberties.size === 0) return false;
  if (hasPotentialSeki(group, groups, emptyRegions, deadStones)) return false;

  const adjacentRegions = [...group.adjacentRegionIds]
    .map((id) => emptyRegions[id])
    .filter((region): region is EmptyRegion => region != null);
  if (adjacentRegions.length === 0) return false;

  const totalSpace = new Set(adjacentRegions.flatMap((region) => region.points)).size;
  if (totalSpace > 24) return false;

  return adjacentRegions.every((region) => isOpponentBorderedRegion(region, group, groups));
}

function isOpponentBorderedRegion(region: EmptyRegion, group: StoneGroup, groups: StoneGroup[]): boolean {
  let hasOpponent = false;

  for (const id of region.borderGroupIds) {
    const borderGroup = groups[id];
    if (borderGroup == null || borderGroup.id === group.id) continue;
    if (borderGroup.color === group.color && borderGroup.status !== 'dead') return false;
    if (effectiveGroupColor(borderGroup) === oppositeStone(group.color)) hasOpponent = true;
  }

  return hasOpponent;
}

function independentEyeCandidateCount(region: EmptyRegion, color: Stone, position: BoardPosition): number {
  const candidates = region.points.filter((point) => !isFalseEyePoint(point, color, position));
  const chosen: SgfPoint[] = [];

  for (const candidate of candidates) {
    if (chosen.every((point) => manhattanDistance(point, candidate) > 1)) chosen.push(candidate);
  }

  return chosen.length;
}

function isFalseEyePoint(point: SgfPoint, color: Stone, position: BoardPosition): boolean {
  const opponent = oppositeStone(color);
  const vertex = pointToVertex(point);
  if (vertex == null) return true;

  const [x, y] = vertex;
  let onBoardDiagonals = 0;
  let badDiagonals = 0;

  for (const diagonal of diagonalNeighbors(point, position.size)) {
    onBoardDiagonals += 1;
    const diagonalColor = position.stones.get(diagonal);
    if (diagonalColor === opponent) badDiagonals += 1;
  }

  const corner = (x === 0 || x === position.size - 1) && (y === 0 || y === position.size - 1);
  const edge = x === 0 || y === 0 || x === position.size - 1 || y === position.size - 1;
  if (corner) return badDiagonals >= 1;
  if (edge) return badDiagonals >= 1 && onBoardDiagonals <= 2;
  return badDiagonals >= 2;
}

function countOwnRegionSpace(group: StoneGroup, groups: StoneGroup[], emptyRegions: EmptyRegion[]): number {
  let count = 0;
  for (const regionId of group.adjacentRegionIds) {
    const region = emptyRegions[regionId];
    if (region != null && isOwnEyespace(region, group, groups)) count += region.points.length;
  }
  return count;
}

function countContestedEscapeSpace(
  group: StoneGroup,
  groups: StoneGroup[],
  emptyRegions: EmptyRegion[],
  size: number
): number {
  let count = 0;
  for (const regionId of group.adjacentRegionIds) {
    const region = emptyRegions[regionId];
    if (region == null) continue;

    const colors = regionBorderColors(region, groups);
    if (colors.size > 1) count += Math.min(region.points.length, touchesEdge(region, size) ? 8 : 4);
  }
  return count;
}

function adjacentOpponentGroups(group: StoneGroup, groups: StoneGroup[]): StoneGroup[] {
  return [...group.adjacentOpponentIds].map((id) => groups[id]).filter((value): value is StoneGroup => value != null);
}

function collectLiberties(points: SgfPoint[], position: BoardPosition): Set<SgfPoint> {
  const liberties = new Set<SgfPoint>();
  for (const point of points) {
    for (const neighbor of orthogonalNeighbors(point, position.size)) {
      if (!position.stones.has(neighbor)) liberties.add(neighbor);
    }
  }
  return liberties;
}

function manualDeadStatus(group: Pick<StoneGroup, 'color' | 'points'>, deadStones: DeadStoneSets): GroupStatus | null {
  const targetSet = group.color === 'B' ? deadStones.black : deadStones.white;
  return group.points.every((point) => targetSet.has(point)) ? 'dead' : null;
}

function manualGroupStatus(group: Pick<StoneGroup, 'color' | 'points'>, deadStones: DeadStoneSets): GroupStatus | null {
  const dead = manualDeadStatus(group, deadStones);
  if (dead != null) return dead;

  const aliveSet = group.color === 'B' ? deadStones.aliveBlack : deadStones.aliveWhite;
  return aliveSet != null && group.points.every((point) => aliveSet.has(point)) ? 'alive' : null;
}

function manhattanDistance(left: SgfPoint, right: SgfPoint): number {
  const leftVertex = pointToVertex(left);
  const rightVertex = pointToVertex(right);
  if (leftVertex == null || rightVertex == null) return Number.POSITIVE_INFINITY;
  return Math.abs(leftVertex[0] - rightVertex[0]) + Math.abs(leftVertex[1] - rightVertex[1]);
}
