import {getNodeAtPath, parseSgf} from '@ulugo/sgf-core';
import {describe, expect, it} from 'vitest';
import {getAnalysisQueuePaths, getCurrentBranchLeafNodeId, getCurrentBranchMovePaths} from './sgfPathUtils';

describe('getCurrentBranchLeafNodeId', () => {
  it('follows remembered children after the selected path', () => {
    const document = parseSgf('(;SZ[5];B[aa](;W[bb])(;W[cc];B[dd]))');
    const branchMemory = new Map([['0', 1]]);

    expect(getCurrentBranchLeafNodeId(document, [], branchMemory)).toBe(getNodeAtPath(document, [0, 1, 0]).id);
  });

  it('keeps an explicitly selected variation', () => {
    const document = parseSgf('(;SZ[5];B[aa](;W[bb])(;W[cc];B[dd]))');
    const branchMemory = new Map([['0', 1]]);

    expect(getCurrentBranchLeafNodeId(document, [0, 0], branchMemory)).toBe(getNodeAtPath(document, [0, 0]).id);
  });
});

describe('getAnalysisQueuePaths', () => {
  it('keeps move nodes while skipping setup and scoring nodes on the branch', () => {
    const document = parseSgf('(;SZ[9];B[aa];AB[bb]AW[cc];W[dd];TB[ee])');
    const branchPaths = getCurrentBranchMovePaths(document, [], new Map());

    expect(getAnalysisQueuePaths(document, branchPaths)).toEqual([[], [0], [0, 0, 0]]);
  });
});
