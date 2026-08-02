import {describe, expect, it} from 'vitest';
import {
  assignKeyboardShortcut,
  defaultKeyboardShortcuts,
  isReservedKeyboardShortcut,
} from './keyboardShortcuts';

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
