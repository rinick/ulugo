import {deriveBoardPosition} from '@ulugo/go-core';
import {buildTree, getNodeAtPath, parseSgf, serializeSgf} from '@ulugo/sgf-core';
import {describe, expect, it} from 'vitest';
import {
  confirmReplaceMove,
  createReplaceMoveState,
  deleteReplaceMove,
  replaceMoveStones,
  hasNonEmptyRootSetup,
  insertEmptyMoveZeroBeforeRootSetup,
  replaceMoveStateForSelection,
  replaceNextMoveBranch,
  type ReplaceMoveState,
} from './replaceMoveUtils';

describe('deleteReplaceMove', () => {
  it('deletes only the current replacement move and promotes its continuation', () => {
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc])');
    const continuationId = getNodeAtPath(document, [0, 0, 0]).id;

    const result = deleteReplaceMove(document, [0, 0])!;

    expect(result.path).toEqual([0]);
    expect(serializeSgf(result.document)).toBe('(;SZ[9];B[aa];B[cc])');
    expect(getNodeAtPath(result.document, [0, 0]).id).not.toBe(continuationId);
  });
});

describe('insertEmptyMoveZeroBeforeRootSetup', () => {
  it('moves a non-empty root setup to move 1 while preserving existing node ids and positions', () => {
    const document = parseSgf('(;GM[1]SZ[9]KM[6.5]AB[aa]AW[bb];B[cc])');
    const setupId = document.root.id;
    const firstMoveId = getNodeAtPath(document, [0]).id;
    const originalSetupPosition = deriveBoardPosition(document, []);
    const originalPosition = deriveBoardPosition(document, [0]);

    const next = insertEmptyMoveZeroBeforeRootSetup(document)!;

    expect(next.root.id).not.toBe(setupId);
    expect(next.root.data).toMatchObject({GM: ['1'], SZ: ['9'], KM: ['6.5']});
    expect(next.root.data.AB).toBeUndefined();
    expect(getNodeAtPath(next, [0])).toMatchObject({id: setupId, data: {AB: ['aa'], AW: ['bb']}});
    expect(getNodeAtPath(next, [0, 0]).id).toBe(firstMoveId);
    expect(deriveBoardPosition(next, [0]).stones).toEqual(originalSetupPosition.stones);
    expect(deriveBoardPosition(next, [0, 0]).stones).toEqual(originalPosition.stones);
    expect(buildTree(next)[0].children[0]).toMatchObject({moveNumber: 1, isSetup: true});
    expect(buildTree(next)[0].children[0].children[0].moveNumber).toBe(2);
    expect(serializeSgf(next)).toBe('(;GM[1]SZ[9]KM[6.5];AB[aa]AW[bb];B[cc])');
  });

  it('does not insert move 0 for an empty root setup', () => {
    const document = parseSgf('(;GM[1]SZ[9]PL[W];B[aa])');

    expect(hasNonEmptyRootSetup(document)).toBe(false);
    expect(insertEmptyMoveZeroBeforeRootSetup(document)).toBeNull();
  });

  it('allows a move to be inserted before the shifted root setup', () => {
    const document = insertEmptyMoveZeroBeforeRootSetup(parseSgf('(;SZ[9]AB[aa];W[bb])'))!;
    const result = replaceNextMoveBranch({
      document,
      path: [],
      point: 'cc',
      branchMemory: new Map(),
      state: {originalPath: [], replacementPath: []},
    })!;

    expect(result.path).toEqual([0]);
    expect(getNodeAtPath(result.document, [0]).data).toEqual({B: ['cc']});
    expect(getNodeAtPath(result.document, [0, 0]).data).toEqual({AB: ['aa']});
    expect(getNodeAtPath(result.document, [1]).data).toEqual({AB: ['aa']});
  });
});

describe('replaceNextMoveBranch', () => {
  it('inserts one move when requested, then returns to replacing', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb])');
    const inserted = replaceNextMoveBranch({
      document,
      path: [],
      point: 'cc',
      branchMemory,
      state: createReplaceMoveState(document, [], branchMemory),
      insert: true,
    })!;

    expect(getNodeAtPath(inserted.document, [0]).data).toEqual({B: ['cc']});
    expect(getNodeAtPath(inserted.document, [0, 0]).data).toEqual({B: ['aa']});

    const replaced = replaceNextMoveBranch({
      document: inserted.document,
      path: inserted.path,
      point: 'dd',
      branchMemory,
      state: inserted.state,
    })!;

    expect(serializeSgf(replaced.document)).toContain(';B[cc];B[dd];W[bb]');
    expect(replaced.state?.createdNodeIds).toHaveLength(2);
  });

  it('inserts automatically when the next reference node is setup', () => {
    const document = parseSgf('(;SZ[9];AB[aa];B[bb])');
    const state = createReplaceMoveState(document, [], new Map());
    const result = replaceNextMoveBranch({
      document,
      path: [],
      point: 'cc',
      branchMemory: new Map(),
      state,
    })!;

    expect(state.setupPath).toEqual([0]);
    expect(getNodeAtPath(result.document, [0]).data).toEqual({B: ['cc']});
    expect(getNodeAtPath(result.document, [0, 0]).data).toEqual({AB: ['aa']});
  });

  it('keeps the first setup node after moves inserted beyond the replacement range', () => {
    const branchMemory = new Map<string, number>();
    let document = parseSgf('(;SZ[9];B[aa];W[bb];AB[cc]AW[dd];B[ee])');
    let path: number[] = [];
    let state: ReplaceMoveState | null = {originalPath: [], replacementPath: []};

    for (const point of ['ff', 'gg', 'hh', 'ii']) {
      const result = replaceNextMoveBranch({document, path, point, branchMemory, state});
      expect(result).not.toBeNull();
      ({document, path, state} = result!);
    }

    expect(serializeSgf(document)).toContain(';B[ff];W[gg];B[hh];W[ii];AB[cc]AW[dd];B[ee]');
    expect(getNodeAtPath(document, [...path, 0]).data).toMatchObject({AB: ['cc'], AW: ['dd']});
    expect(state?.setupPath).toBeDefined();
  });

  it('exits at the setup boundary by deleting the setup node from the replacement branch', () => {
    const branchMemory = new Map<string, number>();
    let document = parseSgf('(;SZ[9];B[aa];AB[bb];W[cc])');
    const first = replaceNextMoveBranch({
      document,
      path: [],
      point: 'dd',
      branchMemory,
      state: {originalPath: [], replacementPath: []},
    })!;
    const finished = confirmReplaceMove({
      document: first.document,
      path: first.path,
      branchMemory,
      state: first.state,
    });

    expect(finished).not.toBeNull();
    expect(getNodeAtPath(finished!.document, [...finished!.path, 0]).data).toEqual({W: ['cc']});
    expect(serializeSgf(finished!.document)).toContain('(;B[dd];W[cc])');
  });

  it('restores ordinary replacement behavior when navigating back before the setup boundary', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];AB[cc])');
    const first = replaceNextMoveBranch({
      document,
      path: [],
      point: 'dd',
      branchMemory,
      state: {originalPath: [], replacementPath: []},
    })!;
    const second = replaceNextMoveBranch({
      document: first.document,
      path: first.path,
      point: 'ee',
      branchMemory,
      state: first.state,
    })!;
    const inserted = replaceNextMoveBranch({
      document: second.document,
      path: second.path,
      point: 'ff',
      branchMemory,
      state: second.state,
    })!;

    const restored = replaceMoveStateForSelection(inserted.document, first.path, branchMemory, inserted.state);

    expect(restored?.setupPath).toBeUndefined();
    expect(restored?.originalPath).toEqual(first.state?.originalStartPath);
  });
});

describe('confirmReplaceMove', () => {
  it('removes a later setup node when all of its board effects already exist', () => {
    const document = parseSgf('(;SZ[9];B[aa];W[bb];AB[aa]AW[bb];B[cc])');
    const result = confirmReplaceMove({
      document,
      path: [],
      branchMemory: new Map(),
      state: {originalPath: [], replacementPath: [], replacementStartPath: []},
    })!;

    expect(serializeSgf(result.document)).toBe('(;SZ[9];B[aa];W[bb];B[cc])');
  });

  it('keeps a later setup node when it changes the board', () => {
    const document = parseSgf('(;SZ[9];B[aa];W[bb];AB[cc];B[dd])');
    const result = confirmReplaceMove({
      document,
      path: [],
      branchMemory: new Map(),
      state: {originalPath: [], replacementPath: [], replacementStartPath: []},
    })!;

    expect(result.document).toBe(document);
  });
});

describe('replaceMoveStones', () => {
  it('shows empty future move and first setup points, then stops', () => {
    const document = parseSgf('(;SZ[9]AB[aa];B[bb];W[cc];AB[dd]AW[ee]AB[aa];B[ff];AW[gg])');

    const stones = replaceMoveStones(document, [], new Map());

    expect(Object.fromEntries(stones.past)).toEqual({});
    expect(Object.fromEntries(stones.future)).toEqual({
      bb: 'B',
      cc: 'W',
      dd: 'B',
      ee: 'W',
    });
  });

  it('uses the reference branch even when the replacement branch has no continuation', () => {
    const document = parseSgf('(;SZ[9](;B[aa])(;B[bb];W[cc];AB[dd];B[ee]))');
    const state: ReplaceMoveState = {
      originalPath: [1],
      replacementPath: [0],
      originalStartPath: [1],
      replacementStartPath: [0],
    };

    const stones = replaceMoveStones(document, [0], new Map(), state);

    expect(Object.fromEntries(stones.past)).toEqual({bb: 'B'});
    expect(Object.fromEntries(stones.future)).toEqual({
      cc: 'W',
      dd: 'B',
    });
  });

  it('does not show reference stones already present in the replacement position', () => {
    const document = parseSgf('(;SZ[9]AB[dd](;B[aa])(;B[bb];W[cc]))');
    const state: ReplaceMoveState = {
      originalPath: [1],
      replacementPath: [0],
      originalStartPath: [1],
      replacementStartPath: [0],
    };

    const stones = replaceMoveStones(document, [0], new Map(), state);

    expect(Object.fromEntries(stones.past)).toEqual({bb: 'B'});
    expect(Object.fromEntries(stones.future)).toEqual({cc: 'W'});
  });
});
