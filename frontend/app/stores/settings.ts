import { create } from "zustand";
import { Store } from '@tauri-apps/plugin-store';
import { isTauri } from '~/lib/utils';
import { getMedia, saveMedia, deleteMedia } from '~/lib/idb';

interface AppSettingsState {
  focusResumeSound: string; // path or object URL for playback
  waitingVideo: string; // path or object URL for playback
  focusResumeSoundName?: string | null;
  waitingVideoName?: string | null;
  recentFocusSounds: string[];
  recentWaitingVideos: string[];
  isLoaded: boolean;
  load: () => Promise<void>;
  setFocusResumeSound: (path: string) => Promise<void>;
  setWaitingVideo: (path: string) => Promise<void>;
  setFocusResumeSoundFile: (file: File) => Promise<void>;
  setWaitingVideoFile: (file: File) => Promise<void>;
}

// Lazily loaded persistent store (Tauri only)
let storePromise: Promise<Store> | null = null;
const getStore = () => {
  if (!isTauri()) return null;
  if (!storePromise) {
    storePromise = Store.load('settings.json');
  }
  return storePromise;
};

// Keep track of dynamic object URLs to revoke when replaced
let currentAudioObjectUrl: string | null = null;
let currentVideoObjectUrl: string | null = null;

export const useAppSettings = create<AppSettingsState>((set, get) => ({
  focusResumeSound: '/audio/teleleleng.mp3',
  waitingVideo: '/videos/waiting.mp4',
  focusResumeSoundName: null,
  waitingVideoName: null,
  recentFocusSounds: [],
  recentWaitingVideos: [],
  isLoaded: false,
  load: async () => {
    // Load base values from tauri store if present
    const s = getStore();
    let focusResumeSound = '/audio/teleleleng.mp3';
    let waitingVideo = '/videos/waiting.mp4';
    let recentFocusSounds: string[] = [];
    let recentWaitingVideos: string[] = [];
    if (s) {
      try {
        const store = await s;
        focusResumeSound = (await store.get<string>('focusResumeSound')) || focusResumeSound;
        waitingVideo = (await store.get<string>('waitingVideo')) || waitingVideo;
        recentFocusSounds = (await store.get<string[]>('recentFocusSounds')) || [];
        recentWaitingVideos = (await store.get<string[]>('recentWaitingVideos')) || [];
      } catch {}
    }

    // Attempt to load blobs from IndexedDB
    try {
      const audioRec = await getMedia('focusSound');
      if (audioRec && audioRec.blob) {
        if (currentAudioObjectUrl) URL.revokeObjectURL(currentAudioObjectUrl);
        currentAudioObjectUrl = URL.createObjectURL(audioRec.blob);
        focusResumeSound = currentAudioObjectUrl;
      }
    } catch {}

    try {
      const videoRec = await getMedia('waitingVideo');
      if (videoRec && videoRec.blob) {
        if (currentVideoObjectUrl) URL.revokeObjectURL(currentVideoObjectUrl);
        currentVideoObjectUrl = URL.createObjectURL(videoRec.blob);
        waitingVideo = currentVideoObjectUrl;
      }
    } catch {}

    set({
      focusResumeSound,
      waitingVideo,
      focusResumeSoundName: (await getMedia('focusSound'))?.name || null,
      waitingVideoName: (await getMedia('waitingVideo'))?.name || null,
      recentFocusSounds,
      recentWaitingVideos,
      isLoaded: true,
    });
  },
  setFocusResumeSound: async (path: string) => {
    // Explicit path; when chosen, also remove any saved blob to avoid confusion
    try { await deleteMedia('focusSound'); } catch {}
    if (currentAudioObjectUrl && currentAudioObjectUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(currentAudioObjectUrl); } catch {}
      currentAudioObjectUrl = null;
    }
    const { recentFocusSounds } = get();
    const updated = [path, ...recentFocusSounds.filter(p => p !== path && p !== '/audio/teleleleng.mp3')].slice(0,5);
    set({ focusResumeSound: path, focusResumeSoundName: null, recentFocusSounds: updated });
    const s = getStore();
    if (s) { const store = await s; await store.set('focusResumeSound', path); await store.set('recentFocusSounds', updated); await store.save(); }
  },
  setWaitingVideo: async (path: string) => {
    try { await deleteMedia('waitingVideo'); } catch {}
    if (currentVideoObjectUrl && currentVideoObjectUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(currentVideoObjectUrl); } catch {}
      currentVideoObjectUrl = null;
    }
    const { recentWaitingVideos } = get();
    const updated = [path, ...recentWaitingVideos.filter(p => p !== path && p !== '/videos/waiting.mp4')].slice(0,5);
    set({ waitingVideo: path, waitingVideoName: null, recentWaitingVideos: updated });
    const s = getStore();
    if (s) { const store = await s; await store.set('waitingVideo', path); await store.set('recentWaitingVideos', updated); await store.save(); }
  },
  setFocusResumeSoundFile: async (file: File) => {
    const rec = await saveMedia('focusSound', file);
    if (currentAudioObjectUrl) {
      try { URL.revokeObjectURL(currentAudioObjectUrl); } catch {}
    }
    currentAudioObjectUrl = URL.createObjectURL(rec.blob);
    set({ focusResumeSound: currentAudioObjectUrl, focusResumeSoundName: rec.name });
  },
  setWaitingVideoFile: async (file: File) => {
    const rec = await saveMedia('waitingVideo', file);
    if (currentVideoObjectUrl) {
      try { URL.revokeObjectURL(currentVideoObjectUrl); } catch {}
    }
    currentVideoObjectUrl = URL.createObjectURL(rec.blob);
    set({ waitingVideo: currentVideoObjectUrl, waitingVideoName: rec.name });
  }
}));

// Auto-load on module import if running in browser
if (typeof window !== 'undefined') {
  useAppSettings.getState().load();
}
