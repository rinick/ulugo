import {describe, expect, it} from 'vitest';
import {deriveBoardPosition} from '@ulugo/go-core';
import {deleteNode, parseSgf} from '@ulugo/sgf-core';
import {
  analysisReady,
  buildAnalysisChartData,
  buildStoneScoreDeltas,
  convertHiddenPassAnalysisToRegularPass,
  hiddenPassAnalysisKey,
  pruneAnalysisCache,
  shouldCountHiddenPassAnalysis,
  updateAnalysisCache,
  type CachedAnalysis,
} from './appAnalysisUtils';
import {nodeKey} from './sgfPathUtils';

function cachedScore(scoreLead: number): CachedAnalysis {
  return {
    result: {id: String(scoreLead), rootInfo: {scoreLead}},
    visits: 20,
  };
}

function expectIntensityColors(sgf: string, pathCount: number, expected: Array<'B' | 'W'>): void {
  const document = parseSgf(sgf);
  const paths = Array.from({length: pathCount}, (_, index) => Array<number>(index).fill(0));
  const cache = Object.fromEntries(
    paths.flatMap((path) => [
      [nodeKey(document, path), cachedScore(10)],
      [hiddenPassAnalysisKey(document, path), cachedScore(-10)],
    ])
  );
  const colors = buildAnalysisChartData(document, paths, cache)
    .filter((point) => point.series === 'intensity')
    .map((point) => point.color);

  expect(paths.map((path) => deriveBoardPosition(document, path).nextColor)).toEqual(expected);
  expect(colors).toEqual(expected);
}

describe('buildAnalysisChartData', () => {
  it('uses the score difference between the best play and a hidden pass for intensity', () => {
    const document = parseSgf('(;SZ[9])');
    const cache = {
      [nodeKey(document, [])]: cachedScore(12),
      [hiddenPassAnalysisKey(document, [])]: cachedScore(-8),
    };

    expect(buildAnalysisChartData(document, [[]], cache)).toContainEqual({
      moveNumber: 0,
      series: 'intensity',
      value: 20,
      color: 'B',
    });
  });

  it('uses an existing pass child analysis for intensity', () => {
    const document = parseSgf('(;SZ[9];B[])');
    const cache = {
      [nodeKey(document, [])]: cachedScore(12),
      [nodeKey(document, [0])]: cachedScore(-8),
    };

    expect(buildAnalysisChartData(document, [[]], cache)).toContainEqual({
      moveNumber: 0,
      series: 'intensity',
      value: 20,
      color: 'B',
    });
  });

  it('uses the parent pass move score when a separate pass result is unnecessary', () => {
    const document = parseSgf('(;SZ[9])');
    const nodeId = nodeKey(document, []);
    const cache = {
      [nodeId]: {
        ...cachedScore(12),
        result: {
          id: nodeId,
          rootInfo: {scoreLead: 12},
          moveInfos: [{move: 'pass', scoreLead: -8, visits: 20}],
        },
      },
    };

    expect(buildAnalysisChartData(document, [[]], cache)).toContainEqual({
      moveNumber: 0,
      series: 'intensity',
      value: 20,
      color: 'B',
    });
  });

  it("measures a white pass loss from White's perspective", () => {
    const document = parseSgf('(;SZ[9]PL[W])');
    const cache = {
      [nodeKey(document, [])]: cachedScore(-12),
      [hiddenPassAnalysisKey(document, [])]: cachedScore(8),
    };

    expect(buildAnalysisChartData(document, [[]], cache)).toContainEqual({
      moveNumber: 0,
      series: 'intensity',
      value: 20,
      color: 'W',
    });
  });

  it('removes the one-point area-scoring value offset from intensity', () => {
    const document = parseSgf('(;SZ[9]RU[Chinese])');
    const cache = {
      [nodeKey(document, [])]: cachedScore(12),
      [hiddenPassAnalysisKey(document, [])]: cachedScore(-8),
    };

    expect(buildAnalysisChartData(document, [[]], cache)).toContainEqual({
      moveNumber: 0,
      series: 'intensity',
      value: 19,
      color: 'B',
    });
  });

  it('follows standard alternating move colors for intensity', () => {
    expectIntensityColors('(;SZ[9];B[aa];W[bb];B[cc])', 4, ['B', 'W', 'B', 'W']);
  });

  it('uses the actual move color when consecutive moves have the same color', () => {
    expectIntensityColors('(;SZ[9];B[aa];B[bb];W[cc])', 4, ['B', 'W', 'W', 'B']);
  });

  it('switches colors after pass moves', () => {
    expectIntensityColors('(;SZ[9];B[];W[];B[aa])', 4, ['B', 'W', 'B', 'W']);
  });

  it('honors PL on the root node', () => {
    expectIntensityColors('(;SZ[9]PL[W];W[aa];B[bb])', 3, ['W', 'B', 'W']);
  });

  it('honors PL on a setup node in the middle of a game', () => {
    expectIntensityColors('(;SZ[9];B[aa];AB[bb]PL[B];B[cc])', 4, ['B', 'W', 'B', 'W']);
  });

  it('keeps the current next color across setup nodes without PL', () => {
    expectIntensityColors('(;SZ[9]AB[aa]AW[bb];B[cc];AW[dd]AE[aa];W[ee])', 4, ['B', 'W', 'W', 'B']);
  });
});

describe('buildStoneScoreDeltas', () => {
  it('uses adjacent node analyses along the selected line', () => {
    const document = parseSgf('(;SZ[9];B[aa];W[bb])');
    const cache = {
      [nodeKey(document, [])]: cachedScore(0),
      [nodeKey(document, [0])]: cachedScore(-3),
      [nodeKey(document, [0, 0])]: cachedScore(2),
    };

    expect([...buildStoneScoreDeltas(document, [0, 0], cache)]).toEqual([
      ['aa', -3],
      ['bb', -5],
    ]);
  });
});

describe('analysis cache cleanup', () => {
  it('removes analyses for deleted nodes while preserving reachable hidden pass results', () => {
    const document = parseSgf('(;SZ[9];B[aa](;W[bb])(;W[cc]))');
    const deletedNodeId = nodeKey(document, [0, 1]);
    const keptNodeId = nodeKey(document, [0, 0]);
    const result = deleteNode(document, [0, 1]);
    const cache = {
      [keptNodeId]: cachedScore(1),
      [hiddenPassAnalysisKey(document, [0, 0])]: cachedScore(2),
      [deletedNodeId]: cachedScore(3),
      [`${deletedNodeId}:pass`]: cachedScore(4),
    };

    expect(pruneAnalysisCache(cache, result.document)).toEqual({
      [keptNodeId]: cachedScore(1),
      [hiddenPassAnalysisKey(document, [0, 0])]: cachedScore(2),
    });
  });

  it('removes a hidden pass entry even when the existing pass node has more visits', () => {
    const document = parseSgf('(;SZ[9];B[])');
    const hiddenId = hiddenPassAnalysisKey(document, []);
    const passId = nodeKey(document, [0]);
    const cache = {
      [hiddenId]: cachedScore(1),
      [passId]: {...cachedScore(2), visits: 40},
    };

    const converted = convertHiddenPassAnalysisToRegularPass(cache, document, [0]);

    expect(converted[hiddenId]).toBeUndefined();
    expect(converted[passId]).toBe(cache[passId]);
  });
});

describe('pass analysis readiness', () => {
  it('requires a separate pass result when ownership is needed', () => {
    const document = parseSgf('(;SZ[9])');
    const nodeId = nodeKey(document, []);
    const cache = {
      [nodeId]: {
        ...cachedScore(0),
        result: {
          id: nodeId,
          rootInfo: {scoreLead: 0},
          moveInfos: [{move: 'pass', scoreLead: -1, visits: 20}],
        },
      },
    };

    expect(shouldCountHiddenPassAnalysis(document, [], cache, 20)).toBe(false);
    expect(shouldCountHiddenPassAnalysis(document, [], cache, 20, true)).toBe(true);
  });

  it('accepts a pass result with ownership when ownership is needed', () => {
    const document = parseSgf('(;SZ[9])');
    const cache = {
      [nodeKey(document, [])]: cachedScore(0),
      [hiddenPassAnalysisKey(document, [])]: {
        ...cachedScore(-1),
        result: {...cachedScore(-1).result, ownership: [0]},
        ownershipVisits: 20,
      },
    };

    expect(shouldCountHiddenPassAnalysis(document, [], cache, 20, true)).toBe(false);
  });
});

describe('ownership analysis readiness', () => {
  it('tracks ownership visits separately from newer analysis without ownership', () => {
    const document = parseSgf('(;SZ[9])');
    const nodeId = nodeKey(document, []);
    const withOwnership = updateAnalysisCache({
      cache: {},
      document,
      path: [],
      result: {id: 'owned-20', rootInfo: {visits: 20}, ownership: [0]},
      visits: 20,
    });
    const withoutOwnership = updateAnalysisCache({
      cache: withOwnership,
      document,
      path: [],
      result: {id: 'plain-800', rootInfo: {visits: 800}},
      visits: 800,
    });

    expect(withoutOwnership[nodeId]).toMatchObject({visits: 800, ownershipVisits: 20});
    expect(withoutOwnership[nodeId].result.ownership).toEqual([0]);
    expect(analysisReady(withoutOwnership[nodeId], 800, true)).toBe(false);

    const refreshedOwnership = updateAnalysisCache({
      cache: withoutOwnership,
      document,
      path: [],
      result: {id: 'owned-800', rootInfo: {visits: 800}, ownership: [1]},
      visits: 800,
    });
    expect(refreshedOwnership[nodeId].ownershipVisits).toBe(800);
    expect(analysisReady(refreshedOwnership[nodeId], 800, true)).toBe(true);
  });

  it('does not infer ownership visits from legacy cache entries', () => {
    const legacy: CachedAnalysis = {
      result: {id: 'legacy', rootInfo: {visits: 800}, ownership: [0]},
      visits: 800,
    };

    expect(analysisReady(legacy, 800, true)).toBe(false);
  });
});
