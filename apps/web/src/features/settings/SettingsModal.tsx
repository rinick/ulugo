import {MoonOutlined, QuestionCircleOutlined, ReloadOutlined, SunOutlined} from '@ant-design/icons';
import {Button, Form, InputNumber, Modal, Radio, Select, Slider, Switch, message} from 'antd';
import {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {defaultAnalysisSettings, type AnalysisSettings} from '@ulugo/analysis-core';
import {normalizeAnalysisSettings} from '../../app/analysisSettingsStorage';
import type {AppLanguage} from '../../app/localizationUtils';
import {openExternalUrl} from '../../app/openExternalUrl';
import {LanguageSelect} from '../../components/LanguageSelect';
import {Select12} from '../../components/Select12';

interface SettingsModalProps {
  open: boolean;
  settings: AnalysisSettings;
  language: AppLanguage;
  uiScale: number;
  darkMode: boolean;
  showCoordinates: boolean;
  playStoneSound: boolean;
  openLastSgfOnStartup: boolean;
  showTipsOnStartup: boolean;
  showKataGoAnalysisSettings?: boolean;
  onCancel: () => void;
  onAnalysisSettingsChange: (settings: AnalysisSettings) => void;
  onLanguageChange: (language: AppLanguage) => void;
  onUiScaleChange: (uiScale: number) => void;
  onDarkModeChange: (darkMode: boolean) => void;
  onShowCoordinatesChange: (showCoordinates: boolean) => void;
  onPlayStoneSoundChange: (playStoneSound: boolean) => void;
  onOpenLastSgfOnStartupChange: (openLastSgfOnStartup: boolean) => void;
  onShowTipsOnStartupChange: (showTipsOnStartup: boolean) => void;
  onKeyboardShortcutsClick: () => void;
}

export function SettingsModal({
  open,
  settings,
  language,
  uiScale,
  darkMode,
  showCoordinates,
  playStoneSound,
  openLastSgfOnStartup,
  showTipsOnStartup,
  showKataGoAnalysisSettings = false,
  onCancel,
  onAnalysisSettingsChange,
  onLanguageChange,
  onUiScaleChange,
  onDarkModeChange,
  onShowCoordinatesChange,
  onPlayStoneSoundChange,
  onOpenLastSgfOnStartupChange,
  onShowTipsOnStartupChange,
  onKeyboardShortcutsClick,
}: SettingsModalProps) {
  const {t} = useTranslation();
  const [form] = Form.useForm<AnalysisSettings>();
  const [loading, setLoading] = useState(false);
  const [minVisitsDraft, setMinVisitsDraft] = useState(defaultAnalysisSettings.minVisits);
  const [uiScaleDraft, setUiScaleDraft] = useState(uiScale);

  useEffect(() => setUiScaleDraft(uiScale), [uiScale]);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({...defaultAnalysisSettings, ...settings});
    setMinVisitsDraft(settings.minVisits);
  }, [form, open, settings]);

  useEffect(() => {
    if (!open) return;
    if (!showKataGoAnalysisSettings || window.ulugo == null) return;

    let active = true;
    setLoading(true);
    window.ulugo.analysis
      .getSettings()
      .then((settings) => {
        if (!active) return;
        const next = normalizeAnalysisSettings(settings, true);
        form.setFieldsValue(next);
        setMinVisitsDraft(next.minVisits);
        onAnalysisSettingsChange(next);
      })
      .catch((error: unknown) =>
        message.error(error instanceof Error ? error.message : t('analysisSettingsLoadFailed'))
      )
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [form, onAnalysisSettingsChange, open, showKataGoAnalysisSettings, t]);

  function updateSettings(values: Partial<AnalysisSettings>): void {
    onAnalysisSettingsChange({...defaultAnalysisSettings, ...settings, ...values});
  }

  function commitMinVisits(): void {
    const minVisits = Math.max(1, Number(minVisitsDraft) || defaultAnalysisSettings.minVisits);
    setMinVisitsDraft(minVisits);
    form.setFieldValue('minVisits', minVisits);
    updateSettings({minVisits});
  }

  function openHelp(): void {
    openExternalUrl(`https://deepmess.com/${language}/ulugo/`);
  }

  return (
    <Modal
      centered
      title={t('settings')}
      open={open}
      onCancel={onCancel}
      footer={
        <div className="app-settings-footer">
          <Button icon={<QuestionCircleOutlined />} onClick={openHelp}>
            {t('help')}
          </Button>
          <Button type="primary" onClick={onCancel}>
            {t('close')}
          </Button>
        </div>
      }
      width={420}
      destroyOnHidden
    >
      <Button block onClick={onKeyboardShortcutsClick}>
        {t('keyboardShortcuts')}
      </Button>
      <Form form={form} layout="vertical" disabled={loading} initialValues={defaultAnalysisSettings}>
        <Form.Item label={t('language')}>
          <LanguageSelect size="small" value={language} onChange={onLanguageChange} />
        </Form.Item>
        <Form.Item label={t('uiScale')}>
          <div className="app-settings-scale-row">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              title={t('resetUiScale')}
              aria-label={t('resetUiScale')}
              onClick={() => {
                setUiScaleDraft(100);
                onUiScaleChange(100);
              }}
            />
            <Slider
              min={25}
              max={400}
              step={5}
              value={uiScaleDraft}
              onChange={setUiScaleDraft}
              onChangeComplete={onUiScaleChange}
            />
            <InputNumber
              size="small"
              min={25}
              max={400}
              value={uiScaleDraft}
              addonAfter="%"
              onChange={(value) => {
                if (value == null) return;
                setUiScaleDraft(value);
                onUiScaleChange(value);
              }}
            />
          </div>
        </Form.Item>
        <Form.Item>
          <div className="app-settings-appearance-row">
            <div className="app-settings-appearance-option">
              <span>{t('theme')}</span>
              <Radio.Group
                size="small"
                value={darkMode ? 'dark' : 'light'}
                onChange={(event) => onDarkModeChange(event.target.value === 'dark')}
              >
                <Radio.Button value="light" title={t('lightMode')} aria-label={t('lightMode')}>
                  <SunOutlined />
                </Radio.Button>
                <Radio.Button value="dark" title={t('darkMode')} aria-label={t('darkMode')}>
                  <MoonOutlined />
                </Radio.Button>
              </Radio.Group>
            </div>
            <div className="app-settings-appearance-option">
              <span>{t('boardBackground')}</span>
              <Select
                size="small"
                value={settings.boardBackground}
                onChange={(value) => updateSettings({boardBackground: value as AnalysisSettings['boardBackground']})}
                options={[
                  ...(showKataGoAnalysisSettings ? [{value: 'auto', label: t('auto')}] : []),
                  {value: 'golden', label: t('golden')},
                  {value: 'natural', label: t('natural')},
                  {value: 'flat', label: t('flat')},
                ]}
              />
            </div>
          </div>
        </Form.Item>
        <Form.Item>
          <div className="app-settings-row">
            <span>{t('showCoordinates')}</span>
            <Switch size="small" checked={showCoordinates} onChange={onShowCoordinatesChange} />
          </div>
        </Form.Item>
        <Form.Item>
          <div className="app-settings-row">
            <span>{t('playStoneSound')}</span>
            <Switch size="small" checked={playStoneSound} onChange={onPlayStoneSoundChange} />
          </div>
        </Form.Item>
        <Form.Item>
          <div className="app-settings-row">
            <span>{t('openLastSgfOnStartup')}</span>
            <Switch size="small" checked={openLastSgfOnStartup} onChange={onOpenLastSgfOnStartupChange} />
          </div>
        </Form.Item>
        <Form.Item>
          <div className="app-settings-row">
            <span>{t('showTipsOnStartup')}</span>
            <Switch size="small" checked={showTipsOnStartup} onChange={onShowTipsOnStartupChange} />
          </div>
        </Form.Item>
        <Form.Item>
          <div className="app-settings-row">
            <span>{t('autoIncrementMarkupText')}</span>
            <Switch
              size="small"
              checked={settings.autoIncrementMarkupText}
              onChange={(checked) => updateSettings({autoIncrementMarkupText: checked})}
            />
          </div>
        </Form.Item>
        {showKataGoAnalysisSettings ? (
          <>
            <Form.Item>
              <div className="app-settings-row">
                <span>{t('autoAnalyze')}</span>
                <Switch
                  size="small"
                  checked={settings.autoAnalyze}
                  onChange={(checked) => updateSettings({autoAnalyze: checked})}
                />
              </div>
            </Form.Item>
            <Form.Item label={t('topMoveOverlay')}>
              <Select12
                size="small"
                value={settings.moveDisplay}
                onChange={(value) => updateSettings({moveDisplay: value})}
                options={[
                  {value: 'scoreChange', label: t('scoreChange')},
                  {value: 'winRateChange', label: t('winRateChange')},
                  {value: 'score', label: t('score')},
                  {value: 'visits', label: t('visits')},
                  {value: 'value', label: t('value')},
                ]}
              />
            </Form.Item>
            <Form.Item label={t('minVisitsForTopMoveOverlay')}>
              <InputNumber
                size="small"
                min={1}
                value={minVisitsDraft}
                onChange={(value) => setMinVisitsDraft(Number(value) || defaultAnalysisSettings.minVisits)}
                onBlur={commitMinVisits}
                onPressEnter={commitMinVisits}
              />
            </Form.Item>
            <Form.Item label={t('intensityDisplayLimit')}>
              <InputNumber
                size="small"
                min={1}
                precision={0}
                value={settings.intensityDisplayLimit}
                onChange={(value) => {
                  const numberValue = Number(value);
                  updateSettings({
                    intensityDisplayLimit: Number.isFinite(numberValue)
                      ? Math.max(1, Math.round(numberValue))
                      : defaultAnalysisSettings.intensityDisplayLimit,
                  });
                }}
              />
            </Form.Item>
            <Form.Item label={t('pvPreviewDelay')}>
              <div className="app-settings-inline-help-row">
                <InputNumber
                  size="small"
                  min={0}
                  max={2}
                  step={0.1}
                  value={settings.pvPreviewDelay}
                  addonAfter="s"
                  onChange={(value) => {
                    const numberValue = Number(value);
                    updateSettings({
                      pvPreviewDelay: Number.isFinite(numberValue)
                        ? Math.max(0, Math.min(2, numberValue))
                        : defaultAnalysisSettings.pvPreviewDelay,
                    });
                  }}
                />
                <span className="app-settings-inline-help">{t('pvPreviewDelayZeroHelp')}</span>
              </div>
            </Form.Item>
          </>
        ) : null}
        <Form.Item label={t('stoneOverlayCount')}>
          <Select
            size="small"
            value={settings.maxMoves}
            onChange={(value) => updateSettings({maxMoves: value as AnalysisSettings['maxMoves']})}
            options={[
              {value: 1, label: t('lastMove')},
              {value: 5, label: t('last5Moves')},
              {value: 20, label: t('last20Moves')},
              {value: 'all', label: t('all')},
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
