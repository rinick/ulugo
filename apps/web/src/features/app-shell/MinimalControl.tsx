import {CloseOutlined, EyeOutlined, FileAddOutlined} from '@ant-design/icons';
import {Button, Checkbox, Dropdown} from 'antd';
import type {MenuProps} from 'antd';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';

interface MinimalControlProps {
  nextColor: 'B' | 'W';
  showRightPanel: boolean;
  showBasicTools: boolean;
  showMoveNumber: boolean;
  showNextMove: boolean;
  showCoordinates: boolean;
  onShowRightPanelChange: (show: boolean) => void;
  onShowBasicToolsChange: (show: boolean) => void;
  onShowMoveNumberChange: (show: boolean) => void;
  onShowNextMoveChange: (show: boolean) => void;
  onShowCoordinatesChange: (show: boolean) => void;
  onNew: () => void;
  onQuit: () => void;
}

export function MinimalControl({
  nextColor,
  showRightPanel,
  showBasicTools,
  showMoveNumber,
  showNextMove,
  showCoordinates,
  onShowRightPanelChange,
  onShowBasicToolsChange,
  onShowMoveNumberChange,
  onShowNextMoveChange,
  onShowCoordinatesChange,
  onNew,
  onQuit,
}: MinimalControlProps) {
  const {t} = useTranslation();
  const [open, setOpen] = useState(false);
  const items: MenuProps['items'] = [
    checkboxItem('rightPanel', t('showRightPanel'), showRightPanel),
    checkboxItem('basicTools', t('showBasicTools'), showBasicTools),
    checkboxItem('moveNumber', t('moveNumber'), showMoveNumber),
    checkboxItem('nextMove', t('nextMove'), showNextMove),
    checkboxItem('coordinates', t('showCoordinates'), showCoordinates),
    {type: 'divider'},
    {key: 'new', icon: <FileAddOutlined />, label: t('newGame')},
    {key: 'quit', icon: <CloseOutlined />, label: t('quitMinimalMode')},
  ];

  return (
    <Dropdown
      open={open}
      classNames={{root: 'minimal-control-dropdown'}}
      onOpenChange={(nextOpen, info) => {
        if (!nextOpen && info.source === 'menu') return;
        setOpen(nextOpen);
      }}
      trigger={['click']}
      placement="bottomRight"
      menu={{
        items,
        onClick: ({key}) => {
          if (key === 'rightPanel') onShowRightPanelChange(!showRightPanel);
          if (key === 'basicTools') onShowBasicToolsChange(!showBasicTools);
          if (key === 'moveNumber') onShowMoveNumberChange(!showMoveNumber);
          if (key === 'nextMove') onShowNextMoveChange(!showNextMove);
          if (key === 'coordinates') onShowCoordinatesChange(!showCoordinates);
          if (key === 'new') {
            setOpen(false);
            onNew();
          }
          if (key === 'quit') {
            setOpen(false);
            onQuit();
          }
        },
      }}
    >
      <Button
        className={`minimal-control ${nextColor === 'B' ? 'black-next' : ''}`}
        shape="circle"
        size="large"
        icon={<EyeOutlined />}
        title={t('minimal')}
      />
    </Dropdown>
  );
}

function checkboxItem(key: string, label: string, checked: boolean): NonNullable<MenuProps['items']>[number] {
  return {
    key,
    label: (
      <Checkbox className="minimal-control-checkbox" checked={checked} onChange={() => undefined}>
        {label}
      </Checkbox>
    ),
  };
}
