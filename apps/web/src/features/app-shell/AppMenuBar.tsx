import {
  FileAddOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  SaveOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import {Button, Dropdown, Space} from 'antd';
import {boardSizes, type BoardSize} from '@ulugo/ui-shared';
import {useTranslation} from 'react-i18next';

interface AppMenuBarProps {
  showAiConfig: boolean;
  onNew: (size: BoardSize) => void;
  onOpen: () => void;
  onOpenFromSgfText: () => void;
  onOpenFromGoogleDrive: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onSaveToClipboard: () => void;
  onSaveToGoogleDrive: () => void;
  onGameInfo: () => void;
  onAiConfig: () => void;
  onSettings: () => void;
}

export function AppMenuBar({
  showAiConfig,
  onNew,
  onOpen,
  onOpenFromSgfText,
  onOpenFromGoogleDrive,
  onSave,
  onSaveAs,
  onSaveToClipboard,
  onSaveToGoogleDrive,
  onGameInfo,
  onAiConfig,
  onSettings,
}: AppMenuBarProps) {
  const {t} = useTranslation();

  return (
    <Space className="app-menu-buttons" wrap>
      <Dropdown.Button
        size="small"
        icon={<FileAddOutlined />}
        menu={{
          items: boardSizes.map((size) => ({key: String(size), label: t(`new${size}`)})),
          onClick: (info) => onNew(Number(info.key) as BoardSize),
        }}
        onClick={() => onNew(19)}
      >
        {t('new')}
      </Dropdown.Button>
      <Dropdown.Button
        size="small"
        icon={<FolderOpenOutlined />}
        menu={{
          items: [
            {key: 'sgfText', label: t('openFromSgfText')},
            {key: 'googleDrive', label: t('openFromGoogleDrive')},
          ],
          onClick: (info) => {
            if (info.key === 'sgfText') {
              onOpenFromSgfText();
            } else if (info.key === 'googleDrive') {
              onOpenFromGoogleDrive();
            }
          },
        }}
        onClick={onOpen}
      >
        {t('open')}
      </Dropdown.Button>
      <Dropdown.Button
        size="small"
        icon={<SaveOutlined />}
        menu={{
          items: [
            {key: 'saveAs', label: t('saveAs')},
            {key: 'clipboard', label: t('saveToClipboard')},
            {key: 'googleDrive', label: t('saveToGoogleDrive')},
          ],
          onClick: (info) => {
            if (info.key === 'saveAs') {
              onSaveAs();
            } else if (info.key === 'clipboard') {
              onSaveToClipboard();
            } else if (info.key === 'googleDrive') {
              onSaveToGoogleDrive();
            }
          },
        }}
        onClick={onSave}
      >
        {t('save')}
      </Dropdown.Button>
      <Button size="small" icon={<InfoCircleOutlined />} onClick={onGameInfo}>
        {t('gameInfo')}
      </Button>
      {showAiConfig ? (
        <Button size="small" icon={<ToolOutlined />} onClick={onAiConfig}>
          {t('aiConfig')}
        </Button>
      ) : null}
      <Button size="small" icon={<SettingOutlined />} onClick={onSettings}>
        {t('settings')}
      </Button>
    </Space>
  );
}
