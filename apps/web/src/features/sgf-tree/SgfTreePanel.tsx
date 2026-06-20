import {LeftOutlined, RightOutlined, DeleteOutlined, DoubleLeftOutlined, ScissorOutlined} from '@ant-design/icons';
import {Button, Dropdown, Space} from 'antd';
import type {MenuProps} from 'antd';
import {buildTree, getBoardSize, samePath, type SgfDocument} from '@ulugo/sgf-core';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import {useTranslation} from 'react-i18next';
import type {ShortcutActionId} from '../shortcuts/keyboardShortcuts';
import {
  cornerRadius,
  gutterWidth,
  layoutTree,
  treeColumnStep,
  treeRowStep,
  type TreeCell,
  type TreeConnector,
  type TreeLayout,
} from './layout';

const moveTreePaddingTop = 4;
const moveTreeNodeSize = 26;

interface SgfTreePanelProps {
  document: SgfDocument;
  selectedPath: number[];
  onSelectPath: (path: number[]) => void;
  onMoveToMain: (path?: number[]) => void;
  onMoveLeft: (path?: number[]) => void;
  onMoveRight: (path?: number[]) => void;
  onPrune: (path?: number[]) => void;
  onDelete: (path?: number[]) => void;
  onPreviousMove: () => void;
  onNextMove: () => void;
  shortcutLabels?: Partial<Record<ShortcutActionId, string>>;
}

export function SgfTreePanel({
  document,
  selectedPath,
  onSelectPath,
  onMoveToMain,
  onMoveLeft,
  onMoveRight,
  onPrune,
  onDelete,
  onPreviousMove,
  onNextMove,
  shortcutLabels = {},
}: SgfTreePanelProps) {
  const {t} = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const suppressScrollSelectRef = useRef(false);
  const selectedFromScrollRef = useRef(false);
  const releaseSuppressScrollSelectRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);
  const contextPathRef = useRef<number[] | null>(null);
  const [contextPath, setContextPath] = useState<number[] | null>(null);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const tree = useMemo(() => buildTree(document), [document]);
  const boardSize = useMemo(() => getBoardSize(document), [document]);
  const layout = useMemo(() => layoutTree(tree[0], boardSize), [boardSize, tree]);

  useEffect(() => {
    if (selectedFromScrollRef.current) {
      selectedFromScrollRef.current = false;
      return;
    }

    const panel = scrollRef.current;
    const selectedCell = layout.cells.find((cell) => samePath(cell.path, selectedPath));
    if (panel == null || selectedCell == null) return;

    const node = panel.querySelector<HTMLElement>(`[data-tree-node-id="${selectedCell.id}"]`);
    if (node == null) return;

    if (!isTreeStoneVisible(panel, selectedCell.row)) {
      suppressScrollSelectRef.current = true;
      scrollTreeStoneIntoView(panel, selectedCell.row);
      lastScrollTopRef.current = panel.scrollTop;
    }

    scrollTreeNodeHorizontallyIntoView(panel, node);

    if (releaseSuppressScrollSelectRef.current != null) {
      window.clearTimeout(releaseSuppressScrollSelectRef.current);
    }
    releaseSuppressScrollSelectRef.current = window.setTimeout(() => {
      suppressScrollSelectRef.current = false;
      releaseSuppressScrollSelectRef.current = null;
    }, 120);
  }, [layout, selectedPath]);

  useEffect(() => {
    return () => {
      if (releaseSuppressScrollSelectRef.current != null) {
        window.clearTimeout(releaseSuppressScrollSelectRef.current);
      }
    };
  }, []);

  const handleScroll = useCallback(() => {
    const panel = scrollRef.current;
    if (panel == null) return;

    const scrollTop = panel.scrollTop;
    if (scrollTop === lastScrollTopRef.current) return;
    lastScrollTopRef.current = scrollTop;
    if (suppressScrollSelectRef.current) return;

    const currentCell = layout.cells.find((cell) => samePath(cell.path, selectedPath));
    if (currentCell == null) return;

    const branchCells = layout.cells
      .filter((cell) => cell.column === currentCell.column)
      .sort((left, right) => left.row - right.row);
    if (isTreeStoneVisible(panel, currentCell.row)) return;

    const nextCell = closestVisibleCell(panel, branchCells, currentCell.row);

    if (nextCell != null && !samePath(nextCell.path, selectedPath)) {
      selectedFromScrollRef.current = true;
      onSelectPath(nextCell.path);
    }
  }, [layout, onSelectPath, selectedPath]);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (event.deltaY === 0) return;

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

  const contextMenuItems = useMemo<MenuProps['items']>(
    () => [
      {
        key: 'moveBranchToMain',
        label: t('moveBranchToMain'),
        icon: <DoubleLeftOutlined />,
        disabled: contextPath == null || contextPath.length === 0,
      },
      {
        key: 'moveBranchLeft',
        label: t('moveBranchLeft'),
        icon: <LeftOutlined />,
        disabled: contextPath == null || contextPath.length === 0,
      },
      {
        key: 'moveBranchRight',
        label: t('moveBranchRight'),
        icon: <RightOutlined />,
        disabled: contextPath == null || contextPath.length === 0,
      },
      {
        key: 'pruneBranch',
        label: t('pruneBranch'),
        icon: <ScissorOutlined />,
        danger: true,
        disabled: contextPath == null || contextPath.length === 0,
      },
      {
        key: 'deleteBranch',
        label: t('deleteBranch'),
        icon: <DeleteOutlined />,
        danger: true,
        disabled: contextPath == null || contextPath.length === 0,
      },
    ],
    [contextPath, t]
  );

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const node = (event.target as Element).closest<HTMLElement>('[data-tree-node-id]');
      const cell = layout.cells.find((candidate) => candidate.id === node?.dataset.treeNodeId);
      const nextPath = cell?.path ?? null;
      contextPathRef.current = nextPath;
      setContextPath(nextPath);
    },
    [layout]
  );

  const handleContextMenuClick: MenuProps['onClick'] = ({key}) => {
    const targetPath = contextPathRef.current;
    if (targetPath == null || targetPath.length === 0) return;

    setContextMenuOpen(false);
    switch (key) {
      case 'moveBranchToMain':
        onMoveToMain(targetPath);
        break;
      case 'moveBranchLeft':
        onMoveLeft(targetPath);
        break;
      case 'moveBranchRight':
        onMoveRight(targetPath);
        break;
      case 'pruneBranch':
        onPrune(targetPath);
        break;
      case 'deleteBranch':
        onDelete(targetPath);
        break;
    }
  };

  return (
    <section className="side-panel tree-panel">
      <div className="tree-panel-header">
        <Space.Compact>
          <TreeActionButton
            title={withShortcut(t('moveBranchToMain'), shortcutLabels.moveBranchToMain)}
            disabled={selectedPath.length === 0}
            icon={<DoubleLeftOutlined />}
            onClick={() => onMoveToMain()}
          />
          <TreeActionButton
            title={withShortcut(t('moveBranchLeft'), shortcutLabels.moveBranchLeft)}
            disabled={selectedPath.length === 0}
            icon={<LeftOutlined />}
            onClick={() => onMoveLeft()}
          />
          <TreeActionButton
            title={withShortcut(t('moveBranchRight'), shortcutLabels.moveBranchRight)}
            disabled={selectedPath.length === 0}
            icon={<RightOutlined />}
            onClick={() => onMoveRight()}
          />
          <TreeActionButton
            title={withShortcut(t('pruneBranch'), shortcutLabels.pruneBranch)}
            disabled={selectedPath.length === 0}
            icon={<ScissorOutlined />}
            danger
            onClick={() => onPrune()}
          />
          <TreeActionButton
            title={withShortcut(t('deleteBranch'), shortcutLabels.deleteBranch)}
            disabled={selectedPath.length === 0}
            icon={<DeleteOutlined />}
            danger
            onClick={() => onDelete()}
          />
        </Space.Compact>
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
                cells={layout.cells.filter((cell) => cell.row === row)}
                selectedPath={selectedPath}
                onSelectPath={onSelectPath}
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

function isTreeStoneVisible(panel: HTMLDivElement, row: number): boolean {
  const {stoneTop, stoneBottom} = treeStoneBounds(row);
  const visibleTop = panel.scrollTop;
  const visibleBottom = visibleTop + panel.clientHeight;

  return stoneTop >= visibleTop && stoneBottom <= visibleBottom;
}

function scrollTreeStoneIntoView(panel: HTMLDivElement, row: number): void {
  const {stoneTop, stoneBottom} = treeStoneBounds(row);
  const visibleTop = panel.scrollTop;
  const visibleBottom = visibleTop + panel.clientHeight;

  if (isTreeStoneVisible(panel, row)) return;

  const maxScroll = Math.max(0, panel.scrollHeight - panel.clientHeight);
  const nextScrollTop = stoneTop < visibleTop ? stoneTop : stoneBottom - panel.clientHeight;
  panel.scrollTop = Math.max(0, Math.min(maxScroll, nextScrollTop));
}

function treeStoneBounds(row: number): {stoneTop: number; stoneBottom: number} {
  const stoneTop = moveTreePaddingTop + row * treeRowStep + (treeRowStep - moveTreeNodeSize) / 2;
  return {stoneTop, stoneBottom: stoneTop + moveTreeNodeSize};
}

function scrollTreeNodeHorizontallyIntoView(panel: HTMLDivElement, node: HTMLElement): void {
  const nodeLeft = node.offsetLeft;
  const nodeRight = nodeLeft + node.offsetWidth;
  const visibleLeft = panel.scrollLeft;
  const visibleRight = visibleLeft + panel.clientWidth;

  if (nodeLeft < visibleLeft) {
    panel.scrollLeft = nodeLeft;
  } else if (nodeRight > visibleRight) {
    panel.scrollLeft = nodeRight - panel.clientWidth;
  }
}

function closestVisibleCell(panel: HTMLDivElement, cells: TreeCell[], row: number): TreeCell | null {
  let closestCell: TreeCell | null = null;
  let closestDistance = Infinity;

  for (const cell of cells) {
    if (!isTreeStoneVisible(panel, cell.row)) continue;

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
    <Button
      size="medium"
      disabled={disabled}
      danger={danger}
      type={type}
      icon={icon}
      title={title}
      onClick={onClick}
    />
  );
}

function MoveTreeRow({
  row,
  columns,
  cells,
  selectedPath,
  onSelectPath,
}: {
  row: number;
  columns: number;
  cells: TreeCell[];
  selectedPath: number[];
  onSelectPath: (path: number[]) => void;
}) {
  return (
    <>
      <div className="move-row-number">{row}</div>
      <div className="move-row-cells" style={{gridTemplateColumns: `repeat(${columns}, ${treeColumnStep}px)`}}>
        {cells.map((cell) => (
          <button
            key={cell.id}
            className={`move-tree-node ${cell.color === 'B' ? 'black' : cell.color === 'W' ? 'white' : 'root'} ${cell.isSetup ? 'setup' : ''} ${cell.isPass ? 'pass' : ''} ${cell.hasComment ? 'has-comment' : ''} ${cell.hasDrawing ? 'has-drawing' : ''} ${samePath(cell.path, selectedPath) ? 'selected' : ''}`}
            style={{gridColumn: cell.column + 1}}
            type="button"
            data-tree-node-id={cell.id}
            onClick={() => onSelectPath(cell.path)}
          >
            <span className="move-tree-node-text">{cell.text}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function ConnectorLayer({layout}: {layout: TreeLayout}) {
  const width = gutterWidth + layout.columns * treeColumnStep;
  const height = layout.rows.length * treeRowStep;

  return (
    <svg className="move-tree-connectors" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {layout.connectors.map((connector) => (
        <path key={connector.id} d={connectorPath(connector)} />
      ))}
    </svg>
  );
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

export function isSelectedPath(left: number[], right: number[]): boolean {
  return samePath(left, right);
}
