import {
  BackwardOutlined,
  BorderOutlined,
  CloseOutlined,
  DeleteOutlined,
  FastBackwardOutlined,
  FastForwardOutlined,
  FontSizeOutlined,
  ForwardOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import {Button, Input, Space} from 'antd';
import type React from 'react';
import {useTranslation} from 'react-i18next';
import type {ShortcutActionId} from '../shortcuts/keyboardShortcuts';
import type {EditorTool} from './types';

interface EditorToolbarProps {
  tool: EditorTool;
  nextColor: 'B' | 'W';
  canNavigatePrevious: boolean;
  canNavigateNext: boolean;
  canReplaceMove: boolean;
  showMarkup: boolean;
  labelText: string;
  shortcutLabels?: Partial<Record<ShortcutActionId, string>>;
  onToolChange: (tool: EditorTool) => void;
  onLabelTextChange: (value: string) => void;
  onAutoToolClick: () => void;
  onPass: () => void;
  onFirst: () => void;
  onPrevious10: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onNext10: () => void;
  onLast: () => void;
  extraEnd?: React.ReactNode;
}

export function EditorToolbar({
  tool,
  nextColor,
  canNavigatePrevious,
  canNavigateNext,
  canReplaceMove,
  showMarkup,
  labelText,
  shortcutLabels = {},
  onToolChange,
  onLabelTextChange,
  onAutoToolClick,
  onPass,
  onFirst,
  onPrevious10,
  onPrevious,
  onNext,
  onNext10,
  onLast,
  extraEnd,
}: EditorToolbarProps) {
  const {t} = useTranslation();

  return (
    <div className="editor-toolbar">
      <Button
        size="middle"
        icon={<PalmIcon />}
        title={withShortcut(t('shortcuts.actions.pass'), shortcutLabels.pass)}
        onClick={onPass}
      />
      <Space.Compact className="edit-tools">
        <ToolButton
          tool="auto"
          current={tool}
          title={withShortcut(t('shortcuts.actions.toolAuto'), shortcutLabels.toolAuto)}
          onToolChange={onToolChange}
        >
          <AutoPlayIcon nextColor={nextColor} onClick={onAutoToolClick} />
        </ToolButton>
        <ToolButton
          tool="black"
          current={tool}
          icon={<span className="tool-stone black" />}
          title={withShortcut(t('shortcuts.actions.toolBlack'), shortcutLabels.toolBlack)}
          onToolChange={onToolChange}
        />
        <ToolButton
          tool="white"
          current={tool}
          icon={<span className="tool-stone white" />}
          title={withShortcut(t('shortcuts.actions.toolWhite'), shortcutLabels.toolWhite)}
          onToolChange={onToolChange}
        />
        <ToolButton
          tool="replace"
          current={tool}
          icon={<SwapOutlined />}
          title={withShortcut(t('shortcuts.actions.replaceMove'), shortcutLabels.replaceMove)}
          danger
          disabled={!canReplaceMove}
          onToolChange={onToolChange}
        />
        {showMarkup && (
          <>
            <ToolButton
              className="label-tool"
              tool="alphabet"
              current={tool}
              icon={<FontSizeOutlined />}
              title={withShortcut(t('shortcuts.actions.addLabel'), shortcutLabels.addLabel)}
              onToolChange={onToolChange}
            >
              <Input
                size="small"
                className="label-input"
                value={labelText}
                aria-label={t('shortcuts.actions.addLabel')}
                onFocus={() => onToolChange('alphabet')}
                onChange={(event) => onLabelTextChange(event.target.value)}
              />
            </ToolButton>
            <ToolButton
              tool="circle"
              current={tool}
              icon={<CircleMarkerIcon />}
              title={withShortcut(t('shortcuts.actions.addCircle'), shortcutLabels.addCircle)}
              onToolChange={onToolChange}
            />
            <ToolButton
              tool="square"
              current={tool}
              icon={<BorderOutlined />}
              title={withShortcut(t('shortcuts.actions.addSquare'), shortcutLabels.addSquare)}
              onToolChange={onToolChange}
            />
            <ToolButton
              tool="triangle"
              current={tool}
              icon={<TriangleMarkerIcon />}
              title={withShortcut(t('shortcuts.actions.addTriangle'), shortcutLabels.addTriangle)}
              onToolChange={onToolChange}
            />
            <ToolButton
              tool="cross"
              current={tool}
              icon={<CloseOutlined />}
              title={withShortcut(t('shortcuts.actions.addCross'), shortcutLabels.addCross)}
              onToolChange={onToolChange}
            />
          </>
        )}
        <ToolButton
          tool="erase"
          current={tool}
          icon={<DeleteOutlined />}
          title={withShortcut(t('shortcuts.actions.eraseMarkup'), shortcutLabels.eraseMarkup)}
          onToolChange={onToolChange}
        />
      </Space.Compact>
      <Space.Compact className="navigation-tools">
        <NavButton
          title={t('nav.first')}
          disabled={!canNavigatePrevious}
          icon={<StepBackwardOutlined />}
          onClick={onFirst}
        />
        <NavButton
          title={t('nav.previous10')}
          disabled={!canNavigatePrevious}
          icon={<FastBackwardOutlined />}
          onClick={onPrevious10}
        />
        <NavButton
          title={withShortcut(t('shortcuts.actions.previousMove'), shortcutLabels.previousMove)}
          disabled={!canNavigatePrevious}
          icon={<BackwardOutlined />}
          onClick={onPrevious}
        />
        <NavButton
          title={withShortcut(t('shortcuts.actions.nextMoveCurrent'), shortcutLabels.nextMoveCurrent)}
          disabled={!canNavigateNext}
          icon={<ForwardOutlined />}
          onClick={onNext}
        />
        <NavButton
          title={t('nav.next10')}
          disabled={!canNavigateNext}
          icon={<FastForwardOutlined />}
          onClick={onNext10}
        />
        <NavButton title={t('nav.last')} disabled={!canNavigateNext} icon={<StepForwardOutlined />} onClick={onLast} />
      </Space.Compact>
      {extraEnd}
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

function NavButton({
  title,
  icon,
  disabled,
  onClick,
}: {
  title: string;
  icon: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return <Button size="medium" disabled={disabled} icon={icon} title={title} onClick={onClick} />;
}

function ToolButton({
  className,
  tool,
  current,
  icon,
  title,
  danger,
  disabled,
  children,
  onToolChange,
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
    >
      {children}
    </Button>
  );
}

function withShortcut(title: string, shortcut: string | undefined): string {
  return shortcut == null || shortcut === '' ? title : `${title} (${shortcut})`;
}
