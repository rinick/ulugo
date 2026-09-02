import {
  cloneDocument,
  createNode,
  getBoardSize,
  getInitialCaptures,
  getInitialNextColor,
  getLine,
  getNodeAtPath,
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

export type NormalizedRules =
  | 'japanese'
  | 'chinese'
  | 'korean'
  | 'aga'
  | 'new-zealand'
  | 'tromp-taylor'
  | 'stone-scoring'
  | 'unknown';

export interface RuleProfile {
  key: NormalizedRules;
  allowSuicide: boolean;
  creditPassStone: boolean;
  scoring: 'territory' | 'area';
}

const supportedRuleKeys = new Set<NormalizedRules>([
  'japanese',
  'chinese',
  'korean',
  'aga',
  'new-zealand',
  'tromp-taylor',
  'stone-scoring',
]);

export interface ReplayState {
  stones: Map<SgfPoint, Stone>;
  captures: Record<Stone, number>;
  nextColor: Stone;
}

export interface ReplayTransition {
  moveColor: Stone | null;
  movePoint: SgfPoint | null;
}

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
  const moveNumbers = new Map<SgfPoint, number>();
  const state = createReplayState(document);
  const line = getLine(document, path);
  let moveNumber = 0;
  let lastMove: SgfPoint | null = null;
  const profile = ruleProfile(document.root.data.RU?.[0]);

  for (const node of line) {
    const transition = applySgfNode(state, node, size, profile, (point) => moveNumbers.delete(point));
    if (transition.moveColor == null) continue;

    moveNumber += 1;
    lastMove = transition.movePoint;
    if (transition.movePoint != null && state.stones.get(transition.movePoint) === transition.moveColor) {
      moveNumbers.set(transition.movePoint, moveNumber);
    }
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
        stone: state.stones.get(point) ?? null,
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
    stones: state.stones,
    captures: state.captures,
    nextColor: state.nextColor,
    lastMove,
    moveNumber,
  };
}

export function isLocallyLegalMove(position: BoardPosition, color: Stone, point: SgfPoint, rules?: string): boolean {
  if (point === '') return true;
  const vertex = pointToVertex(point);
  if (vertex == null || vertex[0] >= position.size || vertex[1] >= position.size) return false;
  if (position.stones.has(point)) return false;

  const profile = ruleProfile(rules);
  const state: ReplayState = {
    stones: new Map(position.stones),
    captures: {B: 0, W: 0},
    nextColor: position.nextColor,
  };
  state.stones.set(point, color);
  applyCaptures(state, point, color, position.size, profile.allowSuicide);
  return profile.allowSuicide || collectConnectedGroup(point, state.stones, position.size).liberties > 0;
}

export function createReplayState(document: SgfDocument): ReplayState {
  return {
    stones: new Map(),
    captures: getInitialCaptures(document),
    nextColor: getInitialNextColor(document),
  };
}

export function cloneReplayState(state: ReplayState): ReplayState {
  return {
    stones: new Map(state.stones),
    captures: {...state.captures},
    nextColor: state.nextColor,
  };
}

export function applySgfNode(
  state: ReplayState,
  node: SgfNode,
  size: number,
  profile: RuleProfile,
  onClear?: (point: SgfPoint) => void
): ReplayTransition {
  for (const point of node.data.AE ?? []) {
    state.stones.delete(point);
    onClear?.(point);
  }
  for (const point of node.data.AB ?? []) {
    if (!isPointOnBoard(point, size)) continue;
    state.stones.set(point, 'B');
    onClear?.(point);
  }
  for (const point of node.data.AW ?? []) {
    if (!isPointOnBoard(point, size)) continue;
    state.stones.set(point, 'W');
    onClear?.(point);
  }

  const color: Stone | null = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
  if (color == null) {
    const nextColor = node.data.PL?.[0];
    if (nextColor === 'B' || nextColor === 'W') state.nextColor = nextColor;
    return {moveColor: null, movePoint: null};
  }

  state.nextColor = oppositeStone(color);
  const point = normalizeMovePoint(node.data[color]?.[0] ?? '', size);
  if (point === '') {
    if (profile.creditPassStone) state.captures[state.nextColor] += 1;
    return {moveColor: color, movePoint: null};
  }
  if (!isPointOnBoard(point, size)) return {moveColor: color, movePoint: null};

  state.stones.set(point, color);
  applyCaptures(state, point, color, size, profile.allowSuicide, onClear);
  return {moveColor: color, movePoint: point};
}

export function addSetupStone(
  document: SgfDocument,
  path: number[],
  color: SgfColor,
  point: SgfPoint,
  existingColor: SgfColor | null = null,
  nextColor: SgfColor | null = null
): {document: SgfDocument; path: number[]; placed: boolean} {
  const prop = color === 'B' ? 'AB' : 'AW';
  const opposite = color === 'B' ? 'AW' : 'AB';
  const current = getNodeAtPath(document, path);
  const canEditCurrent =
    current.children.length === 0 &&
    current.data.B == null &&
    current.data.W == null &&
    (path.length === 0 || hasSetupProperties(current) || Object.keys(current.data).length === 0);
  const targetPath = canEditCurrent ? path : [...path, current.children.length];
  const priorColor = stoneColorBeforePath(document, targetPath, point);
  const currentTarget = canEditCurrent ? current : null;

  if ((currentTarget?.data[prop] ?? []).includes(point)) {
    const next = cloneDocument(document);
    const target = getNodeAtPath(next, targetPath);
    removePointFromProperties(target, [prop], point);
    if (priorColor === oppositeStone(color)) addPointValue(target, 'AE', point);
    if (nextColor != null && target.data.PL == null) setProperty(target, 'PL', [nextColor]);
    return {document: next, path: targetPath, placed: false};
  }

  const next = cloneDocument(document);
  const target =
    targetPath.length === path.length
      ? getNodeAtPath(next, targetPath)
      : (() => {
          const parent = getNodeAtPath(next, path);
          const child = createNode();
          parent.children.push(child);
          return child;
        })();

  removePointFromProperties(target, [prop, opposite, 'AE'], point);
  if (nextColor != null && target.data.PL == null) setProperty(target, 'PL', [nextColor]);
  if (existingColor === color) {
    addPointValue(target, 'AE', point);
    return {document: next, path: targetPath, placed: false};
  }
  if (priorColor === color) return {document: next, path: targetPath, placed: true};

  addPointValue(target, prop, point);
  return {document: next, path: targetPath, placed: true};
}

function stoneColorBeforePath(document: SgfDocument, path: number[], point: SgfPoint): SgfColor | null {
  if (path.length === 0) return null;

  const state = createReplayState(document);
  const size = getBoardSize(document);
  const profile = ruleProfile(document.root.data.RU?.[0]);
  for (const node of getLine(document, path.slice(0, -1))) applySgfNode(state, node, size, profile);
  return state.stones.get(point) ?? null;
}

function hasSetupProperties(node: SgfNode): boolean {
  return ['AB', 'AW', 'AE', 'PL'].some((key) => (node.data[key] ?? []).length > 0);
}

function setProperty(node: SgfNode, key: string, values: string[]): void {
  if (values.length === 0) delete node.data[key];
  else node.data[key] = values;
}

function addPointValue(node: SgfNode, key: string, value: string): void {
  node.data[key] = [...new Set([...(node.data[key] ?? []), value])];
}

function removePointFromProperties(node: SgfNode, keys: string[], point: SgfPoint): void {
  for (const key of keys) {
    const next = (node.data[key] ?? []).filter((value) => value.slice(0, 2) !== point);
    setProperty(node, key, next);
  }
}

function applyCaptures(
  state: ReplayState,
  point: SgfPoint,
  color: Stone,
  size: number,
  allowSuicide: boolean,
  onClear?: (point: SgfPoint) => void
): void {
  const opponent = oppositeStone(color);
  const checkedOpponentPoints = new Set<SgfPoint>();
  for (const neighbor of orthogonalNeighbors(point, size)) {
    if (state.stones.get(neighbor) !== opponent || checkedOpponentPoints.has(neighbor)) continue;
    const group = collectConnectedGroup(neighbor, state.stones, size);
    for (const groupPoint of group.points) checkedOpponentPoints.add(groupPoint);
    if (group.liberties === 0) {
      state.captures[color] += group.points.length;
      removeGroup(group.points, state.stones);
      for (const groupPoint of group.points) onClear?.(groupPoint);
    }
  }

  if (allowSuicide) {
    const ownGroup = collectConnectedGroup(point, state.stones, size);
    if (ownGroup.liberties === 0) {
      state.captures[opponent] += ownGroup.points.length;
      removeGroup(ownGroup.points, state.stones);
      for (const groupPoint of ownGroup.points) onClear?.(groupPoint);
    }
  }
}

function removeGroup(points: SgfPoint[], stones: Map<SgfPoint, Stone>): void {
  for (const point of points) stones.delete(point);
}

export function ruleProfile(value: unknown): RuleProfile {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const dashed = raw.replace(/[_\s]+/g, '-');
  const key: NormalizedRules = supportedRuleKeys.has(dashed as NormalizedRules)
    ? (dashed as NormalizedRules)
    : 'unknown';
  const compact = raw.replace(/[^a-z]/g, '');
  return {
    key,
    allowSuicide: dashed === 'new-zealand' || dashed === 'tromp-taylor',
    creditPassStone: raw === 'aga',
    scoring: compact === '' || compact === 'japanese' || compact === 'korean' ? 'territory' : 'area',
  };
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

export function collectConnectedGroup(
  start: SgfPoint,
  stones: ReadonlyMap<SgfPoint, Stone>,
  size: number
): {points: SgfPoint[]; liberties: number} {
  const color = stones.get(start);
  if (color == null) return {points: [], liberties: 0};

  const seen = new Set<SgfPoint>([start]);
  const liberties = new Set<SgfPoint>();
  const queue = [start];

  for (let index = 0; index < queue.length; index += 1) {
    const point = queue[index];
    for (const neighbor of orthogonalNeighbors(point, size)) {
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

export function oppositeStone(color: Stone): Stone {
  return color === 'B' ? 'W' : 'B';
}
