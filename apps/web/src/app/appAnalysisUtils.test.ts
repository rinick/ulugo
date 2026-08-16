import {describe, expect, it} from 'vitest';
import {deriveBoardPosition} from '@ulugo/go-core';
import {parseSgf} from '@ulugo/sgf-core';
import {buildAnalysisChartData, hiddenPassAnalysisKey, type CachedAnalysis} from './appAnalysisUtils';
import {nodeKey} from './sgfPathUtils';

function cachedScore(scoreLead: number): CachedAnalysis {
  return {
    result: {id: String(scoreLead), rootInfo: {scoreLead}},
    visits: 20,
    completed: true,
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
