import {
  FileAddOutlined,
  FileOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  PrinterOutlined,
  SaveOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import {Button, Dropdown, Space, type MenuProps} from 'antd';
import {boardSizes, type BoardSize} from '@ulugo/ui-shared';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {AppLanguage} from '../../app/localizationUtils';
import {LanguageDropdown} from '../../components/LanguageSelect';

interface AppMenuBarProps {
  showAiConfig: boolean;
  language: AppLanguage;
  onNew: (size: BoardSize) => void;
  onOpen: () => void;
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
  const [fileMenuOpen, setFileMenuOpen] = useState(false);

  function runFileMenuAction(action: () => void): void {
    setFileMenuOpen(false);
    action();
  }

  function clickableSubmenuLabel(label: string, action: () => void) {
    return (
      <span
        onClick={(event) => {
          event.stopPropagation();
          runFileMenuAction(action);
        }}
      >
        {label}
      </span>
    );
  }

  const fileMenuItems: MenuProps['items'] = [
    {
      key: 'new',
      icon: <FileAddOutlined />,
      label: clickableSubmenuLabel(t('new'), () => onNew(19)),
      children: boardSizes.map((size) => ({key: `new:${size}`, label: t(`new${size}`)})),
    },
    {
      key: 'open',
      icon: <FolderOpenOutlined />,
      label: clickableSubmenuLabel(t('open'), onOpen),
      children: [
        {key: 'open:file', label: t('open')},
        {key: 'open:sgfText', label: t('openFromSgfText')},
        {key: 'open:googleDrive', label: t('openFromGoogleDrive')},
      ],
    },
    {
      key: 'save',
      icon: <SaveOutlined />,
      label: clickableSubmenuLabel(t('save'), onSave),
      children: [
        {key: 'save:file', label: t('save')},
        {key: 'save:as', label: t('saveAs')},
        {key: 'save:clipboard', label: t('saveToClipboard')},
        {key: 'save:googleDrive', label: t('saveToGoogleDrive')},
      ],
    },
    {type: 'divider'},
    {key: 'print', icon: <PrinterOutlined />, label: t('print')},
  ];

  function handleFileMenuClick(info: {key: string}): void {
    if (info.key.startsWith('new:')) {
      runFileMenuAction(() => onNew(Number(info.key.split(':')[1]) as BoardSize));
    } else if (info.key === 'open:file') {
      runFileMenuAction(onOpen);
    } else if (info.key === 'open:sgfText') {
      runFileMenuAction(onOpenFromSgfText);
    } else if (info.key === 'open:googleDrive') {
      runFileMenuAction(onOpenFromGoogleDrive);
    } else if (info.key === 'save:file') {
      runFileMenuAction(onSave);
    } else if (info.key === 'save:as') {
      runFileMenuAction(onSaveAs);
    } else if (info.key === 'save:clipboard') {
      runFileMenuAction(onSaveToClipboard);
    } else if (info.key === 'save:googleDrive') {
      runFileMenuAction(onSaveToGoogleDrive);
    } else if (info.key === 'print') {
      runFileMenuAction(onPrint);
    }
  }

  return (
    <Space className="app-menu-buttons" wrap>
      <Dropdown
        menu={{items: fileMenuItems, onClick: handleFileMenuClick}}
        open={fileMenuOpen}
        trigger={['click']}
        onOpenChange={setFileMenuOpen}
      >
        <Button size="small" icon={<FileOutlined />}>
          {t('file')}
        </Button>
      </Dropdown>
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
