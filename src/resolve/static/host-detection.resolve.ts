// Host detection for DaVinci Resolve
// Sets window.HOST_CONFIG to identify Resolve host
// Uses shared host constants (RESOLVE from src/shared/host.ts)

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
  hostId: 'RESOLVE',  // Matches HOST_IDS.RESOLVE from shared/host.ts
  hostName: 'DaVinci Resolve',  // Matches HOST_NAMES.RESOLVE from shared/host.ts
  isAE: false
};

