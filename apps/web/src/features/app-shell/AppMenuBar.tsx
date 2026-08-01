import {
  CameraOutlined,
  FileAddOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  PrinterOutlined,
  SaveOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import {Button, Dropdown, Space, type MenuProps} from 'antd';
import {boardSizes, type BoardSize} from '@ulugo/ui-shared';
import {useTranslation} from 'react-i18next';
import type {AppLanguage} from '../../app/localizationUtils';
import {LanguageDropdown} from '../../components/LanguageSelect';

interface AppMenuBarProps {
  showAiConfig: boolean;
  language: AppLanguage;
  onNew: (size: BoardSize) => void;
  onOpen: () => void;
  onOpenFromCamera: () => void;
  onOpenFromSgfText: () => void;
  onOpenFromGoogleDrive: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onSaveToClipboard: () => void;
  onSaveToGoogleDrive: () => void;
  onPrint: () => void;
  onGameInfo: () => void;
  onAiConfig: () => void;
  onSettings: () => void;
  onLanguageChange: (language: AppLanguage) => void;
}

export function AppMenuBar({
  showAiConfig,
  language,
  onNew,
  onOpen,
  onOpenFromCamera,
  onOpenFromSgfText,
  onOpenFromGoogleDrive,
  onSave,
  onSaveAs,
  onSaveToClipboard,
  onSaveToGoogleDrive,
  onPrint,
  onGameInfo,
  onAiConfig,
  onSettings,
  onLanguageChange,
}: AppMenuBarProps) {
  const {t} = useTranslation();

  const openMenuItems: MenuProps['items'] = [
    {
      key: 'new',
      icon: <FileAddOutlined />,
      label: t('new'),
      children: boardSizes.map((size) => ({key: `new:${size}`, label: t(`new${size}`)})),
    },
    {key: 'open:camera', icon: <CameraOutlined />, label: t('openFromCamera')},
    {key: 'open:sgfText', label: t('openFromSgfText')},
    {key: 'open:googleDrive', label: t('openFromGoogleDrive')},
  ];

  const saveMenuItems: MenuProps['items'] = [
    {key: 'save:as', label: t('saveAs')},
    {key: 'save:clipboard', label: t('saveToClipboard')},
    {key: 'save:googleDrive', label: t('saveToGoogleDrive')},
    {type: 'divider'},
    {key: 'print', icon: <PrinterOutlined />, label: t('print')},
  ];

  function handleMenuClick(info: {key: string}): void {
    if (info.key.startsWith('new:')) {
      onNew(Number(info.key.split(':')[1]) as BoardSize);
    } else if (info.key === 'open:sgfText') {
      onOpenFromSgfText();
    } else if (info.key === 'open:camera') {
      onOpenFromCamera();
    } else if (info.key === 'open:googleDrive') {
      onOpenFromGoogleDrive();
    } else if (info.key === 'save:as') {
      onSaveAs();
    } else if (info.key === 'save:clipboard') {
      onSaveToClipboard();
    } else if (info.key === 'save:googleDrive') {
      onSaveToGoogleDrive();
    } else if (info.key === 'print') {
      onPrint();
    }
  }

  return (
    <Space className="app-menu-buttons" wrap>
      <Dropdown.Button size="small" menu={{items: openMenuItems, onClick: handleMenuClick}} onClick={onOpen}>
        <FolderOpenOutlined />
        {t('open')}
      </Dropdown.Button>
      <Dropdown.Button size="small" menu={{items: saveMenuItems, onClick: handleMenuClick}} onClick={onSave}>
        <SaveOutlined />
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
      <LanguageDropdown ariaLabel={t('language')} size="small" value={language} onChange={onLanguageChange} />
    </Space>
  );
}
