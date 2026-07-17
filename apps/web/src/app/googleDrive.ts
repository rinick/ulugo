const googleDriveScope = 'https://www.googleapis.com/auth/drive.file';
const googleProjectNumber = '218591242507';
const webClientId = '218591242507-ri5lbt729mok7n0tkbst69lhcb3kpele.apps.googleusercontent.com';
const sgfMimeType = 'application/x-go-sgf';
const webGoogleDriveAuthorizedKey = 'ulugo.googleDriveAuthorized';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  callback: (response: TokenResponse) => void;
  requestAccessToken: (options: {prompt: string}) => void;
}

interface PickerDocument {
  id?: string;
  name?: string;
}

interface PickerResponse {
  action: string;
  docs?: PickerDocument[];
}

interface PickerBuilder {
  enableFeature: (feature: string) => PickerBuilder;
  setAppId: (appId: string) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  addView: (view: unknown) => PickerBuilder;
  setCallback: (callback: (data: PickerResponse) => void) => PickerBuilder;
  build: () => {setVisible: (visible: boolean) => void};
}

interface GoogleGlobals {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
      }) => TokenClient;
    };
  };
  picker: {
    Action: {PICKED: string; CANCEL: string};
    Feature: Record<string, string>;
    ViewId: {DOCS: string};
    View: new (viewId: string) => {setMimeTypes?: (mimeTypes: string) => void};
    PickerBuilder: new () => PickerBuilder;
  };
}

interface GapiGlobals {
  load: (features: string, callback: () => void) => void;
}

declare global {
  interface Window {
    gapi?: GapiGlobals;
    google?: GoogleGlobals;
  }
}

export interface GoogleDriveOpenResult {
  content: string;
  fileId: string;
  fileName: string;
}

export interface GoogleDriveSaveResult {
  fileId: string;
  fileName: string;
}

let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
let tokenClient: TokenClient | null = null;
let gisPromise: Promise<void> | null = null;
let pickerPromise: Promise<void> | null = null;

export async function openSgfFromGoogleDrive(platform: 'web' | 'electron'): Promise<GoogleDriveOpenResult | null> {
  if (platform === 'electron') return window.ulugo?.googleDrive.openSgf() ?? null;

  const token = await authorizeGoogleDrive(platform);
  await loadPicker();
  const file = await pickGoogleDriveFile(token);
  if (file == null) return null;

  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
    token
  );

  return {
    content: await response.text(),
    fileId: file.id,
    fileName: file.name,
  };
}

export async function saveSgfToGoogleDrive({
  platform,
  content,
  fileName,
  fileId,
}: {
  platform: 'web' | 'electron';
  content: string;
  fileName: string;
  fileId?: string | null;
}): Promise<GoogleDriveSaveResult | null> {
  if (platform === 'electron') {
    const result = await window.ulugo?.googleDrive.saveSgf({content, fileName, fileId});
    if (result === undefined) throw new Error('Google Drive is unavailable.');
    return result;
  }

  const token = await authorizeGoogleDrive(platform);
  if (fileId != null) return updateGoogleDriveFile(token, fileId, content, fileName);
  return createGoogleDriveFile(token, content, fileName);
}

async function authorizeGoogleDrive(platform: 'web' | 'electron'): Promise<string> {
  if (accessToken != null && accessTokenExpiresAt > Date.now() + 60000) return accessToken;

  await loadGoogleIdentityServices();
  const google = window.google;
  if (google == null) throw new Error('Google sign-in is unavailable.');

  if (tokenClient == null) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: webClientId,
      scope: googleDriveScope,
      callback: () => undefined,
    });
  }

  if (hasPreviousWebGoogleDriveAuthorization()) {
    try {
      return await requestGoogleAccessToken('');
    } catch {
      return requestGoogleAccessToken('consent');
    }
  }
  return requestGoogleAccessToken('consent');
}

function requestGoogleAccessToken(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    tokenClient!.callback = (response) => {
      if (response.error != null) {
        reject(new Error(response.error));
        return;
      }
      if (response.access_token == null) {
        reject(new Error('Google sign-in did not return an access token.'));
        return;
      }
      accessToken = response.access_token;
      accessTokenExpiresAt = Date.now() + (response.expires_in ?? 3600) * 1000;
      rememberWebGoogleDriveAuthorization();
      resolve(response.access_token);
    };
    tokenClient!.requestAccessToken({prompt});
  });
}

function hasPreviousWebGoogleDriveAuthorization(): boolean {
  try {
    return localStorage.getItem(webGoogleDriveAuthorizedKey) === 'true';
  } catch {
    return false;
  }
}

function rememberWebGoogleDriveAuthorization(): void {
  try {
    localStorage.setItem(webGoogleDriveAuthorizedKey, 'true');
  } catch {
    // The access token is still valid for this page session.
  }
}

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.oauth2 != null) return Promise.resolve();
  gisPromise ??= loadScript('ulugo-google-identity-services', 'https://accounts.google.com/gsi/client');
  return gisPromise;
}

function loadPicker(): Promise<void> {
  if (window.google?.picker != null) return Promise.resolve();
  pickerPromise ??= loadScript('ulugo-google-api', 'https://apis.google.com/js/api.js').then(
    () =>
      new Promise<void>((resolve, reject) => {
        if (window.gapi == null) {
          reject(new Error('Google API loader is unavailable.'));
          return;
        }
        window.gapi.load('picker', resolve);
      })
  );
  return pickerPromise;
}

function loadScript(id: string, src: string): Promise<void> {
  const existing = window.document.getElementById(id) as HTMLScriptElement | null;
  if (existing != null) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), {once: true});
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {once: true});
    });
  }

  return new Promise((resolve, reject) => {
    const script = window.document.createElement('script');
    script.id = id;
    script.async = true;
    script.defer = true;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    window.document.head.appendChild(script);
  });
}

function pickGoogleDriveFile(token: string): Promise<{id: string; name: string} | null> {
  const google = window.google;
  if (google == null) throw new Error('Google Picker is unavailable.');

  return new Promise((resolve) => {
    const view = new google.picker.View(google.picker.ViewId.DOCS);
    const builder = new google.picker.PickerBuilder()
      .setAppId(googleProjectNumber)
      .setOAuthToken(token)
      .addView(view)
      .setCallback((data) => {
        if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
          return;
        }
        if (data.action !== google.picker.Action.PICKED) return;

        const document = data.docs?.[0];
        if (document?.id == null) {
          resolve(null);
          return;
        }
        resolve({id: document.id, name: document.name ?? 'game.sgf'});
      });

    if (google.picker.Feature.SUPPORT_DRIVES != null) builder.enableFeature(google.picker.Feature.SUPPORT_DRIVES);
    builder.build().setVisible(true);
  });
}

async function createGoogleDriveFile(token: string, content: string, fileName: string): Promise<GoogleDriveSaveResult> {
  const boundary = `ulugo_${crypto.randomUUID()}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({name: fileName, mimeType: sgfMimeType}),
    `--${boundary}`,
    `${'Content-Type'}: ${sgfMimeType}; charset=UTF-8`,
    '',
    content,
    `--${boundary}--`,
  ].join('\r\n');
  const response = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
    token,
    {
      method: 'POST',
      headers: {'Content-Type': `multipart/related; boundary=${boundary}`},
      body,
    }
  );
  const file = (await response.json()) as {id: string; name?: string};
  return {fileId: file.id, fileName: file.name ?? fileName};
}

async function updateGoogleDriveFile(
  token: string,
  fileId: string,
  content: string,
  fileName: string
): Promise<GoogleDriveSaveResult> {
  const response = await driveFetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name`,
    token,
    {
      method: 'PATCH',
      headers: {'Content-Type': `${sgfMimeType}; charset=UTF-8`},
      body: content,
    }
  );
  const file = (await response.json()) as {id: string; name?: string};
  return {fileId: file.id, fileName: file.name ?? fileName};
}

async function driveFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.status === 401) {
    accessToken = null;
    accessTokenExpiresAt = 0;
  }
  if (!response.ok) throw new Error(`Google Drive request failed (${response.status}).`);
  return response;
}
