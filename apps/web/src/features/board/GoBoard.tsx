import {Board, type Marker, type Vertex} from '@ulugo/go-board';
import {deriveBoardPosition, isLegalMove} from '@ulugo/go-core';
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
  type TouchEvent,
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
  placementPreviewColor: SgfColor | null;
  placementPreviewRequiresLegalMove: boolean;
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

interface PlacementPreview {
  point: string;
  color: SgfColor;
  source: 'mouse' | 'touch';
  opacity: number;
}

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
  placementPreviewColor,
  placementPreviewRequiresLegalMove,
  boardBackground,
  rules,
  onVertexClick,
  onVertexRightClick,
}: GoBoardProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const pvIntervalRef = useRef<number | null>(null);
  const pendingPvRef = useRef<PvPreviewCandidate | null>(null);
  const pendingTouchClickRef = useRef<{vertexKey: string; endedAt: number | null} | null>(null);
  const placementPreviewRef = useRef<PlacementPreview | null>(null);
  const currentNode = useMemo(() => getNodeAtPath(document, path), [document, path]);
  const scoringNode = path.length > 0 && isScoringNode(currentNode);
  const position = useMemo(() => deriveBoardPosition(document, path), [document, path]);
  const valueOffset = useMemo(() => usesAreaValueOffset(rules), [rules]);
  const [pvPreview, setPvPreview] = useState<ActivePvPreview | null>(null);
  const [placementPreview, setPlacementPreviewState] = useState<PlacementPreview | null>(null);
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
  const placementPreviewOpacityMap = useMemo(
    () =>
      Array.from({length: position.size}, (_, y) =>
        Array.from({length: position.size}, (_, x) =>
          placementPreview?.point === vertexToPoint(x, y) ? placementPreview.opacity : 0
        )
      ),
    [placementPreview, position.size]
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
  const displaySignMap = useMemo(() => {
    const result = applyPvSignMap(signMapWithReferenceMoves, pvPreviewMap).map((row) => [...row]);
    if (placementPreview == null) return result;
    const vertex = pointToVertex(placementPreview.point);
    if (vertex != null) result[vertex[1]][vertex[0]] = placementPreview.color === 'B' ? 1 : -1;
    return result;
  }, [placementPreview, pvPreviewMap, signMapWithReferenceMoves]);
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
  const setPlacementPreview = useCallback((preview: PlacementPreview | null) => {
    placementPreviewRef.current = preview;
    setPlacementPreviewState(preview);
  }, []);

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
  const placementCandidateAtVertex = useCallback(
    (vertex: Vertex): {point: string; color: SgfColor} | null => {
      if (placementPreviewColor == null) return null;
      const point = vertexToPoint(vertex[0], vertex[1]);
      if (position.stones.has(point)) return null;
      if (placementPreviewRequiresLegalMove && !isLegalMove(position, placementPreviewColor, point, rules)) return null;
      return {point, color: placementPreviewColor};
    },
    [placementPreviewColor, placementPreviewRequiresLegalMove, position, rules]
  );
  const mousePlacementOpacity = useCallback((event: MouseEvent<HTMLDivElement>): number => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = (Math.min(bounds.width, bounds.height) * (1 - 0.08)) / 2;
    if (radius <= 0) return 0;

    const distance = Math.max(
      Math.abs(event.clientX - (bounds.left + bounds.width / 2)),
      Math.abs(event.clientY - (bounds.top + bounds.height / 2))
    );
    const fadeStart = radius / 3;
    if (distance <= fadeStart) return 0.5;
    return Math.max(0, (0.5 * (radius - distance)) / (radius - fadeStart));
  }, []);
  const showMousePlacementPreview = useCallback(
    (event: MouseEvent<HTMLDivElement>, candidate: {point: string; color: SgfColor}): void => {
      const opacity = mousePlacementOpacity(event);
      const current = placementPreviewRef.current;
      if (current?.source === 'mouse' && current.point === candidate.point && current.color === candidate.color) {
        event.currentTarget
          .querySelector<HTMLElement>('.ulugo-placement-preview-stone')
          ?.style.setProperty('--ulugo-placement-preview-opacity', String(opacity));
        return;
      }

      setPlacementPreview(opacity > 0 ? {...candidate, source: 'mouse', opacity} : null);
    },
    [mousePlacementOpacity, setPlacementPreview]
  );
  const handlePrimaryVertexInput = useCallback(
    (event: MouseEvent<HTMLDivElement>, vertex: Vertex) => {
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
  const handleVertexMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>, vertex: Vertex) => {
      const pendingTouchClick = pendingTouchClickRef.current;
      if (
        pendingTouchClick?.vertexKey === vertexKey(vertex) &&
        (pendingTouchClick.endedAt == null || performance.now() - pendingTouchClick.endedAt < 1500)
      ) {
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
      handlePrimaryVertexInput(event, vertex);
    },
    [handlePrimaryVertexInput, onVertexRightClick]
  );
  const handleVertexClick = useCallback(
    (event: MouseEvent<HTMLDivElement>, vertex: Vertex) => {
      const pendingTouchClick = pendingTouchClickRef.current;
      const followsTouchStart =
        pendingTouchClick?.vertexKey === vertexKey(vertex) &&
        pendingTouchClick.endedAt != null &&
        performance.now() - pendingTouchClick.endedAt < 1500;

      if (followsTouchStart) {
        pendingTouchClickRef.current = null;
        setPlacementPreview(null);
        handlePrimaryVertexInput(event, vertex);
        return;
      }
      if (pendingTouchClick?.endedAt != null && performance.now() - pendingTouchClick.endedAt >= 1500) {
        pendingTouchClickRef.current = null;
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
    (event: MouseEvent<HTMLDivElement>, vertex: Vertex) => {
      const placementCandidate = placementCandidateAtVertex(vertex);
      if (placementCandidate != null) {
        clearPvPreview();
        showMousePlacementPreview(event, placementCandidate);
        return;
      }
      const candidate = hoverCandidateAtVertex(vertex);
      if (candidate != null) schedulePvPreview(candidate);
    },
    [clearPvPreview, hoverCandidateAtVertex, placementCandidateAtVertex, schedulePvPreview, showMousePlacementPreview]
  );
  const handleVertexMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>, vertex: Vertex) => {
      const placementCandidate = placementCandidateAtVertex(vertex);
      if (placementCandidate != null) {
        clearPvPreview();
        showMousePlacementPreview(event, placementCandidate);
        return;
      }
      if (placementPreviewRef.current?.source === 'mouse') setPlacementPreview(null);
      const candidate = hoverCandidateAtVertex(vertex);
      if (candidate != null) schedulePvPreview(candidate);
    },
    [clearPvPreview, hoverCandidateAtVertex, placementCandidateAtVertex, schedulePvPreview, showMousePlacementPreview]
  );
  const handleVertexMouseLeave = useCallback(
    (_event: MouseEvent<HTMLDivElement>, vertex: Vertex) => {
      const key = vertexKey(vertex);
      const current = placementPreviewRef.current;
      if (current?.source === 'mouse' && current.point === vertexToPoint(vertex[0], vertex[1])) {
        setPlacementPreview(null);
      }
      if (pendingPvRef.current?.triggerKey === key || pvPreview?.triggerKey === key) clearPvPreview();
    },
    [clearPvPreview, pvPreview?.triggerKey, setPlacementPreview]
  );
  const handleVertexTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>, vertex: Vertex) => {
      pendingTouchClickRef.current = null;
      setPlacementPreview(null);
      if (event.touches.length !== 1) return;

      pendingTouchClickRef.current = {vertexKey: vertexKey(vertex), endedAt: null};
      const placementCandidate = placementCandidateAtVertex(vertex);
      if (placementCandidate != null) setPlacementPreview({...placementCandidate, source: 'touch', opacity: 0.5});
    },
    [placementCandidateAtVertex]
  );
  const handleVertexTouchEnd = useCallback(
    (_event: TouchEvent<HTMLDivElement>, vertex: Vertex) => {
      if (pendingTouchClickRef.current?.vertexKey === vertexKey(vertex)) {
        pendingTouchClickRef.current.endedAt = performance.now();
      }
      if (placementPreviewRef.current?.source === 'touch') setPlacementPreview(null);
    },
    [setPlacementPreview]
  );
  const handleVertexTouchCancel = useCallback(() => {
    pendingTouchClickRef.current = null;
    if (placementPreviewRef.current?.source === 'touch') setPlacementPreview(null);
  }, [setPlacementPreview]);

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

  useEffect(() => {
    clearPvPreview();
    setPlacementPreview(null);
    pendingTouchClickRef.current = null;
  }, [clearPvPreview, document, path, placementPreviewColor, placementPreviewRequiresLegalMove]);

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
          placementPreviewOpacityMap={placementPreviewOpacityMap}
          markerMap={displayMarkerMap}
          analysisOverlayMap={displayAnalysisOverlayMap}
          moveHintMap={displayMoveHintMap}
          ownershipMap={displayOwnershipMap}
          hotZoneMap={displayHotZoneMap}
          selectedVertices={selectedVertices}
          onVertexClick={handleVertexClick}
          onVertexMouseDown={handleVertexMouseDown}
          onVertexMouseEnter={handleVertexMouseEnter}
          onVertexMouseLeave={handleVertexMouseLeave}
          onVertexMouseMove={handleVertexMouseMove}
          onVertexTouchStart={handleVertexTouchStart}
          onVertexTouchEnd={handleVertexTouchEnd}
          onVertexTouchCancel={handleVertexTouchCancel}
        />
      </div>
    </div>
  );
}
