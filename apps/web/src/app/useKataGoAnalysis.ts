import {getNodeAtPath, isScoringNode, samePath, type SgfDocument} from '@ulugo/sgf-core';
import {type AnalysisChartPoint, type AnalysisSettings} from '@ulugo/analysis-core';
import {
  buildKataGoQuery,
  defaultKataGoSettings,
  type KataGoAnalysisQuery,
  type KataGoConsoleMessage,
  type KataGoSettings,
} from '@ulugo/katago-core';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  analysisReady,
  buildAnalysisChartData,
  buildStoneScoreDeltas,
  convertHiddenPassAnalysisToRegularPass,
  findPassChildPath,
  getAnalysisVisits,
  getPendingAnalysisQueryIds,
  hasPendingAnalysisQuery,
  hiddenPassAnalysisKey,
  nextColorForPath,
  normalizeWinratePercent,
  pruneAnalysisCache,
  shouldCountHiddenPassAnalysis,
  updateAnalysisCache,
  type AnalysisQueryContext,
  type CachedAnalysis,
} from './appAnalysisUtils';
import {nodeKey} from './sgfPathUtils';
import {createLocalConsoleMessage} from './katagoConsoleUtils';
import {
  buildAnalysisPathEntries,
  buildBackgroundPassAnalysisJobs,
  buildFastAnalysisJobs,
  dispatchFastAnalysisJobs,
  getFastQueryIdsOutsideEntries,
  getStaleLiveQueryIds,
  livePassAnalysisRequest,
  passAnalysisNodeId,
  shouldCountPassAnalysis,
  type PassAnalysisRequest,
} from './analysisQueueUtils';
import {
  normalizeAnalysisSettings,
  readStoredAnalysisSettings,
  switchAnalysisMode,
  updateCurrentModeSettings,
  writeStoredAnalysisSettings,
} from './analysisSettingsStorage';

const deepAnalysisVisits = 10_000_000;
const maxFastAnalysisQueries = 2;
const liveAnalysisDelayMs = 100;
const emptyAnalysisChartData: AnalysisChartPoint[] = [];
const emptyStoneScoreDeltas = new Map<string, number>();

interface UseKataGoAnalysisOptions {
  enabled: boolean;
  document: SgfDocument;
  path: number[];
  analysisPaths: number[][];
  analysisChartPaths: number[][];
  deferAnalysisTargetChange: boolean;
  skipEmptyInitialBoardLiveAnalysis: boolean;
  startFailedMessage: string;
}

interface AnalysisDocumentChangeOptions {
  clearAnalysisCache?: boolean;
  convertHiddenPassPath?: number[];
  invalidateAnalysisPath?: number[];
}

type RequestAnalysis = (
  requestPath: number[],
  mode: AnalysisQueryContext['mode'],
  maxVisits: number,
  options?: AnalysisRequestOptions
) => Promise<void>;
interface AnalysisRequestOptions {
  live?: boolean;
  priority?: number;
  includeOwnership?: boolean;
  nextMove?: {color: 'B' | 'W'; point: string};
  overrideSettings?: KataGoAnalysisQuery['overrideSettings'];
  cacheNodeId?: string;
  mergeMove?: string;
}

export function useKataGoAnalysis({
  enabled,
  document,
  path,
  analysisPaths,
  analysisChartPaths,
  deferAnalysisTargetChange,
  skipEmptyInitialBoardLiveAnalysis,
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
  const kataGoSettingsRef = useRef(defaultKataGoSettings);
  const documentRef = useRef(document);
  useLayoutEffect(() => {
    documentRef.current = document;
  }, [document]);
  const documentVersionRef = useRef(0);
  const analysisModeRef = useRef(false);
  const analysisDeepModeRef = useRef(false);
  const kataGoConsoleRef = useRef<HTMLDivElement>(null);
  const currentNode = getNodeAtPath(document, path);
  const currentPathSupportsAnalysis = path.length === 0 || !isScoringNode(currentNode);
  const emptyInitialBoardPath = skipEmptyInitialBoardLiveAnalysis && path.length === 0 && !hasSetupStones(currentNode);
  const currentPathNeedsLiveAnalysis = currentPathSupportsAnalysis && (!emptyInitialBoardPath || analysisDeepMode);
  const currentNodeId = currentNode.id;
  const liveAnalysisTargetVisits = analysisDeepMode
    ? deepAnalysisVisits
    : Math.max(1, kataGoSettings.maxVisits || defaultKataGoSettings.maxVisits);
  const normalAnalysisTargetVisits = Math.max(1, kataGoSettings.maxVisits || defaultKataGoSettings.maxVisits);
  const livePassTargetVisits = analysisDeepMode
    ? normalAnalysisTargetVisits
    : Math.max(1, Math.ceil(normalAnalysisTargetVisits * 0.5));
  const analysisEntries = useMemo(() => buildAnalysisPathEntries(document, analysisPaths), [analysisPaths, document]);
  const analysisEntryByNodeId = useMemo(
    () => new Map(analysisEntries.map((entry) => [entry.nodeId, entry])),
    [analysisEntries]
  );
  const currentAnalysisEntry = analysisEntryByNodeId.get(currentNodeId);

  const currentAnalysis = useMemo(
    () => (enabled && currentPathSupportsAnalysis ? (analysisCache[currentNodeId]?.result ?? null) : null),
    [analysisCache, currentNodeId, currentPathSupportsAnalysis, enabled]
  );
  const currentPassAnalysis = useMemo(() => {
    if (!enabled || !currentPathSupportsAnalysis) return null;
    if (currentAnalysisEntry != null) return analysisCache[currentAnalysisEntry.passNodeId]?.result ?? null;

    const passChildPath = findPassChildPath(document, path);
    const nodeId = passChildPath == null ? hiddenPassAnalysisKey(document, path) : nodeKey(document, passChildPath);
    return analysisCache[nodeId]?.result ?? null;
  }, [analysisCache, currentAnalysisEntry, currentPathSupportsAnalysis, document, enabled, path]);
  const analysisTargetVisits = Math.max(1, kataGoSettings.fastVisits || defaultKataGoSettings.fastVisits);
  const needsPassAnalysis =
    analysisSettings.moveDisplay.includes('value') || analysisSettings.showHotZone || analysisSettings.showIntensity;
  const normalAnalysisNeedsOwnership = analysisSettings.showExpectedTerritory || analysisSettings.showHotZone;
  const passAnalysisNeedsOwnership = analysisSettings.showHotZone;
  const normalScorePendingCount = useMemo(
    () =>
      enabled
        ? analysisEntries.filter((entry) => !analysisReady(analysisCache[entry.nodeId], analysisTargetVisits, false))
            .length
        : 0,
    [analysisCache, analysisEntries, analysisTargetVisits, enabled]
  );
  const currentOwnershipPendingCount =
    enabled &&
    normalAnalysisNeedsOwnership &&
    currentAnalysisEntry != null &&
    analysisReady(analysisCache[currentNodeId], analysisTargetVisits, false) &&
    !analysisReady(analysisCache[currentNodeId], analysisTargetVisits, true)
      ? 1
      : 0;
  const normalFastPendingCount = normalScorePendingCount + currentOwnershipPendingCount;
  const branchPassPendingCount = useMemo(
    () =>
      enabled && needsPassAnalysis
        ? analysisEntries.filter((entry) =>
            shouldCountPassAnalysis(entry, analysisCache, analysisTargetVisits, passAnalysisNeedsOwnership)
          ).length
        : 0,
    [analysisCache, analysisEntries, analysisTargetVisits, enabled, needsPassAnalysis, passAnalysisNeedsOwnership]
  );
  const currentPassPendingCount =
    currentPathSupportsAnalysis &&
    needsPassAnalysis &&
    (currentAnalysisEntry == null
      ? shouldCountHiddenPassAnalysis(document, path, analysisCache, analysisTargetVisits, passAnalysisNeedsOwnership)
      : shouldCountPassAnalysis(currentAnalysisEntry, analysisCache, analysisTargetVisits, passAnalysisNeedsOwnership))
      ? 1
      : 0;
  const currentLiveAnalysisReady =
    !currentPathNeedsLiveAnalysis ||
    (analysisReady(analysisCache[currentNodeId], liveAnalysisTargetVisits, normalAnalysisNeedsOwnership) &&
      (!needsPassAnalysis ||
        !(currentAnalysisEntry == null
          ? shouldCountHiddenPassAnalysis(
              document,
              path,
              analysisCache,
              livePassTargetVisits,
              passAnalysisNeedsOwnership
            )
          : shouldCountPassAnalysis(
              currentAnalysisEntry,
              analysisCache,
              livePassTargetVisits,
              passAnalysisNeedsOwnership
            ))));
  const analysisIdle =
    analysisMode &&
    normalFastPendingCount === 0 &&
    !hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live') &&
    currentLiveAnalysisReady;
  const backgroundPassPendingCount = Math.max(
    0,
    branchPassPendingCount - (currentAnalysisEntry == null ? 0 : currentPassPendingCount)
  );
  const fastAnalysisPendingCount =
    normalFastPendingCount + currentPassPendingCount + (analysisIdle ? backgroundPassPendingCount : 0);
  const showAnalysisChart =
    analysisSettings.showScore ||
    analysisSettings.showPointLoss ||
    analysisSettings.showWinrate ||
    analysisSettings.showIntensity;
  const analysisChartData = useMemo<AnalysisChartPoint[]>(
    () =>
      enabled && showAnalysisChart
        ? buildAnalysisChartData(document, analysisChartPaths, analysisCache)
        : emptyAnalysisChartData,
    [analysisCache, analysisChartPaths, document, enabled, showAnalysisChart]
  );
  const selectedChartMoveNumber = useMemo(() => {
    if (!enabled) return null;
    const chartPath = analysisChartPaths[path.length];
    return chartPath != null && samePath(chartPath, path) ? path.length : null;
  }, [analysisChartPaths, enabled, path]);
  const analysisChartSummary = useMemo(() => {
    if (!enabled) return null;

    const rootInfo = currentAnalysis?.rootInfo;
    const scoreLead = rootInfo?.scoreLead ?? rootInfo?.scoreMean ?? null;
    const winrate = rootInfo?.winrate == null ? null : normalizeWinratePercent(rootInfo.winrate);
    return scoreLead == null && winrate == null ? null : {scoreLead, winrate};
  }, [currentAnalysis, enabled]);
  const stoneScoreDeltas = useMemo(
    () =>
      enabled && analysisSettings.stoneOverlay === 'dot'
        ? buildStoneScoreDeltas(document, path, analysisCache)
        : emptyStoneScoreDeltas,
    [analysisCache, analysisSettings.stoneOverlay, document, enabled, path]
  );
  const fastAnalysisTargetRef = useRef({
    analysisCache,
    analysisEntries,
    analysisIdle,
    analysisTargetVisits,
    document,
    needsPassAnalysis,
    normalAnalysisNeedsOwnership,
    passAnalysisNeedsOwnership,
    path,
  });
  useLayoutEffect(() => {
    fastAnalysisTargetRef.current = {
      analysisCache,
      analysisEntries,
      analysisIdle,
      analysisTargetVisits,
      document,
      needsPassAnalysis,
      normalAnalysisNeedsOwnership,
      passAnalysisNeedsOwnership,
      path,
    };
  }, [
    analysisCache,
    analysisEntries,
    analysisIdle,
    analysisTargetVisits,
    document,
    needsPassAnalysis,
    normalAnalysisNeedsOwnership,
    passAnalysisNeedsOwnership,
    path,
  ]);

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

  const removePendingAnalysisQueries = useCallback((queryIds: string[]): void => {
    let changed = false;
    for (const queryId of queryIds) {
      changed = analysisQueryContextRef.current.delete(queryId) || changed;
    }
    if (changed) setAnalysisQueueRevision((current) => current + 1);
  }, []);

  const resetAnalysisForSettingsChange = useCallback((): void => {
    const pendingQueryIds = [...analysisQueryContextRef.current.keys()];
    documentVersionRef.current += 1;
    analysisQueryContextRef.current.clear();
    if (pendingQueryIds.length > 0) {
      setAnalysisQueueRevision((current) => current + 1);
      if (enabled && window.ulugo != null) void window.ulugo.katago.stopAnalysis(pendingQueryIds);
    }
    setAnalysisCache({});
  }, [enabled]);

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
      } else {
        setAnalysisCache((current) => {
          let updated =
            options.convertHiddenPassPath == null
              ? current
              : convertHiddenPassAnalysisToRegularPass(current, next, options.convertHiddenPassPath);
          updated = pruneAnalysisCache(updated, next);
          if (options.invalidateAnalysisPath == null) return updated;

          const nodeId = getNodeAtPath(next, options.invalidateAnalysisPath).id;
          if (updated[nodeId] == null && updated[`${nodeId}:pass`] == null) return updated;
          updated = {...updated};
          delete updated[nodeId];
          delete updated[`${nodeId}:pass`];
          return updated;
        });
      }
    },
    [enabled]
  );

  const saveAnalysisSettings = useCallback(
    (settings: unknown): void => {
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
    if (!analysisCacheSettingsMatch(kataGoSettingsRef.current, settings)) resetAnalysisForSettingsChange();
    kataGoSettingsRef.current = settings;
    setKataGoSettings(settings);
    return settings;
  }, [enabled, resetAnalysisForSettingsChange]);

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
      if (result.error != null) {
        setAnalysisModeActive(false);
        return;
      }

      setKataGoInitialized(true);
      const visits = getAnalysisVisits(result);
      setAnalysisCache((current) => {
        const existing = current[context.nodeId];
        if (existing != null && visits < existing.visits && result.isDuringSearch) return current;

        return updateAnalysisCache({
          cache: current,
          document: documentRef.current,
          path: context.path,
          nodeId: context.nodeId,
          mergeMove: context.mergeMove,
          result,
          visits,
        });
      });
    });
    const unsubscribeAnalysisReset = window.ulugo.katago.onAnalysisReset((queryIds, fatal) => {
      let changed = false;
      for (const queryId of queryIds) {
        changed = analysisQueryContextRef.current.delete(queryId) || changed;
      }
      if (changed) setAnalysisQueueRevision((current) => current + 1);
      if (fatal) setAnalysisModeActive(false);
    });
    const unsubscribeConsole = window.ulugo.katago.onConsoleMessage(appendKataGoConsoleMessage);

    return () => {
      unsubscribeAnalysis();
      unsubscribeAnalysisReset();
      unsubscribeConsole();
    };
  }, [appendKataGoConsoleMessage, enabled, setAnalysisModeActive]);

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
      options: AnalysisRequestOptions = {}
    ): Promise<void> => {
      if (!enabled || window.ulugo == null) return;

      const queryId = `ulugo-${mode}${options.mergeMove != null ? `-${options.mergeMove}` : ''}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      analysisQueryContextRef.current.set(queryId, {
        nodeId: options.cacheNodeId ?? nodeKey(document, requestPath),
        path: requestPath,
        version: documentVersionRef.current,
        mode,
        includeOwnership: options.includeOwnership ?? true,
        mergeMove: options.mergeMove,
      });
      setAnalysisQueueRevision((current) => current + 1);

      try {
        const overrideSettings =
          mode === 'fast' ? {...options.overrideSettings, wideRootNoise: 0} : options.overrideSettings;
        await window.ulugo.katago.analyze(
          buildKataGoQuery(document, {
            id: queryId,
            path: requestPath,
            live: options.live,
            maxVisits,
            priority: options.priority,
            includeOwnership: options.includeOwnership,
            nextMove: options.nextMove,
            overrideSettings,
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
    if (deferAnalysisTargetChange) return;
    if (!currentPathNeedsLiveAnalysis) {
      if (hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live')) {
        const liveQueryIds = getPendingAnalysisQueryIds(analysisQueryContextRef.current, 'live');
        clearPendingAnalysisQueries('live');
        void ulugo.katago.stopAnalysis(liveQueryIds);
      }
      return;
    }
    if (normalFastPendingCount > 0 || hasPendingAnalysisQuery(analysisQueryContextRef.current, 'fast')) {
      if (hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live')) {
        const liveQueryIds = getPendingAnalysisQueryIds(analysisQueryContextRef.current, 'live');
        clearPendingAnalysisQueries('live');
        void ulugo.katago.stopAnalysis(liveQueryIds);
      }
      return;
    }

    const targetVisits = liveAnalysisTargetVisits;
    const liveNodeId = currentNodeId;
    const passRequest = needsPassAnalysis
      ? livePassAnalysisRequest(document, path, analysisCache, livePassTargetVisits, passAnalysisNeedsOwnership)
      : null;
    const needsMain = !analysisReady(analysisCache[liveNodeId], targetVisits, normalAnalysisNeedsOwnership);
    const mainPending = hasPendingAnalysisQuery(
      analysisQueryContextRef.current,
      'live',
      liveNodeId,
      null,
      normalAnalysisNeedsOwnership
    );
    const passPending =
      passRequest != null &&
      hasPendingAnalysisQuery(
        analysisQueryContextRef.current,
        'live',
        passAnalysisNodeId(document, passRequest),
        passRequest.passAnalysis === 'hidden' ? 'pass' : null,
        passAnalysisNeedsOwnership
      );
    if ((!needsMain || mainPending) && (passRequest == null || passPending)) return;
    let cancelled = false;

    void (async () => {
      try {
        const liveQueryIds = getStaleLiveQueryIds(
          analysisQueryContextRef.current,
          needsMain ? liveNodeId : null,
          passRequest == null ? null : passAnalysisNodeId(document, passRequest),
          passRequest?.passAnalysis === 'hidden',
          normalAnalysisNeedsOwnership,
          passAnalysisNeedsOwnership
        );
        if (liveQueryIds.length > 0) {
          removePendingAnalysisQueries(liveQueryIds);
          await ulugo.katago.stopAnalysis(liveQueryIds);
        }
        if (cancelled) return;
        await delay(liveAnalysisDelayMs);
        if (cancelled) return;

        await Promise.all([
          needsMain && !mainPending
            ? requestAnalysis(path, 'live', targetVisits, {
                live: true,
                includeOwnership: normalAnalysisNeedsOwnership,
              })
            : Promise.resolve(),
          passRequest != null && !passPending
            ? requestPassAnalysis(document, requestAnalysis, passRequest, 'live', {
                live: true,
                includeOwnership: passAnalysisNeedsOwnership,
              })
            : Promise.resolve(),
        ]);
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
    needsPassAnalysis,
    normalAnalysisNeedsOwnership,
    passAnalysisNeedsOwnership,
    clearPendingAnalysisQueries,
    currentNodeId,
    currentPathNeedsLiveAnalysis,
    deferAnalysisTargetChange,
    document,
    enabled,
    kataGoSettings.maxVisits,
    liveAnalysisTargetVisits,
    livePassTargetVisits,
    normalFastPendingCount,
    removePendingAnalysisQueries,
    path,
    requestAnalysis,
    setAnalysisModeActive,
    startFailedMessage,
  ]);

  const handleFastAnalysis = useCallback(async (): Promise<void> => {
    if (!enabled || window.ulugo == null || !analysisMode) return;

    try {
      const runVersion = documentVersionRef.current;
      const staleFastQueryIds = getFastQueryIdsOutsideEntries(analysisQueryContextRef.current, analysisEntries);
      if (staleFastQueryIds.length > 0) {
        for (const queryId of staleFastQueryIds) analysisQueryContextRef.current.delete(queryId);
        setAnalysisQueueRevision((current) => current + 1);
        await window.ulugo.katago.stopAnalysis(staleFastQueryIds);
      }

      const currentTarget = fastAnalysisTargetRef.current;
      if (
        currentTarget.analysisCache !== analysisCache ||
        currentTarget.analysisIdle !== analysisIdle ||
        currentTarget.analysisEntries !== analysisEntries ||
        currentTarget.analysisTargetVisits !== analysisTargetVisits ||
        currentTarget.document !== document ||
        currentTarget.needsPassAnalysis !== needsPassAnalysis ||
        currentTarget.normalAnalysisNeedsOwnership !== normalAnalysisNeedsOwnership ||
        currentTarget.passAnalysisNeedsOwnership !== passAnalysisNeedsOwnership ||
        currentTarget.path !== path
      ) {
        return;
      }

      const availableSlots =
        maxFastAnalysisQueries - getPendingAnalysisQueryIds(analysisQueryContextRef.current, 'fast').length;
      if (availableSlots <= 0) return;

      const jobs = buildFastAnalysisJobs({
        analysisEntries,
        currentNodeId,
        passAnalysisMode: needsPassAnalysis,
        currentAnalysisNeedsOwnership: normalAnalysisNeedsOwnership,
        passAnalysisNeedsOwnership,
        analysisCache,
        targetVisits: analysisTargetVisits,
        pendingQueries: analysisQueryContextRef.current,
      });
      if (jobs.length === 0 && analysisIdle && needsPassAnalysis) {
        jobs.push(
          ...buildBackgroundPassAnalysisJobs({
            analysisEntries,
            analysisCache,
            targetVisits: analysisTargetVisits,
            pendingQueries: analysisQueryContextRef.current,
            requireOwnership: passAnalysisNeedsOwnership,
            limit: availableSlots,
          })
        );
      }

      if (!analysisModeRef.current || runVersion !== documentVersionRef.current) return;
      await dispatchFastAnalysisJobs(jobs, availableSlots, (job) =>
        job.passAnalysis != null
          ? requestPassAnalysis(
              document,
              requestAnalysis,
              {path: job.path, passAnalysis: job.passAnalysis, targetVisits: analysisTargetVisits},
              'fast',
              {
                priority: job.passAnalysis === 'hidden' ? -100 : undefined,
                includeOwnership: passAnalysisNeedsOwnership,
              }
            )
          : requestAnalysis(job.path, 'fast', analysisTargetVisits, {
              includeOwnership: job.includeOwnership === true,
            })
      );
    } catch (error) {
      appendKataGoConsoleMessage(
        createLocalConsoleMessage('ulugo', 'error', error instanceof Error ? error.message : startFailedMessage)
      );
    }
  }, [
    analysisCache,
    analysisEntries,
    analysisIdle,
    analysisMode,
    analysisTargetVisits,
    needsPassAnalysis,
    normalAnalysisNeedsOwnership,
    passAnalysisNeedsOwnership,
    appendKataGoConsoleMessage,
    document,
    enabled,
    path,
    requestAnalysis,
    startFailedMessage,
  ]);

  useEffect(() => {
    if (!analysisMode || deferAnalysisTargetChange || analysisEntries.length === 0) return;
    void handleFastAnalysis();
  }, [analysisEntries.length, analysisMode, analysisQueueRevision, deferAnalysisTargetChange, handleFastAnalysis]);

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
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function analysisCacheSettingsMatch(left: KataGoSettings, right: KataGoSettings): boolean {
  return (
    left.executablePath === right.executablePath &&
    left.modelPath === right.modelPath &&
    left.configPath === right.configPath &&
    left.altCommand === right.altCommand &&
    left.wideRootNoise === right.wideRootNoise
  );
}

function hasSetupStones(node: ReturnType<typeof getNodeAtPath>): boolean {
  return ['AB', 'AW', 'AE'].some((key) => (node.data[key]?.length ?? 0) > 0);
}

function requestPassAnalysis(
  document: SgfDocument,
  requestAnalysis: RequestAnalysis,
  request: PassAnalysisRequest,
  mode: AnalysisQueryContext['mode'],
  options: Pick<AnalysisRequestOptions, 'includeOwnership' | 'live' | 'priority'> = {}
): Promise<void> {
  return requestAnalysis(request.path, mode, request.targetVisits, passAnalysisOptions(document, request, options));
}

function passAnalysisOptions(
  document: SgfDocument,
  request: PassAnalysisRequest,
  options: Pick<AnalysisRequestOptions, 'includeOwnership' | 'live' | 'priority'>
): AnalysisRequestOptions {
  const requestOptions: AnalysisRequestOptions = {...options, overrideSettings: {wideRootNoise: 0}};
  if (request.passAnalysis !== 'hidden') return requestOptions;

  return {
    ...requestOptions,
    nextMove: {color: nextColorForPath(document, request.path), point: ''},
    cacheNodeId: hiddenPassAnalysisKey(document, request.path),
    mergeMove: 'pass',
  };
}
