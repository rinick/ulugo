import {LeftSquareOutlined, RightSquareOutlined, ThunderboltOutlined} from '@ant-design/icons';
import {Button} from 'antd';
import type {AnalysisSettings, KataGoAnalysisResult} from '@ulugo/analysis-core';
import type {SgfDocument} from '@ulugo/sgf-core';
import type {DragEvent, MouseEvent} from 'react';
import {useTranslation} from 'react-i18next';
import {GoBoard, type BoardVertexClickOptions, type MoveNumberLimit} from '../board/GoBoard';

interface AppBoardRegionProps {
  document: SgfDocument;
  path: number[];
  showCoordinates: boolean;
  showMarkup: boolean;
  moveNumberLimit: MoveNumberLimit;
  analysis: KataGoAnalysisResult | null;
  passAnalysis: KataGoAnalysisResult | null;
  stoneScoreDeltas: Map<string, number>;
  analysisSettings: AnalysisSettings;
  boardBackground: Exclude<AnalysisSettings['boardBackground'], 'auto'>;
  rules: string | undefined;
  katagoEnabled: boolean;
  analysisMode: boolean;
  analysisDeepMode: boolean;
  analysisIdle: boolean;
  fastAnalysisPendingCount: number;
  leftPanelOpen: boolean;
  minimalMode: boolean;
  onBoardClick: (point: string, options: BoardVertexClickOptions) => void;
  onBoardRightClick: (point: string, options: BoardVertexClickOptions) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onPreviousMove: () => void;
  onNextMove: () => void;
  onAnalysisClick: (event: MouseEvent<HTMLElement>) => void;
  onToggleLeftPanel: () => void;
}

export function AppBoardRegion({
  document,
  path,
  showCoordinates,
  showMarkup,
  moveNumberLimit,
  analysis,
  passAnalysis,
  stoneScoreDeltas,
  analysisSettings,
  boardBackground,
  rules,
  katagoEnabled,
  analysisMode,
  analysisDeepMode,
  analysisIdle,
  fastAnalysisPendingCount,
  leftPanelOpen,
  minimalMode,
  onBoardClick,
  onBoardRightClick,
  onDragOver,
  onDrop,
  onPreviousMove,
  onNextMove,
  onAnalysisClick,
  onToggleLeftPanel,
}: AppBoardRegionProps) {
  const {t} = useTranslation();
  const analysisButtonTitle = analysisDeepMode
    ? t('analysisButtonDeepTitle')
    : analysisIdle
      ? t('analysisButtonIdleTitle')
      : t('analysis');

  return (
    <main
      className="board-region"
      onDragOver={onDragOver}
      onDrop={onDrop}
      onWheel={(event) => {
        if (event.deltaY > 0) onNextMove();
        if (event.deltaY < 0) onPreviousMove();
      }}
    >
      <GoBoard
        document={document}
        path={path}
        showCoordinates={showCoordinates}
        showMarkup={showMarkup}
        moveNumberLimit={moveNumberLimit}
        analysis={analysis}
        passAnalysis={passAnalysis}
        stoneScoreDeltas={stoneScoreDeltas}
        analysisSettings={analysisSettings}
        boardBackground={boardBackground}
        rules={rules}
        onVertexClick={onBoardClick}
        onVertexRightClick={onBoardRightClick}
      />
      {!minimalMode && katagoEnabled ? (
        <Button
          className={[
            'analysis-button',
            analysisMode ? 'analysis-button-active' : '',
            analysisDeepMode ? 'analysis-button-deep' : analysisIdle ? 'analysis-button-idle' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          icon={<ThunderboltOutlined />}
          type={analysisMode ? 'primary' : 'default'}
          title={analysisButtonTitle}
          onClick={onAnalysisClick}
        >
          {analysisMode ? <span>{fastAnalysisPendingCount}</span> : ''}
        </Button>
      ) : null}
      {minimalMode ? null : (
        <Button
          className="left-panel-toggle"
          size="medium"
          icon={leftPanelOpen ? <LeftSquareOutlined /> : <RightSquareOutlined />}
          title={t(leftPanelOpen ? 'closeLeftPanel' : 'openLeftPanel')}
          onClick={onToggleLeftPanel}
        />
      )}
    </main>
  );
}
