import {
  CheckOutlined,
  CameraOutlined,
  CloseOutlined,
  QuestionCircleOutlined,
  DeleteOutlined,
  DoubleLeftOutlined,
  LeftOutlined,
  RightOutlined,
  ScissorOutlined,
} from '@ant-design/icons';
import {Button, Dropdown, Space} from 'antd';
import type {MenuProps} from 'antd';
import {samePath, type SgfDocument} from '@ulugo/sgf-core';
import {
  useCallback,
  useLayoutEffect,
  memo,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import {useTranslation} from 'react-i18next';
import {scoringOperationPath} from '../../app/appEditorUtils';
import type {ShortcutActionId} from '../shortcuts/keyboardShortcuts';
import {
  cornerRadius,
  gutterWidth,
  treeColumnStep,
  treeRowStep,
  type TreeCell,
  type TreeConnector,
  type TreeLayout,
} from './layout';

const moveTreePaddingTop = 4;
const moveTreeNodeSize = 26;
const emptyTreeCells: TreeCell[] = [];

interface SgfTreePanelProps {
  document: SgfDocument;
  layout: TreeLayout;
  selectedPath: number[];
  branchLeafPath: number[];
  onSelectPath: (path: number[]) => void;
  onMoveToMain: (path?: number[]) => void;
  onRecordWithCamera?: () => void;
  onMoveLeft: (path?: number[]) => void;
  onMoveRight: (path?: number[]) => void;
  onPrune: (path?: number[]) => void;
  onDelete: (path?: number[]) => void;
  onEstimateScore: (path: number[]) => void;
  estimateScoreEnabled: boolean;
  onPreviousMove: () => void;
  onNextMove: () => void;
  shortcutLabels?: Partial<Record<ShortcutActionId, string>>;
  replaceControls?: {
    onConfirm: () => void;
    onCancel: () => void;
  };
}

export function SgfTreePanel({
  document,
  layout,
  selectedPath,
  branchLeafPath,
  onSelectPath,
  onMoveToMain,
  onRecordWithCamera,
  onMoveLeft,
  onMoveRight,
  onPrune,
  onDelete,
  onEstimateScore,
  estimateScoreEnabled,
  onPreviousMove,
  onNextMove,
  shortcutLabels = {},
  replaceControls,
}: SgfTreePanelProps) {
  const {t} = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedFromScrollRef = useRef<string | null>(null);
  const lastScrollTopRef = useRef(0);
  const contextPathRef = useRef<number[] | null>(null);
  const [contextPath, setContextPath] = useState<number[] | null>(null);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const cellById = useMemo(() => new Map(layout.cells.map((cell) => [cell.id, cell])), [layout]);
  const cellsByRow = useMemo(() => groupCells(layout.cells, (cell) => cell.row), [layout]);
  const selectedCell = useMemo(
    () => layout.cells.find((cell) => samePath(cell.path, selectedPath)) ?? null,
    [layout, selectedPath]
  );
  const onSelectPathRef = useRef(onSelectPath);
  useLayoutEffect(() => {
    onSelectPathRef.current = onSelectPath;
  }, [onSelectPath]);
  const handleSelectPath = useCallback((path: number[]) => onSelectPathRef.current(path), []);
  const validContextPath = useMemo(
    () => (contextPath != null && layout.cells.some((cell) => samePath(cell.path, contextPath)) ? contextPath : null),
    [contextPath, layout]
  );

  useLayoutEffect(() => {
    const selectedFromScroll = selectedFromScrollRef.current === selectedCell?.id;
    selectedFromScrollRef.current = null;
    const panel = scrollRef.current;
    if (panel == null || selectedCell == null) return;

    if (!selectedFromScroll) scrollTreeStoneIntoView(panel, selectedCell);
    // Ignore the scroll event from revealing the selection, without suppressing subsequent user scrolling.
    lastScrollTopRef.current = panel.scrollTop;
  }, [selectedCell]);

  const handleScroll = useCallback(() => {
    const panel = scrollRef.current;
    if (panel == null) return;

    const scrollTop = panel.scrollTop;
    if (scrollTop === lastScrollTopRef.current) return;
    lastScrollTopRef.current = scrollTop;
    if (selectedCell == null) return;

    if (isTreeStoneVerticallyVisible(panel, selectedCell.row)) return;

    const nextCell = closestVisibleCell(panel, layout.cells, selectedCell.row, branchLeafPath);

    if (nextCell != null && nextCell.id !== selectedCell.id) {
      selectedFromScrollRef.current = nextCell.id;
      onSelectPath(nextCell.path);
    }
  }, [branchLeafPath, layout, onSelectPath, selectedCell]);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (event.deltaY === 0 || event.shiftKey) return;

      const panel = scrollRef.current;
      if (panel == null) return;

      const maxScroll = Math.max(0, panel.scrollHeight - panel.clientHeight);
      const atTop = panel.scrollTop <= 0;
      const atBottom = panel.scrollTop >= maxScroll - 1;

      if (event.deltaY < 0 && atTop) {
        event.preventDefault();
        onPreviousMove();
      } else if (event.deltaY > 0 && atBottom) {
        event.preventDefault();
        onNextMove();
      }
    },
    [onNextMove, onPreviousMove]
  );

  const canEstimateScore = estimateScoreEnabled && validContextPath != null;
  const contextOperationPath = useMemo(
    () => (validContextPath == null ? null : scoringOperationPath(document, validContextPath)),
    [document, validContextPath]
  );
  const selectedOperationPath = useMemo(() => scoringOperationPath(document, selectedPath), [document, selectedPath]);
  const showRecordWithCamera =
    onRecordWithCamera != null && selectedOperationPath.every((childIndex) => childIndex === 0);

  const contextMenuItems = useMemo<MenuProps['items']>(
    () => [
      {
        key: 'moveBranchToMain',
        label: t('moveBranchToMain'),
        icon: <DoubleLeftOutlined />,
        disabled: contextOperationPath == null || contextOperationPath.length === 0,
      },
      {
        key: 'moveBranchLeft',
        label: t('moveBranchLeft'),
        icon: <LeftOutlined />,
        disabled: contextOperationPath == null || contextOperationPath.length === 0,
      },
      {
        key: 'moveBranchRight',
        label: t('moveBranchRight'),
        icon: <RightOutlined />,
        disabled: contextOperationPath == null || contextOperationPath.length === 0,
      },
      ...(canEstimateScore
        ? [
            {
              key: 'estimateScore',
              label: t('estimateScore'),
              icon: <QuestionCircleOutlined />,
            },
          ]
        : []),
      {
        key: 'pruneBranch',
        label: t('pruneBranch'),
        icon: <ScissorOutlined />,
        danger: true,
        disabled: contextOperationPath == null || contextOperationPath.length === 0,
      },
      {
        key: 'deleteBranch',
        label: t('deleteBranch'),
        icon: <DeleteOutlined />,
        danger: true,
        disabled: contextOperationPath == null || contextOperationPath.length === 0,
      },
    ],
    [canEstimateScore, contextOperationPath, t]
  );

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const node = (event.target as Element).closest<HTMLElement>('[data-tree-node-id]');
      const cell = node?.dataset.treeNodeId == null ? null : cellById.get(node.dataset.treeNodeId);
      const nextPath = cell?.path ?? null;
      contextPathRef.current = nextPath;
      setContextPath(nextPath);
    },
    [cellById]
  );

  const handleContextMenuClick: MenuProps['onClick'] = ({key}) => {
    const targetPath = contextPathRef.current;
    if (targetPath == null) return;

    setContextMenuOpen(false);
    switch (key) {
      case 'estimateScore':
        if (!estimateScoreEnabled) return;
        onEstimateScore(targetPath);
        break;
      case 'moveBranchToMain':
        if (targetPath.length === 0) return;
        onMoveToMain(targetPath);
        break;
      case 'moveBranchLeft':
        if (targetPath.length === 0) return;
        onMoveLeft(targetPath);
        break;
      case 'moveBranchRight':
        if (targetPath.length === 0) return;
        onMoveRight(targetPath);
        break;
      case 'pruneBranch':
        if (targetPath.length === 0) return;
        onPrune(targetPath);
        break;
      case 'deleteBranch':
        if (targetPath.length === 0) return;
        onDelete(targetPath);
        break;
    }
  };

  return (
    <section className="side-panel tree-panel">
      <div className="tree-panel-header">
        {replaceControls == null ? (
          <Space.Compact>
            {showRecordWithCamera ? (
              <TreeActionButton
                title={t('recordWithCamera')}
                disabled={false}
                icon={<CameraOutlined />}
                onClick={onRecordWithCamera}
              />
            ) : (
              <TreeActionButton
                title={withShortcut(t('moveBranchToMain'), shortcutLabels.moveBranchToMain)}
                disabled={selectedOperationPath.length === 0}
                icon={<DoubleLeftOutlined />}
                onClick={() => onMoveToMain()}
              />
            )}
            <TreeActionButton
              title={withShortcut(t('moveBranchLeft'), shortcutLabels.moveBranchLeft)}
              disabled={selectedOperationPath.length === 0}
              icon={<LeftOutlined />}
              onClick={() => onMoveLeft()}
            />
            <TreeActionButton
              title={withShortcut(t('moveBranchRight'), shortcutLabels.moveBranchRight)}
              disabled={selectedOperationPath.length === 0}
              icon={<RightOutlined />}
              onClick={() => onMoveRight()}
            />
            <TreeActionButton
              title={withShortcut(t('pruneBranch'), shortcutLabels.pruneBranch)}
              disabled={selectedOperationPath.length === 0}
              icon={<ScissorOutlined />}
              danger
              onClick={() => onPrune()}
            />
            <TreeActionButton
              title={withShortcut(t('deleteBranch'), shortcutLabels.deleteBranch)}
              disabled={selectedOperationPath.length === 0}
              icon={<DeleteOutlined />}
              danger
              onClick={() => onDelete()}
            />
          </Space.Compact>
        ) : (
          <Space.Compact>
            <TreeActionButton
              title={`${t('confirm')} (Enter)`}
              disabled={false}
              icon={<CheckOutlined />}
              onClick={replaceControls.onConfirm}
            />
            <TreeActionButton
              title={`${t('cancel')} (Esc)`}
              disabled={false}
              icon={<CloseOutlined />}
              onClick={replaceControls.onCancel}
            />
          </Space.Compact>
        )}
      </div>
      <div className="tree-scroll" ref={scrollRef} onScroll={handleScroll} onWheel={handleWheel}>
        <Dropdown
          trigger={['contextMenu']}
          open={contextMenuOpen}
          onOpenChange={(open) => setContextMenuOpen(open && contextPathRef.current != null)}
          menu={{items: contextMenuItems, onClick: handleContextMenuClick}}
        >
          <div
            className="move-tree"
            style={{gridTemplateColumns: `${gutterWidth}px repeat(${layout.columns}, ${treeColumnStep}px)`}}
            onContextMenuCapture={handleContextMenu}
          >
            <ConnectorLayer layout={layout} />
            {layout.rows.map((row) => (
              <MoveTreeRow
                key={row}
                row={row}
                columns={layout.columns}
                cells={cellsByRow.get(row) ?? emptyTreeCells}
                selectedCellId={selectedCell?.row === row ? selectedCell.id : null}
                onSelectPath={handleSelectPath}
              />
            ))}
          </div>
        </Dropdown>
      </div>
    </section>
  );
}

function withShortcut(title: string, shortcut: string | undefined): string {
  return shortcut == null || shortcut === '' ? title : `${title} (${shortcut})`;
}

function isTreeStoneVerticallyVisible(panel: HTMLDivElement, row: number): boolean {
  const {stoneTop, stoneBottom} = treeStoneBounds(row);
  const visibleTop = panel.scrollTop;
  const visibleBottom = visibleTop + panel.clientHeight;

  return stoneTop >= visibleTop && stoneBottom <= visibleBottom;
}

export function scrollTreeStoneIntoView(panel: HTMLDivElement, cell: Pick<TreeCell, 'row' | 'column'>): void {
  const {stoneTop, stoneBottom} = treeStoneBounds(cell.row);
  const stoneCenter = gutterWidth + cell.column * treeColumnStep + treeColumnStep / 2;
  const visibleTop = panel.scrollTop;

  if (stoneTop < visibleTop) {
    panel.scrollTop = stoneTop;
  } else if (stoneBottom > visibleTop + panel.clientHeight) {
    panel.scrollTop = stoneBottom - panel.clientHeight;
  }

  const maxScrollLeft = Math.max(0, panel.scrollWidth - panel.clientWidth);
  panel.scrollLeft = Math.max(0, Math.min(maxScrollLeft, stoneCenter - panel.clientWidth / 2));
}

function treeStoneBounds(row: number): {stoneTop: number; stoneBottom: number} {
  const stoneTop = moveTreePaddingTop + row * treeRowStep + (treeRowStep - moveTreeNodeSize) / 2;
  return {stoneTop, stoneBottom: stoneTop + moveTreeNodeSize};
}

export function closestVisibleCell(
  panel: HTMLDivElement,
  cells: TreeCell[],
  row: number,
  branchLeafPath: number[]
): TreeCell | null {
  let closestCell: TreeCell | null = null;
  let closestDistance = Infinity;

  for (const cell of cells) {
    if (!samePath(cell.path, branchLeafPath.slice(0, cell.path.length))) continue;
    if (!isTreeStoneVerticallyVisible(panel, cell.row)) continue;

    const distance = Math.abs(cell.row - row);
    if (distance < closestDistance) {
      closestCell = cell;
      closestDistance = distance;
    }
  }

  return closestCell;
}

function TreeActionButton({
  title,
  icon,
  disabled,
  danger,
  type = 'default',
  onClick,
}: {
  title: string;
  icon: ReactNode;
  disabled: boolean;
  danger?: boolean;
  type?: 'default' | 'primary';
  onClick: () => void;
}) {
  return (
    <Button size="medium" disabled={disabled} danger={danger} type={type} icon={icon} title={title} onClick={onClick} />
  );
}

const MoveTreeRow = memo(function MoveTreeRow({
  row,
  columns,
  cells,
  selectedCellId,
  onSelectPath,
}: {
  row: number;
  columns: number;
  cells: TreeCell[];
  selectedCellId: string | null;
  onSelectPath: (path: number[]) => void;
}) {
  return (
    <>
      <div className="move-row-number">{row}</div>
      <div className="move-row-cells" style={{gridTemplateColumns: `repeat(${columns}, ${treeColumnStep}px)`}}>
        {cells.map((cell) => (
          <button
            key={cell.id}
            className={`move-tree-node ${cell.color === 'B' ? 'black' : cell.color === 'W' ? 'white' : 'root'} ${cell.isSetup ? 'setup' : ''} ${cell.isPass ? 'pass' : ''} ${cell.isScoring ? 'score' : ''} ${cell.hasComment ? 'has-comment' : ''} ${cell.hasDrawing ? 'has-drawing' : ''} ${cell.id === selectedCellId ? 'selected' : ''}`}
            style={{gridColumn: cell.column + 1}}
            type="button"
            data-tree-node-id={cell.id}
            onClick={() => onSelectPath(cell.path)}
          >
            <span className="move-tree-node-text">{cell.isCameraSetup ? <CameraOutlined /> : cell.text}</span>
          </button>
        ))}
      </div>
    </>
  );
});

const ConnectorLayer = memo(function ConnectorLayer({layout}: {layout: TreeLayout}) {
  const width = gutterWidth + layout.columns * treeColumnStep;
  const height = layout.rows.length * treeRowStep;

  return (
    <svg className="move-tree-connectors" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {layout.connectors.map((connector) => (
        <path key={connector.id} d={connectorPath(connector)} />
      ))}
    </svg>
  );
});

function groupCells(cells: TreeCell[], keyFor: (cell: TreeCell) => number): Map<number, TreeCell[]> {
  const groups = new Map<number, TreeCell[]>();
  for (const cell of cells) {
    const key = keyFor(cell);
    const group = groups.get(key);
    if (group == null) groups.set(key, [cell]);
    else group.push(cell);
  }
  return groups;
}

function connectorPath(connector: TreeConnector): string {
  const x1 = gutterWidth + connector.fromColumn * treeColumnStep + treeColumnStep / 2;
  const x2 = gutterWidth + connector.toColumn * treeColumnStep + treeColumnStep / 2;
  const y1 = connector.fromRow * treeRowStep + treeRowStep / 2;
  const y2 = connector.toRow * treeRowStep + treeRowStep / 2;

  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;

  const direction = x2 > x1 ? 1 : -1;
  const midY = y1 + (y2 - y1) / 2;

  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${midY - cornerRadius}`,
    `Q ${x1} ${midY} ${x1 + direction * cornerRadius} ${midY}`,
    `L ${x2 - direction * cornerRadius} ${midY}`,
    `Q ${x2} ${midY} ${x2} ${midY + cornerRadius}`,
    `L ${x2} ${y2}`,
  ].join(' ');
}
