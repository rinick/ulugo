import {useEffect, useState} from 'react';
import {capabilities} from './capabilities';

const uiScaleStorageKey = 'ulugo.uiScale';
const showCoordinatesStorageKey = 'ulugo.showCoordinates';
const playStoneSoundStorageKey = 'ulugo.playStoneSound';
const openLastSgfOnStartupStorageKey = 'ulugo.openLastSgfOnStartup';
const showTipsOnStartupStorageKey = 'ulugo.showTipsOnStartup';
const leftPanelOpenStorageKey = 'ulugo.leftPanelOpen';
const minimalRightPanelOpenStorageKey = 'ulugo.minimalRightPanelOpen';
const minimalBasicToolsOpenStorageKey = 'ulugo.minimalBasicToolsOpen';
const minimalShowCoordinatesStorageKey = 'ulugo.minimalShowCoordinates';

export function useAppPreferences() {
  const [uiScale, setUiScale] = useState(() => readStoredNumber(uiScaleStorageKey, 100, 25, 400));
  const [showCoordinates, setShowCoordinates] = useState(() => readStoredBoolean(showCoordinatesStorageKey, true));
  const [playStoneSound, setPlayStoneSound] = useState(() => readStoredBoolean(playStoneSoundStorageKey, true));
  const [openLastSgfOnStartup, setOpenLastSgfOnStartup] = useState(readOpenLastSgfOnStartupPreference);
  const [showTipsOnStartup, setShowTipsOnStartup] = useState(() =>
    readStoredBoolean(showTipsOnStartupStorageKey, true)
  );
  const [leftPanelOpen, setLeftPanelOpen] = useState(() =>
    readStoredBoolean(leftPanelOpenStorageKey, defaultLeftPanelOpen())
  );
  const [minimalRightPanelOpen, setMinimalRightPanelOpen] = useState(() =>
    readStoredBoolean(minimalRightPanelOpenStorageKey, false)
  );
  const [minimalBasicToolsOpen, setMinimalBasicToolsOpen] = useState(() =>
    readStoredBoolean(minimalBasicToolsOpenStorageKey, false)
  );
  const [minimalShowCoordinates, setMinimalShowCoordinates] = useState(() =>
    readStoredBoolean(minimalShowCoordinatesStorageKey, false)
  );

  useEffect(() => {
    const root = globalThis.document.getElementById('root');
    if (root != null) {
      const scale = uiScale / 100;
      root.style.setProperty('--board-region-min-width', `${360 / scale}px`);
      root.style.setProperty('--board-region-max-width', `${768 / scale}px`);
      root.style.removeProperty('zoom');
      root.style.transform = `scale(${scale})`;
      root.style.transformOrigin = 'top left';
      root.style.width = `${100 / scale}%`;
      root.style.height = `${100 / scale}%`;
    }
    writeStoredValue(uiScaleStorageKey, uiScale);
  }, [uiScale]);

  useEffect(() => {
    writeStoredValue(showCoordinatesStorageKey, showCoordinates);
  }, [showCoordinates]);

  useEffect(() => {
    writeStoredValue(playStoneSoundStorageKey, playStoneSound);
  }, [playStoneSound]);

  useEffect(() => {
    writeStoredValue(openLastSgfOnStartupStorageKey, openLastSgfOnStartup);
  }, [openLastSgfOnStartup]);

  useEffect(() => {
    writeStoredValue(showTipsOnStartupStorageKey, showTipsOnStartup);
  }, [showTipsOnStartup]);

  useEffect(() => {
    writeStoredValue(leftPanelOpenStorageKey, leftPanelOpen);
  }, [leftPanelOpen]);

  useEffect(() => {
    writeStoredValue(minimalRightPanelOpenStorageKey, minimalRightPanelOpen);
  }, [minimalRightPanelOpen]);

  useEffect(() => {
    writeStoredValue(minimalBasicToolsOpenStorageKey, minimalBasicToolsOpen);
  }, [minimalBasicToolsOpen]);

  useEffect(() => {
    writeStoredValue(minimalShowCoordinatesStorageKey, minimalShowCoordinates);
  }, [minimalShowCoordinates]);

  return {
    uiScale,
    setUiScale,
    showCoordinates,
    setShowCoordinates,
    playStoneSound,
    setPlayStoneSound,
    openLastSgfOnStartup,
    setOpenLastSgfOnStartup,
    showTipsOnStartup,
    setShowTipsOnStartup,
    leftPanelOpen,
    setLeftPanelOpen,
    minimalRightPanelOpen,
    setMinimalRightPanelOpen,
    minimalBasicToolsOpen,
    setMinimalBasicToolsOpen,
    minimalShowCoordinates,
    setMinimalShowCoordinates,
  };
}

export function readOpenLastSgfOnStartupPreference(): boolean {
  return readStoredBoolean(openLastSgfOnStartupStorageKey, capabilities.platform === 'web');
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

function readStoredNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (stored == null) return fallback;
    const value = Number(stored);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  } catch {
    return fallback;
  }
}

function defaultLeftPanelOpen(): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerWidth > 1366;
}

function writeStoredValue(key: string, value: boolean | number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage failures; the current session state is still updated.
  }
}
