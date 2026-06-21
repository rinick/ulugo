import {
  BackwardOutlined,
  FastBackwardOutlined,
  FastForwardOutlined,
  ForwardOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
} from '@ant-design/icons';
import {Button, Space} from 'antd';
import type React from 'react';
import {useTranslation} from 'react-i18next';
import type {ShortcutActionId} from '../shortcuts/keyboardShortcuts';

interface NavigationToolbarProps {
  canNavigatePrevious: boolean;
  canNavigateNext: boolean;
  shortcutLabels?: Partial<Record<ShortcutActionId, string>>;
  onFirst: () => void;
  onPrevious10: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onNext10: () => void;
  onLast: () => void;
}

export function NavigationToolbar({
  canNavigatePrevious,
  canNavigateNext,
  shortcutLabels = {},
  onFirst,
  onPrevious10,
  onPrevious,
  onNext,
  onNext10,
  onLast,
}: NavigationToolbarProps) {
  const {t} = useTranslation();

  return (
    <Space.Compact className="navigation-tools">
      <NavButton
        title={t('firstMove')}
        disabled={!canNavigatePrevious}
        icon={<StepBackwardOutlined />}
        onClick={onFirst}
      />
      <NavButton
        title={t('previous10Moves')}
        disabled={!canNavigatePrevious}
        icon={<FastBackwardOutlined />}
        onClick={onPrevious10}
      />
      <NavButton
        title={withShortcut(t('previousMove'), shortcutLabels.previousMove)}
        disabled={!canNavigatePrevious}
        icon={<BackwardOutlined />}
        onClick={onPrevious}
      />
      <NavButton
        title={withShortcut(t('nextMoveCurrent'), shortcutLabels.nextMoveCurrent)}
        disabled={!canNavigateNext}
        icon={<ForwardOutlined />}
        onClick={onNext}
      />
      <NavButton
        title={t('next10Moves')}
        disabled={!canNavigateNext}
        icon={<FastForwardOutlined />}
        onClick={onNext10}
      />
      <NavButton title={t('lastMove')} disabled={!canNavigateNext} icon={<StepForwardOutlined />} onClick={onLast} />
    </Space.Compact>
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

function withShortcut(title: string, shortcut: string | undefined): string {
  return shortcut == null || shortcut === '' ? title : `${title} (${shortcut})`;
}
