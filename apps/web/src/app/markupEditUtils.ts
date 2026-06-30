import {
  addLabel,
  addMarkup,
  eraseMarkup,
  getNodeAtPath,
  pointToVertex,
  vertexToPoint,
  type MarkupKind,
  type SgfColor,
  type SgfDocument,
  type SgfNode,
} from '@ulugo/sgf-core';
import type {EditorTool} from '../features/toolbar/types';
import {pathKey} from './sgfPathUtils';
import {toolToMarkup} from './sgfEditUtils';

export type PointMarkup = {kind: 'LB'; label: string} | {kind: MarkupKind};
export type MarkupAction = {pathKey: string; point: string; action: 'draw' | 'erase'; markup: PointMarkup; time: number};

interface MarkupEditOptions {
  document: SgfDocument;
  path: number[];
  point: string;
  clickCount: number;
  rightClick: boolean;
  tool: EditorTool;
  labelText: string;
  stones: Map<string, SgfColor>;
  boardSize: number;
  previousAction: MarkupAction | null;
  autoIncrementText: boolean;
}

export interface MarkupEditResult {
  document: SgfDocument;
  nextAction: MarkupAction | null;
  incrementTextFrom?: string;
}

const markupRepeatMs = 600;

export function applyMarkupEdit(options: MarkupEditOptions): MarkupEditResult | null {
  if (options.tool === 'erase') return applyEraseMarkupEdit(options);
  if (!isMarkupTool(options.tool)) return null;

  const node = getNodeAtPath(options.document, options.path);
  const repeated = repeatedMarkupAction(options);
  if (repeated?.action === 'draw' && toolMatchesMarkup(options.tool, repeated.markup)) {
    const points = drawConnectedUnmarkedStoneTargets(node, options.point, options.stones, options.boardSize);
    return {
      document: points.length === 0 ? options.document : drawMarkupPoints(options.document, options.path, points, repeated.markup),
      nextAction: repeated,
    };
  }
  if (options.rightClick && repeated?.action === 'erase') {
    return eraseRepeatedMarkup(options, node, repeated);
  }

  const currentMarkup = pointMarkup(node, options.point);
  if (options.rightClick && currentMarkup != null) {
    return eraseMarkupEdit(options, node, currentMarkup);
  }

  if (options.tool === 'alphabet') {
    const value = options.labelText.trim();
    if (value === '') return null;
    if (!options.rightClick && currentMarkup?.kind === 'LB') return eraseMarkupEdit(options, node, currentMarkup);

    const points = drawMarkupTargets(node, options.point, options.clickCount, options.stones, options.boardSize);
    const markup: PointMarkup = {kind: 'LB', label: value};
    return {
      document: drawMarkupPoints(options.document, options.path, points, markup),
      nextAction: makeMarkupAction(options, 'draw', markup),
      incrementTextFrom: !options.rightClick && options.autoIncrementText ? value : undefined,
    };
  }

  const markupKind = toolToMarkup(options.tool);
  if (markupKind == null) return null;
  if (!options.rightClick && currentMarkup?.kind === markupKind) return eraseMarkupEdit(options, node, currentMarkup);

  const points = drawMarkupTargets(node, options.point, options.clickCount, options.stones, options.boardSize);
  const markup: PointMarkup = {kind: markupKind};
  return {
    document: drawMarkupPoints(options.document, options.path, points, markup),
    nextAction: makeMarkupAction(options, 'draw', markup),
  };
}

export function isMarkupTool(tool: EditorTool): boolean {
  return tool === 'alphabet' || tool === 'circle' || tool === 'square' || tool === 'triangle' || tool === 'cross';
}

export function nodeHasMarkup(node: ReturnType<typeof getNodeAtPath>): boolean {
  return ['LB', 'CR', 'SQ', 'TR', 'MA'].some((key) => (node.data[key]?.length ?? 0) > 0);
}

function applyEraseMarkupEdit(options: MarkupEditOptions): MarkupEditResult {
  const node = getNodeAtPath(options.document, options.path);
  const repeated = repeatedMarkupAction(options);
  if (repeated?.action === 'erase') return eraseRepeatedMarkup(options, node, repeated);

  const currentMarkup = pointMarkup(node, options.point);
  const points = eraseMarkupTargets(node, options.point, options.clickCount, options.boardSize);
  return {
    document: eraseMarkupPoints(options.document, options.path, points),
    nextAction: currentMarkup == null ? options.previousAction : makeMarkupAction(options, 'erase', currentMarkup),
  };
}

function eraseMarkupEdit(options: MarkupEditOptions, node: SgfNode, markup: PointMarkup): MarkupEditResult {
  const points = eraseMarkupTargets(node, options.point, options.clickCount, options.boardSize);
  return {
    document: eraseMarkupPoints(options.document, options.path, points),
    nextAction: makeMarkupAction(options, 'erase', markup),
  };
}

function eraseRepeatedMarkup(options: MarkupEditOptions, node: SgfNode, action: MarkupAction): MarkupEditResult {
  const points = connectedMatchingMarkupAroundErasedPoint(node, options.point, action.markup, options.boardSize);
  return {
    document: points.length === 0 ? options.document : eraseMarkupPoints(options.document, options.path, points),
    nextAction: action,
  };
}

function repeatedMarkupAction(options: MarkupEditOptions): MarkupAction | null {
  const action = options.previousAction;
  if (action == null || action.pathKey !== pathKey(options.path) || action.point !== options.point) return null;
  const allowTimeRepeat = options.rightClick || options.tool === 'erase';
  if (options.clickCount <= 1 && (!allowTimeRepeat || Date.now() - action.time > markupRepeatMs)) return null;
  return action;
}

function makeMarkupAction(options: MarkupEditOptions, action: MarkupAction['action'], markup: PointMarkup): MarkupAction {
  return {pathKey: pathKey(options.path), point: options.point, action, markup, time: Date.now()};
}

function pointMarkup(node: SgfNode, point: string): PointMarkup | null {
  const label = (node.data.LB ?? []).find((value) => value.split(':', 1)[0] === point);
  if (label != null) return {kind: 'LB', label: label.slice(point.length + 1)};
  for (const key of ['CR', 'SQ', 'TR', 'MA'] as const) {
    if ((node.data[key] ?? []).includes(point)) return {kind: key};
  }
  return null;
}

function samePointMarkup(left: PointMarkup | null, right: PointMarkup): boolean {
  if (left == null || left.kind !== right.kind) return false;
  return left.kind !== 'LB' || left.label === (right as {kind: 'LB'; label: string}).label;
}

function toolMatchesMarkup(tool: EditorTool, markup: PointMarkup): boolean {
  if (markup.kind === 'LB') return tool === 'alphabet';
  return toolToMarkup(tool) === markup.kind;
}

function drawMarkupTargets(
  node: SgfNode,
  point: string,
  clickCount: number,
  stones: Map<string, SgfColor>,
  boardSize: number
): string[] {
  if (clickCount <= 1 || pointMarkup(node, point) != null) return [point];
  const color = stones.get(point);
  if (color == null) return [point];
  return drawConnectedUnmarkedStoneTargets(node, point, stones, boardSize);
}

function eraseMarkupTargets(node: SgfNode, point: string, clickCount: number, boardSize: number): string[] {
  if (clickCount <= 1) return [point];
  const markup = pointMarkup(node, point);
  if (markup == null) return [point];
  return connectedMarkupPoints(node, point, markup, boardSize);
}

function drawConnectedUnmarkedStoneTargets(
  node: SgfNode,
  point: string,
  stones: Map<string, SgfColor>,
  boardSize: number
): string[] {
  const color = stones.get(point);
  if (color == null) return [];
  return connectedStonePoints(point, color, stones, boardSize).filter((target) => pointMarkup(node, target) == null);
}

function connectedStonePoints(
  start: string,
  color: SgfColor,
  stones: Map<string, SgfColor>,
  boardSize: number
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const point = queue.shift();
    if (point == null || seen.has(point) || stones.get(point) !== color) continue;
    seen.add(point);
    result.push(point);
    queue.push(...neighborPoints(point, boardSize));
  }
  return result;
}

function connectedMatchingMarkupAroundErasedPoint(
  node: SgfNode,
  point: string,
  markup: PointMarkup,
  boardSize: number
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const neighbor of neighborPoints(point, boardSize)) {
    if (seen.has(neighbor) || !samePointMarkup(pointMarkup(node, neighbor), markup)) continue;
    for (const connected of connectedMarkupPoints(node, neighbor, markup, boardSize)) {
      if (seen.has(connected)) continue;
      seen.add(connected);
      result.push(connected);
    }
  }
  return result;
}

function connectedMarkupPoints(node: SgfNode, start: string, markup: PointMarkup, boardSize: number): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const point = queue.shift();
    if (point == null || seen.has(point) || !samePointMarkup(pointMarkup(node, point), markup)) continue;
    seen.add(point);
    result.push(point);
    queue.push(...neighborPoints(point, boardSize));
  }
  return result;
}

function neighborPoints(point: string, boardSize: number): string[] {
  const vertex = pointToVertex(point);
  if (vertex == null) return [];
  const [x, y] = vertex;
  return [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ].flatMap(([nx, ny]) => (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize ? [vertexToPoint(nx, ny)] : []));
}

function eraseMarkupPoints(document: SgfDocument, path: number[], points: string[]): SgfDocument {
  return points.reduce((current, point) => eraseMarkup(current, path, point), document);
}

function drawMarkupPoints(document: SgfDocument, path: number[], points: string[], markup: PointMarkup): SgfDocument {
  return markup.kind === 'LB'
    ? points.reduce((current, point) => addLabel(current, path, point, markup.label), eraseMarkupPoints(document, path, points))
    : points.reduce((current, point) => addMarkup(current, path, markup.kind, point), eraseMarkupPoints(document, path, points));
}
