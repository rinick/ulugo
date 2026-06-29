import {ConfigProvider, Layout, Modal} from 'antd';
import {
  addLabel,
  addMarkup,
  addMove,
  addSetupStone,
  createNewGame,
  deleteNode,
  eraseAllMarkup,
  eraseMarkup,
  getComment,
  getBoardSize,
  getGameInfo,
  getNodeAtPath,
  buildTree,
  moveBranch,
  moveBranchToMain,
  pruneBranch,
  samePath,
  updateComment,
  updateGameInfo,
  updateSetupNextColor,
  type SgfColor,
  type SgfDocument,
  type SgfNode,
} from '@ulugo/sgf-core';
import type {BoardSize} from '@ulugo/ui-shared';
import {useCallback, useEffect, useMemo, useRef, useState, type MouseEvent} from 'react';
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
import {AnalysisToolbarOptions} from '../features/toolbar/AnalysisToolbarOptions';
import {EditorToolbar} from '../features/toolbar/EditorToolbar';
import {ModeToolbarOptions} from '../features/toolbar/ModeToolbarOptions';
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
import {isMarkupTool, nextLabelText, resolveBoardBackground, selectedPathAfterDelete} from './appEditorUtils';
import {capabilities, isElectron} from './capabilities';
import {findChildMovePath, oppositeColor, toolToMarkup} from './sgfEditUtils';
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
  gtpMoveToPoint,
  hasReplaceableContinuation,
  replaceNextMoveBranch,
  type ReplaceMoveState,
} from './replaceMoveUtils';
import {useAppPreferences} from './useAppPreferences';
import {useGameRecordFiles} from './useGameRecordFiles';
import {useKataGoAnalysis} from './useKataGoAnalysis';

const {Header, Content} = Layout;

interface ReplaceDocumentOptions {
  clearAnalysisCache?: boolean;
  convertHiddenPassPath?: number[];
  invalidateAnalysisPath?: number[];
  replaceMoveState?: ReplaceMoveState | null;
}

const markupPropertyKeys = ['LB', 'CR', 'SQ', 'TR', 'MA'] as const;
const setupPropertyKeys = ['AB', 'AW', 'AE', 'PL'] as const;

export function App() {
  const {t, i18n} = useTranslation();
  const [document, setDocument] = useState<SgfDocument>(() => createNewGame());
  const [path, setPath] = useState<number[]>([]);
  const [tool, setTool] = useState<EditorTool>('auto');
  const [labelText, setLabelText] = useState('A');
  const [autoColorOverride, setAutoColorOverride] = useState<'B' | 'W' | null>(null);
  const [replaceMoveState, setReplaceMoveState] = useState<ReplaceMoveState | null>(null);
  const {
    uiScale,
    setUiScale,
    showCoordinates,
    setShowCoordinates,
    playStoneSound,
    setPlayStoneSound,
    leftPanelOpen,
    setLeftPanelOpen,
  } = useAppPreferences();
  const [gameInfoOpen, setGameInfoOpen] = useState(false);
  const [kataGoSettingsOpen, setKataGoSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [minimalRightPanelOpen, setMinimalRightPanelOpen] = useState(true);
  const [minimalBasicToolsOpen, setMinimalBasicToolsOpen] = useState(false);
  const [kataGoAutotuningOpen, setKataGoAutotuningOpen] = useState(false);
  const [autoBoardBackgroundReady, setAutoBoardBackgroundReady] = useState(false);
  const [keyboardShortcuts, setKeyboardShortcuts] = useState(() => readKeyboardShortcuts());
  const stoneSoundRef = useRef<HTMLAudioElement | null>(null);
  const branchMemoryRef = useRef(new Map<string, number>());
  const labelResetPathKeyRef = useRef(pathKey([]));
  const handledAutotuningMessageIdsRef = useRef(new Set<string>());
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
    startFailedMessage: t('analysisStartFailed'),
  });
  const gameRecordFiles = useGameRecordFiles({
    document,
    gameName: gameInfo.GN,
    onImport: (importedDocument) => {
      branchMemoryRef.current.clear();
      setAnalysisModeActive(capabilities.katago && analysisSettings.mode === 'review' && analysisSettings.autoAnalyze);
      replaceDocument(importedDocument, [], {clearAnalysisCache: true});
    },
  });
  const showMarkup = analysisSettings.showMarkup;
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
    window.document.body.classList.toggle('platform-web', capabilities.platform === 'web');
    window.document.body.classList.toggle('platform-electron', capabilities.platform === 'electron');
    window.document.body.classList.toggle('minimal', minimalMode);
    return () => {
      window.document.body.classList.remove('platform-web', 'platform-electron', 'minimal');
    };
  }, [minimalMode]);

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
    if (!minimalMode) return;
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

  function replaceDocument(next: SgfDocument, nextPath: number[] = [], options: ReplaceDocumentOptions = {}): void {
    const normalizedPath = normalizeSelectedPath(next, nextPath);
    resetAnalysisForDocumentChange(next, options);
    setDocument(next);
    setPath(normalizedPath);
    resetLabelTextForUnmarkedSelection(next, normalizedPath);
    setAutoColorOverride(null);
    setReplaceMoveState(options.replaceMoveState ?? null);
    if (options.replaceMoveState != null) {
      setTool('replace');
    } else if (tool === 'replace') {
      setTool('auto');
    }
    rememberPath(normalizedPath);
  }

  function selectPath(nextPath: number[], options: {keepAutoColorOverride?: boolean} = {}): void {
    const normalizedPath = normalizeSelectedPath(document, nextPath);

    rememberPath(normalizedPath);
    setPath(normalizedPath);
    resetLabelTextForUnmarkedSelection(document, normalizedPath);
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
    gameRecordFiles.clearCurrentFile();
    setAnalysisModeActive(false);
    replaceDocument(createNewGame(size), [], {clearAnalysisCache: true});
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
    if (isSetupNode(getNodeAtPath(document, path))) {
      replaceDocument(updateSetupNextColor(document, path, oppositeColor(position.nextColor)), path, {
        invalidateAnalysisPath: path,
      });
      setTool('auto');
      return;
    }

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
          if (path.length > 0) handleMoveBranchToMain();
          break;
        case 'moveBranchLeft':
          if (path.length > 0) handleMoveBranchLeft();
          break;
        case 'moveBranchRight':
          if (path.length > 0) handleMoveBranchRight();
          break;
        case 'pruneBranch':
          if (path.length > 0) handlePruneBranch();
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
          if (tool === 'replace') {
            setReplaceMoveState(null);
            setTool('auto');
          }
          toggleAnalysisMode();
          break;
        case 'toggleDeepAnalysisMode':
          if (minimalMode) break;
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
    gameRecordFiles,
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
    minimalMode,
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
    if (options.shiftKey) {
      const nextPath = position.stones.has(point)
        ? findCurrentStoneMovePath(document, path, point)
        : findFutureMovePath(document, path, point, branchMemoryRef.current);
      if (nextPath != null) selectPath(nextPath);
      return;
    }

    if (options.clickCount > 1) {
      if (tool === 'auto' && position.stones.has(point)) {
        const nextPath = findCurrentStoneMovePath(document, path, point);
        if (nextPath != null) selectPath(nextPath);
      }
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

      replaceDocument(result.document, result.path, {replaceMoveState: result.state});
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
      const result = addSetupStone(document, path, color, point, position.stones.get(point) ?? null, position.nextColor);
      replaceDocument(result.document, result.path, {
        invalidateAnalysisPath: result.path,
      });
      if (result.placed) playPlaceStoneSound();
      return;
    }

    if (tool === 'erase') {
      replaceDocument(eraseMarkup(document, path, point), path);
      return;
    }

    if (!showMarkup && isMarkupTool(tool)) return;

    if (tool === 'alphabet') {
      const value = labelText.trim();
      if (value === '') return;
      replaceDocument(addLabel(document, path, point, value), path);
      if (analysisSettings.autoIncrementMarkupText) setLabelText(nextLabelText(value));
      return;
    }

    const markup = toolToMarkup(tool);
    if (markup != null) replaceDocument(addMarkup(document, path, markup, point), path);
  }

  function handleBoardRightClick(point: string): void {
    if (tool !== 'black' && tool !== 'white') return;
    handleBoardClick(point, {shiftKey: false, clickCount: 1}, tool === 'black' ? 'W' : 'B');
  }

  function handleEraseAllMarkup(): void {
    replaceDocument(eraseAllMarkup(document, path), path);
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

    const existingChildPath = findChildMovePath(document, path, position.nextColor, point);
    if (existingChildPath != null) {
      selectPath(existingChildPath);
      return;
    }

    if (!isLegalMove(position, position.nextColor, point, gameInfo.RU)) return;
    const result = addMove(document, path, position.nextColor, point);
    replaceDocument(result.document, result.path, point === '' ? {convertHiddenPassPath: result.path} : {});
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

      replaceDocument(result.document, result.path, {
        convertHiddenPassPath: result.path,
        replaceMoveState: result.state,
      });
      return;
    }

    const existingChildPath = findChildMovePath(document, path, nextAutoColor, '');
    if (existingChildPath != null) {
      selectPath(existingChildPath);
      return;
    }

    const result = addMove(document, path, nextAutoColor, '');
    replaceDocument(result.document, result.path, {convertHiddenPassPath: result.path});
  }

  function handleMoveBranchToMain(targetPath = path): void {
    const result = moveBranchToMain(document, targetPath);
    replaceDocument(result.document, result.path);
  }

  function handleMoveBranchLeft(targetPath = path): void {
    const result = moveBranch(document, targetPath, -1);
    replaceDocument(result.document, result.path);
  }

  function handleMoveBranchRight(targetPath = path): void {
    const result = moveBranch(document, targetPath, 1);
    replaceDocument(result.document, result.path);
  }

  function handleDeleteNode(targetPath = path): void {
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
      <Layout className="app-shell" onClickCapture={handleAppClickCapture}>
        {minimalMode ? (
          <MinimalControl
            showRightPanel={minimalRightPanelOpen}
            showBasicTools={minimalBasicToolsOpen}
            showMoveNumber={analysisSettings.stoneOverlay === 'number'}
            showNextMove={analysisSettings.showNextMove}
            showCoordinates={showCoordinates}
            onShowRightPanelChange={setMinimalRightPanelOpen}
            onShowBasicToolsChange={setMinimalBasicToolsOpen}
            onShowMoveNumberChange={(show) => updateAnalysisSettings({stoneOverlay: show ? 'number' : 'none'})}
            onShowNextMoveChange={(show) => updateAnalysisSettings({showNextMove: show})}
            onShowCoordinatesChange={setShowCoordinates}
            onQuit={() => handleModeChange('edit')}
          />
        ) : (
          <Header className="app-header">
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
                onNext={() => navigateNext()}
                onNext10={() => navigateNext(10)}
                onLast={navigateToLast}
              />
            </section>
            <section className="app-header-middle">
              <ModeToolbarOptions
                katagoEnabled={capabilities.katago}
                mode={analysisSettings.mode}
                onChange={handleModeChange}
              />
            </section>
            <section className="app-header-right">
              <AppMenuBar
                showAiConfig={capabilities.katago}
                onNew={handleNew}
                onOpen={() => void gameRecordFiles.open()}
                onOpenFromGoogleDrive={() => void gameRecordFiles.openFromGoogleDrive()}
                onSave={() => void gameRecordFiles.save()}
                onSaveAs={() => void gameRecordFiles.saveAs()}
                onSaveToGoogleDrive={() => void gameRecordFiles.saveToGoogleDrive()}
                onGameInfo={() => setGameInfoOpen(true)}
                onAiConfig={() => setKataGoSettingsOpen(true)}
                onSettings={() => setSettingsOpen(true)}
              />
              <AnalysisToolbarOptions
                katagoEnabled={capabilities.katago}
                analysisSettings={analysisSettings}
                stoneOverlayDisplay={stoneOverlayDisplay}
                onSettingsChange={updateAnalysisSettings}
              />
            </section>
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
            showCoordinates={showCoordinates}
            showMarkup={showMarkup}
            moveNumberLimit={boardMoveNumberLimit}
            analysis={currentAnalysis}
            stoneScoreDeltas={stoneScoreDeltas}
            analysisSettings={analysisSettings}
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
            onDragOver={gameRecordFiles.handleDragOver}
            onDrop={gameRecordFiles.handleDrop}
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
              comment={getComment(document, path)}
              analysisSettings={analysisSettings}
              showAnalysisControls={capabilities.katago}
              hideCommentsPanel={minimalMode}
              basicTools={
                minimalMode && minimalBasicToolsOpen ? (
                  <div className="minimal-basic-tools">
                    <EditorToolbar
                      tool={tool}
                      nextColor={nextAutoColor}
                      canReplaceMove={canReplaceMove}
                      showMarkup={showMarkup}
                      showSetupTools={false}
                      labelText={labelText}
                      shortcutLabels={shortcutLabels}
                      onToolChange={handleToolChange}
                      onLabelTextChange={setLabelText}
                      onAutoToolClick={handleAutoToolClick}
                      onEraseAllMarkup={handleEraseAllMarkup}
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
              onMoveLeft={handleMoveBranchLeft}
              onMoveRight={handleMoveBranchRight}
              onPrune={handlePruneBranch}
              onDelete={handleDeleteNode}
            />
          ) : null}
        </Content>
      </Layout>
      <input
        ref={gameRecordFiles.fileInputRef}
        className="hidden-file-input"
        type="file"
        accept=".sgf,.gib,application/x-go-sgf,text/plain"
        onChange={(event) => void gameRecordFiles.importFile(event.target.files?.[0])}
      />
      {capabilities.katago ? (
        <KataGoSettingsModal
          open={kataGoSettingsOpen}
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
        showKataGoAnalysisSettings={capabilities.katago}
        onCancel={() => setSettingsOpen(false)}
        onAnalysisSettingsChange={updateAnalysisSettings}
        onLanguageChange={handleLanguageChange}
        onUiScaleChange={setUiScale}
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

function nodeHasMarkup(node: ReturnType<typeof getNodeAtPath>): boolean {
  return markupPropertyKeys.some((key) => (node.data[key]?.length ?? 0) > 0);
}

function isSetupNode(node: SgfNode): boolean {
  return (
    node.data.B == null &&
    node.data.W == null &&
    setupPropertyKeys.some((key) => (node.data[key]?.length ?? 0) > 0)
  );
}

function resetLabelText(value: string): string {
  if (/^\d+$/.test(value.trim())) return '0';
  if (/^[a-z]+$/.test(value.trim())) return 'a';
  return 'A';
}
