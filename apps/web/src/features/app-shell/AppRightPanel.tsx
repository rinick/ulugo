import type {AnalysisChartPoint, AnalysisSettings} from '@ulugo/analysis-core';
import type {SgfDocument} from '@ulugo/sgf-core';
import type {ReactNode} from 'react';
import {CommentsPanel, type AnalysisChartSummary} from '../comments/CommentsPanel';
import type {ShortcutActionId} from '../shortcuts/keyboardShortcuts';
import {SgfTreePanel} from '../sgf-tree/SgfTreePanel';

interface AppRightPanelProps {
  document: SgfDocument;
  path: number[];
  blackPlayerName: string;
  whitePlayerName: string;
  capturedBlackStones: number;
  capturedWhiteStones: number;
  comment: string;
  analysisSettings: AnalysisSettings;
  showAnalysisControls: boolean;
  hideCommentsPanel: boolean;
  commentReadOnly?: boolean;
  forceComments?: boolean;
  commentRows?: number;
  basicTools?: ReactNode;
  chartData: AnalysisChartPoint[];
  selectedMoveNumber: number | null;
  chartSummary: AnalysisChartSummary | null;
  shortcutLabels: Partial<Record<ShortcutActionId, string>>;
  onCommentChange: (value: string) => void;
  onAnalysisSettingsChange: (values: Partial<AnalysisSettings>) => void;
  onPreviousMove: () => void;
  onNextMove: () => void;
  onSelectChartMove: (moveNumber: number) => void;
  onSelectPath: (path: number[]) => void;
  onMoveToMain: (path?: number[]) => void;
  onMoveLeft: (path?: number[]) => void;
  onMoveRight: (path?: number[]) => void;
  onPrune: (path?: number[]) => void;
  onDelete: (path?: number[]) => void;
  onEstimateScore: (path: number[]) => void;
  estimateScoreEnabled: boolean;
}

export function AppRightPanel({
  document,
  path,
  blackPlayerName,
  whitePlayerName,
  capturedBlackStones,
  capturedWhiteStones,
  comment,
  analysisSettings,
  showAnalysisControls,
  hideCommentsPanel,
  commentReadOnly = false,
  forceComments = false,
  commentRows,
  basicTools,
  chartData,
  selectedMoveNumber,
  chartSummary,
  shortcutLabels,
  onCommentChange,
  onAnalysisSettingsChange,
  onPreviousMove,
  onNextMove,
  onSelectChartMove,
  onSelectPath,
  onMoveToMain,
  onMoveLeft,
  onMoveRight,
  onPrune,
  onDelete,
  onEstimateScore,
  estimateScoreEnabled,
}: AppRightPanelProps) {
  return (
    <aside className="right-region">
      <section className="capture-summary">
        <span className="capture-player">
          <span className="capture-name">{blackPlayerName}</span>
          <span className="capture-loss">−</span>
          <span className="capture-count capture-count-black">{capturedBlackStones}</span>
        </span>
        <span className="capture-player">
          <span className="capture-name">{whitePlayerName}</span>
          <span className="capture-loss">−</span>
          <span className="capture-count capture-count-white">{capturedWhiteStones}</span>
        </span>
      </section>
      {basicTools}
      {hideCommentsPanel ? null : (
        <CommentsPanel
          value={comment}
          onChange={onCommentChange}
          showAnalysisControls={showAnalysisControls && !forceComments}
          chartData={chartData}
          commentReadOnly={commentReadOnly}
          commentRows={commentRows}
          moveDisplay={analysisSettings.moveDisplay}
          showScore={forceComments ? false : analysisSettings.showScore}
          showPointLoss={forceComments ? false : analysisSettings.showPointLoss}
          showWinrate={forceComments ? false : analysisSettings.showWinrate}
          showComments={forceComments ? true : analysisSettings.showComments}
          selectedMoveNumber={selectedMoveNumber}
          chartSummary={chartSummary}
          onDisplayChange={onAnalysisSettingsChange}
          onPreviousMove={onPreviousMove}
          onNextMove={onNextMove}
          onSelectChartMove={onSelectChartMove}
        />
      )}
      <SgfTreePanel
        document={document}
        selectedPath={path}
        onSelectPath={onSelectPath}
        onMoveToMain={onMoveToMain}
        onMoveLeft={onMoveLeft}
        onMoveRight={onMoveRight}
        onPrune={onPrune}
        onDelete={onDelete}
        onEstimateScore={onEstimateScore}
        estimateScoreEnabled={estimateScoreEnabled}
        onPreviousMove={onPreviousMove}
        onNextMove={onNextMove}
        shortcutLabels={shortcutLabels}
      />
    </aside>
  );
}
