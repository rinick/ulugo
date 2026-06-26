import {message} from 'antd';
import {serializeSgf, type SgfDocument} from '@ulugo/sgf-core';
import {useEffect, useRef, useState, type DragEvent, type RefObject} from 'react';
import {useTranslation} from 'react-i18next';
import {promptSaveFileName} from '../features/files/promptSaveFileName';
import {
  currentSgfFileName,
  hasDraggedFiles,
  normalizeSgfFileName,
  type CurrentFileMetadata,
} from './appFileUtils';
import {capabilities, isElectron} from './capabilities';
import {
  isGameRecordFile,
  parseGameRecord,
  readGameRecordFile,
  withImportedGameName,
} from './gameRecordFileUtils';
import {openSgfFromGoogleDrive, saveSgfToGoogleDrive} from './googleDrive';

interface UseGameRecordFilesOptions {
  document: SgfDocument;
  gameName: string;
  onImport: (document: SgfDocument) => void;
}

interface GameRecordFiles {
  fileInputRef: RefObject<HTMLInputElement | null>;
  googleDrivePending: 'open' | 'save' | null;
  clearCurrentFile: () => void;
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
  saveToGoogleDrive: () => Promise<void>;
  open: () => Promise<void>;
  openFromGoogleDrive: () => Promise<void>;
  importFile: (file: File | undefined) => Promise<void>;
  handleDragOver: (event: DragEvent<HTMLElement>) => void;
  handleDrop: (event: DragEvent<HTMLElement>) => void;
  cancelGoogleDriveOperation: () => void;
}

export function useGameRecordFiles({
  document,
  gameName,
  onImport,
}: UseGameRecordFilesOptions): GameRecordFiles {
  const {t} = useTranslation();
  const [currentFile, setCurrentFile] = useState<CurrentFileMetadata | null>(null);
  const [googleDrivePending, setGoogleDrivePending] = useState<'open' | 'save' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isElectron || window.ulugo == null) return;

    const importOpenedGameRecord = (result: {content: string; fileName: string; filePath: string} | null): void => {
      if (result == null) return;
      importText(result.content, result.fileName, {
        name: result.fileName,
        electronFilePath: result.filePath,
      });
    };
    void window.ulugo
      .consumeOpenGameRecord()
      .then(importOpenedGameRecord)
      .catch((error) => message.error(error instanceof Error ? error.message : t('importFailed')));
    return window.ulugo.onOpenGameRecord(importOpenedGameRecord);
  }, [onImport, t]);

  async function save(): Promise<void> {
    if (currentFile == null) {
      await saveAs();
      return;
    }

    if (currentFile.googleDriveFileId != null) {
      await saveToGoogleDrive();
      return;
    }

    await exportFile(currentFile.name, {electronFilePath: currentFile.electronFilePath});
  }

  async function saveAs(): Promise<void> {
    const fileName =
      capabilities.storage === 'filesystem'
        ? currentSgfFileName(currentFile, gameName)
        : await promptSaveFileName({
            title: t('saveAs'),
            initialValue: currentSgfFileName(currentFile, gameName),
            okText: t('save'),
            cancelText: t('cancel'),
          });
    if (fileName == null) return;

    await exportFile(fileName, {saveAs: true});
  }

  async function saveToGoogleDrive(): Promise<void> {
    const fileName = currentSgfFileName(currentFile, gameName);
    if (isElectron) setGoogleDrivePending('save');
    try {
      const result = await saveSgfToGoogleDrive({
        platform: capabilities.platform,
        content: serializeSgf(document),
        fileName,
        fileId: currentFile?.googleDriveFileId,
      });
      if (result == null) return;
      setCurrentFile({name: result.fileName, googleDriveFileId: result.fileId});
      message.success(t('savedToGoogleDrive'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('googleDriveFailed'));
    } finally {
      if (isElectron) setGoogleDrivePending(null);
    }
  }

  async function exportFile(
    fileName: string,
    options: {saveAs?: boolean; electronFilePath?: string | null} = {}
  ): Promise<void> {
    const content = serializeSgf(document);
    if (capabilities.storage === 'filesystem' && window.ulugo != null) {
      try {
        const result = await window.ulugo.exportSgf({
          content,
          suggestedName: fileName,
          filePath: options.saveAs ? undefined : (options.electronFilePath ?? undefined),
        });
        if (!result.canceled && result.fileName != null) {
          setCurrentFile({name: result.fileName, electronFilePath: result.filePath});
        }
      } catch (error) {
        message.error(error instanceof Error ? error.message : t('exportFailed'));
      }
      return;
    }

    const normalizedFileName = normalizeSgfFileName(fileName);
    const blob = new Blob([content], {type: 'application/x-go-sgf;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = normalizedFileName;
    link.click();
    URL.revokeObjectURL(url);
    setCurrentFile({name: normalizedFileName});
  }

  async function open(): Promise<void> {
    if (capabilities.storage === 'filesystem' && window.ulugo != null) {
      try {
        const result = await window.ulugo.importSgf();
        if (result == null) return;
        importText(result.content, result.fileName, {
          name: result.fileName,
          electronFilePath: result.filePath,
        });
      } catch (error) {
        message.error(error instanceof Error ? error.message : t('importFailed'));
      }
      return;
    }

    fileInputRef.current?.click();
  }

  async function openFromGoogleDrive(): Promise<void> {
    if (isElectron) setGoogleDrivePending('open');
    try {
      const result = await openSgfFromGoogleDrive(capabilities.platform);
      if (result == null) return;
      importText(result.content, result.fileName, {
        name: result.fileName,
        googleDriveFileId: result.fileId,
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('googleDriveFailed'));
    } finally {
      if (isElectron) setGoogleDrivePending(null);
    }
  }

  async function importFile(file: File | undefined): Promise<void> {
    if (file == null) return;

    try {
      const text = await readGameRecordFile(file);
      importText(text, file.name, {name: file.name, electronFilePath: electronFilePath(file)});
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('importFailed'));
    } finally {
      if (fileInputRef.current != null) fileInputRef.current.value = '';
    }
  }

  function handleDragOver(event: DragEvent<HTMLElement>): void {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
  }

  function handleDrop(event: DragEvent<HTMLElement>): void {
    if (!hasDraggedFiles(event.dataTransfer)) return;

    event.preventDefault();
    const file = Array.from(event.dataTransfer.files).find((item) => isGameRecordFile(item.name));
    void importFile(file);
  }

  function importText(text: string, fileName: string, metadata: CurrentFileMetadata): void {
    const importedDocument = withImportedGameName(parseGameRecord(text, fileName), fileName);
    setCurrentFile(metadata);
    onImport(importedDocument);
  }

  return {
    fileInputRef,
    googleDrivePending,
    clearCurrentFile: () => setCurrentFile(null),
    save,
    saveAs,
    saveToGoogleDrive,
    open,
    openFromGoogleDrive,
    importFile,
    handleDragOver,
    handleDrop,
    cancelGoogleDriveOperation: () => void window.ulugo?.googleDrive.cancel(),
  };
}

function electronFilePath(file: File): string | undefined {
  const path = window.ulugo?.getPathForFile(file) ?? (file as File & {path?: unknown}).path;
  return typeof path === 'string' && path !== '' ? path : undefined;
}
