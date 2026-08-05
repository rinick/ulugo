import {QuestionCircleOutlined} from '@ant-design/icons';
import {Button, Form, InputNumber, Modal, Progress, Space, Table, Typography, message} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  defaultKataGoSettings,
  type KataGoAsset,
  type KataGoAssetInventory,
  type KataGoDownloadProgress,
  type KataGoSettings,
} from '@ulugo/katago-core';
import type {AppLanguage} from '../../app/localizationUtils';
import {openExternalUrl} from '../../app/openExternalUrl';

type AssetKind = 'katago' | 'model';

interface KataGoSettingsModalProps {
  open: boolean;
  language: AppLanguage;
  onCancel: () => void;
  onCurrentAssetUninstalled: () => void;
}

export function KataGoSettingsModal({open, language, onCancel, onCurrentAssetUninstalled}: KataGoSettingsModalProps) {
  const {t} = useTranslation();
  const [form] = Form.useForm<KataGoSettings>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelDisabled, setCancelDisabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [installing, setInstalling] = useState<AssetKind | null>(null);
  const [inventory, setInventory] = useState<KataGoAssetInventory | null>(null);
  const [installTarget, setInstallTarget] = useState<{kind: AssetKind; assetId: string} | null>(null);
  const [progress, setProgress] = useState<KataGoDownloadProgress | null>(null);

  useEffect(() => {
    if (!open || window.ulugo == null) return;
    setCancelDisabled(false);
    void loadInventory();
  }, [open]);

  useEffect(() => {
    if (!open || window.ulugo == null) return;
    return window.ulugo.katago.onDownloadProgress(setProgress);
  }, [open]);

  const selectedKataGoId = useMemo(
    () => inventory?.katago.find((asset) => asset.path === inventory.settings.executablePath)?.id ?? null,
    [inventory]
  );
  const selectedModelId = useMemo(
    () => inventory?.models.find((asset) => asset.path === inventory.settings.modelPath)?.id ?? null,
    [inventory]
  );
  const selectedKataGoRow =
    selectedKataGoId ??
    (installTarget?.kind === 'katago'
      ? installTarget.assetId
      : inventory?.katago.find((asset) => asset.available)?.id) ??
    null;
  const selectedModelRow =
    selectedModelId ??
    (installTarget?.kind === 'model'
      ? installTarget.assetId
      : inventory?.models.find((asset) => asset.available)?.id) ??
    null;

  async function loadInventory(): Promise<void> {
    if (window.ulugo == null) return;

    try {
      setLoading(true);
      const nextInventory = await window.ulugo.katago.getAssets();
      setInventory(nextInventory);
      form.setFieldsValue(nextInventory.settings);
      setInstallTarget(defaultInstallTarget(nextInventory));
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : t('katagoSettingsLoadFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh(): Promise<void> {
    if (window.ulugo == null) return;

    try {
      setRefreshing(true);
      const nextInventory = await window.ulugo.katago.refreshAssets();
      setInventory(nextInventory);
      form.setFieldsValue(nextInventory.settings);
      setInstallTarget(defaultInstallTarget(nextInventory));
      message.success(t('availableVersionsUpdated'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('availableVersionsUpdateFailed'));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSave(): Promise<void> {
    if (window.ulugo == null || inventory == null) return;

    try {
      setSaving(true);
      const values = await form.validateFields();
      const settings = await window.ulugo.katago.saveSettings({
        ...inventory.settings,
        maxVisits: values.maxVisits,
        fastVisits: values.fastVisits,
        wideRootNoise: values.wideRootNoise,
      });
      setInventory({...inventory, settings});
      message.success(t('katagoSettingsSaved'));
      if (!inventory.katago.some((asset) => asset.installed) || !inventory.models.some((asset) => asset.installed)) {
        Modal.warning({
          centered: true,
          title: t('aiAnalysisUnavailableTitle'),
          content: t('aiAnalysisUnavailableContent'),
          onOk: onCancel,
        });
      } else {
        onCancel();
      }
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSelect(kind: AssetKind, assetId: string): Promise<void> {
    if (window.ulugo == null || inventory == null) return;
    const asset = assetsForKind(inventory, kind).find((item) => item.id === assetId);
    if (asset == null) return;

    if (!asset.installed) {
      setInstallTarget({kind, assetId});
      return;
    }

    try {
      const settings = await window.ulugo.katago.selectAsset({kind, assetId});
      const nextInventory = await window.ulugo.katago.getAssets();
      setInventory({...nextInventory, settings});
      form.setFieldsValue(settings);
      message.success(t(kind === 'katago' ? 'katagoSelected' : 'modelSelected'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('katagoSettingsLoadFailed'));
    }
  }

  async function handleInstall(kind: AssetKind, assetId: string): Promise<void> {
    if (window.ulugo == null) return;

    try {
      setInstalling(kind);
      setInstallTarget({kind, assetId});
      setProgress(null);
      const result = await window.ulugo.katago.download({kind, optionId: assetId});
      const nextInventory = await window.ulugo.katago.getAssets();
      setInventory({...nextInventory, settings: result.settings});
      form.setFieldsValue(result.settings);
      message.success(t(kind === 'katago' ? 'katagoDownloaded' : 'modelDownloaded'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('downloadFailed'));
    } finally {
      setInstalling(null);
    }
  }

  async function handleUninstall(kind: AssetKind, assetId: string): Promise<void> {
    if (window.ulugo == null || inventory == null) return;
    const currentAssetUninstalled = kind === 'katago' ? assetId === selectedKataGoId : assetId === selectedModelId;

    try {
      const nextInventory = await window.ulugo.katago.uninstallAsset({kind, assetId});
      setInventory(nextInventory);
      form.setFieldsValue(nextInventory.settings);
      setInstallTarget(defaultInstallTarget(nextInventory));
      if (currentAssetUninstalled) {
        setCancelDisabled(true);
        onCurrentAssetUninstalled();
      }
      message.success(t(kind === 'katago' ? 'katagoUninstalled' : 'modelUninstalled'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('uninstallFailed'));
    }
  }

  function assetColumns(kind: AssetKind): ColumnsType<KataGoAsset> {
    return [
      {
        title: t('name'),
        dataIndex: 'label',
        ellipsis: true,
      },
      {
        title: t('notes'),
        width: 96,
        ellipsis: true,
        render: (_, asset) => (asset.notes == null ? '' : t(asset.notes)),
      },
      {
        title: t('state'),
        width: 96,
        render: (_, asset) => assetStatus(asset, t),
      },
      {
        title: t('action'),
        width: 120,
        render: (_, asset) =>
          asset.installed ? (
            <Button size="small" danger onClick={() => void handleUninstall(kind, asset.id)}>
              {t('uninstall')}
            </Button>
          ) : (
            <Button
              size="small"
              disabled={!asset.available}
              loading={installing === kind && installTarget?.assetId === asset.id}
              onClick={() => void handleInstall(kind, asset.id)}
            >
              {t('install')}
            </Button>
          ),
      },
    ];
  }

  return (
    <Modal
      centered
      title={t('aiConfig')}
      open={open}
      onCancel={onCancel}
      footer={
        <div className="app-settings-footer">
          <Button
            icon={<QuestionCircleOutlined />}
            onClick={() => openExternalUrl(`https://deepmess.com/${language}/ulugo/analysis.html`)}
          >
            {t('help')}
          </Button>
          <Space>
            <Button disabled={cancelDisabled} onClick={onCancel}>
              {t('cancel')}
            </Button>
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              {t('save')}
            </Button>
          </Space>
        </div>
      }
      closable={false}
      keyboard={false}
      maskClosable={false}
      width={860}
      destroyOnHidden
    >
      <Space className="katago-settings-header">
        <Typography.Text className="settings-help" type="secondary">
          {t('katagoHelp')}
        </Typography.Text>
        <Button size="small" loading={refreshing} onClick={() => void handleRefresh()}>
          {t('refresh')}
        </Button>
      </Space>

      <Typography.Title level={5}>{t('katagoInstallations')}</Typography.Title>
      <Table
        size="small"
        loading={loading}
        rowKey="id"
        pagination={false}
        scroll={{y: 200}}
        columns={assetColumns('katago')}
        dataSource={inventory?.katago ?? []}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedKataGoRow != null ? [selectedKataGoRow] : [],
          onSelect: (asset) => void handleSelect('katago', asset.id),
        }}
      />

      <Typography.Title level={5}>{t('katagoModels')}</Typography.Title>
      <Table
        size="small"
        loading={loading}
        rowKey="id"
        pagination={false}
        scroll={{y: 200}}
        columns={assetColumns('model')}
        dataSource={inventory?.models ?? []}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedModelRow != null ? [selectedModelRow] : [],
          onSelect: (asset) => void handleSelect('model', asset.id),
        }}
      />

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

      <Form form={form} layout="vertical" disabled={loading} initialValues={defaultKataGoSettings}>
        <div className="katago-settings-grid">
          <Form.Item name="maxVisits" label={t('maxVisits')}>
            <InputNumber size="small" min={1} />
          </Form.Item>
          <Form.Item name="fastVisits" label={t('fastVisits')} extra={t('fastVisitsHelp')}>
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

function defaultInstallTarget(inventory: KataGoAssetInventory): {kind: AssetKind; assetId: string} | null {
  const katago = inventory.katago.find((asset) => !asset.installed && asset.available);
  if (katago != null) return {kind: 'katago', assetId: katago.id};
  const model = inventory.models.find((asset) => !asset.installed && asset.available);
  return model == null ? null : {kind: 'model', assetId: model.id};
}

function assetsForKind(inventory: KataGoAssetInventory, kind: AssetKind): KataGoAsset[] {
  return kind === 'katago' ? inventory.katago : inventory.models;
}

function assetStatus(asset: KataGoAsset, t: (key: string) => string): string {
  if (asset.installed) return t('installed');
  return t('available');
}
