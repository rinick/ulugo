import {DownloadOutlined, GithubOutlined} from '@ant-design/icons';
import {Button, Spin} from 'antd';
import {type MouseEvent, useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';

const latestReleaseUrl = 'https://api.github.com/repos/rinick/ulugo/releases/latest';

interface GitHubRelease {
  name: string | null;
  tag_name: string;
  body: string | null;
  body_html?: string | null;
  html_url: string;
  published_at: string | null;
  assets: GitHubReleaseAsset[];
}

interface GitHubReleaseAsset {
  id: number;
  name: string;
  browser_download_url: string;
  size: number;
}

export function DesktopReleasePanel({active}: {active: boolean}) {
  const {t} = useTranslation();
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active || release != null) return;

    const controller = new AbortController();
    setLoading(true);
    setFailed(false);

    fetch(latestReleaseUrl, {headers: {Accept: 'application/vnd.github.full+json'}, signal: controller.signal})
      .then((response) => {
        if (!response.ok) throw new Error(`GitHub release request failed (${response.status}).`);
        return response.json() as Promise<GitHubRelease>;
      })
      .then(setRelease)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setFailed(true);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [active, release]);

  if (loading && release == null) {
    return (
      <div className="desktop-release-panel">
        <div className="desktop-release-state">
          <Spin size="small" />
        </div>
      </div>
    );
  }

  if (failed || release == null) {
    return (
      <div className="desktop-release-panel">
        <div className="desktop-release-state">
          <Button href="https://github.com/rinick/ulugo/releases/latest" target="_blank" rel="noreferrer">
            {t('downloadDesktopApp')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="desktop-release-panel">
      <div className="desktop-release-header">
        <GithubOutlined />
        <div>
          <a href={release.html_url} target="_blank" rel="noreferrer">
            {release.name || release.tag_name}
          </a>
          {release.published_at == null ? null : (
            <span>{new Intl.DateTimeFormat(undefined, {dateStyle: 'medium'}).format(new Date(release.published_at))}</span>
          )}
        </div>
      </div>
      {release.body_html != null && release.body_html.trim() !== '' ? (
        <div
          className="desktop-release-body"
          onClick={handleReleaseBodyClick}
          dangerouslySetInnerHTML={{__html: release.body_html}}
        />
      ) : release.body == null || release.body.trim() === '' ? null : (
        <div className="desktop-release-body plain">{release.body}</div>
      )}
      {release.assets.length === 0 ? null : (
        <div className="desktop-release-assets">
          {release.assets.map((asset) => (
            <Button
              key={asset.id}
              block
              className="desktop-release-download-button"
              href={asset.browser_download_url}
              icon={<DownloadOutlined />}
              target="_blank"
              rel="noreferrer"
              title={`${asset.name} (${formatBytes(asset.size)})`}
            >
              <span>{displayAssetName(asset.name)}</span>
              <span className="desktop-release-asset-size">{formatBytes(asset.size)}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function displayAssetName(name: string): string {
  return name.replace(/\.(zip|exe|AppImage)$/i, '');
}

function handleReleaseBodyClick(event: MouseEvent<HTMLDivElement>): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const anchor = target.closest('a');
  if (!(anchor instanceof HTMLAnchorElement) || anchor.href === '') return;
  event.preventDefault();
  window.open(anchor.href, '_blank', 'noopener,noreferrer');
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
