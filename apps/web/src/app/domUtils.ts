export function isTextInputActive(): boolean {
  const element = window.document.activeElement;
  if (element == null) return false;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  )
    return true;
  return element instanceof HTMLElement && element.isContentEditable;
}

export function isModalOpen(): boolean {
  return Array.from(window.document.querySelectorAll<HTMLElement>('.ant-modal-root .ant-modal-wrap')).some(
    (element) => element.getClientRects().length > 0 && window.getComputedStyle(element).visibility !== 'hidden'
  );
}
