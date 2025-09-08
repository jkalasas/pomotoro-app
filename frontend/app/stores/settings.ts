import { create } from "zustand";
import { Store } from '@tauri-apps/plugin-store';

interface AppSettingsState {
  focusResumeSound: string; // relative path under public/audio
  waitingVideo: string; // relative path under public/videos
  recentFocusSounds: string[];
  recentWaitingVideos: string[];
  isLoaded: boolean;
  load: () => Promise<void>;
  setFocusResumeSound: (path: string) => Promise<void>;
  setWaitingVideo: (path: string) => Promise<void>;
}

// Lazily loaded persistent store (Tauri only)
let storePromise: Promise<Store> | null = null;
const getStore = () => {
  if (typeof window === 'undefined' || !('__TAURI__' in window)) return null;
  if (!storePromise) {
    storePromise = Store.load('settings.json');
  }
  return storePromise;
};

export const useAppSettings = create<AppSettingsState>((set, get) => ({
  focusResumeSound: '/audio/teleleleng.mp3',
  waitingVideo: '/videos/waiting.mp4',
  recentFocusSounds: [],
  recentWaitingVideos: [],
  isLoaded: false,
  load: async () => {
    const s = getStore();
    if (!s) { set({ isLoaded: true }); return; }
    try {
      const store = await s;
      const focusResumeSound = (await store.get<string>('focusResumeSound')) || '/audio/teleleleng.mp3';
      const waitingVideo = (await store.get<string>('waitingVideo')) || '/videos/waiting.mp4';
      const recentFocusSounds = (await store.get<string[]>('recentFocusSounds')) || [];
      const recentWaitingVideos = (await store.get<string[]>('recentWaitingVideos')) || [];
      set({ focusResumeSound, waitingVideo, recentFocusSounds, recentWaitingVideos, isLoaded: true });
    } catch (e) {
      set({ isLoaded: true });
    }
  },
  setFocusResumeSound: async (path: string) => {
    const { recentFocusSounds } = get();
    const updated = [path, ...recentFocusSounds.filter(p => p !== path && p !== '/audio/teleleleng.mp3')].slice(0,5);
    set({ focusResumeSound: path, recentFocusSounds: updated });
    const s = getStore();
    if (s) { const store = await s; await store.set('focusResumeSound', path); await store.set('recentFocusSounds', updated); await store.save(); }
  },
  setWaitingVideo: async (path: string) => {
    const { recentWaitingVideos } = get();
    const updated = [path, ...recentWaitingVideos.filter(p => p !== path && p !== '/videos/waiting.mp4')].slice(0,5);
    set({ waitingVideo: path, recentWaitingVideos: updated });
    const s = getStore();
    if (s) { const store = await s; await store.set('waitingVideo', path); await store.set('recentWaitingVideos', updated); await store.save(); }
  }
}));

// Auto-load on module import if running in browser
if (typeof window !== 'undefined') {
  useAppSettings.getState().load();
}
