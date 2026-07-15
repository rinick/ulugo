import {useEffect, useState} from 'react';
import {capabilities} from './capabilities';

const uiScaleStorageKey = 'ulugo.uiScale';
const showCoordinatesStorageKey = 'ulugo.showCoordinates';
const playStoneSoundStorageKey = 'ulugo.playStoneSound';
const openLastSgfOnStartupStorageKey = 'ulugo.openLastSgfOnStartup';
const leftPanelOpenStorageKey = 'ulugo.leftPanelOpen';

export function useAppPreferences() {
  const [uiScale, setUiScale] = useState(() => readStoredNumber(uiScaleStorageKey, 100, 25, 400));
  const [showCoordinates, setShowCoordinates] = useState(() => readStoredBoolean(showCoordinatesStorageKey, true));
  const [playStoneSound, setPlayStoneSound] = useState(() => readStoredBoolean(playStoneSoundStorageKey, true));
  const [openLastSgfOnStartup, setOpenLastSgfOnStartup] = useState(readOpenLastSgfOnStartupPreference);
  const [leftPanelOpen, setLeftPanelOpen] = useState(() =>
    readStoredBoolean(leftPanelOpenStorageKey, defaultLeftPanelOpen())
  );

  useEffect(() => {
    const root = globalThis.document.getElementById('root');
    if (root != null) root.style.zoom = `${uiScale}%`;
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
    writeStoredValue(leftPanelOpenStorageKey, leftPanelOpen);
  }, [leftPanelOpen]);

  return {
    uiScale,
    setUiScale,
    showCoordinates,
    setShowCoordinates,
    playStoneSound,
    setPlayStoneSound,
    openLastSgfOnStartup,
    setOpenLastSgfOnStartup,
    leftPanelOpen,
    setLeftPanelOpen,
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
  return window.innerWidth >= 1200;
}

function writeStoredValue(key: string, value: boolean | number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage failures; the current session state is still updated.
  }
}
