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

  const originalNextPath = nextOriginalBranchPath(document, state.originalPath, branchMemory);
  const originalMove = originalNextPath == null ? null : nodeMove(getNodeAtPath(document, originalNextPath));
  const color = originalMove?.color ?? deriveBoardPosition(document, path).nextColor;

  const position = deriveBoardPosition(document, path);
  if (!isLegalMove(position, color, point, rules)) return null;

  const next = cloneDocument(document);
  const parent = getNodeAtPath(next, path);
  const replacesOriginalBranch = samePath(path, state.originalPath);
  if (!replacesOriginalBranch) parent.children = [];

  const child = createNode({[color]: [point]});
  const insertIndex = replacesOriginalBranch && originalNextPath != null ? originalNextPath[originalNextPath.length - 1] : 0;
  parent.children.splice(insertIndex, 0, child);
  const nextPath = [...path, insertIndex];
  const nextOriginalPath = originalNextPath == null ? null : replacesOriginalBranch ? [...path, insertIndex + 1] : originalNextPath;

  if (originalNextPath != null) copyOriginalContinuation(next, nextPath, document, originalNextPath, rules, branchMemory);

  return {
    document: next,
    path: nextPath,
    state:
      nextOriginalPath == null
        ? null
        : {
            originalPath: nextOriginalPath,
            replacementPath: nextPath,
            originalStartPath: state.originalStartPath ?? nextOriginalPath,
            replacementStartPath: state.replacementStartPath ?? nextPath,
          },
  };
}

export function replaceMoveStateForSelection(
  document: SgfDocument,
  path: number[],
  branchMemory: Map<string, number>,
  state: ReplaceMoveState | null
): ReplaceMoveState | null {
  if (state?.originalStartPath == null || state.replacementStartPath == null) return null;
  if (!pathStartsWith(path, state.replacementStartPath)) return null;

  let originalPath = state.originalStartPath;
  const suffix = path.slice(state.replacementStartPath.length);
  if (suffix.some((index) => index !== 0)) return null;

  for (let index = 0; index < suffix.length; index += 1) {
    const nextOriginalPath = nextOriginalBranchPath(document, originalPath, branchMemory);
    if (nextOriginalPath == null) return null;
    originalPath = nextOriginalPath;
  }

  return {...state, originalPath, replacementPath: path};
}

export function hasReplaceableContinuation(
  document: SgfDocument,
  path: number[],
  branchMemory: Map<string, number>
): boolean {
  const nextPath = nextOriginalBranchPath(document, path, branchMemory);
  return nextPath != null && nextOriginalBranchPath(document, nextPath, branchMemory) != null;
}

export function canPlaceReplacementMove(
  path: number[],
  state: ReplaceMoveState | null
): boolean {
  if (state == null || !samePath(path, state.replacementPath)) return false;
  return state.originalStartPath != null && state.replacementStartPath != null;
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
    if (move == null) return;

    const position = deriveBoardPosition(targetDocument, currentTargetPath);
    if (!isLegalMove(position, move.color, move.point, rules)) return;

    const targetParent = getNodeAtPath(targetDocument, currentTargetPath);
    targetParent.children.push(createNode(cloneNodeData(sourceNode)));
    currentTargetPath = [...currentTargetPath, targetParent.children.length - 1];
    currentSourcePath = nextSourcePath;
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

function pathStartsWith(path: number[], prefix: number[]): boolean {
  return prefix.length <= path.length && prefix.every((index, offset) => path[offset] === index);
}

function nodeMove(node: SgfNode): {color: SgfColor; point: string} | null {
  const color: SgfColor | null = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
  return color == null ? null : {color, point: node.data[color]?.[0] ?? ''};
}

function cloneNodeData(node: SgfNode): Record<string, string[]> {
  return Object.fromEntries(Object.entries(node.data).map(([key, values]) => [key, [...values]]));
}
