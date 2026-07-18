import {Button, Checkbox, Modal, Space} from 'antd';
import {useEffect, useState, type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';

interface TipsDialogProps {
  open: boolean;
  tips: ReactNode[];
  showTipsOnStartup: boolean;
  onShowTipsOnStartupChange: (showTipsOnStartup: boolean) => void;
  onClose: () => void;
}

export function TipsDialog({open, tips, showTipsOnStartup, onShowTipsOnStartupChange, onClose}: TipsDialogProps) {
  const {t} = useTranslation();
  const [index, setIndex] = useState(0);
  const title = `${t('tips')} ${tips.length === 0 ? '0/0' : `${index + 1}/${tips.length}`}`;

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  return (
    <Modal
      centered
      className="tips-dialog"
      title={title}
      open={open}
      width={360}
      onCancel={onClose}
      footer={
        <div className="tips-dialog-footer">
          <Checkbox
            checked={!showTipsOnStartup}
            onChange={(event) => onShowTipsOnStartupChange(!event.target.checked)}
          >
            {t('doNotShowAgain')}
          </Checkbox>
          <Space>
            <Button onClick={onClose}>{t('close')}</Button>
            <Button
              type="primary"
              disabled={tips.length === 0}
              onClick={() => setIndex((current) => (current + 1) % tips.length)}
            >
              {t('nextTip')}
            </Button>
          </Space>
        </div>
      }
    >
      <div className="tips-dialog-content">{tips[index] ?? null}</div>
    </Modal>
  );
}
