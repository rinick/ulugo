import {
  getNodeAtPath,
  type MarkupKind,
  type SgfColor,
  type SgfDocument,
} from '@ulugo/sgf-core';
import type {EditorTool} from '../features/toolbar/types';

export function findChildMovePath(
  document: SgfDocument,
  path: number[],
  color: SgfColor,
  point: string
): number[] | null {
  const node = getNodeAtPath(document, path);
  const index = node.children.findIndex((child) => child.data[color]?.[0] === point);
  return index < 0 ? null : [...path, index];
}

export function oppositeColor(color: SgfColor): SgfColor {
  return color === 'B' ? 'W' : 'B';
}

export function toolToMarkup(tool: EditorTool): MarkupKind | null {
  switch (tool) {
    case 'circle':
      return 'CR';
    case 'square':
      return 'SQ';
    case 'triangle':
      return 'TR';
    case 'cross':
      return 'MA';
    default:
      return null;
  }
}
