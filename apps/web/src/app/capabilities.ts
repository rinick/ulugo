export interface AppCapabilities {
  platform: 'web' | 'electron';
  storage: 'browser' | 'filesystem';
  katago: boolean;
}

export const webCapabilities: AppCapabilities = {
  platform: 'web',
  storage: 'browser',
  katago: false,
};

export const electronCapabilities: AppCapabilities = {
  platform: 'electron',
  storage: 'filesystem',
  katago: true,
};

export const isElectron = window.ulugo?.platform === 'electron';
export const capabilities = isElectron ? electronCapabilities : webCapabilities;
export const supportsCameraCapture = !isElectron && isMobileBrowser();

function isMobileBrowser(): boolean {
  const navigatorWithUserAgentData = navigator as Navigator & {userAgentData?: {mobile?: boolean}};
  if (navigatorWithUserAgentData.userAgentData?.mobile != null) {
    return navigatorWithUserAgentData.userAgentData.mobile;
  }

  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}
