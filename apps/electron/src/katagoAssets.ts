import {app} from 'electron';
import extract from 'extract-zip';
import fs from 'node:fs/promises';
import path from 'node:path';

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

export interface KataGoAvailableAsset {
  id: string;
  label: string;
  url: string;
  notes?: string;
}

export interface KataGoAssetCatalog {
  updatedAt: string;
  katago: KataGoAvailableAsset[];
  models: KataGoAvailableAsset[];
}

export interface KataGoDownloadProgress {
  kind: KataGoAssetKind;
  optionId: string;
  status: 'starting' | 'downloading' | 'extracting' | 'complete' | 'error';
  percent: number;
  message: string;
  path?: string;
}

interface KataGoNetworksResponse {
  next: string | null;
  results: KataGoNetwork[];
}

interface KataGoNetwork {
  name: string;
  model_file: string;
  model_file_bytes?: number | null;
  network_size?: string | null;
  is_random?: boolean;
  log_gamma?: number | null;
  train_step?: number | null;
  total_num_data_rows?: number | null;
}

const catalogFileName = 'available-assets.json';
const legacyModelOptionIds = new Set(['recommended-18b', 'old-15b', 'old-20b', 'old-30b', 'fat-40b']);
export function ulugoDataDirectory(): string {
  return path.join(app.getPath('home'), '.ulugo');
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
  try {
    const raw = await fs.readFile(path.join(ulugoDataDirectory(), catalogFileName), 'utf8');
    return normalizeCatalog(JSON.parse(raw));
  } catch {
    const catalog = fallbackCatalog();
    await writeKataGoAssetCatalog(catalog);
    return catalog;
  }
}

export async function refreshKataGoAssetCatalog(platform = process.platform): Promise<KataGoAssetCatalog> {
  const [katago, models] = await Promise.all([fetchLatestKataGoBuilds(platform), fetchBestKata1ModelsByPrefix()]);
  const catalog = {
    updatedAt: new Date().toISOString(),
    katago: katago.length > 0 ? katago : fallbackCatalog().katago,
    models: models.length > 0 ? models : fallbackCatalog().models,
  };
  await writeKataGoAssetCatalog(catalog);
  return catalog;
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

async function fetchLatestKataGoBuilds(platform: string): Promise<KataGoAvailableAsset[]> {
  const response = await fetch('https://api.github.com/repos/lightvector/KataGo/releases/latest', {
    headers: {'User-Agent': 'Ulugo'},
  });
  if (!response.ok) throw new Error(`Failed to refresh KataGo builds: ${response.status} ${response.statusText}`);
  const release = (await response.json()) as {
    tag_name?: string;
    assets?: Array<{name?: string; browser_download_url?: string}>;
  };
  const platformKey = platform === 'win32' ? 'windows-x64' : platform === 'linux' ? 'linux-x64' : 'macos';
  const assets = release.assets ?? [];

  return assets
    .filter((asset) => asset.name?.endsWith('.zip') && asset.name.includes(platformKey) && !isBs50KataGoBuild(asset.name))
    .map((asset) => {
      const name = asset.name ?? '';
      return {
        id: name.replace(/\.zip$/i, ''),
        label: buildNameFromFileName(name),
        notes: buildNotesFromFileName(name),
        url: asset.browser_download_url ?? '',
      };
    })
    .filter((asset) => asset.url !== '');
}

async function fetchBestKata1ModelsByPrefix(): Promise<KataGoAvailableAsset[]> {
  const networks = await fetchKata1Networks();
  const bestByPrefix = new Map<string, KataGoNetwork>();

  for (const network of networks) {
    const prefix = kata1ModelPrefix(network.name);
    if (prefix == null) continue;

    const current = bestByPrefix.get(prefix);
    if (current == null || compareKataGoNetworks(network, current) > 0) bestByPrefix.set(prefix, network);
  }

  const best = [...bestByPrefix.values()];
  const strongest = best.reduce<KataGoNetwork | null>(
    (current, network) => (current == null || compareKataGoNetworks(network, current) > 0 ? network : current),
    null
  );
  const fastest = best.reduce<KataGoNetwork | null>(
    (current, network) =>
      current == null ||
      (network.model_file_bytes ?? Number.MAX_SAFE_INTEGER) < (current.model_file_bytes ?? Number.MAX_SAFE_INTEGER)
        ? network
        : current,
    null
  );

  return best
    .map((network) => ({
      id: `kata1:${network.name}`,
      label: `${network.name}.bin.gz`,
      url: network.model_file,
      notes: network === strongest ? 'strongest' : network === fastest ? 'fastest' : undefined,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function fetchKata1Networks(): Promise<KataGoNetwork[]> {
  const networks: KataGoNetwork[] = [];
  let url: string | null = 'https://katagotraining.org/api/networks/?page_size=100';
  let pageCount = 0;

  while (url != null && pageCount < 100) {
    pageCount += 1;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to refresh KataGo models: ${response.status} ${response.statusText}`);

    const page = (await response.json()) as KataGoNetworksResponse;
    networks.push(
      ...page.results.filter((network) => {
        return (
          network.name.startsWith('kata1-') &&
          typeof network.model_file === 'string' &&
          network.model_file !== '' &&
          network.is_random !== true
        );
      })
    );
    url = page.next;
  }

  return networks;
}

function kata1ModelPrefix(name: string): string | null {
  const match = /^(kata1-(?:[a-z0-9]+-)?b\d+c\d+nbt)(?:-|$)/i.exec(name);
  return match?.[1] ?? null;
}

function compareKataGoNetworks(first: KataGoNetwork, second: KataGoNetwork): number {
  return (
    comparableNumber(first.log_gamma) - comparableNumber(second.log_gamma) ||
    comparableNumber(first.train_step) - comparableNumber(second.train_step) ||
    comparableNumber(first.total_num_data_rows) - comparableNumber(second.total_num_data_rows)
  );
}

function comparableNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function fallbackCatalog(): KataGoAssetCatalog {
  return {
    updatedAt: new Date(0).toISOString(),
    katago: fallbackKataGoBuilds(process.platform),
    models: [],
  };
}

function fallbackKataGoBuilds(platform: string): KataGoAvailableAsset[] {
  const suffix = platform === 'win32' ? 'windows-x64' : platform === 'linux' ? 'linux-x64' : null;
  if (suffix == null) return [];
  return [
    {
      id: `katago-v1.16.0-opencl-${suffix}`,
      label: buildNameFromFileName(`katago-v1.16.0-opencl-${suffix}.zip`),
      notes: buildNotesFromFileName(`katago-v1.16.0-opencl-${suffix}.zip`),
      url: `https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-opencl-${suffix}.zip`,
    },
    {
      id: `katago-v1.16.0-eigenavx2-${suffix}`,
      label: buildNameFromFileName(`katago-v1.16.0-eigenavx2-${suffix}.zip`),
      notes: buildNotesFromFileName(`katago-v1.16.0-eigenavx2-${suffix}.zip`),
      url: `https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-eigenavx2-${suffix}.zip`,
    },
    {
      id: `katago-v1.16.0-eigen-${suffix}`,
      label: buildNameFromFileName(`katago-v1.16.0-eigen-${suffix}.zip`),
      notes: buildNotesFromFileName(`katago-v1.16.0-eigen-${suffix}.zip`),
      url: `https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-eigen-${suffix}.zip`,
    },
  ];
}

function normalizeCatalog(value: Partial<KataGoAssetCatalog>): KataGoAssetCatalog {
  return {
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString(),
    katago: normalizeAvailableAssets(value.katago)
      .map(normalizeKataGoBuildOption)
      .filter((asset) => !isBs50KataGoBuild(kataGoBuildFileName(asset))),
    models: normalizeAvailableAssets(value.models).filter((asset) => !legacyModelOptionIds.has(asset.id)),
  };
}

function normalizeAvailableAssets(value: unknown): KataGoAvailableAsset[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is KataGoAvailableAsset => {
    return (
      item != null &&
      typeof item === 'object' &&
      typeof (item as KataGoAvailableAsset).id === 'string' &&
      typeof (item as KataGoAvailableAsset).label === 'string' &&
      typeof (item as KataGoAvailableAsset).url === 'string'
    );
  });
}

function normalizeKataGoBuildOption(asset: KataGoAvailableAsset): KataGoAvailableAsset {
  const fileName = kataGoBuildFileName(asset);
  return {...asset, label: buildNameFromFileName(fileName), notes: buildNotesFromFileName(fileName)};
}

function kataGoBuildFileName(asset: KataGoAvailableAsset): string {
  try {
    const fileName = decodeURIComponent(path.basename(new URL(asset.url).pathname));
    if (fileName !== '') return fileName;
  } catch {
    // Fall back to the persisted id for older or manually edited catalogs.
  }
  return `${asset.id}.zip`;
}

async function writeKataGoAssetCatalog(catalog: KataGoAssetCatalog): Promise<void> {
  await fs.mkdir(ulugoDataDirectory(), {recursive: true});
  await fs.writeFile(path.join(ulugoDataDirectory(), catalogFileName), JSON.stringify(catalog, null, 2), 'utf8');
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

function buildNameFromFileName(fileName: string): string {
  return fileName.replace(/\.zip$/i, '');
}

function buildNotesFromFileName(fileName: string): string | undefined {
  const lower = fileName.toLowerCase();

  if (lower.includes('opencl')) return 'katagoOpenCL';
  if (lower.includes('eigenavx2')) return 'katagoEigenAvx2';
  if (lower.includes('eigen')) return 'katagoEigenCpu';
  if (lower.includes('cuda')) return 'katagoCuda';
  if (lower.includes('trt')) return 'katagoTensorRT';
  return undefined;
}

function isBs50KataGoBuild(value: string): boolean {
  return value.toLowerCase().includes('bs50');
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'katago';
}

function isInsideUlugoAssets(filePath: string): boolean {
  const relative = path.relative(ulugoDataDirectory(), filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
