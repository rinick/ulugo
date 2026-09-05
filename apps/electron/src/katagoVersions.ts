import fs from 'node:fs/promises';
import path from 'node:path';

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

interface KataGoNetworksResponse {
  next: string | null;
  results: KataGoNetwork[];
}

interface KataGoNetwork {
  name: string;
  model_file: string;
  model_file_bytes?: number | null;
  is_random?: boolean;
  log_gamma?: number | null;
  train_step?: number | null;
  total_num_data_rows?: number | null;
}

const legacyModelOptionIds = new Set(['recommended-18b', 'old-15b', 'old-20b', 'old-30b', 'fat-40b']);
const recommendedB18ModelPrefix = 'kata1-b18c384nbt';
const knownKata1ModelPrefixes = [
  recommendedB18ModelPrefix,
  'kata1-b28c512nbt',
  'kata1-zhizi-b28c512nbt',
  'kata1-zhizi-b40c768nbt',
];
const maxKataGoModelCatalogPages = 5;
const kataGoModelCatalogPageSize = 100;
const recommendedB18Model: KataGoAvailableAsset = {
  id: 'kata1:kata1-b18c384nbt-s9996604416-d4316597426',
  label: 'kata1-b18c384nbt-s9996604416-d4316597426.bin.gz',
  url: 'https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz',
};
type KataGoCatalogProgress = (message: string) => void;

export async function readKataGoVersionCatalog(catalogPath: string, platform: string): Promise<KataGoAssetCatalog> {
  try {
    const raw = await fs.readFile(catalogPath, 'utf8');
    return normalizeCatalog(JSON.parse(raw));
  } catch {
    const catalog = fallbackCatalog(platform);
    await writeKataGoVersionCatalog(catalogPath, catalog);
    return catalog;
  }
}

export async function refreshKataGoVersionCatalog(
  catalogPath: string,
  platform: string,
  onProgress?: KataGoCatalogProgress
): Promise<KataGoAssetCatalog> {
  const [katago, models] = await Promise.all([
    fetchLatestKataGoBuilds(platform, onProgress),
    fetchKnownKata1Models(onProgress),
  ]);
  const catalog = {
    updatedAt: new Date().toISOString(),
    katago: katago.length > 0 ? katago : fallbackCatalog(platform).katago,
    models,
  };
  onProgress?.('Saving KataGo availability catalog.');
  await writeKataGoVersionCatalog(catalogPath, catalog);
  return catalog;
}

export function isLargeBoardKataGoBuild(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.includes('bs29') || lower.includes('bs50');
}

async function fetchLatestKataGoBuilds(
  platform: string,
  onProgress?: KataGoCatalogProgress
): Promise<KataGoAvailableAsset[]> {
  onProgress?.('Checking latest KataGo builds from GitHub.');
  const response = await fetch('https://api.github.com/repos/lightvector/KataGo/releases?per_page=30', {
    headers: {'User-Agent': 'Ulugo'},
  });
  if (!response.ok) throw new Error(`Failed to refresh KataGo builds: ${response.status} ${response.statusText}`);
  const releases = (await response.json()) as Array<{
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
    assets?: Array<{name?: string; browser_download_url?: string}>;
  }>;
  const platformKey = platform === 'win32' ? 'windows-x64' : platform === 'linux' ? 'linux-x64' : 'macos';

  const builds = new Map<string, KataGoAvailableAsset>();
  const stableReleases = releases
    .filter((release) => !release.draft && !release.prerelease)
    .sort((a, b) => b.tag_name.localeCompare(a.tag_name, 'en', {numeric: true}));
  for (const release of stableReleases) {
    for (const asset of release.assets ?? []) {
      const name = asset.name ?? '';
      const prefix = `katago-${release.tag_name}-`;
      if (
        !name.startsWith(prefix) ||
        !name.endsWith('.zip') ||
        !name.includes(platformKey) ||
        isLargeBoardKataGoBuild(name) ||
        !asset.browser_download_url
      )
        continue;
      // Keep CUDA/cuDNN, TensorRT and other build variants distinct across releases.
      const variant = name.slice(prefix.length);
      if (builds.has(variant)) continue;
      builds.set(variant, {
        id: name.replace(/\.zip$/i, ''),
        label: buildNameFromFileName(name),
        notes: buildNotesFromFileName(name),
        url: asset.browser_download_url,
      });
    }
  }
  const assets = [...builds.values()];
  onProgress?.(`Found ${assets.length} KataGo build option${assets.length === 1 ? '' : 's'} for this platform.`);
  return assets;
}

async function fetchKnownKata1Models(onProgress?: KataGoCatalogProgress): Promise<KataGoAvailableAsset[]> {
  const networksByPrefix = new Map<string, KataGoNetwork>();
  let hasRecommendedB18Replacement = false;

  for (const network of await fetchKata1Networks(new Set(), onProgress)) {
    const prefix = knownKata1ModelPrefix(network.name);
    if (prefix == null) continue;
    const current = networksByPrefix.get(prefix);
    if (current == null || compareKataGoNetworks(network, current) > 0) {
      networksByPrefix.set(prefix, network);
    }
    if (prefix === recommendedB18ModelPrefix) hasRecommendedB18Replacement = true;
  }

  const networks = [...networksByPrefix.values()];
  const strongest = networks.reduce<KataGoNetwork | null>(
    (current, network) => (current == null || compareKataGoNetworks(network, current) > 0 ? network : current),
    null
  );
  const models: KataGoAvailableAsset[] = networks.map((network) => ({
    id: `kata1:${network.name}`,
    label: `${network.name}.bin.gz`,
    url: network.model_file,
    notes:
      network === strongest
        ? 'strongest'
        : knownKata1ModelPrefix(network.name) === recommendedB18ModelPrefix
          ? 'fastest'
          : undefined,
  }));
  if (!hasRecommendedB18Replacement) models.push({...recommendedB18Model, notes: 'fastest'});
  models.sort((a, b) => a.label.localeCompare(b.label));
  onProgress?.(`Prepared ${models.length} KataGo model option${models.length === 1 ? '' : 's'}.`);
  return models;
}

async function fetchKata1Networks(
  foundPrefixes: Set<string>,
  onProgress?: KataGoCatalogProgress
): Promise<KataGoNetwork[]> {
  const networks: KataGoNetwork[] = [];
  let url: string | null = `https://katagotraining.org/api/networks/?page_size=${kataGoModelCatalogPageSize}`;
  let pageCount = 0;

  onProgress?.('Checking known KataGo model prefixes from katagotraining.org.');
  while (url != null && pageCount < maxKataGoModelCatalogPages && !hasEveryKnownModelPrefix(foundPrefixes)) {
    pageCount += 1;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to refresh KataGo models: ${response.status} ${response.statusText}`);

    const page = (await response.json()) as KataGoNetworksResponse;
    for (const network of page.results) {
      const prefix = knownKata1ModelPrefix(network.name);
      if (
        prefix == null ||
        typeof network.model_file !== 'string' ||
        network.model_file === '' ||
        network.is_random === true
      ) {
        continue;
      }
      networks.push(network);
      foundPrefixes.add(prefix);
    }
    url = page.next;
    onProgress?.(`Loaded recent KataGo model catalog page ${pageCount}.`);
  }

  return networks;
}

function knownKata1ModelPrefix(name: string): string | null {
  return knownKata1ModelPrefixes.find((prefix) => name === prefix || name.startsWith(`${prefix}-`)) ?? null;
}

function hasEveryKnownModelPrefix(foundPrefixes: ReadonlySet<string>): boolean {
  return knownKata1ModelPrefixes.every((prefix) => foundPrefixes.has(prefix));
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

function fallbackCatalog(platform: string): KataGoAssetCatalog {
  return {
    updatedAt: new Date(0).toISOString(),
    katago: fallbackKataGoBuilds(platform),
    models: [recommendedB18Model],
  };
}

function fallbackKataGoBuilds(platform: string): KataGoAvailableAsset[] {
  const suffix = platform === 'win32' ? 'windows-x64' : platform === 'linux' ? 'linux-x64' : null;
  if (suffix == null) return [];

  return ['opencl', 'eigenavx2', 'eigen'].map((backend) => {
    const name = `katago-v1.16.0-${backend}-${suffix}.zip`;
    return {
      id: name.replace(/\.zip$/i, ''),
      label: buildNameFromFileName(name),
      notes: buildNotesFromFileName(name),
      url: `https://github.com/lightvector/KataGo/releases/download/v1.16.0/${name}`,
    };
  });
}

function normalizeCatalog(value: Partial<KataGoAssetCatalog>): KataGoAssetCatalog {
  return {
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString(),
    katago: normalizeAvailableAssets(value.katago)
      .map(normalizeKataGoBuildOption)
      .filter((asset) => !isLargeBoardKataGoBuild(kataGoBuildFileName(asset))),
    models: normalizeAvailableAssets(value.models).filter((asset) => !legacyModelOptionIds.has(asset.id)),
  };
}

function normalizeAvailableAssets(value: unknown): KataGoAvailableAsset[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is KataGoAvailableAsset =>
      item != null &&
      typeof item === 'object' &&
      typeof (item as KataGoAvailableAsset).id === 'string' &&
      typeof (item as KataGoAvailableAsset).label === 'string' &&
      typeof (item as KataGoAvailableAsset).url === 'string'
  );
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

async function writeKataGoVersionCatalog(catalogPath: string, catalog: KataGoAssetCatalog): Promise<void> {
  await fs.mkdir(path.dirname(catalogPath), {recursive: true});
  await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
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
