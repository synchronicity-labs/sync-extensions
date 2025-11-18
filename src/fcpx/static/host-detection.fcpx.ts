// Host detection for Final Cut Pro
// Sets window.HOST_CONFIG to identify FCPX host
// Uses shared host constants (FCPX from src/shared/host.ts)

declare global {
  interface Window {
    HOST_CONFIG: {
      hostId: string;
      hostName: string;
      isAE: boolean;
    };
  }
}

window.HOST_CONFIG = {
  hostId: 'FCPX',  // Matches HOST_IDS.FCPX from shared/host.ts
  hostName: 'Final Cut Pro',  // Matches HOST_NAMES.FCPX from shared/host.ts
  isAE: false
};

