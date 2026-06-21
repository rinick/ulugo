import {Button} from 'antd';
import type {KataGoConsoleMessage} from '@ulugo/katago-core';
import type {RefObject} from 'react';
import {useTranslation} from 'react-i18next';
import privacyPolicyUrl from '../../../../../policies/privacy-policy.md?url';
import termsOfServiceUrl from '../../../../../policies/terms-of-service.md?url';
import {formatConsoleTime} from '../../app/katagoConsoleUtils';
import {GoogleAd} from '../ads/GoogleAd';

interface AppLeftPanelProps {
  katagoEnabled: boolean;
  platform: 'web' | 'electron';
  open: boolean;
  consoleMessages: KataGoConsoleMessage[];
  consoleRef: RefObject<HTMLDivElement | null>;
  onClearConsole: () => void;
}

export function AppLeftPanel({
  katagoEnabled,
  platform,
  open,
  consoleMessages,
  consoleRef,
  onClearConsole,
}: AppLeftPanelProps) {
  const {t} = useTranslation();

  if (katagoEnabled) {
    return (
      <aside className="left-panel" style={{display: open ? 'flex' : 'none'}}>
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
    <aside className="left-panel web-ad-panel" style={{display: open ? 'flex' : 'none'}}>
      <GoogleAd />
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
