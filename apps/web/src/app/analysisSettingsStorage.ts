import {
  defaultAnalysisSettings,
  defaultEditModeSettings,
  defaultReviewModeSettings,
  defaultMinimalModeSettings,
  type AnalysisDisplayMode,
  type AnalysisMode,
  type AnalysisModeSettings,
  type AnalysisMoveDisplay,
  type AnalysisSettings,
} from '@ulugo/analysis-core';

const analysisSettingsStorageKey = 'ulugo.analysisSettings';
const showMarkupStorageKey = 'ulugo.showMarkup';
const legacyMinimalMode = ['z', 'e', 'n'].join('');

const modeSettingKeys = [
  'stoneOverlay',
  'showMarkup',
  'showNextMove',
  'showTopMoves',
  'showExpectedTerritory',
  'showHotZone',
  'showScore',
  'showPointLoss',
  'showWinrate',
  'showIntensity',
  'showComments',
] as const;

export function readStoredAnalysisSettings(enabled: boolean): AnalysisSettings {
  const defaults: AnalysisSettings = enabled
    ? defaultAnalysisSettings
    : {...defaultAnalysisSettings, mode: 'edit', ...defaultEditModeSettings, boardBackground: 'golden'};

  try {
    const value = localStorage.getItem(analysisSettingsStorageKey);
    if (value == null) return normalizeAnalysisSettings(defaults, enabled);
    const stored = JSON.parse(value) as Partial<AnalysisSettings> & {
      stoneOverlay?: AnalysisSettings['stoneOverlay'] | 'markup';
      topMoveDisplay?: AnalysisSettings['stoneOverlay'] | 'markup';
    };
    return normalizeAnalysisSettings({...defaults, ...stored}, enabled);
  } catch {
    return normalizeAnalysisSettings(defaults, enabled);
  }
}

export function writeStoredAnalysisSettings(settings: AnalysisSettings): void {
  try {
    localStorage.setItem(analysisSettingsStorageKey, JSON.stringify(settings));
  } catch {
    // Ignore storage failures; settings still apply for this session.
  }
}

export function normalizeAnalysisSettings(
  settings: Partial<AnalysisSettings> & {
    moveDisplay?: unknown;
    stoneOverlay?: AnalysisSettings['stoneOverlay'] | 'markup';
    topMoveDisplay?: AnalysisSettings['stoneOverlay'] | 'markup';
    maxIntensity?: unknown;
  },
  enabled: boolean
): AnalysisSettings {
  const {maxIntensity: legacyMaxIntensity, ...storedSettings} = settings;
  const storedModeValue = settings.mode as string | undefined;
  let storedMode: AnalysisMode = 'review';
  if (storedModeValue === 'edit' || storedModeValue === 'minimal') storedMode = storedModeValue;
  else if (storedModeValue === legacyMinimalMode) storedMode = 'minimal';
  const mode: AnalysisMode = enabled || storedMode === 'minimal' ? storedMode : 'edit';
  const modeDefaults = defaultsForMode(mode);
  const activeSource = mode === storedMode ? settings : (settings.modeSettings?.[mode] ?? {});
  const stoneOverlay =
    activeSource.stoneOverlay ??
    (mode === storedMode ? settings.topMoveDisplay : undefined) ??
    modeDefaults.stoneOverlay;
  const showMarkup =
    mode === 'minimal' ? false : (activeSource.showMarkup ?? readLegacyShowMarkup() ?? modeDefaults.showMarkup);
  const activeModeSettings = normalizeModeSettings(
    {
      stoneOverlay: stoneOverlay === 'markup' ? 'none' : stoneOverlay,
      showMarkup,
      showNextMove: activeSource.showNextMove,
      showTopMoves: activeSource.showTopMoves,
      showExpectedTerritory: activeSource.showExpectedTerritory,
      showHotZone: activeSource.showHotZone,
      showScore: activeSource.showScore,
      showPointLoss: activeSource.showPointLoss,
      showWinrate: activeSource.showWinrate,
      showIntensity: activeSource.showIntensity,
      showComments: activeSource.showComments,
    },
    modeDefaults
  );
  const modeSettings = {
    review: normalizeModeSettings(settings.modeSettings?.review, defaultReviewModeSettings),
    edit: normalizeModeSettings(settings.modeSettings?.edit, defaultEditModeSettings),
    minimal: normalizeModeSettings(
      settings.modeSettings?.minimal ??
        (settings.modeSettings as Partial<Record<string, AnalysisModeSettings>> | undefined)?.[legacyMinimalMode],
      defaultMinimalModeSettings
    ),
    [mode]: activeModeSettings,
  };
  const normalized = {
    ...defaultAnalysisSettings,
    ...storedSettings,
    moveDisplay: normalizeMoveDisplay(settings.moveDisplay),
    intensityDisplayLimit: normalizeIntensityDisplayLimit(settings.intensityDisplayLimit ?? legacyMaxIntensity),
    pvPreviewDelay: normalizePvPreviewDelay(settings.pvPreviewDelay),
    mode,
    ...activeModeSettings,
    modeSettings,
  };
  if (!enabled && normalized.boardBackground === 'auto') return {...normalized, boardBackground: 'golden'};
  return normalized;
}

export function updateCurrentModeSettings(
  settings: AnalysisSettings,
  values: Partial<AnalysisSettings>
): AnalysisSettings {
  const next = {...settings, ...values};
  const modeSettings = {...settings.modeSettings};
  let changedModeSettings = false;

  for (const key of modeSettingKeys) {
    if (key in values) changedModeSettings = true;
  }

  if (changedModeSettings) {
    modeSettings[settings.mode] = normalizeModeSettings(
      Object.fromEntries(modeSettingKeys.map((key) => [key, next[key]])),
      defaultsForMode(settings.mode)
    );
  }

  return {...next, modeSettings};
}

export function switchAnalysisMode(settings: AnalysisSettings, mode: AnalysisMode, enabled: boolean): AnalysisSettings {
  const modeSettings = {
    ...settings.modeSettings,
    [settings.mode]: normalizeModeSettings(
      Object.fromEntries(modeSettingKeys.map((key) => [key, settings[key]])),
      defaultsForMode(settings.mode)
    ),
  };
  return normalizeAnalysisSettings(
    {
      ...settings,
      mode,
      ...modeSettings[mode],
      modeSettings,
    },
    enabled
  );
}

function defaultsForMode(mode: AnalysisMode): AnalysisModeSettings {
  if (mode === 'review') return defaultReviewModeSettings;
  if (mode === 'minimal') return defaultMinimalModeSettings;
  return defaultEditModeSettings;
}

function normalizeMoveDisplay(value: unknown): AnalysisMoveDisplay {
  const values = Array.isArray(value) ? value : [value];
  const normalized = values.flatMap((item): AnalysisDisplayMode[] => {
    if (item === 'score') return Array.isArray(value) ? ['score'] : ['scoreChange'];
    if (item === 'winrate') return ['winRateChange'];
    if (item === 'absScore') return ['value'];
    if (item === 'scoreChange' || item === 'winRateChange' || item === 'visits' || item === 'value') return [item];
    return [];
  });
  const unique = [...new Set(normalized)].slice(0, 2);
  return (unique.length === 0 ? ['scoreChange'] : unique) as AnalysisMoveDisplay;
}

function normalizePvPreviewDelay(value: unknown): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return defaultAnalysisSettings.pvPreviewDelay;
  return Math.max(0, Math.min(2, numberValue));
}

function normalizeIntensityDisplayLimit(value: unknown): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return defaultAnalysisSettings.intensityDisplayLimit;
  return Math.max(1, Math.round(numberValue));
}

function normalizeModeSettings(
  settings: Partial<AnalysisModeSettings> | undefined,
  defaults: AnalysisModeSettings
): AnalysisModeSettings {
  const stoneOverlay = settings?.stoneOverlay;
  return {
    ...defaults,
    ...settings,
    showIntensity: settings?.showIntensity ?? defaults.showIntensity,
    stoneOverlay:
      stoneOverlay === 'dot' || stoneOverlay === 'number' || stoneOverlay === 'none'
        ? stoneOverlay
        : defaults.stoneOverlay,
  };
}

function readLegacyShowMarkup(): boolean | undefined {
  try {
    const value = localStorage.getItem(showMarkupStorageKey);
    return value == null ? undefined : value === 'true';
  } catch {
    return undefined;
  }
}
