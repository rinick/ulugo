import {describe, expect, it} from 'vitest';
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
});
