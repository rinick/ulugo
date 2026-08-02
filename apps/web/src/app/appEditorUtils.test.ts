import {parseSgf} from '@ulugo/sgf-core';
import {describe, expect, it} from 'vitest';
import {
  scoringOperationPath,
  shouldAutoEstimateRecognizedGame,
  shouldDeleteScoringNodeOnExit,
} from './appEditorUtils';

describe('shouldAutoEstimateRecognizedGame', () => {
  it('estimates area-scoring games with more than 100 setup stones', () => {
    const document = parseSgf('(;SZ[19]RU[Chinese])');
    document.root.data.AB = Array.from({length: 101}, () => 'aa');

    expect(shouldAutoEstimateRecognizedGame(document)).toBe(true);
    document.root.data.RU = ['New Zealand'];
    expect(shouldAutoEstimateRecognizedGame(document)).toBe(true);
  });

  it('does not estimate at 100 stones or under Japanese and Korean rules', () => {
    const document = parseSgf('(;SZ[19]RU[Chinese])');
    document.root.data.AB = Array.from({length: 100}, () => 'aa');
    expect(shouldAutoEstimateRecognizedGame(document)).toBe(false);

    document.root.data.AB.push('bb');
    document.root.data.RU = ['Japanese'];
    expect(shouldAutoEstimateRecognizedGame(document)).toBe(false);
    document.root.data.RU = ['Korean'];
    expect(shouldAutoEstimateRecognizedGame(document)).toBe(false);
  });
});

describe('scoringOperationPath', () => {
  it('uses the parent of a scoring node', () => {
    const document = parseSgf('(;SZ[19];B[dd];TB[aa]TW[bb])');

    expect(scoringOperationPath(document, [0, 0])).toEqual([0]);
  });

  it('keeps regular nodes and move zero unchanged', () => {
    const document = parseSgf('(;SZ[19];B[dd])');

    expect(scoringOperationPath(document, [])).toEqual([]);
    expect(scoringOperationPath(document, [0])).toEqual([0]);
  });
});

describe('shouldDeleteScoringNodeOnExit', () => {
  it('deletes a scoring node after a played move', () => {
    const document = parseSgf('(;SZ[19];B[dd];TB[aa]TW[bb])');

    expect(shouldDeleteScoringNodeOnExit(document, [0, 0])).toBe(true);
  });

  it('keeps a scoring node after a pass', () => {
    const document = parseSgf('(;SZ[19];B[];TB[aa]TW[bb])');

    expect(shouldDeleteScoringNodeOnExit(document, [0, 0])).toBe(false);
  });

  it('keeps a scoring node after an old-style pass', () => {
    const document = parseSgf('(;SZ[19];B[tt];TB[aa]TW[bb])');

    expect(shouldDeleteScoringNodeOnExit(document, [0, 0])).toBe(false);
  });
});
