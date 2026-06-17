import {getNodeAtPath, samePath, type SgfDocument} from '@ulugo/sgf-core';
import {
  findPassChildPath,
  hasPendingAnalysisQuery,
  hiddenPassAnalysisKey,
  shouldCountHiddenPassAnalysis,
  shouldRequestHiddenPassAnalysis,
  type AnalysisQueryContext,
  type CachedAnalysis,
} from './appAnalysisUtils';
import {nodeKey, pathKey} from './sgfPathUtils';

const nextFastAnalysisCount = 5;

export type PassAnalysisKind = 'regular' | 'hidden';
export type FastAnalysisJob = {path: number[]; passAnalysis?: PassAnalysisKind};
export type PassAnalysisRequest = {path: number[]; passAnalysis: PassAnalysisKind; targetVisits: number};

export function buildFastAnalysisJobs({
  analysisPaths,
  currentPath,
  valueMode,
  document,
  analysisCache,
  targetVisits,
  pendingQueries,
}: {
  analysisPaths: number[][];
  currentPath: number[];
  valueMode: boolean;
  document: SgfDocument;
  analysisCache: Record<string, CachedAnalysis>;
  targetVisits: number;
  pendingQueries: Map<string, AnalysisQueryContext>;
}): FastAnalysisJob[] {
  const currentIndex = analysisPaths.findIndex((movePath) => samePath(movePath, currentPath));
  const firstNextIndex = currentIndex < 0 ? 0 : currentIndex + 1;
  const nextPaths = analysisPaths.slice(firstNextIndex, firstNextIndex + nextFastAnalysisCount);
  const currentPaths = currentIndex < 0 ? [] : [analysisPaths[currentIndex]];
  const nextKeys = new Set(nextPaths.map(pathKey));
  const currentKeys = new Set(currentPaths.map(pathKey));
  const otherPaths = analysisPaths.filter((movePath) => {
    const key = pathKey(movePath);
    return !currentKeys.has(key) && !nextKeys.has(key);
  });
  const jobs: FastAnalysisJob[] = [];
  const queued = new Set<string>();

  function addNormalJobs(paths: number[][]): void {
    for (const movePath of paths) {
      const nodeId = nodeKey(document, movePath);
      const cached = analysisCache[nodeId];
      if (cached != null && cached.visits >= targetVisits) continue;
      if (hasPendingAnalysisQuery(pendingQueries, 'fast', nodeId, null)) continue;
      addJob({path: movePath, passAnalysis: isPassMovePath(document, movePath) ? 'regular' : undefined});
    }
  }

  function addHiddenPassJobs(paths: number[][]): void {
    if (!valueMode) return;
    for (const movePath of paths) {
      const passChildPath = findPassChildPath(document, movePath);
      if (passChildPath != null) {
        const passNodeId = nodeKey(document, passChildPath);
        const cached = analysisCache[passNodeId];
        if ((cached?.visits ?? cached?.result.rootInfo?.visits ?? 0) >= targetVisits) continue;
        if (hasPendingAnalysisQuery(pendingQueries, 'fast', passNodeId, null)) continue;
        addJob({path: passChildPath, passAnalysis: 'regular'});
        continue;
      }
      if (!shouldRequestHiddenPassAnalysis(document, movePath, analysisCache, targetVisits)) continue;
      if (hasPendingAnalysisQuery(pendingQueries, 'fast', hiddenPassAnalysisKey(document, movePath), 'pass')) continue;
      addJob({path: movePath, passAnalysis: 'hidden'});
    }
  }

  function addJob(job: FastAnalysisJob): void {
    const key = `${pathKey(job.path)}:${job.passAnalysis ?? 'normal'}`;
    if (queued.has(key)) return;
    queued.add(key);
    jobs.push(job);
  }

  addNormalJobs(currentPaths);
  addHiddenPassJobs(currentPaths);
  addNormalJobs(nextPaths);
  addHiddenPassJobs(nextPaths);
  addNormalJobs(otherPaths);
  addHiddenPassJobs(otherPaths);

  return jobs;
}

export function getFastQueryIdsOutsidePaths(
  pendingQueries: Map<string, AnalysisQueryContext>,
  analysisPaths: number[][],
  document: SgfDocument
): string[] {
  const pathKeys = new Set(analysisPaths.map(pathKey));
  for (const analysisPath of analysisPaths) {
    const passChildPath = findPassChildPath(document, analysisPath);
    if (passChildPath != null) pathKeys.add(pathKey(passChildPath));
  }
  return [...pendingQueries.entries()]
    .filter(([, context]) => context.mode === 'fast' && !pathKeys.has(pathKey(context.path)))
    .map(([queryId]) => queryId);
}

export function livePassAnalysisRequest(
  document: SgfDocument,
  path: number[],
  analysisCache: Record<string, CachedAnalysis>,
  targetVisits: number
): PassAnalysisRequest | null {
  if (!shouldCountHiddenPassAnalysis(document, path, analysisCache, targetVisits)) return null;

  const passChildPath = findPassChildPath(document, path);
  if (passChildPath != null) return {path: passChildPath, passAnalysis: 'regular', targetVisits};

  return {path, passAnalysis: 'hidden', targetVisits};
}

export function passAnalysisNodeId(document: SgfDocument, request: PassAnalysisRequest): string {
  return request.passAnalysis === 'hidden'
    ? hiddenPassAnalysisKey(document, request.path)
    : nodeKey(document, request.path);
}

export function getStaleLiveQueryIds(
  pendingQueries: Map<string, AnalysisQueryContext>,
  mainNodeId: string | null,
  passNodeId: string | null,
  passHidden: boolean
): string[] {
  return [...pendingQueries.entries()]
    .filter(([, context]) => {
      if (context.mode !== 'live') return false;
      if (mainNodeId != null && context.nodeId === mainNodeId && context.mergeMove == null) return false;
      if (passNodeId != null && context.nodeId === passNodeId && (context.mergeMove === 'pass') === passHidden)
        return false;
      return true;
    })
    .map(([queryId]) => queryId);
}

export function isInvalidatedAnalysisKey(key: string, invalidatedNodeIds: Set<string>): boolean {
  if (invalidatedNodeIds.has(key)) return true;
  return key.endsWith(':pass') && invalidatedNodeIds.has(key.slice(0, -5));
}

function isPassMovePath(document: SgfDocument, path: number[]): boolean {
  if (path.length === 0) return false;
  const node = getNodeAtPath(document, path);
  return node.data.B?.[0] === '' || node.data.W?.[0] === '';
}
