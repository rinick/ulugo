import {CloudDownloadOutlined} from '@ant-design/icons';
import {Button} from 'antd';
import type {KataGoConsoleMessage} from '@ulugo/katago-core';
import {useEffect, useState, type RefObject} from 'react';
import {useTranslation} from 'react-i18next';
import {formatConsoleTime} from '../../app/katagoConsoleUtils';
import {DesktopReleasePanel} from './DesktopReleasePanel';

const privacyPolicyUrl = 'https://ulugo.com/assets/privacy-policy.md';
const termsOfServiceUrl = 'https://ulugo.com/assets/terms-of-service.md';

interface AppLeftPanelProps {
  katagoEnabled: boolean;
  platform: 'web' | 'electron';
  open: boolean;
  hidden: boolean;
  consoleMessages: KataGoConsoleMessage[];
  consoleRef: RefObject<HTMLDivElement | null>;
  onClearConsole: () => void;
}

export function AppLeftPanel({
  katagoEnabled,
  platform,
  open,
  hidden,
  consoleMessages,
  consoleRef,
  onClearConsole,
}: AppLeftPanelProps) {
  const {t} = useTranslation();
  const panelHidden = !open || hidden;
  const panelClassName = ['left-panel', panelHidden ? 'left-panel-hidden' : ''].filter(Boolean).join(' ');
  const [hasOpened, setHasOpened] = useState(() => open && !hidden);

  useEffect(() => {
    if (open && !hidden) setHasOpened(true);
  }, [hidden, open]);

  if (katagoEnabled) {
    return (
      <aside className={panelClassName}>
        <div className="katago-console-header">
          <h2>{t('katagoConsole')}</h2>
          <Button size="small" onClick={onClearConsole}>
            {t('clear')}
          </Button>
        </div>
        <div className="katago-console-log" ref={consoleRef}>
          {consoleMessages.length === 0 ? (
            <div className="katago-console-empty">{t('katagoConsoleEmpty')}</div>
          ) : (
            consoleMessages.map((item) => (
              <div key={item.id} className={`katago-console-line ${item.level}`}>
                <div className="katago-console-meta">
                  <span className="katago-console-time">{formatConsoleTime(item.time)}</span>
                  <span className={`katago-console-source ${item.source}`}>{item.source}</span>
                </div>
                <div className="katago-console-text">{item.text}</div>
              </div>
            ))
          )}
        </div>
      </aside>
    );
  }

  if (platform !== 'web') return null;

  return (
    <aside className={`${panelClassName} web-left-panel`}>
      <div className="desktop-download-callout">
        <span className="desktop-download-callout-icon">
          <CloudDownloadOutlined />
        </span>
        <div>{t('downloadDesktopApp')}</div>
        <span className="desktop-download-callout-icon">
          <CloudDownloadOutlined />
        </span>
      </div>
      <DesktopReleasePanel active={hasOpened} />
      <div className="policy-links">
        <Button type="link" href={privacyPolicyUrl} target="_blank" rel="noreferrer">
          Privacy Policy
        </Button>
        <Button type="link" href={termsOfServiceUrl} target="_blank" rel="noreferrer">
          Terms of Service
        </Button>
      </div>
    </aside>
  );
}
