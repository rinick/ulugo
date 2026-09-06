import {message} from 'antd';
import {serializeSgf, type SgfDocument} from '@ulugo/sgf-core';
import {useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type RefObject} from 'react';
import {useTranslation} from 'react-i18next';
import {promptSaveFileName} from '../features/files/promptSaveFileName';
import {promptSgfText} from '../features/files/promptSgfText';
import {currentSgfFileName, hasDraggedFiles, normalizeSgfFileName, type CurrentFileMetadata} from './appFileUtils';
import {capabilities, isElectron} from './capabilities';
import {
  isGameRecordFile,
  maximumMoveCount,
  parseGameRecord,
  readGameRecordFile,
  withImportedGameName,
} from './gameRecordFileUtils';
import {openSgfFromGoogleDrive, saveSgfToGoogleDrive} from './googleDrive';
import type {ElectronImageImportResult, ElectronImportResult, ElectronRecentFile} from './electronApi';

interface UseGameRecordFilesOptions {
  document: SgfDocument;
  gameName: string;
  startedFromEmpty: boolean;
  onImport: (document: SgfDocument) => void;
  onOpenImage: (image: File) => void;
}

interface GameRecordFiles {
  fileInputRef: RefObject<HTMLInputElement | null>;
  cameraInputRef: RefObject<HTMLInputElement | null>;
  googleDrivePending: 'open' | 'save' | null;
  recentFiles: ElectronRecentFile[];
  clearCurrentFile: (startedFromEmpty?: boolean) => void;
  archiveUnsavedGame: () => Promise<boolean>;
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
  saveToClipboard: () => Promise<void>;
  saveToGoogleDrive: () => Promise<void>;
  open: () => Promise<void>;
  openRecentFile: (filePath: string) => Promise<void>;
  openFromClipboard: (clipboardData?: DataTransfer | null) => Promise<void>;
  openFromCamera: () => void;
  openFromSgfText: () => Promise<void>;
  openFromGoogleDrive: () => Promise<void>;
  importSgf: (content: string, fileName: string) => Promise<boolean>;
  importFile: (file: File | undefined) => Promise<void>;
  handleDragOver: (event: DragEvent<HTMLElement>) => void;
  handleDrop: (event: DragEvent<HTMLElement>) => void;
  cancelGoogleDriveOperation: () => void;
}

export function useGameRecordFiles({
  document,
  gameName,
  startedFromEmpty: initiallyStartedFromEmpty,
  onImport,
  onOpenImage,
}: UseGameRecordFilesOptions): GameRecordFiles {
  const {t} = useTranslation();
  const [currentFile, setCurrentFile] = useState<CurrentFileMetadata | null>(null);
  const [startedFromEmpty, setStartedFromEmpty] = useState(initiallyStartedFromEmpty);
  const [recentFiles, setRecentFiles] = useState<ElectronRecentFile[]>([]);
  const [googleDrivePending, setGoogleDrivePending] = useState<'open' | 'save' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const onImportRef = useRef(onImport);
  useLayoutEffect(() => {
    onImportRef.current = onImport;
  }, [onImport]);

  useEffect(() => {
    if (!isElectron || window.ulugo == null) return;

    const importOpenedGameRecord = (result: ElectronImportResult | null): void => {
      if (result == null) return;
      void importText(result.content, result.fileName, {
        name: result.fileName,
        electronFilePath: result.filePath,
      }).catch(showImportError);
    };
    void window.ulugo.consumeOpenGameRecord().then(importOpenedGameRecord).catch(showImportError);
    return window.ulugo.onOpenGameRecord(importOpenedGameRecord);
  }, [t]);

  const refreshRecentFiles = useCallback(async (): Promise<void> => {
    if (!isElectron || window.ulugo == null) return;
    try {
      setRecentFiles(await window.ulugo.getRecentFiles());
    } catch {
      setRecentFiles([]);
    }
  }, []);

  useEffect(() => {
    void refreshRecentFiles();
  }, [refreshRecentFiles]);

  useEffect(() => {
    if (!isElectron || window.ulugo == null) return;
    window.ulugo.updateAutoSaveCandidate(
      startedFromEmpty && currentFile == null
        ? {
            content: serializeSgf(document),
            fileName: currentSgfFileName(null, gameName),
            moveCount: maximumMoveCount(document),
          }
        : null
    );
  }, [currentFile, document, gameName, startedFromEmpty]);

  async function archiveUnsavedGame(): Promise<boolean> {
    if (!isElectron || window.ulugo == null) return true;
    try {
      await window.ulugo.archiveUnsavedGame();
      await refreshRecentFiles();
      return true;
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('exportFailed'));
      return false;
    }
  }

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
      setStartedFromEmpty(false);
      message.success(t('savedToGoogleDrive'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('googleDriveFailed'));
    } finally {
      if (isElectron) setGoogleDrivePending(null);
    }
  }

  async function saveToClipboard(): Promise<void> {
    try {
      await writeTextToClipboard(serializeSgf(document));
      message.success(t('savedToClipboard'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('exportFailed'));
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
          setStartedFromEmpty(false);
          message.success(t('saved'));
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
    message.success(t('saved'));
  }

  async function open(): Promise<void> {
    if (capabilities.storage === 'filesystem' && window.ulugo != null) {
      try {
        const result = await window.ulugo.importFile();
        if (result == null) return;
        if (result.kind === 'image') {
          openElectronImage(result);
        } else {
          await importText(result.content, result.fileName, {
            name: result.fileName,
            electronFilePath: result.filePath,
          });
          await refreshRecentFiles();
        }
      } catch (error) {
        message.error(error instanceof Error ? error.message : t('importFailed'));
      }
      return;
    }

    fileInputRef.current?.click();
  }

  async function openRecentFile(filePath: string): Promise<void> {
    if (!isElectron || window.ulugo == null) return;
    try {
      const result = await window.ulugo.openRecentFile(filePath);
      if (result.kind === 'image') {
        openElectronImage(result);
      } else {
        await importText(result.content, result.fileName, {
          name: result.fileName,
          electronFilePath: result.filePath,
        });
      }
      await refreshRecentFiles();
    } catch (error) {
      showImportError(error);
      await refreshRecentFiles();
    }
  }

  async function openFromClipboard(clipboardData?: DataTransfer | null): Promise<void> {
    if (clipboardData != null) {
      const text = clipboardData.getData('text/plain');
      if (text.trim() !== '') {
        try {
          await importText(text, 'clipboard.sgf', {name: 'clipboard.sgf'});
          return;
        } catch {
          // Fall through when clipboard text is not valid SGF.
        }
      }

      const files = Array.from(clipboardData.files);
      const gameRecord = files.find((file) => isGameRecordFile(file.name));
      if (gameRecord != null) {
        await importFile(gameRecord);
        return;
      }

      const image =
        files.find(isImageFile) ??
        Array.from(clipboardData.items)
          .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
          ?.getAsFile();
      if (image != null) onOpenImage(image);
      return;
    }

    if (!isElectron || window.ulugo == null) return;

    try {
      const result = await window.ulugo.readClipboard();
      if (result.text.trim() !== '') {
        try {
          await importText(result.text, 'clipboard.sgf', {name: 'clipboard.sgf'});
          return;
        } catch {
          // Fall through to an image when the clipboard text is not valid SGF.
        }
      }
      if (result.image != null) openElectronImage(result.image);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('importFailed'));
    }
  }

  function openElectronImage(result: ElectronImageImportResult): void {
    onOpenImage(new File([Uint8Array.from(result.data).buffer], result.fileName, {type: result.mimeType}));
  }

  async function openFromGoogleDrive(): Promise<void> {
    if (isElectron) setGoogleDrivePending('open');
    try {
      const result = await openSgfFromGoogleDrive(capabilities.platform);
      if (result == null) return;
      await importText(result.content, result.fileName, {
        name: result.fileName,
        googleDriveFileId: result.fileId,
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('googleDriveFailed'));
    } finally {
      if (isElectron) setGoogleDrivePending(null);
    }
  }

  async function openFromSgfText(): Promise<void> {
    const text = await promptSgfText({
      title: t('openFromSgfText'),
      okText: t('open'),
      cancelText: t('cancel'),
    });
    if (text == null) return;

    try {
      await importText(text, 'clipboard.sgf', {name: 'clipboard.sgf'});
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('importFailed'));
    }
  }

  async function importFile(file: File | undefined): Promise<void> {
    if (file == null) return;

    try {
      if (isImageFile(file)) {
        const filePath = electronFilePath(file);
        if (filePath != null && window.ulugo != null) {
          await window.ulugo.addRecentFile(filePath);
          await refreshRecentFiles();
        }
        onOpenImage(file);
        return;
      }
      const text = await readGameRecordFile(file);
      await importText(text, file.name, {name: file.name, electronFilePath: electronFilePath(file)});
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('importFailed'));
    } finally {
      if (fileInputRef.current != null) fileInputRef.current.value = '';
      if (cameraInputRef.current != null) cameraInputRef.current.value = '';
    }
  }

  function handleDragOver(event: DragEvent<HTMLElement>): void {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
  }

  function handleDrop(event: DragEvent<HTMLElement>): void {
    if (!hasDraggedFiles(event.dataTransfer)) return;

    event.preventDefault();
    const file = Array.from(event.dataTransfer.files).find((item) => isGameRecordFile(item.name) || isImageFile(item));
    void importFile(file);
  }

  async function importText(text: string, fileName: string, metadata: CurrentFileMetadata): Promise<boolean> {
    const importedDocument = withImportedGameName(parseGameRecord(text, fileName), fileName);
    if (!(await archiveUnsavedGame())) return false;
    if (metadata.electronFilePath != null && window.ulugo != null) {
      await window.ulugo.addRecentFile(metadata.electronFilePath);
      await refreshRecentFiles();
    }
    setCurrentFile(metadata);
    setStartedFromEmpty(false);
    onImportRef.current(importedDocument);
    return true;
  }

  function showImportError(error: unknown): void {
    message.error(error instanceof Error ? error.message : t('importFailed'));
  }

  return {
    fileInputRef,
    cameraInputRef,
    googleDrivePending,
    recentFiles,
    clearCurrentFile: (nextStartedFromEmpty = false) => {
      setCurrentFile(null);
      setStartedFromEmpty(nextStartedFromEmpty);
    },
    archiveUnsavedGame,
    save,
    saveAs,
    saveToClipboard,
    saveToGoogleDrive,
    open,
    openRecentFile,
    openFromClipboard,
    openFromCamera: () => cameraInputRef.current?.click(),
    openFromSgfText,
    openFromGoogleDrive,
    importSgf: async (content, fileName) => {
      try {
        return await importText(content, fileName, {name: fileName});
      } catch (error) {
        showImportError(error);
        return false;
      }
    },
    importFile,
    handleDragOver,
    handleDrop,
    cancelGoogleDriveOperation: () => void window.ulugo?.googleDrive.cancel(),
  };
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name);
}

function electronFilePath(file: File): string | undefined {
  const path = window.ulugo?.getPathForFile(file) ?? (file as File & {path?: unknown}).path;
  return typeof path === 'string' && path !== '' ? path : undefined;
}

async function writeTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard != null) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const element = window.document.createElement('textarea');
  element.value = text;
  element.style.position = 'fixed';
  element.style.left = '-9999px';
  window.document.body.appendChild(element);
  element.select();
  try {
    if (!window.document.execCommand('copy')) throw new Error('Clipboard copy failed.');
  } finally {
    element.remove();
  }
}
