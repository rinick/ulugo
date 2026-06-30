import {samePath, type SgfDocument} from '@ulugo/sgf-core';
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
  passAnalysisMode,
  document,
  analysisCache,
  targetVisits,
  pendingQueries,
}: {
  analysisPaths: number[][];
  currentPath: number[];
  passAnalysisMode: boolean;
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
      addJob({path: movePath});
    }
  }

  function addPassJob(movePath: number[]): void {
    const job = passAnalysisJobForPath(document, movePath, analysisCache, targetVisits, pendingQueries);
    if (job != null) addJob(job);
  }

  function addJob(job: FastAnalysisJob): void {
    const key = `${pathKey(job.path)}:${job.passAnalysis ?? 'normal'}`;
    if (queued.has(key)) return;
    queued.add(key);
    jobs.push(job);
  }

  addNormalJobs(currentPaths);
  if (passAnalysisMode && currentPaths[0] != null) addPassJob(currentPaths[0]);
  addNormalJobs(nextPaths);
  addNormalJobs(otherPaths);

  return jobs;
}

export function buildBackgroundPassAnalysisJobs({
  analysisPaths,
  document,
  analysisCache,
  targetVisits,
  pendingQueries,
}: {
  analysisPaths: number[][];
  document: SgfDocument;
  analysisCache: Record<string, CachedAnalysis>;
  targetVisits: number;
  pendingQueries: Map<string, AnalysisQueryContext>;
}): FastAnalysisJob[] {
  const jobs: FastAnalysisJob[] = [];

  for (const movePath of analysisPaths) {
    const job = passAnalysisJobForPath(document, movePath, analysisCache, targetVisits, pendingQueries);
    if (job != null) jobs.push(job);
  }

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

function passAnalysisJobForPath(
  document: SgfDocument,
  movePath: number[],
  analysisCache: Record<string, CachedAnalysis>,
  targetVisits: number,
  pendingQueries: Map<string, AnalysisQueryContext>
): FastAnalysisJob | null {
  const passChildPath = findPassChildPath(document, movePath);
  if (passChildPath != null) {
    const passNodeId = nodeKey(document, passChildPath);
    const cached = analysisCache[passNodeId];
    if ((cached?.visits ?? cached?.result.rootInfo?.visits ?? 0) >= targetVisits) return null;
    if (hasPendingAnalysisQuery(pendingQueries, 'fast', passNodeId, null)) return null;
    return {path: passChildPath, passAnalysis: 'regular'};
  }

  if (!shouldRequestHiddenPassAnalysis(document, movePath, analysisCache, targetVisits)) return null;
  if (hasPendingAnalysisQuery(pendingQueries, 'fast', hiddenPassAnalysisKey(document, movePath), 'pass')) return null;
  return {path: movePath, passAnalysis: 'hidden'};
}
