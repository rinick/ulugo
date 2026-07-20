import type {AnalysisSettings} from '@ulugo/analysis-core';
import {
  getBoardSize,
  getNodeAtPath,
  isScoringNode,
  normalizeMovePoint,
  samePath,
  type SgfDocument,
} from '@ulugo/sgf-core';

export function shouldDeleteScoringNodeOnExit(document: SgfDocument, path: number[]): boolean {
  if (path.length === 0 || !isScoringNode(getNodeAtPath(document, path))) return false;

  const parent = getNodeAtPath(document, path.slice(0, -1));
  const movePoint = parent.data.B?.[0] ?? parent.data.W?.[0];
  return movePoint == null || normalizeMovePoint(movePoint, getBoardSize(document)) !== '';
}

export function selectedPathAfterDelete(selectedPath: number[], deletedPath: number[]): number[] {
  if (samePath(selectedPath.slice(0, deletedPath.length), deletedPath)) {
    return deletedPath.slice(0, -1);
  }

  const parentPath = deletedPath.slice(0, -1);
  if (
    selectedPath.length > parentPath.length &&
    samePath(selectedPath.slice(0, parentPath.length), parentPath) &&
    selectedPath[parentPath.length] > deletedPath[deletedPath.length - 1]
  ) {
    const nextPath = [...selectedPath];
    nextPath[parentPath.length] -= 1;
    return nextPath;
  }

  return selectedPath;
}

export function resolveBoardBackground(
  boardBackground: AnalysisSettings['boardBackground'],
  useNaturalBackground: boolean
): Exclude<AnalysisSettings['boardBackground'], 'auto'> {
  if (boardBackground === 'auto') return useNaturalBackground ? 'natural' : 'golden';
  return boardBackground;
}

export function nextLabelText(value: string): string {
  if (/^\d+$/.test(value)) return (BigInt(value) + 1n).toString();
  if (/^[a-z]+$/.test(value)) return nextLetters(value, 'a'.charCodeAt(0));
  if (/^[A-Z]+$/.test(value)) return nextLetters(value, 'A'.charCodeAt(0));
  return value;
}

function nextLetters(value: string, baseCode: number): string {
  const codes = [...value].map((char) => char.charCodeAt(0) - baseCode);

  for (let index = codes.length - 1; index >= 0; index -= 1) {
    if (codes[index] < 25) {
      codes[index] += 1;
      return codes.map((code) => String.fromCharCode(baseCode + code)).join('');
    }
    codes[index] = 0;
  }

  return `${String.fromCharCode(baseCode)}${codes.map((code) => String.fromCharCode(baseCode + code)).join('')}`;
}
