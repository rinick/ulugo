import {formatPoint, type SgfColor, type TreeItem} from '@ulugo/sgf-core';

export interface TreeCell {
  id: string;
  path: number[];
  row: number;
  column: number;
  color: SgfColor | null;
  text: string;
  isSetup: boolean;
  isCameraSetup: boolean;
  isPass: boolean;
  isScoring: boolean;
  hasMetadata: boolean;
  hasComment: boolean;
  hasDrawing: boolean;
}

export interface TreeConnector {
  id: string;
  fromRow: number;
  fromColumn: number;
  toRow: number;
  toColumn: number;
}

export interface TreeLayout {
  rows: number[];
  columns: number;
  cells: TreeCell[];
  connectors: TreeConnector[];
}

export const gutterWidth = 42;
export const treeColumnStep = 30;
export const treeRowStep = 36;
export const cornerRadius = 11;

export function layoutTree(root: TreeItem, boardSize = 19): TreeLayout {
  const cells: LayoutCell[] = [];
  const connectors: TreeConnector[] = [];
  const occupied = new Set<string>();

  addCell(cells, occupied, root, 0);
  walkTree(root, 0, cells, connectors, occupied);

  const maxRow = Math.max(...cells.map((cell) => cell.row));
  const maxColumn = Math.max(...cells.map((cell) => cell.column));

  return {
    rows: Array.from({length: maxRow + 1}, (_, index) => index),
    columns: Math.max(maxColumn + 1, 1),
    cells: cells.map((cell) => treeCell(cell.item, cell.column, boardSize)),
    connectors,
  };
}

interface LayoutCell {
  item: TreeItem;
  row: number;
  column: number;
}

function walkTree(
  item: TreeItem,
  column: number,
  cells: LayoutCell[],
  connectors: TreeConnector[],
  occupied: Set<string>
): void {
  item.children.forEach((child, index) => {
    const childColumn = firstAvailableColumn(child.moveNumber, occupied, index === 0 ? column : column + 1);

    connectors.push({
      id: `${item.id}-${child.id}`,
      fromRow: item.moveNumber,
      fromColumn: column,
      toRow: child.moveNumber,
      toColumn: childColumn,
    });
    addCell(cells, occupied, child, childColumn);
    walkTree(child, childColumn, cells, connectors, occupied);
  });
}

function addCell(cells: LayoutCell[], occupied: Set<string>, item: TreeItem, column: number): void {
  cells.push({item, row: item.moveNumber, column});
  occupied.add(layoutKey(item.moveNumber, column));
}

function firstAvailableColumn(row: number, occupied: Set<string>, minColumn: number): number {
  let column = minColumn;
  while (occupied.has(layoutKey(row, column))) column += 1;
  return column;
}

function layoutKey(row: number, column: number): string {
  return `${row}:${column}`;
}

function treeCell(item: TreeItem, column: number, boardSize: number): TreeCell {
  return {
    id: item.id,
    path: item.path,
    row: item.moveNumber,
    column,
    color: item.path.length === 0 ? rootCellColor(item) : (item.color ?? item.setupColor ?? item.scoreColor),
    text:
      item.path.length === 0
        ? item.isSetup
          ? '+'
          : ''
        : item.isScoring
          ? ''
          : item.isSetup
            ? '+'
            : item.point === ''
              ? ''
              : formatPoint(item.point, boardSize),
    isSetup: item.isSetup,
    isCameraSetup: item.isCameraSetup,
    isPass: item.path.length > 0 && !item.isSetup && !item.isScoring && item.point === '',
    isScoring: item.isScoring,
    hasMetadata: item.hasMetadata,
    hasComment: !item.isScoring && item.hasComment,
    hasDrawing: !item.isScoring && item.hasDrawing,
  };
}

function rootCellColor(root: TreeItem): SgfColor | null {
  if (root.isSetup) return root.setupColor;
  return root.color ?? root.setupColor ?? (root.hasInitialBlackStones ? 'B' : null);
}
