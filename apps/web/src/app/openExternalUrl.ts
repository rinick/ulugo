export function openExternalUrl(url: string): void {
  if (window.ulugo != null) {
    void window.ulugo.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
