import {
  getBoardSize,
  getLine,
  normalizeMovePoint,
  pointToVertex,
  type SgfColor,
  type SgfDocument,
  type SgfPoint,
} from '@ulugo/sgf-core';

const gtpLetters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

export function getMovesForPath(document: SgfDocument, path: number[]): Array<[SgfColor, string]> {
  const size = getBoardSize(document);
  return getLine(document, path).flatMap((node): Array<[SgfColor, string]> => {
    const color: SgfColor | null = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
    if (color == null) return [];
    return [[color, sgfPointToGtp(node.data[color]?.[0] ?? '', size)]];
  });
}

export function getInitialStonesForPath(document: SgfDocument, path: number[]): Array<[SgfColor, string]> {
  const size = getBoardSize(document);
  const stones: Array<[SgfColor, string]> = [];

  for (const node of getLine(document, path)) {
    for (const point of node.data.AB ?? []) stones.push(['B', sgfPointToGtp(point, size)]);
    for (const point of node.data.AW ?? []) stones.push(['W', sgfPointToGtp(point, size)]);
  }

  return stones;
}

export function sgfPointToGtp(point: SgfPoint, boardSize: number): string {
  const normalizedPoint = normalizeMovePoint(point, boardSize);
  if (normalizedPoint === '') return 'pass';
  const vertex = pointToVertex(normalizedPoint);
  if (vertex == null) return 'pass';
  const [x, y] = vertex;
  return `${gtpLetters[x] ?? 'A'}${boardSize - y}`;
}
