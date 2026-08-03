import fs from 'node:fs/promises';
import path from 'node:path';

export interface RecentFile {
  filePath: string;
  fileName: string;
}

export interface AutoSaveCandidate {
  content: string;
  fileName: string;
  moveCount: number;
}

const recentFileLimit = 10;
const recentFilesName = 'recent-files.json';

export async function readRecentFiles(dataDirectory: string): Promise<RecentFile[]> {
  const storedPaths = await readStoredPaths(dataDirectory);
  const existing = (
    await Promise.all(
      storedPaths.map(async (filePath) => {
        try {
          const stat = await fs.stat(filePath);
          return stat.isFile() ? filePath : null;
        } catch {
          return null;
        }
      })
    )
  ).filter((filePath): filePath is string => filePath != null);
  const paths = [...new Set(existing)].slice(0, recentFileLimit);

  if (paths.length !== storedPaths.length || paths.some((filePath, index) => filePath !== storedPaths[index])) {
    await writeStoredPaths(dataDirectory, paths);
  }

  return paths.map((filePath) => ({filePath, fileName: path.basename(filePath)}));
}

export async function addRecentFile(dataDirectory: string, filePath: string): Promise<void> {
  const normalizedPath = path.resolve(filePath);
  const recent = await readRecentFiles(dataDirectory);
  const paths = [normalizedPath, ...recent.map((item) => item.filePath).filter((item) => item !== normalizedPath)];
  await writeStoredPaths(dataDirectory, paths.slice(0, recentFileLimit));
}

export async function autoSaveGame(
  dataDirectory: string,
  candidate: AutoSaveCandidate
): Promise<RecentFile | null> {
  if (candidate.moveCount <= 16) return null;

  const directory = path.join(dataDirectory, 'autosaves');
  await fs.mkdir(directory, {recursive: true});
  const baseName = safeBaseName(candidate.fileName);
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace('Z', '');
  const filePath = path.join(directory, `${baseName}-autosave-${timestamp}.sgf`);
  await fs.writeFile(filePath, candidate.content, 'utf8');
  await addRecentFile(dataDirectory, filePath);
  return {filePath, fileName: path.basename(filePath)};
}

async function readStoredPaths(dataDirectory: string): Promise<string[]> {
  try {
    const value: unknown = JSON.parse(await fs.readFile(path.join(dataDirectory, recentFilesName), 'utf8'));
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

async function writeStoredPaths(dataDirectory: string, paths: string[]): Promise<void> {
  await fs.mkdir(dataDirectory, {recursive: true});
  await fs.writeFile(path.join(dataDirectory, recentFilesName), JSON.stringify(paths, null, 2), 'utf8');
}

function safeBaseName(fileName: string): string {
  const baseName = path.basename(fileName, path.extname(fileName)).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  return (baseName || 'game').slice(0, 80);
}
