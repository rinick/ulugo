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

export async function readKataGoVersionCatalog(
  catalogPath: string,
  platform: string
): Promise<KataGoAssetCatalog> {
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
  platform: string
): Promise<KataGoAssetCatalog> {
  const [katago, models] = await Promise.all([fetchLatestKataGoBuilds(platform), fetchBestKata1ModelsByPrefix()]);
  const catalog = {
    updatedAt: new Date().toISOString(),
    katago: katago.length > 0 ? katago : fallbackCatalog(platform).katago,
    models,
  };
  await writeKataGoVersionCatalog(catalogPath, catalog);
  return catalog;
}

export function isBs50KataGoBuild(value: string): boolean {
  return value.toLowerCase().includes('bs50');
}

async function fetchLatestKataGoBuilds(platform: string): Promise<KataGoAvailableAsset[]> {
  const response = await fetch('https://api.github.com/repos/lightvector/KataGo/releases/latest', {
    headers: {'User-Agent': 'Ulugo'},
  });
  if (!response.ok) throw new Error(`Failed to refresh KataGo builds: ${response.status} ${response.statusText}`);
  const release = (await response.json()) as {
    assets?: Array<{name?: string; browser_download_url?: string}>;
  };
  const platformKey = platform === 'win32' ? 'windows-x64' : platform === 'linux' ? 'linux-x64' : 'macos';

  return (release.assets ?? [])
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
      ...page.results.filter(
        (network) =>
          network.name.startsWith('kata1-') &&
          typeof network.model_file === 'string' &&
          network.model_file !== '' &&
          network.is_random !== true
      )
    );
    url = page.next;
  }

  return networks;
}

function kata1ModelPrefix(name: string): string | null {
  return /^(kata1-(?:[a-z0-9]+-)?b\d+c\d+nbt)(?:-|$)/i.exec(name)?.[1] ?? null;
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
    models: [],
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
      .filter((asset) => !isBs50KataGoBuild(kataGoBuildFileName(asset))),
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
