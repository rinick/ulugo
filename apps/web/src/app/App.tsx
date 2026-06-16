import {
  CloseOutlined,
  EditOutlined,
  FieldBinaryOutlined,
  FileAddOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  CheckCircleFilled,
  SaveOutlined,
  SettingOutlined,
  StockOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import {
  Button,
  Checkbox,
  ConfigProvider,
  Dropdown,
  Input,
  Layout,
  Modal,
  Radio,
  Segmented,
  Space,
  message,
  theme,
} from 'antd';
import type {MenuProps} from 'antd';
import {
  addLabel,
  addMarkup,
  addMove,
  cloneDocument,
  createNode,
  createNewGame,
  deleteNode,
  eraseMarkup,
  getComment,
  getBoardSize,
  getGameInfo,
  getNodeAtPath,
  buildTree,
  moveBranch,
  moveBranchToMain,
  samePath,
  serializeSgf,
  updateComment,
  updateGameInfo,
  vertexToPoint,
  type SgfColor,
  type SgfDocument,
  type SgfNode,
} from '@ulugo/sgf-core';
import {boardSizes, type BoardSize} from '@ulugo/ui-shared';
import {useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent} from 'react';
import {useTranslation} from 'react-i18next';
import {deriveBoardPosition, isLegalMove} from '@ulugo/go-core';
import type {AnalysisSettings} from '@ulugo/analysis-core';
import stoneSoundUrl from '../assets/go_stone_light.wav';
import privacyPolicyUrl from '../../../../policies/privacy-policy.md?url';
import termsOfServiceUrl from '../../../../policies/terms-of-service.md?url';
import {GoogleAd} from '../features/ads/GoogleAd';
import {GoBoard, type BoardVertexClickOptions} from '../features/board/GoBoard';
import {CommentsPanel} from '../features/comments/CommentsPanel';
import {GameInfoModal} from '../features/game-info/GameInfoModal';
import {SettingsModal} from '../features/settings/SettingsModal';
import {KataGoSettingsModal} from '../features/katago/KataGoSettingsModal';
import {SgfTreePanel} from '../features/sgf-tree/SgfTreePanel';
import {layoutTree} from '../features/sgf-tree/layout';
import {KeyboardShortcutsModal} from '../features/shortcuts/KeyboardShortcutsModal';
import {
  readKeyboardShortcuts,
  shortcutActionForEvent,
  shortcutActions,
  shortcutLabel,
  writeKeyboardShortcuts,
  type KeyboardShortcutConfig,
  type ShortcutActionId,
} from '../features/shortcuts/keyboardShortcuts';
import {EditorToolbar} from '../features/toolbar/EditorToolbar';
import type {EditorTool} from '../features/toolbar/types';
import {getAppCapabilities} from './capabilities';
import {addSetupStoneToPath, findChildMovePath, isCurrentSetupStone, oppositeColor, toolToMarkup} from './sgfEditUtils';
import {
  findCurrentStoneMovePath,
  findFutureMovePath,
  getAnalysisQueuePaths,
  getCurrentBranchMovePaths,
  nextFirstChildPath,
  nextRememberedPath,
  normalizeSelectedPath,
  pathKey,
} from './sgfPathUtils';
import {
  isGameRecordFile,
  parseGameRecord,
  readGameRecordFile,
  safeFileName,
  withImportedGameName,
} from './gameRecordFileUtils';
import {blurNonTextControlFocus, isModalOpen, isPopupOpen, isTextInputActive} from './domUtils';
import {type AppLanguage, antdLocales, normalizeLanguage, saveLanguage} from './localizationUtils';
import {formatConsoleTime} from './katagoConsoleUtils';
import {getAppFontFamily} from './fonts';
import {openSgfFromGoogleDrive, saveSgfToGoogleDrive} from './googleDrive';
import {useKataGoAnalysis} from './useKataGoAnalysis';

const {Header, Content} = Layout;
const showCoordinatesStorageKey = 'ulugo.showCoordinates';
const playStoneSoundStorageKey = 'ulugo.playStoneSound';

interface ReplaceDocumentOptions {
  clearAnalysisCache?: boolean;
  invalidatePath?: number[];
  pendingSetupPath?: number[] | null;
  replaceMoveState?: ReplaceMoveState | null;
}

interface CurrentFileMetadata {
  name: string;
  electronFilePath?: string;
  googleDriveFileId?: string;
}

interface ReplaceMoveState {
  originalPath: number[];
  replacementPath: number[];
}

export function App() {
  const {t, i18n} = useTranslation();
  const capabilities = useMemo(() => getAppCapabilities(), []);
  const [document, setDocument] = useState<SgfDocument>(() => createNewGame());
  const [path, setPath] = useState<number[]>([]);
  const [tool, setTool] = useState<EditorTool>('auto');
  const [labelText, setLabelText] = useState('A');
  const [autoColorOverride, setAutoColorOverride] = useState<'B' | 'W' | null>(null);
  const [replaceMoveState, setReplaceMoveState] = useState<ReplaceMoveState | null>(null);
  const [showCoordinates, setShowCoordinates] = useState(() => readStoredBoolean(showCoordinatesStorageKey, true));
  const [playStoneSound, setPlayStoneSound] = useState(() => readStoredBoolean(playStoneSoundStorageKey, true));
  const [gameInfoOpen, setGameInfoOpen] = useState(false);
  const [currentFile, setCurrentFile] = useState<CurrentFileMetadata | null>(null);
  const [kataGoSettingsOpen, setKataGoSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [googleDrivePending, setGoogleDrivePending] = useState<'open' | 'save' | null>(null);
  const [autoBoardBackgroundReady, setAutoBoardBackgroundReady] = useState(false);
  const [keyboardShortcuts, setKeyboardShortcuts] = useState(() => readKeyboardShortcuts());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stoneSoundRef = useRef<HTMLAudioElement | null>(null);
  const branchMemoryRef = useRef(new Map<string, number>());
  const pendingSetupPathRef = useRef<number[] | null>(null);
  const gameInfo = useMemo(() => getGameInfo(document), [document]);
  const boardSize = useMemo(() => getBoardSize(document), [document]);
  const position = useMemo(() => deriveBoardPosition(document, path), [document, path]);
  const treeLayout = useMemo(() => layoutTree(buildTree(document)[0], boardSize), [boardSize, document]);
  const nextAutoColor = autoColorOverride ?? position.nextColor;
  const currentLanguage = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);
  const antdLocale = antdLocales[currentLanguage];
  const appFontFamily = useMemo(() => getAppFontFamily(currentLanguage), [currentLanguage]);
  const analysisChartPaths = useMemo(
    () => getCurrentBranchMovePaths(document, path, branchMemoryRef.current),
    [document, path]
  );
  const analysisPaths = useMemo(
    () => getAnalysisQueuePaths(document, analysisChartPaths),
    [analysisChartPaths, document]
  );
  const shortcutLabels = useMemo(
    () =>
      Object.fromEntries(
        shortcutActions.map((action) => [action.id, shortcutLabel(keyboardShortcuts[action.id])])
      ) as Partial<Record<ShortcutActionId, string>>,
    [keyboardShortcuts]
  );

  useEffect(() => {
    globalThis.document.documentElement.lang = currentLanguage;
    globalThis.document.documentElement.style.setProperty('--ulugo-font-family', appFontFamily);
  }, [appFontFamily, currentLanguage]);

  useEffect(() => {
    writeStoredBoolean(showCoordinatesStorageKey, showCoordinates);
  }, [showCoordinates]);

  useEffect(() => {
    writeStoredBoolean(playStoneSoundStorageKey, playStoneSound);
  }, [playStoneSound]);

  const {
    analysisSettings,
    updateAnalysisSettings,
    analysisMode,
    analysisDeepMode,
    analysisIdle,
    setAnalysisModeActive,
    toggleAnalysisMode,
    toggleDeepAnalysisMode,
    currentAnalysis,
    stoneScoreDeltas,
    analysisChartData,
    selectedChartMoveNumber,
    analysisChartSummary,
    fastAnalysisPendingCount,
    kataGoInitialized,
    kataGoConsoleMessages,
    setKataGoConsoleMessages,
    kataGoConsoleRef,
    refreshKataGoSettings,
    resetAnalysisForDocumentChange,
  } = useKataGoAnalysis({
    enabled: capabilities.katago,
    document,
    path,
    analysisPaths,
    analysisChartPaths,
    pendingSetupPathRef,
    startFailedMessage: t('analysis.startFailed'),
  });
  const showMarkup = analysisSettings.showMarkup;
  const stoneOverlayDisplay =
    !capabilities.katago && analysisSettings.stoneOverlay === 'dot' ? 'number' : analysisSettings.stoneOverlay;
  const boardMoveNumberLimit = stoneOverlayDisplay === 'number' ? analysisSettings.maxMoves : 0;
  const boardBackground = resolveBoardBackground(
    analysisSettings.boardBackground,
    autoBoardBackgroundReady && analysisSettings.showTopMoves
  );
  const appTitle = capabilities.platform === 'electron' ? t('app.electronTitle') : t('app.title');
  const blackPlayerName = gameInfo.PB.trim() === '' ? t('app.black') : gameInfo.PB;
  const whitePlayerName = gameInfo.PW.trim() === '' ? t('app.white') : gameInfo.PW;

  useEffect(() => {
    if (!showMarkup && isMarkupTool(tool)) setTool('auto');
  }, [showMarkup, tool]);

  const newMenuItems: MenuProps['items'] = boardSizes.map((size) => ({
    key: String(size),
    label: t(`menu.new${size}`),
  }));
  const openMenuItems: MenuProps['items'] = [{key: 'googleDrive', label: t('menu.openFromGoogleDrive')}];
  const saveMenuItems: MenuProps['items'] = [
    {key: 'saveAs', label: t('menu.saveAs')},
    {key: 'googleDrive', label: t('menu.saveToGoogleDrive')},
  ];

  useEffect(() => {
    if (capabilities.katago || analysisSettings.stoneOverlay !== 'dot') return;
    updateAnalysisSettings({stoneOverlay: 'number', maxMoves: 'all'});
  }, [analysisSettings.stoneOverlay, capabilities.katago, updateAnalysisSettings]);

  useEffect(() => {
    if (autoBoardBackgroundReady || !capabilities.katago || !analysisSettings.showTopMoves || !kataGoInitialized)
      return;
    setAutoBoardBackgroundReady(true);
  }, [autoBoardBackgroundReady, analysisSettings.showTopMoves, capabilities.katago, kataGoInitialized]);

  function rememberPath(nextPath: number[]): void {
    for (let index = 0; index < nextPath.length; index += 1) {
      const parent = nextPath.slice(0, index);
      branchMemoryRef.current.set(pathKey(parent), nextPath[index]);
    }
  }

  function replaceDocument(next: SgfDocument, nextPath: number[] = [], options: ReplaceDocumentOptions = {}): void {
    const normalizedPath = normalizeSelectedPath(next, nextPath);
    resetAnalysisForDocumentChange(next, options);
    setDocument(next);
    setPath(normalizedPath);
    setAutoColorOverride(null);
    setReplaceMoveState(options.replaceMoveState ?? null);
    if (options.replaceMoveState != null) {
      setTool('replace');
    } else if (tool === 'replace') {
      setTool('auto');
    }
    pendingSetupPathRef.current = options.pendingSetupPath ?? null;
    rememberPath(normalizedPath);
  }

  function selectPath(nextPath: number[], options: {keepAutoColorOverride?: boolean} = {}): void {
    const normalizedPath = normalizeSelectedPath(document, nextPath);
    pendingSetupPathRef.current = null;

    rememberPath(normalizedPath);
    setPath(normalizedPath);
    if (!options.keepAutoColorOverride) setAutoColorOverride(null);
    setReplaceMoveState(null);
    if (tool === 'replace') setTool('auto');
  }

  function playPlaceStoneSound(): void {
    if (!playStoneSound) return;

    const audio = stoneSoundRef.current ?? new Audio(stoneSoundUrl);
    stoneSoundRef.current = audio;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }

  function handleNew(size: BoardSize = 19): void {
    branchMemoryRef.current.clear();
    setCurrentFile(null);
    setAnalysisModeActive(false);
    replaceDocument(createNewGame(size), [], {clearAnalysisCache: true});
  }

  async function handleSaveSgf(): Promise<void> {
    if (currentFile == null) {
      await handleSaveAsSgf();
      return;
    }

    if (currentFile.googleDriveFileId != null) {
      await handleSaveSgfToGoogleDrive();
      return;
    }

    await exportSgfFile(currentFile.name, {electronFilePath: currentFile.electronFilePath});
  }

  async function handleSaveAsSgf(): Promise<void> {
    const fileName =
      capabilities.storage === 'filesystem'
        ? currentSgfFileName(currentFile, gameInfo.GN)
        : await promptSaveFileName({
            title: t('menu.saveAs'),
            initialValue: currentSgfFileName(currentFile, gameInfo.GN),
            okText: t('action.save'),
            cancelText: t('action.cancel'),
          });
    if (fileName == null) return;

    await exportSgfFile(fileName, {saveAs: true});
  }

  async function handleSaveSgfToGoogleDrive(): Promise<void> {
    const fileName = currentSgfFileName(currentFile, gameInfo.GN);
    const showPendingDialog = capabilities.platform === 'electron';
    if (showPendingDialog) setGoogleDrivePending('save');
    try {
      const result = await saveSgfToGoogleDrive({
        platform: capabilities.platform,
        content: serializeSgf(document),
        fileName,
        fileId: currentFile?.googleDriveFileId,
      });
      if (result == null) return;
      setCurrentFile({name: result.fileName, googleDriveFileId: result.fileId});
      message.success(t('menu.savedToGoogleDrive'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('menu.googleDriveFailed'));
    } finally {
      if (showPendingDialog) setGoogleDrivePending(null);
    }
  }

  async function exportSgfFile(
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
        message.error(error instanceof Error ? error.message : t('menu.exportFailed'));
      }
      return;
    }

    const blob = new Blob([content], {type: 'application/x-go-sgf;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = normalizeSgfFileName(fileName);
    link.click();
    URL.revokeObjectURL(url);
    setCurrentFile({name: normalizeSgfFileName(fileName)});
  }

  async function handleImportSgfFromMenu(): Promise<void> {
    if (capabilities.storage === 'filesystem' && window.ulugo != null) {
      try {
        const result = await window.ulugo.importSgf();
        if (result == null) return;
        importSgfText(result.content, result.fileName, {
          name: result.fileName,
          electronFilePath: result.filePath,
        });
      } catch (error) {
        message.error(error instanceof Error ? error.message : t('menu.importFailed'));
      }
      return;
    }

    fileInputRef.current?.click();
  }

  async function handleImportSgfFromGoogleDrive(): Promise<void> {
    const showPendingDialog = capabilities.platform === 'electron';
    if (showPendingDialog) setGoogleDrivePending('open');
    try {
      const result = await openSgfFromGoogleDrive(capabilities.platform);
      if (result == null) return;
      importSgfText(result.content, result.fileName, {
        name: result.fileName,
        googleDriveFileId: result.fileId,
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('menu.googleDriveFailed'));
    } finally {
      if (showPendingDialog) setGoogleDrivePending(null);
    }
  }

  async function handleImportSgf(file: File | undefined): Promise<void> {
    if (file == null) return;

    try {
      const text = await readGameRecordFile(file);
      importSgfText(text, file.name, {name: file.name});
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('menu.importFailed'));
    } finally {
      if (fileInputRef.current != null) fileInputRef.current.value = '';
    }
  }

  function handleBoardDragOver(event: DragEvent<HTMLElement>): void {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
  }

  function handleBoardDrop(event: DragEvent<HTMLElement>): void {
    if (!hasDraggedFiles(event.dataTransfer)) return;

    event.preventDefault();
    const file = Array.from(event.dataTransfer.files).find((item) => isGameRecordFile(item.name));
    void handleImportSgf(file);
  }

  function importSgfText(text: string, fileName: string, metadata: CurrentFileMetadata): void {
    const importedDocument = withImportedGameName(parseGameRecord(text, fileName), fileName);
    branchMemoryRef.current.clear();
    setCurrentFile(metadata);
    setAnalysisModeActive(capabilities.katago && analysisSettings.mode === 'review' && analysisSettings.autoAnalyze);
    replaceDocument(importedDocument, [], {clearAnalysisCache: true});
  }

  function handleReviewEditModeChange(mode: AnalysisSettings['mode']): void {
    if (mode === analysisSettings.mode) return;
    updateAnalysisSettings({mode});
    if (!capabilities.katago) return;
    if (mode === 'edit') {
      setAnalysisModeActive(false);
    } else if (analysisSettings.autoAnalyze) {
      setAnalysisModeActive(true);
    }
  }

  function handleCommentChange(value: string): void {
    replaceDocument(updateComment(document, path, value), path);
  }

  const navigateToFirst = useCallback(() => {
    selectPath([]);
  }, [document, path]);

  const navigatePrevious = useCallback(
    (steps = 1) => {
      rememberPath(path);
      selectPath(path.slice(0, Math.max(0, path.length - steps)));
    },
    [document, path]
  );

  const navigateNext = useCallback(
    (steps = 1) => {
      selectPath(nextRememberedPath(document, path, steps, branchMemoryRef.current));
    },
    [document, path]
  );

  const navigateFirstChild = useCallback(
    (steps = 1) => {
      selectPath(nextFirstChildPath(document, path, steps));
    },
    [document, path]
  );

  const navigateToLast = useCallback(() => {
    selectPath(nextRememberedPath(document, path, Infinity, branchMemoryRef.current));
  }, [document, path]);

  const navigateBranch = useCallback(
    (direction: -1 | 1, steps = 1) => {
      const currentCell = treeLayout.cells.find((cell) => samePath(cell.path, path));
      if (currentCell == null) return;

      const rowCells = treeLayout.cells
        .filter((cell) => cell.row === currentCell.row)
        .sort((left, right) => left.column - right.column);
      const index = rowCells.findIndex((cell) => samePath(cell.path, path));
      const nextIndex = !Number.isFinite(steps)
        ? direction < 0
          ? 0
          : rowCells.length - 1
        : Math.max(0, Math.min(rowCells.length - 1, index + direction * steps));
      const nextPath = rowCells[nextIndex]?.path;
      if (nextPath == null) return;

      selectPath(nextPath);
    },
    [document, path, treeLayout]
  );

  function handleToolChange(nextTool: EditorTool): void {
    if (!showMarkup && isMarkupTool(nextTool)) return;
    if (nextTool === 'replace') {
      if (tool === 'replace') return;
      if (!hasReplaceableContinuation(document, path, branchMemoryRef.current)) return;
      setAnalysisModeActive(false);
      setAutoColorOverride(null);
      setReplaceMoveState({originalPath: path, replacementPath: path});
      setTool('replace');
      return;
    }

    if (tool === 'replace') {
      setReplaceMoveState(null);
      setTool(nextTool);
      if (nextTool !== 'auto') setAutoColorOverride(null);
      return;
    }

    if (nextTool !== tool) selectPath(path, {keepAutoColorOverride: nextTool === 'auto'});
    setReplaceMoveState(null);
    setTool(nextTool);
    if (nextTool !== 'auto') setAutoColorOverride(null);
  }

  function handleAutoToolClick(): void {
    setReplaceMoveState(null);
    if (tool !== 'auto') {
      selectPath(path);
      setTool('auto');
      return;
    }

    setAutoColorOverride((current) => {
      const visibleColor = current ?? position.nextColor;
      return visibleColor === 'B' ? 'W' : 'B';
    });
  }

  const canNavigatePrevious = path.length > 0;
  const canNavigateNext = getNodeAtPath(document, path).children.length > 0;
  const canReplaceMove =
    tool === 'replace' && replaceMoveState != null && samePath(path, replaceMoveState.replacementPath)
      ? hasReplaceableContinuation(document, replaceMoveState.originalPath, branchMemoryRef.current)
      : hasReplaceableContinuation(document, path, branchMemoryRef.current);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (isModalOpen() || isPopupOpen()) return;

      const shortcutAction = shortcutActionForEvent(event, keyboardShortcuts);
      if (shortcutAction == null) return;

      const action = shortcutActions.find((item) => item.id === shortcutAction);
      if (action?.electronOnly === true && !capabilities.katago) return;
      if (isTextInputActive() && (action?.navigation === true || !(event.ctrlKey || event.metaKey || event.altKey)))
        return;

      const steps = event.ctrlKey || event.metaKey ? Infinity : event.shiftKey ? 10 : 1;
      event.preventDefault();

      switch (shortcutAction) {
        case 'open':
          void handleImportSgfFromMenu();
          break;
        case 'save':
          void handleSaveSgf();
          break;
        case 'gameInfo':
          setGameInfoOpen(true);
          break;
        case 'previousMove':
          navigatePrevious(steps);
          break;
        case 'nextMoveMain':
          navigateFirstChild(steps);
          break;
        case 'nextMoveCurrent':
          navigateNext(steps);
          break;
        case 'previousBranch':
          navigateBranch(-1, steps);
          break;
        case 'nextBranch':
          navigateBranch(1, steps);
          break;
        case 'playBestMove':
          handlePlayBestAnalysisMove();
          break;
        case 'pass':
          handlePass();
          break;
        case 'toolAuto':
          handleToolChange('auto');
          break;
        case 'toolBlack':
          handleToolChange('black');
          break;
        case 'toolWhite':
          handleToolChange('white');
          break;
        case 'replaceMove':
          if (canReplaceMove) handleToolChange('replace');
          break;
        case 'addLabel':
          handleToolChange('alphabet');
          break;
        case 'addCircle':
          handleToolChange('circle');
          break;
        case 'addSquare':
          handleToolChange('square');
          break;
        case 'addTriangle':
          handleToolChange('triangle');
          break;
        case 'addCross':
          handleToolChange('cross');
          break;
        case 'eraseMarkup':
          handleToolChange('erase');
          break;
        case 'moveBranchToMain':
          if (path.length > 0) handleMoveBranchToMain();
          break;
        case 'moveBranchLeft':
          if (path.length > 0) handleMoveBranchLeft();
          break;
        case 'moveBranchRight':
          if (path.length > 0) handleMoveBranchRight();
          break;
        case 'deleteBranch':
          if (path.length > 0) handleDeleteNode();
          break;
        case 'toggleShowCoordinates':
          setShowCoordinates((current) => !current);
          break;
        case 'toggleShowNextMove':
          updateAnalysisSettings({showNextMove: !analysisSettings.showNextMove});
          break;
        case 'toggleReviewEditMode':
          handleReviewEditModeChange(analysisSettings.mode === 'review' ? 'edit' : 'review');
          break;
        case 'toggleDisplayDot':
          updateAnalysisSettings({stoneOverlay: analysisSettings.stoneOverlay === 'dot' ? 'none' : 'dot'});
          break;
        case 'toggleDisplayNumber':
          updateAnalysisSettings({stoneOverlay: analysisSettings.stoneOverlay === 'number' ? 'none' : 'number'});
          break;
        case 'toggleTerritory':
          updateAnalysisSettings({showExpectedTerritory: !analysisSettings.showExpectedTerritory});
          break;
        case 'toggleScore':
          updateAnalysisSettings({showScore: !analysisSettings.showScore, showComments: false});
          break;
        case 'togglePointLoss':
          updateAnalysisSettings({showPointLoss: !analysisSettings.showPointLoss, showComments: false});
          break;
        case 'toggleWinrate':
          updateAnalysisSettings({showWinrate: !analysisSettings.showWinrate, showComments: false});
          break;
        case 'toggleComments':
          updateAnalysisSettings({
            showScore: false,
            showPointLoss: false,
            showWinrate: false,
            showComments: true,
          });
          break;
        case 'toggleAnalysisMode':
          if (tool === 'replace') {
            setReplaceMoveState(null);
            setTool('auto');
          }
          toggleAnalysisMode();
          break;
        case 'toggleDeepAnalysisMode':
          if (tool === 'replace') {
            setReplaceMoveState(null);
            setTool('auto');
          }
          toggleDeepAnalysisMode();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    analysisSettings.autoAnalyze,
    analysisSettings.mode,
    analysisSettings.showExpectedTerritory,
    analysisSettings.showComments,
    analysisSettings.showNextMove,
    analysisSettings.showPointLoss,
    analysisSettings.showScore,
    analysisSettings.showTopMoves,
    analysisSettings.showWinrate,
    analysisSettings.stoneOverlay,
    boardSize,
    canReplaceMove,
    capabilities.katago,
    currentAnalysis,
    document,
    keyboardShortcuts,
    navigateBranch,
    navigateFirstChild,
    navigateNext,
    navigatePrevious,
    path,
    position.nextColor,
    tool,
    toggleDeepAnalysisMode,
    toggleAnalysisMode,
    updateAnalysisSettings,
  ]);

  function handleAnalysisButtonClick(event: MouseEvent<HTMLElement>): void {
    if (tool === 'replace') {
      setReplaceMoveState(null);
      setTool('auto');
    }

    if (event.shiftKey) {
      toggleDeepAnalysisMode();
    } else {
      toggleAnalysisMode();
    }
  }

  function handleBoardClick(point: string, options: BoardVertexClickOptions, colorOverride?: SgfColor): void {
    if (options.shiftKey || options.clickCount > 1) {
      const nextPath = position.stones.has(point)
        ? findCurrentStoneMovePath(document, path, point)
        : options.shiftKey
          ? findFutureMovePath(document, path, point, branchMemoryRef.current)
          : null;
      if (nextPath != null) selectPath(nextPath);
      return;
    }

    if (tool === 'replace') {
      const result = replaceNextMoveBranch({
        document,
        path,
        point,
        rules: gameInfo.RU,
        branchMemory: branchMemoryRef.current,
        state: replaceMoveState,
      });
      if (result == null) return;

      replaceDocument(result.document, result.path, {invalidatePath: result.path, replaceMoveState: result.state});
      playPlaceStoneSound();
      return;
    }

    if (tool === 'auto') {
      if (position.stones.has(point)) return;
      const color = nextAutoColor;
      const existingChildPath = findChildMovePath(document, path, color, point);
      if (existingChildPath != null) {
        selectPath(existingChildPath);
        return;
      }

      if (!isLegalMove(position, color, point, gameInfo.RU)) return;
      const result = addMove(document, path, color, point);
      replaceDocument(result.document, result.path);
      playPlaceStoneSound();
      return;
    }

    if (tool === 'black' || tool === 'white' || colorOverride != null) {
      const color = colorOverride ?? (tool === 'black' ? 'B' : 'W');
      if (path.length === 0 && getNodeAtPath(document, path).children.length === 0) {
        if (position.stones.has(point) && !isCurrentSetupStone(document, path, point)) return;

        const result = addSetupStoneToPath(document, path, color, point);
        replaceDocument(result.document, result.path, {invalidatePath: result.path, pendingSetupPath: result.path});
        if (result.placed) {
          playPlaceStoneSound();
          setAutoColorOverride(oppositeColor(color));
        }
        return;
      }

      if (position.stones.has(point)) return;
      const existingChildPath = findChildMovePath(document, path, color, point);
      if (existingChildPath != null) {
        selectPath(existingChildPath);
        return;
      }

      if (!isLegalMove(position, color, point, gameInfo.RU)) return;
      const result = addMove(document, path, color, point);
      replaceDocument(result.document, result.path);
      playPlaceStoneSound();
      return;
    }

    if (tool === 'erase') {
      replaceDocument(eraseMarkup(document, path, point), path, {invalidatePath: path});
      return;
    }

    if (!showMarkup && isMarkupTool(tool)) return;

    if (tool === 'alphabet') {
      const value = labelText.trim();
      if (value === '') return;
      replaceDocument(addLabel(document, path, point, value), path);
      setLabelText(nextLabelText(value));
      return;
    }

    const markup = toolToMarkup(tool);
    if (markup != null) replaceDocument(addMarkup(document, path, markup, point), path);
  }

  function handleBoardRightClick(point: string): void {
    if (tool !== 'black' && tool !== 'white') return;
    handleBoardClick(point, {shiftKey: false, clickCount: 1}, tool === 'black' ? 'W' : 'B');
  }

  function handlePlayBestAnalysisMove(): void {
    const bestMove = currentAnalysis?.moveInfos?.[0]?.move;
    if (bestMove == null) return;

    const point = bestMove.toLowerCase() === 'pass' ? '' : gtpMoveToPoint(bestMove, boardSize);
    if (point == null || position.stones.has(point)) return;

    const existingChildPath = findChildMovePath(document, path, position.nextColor, point);
    if (existingChildPath != null) {
      selectPath(existingChildPath);
      return;
    }

    if (!isLegalMove(position, position.nextColor, point, gameInfo.RU)) return;
    const result = addMove(document, path, position.nextColor, point);
    replaceDocument(result.document, result.path);
    if (point !== '') playPlaceStoneSound();
  }

  function handlePass(): void {
    if (tool === 'replace') {
      const result = replaceNextMoveBranch({
        document,
        path,
        point: '',
        rules: gameInfo.RU,
        branchMemory: branchMemoryRef.current,
        state: replaceMoveState,
      });
      if (result == null) return;

      replaceDocument(result.document, result.path, {invalidatePath: result.path, replaceMoveState: result.state});
      return;
    }

    const result = addMove(document, path, nextAutoColor, '');
    replaceDocument(result.document, result.path);
  }

  function handleMoveBranchToMain(): void {
    const result = moveBranchToMain(document, path);
    replaceDocument(result.document, result.path);
  }

  function handleMoveBranchLeft(): void {
    const result = moveBranch(document, path, -1);
    replaceDocument(result.document, result.path);
  }

  function handleMoveBranchRight(): void {
    const result = moveBranch(document, path, 1);
    replaceDocument(result.document, result.path);
  }

  function handleDeleteNode(): void {
    if (getNodeAtPath(document, path).children.length > 0) {
      Modal.confirm({
        title: t('treeActions.deleteConfirmTitle'),
        content: t('treeActions.deleteConfirmContent'),
        okText: t('action.ok'),
        cancelText: t('action.cancel'),
        okButtonProps: {danger: true},
        onOk: () => {
          const result = deleteNode(document, path);
          replaceDocument(result.document, result.path);
        },
      });
      return;
    }

    const result = deleteNode(document, path);
    replaceDocument(result.document, result.path);
  }

  function handleLanguageChange(language: AppLanguage): void {
    saveLanguage(language);
    void i18n.changeLanguage(language);
  }

  function handleKeyboardShortcutsApply(next: KeyboardShortcutConfig): void {
    writeKeyboardShortcuts(next);
    setKeyboardShortcuts(next);
    setKeyboardShortcutsOpen(false);
  }

  function openKeyboardShortcuts(): void {
    setSettingsOpen(false);
    setKeyboardShortcutsOpen(true);
  }

  function cancelGoogleDriveOperation(): void {
    void window.ulugo?.googleDrive.cancel();
  }

  function handleAppClickCapture(): void {
    window.requestAnimationFrame(blurNonTextControlFocus);
  }

  return (
    <ConfigProvider
      locale={antdLocale}
      componentSize="small"
      theme={{
        algorithm: [theme.defaultAlgorithm, theme.compactAlgorithm],
        components: {
          Button: {
            defaultHoverBorderColor: '#dc8916',
            defaultHoverColor: '#dc8916',
          },
          Radio: {
            colorPrimary: '#dc8916',
          },
        },
        token: {
          colorPrimary: '#f4b458',
          borderRadius: 6,
          fontFamily: appFontFamily,
        },
      }}
    >
      <Modal
        open={googleDrivePending != null}
        title={t('googleDrive.waitingTitle')}
        footer={
          <Button size="small" onClick={cancelGoogleDriveOperation}>
            {t('action.cancel')}
          </Button>
        }
        closable={false}
        keyboard={false}
        maskClosable={false}
      >
        {googleDrivePending === 'open' ? t('googleDrive.openWaiting') : t('googleDrive.saveWaiting')}
      </Modal>
      <Layout className="app-shell" onClickCapture={handleAppClickCapture}>
        <Header className="app-header">
          <div className="menu-row">
            <div className="app-title">{appTitle}</div>
            <Space wrap>
              <Dropdown.Button
                size="small"
                icon={<FileAddOutlined />}
                menu={{
                  items: newMenuItems,
                  onClick: (info) => handleNew(Number(info.key) as BoardSize),
                }}
                onClick={() => handleNew(19)}
              >
                {t('menu.new')}
              </Dropdown.Button>
              <Dropdown.Button
                size="small"
                icon={<FolderOpenOutlined />}
                menu={{
                  items: openMenuItems,
                  onClick: (info) => {
                    if (info.key === 'googleDrive') void handleImportSgfFromGoogleDrive();
                  },
                }}
                onClick={() => void handleImportSgfFromMenu()}
              >
                {t('menu.importSgf')}
              </Dropdown.Button>
              <Dropdown.Button
                size="small"
                icon={<SaveOutlined />}
                menu={{
                  items: saveMenuItems,
                  onClick: (info) => {
                    if (info.key === 'saveAs') {
                      void handleSaveAsSgf();
                    } else if (info.key === 'googleDrive') {
                      void handleSaveSgfToGoogleDrive();
                    }
                  },
                }}
                onClick={() => void handleSaveSgf()}
              >
                {t('menu.exportSgf')}
              </Dropdown.Button>
              <Button size="small" icon={<InfoCircleOutlined />} onClick={() => setGameInfoOpen(true)}>
                {t('menu.editGameInfo')}
              </Button>
              {capabilities.katago ? (
                <Button size="small" icon={<ToolOutlined />} onClick={() => setKataGoSettingsOpen(true)}>
                  {t('katago.button')}
                </Button>
              ) : null}
              <Button size="small" icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>
                {t('settings.title')}
              </Button>
            </Space>
          </div>
          <EditorToolbar
            tool={tool}
            nextColor={nextAutoColor}
            canNavigatePrevious={canNavigatePrevious}
            canNavigateNext={canNavigateNext}
            canReplaceMove={canReplaceMove}
            showMarkup={showMarkup}
            labelText={labelText}
            shortcutLabels={shortcutLabels}
            onToolChange={handleToolChange}
            onLabelTextChange={setLabelText}
            onAutoToolClick={handleAutoToolClick}
            onPass={handlePass}
            onFirst={navigateToFirst}
            onPrevious10={() => navigatePrevious(10)}
            onPrevious={() => navigatePrevious()}
            onNext={() => navigateNext()}
            onNext10={() => navigateNext(10)}
            onLast={navigateToLast}
            extraEnd={
              <Space className="analysis-toolbar-options">
                {capabilities.katago ? (
                  <span className="analysis-toolbar-option-group">
                    <span>{t('analysis.mode')}</span>
                    <Radio.Group
                      size="medium"
                      optionType="button"
                      value={analysisSettings.mode}
                      onChange={(event) => handleReviewEditModeChange(event.target.value as AnalysisSettings['mode'])}
                      options={[
                        {
                          value: 'review',
                          label: (
                            <>
                              <StockOutlined /> {t('analysis.reviewMode')}
                            </>
                          ),
                        },
                        {
                          value: 'edit',
                          label: (
                            <>
                              <EditOutlined /> {t('analysis.editMode')}
                            </>
                          ),
                        },
                      ]}
                    />
                  </span>
                ) : null}
                <span className="analysis-toolbar-option-group">
                  <span>{t('analysis.stoneOverlay')}</span>
                  <Segmented
                    size="medium"
                    shape="round"
                    value={stoneOverlayDisplay}
                    onChange={(value) =>
                      updateAnalysisSettings({stoneOverlay: value as AnalysisSettings['stoneOverlay']})
                    }
                    options={
                      capabilities.katago
                        ? [
                            {value: 'dot', icon: <CheckCircleFilled />, tooltip: {title: t('analysis.dot')}},
                            {
                              value: 'number',
                              icon: <FieldBinaryOutlined />,
                              tooltip: {title: t('analysis.moveNumber')},
                            },
                            {value: 'none', icon: <CloseOutlined />, tooltip: {title: t('analysis.none')}},
                          ]
                        : [
                            {
                              value: 'number',
                              icon: <FieldBinaryOutlined />,
                              tooltip: {title: t('analysis.moveNumber')},
                            },
                            {value: 'none', icon: <CloseOutlined />, tooltip: {title: t('analysis.none')}},
                          ]
                    }
                  />
                </span>
                <Checkbox
                  checked={analysisSettings.showMarkup}
                  onChange={(event) => updateAnalysisSettings({showMarkup: event.target.checked})}
                >
                  {t('settings.showMarkup')}
                </Checkbox>
                <Checkbox
                  checked={analysisSettings.showNextMove}
                  onChange={(event) => updateAnalysisSettings({showNextMove: event.target.checked})}
                >
                  {t('analysis.nextMove')}
                </Checkbox>
                {capabilities.katago ? (
                  <Checkbox
                    checked={analysisSettings.showExpectedTerritory}
                    onChange={(event) => updateAnalysisSettings({showExpectedTerritory: event.target.checked})}
                  >
                    {t('analysis.expectedTerritory')}
                  </Checkbox>
                ) : null}
              </Space>
            }
          />
        </Header>
        <Content className="app-content">
          {capabilities.katago ? (
            <aside className="left-panel">
              <div className="katago-console-header">
                <h2>{t('panels.katagoConsole')}</h2>
                <Button size="small" onClick={() => setKataGoConsoleMessages([])}>
                  {t('action.clear')}
                </Button>
              </div>
              <div className="katago-console-log" ref={kataGoConsoleRef}>
                {kataGoConsoleMessages.length === 0 ? (
                  <div className="katago-console-empty">{t('katago.consoleEmpty')}</div>
                ) : (
                  kataGoConsoleMessages.map((item) => (
                    <div key={item.id} className={`katago-console-line ${item.level}`}>
                      <div className="katago-console-meta">
                        <span className="katago-console-time">{formatConsoleTime(item.time)}</span>
                        <span className={`katago-console-source ${item.source}`}>{item.source}</span>
                      </div>
                      <div className="katago-console-text">{item.text}</div>
                    </div>
                  ))
                )}
              </div>
            </aside>
          ) : capabilities.platform === 'web' ? (
            <aside className="left-panel web-ad-panel">
              <GoogleAd />
              <div className="policy-links">
                <Button type="link" href={privacyPolicyUrl} target="_blank" rel="noreferrer">
                  Privacy Policy
                </Button>
                <Button type="link" href={termsOfServiceUrl} target="_blank" rel="noreferrer">
                  Terms of Service
                </Button>
              </div>
            </aside>
          ) : null}
          <main
            className="board-region"
            onDragOver={handleBoardDragOver}
            onDrop={handleBoardDrop}
            onWheel={(event) => {
              if (event.deltaY > 0) navigateNext();
              if (event.deltaY < 0) navigatePrevious();
            }}
          >
            <GoBoard
              document={document}
              path={path}
              showCoordinates={showCoordinates}
              showMarkup={showMarkup}
              moveNumberLimit={boardMoveNumberLimit}
              analysis={currentAnalysis}
              stoneScoreDeltas={stoneScoreDeltas}
              analysisSettings={analysisSettings}
              boardBackground={boardBackground}
              onVertexClick={handleBoardClick}
              onVertexRightClick={handleBoardRightClick}
            />
            {capabilities.katago ? (
              <Button
                className={[
                  'analysis-button',
                  analysisMode ? 'analysis-button-active' : '',
                  analysisDeepMode ? 'analysis-button-deep' : analysisIdle ? 'analysis-button-idle' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                icon={<ThunderboltOutlined />}
                type={analysisMode ? 'primary' : 'default'}
                title={t('analysis.button')}
                onClick={handleAnalysisButtonClick}
              >
                {analysisMode ? <span>{fastAnalysisPendingCount}</span> : ''}
              </Button>
            ) : null}
          </main>
          <aside className="right-region">
            <section className="capture-summary">
              <span className="capture-player">
                <span className="capture-name">{blackPlayerName}</span>
                <span className="capture-loss">−</span>
                <span className="capture-count capture-count-black">{position.captures.W}</span>
              </span>
              <span className="capture-player">
                <span className="capture-name">{whitePlayerName}</span>
                <span className="capture-loss">−</span>
                <span className="capture-count capture-count-white">{position.captures.B}</span>
              </span>
            </section>
            <CommentsPanel
              value={getComment(document, path)}
              onChange={handleCommentChange}
              showAnalysisControls={capabilities.katago}
              chartData={analysisChartData}
              moveDisplay={analysisSettings.moveDisplay}
              showScore={analysisSettings.showScore}
              showPointLoss={analysisSettings.showPointLoss}
              showWinrate={analysisSettings.showWinrate}
              showComments={analysisSettings.showComments}
              selectedMoveNumber={capabilities.katago ? selectedChartMoveNumber : path.length}
              chartSummary={analysisChartSummary}
              onDisplayChange={updateAnalysisSettings}
              onPreviousMove={() => navigatePrevious()}
              onNextMove={() => navigateNext()}
              onSelectChartMove={(moveNumber) => {
                const nextPath = analysisChartPaths[moveNumber];
                if (nextPath == null) return;
                selectPath(nextPath);
              }}
            />
            <SgfTreePanel
              document={document}
              selectedPath={path}
              onSelectPath={(nextPath) => {
                selectPath(nextPath);
              }}
              onMoveToMain={handleMoveBranchToMain}
              onMoveLeft={handleMoveBranchLeft}
              onMoveRight={handleMoveBranchRight}
              onDelete={handleDeleteNode}
              onPreviousMove={() => navigatePrevious()}
              onNextMove={() => navigateNext()}
              shortcutLabels={shortcutLabels}
            />
          </aside>
        </Content>
      </Layout>
      <input
        ref={fileInputRef}
        className="hidden-file-input"
        type="file"
        accept=".sgf,.gib,application/x-go-sgf,text/plain"
        onChange={(event) => void handleImportSgf(event.target.files?.[0])}
      />
      {capabilities.katago ? (
        <KataGoSettingsModal
          open={kataGoSettingsOpen}
          onCancel={() => {
            setKataGoSettingsOpen(false);
            void refreshKataGoSettings();
          }}
        />
      ) : null}
      <SettingsModal
        open={settingsOpen}
        settings={analysisSettings}
        language={currentLanguage}
        showCoordinates={showCoordinates}
        playStoneSound={playStoneSound}
        showKataGoAnalysisSettings={capabilities.katago}
        onCancel={() => setSettingsOpen(false)}
        onAnalysisSettingsChange={updateAnalysisSettings}
        onLanguageChange={handleLanguageChange}
        onShowCoordinatesChange={setShowCoordinates}
        onPlayStoneSoundChange={setPlayStoneSound}
        onKeyboardShortcutsClick={openKeyboardShortcuts}
      />
      <KeyboardShortcutsModal
        open={keyboardShortcutsOpen}
        shortcuts={keyboardShortcuts}
        showElectronShortcuts={capabilities.katago}
        onApply={handleKeyboardShortcutsApply}
        onCancel={() => setKeyboardShortcutsOpen(false)}
      />
      <GameInfoModal
        open={gameInfoOpen}
        values={gameInfo}
        onCancel={() => setGameInfoOpen(false)}
        onSave={(values) => {
          replaceDocument(updateGameInfo(document, values), path, {clearAnalysisCache: true});
          setGameInfoOpen(false);
        }}
      />
    </ConfigProvider>
  );
}

function replaceNextMoveBranch({
  document,
  path,
  point,
  rules,
  branchMemory,
  state,
}: {
  document: SgfDocument;
  path: number[];
  point: string;
  rules?: string;
  branchMemory: Map<string, number>;
  state: ReplaceMoveState | null;
}): {document: SgfDocument; path: number[]; state: ReplaceMoveState} | null {
  if (state == null || !samePath(path, state.replacementPath)) return null;

  const originalNextPath = nextOriginalBranchPath(document, state.originalPath, branchMemory);
  if (originalNextPath == null) return null;

  const originalMove = nodeMove(getNodeAtPath(document, originalNextPath));
  if (originalMove == null) return null;

  const position = deriveBoardPosition(document, path);
  if (!isLegalMove(position, originalMove.color, point, rules)) return null;

  const next = cloneDocument(document);
  const parent = getNodeAtPath(next, path);
  const replacesOriginalBranch = samePath(path, state.originalPath);
  if (!replacesOriginalBranch) parent.children = [];

  const child = createNode({[originalMove.color]: [point]});
  const insertIndex = replacesOriginalBranch ? originalNextPath[originalNextPath.length - 1] : 0;
  parent.children.splice(insertIndex, 0, child);
  const nextPath = [...path, insertIndex];
  const nextOriginalPath = replacesOriginalBranch ? [...path, insertIndex + 1] : originalNextPath;

  copyOriginalContinuation(next, nextPath, document, originalNextPath, rules, branchMemory);

  return {
    document: next,
    path: nextPath,
    state: {originalPath: nextOriginalPath, replacementPath: nextPath},
  };
}

function copyOriginalContinuation(
  targetDocument: SgfDocument,
  targetPath: number[],
  sourceDocument: SgfDocument,
  sourcePath: number[],
  rules: string | undefined,
  branchMemory: Map<string, number>
): void {
  let currentTargetPath = targetPath;
  let currentSourcePath = sourcePath;

  while (true) {
    const nextSourcePath = nextOriginalBranchPath(sourceDocument, currentSourcePath, branchMemory);
    if (nextSourcePath == null) return;

    const sourceNode = getNodeAtPath(sourceDocument, nextSourcePath);
    const move = nodeMove(sourceNode);
    if (move == null) return;

    const position = deriveBoardPosition(targetDocument, currentTargetPath);
    if (!isLegalMove(position, move.color, move.point, rules)) return;

    const targetParent = getNodeAtPath(targetDocument, currentTargetPath);
    targetParent.children.push(createNode(cloneNodeData(sourceNode)));
    currentTargetPath = [...currentTargetPath, targetParent.children.length - 1];
    currentSourcePath = nextSourcePath;
  }
}

function nextOriginalBranchPath(
  document: SgfDocument,
  path: number[],
  branchMemory: Map<string, number>
): number[] | null {
  const node = getNodeAtPath(document, path);
  if (node.children.length === 0) return null;

  const remembered = branchMemory.get(pathKey(path)) ?? 0;
  const childIndex = node.children[remembered] == null ? 0 : remembered;
  return [...path, childIndex];
}

function hasReplaceableContinuation(document: SgfDocument, path: number[], branchMemory: Map<string, number>): boolean {
  const nextPath = nextOriginalBranchPath(document, path, branchMemory);
  return nextPath != null && nextOriginalBranchPath(document, nextPath, branchMemory) != null;
}

function nodeMove(node: SgfNode): {color: SgfColor; point: string} | null {
  const color: SgfColor | null = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
  return color == null ? null : {color, point: node.data[color]?.[0] ?? ''};
}

function cloneNodeData(node: SgfNode): Record<string, string[]> {
  return Object.fromEntries(Object.entries(node.data).map(([key, values]) => [key, [...values]]));
}

function hasDraggedFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes('Files');
}

function gtpMoveToPoint(move: string, size: number): string | null {
  const match = /^([A-Za-z])(\d+)$/.exec(move);
  if (match == null) return null;

  const x = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'.indexOf(match[1].toUpperCase());
  const y = size - Number(match[2]);
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return vertexToPoint(x, y);
}

function currentSgfFileName(currentFile: CurrentFileMetadata | null, gameName: string): string {
  if (currentFile != null) return normalizeSgfFileName(currentFile.name);
  return `${safeFileName(gameName || 'game')}.sgf`;
}

function normalizeSgfFileName(fileName: string): string {
  const normalized = safeFileName(fileName.replace(/\.(sgf|gib)$/i, ''));
  return `${normalized}.sgf`;
}

function promptSaveFileName({
  title,
  initialValue,
  okText,
  cancelText,
}: {
  title: string;
  initialValue: string;
  okText: string;
  cancelText: string;
}): Promise<string | null> {
  let value = initialValue;

  return new Promise((resolve) => {
    Modal.confirm({
      title,
      icon: null,
      content: (
        <Input
          autoFocus
          defaultValue={initialValue}
          onChange={(event) => {
            value = event.target.value;
          }}
        />
      ),
      okText,
      cancelText,
      onOk: () => resolve(normalizeSgfFileName(value)),
      onCancel: () => resolve(null),
    });
  });
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    if (value == null) return fallback;
    return value === 'true';
  } catch {
    return fallback;
  }
}

function resolveBoardBackground(
  boardBackground: AnalysisSettings['boardBackground'],
  useNaturalBackground: boolean
): Exclude<AnalysisSettings['boardBackground'], 'auto'> {
  if (boardBackground === 'auto') return useNaturalBackground ? 'natural' : 'golden';
  return boardBackground;
}

function writeStoredBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage failures; the current session state is still updated.
  }
}

function isMarkupTool(tool: EditorTool): boolean {
  return tool === 'alphabet' || tool === 'circle' || tool === 'square' || tool === 'triangle' || tool === 'cross';
}

function nextLabelText(value: string): string {
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

  return String.fromCharCode(baseCode) + codes.map((code) => String.fromCharCode(baseCode + code)).join('');
}
