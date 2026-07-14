import {CloseOutlined, PrinterOutlined} from '@ant-design/icons';
import {Board, type Marker} from '@ulugo/go-board';
import {deriveBoardPosition} from '@ulugo/go-core';
import {
  getBoardSize,
  getGameInfo,
  getLine,
  pointToVertex,
  type SgfColor,
  type SgfDocument,
  type SgfPoint,
} from '@ulugo/sgf-core';
import {Button, Checkbox, Input, InputNumber, Modal, Select, Space} from 'antd';
import {useMemo, useState, type CSSProperties} from 'react';
import {useTranslation} from 'react-i18next';

type PrintMode = 'all' | 'current';
type Sign = -1 | 0 | 1;

interface PrintPreviewProps {
  document: SgfDocument;
  selectedPath: number[];
  onClose: () => void;
}

interface PrintMove {
  color: SgfColor;
  moveNumber: number;
  path: number[];
  point: SgfPoint;
}

interface PrintPage {
  endMove: number;
  items: PrintMove[];
  startMove: number;
}

interface RepeatedMove {
  color: SgfColor;
  moveNumber: number;
  position: string;
}

interface PageDiagram {
  markerMap: Array<Array<Marker | null>>;
  repeatedMoves: RepeatedMove[];
  signMap: Sign[][];
}

const coordinateLetters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

export function PrintPreview({document, selectedPath, onClose}: PrintPreviewProps) {
  const {t} = useTranslation();
  const [mode, setMode] = useState<PrintMode>('all');
  const [movesPerPage, setMovesPerPage] = useState(50);
  const [movesPerPageDraft, setMovesPerPageDraft] = useState<number | null>(50);
  const [showTitle, setShowTitle] = useState(true);
  const [customTitle, setCustomTitle] = useState('');
  const boardSize = useMemo(() => getBoardSize(document), [document]);
  const gameInfo = useMemo(() => getGameInfo(document), [document]);
  const printMoves = useMemo(() => {
    const targetPath = mode === 'all' ? getMainBranchPath(document) : selectedPath;
    return collectMoves(document, targetPath);
  }, [document, mode, selectedPath]);
  const pages = useMemo(() => paginateMoves(printMoves, movesPerPage), [movesPerPage, printMoves]);
  const boardStyle = useMemo(
    () =>
      ({
        fontSize: `calc(100cqw / ${boardSize + 2})`,
      }) satisfies CSSProperties,
    [boardSize]
  );
  const titlePrefix = customTitle.trim();
  const resultTitle = gameInfo.RE?.trim();
  const defaultTitlePrefix = `B: ${gameInfo.PB?.trim() || t('black')} .vs. W: ${gameInfo.PW?.trim() || t('white')}${resultTitle ? ` , ${t('RE')}: ${resultTitle}` : ''}`;

  function commitMovesPerPageDraft(): void {
    const nextValue = Math.max(0, Number(movesPerPageDraft) || 0);
    setMovesPerPage(nextValue);
    setMovesPerPageDraft(nextValue);
  }

  return (
    <Modal
      className="print-preview-modal"
      title={t('printPreview')}
      open
      centered
      closable={false}
      onCancel={onClose}
      width="min(96vw, 980px)"
      destroyOnHidden
      footer={
        <div className="print-preview-footer">
          <Space wrap>
            <Select
              value={mode}
              getPopupContainer={(trigger) => trigger.parentElement ?? window.document.body}
              options={[
                {value: 'all', label: t('printAll')},
                {value: 'current', label: t('printCurrent')},
              ]}
              onChange={setMode}
            />
            <span>{t('movesPerPage')}</span>
            <InputNumber
              min={0}
              precision={0}
              value={movesPerPageDraft}
              onBlur={commitMovesPerPageDraft}
              onChange={setMovesPerPageDraft}
              onPressEnter={commitMovesPerPageDraft}
            />
            <Checkbox checked={showTitle} onChange={(event) => setShowTitle(event.target.checked)}>
              {t('showTitle')}
            </Checkbox>
            <Input
              className="print-preview-title-input"
              placeholder={t('customTitle')}
              value={customTitle}
              onChange={(event) => setCustomTitle(event.target.value)}
            />
          </Space>
          <Space>
            <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
              {t('print')}
            </Button>
            <Button icon={<CloseOutlined />} onClick={onClose}>
              {t('close')}
            </Button>
          </Space>
        </div>
      }
    >
      <div className="print-preview-pages">
        {pages.map((page, index) => {
          const diagram = buildPageDiagram(document, boardSize, printMoves, page);
          const pageTitle = buildPageTitle({
            defaultPrefix: defaultTitlePrefix,
            customPrefix: titlePrefix,
            page,
            pageCount: pages.length,
          });

          return (
            <section className="print-preview-page" key={`${page.startMove}-${page.endMove}-${index}`}>
              {showTitle ? (
                <header className="print-preview-page-title">
                  <h1>{pageTitle.mainTitle}</h1>
                  {pageTitle.moveTitle != null ? <div>{pageTitle.moveTitle}</div> : null}
                </header>
              ) : null}
              <div className="print-preview-board-wrap">
                <Board
                  className="ulugo-board-flat print-preview-board"
                  vertexSize={1}
                  showCoordinates
                  style={boardStyle}
                  signMap={diagram.signMap}
                  markerMap={diagram.markerMap}
                />
              </div>
              {diagram.repeatedMoves.length > 0 ? (
                <div className="print-preview-repeated-moves">
                  {diagram.repeatedMoves.map((move) => (
                    <div className="print-preview-repeated-move" key={move.moveNumber}>
                      <span className={`print-preview-repeated-stone ${move.color === 'B' ? 'black' : 'white'}`}>
                        {move.moveNumber}
                      </span>
                      <span>{move.position}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </Modal>
  );
}

function getMainBranchPath(document: SgfDocument): number[] {
  const path: number[] = [];
  let node = document.root;

  while (node.children[0] != null) {
    path.push(0);
    node = node.children[0];
  }

  return path;
}

function collectMoves(document: SgfDocument, targetPath: number[]): PrintMove[] {
  const line = getLine(document, targetPath);
  const result: PrintMove[] = [];

  for (let index = 1; index < line.length; index += 1) {
    const node = line[index];
    const color: SgfColor | null = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null;
    if (color == null) continue;

    result.push({
      color,
      moveNumber: result.length + 1,
      path: targetPath.slice(0, index),
      point: node.data[color]?.[0] ?? '',
    });
  }

  return result;
}

function paginateMoves(moves: PrintMove[], movesPerPage: number): PrintPage[] {
  if (moves.length === 0) return [{startMove: 0, endMove: 0, items: []}];
  if (movesPerPage <= 0) return [{startMove: 1, endMove: moves.length, items: moves}];

  const pages: PrintPage[] = [];
  for (let index = 0; index < moves.length; index += movesPerPage) {
    const items = moves.slice(index, index + movesPerPage);
    pages.push({
      startMove: items[0]?.moveNumber ?? 0,
      endMove: items[items.length - 1]?.moveNumber ?? 0,
      items,
    });
  }
  return pages;
}

function buildPageDiagram(
  document: SgfDocument,
  boardSize: number,
  moves: PrintMove[],
  page: PrintPage
): PageDiagram {
  const signMap = createGrid<Sign>(boardSize, 0);
  const markerMap = createGrid<Marker | null>(boardSize, null);
  const repeatedMoves: RepeatedMove[] = [];
  const firstMoveIndex = page.startMove <= 0 ? 0 : page.startMove - 1;
  const beforePath = firstMoveIndex > 0 ? moves[firstMoveIndex - 1]?.path ?? [] : [];
  const beforePosition = deriveBoardPosition(document, beforePath);
  const pagePoints = new Set<SgfPoint>();

  for (const [point, color] of beforePosition.stones) {
    setPoint(signMap, boardSize, point, colorToSign(color));
  }

  for (const move of page.items) {
    if (move.point === '') {
      repeatedMoves.push({...move, position: 'Pass'});
      continue;
    }

    if (pagePoints.has(move.point)) {
      repeatedMoves.push({...move, position: formatPoint(move.point, boardSize)});
      continue;
    }

    pagePoints.add(move.point);
    setPoint(signMap, boardSize, move.point, colorToSign(move.color));
    setPoint(markerMap, boardSize, move.point, {type: 'label', label: String(move.moveNumber)});
  }

  return {signMap, markerMap, repeatedMoves};
}

function setPoint<T>(grid: T[][], boardSize: number, point: SgfPoint, value: T): void {
  const vertex = pointToVertex(point);
  if (vertex == null || vertex[0] >= boardSize || vertex[1] >= boardSize) return;
  grid[vertex[1]][vertex[0]] = value;
}

function createGrid<T>(size: number, value: T): T[][] {
  return Array.from({length: size}, () => Array.from({length: size}, () => value));
}

function colorToSign(color: SgfColor): Sign {
  return color === 'B' ? 1 : -1;
}

function formatPoint(point: SgfPoint, boardSize: number): string {
  const vertex = pointToVertex(point);
  if (vertex == null) return point;
  const [x, y] = vertex;
  return `${coordinateLetters[x] ?? '?'}${boardSize - y}`;
}

function buildPageTitle({
  defaultPrefix,
  customPrefix,
  page,
  pageCount,
}: {
  defaultPrefix: string;
  customPrefix: string;
  page: PrintPage;
  pageCount: number;
}): {mainTitle: string; moveTitle: string | null} {
  const prefix = customPrefix === '' ? defaultPrefix : customPrefix;
  const moveText =
    page.startMove === page.endMove ? `Move ${page.startMove}` : `Move ${page.startMove} to ${page.endMove}`;
  return {
    mainTitle: prefix,
    moveTitle: pageCount > 1 || customPrefix === '' ? moveText : null,
  };
}
