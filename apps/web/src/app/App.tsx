import {Button, ConfigProvider, Layout, Modal} from 'antd';
import {MenuFoldOutlined, MenuUnfoldOutlined} from '@ant-design/icons';
import {
  addMove,
  addScoringNode,
  addSetupNode,
  addSetupStone,
  createNewGame,
  deleteNode,
  eraseAllMarkup,
  getComment,
  getBoardSize,
  getGameInfo,
  getNodeAtPath,
  buildTree,
  isScoringNode,
  moveBranch,
  moveBranchToMain,
  pruneBranch,
  parseSgf,
  samePath,
  serializeSgf,
  updateComment,
  updateGameInfo,
  updateScoringPoints,
  updateSetupNextColor,
  type SgfColor,
  type SgfDocument,
} from '@ulugo/sgf-core';
import type {BoardSize} from '@ulugo/ui-shared';
import {lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent} from 'react';
import {useTranslation} from 'react-i18next';
import {deriveBoardPosition, isLegalMove} from '@ulugo/go-core';
import type {AnalysisSettings} from '@ulugo/analysis-core';
import stoneSoundUrl from '../assets/go_stone_light.wav';
import {AppBoardRegion} from '../features/app-shell/AppBoardRegion';
import {AppLeftPanel} from '../features/app-shell/AppLeftPanel';
import {AppMenuBar} from '../features/app-shell/AppMenuBar';
import {MinimalControl} from '../features/app-shell/MinimalControl';
import {AppRightPanel} from '../features/app-shell/AppRightPanel';
import {AppStatusModals} from '../features/app-shell/AppStatusModals';
import {AppToolbars} from '../features/app-shell/AppToolbars';
import type {BoardVertexClickOptions} from '../features/board/GoBoard';
import {GameInfoModal} from '../features/game-info/GameInfoModal';
import {SettingsModal} from '../features/settings/SettingsModal';
import {KataGoSettingsModal} from '../features/katago/KataGoSettingsModal';
import {layoutTree} from '../features/sgf-tree/layout';
import {KeyboardShortcutsModal} from '../features/shortcuts/KeyboardShortcutsModal';
import {PrintPreview} from '../features/print/PrintPreview';
import {AnalysisToolbarOptions} from '../features/toolbar/AnalysisToolbarOptions';
import {EditorToolbar} from '../features/toolbar/EditorToolbar';
import {ModeToolbarOptions} from '../features/toolbar/ModeToolbarOptions';
import {TipsDialog} from '../features/tips/TipsDialog';
import {createStartupTips, readTipsFirstTime, writeTipsWelcomeShown} from '../features/tips/tips';
import {
  readKeyboardShortcuts,
  shortcutActionForEvent,
  shortcutActions,
  shortcutLabel,
  writeKeyboardShortcuts,
  type KeyboardShortcutConfig,
  type ShortcutActionId,
} from '../features/shortcuts/keyboardShortcuts';
import type {EditorTool} from '../features/toolbar/types';
import {
  nextLabelText,
  recognizedSetupChanges,
  resolveBoardBackground,
  scoringOperationPath,
  selectedPathAfterDelete,
  shouldAutoEstimateRecognizedGame,
  shouldDeleteScoringNodeOnExit,
} from './appEditorUtils';
import {capabilities, isElectron, supportsCameraCapture} from './capabilities';
import {findChildMovePath, oppositeColor} from './sgfEditUtils';
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
import {blurNonTextControlFocus, isModalOpen, isPopupOpen, isTextInputActive} from './domUtils';
import {type AppLanguage, antdLocales, normalizeLanguage, saveLanguage} from './localizationUtils';
import {getAppFontFamily} from './fonts';
import {appTheme} from './appTheme';
import {
  confirmReplaceMove,
  createReplaceMoveState,
  deleteReplaceMove,
  futureReplaceMoveStones,
  gtpMoveToPoint,
  hasNonEmptyRootSetup,
  insertEmptyMoveZeroBeforeRootSetup,
  isSetupNode,
  replaceMoveForcesInsert,
  replaceMoveStateForSelection,
  replaceNextMoveBranch,
  type ReplaceMoveMode,
  type ReplaceMoveState,
} from './replaceMoveUtils';
import {readOpenLastSgfOnStartupPreference, useAppPreferences} from './useAppPreferences';
import {useGameRecordFiles} from './useGameRecordFiles';
import {useKataGoAnalysis} from './useKataGoAnalysis';
import {applyMarkupEdit, isMarkupTool, nodeHasMarkup, type MarkupAction} from './markupEditUtils';
import {createLocalConsoleMessage} from './katagoConsoleUtils';

const {Header, Content} = Layout;
const lastSgfStorageKey = 'ulugo.lastSgf';
const BoardRecognitionModal = lazy(() => import('../features/board-recognition/BoardRecognitionModal'));

interface StartupState {
  document: SgfDocument;
  path: number[];
  startedFromEmpty: boolean;
}

interface ReplaceMoveSnapshot {
  document: SgfDocument;
  path: number[];
  branchMemory: Map<string, number>;
}

interface ReplaceDocumentOptions {
  clearAnalysisCache?: boolean;
  convertHiddenPassPath?: number[];
  invalidateAnalysisPath?: number[];
  replaceMoveState?: ReplaceMoveState | null;
  resetSelectionMoved?: boolean;
}

interface DisplayScoringSummary {
  blackScoreText: string;
  whiteScoreText: string;
  result: string;
}

export function App() {
  const {t, i18n} = useTranslation();
  const [startupState] = useState(readStartupState);
  const [document, setDocument] = useState<SgfDocument>(startupState.document);
  const [path, setPath] = useState<number[]>(startupState.path);
  const [tool, setTool] = useState<EditorTool>('auto');
  const [labelText, setLabelText] = useState('A');
  const [autoColorOverride, setAutoColorOverride] = useState<'B' | 'W' | null>(null);
  const [replaceMoveState, setReplaceMoveState] = useState<ReplaceMoveState | null>(null);
  const markupActionRef = useRef<MarkupAction | null>(null);
  const {
    uiScale,
    setUiScale,
    showCoordinates,
    setShowCoordinates,
    playStoneSound,
    setPlayStoneSound,
    openLastSgfOnStartup,
    setOpenLastSgfOnStartup,
    showTipsOnStartup,
    setShowTipsOnStartup,
    leftPanelOpen,
    setLeftPanelOpen,
  } = useAppPreferences();
  const [tipsFirstTime] = useState(readTipsFirstTime);
  const [startupTips] = useState(() => createStartupTips(t, tipsFirstTime, capabilities.platform));
  const [tipsOpen, setTipsOpen] = useState(showTipsOnStartup);
  const [gameInfoOpen, setGameInfoOpen] = useState(false);
  const [kataGoSettingsOpen, setKataGoSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [recognitionImage, setRecognitionImage] = useState<File | null>(null);
  const [recognitionSetupMode, setRecognitionSetupMode] = useState(false);
  const [minimalRightPanelOpen, setMinimalRightPanelOpen] = useState(false);
  const [minimalBasicToolsOpen, setMinimalBasicToolsOpen] = useState(false);
  const [minimalShowCoordinates, setMinimalShowCoordinates] = useState(false);
  const [mobileHeaderRightOpen, setMobileHeaderRightOpen] = useState(false);
  const [selectionMoved, setSelectionMoved] = useState(false);
  const [kataGoAutotuningOpen, setKataGoAutotuningOpen] = useState(false);
  const [autoBoardBackgroundReady, setAutoBoardBackgroundReady] = useState(false);
  const [keyboardShortcuts, setKeyboardShortcuts] = useState(() => readKeyboardShortcuts());
  const stoneSoundRef = useRef<HTMLAudioElement | null>(null);
  const recordCameraInputRef = useRef<HTMLInputElement>(null);
  const branchMemoryRef = useRef(new Map<string, number>());
  const replaceMoveSnapshotRef = useRef<ReplaceMoveSnapshot | null>(null);
  const labelResetPathKeyRef = useRef(pathKey([]));
  const setupToolPathKeyRef = useRef(pathKey([]));
  const handledAutotuningMessageIdsRef = useRef(new Set<string>());
  const analysisButtonImportHintShownRef = useRef(false);
  const gameInfo = useMemo(() => getGameInfo(document), [document]);
  const boardSize = useMemo(() => getBoardSize(document), [document]);
  const currentNode = useMemo(() => getNodeAtPath(document, path), [document, path]);
  const selectedScoringNode = path.length > 0 && isScoringNode(currentNode);
  const operationPath = useMemo(() => scoringOperationPath(document, path), [document, path]);
  const position = useMemo(() => deriveBoardPosition(document, path), [document, path]);
  const [scoringSummary, setScoringSummary] = useState<DisplayScoringSummary | null>(null);
  const displayedComment = useMemo(() => {
    if (scoringSummary == null) return getComment(document, path);
    return [
      `${t('blackScore')}: ${scoringSummary.blackScoreText}`,
      `${t('whiteScore')}: ${scoringSummary.whiteScoreText}`,
      `${t('finalResult')}: ${scoringSummary.result}`,
    ].join('\n');
  }, [document, path, scoringSummary, t]);
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
  const futureMoveStones = useMemo(
    () =>
      tool === 'replace'
        ? futureReplaceMoveStones(document, operationPath, branchMemoryRef.current, replaceMoveState)
        : new Map<string, SgfColor>(),
    [document, operationPath, replaceMoveState, tool]
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
    let canceled = false;

    if (!selectedScoringNode) {
      setScoringSummary(null);
      return;
    }
    setScoringSummary(null);

    async function loadScoringSummary(): Promise<void> {
      const {formatScoringValue, scoringSummaryForNode} = await import('@ulugo/scoring-core');
      const summary = scoringSummaryForNode(document, currentNode, position);
      if (canceled) return;
      setScoringSummary({
        blackScoreText: formatScoringValue(summary.blackScore),
        whiteScoreText: formatScoringValue(summary.whiteScore),
        result: summary.result,
      });
    }

    void loadScoringSummary();

    return () => {
      canceled = true;
    };
  }, [currentNode, document, position, selectedScoringNode]);

  useEffect(() => {
    if (!openLastSgfOnStartup) return;
    writeLastSgf(document);
  }, [document, openLastSgfOnStartup]);

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
    currentPassAnalysis,
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
    path: operationPath,
    analysisPaths,
    analysisChartPaths,
    skipEmptyInitialBoardLiveAnalysis: !selectionMoved,
    startFailedMessage: t('analysisStartFailed'),
  });
  function handleImportedDocument(importedDocument: SgfDocument, initialPath: number[] = []): void {
    const startAnalysis =
      capabilities.katago && (analysisMode || (analysisSettings.mode === 'review' && analysisSettings.autoAnalyze));
    branchMemoryRef.current.clear();
    setAnalysisModeActive(startAnalysis);
    if (
      capabilities.katago &&
      analysisSettings.mode !== 'minimal' &&
      !startAnalysis &&
      !analysisButtonImportHintShownRef.current
    ) {
      analysisButtonImportHintShownRef.current = true;
      setKataGoConsoleMessages((current) => [
        ...current.slice(-499),
        createLocalConsoleMessage('ulugo', 'info', t('analysisButtonImportHint')),
      ]);
    }
    replaceDocument(importedDocument, initialPath, {clearAnalysisCache: true, resetSelectionMoved: true});
  }

  async function handleRecognizedDocument(recognizedDocument: SgfDocument): Promise<void> {
    if (!(await gameRecordFiles.archiveUnsavedGame())) return;
    let importedDocument = recognizedDocument;
    let initialPath: number[] = [];
    if (shouldAutoEstimateRecognizedGame(recognizedDocument)) {
      const {estimateScoringPoints} = await import('@ulugo/scoring-core');
      const scoringPoints = estimateScoringPoints(deriveBoardPosition(recognizedDocument, []));
      const result = addScoringNode(
        recognizedDocument,
        [],
        scoringPoints.blackPoints,
        scoringPoints.whitePoints
      );
      importedDocument = result.document;
      initialPath = result.path;
    }

    gameRecordFiles.clearCurrentFile(false);
    handleImportedDocument(importedDocument, initialPath);
    setRecognitionImage(null);
  }

  function handleRecognizedSetup(recognizedDocument: SgfDocument): void {
    const recognizedStones = deriveBoardPosition(recognizedDocument, []).stones;
    const {black, white, empty} = recognizedSetupChanges(
      position.points.map(({point}) => point),
      position.stones,
      recognizedStones
    );

    const nextColor = recognizedDocument.root.data.PL?.[0] === 'W' ? 'W' : 'B';
    const result = addSetupNode(document, operationPath, black, white, empty, nextColor);
    replaceDocument(result.document, result.path);
    setRecognitionImage(null);
    setRecognitionSetupMode(false);
  }

  function closeBoardRecognition(): void {
    setRecognitionImage(null);
    setRecognitionSetupMode(false);
  }

  const gameRecordFiles = useGameRecordFiles({
    document,
    gameName: gameInfo.GN,
    startedFromEmpty: startupState.startedFromEmpty,
    onImport: handleImportedDocument,
    onOpenImage: (image) => {
      setRecognitionSetupMode(false);
      setRecognitionImage(image);
    },
  });
  const showMarkup = analysisSettings.showMarkup;
  const showBoardMarkup = showMarkup && !selectedScoringNode;
  const stoneOverlayDisplay =
    !capabilities.katago && analysisSettings.stoneOverlay === 'dot' ? 'number' : analysisSettings.stoneOverlay;
  const boardMoveNumberLimit = stoneOverlayDisplay === 'number' ? analysisSettings.maxMoves : 0;
  const boardBackground = resolveBoardBackground(
    analysisSettings.boardBackground,
    autoBoardBackgroundReady && analysisSettings.showTopMoves
  );
  const minimalMode = analysisSettings.mode === 'minimal';
  const appTitle = isElectron ? t('electronTitle') : t('appTitle');
  const blackPlayerName = gameInfo.PB.trim() === '' ? t('black') : gameInfo.PB;
  const whitePlayerName = gameInfo.PW.trim() === '' ? t('white') : gameInfo.PW;

  useEffect(() => {
    if (tipsOpen && tipsFirstTime) writeTipsWelcomeShown();
  }, [tipsFirstTime, tipsOpen]);

  useEffect(() => {
    window.document.body.classList.toggle('platform-web', capabilities.platform === 'web');
    window.document.body.classList.toggle('platform-electron', capabilities.platform === 'electron');
    window.document.body.classList.toggle('minimal', minimalMode);
    window.document.body.classList.toggle('print-preview-open', printPreviewOpen);
    return () => {
      window.document.body.classList.remove('platform-web', 'platform-electron', 'minimal', 'print-preview-open');
    };
  }, [minimalMode, printPreviewOpen]);

  useEffect(() => {
    for (const item of kataGoConsoleMessages) {
      if (handledAutotuningMessageIdsRef.current.has(item.id)) continue;
      handledAutotuningMessageIdsRef.current.add(item.id);
      if (item.source === 'katago' && /performing autotuning/i.test(item.text)) setKataGoAutotuningOpen(true);
    }
  }, [kataGoConsoleMessages]);

  useEffect(() => {
    if (!showMarkup && isMarkupTool(tool)) setTool('auto');
  }, [showMarkup, tool]);

  useEffect(() => {
    const currentPathKey = pathKey(path);
    const selectionChanged = setupToolPathKeyRef.current !== currentPathKey;
    setupToolPathKeyRef.current = currentPathKey;
    if (!selectionChanged || (tool !== 'black' && tool !== 'white') || isSetupNode(currentNode)) return;
    setTool('auto');
    setAutoColorOverride(null);
  }, [currentNode, path, tool]);

  useEffect(() => {
    if (!minimalMode) return;
    replaceMoveSnapshotRef.current = null;
    setTool('auto');
    setAutoColorOverride(null);
    setReplaceMoveState(null);
  }, [minimalMode]);

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

  function finishReplaceSession(nextTool: EditorTool = 'auto'): void {
    replaceMoveSnapshotRef.current = null;
    setReplaceMoveState(null);
    setTool(nextTool);
    if (nextTool !== 'auto') setAutoColorOverride(null);
  }

  function handleConfirmReplace(): void {
    const result = confirmReplaceMove({
      document,
      path: operationPath,
      branchMemory: branchMemoryRef.current,
      state: replaceMoveState,
    });
    replaceMoveSnapshotRef.current = null;
    if (result != null && result.document !== document) {
      replaceDocument(result.document, result.path);
    } else {
      setReplaceMoveState(null);
      setTool('auto');
    }
  }

  function handleCancelReplace(): void {
    const cancel = () => {
      const snapshot = replaceMoveSnapshotRef.current;
      if (snapshot == null) {
        finishReplaceSession();
        return;
      }

      replaceMoveSnapshotRef.current = null;
      branchMemoryRef.current = new Map(snapshot.branchMemory);
      replaceDocument(snapshot.document, snapshot.path);
    };

    if ((replaceMoveState?.createdNodeIds?.length ?? 0) < 2) {
      cancel();
      return;
    }

    Modal.confirm({
      centered: true,
      title: t('cancelReplaceConfirmTitle'),
      content: t('cancelReplaceConfirmContent'),
      okText: t('confirm'),
      cancelText: t('cancel'),
      okButtonProps: {danger: true},
      onOk: cancel,
    });
  }

  function handleReplaceModeChange(mode: ReplaceMoveMode): void {
    setReplaceMoveState((current) => {
      if (current == null || (mode === 'replace' && replaceMoveForcesInsert(current))) return current;
      return {...current, mode, preferredMode: mode};
    });
  }

  function replaceDocument(next: SgfDocument, nextPath: number[] = [], options: ReplaceDocumentOptions = {}): void {
    const normalizedPath = normalizeSelectedPath(next, nextPath);
    resetAnalysisForDocumentChange(next, options);
    setDocument(next);
    setPath(normalizedPath);
    setSelectionMoved(
      options.resetSelectionMoved === true ? false : (current) => current || !samePath(path, normalizedPath)
    );
    resetLabelTextForUnmarkedSelection(next, normalizedPath);
    setAutoColorOverride(null);
    setReplaceMoveState(options.replaceMoveState ?? null);
    if (options.replaceMoveState != null) {
      setTool('replace');
    } else if (tool === 'replace') {
      replaceMoveSnapshotRef.current = null;
      setTool('auto');
    }
    rememberPath(normalizedPath);
  }

  function selectPath(nextPath: number[], options: {keepAutoColorOverride?: boolean} = {}): void {
    const normalizedPath = normalizeSelectedPath(document, nextPath);
    if (!samePath(path, normalizedPath) && shouldDeleteScoringNodeOnExit(document, path)) {
      const result = deleteNode(document, path);
      replaceDocument(result.document, selectedPathAfterDelete(normalizedPath, path));
      return;
    }

    rememberPath(normalizedPath);
    setPath(normalizedPath);
    if (!samePath(path, normalizedPath)) setSelectionMoved(true);
    resetLabelTextForUnmarkedSelection(document, normalizedPath);
    if (!options.keepAutoColorOverride) setAutoColorOverride(null);
    if (tool === 'replace') {
      const nextReplaceMoveState = replaceMoveStateForSelection(
        document,
        normalizedPath,
        branchMemoryRef.current,
        replaceMoveState
      );
      if (nextReplaceMoveState == null) {
        finishReplaceSession();
      } else {
        setReplaceMoveState(nextReplaceMoveState);
      }
    } else {
      setReplaceMoveState(null);
    }
  }

  function playPlaceStoneSound(): void {
    if (!playStoneSound) return;

    const audio = stoneSoundRef.current ?? new Audio(stoneSoundUrl);
    stoneSoundRef.current = audio;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }

  async function handleNew(size: BoardSize = 19): Promise<void> {
    if (!(await gameRecordFiles.archiveUnsavedGame())) return;
    branchMemoryRef.current.clear();
    gameRecordFiles.clearCurrentFile(true);
    setAnalysisModeActive(false);
    replaceDocument(createNewGame(size), [], {clearAnalysisCache: true, resetSelectionMoved: true});
  }

  function handleModeChange(mode: AnalysisSettings['mode']): void {
    if (mode === analysisSettings.mode) return;
    updateAnalysisSettings({mode});
    if (!capabilities.katago) return;
    if (mode !== 'review') {
      setAnalysisModeActive(false);
    } else if (analysisSettings.autoAnalyze) {
      setAnalysisModeActive(true);
    }
  }

  function handleCommentChange(value: string): void {
    replaceDocument(updateComment(document, operationPath, value), operationPath);
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
      replaceMoveSnapshotRef.current = {
        document,
        path,
        branchMemory: new Map(branchMemoryRef.current),
      };
      if (operationPath.length === 0) {
        if (path.length !== 0) {
          replaceMoveSnapshotRef.current = null;
          return;
        }
        const nextDocument = insertEmptyMoveZeroBeforeRootSetup(document);
        if (nextDocument == null) {
          replaceMoveSnapshotRef.current = null;
          return;
        }
        shiftBranchMemoryForInsertedRoot(branchMemoryRef.current);
        setAnalysisModeActive(false);
        setAutoColorOverride(null);
        replaceDocument(nextDocument, [], {
          replaceMoveState: createReplaceMoveState(nextDocument, [], branchMemoryRef.current),
        });
        return;
      }
      const replacementPath = operationPath.slice(0, -1);
      selectPath(replacementPath);
      setAnalysisModeActive(false);
      setAutoColorOverride(null);
      setReplaceMoveState(createReplaceMoveState(document, replacementPath, branchMemoryRef.current));
      setTool('replace');
      return;
    }

    if (tool === 'replace') {
      finishReplaceSession(nextTool);
      return;
    }

    if (nextTool !== tool) selectPath(path, {keepAutoColorOverride: nextTool === 'auto'});
    setReplaceMoveState(null);
    setTool(nextTool);
    if (nextTool !== 'auto') setAutoColorOverride(null);
  }

  function handleAutoToolClick(): void {
    if (tool === 'replace') {
      finishReplaceSession();
      return;
    }

    setReplaceMoveState(null);
    if (tool !== 'auto') {
      selectPath(path);
      setTool('auto');
      return;
    }

    if (isSetupNode(getNodeAtPath(document, operationPath))) {
      replaceDocument(updateSetupNextColor(document, operationPath, oppositeColor(position.nextColor)), operationPath, {
        invalidateAnalysisPath: operationPath,
      });
      setTool('auto');
      return;
    }

    setAutoColorOverride((current) => {
      const visibleColor = current ?? position.nextColor;
      return visibleColor === 'B' ? 'W' : 'B';
    });
  }

  const canNavigatePrevious = path.length > 0;
  const canNavigateNext = currentNode.children.length > 0;
  const canReplaceMove =
    tool === 'replace'
      ? replaceMoveState != null && samePath(operationPath, replaceMoveState.replacementPath)
      : operationPath.length > 0 || (path.length === 0 && hasNonEmptyRootSetup(document));

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (printPreviewOpen) return;
      if (isModalOpen() || isPopupOpen()) return;

      if (
        isElectron &&
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        event.key.toLowerCase() === 'v'
      ) {
        if (isTextInputActive()) return;
        event.preventDefault();
        void gameRecordFiles.openFromClipboard();
        return;
      }

      if (event.key === 'Enter' && tool === 'replace') {
        event.preventDefault();
        handleConfirmReplace();
        return;
      }

      if (event.key === 'Escape' && tool === 'replace') {
        event.preventDefault();
        handleCancelReplace();
        return;
      }

      if (event.key === 'Escape' && selectedScoringNode) {
        event.preventDefault();
        selectPath(path.slice(0, -1));
        return;
      }

      if (event.key === 'Escape' && tool !== 'auto') {
        event.preventDefault();
        setTool('auto');
        setAutoColorOverride(null);
        setReplaceMoveState(null);
        return;
      }

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
          void gameRecordFiles.open();
          break;
        case 'save':
          void gameRecordFiles.save();
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
          if (!minimalMode) handleToolChange('black');
          break;
        case 'toolWhite':
          if (!minimalMode) handleToolChange('white');
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
          if (operationPath.length > 0) handleMoveBranchToMain();
          break;
        case 'moveBranchLeft':
          if (operationPath.length > 0) handleMoveBranchLeft();
          break;
        case 'moveBranchRight':
          if (operationPath.length > 0) handleMoveBranchRight();
          break;
        case 'pruneBranch':
          if (operationPath.length > 0) handlePruneBranch();
          break;
        case 'deleteBranch':
          if (operationPath.length > 0) handleDeleteNode();
          break;
        case 'toggleShowCoordinates':
          if (minimalMode) {
            setMinimalShowCoordinates((current) => !current);
          } else {
            setShowCoordinates((current) => !current);
          }
          break;
        case 'toggleShowNextMove':
          updateAnalysisSettings({showNextMove: !analysisSettings.showNextMove});
          break;
        case 'toggleReviewEditMode':
          handleModeChange(analysisSettings.mode === 'review' ? 'edit' : 'review');
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
          if (minimalMode) break;
          if (tool === 'replace') finishReplaceSession();
          toggleAnalysisMode();
          break;
        case 'toggleDeepAnalysisMode':
          if (minimalMode) break;
          if (tool === 'replace') finishReplaceSession();
          toggleDeepAnalysisMode();
          break;
      }
    }

    function handlePaste(event: ClipboardEvent): void {
      if (isElectron || printPreviewOpen) return;
      if (isModalOpen() || isPopupOpen() || isTextInputActive()) return;
      if (event.clipboardData == null) return;

      event.preventDefault();
      void gameRecordFiles.openFromClipboard(event.clipboardData);
    }

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('paste', handlePaste, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('paste', handlePaste, true);
    };
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
    gameRecordFiles,
    keyboardShortcuts,
    navigateBranch,
    navigateFirstChild,
    navigateNext,
    navigatePrevious,
    path,
    operationPath,
    printPreviewOpen,
    position.nextColor,
    replaceMoveState,
    selectedScoringNode,
    tool,
    toggleDeepAnalysisMode,
    toggleAnalysisMode,
    updateAnalysisSettings,
    minimalMode,
  ]);

  function handleAnalysisButtonClick(event: MouseEvent<HTMLElement>): void {
    if (tool === 'replace') finishReplaceSession();

    if (event.shiftKey) {
      toggleDeepAnalysisMode();
    } else {
      toggleAnalysisMode();
    }
  }

  async function handleBoardClick(
    point: string,
    options: BoardVertexClickOptions,
    colorOverride?: SgfColor
  ): Promise<void> {
    if (options.shiftKey) {
      const nextPath = position.stones.has(point)
        ? findCurrentStoneMovePath(document, operationPath, point)
        : findFutureMovePath(document, operationPath, point, branchMemoryRef.current);
      if (nextPath != null) selectPath(nextPath);
      return;
    }

    if (selectedScoringNode && tool === 'auto' && position.stones.has(point)) {
      const {toggleScoringGroup} = await import('@ulugo/scoring-core');
      const scoringPoints = toggleScoringGroup(position, currentNode, point);
      if (scoringPoints == null) return;
      replaceDocument(updateScoringPoints(document, path, scoringPoints.blackPoints, scoringPoints.whitePoints), path);
      return;
    }

    if (options.clickCount > 1) {
      if (!isMarkupTool(tool) && tool !== 'erase') return;
    }

    if (tool === 'replace') {
      const result = replaceNextMoveBranch({
        document,
        path: operationPath,
        point,
        rules: gameInfo.RU,
        branchMemory: branchMemoryRef.current,
        state: replaceMoveState,
      });
      if (result == null) return;

      replaceDocument(result.document, result.path, {replaceMoveState: result.state});
      playPlaceStoneSound();
      return;
    }

    if (tool === 'auto') {
      if (position.stones.has(point)) return;
      const color = nextAutoColor;
      const existingChildPath = findChildMovePath(document, operationPath, color, point);
      if (existingChildPath != null) {
        selectPath(existingChildPath);
        return;
      }

      if (!isLegalMove(position, color, point, gameInfo.RU)) return;
      const result = addMove(document, operationPath, color, point);
      replaceDocument(result.document, result.path);
      playPlaceStoneSound();
      return;
    }

    if (tool === 'black' || tool === 'white' || colorOverride != null) {
      const color = colorOverride ?? (tool === 'black' ? 'B' : 'W');
      const result = addSetupStone(
        document,
        operationPath,
        color,
        point,
        position.stones.get(point) ?? null,
        position.nextColor
      );
      replaceDocument(result.document, result.path, {
        invalidateAnalysisPath: result.path,
      });
      if (result.placed) playPlaceStoneSound();
      return;
    }

    if (tool === 'erase') {
      applyMarkupTool(point, false, options.clickCount);
      return;
    }

    if (!showMarkup && isMarkupTool(tool)) return;
    if (isMarkupTool(tool)) applyMarkupTool(point, false, options.clickCount);
  }

  function handleBoardRightClick(point: string, options: BoardVertexClickOptions): void {
    if (isMarkupTool(tool)) {
      if (!showMarkup) return;
      applyMarkupTool(point, true, options.clickCount);
      return;
    }

    if (tool !== 'black' && tool !== 'white') return;
    void handleBoardClick(point, {shiftKey: false, clickCount: 1}, tool === 'black' ? 'W' : 'B');
  }

  function applyMarkupTool(point: string, rightClick: boolean, clickCount: number): void {
    const result = applyMarkupEdit({
      document,
      path: operationPath,
      point,
      clickCount,
      rightClick,
      tool,
      labelText,
      stones: position.stones,
      boardSize: position.size,
      previousAction: markupActionRef.current,
      autoIncrementText: analysisSettings.autoIncrementMarkupText,
    });
    if (result == null) return;

    replaceDocument(result.document, operationPath);
    markupActionRef.current = result.nextAction;
    if (result.incrementTextFrom != null) setLabelText(nextLabelText(result.incrementTextFrom));
  }

  function handleEraseAllMarkup(): void {
    replaceDocument(eraseAllMarkup(document, operationPath), operationPath);
  }

  function resetLabelTextForUnmarkedSelection(nextDocument: SgfDocument, nextPath: number[]): void {
    const key = pathKey(nextPath);
    if (labelResetPathKeyRef.current === key) return;
    labelResetPathKeyRef.current = key;
    if (!analysisSettings.autoIncrementMarkupText) return;
    if (!nodeHasMarkup(getNodeAtPath(nextDocument, nextPath))) {
      setLabelText((current) => resetLabelText(current));
    }
  }

  function handlePlayBestAnalysisMove(): void {
    const bestMove = currentAnalysis?.moveInfos?.[0]?.move;
    if (bestMove == null) return;

    const point = bestMove.toLowerCase() === 'pass' ? '' : gtpMoveToPoint(bestMove, boardSize);
    if (point == null || position.stones.has(point)) return;

    const existingChildPath = findChildMovePath(document, operationPath, position.nextColor, point);
    if (existingChildPath != null) {
      selectPath(existingChildPath);
      return;
    }

    if (!isLegalMove(position, position.nextColor, point, gameInfo.RU)) return;
    const result = addMove(document, operationPath, position.nextColor, point);
    replaceDocument(result.document, result.path, point === '' ? {convertHiddenPassPath: result.path} : {});
    if (point !== '') playPlaceStoneSound();
  }

  function handlePass(): void {
    if (tool === 'replace') {
      const result = replaceNextMoveBranch({
        document,
        path: operationPath,
        point: '',
        rules: gameInfo.RU,
        branchMemory: branchMemoryRef.current,
        state: replaceMoveState,
      });
      if (result == null) return;

      replaceDocument(result.document, result.path, {
        convertHiddenPassPath: result.path,
        replaceMoveState: result.state,
      });
      return;
    } else {
      const existingChildPath = findChildMovePath(document, operationPath, nextAutoColor, '');
      if (existingChildPath != null) {
        selectPath(existingChildPath);
      } else {
        const result = addMove(document, operationPath, nextAutoColor, '');
        replaceDocument(result.document, result.path, {convertHiddenPassPath: result.path});
      }
    }

    setTool('auto');
    setAutoColorOverride(null);
    setReplaceMoveState(null);
  }

  function handleMoveBranchToMain(targetPath = path): void {
    const result = moveBranchToMain(document, scoringOperationPath(document, targetPath));
    replaceDocument(result.document, result.path);
  }

  function handleMoveBranchLeft(targetPath = path): void {
    const result = moveBranch(document, scoringOperationPath(document, targetPath), -1);
    replaceDocument(result.document, result.path);
  }

  function handleMoveBranchRight(targetPath = path): void {
    const result = moveBranch(document, scoringOperationPath(document, targetPath), 1);
    replaceDocument(result.document, result.path);
  }

  function handleDeleteNode(targetPath = path): void {
    targetPath = scoringOperationPath(document, targetPath);
    if (
      tool === 'replace' &&
      replaceMoveState?.replacementStartPath != null &&
      samePath(targetPath, replaceMoveState.replacementPath)
    ) {
      const result = deleteReplaceMove(document, targetPath);
      if (result == null) return;
      const removedIds = new Set(result.removedNodeIds);
      const referencesByNodeId = Object.fromEntries(
        Object.entries(replaceMoveState.referencesByNodeId ?? {}).filter(([nodeId]) => !removedIds.has(nodeId))
      );
      const stateAfterDelete = {
        ...replaceMoveState,
        createdNodeIds: (replaceMoveState.createdNodeIds ?? []).filter((nodeId) => !removedIds.has(nodeId)),
        referencesByNodeId,
      };
      const nextReplaceMoveState = replaceMoveStateForSelection(
        result.document,
        result.path,
        branchMemoryRef.current,
        stateAfterDelete
      ) ?? {...stateAfterDelete, replacementPath: result.path, replacementStartPath: result.path};
      replaceDocument(result.document, result.path, {replaceMoveState: nextReplaceMoveState});
      return;
    }

    const deleteTarget = () => {
      const result = deleteNode(document, targetPath);
      replaceDocument(result.document, selectedPathAfterDelete(path, targetPath));
    };

    if (getNodeAtPath(document, targetPath).children.length > 0) {
      Modal.confirm({
        centered: true,
        title: t('deleteBranchConfirmTitle'),
        content: t('deleteBranchConfirmContent'),
        okText: t('ok'),
        cancelText: t('cancel'),
        okButtonProps: {danger: true},
        onOk: deleteTarget,
      });
      return;
    }

    deleteTarget();
  }

  function handlePruneBranch(targetPath = path): void {
    targetPath = scoringOperationPath(document, targetPath);
    Modal.confirm({
      centered: true,
      title: t('pruneBranchConfirmTitle'),
      content: t('pruneBranchConfirmContent'),
      okText: t('pruneBranch'),
      cancelText: t('cancel'),
      okButtonProps: {danger: true},
      onOk: () => {
        const result = pruneBranch(document, targetPath);
        branchMemoryRef.current.clear();
        replaceDocument(result.document, result.path);
      },
    });
  }

  async function handleEstimateScore(targetPath: number[]): Promise<void> {
    targetPath = scoringOperationPath(document, targetPath);
    const targetNode = getNodeAtPath(document, targetPath);

    const scoringPosition = deriveBoardPosition(document, targetPath);
    const {estimateScoringPoints} = await import('@ulugo/scoring-core');
    const scoringPoints = estimateScoringPoints(scoringPosition);
    const existingScoringIndex = targetNode.children.findIndex(isScoringNode);
    if (existingScoringIndex >= 0) {
      const scoringPath = [...targetPath, existingScoringIndex];
      replaceDocument(
        updateScoringPoints(document, scoringPath, scoringPoints.blackPoints, scoringPoints.whitePoints),
        scoringPath
      );
      return;
    }
    const result = addScoringNode(document, targetPath, scoringPoints.blackPoints, scoringPoints.whitePoints);
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

  function handleAppClickCapture(): void {
    window.requestAnimationFrame(blurNonTextControlFocus);
  }

  return (
    <ConfigProvider locale={antdLocale} componentSize="small" theme={appTheme}>
      <AppStatusModals
        googleDrivePending={gameRecordFiles.googleDrivePending}
        kataGoAutotuningOpen={kataGoAutotuningOpen}
        onCancelGoogleDrive={gameRecordFiles.cancelGoogleDriveOperation}
        onCloseKataGoAutotuning={() => setKataGoAutotuningOpen(false)}
      />
      <Layout
        className="app-shell"
        onClickCapture={handleAppClickCapture}
        onDragOver={gameRecordFiles.handleDragOver}
        onDrop={gameRecordFiles.handleDrop}
      >
        {minimalMode ? (
          <MinimalControl
            nextColor={nextAutoColor}
            showRightPanel={minimalRightPanelOpen}
            showBasicTools={minimalBasicToolsOpen}
            showMoveNumber={analysisSettings.stoneOverlay === 'number'}
            showNextMove={analysisSettings.showNextMove}
            showCoordinates={minimalShowCoordinates}
            onShowRightPanelChange={setMinimalRightPanelOpen}
            onShowBasicToolsChange={setMinimalBasicToolsOpen}
            onShowMoveNumberChange={(show) => updateAnalysisSettings({stoneOverlay: show ? 'number' : 'none'})}
            onShowNextMoveChange={(show) => updateAnalysisSettings({showNextMove: show})}
            onShowCoordinatesChange={setMinimalShowCoordinates}
            onQuit={() => handleModeChange('edit')}
          />
        ) : (
          <Header className="app-header">
            <div className="app-header-main">
              <section className="app-header-left">
                <div className="app-title">{appTitle}</div>
                <AppToolbars
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
                  onEraseAllMarkup={handleEraseAllMarkup}
                  onPass={handlePass}
                  onFirst={navigateToFirst}
                  onPrevious10={() => navigatePrevious(10)}
                  onPrevious={() => navigatePrevious()}
                  onNext={() => navigateFirstChild()}
                  onNext10={() => navigateFirstChild(10)}
                  onLast={() => navigateFirstChild(Infinity)}
                />
              </section>
              <section className="app-header-middle">
                <ModeToolbarOptions
                  katagoEnabled={capabilities.katago}
                  mode={analysisSettings.mode}
                  onChange={handleModeChange}
                />
              </section>
            </div>
            <section className={`app-header-right${mobileHeaderRightOpen ? ' mobile-open' : ''}`}>
              <AppMenuBar
                showAiConfig={capabilities.katago}
                showCameraOpen={supportsCameraCapture}
                showRecentFiles={isElectron}
                recentFiles={gameRecordFiles.recentFiles}
                language={currentLanguage}
                onNew={handleNew}
                onOpen={() => void gameRecordFiles.open()}
                onOpenRecent={(filePath) => void gameRecordFiles.openRecentFile(filePath)}
                onOpenFromCamera={gameRecordFiles.openFromCamera}
                onOpenFromSgfText={() => void gameRecordFiles.openFromSgfText()}
                onOpenFromGoogleDrive={() => void gameRecordFiles.openFromGoogleDrive()}
                onSave={() => void gameRecordFiles.save()}
                onSaveAs={() => void gameRecordFiles.saveAs()}
                onSaveToClipboard={() => void gameRecordFiles.saveToClipboard()}
                onSaveToGoogleDrive={() => void gameRecordFiles.saveToGoogleDrive()}
                onPrint={() => setPrintPreviewOpen(true)}
                onGameInfo={() => setGameInfoOpen(true)}
                onAiConfig={() => setKataGoSettingsOpen(true)}
                onSettings={() => setSettingsOpen(true)}
                onLanguageChange={handleLanguageChange}
              />
              <AnalysisToolbarOptions
                katagoEnabled={capabilities.katago}
                analysisSettings={analysisSettings}
                stoneOverlayDisplay={stoneOverlayDisplay}
                onSettingsChange={updateAnalysisSettings}
              />
            </section>
            <Button
              className="mobile-header-right-toggle"
              type="dashed"
              icon={mobileHeaderRightOpen ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              title={t(mobileHeaderRightOpen ? 'close' : 'open')}
              aria-expanded={mobileHeaderRightOpen}
              onClick={() => setMobileHeaderRightOpen((open) => !open)}
            />
          </Header>
        )}
        <Content className="app-content">
          <AppLeftPanel
            katagoEnabled={capabilities.katago}
            platform={capabilities.platform}
            open={leftPanelOpen}
            hidden={minimalMode}
            consoleMessages={kataGoConsoleMessages}
            consoleRef={kataGoConsoleRef}
            onClearConsole={() => setKataGoConsoleMessages([])}
          />
          <AppBoardRegion
            document={document}
            path={path}
            showCoordinates={minimalMode ? minimalShowCoordinates : showCoordinates}
            showMarkup={showBoardMarkup}
            moveNumberLimit={boardMoveNumberLimit}
            analysis={selectedScoringNode ? null : currentAnalysis}
            passAnalysis={selectedScoringNode ? null : currentPassAnalysis}
            stoneScoreDeltas={stoneScoreDeltas}
            analysisSettings={analysisSettings}
            futureMoveStones={futureMoveStones}
            boardBackground={boardBackground}
            rules={gameInfo.RU}
            katagoEnabled={capabilities.katago}
            analysisMode={analysisMode}
            analysisDeepMode={analysisDeepMode}
            analysisIdle={analysisIdle}
            fastAnalysisPendingCount={fastAnalysisPendingCount}
            leftPanelOpen={leftPanelOpen}
            minimalMode={minimalMode}
            onBoardClick={handleBoardClick}
            onBoardRightClick={handleBoardRightClick}
            onPreviousMove={() => navigatePrevious()}
            onNextMove={() => navigateNext()}
            onAnalysisClick={handleAnalysisButtonClick}
            onToggleLeftPanel={() => setLeftPanelOpen((open) => !open)}
          />
          {!minimalMode || minimalRightPanelOpen ? (
            <AppRightPanel
              document={document}
              path={path}
              blackPlayerName={blackPlayerName}
              whitePlayerName={whitePlayerName}
              capturedBlackStones={position.captures.W}
              capturedWhiteStones={position.captures.B}
              comment={displayedComment}
              analysisSettings={analysisSettings}
              showAnalysisControls={capabilities.katago}
              hideCommentsPanel={minimalMode}
              commentReadOnly={selectedScoringNode}
              forceComments={selectedScoringNode}
              commentRows={selectedScoringNode ? 3 : undefined}
              basicTools={
                minimalMode && minimalBasicToolsOpen ? (
                  <div className="minimal-basic-tools">
                    <EditorToolbar
                      tool={tool}
                      nextColor={nextAutoColor}
                      canReplaceMove={canReplaceMove}
                      showSetupTools={false}
                      shortcutLabels={shortcutLabels}
                      onToolChange={handleToolChange}
                      onAutoToolClick={handleAutoToolClick}
                      onPass={handlePass}
                    />
                  </div>
                ) : null
              }
              chartData={analysisChartData}
              selectedMoveNumber={capabilities.katago ? selectedChartMoveNumber : path.length}
              chartSummary={analysisChartSummary}
              shortcutLabels={shortcutLabels}
              onCommentChange={handleCommentChange}
              onAnalysisSettingsChange={updateAnalysisSettings}
              onPreviousMove={() => navigatePrevious()}
              onNextMove={() => navigateNext()}
              onSelectChartMove={(moveNumber) => {
                const nextPath = analysisChartPaths[moveNumber];
                if (nextPath == null) return;
                selectPath(nextPath);
              }}
              onSelectPath={selectPath}
              onMoveToMain={handleMoveBranchToMain}
              onRecordWithCamera={
                supportsCameraCapture ? () => recordCameraInputRef.current?.click() : undefined
              }
              onMoveLeft={handleMoveBranchLeft}
              onMoveRight={handleMoveBranchRight}
              onPrune={handlePruneBranch}
              onDelete={handleDeleteNode}
              onEstimateScore={handleEstimateScore}
              estimateScoreEnabled={!kataGoInitialized}
              replaceControls={
                tool === 'replace' && replaceMoveState?.replacementStartPath != null
                  ? {
                      mode: replaceMoveState.mode ?? 'replace',
                      forceInsert: replaceMoveForcesInsert(replaceMoveState),
                      onConfirm: handleConfirmReplace,
                      onCancel: handleCancelReplace,
                      onModeChange: handleReplaceModeChange,
                    }
                  : undefined
              }
            />
          ) : null}
        </Content>
      </Layout>
      <input
        ref={gameRecordFiles.fileInputRef}
        className="hidden-file-input"
        type="file"
        accept=".sgf,.gib,application/x-go-sgf,text/plain,image/*"
        onChange={(event) => void gameRecordFiles.importFile(event.target.files?.[0])}
      />
      {supportsCameraCapture ? (
        <>
          <input
            ref={gameRecordFiles.cameraInputRef}
            className="hidden-file-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => void gameRecordFiles.importFile(event.target.files?.[0])}
          />
          <input
            ref={recordCameraInputRef}
            className="hidden-file-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              const image = event.target.files?.[0];
              event.target.value = '';
              if (image == null) return;
              setRecognitionSetupMode(true);
              setRecognitionImage(image);
            }}
          />
        </>
      ) : null}
      {recognitionImage != null ? (
        <Suspense
          fallback={
            <Modal
              centered
              open
              footer={null}
              maskClosable={false}
              keyboard={false}
              onCancel={closeBoardRecognition}
              width={960}
              className="board-recognition-modal"
              title={t('boardRecognition')}
            />
          }
        >
          <BoardRecognitionModal
            image={recognitionImage}
            language={currentLanguage}
            setupBoardSize={recognitionSetupMode ? boardSize : undefined}
            onClose={closeBoardRecognition}
            onConfirm={(recognizedDocument) => {
              if (recognitionSetupMode) handleRecognizedSetup(recognizedDocument);
              else void handleRecognizedDocument(recognizedDocument);
            }}
          />
        </Suspense>
      ) : null}
      {capabilities.katago ? (
        <KataGoSettingsModal
          open={kataGoSettingsOpen}
          language={currentLanguage}
          onCurrentAssetUninstalled={() => setAnalysisModeActive(false)}
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
        uiScale={uiScale}
        showCoordinates={showCoordinates}
        playStoneSound={playStoneSound}
        openLastSgfOnStartup={openLastSgfOnStartup}
        showTipsOnStartup={showTipsOnStartup}
        showKataGoAnalysisSettings={capabilities.katago}
        onCancel={() => setSettingsOpen(false)}
        onAnalysisSettingsChange={updateAnalysisSettings}
        onLanguageChange={handleLanguageChange}
        onUiScaleChange={setUiScale}
        onShowCoordinatesChange={setShowCoordinates}
        onPlayStoneSoundChange={setPlayStoneSound}
        onOpenLastSgfOnStartupChange={setOpenLastSgfOnStartup}
        onShowTipsOnStartupChange={setShowTipsOnStartup}
        onKeyboardShortcutsClick={openKeyboardShortcuts}
      />
      <TipsDialog
        open={tipsOpen}
        tips={startupTips}
        showTipsOnStartup={showTipsOnStartup}
        onShowTipsOnStartupChange={setShowTipsOnStartup}
        onClose={() => setTipsOpen(false)}
      />
      <KeyboardShortcutsModal
        open={keyboardShortcutsOpen}
        language={currentLanguage}
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
      {printPreviewOpen ? (
        <PrintPreview document={document} selectedPath={path} onClose={() => setPrintPreviewOpen(false)} />
      ) : null}
    </ConfigProvider>
  );
}

function readStartupState(): StartupState {
  if (!readOpenLastSgfOnStartupPreference()) return newStartupState(createNewGame(), [], true);

  try {
    const sgf = localStorage.getItem(lastSgfStorageKey);
    if (sgf == null) return newStartupState(createNewGame(), [], true);
    const document = parseSgf(sgf);
    return newStartupState(document, lastMainBranchMovePath(document), false);
  } catch {
    return newStartupState(createNewGame(), [], true);
  }
}

function shiftBranchMemoryForInsertedRoot(branchMemory: Map<string, number>): void {
  const entries = [...branchMemory.entries()];
  branchMemory.clear();
  branchMemory.set(pathKey([]), 0);
  for (const [key, childIndex] of entries) {
    branchMemory.set(key === '' ? '0' : `0.${key}`, childIndex);
  }
}

function newStartupState(document: SgfDocument, path: number[], startedFromEmpty: boolean): StartupState {
  return {document, path, startedFromEmpty};
}

function lastMainBranchMovePath(document: SgfDocument): number[] {
  let node = document.root;
  let path: number[] = [];
  let lastMovePath: number[] = [];

  while (node.children.length > 0) {
    path = [...path, 0];
    node = node.children[0];
    if (node.data.B != null || node.data.W != null) lastMovePath = path;
  }

  return lastMovePath;
}

function writeLastSgf(document: SgfDocument): void {
  try {
    localStorage.setItem(lastSgfStorageKey, serializeSgf(document));
  } catch {
    // Ignore storage failures; the current session state is still updated.
  }
}

function resetLabelText(value: string): string {
  if (/^\d+$/.test(value.trim())) return '0';
  if (/^[a-z]+$/.test(value.trim())) return 'a';
  return 'A';
}
