import type {AnalysisChartPoint, KataGoAnalysisResult, KataGoMoveInfo} from '@ulugo/analysis-core';
import {deriveBoardPosition} from '@ulugo/go-core';
import {getBoardSize, getNodeAtPath, type SgfColor, type SgfDocument} from '@ulugo/sgf-core';
import {sgfPointToGtp} from '@ulugo/sgf-analysis-tree';
import {getLinePaths, nodeKey} from './sgfPathUtils';

export interface CachedAnalysis {
  result: KataGoAnalysisResult;
  visits: number;
  completed: boolean;
}

export interface AnalysisQueryContext {
  nodeId: string;
  path: number[];
  version: number;
  mode: 'fast' | 'live';
  mergeMove?: string;
}

export function hasPendingAnalysisQuery(
  contexts: Map<string, AnalysisQueryContext>,
  mode: AnalysisQueryContext['mode'],
  nodeId?: string,
  mergeMove?: string | null
): boolean {
  for (const context of contexts.values()) {
    if (context.mode !== mode) continue;
    if (mergeMove !== undefined && (context.mergeMove ?? null) !== mergeMove) continue;
    if (nodeId == null || context.nodeId === nodeId) return true;
  }
  return false;
}

export function getPendingAnalysisQueryIds(
  contexts: Map<string, AnalysisQueryContext>,
  mode: AnalysisQueryContext['mode']
): string[] {
  return [...contexts.entries()].filter(([, context]) => context.mode === mode).map(([id]) => id);
}

export function getAnalysisVisits(result: KataGoAnalysisResult): number {
  return Math.max(result.rootInfo?.visits ?? 0, ...(result.moveInfos ?? []).map((move) => move.visits ?? 0));
}

export function hiddenPassAnalysisKey(document: SgfDocument, path: number[]): string {
  return `${nodeKey(document, path)}:pass`;
}

export function shouldRequestHiddenPassAnalysis(
  document: SgfDocument,
  path: number[],
  cache: Record<string, CachedAnalysis>,
  targetVisits: number
): boolean {
  if (findPassChildPath(document, path) != null) return false;

  const analysis = cache[nodeKey(document, path)]?.result;
  if (analysis?.rootInfo == null) return false;

  return shouldCountHiddenPassAnalysis(document, path, cache, targetVisits);
}

export function shouldCountHiddenPassAnalysis(
  document: SgfDocument,
  path: number[],
  cache: Record<string, CachedAnalysis>,
  targetVisits: number
): boolean {
  const passChildPath = findPassChildPath(document, path);
  if (passChildPath != null) {
    const passChild = cache[nodeKey(document, passChildPath)];
    return (passChild?.visits ?? passChild?.result.rootInfo?.visits ?? 0) < targetVisits;
  }

  const hiddenPass = cache[hiddenPassAnalysisKey(document, path)];
  if ((hiddenPass?.visits ?? hiddenPass?.result.rootInfo?.visits ?? 0) >= targetVisits) return false;

  const analysis = cache[nodeKey(document, path)]?.result;
  const passMove = analysis?.moveInfos?.find((move) => move.move.toLowerCase() === 'pass');
  return (passMove?.visits ?? 0) < targetVisits;
}

export function findPassChildPath(document: SgfDocument, path: number[]): number[] | null {
  const parent = getNodeAtPath(document, path);
  const index = parent.children.findIndex((child) => child.data.B?.[0] === '' || child.data.W?.[0] === '');
  return index < 0 ? null : [...path, index];
}

export function nextColorForPath(document: SgfDocument, path: number[]): SgfColor {
  return deriveBoardPosition(document, path).nextColor;
}

export function updateAnalysisCache({
  cache,
  document,
  path,
  nodeId = nodeKey(document, path),
  mergeMove,
  result,
  visits,
  completed,
}: {
  cache: Record<string, CachedAnalysis>;
  document: SgfDocument;
  path: number[];
  nodeId?: string;
  mergeMove?: string;
  result: KataGoAnalysisResult;
  visits: number;
  completed: boolean;
}): Record<string, CachedAnalysis> {
  const existing = cache[nodeId];
  const nextCache = {
    ...cache,
    [nodeId]: {
      result: mergeAnalysisResult(existing?.result, result),
      visits: Math.max(visits, existing?.visits ?? 0),
      completed: existing?.completed === true || completed,
    },
  };

  if (mergeMove != null) return updateMoveAnalysis(nextCache, document, path, mergeMove, result);
  return updateParentMoveAnalysis(nextCache, document, path, result);
}

export function convertHiddenPassAnalysisToRegularPass(
  cache: Record<string, CachedAnalysis>,
  document: SgfDocument,
  passPath: number[]
): Record<string, CachedAnalysis> {
  if (passPath.length === 0) return cache;

  const parentPath = passPath.slice(0, -1);
  const parent = cache[nodeKey(document, parentPath)];
  const hiddenNodeId = hiddenPassAnalysisKey(document, parentPath);
  const hidden = cache[hiddenNodeId];
  const passMove = parent?.result.moveInfos?.find((move) => move.move.toLowerCase() === 'pass');
  if (passMove == null && hidden == null) return cache;

  const passNodeId = nodeKey(document, passPath);
  const existing = cache[passNodeId];
  if (hidden != null && (existing?.visits ?? 0) < hidden.visits) {
    const {[hiddenNodeId]: _hidden, ...nextCache} = cache;
    return {
      ...nextCache,
      [passNodeId]: hidden,
    };
  }

  if (passMove == null) return cache;
  const passVisits = passMove.visits ?? 0;
  if ((existing?.visits ?? 0) >= passVisits && existing?.result.moveInfos != null) return cache;

  const {move: _move, ...rootInfo} = passMove;
  return {
    ...cache,
    [passNodeId]: {
      result: {
        id: `${parent?.result.id ?? passNodeId}:pass`,
        rootInfo,
      },
      visits: 0,
      completed: false,
    },
  };
}

function updateParentMoveAnalysis(
  cache: Record<string, CachedAnalysis>,
  document: SgfDocument,
  path: number[],
  result: KataGoAnalysisResult
): Record<string, CachedAnalysis> {
  if (path.length === 0 || result.rootInfo == null) return cache;

  const node = getNodeAtPath(document, path);
  const color = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
  const point = color == null ? null : (node.data[color]?.[0] ?? '');
  if (color == null || point == null) return cache;

  const parentPath = path.slice(0, -1);
  const parentId = nodeKey(document, parentPath);
  const parent = cache[parentId];
  if (parent == null) return cache;

  return updateMoveAnalysis(cache, document, parentPath, sgfPointToGtp(point, getBoardSize(document)), result);
}

function updateMoveAnalysis(
  cache: Record<string, CachedAnalysis>,
  document: SgfDocument,
  path: number[],
  move: string,
  result: KataGoAnalysisResult
): Record<string, CachedAnalysis> {
  if (result.rootInfo == null) return cache;

  const nodeId = nodeKey(document, path);
  const analysis = cache[nodeId];
  if (analysis == null) return cache;

  return {
    ...cache,
    [nodeId]: {
      ...analysis,
      result: mergeMoveInfoIntoAnalysis(analysis.result, {
        move,
        ...result.rootInfo,
      }),
    },
  };
}

function mergeAnalysisResult(
  existing: KataGoAnalysisResult | undefined,
  result: KataGoAnalysisResult
): KataGoAnalysisResult {
  if (existing == null) return result;

  return {
    ...existing,
    ...result,
    rootInfo: result.rootInfo ?? existing.rootInfo,
    moveInfos: mergeMoveInfos(existing.moveInfos, result.moveInfos),
    ownership: result.ownership ?? existing.ownership,
    policy: result.policy ?? existing.policy,
  };
}

function mergeMoveInfoIntoAnalysis(analysis: KataGoAnalysisResult, move: KataGoMoveInfo): KataGoAnalysisResult {
  const moveInfos = analysis.moveInfos ?? [];
  const key = move.move.toLowerCase();
  const index = moveInfos.findIndex((item) => item.move.toLowerCase() === key);
  if (index < 0) return {...analysis, moveInfos: [...moveInfos, move]};

  return {
    ...analysis,
    moveInfos: moveInfos.map((item, itemIndex) => (itemIndex === index ? mergeMoveInfo(item, move) : item)),
  };
}

function mergeMoveInfos(
  existing: KataGoMoveInfo[] | undefined,
  incoming: KataGoMoveInfo[] | undefined
): KataGoMoveInfo[] | undefined {
  if (incoming == null) return existing;
  if (existing == null) return incoming;

  const existingMoves = existing.map((move) => ({move, key: move.move.toLowerCase()}));
  const existingByMove = new Map(existingMoves.map(({move, key}) => [key, move]));
  const incomingMoves = new Set<string>();
  const mergedIncoming = incoming.map((move) => {
    const key = move.move.toLowerCase();
    incomingMoves.add(key);
    return mergeMoveInfo(existingByMove.get(key), move);
  });
  return [...mergedIncoming, ...existingMoves.filter(({key}) => !incomingMoves.has(key)).map(({move}) => move)];
}

function mergeMoveInfo(existing: KataGoMoveInfo | undefined, incoming: KataGoMoveInfo): KataGoMoveInfo {
  if (existing == null) return incoming;
  return (incoming.visits ?? 0) >= (existing.visits ?? 0) ? {...existing, ...incoming} : {...incoming, ...existing};
}

export function buildAnalysisChartData(
  document: SgfDocument,
  paths: number[][],
  cache: Record<string, CachedAnalysis>,
  targetVisits: number
): AnalysisChartPoint[] {
  const data: AnalysisChartPoint[] = [];

  paths.forEach((path, index) => {
    const rootInfo = cache[nodeKey(document, path)]?.result.rootInfo;
    const node = getNodeAtPath(document, path);
    const color = node.data.B != null ? 'B' : node.data.W != null ? 'W' : undefined;
    if (rootInfo?.scoreLead != null)
      data.push({
        moveNumber: index,
        series: 'score',
        value: rootInfo.scoreLead,
        color,
        hiddenPassReady: !shouldCountHiddenPassAnalysis(document, path, cache, targetVisits),
      });
    if (rootInfo?.winrate != null)
      data.push({moveNumber: index, series: 'winrate', value: normalizeWinratePercent(rootInfo.winrate)});
  });

  return data;
}

export function buildStoneScoreDeltas(
  document: SgfDocument,
  path: number[],
  cache: Record<string, CachedAnalysis>
): Map<string, number> {
  const result = new Map<string, number>();
  const boardSize = getBoardSize(document);

  for (const movePath of getLinePaths(path)) {
    const node = getNodeAtPath(document, movePath);
    const color = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
    const point = color == null ? null : (node.data[color]?.[0] ?? '');
    if (color == null || point == null || point === '') continue;

    const parentPath = movePath.slice(0, -1);
    const parentAnalysis = cache[nodeKey(document, parentPath)]?.result;
    const childAnalysis = cache[nodeKey(document, movePath)]?.result;
    const moveKey = sgfPointToGtp(point, boardSize).toLowerCase();
    const move = parentAnalysis?.moveInfos?.find((item) => item.move.toLowerCase() === moveKey);

    const moveVisits = move?.visits ?? 0;
    const childVisits = childAnalysis?.rootInfo?.visits ?? 0;
    const scoreDelta =
      childVisits > moveVisits
        ? analysisRootScoreDelta(parentAnalysis, childAnalysis, color)
        : parentAnalysis != null && move != null
          ? analysisMoveScoreDelta(move, parentAnalysis, color)
          : analysisRootScoreDelta(parentAnalysis, childAnalysis, color);
    if (scoreDelta != null) result.set(point, scoreDelta);
  }

  return result;
}

function analysisMoveScoreDelta(move: KataGoMoveInfo, analysis: KataGoAnalysisResult, color: 'B' | 'W'): number | null {
  const score = move.scoreLead ?? move.scoreMean ?? null;
  const rootScore = analysis.rootInfo?.scoreLead ?? analysis.rootInfo?.scoreMean ?? 0;
  if (score == null) return null;

  return (score - rootScore) * (color === 'B' ? 1 : -1);
}

function analysisRootScoreDelta(
  parent: KataGoAnalysisResult | undefined,
  child: KataGoAnalysisResult | undefined,
  color: 'B' | 'W'
): number | null {
  const parentScore = parent?.rootInfo?.scoreLead ?? parent?.rootInfo?.scoreMean ?? null;
  const childScore = child?.rootInfo?.scoreLead ?? child?.rootInfo?.scoreMean ?? null;
  if (parentScore == null || childScore == null) return null;

  return (childScore - parentScore) * (color === 'B' ? 1 : -1);
}

export function normalizeWinratePercent(value: number): number {
  return value > 1 ? value : value * 100;
}
