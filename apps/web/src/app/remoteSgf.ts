export interface RemoteSgfListItem {
  id: string;
  blackName: string;
  blackRank: string;
  whiteName: string;
  whiteRank: string;
  boardSize: number | string;
  startTime: string;
  result: string;
  canOpen: boolean;
  queryPlayer: 'black' | 'white' | null;
  queryOutcome: 'win' | 'loss' | 'draw' | 'unknown';
}

export interface RemoteSgfList {
  query: string;
  items: RemoteSgfListItem[];
  nextCursor: string | null;
}

export interface RemoteSgfFile {
  content: string;
  fileName: string;
}

export interface RemoteSgfLoginRequest {
  username: string;
  password?: string;
  useSavedPassword?: boolean;
}

export interface RemoteSgfLoginResult {
  query: string;
  credentialsSaved?: boolean;
}

export interface RemoteSgfSavedLogin {
  username: string;
  hasPassword: boolean;
}

export interface RemoteSgfSourceApi {
  isAvailable: () => Promise<boolean>;
  getSavedLogin?: () => Promise<RemoteSgfSavedLogin | null>;
  login?: (request: RemoteSgfLoginRequest) => Promise<RemoteSgfLoginResult>;
  list: (request: {query: string; cursor?: string; limit?: number}) => Promise<RemoteSgfList>;
  read: (request: {query: string; itemId: string}) => Promise<RemoteSgfFile>;
}

export interface RemoteSgfAuthConfig {
  passwordLabel: string;
  savedPasswordPlaceholder: string;
  loginLabel: string;
  loginErrorMessage: string;
  credentialsNotSavedMessage: string;
  queryEditableAfterLogin?: boolean;
}

export interface RemoteSgfSourceConfig {
  id: string;
  title: string;
  queryLabel: string;
  queryPlaceholder: string;
  loadErrorMessage: string;
  openErrorMessage: string;
  storageKey: string;
  source: RemoteSgfSourceApi;
  auth?: RemoteSgfAuthConfig;
}
