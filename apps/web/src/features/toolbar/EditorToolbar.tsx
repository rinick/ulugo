import {SwapOutlined} from '@ant-design/icons';
import {Button, Space} from 'antd';
import type React from 'react';
import {useTranslation} from 'react-i18next';
import type {ShortcutActionId} from '../shortcuts/keyboardShortcuts';
import type {EditorTool} from './types';

interface EditorToolbarProps {
  tool: EditorTool;
  nextColor: 'B' | 'W';
  canReplaceMove: boolean;
  showSetupTools?: boolean;
  shortcutLabels?: Partial<Record<ShortcutActionId, string>>;
  onToolChange: (tool: EditorTool) => void;
  onAutoToolClick: () => void;
  onPass: () => void;
}

export function EditorToolbar({
  tool,
  nextColor,
  canReplaceMove,
  showSetupTools = true,
  shortcutLabels = {},
  onToolChange,
  onAutoToolClick,
  onPass,
}: EditorToolbarProps) {
  const {t} = useTranslation();

  return (
    <div className="play-edit-tools">
      <Button
        className="pass-tool"
        size="middle"
        icon={<PalmIcon />}
        title={withShortcut(t('pass'), shortcutLabels.pass)}
        onClick={onPass}
      />
      <Space.Compact className="edit-tools">
        <ToolButton
          tool="auto"
          current={tool}
          title={withShortcut(t('autoPlay'), shortcutLabels.toolAuto)}
          onToolChange={onToolChange}
        >
          <AutoPlayIcon nextColor={nextColor} onClick={onAutoToolClick} />
        </ToolButton>
        {showSetupTools ? (
          <>
            <ToolButton
              tool="black"
              current={tool}
              icon={<span className="tool-stone black" />}
              title={withShortcut(t('placeBlackStone'), shortcutLabels.toolBlack)}
              onToolChange={onToolChange}
            />
            <ToolButton
              tool="white"
              current={tool}
              icon={<span className="tool-stone white" />}
              title={withShortcut(t('placeWhiteStone'), shortcutLabels.toolWhite)}
              onToolChange={onToolChange}
            />
          </>
        ) : null}
        <ToolButton
          tool="replace"
          current={tool}
          icon={<SwapOutlined />}
          title={withShortcut(t('replaceMove'), shortcutLabels.replaceMove)}
          disabled={!canReplaceMove}
          onToolChange={onToolChange}
        />
      </Space.Compact>
    </div>
  );
}

function AutoPlayIcon({nextColor, onClick}: {nextColor: 'B' | 'W'; onClick: () => void}) {
  return (
    <span
      className={`auto-tool-icon ${nextColor === 'B' ? 'black-next' : 'white-next'}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <span className="auto-stone auto-stone-white" />
      <span className="auto-stone auto-stone-black" />
    </span>
  );
}

function PalmIcon() {
  return (
    <svg className="palm-icon" viewBox="0 0 24 24">
      <path d="M8 11V6.5a1.2 1.2 0 0 1 2.4 0V11" />
      <path d="M10.4 11V4.5a1.2 1.2 0 0 1 2.4 0V11" />
      <path d="M12.8 11V5.5a1.2 1.2 0 0 1 2.4 0V12" />
      <path d="M15.2 12V8a1.2 1.2 0 0 1 2.4 0v5.8c0 4-2.3 6.2-5.7 6.2h-.8c-2.4 0-4-1.1-5.2-3.1L4 13.6a1.35 1.35 0 0 1 2.3-1.4L8 14.4V11" />
    </svg>
  );
}

export function ToolButton({
  className,
  tool,
  current,
  icon,
  title,
  danger,
  disabled,
  children,
  onToolChange,
  onDoubleClick,
}: {
  className?: string;
  tool: EditorTool;
  current: EditorTool;
  icon?: React.ReactNode;
  title: string;
  danger?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
  onToolChange: (tool: EditorTool) => void;
  onDoubleClick?: () => void;
}) {
  return (
    <Button
      className={className}
      size="middle"
      type={tool === current ? 'primary' : 'default'}
      danger={danger}
      disabled={disabled}
      icon={icon}
      title={title}
      onClick={() => onToolChange(tool)}
      onDoubleClick={onDoubleClick}
    >
      {children}
    </Button>
  );
}

export function withShortcut(title: string, shortcut: string | undefined): string {
  return shortcut == null || shortcut === '' ? title : `${title} (${shortcut})`;
}
