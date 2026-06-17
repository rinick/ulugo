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

export interface KataGoDownloadOption {
  id: string;
  label: string;
  url: string;
  installedPath?: string;
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

export const modelDownloadOptions: KataGoDownloadOption[] = [
  {
    id: 'recommended-18b',
    label: 'Recommended 18b model',
    url: 'https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz',
  },
  {
    id: 'old-15b',
    label: 'Old 15 block model',
    url: 'https://github.com/lightvector/KataGo/releases/download/v1.3.2/g170e-b15c192-s1672170752-d466197061.txt.gz',
  },
  {
    id: 'old-20b',
    label: 'Old 20 block model',
    url: 'https://github.com/lightvector/KataGo/releases/download/v1.4.5/g170e-b20c256x2-s5303129600-d1228401921.bin.gz',
  },
  {
    id: 'old-30b',
    label: 'Old 30 block model',
    url: 'https://github.com/lightvector/KataGo/releases/download/v1.4.5/g170-b30c320x2-s4824661760-d1229536699.bin.gz',
  },
  {
    id: 'fat-40b',
    label: 'Fat 40 block model',
    url: 'https://d3dndmfyhecmj0.cloudfront.net/g170/neuralnets/g170e-b40c384x2-s2348692992-d1229892979.zip',
  },
];

export const katagoDownloadOptionsByPlatform: Record<string, KataGoDownloadOption[]> = {
  win32: [
    {
      id: 'opencl-win',
      label: 'OpenCL v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-opencl-windows-x64.zip',
    },
    {
      id: 'eigen-avx2-win',
      label: 'Eigen AVX2 (Modern CPUs) v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-eigenavx2-windows-x64.zip',
    },
    {
      id: 'eigen-win',
      label: 'Eigen (CPU, Non-optimized) v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-eigen-windows-x64.zip',
    },
  ],
  linux: [
    {
      id: 'opencl-linux',
      label: 'OpenCL v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-opencl-linux-x64.zip',
    },
    {
      id: 'eigen-avx2-linux',
      label: 'Eigen AVX2 (Modern CPUs) v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-eigenavx2-linux-x64.zip',
    },
    {
      id: 'eigen-linux',
      label: 'Eigen (CPU, Non-optimized) v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-eigen-linux-x64.zip',
    },
  ],
};

export function getKataGoDownloadOptions(platform: string): KataGoDownloadOption[] {
  return katagoDownloadOptionsByPlatform[platform] ?? [];
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
