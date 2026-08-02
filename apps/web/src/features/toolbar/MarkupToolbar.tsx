import {BorderOutlined, CloseOutlined, DeleteOutlined, FontSizeOutlined} from '@ant-design/icons';
import {Input, Space} from 'antd';
import {useTranslation} from 'react-i18next';
import type {ShortcutActionId} from '../shortcuts/keyboardShortcuts';
import {ToolButton, withShortcut} from './EditorToolbar';
import type {EditorTool} from './types';

interface MarkupToolbarProps {
  tool: EditorTool;
  labelText: string;
  shortcutLabels?: Partial<Record<ShortcutActionId, string>>;
  onToolChange: (tool: EditorTool) => void;
  onLabelTextChange: (value: string) => void;
  onEraseAllMarkup: () => void;
}

export function MarkupToolbar({
  tool,
  labelText,
  shortcutLabels = {},
  onToolChange,
  onLabelTextChange,
  onEraseAllMarkup,
}: MarkupToolbarProps) {
  const {t} = useTranslation();

  return (
    <Space.Compact className="markup-tools">
      <ToolButton
        className="label-tool"
        tool="alphabet"
        current={tool}
        icon={<FontSizeOutlined />}
        title={withShortcut(t('addLabel'), shortcutLabels.addLabel)}
        onToolChange={onToolChange}
      >
        <Input
          size="small"
          className="label-input"
          value={labelText}
          aria-label={t('addLabel')}
          onFocus={() => onToolChange('alphabet')}
          onChange={(event) => onLabelTextChange(event.target.value)}
        />
      </ToolButton>
      <ToolButton
        tool="circle"
        current={tool}
        icon={<CircleMarkerIcon />}
        title={withShortcut(t('addCircle'), shortcutLabels.addCircle)}
        onToolChange={onToolChange}
      />
      <ToolButton
        tool="square"
        current={tool}
        icon={<BorderOutlined />}
        title={withShortcut(t('addSquare'), shortcutLabels.addSquare)}
        onToolChange={onToolChange}
      />
      <ToolButton
        tool="triangle"
        current={tool}
        icon={<TriangleMarkerIcon />}
        title={withShortcut(t('addTriangle'), shortcutLabels.addTriangle)}
        onToolChange={onToolChange}
      />
      <ToolButton
        tool="cross"
        current={tool}
        icon={<CloseOutlined />}
        title={withShortcut(t('addCross'), shortcutLabels.addCross)}
        onToolChange={onToolChange}
      />
      <ToolButton
        tool="erase"
        current={tool}
        icon={<DeleteOutlined />}
        title={`${withShortcut(t('eraseMarkup'), shortcutLabels.eraseMarkup)}\n${t('eraseAllMarkupHint')}`}
        onToolChange={onToolChange}
        onDoubleClick={onEraseAllMarkup}
      />
    </Space.Compact>
  );
}

function CircleMarkerIcon() {
  return (
    <span className="anticon">
      <svg viewBox="0 0 1024 1024" width="1em" height="1em" fill="none" aria-hidden="true" focusable="false">
        <circle cx="512" cy="512" r="419" stroke="currentColor" strokeWidth="72" />
      </svg>
    </span>
  );
}

function TriangleMarkerIcon() {
  return (
    <span className="anticon">
      <svg viewBox="0 0 1024 1024" width="1em" height="1em" fill="none" aria-hidden="true" focusable="false">
        <path d="M512 120 912 856H112L512 120Z" stroke="currentColor" strokeWidth="72" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
