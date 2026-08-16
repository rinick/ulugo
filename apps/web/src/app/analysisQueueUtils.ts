import {getBoardSize, getLine, type SgfDocument} from '@ulugo/sgf-core';
import {
  analysisReady,
  findPassChildIndex,
  findPassChildPath,
  hasPendingAnalysisQuery,
  hiddenPassAnalysisKey,
  hiddenPassAnalysisNodeId,
  shouldCountHiddenPassAnalysis,
  type AnalysisQueryContext,
  type CachedAnalysis,
} from './appAnalysisUtils';
import {nodeKey} from './sgfPathUtils';

const nextFastAnalysisCount = 5;

export type PassAnalysisKind = 'regular' | 'hidden';
export type FastAnalysisJob = {
  path: number[];
  passAnalysis?: PassAnalysisKind;
  includeOwnership?: boolean;
};
export type PassAnalysisRequest = {path: number[]; passAnalysis: PassAnalysisKind; targetVisits: number};
export type AnalysisPathEntry = {
  path: number[];
  nodeId: string;
  passPath: number[];
  passNodeId: string;
  passAnalysis: PassAnalysisKind;
};

export function buildAnalysisPathEntries(document: SgfDocument, analysisPaths: number[][]): AnalysisPathEntry[] {
  const lastPath = analysisPaths.at(-1);
  if (lastPath == null) return [];

  const nodes = getLine(document, lastPath);
  const boardSize = getBoardSize(document);
  return analysisPaths.map((path) => {
    const node = nodes[path.length];
    if (node == null) throw new Error(`Analysis path is outside the current branch: ${path.join('.')}`);

    const passIndex = findPassChildIndex(node, boardSize);
    const passNode = node.children[passIndex];
    return passNode == null
      ? {
          path,
          nodeId: node.id,
          passPath: path,
          passNodeId: hiddenPassAnalysisNodeId(node.id),
          passAnalysis: 'hidden',
        }
      : {
          path,
          nodeId: node.id,
          passPath: [...path, passIndex],
          passNodeId: passNode.id,
          passAnalysis: 'regular',
        };
  });
}

export function shouldCountPassAnalysis(
  entry: AnalysisPathEntry,
  cache: Record<string, CachedAnalysis>,
  targetVisits: number,
  requireOwnership = false
): boolean {
  const passAnalysis = cache[entry.passNodeId];
  if (analysisReady(passAnalysis, targetVisits, requireOwnership)) return false;
  if (entry.passAnalysis === 'regular' || requireOwnership) return true;

  const analysis = cache[entry.nodeId]?.result;
  const passMove = analysis?.moveInfos?.find((move) => move.move.toLowerCase() === 'pass');
  return (passMove?.visits ?? 0) < targetVisits;
}

export async function dispatchFastAnalysisJobs(
  jobs: FastAnalysisJob[],
  availableSlots: number,
  dispatch: (job: FastAnalysisJob) => Promise<void>
): Promise<void> {
  await Promise.all(jobs.slice(0, Math.max(0, availableSlots)).map(dispatch));
}

export function buildFastAnalysisJobs({
  analysisEntries,
  currentNodeId,
  passAnalysisMode,
  currentAnalysisNeedsOwnership = false,
  passAnalysisNeedsOwnership = false,
  analysisCache,
  targetVisits,
  pendingQueries,
}: {
  analysisEntries: AnalysisPathEntry[];
  currentNodeId: string;
  passAnalysisMode: boolean;
  currentAnalysisNeedsOwnership?: boolean;
  passAnalysisNeedsOwnership?: boolean;
  analysisCache: Record<string, CachedAnalysis>;
  targetVisits: number;
  pendingQueries: Map<string, AnalysisQueryContext>;
}): FastAnalysisJob[] {
  const currentIndex = analysisEntries.findIndex((entry) => entry.nodeId === currentNodeId);
  const firstNextIndex = currentIndex < 0 ? 0 : currentIndex + 1;
  const nextEndIndex = firstNextIndex + nextFastAnalysisCount;
  const nextEntries = analysisEntries.slice(firstNextIndex, nextEndIndex);
  const currentEntry = currentIndex < 0 ? null : analysisEntries[currentIndex];
  const otherEntries = analysisEntries.filter(
    (_, index) => index !== currentIndex && (index < firstNextIndex || index >= nextEndIndex)
  );
  const jobs: FastAnalysisJob[] = [];

  function addNormalJobs(entries: AnalysisPathEntry[], includeOwnership = false): void {
    for (const entry of entries) {
      const cached = analysisCache[entry.nodeId];
      if (analysisReady(cached, targetVisits, includeOwnership)) continue;
      if (hasPendingAnalysisQuery(pendingQueries, 'fast', entry.nodeId, null, includeOwnership)) continue;
      jobs.push({path: entry.path, includeOwnership});
    }
  }

  if (currentEntry != null) addNormalJobs([currentEntry], currentAnalysisNeedsOwnership);
  if (passAnalysisMode && currentEntry != null) {
    const job = passAnalysisJobForEntry(
      currentEntry,
      analysisCache,
      targetVisits,
      pendingQueries,
      passAnalysisNeedsOwnership
    );
    if (job != null) jobs.push(job);
  }
  addNormalJobs(nextEntries);
  addNormalJobs(otherEntries);

  return jobs;
}

export function buildBackgroundPassAnalysisJobs({
  analysisEntries,
  analysisCache,
  targetVisits,
  pendingQueries,
  requireOwnership = false,
  limit = Number.POSITIVE_INFINITY,
}: {
  analysisEntries: AnalysisPathEntry[];
  analysisCache: Record<string, CachedAnalysis>;
  targetVisits: number;
  pendingQueries: Map<string, AnalysisQueryContext>;
  requireOwnership?: boolean;
  limit?: number;
}): FastAnalysisJob[] {
  const jobs: FastAnalysisJob[] = [];
  if (limit <= 0) return jobs;

  for (const entry of analysisEntries) {
    const job = passAnalysisJobForEntry(entry, analysisCache, targetVisits, pendingQueries, requireOwnership);
    if (job != null) jobs.push(job);
    if (jobs.length >= limit) break;
  }

  return jobs;
}

export function getFastQueryIdsOutsideEntries(
  pendingQueries: Map<string, AnalysisQueryContext>,
  analysisEntries: AnalysisPathEntry[]
): string[] {
  const nodeIds = new Set<string>();
  for (const entry of analysisEntries) {
    nodeIds.add(entry.nodeId);
    nodeIds.add(entry.passNodeId);
  }
  return [...pendingQueries.entries()]
    .filter(([, context]) => context.mode === 'fast' && !nodeIds.has(context.nodeId))
    .map(([queryId]) => queryId);
}

export function livePassAnalysisRequest(
  document: SgfDocument,
  path: number[],
  analysisCache: Record<string, CachedAnalysis>,
  targetVisits: number,
  requireOwnership = false
): PassAnalysisRequest | null {
  if (!shouldCountHiddenPassAnalysis(document, path, analysisCache, targetVisits, requireOwnership)) return null;

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
  passHidden: boolean,
  mainRequiresOwnership = false,
  passRequiresOwnership = false
): string[] {
  return [...pendingQueries.entries()]
    .filter(([, context]) => {
      if (context.mode !== 'live') return false;
      if (
        mainNodeId != null &&
        context.nodeId === mainNodeId &&
        context.mergeMove == null &&
        (!mainRequiresOwnership || context.includeOwnership)
      )
        return false;
      if (
        passNodeId != null &&
        context.nodeId === passNodeId &&
        (context.mergeMove === 'pass') === passHidden &&
        (!passRequiresOwnership || context.includeOwnership)
      )
        return false;
      return true;
    })
    .map(([queryId]) => queryId);
}

function passAnalysisJobForEntry(
  entry: AnalysisPathEntry,
  analysisCache: Record<string, CachedAnalysis>,
  targetVisits: number,
  pendingQueries: Map<string, AnalysisQueryContext>,
  requireOwnership: boolean
): FastAnalysisJob | null {
  if (!shouldCountPassAnalysis(entry, analysisCache, targetVisits, requireOwnership)) return null;

  if (entry.passAnalysis === 'regular') {
    if (hasPendingAnalysisQuery(pendingQueries, 'fast', entry.passNodeId, null, requireOwnership)) return null;
    return {path: entry.passPath, passAnalysis: 'regular'};
  }

  if (analysisCache[entry.nodeId]?.result.rootInfo == null) return null;
  if (hasPendingAnalysisQuery(pendingQueries, 'fast', entry.passNodeId, 'pass', requireOwnership)) return null;
  return {path: entry.path, passAnalysis: 'hidden'};
}
