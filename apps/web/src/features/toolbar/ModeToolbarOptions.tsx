import {EditOutlined, EyeInvisibleOutlined, StockOutlined} from '@ant-design/icons';
import {Radio} from 'antd';
import type {AnalysisSettings} from '@ulugo/analysis-core';
import {useTranslation} from 'react-i18next';

interface ModeToolbarOptionsProps {
  katagoEnabled: boolean;
  mode: AnalysisSettings['mode'];
  onChange: (mode: AnalysisSettings['mode']) => void;
}

export function ModeToolbarOptions({katagoEnabled, mode, onChange}: ModeToolbarOptionsProps) {
  const {t} = useTranslation();

  return (
    <div className="mode-toolbar-options">
      <span>{t('mode')}</span>
      <Radio.Group
        size="medium"
        optionType="button"
        value={mode}
        onChange={(event) => onChange(event.target.value as AnalysisSettings['mode'])}
        options={[
          ...(katagoEnabled
            ? [
                {
                  value: 'review',
                  label: (
                    <span className="mode-button-content">
                      <StockOutlined /> {t('review')}
                    </span>
                  ),
                },
              ]
            : []),
          {
            value: 'edit',
            label: (
              <span className="mode-button-content">
                <EditOutlined /> {t('edit')}
              </span>
            ),
          },
          {
            value: 'zen',
            label: (
              <span className="mode-button-content">
                <EyeInvisibleOutlined /> {t('zen')}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
