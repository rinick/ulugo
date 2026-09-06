import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {readKataGoVersionCatalog, refreshKataGoVersionCatalog} from '../src/katagoVersions';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, {recursive: true, force: true}))
  );
});

function release(version: string, variants: string[], flags = {}) {
  return {
    tag_name: version,
    draft: false,
    prerelease: false,
    ...flags,
    assets: variants.map((variant) => {
      const name = `katago-${version}-${variant}.zip`;
      return {name, browser_download_url: `https://github.com/lightvector/KataGo/releases/download/${version}/${name}`};
    }),
  };
}

describe('KataGo release catalog', () => {
  it.each(['win32', 'linux'])(
    'retains the newest build of each variant on %s after a CUDA-only release',
    async (platform) => {
      const suffix = platform === 'win32' ? 'windows-x64' : 'linux-x64';
      const cuda = `cuda12.1-cudnn9.8.0-${suffix}`;
      const variants = [
        cuda,
        `cuda12.1-cudnn8.9.7-${suffix}`,
        `opencl-${suffix}`,
        `eigen-${suffix}`,
        `eigenavx2-${suffix}`,
        `trt10.16-${suffix}`,
      ];
      const fetchMock = vi.fn(async (url: string) => {
        if (url === 'https://api.github.com/repos/lightvector/KataGo/releases?per_page=30') {
          return Response.json([
            release('v1.19.0', variants, {prerelease: true}),
            release('v1.20.0', variants, {draft: true}),
            release('v1.9.0', variants),
            release('v1.18.2', [cuda]),
            release('v1.18.1', [...variants, `opencl-${suffix}+bs50`, 'opencl-macos', 'opencl-windows-arm64']),
            release('v1.18.0', variants),
            release('v1.15.1', [`opencl-${suffix}+bs29`]),
          ]);
        }
        if (url.startsWith('https://katagotraining.org/api/networks/')) {
          return Response.json({next: null, results: []});
        }
        throw new Error(`Unexpected request: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ulugo-katago-versions-'));
      temporaryDirectories.push(directory);
      const catalogPath = path.join(directory, 'available-assets.json');

      const catalog = await refreshKataGoVersionCatalog(catalogPath, platform);

      expect(catalog.katago.map((asset) => asset.id)).toEqual([
        `katago-v1.18.2-${cuda}`,
        ...variants.slice(1).map((variant) => `katago-v1.18.1-${variant}`),
      ]);
      const opencl = catalog.katago.find((asset) => asset.notes === 'katagoOpenCL');
      expect(opencl?.url).toBe(
        `https://github.com/lightvector/KataGo/releases/download/v1.18.1/katago-v1.18.1-opencl-${suffix}.zip`
      );
      expect(await readKataGoVersionCatalog(catalogPath, platform)).toEqual(catalog);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const largeBoardAssets = release('v1.15.1', [`opencl-${suffix}+bs29`, `opencl-${suffix}+bs50`]).assets.map(
        (asset) => ({id: asset.name, label: asset.name, url: asset.browser_download_url})
      );
      await fs.writeFile(catalogPath, JSON.stringify({...catalog, katago: [...catalog.katago, ...largeBoardAssets]}));
      expect(await readKataGoVersionCatalog(catalogPath, platform)).toEqual(catalog);
    }
  );
});
