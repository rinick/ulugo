import {CheckCircleFilled, CloseOutlined, FieldBinaryOutlined} from '@ant-design/icons';
import {Checkbox, Segmented, Space} from 'antd';
import {useTranslation} from 'react-i18next';
import type {AnalysisSettings} from '@ulugo/analysis-core';

interface AnalysisToolbarOptionsProps {
  katagoEnabled: boolean;
  analysisSettings: AnalysisSettings;
  stoneOverlayDisplay: AnalysisSettings['stoneOverlay'];
  onSettingsChange: (values: Partial<AnalysisSettings>) => void;
}

export function AnalysisToolbarOptions({
  katagoEnabled,
  analysisSettings,
  stoneOverlayDisplay,
  onSettingsChange,
}: AnalysisToolbarOptionsProps) {
  const {t} = useTranslation();

  return (
    <Space className="analysis-toolbar-options">
      <span className="analysis-toolbar-option-group">
        <span>{t('stoneOverlay')}</span>
        <Segmented
          size="medium"
          shape="round"
          value={stoneOverlayDisplay}
          onChange={(value) => onSettingsChange({stoneOverlay: value as AnalysisSettings['stoneOverlay']})}
          options={
            katagoEnabled
              ? [
                  {value: 'dot', icon: <CheckCircleFilled />, tooltip: {title: t('analysis')}},
                  {
                    value: 'number',
                    label: (
                      <span style={{fontSize: 16}}>
                        <FieldBinaryOutlined />
                      </span>
                    ),
                    tooltip: {title: t('moveNumber')},
                  },
                  {value: 'none', icon: <CloseOutlined />, tooltip: {title: t('none')}},
                ]
              : [
                  {
                    value: 'number',
                    icon: <FieldBinaryOutlined />,
                    tooltip: {title: t('moveNumber')},
                  },
                  {value: 'none', icon: <CloseOutlined />, tooltip: {title: t('none')}},
                ]
          }
        />
      </span>
      <Checkbox
        checked={analysisSettings.showMarkup}
        onChange={(event) => onSettingsChange({showMarkup: event.target.checked})}
      >
        {t('showMarkup')}
      </Checkbox>
      <Checkbox
        checked={analysisSettings.showNextMove}
        onChange={(event) => onSettingsChange({showNextMove: event.target.checked})}
      >
        {t('nextMove')}
      </Checkbox>
      {katagoEnabled ? (
        <Checkbox
          checked={analysisSettings.showExpectedTerritory}
          onChange={(event) => onSettingsChange({showExpectedTerritory: event.target.checked})}
        >
          {t('territory')}
        </Checkbox>
      ) : null}
    </Space>
  );
}
