import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  assignKeyboardShortcut,
  defaultKeyboardShortcuts,
  isReservedKeyboardShortcut,
  readKeyboardShortcuts,
} from './keyboardShortcuts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('move editing keyboard shortcuts', () => {
  it('assigns 4 to insert move and leaves delete move unassigned by default', () => {
    expect(defaultKeyboardShortcuts.insertMove).toEqual({key: '4', ctrl: false, alt: false, shift: false});
    expect(defaultKeyboardShortcuts.deleteMove).toBeNull();
  });

  it('migrates the old replace move shortcut to insert move', () => {
    const replaceMove = {key: 'x', ctrl: false, alt: true, shift: false};
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({replaceMove}),
    });

    expect(readKeyboardShortcuts().insertMove).toEqual(replaceMove);
  });
});

describe('reserved keyboard shortcuts', () => {
  it('reserves Ctrl+V without reserving modified variants', () => {
    expect(isReservedKeyboardShortcut({key: 'v', ctrl: true, alt: false, shift: false})).toBe(true);
    expect(isReservedKeyboardShortcut({key: 'v', ctrl: true, alt: false, shift: true})).toBe(false);
    expect(isReservedKeyboardShortcut({key: 'v', ctrl: true, alt: true, shift: false})).toBe(false);
  });

  it('does not assign Ctrl+V to a custom action', () => {
    const next = assignKeyboardShortcut(defaultKeyboardShortcuts, 'pass', {
      key: 'v',
      ctrl: true,
      alt: false,
      shift: false,
    });

    expect(next).toBe(defaultKeyboardShortcuts);

    const navigation = assignKeyboardShortcut(defaultKeyboardShortcuts, 'previousMove', {
      key: 'v',
      ctrl: true,
      alt: false,
      shift: false,
    });
    expect(navigation).toBe(defaultKeyboardShortcuts);
  });
});
