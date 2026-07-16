import type {BoardPosition} from '@ulugo/go-core';
import type {SgfPoint} from '@ulugo/sgf-core';

export type Stone = 'B' | 'W';
export type GroupStatus = 'alive' | 'seki' | 'critical' | 'dead' | 'unknown';
export type ScoreScenario = 'favorBlack' | 'favorWhite';

export interface DeadStoneSets {
  black: Set<SgfPoint>;
  white: Set<SgfPoint>;
  aliveBlack?: Set<SgfPoint>;
  aliveWhite?: Set<SgfPoint>;
}

export interface StoneGroup {
  id: number;
  color: Stone;
  points: SgfPoint[];
  liberties: Set<SgfPoint>;
  adjacentOpponentIds: Set<number>;
  adjacentRegionIds: Set<number>;
  eyeMin: number;
  eyeMax: number;
  status: GroupStatus;
}

export interface EmptyRegion {
  id: number;
  points: SgfPoint[];
  borderGroupIds: Set<number>;
}

export interface ScoringAnalysis {
  position: BoardPosition;
  groups: StoneGroup[];
  emptyRegions: EmptyRegion[];
}

export interface InfluenceValue {
  black: number;
  white: number;
}

export interface ScoringPoints {
  blackPoints: SgfPoint[];
  whitePoints: SgfPoint[];
}

export interface ScoringSummary {
  blackScore: number;
  whiteScore: number;
  result: string;
}
