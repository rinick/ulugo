import {
  getBoardSize,
  getInitialCaptures,
  getInitialNextColor,
  getLine,
  isPointOnBoard,
  normalizeMovePoint,
  pointToVertex,
  type MarkupKind,
  type SgfColor,
  type SgfDocument,
  type SgfNode,
  type SgfPoint,
  vertexToPoint,
} from '@ulugo/sgf-core';

export type Stone = SgfColor;

export interface BoardPoint {
  point: SgfPoint;
  x: number;
  y: number;
  stone: Stone | null;
  moveNumber: number | null;
  label: string | null;
  markup: MarkupKind | null;
  isLastMove: boolean;
}

export interface BoardPosition {
  size: number;
  points: BoardPoint[];
  stones: Map<SgfPoint, Stone>;
  captures: Record<Stone, number>;
  nextColor: Stone;
  lastMove: SgfPoint | null;
  moveNumber: number;
}

export function deriveBoardPosition(document: SgfDocument, path: number[]): BoardPosition {
  const size = getBoardSize(document);
  const stones = new Map<SgfPoint, Stone>();
  const moveNumbers = new Map<SgfPoint, number>();
  const captures = getInitialCaptures(document);
  const line = getLine(document, path);
  let moveNumber = 0;
  let lastMove: SgfPoint | null = null;
  let nextColor: Stone = getInitialNextColor(document);
  const allowSuicide = allowsSuicideRules(document.root.data.RU?.[0]);
  const useAgaPassStones = isAgaRules(document.root.data.RU?.[0]);

  for (const node of line) {
    applySetup(node, stones, moveNumbers, size);

    const color: Stone | null = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
    if (color == null) {
      nextColor = setupNextColor(node) ?? nextColor;
      continue;
    }

    const point = normalizeMovePoint(node.data[color]?.[0] ?? '', size);
    moveNumber += 1;
    nextColor = color === 'B' ? 'W' : 'B';

    if (point === '') {
      lastMove = null;
      if (useAgaPassStones) captures[nextColor] += 1;
      continue;
    }
    if (!isPointOnBoard(point, size)) {
      lastMove = null;
      continue;
    }
    lastMove = point;
    stones.set(point, color);
    moveNumbers.set(point, moveNumber);

    applyCaptures(point, color, stones, moveNumbers, captures, size, allowSuicide);
  }

  const current = line[line.length - 1];
  const labels = collectLabels(current);
  const markups = collectMarkups(current);
  const points: BoardPoint[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const point = vertexToPoint(x, y);
      points.push({
        point,
        x,
        y,
        stone: stones.get(point) ?? null,
        moveNumber: moveNumbers.get(point) ?? null,
        label: labels.get(point) ?? null,
        markup: markups.get(point) ?? null,
        isLastMove: point === lastMove,
      });
    }
  }

  return {
    size,
    points,
    stones,
    captures,
    nextColor,
    lastMove,
    moveNumber,
  };
}

export function isLegalMove(position: BoardPosition, color: Stone, point: SgfPoint, rules?: string): boolean {
  if (point === '') return true;
  const vertex = pointToVertex(point);
  if (vertex == null || vertex[0] >= position.size || vertex[1] >= position.size) return false;
  if (position.stones.has(point)) return false;

  const stones = new Map(position.stones);
  const moveNumbers = new Map<SgfPoint, number>();
  const captures: Record<Stone, number> = {B: 0, W: 0};
  const allowSuicide = allowsSuicideRules(rules);
  stones.set(point, color);
  applyCaptures(point, color, stones, moveNumbers, captures, position.size, allowSuicide);
  return allowSuicide || collectGroup(point, stones, position.size).liberties > 0;
}

function applyCaptures(
  point: SgfPoint,
  color: Stone,
  stones: Map<SgfPoint, Stone>,
  moveNumbers: Map<SgfPoint, number>,
  captures: Record<Stone, number>,
  size: number,
  allowSuicide: boolean
): void {
  const opponent = color === 'B' ? 'W' : 'B';
  const checkedOpponentPoints = new Set<SgfPoint>();
  for (const neighbor of neighbors(point, size)) {
    if (stones.get(neighbor) !== opponent || checkedOpponentPoints.has(neighbor)) continue;
    const group = collectGroup(neighbor, stones, size);
    for (const groupPoint of group.points) checkedOpponentPoints.add(groupPoint);
    if (group.liberties === 0) {
      captures[color] += group.points.length;
      removeGroup(group.points, stones, moveNumbers);
    }
  }

  if (allowSuicide) {
    const ownGroup = collectGroup(point, stones, size);
    if (ownGroup.liberties === 0) {
      captures[opponent] += ownGroup.points.length;
      removeGroup(ownGroup.points, stones, moveNumbers);
    }
  }
}

function removeGroup(points: SgfPoint[], stones: Map<SgfPoint, Stone>, moveNumbers: Map<SgfPoint, number>): void {
  for (const point of points) {
    stones.delete(point);
    moveNumbers.delete(point);
  }
}

function allowsSuicideRules(value: string | undefined): boolean {
  const key = value
    ?.trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  return key === 'new-zealand' || key === 'tromp-taylor';
}

function isAgaRules(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'aga';
}

function setupNextColor(node: SgfNode): Stone | null {
  const value = node.data.PL?.[0];
  return value === 'B' || value === 'W' ? value : null;
}

function applySetup(
  node: SgfNode,
  stones: Map<SgfPoint, Stone>,
  moveNumbers: Map<SgfPoint, number>,
  size: number
): void {
  for (const point of node.data.AE ?? []) {
    stones.delete(point);
    moveNumbers.delete(point);
  }

  for (const point of node.data.AB ?? []) {
    if (!isPointOnBoard(point, size)) continue;
    stones.set(point, 'B');
    moveNumbers.delete(point);
  }

  for (const point of node.data.AW ?? []) {
    if (!isPointOnBoard(point, size)) continue;
    stones.set(point, 'W');
    moveNumbers.delete(point);
  }
}

function collectLabels(node: SgfNode): Map<SgfPoint, string> {
  const labels = new Map<SgfPoint, string>();
  for (const value of node.data.LB ?? []) {
    const separator = value.indexOf(':');
    if (separator <= 0) continue;
    labels.set(value.slice(0, separator), value.slice(separator + 1));
  }
  return labels;
}

function collectMarkups(node: SgfNode): Map<SgfPoint, MarkupKind> {
  const markups = new Map<SgfPoint, MarkupKind>();
  for (const kind of ['CR', 'SQ', 'TR', 'MA', 'SL'] as MarkupKind[]) {
    for (const point of node.data[kind] ?? []) {
      markups.set(point, kind);
    }
  }
  return markups;
}

function collectGroup(
  start: SgfPoint,
  stones: Map<SgfPoint, Stone>,
  size: number
): {points: SgfPoint[]; liberties: number} {
  const color = stones.get(start);
  if (color == null) return {points: [], liberties: 0};

  const seen = new Set<SgfPoint>([start]);
  const liberties = new Set<SgfPoint>();
  const queue = [start];

  for (let index = 0; index < queue.length; index += 1) {
    const point = queue[index];
    for (const neighbor of neighbors(point, size)) {
      const stone = stones.get(neighbor);
      if (stone == null) {
        liberties.add(neighbor);
      } else if (stone === color && !seen.has(neighbor)) {
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return {points: [...seen], liberties: liberties.size};
}

function neighbors(point: SgfPoint, size: number): SgfPoint[] {
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
