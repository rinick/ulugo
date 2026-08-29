import {deriveBoardPosition} from '@ulugo/go-core';
import {buildTree, getNodeAtPath, parseSgf, serializeSgf} from '@ulugo/sgf-core';
import {describe, expect, it} from 'vitest';
import {
  confirmReplaceMove,
  createReplaceMoveState,
  deleteMoveInReplaceBranch,
  replaceMoveStones,
  hasNonEmptyRootSetup,
  insertMoveInReplaceBranch,
  insertEmptyMoveZeroBeforeRootSetup,
  replaceMoveStateForSelection,
  type ReplaceMoveState,
} from './replaceMoveUtils';

describe('deleteMoveInReplaceBranch', () => {
  it('creates a branch without the clicked earlier move and selects its parent', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd])');
    const result = deleteMoveInReplaceBranch({
      document,
      path: [0, 0, 0],
      targetPath: [0],
      branchMemory,
      state: createReplaceMoveState(document, [0, 0, 0], branchMemory),
    })!;

    expect(result.path).toEqual([]);
    expect(getNodeAtPath(result.document, [0]).data).toEqual({W: ['bb']});
    expect(getNodeAtPath(result.document, [1]).data).toEqual({B: ['aa']});
    const selectedBranch = replaceMoveStateForSelection(result.document, [0, 0, 0], branchMemory, result.state)!;
    expect(getNodeAtPath(result.document, selectedBranch.originalPath).data).toEqual({W: ['dd']});
  });

  it('keeps the equivalent current node selected in delete mode', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd])');
    const result = deleteMoveInReplaceBranch({
      document,
      path: [0, 0, 0],
      targetPath: [0],
      branchMemory,
      state: createReplaceMoveState(document, [0, 0, 0], branchMemory),
      stayAtCurrentPath: true,
    })!;

    expect(result.path).toEqual([0, 0]);
    expect(getNodeAtPath(result.document, result.path).data).toEqual({B: ['cc']});
    expect(result.state.replacementPath).toEqual(result.path);
  });

  it('moves back one node when the current node is deleted in delete mode', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc])');
    const result = deleteMoveInReplaceBranch({
      document,
      path: [0, 0],
      targetPath: [0, 0],
      branchMemory,
      state: createReplaceMoveState(document, [0, 0], branchMemory),
      stayAtCurrentPath: true,
    })!;

    expect(result.path).toEqual([0]);
    expect(getNodeAtPath(result.document, result.path).data).toEqual({B: ['aa']});
  });

  it('keeps the equivalent current node when deleting inside an existing edit branch', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd])');
    const inserted = insertMoveInReplaceBranch({
      document,
      path: [0],
      point: 'ee',
      branchMemory,
      state: createReplaceMoveState(document, [0], branchMemory),
    })!;
    const currentState = replaceMoveStateForSelection(
      inserted.document,
      [...inserted.path, 0],
      branchMemory,
      inserted.state
    )!;
    const result = deleteMoveInReplaceBranch({
      document: inserted.document,
      path: currentState.replacementPath,
      targetPath: inserted.path,
      branchMemory,
      state: currentState,
      stayAtCurrentPath: true,
    })!;

    expect(result.path).toEqual(inserted.path);
    expect(getNodeAtPath(result.document, result.path).data).toEqual({W: ['bb']});
    expect(result.state.replacementPath).toEqual(result.path);
  });

  it('rebuilds an earlier branch and removes the previous replacement branch', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd])');
    const replaced = insertMoveInReplaceBranch({
      document,
      path: [0, 0, 0],
      point: 'ee',
      branchMemory,
      state: createReplaceMoveState(document, [0, 0, 0], branchMemory),
    })!;
    const deleted = deleteMoveInReplaceBranch({
      document: replaced.document,
      path: replaced.path,
      targetPath: [0],
      branchMemory,
      state: replaced.state,
    })!;

    expect(serializeSgf(deleted.document)).toContain('(;W[bb];B[cc];W[ee];W[dd])(;B[aa];W[bb];B[cc];W[dd])');
    expect(getNodeAtPath(deleted.document, [1, 0, 0]).children).toHaveLength(1);
  });

  it('rebuilds again when another stone before the deletion branch is removed', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd])');
    const first = deleteMoveInReplaceBranch({
      document,
      path: [0, 0, 0],
      targetPath: [0, 0, 0],
      branchMemory,
      state: createReplaceMoveState(document, [0, 0, 0], branchMemory),
    })!;
    const second = deleteMoveInReplaceBranch({
      document: first.document,
      path: first.path,
      targetPath: [0],
      branchMemory,
      state: first.state,
    })!;

    expect(serializeSgf(second.document)).toContain('(;W[bb];W[dd])(;B[aa];W[bb];B[cc];W[dd])');
    expect(second.document.root.children).toHaveLength(2);
  });

  it('discards the deletion branch when the next move is inserted', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd])');
    const deleted = deleteMoveInReplaceBranch({
      document,
      path: [0, 0, 0],
      targetPath: [0, 0, 0],
      branchMemory,
      state: createReplaceMoveState(document, [0, 0, 0], branchMemory),
    })!;
    const replaced = insertMoveInReplaceBranch({
      document: deleted.document,
      path: deleted.path,
      point: 'ee',
      branchMemory,
      state: deleted.state,
    })!;

    expect(serializeSgf(replaced.document)).toContain('(;B[ee];W[dd])(;B[cc];W[dd])');
    expect(getNodeAtPath(replaced.document, [0, 0]).children).toHaveLength(2);
  });
});

describe('deleteMoveInReplaceBranch', () => {
  it('starts the branch at the current position before any replacement is created', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd])');
    const result = deleteMoveInReplaceBranch({
      document,
      path: [0],
      targetPath: [0, 0, 0],
      branchMemory,
      state: createReplaceMoveState(document, [0], branchMemory),
    })!;

    expect(result.path).toEqual([0, 0]);
    expect(result.state.replacementStartPath).toEqual([0, 0]);
    expect(serializeSgf(result.document)).toContain(';B[aa](;W[bb];W[dd])(;W[bb];B[cc];W[dd])');
  });

  it('keeps the current node selected after a future deletion in delete mode', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd])');
    const result = deleteMoveInReplaceBranch({
      document,
      path: [0],
      targetPath: [0, 0, 0],
      branchMemory,
      state: createReplaceMoveState(document, [0], branchMemory),
      stayAtCurrentPath: true,
    })!;

    expect(result.path).toEqual([0]);
    expect(result.state.replacementPath).toEqual([0]);
  });

  it('keeps the current edit-branch node selected after deleting a future move', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd])');
    const inserted = insertMoveInReplaceBranch({
      document,
      path: [0],
      point: 'ee',
      branchMemory,
      state: createReplaceMoveState(document, [0], branchMemory),
    })!;
    const result = deleteMoveInReplaceBranch({
      document: inserted.document,
      path: inserted.path,
      targetPath: [...inserted.path, 0],
      branchMemory,
      state: inserted.state,
      stayAtCurrentPath: true,
    })!;

    expect(result.path).toEqual(inserted.path);
    expect(result.state.replacementPath).toEqual(inserted.path);
  });

  it('removes a future move without creating another branch at that move', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd])');
    const replaced = insertMoveInReplaceBranch({
      document,
      path: [0],
      point: 'ee',
      branchMemory,
      state: createReplaceMoveState(document, [0], branchMemory),
    })!;
    const deleted = deleteMoveInReplaceBranch({
      document: replaced.document,
      path: replaced.path,
      targetPath: [...replaced.path, 0],
      branchMemory,
      state: replaced.state,
    })!;

    expect(deleted.path).toEqual(replaced.path);
    expect(serializeSgf(deleted.document)).toContain(';B[aa](;W[ee];B[cc];W[dd])(;W[bb];B[cc];W[dd])');
    expect(getNodeAtPath(deleted.document, deleted.path).children).toHaveLength(1);
  });

  it('keeps a deleted future move out of later insertions', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd])');
    const deleted = deleteMoveInReplaceBranch({
      document,
      path: [0],
      targetPath: [0, 0, 0],
      branchMemory,
      state: createReplaceMoveState(document, [0], branchMemory),
    })!;
    const replaced = insertMoveInReplaceBranch({
      document: deleted.document,
      path: deleted.path,
      point: 'ee',
      branchMemory,
      state: deleted.state,
    })!;

    expect(serializeSgf(replaced.document)).toContain(';B[aa](;W[bb];B[ee];W[dd])(;W[bb];B[cc];W[dd])');
    expect(serializeSgf(replaced.document)).not.toContain(';B[ee];B[cc]');
  });

  it('inserts before the move after an immediately deleted future move', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd])');
    const deleted = deleteMoveInReplaceBranch({
      document,
      path: [0],
      targetPath: [0, 0],
      branchMemory,
      state: createReplaceMoveState(document, [0], branchMemory),
    })!;
    const replaced = insertMoveInReplaceBranch({
      document: deleted.document,
      path: deleted.path,
      point: 'ee',
      branchMemory,
      state: deleted.state,
    })!;

    expect(serializeSgf(replaced.document)).toContain(';B[aa](;W[ee];B[cc];W[dd])(;W[bb];B[cc];W[dd])');
  });
});

describe('alternating insert and delete actions', () => {
  it('keeps one temporary branch when edits move before and within the branch', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd])');
    const inserted = insertMoveInReplaceBranch({
      document,
      path: [0],
      point: 'ee',
      branchMemory,
      state: createReplaceMoveState(document, [0], branchMemory),
    })!;
    const deletedPast = deleteMoveInReplaceBranch({
      document: inserted.document,
      path: inserted.path,
      targetPath: [0],
      branchMemory,
      state: inserted.state,
      stayAtCurrentPath: true,
    })!;
    const insertedBefore = insertMoveInReplaceBranch({
      document: deletedPast.document,
      path: deletedPast.path,
      point: 'ff',
      branchMemory,
      state: deletedPast.state,
    })!;
    const deletedFuture = deleteMoveInReplaceBranch({
      document: insertedBefore.document,
      path: insertedBefore.path,
      targetPath: [0, 0, 0],
      branchMemory,
      state: insertedBefore.state,
      stayAtCurrentPath: true,
    })!;
    const insertedAgain = insertMoveInReplaceBranch({
      document: deletedFuture.document,
      path: deletedFuture.path,
      point: 'gg',
      branchMemory,
      state: deletedFuture.state,
    })!;

    expect(countBranchPoints(insertedAgain.document.root)).toBe(1);
    expect(insertedAgain.document.root.children).toHaveLength(2);
  });
});

describe('move edit branch navigation', () => {
  it('keeps the session only on the remembered branch before an edit branch exists', () => {
    const document = parseSgf('(;SZ[9](;B[aa];W[bb])(;B[cc];W[dd]))');
    const branchMemory = new Map<string, number>([['', 0]]);
    const state = createReplaceMoveState(document, [], branchMemory);

    expect(replaceMoveStateForSelection(document, [0, 0], branchMemory, state)).not.toBeNull();
    expect(replaceMoveStateForSelection(document, [1], branchMemory, state)).toBeNull();
  });

  it('keeps the session on the edited branch and its trunk but rejects the original sibling branch', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc])');
    const inserted = insertMoveInReplaceBranch({
      document,
      path: [0],
      point: 'dd',
      branchMemory,
      state: createReplaceMoveState(document, [0], branchMemory),
    })!;

    expect(replaceMoveStateForSelection(inserted.document, [0], branchMemory, inserted.state)).not.toBeNull();
    expect(replaceMoveStateForSelection(inserted.document, [0, 0, 0], branchMemory, inserted.state)).not.toBeNull();
    expect(replaceMoveStateForSelection(inserted.document, [0, 1], branchMemory, inserted.state)).toBeNull();
  });

  it('rebases an insertion made on the trunk and removes the old temporary branch', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd])');
    const inserted = insertMoveInReplaceBranch({
      document,
      path: [0, 0],
      point: 'ee',
      branchMemory,
      state: createReplaceMoveState(document, [0, 0], branchMemory),
    })!;
    const trunkState = replaceMoveStateForSelection(inserted.document, [], branchMemory, inserted.state)!;
    const rebased = insertMoveInReplaceBranch({
      document: inserted.document,
      path: [],
      point: 'ff',
      branchMemory,
      state: trunkState,
    })!;

    expect(countBranchPoints(rebased.document.root)).toBe(1);
    expect(rebased.document.root.children).toHaveLength(2);
  });

  it('rebases a future trunk deletion and selects the preceding node', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc];W[dd])');
    const inserted = insertMoveInReplaceBranch({
      document,
      path: [0, 0, 0],
      point: 'ee',
      branchMemory,
      state: createReplaceMoveState(document, [0, 0, 0], branchMemory),
    })!;
    const trunkState = replaceMoveStateForSelection(inserted.document, [], branchMemory, inserted.state)!;
    const deleted = deleteMoveInReplaceBranch({
      document: inserted.document,
      path: [],
      targetPath: [0, 0],
      branchMemory,
      state: trunkState,
    })!;

    expect(deleted.path).toEqual([0]);
    expect(countBranchPoints(deleted.document.root)).toBe(1);
  });
});

function countBranchPoints(node: ReturnType<typeof getNodeAtPath>): number {
  return (
    (node.children.length > 1 ? 1 : 0) + node.children.reduce((count, child) => count + countBranchPoints(child), 0)
  );
}

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
    const result = insertMoveInReplaceBranch({
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

describe('insertMoveInReplaceBranch', () => {
  it('creates one temporary branch and preserves the original continuation', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb])');
    const inserted = insertMoveInReplaceBranch({
      document,
      path: [],
      point: 'cc',
      branchMemory,
      state: createReplaceMoveState(document, [], branchMemory),
    })!;

    expect(serializeSgf(inserted.document)).toContain('(;B[cc];B[aa];W[bb])(;B[aa];W[bb])');
    expect(countBranchPoints(inserted.document.root)).toBe(1);
  });

  it('inserts before a setup node', () => {
    const document = parseSgf('(;SZ[9];AB[aa];B[bb])');
    const result = insertMoveInReplaceBranch({
      document,
      path: [],
      point: 'cc',
      branchMemory: new Map(),
      state: createReplaceMoveState(document, [], new Map()),
    })!;

    expect(getNodeAtPath(result.document, [0]).data).toEqual({B: ['cc']});
    expect(getNodeAtPath(result.document, [0, 0]).data).toEqual({AB: ['aa']});
  });
});

describe('confirmReplaceMove', () => {
  it('keeps ordinary setup nodes', () => {
    const document = parseSgf('(;SZ[9];B[aa];W[bb];AB[aa]AW[bb];B[cc])');
    const result = confirmReplaceMove({
      document,
      path: [],
      state: {originalPath: [], replacementPath: [], replacementStartPath: []},
    })!;

    expect(result.document).toBe(document);
  });

  it('keeps a camera setup when insertion did not start from that selected snapshot', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];AB[bb]ZA[camera];W[cc])');
    const inserted = insertMoveInReplaceBranch({
      document,
      path: [0],
      point: 'dd',
      branchMemory,
      state: createReplaceMoveState(document, [0], branchMemory),
    })!;
    const result = confirmReplaceMove({document: inserted.document, path: inserted.path, state: inserted.state})!;

    expect(result.document).toBe(inserted.document);
    expect(getNodeAtPath(result.document, [0, 0, 0]).data.ZA).toEqual(['camera']);
  });

  it('removes the camera setup when insertion started from that selected snapshot', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];AB[bb]ZA[camera];W[cc])');
    const inserted = insertMoveInReplaceBranch({
      document,
      path: [0],
      point: 'dd',
      branchMemory,
      state: createReplaceMoveState(document, [0], branchMemory, [0, 0]),
    })!;
    const result = confirmReplaceMove({document: inserted.document, path: inserted.path, state: inserted.state})!;

    expect(result.path).toEqual(inserted.path);
    expect(getNodeAtPath(result.document, [0, 0, 0]).data).toEqual({W: ['cc']});
    expect(getNodeAtPath(result.document, [0, 1]).data.ZA).toEqual(['camera']);
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
      replacementStartPath: [0],
    };

    const stones = replaceMoveStones(document, [0], new Map(), state);

    expect(stones.missing).toEqual(new Set());
    expect(stones.extra).toEqual(new Set(['aa']));
  });

  it('does not mark copied continuation stones as missing after an insertion', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[cc])');
    const replacement = insertMoveInReplaceBranch({
      document,
      path: [],
      point: 'dd',
      branchMemory,
      state: createReplaceMoveState(document, [], branchMemory),
    })!;

    const stones = replaceMoveStones(replacement.document, replacement.path, branchMemory, replacement.state);

    expect(Object.fromEntries(stones.past)).toEqual({});
    expect(Object.fromEntries(stones.future)).toEqual({aa: 'B', bb: 'W', cc: 'B'});
    expect(stones.missing).toEqual(new Set());
    expect(stones.extra).toEqual(new Set(['dd']));
  });

  it('marks an inserted stone that also appears in the reference continuation', () => {
    const branchMemory = new Map<string, number>();
    const document = parseSgf('(;SZ[9];B[aa];W[bb];B[dd])');
    const replacement = insertMoveInReplaceBranch({
      document,
      path: [],
      point: 'dd',
      branchMemory,
      state: createReplaceMoveState(document, [], branchMemory),
    })!;

    const stones = replaceMoveStones(replacement.document, replacement.path, branchMemory, replacement.state);

    expect(stones.missing).toEqual(new Set());
    expect(stones.extra).toEqual(new Set(['dd']));
  });

  it('shows current-only future stones and marks them as extra', () => {
    const document = parseSgf('(;SZ[9](;B[aa];W[cc];B[dd])(;B[aa];W[cc]))');
    const state: ReplaceMoveState = {
      originalPath: [1],
      replacementPath: [0],
      replacementStartPath: [0],
    };

    const stones = replaceMoveStones(document, [0], new Map(), state);

    expect(Object.fromEntries(stones.future)).toEqual({cc: 'W'});
    expect(Object.fromEntries(stones.extraFuture)).toEqual({dd: 'B'});
    expect(stones.missing).toEqual(new Set());
    expect(stones.extra).toEqual(new Set(['dd']));
  });

  it('does not mark a current stone contained in the reference setup position', () => {
    const document = parseSgf('(;SZ[9](;B[cc])(;B[aa];W[cc];AB[cc]))');
    const state: ReplaceMoveState = {
      originalPath: [1],
      replacementPath: [0],
      replacementStartPath: [0],
      referenceNextPath: [1, 0],
    };

    const stones = replaceMoveStones(document, [0], new Map(), state);

    expect(deriveBoardPosition(document, [1, 0, 0]).stones.get('cc')).toBe('B');
    expect(stones.extra.has('cc')).toBe(false);
  });
});
