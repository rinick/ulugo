export type AnalysisDisplayMode = 'scoreChange' | 'winRateChange' | 'score' | 'visits' | 'value';
export type AnalysisMoveDisplay = [AnalysisDisplayMode] | [AnalysisDisplayMode, AnalysisDisplayMode];
export type AnalysisStoneOverlay = 'dot' | 'number' | 'none';
export type AnalysisMoveLimit = 1 | 5 | 20 | 'all';
export type BoardBackground = 'auto' | 'golden' | 'natural' | 'flat';
export type AnalysisMode = 'review' | 'edit' | 'minimal';

export interface KataGoRootInfo {
  scoreLead?: number;
  scoreMean?: number;
  winrate?: number;
  visits?: number;
}

export interface KataGoMoveInfo {
  move: string;
  pv?: string[];
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
  mode: AnalysisMode;
  moveDisplay: AnalysisMoveDisplay;
  stoneOverlay: AnalysisStoneOverlay;
  maxMoves: AnalysisMoveLimit;
  minVisits: number;
  showMarkup: boolean;
  showNextMove: boolean;
  showTopMoves: boolean;
  showExpectedTerritory: boolean;
  showHotZone: boolean;
  showScore: boolean;
  showPointLoss: boolean;
  showWinrate: boolean;
  showComments: boolean;
  boardBackground: BoardBackground;
  autoAnalyze: boolean;
  autoIncrementMarkupText: boolean;
  pvPreviewDelay: number;
  modeSettings: Record<AnalysisMode, AnalysisModeSettings>;
}

export interface AnalysisModeSettings {
  stoneOverlay: AnalysisStoneOverlay;
  showMarkup: boolean;
  showNextMove: boolean;
  showTopMoves: boolean;
  showExpectedTerritory: boolean;
  showHotZone: boolean;
  showScore: boolean;
  showPointLoss: boolean;
  showWinrate: boolean;
  showComments: boolean;
}

export const defaultReviewModeSettings: AnalysisModeSettings = {
  stoneOverlay: 'dot',
  showMarkup: true,
  showNextMove: true,
  showTopMoves: true,
  showExpectedTerritory: true,
  showHotZone: false,
  showScore: true,
  showPointLoss: false,
  showWinrate: true,
  showComments: false,
};

export const defaultEditModeSettings: AnalysisModeSettings = {
  stoneOverlay: 'none',
  showMarkup: true,
  showNextMove: false,
  showTopMoves: false,
  showExpectedTerritory: false,
  showHotZone: false,
  showScore: false,
  showPointLoss: false,
  showWinrate: false,
  showComments: true,
};

export const defaultMinimalModeSettings: AnalysisModeSettings = {
  stoneOverlay: 'none',
  showMarkup: false,
  showNextMove: false,
  showTopMoves: false,
  showExpectedTerritory: false,
  showHotZone: false,
  showScore: false,
  showPointLoss: false,
  showWinrate: false,
  showComments: false,
};

export const defaultAnalysisSettings: AnalysisSettings = {
  mode: 'edit',
  moveDisplay: ['scoreChange'],
  stoneOverlay: defaultEditModeSettings.stoneOverlay,
  maxMoves: 5,
  minVisits: 50,
  showMarkup: defaultEditModeSettings.showMarkup,
  showNextMove: defaultEditModeSettings.showNextMove,
  showTopMoves: defaultEditModeSettings.showTopMoves,
  showExpectedTerritory: defaultEditModeSettings.showExpectedTerritory,
  showHotZone: defaultEditModeSettings.showHotZone,
  showScore: defaultEditModeSettings.showScore,
  showPointLoss: defaultEditModeSettings.showPointLoss,
  showWinrate: defaultEditModeSettings.showWinrate,
  showComments: defaultEditModeSettings.showComments,
  boardBackground: 'auto',
  autoAnalyze: true,
  autoIncrementMarkupText: true,
  pvPreviewDelay: 0.5,
  modeSettings: {
    review: defaultReviewModeSettings,
    edit: defaultEditModeSettings,
    minimal: defaultMinimalModeSettings,
  },
};

export interface AnalysisChartPoint {
  moveNumber: number;
  series: 'score' | 'winrate';
  value: number;
  color?: 'B' | 'W';
  hiddenPassReady?: boolean;
}
