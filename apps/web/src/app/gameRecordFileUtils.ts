import {getGameInfo, parseGib, parseSgf, updateGameInfo, type SgfDocument, type SgfNode} from '@ulugo/sgf-core';

export function maximumMoveCount(document: SgfDocument): number {
  function count(node: SgfNode): number {
    const current = node.data.B != null || node.data.W != null ? 1 : 0;
    return current + Math.max(0, ...node.children.map(count));
  }

  return count(document.root);
}

export function parseGameRecord(text: string, fileName: string): SgfDocument {
  return isGibFile(fileName) ? parseGib(text) : parseSgf(text);
}

export function isGameRecordFile(fileName: string): boolean {
  return /\.(sgf|gib)$/i.test(fileName);
}

export async function readGameRecordFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return decodeGameRecordBytes(buffer, isGibFile(file.name));
}

function decodeGameRecordBytes(buffer: ArrayBuffer, preferKorean: boolean): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!preferKorean || !utf8.includes('\uFFFD')) return utf8;

  try {
    return new TextDecoder('euc-kr').decode(buffer);
  } catch {
    return utf8;
  }
}

function isGibFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.gib');
}

export function withImportedGameName(document: SgfDocument, fileName: string): SgfDocument {
  const info = getGameInfo(document);
  if (info.GN.trim() !== '') return document;

  return updateGameInfo(document, {...info, GN: gameNameFromSgfFile(fileName)});
}

function gameNameFromSgfFile(fileName: string): string {
  const name = fileName.replace(/\.sgf$/i, '').trim();
  return name === '' ? 'Imported game' : name;
}

export function safeFileName(value: string): string {
  const name = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  return name === '' ? 'game' : name;
}
