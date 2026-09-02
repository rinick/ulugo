import type {AnalysisChartPoint, KataGoAnalysisResult, KataGoMoveInfo} from '@ulugo/analysis-core';
import {sgfPointToGtp, usesAreaValueOffset} from '@ulugo/katago-core';
import {
  getBoardSize,
  getInitialNextColor,
  getLine,
  getNodeAtPath,
  normalizeMovePoint,
  type SgfColor,
  type SgfDocument,
  type SgfNode,
} from '@ulugo/sgf-core';
import {nodeKey} from './sgfPathUtils';

export interface CachedAnalysis {
  result: KataGoAnalysisResult;
  visits: number;
  ownershipVisits?: number;
}

export interface AnalysisQueryContext {
  nodeId: string;
  path: number[];
  version: number;
  mode: 'fast' | 'live';
  includeOwnership: boolean;
  mergeMove?: string;
}

export function hasPendingAnalysisQuery(
  contexts: Map<string, AnalysisQueryContext>,
  mode: AnalysisQueryContext['mode'],
  nodeId?: string,
  mergeMove?: string | null,
  requireOwnership = false
): boolean {
  for (const context of contexts.values()) {
    if (context.mode !== mode) continue;
    if (mergeMove !== undefined && (context.mergeMove ?? null) !== mergeMove) continue;
    if (requireOwnership && !context.includeOwnership) continue;
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
  return hiddenPassAnalysisNodeId(nodeKey(document, path));
}

export function hiddenPassAnalysisNodeId(nodeId: string): string {
  return `${nodeId}:pass`;
}

export function shouldCountHiddenPassAnalysis(
  document: SgfDocument,
  path: number[],
  cache: Record<string, CachedAnalysis>,
  targetVisits: number,
  requireOwnership = false
): boolean {
  const passChildPath = findPassChildPath(document, path);
  if (passChildPath != null) {
    const passChild = cache[nodeKey(document, passChildPath)];
    return !analysisReady(passChild, targetVisits, requireOwnership);
  }

  const hiddenPass = cache[hiddenPassAnalysisKey(document, path)];
  if (analysisReady(hiddenPass, targetVisits, requireOwnership)) return false;
  if (requireOwnership) return true;

  const analysis = cache[nodeKey(document, path)]?.result;
  const passMove = analysis?.moveInfos?.find((move) => move.move.toLowerCase() === 'pass');
  return (passMove?.visits ?? 0) < targetVisits;
}

export function analysisReady(
  analysis: CachedAnalysis | undefined,
  targetVisits: number,
  requireOwnership: boolean
): boolean {
  const visits = analysis?.visits ?? analysis?.result.rootInfo?.visits ?? 0;
  return visits >= targetVisits && (!requireOwnership || (analysis?.ownershipVisits ?? 0) >= targetVisits);
}

export function findPassChildPath(document: SgfDocument, path: number[]): number[] | null {
  const parent = getNodeAtPath(document, path);
  const index = findPassChildIndex(parent, getBoardSize(document));
  return index < 0 ? null : [...path, index];
}

export function findPassChildIndex(node: SgfNode, boardSize: number): number {
  return node.children.findIndex((child) => {
    const color = child.data.B != null ? 'B' : child.data.W != null ? 'W' : null;
    return color != null && normalizeMovePoint(child.data[color]?.[0] ?? '', boardSize) === '';
  });
}

export function nextColorForPath(document: SgfDocument, path: number[]): SgfColor {
  let nextColor = getInitialNextColor(document);
  for (const node of getLine(document, path)) nextColor = nextColorAfterNode(node, nextColor);
  return nextColor;
}

export function updateAnalysisCache({
  cache,
  document,
  path,
  nodeId = nodeKey(document, path),
  mergeMove,
  result,
  visits,
}: {
  cache: Record<string, CachedAnalysis>;
  document: SgfDocument;
  path: number[];
  nodeId?: string;
  mergeMove?: string;
  result: KataGoAnalysisResult;
  visits: number;
}): Record<string, CachedAnalysis> {
  const existing = cache[nodeId];
  const nextCache = {
    ...cache,
    [nodeId]: {
      result: mergeAnalysisResult(existing?.result, result),
      visits: Math.max(visits, existing?.visits ?? 0),
      ownershipVisits:
        result.ownership == null ? existing?.ownershipVisits : Math.max(visits, existing?.ownershipVisits ?? 0),
    },
  };

  if (mergeMove != null) mergeMoveAnalysis(nextCache, document, path, mergeMove, result);
  else mergeParentMoveAnalysis(nextCache, document, path, result);
  return nextCache;
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
  let nextCache = cache;
  if (hidden != null) {
    const {[hiddenNodeId]: _hidden, ...withoutHidden} = cache;
    nextCache = withoutHidden;
  }
  if (hidden != null && (existing?.visits ?? 0) < hidden.visits) {
    return {
      ...nextCache,
      [passNodeId]: hidden,
    };
  }

  if (passMove == null) return nextCache;
  const passVisits = passMove.visits ?? 0;
  if ((existing?.visits ?? 0) >= passVisits && existing?.result.moveInfos != null) return nextCache;

  const {move: _move, ...rootInfo} = passMove;
  return {
    ...nextCache,
    [passNodeId]: {
      result: {
        id: `${parent?.result.id ?? passNodeId}:pass`,
        rootInfo,
      },
      visits: 0,
    },
  };
}

export function pruneAnalysisCache(
  cache: Record<string, CachedAnalysis>,
  document: SgfDocument
): Record<string, CachedAnalysis> {
  const reachableNodeIds = new Set<string>();
  const nodes = [document.root];
  while (nodes.length > 0) {
    const node = nodes.pop();
    if (node == null) continue;
    reachableNodeIds.add(node.id);
    nodes.push(...node.children);
  }

  const staleKeys = Object.keys(cache).filter((key) => {
    if (reachableNodeIds.has(key)) return false;
    return !key.endsWith(':pass') || !reachableNodeIds.has(key.slice(0, -':pass'.length));
  });
  if (staleKeys.length === 0) return cache;

  const next = {...cache};
  for (const key of staleKeys) delete next[key];
  return next;
}

function mergeParentMoveAnalysis(
  cache: Record<string, CachedAnalysis>,
  document: SgfDocument,
  path: number[],
  result: KataGoAnalysisResult
): void {
  if (path.length === 0 || result.rootInfo == null) return;

  const node = getNodeAtPath(document, path);
  const color = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
  const point = color == null ? null : normalizeMovePoint(node.data[color]?.[0] ?? '', getBoardSize(document));
  if (color == null || point == null) return;

  const parentPath = path.slice(0, -1);
  const parentId = nodeKey(document, parentPath);
  const parent = cache[parentId];
  if (parent == null) return;

  mergeMoveAnalysis(cache, document, parentPath, sgfPointToGtp(point, getBoardSize(document)), result);
}

function mergeMoveAnalysis(
  cache: Record<string, CachedAnalysis>,
  document: SgfDocument,
  path: number[],
  move: string,
  result: KataGoAnalysisResult
): void {
  if (result.rootInfo == null) return;

  const nodeId = nodeKey(document, path);
  const analysis = cache[nodeId];
  if (analysis == null) return;

  cache[nodeId] = {
    ...analysis,
    result: mergeMoveInfoIntoAnalysis(analysis.result, {
      move,
      ...result.rootInfo,
    }),
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
  cache: Record<string, CachedAnalysis>
): AnalysisChartPoint[] {
  const data: AnalysisChartPoint[] = [];
  const lastPath = paths.at(-1);
  if (lastPath == null) return data;

  const nodes = getLine(document, lastPath);
  const boardSize = getBoardSize(document);
  const valueOffset = usesAreaValueOffset(document.root.data.RU?.[0]) ? 1 : 0;
  let nextColor = getInitialNextColor(document);

  nodes.forEach((node, index) => {
    nextColor = nextColorAfterNode(node, nextColor);
    const analysis = cache[node.id]?.result;
    const rootInfo = analysis?.rootInfo;
    const color = node.data.B != null ? 'B' : node.data.W != null ? 'W' : undefined;
    if (rootInfo?.scoreLead != null)
      data.push({
        moveNumber: index,
        series: 'score',
        value: rootInfo.scoreLead,
        color,
      });
    if (rootInfo?.winrate != null)
      data.push({moveNumber: index, series: 'winrate', value: normalizeWinratePercent(rootInfo.winrate)});

    const rootScore = rootInfo?.scoreLead ?? rootInfo?.scoreMean;
    const passChild = node.children[findPassChildIndex(node, boardSize)];
    const passNodeId = passChild == null ? hiddenPassAnalysisNodeId(node.id) : passChild.id;
    const passRootInfo = cache[passNodeId]?.result.rootInfo;
    const passMove = analysis?.moveInfos?.find((move) => move.move.toLowerCase() === 'pass');
    const passScore = passRootInfo?.scoreLead ?? passRootInfo?.scoreMean ?? passMove?.scoreLead ?? passMove?.scoreMean;
    if (rootScore != null && passScore != null) {
      const passLoss = (rootScore - passScore) * (nextColor === 'B' ? 1 : -1);
      data.push({
        moveNumber: index,
        series: 'intensity',
        value: Math.max(0, Math.round((passLoss - valueOffset) * 10) / 10),
        color: nextColor,
      });
    }
  });

  return data;
}

function nextColorAfterNode(node: SgfNode, current: SgfColor): SgfColor {
  if (node.data.B != null) return 'W';
  if (node.data.W != null) return 'B';
  const nextColor = node.data.PL?.[0];
  return nextColor === 'B' || nextColor === 'W' ? nextColor : current;
}

export function buildStoneScoreDeltas(
  document: SgfDocument,
  path: number[],
  cache: Record<string, CachedAnalysis>
): Map<string, number> {
  const result = new Map<string, number>();
  const boardSize = getBoardSize(document);
  const nodes = getLine(document, path);

  nodes.forEach((node, index) => {
    const color = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
    const point = color == null ? null : normalizeMovePoint(node.data[color]?.[0] ?? '', boardSize);
    if (color == null || point == null || point === '') return;

    const parentAnalysis = cache[nodes[Math.max(0, index - 1)].id]?.result;
    const childAnalysis = cache[node.id]?.result;
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
  });

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
