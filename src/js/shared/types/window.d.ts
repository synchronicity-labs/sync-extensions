// Window interface extensions for CEP and custom globals
interface Window {
  CSInterface?: {
    new (): {
      getHostEnvironment?: () => { appName?: string; appId?: string };
      getSystemPath?: (path: string) => string;
      evalScript?: (script: string, callback?: (result: string) => void) => void;
      openURLInDefaultBrowser?: (url: string) => void;
      addEventListener?: (event: string, callback: (event: unknown) => void) => void;
      removeEventListener?: (event: string, callback: (event: unknown) => void, scope?: unknown) => void;
      dispatchEvent?: (event: unknown) => void;
      getApplicationID?: () => string;
      getExtensionID?: () => string;
    };
    SystemPath?: {
      EXTENSION: string;
      [key: string]: string;
    };
  };
  cep?: {
    fs?: {
      showOpenDialog?: (allowMultiple: boolean, chooseFolder: boolean, title: string, initialPath: string) => { data: string[] };
      showOpenDialogEx?: (allowMultiple: boolean, chooseFolder: boolean, title: string, initialPath: string) => { data: string[] };
    };
  };
  __adobe_cep__?: {
    getHostEnvironment?: () => string;
    invokeSync?: (method: string, ...args: unknown[]) => unknown;
    invokeAsync?: (method: string, data: string, callback: (result: string) => void) => void;
    addEventListener?: (event: string, callback: (event: unknown) => void) => void;
  };
  debugLog?: (message: string, data?: unknown) => void;
  HOST_CONFIG?: {
    hostId: "AEFT" | "PPRO" | "RESOLVE";
    hostName: string;
    isAE: boolean;
  };
  lucide?: {
    createIcons?: (options?: { root?: HTMLElement }) => void;
  };
  __forceHostId?: "AEFT" | "PPRO" | "RESOLVE";
  nle?: {
    getHostId: () => string;
    loadHostScript: () => Promise<void>;
    startBackend: () => Promise<unknown>;
    getProjectDir: () => Promise<{ path?: string; error?: string }>;
    exportInOutVideo: (opts?: Record<string, unknown>) => Promise<{ path?: string; error?: string }>;
    exportInOutAudio: (opts?: Record<string, unknown>) => Promise<{ path?: string; error?: string }>;
    insertFileAtPlayhead: (fsPath?: string) => Promise<{ ok: boolean; error?: string }>;
    importFileToBin: (fsPath?: string, binName?: string) => Promise<{ ok: boolean; error?: string }>;
    revealFile: (fsPath?: string) => Promise<{ ok: boolean; error?: string }>;
    diagInOut: () => Promise<{ inPoint?: number; outPoint?: number; error?: string }>;
  };
  electronAPI?: {
    showOpenDialog: (options: { properties?: string[]; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<{ canceled: boolean; filePaths: string[] }>;
    getApiKey: () => Promise<string>;
    setApiKey: (key: string) => Promise<boolean>;
  };
  evalExtendScript?: (fn: string, payload?: unknown) => Promise<unknown>;
  generateThumbnailsForJobs?: (jobs: Array<Record<string, unknown>>) => Promise<void>;
  historyScrollObserver?: IntersectionObserver | null;
  showToast?: (message: string, type: string) => void;
  authHeaders?: () => Record<string, string>;
  getServerPort?: () => number;
  isOffline?: boolean;
  getDebugLogPath?: () => string | null;
  openExternalURL?: (url: string) => void;
  __syncServerPort?: number;
  updateModelDisplay?: () => void;
  updateBottomBarModelDisplay?: () => void;
  ensureAuthToken?: () => Promise<void>;
  openFileDialog?: () => Promise<void>;
  selectedVideo?: string | null;
  selectedVideoUrl?: string | null;
  selectedAudio?: string | null;
  selectedAudioUrl?: string | null;
  selectedVideoIsTemp?: boolean;
  selectedAudioIsTemp?: boolean;
  selectedVideoIsUrl?: boolean;
  selectedAudioIsUrl?: boolean;
  startLipsync?: () => Promise<void>;
  jobs?: Array<Record<string, unknown>>;
  showTab?: (tabName: string) => void;
  setLipsyncButtonState?: (state: { disabled?: boolean; text?: string }) => void;
  updateHistory?: () => Promise<void>;
  loadJobsFromServer?: () => Promise<void>;
  copyJobId?: (jobId: string) => void;
  copyOutputLink?: (jobId: string) => void;
  saveJob?: (jobId: string) => Promise<void>;
  insertJob?: (jobId: string) => Promise<void>;
  loadJobIntoSources?: (jobId: string) => void;
  redoGeneration?: (jobId: string) => Promise<void>;
  __historyCopyJobId?: (jobId: string) => void;
  __historyCopyOutputLink?: (jobId: string) => void;
  __historySaveJob?: (jobId: string) => Promise<void>;
  __historyInsertJob?: (jobId: string) => Promise<void>;
  __historyLoadJobIntoSources?: (jobId: string) => void;
  __historyRedoGeneration?: (jobId: string) => Promise<void>;
  location: Location;
}

// Helper type for checking dev mode
declare const process: {
  env: {
    NODE_ENV?: string;
  };
  abort?: () => void;
};

