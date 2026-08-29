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
  replacementStartPath?: number[];
  cameraSetupNodeIdToRemove?: string;
  setupPath?: number[];
  referenceNextPath?: number[];
  createdNodeIds?: string[];
  referencesByNodeId?: Record<string, ReplaceMoveReference>;
}

interface ReplaceMoveReference {
  originalPath: number[];
  setupPath?: number[];
  referenceNextPath?: number[];
  inserted?: boolean;
}

interface EditedBranchItem {
  key: string;
  data: Record<string, string[]>;
  originalNodeId: string;
  referenceNextNodeId?: string;
  setupNodeId?: string;
  inserted: boolean;
}

interface CreatedBranchItem {
  item: EditedBranchItem;
  node: SgfNode;
  path: number[];
}

const setupPropertyKeys = ['AB', 'AW', 'AE', 'PL'] as const;

export function createReplaceMoveState(
  document: SgfDocument,
  path: number[],
  branchMemory: Map<string, number>,
  cameraSetupPathToRemove?: number[]
): ReplaceMoveState {
  const nextPath = nextOriginalBranchPath(document, path, branchMemory);
  const setupPath = nextPath != null && isSetupNode(getNodeAtPath(document, nextPath)) ? nextPath : undefined;
  const cameraSetupNode =
    cameraSetupPathToRemove == null ? null : getNodeAtPath(document, cameraSetupPathToRemove);
  return {
    originalPath: path,
    replacementPath: path,
    cameraSetupNodeIdToRemove: cameraSetupNode?.data.ZA?.[0] === 'camera' ? cameraSetupNode.id : undefined,
    setupPath,
    referenceNextPath: nextPath ?? undefined,
    createdNodeIds: [],
    referencesByNodeId: {},
  };
}

export function insertMoveInReplaceBranch({
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
}): {document: SgfDocument; path: number[]; state: ReplaceMoveState} | null {
  if (state == null || !samePath(path, state.replacementPath)) return null;

  const position = deriveBoardPosition(document, path);
  if (!isLegalMove(position, position.nextColor, point, rules)) return null;

  return rebuildMoveEditBranch({
    document,
    path,
    branchMemory,
    state,
    rules,
    edit: {
      type: 'insert',
      item: branchItemFromState(document, state, '__insert__', {[position.nextColor]: [point]}, true),
    },
  });
}

export function deleteMoveInReplaceBranch({
  document,
  path,
  targetPath,
  branchMemory,
  state,
  stayAtCurrentPath = false,
}: {
  document: SgfDocument;
  path: number[];
  targetPath: number[];
  branchMemory: Map<string, number>;
  state: ReplaceMoveState | null;
  stayAtCurrentPath?: boolean;
}): {document: SgfDocument; path: number[]; state: ReplaceMoveState} | null {
  if (
    state == null ||
    targetPath.length === 0 ||
    !samePath(path, state.replacementPath) ||
    (!pathStartsWith(path, targetPath) && !pathStartsWith(targetPath, path)) ||
    nodeMove(getNodeAtPath(document, targetPath)) == null
  ) {
    return null;
  }

  return rebuildMoveEditBranch({
    document,
    path,
    branchMemory,
    state,
    edit: {type: 'delete', targetPath, stayAtCurrentPath},
  });
}

function rebuildMoveEditBranch({
  document,
  path,
  branchMemory,
  state,
  rules,
  edit,
}: {
  document: SgfDocument;
  path: number[];
  branchMemory: Map<string, number>;
  state: ReplaceMoveState;
  rules?: string;
  edit: {type: 'insert'; item: EditedBranchItem} | {type: 'delete'; targetPath: number[]; stayAtCurrentPath: boolean};
}): {document: SgfDocument; path: number[]; state: ReplaceMoveState} | null {
  const existingParentPath = state.replacementStartPath?.slice(0, -1);
  const affectedParentPath =
    edit.type === 'insert'
      ? path
      : pathStartsWith(edit.targetPath, path) && !samePath(edit.targetPath, path)
        ? path
        : edit.targetPath.slice(0, -1);
  const branchParentPath = earliestComparablePath(existingParentPath, affectedParentPath);
  if (branchParentPath == null) return null;

  const parentState = replaceMoveStateForSelection(document, branchParentPath, branchMemory, state);
  if (parentState == null) return null;

  const sourcePaths = collectEditedBranchPaths(document, branchParentPath, branchMemory, state);
  const items = sourcePaths
    .filter((sourcePath) => !isTemporaryEmptyNode(document, sourcePath, state))
    .map((sourcePath) => branchItemFromPath(document, sourcePath, branchMemory, state));
  const currentNodeId = getNodeAtPath(document, path).id;
  let selectedKey: string | null = null;

  if (edit.type === 'insert') {
    const selectedIndex = samePath(path, branchParentPath) ? -1 : items.findIndex((item) => item.key === currentNodeId);
    if (selectedIndex < -1) return null;
    items.splice(selectedIndex + 1, 0, edit.item);
    selectedKey = edit.item.key;
  } else {
    const targetNodeId = getNodeAtPath(document, edit.targetPath).id;
    const targetIndex = items.findIndex((item) => item.key === targetNodeId);
    if (targetIndex < 0) return null;
    selectedKey =
      edit.stayAtCurrentPath && currentNodeId !== targetNodeId ? currentNodeId : (items[targetIndex - 1]?.key ?? null);
    items.splice(targetIndex, 1);
  }

  const parentNodeId = getNodeAtPath(document, branchParentPath).id;
  const originalParentNodeId = getNodeAtPath(document, parentState.originalPath).id;
  const referenceNextNodeId = nodeIdAtOptionalPath(document, parentState.referenceNextPath);
  const setupNodeId = nodeIdAtOptionalPath(document, parentState.setupPath);
  const firstSourcePath = sourcePaths[0];
  const insertIndex =
    firstSourcePath?.[branchParentPath.length] ?? getNodeAtPath(document, branchParentPath).children.length;
  const next = cloneDocument(document);

  if (state.replacementStartPath != null) {
    const replacementParent = getNodeAtPath(next, state.replacementStartPath.slice(0, -1));
    replacementParent.children.splice(state.replacementStartPath.at(-1)!, 1);
  }

  const nextParentPath = findNodePath(next, parentNodeId);
  if (nextParentPath == null) return null;

  const fallbackItem = branchItemFromState(document, parentState, '__empty__', {});
  const created = createEditedBranch(
    next,
    nextParentPath,
    insertIndex,
    items.length === 0 ? [fallbackItem] : items,
    rules
  );
  if (created.length === 0) return null;

  const nextOriginalParentPath = findNodePath(next, originalParentNodeId);
  const nextReferencePath = referenceNextNodeId == null ? null : findNodePath(next, referenceNextNodeId);
  const nextSetupPath = setupNodeId == null ? null : findNodePath(next, setupNodeId);
  if (
    nextOriginalParentPath == null ||
    (referenceNextNodeId != null && nextReferencePath == null) ||
    (setupNodeId != null && nextSetupPath == null)
  ) {
    return null;
  }

  const referencesByNodeId: Record<string, ReplaceMoveReference> = {};
  for (const entry of created) {
    const originalPath = findNodePath(next, entry.item.originalNodeId);
    if (originalPath == null) return null;
    referencesByNodeId[entry.node.id] = {
      originalPath,
      referenceNextPath:
        entry.item.referenceNextNodeId == null
          ? undefined
          : (findNodePath(next, entry.item.referenceNextNodeId) ?? undefined),
      setupPath: entry.item.setupNodeId == null ? undefined : (findNodePath(next, entry.item.setupNodeId) ?? undefined),
      inserted: entry.item.inserted,
    };
  }

  const replacementStartPath = created[0].path;
  const baseState: ReplaceMoveState = {
    originalPath: nextOriginalParentPath,
    replacementPath: nextParentPath,
    replacementStartPath,
    cameraSetupNodeIdToRemove: created.find((entry) => entry.item.key === state.cameraSetupNodeIdToRemove)?.node.id,
    setupPath: nextSetupPath ?? undefined,
    referenceNextPath: nextReferencePath ?? undefined,
    createdNodeIds: created.map((entry) => entry.node.id),
    referencesByNodeId,
  };
  const selectedPath = created.find((entry) => entry.item.key === selectedKey)?.path ?? nextParentPath;
  const selectedState = samePath(selectedPath, nextParentPath)
    ? baseState
    : replaceMoveStateForSelection(next, selectedPath, branchMemory, baseState);
  if (selectedState == null) return null;

  return {document: next, path: selectedPath, state: selectedState};
}

function collectEditedBranchPaths(
  document: SgfDocument,
  parentPath: number[],
  branchMemory: Map<string, number>,
  state: ReplaceMoveState
): number[][] {
  const paths: number[][] = [];
  const replacementStartPath = state.replacementStartPath;

  if (replacementStartPath == null) {
    let currentPath = nextOriginalBranchPath(document, parentPath, branchMemory);
    while (currentPath != null) {
      paths.push(currentPath);
      currentPath = nextOriginalBranchPath(document, currentPath, branchMemory);
    }
    return paths;
  }

  for (let depth = parentPath.length + 1; depth <= replacementStartPath.length; depth += 1) {
    paths.push(replacementStartPath.slice(0, depth));
  }
  let currentPath = nextFirstChildPath(document, replacementStartPath);
  while (currentPath != null) {
    paths.push(currentPath);
    currentPath = nextFirstChildPath(document, currentPath);
  }
  return paths;
}

function branchItemFromPath(
  document: SgfDocument,
  path: number[],
  branchMemory: Map<string, number>,
  state: ReplaceMoveState
): EditedBranchItem {
  const selectedState = replaceMoveStateForSelection(document, path, branchMemory, state);
  const originalPath = selectedState?.originalPath ?? path;
  const referenceNextPath =
    selectedState?.referenceNextPath ?? nextOriginalBranchPath(document, originalPath, branchMemory);
  return {
    key: getNodeAtPath(document, path).id,
    data: cloneNodeData(getNodeAtPath(document, path)),
    originalNodeId: getNodeAtPath(document, originalPath).id,
    referenceNextNodeId: nodeIdAtOptionalPath(document, referenceNextPath),
    setupNodeId: nodeIdAtOptionalPath(document, selectedState?.setupPath),
    inserted: state.referencesByNodeId?.[getNodeAtPath(document, path).id]?.inserted === true,
  };
}

function branchItemFromState(
  document: SgfDocument,
  state: ReplaceMoveState,
  key: string,
  data: Record<string, string[]>,
  inserted = false
): EditedBranchItem {
  return {
    key,
    data,
    originalNodeId: getNodeAtPath(document, state.originalPath).id,
    referenceNextNodeId: nodeIdAtOptionalPath(document, state.referenceNextPath),
    setupNodeId: nodeIdAtOptionalPath(document, state.setupPath),
    inserted,
  };
}

function createEditedBranch(
  document: SgfDocument,
  parentPath: number[],
  insertIndex: number,
  items: EditedBranchItem[],
  rules?: string
): CreatedBranchItem[] {
  const created: CreatedBranchItem[] = [];
  let previousMoveWasConvertedPass = false;

  for (const item of items) {
    let data = Object.fromEntries(Object.entries(item.data).map(([key, values]) => [key, [...values]]));
    const move = moveFromData(data);
    let convertedPass = false;
    if (move?.point) {
      const currentParentPath = created.at(-1)?.path ?? parentPath;
      const position = deriveBoardPosition(document, currentParentPath);
      if (!isLegalMove(position, move.color, move.point, rules)) {
        if (!position.stones.has(move.point)) break;
        data = {...data, [move.color]: ['']};
        convertedPass = true;
      }
    }

    if (convertedPass && previousMoveWasConvertedPass) {
      const previous = created.pop();
      if (previous != null) {
        getNodeAtPath(document, previous.path.slice(0, -1)).children.splice(previous.path.at(-1)!, 1);
      }
      previousMoveWasConvertedPass = false;
      continue;
    }

    const node = createNode(data);
    const currentParentPath = created.at(-1)?.path ?? parentPath;
    const parent = getNodeAtPath(document, currentParentPath);
    const childIndex = created.length === 0 ? insertIndex : parent.children.length;
    parent.children.splice(childIndex, 0, node);
    created.push({item, node, path: [...currentParentPath, childIndex]});
    previousMoveWasConvertedPass = convertedPass;
  }

  return created;
}

function earliestComparablePath(left: number[] | undefined, right: number[]): number[] | null {
  if (left == null) return right;
  if (pathStartsWith(left, right)) return right;
  if (pathStartsWith(right, left)) return left;
  return null;
}

function isTemporaryEmptyNode(document: SgfDocument, path: number[], state: ReplaceMoveState): boolean {
  const node = getNodeAtPath(document, path);
  return (
    Object.keys(node.data).length === 0 &&
    node.children.length === 0 &&
    (state.createdNodeIds?.includes(node.id) ?? false)
  );
}

function nodeIdAtOptionalPath(document: SgfDocument, path: number[] | null | undefined): string | undefined {
  return path == null ? undefined : getNodeAtPath(document, path).id;
}

function moveFromData(data: Record<string, string[]>): {color: SgfColor; point: string} | null {
  const color: SgfColor | null = data.B != null ? 'B' : data.W != null ? 'W' : null;
  return color == null ? null : {color, point: data[color]?.[0] ?? ''};
}

export function confirmReplaceMove({
  document,
  path,
  state,
}: {
  document: SgfDocument;
  path: number[];
  state: ReplaceMoveState | null;
}): {document: SgfDocument; path: number[]} | null {
  if (state?.replacementStartPath == null || !samePath(path, state.replacementPath)) return null;
  if (state.cameraSetupNodeIdToRemove == null) return {document, path};

  const setupPath = findNodePath(document, state.cameraSetupNodeIdToRemove);
  if (setupPath == null || getNodeAtPath(document, setupPath).data.ZA?.[0] !== 'camera') return {document, path};
  return {
    document: deleteNodeKeepingChildren(document, setupPath),
    path: pathAfterDeletingNodeKeepingChildren(document, path, setupPath),
  };
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

  let editedPath = state?.replacementStartPath ?? null;
  while (editedPath != null) {
    const node = getNodeAtPath(document, editedPath);
    const move = nodeMove(node);
    if (state?.referencesByNodeId?.[node.id]?.inserted === true && move?.point) {
      extra.add(move.point);
      if (!currentStones.has(move.point) && currentContinuation.get(move.point) === move.color) {
        extraFuture.set(move.point, move.color);
      }
    }
    editedPath = nextFirstChildPath(document, editedPath);
  }

  return {past, future, extraFuture, missing, extra};
}

export function replaceMoveStateForSelection(
  document: SgfDocument,
  path: number[],
  branchMemory: Map<string, number>,
  state: ReplaceMoveState | null
): ReplaceMoveState | null {
  if (state == null) return null;
  if (samePath(path, state.replacementPath)) return state;
  if (state.replacementStartPath == null) {
    if (
      !pathStartsWith(state.originalPath, path) &&
      (!pathStartsWith(path, state.originalPath) ||
        !pathFollowsOriginalBranch(document, state.originalPath, path, branchMemory))
    ) {
      return null;
    }
    return {
      ...createReplaceMoveState(document, path, branchMemory),
      cameraSetupNodeIdToRemove: state.cameraSetupNodeIdToRemove,
    };
  }
  if (path.length < state.replacementStartPath.length && pathStartsWith(state.replacementStartPath, path)) {
    const replacementRootReference =
      path.length + 1 === state.replacementStartPath.length
        ? state.referencesByNodeId?.[getNodeAtPath(document, state.replacementStartPath).id]
        : undefined;
    const referenceNextPath =
      replacementRootReference == null
        ? state.replacementStartPath.slice(0, path.length + 1)
        : samePath(replacementRootReference.originalPath, path)
          ? replacementRootReference.referenceNextPath
          : replacementRootReference.originalPath;
    return {
      ...state,
      originalPath: path,
      replacementPath: path,
      setupPath:
        referenceNextPath != null && isSetupNode(getNodeAtPath(document, referenceNextPath))
          ? referenceNextPath
          : undefined,
      referenceNextPath,
    };
  }
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

  return null;
}

function pathFollowsOriginalBranch(
  document: SgfDocument,
  startPath: number[],
  targetPath: number[],
  branchMemory: Map<string, number>
): boolean {
  let currentPath = startPath;
  while (currentPath.length < targetPath.length) {
    const nextPath = nextOriginalBranchPath(document, currentPath, branchMemory);
    if (nextPath == null || !pathStartsWith(targetPath, nextPath)) return false;
    currentPath = nextPath;
  }
  return samePath(currentPath, targetPath);
}

export function gtpMoveToPoint(move: string, size: number): string | null {
  const match = /^([A-Za-z])(\d+)$/.exec(move);
  if (match == null) return null;

  const x = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'.indexOf(match[1].toUpperCase());
  const y = size - Number(match[2]);
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return vertexToPoint(x, y);
}

function findNodePath(document: SgfDocument, nodeId: string): number[] | null {
  const visit = (node: SgfNode, path: number[]): number[] | null => {
    if (node.id === nodeId) return path;
    for (let index = 0; index < node.children.length; index += 1) {
      const result = visit(node.children[index], [...path, index]);
      if (result != null) return result;
    }
    return null;
  };

  return visit(document.root, []);
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

function pathAfterDeletingNodeKeepingChildren(
  document: SgfDocument,
  selectedPath: number[],
  deletedPath: number[]
): number[] {
  const parentPath = deletedPath.slice(0, -1);
  if (!samePath(selectedPath.slice(0, parentPath.length), parentPath)) return selectedPath;
  if (selectedPath.length <= parentPath.length) return selectedPath;

  const deletedIndex = deletedPath.at(-1)!;
  const selectedIndex = selectedPath[parentPath.length];
  const childCount = getNodeAtPath(document, deletedPath).children.length;
  if (selectedIndex < deletedIndex) return selectedPath;
  if (selectedIndex > deletedIndex) {
    const nextPath = [...selectedPath];
    nextPath[parentPath.length] += childCount - 1;
    return nextPath;
  }
  if (selectedPath.length === deletedPath.length) return parentPath;

  return [
    ...parentPath,
    deletedIndex + selectedPath[deletedPath.length],
    ...selectedPath.slice(deletedPath.length + 1),
  ];
}
