import {Form, Input, Modal, Select} from 'antd';
import type {Rule} from 'antd/es/form';
import type {TFunction} from 'i18next';
import {useEffect, useRef} from 'react';
import {useTranslation} from 'react-i18next';

interface GameInfoModalProps {
  open: boolean;
  values: Record<string, string>;
  onCancel: () => void;
  onSave: (values: Record<string, string>) => void;
}

const gameInfoKeys = ['PB', 'PW', 'BR', 'WR', 'EV', 'RO', 'DT', 'PC', 'KM', 'HA', 'RU', 'RE', 'GN', 'GC'];
const ruleOptions = [
  {value: 'Japanese', labelKey: 'japanese'},
  {value: 'Chinese', labelKey: 'chinese'},
  {value: 'Korean', labelKey: 'korean'},
  {value: 'AGA', labelKey: 'aga'},
  {value: 'New Zealand', labelKey: 'newZealand'},
  {value: 'Tromp-Taylor', labelKey: 'trompTaylor'},
  {value: 'Stone Scoring', labelKey: 'stoneScoring'},
];
const ruleKeys = new Set(ruleOptions.map((option) => ruleKey(option.value)));

export function GameInfoModal({open, values, onCancel, onSave}: GameInfoModalProps) {
  const {t} = useTranslation();
  const [form] = Form.useForm<Record<string, string>>();
  const previousRulesRef = useRef('');

  useEffect(() => {
    if (!open) return;
    previousRulesRef.current = values.RU ?? '';
    form.setFieldsValue(values);
  }, [form, open, values]);

  function handleValuesChange(changedValues: Partial<Record<string, string>>, allValues: Record<string, string>): void {
    if (!Object.prototype.hasOwnProperty.call(changedValues, 'RU')) return;

    const previousRules = previousRulesRef.current;
    const nextRules = allValues.RU ?? '';
    const previousDefaultKomi = defaultKomiForRules(previousRules);
    const nextDefaultKomi = defaultKomiForRules(nextRules);
    previousRulesRef.current = nextRules;

    if (
      ruleKey(previousRules) === ruleKey(nextRules) ||
      previousDefaultKomi == null ||
      nextDefaultKomi == null ||
      parseKomi(allValues.KM ?? '') !== previousDefaultKomi
    ) {
      return;
    }

    form.setFieldsValue({KM: formatKomi(nextDefaultKomi)});
  }

  async function handleOk(): Promise<void> {
    const nextValues = await form.validateFields();
    onSave(nextValues);
  }

  return (
    <Modal
      centered
      title={t('gameInformation')}
      open={open}
      onCancel={onCancel}
      onOk={() => void handleOk()}
      okText={t('ok')}
      cancelText={t('cancel')}
      width={720}
    >
      <Form form={form} layout="vertical" className="game-info-form" onValuesChange={handleValuesChange}>
        {gameInfoKeys.map((key) => (
          <Form.Item key={key} name={key} label={t(key)} rules={validationRules(key, t)}>
            {key === 'RU' ? (
              <Select
                size="small"
                allowClear
                options={ruleOptions.map((option) => ({
                  value: option.value,
                  label: t(option.labelKey),
                }))}
              />
            ) : (
              <Input size="small" inputMode={key === 'KM' || key === 'HA' ? 'decimal' : undefined} />
            )}
          </Form.Item>
        ))}
      </Form>
    </Modal>
  );
}

function validationRules(key: string, t: TFunction): Rule[] {
  if (key === 'KM') {
    return [
      {
        validator: async (_rule, value: unknown) => {
          if (typeof value !== 'string' || value.trim() === '') return;
          const komi = Number(value.trim().replace(',', '.'));
          if (Number.isFinite(komi) && komi >= -150 && komi <= 150 && Number.isInteger(komi * 2)) return;
          throw new Error(
            t('invalidKomi', {
              defaultValue: 'Komi must be an integer or half-integer between -150 and 150.',
            })
          );
        },
      },
    ];
  }

  if (key === 'HA') {
    return [
      {
        validator: async (_rule, value: unknown) => {
          if (typeof value !== 'string' || value.trim() === '') return;
          const handicap = Number(value.trim());
          if (Number.isInteger(handicap) && handicap >= 0 && handicap <= 99) return;
          throw new Error(
            t('invalidHandicap', {
              defaultValue: 'Handicap must be a whole number from 0 to 99.',
            })
          );
        },
      },
    ];
  }

  if (key === 'RU') {
    return [
      {
        validator: async (_rule, value: unknown) => {
          if (typeof value !== 'string' || value.trim() === '' || ruleKeys.has(ruleKey(value))) return;
          throw new Error(
            t('invalidRules', {
              defaultValue: 'Choose one of the supported rule sets.',
            })
          );
        },
      },
    ];
  }

  return [];
}

function ruleKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

function defaultKomiForRules(value: string): number | null {
  switch (ruleKey(value)) {
    case 'japanese':
    case 'korean':
      return 6.5;
    case 'chinese':
    case 'aga':
    case 'new-zealand':
    case 'tromp-taylor':
    case 'stone-scoring':
      return 7.5;
    default:
      return null;
  }
}

function parseKomi(value: string): number | null {
  const komi = Number(value.trim().replace(',', '.'));
  return Number.isFinite(komi) ? komi : null;
}

function formatKomi(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
