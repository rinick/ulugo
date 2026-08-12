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
    expect(state.referenceHasSetup).toBe(true);
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

  it('turns an occupied continuation move into a pass and keeps later moves', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd])');

    const result = replaceNextMoveBranch({
      document,
      path: [],
      point: 'cc',
      branchMemory,
      state: createReplaceMoveState(document, [], branchMemory),
    })!;

    expect(serializeSgf(result.document)).toContain('(;B[cc];W[bb];B[];W[dd])');
  });

  it('removes two consecutive continuation moves converted into passes', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd];B[ee])');
    const first = replaceNextMoveBranch({
      document,
      path: [],
      point: 'cc',
      branchMemory,
      state: createReplaceMoveState(document, [], branchMemory),
    })!;

    const second = replaceNextMoveBranch({
      document: first.document,
      path: first.path,
      point: 'dd',
      branchMemory,
      state: first.state,
    })!;

    expect(serializeSgf(second.document)).toContain('(;B[cc];W[dd];B[ee])');
    expect(serializeSgf(second.document)).not.toContain(';B[];W[]');
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
    expect(Object.fromEntries(stones.extraFuture)).toEqual({});
    expect(stones.missing).toEqual(new Set());
    expect(stones.extra).toEqual(new Set());
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
    expect(stones.missing).toEqual(new Set(['bb', 'cc', 'dd']));
    expect(stones.extra).toEqual(new Set(['aa']));
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
    expect(Object.fromEntries(stones.extraFuture)).toEqual({});
    expect(stones.missing).toEqual(new Set(['bb', 'cc']));
    expect(stones.extra).toEqual(new Set(['aa']));
  });

  it('marks a replacement stone when the reference branch has the opposite color', () => {
    const document = parseSgf('(;SZ[9](;B[aa])(;W[aa]))');
    const state: ReplaceMoveState = {
      originalPath: [1],
      replacementPath: [0],
      originalStartPath: [1],
      replacementStartPath: [0],
    };

    const stones = replaceMoveStones(document, [0], new Map(), state);

    expect(stones.missing).toEqual(new Set());
    expect(stones.extra).toEqual(new Set(['aa']));
  });

  it('does not mark copied continuation stones as missing after a replacement', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc])');
    const replacement = replaceNextMoveBranch({
      document,
      path: [],
      point: 'dd',
      branchMemory,
      state: createReplaceMoveState(document, [], branchMemory),
    })!;

    const stones = replaceMoveStones(replacement.document, replacement.path, branchMemory, replacement.state);

    expect(Object.fromEntries(stones.past)).toEqual({aa: 'B'});
    expect(Object.fromEntries(stones.future)).toEqual({bb: 'W', cc: 'B'});
    expect(stones.missing).toEqual(new Set(['aa']));
    expect(stones.extra).toEqual(new Set(['dd']));
  });

  it('marks a reference continuation stone moved into the current position', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[dd])');
    const replacement = replaceNextMoveBranch({
      document,
      path: [],
      point: 'dd',
      branchMemory,
      state: createReplaceMoveState(document, [], branchMemory),
    })!;

    const stones = replaceMoveStones(replacement.document, replacement.path, branchMemory, replacement.state);

    expect(stones.missing).toEqual(new Set(['aa']));
    expect(stones.extra).toEqual(new Set(['dd']));
  });

  it('shows current-only future stones and marks them as extra', () => {
    const document = parseSgf('(;SZ[9](;B[aa];W[cc];B[dd])(;B[aa];W[cc]))');
    const state: ReplaceMoveState = {
      originalPath: [1],
      replacementPath: [0],
      originalStartPath: [1],
      replacementStartPath: [0],
    };

    const stones = replaceMoveStones(document, [0], new Map(), state);

    expect(Object.fromEntries(stones.future)).toEqual({cc: 'W'});
    expect(Object.fromEntries(stones.extraFuture)).toEqual({dd: 'B'});
    expect(stones.missing).toEqual(new Set());
    expect(stones.extra).toEqual(new Set(['dd']));
  });

  it('marks the smallest moved block when shared moves change order', () => {
    const document = parseSgf('(;SZ[9](;B[ee];W[ff];B[aa];W[bb];B[cc];W[dd])(;B[aa];W[bb];B[cc];W[dd];B[ee];W[ff]))');
    const state: ReplaceMoveState = {
      originalPath: [1],
      replacementPath: [0],
      originalStartPath: [1],
      replacementStartPath: [0],
      referenceNextPath: [1, 0],
      referenceMoves: [
        {color: 'B', point: 'aa'},
        {color: 'W', point: 'bb'},
        {color: 'B', point: 'cc'},
        {color: 'W', point: 'dd'},
        {color: 'B', point: 'ee'},
        {color: 'W', point: 'ff'},
      ],
      referenceHasSetup: false,
    };

    const stones = replaceMoveStones(document, [0], new Map(), state);

    expect(Object.fromEntries(stones.extraFuture)).toEqual({ff: 'W'});
    expect(stones.extra).toEqual(new Set(['ee', 'ff']));
  });

  it('skips move-order comparison when the reference branch reaches setup', () => {
    const document = parseSgf(
      '(;SZ[9](;B[ee];W[ff];B[aa];W[bb];B[cc];W[dd])(;B[aa];W[bb];B[cc];W[dd];B[ee];W[ff];AB[gg]))'
    );
    const state: ReplaceMoveState = {
      originalPath: [1],
      replacementPath: [0],
      originalStartPath: [1],
      replacementStartPath: [0],
      referenceNextPath: [1, 0],
      referenceMoves: [
        {color: 'B', point: 'aa'},
        {color: 'W', point: 'bb'},
        {color: 'B', point: 'cc'},
        {color: 'W', point: 'dd'},
        {color: 'B', point: 'ee'},
        {color: 'W', point: 'ff'},
      ],
      referenceHasSetup: true,
    };

    const stones = replaceMoveStones(document, [0], new Map(), state);

    expect(Object.fromEntries(stones.extraFuture)).toEqual({});
    expect(stones.extra).toEqual(new Set());
  });

  it('does not mark a current stone contained in the reference setup position', () => {
    const document = parseSgf('(;SZ[9](;B[cc])(;B[aa];W[cc];AB[cc]))');
    const state: ReplaceMoveState = {
      originalPath: [1],
      replacementPath: [0],
      originalStartPath: [1],
      replacementStartPath: [0],
      referenceNextPath: [1, 0],
      referenceHasSetup: true,
    };

    const stones = replaceMoveStones(document, [0], new Map(), state);

    expect(deriveBoardPosition(document, [1, 0, 0]).stones.get('cc')).toBe('B');
    expect(stones.extra.has('cc')).toBe(false);
  });
});
