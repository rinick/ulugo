import {app} from 'electron';
import extract from 'extract-zip';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  isBs50KataGoBuild,
  readKataGoVersionCatalog,
  refreshKataGoVersionCatalog,
  type KataGoAssetCatalog,
  type KataGoAvailableAsset,
} from './katagoVersions';

export type {KataGoAssetCatalog, KataGoAvailableAsset} from './katagoVersions';

export type KataGoAssetKind = 'katago' | 'model';

export interface KataGoAsset {
  id: string;
  label: string;
  installed: boolean;
  available: boolean;
  notes?: string;
  url?: string;
  path?: string;
}

export interface KataGoDownloadProgress {
  kind: KataGoAssetKind;
  optionId: string;
  status: 'starting' | 'downloading' | 'extracting' | 'complete' | 'error';
  percent: number;
  message: string;
  path?: string;
}

const catalogFileName = 'available-assets.json';
export function ulugoDataDirectory(): string {
  return app.getPath('userData');
}

export function katagoInstallDirectory(): string {
  return path.join(ulugoDataDirectory(), 'katago');
}

export function modelInstallDirectory(): string {
  return path.join(ulugoDataDirectory(), 'models');
}

export async function ensureUlugoAssetDirectories(): Promise<void> {
  await Promise.all([
    fs.mkdir(katagoInstallDirectory(), {recursive: true}),
    fs.mkdir(modelInstallDirectory(), {recursive: true}),
  ]);
}

export async function readKataGoAssetCatalog(): Promise<KataGoAssetCatalog> {
  await ensureUlugoAssetDirectories();
  return readKataGoVersionCatalog(path.join(ulugoDataDirectory(), catalogFileName), process.platform);
}

export async function refreshKataGoAssetCatalog(platform = process.platform): Promise<KataGoAssetCatalog> {
  await ensureUlugoAssetDirectories();
  return refreshKataGoVersionCatalog(path.join(ulugoDataDirectory(), catalogFileName), platform);
}

export async function listKataGoAssets(catalog: KataGoAssetCatalog): Promise<{
  katago: KataGoAsset[];
  models: KataGoAsset[];
}> {
  await ensureUlugoAssetDirectories();
  const [katago, models] = await Promise.all([
    mergeAvailableAndInstalledAssets('katago', catalog.katago),
    mergeAvailableAndInstalledAssets('model', catalog.models),
  ]);
  return {katago, models};
}

export async function downloadKataGoAsset(
  option: KataGoAvailableAsset,
  kind: KataGoAssetKind,
  onProgress: (progress: KataGoDownloadProgress) => void
): Promise<{path: string}> {
  await ensureUlugoAssetDirectories();
  const directory = kind === 'katago' ? katagoInstallDirectory() : modelInstallDirectory();
  const fileName = path.basename(new URL(option.url).pathname);
  const installDirectory =
    kind === 'katago' ? path.join(directory, sanitizeFileName(option.id)) : directory;
  await fs.mkdir(installDirectory, {recursive: true});

  const downloadPath = path.join(installDirectory, fileName);
  const partialPath = `${downloadPath}.part`;

  try {
    onProgress({kind, optionId: option.id, status: 'starting', percent: 0, message: `Starting ${option.label}`});
    await downloadFile(option.url, partialPath, (percent) => {
      onProgress({
        kind,
        optionId: option.id,
        status: 'downloading',
        percent,
        message: `Downloading ${option.label}`,
      });
    });

    await fs.rename(partialPath, downloadPath);
    onProgress({kind, optionId: option.id, status: 'extracting', percent: 1, message: `Installing ${option.label}`});

    const installedPath = downloadPath.endsWith('.zip')
      ? await extractDownloadedAsset(downloadPath, installDirectory, kind)
      : downloadPath;
    if (kind === 'katago') {
      await makeExecutable(installedPath);
      await ensureKataGoConfig(path.dirname(installedPath));
      await writeInstallMetadata(path.dirname(installedPath), option);
    }

    onProgress({
      kind,
      optionId: option.id,
      status: 'complete',
      percent: 1,
      message: `${option.label} installed`,
      path: installedPath,
    });
    return {path: installedPath};
  } catch (error) {
    await fs.rm(partialPath, {force: true}).catch(() => undefined);
    const message = error instanceof Error ? error.message : `Failed to download ${option.label}`;
    onProgress({kind, optionId: option.id, status: 'error', percent: 0, message});
    throw error;
  }
}

export async function uninstallKataGoAsset(asset: KataGoAsset, kind: KataGoAssetKind): Promise<void> {
  if (asset.path == null || !isInsideUlugoAssets(asset.path)) return;

  if (kind === 'katago') {
    const root = katagoInstallDirectory();
    const relative = path.relative(root, asset.path);
    const top = relative.split(path.sep)[0];
    await fs.rm(path.join(root, top), {recursive: true, force: true});
    return;
  }

  await fs.rm(asset.path, {force: true});
}

export async function findDefaultKataGoConfig(directoryOrExecutablePath: string): Promise<string> {
  const stat = await fs.stat(directoryOrExecutablePath).catch(() => null);
  const directory = stat?.isDirectory() === true ? directoryOrExecutablePath : path.dirname(directoryOrExecutablePath);
  const ulugoConfig = path.join(directory, 'ulugo-analysis.cfg');
  if (await fileExists(ulugoConfig)) return ulugoConfig;

  const bundledConfig = await findFirstFile(directory, (file) => {
    const name = path.basename(file).toLowerCase();
    return name.endsWith('.cfg') && name.includes('analysis');
  });
  if (bundledConfig != null) return bundledConfig;
  return ensureKataGoConfig(directory);
}

export async function findInstalledAssetPath(kind: KataGoAssetKind, preferredPath: string): Promise<string> {
  const catalog = await readKataGoAssetCatalog();
  const inventory = await listKataGoAssets(catalog);
  const assets = kind === 'katago' ? inventory.katago : inventory.models;
  if (preferredPath !== '' && assets.some((asset) => asset.path === preferredPath) && (await fileExists(preferredPath)))
    return preferredPath;
  return assets.find((asset) => asset.path != null)?.path ?? '';
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listFiles(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, {withFileTypes: true});
    const nested = await Promise.all(
      entries.map((entry) => {
        const entryPath = path.join(directory, entry.name);
        return entry.isDirectory() ? listFiles(entryPath) : Promise.resolve([entryPath]);
      })
    );
    return nested.flat();
  } catch {
    return [];
  }
}

async function mergeAvailableAndInstalledAssets(
  kind: KataGoAssetKind,
  available: KataGoAvailableAsset[]
): Promise<KataGoAsset[]> {
  const directory = kind === 'katago' ? katagoInstallDirectory() : modelInstallDirectory();
  const files = (await listFiles(directory)).filter(
    (file) => isInstalledAssetCandidate(kind, file) && (kind !== 'katago' || !isBs50KataGoBuild(file))
  );
  const byId = new Map<string, KataGoAsset>();

  for (const option of available) {
    const installedPath = await findInstalledPathForOption(kind, option, files);
    byId.set(option.id, {
      id: option.id,
      label: option.label,
      url: option.url,
      notes: option.notes,
      available: true,
      installed: installedPath != null,
      path: installedPath ?? undefined,
    });
  }

  for (const file of files) {
    if ([...byId.values()].some((asset) => asset.path === file)) continue;
    byId.set(`custom:${file}`, {
      id: `custom:${file}`,
      label: path.basename(file),
      available: false,
      installed: true,
      path: file,
    });
  }

  return [...byId.values()].sort((a, b) => Number(b.installed) - Number(a.installed) || a.label.localeCompare(b.label));
}

async function findInstalledPathForOption(
  kind: KataGoAssetKind,
  option: KataGoAvailableAsset,
  files: string[]
): Promise<string | null> {
  if (kind === 'model') {
    const fileName = path.basename(new URL(option.url).pathname).replace(/\.zip$/i, '.bin.gz');
    return files.find((file) => path.basename(file) === fileName) ?? null;
  }

  for (const file of files) {
    const metadata = await readInstallMetadata(path.dirname(file));
    if (metadata?.id === option.id) return file;
  }
  const installDirectory = path.join(katagoInstallDirectory(), sanitizeFileName(option.id));
  return files.find((file) => file.startsWith(`${installDirectory}${path.sep}`)) ?? null;
}

async function downloadFile(url: string, destination: string, onProgress: (percent: number) => void): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || response.body == null)
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);

  const total = Number(response.headers.get('content-length') ?? 0);
  let received = 0;
  const file = await fs.open(destination, 'w');

  try {
    const reader = response.body.getReader();
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      received += result.value.byteLength;
      await file.write(Buffer.from(result.value));
      onProgress(total > 0 ? received / total : 0);
    }
  } finally {
    await file.close();
  }
}

async function extractDownloadedAsset(
  zipPath: string,
  destination: string,
  kind: KataGoAssetKind
): Promise<string> {
  const existingFiles = new Set(await listFiles(destination));
  await extract(zipPath, {dir: destination});
  await fs.rm(zipPath, {force: true});

  const extractedFiles = (await listFiles(destination)).filter((file) => !existingFiles.has(file));
  const files = extractedFiles.length > 0 ? extractedFiles : await listFiles(destination);
  const installed = files.find((file) => isInstalledAssetCandidate(kind, file));

  if (installed == null) throw new Error(`Could not find installed ${kind} file in downloaded archive.`);
  return installed;
}

function isInstalledAssetCandidate(kind: KataGoAssetKind, file: string): boolean {
  const name = path.basename(file).toLowerCase();
  if (kind === 'model') return name.endsWith('.bin.gz') || name.endsWith('.txt.gz');
  if (!name.startsWith('katago')) return false;
  if (name.endsWith('.dll') || name.endsWith('.txt') || name.endsWith('.cfg') || name.endsWith('.json')) return false;
  return process.platform === 'win32' ? name.endsWith('.exe') : !name.includes('.');
}

async function ensureKataGoConfig(directory: string): Promise<string> {
  const configPath = path.join(directory, 'ulugo-analysis.cfg');
  if (await fileExists(configPath)) return configPath;

  await fs.mkdir(directory, {recursive: true});
  await fs.writeFile(configPath, defaultKataGoConfigText(), 'utf8');
  return configPath;
}

function defaultKataGoConfigText(): string {
  return [
    '# Ulugo KataGo analysis config',
    '# Created automatically. You can edit this file for advanced KataGo tuning.',
    '',
    'reportAnalysisWinratesAs = BLACK',
    'conservativePass = true',
    'maxVisits = 500',
    'numAnalysisThreads = 2',
    'numSearchThreads = 8',
    'nnMaxBatchSize = 32',
    'nnCacheSizePowerOfTwo = 20',
    'nnMutexPoolSizePowerOfTwo = 16',
    'nnRandomize = true',
    '',
  ].join('\n');
}

async function writeInstallMetadata(directory: string, option: KataGoAvailableAsset): Promise<void> {
  await fs.writeFile(path.join(directory, 'ulugo-install.json'), JSON.stringify(option, null, 2), 'utf8');
}

async function readInstallMetadata(directory: string): Promise<KataGoAvailableAsset | null> {
  try {
    const raw = await fs.readFile(path.join(directory, 'ulugo-install.json'), 'utf8');
    const value = JSON.parse(raw) as Partial<KataGoAvailableAsset>;
    if (typeof value.id === 'string' && typeof value.label === 'string' && typeof value.url === 'string')
      return value as KataGoAvailableAsset;
    return null;
  } catch {
    return null;
  }
}

async function findFirstFile(directory: string, predicate: (file: string) => boolean): Promise<string | null> {
  for (const file of await listFiles(directory)) {
    if (predicate(file)) return file;
  }
  return null;
}

async function makeExecutable(filePath: string): Promise<void> {
  if (process.platform !== 'win32') await fs.chmod(filePath, 0o755);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'katago';
}

function isInsideUlugoAssets(filePath: string): boolean {
  const relative = path.relative(ulugoDataDirectory(), filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
