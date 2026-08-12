import {Board, type Marker, type Vertex} from '@ulugo/go-board';
import {deriveBoardPosition} from '@ulugo/go-core';
import {
  getNodeAtPath,
  isScoringNode,
  pointToVertex,
  type SgfColor,
  type MarkupKind,
  type SgfDocument,
  vertexToPoint,
} from '@ulugo/sgf-core';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import type {AnalysisSettings, KataGoAnalysisResult} from '@ulugo/analysis-core';
import {
  applyPvMarkerMap,
  applyPvNullableMap,
  applyPvSignMap,
  buildAllPvCandidateMap,
  buildAnalysisOverlayMap,
  buildHotZoneMap,
  buildMoveHintMap,
  buildOwnershipMap,
  buildPvPreviewMap,
  buildScoringOwnershipMap,
  buildTopMovePvCandidateMap,
  childMoveSet,
  shouldShowMoveNumber,
  usesAreaValueOffset,
  vertexKey,
  type ActivePvPreview,
  type MoveNumberLimit,
  type PvPreviewCandidate,
  type Sign,
} from './boardAnalysisMaps';

export type {MoveNumberLimit} from './boardAnalysisMaps';

interface GoBoardProps {
  document: SgfDocument;
  path: number[];
  showCoordinates: boolean;
  showMarkup: boolean;
  moveNumberLimit: MoveNumberLimit;
  analysis: KataGoAnalysisResult | null;
  passAnalysis: KataGoAnalysisResult | null;
  stoneScoreDeltas: Map<string, number>;
  analysisSettings: AnalysisSettings;
  extraCurrentStonePoints: Set<string>;
  missingReferenceStonePoints: Set<string>;
  referencePastStones: Map<string, SgfColor>;
  referenceFutureStones: Map<string, SgfColor>;
  extraFutureStones: Map<string, SgfColor>;
  boardBackground: BoardBackgroundTheme;
  rules: string | undefined;
  onVertexClick: (point: string, options: BoardVertexClickOptions) => void;
  onVertexRightClick: (point: string, options: BoardVertexClickOptions) => void;
}

export interface BoardVertexClickOptions {
  shiftKey: boolean;
  clickCount: number;
}

type BoardBackgroundTheme = Exclude<AnalysisSettings['boardBackground'], 'auto'>;

const markerTypes: Record<MarkupKind, Marker['type']> = {
  CR: 'circle',
  SQ: 'square',
  TR: 'triangle',
  MA: 'cross',
  SL: 'point',
};

const boardBorderEm = 0.3;
const coordinateTrackEm = 2;
const boardPaddingWithoutCoordinatesEm = 0.5;

export function GoBoard({
  document,
  path,
  showCoordinates,
  showMarkup,
  moveNumberLimit,
  analysis,
  passAnalysis,
  stoneScoreDeltas,
  analysisSettings,
  extraCurrentStonePoints,
  missingReferenceStonePoints,
  referencePastStones,
  referenceFutureStones,
  extraFutureStones,
  boardBackground,
  rules,
  onVertexClick,
  onVertexRightClick,
}: GoBoardProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const pvIntervalRef = useRef<number | null>(null);
  const pendingPvRef = useRef<PvPreviewCandidate | null>(null);
  const pendingTouchClickRef = useRef<{vertexKey: string; time: number} | null>(null);
  const currentNode = useMemo(() => getNodeAtPath(document, path), [document, path]);
  const scoringNode = path.length > 0 && isScoringNode(currentNode);
  const position = useMemo(() => deriveBoardPosition(document, path), [document, path]);
  const valueOffset = useMemo(() => usesAreaValueOffset(rules), [rules]);
  const [pvPreview, setPvPreview] = useState<ActivePvPreview | null>(null);
  const [availableSize, setAvailableSize] = useState({width: 620, height: 620});
  const vertexSize = useMemo(() => {
    const extraSlots = showCoordinates ? coordinateTrackEm : boardPaddingWithoutCoordinatesEm;
    const slots = position.size + extraSlots + boardBorderEm;
    return Math.max(12, Math.floor(Math.min(availableSize.width, availableSize.height) / slots));
  }, [availableSize.height, availableSize.width, position.size, showCoordinates]);

  const signMap = useMemo(
    () =>
      Array.from({length: position.size}, (_, y) =>
        Array.from({length: position.size}, (_, x): Sign => {
          const stone = position.stones.get(vertexToPoint(x, y));
          return stone === 'B' ? 1 : stone === 'W' ? -1 : 0;
        })
      ),
    [position.size, position.stones]
  );
  const futureStoneMap = useMemo(
    () =>
      Array.from({length: position.size}, (_, y) =>
        Array.from({length: position.size}, (_, x) => {
          const point = vertexToPoint(x, y);
          return position.stones.has(point)
            ? null
            : (referenceFutureStones.get(point) ?? extraFutureStones.get(point) ?? null);
        })
      ),
    [extraFutureStones, position.size, position.stones, referenceFutureStones]
  );
  const pastStoneMap = useMemo(
    () =>
      Array.from({length: position.size}, (_, y) =>
        Array.from({length: position.size}, (_, x) => {
          const point = vertexToPoint(x, y);
          return position.stones.has(point) ? null : (referencePastStones.get(point) ?? null);
        })
      ),
    [position.size, position.stones, referencePastStones]
  );
  const futureStoneBooleanMap = useMemo(
    () => futureStoneMap.map((row) => row.map((stone) => stone != null)),
    [futureStoneMap]
  );
  const pastStoneBooleanMap = useMemo(
    () => pastStoneMap.map((row) => row.map((stone) => stone != null)),
    [pastStoneMap]
  );
  const extraStoneBooleanMap = useMemo(
    () =>
      Array.from({length: position.size}, (_, y) =>
        Array.from({length: position.size}, (_, x) => extraCurrentStonePoints.has(vertexToPoint(x, y)))
      ),
    [extraCurrentStonePoints, position.size]
  );
  const missingStoneBooleanMap = useMemo(
    () =>
      Array.from({length: position.size}, (_, y) =>
        Array.from({length: position.size}, (_, x) => missingReferenceStonePoints.has(vertexToPoint(x, y)))
      ),
    [missingReferenceStonePoints, position.size]
  );
  const signMapWithReferenceMoves = useMemo(
    () =>
      signMap.map((row, y) =>
        row.map((sign, x): Sign => {
          const referenceStone = pastStoneMap[y][x] ?? futureStoneMap[y][x];
          return sign || (referenceStone === 'B' ? 1 : referenceStone === 'W' ? -1 : 0);
        })
      ),
    [futureStoneMap, pastStoneMap, signMap]
  );
  const childMoves = useMemo(() => childMoveSet(document, path, position.size), [document, path, position.size]);
  const hoverPvCandidateMap = useMemo(
    () =>
      scoringNode
        ? new Map<string, PvPreviewCandidate>()
        : buildTopMovePvCandidateMap(position.size, childMoves, analysis, analysisSettings, position.nextColor),
    [analysis, analysisSettings, childMoves, position.nextColor, position.size, scoringNode]
  );
  const allPvCandidateMap = useMemo(
    () =>
      scoringNode
        ? new Map<string, PvPreviewCandidate>()
        : buildAllPvCandidateMap(position.size, analysis, position.nextColor),
    [analysis, position.nextColor, position.size, scoringNode]
  );
  const pvPreviewMap = useMemo(() => buildPvPreviewMap(position.size, pvPreview), [position.size, pvPreview]);

  const markerMap = useMemo(() => {
    const result = Array.from({length: position.size}, () => Array.from({length: position.size}, (): Marker => ({})));
    if (scoringNode) return result;

    for (const point of position.points) {
      if (showMarkup && point.label != null) {
        result[point.y][point.x] = {type: 'label', label: point.label};
      } else if (showMarkup && point.markup != null) {
        result[point.y][point.x] = {type: markerTypes[point.markup]};
      } else if (shouldShowMoveNumber(point.moveNumber, point.stone != null, position.moveNumber, moveNumberLimit)) {
        result[point.y][point.x] = {type: 'label', label: String(point.moveNumber)};
      }
    }

    return result;
  }, [moveNumberLimit, position.moveNumber, position.points, position.size, scoringNode, showMarkup]);
  const analysisOverlayMap = useMemo(
    () =>
      scoringNode
        ? undefined
        : buildAnalysisOverlayMap(
            position.size,
            childMoves,
            analysis,
            analysisSettings,
            position.nextColor,
            valueOffset,
            position.points,
            position.moveNumber,
            stoneScoreDeltas
          ),
    [
      analysis,
      analysisSettings,
      childMoves,
      position.moveNumber,
      position.nextColor,
      position.points,
      position.size,
      scoringNode,
      stoneScoreDeltas,
      valueOffset,
    ]
  );
  const moveHintMap = useMemo(
    () => (scoringNode ? undefined : buildMoveHintMap(position.size, document, path, analysis, analysisSettings)),
    [analysis, analysisSettings, document, path, position.size, scoringNode]
  );
  const ownershipMap = useMemo(
    () =>
      scoringNode
        ? buildScoringOwnershipMap(position.size, currentNode)
        : buildOwnershipMap(
            position.size,
            analysis,
            analysisSettings,
            position.stones,
            position.points,
            position.moveNumber,
            moveNumberLimit,
            analysisOverlayMap
          ),
    [
      analysis,
      analysisSettings,
      analysisOverlayMap,
      currentNode,
      moveNumberLimit,
      position.moveNumber,
      position.points,
      position.size,
      position.stones,
      scoringNode,
    ]
  );
  const hotZoneMap = useMemo(
    () =>
      scoringNode
        ? undefined
        : buildHotZoneMap(position.size, analysis, passAnalysis, analysisSettings, position.nextColor),
    [analysis, analysisSettings, passAnalysis, position.nextColor, position.size, scoringNode]
  );
  const displaySignMap = useMemo(
    () => applyPvSignMap(signMapWithReferenceMoves, pvPreviewMap),
    [pvPreviewMap, signMapWithReferenceMoves]
  );
  const displayMarkerMap = useMemo(() => applyPvMarkerMap(markerMap, pvPreviewMap), [markerMap, pvPreviewMap]);
  const displayAnalysisOverlayMap = useMemo(
    () => applyPvNullableMap(analysisOverlayMap, pvPreviewMap, position.size, null),
    [analysisOverlayMap, position.size, pvPreviewMap]
  );
  const displayMoveHintMap = useMemo(
    () => applyPvNullableMap(moveHintMap, pvPreviewMap, position.size, null),
    [moveHintMap, position.size, pvPreviewMap]
  );
  const displayOwnershipMap = useMemo(
    () => applyPvNullableMap(ownershipMap, pvPreviewMap, position.size, 0),
    [ownershipMap, position.size, pvPreviewMap]
  );
  const displayHotZoneMap = useMemo(
    () => applyPvNullableMap(hotZoneMap, pvPreviewMap, position.size, null),
    [hotZoneMap, position.size, pvPreviewMap]
  );
  const selectedVertices = useMemo(() => {
    if (scoringNode) return [];
    if (position.lastMove == null) return [];
    const vertex = pointToVertex(position.lastMove);
    if (vertex == null || pvPreviewMap?.[vertex[1]]?.[vertex[0]] != null) return [];
    return [vertex];
  }, [position.lastMove, pvPreviewMap, scoringNode]);

  const clearPvTimers = useCallback(() => {
    if (hoverTimerRef.current != null) window.clearTimeout(hoverTimerRef.current);
    if (pvIntervalRef.current != null) window.clearInterval(pvIntervalRef.current);
    hoverTimerRef.current = null;
    pvIntervalRef.current = null;
  }, []);

  const clearPvPreview = useCallback(() => {
    clearPvTimers();
    pendingPvRef.current = null;
    setPvPreview(null);
  }, [clearPvTimers]);

  const startPvPreview = useCallback(
    (candidate: PvPreviewCandidate) => {
      clearPvTimers();
      pendingPvRef.current = null;
      setPvPreview({...candidate, pv: [...candidate.pv], visibleCount: 1});

      if (candidate.pv.length <= 1) return;
      pvIntervalRef.current = window.setInterval(() => {
        setPvPreview((current) => {
          if (current == null || current.triggerKey !== candidate.triggerKey) return current;
          const visibleCount = Math.min(current.pv.length, current.visibleCount + 1);
          if (visibleCount >= current.pv.length && pvIntervalRef.current != null) {
            window.clearInterval(pvIntervalRef.current);
            pvIntervalRef.current = null;
          }
          return {...current, visibleCount};
        });
      }, 300);
    },
    [clearPvTimers]
  );

  const schedulePvPreview = useCallback(
    (candidate: PvPreviewCandidate) => {
      if (analysisSettings.pvPreviewDelay <= 0) {
        clearPvTimers();
        pendingPvRef.current = null;
        return;
      }
      if (pvPreview?.triggerKey === candidate.triggerKey) return;
      clearPvTimers();
      const snapshot = {...candidate, pv: [...candidate.pv]};
      pendingPvRef.current = snapshot;
      hoverTimerRef.current = window.setTimeout(() => startPvPreview(snapshot), analysisSettings.pvPreviewDelay * 1000);
    },
    [analysisSettings.pvPreviewDelay, clearPvTimers, pvPreview?.triggerKey, startPvPreview]
  );

  const hoverCandidateAtVertex = useCallback(
    (vertex: Vertex): PvPreviewCandidate | null => hoverPvCandidateMap.get(vertexKey(vertex)) ?? null,
    [hoverPvCandidateMap]
  );
  const altClickCandidateAtVertex = useCallback(
    (vertex: Vertex): PvPreviewCandidate | null => allPvCandidateMap.get(vertexKey(vertex)) ?? null,
    [allPvCandidateMap]
  );
  const handlePrimaryVertexInput = useCallback(
    (event: VertexEvent, vertex: Vertex) => {
      if (event.altKey) {
        const candidate = altClickCandidateAtVertex(vertex);
        if (candidate != null) startPvPreview(candidate);
        event.preventDefault();
        return;
      }

      event.preventDefault();
      onVertexClick(vertexToPoint(vertex[0], vertex[1]), {
        shiftKey: event.shiftKey,
        clickCount: 'detail' in event ? event.detail : 1,
      });
    },
    [altClickCandidateAtVertex, onVertexClick, startPvPreview]
  );
  const handleVertexPointerDown = useCallback(
    (event: VertexEvent, vertex: Vertex) => {
      if ('pointerType' in event && event.pointerType === 'touch') {
        pendingTouchClickRef.current = {vertexKey: vertexKey(vertex), time: performance.now()};
        return;
      }

      pendingTouchClickRef.current = null;
      if (event.button === 2) {
        event.preventDefault();
        onVertexRightClick(vertexToPoint(vertex[0], vertex[1]), {
          shiftKey: event.shiftKey,
          clickCount: 'detail' in event ? event.detail : 1,
        });
        return;
      }

      if (event.button !== 0) return;
      if (!('pointerType' in event) || event.pointerType !== 'mouse') return;
      handlePrimaryVertexInput(event, vertex);
    },
    [handlePrimaryVertexInput, onVertexRightClick]
  );
  const handleVertexClick = useCallback(
    (event: VertexEvent, vertex: Vertex) => {
      const pendingTouchClick = pendingTouchClickRef.current;
      pendingTouchClickRef.current = null;
      const followsTouchPointerDown =
        pendingTouchClick?.vertexKey === vertexKey(vertex) && performance.now() - pendingTouchClick.time < 1500;

      if (isTouchClick(event) || followsTouchPointerDown) {
        handlePrimaryVertexInput(event, vertex);
        return;
      }

      if (event.altKey) {
        event.preventDefault();
        return;
      }

      const clickCount = 'detail' in event ? event.detail : 1;
      if (clickCount <= 1) return;

      event.preventDefault();
      onVertexClick(vertexToPoint(vertex[0], vertex[1]), {
        shiftKey: event.shiftKey,
        clickCount,
      });
    },
    [handlePrimaryVertexInput, onVertexClick]
  );
  const handleVertexMouseEnter = useCallback(
    (_event: VertexEvent, vertex: Vertex) => {
      const candidate = hoverCandidateAtVertex(vertex);
      if (candidate != null) schedulePvPreview(candidate);
    },
    [hoverCandidateAtVertex, schedulePvPreview]
  );
  const handleVertexMouseMove = useCallback(
    (_event: VertexEvent, vertex: Vertex) => {
      const candidate = hoverCandidateAtVertex(vertex);
      if (candidate != null) schedulePvPreview(candidate);
    },
    [hoverCandidateAtVertex, schedulePvPreview]
  );
  const handleVertexMouseLeave = useCallback(
    (_event: VertexEvent, vertex: Vertex) => {
      const key = vertexKey(vertex);
      if (pendingPvRef.current?.triggerKey === key || pvPreview?.triggerKey === key) clearPvPreview();
    },
    [clearPvPreview, pvPreview?.triggerKey]
  );

  useLayoutEffect(() => {
    const element = frameRef.current;
    if (element == null) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect == null) return;
      setAvailableSize({width: rect.width, height: rect.height});
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => clearPvPreview, [clearPvPreview, document, path]);

  return (
    <div className={`board-frame board-frame-${boardBackground}`} ref={frameRef}>
      <div
        className={`board-surface board-surface-${boardBackground}`}
        onContextMenu={(event) => event.preventDefault()}
      >
        <Board
          className={`ulugo-board-${boardBackground}`}
          vertexSize={vertexSize}
          showCoordinates={showCoordinates}
          signMap={displaySignMap}
          extraStoneMap={extraStoneBooleanMap}
          missingStoneMap={missingStoneBooleanMap}
          pastStoneMap={pastStoneBooleanMap}
          futureStoneMap={futureStoneBooleanMap}
          markerMap={displayMarkerMap}
          analysisOverlayMap={displayAnalysisOverlayMap}
          moveHintMap={displayMoveHintMap}
          ownershipMap={displayOwnershipMap}
          hotZoneMap={displayHotZoneMap}
          selectedVertices={selectedVertices}
          onVertexClick={handleVertexClick}
          onVertexMouseEnter={handleVertexMouseEnter}
          onVertexMouseLeave={handleVertexMouseLeave}
          onVertexMouseMove={handleVertexMouseMove}
          onVertexPointerDown={handleVertexPointerDown}
        />
      </div>
    </div>
  );
}

type VertexEvent = MouseEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>;

function isTouchClick(event: VertexEvent): boolean {
  const nativeEvent = event.nativeEvent as globalThis.MouseEvent & {
    pointerType?: string;
    sourceCapabilities?: {firesTouchEvents?: boolean};
  };
  return nativeEvent.pointerType === 'touch' || nativeEvent.sourceCapabilities?.firesTouchEvents === true;
}
