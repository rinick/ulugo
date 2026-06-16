import {Button, Form, Input, InputNumber, Modal, Progress, Select, Space, Typography, message} from 'antd';
import {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  defaultKataGoSettings,
  type KataGoDownloadOption,
  type KataGoDownloadProgress,
  type KataGoSettings,
} from '@ulugo/katago-core';

interface KataGoSettingsModalProps {
  open: boolean;
  onCancel: () => void;
}

export function KataGoSettingsModal({open, onCancel}: KataGoSettingsModalProps) {
  const {t} = useTranslation();
  const [form] = Form.useForm<KataGoSettings>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<'katago' | 'model' | null>(null);
  const [katagoOptions, setKataGoOptions] = useState<KataGoDownloadOption[]>([]);
  const [modelOptions, setModelOptions] = useState<KataGoDownloadOption[]>([]);
  const [selectedKataGo, setSelectedKataGo] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [progress, setProgress] = useState<KataGoDownloadProgress | null>(null);

  useEffect(() => {
    if (!open || window.ulugo == null) return;

    setLoading(true);
    Promise.all([window.ulugo.katago.getSettings(), window.ulugo.katago.getDownloadOptions()])
      .then(([settings, options]) => {
        form.setFieldsValue(settings);
        setKataGoOptions(options.katago);
        setModelOptions(options.models);
        const selectedKataGoOption = pickDownloadOption(options.katago, settings.executablePath);
        const selectedModelOption = pickDownloadOption(options.models, settings.modelPath);
        setSelectedKataGo(selectedKataGoOption?.id ?? null);
        setSelectedModel(selectedModelOption?.id ?? null);
        if (settings.executablePath === '' && selectedKataGoOption?.installedPath != null) {
          void applyInstalledPath('katago', selectedKataGoOption.installedPath);
        }
        if (settings.modelPath === '' && selectedModelOption?.installedPath != null) {
          void applyInstalledPath('model', selectedModelOption.installedPath);
        }
      })
      .catch((error: unknown) => message.error(error instanceof Error ? error.message : t('katagoSettingsLoadFailed')))
      .finally(() => setLoading(false));
  }, [form, open, t]);

  useEffect(() => {
    if (!open || window.ulugo == null) return;
    return window.ulugo.katago.onDownloadProgress(setProgress);
  }, [open]);

  async function browse(field: keyof KataGoSettings): Promise<void> {
    if (window.ulugo == null) return;
    const selected = await window.ulugo.selectFile({title: t(katagoFieldTitleKey(field))});
    if (selected != null) form.setFieldValue(field, selected);
  }

  async function handleSave(): Promise<void> {
    if (window.ulugo == null) return;

    try {
      setSaving(true);
      const values = await form.validateFields();
      await window.ulugo.katago.saveSettings({...defaultKataGoSettings, ...values});
      message.success(t('katagoSettingsSaved'));
      onCancel();
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function applyInstalledPath(kind: 'katago' | 'model', installedPath: string): Promise<void> {
    if (window.ulugo == null) return;

    const field = kind === 'katago' ? 'executablePath' : 'modelPath';
    form.setFieldsValue({[field]: installedPath});
    const settings = await window.ulugo.katago.saveSettings({
      ...defaultKataGoSettings,
      ...form.getFieldsValue(),
      [field]: installedPath,
    });
    form.setFieldsValue(settings);
  }

  async function handleSelectDownloadOption(kind: 'katago' | 'model', optionId: string): Promise<void> {
    if (kind === 'katago') {
      setSelectedKataGo(optionId);
    } else {
      setSelectedModel(optionId);
    }

    const option = (kind === 'katago' ? katagoOptions : modelOptions).find((item) => item.id === optionId);
    if (option?.installedPath != null) await applyInstalledPath(kind, option.installedPath);
  }

  async function handleDownload(kind: 'katago' | 'model'): Promise<void> {
    if (window.ulugo == null) return;
    const optionId = kind === 'katago' ? selectedKataGo : selectedModel;
    if (optionId == null) return;
    const option = (kind === 'katago' ? katagoOptions : modelOptions).find((item) => item.id === optionId);

    if (option?.installedPath != null) {
      await applyInstalledPath(kind, option.installedPath);
      message.success(t(kind === 'katago' ? 'katagoSelected' : 'modelSelected'));
      return;
    }

    try {
      setDownloading(kind);
      setProgress(null);
      const result = await window.ulugo.katago.download({kind, optionId});
      form.setFieldsValue(result.settings);
      const options = await window.ulugo.katago.getDownloadOptions();
      setKataGoOptions(options.katago);
      setModelOptions(options.models);
      message.success(t(kind === 'katago' ? 'katagoDownloaded' : 'modelDownloaded'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('downloadFailed'));
    } finally {
      setDownloading(null);
    }
  }

  async function handleAutoConfig(): Promise<void> {
    if (window.ulugo == null) return;

    try {
      const values = await form.validateFields();
      const settings = await window.ulugo.katago.saveSettings({...defaultKataGoSettings, ...values, configPath: ''});
      form.setFieldsValue(settings);
      message.success(t('katagoConfigCreated'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('katagoConfigFailed'));
    }
  }

  return (
    <Modal
      title={t('aiConfig')}
      open={open}
      onCancel={onCancel}
      onOk={() => void handleSave()}
      okText={t('save')}
      confirmLoading={saving}
      width={720}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" disabled={loading} initialValues={defaultKataGoSettings}>
        <Typography.Text className="settings-help" type="secondary">
          {t('katagoHelp')}
        </Typography.Text>
        <PathField name="executablePath" label={t('katagoExecutable')} onBrowse={browse} />
        <PathField name="modelPath" label={t('modelFile')} onBrowse={browse} />
        <PathField
          name="configPath"
          label={t('katagoConfig')}
          placeholder={t('autoCreatedIfEmpty')}
          onBrowse={browse}
          onAuto={() => void handleAutoConfig()}
        />
        <div className="katago-download-grid">
          <Space.Compact className="katago-download-control">
            <Select
              size="small"
              value={selectedKataGo}
              disabled={katagoOptions.length === 0 || downloading != null}
              popupMatchSelectWidth={false}
              onChange={(value) => void handleSelectDownloadOption('katago', value)}
              options={katagoOptions.map((option) => ({
                value: option.id,
                label: downloadOptionLabel(option, t('installed')),
              }))}
              placeholder={t('noKataGoDownload')}
            />
            <Button
              size="small"
              disabled={selectedKataGo == null}
              loading={downloading === 'katago'}
              onClick={() => void handleDownload('katago')}
            >
              {downloadButtonText(
                katagoOptions.find((option) => option.id === selectedKataGo),
                t('useInstalled'),
                t('downloadKataGo')
              )}
            </Button>
          </Space.Compact>
          <Space.Compact className="katago-download-control">
            <Select
              size="small"
              value={selectedModel}
              disabled={modelOptions.length === 0 || downloading != null}
              popupMatchSelectWidth={false}
              onChange={(value) => void handleSelectDownloadOption('model', value)}
              options={modelOptions.map((option) => ({
                value: option.id,
                label: downloadOptionLabel(option, t('installed')),
              }))}
            />
            <Button
              size="small"
              disabled={selectedModel == null}
              loading={downloading === 'model'}
              onClick={() => void handleDownload('model')}
            >
              {downloadButtonText(
                modelOptions.find((option) => option.id === selectedModel),
                t('useInstalled'),
                t('downloadModels')
              )}
            </Button>
          </Space.Compact>
        </div>
        {progress != null ? (
          <div className="katago-download-progress">
            <Typography.Text type={progress.status === 'error' ? 'danger' : 'secondary'}>
              {progress.message}
            </Typography.Text>
            <Progress
              size="small"
              percent={Math.round(progress.percent * 100)}
              status={progress.status === 'error' ? 'exception' : progress.status === 'complete' ? 'success' : 'active'}
            />
          </div>
        ) : null}
        <Form.Item name="altCommand" label={t('alternativeCommand')}>
          <Input size="small" />
        </Form.Item>
        <div className="katago-settings-grid">
          <Form.Item name="maxVisits" label={t('maxVisits')}>
            <InputNumber size="small" min={1} />
          </Form.Item>
          <Form.Item name="fastVisits" label={t('fastVisits')}>
            <InputNumber size="small" min={1} />
          </Form.Item>
          <Form.Item name="wideRootNoise" label={t('wideRootNoise')}>
            <InputNumber size="small" min={0} max={1} step={0.01} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

function pickDownloadOption(options: KataGoDownloadOption[], currentPath: string): KataGoDownloadOption | undefined {
  return (
    options.find((option) => option.installedPath != null && option.installedPath === currentPath) ??
    options.find((option) => option.installedPath != null) ??
    options[0]
  );
}

function downloadOptionLabel(option: KataGoDownloadOption, installedLabel: string): string {
  return option.installedPath == null ? option.label : `${option.label} (${installedLabel})`;
}

function downloadButtonText(
  option: KataGoDownloadOption | undefined,
  installedText: string,
  downloadText: string
): string {
  return option?.installedPath == null ? downloadText : installedText;
}

function katagoFieldTitleKey(field: keyof KataGoSettings): string {
  if (field === 'executablePath') return 'katagoExecutable';
  if (field === 'modelPath') return 'modelFile';
  if (field === 'configPath') return 'katagoConfig';
  return 'alternativeCommand';
}

function PathField({
  name,
  label,
  placeholder,
  onBrowse,
  onAuto,
}: {
  name: keyof KataGoSettings;
  label: string;
  placeholder?: string;
  onBrowse: (field: keyof KataGoSettings) => Promise<void>;
  onAuto?: () => void;
}) {
  const {t} = useTranslation();

  return (
    <Form.Item name={name} label={label}>
      <Space.Compact className="path-field">
        <Input size="small" placeholder={placeholder} />
        <Button size="small" onClick={() => void onBrowse(name)}>
          {t('browse')}
        </Button>
        {onAuto != null ? (
          <Button size="small" onClick={onAuto}>
            {t('auto')}
          </Button>
        ) : null}
      </Space.Compact>
    </Form.Item>
  );
}
