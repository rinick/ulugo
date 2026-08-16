import {pointToVertex, type SgfPoint} from '@ulugo/sgf-core';
import {analyzeScoringPosition, effectiveGroupColor, isSekiRegion, regionBorderColors} from './analysis';
import {diagonalNeighbors, orthogonalNeighbors, sortPoints} from './geometry';
import type {
  DeadStoneSets,
  EmptyRegion,
  InfluenceValue,
  ScoreScenario,
  ScoringAnalysis,
  ScoringPoints,
  Stone,
  StoneGroup,
} from './types';
import type {BoardPosition} from '@ulugo/go-core';

export function scoringPointsForDeadStones(position: BoardPosition, deadStones: DeadStoneSets): ScoringPoints {
  const blackPoints = new Set<SgfPoint>();
  const whitePoints = new Set<SgfPoint>();
  const analysis = analyzeScoringPosition(position, deadStones);

  for (const group of analysis.groups) {
    if (group.status !== 'dead') continue;
    for (const point of group.points) addOwnedPoint(point, oppositeOwner(group.color), blackPoints, whitePoints);
  }

  for (const region of analysis.emptyRegions) {
    if (isSekiRegion(region, analysis.groups)) continue;

    const blackScenarioOwner = regionOwner(region, analysis, 'favorBlack');
    const whiteScenarioOwner = regionOwner(region, analysis, 'favorWhite');

    if (blackScenarioOwner != null && blackScenarioOwner === whiteScenarioOwner) {
      for (const point of region.points) addOwnedPoint(point, blackScenarioOwner, blackPoints, whitePoints);
      continue;
    }

    for (const point of region.points) {
      const blackPointOwner = pointOwner(point, region, analysis, 'favorBlack');
      const whitePointOwner = pointOwner(point, region, analysis, 'favorWhite');
      if (blackPointOwner != null && blackPointOwner === whitePointOwner) {
        addOwnedPoint(point, blackPointOwner, blackPoints, whitePoints);
      }
    }
  }

  assignNearestStoneTerritory(analysis, blackPoints, whitePoints);
  assignLocallySurroundedUnassignedTerritory(analysis, blackPoints, whitePoints);
  assignSurroundedUnassignedTerritory(analysis, blackPoints, whitePoints);

  return {
    blackPoints: sortPoints([...blackPoints]),
    whitePoints: sortPoints([...whitePoints]),
  };
}

function pointOwner(
  point: SgfPoint,
  region: EmptyRegion,
  analysis: ScoringAnalysis,
  scenario: ScoreScenario
): Stone | null {
  const owner =
    regionOwner(region, analysis, scenario) ??
    influenceOwner(influenceAtPoint(point, analysis.groups, scenario), point, analysis.position.size);
  if (owner == null || isNonDeadOpponentLiberty(point, analysis.groups, owner)) return null;
  return owner;
}

function regionOwner(region: EmptyRegion, analysis: ScoringAnalysis, scenario: ScoreScenario): Stone | null {
  const criticalOwner = scenario === 'favorBlack' ? 'B' : 'W';
  const colors = regionBorderColors(region, analysis.groups, criticalOwner);
  if (colors.size !== 1) {
    const owner = stableBorderOwner(region, analysis.groups);
    return owner != null && !regionBordersNonDeadOpponent(region, analysis.groups, owner) ? owner : null;
  }

  const owner = [...colors][0];
  if (regionBordersNonDeadOpponent(region, analysis.groups, owner)) return null;

  const hasOwnerBorder = [...region.borderGroupIds].some((id) => {
    const group = analysis.groups[id];
    return group != null && effectiveGroupColor(group, criticalOwner) === owner && group.status !== 'dead';
  });

  return hasOwnerBorder ? owner : null;
}

function regionBordersNonDeadOpponent(region: EmptyRegion, groups: StoneGroup[], owner: Stone): boolean {
  return [...region.borderGroupIds].some((id) => {
    const group = groups[id];
    return group != null && group.status !== 'dead' && group.color !== owner;
  });
}

function isNonDeadOpponentLiberty(point: SgfPoint, groups: StoneGroup[], owner: Stone): boolean {
  return groups.some((group) => group.status !== 'dead' && group.color !== owner && group.liberties.has(point));
}

function stableBorderOwner(region: EmptyRegion, groups: StoneGroup[]): Stone | null {
  const colors = new Set<Stone>();
  let hasLivingBorder = false;

  for (const id of region.borderGroupIds) {
    const group = groups[id];
    if (group == null || group.status === 'critical' || group.status === 'unknown') continue;
    if (group.status === 'seki') return null;

    const color = group.status === 'dead' ? oppositeOwner(group.color) : group.color;
    colors.add(color);
    if (group.status !== 'dead') hasLivingBorder = true;
  }

  return hasLivingBorder && colors.size === 1 ? [...colors][0] : null;
}

function competeDistance(d: number) {
  if (d === 1) {
    return 3;
  }
  if (d === 2) {
    return 4;
  }
  if (d === 3) {
    return 5;
  }
  return d * 3;
}
function assignNearestStoneTerritory(
  analysis: ScoringAnalysis,
  blackPoints: Set<SgfPoint>,
  whitePoints: Set<SgfPoint>
): void {
  const blackDistances = distanceToEffectiveColor(analysis, 'B');
  const whiteDistances = distanceToEffectiveColor(analysis, 'W');

  for (const region of analysis.emptyRegions) {
    for (const point of region.points) {
      if (blackPoints.has(point) || whitePoints.has(point)) continue;

      const blackDistance = blackDistances.get(point);
      const whiteDistance = whiteDistances.get(point);
      if (blackDistance == null || whiteDistance == null) continue;

      if (blackDistance >= competeDistance(whiteDistance)) {
        whitePoints.add(point);
      } else if (whiteDistance >= competeDistance(blackDistance)) {
        blackPoints.add(point);
      }
    }
  }
}

function assignLocallySurroundedUnassignedTerritory(
  analysis: ScoringAnalysis,
  blackPoints: Set<SgfPoint>,
  whitePoints: Set<SgfPoint>
): void {
  const groupByPoint = stoneGroupByPoint(analysis.groups);
  const assignments: Array<{point: SgfPoint; owner: Stone}> = [];

  for (const region of analysis.emptyRegions) {
    for (const point of region.points) {
      if (assignedOwner(point, blackPoints, whitePoints) != null) continue;

      const owner = locallySurroundedPointOwner(point, analysis, groupByPoint, blackPoints, whitePoints);
      if (owner != null) assignments.push({point, owner});
    }
  }

  for (const {point, owner} of assignments) addOwnedPoint(point, owner, blackPoints, whitePoints);
}

function locallySurroundedPointOwner(
  point: SgfPoint,
  analysis: ScoringAnalysis,
  groupByPoint: Map<SgfPoint, StoneGroup>,
  blackPoints: Set<SgfPoint>,
  whitePoints: Set<SgfPoint>
): Stone | null {
  const colors = new Set<Stone>();
  let unassignedCount = 0;

  for (const neighbor of [
    ...orthogonalNeighbors(point, analysis.position.size),
    ...diagonalNeighbors(point, analysis.position.size),
  ]) {
    const group = groupByPoint.get(neighbor);
    const color = group != null ? effectiveGroupColor(group) : assignedOwner(neighbor, blackPoints, whitePoints);
    if (color != null) {
      colors.add(color);
    } else {
      unassignedCount += 1;
    }

    if (colors.size > 1 || unassignedCount > 2) return null;
  }

  return colors.size === 1 ? [...colors][0] : null;
}

function assignSurroundedUnassignedTerritory(
  analysis: ScoringAnalysis,
  blackPoints: Set<SgfPoint>,
  whitePoints: Set<SgfPoint>
): void {
  const groupByPoint = stoneGroupByPoint(analysis.groups);

  const seen = new Set<SgfPoint>();
  for (const region of analysis.emptyRegions) {
    for (const point of region.points) {
      if (seen.has(point) || assignedOwner(point, blackPoints, whitePoints) != null) continue;

      const component = collectUnassignedEmptyComponent(point, analysis, blackPoints, whitePoints, seen);
      const owner = surroundedComponentOwner(component, analysis, groupByPoint, blackPoints, whitePoints);
      if (owner == null) continue;

      for (const componentPoint of component) addOwnedPoint(componentPoint, owner, blackPoints, whitePoints);
    }
  }
}

function stoneGroupByPoint(groups: StoneGroup[]): Map<SgfPoint, StoneGroup> {
  const result = new Map<SgfPoint, StoneGroup>();
  for (const group of groups) {
    for (const point of group.points) result.set(point, group);
  }
  return result;
}

function collectUnassignedEmptyComponent(
  start: SgfPoint,
  analysis: ScoringAnalysis,
  blackPoints: Set<SgfPoint>,
  whitePoints: Set<SgfPoint>,
  seen: Set<SgfPoint>
): SgfPoint[] {
  const component: SgfPoint[] = [];
  const queue = [start];
  seen.add(start);

  for (let index = 0; index < queue.length; index += 1) {
    const point = queue[index];
    component.push(point);

    for (const neighbor of orthogonalNeighbors(point, analysis.position.size)) {
      if (
        seen.has(neighbor) ||
        analysis.position.stones.has(neighbor) ||
        assignedOwner(neighbor, blackPoints, whitePoints) != null
      ) {
        continue;
      }

      seen.add(neighbor);
      queue.push(neighbor);
    }
  }

  return component;
}

function surroundedComponentOwner(
  component: SgfPoint[],
  analysis: ScoringAnalysis,
  groupByPoint: Map<SgfPoint, StoneGroup>,
  blackPoints: Set<SgfPoint>,
  whitePoints: Set<SgfPoint>
): Stone | null {
  const componentPoints = new Set(component);
  const colors = new Set<Stone>();

  for (const point of component) {
    for (const neighbor of orthogonalNeighbors(point, analysis.position.size)) {
      if (componentPoints.has(neighbor)) continue;

      const group = groupByPoint.get(neighbor);
      const color = group != null ? effectiveGroupColor(group) : assignedOwner(neighbor, blackPoints, whitePoints);
      if (color != null) colors.add(color);
      if (colors.size > 1) return null;
    }
  }

  return colors.size === 1 ? [...colors][0] : null;
}

function assignedOwner(point: SgfPoint, blackPoints: Set<SgfPoint>, whitePoints: Set<SgfPoint>): Stone | null {
  if (blackPoints.has(point)) return 'B';
  if (whitePoints.has(point)) return 'W';
  return null;
}

function distanceToEffectiveColor(analysis: ScoringAnalysis, color: Stone): Map<SgfPoint, number> {
  const distances = new Map<SgfPoint, number>();
  const queue: Array<{point: SgfPoint; distance: number}> = [];

  for (const group of analysis.groups) {
    if (effectiveGroupColor(group) !== color) continue;
    for (const point of group.points) queue.push({point, distance: 0});
  }

  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index];
    for (const neighbor of orthogonalNeighbors(item.point, analysis.position.size)) {
      if (analysis.position.stones.has(neighbor) || distances.has(neighbor)) continue;

      const distance = item.distance + 1;
      distances.set(neighbor, distance);
      queue.push({point: neighbor, distance});
    }
  }

  return distances;
}

function influenceAtPoint(point: SgfPoint, groups: StoneGroup[], scenario: ScoreScenario): InfluenceValue {
  const vertex = pointToVertex(point);
  if (vertex == null) return {black: 0, white: 0};

  const criticalOwner = scenario === 'favorBlack' ? 'B' : 'W';
  const [x, y] = vertex;
  const value: InfluenceValue = {black: 0, white: 0};

  for (const group of groups) {
    const color = effectiveGroupColor(group, criticalOwner);
    const strength = groupInfluenceStrength(group);
    if (strength <= 0) continue;

    for (const source of group.points) {
      const sourceVertex = pointToVertex(source);
      if (sourceVertex == null) continue;

      const distance = Math.abs(x - sourceVertex[0]) + Math.abs(y - sourceVertex[1]);
      const contribution = strength / (1 + distance) ** 2;
      if (color === 'B') value.black += contribution;
      else value.white += contribution;
    }
  }

  return value;
}

function influenceOwner(value: InfluenceValue, point: SgfPoint, size: number): Stone | null {
  const total = value.black + value.white;
  if (total < minimumInfluence(point, size)) return null;

  const balance = (value.black - value.white) / total;
  if (Math.abs(balance) < 0.55) return null;

  return balance > 0 ? 'B' : 'W';
}

function groupInfluenceStrength(group: StoneGroup): number {
  const sizeFactor = Math.min(1.8, 1 + Math.sqrt(group.points.length) / 7);
  if (group.status === 'alive') return 1.45 * sizeFactor;
  if (group.status === 'seki') return 1.1 * sizeFactor;
  if (group.status === 'dead') return 1.1 * sizeFactor;
  if (group.status === 'critical') return 0.9 * sizeFactor;
  return 0.7 * sizeFactor;
}

function minimumInfluence(point: SgfPoint, size: number): number {
  const vertex = pointToVertex(point);
  if (vertex == null || size <= 1) return 0.25;

  const [x, y] = vertex;
  const edgeDistance = Math.min(x, y, size - 1 - x, size - 1 - y);
  const center = edgeDistance / ((size - 1) / 2);
  return 0.18 + Math.max(0, Math.min(1, center)) * 0.24;
}

function addOwnedPoint(point: SgfPoint, owner: Stone, blackPoints: Set<SgfPoint>, whitePoints: Set<SgfPoint>): void {
  if (owner === 'B') blackPoints.add(point);
  else whitePoints.add(point);
}

function oppositeOwner(color: Stone): Stone {
  return color === 'B' ? 'W' : 'B';
}
