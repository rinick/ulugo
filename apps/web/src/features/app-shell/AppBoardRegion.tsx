import {
  CloudDownloadOutlined,
  LeftSquareOutlined,
  RightSquareOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
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
  stoneScoreDeltas: Map<string, number>;
  analysisSettings: AnalysisSettings;
  boardBackground: Exclude<AnalysisSettings['boardBackground'], 'auto'>;
  katagoEnabled: boolean;
  analysisMode: boolean;
  analysisDeepMode: boolean;
  analysisIdle: boolean;
  fastAnalysisPendingCount: number;
  leftPanelOpen: boolean;
  onBoardClick: (point: string, options: BoardVertexClickOptions) => void;
  onBoardRightClick: (point: string) => void;
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
  stoneScoreDeltas,
  analysisSettings,
  boardBackground,
  katagoEnabled,
  analysisMode,
  analysisDeepMode,
  analysisIdle,
  fastAnalysisPendingCount,
  leftPanelOpen,
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
        stoneScoreDeltas={stoneScoreDeltas}
        analysisSettings={analysisSettings}
        boardBackground={boardBackground}
        onVertexClick={onBoardClick}
        onVertexRightClick={onBoardRightClick}
      />
      {katagoEnabled ? (
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
          title={t('analysis')}
          onClick={onAnalysisClick}
        >
          {analysisMode ? <span>{fastAnalysisPendingCount}</span> : ''}
        </Button>
      ) : (
        <Button
          className="analysis-button desktop-download-button"
          icon={<CloudDownloadOutlined />}
          href="https://github.com/rinick/ulugo/releases"
          target="_blank"
          rel="noreferrer"
        >
          <span className="desktop-download-label">{t('downloadDesktopApp')}</span>
        </Button>
      )}
      <Button
        className="left-panel-toggle"
        icon={leftPanelOpen ? <LeftSquareOutlined /> : <RightSquareOutlined />}
        title={t(leftPanelOpen ? 'closeLeftPanel' : 'openLeftPanel')}
        onClick={onToggleLeftPanel}
      />
    </main>
  );
}
