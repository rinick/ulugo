import type {SgfColor, SgfDocument} from '@ulugo/sgf-core';
import {getBoardSize, getGameInfo} from '@ulugo/sgf-core';
import {getInitialStonesForPath, getMovesForPath, sgfPointToGtp} from '@ulugo/sgf-analysis-tree';

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
  const moves = getMovesForPath(document, options.path);
  if (options.nextMove != null) {
    moves.push([options.nextMove.color, sgfPointToGtp(options.nextMove.point, boardSize)]);
  }

  return {
    id: options.id,
    boardXSize: boardSize,
    boardYSize: boardSize,
    komi: normalizeKomi(gameInfo.KM),
    rules: normalizeRules(gameInfo.RU),
    initialStones: getInitialStonesForPath(document, options.path),
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
