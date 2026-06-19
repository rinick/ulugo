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
