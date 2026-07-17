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
    <Tip>
      <p>添加文字标记会自动改变下一个文字，例如A↦B, 1↦2。但如果用鼠标右键添加则文字不会被改变。</p>
    </Tip>,
    <Tip platform="web">
      <p>极简模式在竖屏状态会自动旋转90度。在手机平板上记谱时，竖屏能获得更大的显示空间。</p>
    </Tip>,
    <Tip platform="web">
      <p>
        在右下窗口内右键点击一手棋，可以进行目数估算。这项功能只适合终盘目数计算，如果要进行盘中形式分析请下载离线版。
      </p>
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
