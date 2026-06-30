import {getNodeAtPath, samePath, type SgfDocument} from '@ulugo/sgf-core';
import {type AnalysisChartPoint, type AnalysisSettings} from '@ulugo/analysis-core';
import {
  buildKataGoQuery,
  defaultKataGoSettings,
  type KataGoAnalysisQuery,
  type KataGoConsoleMessage,
  type KataGoSettings,
} from '@ulugo/katago-core';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
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
  shouldCountHiddenPassAnalysis,
  updateAnalysisCache,
  type AnalysisQueryContext,
  type CachedAnalysis,
} from './appAnalysisUtils';
import {nodeKey} from './sgfPathUtils';
import {createLocalConsoleMessage} from './katagoConsoleUtils';
import {
  buildFastAnalysisJobs,
  getFastQueryIdsOutsidePaths,
  getStaleLiveQueryIds,
  livePassAnalysisRequest,
  passAnalysisNodeId,
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

interface UseKataGoAnalysisOptions {
  enabled: boolean;
  document: SgfDocument;
  path: number[];
  analysisPaths: number[][];
  analysisChartPaths: number[][];
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
  const normalAnalysisTargetVisits = Math.max(1, kataGoSettings.maxVisits || defaultKataGoSettings.maxVisits);
  const livePassTargetVisits = analysisDeepMode
    ? normalAnalysisTargetVisits
    : Math.max(1, Math.ceil(normalAnalysisTargetVisits * 0.5));

  const currentAnalysis = useMemo(
    () => (enabled ? (analysisCache[currentNodeId]?.result ?? null) : null),
    [analysisCache, currentNodeId, enabled]
  );
  const currentPassAnalysis = useMemo(() => {
    if (!enabled) return null;
    const passChildPath = findPassChildPath(document, path);
    const nodeId = passChildPath == null ? hiddenPassAnalysisKey(document, path) : nodeKey(document, passChildPath);
    return analysisCache[nodeId]?.result ?? null;
  }, [analysisCache, document, enabled, path]);
  const analysisTargetVisits = Math.max(1, kataGoSettings.fastVisits || defaultKataGoSettings.fastVisits);
  const needsPassAnalysis = analysisSettings.moveDisplay.includes('value') || analysisSettings.showHotZone;
  const analysisPendingCounts = useMemo(() => {
    if (!enabled) return {normal: 0, hiddenPass: 0};

    const normal = analysisPaths.filter((movePath) => {
      const nodeId = nodeKey(document, movePath);
      const cached = analysisCache[nodeId];
      return cached == null || cached.visits < analysisTargetVisits;
    }).length;
    const hiddenPass = needsPassAnalysis
      ? analysisPaths.filter((movePath) =>
          shouldCountHiddenPassAnalysis(document, movePath, analysisCache, analysisTargetVisits)
        ).length
      : 0;
    return {normal, hiddenPass};
  }, [
    analysisCache,
    analysisPaths,
    analysisQueueRevision,
    analysisTargetVisits,
    document,
    enabled,
    needsPassAnalysis,
  ]);
  const fastAnalysisPendingCount = analysisPendingCounts.normal + analysisPendingCounts.hiddenPass;
  const analysisIdle =
    analysisMode &&
    fastAnalysisPendingCount === 0 &&
    !hasPendingAnalysisQuery(analysisQueryContextRef.current, 'fast') &&
    !hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live') &&
    (analysisCache[currentNodeId]?.visits ?? 0) >= liveAnalysisTargetVisits &&
    (!needsPassAnalysis ||
      !shouldCountHiddenPassAnalysis(document, path, analysisCache, livePassTargetVisits));
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

  const removePendingAnalysisQueries = useCallback((queryIds: string[]): void => {
    let changed = false;
    for (const queryId of queryIds) {
      changed = analysisQueryContextRef.current.delete(queryId) || changed;
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
      } else {
        setAnalysisCache((current) => {
          let updated =
            options.convertHiddenPassPath == null
              ? current
              : convertHiddenPassAnalysisToRegularPass(current, next, options.convertHiddenPassPath);
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
          document,
          path: context.path,
          nodeId: context.nodeId,
          mergeMove: context.mergeMove,
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
  }, [appendKataGoConsoleMessage, document, enabled, setAnalysisModeActive]);

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
        mergeMove: options.mergeMove,
      });
      setAnalysisQueueRevision((current) => current + 1);

      try {
        await window.ulugo.katago.analyze(
          buildKataGoQuery(document, {
            id: queryId,
            path: requestPath,
            live: options.live,
            maxVisits,
            priority: options.priority,
            nextMove: options.nextMove,
            overrideSettings: options.overrideSettings,
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
    const passRequest = needsPassAnalysis
      ? livePassAnalysisRequest(document, path, analysisCache, livePassTargetVisits)
      : null;
    const needsMain = (analysisCache[liveNodeId]?.visits ?? 0) < targetVisits;
    const mainPending = hasPendingAnalysisQuery(analysisQueryContextRef.current, 'live', liveNodeId, null);
    const passPending =
      passRequest != null &&
      hasPendingAnalysisQuery(
        analysisQueryContextRef.current,
        'live',
        passAnalysisNodeId(document, passRequest),
        passRequest.passAnalysis === 'hidden' ? 'pass' : null
      );
    if ((!needsMain || mainPending) && (passRequest == null || passPending)) return;
    let cancelled = false;

    void (async () => {
      try {
        const liveQueryIds = getStaleLiveQueryIds(
          analysisQueryContextRef.current,
          needsMain ? liveNodeId : null,
          passRequest == null ? null : passAnalysisNodeId(document, passRequest),
          passRequest?.passAnalysis === 'hidden'
        );
        if (liveQueryIds.length > 0) {
          removePendingAnalysisQueries(liveQueryIds);
          await ulugo.katago.stopAnalysis(liveQueryIds);
        }
        if (cancelled) return;
        await delay(liveAnalysisDelayMs);
        if (cancelled) return;

        await Promise.all([
          needsMain && !mainPending ? requestAnalysis(path, 'live', targetVisits, {live: true}) : Promise.resolve(),
          passRequest != null && !passPending
            ? requestPassAnalysis(document, requestAnalysis, passRequest, 'live', {live: true})
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
    clearPendingAnalysisQueries,
    currentNodeId,
    document,
    enabled,
    fastAnalysisPendingCount,
    kataGoSettings.maxVisits,
    liveAnalysisTargetVisits,
    livePassTargetVisits,
    removePendingAnalysisQueries,
    path,
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
      const staleFastQueryIds = getFastQueryIdsOutsidePaths(analysisQueryContextRef.current, analysisPaths, document);
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
        passAnalysisMode: needsPassAnalysis,
        document,
        analysisCache,
        targetVisits,
        pendingQueries: analysisQueryContextRef.current,
      });

      for (const job of jobs) {
        if (availableSlots <= 0 || !analysisModeRef.current || runVersion !== documentVersionRef.current) break;
        if (job.passAnalysis != null) {
          await requestPassAnalysis(
            document,
            requestAnalysis,
            {path: job.path, passAnalysis: job.passAnalysis, targetVisits},
            'fast',
            {priority: job.passAnalysis === 'hidden' ? -100 : undefined}
          );
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
    needsPassAnalysis,
    appendKataGoConsoleMessage,
    document,
    enabled,
    path,
    refreshKataGoSettings,
    requestAnalysis,
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

function requestPassAnalysis(
  document: SgfDocument,
  requestAnalysis: RequestAnalysis,
  request: PassAnalysisRequest,
  mode: AnalysisQueryContext['mode'],
  options: Pick<AnalysisRequestOptions, 'live' | 'priority'> = {}
): Promise<void> {
  return requestAnalysis(request.path, mode, request.targetVisits, passAnalysisOptions(document, request, options));
}

function passAnalysisOptions(
  document: SgfDocument,
  request: PassAnalysisRequest,
  options: Pick<AnalysisRequestOptions, 'live' | 'priority'>
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
