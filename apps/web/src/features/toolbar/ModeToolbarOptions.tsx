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
    <span className="mode-toolbar-options">
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
                    <>
                      <StockOutlined /> {t('review')}
                    </>
                  ),
                },
              ]
            : []),
          {
            value: 'edit',
            label: (
              <>
                <EditOutlined /> {t('edit')}
              </>
            ),
          },
          {
            value: 'zen',
            label: (
              <>
                <EyeInvisibleOutlined /> {t('zen')}
              </>
            ),
          },
        ]}
      />
    </span>
  );
}
