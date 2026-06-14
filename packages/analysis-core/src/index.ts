export type AnalysisDisplayMode = 'none' | 'score' | 'winrate' | 'absScore';
export type AnalysisStoneOverlay = 'dot' | 'number' | 'none';
export type AnalysisMoveLimit = 1 | 5 | 20 | 'all';
export type BoardBackground = 'auto' | 'golden' | 'natural' | 'flat';

export interface KataGoRootInfo {
  scoreLead?: number;
  scoreMean?: number;
  winrate?: number;
  visits?: number;
}

export interface KataGoMoveInfo {
  move: string;
  scoreLead?: number;
  scoreMean?: number;
  winrate?: number;
  visits?: number;
  pointsLost?: number;
  winrateLost?: number;
  absolutePointsLost?: number;
}

export interface KataGoAnalysisResult {
  id: string;
  error?: string;
  warning?: string;
  rootInfo?: KataGoRootInfo;
  moveInfos?: KataGoMoveInfo[];
  ownership?: number[];
  policy?: number[];
  isDuringSearch?: boolean;
  turnNumber?: number;
}

export interface AnalysisSettings {
  moveDisplay: AnalysisDisplayMode;
  stoneOverlay: AnalysisStoneOverlay;
  maxMoves: AnalysisMoveLimit;
  minVisits: number;
  showNextMove: boolean;
  showTopMoves: boolean;
  showExpectedTerritory: boolean;
  boardBackground: BoardBackground;
  autoAnalyze: boolean;
}

export const defaultAnalysisSettings: AnalysisSettings = {
  moveDisplay: 'score',
  stoneOverlay: 'dot',
  maxMoves: 5,
  minVisits: 50,
  showNextMove: true,
  showTopMoves: true,
  showExpectedTerritory: false,
  boardBackground: 'auto',
  autoAnalyze: true,
};

export interface AnalysisChartPoint {
  moveNumber: number;
  series: 'score' | 'winrate';
  value: number;
  color?: 'B' | 'W';
  hiddenPassReady?: boolean;
}
