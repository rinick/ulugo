import {getLine, getNodeAtPath, type SgfDocument, type SgfNode} from '@ulugo/sgf-core';

export function pathKey(path: number[]): string {
  return path.join('.');
}

export function nextRememberedPath(
  document: SgfDocument,
  path: number[],
  steps: number,
  branchMemory: Map<string, number>
): number[] {
  let next = path;
  for (let index = 0; index < steps; index += 1) {
    const node = getNodeAtPath(document, next);
    if (node.children.length === 0) break;
    const rememberedChild = branchMemory.get(pathKey(next)) ?? 0;
    next = [...next, rememberedChild < node.children.length ? rememberedChild : 0];
  }
  return next;
}

export function nextFirstChildPath(document: SgfDocument, path: number[], steps: number): number[] {
  let next = path;
  for (let index = 0; index < steps; index += 1) {
    const node = getNodeAtPath(document, next);
    if (node.children.length === 0) break;
    next = [...next, 0];
  }
  return next;
}

export function getCurrentBranchMovePaths(
  document: SgfDocument,
  selectedPath: number[],
  branchMemory: Map<string, number>
): number[][] {
  const paths: number[][] = [[]];
  let path: number[] = [];

  for (const index of selectedPath) {
    path = [...path, index];
    paths.push(path);
  }

  let node = getNodeAtPath(document, path);
  while (node.children.length > 0) {
    const rememberedChild = branchMemory.get(pathKey(path)) ?? 0;
    const nextIndex = rememberedChild < node.children.length ? rememberedChild : 0;
    path = [...path, nextIndex];
    paths.push(path);
    node = node.children[nextIndex];
  }

  return paths;
}

export function getAnalysisQueuePaths(document: SgfDocument, branchPaths: number[][]): number[][] {
  const queued = new Set<string>();
  const paths: number[][] = [];

  function addPath(nextPath: number[]): void {
    if (!isAnalysisPath(document, nextPath)) return;
    const key = pathKey(nextPath);
    if (queued.has(key)) return;
    queued.add(key);
    paths.push(nextPath);
  }

  for (const branchPath of branchPaths) addPath(branchPath);

  return paths;
}

function isAnalysisPath(document: SgfDocument, path: number[]): boolean {
  if (path.length === 0) return true;
  const node = getNodeAtPath(document, path);
  return node.data.B != null || node.data.W != null;
}

export function nodeKey(document: SgfDocument, path: number[]): string {
  return getNodeAtPath(document, path).id;
}

export function getLinePaths(path: number[]): number[][] {
  return [[], ...path.map((_, index) => path.slice(0, index + 1))];
}

export function normalizeSelectedPath(document: SgfDocument, path: number[]): number[] {
  if (path.length === 0) return [];
  if (document.root.children.length === 0) return [];

  const normalized: number[] = [];
  let node = document.root;
  for (const index of path) {
    if (node.children.length === 0) break;
    const nextIndex = Math.min(Math.max(index, 0), node.children.length - 1);
    normalized.push(nextIndex);
    node = node.children[nextIndex];
  }

  return normalized;
}

export function findCurrentStoneMovePath(
  document: SgfDocument,
  selectedPath: number[],
  point: string
): number[] | null {
  const line = getLine(document, selectedPath);
  for (let depth = Math.min(selectedPath.length, line.length - 1); depth > 0; depth -= 1) {
    if (nodeMovePoint(line[depth]) === point) return selectedPath.slice(0, depth);
  }

  return null;
}

export function findFutureMovePath(
  document: SgfDocument,
  selectedPath: number[],
  point: string,
  branchMemory: Map<string, number>
): number[] | null {
  const currentBranchPaths = futureCurrentBranchPaths(document, selectedPath, branchMemory);
  for (const nextPath of currentBranchPaths) {
    if (nodeMovePoint(getNodeAtPath(document, nextPath)) === point) return nextPath;
  }

  return findDescendantMovePath(
    getNodeAtPath(document, selectedPath),
    selectedPath,
    point,
    new Set(currentBranchPaths.map(pathKey))
  );
}

function futureCurrentBranchPaths(
  document: SgfDocument,
  selectedPath: number[],
  branchMemory: Map<string, number>
): number[][] {
  const paths: number[][] = [];
  let path = selectedPath;
  let node = getNodeAtPath(document, path);

  while (node.children.length > 0) {
    const rememberedChild = branchMemory.get(pathKey(path)) ?? 0;
    const nextIndex = rememberedChild < node.children.length ? rememberedChild : 0;
    path = [...path, nextIndex];
    paths.push(path);
    node = node.children[nextIndex];
  }

  return paths;
}

function findDescendantMovePath(
  node: SgfNode,
  path: number[],
  point: string,
  skippedPaths: Set<string>
): number[] | null {
  for (const [index, child] of node.children.entries()) {
    const childPath = [...path, index];
    const skipped = skippedPaths.has(pathKey(childPath));
    if (!skipped && nodeMovePoint(child) === point) return childPath;

    const descendantPath = findDescendantMovePath(child, childPath, point, skippedPaths);
    if (descendantPath != null) return descendantPath;
  }

  return null;
}

function nodeMovePoint(node: SgfNode): string | null {
  return node.data.B?.[0] ?? node.data.W?.[0] ?? null;
}
