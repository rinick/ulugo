import {Button, Modal, Space} from 'antd';
import {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  assignKeyboardShortcut,
  defaultKeyboardShortcuts,
  keyboardEventToShortcut,
  shortcutActions,
  shortcutLabel,
  type KeyboardShortcutConfig,
  type ShortcutActionId,
} from './keyboardShortcuts';

interface KeyboardShortcutsModalProps {
  open: boolean;
  shortcuts: KeyboardShortcutConfig;
  showElectronShortcuts: boolean;
  onApply: (shortcuts: KeyboardShortcutConfig) => void;
  onCancel: () => void;
}

export function KeyboardShortcutsModal({
  open,
  shortcuts,
  showElectronShortcuts,
  onApply,
  onCancel,
}: KeyboardShortcutsModalProps) {
  const {t} = useTranslation();
  const [draft, setDraft] = useState(shortcuts);
  const [recordingAction, setRecordingAction] = useState<ShortcutActionId | null>(null);
  const visibleActions = useMemo(
    () => shortcutActions.filter((action) => showElectronShortcuts || action.electronOnly !== true),
    [showElectronShortcuts]
  );

  useEffect(() => {
    if (!open) return;
    setDraft(shortcuts);
    setRecordingAction(null);
  }, [open, shortcuts]);

  useEffect(() => {
    if (!open || recordingAction == null) return;
    const actionId = recordingAction;

    function handleKeyDown(event: KeyboardEvent): void {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        setRecordingAction(null);
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        setDraft((current) => assignKeyboardShortcut(current, actionId, null));
        setRecordingAction(null);
        return;
      }

      const action = shortcutActions.find((item) => item.id === actionId);
      const shortcut = keyboardEventToShortcut(event, action?.navigation === true);
      if (shortcut == null) return;

      setDraft((current) => assignKeyboardShortcut(current, actionId, shortcut));
      setRecordingAction(null);
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, recordingAction]);

  return (
    <Modal
      centered
      title={t('keyboardShortcuts')}
      open={open}
      onCancel={onCancel}
      width={640}
      destroyOnHidden
      footer={
        <div className="keyboard-shortcuts-footer">
          <Button onClick={() => setDraft(defaultKeyboardShortcuts)}>{t('default')}</Button>
          <Space>
            <Button onClick={onCancel}>{t('cancel')}</Button>
            <Button type="primary" onClick={() => onApply(draft)}>
              {t('apply')}
            </Button>
          </Space>
        </div>
      }
    >
      <div className="keyboard-shortcuts-list">
        {visibleActions.map((action) => (
          <div className="keyboard-shortcuts-row" key={action.id}>
            <span className="keyboard-shortcuts-label">{t(action.labelKey)}</span>
            <Space.Compact>
              <Button className="keyboard-shortcuts-key" onClick={() => setRecordingAction(action.id)}>
                {recordingAction === action.id
                  ? t('pressShortcut')
                  : shortcutLabel(draft[action.id]) || t('unassigned')}
              </Button>
              <Button onClick={() => setDraft((current) => assignKeyboardShortcut(current, action.id, null))}>
                {t('clear')}
              </Button>
            </Space.Compact>
          </div>
        ))}
      </div>
    </Modal>
  );
}
