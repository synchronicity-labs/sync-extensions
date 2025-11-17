/**
 * Common type definitions to reduce `any` usage
 */

/**
 * Job status types
 */
export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/**
 * Sync mode types
 */
export type SyncMode = 'loop' | 'bounce' | 'cutoff' | 'silence' | 'remap';

/**
 * Model identifier types
 */
export type ModelId = 'lipsync-2-pro' | 'lipsync-2' | 'lipsync-1.9.0-beta';

/**
 * Render format types
 */
export type RenderVideoFormat = 'mp4' | 'mov' | 'avi';
export type RenderAudioFormat = 'wav' | 'mp3' | 'aac';

/**
 * Save location types
 */
export type SaveLocation = 'project' | 'desktop' | 'custom';

/**
 * Job data structure
 */
export interface Job {
  id: string;
  status: JobStatus;
  model: string;
  temperature?: number;
  syncMode?: SyncMode;
  createdAt: string;
  updatedAt: string;
  outputPath?: string;
  videoUrl?: string;
  audioUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  progress?: number;
}

/**
 * Window global functions (for backward compatibility)
 */
export interface WindowGlobals {
  startLipsync?: () => Promise<void>;
  updateLipsyncButton?: () => void;
  renderInputPreview?: (reason?: string) => void;
  updateInputStatus?: () => void;
  updateFromVideoButton?: () => void;
  loadThumbnail?: (jobId: string) => Promise<string | null>;
  updateCardThumbnail?: (jobId: string, url: string) => void;
  generateThumbnailsForJobs?: (jobs: Job[]) => Promise<void>;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  showTab?: (tab: 'sources' | 'history' | 'settings') => void;
  nle?: unknown;
  __insertingGuard?: boolean;
  uploadedVideoUrl?: string;
  uploadedAudioUrl?: string;
  selectedVideo?: string;
  selectedAudio?: string;
  setVideoPath?: (path: string) => void;
  setAudioPath?: (path: string) => void;
  initOutputVideoPlayer?: () => void;
  debugLog?: (type: string, payload?: unknown) => void;
  updateModelDisplay?: () => void;
  updateBottomBarModelDisplay?: () => void;
  ensureAuthToken?: () => Promise<void>;
  authHeaders?: () => Record<string, string>;
  getServerPort?: () => number;
  isOffline?: boolean;
}

/**
 * Media selection data
 */
export interface MediaSelection {
  video?: string | null;
  videoUrl?: string | null;
  videoIsUrl?: boolean;
  audio?: string | null;
  audioUrl?: string | null;
  audioIsUrl?: boolean;
}

/**
 * Server state
 */
export interface ServerState {
  isOnline: boolean;
  isOffline: boolean;
  consecutiveFailures: number;
}

/**
 * Auth state
 */
export interface AuthState {
  token: string;
  isAuthenticated: boolean;
}

/**
 * Settings interface for application configuration
 */
export interface Settings {
  syncApiKey?: string;
  elevenlabsApiKey?: string;
  elevenLabsApiKey?: string; // Alternative spelling
  model?: string;
  temperature?: number;
  activeSpeakerOnly?: boolean;
  detectObstructions?: boolean;
  [key: string]: unknown; // Allow additional settings
}

/**
 * NLE (Non-Linear Editor) interface
 */
export interface NLEInterface {
  loadHostScript?: () => void;
  getProjectDir?: () => Promise<{ path?: string; error?: string }>;
  insertJob?: (job: Job) => Promise<void>;
  saveJob?: (job: Job, location?: string) => Promise<void>;
  [key: string]: unknown;
}

/**
 * Extended Window interface with globals
 */
declare global {
  interface Window extends WindowGlobals {
    HOST_CONFIG?: {
      hostId?: string;
      isAE?: boolean;
      [key: string]: unknown;
    };
    CSInterface?: unknown;
    cep?: unknown;
    __adobe_cep__?: unknown;
  }
}

export {};

