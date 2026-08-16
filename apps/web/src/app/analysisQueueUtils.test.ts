import {parseSgf} from '@ulugo/sgf-core';
import {describe, expect, it, vi} from 'vitest';
import {
  buildAnalysisPathEntries,
  buildBackgroundPassAnalysisJobs,
  buildFastAnalysisJobs,
  dispatchFastAnalysisJobs,
  getFastQueryIdsOutsideEntries,
  getStaleLiveQueryIds,
  shouldCountPassAnalysis,
  type FastAnalysisJob,
} from './analysisQueueUtils';
import type {AnalysisQueryContext} from './appAnalysisUtils';
import {nodeKey} from './sgfPathUtils';

function deferred(): {promise: Promise<void>; resolve: () => void} {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return {promise, resolve};
}

describe('dispatchFastAnalysisJobs', () => {
  it('reserves every available slot before waiting for a request', async () => {
    const jobs: FastAnalysisJob[] = [{path: []}, {path: [0]}, {path: [0, 0]}];
    const first = deferred();
    const second = deferred();
    const dispatch = vi
      .fn<(job: FastAnalysisJob) => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const result = dispatchFastAnalysisJobs(jobs, 2, dispatch);

    expect(dispatch.mock.calls.map(([job]) => job)).toEqual(jobs.slice(0, 2));

    first.resolve();
    second.resolve();
    await result;
  });
});

describe('buildFastAnalysisJobs', () => {
  it('requests ownership only for the selected position', () => {
    const document = parseSgf('(;SZ[9];B[aa])');
    const analysisPaths = [[], [0]];
    const analysisCache = Object.fromEntries(
      analysisPaths.map((path) => {
        const id = nodeKey(document, path);
        return [id, {result: {id, rootInfo: {visits: 20}}, visits: 20}];
      })
    );

    expect(
      buildFastAnalysisJobs({
        analysisEntries: buildAnalysisPathEntries(document, analysisPaths),
        currentNodeId: nodeKey(document, [0]),
        passAnalysisMode: false,
        currentAnalysisNeedsOwnership: true,
        analysisCache,
        targetVisits: 20,
        pendingQueries: new Map(),
      })
    ).toEqual([{path: [0], includeOwnership: true}]);
  });

  it('does not let a pending query without ownership block an ownership query', () => {
    const document = parseSgf('(;SZ[9])');
    const nodeId = nodeKey(document, []);
    const analysisCache = {[nodeId]: {result: {id: nodeId, rootInfo: {visits: 20}}, visits: 20}};
    const pendingQueries = new Map<string, AnalysisQueryContext>([
      ['plain', {nodeId, path: [], version: 0, mode: 'fast', includeOwnership: false}],
    ]);
    const options = {
      analysisEntries: buildAnalysisPathEntries(document, [[]]),
      currentNodeId: nodeId,
      passAnalysisMode: false,
      currentAnalysisNeedsOwnership: true,
      analysisCache,
      targetVisits: 20,
      pendingQueries,
    };

    expect(buildFastAnalysisJobs(options)).toEqual([{path: [], includeOwnership: true}]);

    pendingQueries.set('owned', {nodeId, path: [], version: 0, mode: 'fast', includeOwnership: true});
    expect(buildFastAnalysisJobs(options)).toEqual([]);
  });
});

describe('analysis path entries', () => {
  it('records real and hidden pass targets once for the current branch', () => {
    const document = parseSgf('(;SZ[9](;B[])(;B[aa]))');
    const entries = buildAnalysisPathEntries(document, [[], [1]]);

    expect(entries).toEqual([
      {
        path: [],
        nodeId: nodeKey(document, []),
        passPath: [0],
        passNodeId: nodeKey(document, [0]),
        passAnalysis: 'regular',
      },
      {
        path: [1],
        nodeId: nodeKey(document, [1]),
        passPath: [1],
        passNodeId: `${nodeKey(document, [1])}:pass`,
        passAnalysis: 'hidden',
      },
    ]);
  });

  it('keeps ownership readiness separate for real and hidden pass analyses', () => {
    const hiddenDocument = parseSgf('(;SZ[9])');
    const hiddenEntry = buildAnalysisPathEntries(hiddenDocument, [[]])[0];
    const hiddenCache = {
      [hiddenEntry.nodeId]: {
        result: {
          id: hiddenEntry.nodeId,
          rootInfo: {visits: 20},
          moveInfos: [{move: 'pass', visits: 20}],
        },
        visits: 20,
      },
    };
    expect(shouldCountPassAnalysis(hiddenEntry, hiddenCache, 20)).toBe(false);
    expect(shouldCountPassAnalysis(hiddenEntry, hiddenCache, 20, true)).toBe(true);

    const regularDocument = parseSgf('(;SZ[9];B[])');
    const regularEntry = buildAnalysisPathEntries(regularDocument, [[]])[0];
    const regularCache = {
      [regularEntry.passNodeId]: {
        result: {id: regularEntry.passNodeId, rootInfo: {visits: 20}},
        visits: 20,
      },
    };
    expect(shouldCountPassAnalysis(regularEntry, regularCache, 20)).toBe(false);
    expect(shouldCountPassAnalysis(regularEntry, regularCache, 20, true)).toBe(true);
  });
});

describe('buildBackgroundPassAnalysisJobs', () => {
  it('continues the same full-branch order while limiting work to available slots', () => {
    const document = parseSgf('(;SZ[9];B[aa];W[bb])');
    const analysisPaths = [[], [0], [0, 0]];
    const analysisEntries = buildAnalysisPathEntries(document, analysisPaths);
    const analysisCache = Object.fromEntries(
      analysisEntries.map((entry) => [entry.nodeId, {result: {id: entry.nodeId, rootInfo: {visits: 20}}, visits: 20}])
    );
    const pendingQueries = new Map<string, AnalysisQueryContext>();
    const options = {
      analysisEntries,
      analysisCache,
      targetVisits: 20,
      pendingQueries,
      limit: 2,
    };

    expect(buildBackgroundPassAnalysisJobs(options)).toEqual([
      {path: [], passAnalysis: 'hidden'},
      {path: [0], passAnalysis: 'hidden'},
    ]);

    pendingQueries.set('root-pass', {
      nodeId: analysisEntries[0].passNodeId,
      path: [],
      version: 0,
      mode: 'fast',
      includeOwnership: false,
      mergeMove: 'pass',
    });
    expect(buildBackgroundPassAnalysisJobs(options)).toEqual([
      {path: [0], passAnalysis: 'hidden'},
      {path: [0, 0], passAnalysis: 'hidden'},
    ]);
  });
});

describe('getFastQueryIdsOutsideEntries', () => {
  it('keeps normal, real-pass, and hidden-pass jobs on the branch and retires only outside fast jobs', () => {
    const document = parseSgf('(;SZ[9](;B[])(;B[aa])(;B[bb]))');
    const entries = buildAnalysisPathEntries(document, [[], [1]]);
    const contexts = new Map<string, AnalysisQueryContext>([
      ['normal', {nodeId: entries[0].nodeId, path: [], version: 0, mode: 'fast', includeOwnership: false}],
      [
        'real-pass',
        {
          nodeId: entries[0].passNodeId,
          path: entries[0].passPath,
          version: 0,
          mode: 'fast',
          includeOwnership: false,
        },
      ],
      [
        'hidden-pass',
        {
          nodeId: entries[1].passNodeId,
          path: entries[1].path,
          version: 0,
          mode: 'fast',
          includeOwnership: false,
          mergeMove: 'pass',
        },
      ],
      ['outside-fast', {nodeId: nodeKey(document, [2]), path: [2], version: 0, mode: 'fast', includeOwnership: false}],
      ['outside-live', {nodeId: nodeKey(document, [2]), path: [2], version: 0, mode: 'live', includeOwnership: false}],
    ]);

    expect(getFastQueryIdsOutsideEntries(contexts, entries)).toEqual(['outside-fast']);
  });
});

describe('getStaleLiveQueryIds', () => {
  it('retires live queries that omit newly required ownership', () => {
    const pendingQueries = new Map<string, AnalysisQueryContext>([
      ['plain-main', {nodeId: 'main', path: [], version: 0, mode: 'live', includeOwnership: false}],
      [
        'owned-pass',
        {
          nodeId: 'pass',
          path: [],
          version: 0,
          mode: 'live',
          includeOwnership: true,
          mergeMove: 'pass',
        },
      ],
    ]);

    expect(getStaleLiveQueryIds(pendingQueries, 'main', 'pass', true, true, true)).toEqual(['plain-main']);
    expect(getStaleLiveQueryIds(pendingQueries, 'main', 'pass', true)).toEqual([]);
  });
});
