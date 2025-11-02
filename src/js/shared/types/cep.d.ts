// Type definitions for CSInterface
export interface CSInterface {
  getHostEnvironment(): {
    appName: string;
    appId: string;
  };
  evalScript(script: string, callback?: (result: string) => void): void;
  getSystemPath(type: number): string;
  requestOpenExtension(extensionId: string, params?: string): void;
}

export const SystemPath = {
  EXTENSION: 0,
  HOST_APPLICATION: 1,
  USER_DATA: 2,
  COMMON_FILES: 3,
  MY_DOCUMENTS: 4,
};

