import type {BoardPosition} from '@ulugo/go-core';
import {isPointOnBoard, type SgfDocument, type SgfNode, type SgfPoint} from '@ulugo/sgf-core';
import {analyzeScoringPosition} from './analysis';
import {scoringPointsForDeadStones} from './territory';
import type {DeadStoneSets, ScoringPoints, ScoringSummary, Stone} from './types';

export type {ScoringPoints, ScoringSummary};

export function estimateScoringPoints(position: BoardPosition): ScoringPoints {
  return scoringPointsForDeadStones(position, {black: new Set(), white: new Set()});
}

export function toggleScoringGroup(position: BoardPosition, node: SgfNode, point: SgfPoint): ScoringPoints | null {
  const color = position.stones.get(point);
  if (color == null) return null;

  const deadStones = scoringOverridesFromNode(position, node);
  const group = analyzeScoringPosition(position, deadStones).groups.find((item) => item.points.includes(point));
  if (group == null) return null;

  const targetSet = deadSetForColor(deadStones, color);
  const aliveSet = aliveSetForColor(deadStones, color);
  const currentlyDead = group.points.every((groupPoint) => targetSet.has(groupPoint));

  for (const groupPoint of group.points) {
    targetSet.delete(groupPoint);
    aliveSet.delete(groupPoint);
  }
  if (!currentlyDead) {
    for (const groupPoint of group.points) targetSet.add(groupPoint);
  } else {
    for (const groupPoint of group.points) aliveSet.add(groupPoint);
  }

  return scoringPointsForDeadStones(position, deadStones);
}

function scoringOverridesFromNode(position: BoardPosition, node: SgfNode): DeadStoneSets {
  const deadStones = deadStoneSetsFromNode(position, node);
  const automatic = analyzeScoringPosition(position, emptyDeadStoneSets());

  for (const group of automatic.groups) {
    const targetSet = deadSetForColor(deadStones, group.color);
    if (group.points.every((groupPoint) => targetSet.has(groupPoint))) continue;

    const aliveSet = aliveSetForColor(deadStones, group.color);
    for (const groupPoint of group.points) aliveSet.add(groupPoint);
  }

  return deadStones;
}

export function scoringSummaryForNode(document: SgfDocument, node: SgfNode, position: BoardPosition): ScoringSummary {
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

function deadStoneSetsFromNode(position: BoardPosition, node: SgfNode): DeadStoneSets {
  const deadStones = emptyDeadStoneSets();

  for (const point of node.data.TW ?? []) {
    if (position.stones.get(point) === 'B') deadStones.black.add(point);
  }
  for (const point of node.data.TB ?? []) {
    if (position.stones.get(point) === 'W') deadStones.white.add(point);
  }

  return deadStones;
}

function emptyDeadStoneSets(): DeadStoneSets {
  return {black: new Set(), white: new Set()};
}

function deadSetForColor(deadStones: DeadStoneSets, color: Stone): Set<SgfPoint> {
  return color === 'B' ? deadStones.black : deadStones.white;
}

function aliveSetForColor(deadStones: DeadStoneSets, color: Stone): Set<SgfPoint> {
  if (color === 'B') {
    deadStones.aliveBlack ??= new Set();
    return deadStones.aliveBlack;
  }

  deadStones.aliveWhite ??= new Set();
  return deadStones.aliveWhite;
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
