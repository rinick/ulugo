import {Button, Empty, Input, Space} from 'antd';
import type {TextAreaRef} from 'antd/es/input/TextArea';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {MouseEvent, WheelEvent} from 'react';
import {useTranslation} from 'react-i18next';
import type {AnalysisChartPoint, AnalysisSettings} from '@ulugo/analysis-core';

interface CommentsPanelProps {
  value: string;
  onChange: (value: string) => void;
  showAnalysisControls?: boolean;
  chartData?: AnalysisChartPoint[];
  chartMaxMoveNumber: number;
  commentReadOnly?: boolean;
  commentRows?: number;
  moveDisplay?: AnalysisSettings['moveDisplay'];
  showScore: boolean;
  showPointLoss: boolean;
  showWinrate: boolean;
  showIntensity: boolean;
  intensityDisplayLimit: number;
  showComments: boolean;
  selectedMoveNumber?: number | null;
  chartSummary?: AnalysisChartSummary | null;
  onDisplayChange: (values: Partial<AnalysisSettings>) => void;
  onPreviousMove?: () => void;
  onNextMove?: () => void;
  onSelectChartMove?: (moveNumber: number) => void;
}

export interface AnalysisChartSummary {
  scoreLead: number | null;
  winrate: number | null;
  color?: 'B' | 'W';
  pointLoss?: number | null;
  winrateLoss?: number | null;
}

interface PlotPoint {
  x: number;
  y: number;
  value: number;
  moveNumber: number;
}

interface PointLoss {
  moveNumber: number;
  value: number;
  color: 'B' | 'W';
}

interface PointLossPoint extends PointLoss {
  x: number;
  y1: number;
  y2: number;
}

export function CommentsPanel({
  value,
  onChange,
  showAnalysisControls = false,
  chartData = [],
  chartMaxMoveNumber,
  commentReadOnly = false,
  commentRows,
  moveDisplay = ['scoreChange'],
  showScore,
  showPointLoss,
  showWinrate,
  showIntensity,
  intensityDisplayLimit,
  showComments,
  selectedMoveNumber = null,
  chartSummary = null,
  onDisplayChange,
  onPreviousMove,
  onNextMove,
  onSelectChartMove,
}: CommentsPanelProps) {
  const {t} = useTranslation();
  const commentInputRef = useRef<TextAreaRef>(null);
  const pendingCommentFocusRef = useRef(false);
  const showChart = showAnalysisControls && (showScore || showWinrate || showPointLoss || showIntensity);
  const scoreData = useMemo(() => chartData.filter((item) => item.series === 'score'), [chartData]);
  const winrateData = useMemo(() => chartData.filter((item) => item.series === 'winrate'), [chartData]);
  const intensityData = useMemo(() => chartData.filter((item) => item.series === 'intensity'), [chartData]);
  const pointLossData = useMemo(() => buildPointLossData(scoreData), [scoreData]);
  const hasVisibleData =
    (showScore && scoreData.length > 0) ||
    (showWinrate && winrateData.length > 0) ||
    (showPointLoss && pointLossData.length > 0) ||
    (showIntensity && intensityData.length > 0);

  function showOnlyComments(): void {
    pendingCommentFocusRef.current = true;
    if (showComments && !showChart) commentInputRef.current?.focus();
    onDisplayChange({
      showScore: false,
      showPointLoss: false,
      showWinrate: false,
      showIntensity: false,
      showComments: true,
    });
  }

  function toggleChart(key: 'showScore' | 'showPointLoss' | 'showWinrate' | 'showIntensity', value: boolean): void {
    onDisplayChange({showComments: false, [key]: !value});
  }

  useEffect(() => {
    if (!pendingCommentFocusRef.current || !showComments || showChart) return;

    pendingCommentFocusRef.current = false;
    commentInputRef.current?.focus();
  }, [showChart, showComments]);

  return (
    <section className="side-panel comments-panel">
      <div className="comments-panel-header">
        {showAnalysisControls ? (
          <Space.Compact>
            <Button
              size="small"
              title={t('analysisHeaderScoreTitle')}
              type={showScore ? 'primary' : 'default'}
              onClick={() => toggleChart('showScore', showScore)}
            >
              {t('analysisHeaderScore')}
            </Button>
            <Button
              size="small"
              title={t('analysisHeaderPointLossTitle')}
              type={showPointLoss ? 'primary' : 'default'}
              onClick={() => toggleChart('showPointLoss', showPointLoss)}
            >
              {t('analysisHeaderPointLoss')}
            </Button>
            <Button
              size="small"
              title={t('analysisHeaderWinRateTitle')}
              type={showWinrate ? 'primary' : 'default'}
              onClick={() => toggleChart('showWinrate', showWinrate)}
            >
              {t('analysisHeaderWinRate')}
            </Button>
            <Button
              size="small"
              title={t('analysisHeaderIntensityTitle')}
              type={showIntensity ? 'primary' : 'default'}
              onClick={() => toggleChart('showIntensity', showIntensity)}
            >
              {t('analysisHeaderIntensity')}
            </Button>
          </Space.Compact>
        ) : null}
        <Button size="small" type={showComments && !showChart ? 'primary' : 'default'} onClick={showOnlyComments}>
          {t('analysisHeaderComments')}
        </Button>
      </div>
      <div className="comments-panel-body">
        {showChart ? (
          hasVisibleData ? (
            <AnalysisChart
              scoreData={showScore ? scoreData : []}
              pointLossData={showPointLoss ? pointLossData : []}
              winrateData={showWinrate ? winrateData : []}
              intensityData={showIntensity ? intensityData : []}
              intensityDisplayLimit={intensityDisplayLimit}
              maxMoveNumber={chartMaxMoveNumber}
              allData={chartData}
              moveDisplay={moveDisplay}
              selectedMoveNumber={selectedMoveNumber}
              summary={chartSummary}
              onPreviousMove={onPreviousMove}
              onNextMove={onNextMove}
              onSelectMove={onSelectChartMove}
            />
          ) : (
            <Empty className="analysis-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('noAnalysisData')} />
          )
        ) : showComments ? (
          <Input.TextArea
            ref={commentInputRef}
            size="small"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoSize={false}
            rows={commentRows}
            readOnly={commentReadOnly}
          />
        ) : (
          <Empty className="analysis-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('comments')} />
        )}
      </div>
    </section>
  );
}

function AnalysisChart({
  scoreData,
  pointLossData,
  winrateData,
  intensityData,
  intensityDisplayLimit,
  maxMoveNumber,
  allData,
  moveDisplay,
  selectedMoveNumber,
  summary,
  onPreviousMove,
  onNextMove,
  onSelectMove,
}: {
  scoreData: AnalysisChartPoint[];
  pointLossData: PointLoss[];
  winrateData: AnalysisChartPoint[];
  intensityData: AnalysisChartPoint[];
  intensityDisplayLimit: number;
  maxMoveNumber: number;
  allData: AnalysisChartPoint[];
  moveDisplay: AnalysisSettings['moveDisplay'];
  selectedMoveNumber: number | null;
  summary: AnalysisChartSummary | null;
  onPreviousMove?: () => void;
  onNextMove?: () => void;
  onSelectMove?: (moveNumber: number) => void;
}) {
  const [hoverMoveNumber, setHoverMoveNumber] = useState<number | null>(null);
  const [hoverChartX, setHoverChartX] = useState<number | null>(null);
  const width = 360;
  const height = 190;
  const padding = {top: 16, right: 8, bottom: 18, left: 28};
  const maxMove = Math.max(0, maxMoveNumber);
  const pointScale = scoreScaleFor(scoreData, pointLossData);
  const chartScale = intensityChartScale(pointScale, intensityData, intensityDisplayLimit);
  const scorePoints = makePoints(scoreData, width, padding, maxMove, (value) =>
    valueToCenteredY(value, chartScale, height, padding)
  );
  const pointLossPoints = makePointLossPoints(pointLossData, width, padding, maxMove, chartScale, height);
  const intensityAreaPath = makeIntensityAreaPath(intensityData, width, padding, maxMove, chartScale, height);
  const scoreAxisLabel =
    scorePoints.length > 0
      ? {top: 'B+', bottom: 'W+'}
      : pointLossPoints.length > 0
        ? {top: 'W-', bottom: 'B-'}
        : {top: '', bottom: '−'};
  const winratePoints = makePoints(winrateData, width, padding, maxMove, (value) =>
    valueToWinrateY(value, height, padding)
  );
  const centerY = (padding.top + height - padding.bottom) / 2;
  const halfChartScale = Math.round(chartScale / 2);
  const halfScoreY = valueToCenteredY(halfChartScale, chartScale, height, padding);
  const negativeHalfScoreY = valueToCenteredY(-halfChartScale, chartScale, height, padding);
  const selectedX =
    selectedMoveNumber == null
      ? null
      : moveNumberToX(Math.max(0, Math.min(maxMove, selectedMoveNumber)), maxMove, width, padding);
  const currentMoveNumber =
    hoverMoveNumber ?? (selectedMoveNumber == null ? null : Math.max(0, Math.min(maxMove, selectedMoveNumber)));
  const currentMoveLabel =
    currentMoveNumber == null ? null : moveAxisLabelFor(currentMoveNumber, maxMove, width, padding, hoverChartX);
  const hoverSummary = hoverMoveNumber == null ? null : chartSummaryForMove(allData, hoverMoveNumber);
  const selectedSummary =
    selectedMoveNumber == null ? summary : (chartSummaryForMove(allData, selectedMoveNumber) ?? summary);

  function handleMouseDown(event: MouseEvent<SVGSVGElement>): void {
    if (onSelectMove == null) return;

    event.preventDefault();
    const {x} = mouseEventToViewBoxPoint(event, width, height);
    const moveNumber = xToMoveNumber(x, maxMove, width, padding);
    onSelectMove(moveNumber);
  }

  function handleMouseMove(event: MouseEvent<SVGSVGElement>): void {
    const point = mouseEventToViewBoxPoint(event, width, height);
    const nextHoverMoveNumber = xToHoverMoveNumber(point.x, point.y, maxMove, width, height, padding);
    setHoverMoveNumber(nextHoverMoveNumber);
    setHoverChartX(
      nextHoverMoveNumber == null ? null : Math.max(padding.left, Math.min(width - padding.right, point.x))
    );
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>): void {
    event.preventDefault();
    if (event.deltaY > 0) onNextMove?.();
    if (event.deltaY < 0) onPreviousMove?.();
  }

  return (
    <div className="analysis-chart-wrap">
      <svg
        className="analysis-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          setHoverMoveNumber(null);
          setHoverChartX(null);
        }}
        onWheel={handleWheel}
      >
        {intensityAreaPath === '' ? null : <path className="analysis-chart-intensity" d={intensityAreaPath} />}
        <line
          className="analysis-chart-grid"
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top}
          y2={padding.top}
        />
        <line
          className="analysis-chart-grid"
          x1={padding.left}
          x2={width - padding.right}
          y1={halfScoreY}
          y2={halfScoreY}
        />
        <line className="analysis-chart-axis" x1={padding.left} x2={width - padding.right} y1={centerY} y2={centerY} />
        <line
          className="analysis-chart-grid"
          x1={padding.left}
          x2={width - padding.right}
          y1={negativeHalfScoreY}
          y2={negativeHalfScoreY}
        />
        <line
          className="analysis-chart-grid"
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
        />
        <line
          className="analysis-chart-grid vertical"
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={height - padding.bottom}
        />
        <line
          className="analysis-chart-grid vertical"
          x1={width - padding.right}
          x2={width - padding.right}
          y1={padding.top}
          y2={height - padding.bottom}
        />
        {selectedX == null ? null : (
          <line
            className="analysis-chart-selected"
            x1={selectedX}
            x2={selectedX}
            y1={padding.top}
            y2={height - padding.bottom}
          />
        )}
        {hoverChartX == null ? null : (
          <line
            className="analysis-chart-hover"
            x1={hoverChartX}
            x2={hoverChartX}
            y1={padding.top}
            y2={height - padding.bottom}
          />
        )}

        {winratePoints.length > 0 ? (
          <path className="analysis-chart-line winrate" d={pointsPath(winratePoints)} />
        ) : null}

        {scorePoints.length > 0 ? <ScoreLine points={scorePoints} /> : null}

        {pointLossPoints.length > 0 ? <PointLossLines points={pointLossPoints} /> : null}

        {scorePoints.length > 0 || pointLossPoints.length > 0 || intensityAreaPath !== '' ? (
          <>
            <text className="analysis-chart-label score" x="2" y={padding.top + 4}>
              {`${scoreAxisLabel.top}${chartScale}`}
            </text>
            <text className="analysis-chart-label score" x="2" y={halfScoreY + 4}>
              {`${scoreAxisLabel.top}${halfChartScale}`}
            </text>
            <text className="analysis-chart-label score" x="2" y={centerY + 4}>
              0
            </text>
            <text className="analysis-chart-label score" x="2" y={negativeHalfScoreY + 4}>
              {`${scoreAxisLabel.bottom}${halfChartScale}`}
            </text>
            <text className="analysis-chart-label score" x="2" y={height - padding.bottom + 4}>
              {`${scoreAxisLabel.bottom}${chartScale}`}
            </text>
          </>
        ) : null}

        {winratePoints.length > 0 &&
        scorePoints.length === 0 &&
        pointLossPoints.length === 0 &&
        intensityAreaPath === '' ? (
          <>
            <text className="analysis-chart-label winrate" x="2" y={padding.top + 4}>
              100%
            </text>
            <text className="analysis-chart-label winrate" x="2" y={centerY + 4}>
              50%
            </text>
            <text className="analysis-chart-label winrate" x="2" y={height - padding.bottom + 4}>
              0%
            </text>
          </>
        ) : null}

        <text className="analysis-chart-label move" x={padding.left} y={height - 3}>
          0
        </text>
        {maxMove > 0 ? (
          <text className="analysis-chart-label move" x={width - padding.right} y={height - 3} textAnchor="end">
            {maxMove}
          </text>
        ) : null}
        {currentMoveLabel == null ? null : (
          <text className="analysis-chart-label move current" x={currentMoveLabel.x} y={height - 3} textAnchor="middle">
            {currentMoveLabel.text}
          </text>
        )}
      </svg>
      <AnalysisChartSummaryView summary={hoverSummary ?? selectedSummary} />
    </div>
  );
}

function makePoints(
  data: AnalysisChartPoint[],
  width: number,
  padding: {top: number; right: number; bottom: number; left: number},
  maxMove: number,
  yForValue: (value: number) => number
): PlotPoint[] {
  const plotWidth = width - padding.left - padding.right;
  return data
    .filter((item) => Number.isFinite(item.value))
    .map((item) => ({
      x: padding.left + (item.moveNumber / Math.max(1, maxMove)) * plotWidth,
      y: yForValue(item.value),
      value: item.value,
      moveNumber: item.moveNumber,
    }));
}

export function makeIntensityAreaPath(
  data: AnalysisChartPoint[],
  width: number,
  padding: {top: number; right: number; bottom: number; left: number},
  maxMove: number,
  scale: number,
  height: number
): string {
  const values = data
    .filter((item) => Number.isFinite(item.value))
    .map((item) => ({
      x: moveNumberToX(item.moveNumber, maxMove, width, padding),
      value: Math.min(scale, Math.abs(item.value)),
      color: item.color,
      symmetric: item.moveNumber === 0 || item.moveNumber === maxMove,
    }));
  if (values.length === 0) return '';

  const centerY = valueToCenteredY(0, scale, height, padding);
  const upperValues = values.filter(({color, symmetric}) => symmetric || color === 'W');
  const lowerValues = values.filter(({color, symmetric}) => symmetric || color === 'B');
  const areaPath = (sideValues: typeof values, sign: 1 | -1) => {
    if (sideValues.length === 0) return '';
    const firstX = sideValues[0].x;
    const lastX = sideValues.at(-1)?.x ?? firstX;
    const edge = sideValues.map(({x, value}) => `${x},${valueToCenteredY(sign * value, scale, height, padding)}`);
    return `M${firstX},${centerY}L${edge.join('L')}L${lastX},${centerY}Z`;
  };
  return `${areaPath(upperValues, 1)}${areaPath(lowerValues, -1)}`;
}

function buildPointLossData(data: AnalysisChartPoint[]): PointLoss[] {
  const points = data.filter((item) => Number.isFinite(item.value)).sort((a, b) => a.moveNumber - b.moveNumber);
  const losses: PointLoss[] = [];

  points.slice(1).forEach((point, index) => {
    const previous = points[index];
    const delta = point.value - previous.value;
    if (point.color === 'B' && delta < -1) losses.push({moveNumber: point.moveNumber, value: delta, color: 'B'});
    if (point.color === 'W' && delta > 1) losses.push({moveNumber: point.moveNumber, value: delta, color: 'W'});
  });

  return losses;
}

function lossForColor(delta: number, color: 'B' | 'W'): number {
  const loss = color === 'B' ? -delta : delta;
  return Math.max(0, loss);
}

function makePointLossPoints(
  data: PointLoss[],
  width: number,
  padding: {top: number; right: number; bottom: number; left: number},
  maxMove: number,
  scale: number,
  height: number
): PointLossPoint[] {
  return data.map((item) => ({
    ...item,
    x: moveNumberToX(item.moveNumber, maxMove, width, padding),
    y1: valueToCenteredY(0, scale, height, padding),
    y2: valueToCenteredY(item.value, scale, height, padding),
  }));
}

function ScoreLine({points}: {points: PlotPoint[]}) {
  if (points.length < 2) return null;

  return <path className="analysis-chart-line score" d={pointsPath(points)} />;
}

function PointLossLines({points}: {points: PointLossPoint[]}) {
  return (
    <>
      {points.map((point) => (
        <line
          key={`${point.moveNumber}-${point.color}`}
          className={`analysis-chart-point-loss ${point.color === 'B' ? 'black' : 'white'}`}
          x1={point.x}
          x2={point.x}
          y1={point.y1}
          y2={point.y2}
        />
      ))}
    </>
  );
}

function AnalysisChartSummaryView({summary}: {summary: AnalysisChartSummary | null}) {
  if (summary == null) return null;

  const scoreLead = summary.scoreLead;
  const blackWinrate = summary.winrate == null ? null : Math.max(0, Math.min(100, summary.winrate));
  const whiteWinrate = blackWinrate == null ? null : 100 - blackWinrate;
  const lossColor = summary.color === 'W' ? 'white' : 'black';

  return (
    <div className="analysis-chart-summary">
      <div className="analysis-chart-scorebox black">
        <span>B {scoreLead == null ? '-' : formatSignedScore(scoreLead)}</span>
        <span>{formatWinrate(blackWinrate)}</span>
      </div>
      <div className={`analysis-chart-scorebox ${lossColor}`}>
        <span>-{formatLoss(summary.pointLoss)}</span>
        <span>-{formatWinrate(summary.winrateLoss)}</span>
      </div>
      <div className="analysis-chart-scorebox white">
        <span>W {scoreLead == null ? '-' : formatSignedScore(-scoreLead)}</span>
        <span>{formatWinrate(whiteWinrate)}</span>
      </div>
    </div>
  );
}

function chartSummaryForMove(data: AnalysisChartPoint[], moveNumber: number): AnalysisChartSummary | null {
  const scorePoint = data.find((item) => item.moveNumber === moveNumber && item.series === 'score');
  const previousScore = data.find((item) => item.moveNumber === moveNumber - 1 && item.series === 'score')?.value;
  const winratePoint = data.find((item) => item.moveNumber === moveNumber && item.series === 'winrate');
  const previousWinrate = data.find((item) => item.moveNumber === moveNumber - 1 && item.series === 'winrate')?.value;
  const scoreLead = scorePoint?.value ?? null;
  const winrate = winratePoint?.value ?? null;
  const color = scorePoint?.color;

  return scoreLead == null && winrate == null
    ? null
    : {
        scoreLead,
        winrate,
        color,
        pointLoss:
          color == null || scoreLead == null || previousScore == null
            ? null
            : lossForColor(scoreLead - previousScore, color),
        winrateLoss:
          color == null || winrate == null || previousWinrate == null
            ? null
            : lossForColor(winrate - previousWinrate, color),
      };
}

function mouseEventToViewBoxPoint(
  event: MouseEvent<SVGSVGElement>,
  width: number,
  height: number
): {x: number; y: number} {
  const matrix = event.currentTarget.getScreenCTM();
  if (matrix != null) {
    const point = event.currentTarget.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const viewBoxPoint = point.matrixTransform(matrix.inverse());
    return {x: viewBoxPoint.x, y: viewBoxPoint.y};
  }

  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * width,
    y: ((event.clientY - rect.top) / rect.height) * height,
  };
}

function moveNumberToX(
  moveNumber: number,
  maxMove: number,
  width: number,
  padding: {left: number; right: number}
): number {
  const plotWidth = width - padding.left - padding.right;
  return padding.left + (moveNumber / Math.max(1, maxMove)) * plotWidth;
}

function xToMoveNumber(x: number, maxMove: number, width: number, padding: {left: number; right: number}): number {
  const plotWidth = width - padding.left - padding.right;
  const ratio = (Math.max(padding.left, Math.min(width - padding.right, x)) - padding.left) / plotWidth;
  return Math.max(0, Math.min(maxMove, Math.round(ratio * maxMove)));
}

function xToHoverMoveNumber(
  x: number,
  y: number,
  maxMove: number,
  width: number,
  height: number,
  padding: {top: number; right: number; bottom: number; left: number}
): number | null {
  if (x < padding.left || x > width - padding.right || y < padding.top || y > height - padding.bottom) return null;

  return xToMoveNumber(x, maxMove, width, padding);
}

function moveAxisLabelFor(
  moveNumber: number,
  maxMove: number,
  width: number,
  padding: {left: number; right: number},
  preferredX: number | null = null
): {text: string; x: number} | null {
  if (moveNumber === 0 || moveNumber === maxMove) return null;

  const text = String(moveNumber);
  const labelHalfWidth = estimatedMoveLabelWidth(text) / 2;
  const leftLimit = padding.left + estimatedMoveLabelWidth('0') + 6 + labelHalfWidth;
  const rightLimit = width - padding.right - estimatedMoveLabelWidth(String(maxMove)) - 6 - labelHalfWidth;
  if (leftLimit > rightLimit) return null;

  const x = Math.max(leftLimit, Math.min(rightLimit, preferredX ?? moveNumberToX(moveNumber, maxMove, width, padding)));
  return {text, x};
}

function estimatedMoveLabelWidth(text: string): number {
  return text.length * 5;
}

function valueToCenteredY(
  value: number,
  scale: number,
  height: number,
  padding: {top: number; bottom: number}
): number {
  const centerY = (padding.top + height - padding.bottom) / 2;
  const plotHeight = height - padding.top - padding.bottom;
  return centerY - (Math.max(-scale, Math.min(scale, value)) / scale) * (plotHeight / 2);
}

function valueToWinrateY(value: number, height: number, padding: {top: number; bottom: number}): number {
  const plotHeight = height - padding.top - padding.bottom;
  return padding.top + ((100 - Math.max(0, Math.min(100, value))) / 100) * plotHeight;
}

function pointsPath(points: PlotPoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
}

function scoreScaleFor(data: AnalysisChartPoint[], pointLossData: PointLoss[]): number {
  const maxAbs = Math.max(
    5,
    ...data.map((item) => Math.abs(item.value)),
    ...pointLossData.map((item) => Math.abs(item.value))
  );
  return Math.ceil(maxAbs / 5) * 5;
}

export function intensityChartScale(
  pointScale: number,
  intensityData: AnalysisChartPoint[],
  displayLimit: number
): number {
  const actualIntensity = Math.max(
    0,
    ...intensityData.filter((item) => Number.isFinite(item.value)).map((item) => Math.abs(item.value))
  );
  return Math.max(pointScale, Math.min(Math.ceil(actualIntensity), Math.max(pointScale, displayLimit)));
}

function formatSignedScore(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value;
  return normalized > 0 ? `+${normalized.toFixed(1)}` : normalized.toFixed(1).replace('-', '−');
}

function formatLoss(value: number | null | undefined): string {
  return value == null ? '-' : value.toFixed(1);
}

function formatWinrate(value: number | null | undefined): string {
  return value == null ? '-' : `${value.toFixed(1)}%`;
}
