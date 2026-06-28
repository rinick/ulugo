import type {SgfColor, SgfDocument} from '@ulugo/sgf-core';
import {getBoardSize, getGameInfo, getLine, pointToVertex, vertexToPoint} from '@ulugo/sgf-core';
import {sgfPointToGtp} from '@ulugo/sgf-analysis-tree';

export interface KataGoSettings {
  executablePath: string;
  modelPath: string;
  configPath: string;
  altCommand: string;
  maxVisits: number;
  fastVisits: number;
  wideRootNoise: number;
}

export interface KataGoQueryOptions {
  id: string;
  path: number[];
  analyzeTurns?: number[];
  nextMove?: {color: SgfColor; point: string};
  maxVisits?: number;
  priority?: number;
  live?: boolean;
  overrideSettings?: KataGoAnalysisQuery['overrideSettings'];
}

export interface KataGoAnalysisQuery {
  id: string;
  boardXSize: number;
  boardYSize: number;
  komi: number;
  rules?: string;
  initialPlayer: SgfColor;
  initialStones: Array<[SgfColor, string]>;
  moves: Array<[SgfColor, string]>;
  analyzeTurns?: number[];
  maxVisits?: number;
  priority?: number;
  includePolicy: boolean;
  includeOwnership: boolean;
  reportDuringSearchEvery?: number;
  overrideSettings?: {
    wideRootNoise?: number;
  };
}

export const defaultKataGoSettings: KataGoSettings = {
  executablePath: '',
  modelPath: '',
  configPath: '',
  altCommand: '',
  maxVisits: 800,
  fastVisits: 20,
  wideRootNoise: 0.04,
};

export type KataGoDownloadKind = 'katago' | 'model';

export interface KataGoAsset {
  id: string;
  label: string;
  installed: boolean;
  available: boolean;
  notes?: string;
  url?: string;
  path?: string;
}

export interface KataGoAssetInventory {
  katago: KataGoAsset[];
  models: KataGoAsset[];
  settings: KataGoSettings;
}

export interface KataGoDownloadProgress {
  kind: KataGoDownloadKind;
  optionId: string;
  status: 'starting' | 'downloading' | 'extracting' | 'complete' | 'error';
  percent: number;
  message: string;
  path?: string;
}

export interface KataGoDownloadResult {
  path: string;
  settings: KataGoSettings;
}

export interface KataGoConsoleMessage {
  id: string;
  time: string;
  source: 'ulugo' | 'katago';
  level: 'info' | 'warning' | 'error';
  text: string;
}

export function buildKataGoQuery(document: SgfDocument, options: KataGoQueryOptions): KataGoAnalysisQuery {
  const boardSize = getBoardSize(document);
  const gameInfo = getGameInfo(document);
  const history = buildKataGoHistory(document, options.path);
  const moves = [...history.moves];
  if (options.nextMove != null) {
    moves.push([options.nextMove.color, sgfPointToGtp(options.nextMove.point, boardSize)]);
  }

  return {
    id: options.id,
    boardXSize: boardSize,
    boardYSize: boardSize,
    komi: normalizeKomi(gameInfo.KM),
    rules: normalizeRules(gameInfo.RU),
    initialPlayer: history.initialPlayer,
    initialStones: history.initialStones,
    moves,
    analyzeTurns: options.analyzeTurns ?? [moves.length],
    maxVisits: options.maxVisits,
    priority: options.priority,
    includePolicy: true,
    includeOwnership: true,
    reportDuringSearchEvery: options.live ? 0.25 : undefined,
    overrideSettings: options.overrideSettings,
  };
}

function buildKataGoHistory(
  document: SgfDocument,
  path: number[]
): {initialPlayer: SgfColor; initialStones: Array<[SgfColor, string]>; moves: Array<[SgfColor, string]>} {
  const boardSize = getBoardSize(document);
  const line = getLine(document, path);
  let setupIndex = -1;
  for (let index = line.length - 1; index >= 0; index -= 1) {
    if (hasSetupProperties(line[index])) {
      setupIndex = index;
      break;
    }
  }
  if (setupIndex < 0) {
    return {
      initialPlayer: 'B',
      initialStones: [],
      moves: line.flatMap((node): Array<[SgfColor, string]> => {
        const color = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
        return color == null ? [] : [[color, sgfPointToGtp(node.data[color]?.[0] ?? '', boardSize)]];
      }),
    };
  }

  const stones = new Map<string, SgfColor>();
  let nextColor: SgfColor = 'B';
  for (const node of line.slice(0, setupIndex + 1)) {
    for (const point of node.data.AE ?? []) stones.delete(point);
    for (const point of node.data.AB ?? []) stones.set(point, 'B');
    for (const point of node.data.AW ?? []) stones.set(point, 'W');

    const color = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
    if (color == null) {
      nextColor = setupNextColor(node) ?? nextColor;
      continue;
    }
    const point = node.data[color]?.[0] ?? '';
    nextColor = color === 'B' ? 'W' : 'B';
    if (point === '') continue;
    stones.set(point, color);
    applyCaptures(point, color, stones, boardSize);
  }

  const initialStones = [...stones.entries()].map(([point, color]): [SgfColor, string] => [
    color,
    sgfPointToGtp(point, boardSize),
  ]);
  const moves = line.slice(setupIndex + 1).flatMap((node): Array<[SgfColor, string]> => {
    const color = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
    return color == null ? [] : [[color, sgfPointToGtp(node.data[color]?.[0] ?? '', boardSize)]];
  });

  return {initialPlayer: nextColor, initialStones, moves};
}

function hasSetupProperties(node: {data: Record<string, string[]>}): boolean {
  return ['AB', 'AW', 'AE', 'PL'].some((key) => (node.data[key] ?? []).length > 0);
}

function setupNextColor(node: {data: Record<string, string[]>}): SgfColor | null {
  const value = node.data.PL?.[0];
  return value === 'B' || value === 'W' ? value : null;
}

function applyCaptures(point: string, color: SgfColor, stones: Map<string, SgfColor>, size: number): void {
  const opponent = color === 'B' ? 'W' : 'B';
  for (const neighbor of neighbors(point, size)) {
    if (stones.get(neighbor) !== opponent) continue;
    const group = collectGroup(neighbor, stones, size);
    if (group.liberties === 0) {
      for (const capturedPoint of group.points) stones.delete(capturedPoint);
    }
  }
}

function collectGroup(
  start: string,
  stones: Map<string, SgfColor>,
  size: number
): {points: string[]; liberties: number} {
  const color = stones.get(start);
  if (color == null) return {points: [], liberties: 0};

  const seen = new Set<string>();
  const liberties = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const point = queue.shift();
    if (point == null || seen.has(point)) continue;
    seen.add(point);

    for (const neighbor of neighbors(point, size)) {
      const stone = stones.get(neighbor);
      if (stone == null) {
        liberties.add(neighbor);
      } else if (stone === color && !seen.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return {points: [...seen], liberties: liberties.size};
}

function neighbors(point: string, size: number): string[] {
  const vertex = pointToVertex(point);
  if (vertex == null) return [];
  const [x, y] = vertex;
  const points: string[] = [];
  if (x > 0) points.push(vertexToPoint(x - 1, y));
  if (x + 1 < size) points.push(vertexToPoint(x + 1, y));
  if (y > 0) points.push(vertexToPoint(x, y - 1));
  if (y + 1 < size) points.push(vertexToPoint(x, y + 1));
  return points;
}

export function normalizeKomi(value: unknown): number {
  if (value == null) return 6.5;

  if (typeof value === 'string' && value.trim() === '') return 6.5;

  const parsed = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : Number(value);
  if (!Number.isFinite(parsed)) return 6.5;
  if (parsed === 375) return 7.5;

  const clamped = Math.max(-150, Math.min(150, parsed));
  return Math.round(clamped * 2) / 2;
}

export function normalizeRules(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return 'japanese';

  const key = value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  const aliases: Record<string, string> = {
    'aga': 'aga',
    'chinese': 'chinese',
    'japanese': 'japanese',
    'korean': 'korean',
    'new-zealand': 'new-zealand',
    'stone-scoring': 'stone-scoring',
    'tromp-taylor': 'tromp-taylor',
  };

  return aliases[key] ?? 'japanese';
}
