import type {KataGoAnalysisResult, AnalysisSettings} from '@ulugo/analysis-core';
import type {
  KataGoAnalysisQuery,
  KataGoAssetInventory,
  KataGoConsoleMessage,
  KataGoDownloadProgress,
  KataGoDownloadResult,
  KataGoSettings,
} from '@ulugo/katago-core';

export interface ElectronImportResult {
  content: string;
  fileName: string;
  filePath: string;
}

export interface ElectronExportRequest {
  content: string;
  suggestedName: string;
  filePath?: string;
}

export interface ElectronExportResult {
  canceled: boolean;
  filePath?: string;
  fileName?: string;
}

export interface ElectronGoogleDriveOpenResult {
  content: string;
  fileId: string;
  fileName: string;
}

export interface ElectronGoogleDriveSaveRequest {
  content: string;
  fileName: string;
  fileId?: string | null;
}

export interface ElectronGoogleDriveSaveResult {
  fileId: string;
  fileName: string;
}

export interface UlugoElectronApi {
  platform: 'electron';
  importSgf: () => Promise<ElectronImportResult | null>;
  exportSgf: (request: ElectronExportRequest) => Promise<ElectronExportResult>;
  selectFile: (options?: {
    title?: string;
    filters?: Array<{name: string; extensions: string[]}>;
  }) => Promise<string | null>;
  googleDrive: {
    openSgf: () => Promise<ElectronGoogleDriveOpenResult | null>;
    saveSgf: (request: ElectronGoogleDriveSaveRequest) => Promise<ElectronGoogleDriveSaveResult | null>;
    cancel: () => Promise<void>;
  };
  katago: {
    getSettings: () => Promise<KataGoSettings>;
    saveSettings: (settings: KataGoSettings) => Promise<KataGoSettings>;
    getAssets: () => Promise<KataGoAssetInventory>;
    refreshAssets: () => Promise<KataGoAssetInventory>;
    selectAsset: (request: {kind: 'katago' | 'model'; assetId: string}) => Promise<KataGoSettings>;
    uninstallAsset: (request: {kind: 'katago' | 'model'; assetId: string}) => Promise<KataGoAssetInventory>;
    download: (request: {kind: 'katago' | 'model'; optionId: string}) => Promise<KataGoDownloadResult>;
    onDownloadProgress: (callback: (progress: KataGoDownloadProgress) => void) => () => void;
    analyze: (query: KataGoAnalysisQuery) => Promise<void>;
    stopAnalysis: (queryIds?: string[]) => Promise<void>;
    onAnalysis: (callback: (result: KataGoAnalysisResult) => void) => () => void;
    onAnalysisError: (callback: (message: string) => void) => () => void;
    onConsoleMessage: (callback: (message: KataGoConsoleMessage) => void) => () => void;
  };
  analysis: {
    getSettings: () => Promise<AnalysisSettings>;
    saveSettings: (settings: AnalysisSettings) => Promise<AnalysisSettings>;
  };
}

declare global {
  interface Window {
    ulugo?: UlugoElectronApi;
  }
}
