// Window interface extensions for CEP and custom globals
interface Window {
  CSInterface?: {
    new (): {
      getHostEnvironment?: () => { appName?: string; appId?: string };
      getSystemPath?: (path: string) => string;
      evalScript?: (script: string, callback?: (result: string) => void) => void;
      openURLInDefaultBrowser?: (url: string) => void;
      addEventListener?: (event: string, callback: (event: any) => void) => void;
      removeEventListener?: (event: string, callback: (event: any) => void, scope?: any) => void;
      dispatchEvent?: (event: any) => void;
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
    invokeSync?: (method: string, ...args: any[]) => any;
    invokeAsync?: (method: string, data: string, callback: (result: string) => void) => void;
    addEventListener?: (event: string, callback: (event: any) => void) => void;
  };
  debugLog?: (message: string, data?: any) => void;
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
    startBackend: () => Promise<any>;
    getProjectDir: () => Promise<any>;
    exportInOutVideo: (opts?: any) => Promise<any>;
    exportInOutAudio: (opts?: any) => Promise<any>;
    insertFileAtPlayhead: (fsPath?: string) => Promise<any>;
    importFileToBin: (fsPath?: string, binName?: string) => Promise<any>;
    revealFile: (fsPath?: string) => Promise<any>;
    diagInOut: () => Promise<any>;
  };
  electronAPI?: {
    showOpenDialog: (options: any) => Promise<any>;
    getApiKey: () => Promise<string>;
    setApiKey: (key: string) => Promise<boolean>;
  };
  evalExtendScript?: (fn: string, payload?: any) => Promise<any>;
  generateThumbnailsForJobs?: (jobs: any[]) => Promise<void>;
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
  jobs?: any[];
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

