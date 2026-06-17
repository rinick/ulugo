import {app, BrowserWindow, Menu, dialog, ipcMain, type WebContents} from 'electron';
import extract from 'extract-zip';
import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {cancelGoogleDriveBridge, openGoogleDriveSgf, saveGoogleDriveSgf} from './googleDriveBridge';

interface KataGoSettings {
  executablePath: string;
  modelPath: string;
  configPath: string;
  altCommand: string;
  maxVisits: number;
  fastVisits: number;
  wideRootNoise: number;
}

interface AnalysisSettings {
  mode: 'review' | 'edit';
  moveDisplay: AnalysisMoveDisplay;
  stoneOverlay: 'dot' | 'number' | 'none';
  maxMoves: 1 | 5 | 20 | 'all';
  minVisits: number;
  showMarkup: boolean;
  showNextMove: boolean;
  showTopMoves: boolean;
  showExpectedTerritory: boolean;
  showScore: boolean;
  showPointLoss: boolean;
  showWinrate: boolean;
  showComments: boolean;
  boardBackground: 'auto' | 'golden' | 'natural' | 'flat';
  autoAnalyze: boolean;
  modeSettings: Record<'review' | 'edit', AnalysisModeSettings>;
}

type AnalysisDisplayMode = 'scoreChange' | 'winRateChange' | 'score' | 'value' | 'visits';
type AnalysisMoveDisplay = [AnalysisDisplayMode] | [AnalysisDisplayMode, AnalysisDisplayMode];

interface AnalysisModeSettings {
  stoneOverlay: 'dot' | 'number' | 'none';
  showMarkup: boolean;
  showNextMove: boolean;
  showTopMoves: boolean;
  showExpectedTerritory: boolean;
  showScore: boolean;
  showPointLoss: boolean;
  showWinrate: boolean;
  showComments: boolean;
}

const defaultKataGoSettings: KataGoSettings = {
  executablePath: '',
  modelPath: '',
  configPath: '',
  altCommand: '',
  maxVisits: 800,
  fastVisits: 100,
  wideRootNoise: 0.04,
};

const defaultAnalysisSettings: AnalysisSettings = {
  mode: 'review',
  moveDisplay: ['scoreChange'],
  stoneOverlay: 'dot',
  maxMoves: 5,
  minVisits: 50,
  showMarkup: true,
  showNextMove: true,
  showTopMoves: true,
  showExpectedTerritory: true,
  showScore: true,
  showPointLoss: false,
  showWinrate: true,
  showComments: false,
  boardBackground: 'auto',
  autoAnalyze: true,
  modeSettings: {
    review: {
      stoneOverlay: 'dot',
      showMarkup: true,
      showNextMove: true,
      showTopMoves: true,
      showExpectedTerritory: true,
      showScore: true,
      showPointLoss: false,
      showWinrate: true,
      showComments: false,
    },
    edit: {
      stoneOverlay: 'none',
      showMarkup: true,
      showNextMove: false,
      showTopMoves: false,
      showExpectedTerritory: false,
      showScore: false,
      showPointLoss: false,
      showWinrate: false,
      showComments: true,
    },
  },
};

interface DownloadOption {
  id: string;
  label: string;
  url: string;
  installedPath?: string;
}

interface KataGoAnalysisQuery {
  id: string;
  boardXSize: number;
  boardYSize: number;
  komi: number;
  rules?: string;
  initialStones: Array<[string, string]>;
  moves: Array<[string, string]>;
  analyzeTurns?: number[];
  maxVisits?: number;
  priority?: number;
  includePolicy: boolean;
  includeOwnership: boolean;
  reportDuringSearchEvery?: number;
  overrideSettings?: {
    wideRootNoise?: number;
  };
}

let katagoProcess: ChildProcessWithoutNullStreams | null = null;
let katagoOutputBuffer = '';
let katagoSender: WebContents | null = null;
let consoleMessageCounter = 0;
const activeKataGoQueryIds = new Set<string>();

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

const modelDownloadOptions: DownloadOption[] = [
  {
    id: 'recommended-18b',
    label: 'Recommended 18b model',
    url: 'https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz',
  },
  {
    id: 'old-15b',
    label: 'Old 15 block model',
    url: 'https://github.com/lightvector/KataGo/releases/download/v1.3.2/g170e-b15c192-s1672170752-d466197061.txt.gz',
  },
  {
    id: 'old-20b',
    label: 'Old 20 block model',
    url: 'https://github.com/lightvector/KataGo/releases/download/v1.4.5/g170e-b20c256x2-s5303129600-d1228401921.bin.gz',
  },
  {
    id: 'old-30b',
    label: 'Old 30 block model',
    url: 'https://github.com/lightvector/KataGo/releases/download/v1.4.5/g170-b30c320x2-s4824661760-d1229536699.bin.gz',
  },
  {
    id: 'fat-40b',
    label: 'Fat 40 block model',
    url: 'https://d3dndmfyhecmj0.cloudfront.net/g170/neuralnets/g170e-b40c384x2-s2348692992-d1229892979.zip',
  },
];

const katagoDownloadOptionsByPlatform: Record<string, DownloadOption[]> = {
  win32: [
    {
      id: 'opencl-win',
      label: 'OpenCL v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-opencl-windows-x64.zip',
    },
    {
      id: 'eigen-avx2-win',
      label: 'Eigen AVX2 (Modern CPUs) v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-eigenavx2-windows-x64.zip',
    },
    {
      id: 'eigen-win',
      label: 'Eigen (CPU, Non-optimized) v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-eigen-windows-x64.zip',
    },
  ],
  linux: [
    {
      id: 'opencl-linux',
      label: 'OpenCL v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-opencl-linux-x64.zip',
    },
    {
      id: 'eigen-avx2-linux',
      label: 'Eigen AVX2 (Modern CPUs) v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-eigenavx2-linux-x64.zip',
    },
    {
      id: 'eigen-linux',
      label: 'Eigen (CPU, Non-optimized) v1.16.0',
      url: 'https://github.com/lightvector/KataGo/releases/download/v1.16.0/katago-v1.16.0-eigen-linux-x64.zip',
    },
  ],
};

async function createWindow(): Promise<void> {
  app.setName('Ulugo AI review');
  Menu.setApplicationMenu(null);

  const window = new BrowserWindow({
    title: 'Ulugo AI review',
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f4f7f5',
    icon: path.join(__dirname, '../../web/src/assets/icon-512.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  window.setMenuBarVisibility(false);
  window.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      event.preventDefault();
      window.webContents.toggleDevTools();
    }
  });

  if (process.env.ULUGO_WEB_URL != null && process.env.ULUGO_WEB_URL !== '') {
    await window.loadURL(process.env.ULUGO_WEB_URL);
    return;
  }

  await window.loadFile(path.join(__dirname, '../../web/dist/index.html'));
}

app.whenReady().then(async () => {
  registerIpc();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpc(): void {
  ipcMain.handle('ulugo:import-sgf', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{name: 'Game records', extensions: ['sgf', 'gib']}],
    });
    if (result.canceled || result.filePaths[0] == null) return null;

    const filePath = result.filePaths[0];
    const buffer = await fs.readFile(filePath);
    return {
      content: decodeGameRecordBuffer(buffer, filePath.toLowerCase().endsWith('.gib')),
      fileName: path.basename(filePath),
      filePath,
    };
  });

  ipcMain.handle(
    'ulugo:export-sgf',
    async (_event, request: {content: string; suggestedName: string; filePath?: string}) => {
      const filePath =
        request.filePath ??
        (
          await dialog.showSaveDialog({
            defaultPath: request.suggestedName,
            filters: [{name: 'SGF files', extensions: ['sgf']}],
          })
        ).filePath;
      if (filePath == null) return {canceled: true};

      await fs.writeFile(filePath, request.content, 'utf8');
      return {canceled: false, filePath, fileName: path.basename(filePath)};
    }
  );

  ipcMain.handle(
    'ulugo:select-file',
    async (_event, options?: {title?: string; filters?: Array<{name: string; extensions: string[]}>}) => {
      const result = await dialog.showOpenDialog({
        title: options?.title,
        properties: ['openFile'],
        filters: options?.filters,
      });
      if (result.canceled || result.filePaths[0] == null) return null;
      return result.filePaths[0];
    }
  );

  ipcMain.handle('ulugo:google-drive:open-sgf', async (event) => {
    const result = await openGoogleDriveSgf();
    if (result != null) bringSenderWindowToFront(event.sender);
    return result;
  });
  ipcMain.handle(
    'ulugo:google-drive:save-sgf',
    async (event, request: {content: string; fileName: string; fileId?: string | null}) => {
      const result = await saveGoogleDriveSgf(request.content, request.fileName, request.fileId);
      if (result != null) bringSenderWindowToFront(event.sender);
      return result;
    }
  );
  ipcMain.handle('ulugo:google-drive:cancel', () => cancelGoogleDriveBridge());

  ipcMain.handle('ulugo:katago:get-settings', async () => {
    const settings = await readJson('katago-settings.json', defaultKataGoSettings);
    const normalized = await normalizeKataGoSettings(settings);
    await writeJson('katago-settings.json', normalized);
    return normalized;
  });
  ipcMain.handle('ulugo:katago:save-settings', async (_event, settings: KataGoSettings) =>
    writeJson('katago-settings.json', await normalizeKataGoSettings({...defaultKataGoSettings, ...settings}))
  );
  ipcMain.handle('ulugo:katago:get-download-options', async () => ({
    katago: await withInstalledPaths('katago', katagoDownloadOptionsByPlatform[process.platform] ?? []),
    models: await withInstalledPaths('model', modelDownloadOptions),
  }));
  ipcMain.handle('ulugo:katago:download', async (event, request: {kind: 'katago' | 'model'; optionId: string}) => {
    const options =
      request.kind === 'katago' ? (katagoDownloadOptionsByPlatform[process.platform] ?? []) : modelDownloadOptions;
    const option = options.find((item) => item.id === request.optionId);
    if (option == null) throw new Error(`Unknown download option: ${request.optionId}`);

    sendKataGoConsole(event.sender, 'ulugo', 'info', `Downloading ${option.label}.`);
    const result = await downloadKataGoAsset(option, request.kind, (progress) => {
      event.sender.send('ulugo:katago:download-progress', progress);
    });
    const settings = await readJson('katago-settings.json', defaultKataGoSettings);
    const nextSettings = await normalizeKataGoSettings(
      request.kind === 'katago' ? {...settings, executablePath: result.path} : {...settings, modelPath: result.path},
      path.dirname(result.path)
    );
    await saveInstalledAsset(request.kind, option.id, result.path);
    await writeJson('katago-settings.json', nextSettings);
    sendKataGoConsole(event.sender, 'ulugo', 'info', `${option.label} installed at ${result.path}.`);
    return {...result, settings: nextSettings};
  });
  ipcMain.handle('ulugo:katago:analyze', async (event, query: KataGoAnalysisQuery) => {
    const normalizedQuery = normalizeAnalysisQuery(query);
    try {
      const settings = await normalizeKataGoSettings(await readJson('katago-settings.json', defaultKataGoSettings));
      await ensureKataGoEngine(settings, event.sender);
      await writeKataGoQuery(withKataGoOverrideSettings(normalizedQuery, settings));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to write KataGo analysis query.';
      sendKataGoConsole(event.sender, 'katago', 'error', message);
      event.sender.send('ulugo:katago:analysis', {id: normalizedQuery.id, error: message, isDuringSearch: false});
      event.sender.send('ulugo:katago:analysis-error', message);
    }
  });
  ipcMain.handle('ulugo:katago:stop-analysis', async (_event, queryIds?: unknown) => {
    await stopKataGoAnalysis(
      Array.isArray(queryIds) ? queryIds.filter((queryId): queryId is string => typeof queryId === 'string') : undefined
    );
  });
  ipcMain.handle('ulugo:analysis:get-settings', async () => readAnalysisSettings());
  ipcMain.handle('ulugo:analysis:save-settings', async (_event, settings: AnalysisSettings) =>
    writeJson('analysis-settings.json', normalizeAnalysisSettings(settings))
  );
}

function bringSenderWindowToFront(sender: WebContents): void {
  const window = BrowserWindow.fromWebContents(sender);
  if (window == null || window.isDestroyed()) return;
  window.show();
  window.moveTop();
  window.focus();
}

async function readAnalysisSettings(): Promise<AnalysisSettings> {
  return normalizeAnalysisSettings(await readJson('analysis-settings.json', defaultAnalysisSettings));
}

function normalizeAnalysisSettings(
  settings: Partial<AnalysisSettings> & {
    moveDisplay?: unknown;
    stoneOverlay?: AnalysisSettings['stoneOverlay'] | 'markup';
    topMoveDisplay?: AnalysisSettings['stoneOverlay'] | 'markup';
  }
): AnalysisSettings {
  const {topMoveDisplay, ...storedSettings} = settings;
  const stoneOverlay = settings.stoneOverlay ?? topMoveDisplay ?? defaultAnalysisSettings.stoneOverlay;
  const mode = settings.mode === 'edit' ? 'edit' : 'review';
  const activeModeSettings = normalizeAnalysisModeSettings(
    {
      stoneOverlay: stoneOverlay === 'markup' ? 'none' : stoneOverlay,
      showMarkup: settings.showMarkup,
      showNextMove: settings.showNextMove,
      showTopMoves: settings.showTopMoves,
      showExpectedTerritory: settings.showExpectedTerritory,
      showScore: settings.showScore,
      showPointLoss: settings.showPointLoss,
      showWinrate: settings.showWinrate,
      showComments: settings.showComments,
    },
    defaultAnalysisSettings.modeSettings[mode]
  );
  const modeSettings = {
    review: normalizeAnalysisModeSettings(settings.modeSettings?.review, defaultAnalysisSettings.modeSettings.review),
    edit: normalizeAnalysisModeSettings(settings.modeSettings?.edit, defaultAnalysisSettings.modeSettings.edit),
    [mode]: activeModeSettings,
  };
  return {
    ...defaultAnalysisSettings,
    ...storedSettings,
    moveDisplay: normalizeMoveDisplay(settings.moveDisplay),
    mode,
    ...activeModeSettings,
    modeSettings,
  };
}

function normalizeMoveDisplay(value: unknown): AnalysisMoveDisplay {
  const values = Array.isArray(value) ? value : [value];
  const normalized = values.flatMap((item): AnalysisDisplayMode[] => {
    if (item === 'score') return Array.isArray(value) ? ['score'] : ['scoreChange'];
    if (item === 'winrate') return ['winRateChange'];
    if (item === 'absScore') return ['value'];
    if (item === 'scoreChange' || item === 'winRateChange' || item === 'visits' || item === 'value') return [item];
    return [];
  });
  const unique = [...new Set(normalized)].slice(0, 2);
  return (unique.length === 0 ? ['scoreChange'] : unique) as AnalysisMoveDisplay;
}

function normalizeAnalysisModeSettings(
  settings: Partial<AnalysisModeSettings> | undefined,
  defaults: AnalysisModeSettings
): AnalysisModeSettings {
  const stoneOverlay = settings?.stoneOverlay;
  return {
    ...defaults,
    ...settings,
    stoneOverlay:
      stoneOverlay === 'dot' || stoneOverlay === 'number' || stoneOverlay === 'none'
        ? stoneOverlay
        : defaults.stoneOverlay,
  };
}

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(settingsPath(name), 'utf8');
    return {...fallback, ...JSON.parse(raw)} as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(name: string, value: T): Promise<T> {
  await fs.mkdir(app.getPath('userData'), {recursive: true});
  await fs.writeFile(settingsPath(name), JSON.stringify(value, null, 2), 'utf8');
  return value;
}

function settingsPath(name: string): string {
  return path.join(app.getPath('userData'), name);
}

async function normalizeKataGoSettings(settings: KataGoSettings, searchDirectory?: string): Promise<KataGoSettings> {
  const executableDirectory = settings.executablePath === '' ? undefined : path.dirname(settings.executablePath);
  const configPath = await resolveKataGoConfig(settings.configPath, searchDirectory ?? executableDirectory);
  return {...defaultKataGoSettings, ...settings, configPath};
}

async function resolveKataGoConfig(configPath: string, searchDirectory?: string): Promise<string> {
  if (configPath !== '' && (await fileExists(configPath))) return configPath;

  if (searchDirectory != null && searchDirectory !== '' && (await fileExists(searchDirectory))) {
    const bundledConfig = await findFirstFile(searchDirectory, (file) => {
      const name = path.basename(file).toLowerCase();
      return name.endsWith('.cfg') && name.includes('analysis');
    });
    if (bundledConfig != null) return bundledConfig;
  }

  return ensureDefaultKataGoConfig();
}

async function ensureDefaultKataGoConfig(): Promise<string> {
  const configPath = path.join(app.getPath('userData'), 'katago', 'ulugo-analysis.cfg');
  if (await fileExists(configPath)) return configPath;

  await fs.mkdir(path.dirname(configPath), {recursive: true});
  await fs.writeFile(configPath, defaultKataGoConfigText(), 'utf8');
  sendKataGoConsole(katagoSender, 'ulugo', 'info', `Created KataGo analysis config at ${configPath}.`);
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

function decodeGameRecordBuffer(buffer: Uint8Array, preferKorean: boolean): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!preferKorean || !utf8.includes('\uFFFD')) return utf8;

  try {
    return new TextDecoder('euc-kr').decode(buffer);
  } catch {
    return utf8;
  }
}

async function ensureKataGoEngine(settings: KataGoSettings, sender: WebContents): Promise<void> {
  katagoSender = sender;
  if (katagoProcess != null) return;

  if (settings.executablePath === '' || !(await fileExists(settings.executablePath))) {
    sendKataGoConsole(sender, 'ulugo', 'error', 'KataGo executable is not configured.');
    throw new Error('KataGo executable is not configured.');
  }
  if (settings.modelPath === '' || !(await fileExists(settings.modelPath))) {
    sendKataGoConsole(sender, 'ulugo', 'error', 'KataGo model is not configured.');
    throw new Error('KataGo model is not configured.');
  }
  if (settings.configPath === '' || !(await fileExists(settings.configPath))) {
    sendKataGoConsole(sender, 'ulugo', 'error', 'KataGo config is not configured.');
    throw new Error('KataGo config is not configured.');
  }

  const {command, args, options} = kataGoCommand(settings);
  katagoOutputBuffer = '';
  sendKataGoConsole(sender, 'ulugo', 'info', `Starting KataGo: ${command} ${args.join(' ')}`);
  katagoProcess = spawn(command, args, options);

  katagoProcess.stdout.on('data', (chunk: Buffer) => {
    katagoOutputBuffer += chunk.toString('utf8');
    const lines = katagoOutputBuffer.split(/\r?\n/);
    katagoOutputBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.trim() === '') continue;
      try {
        const payload = JSON.parse(line);
        if (typeof payload.error === 'string') {
          if (typeof payload.id === 'string') activeKataGoQueryIds.delete(payload.id);
          sendKataGoConsole(katagoSender, 'katago', 'error', payload.error);
          katagoSender?.send('ulugo:katago:analysis', payload);
          katagoSender?.send('ulugo:katago:analysis-error', payload.error);
        } else if (typeof payload.warning === 'string') {
          sendKataGoConsole(katagoSender, 'katago', 'warning', payload.warning);
        } else {
          if (typeof payload.id === 'string' && payload.isDuringSearch !== true) {
            activeKataGoQueryIds.delete(payload.id);
          }
          katagoSender?.send('ulugo:katago:analysis', payload);
        }
      } catch (error) {
        sendKataGoConsole(katagoSender, 'katago', 'warning', line);
        katagoSender?.send(
          'ulugo:katago:analysis-error',
          error instanceof Error ? error.message : 'Invalid KataGo output.'
        );
      }
    }
  });

  katagoProcess.stderr.on('data', (chunk: Buffer) => {
    const message = chunk.toString('utf8').trim();
    if (message !== '') {
      const level = /error|failed|fatal/i.test(message) ? 'error' : /warn/i.test(message) ? 'warning' : 'info';
      sendKataGoConsole(katagoSender, 'katago', level, message);
      if (level === 'error') katagoSender?.send('ulugo:katago:analysis-error', message);
    }
  });

  katagoProcess.stdin.on('error', (error) => {
    sendKataGoConsole(katagoSender, 'katago', 'error', error.message);
    katagoSender?.send('ulugo:katago:analysis-error', error.message);
  });

  katagoProcess.on('error', (error) => {
    sendKataGoConsole(katagoSender, 'katago', 'error', error.message);
    katagoSender?.send('ulugo:katago:analysis-error', error.message);
    katagoProcess = null;
    activeKataGoQueryIds.clear();
  });

  katagoProcess.on('exit', (code, signal) => {
    katagoProcess = null;
    activeKataGoQueryIds.clear();
    sendKataGoConsole(
      katagoSender,
      code === 0 || signal != null ? 'ulugo' : 'katago',
      code === 0 || signal != null ? 'info' : 'error',
      signal == null ? `KataGo exited with code ${code}.` : `KataGo stopped by signal ${signal}.`
    );
    if (code !== 0 && signal == null)
      katagoSender?.send('ulugo:katago:analysis-error', `KataGo exited with code ${code}.`);
  });
}

async function writeKataGoQuery(query: KataGoAnalysisQuery): Promise<void> {
  activeKataGoQueryIds.add(query.id);
  try {
    await writeKataGoMessage(query);
  } catch (error) {
    activeKataGoQueryIds.delete(query.id);
    throw error;
  }
}

async function writeKataGoMessage(message: unknown): Promise<void> {
  if (katagoProcess == null || katagoProcess.stdin.destroyed || !katagoProcess.stdin.writable) {
    throw new Error('KataGo is not running.');
  }

  await new Promise<void>((resolve, reject) => {
    katagoProcess?.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
      if (error != null) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function sendKataGoConsole(
  sender: WebContents | null,
  source: 'ulugo' | 'katago',
  level: 'info' | 'warning' | 'error',
  text: string
): void {
  if (sender == null || text.trim() === '') return;
  consoleMessageCounter += 1;
  sender.send('ulugo:katago:console', {
    id: `m${consoleMessageCounter}`,
    time: new Date().toISOString(),
    source,
    level,
    text,
  });
}

function kataGoCommand(settings: KataGoSettings): {
  command: string;
  args: string[];
  options?: {shell?: boolean};
} {
  if (settings.altCommand.trim() !== '') {
    return {command: settings.altCommand.trim(), args: [], options: {shell: true}};
  }

  return {
    command: settings.executablePath,
    args: [
      'analysis',
      '-model',
      settings.modelPath,
      '-config',
      settings.configPath,
      '-override-config',
      `homeDataDir=${app.getPath('userData')}`,
    ],
  };
}

function normalizeAnalysisQuery(query: KataGoAnalysisQuery): KataGoAnalysisQuery {
  return {
    ...query,
    komi: normalizeKomi(query.komi),
    rules: normalizeRules(query.rules),
  };
}

function withKataGoOverrideSettings(query: KataGoAnalysisQuery, settings: KataGoSettings): KataGoAnalysisQuery {
  return {
    ...query,
    overrideSettings: {
      wideRootNoise: settings.wideRootNoise,
      ...query.overrideSettings,
    },
  };
}

function normalizeKomi(value: unknown): number {
  if (value == null) return 6.5;
  if (typeof value === 'string' && value.trim() === '') return 6.5;

  const parsed = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : Number(value);
  if (!Number.isFinite(parsed)) return 6.5;
  if (parsed === 375) return 7.5;

  const clamped = Math.max(-150, Math.min(150, parsed));
  return Math.round(clamped * 2) / 2;
}

function normalizeRules(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return 'japanese';

  const key = value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  const aliases: Record<string, string> = {
    'aga': 'aga',
    'chinese': 'chinese',
    'japanese': 'japanese',
    'korean': 'korean',
    'new-zealand': 'new-zealand',
    'stone-scoring': 'stone-scoring',
    'tromp-taylor': 'tromp-taylor',
  };

  return aliases[key] ?? 'japanese';
}

async function stopKataGoAnalysis(queryIds?: string[]): Promise<void> {
  if (katagoProcess == null) return;
  const idsToTerminate = queryIds ?? [...activeKataGoQueryIds];
  if (idsToTerminate.length === 0) return;

  if (queryIds == null) {
    activeKataGoQueryIds.clear();
  } else {
    for (const queryId of queryIds) activeKataGoQueryIds.delete(queryId);
  }
  await Promise.all(
    idsToTerminate.map((queryId) =>
      writeKataGoMessage({
        id: `ulugo-terminate-${queryId}`,
        action: 'terminate',
        terminateId: queryId,
      }).catch(() => undefined)
    )
  );
}

async function withInstalledPaths(kind: 'katago' | 'model', options: DownloadOption[]): Promise<DownloadOption[]> {
  const installed = await readJson<Record<string, string>>('katago-installed-assets.json', {});

  return Promise.all(
    options.map(async (option) => {
      const installedPath = await resolveInstalledAsset(kind, option, installed[installedAssetKey(kind, option.id)]);
      return installedPath == null ? option : {...option, installedPath};
    })
  );
}

async function saveInstalledAsset(kind: 'katago' | 'model', optionId: string, filePath: string): Promise<void> {
  const installed = await readJson<Record<string, string>>('katago-installed-assets.json', {});
  installed[installedAssetKey(kind, optionId)] = filePath;
  await writeJson('katago-installed-assets.json', installed);
}

function installedAssetKey(kind: 'katago' | 'model', optionId: string): string {
  return `${kind}:${optionId}`;
}

async function resolveInstalledAsset(
  kind: 'katago' | 'model',
  option: DownloadOption,
  manifestPath: string | undefined
): Promise<string | null> {
  if (manifestPath != null && (await fileExists(manifestPath))) return manifestPath;

  const directory = path.join(app.getPath('userData'), kind === 'katago' ? 'katago' : 'models');
  if (!(await fileExists(directory))) return null;

  if (kind === 'model') {
    const fileName = path.basename(new URL(option.url).pathname);
    const directPath = path.join(directory, fileName);
    if (await fileExists(directPath)) return directPath;
  }

  const candidates = (await listFiles(directory)).filter((file) => isInstalledAssetCandidate(kind, file));
  return candidates.length === 1 ? candidates[0] : null;
}

function isInstalledAssetCandidate(kind: 'katago' | 'model', file: string): boolean {
  const name = path.basename(file).toLowerCase();
  if (kind === 'model') return name.endsWith('.bin.gz') || name.endsWith('.txt.gz');
  if (!name.startsWith('katago')) return false;
  if (name.endsWith('.dll') || name.endsWith('.txt') || name.endsWith('.cfg')) return false;
  return process.platform === 'win32' ? name.endsWith('.exe') : !name.includes('.');
}

async function downloadKataGoAsset(
  option: DownloadOption,
  kind: 'katago' | 'model',
  onProgress: (progress: {
    kind: 'katago' | 'model';
    optionId: string;
    status: 'starting' | 'downloading' | 'extracting' | 'complete' | 'error';
    percent: number;
    message: string;
    path?: string;
  }) => void
): Promise<{path: string}> {
  const directory = path.join(app.getPath('userData'), kind === 'katago' ? 'katago' : 'models');
  await fs.mkdir(directory, {recursive: true});

  const fileName = path.basename(new URL(option.url).pathname);
  const downloadPath = path.join(directory, fileName);
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
      ? await extractDownloadedAsset(downloadPath, directory, kind)
      : downloadPath;
    if (kind === 'katago') await makeExecutable(installedPath);

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

async function extractDownloadedAsset(zipPath: string, destination: string, kind: 'katago' | 'model'): Promise<string> {
  const existingFiles = new Set(await listFiles(destination));
  await extract(zipPath, {dir: destination});
  await fs.rm(zipPath, {force: true});

  const extractedFiles = (await listFiles(destination)).filter((file) => !existingFiles.has(file));
  const files = extractedFiles.length > 0 ? extractedFiles : await listFiles(destination);
  const installed = files.find((file) => {
    return isInstalledAssetCandidate(kind, file);
  });

  if (installed == null) throw new Error(`Could not find installed ${kind} file in downloaded archive.`);
  return installed;
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, {withFileTypes: true});
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : Promise.resolve([entryPath]);
    })
  );
  return nested.flat();
}

async function findFirstFile(directory: string, predicate: (file: string) => boolean): Promise<string | null> {
  for (const file of await listFiles(directory)) {
    if (predicate(file)) return file;
  }
  return null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function makeExecutable(filePath: string): Promise<void> {
  if (process.platform === 'win32') return;
  const mode = fsSync.statSync(filePath).mode;
  await fs.chmod(filePath, mode | 0o111);
}
