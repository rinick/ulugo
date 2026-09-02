import {
  applySgfNode,
  cloneReplayState,
  createReplayState,
  oppositeStone,
  ruleProfile,
  type ReplayState,
} from '@ulugo/go-core';
import {
  formatPoint,
  getBoardSize,
  isPointOnBoard,
  isScoringNode,
  normalizeMovePoint,
  type SgfColor,
  type SgfDocument,
  type SgfNode,
  type SgfPoint,
} from '@ulugo/sgf-core';

export interface TreeItem {
  id: string;
  path: number[];
  label: string;
  moveNumber: number;
  color: SgfColor | null;
  setupColor: SgfColor | null;
  scoreColor: SgfColor | null;
  point: SgfPoint | null;
  isSetup: boolean;
  isCameraSetup: boolean;
  isScoring: boolean;
  hasMetadata: boolean;
  hasComment: boolean;
  hasDrawing: boolean;
  hasInitialBlackStones: boolean;
  children: TreeItem[];
}

export function buildTree(document: SgfDocument): TreeItem[] {
  const boardSize = getBoardSize(document);
  const komi = Number(document.root.data.KM?.[0]?.trim().replace(',', '.') ?? 0);
  const profile = ruleProfile(document.root.data.RU?.[0]);

  function walk(node: SgfNode, path: number[], moveNumber: number, state: ReplayState): TreeItem {
    const nextState = cloneReplayState(state);
    applySgfNode(nextState, node, boardSize, profile);
    const color: SgfColor | null = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
    const point = color == null ? null : normalizeMovePoint(node.data[color]?.[0] ?? '', boardSize);
    const isRoot = path.length === 0;
    const isSetup = color == null && hasSetupProperties(node);
    const isScoring = !isRoot && isScoringNode(node);
    const setupColor = isSetup && (!isRoot || nextState.stones.size > 0) ? oppositeStone(nextState.nextColor) : null;
    const nextMoveNumber = color != null || (isSetup && !isRoot) || isScoring ? moveNumber + 1 : moveNumber;
    const displayMoveNumber = isRoot ? 0 : nextMoveNumber;
    const label =
      color == null
        ? isScoring
          ? `${displayMoveNumber} Score`
          : isSetup
            ? `${displayMoveNumber} +`
            : '0 Root'
        : `${color}${nextMoveNumber} ${formatPoint(point, boardSize)}`;

    return {
      id: node.id,
      path,
      label,
      moveNumber: displayMoveNumber,
      color,
      setupColor,
      scoreColor: isScoring
        ? (resultValueWinnerColor(node.data.RE?.[0]) ?? scoringNodeWinnerColor(node, nextState, komi, boardSize))
        : null,
      point: color == null ? null : point,
      isSetup,
      isCameraSetup: isSetup && node.data.ZA?.[0] === 'camera',
      isScoring,
      hasMetadata: hasNodeMetadata(node),
      hasComment: hasNodeComment(node),
      hasDrawing: hasNodeDrawing(node),
      hasInitialBlackStones: color == null && (node.data.AB ?? []).length > 0,
      children: node.children.map((child, index) => walk(child, [...path, index], nextMoveNumber, nextState)),
    };
  }

  return [walk(document.root, [], 0, createReplayState(document))];
}

function scoringNodeWinnerColor(node: SgfNode, state: ReplayState, komi: number, boardSize: number): SgfColor | null {
  if (node.data.TB == null && node.data.TW == null) return null;

  const blackPoints = onBoardPointSet(node.data.TB ?? [], boardSize);
  const whitePoints = onBoardPointSet(node.data.TW ?? [], boardSize);
  const deadWhiteStones = countMarkedStones(blackPoints, state.stones, 'W');
  const deadBlackStones = countMarkedStones(whitePoints, state.stones, 'B');
  const blackScore = blackPoints.size + state.captures.B + deadWhiteStones;
  const whiteScore = whitePoints.size + state.captures.W + deadBlackStones;
  const diff = blackScore - (whiteScore + (Number.isFinite(komi) ? komi : 0));

  if (diff > 0) return 'B';
  if (diff < 0) return 'W';
  return null;
}

function resultValueWinnerColor(value: string | undefined): SgfColor | null {
  const result = value?.trim().toUpperCase() ?? '';
  if (result.startsWith('B+')) return 'B';
  if (result.startsWith('W+')) return 'W';
  return null;
}

function onBoardPointSet(points: SgfPoint[], boardSize: number): Set<SgfPoint> {
  return new Set(points.filter((point) => isPointOnBoard(point, boardSize)));
}

function countMarkedStones(points: Set<SgfPoint>, stones: Map<SgfPoint, SgfColor>, color: SgfColor): number {
  let count = 0;
  for (const point of points) {
    if (stones.get(point) === color) count += 1;
  }
  return count;
}

function hasSetupProperties(node: SgfNode): boolean {
  return ['AB', 'AW', 'AE', 'PL'].some((key) => (node.data[key] ?? []).length > 0);
}

function hasNodeMetadata(node: SgfNode): boolean {
  const moveKeys = new Set(['B', 'W']);
  return Object.keys(node.data).some((key) => !moveKeys.has(key));
}

function hasNodeComment(node: SgfNode): boolean {
  return (node.data.C ?? []).some((value) => value.length > 0);
}

function hasNodeDrawing(node: SgfNode): boolean {
  const drawingKeys = ['CR', 'SQ', 'TR', 'MA', 'SL', 'LB', 'AR', 'LN', 'DD'];
  return drawingKeys.some((key) => (node.data[key] ?? []).length > 0);
}
