export interface KeyboardShortcut {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

export type ShortcutActionId =
  | 'open'
  | 'save'
  | 'gameInfo'
  | 'previousMove'
  | 'nextMoveMain'
  | 'nextMoveCurrent'
  | 'previousBranch'
  | 'nextBranch'
  | 'playBestMove'
  | 'pass'
  | 'toolAuto'
  | 'toolBlack'
  | 'toolWhite'
  | 'replaceMove'
  | 'addLabel'
  | 'addCircle'
  | 'addSquare'
  | 'addTriangle'
  | 'addCross'
  | 'eraseMarkup'
  | 'moveBranchToMain'
  | 'moveBranchLeft'
  | 'moveBranchRight'
  | 'deleteBranch'
  | 'toggleShowCoordinates'
  | 'toggleShowNextMove'
  | 'toggleReviewEditMode'
  | 'toggleDisplayDot'
  | 'toggleDisplayNumber'
  | 'toggleTerritory'
  | 'toggleScore'
  | 'togglePointLoss'
  | 'toggleWinrate'
  | 'toggleComments'
  | 'toggleAnalysisMode'
  | 'toggleDeepAnalysisMode';

export type KeyboardShortcutConfig = Record<ShortcutActionId, KeyboardShortcut | null>;

export interface ShortcutAction {
  id: ShortcutActionId;
  labelKey: string;
  defaultShortcut: KeyboardShortcut | null;
  navigation?: boolean;
  electronOnly?: boolean;
}

const keyboardShortcutsStorageKey = 'ulugo.keyboardShortcuts';

export const shortcutActions: ShortcutAction[] = [
  {id: 'open', labelKey: 'shortcuts.actions.open', defaultShortcut: shortcut('o', {ctrl: true})},
  {id: 'save', labelKey: 'shortcuts.actions.save', defaultShortcut: shortcut('s', {ctrl: true})},
  {id: 'gameInfo', labelKey: 'shortcuts.actions.gameInfo', defaultShortcut: shortcut('i', {ctrl: true})},
  {
    id: 'previousMove',
    labelKey: 'shortcuts.actions.previousMove',
    defaultShortcut: shortcut('ArrowUp'),
    navigation: true,
  },
  {
    id: 'nextMoveMain',
    labelKey: 'shortcuts.actions.nextMoveMain',
    defaultShortcut: shortcut('ArrowDown'),
    navigation: true,
  },
  {id: 'nextMoveCurrent', labelKey: 'shortcuts.actions.nextMoveCurrent', defaultShortcut: null, navigation: true},
  {
    id: 'previousBranch',
    labelKey: 'shortcuts.actions.previousBranch',
    defaultShortcut: shortcut('ArrowLeft'),
    navigation: true,
  },
  {
    id: 'nextBranch',
    labelKey: 'shortcuts.actions.nextBranch',
    defaultShortcut: shortcut('ArrowRight'),
    navigation: true,
  },
  {
    id: 'playBestMove',
    labelKey: 'shortcuts.actions.playBestMove',
    defaultShortcut: shortcut('Enter'),
    electronOnly: true,
  },
  {id: 'pass', labelKey: 'shortcuts.actions.pass', defaultShortcut: shortcut('p')},
  {id: 'toolAuto', labelKey: 'shortcuts.actions.toolAuto', defaultShortcut: shortcut('1')},
  {id: 'toolBlack', labelKey: 'shortcuts.actions.toolBlack', defaultShortcut: shortcut('2')},
  {id: 'toolWhite', labelKey: 'shortcuts.actions.toolWhite', defaultShortcut: shortcut('3')},
  {id: 'replaceMove', labelKey: 'shortcuts.actions.replaceMove', defaultShortcut: null},
  {id: 'addLabel', labelKey: 'shortcuts.actions.addLabel', defaultShortcut: shortcut('4')},
  {id: 'addCircle', labelKey: 'shortcuts.actions.addCircle', defaultShortcut: shortcut('5')},
  {id: 'addSquare', labelKey: 'shortcuts.actions.addSquare', defaultShortcut: shortcut('6')},
  {id: 'addTriangle', labelKey: 'shortcuts.actions.addTriangle', defaultShortcut: shortcut('7')},
  {id: 'addCross', labelKey: 'shortcuts.actions.addCross', defaultShortcut: shortcut('8')},
  {id: 'eraseMarkup', labelKey: 'shortcuts.actions.eraseMarkup', defaultShortcut: shortcut('9')},
  {id: 'moveBranchToMain', labelKey: 'shortcuts.actions.moveBranchToMain', defaultShortcut: shortcut('\\')},
  {id: 'moveBranchLeft', labelKey: 'shortcuts.actions.moveBranchLeft', defaultShortcut: null},
  {id: 'moveBranchRight', labelKey: 'shortcuts.actions.moveBranchRight', defaultShortcut: null},
  {id: 'deleteBranch', labelKey: 'shortcuts.actions.deleteBranch', defaultShortcut: shortcut('Delete')},
  {id: 'toggleShowCoordinates', labelKey: 'shortcuts.actions.toggleShowCoordinates', defaultShortcut: shortcut('`')},
  {
    id: 'toggleShowNextMove',
    labelKey: 'shortcuts.actions.toggleShowNextMove',
    defaultShortcut: shortcut('q'),
  },
  {
    id: 'toggleReviewEditMode',
    labelKey: 'shortcuts.actions.toggleReviewEditMode',
    defaultShortcut: shortcut('w'),
    electronOnly: true,
  },
  {
    id: 'toggleDisplayDot',
    labelKey: 'shortcuts.actions.toggleDisplayDot',
    defaultShortcut: shortcut('e'),
    electronOnly: true,
  },
  {id: 'toggleDisplayNumber', labelKey: 'shortcuts.actions.toggleDisplayNumber', defaultShortcut: shortcut('r')},
  {
    id: 'toggleTerritory',
    labelKey: 'shortcuts.actions.toggleTerritory',
    defaultShortcut: shortcut('t'),
    electronOnly: true,
  },
  {id: 'toggleScore', labelKey: 'shortcuts.actions.toggleScore', defaultShortcut: shortcut('y'), electronOnly: true},
  {
    id: 'togglePointLoss',
    labelKey: 'shortcuts.actions.togglePointLoss',
    defaultShortcut: shortcut('u'),
    electronOnly: true,
  },
  {
    id: 'toggleWinrate',
    labelKey: 'shortcuts.actions.toggleWinrate',
    defaultShortcut: shortcut('i'),
    electronOnly: true,
  },
  {id: 'toggleComments', labelKey: 'shortcuts.actions.toggleComments', defaultShortcut: shortcut('o')},
  {
    id: 'toggleAnalysisMode',
    labelKey: 'shortcuts.actions.toggleAnalysisMode',
    defaultShortcut: shortcut('Space'),
    electronOnly: true,
  },
  {
    id: 'toggleDeepAnalysisMode',
    labelKey: 'shortcuts.actions.toggleDeepAnalysisMode',
    defaultShortcut: shortcut('Space', {shift: true}),
    electronOnly: true,
  },
];

export const defaultKeyboardShortcuts: KeyboardShortcutConfig = shortcutActions.reduce(
  (config, action) => ({...config, [action.id]: action.defaultShortcut}),
  {} as KeyboardShortcutConfig
);

export function readKeyboardShortcuts(): KeyboardShortcutConfig {
  try {
    const value = localStorage.getItem(keyboardShortcutsStorageKey);
    if (value == null) return defaultKeyboardShortcuts;
    const stored = JSON.parse(value) as Partial<
      Record<ShortcutActionId | 'toggleShowTopMoves', KeyboardShortcut | null>
    >;
    return shortcutActions.reduce(
      (config, action) => ({
        ...config,
        [action.id]: normalizeStoredShortcut(stored[action.id] ?? storedShortcutFallback(stored, action.id), action),
      }),
      {} as KeyboardShortcutConfig
    );
  } catch {
    return defaultKeyboardShortcuts;
  }
}

function storedShortcutFallback(
  stored: Partial<Record<ShortcutActionId | 'toggleShowTopMoves', KeyboardShortcut | null>>,
  actionId: ShortcutActionId
): KeyboardShortcut | null | undefined {
  if (actionId === 'toggleReviewEditMode') return stored.toggleShowTopMoves;
  return undefined;
}

export function writeKeyboardShortcuts(config: KeyboardShortcutConfig): void {
  try {
    localStorage.setItem(keyboardShortcutsStorageKey, JSON.stringify(config));
  } catch {
    // Ignore storage failures; the current session shortcuts still apply.
  }
}

export function assignKeyboardShortcut(
  config: KeyboardShortcutConfig,
  actionId: ShortcutActionId,
  shortcutValue: KeyboardShortcut | null
): KeyboardShortcutConfig {
  const action = shortcutActions.find((item) => item.id === actionId);
  if (action == null) return config;

  const nextShortcut = shortcutValue == null ? null : normalizeShortcut(shortcutValue, action.navigation === true);
  const next = {...config, [actionId]: nextShortcut};
  if (nextShortcut == null) return next;

  for (const other of shortcutActions) {
    if (other.id === actionId) continue;
    const otherShortcut = next[other.id];
    if (otherShortcut != null && shortcutsConflict(nextShortcut, action, otherShortcut, other)) next[other.id] = null;
  }

  return next;
}

export function keyboardEventToShortcut(event: KeyboardEvent, navigation = false): KeyboardShortcut | null {
  const key = normalizeKey(event.key);
  if (key == null) return null;
  return normalizeShortcut(
    {
      key,
      ctrl: event.ctrlKey || event.metaKey,
      alt: event.altKey,
      shift: event.shiftKey,
    },
    navigation
  );
}

export function shortcutActionForEvent(event: KeyboardEvent, config: KeyboardShortcutConfig): ShortcutActionId | null {
  const eventShortcut = keyboardEventToShortcut(event);
  if (eventShortcut == null) return null;

  for (const action of shortcutActions) {
    const configured = config[action.id];
    if (configured == null) continue;
    if (shortcutMatchesEvent(configured, action, eventShortcut)) return action.id;
  }

  return null;
}

export function shortcutLabel(shortcutValue: KeyboardShortcut | null): string {
  if (shortcutValue == null) return '';
  const parts = [
    shortcutValue.ctrl ? 'Ctrl' : null,
    shortcutValue.alt ? 'Alt' : null,
    shortcutValue.shift ? 'Shift' : null,
    displayKey(shortcutValue.key),
  ].filter((part): part is string => part != null && part !== '');
  return parts.join('+');
}

function shortcut(key: string, modifiers: Partial<Omit<KeyboardShortcut, 'key'>> = {}): KeyboardShortcut {
  return {
    key,
    ctrl: modifiers.ctrl ?? false,
    alt: modifiers.alt ?? false,
    shift: modifiers.shift ?? false,
  };
}

function normalizeStoredShortcut(
  value: KeyboardShortcut | null | undefined,
  action: ShortcutAction
): KeyboardShortcut | null {
  if (value == null) return value === null ? null : action.defaultShortcut;
  if (typeof value.key !== 'string') return action.defaultShortcut;
  return normalizeShortcut(
    {
      key: normalizeKey(value.key) ?? value.key,
      ctrl: value.ctrl === true,
      alt: value.alt === true,
      shift: value.shift === true,
    },
    action.navigation === true
  );
}

function normalizeShortcut(value: KeyboardShortcut, navigation: boolean): KeyboardShortcut {
  const key = normalizeKey(value.key) ?? value.key;
  return {
    key,
    ctrl: navigation ? false : value.ctrl,
    alt: navigation ? false : value.alt,
    shift: navigation ? false : value.shift,
  };
}

function shortcutsConflict(
  left: KeyboardShortcut,
  leftAction: ShortcutAction,
  right: KeyboardShortcut,
  rightAction: ShortcutAction
): boolean {
  if (left.key !== right.key) return false;
  if (leftAction.navigation === true || rightAction.navigation === true) return true;
  return left.ctrl === right.ctrl && left.alt === right.alt && left.shift === right.shift;
}

function shortcutMatchesEvent(
  configured: KeyboardShortcut,
  action: ShortcutAction,
  eventShortcut: KeyboardShortcut
): boolean {
  if (configured.key !== eventShortcut.key) return false;
  if (action.navigation === true) return true;
  return (
    configured.ctrl === eventShortcut.ctrl &&
    configured.alt === eventShortcut.alt &&
    configured.shift === eventShortcut.shift
  );
}

function normalizeKey(key: string): string | null {
  if (key === ' ' || key === 'Spacebar') return 'Space';
  if (key.length === 1) return key.toLowerCase();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;
  return key;
}

function displayKey(key: string): string {
  if (key === 'Space') return 'Space';
  if (key === 'ArrowUp') return 'Up';
  if (key === 'ArrowDown') return 'Down';
  if (key === 'ArrowLeft') return 'Left';
  if (key === 'ArrowRight') return 'Right';
  return key.length === 1 ? key.toUpperCase() : key;
}
