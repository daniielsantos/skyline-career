/// <reference types="vite/client" />

declare module 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url' {
  const workerUrl: string;
  export default workerUrl;
}

type SkylineDesktopBridge = {
  isDesktop: true;
  getVersion: () => Promise<string>;
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
