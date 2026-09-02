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
import {useTranslation} from 'react-i18next';
import type {AppLanguage} from '../../app/localizationUtils';
import {LanguageDropdown} from '../../components/LanguageSelect';

export type BoardSize = 9 | 13 | 19;

const boardSizes: BoardSize[] = [19, 13, 9];

interface AppMenuBarProps {
  showAiConfig: boolean;
  showCameraOpen: boolean;
  showRecentFiles: boolean;
  remoteSgfSources: Array<{id: string; label: string}>;
  recentFiles: Array<{filePath: string; fileName: string}>;
  language: AppLanguage;
  onNew: (size: BoardSize) => void;
  onOpen: () => void;
  onOpenRecent: (filePath: string) => void;
  onOpenFromCamera: () => void;
  onOpenRemoteSgf: (sourceId: string) => void;
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
  showCameraOpen,
  showRecentFiles,
  remoteSgfSources,
  recentFiles,
  language,
  onNew,
  onOpen,
  onOpenRecent,
  onOpenFromCamera,
  onOpenRemoteSgf,
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
    ...(showRecentFiles
      ? [
          {
            key: 'open:recent',
            label: t('recent'),
            children:
              recentFiles.length > 0
                ? recentFiles.map((file, index) => ({
                    key: `open:recent:${index}`,
                    label: <span title={file.filePath}>{file.fileName}</span>,
                  }))
                : [{key: 'open:recent:empty', label: t('noRecentFiles'), disabled: true}],
          },
        ]
      : []),
    ...(showCameraOpen ? [{key: 'open:camera', icon: <CameraOutlined />, label: t('openFromCamera')}] : []),
    {key: 'open:sgfText', label: t('openFromSgfText')},
    {type: 'divider'},
    ...remoteSgfSources.map((source) => ({key: `open:remote:${source.id}`, label: source.label})),
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
    } else if (info.key.startsWith('open:recent:') && info.key !== 'open:recent:empty') {
      const file = recentFiles[Number(info.key.split(':')[2])];
      if (file != null) onOpenRecent(file.filePath);
    } else if (info.key === 'open:sgfText') {
      onOpenFromSgfText();
    } else if (info.key === 'open:camera') {
      onOpenFromCamera();
    } else if (info.key.startsWith('open:remote:')) {
      onOpenRemoteSgf(info.key.slice('open:remote:'.length));
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
