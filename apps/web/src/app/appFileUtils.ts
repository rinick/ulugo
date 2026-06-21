import {safeFileName} from './gameRecordFileUtils';

export interface CurrentFileMetadata {
  name: string;
  electronFilePath?: string;
  googleDriveFileId?: string;
}

export function hasDraggedFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes('Files');
}

export function currentSgfFileName(currentFile: CurrentFileMetadata | null, gameName: string): string {
  if (currentFile != null) return normalizeSgfFileName(currentFile.name);
  return `${safeFileName(gameName || 'game')}.sgf`;
}

export function normalizeSgfFileName(fileName: string): string {
  const normalized = safeFileName(fileName.replace(/\.(sgf|gib)$/i, ''));
  return `${normalized}.sgf`;
}
