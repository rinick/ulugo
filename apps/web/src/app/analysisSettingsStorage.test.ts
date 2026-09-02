import {defaultAnalysisSettings, defaultEditModeSettings} from '@ulugo/analysis-core';
import {describe, expect, it} from 'vitest';
import {normalizeAnalysisSettings} from './analysisSettingsStorage';

describe('analysis settings normalization', () => {
  it('uses canonical defaults for missing Electron settings', () => {
    expect(normalizeAnalysisSettings({}, true)).toEqual(defaultAnalysisSettings);
  });

  it('migrates legacy display settings', () => {
    const settings = normalizeAnalysisSettings(
      {
        mode: 'review',
        moveDisplay: 'winrate',
        topMoveDisplay: 'markup',
        maxIntensity: 0,
        pvPreviewDelay: 10,
      },
      true
    );

    expect(settings).toMatchObject({
      mode: 'review',
      moveDisplay: ['winRateChange'],
      stoneOverlay: 'none',
      intensityDisplayLimit: 1,
      pvPreviewDelay: 2,
    });
  });

  it('migrates the legacy minimal mode and its saved mode settings', () => {
    const settings = normalizeAnalysisSettings(
      {
        mode: 'review',
        modeSettings: {
          review: {},
          edit: {},
          zen: {stoneOverlay: 'number', showComments: true},
        },
      },
      true
    );

    expect(settings.modeSettings.minimal).toMatchObject({
      stoneOverlay: 'number',
      showMarkup: false,
      showComments: true,
    });
  });

  it('uses saved edit settings when analysis is unavailable', () => {
    const settings = normalizeAnalysisSettings(
      {
        mode: 'review',
        boardBackground: 'auto',
        modeSettings: {
          review: {},
          edit: {...defaultEditModeSettings, showComments: false},
          minimal: {},
        },
      },
      false
    );

    expect(settings).toMatchObject({mode: 'edit', boardBackground: 'golden', showComments: false});
  });
});
