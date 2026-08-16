import {
  app,
  BrowserWindow,
  Menu,
  clipboard,
  dialog,
  ipcMain,
  shell,
  type MessageBoxOptions,
  type WebContents,
} from 'electron';
import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {cancelGoogleDriveBridge, openGoogleDriveSgf, saveGoogleDriveSgf} from './googleDriveBridge';
import {addRecentFile, autoSaveGame, readRecentFiles, type AutoSaveCandidate} from './recentFiles';
import {
  downloadKataGoAsset,
  fileExists,
  findDefaultKataGoConfig,
  findInstalledAssetPath,
  listKataGoAssets,
  readKataGoAssetCatalog,
  refreshKataGoAssetCatalog,
  ulugoDataDirectory,
  uninstallKataGoAsset,
  type KataGoAsset,
  type KataGoAssetKind,
  type KataGoAvailableAsset,
} from './katagoAssets';

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
  mode: AnalysisMode;
  moveDisplay: AnalysisMoveDisplay;
  stoneOverlay: 'dot' | 'number' | 'none';
  maxMoves: 1 | 5 | 20 | 'all';
  minVisits: number;
  showMarkup: boolean;
  showNextMove: boolean;
  showTopMoves: boolean;
  showExpectedTerritory: boolean;
  showHotZone: boolean;
  showScore: boolean;
  showPointLoss: boolean;
  showWinrate: boolean;
  showIntensity: boolean;
  showComments: boolean;
  intensityDisplayLimit: number;
  boardBackground: 'auto' | 'golden' | 'natural' | 'flat';
  autoAnalyze: boolean;
  autoIncrementMarkupText: boolean;
  modeSettings: Record<AnalysisMode, AnalysisModeSettings>;
}

type AnalysisMode = 'review' | 'edit' | 'minimal';
type AnalysisDisplayMode = 'scoreChange' | 'winRateChange' | 'score' | 'value' | 'visits';
type AnalysisMoveDisplay = [AnalysisDisplayMode] | [AnalysisDisplayMode, AnalysisDisplayMode];

interface AnalysisModeSettings {
  stoneOverlay: 'dot' | 'number' | 'none';
  showMarkup: boolean;
  showNextMove: boolean;
  showTopMoves: boolean;
  showExpectedTerritory: boolean;
  showHotZone: boolean;
  showScore: boolean;
  showPointLoss: boolean;
  showWinrate: boolean;
  showIntensity: boolean;
  showComments: boolean;
}

const defaultKataGoSettings: KataGoSettings = {
  executablePath: '',
  modelPath: '',
  configPath: '',
  altCommand: '',
  maxVisits: 800,
  fastVisits: 20,
  wideRootNoise: 0.04,
};

const defaultAnalysisSettings: AnalysisSettings = {
  mode: 'edit',
  moveDisplay: ['scoreChange'],
  stoneOverlay: 'none',
  maxMoves: 5,
  minVisits: 20,
  showMarkup: true,
  showNextMove: false,
  showTopMoves: false,
  showExpectedTerritory: false,
  showHotZone: false,
  showScore: false,
  showPointLoss: false,
  showWinrate: false,
  showIntensity: false,
  showComments: true,
  intensityDisplayLimit: 25,
  boardBackground: 'auto',
  autoAnalyze: true,
  autoIncrementMarkupText: true,
  modeSettings: {
    review: {
      stoneOverlay: 'dot',
      showMarkup: true,
      showNextMove: true,
      showTopMoves: true,
      showExpectedTerritory: true,
      showHotZone: false,
      showScore: true,
      showPointLoss: false,
      showWinrate: true,
      showIntensity: false,
      showComments: false,
    },
    edit: {
      stoneOverlay: 'none',
      showMarkup: true,
      showNextMove: false,
      showTopMoves: false,
      showExpectedTerritory: false,
      showHotZone: false,
      showScore: false,
      showPointLoss: false,
      showWinrate: false,
      showIntensity: false,
      showComments: true,
    },
    minimal: {
      stoneOverlay: 'none',
      showMarkup: false,
      showNextMove: false,
      showTopMoves: false,
      showExpectedTerritory: false,
      showHotZone: false,
      showScore: false,
      showPointLoss: false,
      showWinrate: false,
      showIntensity: false,
      showComments: false,
    },
  },
};

interface KataGoAnalysisQuery {
  id: string;
  boardXSize: number;
  boardYSize: number;
  komi: number;
  rules?: string;
  initialPlayer: string;
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

interface GameRecordOpenResult {
  kind: 'gameRecord';
  content: string;
  fileName: string;
  filePath: string;
}

interface ImageOpenResult {
  kind: 'image';
  data: Uint8Array;
  fileName: string;
  mimeType: string;
}

let katagoProcess: ChildProcessWithoutNullStreams | null = null;
let katagoStart: {generation: number; promise: Promise<void>} | null = null;
let katagoEngineGeneration = 0;
let kataGoSettingsCache: KataGoSettings | null = null;
let kataGoSettingsLoad: Promise<KataGoSettings> | null = null;
let katagoSender: WebContents | null = null;
let mainWindow: BrowserWindow | null = null;
let pendingOpenFilePath: string | null = gameRecordFilePathFromArgs(process.argv);
let autoSaveCandidate: AutoSaveCandidate | null = null;
let autoSaveBeforeQuit = false;
let autoSaveBeforeQuitComplete = false;
let consoleMessageCounter = 0;
const activeKataGoQueryIds = new Set<string>();
const firstRunSetupFileName = 'katago-first-run-setup.json';

app.setPath('userData', path.join(app.getPath('home'), '.ulugo'));

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) app.quit();

async function createWindow(): Promise<void> {
  app.setName('Ulugo');
  Menu.setApplicationMenu(null);

  const window = new BrowserWindow({
    title: 'Ulugo',
    width: 1440,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f4f7f5',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'web/dist/icon-512.png')
      : path.join(__dirname, '../../web/src/assets/icon-512.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow = window;
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.setMenuBarVisibility(false);
  window.webContents.on('before-input-event', (event, input) => {
    if (
      input.control &&
      input.alt &&
      input.shift &&
      (input.code === 'Equal' || input.key === '=' || input.key === '+')
    ) {
      event.preventDefault();
      window.webContents.toggleDevTools();
    }
  });

  if (process.env.ULUGO_WEB_URL != null && process.env.ULUGO_WEB_URL !== '') {
    await window.loadURL(process.env.ULUGO_WEB_URL);
  } else {
    await window.loadFile(path.join(__dirname, '../../web/dist/index.html'));
  }
  void setupFirstRunKataGo(window.webContents);
}

if (singleInstanceLock) {
  app.on('second-instance', (_event, argv) => {
    const filePath = gameRecordFilePathFromArgs(argv);
    if (filePath != null) void openGameRecordFile(filePath);
    focusMainWindow();
  });

  app.whenReady().then(async () => {
    registerIpc();
    await createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  });
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  void openGameRecordFile(filePath);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (autoSaveBeforeQuitComplete || autoSaveCandidate == null || autoSaveCandidate.moveCount <= 16) return;
  event.preventDefault();
  if (autoSaveBeforeQuit) return;

  autoSaveBeforeQuit = true;
  void archiveCurrentUnsavedGame()
    .catch((error) => {
      dialog.showErrorBox('Ulugo', error instanceof Error ? error.message : 'Failed to auto-save the game.');
    })
    .finally(() => {
      autoSaveBeforeQuitComplete = true;
      app.quit();
    });
});

function registerIpc(): void {
  ipcMain.handle('ulugo:read-clipboard', () => {
    const image = clipboard.readImage();
    return {
      text: clipboard.readText(),
      image: image.isEmpty()
        ? null
        : {
            kind: 'image',
            data: image.toPNG(),
            fileName: 'clipboard.png',
            mimeType: 'image/png',
          },
    };
  });
  ipcMain.handle('ulugo:open-external', async (_event, value: string) => {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('Only HTTPS links can be opened externally.');
    await shell.openExternal(url.toString());
  });
  ipcMain.handle('ulugo:import-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Game records and images',
          extensions: ['sgf', 'gib', 'avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'webp'],
        },
      ],
    });
    if (result.canceled || result.filePaths[0] == null) return null;

    if (!isGameRecordFilePath(result.filePaths[0])) return readImageFile(result.filePaths[0]);
    await archiveCurrentUnsavedGame();
    return readGameRecordFile(result.filePaths[0]);
  });
  ipcMain.handle('ulugo:consume-open-game-record', async () => {
    return consumePendingGameRecordFile();
  });
  ipcMain.handle('ulugo:get-recent-files', () => readRecentFiles(ulugoDataDirectory()));
  ipcMain.handle('ulugo:open-recent-file', async (_event, filePath: string) => {
    const recent = await readRecentFiles(ulugoDataDirectory());
    if (!recent.some((item) => item.filePath === filePath)) throw new Error('Recent file no longer exists.');
    if (!isGameRecordFilePath(filePath)) return readImageFile(filePath);
    await archiveCurrentUnsavedGame();
    return readGameRecordFile(filePath);
  });
  ipcMain.handle('ulugo:add-recent-file', async (_event, filePath: string) => {
    if (!isGameRecordFilePath(filePath) && !isImageFilePath(filePath)) return;
    await addRecentFile(ulugoDataDirectory(), filePath);
  });
  ipcMain.handle('ulugo:archive-unsaved-game', () => archiveCurrentUnsavedGame());
  ipcMain.on('ulugo:update-auto-save-candidate', (_event, candidate: unknown) => {
    autoSaveCandidate = normalizeAutoSaveCandidate(candidate);
  });

  ipcMain.handle(
    'ulugo:export-sgf',
    async (_event, request: {content: string; suggestedName: string; filePath?: string}) => {
      let filePath = request.filePath;
      if (filePath == null) {
        const result = await dialog.showSaveDialog({
          defaultPath: request.suggestedName,
          filters: [{name: 'SGF files', extensions: ['sgf']}],
        });
        if (result.canceled) return {canceled: true};
        filePath = result.filePath;
      }
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

  ipcMain.handle('ulugo:katago:get-settings', () => readKataGoSettings());
  ipcMain.handle('ulugo:katago:save-settings', async (_event, settings: KataGoSettings) => {
    const previous = await readKataGoSettings();
    const next = await normalizeKataGoSettings({...defaultKataGoSettings, ...settings});
    await writeKataGoSettings(next);
    restartKataGoEngineIfSettingsChanged(previous, next);
    return next;
  });
  ipcMain.handle('ulugo:katago:get-assets', async () => getKataGoAssetInventory());
  ipcMain.handle('ulugo:katago:refresh-assets', async (event) => {
    sendKataGoConsole(event.sender, 'ulugo', 'info', 'Refreshing KataGo and model availability.');
    await refreshKataGoAssetCatalog();
    sendKataGoConsole(event.sender, 'ulugo', 'info', 'KataGo availability refreshed.');
    return getKataGoAssetInventory();
  });
  ipcMain.handle('ulugo:katago:select-asset', async (_event, request: {kind: KataGoAssetKind; assetId: string}) =>
    selectKataGoAsset(request.kind, request.assetId)
  );
  ipcMain.handle('ulugo:katago:uninstall-asset', async (event, request: {kind: KataGoAssetKind; assetId: string}) => {
    const inventory = await getKataGoAssetInventory();
    const assets = request.kind === 'katago' ? inventory.katago : inventory.models;
    const asset = assets.find((item) => item.id === request.assetId);
    if (asset == null || asset.path == null) throw new Error(`Unknown ${request.kind} asset: ${request.assetId}`);

    sendKataGoConsole(event.sender, 'ulugo', 'info', `Uninstalling ${asset.label}.`);
    await uninstallKataGoAsset(asset, request.kind);
    const previous = await readKataGoSettings();
    const next = await normalizeKataGoSettings({
      ...previous,
      executablePath:
        request.kind === 'katago' && previous.executablePath === asset.path ? '' : previous.executablePath,
      modelPath: request.kind === 'model' && previous.modelPath === asset.path ? '' : previous.modelPath,
      configPath: request.kind === 'katago' && previous.executablePath === asset.path ? '' : previous.configPath,
    });
    await writeKataGoSettings(next);
    restartKataGoEngineIfSettingsChanged(previous, next);
    sendKataGoConsole(event.sender, 'ulugo', 'info', `${asset.label} uninstalled.`);
    return getKataGoAssetInventory();
  });
  ipcMain.handle('ulugo:katago:download', async (event, request: {kind: 'katago' | 'model'; optionId: string}) => {
    const catalog = await readKataGoAssetCatalog();
    const options = request.kind === 'katago' ? catalog.katago : catalog.models;
    const option = options.find((item) => item.id === request.optionId);
    if (option == null) throw new Error(`Unknown download option: ${request.optionId}`);

    return installKataGoAsset(request.kind, option, event.sender);
  });
  ipcMain.handle('ulugo:katago:analyze', async (event, query: KataGoAnalysisQuery) => {
    const normalizedQuery = normalizeAnalysisQuery(query);
    activeKataGoQueryIds.add(normalizedQuery.id);
    try {
      const settings = await readKataGoSettings();
      await ensureKataGoEngine(settings, event.sender);
      if (!activeKataGoQueryIds.has(normalizedQuery.id)) return;
      await writeKataGoMessage(withKataGoOverrideSettings(normalizedQuery, settings));
    } catch (error) {
      if (!activeKataGoQueryIds.delete(normalizedQuery.id)) return;
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

function focusMainWindow(): void {
  if (mainWindow == null || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.moveTop();
  mainWindow.focus();
}

async function openGameRecordFile(filePath: string): Promise<void> {
  if (!isGameRecordFilePath(filePath)) return;
  await archiveCurrentUnsavedGame();
  pendingOpenFilePath = filePath;

  if (!app.isReady() || mainWindow == null || mainWindow.isDestroyed()) {
    if (app.isReady()) await createWindow();
    return;
  }

  try {
    mainWindow.webContents.send('ulugo:open-game-record', await consumePendingGameRecordFile());
  } catch (error) {
    sendKataGoConsole(
      mainWindow.webContents,
      'ulugo',
      'error',
      error instanceof Error ? error.message : 'Failed to open game record.'
    );
  }
}

async function consumePendingGameRecordFile(): Promise<GameRecordOpenResult | null> {
  if (pendingOpenFilePath == null) return null;

  const filePath = pendingOpenFilePath;
  pendingOpenFilePath = null;
  return readGameRecordFile(filePath);
}

async function readGameRecordFile(filePath: string): Promise<GameRecordOpenResult> {
  const buffer = await fs.readFile(filePath);
  await addRecentFile(ulugoDataDirectory(), filePath);
  return {
    kind: 'gameRecord',
    content: decodeGameRecordBuffer(buffer, filePath.toLowerCase().endsWith('.gib')),
    fileName: path.basename(filePath),
    filePath,
  };
}

async function archiveCurrentUnsavedGame(): Promise<void> {
  const candidate = autoSaveCandidate;
  if (candidate == null) return;
  await autoSaveGame(ulugoDataDirectory(), candidate);
  if (autoSaveCandidate === candidate) autoSaveCandidate = null;
}

function normalizeAutoSaveCandidate(value: unknown): AutoSaveCandidate | null {
  if (value == null || typeof value !== 'object') return null;
  const candidate = value as Partial<AutoSaveCandidate>;
  if (
    typeof candidate.content !== 'string' ||
    typeof candidate.fileName !== 'string' ||
    typeof candidate.moveCount !== 'number' ||
    !Number.isInteger(candidate.moveCount) ||
    candidate.moveCount < 0
  ) {
    return null;
  }
  return {content: candidate.content, fileName: candidate.fileName, moveCount: candidate.moveCount};
}

async function readImageFile(filePath: string): Promise<ImageOpenResult> {
  const data = await fs.readFile(filePath);
  await addRecentFile(ulugoDataDirectory(), filePath);
  return {
    kind: 'image',
    data,
    fileName: path.basename(filePath),
    mimeType: imageMimeType(filePath),
  };
}

function imageMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.svg') return 'image/svg+xml';
  return `image/${extension.slice(1)}`;
}

function gameRecordFilePathFromArgs(argv: string[]): string | null {
  return argv.find((item) => !item.startsWith('-') && isGameRecordFilePath(item)) ?? null;
}

function isGameRecordFilePath(filePath: string): boolean {
  return /\.(sgf|gib)$/i.test(filePath);
}

function isImageFilePath(filePath: string): boolean {
  return /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(filePath);
}

async function getKataGoAssetInventory(): Promise<{
  katago: KataGoAsset[];
  models: KataGoAsset[];
  settings: KataGoSettings;
}> {
  const settings = await readKataGoSettings();
  const catalog = await readKataGoAssetCatalog();
  const assets = await listKataGoAssets(catalog);
  if (settings.executablePath !== '' && !assets.katago.some((asset) => asset.path === settings.executablePath)) {
    assets.katago.unshift({
      id: `custom:${settings.executablePath}`,
      label: settings.executablePath,
      available: false,
      installed: true,
      path: settings.executablePath,
    });
  }
  return {...assets, settings};
}

async function selectKataGoAsset(kind: KataGoAssetKind, assetId: string): Promise<KataGoSettings> {
  const inventory = await getKataGoAssetInventory();
  const assets = kind === 'katago' ? inventory.katago : inventory.models;
  const asset = assets.find((item) => item.id === assetId);
  if (asset == null || asset.path == null) throw new Error(`Selected ${kind} is not installed.`);

  const previous = inventory.settings;
  const next = await normalizeKataGoSettings(
    kind === 'katago'
      ? {...previous, executablePath: asset.path, configPath: ''}
      : {...previous, modelPath: asset.path},
    path.dirname(asset.path)
  );
  await writeKataGoSettings(next);
  restartKataGoEngineIfSettingsChanged(previous, next);
  return next;
}

async function installKataGoAsset(
  kind: KataGoAssetKind,
  option: KataGoAvailableAsset,
  sender: WebContents
): Promise<{path: string; settings: KataGoSettings}> {
  sendKataGoConsole(sender, 'ulugo', 'info', `Downloading ${option.label}.`);
  const result = await downloadKataGoAsset(option, kind, (progress) => {
    sender.send('ulugo:katago:download-progress', progress);
  });
  const settings = await readKataGoSettings();
  const nextSettings = await normalizeKataGoSettings(
    kind === 'katago' ? {...settings, executablePath: result.path} : {...settings, modelPath: result.path},
    path.dirname(result.path)
  );
  await writeKataGoSettings(nextSettings);
  restartKataGoEngineIfSettingsChanged(settings, nextSettings);
  sendKataGoConsole(sender, 'ulugo', 'info', `${option.label} installed at ${result.path}.`);
  return {...result, settings: nextSettings};
}

async function setupFirstRunKataGo(sender: WebContents): Promise<void> {
  if ((await readJson(firstRunSetupFileName, {complete: false})).complete) return;

  try {
    sendKataGoConsole(sender, 'ulugo', 'info', 'Setting up KataGo for first use.');
    if (process.platform === 'darwin') await setupFirstRunMacKataGo(sender);

    const catalog = await refreshKataGoAssetCatalog(process.platform, (message) => {
      sendKataGoConsole(sender, 'ulugo', 'info', message);
    });
    sendKataGoConsole(sender, 'ulugo', 'info', 'Selecting first-use KataGo and model options.');
    const modelOption = catalog.models.find((asset) => asset.id.toLowerCase().includes('b18c384'));
    if (modelOption == null) throw new Error('No b18c384 KataGo model is available.');

    if (process.platform !== 'darwin') {
      const katagoOption = catalog.katago.find((asset) => asset.id.toLowerCase().includes('opencl'));
      if (katagoOption == null) throw new Error('No OpenCL KataGo build is available for this platform.');

      const inventory = await getKataGoAssetInventory();
      const installedKataGo = inventory.katago.find((asset) => asset.id === katagoOption.id && asset.path != null);
      if (installedKataGo == null) await installKataGoAsset('katago', katagoOption, sender);
      else await selectKataGoAsset('katago', installedKataGo.id);
    }

    const inventory = await getKataGoAssetInventory();
    const installedModel = inventory.models.find((asset) => asset.id === modelOption.id && asset.path != null);
    if (installedModel == null) await installKataGoAsset('model', modelOption, sender);
    else await selectKataGoAsset('model', installedModel.id);

    await writeJson(firstRunSetupFileName, {complete: true});
    sendKataGoConsole(sender, 'ulugo', 'info', 'First-use KataGo setup complete.');
  } catch (error) {
    sendKataGoConsole(
      sender,
      'ulugo',
      'error',
      error instanceof Error ? `First-use KataGo setup failed: ${error.message}` : 'First-use KataGo setup failed.'
    );
  }
}

async function setupFirstRunMacKataGo(sender: WebContents): Promise<void> {
  sendKataGoConsole(
    sender,
    'ulugo',
    'info',
    'macOS uses KataGo from Homebrew. Ulugo will not download a macOS KataGo binary.'
  );
  const executablePath = await findKataGoOnPath();
  if (executablePath == null) {
    sendMacKataGoHomebrewGuidance(sender);
    await showMacKataGoHomebrewDialog(sender);
    throw new Error('KataGo was not found on this Mac.');
  }

  sendKataGoConsole(sender, 'ulugo', 'info', `Found KataGo at ${executablePath}.`);
  const previous = await readKataGoSettings();
  const next = await normalizeKataGoSettings({...previous, executablePath, configPath: ''});
  await writeKataGoSettings(next);
  restartKataGoEngineIfSettingsChanged(previous, next);
}

async function findKataGoOnPath(): Promise<string | null> {
  const candidates = [
    ...new Set([...pathCandidatesFromEnv('katago'), '/opt/homebrew/bin/katago', '/usr/local/bin/katago']),
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

function pathCandidatesFromEnv(executableName: string): string[] {
  return (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter((directory) => directory !== '')
    .map((directory) => path.join(directory, executableName));
}

function sendMacKataGoHomebrewGuidance(sender: WebContents): void {
  sendKataGoConsole(
    sender,
    'ulugo',
    'warning',
    [
      'KataGo was not found on this Mac.',
      'Install the Apple Silicon Metal build with Homebrew:',
      '1. Open Terminal.',
      '2. If Homebrew is not installed, install it from https://brew.sh/.',
      '3. Run: brew install katago',
      '4. Verify it with: /opt/homebrew/bin/katago version',
      '5. Restart Ulugo after installation.',
    ].join('\n')
  );
}

async function showMacKataGoHomebrewDialog(sender: WebContents): Promise<void> {
  const window = BrowserWindow.fromWebContents(sender);
  const options: MessageBoxOptions = {
    type: 'info',
    title: 'KataGo setup needed',
    message: 'KataGo is not installed.',
    detail: 'Check the KataGo console for Homebrew installation steps.',
    buttons: ['OK'],
  };
  if (window == null) await dialog.showMessageBox(options);
  else await dialog.showMessageBox(window, options);
}

async function readAnalysisSettings(): Promise<AnalysisSettings> {
  return normalizeAnalysisSettings(await readJson('analysis-settings.json', defaultAnalysisSettings));
}

function normalizeAnalysisSettings(
  settings: Partial<AnalysisSettings> & {
    moveDisplay?: unknown;
    stoneOverlay?: AnalysisSettings['stoneOverlay'] | 'markup';
    topMoveDisplay?: AnalysisSettings['stoneOverlay'] | 'markup';
    maxIntensity?: unknown;
  }
): AnalysisSettings {
  const {topMoveDisplay, maxIntensity: legacyMaxIntensity, ...storedSettings} = settings;
  const stoneOverlay = settings.stoneOverlay ?? topMoveDisplay ?? defaultAnalysisSettings.stoneOverlay;
  const legacyMinimalMode = ['z', 'e', 'n'].join('');
  const storedMode = settings.mode as string | undefined;
  let mode: AnalysisMode = 'review';
  if (storedMode === 'edit' || storedMode === 'minimal') mode = storedMode;
  else if (storedMode === legacyMinimalMode) mode = 'minimal';
  const activeModeSettings = normalizeAnalysisModeSettings(
    {
      stoneOverlay: stoneOverlay === 'markup' ? 'none' : stoneOverlay,
      showMarkup: mode === 'minimal' ? false : settings.showMarkup,
      showNextMove: settings.showNextMove,
      showTopMoves: settings.showTopMoves,
      showExpectedTerritory: settings.showExpectedTerritory,
      showHotZone: settings.showHotZone,
      showScore: settings.showScore,
      showPointLoss: settings.showPointLoss,
      showWinrate: settings.showWinrate,
      showIntensity: settings.showIntensity,
      showComments: settings.showComments,
    },
    defaultAnalysisSettings.modeSettings[mode]
  );
  const modeSettings = {
    review: normalizeAnalysisModeSettings(settings.modeSettings?.review, defaultAnalysisSettings.modeSettings.review),
    edit: normalizeAnalysisModeSettings(settings.modeSettings?.edit, defaultAnalysisSettings.modeSettings.edit),
    minimal: normalizeAnalysisModeSettings(
      settings.modeSettings?.minimal ??
        (settings.modeSettings as Partial<Record<string, AnalysisModeSettings>> | undefined)?.[legacyMinimalMode],
      defaultAnalysisSettings.modeSettings.minimal
    ),
    [mode]: activeModeSettings,
  };
  return {
    ...defaultAnalysisSettings,
    ...storedSettings,
    moveDisplay: normalizeMoveDisplay(settings.moveDisplay),
    intensityDisplayLimit: normalizeIntensityDisplayLimit(settings.intensityDisplayLimit ?? legacyMaxIntensity),
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

function normalizeIntensityDisplayLimit(value: unknown): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return defaultAnalysisSettings.intensityDisplayLimit;
  return Math.max(1, Math.round(numberValue));
}

function normalizeAnalysisModeSettings(
  settings: Partial<AnalysisModeSettings> | undefined,
  defaults: AnalysisModeSettings
): AnalysisModeSettings {
  const stoneOverlay = settings?.stoneOverlay;
  return {
    ...defaults,
    ...settings,
    showIntensity: settings?.showIntensity ?? defaults.showIntensity,
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

async function readKataGoSettings(): Promise<KataGoSettings> {
  if (kataGoSettingsCache != null) return kataGoSettingsCache;
  if (kataGoSettingsLoad == null) {
    kataGoSettingsLoad = (async () => {
      const stored = await readJson('katago-settings.json', defaultKataGoSettings);
      const normalized = await normalizeKataGoSettings(stored);
      await writeJson('katago-settings.json', normalized);
      kataGoSettingsCache = normalized;
      return normalized;
    })();
  }

  try {
    return await kataGoSettingsLoad;
  } finally {
    kataGoSettingsLoad = null;
  }
}

async function writeKataGoSettings(settings: KataGoSettings): Promise<KataGoSettings> {
  if (kataGoSettingsLoad != null) await kataGoSettingsLoad.catch(() => undefined);
  const saved = await writeJson('katago-settings.json', settings);
  kataGoSettingsCache = saved;
  return saved;
}

async function normalizeKataGoSettings(settings: KataGoSettings, searchDirectory?: string): Promise<KataGoSettings> {
  const executablePath = await findKataGoExecutablePath(settings.executablePath);
  const modelPath = await findInstalledAssetPath('model', settings.modelPath);
  const configSearchPath =
    searchDirectory ??
    (executablePath !== '' && !isInsideUlugoData(executablePath) ? ulugoDataDirectory() : executablePath);
  const defaultConfigPath = executablePath === '' ? '' : await findDefaultKataGoConfig(configSearchPath);
  const configPath =
    executablePath === ''
      ? ''
      : settings.configPath !== '' &&
          (await fileExists(settings.configPath)) &&
          !shouldUseDefaultKataGoConfig(settings.configPath, defaultConfigPath)
        ? settings.configPath
        : defaultConfigPath;

  return {...defaultKataGoSettings, ...settings, executablePath, modelPath, configPath};
}

async function findKataGoExecutablePath(preferredPath: string): Promise<string> {
  if (preferredPath !== '' && (await fileExists(preferredPath))) return preferredPath;
  return findInstalledAssetPath('katago', preferredPath);
}

function isInsideUlugoData(filePath: string): boolean {
  const relative = path.relative(ulugoDataDirectory(), filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function shouldUseDefaultKataGoConfig(configPath: string, defaultConfigPath: string): boolean {
  return (
    defaultConfigPath !== '' &&
    path.basename(defaultConfigPath) === 'ulugo-analysis.cfg' &&
    path.basename(configPath) === 'analysis_example.cfg'
  );
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

  if (katagoStart != null) {
    const pendingStart = katagoStart;
    try {
      await pendingStart.promise;
    } catch (error) {
      if (pendingStart.generation === katagoEngineGeneration) throw error;
    }
    if (katagoProcess == null) {
      if (pendingStart.generation === katagoEngineGeneration) throw new Error('KataGo exited while starting.');
      if (katagoStart === pendingStart) katagoStart = null;
      return ensureKataGoEngine(await readKataGoSettings(), sender);
    }
    return;
  }

  const generation = katagoEngineGeneration;
  const promise = startKataGoEngine(settings, sender, generation);
  const start = {generation, promise};
  katagoStart = start;
  try {
    await promise;
  } finally {
    if (katagoStart === start) katagoStart = null;
  }
}

async function startKataGoEngine(settings: KataGoSettings, sender: WebContents, generation: number): Promise<void> {
  if (settings.executablePath === '' || !(await fileExists(settings.executablePath))) {
    throw new Error('KataGo cannot start because no installed executable is selected.');
  }
  if (settings.modelPath === '' || !(await fileExists(settings.modelPath))) {
    throw new Error('KataGo cannot start because no installed model is selected.');
  }
  if (settings.configPath === '' || !(await fileExists(settings.configPath))) {
    throw new Error('KataGo cannot start because no analysis config is available.');
  }

  const {command, args, options} = kataGoCommand(settings);
  sendKataGoConsole(sender, 'ulugo', 'info', `Starting KataGo: ${command} ${args.join(' ')}`);
  sendKataGoConsole(
    sender,
    'ulugo',
    'info',
    `KataGo tuning: maxVisits=${settings.maxVisits}, fastVisits=${settings.fastVisits}, wideRootNoise=${settings.wideRootNoise}.`
  );
  if (generation !== katagoEngineGeneration) throw new Error('KataGo configuration changed while starting.');

  const process = spawn(command, args, options);
  let outputBuffer = '';
  katagoProcess = process;

  process.stdout.on('data', (chunk: Buffer) => {
    outputBuffer += chunk.toString('utf8');
    const lines = outputBuffer.split(/\r?\n/);
    outputBuffer = lines.pop() ?? '';

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

  process.stderr.on('data', (chunk: Buffer) => {
    const message = chunk.toString('utf8').trim();
    if (message !== '') {
      const level = /error|failed|fatal/i.test(message) ? 'error' : /warn/i.test(message) ? 'warning' : 'info';
      sendKataGoConsole(katagoSender, 'katago', level, message);
      if (level === 'error') katagoSender?.send('ulugo:katago:analysis-error', message);
    }
  });

  process.stdin.on('error', (error) => {
    sendKataGoConsole(katagoSender, 'katago', 'error', error.message);
    katagoSender?.send('ulugo:katago:analysis-error', error.message);
  });

  process.on('error', (error) => {
    sendKataGoConsole(katagoSender, 'katago', 'error', error.message);
    katagoSender?.send('ulugo:katago:analysis-error', error.message);
    if (katagoProcess === process) {
      katagoProcess = null;
      resetActiveKataGoQueries(true);
    }
  });

  process.on('exit', (code, signal) => {
    if (katagoProcess === process) {
      katagoProcess = null;
      resetActiveKataGoQueries(true);
    }
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

function restartKataGoEngineIfSettingsChanged(previous: KataGoSettings, next: KataGoSettings): void {
  if (
    previous.executablePath === next.executablePath &&
    previous.modelPath === next.modelPath &&
    previous.configPath === next.configPath &&
    previous.altCommand === next.altCommand
  ) {
    return;
  }

  katagoEngineGeneration += 1;
  if (katagoProcess == null) return;
  const process = katagoProcess;
  resetActiveKataGoQueries();
  katagoProcess = null;
  process.kill();
  sendKataGoConsole(katagoSender, 'ulugo', 'info', 'KataGo configuration changed. The engine will restart on demand.');
}

function resetActiveKataGoQueries(fatal = false): void {
  const queryIds = [...activeKataGoQueryIds];
  activeKataGoQueryIds.clear();
  if (queryIds.length > 0 || fatal) katagoSender?.send('ulugo:katago:analysis-reset', queryIds, fatal);
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
      `homeDataDir=${ulugoDataDirectory()}`,
    ],
  };
}

function normalizeAnalysisQuery(query: KataGoAnalysisQuery): KataGoAnalysisQuery {
  return {
    ...query,
    komi: normalizeKomi(query.komi),
    rules: normalizeRules(query.rules),
    initialPlayer: query.initialPlayer === 'W' ? 'W' : 'B',
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
  const idsToTerminate = queryIds ?? [...activeKataGoQueryIds];
  if (queryIds == null) {
    activeKataGoQueryIds.clear();
  } else {
    for (const queryId of queryIds) activeKataGoQueryIds.delete(queryId);
  }
  if (katagoProcess == null || idsToTerminate.length === 0) return;

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
