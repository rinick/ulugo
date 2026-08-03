import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {addRecentFile, autoSaveGame, readRecentFiles} from '../src/recentFiles';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, {recursive: true, force: true})));
});

describe('recent game records', () => {
  it('keeps the ten most recently opened existing files', async () => {
    const directory = await temporaryDirectory();
    for (let index = 0; index < 11; index += 1) {
      const filePath = path.join(directory, `${index}.sgf`);
      await fs.writeFile(filePath, '(;GM[1])', 'utf8');
      await addRecentFile(directory, filePath);
    }

    const recent = await readRecentFiles(directory);
    expect(recent).toHaveLength(10);
    expect(recent[0].fileName).toBe('10.sgf');
    expect(recent.at(-1)?.fileName).toBe('1.sgf');

    await fs.rm(recent[0].filePath);
    expect(await readRecentFiles(directory)).toHaveLength(9);
  });

  it('only auto-saves games longer than sixteen moves and adds them to recent files', async () => {
    const directory = await temporaryDirectory();
    const candidate = {content: '(;GM[1])', fileName: 'Game.sgf', moveCount: 16};

    expect(await autoSaveGame(directory, candidate)).toBeNull();
    const saved = await autoSaveGame(directory, {...candidate, moveCount: 17});
    expect(saved?.filePath).toContain(path.join(directory, 'autosaves'));
    expect(await fs.readFile(saved!.filePath, 'utf8')).toBe(candidate.content);
    expect(await readRecentFiles(directory)).toEqual([saved]);
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ulugo-recent-files-'));
  temporaryDirectories.push(directory);
  return directory;
}
