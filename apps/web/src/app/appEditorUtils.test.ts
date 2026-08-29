import {parseSgf} from '@ulugo/sgf-core';
import {describe, expect, it} from 'vitest';
import {
  insertMoveStartPath,
  recognizedCaptureCounts,
  recognizedSetupChanges,
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

  it('does not estimate at 100 stones', () => {
    const document = parseSgf('(;SZ[19]RU[Chinese])');
    document.root.data.AB = Array.from({length: 100}, () => 'aa');
    expect(shouldAutoEstimateRecognizedGame(document)).toBe(false);
  });

  it('estimates Japanese and Korean games with more than 100 stones', () => {
    const document = parseSgf('(;SZ[19]RU[Japanese])');
    document.root.data.AB = Array.from({length: 101}, () => 'aa');
    expect(shouldAutoEstimateRecognizedGame(document)).toBe(true);

    document.root.data.RU = ['Korean'];
    expect(shouldAutoEstimateRecognizedGame(document)).toBe(true);
  });
});

describe('recognizedCaptureCounts', () => {
  it('derives the capture difference from stone counts and the next player', () => {
    expect(recognizedCaptureCounts(52, 49, 0, 'W')).toEqual({B: 2, W: 0});
    expect(recognizedCaptureCounts(50, 52, 0, 'B')).toEqual({B: 0, W: 2});
  });

  it('treats handicap one like handicap zero for stone counts', () => {
    expect(recognizedCaptureCounts(50, 49, 1, 'W')).toEqual(recognizedCaptureCounts(50, 49, 0, 'W'));
  });

  it('accounts for handicap stones and White playing first', () => {
    expect(recognizedCaptureCounts(51, 49, 2, 'W')).toEqual({B: 0, W: 0});
    expect(recognizedCaptureCounts(50, 50, 2, 'B')).toEqual({B: 0, W: 1});
  });
});

describe('recognizedSetupChanges', () => {
  it('keeps only added, removed, and changed stones', () => {
    const current = new Map([
      ['aa', 'B'],
      ['bb', 'W'],
      ['cc', 'B'],
    ] as const);
    const recognized = new Map([
      ['aa', 'B'],
      ['bb', 'B'],
      ['dd', 'W'],
    ] as const);

    expect(recognizedSetupChanges(['aa', 'bb', 'cc', 'dd'], current, recognized)).toEqual({
      black: ['bb'],
      white: ['dd'],
      empty: ['cc'],
    });
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

describe('insertMoveStartPath', () => {
  it('starts before a selected camera snapshot', () => {
    const document = parseSgf('(;SZ[19];B[dd];PL[B]AB[aa]ZA[camera])');

    expect(insertMoveStartPath(document, [0, 0])).toEqual([0]);
  });

  it('keeps regular nodes and move zero unchanged', () => {
    const document = parseSgf('(;SZ[19];B[dd];PL[B]AB[aa])');

    expect(insertMoveStartPath(document, [])).toEqual([]);
    expect(insertMoveStartPath(document, [0])).toEqual([0]);
    expect(insertMoveStartPath(document, [0, 0])).toEqual([0, 0]);
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
