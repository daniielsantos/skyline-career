/// <reference types="vite/client" />

declare module 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url' {
  const workerUrl: string;
  export default workerUrl;
}

type SkylineDesktopBridge = {
  isDesktop: true;
  getVersion: () => Promise<string>;
  getPlayConfig?: () => Promise<{
    mode: 'sp' | 'mp' | null;
    savedMode: 'sp' | 'mp' | null;
    worldApiUrl: string;
    envForced: boolean;
    needsChoice: boolean;
    defaultWorldApiUrl: string;
    suggestedMpWorldApiUrl?: string;
  }>;
  setPlayMode?: (payload: {
    mode: 'sp' | 'mp';
    worldApiUrl?: string;
  }) => Promise<{
    ok: boolean;
    reason?: string;
    mode?: 'sp' | 'mp';
    worldApiUrl?: string;
  }>;
  openExternal: (url: string) => Promise<{ ok: boolean; reason?: string; via?: string }>;
  checkForUpdates: () => Promise<{
    ok: boolean;
    version?: string | null;
    reason?: string;
  }>;
  downloadUpdate: () => Promise<{ ok: boolean; reason?: string }>;
  quitAndInstall: () => Promise<{ ok: boolean; reason?: string }>;
  onUpdateEvent: (cb: (payload: unknown) => void) => () => void;
};

interface Window {
  skylineDesktop?: SkylineDesktopBridge;
}
