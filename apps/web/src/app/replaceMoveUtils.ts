import {deriveBoardPosition, isLegalMove} from '@ulugo/go-core';
import {
  cloneDocument,
  createNode,
  getNodeAtPath,
  samePath,
  vertexToPoint,
  type SgfColor,
  type SgfDocument,
  type SgfNode,
} from '@ulugo/sgf-core';
import {pathKey} from './sgfPathUtils';

export interface ReplaceMoveState {
  originalPath: number[];
  replacementPath: number[];
  referenceMoves?: ReplaceMoveSequenceItem[];
  referenceHasSetup?: boolean;
  originalStartPath?: number[];
  replacementStartPath?: number[];
  setupPath?: number[];
  referenceNextPath?: number[];
  setupDepth?: number;
  createdNodeIds?: string[];
  referencesByNodeId?: Record<string, ReplaceMoveReference>;
}

interface ReplaceMoveSequenceItem {
  color: SgfColor;
  point: string;
}

interface ReplaceMoveReference {
  originalPath: number[];
  setupPath?: number[];
  referenceNextPath?: number[];
}

const setupPropertyKeys = ['AB', 'AW', 'AE', 'PL'] as const;

export function createReplaceMoveState(
  document: SgfDocument,
  path: number[],
  branchMemory: Map<string, number>
): ReplaceMoveState {
  const nextPath = nextOriginalBranchPath(document, path, branchMemory);
  const setupPath = nextPath != null && isSetupNode(getNodeAtPath(document, nextPath)) ? nextPath : undefined;
  const referenceSequence = collectMoveSequence(document, nextPath, (currentPath) =>
    nextOriginalBranchPath(document, currentPath, branchMemory)
  );
  return {
    originalPath: path,
    replacementPath: path,
    referenceMoves: referenceSequence.moves,
    referenceHasSetup: referenceSequence.hasSetup,
    setupPath,
    referenceNextPath: nextPath ?? undefined,
    createdNodeIds: [],
    referencesByNodeId: {},
  };
}

export function replaceNextMoveBranch({
  document,
  path,
  point,
  rules,
  branchMemory,
  state,
  insert = false,
}: {
  document: SgfDocument;
  path: number[];
  point: string;
  rules?: string;
  branchMemory: Map<string, number>;
  state: ReplaceMoveState | null;
  insert?: boolean;
}): {document: SgfDocument; path: number[]; state: ReplaceMoveState | null} | null {
  if (state == null || !samePath(path, state.replacementPath)) return null;

  const originalNextPath =
    state.referenceNextPath ?? state.setupPath ?? nextOriginalBranchPath(document, state.originalPath, branchMemory);
  const setupBoundary = originalNextPath != null && isSetupNode(getNodeAtPath(document, originalNextPath));
  const originalMove = originalNextPath == null ? null : nodeMove(getNodeAtPath(document, originalNextPath));
  const referenceSequence = collectMoveSequence(document, originalNextPath, (currentPath) =>
    nextOriginalBranchPath(document, currentPath, branchMemory)
  );
  const referenceMoves = state.referenceMoves ?? referenceSequence.moves;
  const referenceHasSetup = state.referenceHasSetup ?? referenceSequence.hasSetup;
  const insertsMove = insert || setupBoundary || originalNextPath == null;
  const position = deriveBoardPosition(document, path);
  const color = insertsMove ? position.nextColor : originalMove!.color;
  if (!isLegalMove(position, color, point, rules)) return null;

  const next = cloneDocument(document);
  const parent = getNodeAtPath(next, path);
  const replacesOriginalBranch = samePath(path, state.originalPath);
  if (!replacesOriginalBranch) parent.children = [];

  const child = createNode({[color]: [point]});
  const insertIndex =
    replacesOriginalBranch && originalNextPath != null ? originalNextPath[originalNextPath.length - 1] : 0;
  parent.children.splice(insertIndex, 0, child);
  const nextPath = [...path, insertIndex];

  if (insertsMove && originalNextPath != null) {
    copyOriginalBranch(next, nextPath, document, originalNextPath, true, rules, branchMemory);
  } else if (originalNextPath != null) {
    copyOriginalBranch(next, nextPath, document, originalNextPath, false, rules, branchMemory);
  }

  const adjustedOriginalNextPath =
    originalNextPath == null ? null : replacesOriginalBranch ? [...path, insertIndex + 1] : originalNextPath;
  const followingOriginalPath =
    !insertsMove && adjustedOriginalNextPath != null
      ? nextOriginalBranchPath(next, adjustedOriginalNextPath, branchMemory)
      : null;
  const nextReferencePath = insertsMove ? adjustedOriginalNextPath : followingOriginalPath;
  const nextSetupPath =
    nextReferencePath != null && isSetupNode(getNodeAtPath(next, nextReferencePath)) ? nextReferencePath : undefined;
  const replacementStartPath = state.replacementStartPath ?? nextPath;
  const nextOriginalStatePath = insertsMove ? state.originalPath : (adjustedOriginalNextPath ?? state.originalPath);
  const nextReference = {
    originalPath: nextOriginalStatePath,
    setupPath: nextSetupPath,
    referenceNextPath: nextReferencePath ?? undefined,
  };

  return {
    document: next,
    path: nextPath,
    state: {
      originalPath: nextOriginalStatePath,
      replacementPath: nextPath,
      referenceMoves,
      referenceHasSetup,
      originalStartPath: state.originalStartPath ?? nextOriginalStatePath,
      replacementStartPath,
      setupPath: nextSetupPath,
      referenceNextPath: nextReferencePath ?? undefined,
      setupDepth:
        nextSetupPath != null ? (state.setupDepth ?? nextPath.length - replacementStartPath.length) : undefined,
      createdNodeIds: [...(state.createdNodeIds ?? []), child.id],
      referencesByNodeId: {...state.referencesByNodeId, [child.id]: nextReference},
    },
  };
}

export function confirmReplaceMove({
  document,
  path,
  branchMemory,
  state,
}: {
  document: SgfDocument;
  path: number[];
  branchMemory: Map<string, number>;
  state: ReplaceMoveState | null;
}): {document: SgfDocument; path: number[]} | null {
  if (state?.replacementStartPath == null || !samePath(path, state.replacementPath)) return null;

  let setupPath = nextOriginalBranchPath(document, path, branchMemory);
  if (setupPath != null && isSetupNode(getNodeAtPath(document, setupPath))) {
    return {document: deleteNodeKeepingChildren(document, setupPath), path};
  }

  while (setupPath != null) {
    setupPath = nextOriginalBranchPath(document, setupPath, branchMemory);
    if (setupPath == null) return {document, path};
    if (!isSetupNode(getNodeAtPath(document, setupPath))) continue;
    return {
      document: isRedundantSetupNode(document, setupPath) ? deleteNodeKeepingChildren(document, setupPath) : document,
      path,
    };
  }

  return {document, path};
}

export function insertEmptyMoveZeroBeforeRootSetup(document: SgfDocument): SgfDocument | null {
  if (!hasNonEmptyRootSetup(document)) return null;

  const next = cloneDocument(document);
  // Keep the setup node and its descendants' ids because their board positions, and cached analyses, stay valid.
  const setupNode = next.root;
  const rootData = cloneNodeData(setupNode);
  const setupData: Record<string, string[]> = {};

  for (const key of setupPropertyKeys) {
    if (setupNode.data[key] != null) setupData[key] = [...setupNode.data[key]];
    delete rootData[key];
  }

  setupNode.data = setupData;
  next.root = createNode(rootData, [setupNode]);
  return next;
}

export function hasNonEmptyRootSetup(document: SgfDocument): boolean {
  return isSetupNode(document.root) && deriveBoardPosition(document, []).stones.size > 0;
}

export function deleteReplaceMove(
  document: SgfDocument,
  path: number[]
): {document: SgfDocument; path: number[]; removedNodeIds: string[]} | null {
  if (path.length === 0) return null;

  const next = cloneDocument(document);
  const parentPath = path.slice(0, -1);
  const parent = getNodeAtPath(next, parentPath);
  const index = path[path.length - 1];
  const node = parent.children[index];
  if (node == null) return null;

  parent.children.splice(index, 1, ...node.children.map(cloneNodeWithNewIds));
  return {document: next, path: parentPath, removedNodeIds: collectNodeIds(node)};
}

export function replaceMoveStones(
  document: SgfDocument,
  path: number[],
  branchMemory: Map<string, number>,
  state: ReplaceMoveState | null = null,
  currentPositionStones?: ReadonlyMap<string, SgfColor>
): {
  past: Map<string, SgfColor>;
  future: Map<string, SgfColor>;
  extraFuture: Map<string, SgfColor>;
  missing: Set<string>;
  extra: Set<string>;
} {
  const currentStones = currentPositionStones ?? deriveBoardPosition(document, path).stones;
  const referencePath = state?.originalPath ?? path;
  const referenceStones = samePath(referencePath, path)
    ? currentStones
    : deriveBoardPosition(document, referencePath).stones;
  const past = new Map<string, SgfColor>();
  const future = new Map<string, SgfColor>();

  for (const [point, color] of referenceStones) {
    if (!currentStones.has(point)) past.set(point, color);
  }

  const referenceNextPath =
    state?.referenceNextPath ?? state?.setupPath ?? nextOriginalBranchPath(document, referencePath, branchMemory);
  const referenceContinuationResult = collectContinuationStones(document, referenceNextPath, (currentPath) =>
    nextOriginalBranchPath(document, currentPath, branchMemory)
  );
  const referenceContinuation = referenceContinuationResult.stones;

  for (const [point, color] of referenceContinuation) {
    if (!currentStones.has(point) && !past.has(point)) future.set(point, color);
  }

  const currentContinuationResult =
    state?.replacementStartPath == null
      ? referenceContinuationResult
      : collectContinuationStones(document, nextFirstChildPath(document, path), (currentPath) =>
          nextFirstChildPath(document, currentPath)
        );
  const currentContinuation = currentContinuationResult.stones;
  const referenceBranchStones = collectStoneKeys(
    referenceStones,
    referenceContinuation,
    referenceContinuationResult.setupPosition
  );
  const currentBranchStones = collectStoneKeys(
    currentStones,
    currentContinuation,
    currentContinuationResult.setupPosition
  );
  const extraFuture = new Map<string, SgfColor>();
  const missing = new Set<string>();
  const extra = new Set<string>();

  for (const [point, color] of currentContinuation) {
    if (!currentStones.has(point) && !referenceBranchStones.has(stoneKey(point, color))) {
      extraFuture.set(point, color);
    }
  }
  for (const [point, color] of [...past, ...future]) {
    if (!currentBranchStones.has(stoneKey(point, color))) missing.add(point);
  }
  for (const [point, color] of currentStones) {
    if (!referenceBranchStones.has(stoneKey(point, color))) extra.add(point);
  }
  for (const point of extraFuture.keys()) extra.add(point);

  if (state?.replacementStartPath != null && state.referenceMoves != null && state.referenceHasSetup !== true) {
    const currentMoves = collectMoveSequence(document, state.replacementStartPath, (currentPath) =>
      nextFirstChildPath(document, currentPath)
    ).moves;
    const unchangedCurrentIndexes = longestCommonMoveSubsequence(state.referenceMoves, currentMoves);

    currentMoves.forEach((move, index) => {
      if (unchangedCurrentIndexes.has(index)) return;
      extra.add(move.point);
      if (!currentStones.has(move.point) && currentContinuation.get(move.point) === move.color) {
        extraFuture.set(move.point, move.color);
      }
    });
  }

  return {past, future, extraFuture, missing, extra};
}

export function replaceMoveStateForSelection(
  document: SgfDocument,
  path: number[],
  branchMemory: Map<string, number>,
  state: ReplaceMoveState | null
): ReplaceMoveState | null {
  if (state?.originalStartPath == null || state.replacementStartPath == null) return null;
  if (!pathStartsWith(path, state.replacementStartPath)) return null;

  const selectedReference = state.referencesByNodeId?.[getNodeAtPath(document, path).id];
  if (selectedReference != null) {
    return {
      ...state,
      originalPath: selectedReference.originalPath,
      replacementPath: path,
      setupPath: selectedReference.setupPath,
      referenceNextPath: selectedReference.referenceNextPath,
    };
  }

  let originalPath = state.originalStartPath;
  let setupPath: number[] | undefined;
  const suffix = path.slice(state.replacementStartPath.length);
  if (suffix.some((index) => index !== 0)) return null;
  if (nodeMove(getNodeAtPath(document, path)) == null) return null;

  for (let index = 0; index < suffix.length; index += 1) {
    const nextOriginalPath = nextOriginalBranchPath(document, originalPath, branchMemory);
    if (nextOriginalPath == null) return null;
    if (isSetupNode(getNodeAtPath(document, nextOriginalPath))) {
      setupPath = state.setupPath ?? nextOriginalPath;
      break;
    } else {
      originalPath = nextOriginalPath;
    }
  }

  if (state.setupDepth != null && suffix.length >= state.setupDepth) setupPath = state.setupPath;

  const referenceNextPath = setupPath ?? nextOriginalBranchPath(document, originalPath, branchMemory) ?? undefined;
  return {
    ...state,
    originalPath,
    replacementPath: path,
    setupPath,
    referenceNextPath,
  };
}

export function gtpMoveToPoint(move: string, size: number): string | null {
  const match = /^([A-Za-z])(\d+)$/.exec(move);
  if (match == null) return null;

  const x = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'.indexOf(match[1].toUpperCase());
  const y = size - Number(match[2]);
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return vertexToPoint(x, y);
}

function copyOriginalBranch(
  targetDocument: SgfDocument,
  targetPath: number[],
  sourceDocument: SgfDocument,
  sourcePath: number[],
  includeSourceNode: boolean,
  rules: string | undefined,
  branchMemory: Map<string, number>
): void {
  let currentTargetPath = targetPath;
  let currentSourcePath = sourcePath;
  let useCurrentSourcePath = includeSourceNode;
  let previousMoveWasConvertedPass = false;

  while (true) {
    const nextSourcePath = useCurrentSourcePath
      ? currentSourcePath
      : nextOriginalBranchPath(sourceDocument, currentSourcePath, branchMemory);
    if (nextSourcePath == null) return;
    useCurrentSourcePath = false;

    const sourceNode = getNodeAtPath(sourceDocument, nextSourcePath);
    const move = nodeMove(sourceNode);
    if (move == null && !isSetupNode(sourceNode)) return;

    let nodeData = cloneNodeData(sourceNode);
    let convertedPass = false;
    if (move?.point) {
      const position = deriveBoardPosition(targetDocument, currentTargetPath);
      if (!isLegalMove(position, move.color, move.point, rules)) {
        if (!position.stones.has(move.point)) return;
        nodeData = {...nodeData, [move.color]: ['']};
        convertedPass = true;
      }
    }

    if (convertedPass && previousMoveWasConvertedPass) {
      const previousPath = currentTargetPath;
      currentTargetPath = previousPath.slice(0, -1);
      getNodeAtPath(targetDocument, currentTargetPath).children.splice(previousPath.at(-1)!, 1);
      previousMoveWasConvertedPass = false;
      currentSourcePath = nextSourcePath;
      continue;
    }

    const targetParent = getNodeAtPath(targetDocument, currentTargetPath);
    targetParent.children.push(createNode(nodeData));
    currentTargetPath = [...currentTargetPath, targetParent.children.length - 1];
    currentSourcePath = nextSourcePath;
    previousMoveWasConvertedPass = convertedPass;
  }
}

function nextOriginalBranchPath(
  document: SgfDocument,
  path: number[],
  branchMemory: Map<string, number>
): number[] | null {
  const node = getNodeAtPath(document, path);
  if (node.children.length === 0) return null;

  const remembered = branchMemory.get(pathKey(path)) ?? 0;
  const childIndex = node.children[remembered] == null ? 0 : remembered;
  return [...path, childIndex];
}

function nextFirstChildPath(document: SgfDocument, path: number[]): number[] | null {
  return getNodeAtPath(document, path).children.length === 0 ? null : [...path, 0];
}

function collectMoveSequence(
  document: SgfDocument,
  startPath: number[] | null | undefined,
  nextPath: (path: number[]) => number[] | null
): {moves: ReplaceMoveSequenceItem[]; hasSetup: boolean} {
  const moves: ReplaceMoveSequenceItem[] = [];
  let path = startPath;

  while (path != null) {
    const node = getNodeAtPath(document, path);
    if (isSetupNode(node)) return {moves, hasSetup: true};

    const move = nodeMove(node);
    if (move?.point) moves.push(move);
    path = nextPath(path);
  }

  return {moves, hasSetup: false};
}

function longestCommonMoveSubsequence(
  referenceMoves: ReplaceMoveSequenceItem[],
  currentMoves: ReplaceMoveSequenceItem[]
): Set<number> {
  const width = currentMoves.length + 1;
  const cellCount = (referenceMoves.length + 1) * width;
  const lengths = new Uint32Array(cellCount);
  const displacement = new Float64Array(cellCount);
  const decisions = new Uint8Array(cellCount);

  for (let referenceIndex = referenceMoves.length - 1; referenceIndex >= 0; referenceIndex -= 1) {
    for (let currentIndex = currentMoves.length - 1; currentIndex >= 0; currentIndex -= 1) {
      const index = referenceIndex * width + currentIndex;
      const skipReferenceIndex = index + width;
      const skipCurrentIndex = index + 1;
      let bestLength = lengths[skipReferenceIndex];
      let bestDisplacement = displacement[skipReferenceIndex];
      let bestDecision = 1;

      if (
        isBetterMoveAlignment(
          lengths[skipCurrentIndex],
          displacement[skipCurrentIndex],
          2,
          bestLength,
          bestDisplacement,
          bestDecision
        )
      ) {
        bestLength = lengths[skipCurrentIndex];
        bestDisplacement = displacement[skipCurrentIndex];
        bestDecision = 2;
      }

      if (sameMove(referenceMoves[referenceIndex], currentMoves[currentIndex])) {
        const nextIndex = skipReferenceIndex + 1;
        const matchLength = lengths[nextIndex] + 1;
        const matchDisplacement = displacement[nextIndex] + Math.abs(referenceIndex - currentIndex);
        if (isBetterMoveAlignment(matchLength, matchDisplacement, 3, bestLength, bestDisplacement, bestDecision)) {
          bestLength = matchLength;
          bestDisplacement = matchDisplacement;
          bestDecision = 3;
        }
      }

      lengths[index] = bestLength;
      displacement[index] = bestDisplacement;
      decisions[index] = bestDecision;
    }
  }

  const unchangedCurrentIndexes = new Set<number>();
  let referenceIndex = 0;
  let currentIndex = 0;
  while (referenceIndex < referenceMoves.length && currentIndex < currentMoves.length) {
    const decision = decisions[referenceIndex * width + currentIndex];
    if (decision === 3) {
      unchangedCurrentIndexes.add(currentIndex);
      referenceIndex += 1;
      currentIndex += 1;
    } else if (decision === 2) {
      currentIndex += 1;
    } else {
      referenceIndex += 1;
    }
  }

  return unchangedCurrentIndexes;
}

function isBetterMoveAlignment(
  length: number,
  displacement: number,
  decision: number,
  bestLength: number,
  bestDisplacement: number,
  bestDecision: number
): boolean {
  if (length !== bestLength) return length > bestLength;
  if (displacement !== bestDisplacement) return displacement < bestDisplacement;
  return decision > bestDecision;
}

function sameMove(left: ReplaceMoveSequenceItem, right: ReplaceMoveSequenceItem): boolean {
  return left.color === right.color && left.point === right.point;
}

function collectContinuationStones(
  document: SgfDocument,
  startPath: number[] | null | undefined,
  nextPath: (path: number[]) => number[] | null
): {stones: Map<string, SgfColor>; setupPosition: ReadonlyMap<string, SgfColor> | null} {
  const stones = new Map<string, SgfColor>();
  let path = startPath;

  while (path != null) {
    const node = getNodeAtPath(document, path);
    if (isSetupNode(node)) {
      const beforeSetup = deriveBoardPosition(document, path.slice(0, -1)).stones;
      const setupPosition = deriveBoardPosition(document, path).stones;
      for (const [point, color] of setupPosition) {
        if (beforeSetup.get(point) !== color && !stones.has(point)) stones.set(point, color);
      }
      return {stones, setupPosition};
    }

    const move = nodeMove(node);
    if (move?.point && !stones.has(move.point)) stones.set(move.point, move.color);
    path = nextPath(path);
  }

  return {stones, setupPosition: null};
}

function collectStoneKeys(...stoneMaps: Array<ReadonlyMap<string, SgfColor> | null>): Set<string> {
  const keys = new Set<string>();
  for (const stones of stoneMaps) {
    for (const [point, color] of stones ?? []) keys.add(stoneKey(point, color));
  }
  return keys;
}

function stoneKey(point: string, color: SgfColor): string {
  return `${color}:${point}`;
}

function pathStartsWith(path: number[], prefix: number[]): boolean {
  return prefix.length <= path.length && prefix.every((index, offset) => path[offset] === index);
}

function nodeMove(node: SgfNode): {color: SgfColor; point: string} | null {
  const color: SgfColor | null = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
  return color == null ? null : {color, point: node.data[color]?.[0] ?? ''};
}

export function isSetupNode(node: SgfNode): boolean {
  return (
    node.data.B == null && node.data.W == null && setupPropertyKeys.some((key) => (node.data[key]?.length ?? 0) > 0)
  );
}

function cloneNodeData(node: SgfNode): Record<string, string[]> {
  return Object.fromEntries(Object.entries(node.data).map(([key, values]) => [key, [...values]]));
}

function cloneNodeWithNewIds(node: SgfNode): SgfNode {
  return createNode(cloneNodeData(node), node.children.map(cloneNodeWithNewIds));
}

function deleteNodeKeepingChildren(document: SgfDocument, path: number[]): SgfDocument {
  const next = cloneDocument(document);
  const parent = getNodeAtPath(next, path.slice(0, -1));
  const index = path[path.length - 1];
  const node = parent.children[index];
  if (node == null) return document;
  parent.children.splice(index, 1, ...node.children.map(cloneNodeWithNewIds));
  return next;
}

function isRedundantSetupNode(document: SgfDocument, path: number[]): boolean {
  const node = getNodeAtPath(document, path);
  const before = deriveBoardPosition(document, path.slice(0, -1));

  for (const point of node.data.AE ?? []) {
    if (before.stones.has(point)) return false;
  }
  for (const point of node.data.AB ?? []) {
    if (before.stones.get(point) !== 'B') return false;
  }
  for (const point of node.data.AW ?? []) {
    if (before.stones.get(point) !== 'W') return false;
  }

  return deriveBoardPosition(document, path).nextColor === before.nextColor;
}

function collectNodeIds(node: SgfNode): string[] {
  return [node.id, ...node.children.flatMap(collectNodeIds)];
}
