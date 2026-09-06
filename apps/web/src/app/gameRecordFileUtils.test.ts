import {parseSgf} from '@ulugo/sgf-core';
import {describe, expect, it} from 'vitest';
import {maximumMoveCount} from './gameRecordFileUtils';

describe('maximumMoveCount', () => {
  it.each([0, 10, 11])('counts %i moves for the new game confirmation threshold', (moves) => {
    const sequence = Array.from({length: moves}, (_, index) => (index % 2 === 0 ? ';B[aa]' : ';W[bb]')).join('');
    const document = parseSgf(`(;SZ[13]${sequence})`);
    expect(maximumMoveCount(document)).toBe(moves);
  });

  it('checks the longest variation without adding separate branches together', () => {
    const document = parseSgf(`(;SZ[19];B[aa](;W[bb])(${';W[cc];B[dd]'.repeat(5)}))`);
    expect(maximumMoveCount(document)).toBe(11);
  });

  it('counts root moves and passes, excluding setup and comment nodes', () => {
    const document = parseSgf('(;SZ[19]B[aa];C[comment];AB[bb]AW[cc];W[];B[])');
    expect(maximumMoveCount(document)).toBe(3);
  });
});
