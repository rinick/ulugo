import {parseSgf} from '@ulugo/sgf-core';
import {describe, expect, it} from 'vitest';
import {shouldDeleteScoringNodeOnExit} from './appEditorUtils';

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
