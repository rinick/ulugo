import {getNodeAtPath, samePath, type SgfDocument} from '@ulugo/sgf-core';
import {
  defaultAnalysisSettings,
  defaultEditModeSettings,
  defaultReviewModeSettings,
  type AnalysisChartPoint,
  type AnalysisMode,
  type AnalysisModeSettings,
  type AnalysisSettings,
} from '@ulugo/analysis-core';
import {
  buildKataGoQuery,
  defaultKataGoSettings,
  type KataGoConsoleMessage,
  type KataGoSettings,
} from '@ulugo/katago-core';
import {useCallback, useEffect, useMemo, useRef, useState, type RefObject} from 'react';
import {
  buildAnalysisChartData,
  buildStoneScoreDeltas,
  getAnalysisVisits,
  getPendingAnalysisQueryIds,
  hasPendingAnalysisQuery,
  nextColorForPath,
  normalizeWinratePercent,
  shouldCountHiddenPassAnalysis,
  shouldRequestHiddenPassAnalysis,
  updateAnalysisCache,
  updateHiddenMoveAnalysisCache,
  type AnalysisQueryContext,
  type CachedAnalysis,
} from './appAnalysisUtils';
import {collectNodeIds, nodeKey, pathKey} from './sgfPathUtils';
import {createLocalConsoleMessage} from './katagoConsoleUtils';

const deepAnalysisVisits = 10_000_000;
const maxFastAnalysisQueries = 2;
const nextFastAnalysisCount = 5;
const analysisSettingsStorageKey = 'ulugo.analysisSettings';
const showMarkupStorageKey = 'ulugo.showMarkup';
const modeSettingKeys = [
  'stoneOverlay',
  'showMarkup',
  'showNextMove',
  'showTopMoves',
  'showExpectedTerritory',
  'showScore',
  'showPointLoss',
  'showWinrate',
  'showComments',
] as const;

interface UseKataGoAnalysisOptions {
  enabled: boolean;
  document: SgfDocument;
  path: number[];
  analysisPaths: number[][];
  analysisChartPaths: number[][];
  pendingSetupPathRef: RefObject<number[] | null>;
  startFailedMessage: string;
}

interface AnalysisDocumentChangeOptions {
  clearAnalysisCache?: boolean;
  invalidatePath?: number[];
}

type FastAnalysisJob = {path: number[]; hiddenPass: boolean};

export function useKataGoAnalysis({
  enabled,
  document,
  path,
  analysisPaths,
  analysisChartPaths,
  pendingSetupPathRef,
  startFailedMessage,
}: UseKataGoAnalysisOptions) {
  const [analysisSettings, setAnalysisSettings] = useState<AnalysisSettings>(() => readStoredAnalysisSettings(enabled));
  const [kataGoSettings, setKataGoSettings] = useState<KataGoSettings>(defaultKataGoSettings);
  const [analysisCache, setAnalysisCache] = useState<Record<string, CachedAnalysis>>({});
  const [kataGoConsoleMessages, setKataGoConsoleMessages] = useState<KataGoConsoleMessage[]>([]);
  const [analysisMode, setAnalysisMode] = useState(false);
  const [analysisDeepMode, setAnalysisDeepMode] = useState(false);
  const [kataGoInitialized, setKataGoInitialized] = useState(false);
  const [analysisQueueRevision, setAnalysisQueueRevision] = useState(0);
  const analysisQueryContextRef = useRef(new Map<string, AnalysisQueryContext>());
  const documentVersionRef = useRef(0);
  const analysisModeRef = useRef(false);
  const analysisDeepModeRef = useRef(false);
  const kataGoConsoleRef = useRef<HTMLDivElement>(null);
  const currentNodeId = nodeKey(document, path);
  const liveAnalysisTargetVisits = analysisDeepMode
    ? deepAnalysisVisits
    : Math.max(1, kataGoSettings.maxVisits || defaultKataGoSettings.maxVisits);

  const currentAnalysis = useMemo(
    () => (enabled ? (analysisCache[currentNodeId]?.result ?? null) : null),
    [analysisCache, currentNodeId, enabled]
  );
  const analysisTargetVisits = Math.max(1, kataGoSettings.fastVisits || defaultKataGoSettings.fastVisits);
  const analysisPendingCounts = useMemo(() => {
    if (!enabled) return {normal: 0, hiddenPass: 0};

    const normal = analysisPaths.filter((movePath) => {
      const nodeId = nodeKey(document, movePath);
      const cached = analysisCache[nodeId];
      return cached == null || cached.visits < analysisTargetVisits;
    }).length;
    const hiddenPass =
      analysisSettings.moveDisplay === 'absScore'
        ? analysisPaths.filter((movePath) =>
            shouldCountHiddenPassAnalysis(document, movePath, analysisCache, analysisTargetVisits)
          ).length
        : 0;
    return {normal, hiddenPass};
  }, [
    analysisCache,
    analysisPaths,
    analysisQueueRevision,
    analysisSettings.moveDisplay,
    analysisTargetVisits,
    document,
    enabled,
  ]);
  const fastAnalysisPendingCount = analysisPendingCounts.normal + analysisPendingCounts.hiddenPass;
  const analysisIdle =
    analysisMode &&
    fastAnalysisPendingCount === 0 &&
    !hasPendingAnalysisQuery(analysisQueryContextRef.current, 'fast') &&
    !hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live') &&
    (analysisCache[currentNodeId]?.visits ?? 0) >= liveAnalysisTargetVisits;
  const analysisChartData = useMemo<AnalysisChartPoint[]>(
    () => (enabled ? buildAnalysisChartData(document, analysisChartPaths, analysisCache, analysisTargetVisits) : []),
    [analysisCache, analysisChartPaths, analysisTargetVisits, document, enabled]
  );
  const selectedChartMoveNumber = useMemo(() => {
    if (!enabled) return null;

    const index = analysisChartPaths.findIndex((movePath) => samePath(movePath, path));
    return index < 0 ? null : index;
  }, [analysisChartPaths, enabled, path]);
  const analysisChartSummary = useMemo(() => {
    if (!enabled) return null;

    const rootInfo = currentAnalysis?.rootInfo;
    const scoreLead = rootInfo?.scoreLead ?? rootInfo?.scoreMean ?? null;
    const winrate = rootInfo?.winrate == null ? null : normalizeWinratePercent(rootInfo.winrate);
    return scoreLead == null && winrate == null ? null : {scoreLead, winrate};
  }, [currentAnalysis, enabled]);
  const stoneScoreDeltas = useMemo(
    () => (enabled ? buildStoneScoreDeltas(document, path, analysisCache) : new Map<string, number>()),
    [analysisCache, document, enabled, path]
  );

  const appendKataGoConsoleMessage = useCallback((message: KataGoConsoleMessage): void => {
    setKataGoConsoleMessages((current) => [...current.slice(-499), message]);
  }, []);

  const clearPendingAnalysisQueries = useCallback((mode: AnalysisQueryContext['mode']): void => {
    let changed = false;
    for (const [id, context] of analysisQueryContextRef.current.entries()) {
      if (context.mode === mode) {
        analysisQueryContextRef.current.delete(id);
        changed = true;
      }
    }
    if (changed) setAnalysisQueueRevision((current) => current + 1);
  }, []);

  const setAnalysisModeActive = useCallback(
    (active: boolean, deep = false): void => {
      if (!enabled && active) return;
      const nextDeep = active && deep;
      const shouldRestartLive = active && analysisModeRef.current && analysisDeepModeRef.current !== nextDeep;
      analysisModeRef.current = active;
      analysisDeepModeRef.current = nextDeep;
      setAnalysisMode(active);
      setAnalysisDeepMode(nextDeep);
      if (!active) {
        clearPendingAnalysisQueries('fast');
        clearPendingAnalysisQueries('live');
        if (enabled && window.ulugo != null) void window.ulugo.katago.stopAnalysis();
      } else if (shouldRestartLive) {
        const liveQueryIds = getPendingAnalysisQueryIds(analysisQueryContextRef.current, 'live');
        clearPendingAnalysisQueries('live');
        if (enabled && window.ulugo != null && liveQueryIds.length > 0) {
          void window.ulugo.katago.stopAnalysis(liveQueryIds);
        }
      }
    },
    [clearPendingAnalysisQueries, enabled]
  );

  const toggleAnalysisMode = useCallback((): void => {
    setAnalysisModeActive(!analysisMode || analysisDeepMode, false);
  }, [analysisDeepMode, analysisMode, setAnalysisModeActive]);

  const toggleDeepAnalysisMode = useCallback((): void => {
    setAnalysisModeActive(!analysisDeepMode, true);
  }, [analysisDeepMode, setAnalysisModeActive]);

  const resetAnalysisForDocumentChange = useCallback(
    (next: SgfDocument, options: AnalysisDocumentChangeOptions): void => {
      const pendingQueryIds = [...analysisQueryContextRef.current.keys()];
      documentVersionRef.current += 1;
      analysisQueryContextRef.current.clear();
      if (pendingQueryIds.length > 0) {
        setAnalysisQueueRevision((current) => current + 1);
        if (enabled && window.ulugo != null) void window.ulugo.katago.stopAnalysis(pendingQueryIds);
      }

      if (options.clearAnalysisCache === true) {
        setAnalysisCache({});
      } else if (options.invalidatePath != null) {
        const invalidatedNodeIds = new Set(collectNodeIds(getNodeAtPath(next, options.invalidatePath)));
        setAnalysisCache((current) =>
          Object.fromEntries(Object.entries(current).filter(([nodeId]) => !invalidatedNodeIds.has(nodeId)))
        );
      }
    },
    [enabled]
  );

  const saveAnalysisSettings = useCallback(
    (settings: AnalysisSettings): void => {
      const next = normalizeAnalysisSettings(settings, enabled);
      writeStoredAnalysisSettings(next);
      setAnalysisSettings(next);
    },
    [enabled]
  );

  const updateAnalysisSettings = useCallback(
    (values: Partial<AnalysisSettings>): void => {
      setAnalysisSettings((current) => {
        const next =
          values.mode != null && values.mode !== current.mode
            ? switchAnalysisMode(current, values.mode, enabled)
            : normalizeAnalysisSettings(updateCurrentModeSettings(current, values), enabled);
        writeStoredAnalysisSettings(next);
        if (window.ulugo != null) void window.ulugo.analysis.saveSettings(next);
        return next;
      });
    },
    [enabled]
  );

  const refreshKataGoSettings = useCallback(async (): Promise<KataGoSettings> => {
    if (!enabled || window.ulugo == null) return defaultKataGoSettings;
    const settings = await window.ulugo.katago.getSettings();
    setKataGoSettings(settings);
    return settings;
  }, [enabled]);

  useEffect(() => {
    if (!enabled || window.ulugo == null) return;
    void refreshKataGoSettings();
    window.ulugo.analysis
      .getSettings()
      .then((settings) => saveAnalysisSettings(settings))
      .catch(() => undefined);
  }, [enabled, refreshKataGoSettings, saveAnalysisSettings]);

  useEffect(() => {
    if (!enabled || window.ulugo == null) return;

    const unsubscribeAnalysis = window.ulugo.katago.onAnalysis((result) => {
      const context = analysisQueryContextRef.current.get(result.id);
      if (context == null) return;
      if (!result.isDuringSearch) {
        analysisQueryContextRef.current.delete(result.id);
        setAnalysisQueueRevision((current) => current + 1);
      }

      if (context.version !== documentVersionRef.current) return;
      if (result.error != null) return;

      setKataGoInitialized(true);
      const visits = getAnalysisVisits(result);
      setAnalysisCache((current) => {
        const existing = current[context.nodeId];
        if (context.hiddenMove == null && existing != null && visits < existing.visits && result.isDuringSearch)
          return current;
        if (context.hiddenMove != null) {
          return updateHiddenMoveAnalysisCache({
            cache: current,
            document,
            path: context.path,
            move: context.hiddenMove,
            result,
            completed: existing?.completed === true || !result.isDuringSearch,
          });
        }

        return updateAnalysisCache({
          cache: current,
          document,
          path: context.path,
          result,
          visits,
          completed: existing?.completed === true || !result.isDuringSearch,
        });
      });
    });
    const unsubscribeConsole = window.ulugo.katago.onConsoleMessage(appendKataGoConsoleMessage);

    return () => {
      unsubscribeAnalysis();
      unsubscribeConsole();
    };
  }, [appendKataGoConsoleMessage, document, enabled]);

  useEffect(() => {
    const element = kataGoConsoleRef.current;
    if (element == null) return;
    element.scrollTop = element.scrollHeight;
  }, [kataGoConsoleMessages]);

  useEffect(() => {
    analysisModeRef.current = analysisMode;
  }, [analysisMode]);

  useEffect(() => {
    analysisDeepModeRef.current = analysisDeepMode;
  }, [analysisDeepMode]);

  const requestAnalysis = useCallback(
    async (
      requestPath: number[],
      mode: AnalysisQueryContext['mode'],
      maxVisits: number,
      live = false
    ): Promise<void> => {
      if (!enabled || window.ulugo == null) return;

      const queryId = `ulugo-${mode}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      analysisQueryContextRef.current.set(queryId, {
        nodeId: nodeKey(document, requestPath),
        path: requestPath,
        version: documentVersionRef.current,
        mode,
      });
      setAnalysisQueueRevision((current) => current + 1);

      try {
        await window.ulugo.katago.analyze(
          buildKataGoQuery(document, {
            id: queryId,
            path: requestPath,
            live,
            maxVisits,
          })
        );
      } catch (error) {
        analysisQueryContextRef.current.delete(queryId);
        setAnalysisQueueRevision((current) => current + 1);
        throw error;
      }
    },
    [document, enabled]
  );

  const requestHiddenPassAnalysis = useCallback(
    async (
      requestPath: number[],
      mode: AnalysisQueryContext['mode'],
      maxVisits: number,
      priority: number
    ): Promise<void> => {
      if (!enabled || window.ulugo == null) return;

      const queryId = `ulugo-${mode}-pass-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      analysisQueryContextRef.current.set(queryId, {
        nodeId: nodeKey(document, requestPath),
        path: requestPath,
        version: documentVersionRef.current,
        mode,
        hiddenMove: 'pass',
      });
      setAnalysisQueueRevision((current) => current + 1);

      try {
        await window.ulugo.katago.analyze(
          buildKataGoQuery(document, {
            id: queryId,
            path: requestPath,
            maxVisits,
            priority,
            nextMove: {color: nextColorForPath(document, requestPath), point: ''},
          })
        );
      } catch (error) {
        analysisQueryContextRef.current.delete(queryId);
        setAnalysisQueueRevision((current) => current + 1);
        throw error;
      }
    },
    [document, enabled]
  );

  useEffect(() => {
    if (!enabled || window.ulugo == null) return;
    const ulugo = window.ulugo;

    if (!analysisMode) {
      if (!hasPendingAnalysisQuery(analysisQueryContextRef.current, 'fast')) void ulugo.katago.stopAnalysis();
      return;
    }
    if (pendingSetupPathRef.current != null && samePath(pendingSetupPathRef.current, path)) return;
    if (fastAnalysisPendingCount > 0 || hasPendingAnalysisQuery(analysisQueryContextRef.current, 'fast')) {
      if (hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live')) {
        const liveQueryIds = getPendingAnalysisQueryIds(analysisQueryContextRef.current, 'live');
        clearPendingAnalysisQueries('live');
        void ulugo.katago.stopAnalysis(liveQueryIds);
      }
      return;
    }

    const targetVisits = liveAnalysisTargetVisits;
    const liveNodeId = currentNodeId;
    if ((analysisCache[liveNodeId]?.visits ?? 0) >= targetVisits) return;
    if (hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live', liveNodeId)) return;
    let cancelled = false;

    void (async () => {
      try {
        if (hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live')) {
          const liveQueryIds = getPendingAnalysisQueryIds(analysisQueryContextRef.current, 'live');
          clearPendingAnalysisQueries('live');
          await ulugo.katago.stopAnalysis(liveQueryIds);
        }
        if (!cancelled) await requestAnalysis(path, 'live', targetVisits, true);
      } catch (error: unknown) {
        appendKataGoConsoleMessage(
          createLocalConsoleMessage('ulugo', 'error', error instanceof Error ? error.message : startFailedMessage)
        );
        setAnalysisModeActive(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    analysisMode,
    analysisDeepMode,
    analysisQueueRevision,
    appendKataGoConsoleMessage,
    analysisCache,
    clearPendingAnalysisQueries,
    currentNodeId,
    document,
    enabled,
    fastAnalysisPendingCount,
    kataGoSettings.maxVisits,
    liveAnalysisTargetVisits,
    path,
    pendingSetupPathRef,
    requestAnalysis,
    setAnalysisModeActive,
    startFailedMessage,
  ]);

  const handleFastAnalysis = useCallback(async (): Promise<void> => {
    if (!enabled || window.ulugo == null || !analysisMode) return;

    try {
      const settings = await refreshKataGoSettings();
      const targetVisits = Math.max(1, settings.fastVisits || defaultKataGoSettings.fastVisits);
      const runVersion = documentVersionRef.current;
      const staleFastQueryIds = getFastQueryIdsOutsidePaths(analysisQueryContextRef.current, analysisPaths);
      if (staleFastQueryIds.length > 0) {
        for (const queryId of staleFastQueryIds) analysisQueryContextRef.current.delete(queryId);
        setAnalysisQueueRevision((current) => current + 1);
        await window.ulugo.katago.stopAnalysis(staleFastQueryIds);
      }

      let availableSlots =
        maxFastAnalysisQueries - getPendingAnalysisQueryIds(analysisQueryContextRef.current, 'fast').length;
      if (availableSlots <= 0) return;

      const jobs = buildFastAnalysisJobs({
        analysisPaths,
        currentPath: path,
        valueMode: analysisSettings.moveDisplay === 'absScore',
        document,
        analysisCache,
        targetVisits,
        pendingQueries: analysisQueryContextRef.current,
      });

      for (const job of jobs) {
        if (availableSlots <= 0 || !analysisModeRef.current || runVersion !== documentVersionRef.current) break;
        if (job.hiddenPass) {
          await requestHiddenPassAnalysis(job.path, 'fast', targetVisits, -100);
        } else {
          await requestAnalysis(job.path, 'fast', targetVisits);
        }
        availableSlots -= 1;
      }
    } catch (error) {
      appendKataGoConsoleMessage(
        createLocalConsoleMessage('ulugo', 'error', error instanceof Error ? error.message : startFailedMessage)
      );
    }
  }, [
    analysisCache,
    analysisMode,
    analysisPaths,
    analysisSettings.moveDisplay,
    appendKataGoConsoleMessage,
    document,
    enabled,
    path,
    refreshKataGoSettings,
    requestAnalysis,
    requestHiddenPassAnalysis,
    startFailedMessage,
  ]);

  useEffect(() => {
    if (!analysisMode || analysisPaths.length === 0) return;
    void handleFastAnalysis();
  }, [analysisPaths.length, analysisMode, analysisQueueRevision, handleFastAnalysis]);

  return {
    analysisSettings,
    updateAnalysisSettings,
    onAnalysisSettingsSave: saveAnalysisSettings,
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
  };
}

function readStoredAnalysisSettings(enabled: boolean): AnalysisSettings {
  const defaults: AnalysisSettings = enabled
    ? defaultAnalysisSettings
    : {...defaultAnalysisSettings, mode: 'edit', ...defaultEditModeSettings, boardBackground: 'golden'};

  try {
    const value = localStorage.getItem(analysisSettingsStorageKey);
    if (value == null) return normalizeAnalysisSettings(defaults, enabled);
    const stored = JSON.parse(value) as Partial<AnalysisSettings> & {
      stoneOverlay?: AnalysisSettings['stoneOverlay'] | 'markup';
      topMoveDisplay?: AnalysisSettings['stoneOverlay'] | 'markup';
    };
    return normalizeAnalysisSettings({...defaults, ...stored}, enabled);
  } catch {
    return normalizeAnalysisSettings(defaults, enabled);
  }
}

function writeStoredAnalysisSettings(settings: AnalysisSettings): void {
  try {
    localStorage.setItem(analysisSettingsStorageKey, JSON.stringify(settings));
  } catch {
    // Ignore storage failures; settings still apply for this session.
  }
}

function normalizeAnalysisSettings(
  settings: Partial<AnalysisSettings> & {
    stoneOverlay?: AnalysisSettings['stoneOverlay'] | 'markup';
    topMoveDisplay?: AnalysisSettings['stoneOverlay'] | 'markup';
  },
  enabled: boolean
): AnalysisSettings {
  const storedMode: AnalysisMode = settings.mode === 'edit' ? 'edit' : 'review';
  const mode: AnalysisMode = enabled ? storedMode : 'edit';
  const modeDefaults = mode === 'review' ? defaultReviewModeSettings : defaultEditModeSettings;
  const activeSource = mode === storedMode ? settings : (settings.modeSettings?.[mode] ?? {});
  const stoneOverlay =
    activeSource.stoneOverlay ??
    (mode === storedMode ? settings.topMoveDisplay : undefined) ??
    modeDefaults.stoneOverlay;
  const showMarkup = activeSource.showMarkup ?? readLegacyShowMarkup() ?? modeDefaults.showMarkup;
  const activeModeSettings = normalizeModeSettings(
    {
      stoneOverlay: stoneOverlay === 'markup' ? 'none' : stoneOverlay,
      showMarkup,
      showNextMove: activeSource.showNextMove,
      showTopMoves: activeSource.showTopMoves,
      showExpectedTerritory: activeSource.showExpectedTerritory,
      showScore: activeSource.showScore,
      showPointLoss: activeSource.showPointLoss,
      showWinrate: activeSource.showWinrate,
      showComments: activeSource.showComments,
    },
    modeDefaults
  );
  const modeSettings = {
    review: normalizeModeSettings(settings.modeSettings?.review, defaultReviewModeSettings),
    edit: normalizeModeSettings(settings.modeSettings?.edit, defaultEditModeSettings),
    [mode]: activeModeSettings,
  };
  const normalized = {
    ...defaultAnalysisSettings,
    ...settings,
    mode,
    ...activeModeSettings,
    modeSettings,
  };
  if (!enabled && normalized.boardBackground === 'auto') return {...normalized, boardBackground: 'golden'};
  return normalized;
}

function normalizeModeSettings(
  settings: Partial<AnalysisModeSettings> | undefined,
  defaults: AnalysisModeSettings
): AnalysisModeSettings {
  const stoneOverlay = settings?.stoneOverlay;
  return {
    ...defaults,
    ...settings,
    stoneOverlay:
      stoneOverlay === 'dot' || stoneOverlay === 'number' || stoneOverlay === 'none'
        ? stoneOverlay
        : defaults.stoneOverlay,
  };
}

function updateCurrentModeSettings(settings: AnalysisSettings, values: Partial<AnalysisSettings>): AnalysisSettings {
  const next = {...settings, ...values};
  const modeSettings = {...settings.modeSettings};
  let changedModeSettings = false;

  for (const key of modeSettingKeys) {
    if (key in values) changedModeSettings = true;
  }

  if (changedModeSettings) {
    modeSettings[settings.mode] = normalizeModeSettings(
      Object.fromEntries(modeSettingKeys.map((key) => [key, next[key]])),
      settings.mode === 'review' ? defaultReviewModeSettings : defaultEditModeSettings
    );
  }

  return {...next, modeSettings};
}

function switchAnalysisMode(settings: AnalysisSettings, mode: AnalysisMode, enabled: boolean): AnalysisSettings {
  const modeSettings = {
    ...settings.modeSettings,
    [settings.mode]: normalizeModeSettings(
      Object.fromEntries(modeSettingKeys.map((key) => [key, settings[key]])),
      settings.mode === 'review' ? defaultReviewModeSettings : defaultEditModeSettings
    ),
  };
  return normalizeAnalysisSettings(
    {
      ...settings,
      mode,
      ...modeSettings[mode],
      modeSettings,
    },
    enabled
  );
}

function readLegacyShowMarkup(): boolean | undefined {
  try {
    const value = localStorage.getItem(showMarkupStorageKey);
    return value == null ? undefined : value === 'true';
  } catch {
    return undefined;
  }
}

function buildFastAnalysisJobs({
  analysisPaths,
  currentPath,
  valueMode,
  document,
  analysisCache,
  targetVisits,
  pendingQueries,
}: {
  analysisPaths: number[][];
  currentPath: number[];
  valueMode: boolean;
  document: SgfDocument;
  analysisCache: Record<string, CachedAnalysis>;
  targetVisits: number;
  pendingQueries: Map<string, AnalysisQueryContext>;
}): FastAnalysisJob[] {
  const currentIndex = analysisPaths.findIndex((movePath) => samePath(movePath, currentPath));
  const firstNextIndex = currentIndex < 0 ? 0 : currentIndex + 1;
  const nextPaths = analysisPaths.slice(firstNextIndex, firstNextIndex + nextFastAnalysisCount);
  const currentPaths = currentIndex < 0 ? [] : [analysisPaths[currentIndex]];
  const nextKeys = new Set(nextPaths.map(pathKey));
  const currentKeys = new Set(currentPaths.map(pathKey));
  const otherPaths = analysisPaths.filter((movePath) => {
    const key = pathKey(movePath);
    return !currentKeys.has(key) && !nextKeys.has(key);
  });
  const jobs: FastAnalysisJob[] = [];
  const queued = new Set<string>();

  function addNormalJobs(paths: number[][]): void {
    for (const movePath of paths) {
      const nodeId = nodeKey(document, movePath);
      const cached = analysisCache[nodeId];
      if (cached != null && cached.visits >= targetVisits) continue;
      if (hasPendingAnalysisQuery(pendingQueries, 'fast', nodeId, null)) continue;
      addJob({path: movePath, hiddenPass: false});
    }
  }

  function addHiddenPassJobs(paths: number[][]): void {
    if (!valueMode) return;
    for (const movePath of paths) {
      const nodeId = nodeKey(document, movePath);
      if (!shouldRequestHiddenPassAnalysis(document, movePath, analysisCache, targetVisits)) continue;
      if (hasPendingAnalysisQuery(pendingQueries, 'fast', nodeId, 'pass')) continue;
      addJob({path: movePath, hiddenPass: true});
    }
  }

  function addJob(job: FastAnalysisJob): void {
    const key = `${pathKey(job.path)}:${job.hiddenPass ? 'pass' : 'normal'}`;
    if (queued.has(key)) return;
    queued.add(key);
    jobs.push(job);
  }

  addNormalJobs(currentPaths);
  addHiddenPassJobs(currentPaths);
  addNormalJobs(nextPaths);
  addHiddenPassJobs(nextPaths);
  addNormalJobs(otherPaths);
  addHiddenPassJobs(otherPaths);

  return jobs;
}

function getFastQueryIdsOutsidePaths(
  pendingQueries: Map<string, AnalysisQueryContext>,
  analysisPaths: number[][]
): string[] {
  const pathKeys = new Set(analysisPaths.map(pathKey));
  return [...pendingQueries.entries()]
    .filter(([, context]) => context.mode === 'fast' && !pathKeys.has(pathKey(context.path)))
    .map(([queryId]) => queryId);
}
