import {shell} from 'electron';
import crypto from 'node:crypto';
import http from 'node:http';

const googleDriveScope = 'https://www.googleapis.com/auth/drive.file';
const googleProjectNumber = '218591242507';
const webGoogleClientId = '218591242507-ri5lbt729mok7n0tkbst69lhcb3kpele.apps.googleusercontent.com';
const googleDriveBridgePorts = [5274, 5375, 5476, 5072];
const sgfMimeType = 'application/x-go-sgf';
const googleDriveFolderName = 'Ulugo';
const googleDriveFolderMimeType = 'application/vnd.google-apps.folder';
const googleDriveFolderMarker = 'ulugoFolder';

interface GoogleDriveBridgeSgf {
  content: string;
  fileName: string;
  fileId?: string | null;
}

interface GoogleDriveBridgeFile {
  content: string;
  fileId: string;
  fileName: string;
}

interface GoogleDriveBridgeSaveResult {
  fileId: string;
  fileName: string;
}

let activeGoogleDriveBridgeCancel: (() => void) | null = null;

export async function openGoogleDriveSgf(): Promise<GoogleDriveBridgeFile | null> {
  return runGoogleDriveBridge('open');
}

export async function saveGoogleDriveSgf(
  content: string,
  fileName: string,
  fileId?: string | null
): Promise<GoogleDriveBridgeSaveResult | null> {
  return runGoogleDriveBridge('save', {content, fileName, fileId});
}

export function cancelGoogleDriveBridge(): void {
  activeGoogleDriveBridgeCancel?.();
}

function runGoogleDriveBridge(mode: 'open', sgf?: undefined): Promise<GoogleDriveBridgeFile | null>;
function runGoogleDriveBridge(mode: 'save', sgf: GoogleDriveBridgeSgf): Promise<GoogleDriveBridgeSaveResult | null>;
async function runGoogleDriveBridge(
  mode: 'open' | 'save',
  sgf?: GoogleDriveBridgeSgf
): Promise<GoogleDriveBridgeFile | GoogleDriveBridgeSaveResult | null> {
  if (activeGoogleDriveBridgeCancel != null) throw new Error('Google Drive operation already in progress.');

  const token = crypto.randomUUID();
  let finish: (result: GoogleDriveBridgeFile | GoogleDriveBridgeSaveResult | null) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const {server, port} = await createGoogleDriveBridgeServer((request, response) => {
    void handleGoogleDriveBridgeRequest({
      request,
      response,
      mode,
      token,
      sgf,
      finish,
      fail,
    }).catch((error) => {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      if (!response.headersSent) sendJson(response, 500, {error: normalizedError.message});
      fail(normalizedError);
    });
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let cancel: () => void = () => undefined;
    const cleanup = () => {
      if (activeGoogleDriveBridgeCancel === cancel) activeGoogleDriveBridgeCancel = null;
      server.close();
      server.closeAllConnections?.();
    };
    finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    cancel = () => finish(null);
    activeGoogleDriveBridgeCancel = cancel;

    shell.openExternal(`http://localhost:${port}/${mode}?token=${encodeURIComponent(token)}`).catch((error) => {
      fail(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function createGoogleDriveBridgeServer(
  listener: (request: http.IncomingMessage, response: http.ServerResponse) => void
): Promise<{server: http.Server; port: number}> {
  return googleDriveBridgePorts
    .reduce<Promise<{server: http.Server; port: number} | null>>(
      (previous, port) =>
        previous.then(async (result) => {
          if (result != null) return result;
          try {
            return {server: await listenOnGoogleDriveBridgePort(port, listener), port};
          } catch {
            return null;
          }
        }),
      Promise.resolve(null)
    )
    .then((result) => {
      if (result == null) throw new Error('Could not start Google Drive bridge server.');
      return result;
    });
}

function listenOnGoogleDriveBridgePort(
  port: number,
  listener: (request: http.IncomingMessage, response: http.ServerResponse) => void
): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(listener);
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

async function handleGoogleDriveBridgeRequest({
  request,
  response,
  mode,
  token,
  sgf,
  finish,
  fail,
}: {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  mode: 'open' | 'save';
  token: string;
  sgf?: GoogleDriveBridgeSgf;
  finish: (result: GoogleDriveBridgeFile | GoogleDriveBridgeSaveResult | null) => void;
  fail: (error: Error) => void;
}): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  if (requestUrl.pathname === '/redirect' && request.method === 'GET') {
    sendHtml(response, createGoogleDriveBridgePage(mode, token));
    return;
  }

  if (requestUrl.searchParams.get('token') !== token) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/open' && mode === 'open') {
    sendHtml(response, createGoogleDriveBridgePage('open', token));
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/save' && mode === 'save') {
    sendHtml(response, createGoogleDriveBridgePage('save', token));
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/sgf' && mode === 'save' && sgf != null) {
    sendJson(response, 200, sgf);
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/sgf') {
    const body = (await readJsonRequest(request)) as Partial<GoogleDriveBridgeFile & GoogleDriveBridgeSaveResult>;
    if (mode === 'open') {
      if (typeof body.content !== 'string' || typeof body.fileId !== 'string' || typeof body.fileName !== 'string') {
        sendJson(response, 400, {error: 'Invalid SGF payload.'});
        return;
      }
      sendJson(response, 200, {ok: true});
      finish({content: body.content, fileId: body.fileId, fileName: body.fileName});
      return;
    }
    if (typeof body.fileId !== 'string' || typeof body.fileName !== 'string') {
      sendJson(response, 400, {error: 'Invalid save result.'});
      return;
    }
    sendJson(response, 200, {ok: true});
    finish({fileId: body.fileId, fileName: body.fileName});
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/cancel') {
    sendJson(response, 200, {ok: true});
    finish(null);
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/api/error') {
    const body = (await readJsonRequest(request)) as {message?: unknown};
    sendJson(response, 200, {ok: true});
    fail(new Error(typeof body.message === 'string' ? body.message : 'Google Drive operation failed.'));
    return;
  }

  sendText(response, 404, 'Not found');
}

function readJsonRequest(request: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > 32 * 1024 * 1024) {
        reject(new Error('Google Drive payload is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('Invalid JSON request.'));
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  response
    .writeHead(status, {'Connection': 'close', 'Content-Type': 'application/json; charset=utf-8'})
    .end(JSON.stringify(body));
}

function sendHtml(response: http.ServerResponse, body: string): void {
  response.writeHead(200, {'Connection': 'close', 'Content-Type': 'text/html; charset=utf-8'}).end(body);
}

function sendText(response: http.ServerResponse, status: number, body: string): void {
  response.writeHead(status, {'Connection': 'close', 'Content-Type': 'text/plain; charset=utf-8'}).end(body);
}

function createGoogleDriveBridgePage(mode: 'open' | 'save', token: string): string {
  const title = mode === 'open' ? 'Open from Google Drive' : 'Save to Google Drive';
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #1f2933; }
  </style>
</head>
<body>
  Connecting to Google Drive...
  <script>
const MODE = ${JSON.stringify(mode)};
const BRIDGE_TOKEN = ${JSON.stringify(token)};
const GOOGLE_SCOPE = ${JSON.stringify(googleDriveScope)};
const GOOGLE_PROJECT_NUMBER = ${JSON.stringify(googleProjectNumber)};
const GOOGLE_CLIENT_ID = ${JSON.stringify(webGoogleClientId)};
const SGF_MIME_TYPE = ${JSON.stringify(sgfMimeType)};
const DRIVE_FOLDER_NAME = ${JSON.stringify(googleDriveFolderName)};
const DRIVE_FOLDER_MIME_TYPE = ${JSON.stringify(googleDriveFolderMimeType)};
const DRIVE_FOLDER_MARKER = ${JSON.stringify(googleDriveFolderMarker)};
const AUTHORIZED_KEY = 'ulugo.googleDriveAuthorized';
const TOKEN_KEY = 'ulugo.googleDriveBridgeToken';

run().catch(reportError);

async function run() {
  const token = await authorizeGoogleDrive();
  const folderId = await ensureGoogleDriveFolder(token);
  if (MODE === 'open') {
    await loadPicker();
    const file = await pickGoogleDriveFile(token, folderId);
    if (file == null) {
      await reportCancel();
      return;
    }
    setStatus('Opening from Google Drive...');
    const response = await driveFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media&supportsAllDrives=true', token);
    await writeSgf({ content: await response.text(), fileId: file.id, fileName: file.name });
    finish('File opened. Return to Ulugo. You can close this tab.');
    return;
  }

  setStatus('Saving to Google Drive...');
  const sgf = await readSgf();
  const result = sgf.fileId == null || sgf.fileId === ''
    ? await createGoogleDriveFile(token, folderId, sgf.content, sgf.fileName)
    : await updateGoogleDriveFile(token, sgf.fileId, sgf.content, sgf.fileName);
  await writeSgf(result);
  finish('File saved. Return to Ulugo. You can close this tab.');
}

async function authorizeGoogleDrive() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const hashError = hash.get('error');
  if (hashError != null) throw new Error(hashError);
  const hashToken = hash.get('access_token');
  if (hashToken != null) {
    if (hash.get('state') !== BRIDGE_TOKEN) throw new Error('Google sign-in returned invalid state.');
    const expiresIn = Number(hash.get('expires_in') || '3600');
    saveToken(hashToken, expiresIn);
    localStorage.setItem(AUTHORIZED_KEY, 'true');
    history.replaceState(null, document.title, '/' + MODE + '?token=' + encodeURIComponent(BRIDGE_TOKEN));
    return hashToken;
  }

  const cached = readToken();
  if (cached != null) return cached;

  const redirectUri = location.origin + '/redirect';
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', GOOGLE_SCOPE);
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('state', BRIDGE_TOKEN);
  const prompt = localStorage.getItem(AUTHORIZED_KEY) === 'true' ? '' : 'consent';
  if (prompt !== '') authUrl.searchParams.set('prompt', prompt);
  location.assign(authUrl.toString());
  return new Promise(function() {});
}

function saveToken(token, expiresIn) {
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
    accessToken: token,
    expiresAt: Date.now() + expiresIn * 1000
  }));
}

function readToken() {
  try {
    const data = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
    if (data != null && data.accessToken != null && data.expiresAt > Date.now() + 60000) return data.accessToken;
  } catch {}
  return null;
}

function loadPicker() {
  if (window.google != null && window.google.picker != null) return Promise.resolve();
  return loadScript('ulugo-google-api', 'https://apis.google.com/js/api.js').then(function() {
    return new Promise(function(resolve, reject) {
      if (window.gapi == null) {
        reject(new Error('Google API loader is unavailable.'));
        return;
      }
      window.gapi.load('picker', resolve);
    });
  });
}

function loadScript(id, src) {
  const existing = document.getElementById(id);
  if (existing != null) {
    return new Promise(function(resolve, reject) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', function() { reject(new Error('Failed to load ' + src)); }, { once: true });
    });
  }
  return new Promise(function(resolve, reject) {
    const script = document.createElement('script');
    script.id = id;
    script.async = true;
    script.defer = true;
    script.src = src;
    script.onload = resolve;
    script.onerror = function() { reject(new Error('Failed to load ' + src)); };
    document.head.appendChild(script);
  });
}

function pickGoogleDriveFile(token, folderId) {
  const google = window.google;
  if (google == null || google.picker == null) throw new Error('Google Picker is unavailable.');
  return new Promise(function(resolve) {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS).setParent(folderId);
    const builder = new google.picker.PickerBuilder()
      .setAppId(GOOGLE_PROJECT_NUMBER)
      .setOAuthToken(token)
      .addView(view)
      .setCallback(function(data) {
        if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
          return;
        }
        if (data.action !== google.picker.Action.PICKED) return;
        const document = data.docs && data.docs[0];
        if (document == null || document.id == null) {
          resolve(null);
          return;
        }
        resolve({ id: document.id, name: document.name || 'game.sgf' });
      });
    if (google.picker.Feature.SUPPORT_DRIVES != null) builder.enableFeature(google.picker.Feature.SUPPORT_DRIVES);
    builder.build().setVisible(true);
  });
}

async function ensureGoogleDriveFolder(token) {
  const folder =
    await findGoogleDriveFolder(
      token,
      "mimeType='" + DRIVE_FOLDER_MIME_TYPE + "' and trashed=false and appProperties has { key='" + DRIVE_FOLDER_MARKER + "' and value='true' }"
    ) ||
    await findGoogleDriveFolder(
      token,
      "name='" + DRIVE_FOLDER_NAME + "' and mimeType='" + DRIVE_FOLDER_MIME_TYPE + "' and trashed=false and 'root' in parents"
    );
  if (folder != null) return folder.id;

  const response = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      parents: ['root'],
      appProperties: { [DRIVE_FOLDER_MARKER]: 'true' }
    })
  });
  const created = await response.json();
  if (created.id == null) throw new Error('Google Drive did not return the Ulugo folder ID.');
  return created.id;
}

async function findGoogleDriveFolder(token, query) {
  const params = new URLSearchParams({ q: query, spaces: 'drive', fields: 'files(id)', pageSize: '1' });
  const response = await driveFetch('https://www.googleapis.com/drive/v3/files?' + params, token);
  const result = await response.json();
  const file = result.files && result.files[0];
  return file != null && file.id != null ? { id: file.id } : null;
}

async function createGoogleDriveFile(token, folderId, content, fileName) {
  const boundary = 'ulugo_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const body = [
    '--' + boundary,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name: fileName, mimeType: SGF_MIME_TYPE, parents: [folderId] }),
    '--' + boundary,
    'Content-Type: ' + SGF_MIME_TYPE + '; charset=UTF-8',
    '',
    content,
    '--' + boundary + '--'
  ].join('\\r\\n');
  const response = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', token, {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body: body
  });
  const file = await response.json();
  return { fileId: file.id, fileName: file.name || fileName };
}

async function updateGoogleDriveFile(token, fileId, content, fileName) {
  const response = await driveFetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media&fields=id,name&supportsAllDrives=true', token, {
    method: 'PATCH',
    headers: { 'Content-Type': SGF_MIME_TYPE + '; charset=UTF-8' },
    body: content
  });
  const file = await response.json();
  return { fileId: file.id, fileName: file.name || fileName };
}

async function driveFetch(url, token, init) {
  const options = init || {};
  options.headers = Object.assign({}, options.headers, { Authorization: 'Bearer ' + token });
  const response = await fetch(url, options);
  if (!response.ok) throw new Error('Google Drive request failed (' + response.status + ').');
  return response;
}

async function readSgf() {
  const response = await fetch('/api/sgf?token=' + encodeURIComponent(BRIDGE_TOKEN));
  if (!response.ok) throw new Error('Ulugo did not provide an SGF file.');
  return response.json();
}

async function writeSgf(payload) {
  const response = await fetch('/api/sgf?token=' + encodeURIComponent(BRIDGE_TOKEN), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error('Ulugo did not accept the Google Drive result.');
}

async function reportCancel() {
  await fetch('/api/cancel?token=' + encodeURIComponent(BRIDGE_TOKEN), { method: 'POST' }).catch(function() {});
  finish('Google Drive operation canceled. Return to Ulugo. You can close this tab.');
}

async function reportError(error) {
  const message = error instanceof Error ? error.message : String(error);
  await fetch('/api/error?token=' + encodeURIComponent(BRIDGE_TOKEN), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message })
  }).catch(function() {});
  finish('Google Drive operation failed. Return to Ulugo. You can close this tab.');
}

function setStatus(message) {
  document.body.textContent = message;
}

function finish(message) {
  setStatus(message);
}
  </script>
</body>
</html>`;
}
