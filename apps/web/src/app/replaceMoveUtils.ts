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
  originalStartPath?: number[];
  replacementStartPath?: number[];
  setupPath?: number[];
  referenceNextPath?: number[];
  setupDepth?: number;
  mode?: ReplaceMoveMode;
  preferredMode?: ReplaceMoveMode;
  createdNodeIds?: string[];
  referencesByNodeId?: Record<string, ReplaceMoveReference>;
}

export type ReplaceMoveMode = 'insert' | 'replace';

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
  return {
    originalPath: path,
    replacementPath: path,
    setupPath,
    referenceNextPath: nextPath ?? undefined,
    mode: setupPath == null ? 'replace' : 'insert',
    preferredMode: 'replace',
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
}: {
  document: SgfDocument;
  path: number[];
  point: string;
  rules?: string;
  branchMemory: Map<string, number>;
  state: ReplaceMoveState | null;
}): {document: SgfDocument; path: number[]; state: ReplaceMoveState | null} | null {
  if (state == null || !samePath(path, state.replacementPath)) return null;

  const originalNextPath =
    state.referenceNextPath ?? state.setupPath ?? nextOriginalBranchPath(document, state.originalPath, branchMemory);
  const setupBoundary = originalNextPath != null && isSetupNode(getNodeAtPath(document, originalNextPath));
  const originalMove = originalNextPath == null ? null : nodeMove(getNodeAtPath(document, originalNextPath));
  const mode = setupBoundary ? 'insert' : (state.mode ?? 'replace');
  const preferredMode = state.preferredMode ?? (state.setupPath == null ? (state.mode ?? 'replace') : 'replace');
  const insertsMove = mode === 'insert' || originalNextPath == null;
  const color = insertsMove ? deriveBoardPosition(document, path).nextColor : originalMove!.color;

  const position = deriveBoardPosition(document, path);
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
    copyOriginalNodeAndContinuation(next, nextPath, document, originalNextPath, rules, branchMemory);
  } else if (originalNextPath != null) {
    copyOriginalContinuation(next, nextPath, document, originalNextPath, rules, branchMemory);
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
      originalStartPath: state.originalStartPath ?? nextOriginalStatePath,
      replacementStartPath,
      setupPath: nextSetupPath,
      referenceNextPath: nextReferencePath ?? undefined,
      setupDepth:
        nextSetupPath != null ? (state.setupDepth ?? nextPath.length - replacementStartPath.length) : undefined,
      mode: nextSetupPath != null ? 'insert' : preferredMode,
      preferredMode,
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

export function futureReplaceMoveStones(
  document: SgfDocument,
  path: number[],
  branchMemory: Map<string, number>,
  state: ReplaceMoveState | null = null
): Map<string, SgfColor> {
  const currentStones = deriveBoardPosition(document, path).stones;
  const result = new Map<string, SgfColor>();
  let nextPath =
    state?.referenceNextPath ??
    state?.setupPath ??
    nextOriginalBranchPath(document, state?.originalPath ?? path, branchMemory);

  while (nextPath != null) {
    const node = getNodeAtPath(document, nextPath);
    if (isSetupNode(node)) {
      addFutureStones(result, currentStones, node.data.AB, 'B');
      addFutureStones(result, currentStones, node.data.AW, 'W');
      return result;
    }

    const move = nodeMove(node);
    if (move?.point && !currentStones.has(move.point) && !result.has(move.point)) {
      result.set(move.point, move.color);
    }
    nextPath = nextOriginalBranchPath(document, nextPath, branchMemory);
  }

  return result;
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
      mode: selectedReference.setupPath == null ? (state.preferredMode ?? 'replace') : 'insert',
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
    mode: setupPath == null ? (state.preferredMode ?? 'replace') : 'insert',
  };
}

export function replaceMoveForcesInsert(state: ReplaceMoveState | null): boolean {
  return state?.setupPath != null;
}

export function gtpMoveToPoint(move: string, size: number): string | null {
  const match = /^([A-Za-z])(\d+)$/.exec(move);
  if (match == null) return null;

  const x = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'.indexOf(match[1].toUpperCase());
  const y = size - Number(match[2]);
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return vertexToPoint(x, y);
}

function copyOriginalContinuation(
  targetDocument: SgfDocument,
  targetPath: number[],
  sourceDocument: SgfDocument,
  sourcePath: number[],
  rules: string | undefined,
  branchMemory: Map<string, number>
): void {
  let currentTargetPath = targetPath;
  let currentSourcePath = sourcePath;

  while (true) {
    const nextSourcePath = nextOriginalBranchPath(sourceDocument, currentSourcePath, branchMemory);
    if (nextSourcePath == null) return;

    const sourceNode = getNodeAtPath(sourceDocument, nextSourcePath);
    const move = nodeMove(sourceNode);
    if (move == null && !isSetupNode(sourceNode)) return;

    if (move != null) {
      const position = deriveBoardPosition(targetDocument, currentTargetPath);
      if (!isLegalMove(position, move.color, move.point, rules)) return;
    }

    const targetParent = getNodeAtPath(targetDocument, currentTargetPath);
    targetParent.children.push(createNode(cloneNodeData(sourceNode)));
    currentTargetPath = [...currentTargetPath, targetParent.children.length - 1];
    currentSourcePath = nextSourcePath;
  }
}

function copyOriginalNodeAndContinuation(
  targetDocument: SgfDocument,
  targetPath: number[],
  sourceDocument: SgfDocument,
  sourcePath: number[],
  rules: string | undefined,
  branchMemory: Map<string, number>
): void {
  const sourceNode = getNodeAtPath(sourceDocument, sourcePath);
  const targetParent = getNodeAtPath(targetDocument, targetPath);
  targetParent.children.push(createNode(cloneNodeData(sourceNode)));
  copyOriginalContinuation(
    targetDocument,
    [...targetPath, targetParent.children.length - 1],
    sourceDocument,
    sourcePath,
    rules,
    branchMemory
  );
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

function addFutureStones(
  result: Map<string, SgfColor>,
  currentStones: Map<string, SgfColor>,
  points: string[] | undefined,
  color: SgfColor
): void {
  for (const point of points ?? []) {
    if (!currentStones.has(point) && !result.has(point)) result.set(point, color);
  }
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
