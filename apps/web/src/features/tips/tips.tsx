import type {TFunction} from 'i18next';
import {isValidElement, type ReactElement, type ReactNode} from 'react';
import type {AppCapabilities} from '../../app/capabilities';

const tipsWelcomeShownStorageKey = 'ulugo.tipsWelcomeShown';
type TipPlatform = AppCapabilities['platform'];
interface TipProps {
  platform?: TipPlatform;
  children: ReactNode;
}

export function createStartupTips(t: TFunction, firstTime: boolean, platform: TipPlatform): ReactNode[] {
  const tips = shuffleTips(createTips(t).filter((tip) => tipVisibleOnPlatform(tip, platform)));
  if (firstTime) tips.unshift(<p key="welcome">{t('welcomeTip')}</p>);
  return tips;
}

export function readTipsFirstTime(): boolean {
  try {
    return localStorage.getItem(tipsWelcomeShownStorageKey) !== 'true';
  } catch {
    return false;
  }
}

export function writeTipsWelcomeShown(): void {
  try {
    localStorage.setItem(tipsWelcomeShownStorageKey, 'true');
  } catch {
    // Ignore storage failures; the welcome tip may appear again next time.
  }
}

function createTips(t: TFunction): ReactElement<TipProps>[] {
  return [
    <Tip key="shift-jump">
      <p>{t('tipShiftJump')}</p>
    </Tip>,
    <Tip key="markup">
      <p>{t('tipMarkup')}</p>
    </Tip>,
    <Tip key="markup-text">
      <p>{t('tipMarkupText')}</p>
    </Tip>,
    <Tip key="replace-move">
      <p>{t('tipReplaceMove')}</p>
    </Tip>,
    <Tip key="board-recognition">
      <p>{t('tipBoardRecognition')}</p>
    </Tip>,
    <Tip key="web-minimal-portrait" platform="web">
      <p>{t('tipMinimalPortrait')}</p>
    </Tip>,
    <Tip key="web-score-estimate" platform="web">
      <p>{t('tipWebScoreEstimate', {downloadDesktopApp: t('downloadDesktopApp')})}</p>
    </Tip>,
    <Tip key="electron-deep-analysis" platform="electron">
      <p>{t('tipElectronDeepAnalysis')}</p>
    </Tip>,
    <Tip key="electron-move-value" platform="electron">
      <p>{t('tipElectronMoveValue')}</p>
    </Tip>,
    <Tip key="electron-hot-zone" platform="electron">
      <p>{t('tipElectronHotZone')}</p>
    </Tip>,
    <Tip key="electron-katago-speed" platform="electron">
      <p>{t('tipElectronKatagoSpeed')}</p>
    </Tip>,
    <Tip key="electron-pv-preview" platform="electron">
      <p>{t('tipElectronPvPreview')}</p>
    </Tip>,
    <Tip key="clipboard-open">
      <p>{t('tipClipboardOpen')}</p>
    </Tip>,
  ];
}

function Tip({children}: TipProps) {
  return <>{children}</>;
}

function tipVisibleOnPlatform(tip: ReactNode, platform: TipPlatform): boolean {
  if (!isValidElement<TipProps>(tip)) return true;
  return tip.props.platform == null || tip.props.platform === platform;
}

function shuffleTips(tips: ReactNode[]): ReactNode[] {
  const result = [...tips];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
