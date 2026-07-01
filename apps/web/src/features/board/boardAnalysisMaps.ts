import {type AnalysisOverlay, type HotZone, type Marker, type MoveHint, type Vertex} from '@ulugo/go-board';
import {type BoardPoint} from '@ulugo/go-core';
import {getNodeAtPath, normalizeMovePoint, pointToVertex, type SgfDocument, vertexToPoint} from '@ulugo/sgf-core';
import type {AnalysisDisplayMode, AnalysisSettings, KataGoAnalysisResult, KataGoMoveInfo} from '@ulugo/analysis-core';

export type MoveNumberLimit = 0 | 1 | 5 | 20 | 'all';
export type Sign = 0 | -1 | 1;
export type PvPreviewCandidate = {triggerKey: string; pv: string[]; nextColor: 'B' | 'W'};
export type ActivePvPreview = PvPreviewCandidate & {visibleCount: number};
type PvPreviewStone = {sign: Exclude<Sign, 0>; label: string};

const evalThresholds = [12, 6, 3, 1.5, 0.5, 0];

export function buildAnalysisOverlayMap(
  size: number,
  childMoves: Set<string>,
  analysis: KataGoAnalysisResult | null,
  settings: AnalysisSettings,
  nextColor: 'B' | 'W',
  valueOffset: boolean,
  points: BoardPoint[],
  currentMoveNumber: number,
  stoneScoreDeltas: Map<string, number>
): Array<Array<AnalysisOverlay | null>> | undefined {
  const result = emptyMap<AnalysisOverlay | null>(size, null);
  const stoneOverlay = settings.stoneOverlay;
  let hasAnalysisOverlay = false;

  if (settings.showTopMoves && analysis?.moveInfos != null) {
    const moves: Array<{move: KataGoMoveInfo; moveKey: string; vertex: [number, number]}> = [];
    let passScore: number | null = null;
    for (const move of analysis.moveInfos) {
      const moveKey = move.move.toLowerCase();
      if (moveKey === 'pass') passScore = moveScoreLead(move);
      const vertex = gtpMoveToVertex(move.move, size, moveKey);
      if (vertex != null) moves.push({move, moveKey, vertex});
    }
    const limit = analysisMoveLimit(settings.maxMoves);
    let limitedMoveCount = 0;
    const seenMoves = new Set<string>();

    for (const [index, {move, moveKey, vertex}] of moves.entries()) {
      if (seenMoves.has(moveKey)) continue;
      seenMoves.add(moveKey);

      const isChildMove = childMoves.has(moveKey);
      const visits = move.visits ?? 0;
      const hasEnoughVisitsForHint = visits >= 1 + (settings.minVisits >> 2);
      const hasEnoughVisits = visits >= settings.minVisits;
      const withinLimit = limit == null || limitedMoveCount < limit;
      if (!withinLimit && !isChildMove && !hasEnoughVisitsForHint) continue;
      if (withinLimit) limitedMoveCount += 1;

      const [x, y] = vertex;
      const showText = index === 0 || isChildMove || hasEnoughVisits;
      const text = showText
        ? analysisMoveText(move, settings.moveDisplay, analysis, nextColor, passScore, valueOffset)
        : '';
      result[y][x] = {
        ...(result[y][x] ?? {}),
        strength: analysisStrength(move, analysis, nextColor),
        halo: true,
        text: text === '' ? undefined : text,
      };
      hasAnalysisOverlay = true;
    }
  }

  if (stoneOverlay === 'dot') {
    for (const point of points) {
      const scoreDelta = stoneScoreDeltas.get(point.point);
      if (
        point.stone == null ||
        point.moveNumber == null ||
        scoreDelta == null ||
        !shouldShowMoveAnalysis(point.moveNumber, currentMoveNumber, settings.maxMoves)
      ) {
        continue;
      }

      result[point.y][point.x] = {
        ...(result[point.y][point.x] ?? {}),
        strength: evaluationClass(-scoreDelta) + 1,
        halo: false,
        dot: true,
        dotSize: analysisDotSize(point.moveNumber, currentMoveNumber),
      };
      hasAnalysisOverlay = true;
    }
  }

  return hasAnalysisOverlay ? result : undefined;
}

export function buildMoveHintMap(
  size: number,
  document: SgfDocument,
  path: number[],
  analysis: KataGoAnalysisResult | null,
  settings: AnalysisSettings
): Array<Array<MoveHint | null>> | undefined {
  if (!settings.showNextMove && !settings.showTopMoves) return undefined;

  const result = emptyMap<MoveHint | null>(size, null);
  let hasHints = false;
  const node = getNodeAtPath(document, path);

  if (settings.showNextMove) {
    node.children.forEach((child, index) => {
      const color = child.data.B != null ? 1 : child.data.W != null ? -1 : 0;
      const point = normalizeMovePoint(child.data.B?.[0] ?? child.data.W?.[0] ?? '', size);
      if (point == null || point === '') return;
      const vertex = pointToVertex(point);
      if (vertex == null) return;

      const [x, y] = vertex;
      result[y][x] = {...(result[y][x] ?? {}), branch: index === 0 ? 'main' : 'variation', sign: color};
      hasHints = true;
    });
  }

  const bestVertex = analysis?.moveInfos?.[0] == null ? null : gtpMoveToVertex(analysis.moveInfos[0].move, size);
  if (settings.showTopMoves && bestVertex != null) {
    const [x, y] = bestVertex;
    result[y][x] = {...(result[y][x] ?? {}), best: true};
    hasHints = true;
  }

  return hasHints ? result : undefined;
}

export function buildTopMovePvCandidateMap(
  size: number,
  childMoves: Set<string>,
  analysis: KataGoAnalysisResult | null,
  settings: AnalysisSettings,
  nextColor: 'B' | 'W'
): Map<string, PvPreviewCandidate> {
  const result = new Map<string, PvPreviewCandidate>();
  if (!settings.showTopMoves || analysis?.moveInfos == null) return result;

  const limit = analysisMoveLimit(settings.maxMoves);
  let limitedMoveCount = 0;
  const seenMoves = new Set<string>();

  for (const move of analysis.moveInfos) {
    const moveKey = move.move.toLowerCase();
    if (seenMoves.has(moveKey)) continue;
    seenMoves.add(moveKey);

    const vertex = gtpMoveToVertex(move.move, size, moveKey);
    if (vertex == null) continue;

    const isChildMove = childMoves.has(moveKey);
    const visits = move.visits ?? 0;
    const hasEnoughVisitsForHint = visits >= 1 + (settings.minVisits >> 2);
    const withinLimit = limit == null || limitedMoveCount < limit;
    if (!withinLimit && !isChildMove && !hasEnoughVisitsForHint) continue;
    if (withinLimit) limitedMoveCount += 1;
    if (move.pv == null || move.pv.length === 0) continue;

    result.set(vertexKey(vertex), {triggerKey: vertexKey(vertex), pv: move.pv, nextColor});
  }

  return result;
}

export function buildAllPvCandidateMap(
  size: number,
  analysis: KataGoAnalysisResult | null,
  nextColor: 'B' | 'W'
): Map<string, PvPreviewCandidate> {
  const result = new Map<string, PvPreviewCandidate>();
  if (analysis?.moveInfos == null) return result;

  const seenMoves = new Set<string>();
  for (const move of analysis.moveInfos) {
    const moveKey = move.move.toLowerCase();
    if (seenMoves.has(moveKey)) continue;
    seenMoves.add(moveKey);
    if (move.pv == null || move.pv.length === 0) continue;

    const vertex = gtpMoveToVertex(move.move, size, moveKey);
    if (vertex == null) continue;
    result.set(vertexKey(vertex), {triggerKey: vertexKey(vertex), pv: move.pv, nextColor});
  }

  return result;
}

export function buildPvPreviewMap(
  size: number,
  preview: ActivePvPreview | null
): Array<Array<PvPreviewStone | null>> | null {
  if (preview == null) return null;

  const result = emptyMap<PvPreviewStone | null>(size, null);
  for (let index = 0; index < Math.min(preview.visibleCount, preview.pv.length); index++) {
    const vertex = gtpMoveToVertex(preview.pv[index], size);
    if (vertex == null) continue;
    const [x, y] = vertex;
    result[y][x] = {
      sign: colorToSign(index % 2 === 0 ? preview.nextColor : oppositeSgfColor(preview.nextColor)),
      label: String(index + 1),
    };
  }

  return result;
}

export function applyPvSignMap(signMap: Sign[][], pvMap: Array<Array<PvPreviewStone | null>> | null): Sign[][] {
  if (pvMap == null) return signMap;
  return signMap.map((row, y) => row.map((sign, x) => pvMap[y][x]?.sign ?? sign));
}

export function applyPvMarkerMap(
  markerMap: Marker[][],
  pvMap: Array<Array<PvPreviewStone | null>> | null
): Marker[][] {
  if (pvMap == null) return markerMap;
  return markerMap.map((row, y) =>
    row.map((marker, x) => (pvMap[y][x] == null ? marker : {type: 'label', label: pvMap[y][x]?.label}))
  );
}

export function applyPvNullableMap<T>(
  map: T[][] | undefined,
  pvMap: Array<Array<PvPreviewStone | null>> | null,
  size: number,
  value: T
): T[][] | undefined {
  if (pvMap == null) return map;
  const result = map == null ? emptyMap(size, value) : map.map((row) => [...row]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (pvMap[y][x] != null) result[y][x] = value;
    }
  }
  return result;
}

export function vertexKey(vertex: Vertex): string {
  return `${vertex[0]},${vertex[1]}`;
}

export function buildOwnershipMap(
  size: number,
  analysis: KataGoAnalysisResult | null,
  settings: AnalysisSettings,
  stones: Map<string, 'B' | 'W'>,
  points: BoardPoint[],
  currentMoveNumber: number,
  moveNumberLimit: MoveNumberLimit,
  analysisOverlayMap: Array<Array<AnalysisOverlay | null>> | undefined
): number[][] | undefined {
  if (!settings.showExpectedTerritory || analysis?.ownership == null) return undefined;
  const cappedTerritoryPoints = new Set(
    points
      .filter((point) =>
        shouldShowMoveNumber(point.moveNumber, point.stone != null, currentMoveNumber, moveNumberLimit)
      )
      .map((point) => point.point)
  );

  return Array.from({length: size}, (_, y) =>
    Array.from({length: size}, (_, x) => {
      const point = vertexToPoint(x, y);
      const shouldCapTerritoryOpacity = cappedTerritoryPoints.has(point) || analysisOverlayMap?.[y]?.[x]?.text != null;

      const value = analysis.ownership?.[y * size + x] ?? 0;
      if (Math.abs(value) < 0.15) return 0;

      const territory = Math.max(-1, Math.min(1, value));
      const stone = stones.get(point);
      if (stone === 'B' && territory > 0) return 0;
      if (stone === 'W' && territory < 0) return 0;
      return shouldCapTerritoryOpacity ? Math.sign(territory) * Math.min(Math.abs(territory), 0.3) : territory;
    })
  );
}

export function buildHotZoneMap(
  size: number,
  analysis: KataGoAnalysisResult | null,
  passAnalysis: KataGoAnalysisResult | null,
  settings: AnalysisSettings,
  nextColor: 'B' | 'W'
): Array<Array<HotZone | null>> | undefined {
  if (!settings.showHotZone || analysis?.ownership == null || passAnalysis?.ownership == null) return undefined;

  let hasHotZone = false;
  const colorSign = nextColor === 'B' ? 1 : -1;
  const result = Array.from({length: size}, (_, y) =>
    Array.from({length: size}, (_, x): HotZone | null => {
      const index = y * size + x;
      const value = ((passAnalysis.ownership?.[index] ?? 0) - (analysis.ownership?.[index] ?? 0)) * colorSign;
      if (Math.abs(value) < 0.2) return null;

      const clamped = Math.max(-1, Math.min(1, value));
      hasHotZone = true;
      return {
        type: clamped < 0 ? 'loss' : 'gain',
        opacity: Math.abs(clamped) / 1.2,
      };
    })
  );

  return hasHotZone ? result : undefined;
}

export function usesAreaValueOffset(rules: string | undefined): boolean {
  const key = rules?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
  return key === 'chinese' || key === 'aga' || key === 'newzealand' || key === 'tromptaylor' || key === 'stonescoring';
}

export function childMoveSet(document: SgfDocument, path: number[], size: number): Set<string> {
  const node = getNodeAtPath(document, path);
  return new Set(
    node.children.flatMap((child) => {
      const point = normalizeMovePoint(child.data.B?.[0] ?? child.data.W?.[0] ?? '', size);
      if (point == null || point === '') return [];
      const move = pointToGtp(point, size);
      return move == null ? [] : [move.toLowerCase()];
    })
  );
}

export function shouldShowMoveNumber(
  moveNumber: number | null,
  hasStone: boolean,
  currentMoveNumber: number,
  moveNumberLimit: MoveNumberLimit
): boolean {
  if (!hasStone || moveNumber == null || moveNumberLimit === 0) return false;
  if (moveNumberLimit === 'all') return true;
  return moveNumber > currentMoveNumber - moveNumberLimit;
}

function colorToSign(color: 'B' | 'W'): Exclude<Sign, 0> {
  return color === 'B' ? 1 : -1;
}

function oppositeSgfColor(color: 'B' | 'W'): 'B' | 'W' {
  return color === 'B' ? 'W' : 'B';
}

function analysisMoveText(
  move: KataGoMoveInfo,
  mode: AnalysisSettings['moveDisplay'],
  analysis: KataGoAnalysisResult,
  nextColor: 'B' | 'W',
  passScore: number | null,
  valueOffset: boolean
): string {
  return mode
    .map((item) => analysisMoveTextLine(move, item, analysis, nextColor, passScore, valueOffset))
    .filter(Boolean)
    .join('\n');
}

function analysisMoveTextLine(
  move: KataGoMoveInfo,
  mode: AnalysisDisplayMode,
  analysis: KataGoAnalysisResult,
  nextColor: 'B' | 'W',
  passScore: number | null,
  valueOffset: boolean
): string {
  if (mode === 'winRateChange') {
    const winrateLost = moveWinrateLost(move, analysis, nextColor);
    return winrateLost == null ? '' : formatPercentDelta(-winrateLost);
  }

  if (mode === 'score') {
    const score = moveScoreLead(move);
    return score == null ? '' : formatScore(score * (nextColor === 'B' ? 1 : -1));
  }

  if (mode === 'visits') return move.visits == null ? '' : formatVisits(move.visits);

  const scoreDelta = moveScoreDelta(move, analysis, nextColor, mode, passScore);
  if (scoreDelta != null) {
    return mode === 'value' ? formatValue(displayValue(scoreDelta, valueOffset)) : formatScore(scoreDelta);
  }

  if (move.pointsLost != null) {
    const score = -move.pointsLost;
    return mode === 'value' ? formatValue(displayValue(score, valueOffset)) : formatScore(score);
  }

  return '';
}

function movePointsLost(move: KataGoMoveInfo, analysis: KataGoAnalysisResult, nextColor: 'B' | 'W'): number | null {
  if (move.pointsLost != null) return move.pointsLost;
  const score = moveScoreLead(move);
  if (score == null) return null;

  const scoreDelta = (score - (rootScoreLead(analysis) ?? 0)) * (nextColor === 'B' ? 1 : -1);
  return scoreDelta == null ? null : -scoreDelta;
}

function moveScoreDelta(
  move: KataGoMoveInfo,
  analysis: KataGoAnalysisResult,
  nextColor: 'B' | 'W',
  mode: AnalysisDisplayMode,
  passScore: number | null
): number | null {
  const score = moveScoreLead(move);
  if (score == null) return null;

  if (mode === 'value') {
    if (passScore == null) return null;
    return (score - passScore) * (nextColor === 'B' ? 1 : -1);
  }

  return (score - (rootScoreLead(analysis) ?? 0)) * (nextColor === 'B' ? 1 : -1);
}

function moveWinrateLost(move: KataGoMoveInfo, analysis: KataGoAnalysisResult, nextColor: 'B' | 'W'): number | null {
  if (move.winrateLost != null) return normalizeWinrateDelta(move.winrateLost);
  if (analysis.rootInfo?.winrate == null || move.winrate == null) return null;

  return (nextColor === 'B' ? 1 : -1) * (normalizeWinrate(analysis.rootInfo.winrate) - normalizeWinrate(move.winrate));
}

function evaluationClass(pointsLost: number): number {
  let index = 0;
  while (index < evalThresholds.length - 1 && pointsLost < evalThresholds[index]) index += 1;
  return index;
}

function analysisStrength(move: KataGoMoveInfo, analysis: KataGoAnalysisResult, nextColor: 'B' | 'W'): number {
  const pointsLost = movePointsLost(move, analysis, nextColor);
  if (pointsLost != null) return evaluationClass(pointsLost) + 1;

  return 0;
}

function rootScoreLead(analysis: KataGoAnalysisResult): number | null {
  return analysis.rootInfo?.scoreLead ?? analysis.rootInfo?.scoreMean ?? null;
}

function moveScoreLead(move: KataGoMoveInfo): number | null {
  return move.scoreLead ?? move.scoreMean ?? null;
}

function displayValue(value: number, valueOffset: boolean): number {
  return valueOffset ? value - 1 : value;
}

function normalizeWinrate(value: number): number {
  return value > 1 ? value / 100 : value;
}

function normalizeWinrateDelta(value: number): number {
  return Math.abs(value) > 1 ? value / 100 : value;
}

function formatPercentDelta(value: number): string {
  const percent = value * 100;
  return `${percent >= 0 ? '+' : ''}${formatPrecision(percent)}%`;
}

function formatScore(value: number): string {
  return `${value > 0 ? '+' : ''}${formatPrecision(value)}`;
}

function formatValue(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value;
  return normalized.toFixed(1);
}

function formatVisits(value: number): string {
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) return `${formatPrecision(value / 1000)}k`;
  return `${formatPrecision(value / 1_000_000)}m`;
}

function formatPrecision(value: number): string {
  if (Math.abs(value) < 10) {
    const rounded = Math.round(value * 10) / 10;
    const normalized = Object.is(rounded, -0) ? 0 : rounded;
    return normalized.toFixed(1);
  }

  const rounded = Math.round(value);
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return String(normalized);
}

function gtpMoveToVertex(move: string, size: number, moveKey = move.toLowerCase()): [number, number] | null {
  if (moveKey === 'pass') return null;
  const match = /^([A-Za-z])(\d+)$/.exec(move);
  if (match == null) return null;

  const x = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'.indexOf(match[1].toUpperCase());
  const y = size - Number(match[2]);
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return [x, y];
}

function pointToGtp(point: string, size: number): string | null {
  const normalizedPoint = normalizeMovePoint(point, size);
  if (normalizedPoint === '') return null;
  const vertex = pointToVertex(normalizedPoint);
  if (vertex == null) return null;
  const [x, y] = vertex;
  const letter = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'[x];
  return letter == null ? null : `${letter}${size - y}`;
}

function emptyMap<T>(size: number, value: T): T[][] {
  return Array.from({length: size}, () => Array.from({length: size}, () => value));
}

function analysisMoveLimit(limit: AnalysisSettings['maxMoves']): number | undefined {
  return limit === 'all' ? undefined : limit;
}

function shouldShowMoveAnalysis(
  moveNumber: number,
  currentMoveNumber: number,
  moveLimit: AnalysisSettings['maxMoves']
): boolean {
  if (moveLimit === 'all') return true;
  return moveNumber > currentMoveNumber - moveLimit;
}

function analysisDotSize(moveNumber: number, currentMoveNumber: number): number {
  const movesAgo = currentMoveNumber - moveNumber;
  if (movesAgo < 2) return 0.5;
  if (movesAgo === 2) return 0.45;
  if (movesAgo === 3) return 0.4;
  if (movesAgo === 4) return 0.35;
  return 0.3;
}
