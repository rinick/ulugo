import {Button, Modal} from 'antd';
import {useTranslation} from 'react-i18next';

interface AppStatusModalsProps {
  googleDrivePending: 'open' | 'save' | null;
  kataGoAutotuningOpen: boolean;
  onCancelGoogleDrive: () => void;
  onCloseKataGoAutotuning: () => void;
}

export function AppStatusModals({
  googleDrivePending,
  kataGoAutotuningOpen,
  onCancelGoogleDrive,
  onCloseKataGoAutotuning,
}: AppStatusModalsProps) {
  const {t} = useTranslation();

  return (
    <>
      <Modal
        centered
        open={googleDrivePending != null}
        title={t('googleDrive')}
        footer={
          <Button size="small" onClick={onCancelGoogleDrive}>
            {t('cancel')}
          </Button>
        }
        closable={false}
        keyboard={false}
        maskClosable={false}
      >
        {googleDrivePending === 'open' ? t('googleDriveOpenWaiting') : t('googleDriveSaveWaiting')}
      </Modal>
      <Modal
        centered
        open={kataGoAutotuningOpen}
        title={t('katagoAutotuning')}
        footer={
          <Button size="small" type="primary" onClick={onCloseKataGoAutotuning}>
            {t('ok')}
          </Button>
        }
        closable={false}
        keyboard={false}
        maskClosable={false}
      >
        {t('katagoAutotuningMessage')}
      </Modal>
    </>
  );
}
