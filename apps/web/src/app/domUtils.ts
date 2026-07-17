export function isTextInputActive(): boolean {
  const element = window.document.activeElement;
  if (element == null) return false;
  return isTextInputElement(element);
}

export function isPopupOpen(): boolean {
  return Array.from(
    window.document.querySelectorAll<HTMLElement>(
      [
        '.ant-dropdown:not(.ant-dropdown-hidden)',
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden)',
        '.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)',
        '.ant-cascader-dropdown:not(.ant-cascader-dropdown-hidden)',
        '.ant-popover:not(.ant-popover-hidden)',
      ].join(',')
    )
  ).some((element) => element.getClientRects().length > 0 && window.getComputedStyle(element).visibility !== 'hidden');
}

export function blurNonTextControlFocus(): void {
  const element = window.document.activeElement;
  if (!(element instanceof HTMLElement)) return;
  if (isTextInputElement(element) || isPopupOpen()) return;
  element.blur();
}

export function isModalOpen(): boolean {
  return Array.from(window.document.querySelectorAll<HTMLElement>('.ant-modal-root .ant-modal-wrap')).some(
    (element) => element.getClientRects().length > 0 && window.getComputedStyle(element).visibility !== 'hidden'
  );
}

function isTextInputElement(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(
      element.type
    );
  }
  return element instanceof HTMLElement && element.isContentEditable;
}
