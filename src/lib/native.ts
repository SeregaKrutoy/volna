import type { Track } from "@/lib/music";

type NativeBridge = {
  getSiteUrl?: () => string;
  setSiteUrl?: (url: string) => void;
  stats?: () => string;
  getDeviceLibrary?: () => string;
  scanDeviceMusic?: () => number;
  syncFavorites?: (json: string) => void;
  syncHistory?: (json: string) => void;
  savePlaylist?: (name: string, json: string) => void;
  cacheTrack?: (json: string) => void;
  playQueue?: (json: string, index: number) => void;
  pause?: () => void;
  next?: () => void;
  previous?: () => void;
  toggleLoop?: () => void;
  setLoopMode?: (mode: number) => void;
  playbackStatus?: () => string;
  keepAlive?: () => void;
  openOffline?: () => void;
  version?: () => string;
};

declare global {
  interface Window {
    VolnaAndroid?: NativeBridge;
  }
}

export function nativeBridge(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  return window.VolnaAndroid ?? null;
}

export function isNativeApp(): boolean {
  return Boolean(nativeBridge());
}

export function getNativeDeviceLibrary(scan = false): Track[] {
  const bridge = nativeBridge();
  if (!bridge) return [];
  try {
    if (scan) bridge.scanDeviceMusic?.();
    const raw = bridge.getDeviceLibrary?.();
    return raw ? (JSON.parse(raw) as Track[]) : [];
  } catch {
    return [];
  }
}

export function nativeStats(): { favorites: number; history: number; playlists: number; files: number } | null {
  const bridge = nativeBridge();
  if (!bridge?.stats) return null;
  try {
    return JSON.parse(bridge.stats());
  } catch {
    return null;
  }
}

function absolute(track: Track, origin: string): Track {
  const url = track.audioUrl || "";
  if (!url || url.startsWith("http") || url.startsWith("content://") || url.startsWith("file://")) return track;
  return { ...track, audioUrl: `${origin.replace(/\/$/, "")}${url}` };
}

/** Сохранение избранного и истории в память Android-приложения. */
export function syncNativeLibrary(favorites: Track[], history: Track[], origin: string) {
  const bridge = nativeBridge();
  if (!bridge) return;
  try {
    bridge.syncFavorites?.(JSON.stringify(favorites.map((track) => absolute(track, origin))));
    bridge.syncHistory?.(JSON.stringify(history.map((track) => absolute(track, origin))));
  } catch {
    // мост может быть недоступен на старых версиях
  }
}

const AUDIO_CACHE = "volna-offline-audio-v1";

/** Скачивает аудио трека в память устройства (APK) или в Cache Storage (браузер). */
export async function cacheTrackOffline(track: Track, origin: string): Promise<boolean> {
  const full = absolute(track, origin);
  const bridge = nativeBridge();
  if (bridge?.cacheTrack) {
    try {
      bridge.cacheTrack(JSON.stringify(full));
      return true;
    } catch {
      return false;
    }
  }
  if (!full.audioUrl.startsWith("http")) return false;
  try {
    const cache = await caches.open(AUDIO_CACHE);
    await cache.add(new Request(full.audioUrl, { mode: "cors" }));
    return true;
  } catch {
    return false;
  }
}

/** Сохраняет плейлист целиком для прослушивания офлайн. */
export async function savePlaylistOffline(name: string, tracks: Track[], origin: string): Promise<{ ok: boolean; saved: number; total: number }> {
  const full = tracks.map((track) => absolute(track, origin));
  const bridge = nativeBridge();
  if (bridge?.savePlaylist) {
    try {
      bridge.savePlaylist(name, JSON.stringify(full));
      return { ok: true, saved: full.length, total: full.length };
    } catch {
      return { ok: false, saved: 0, total: full.length };
    }
  }
  let saved = 0;
  try {
    const cache = await caches.open(AUDIO_CACHE);
    for (const track of full) {
      if (!track.audioUrl.startsWith("http")) continue;
      try {
        await cache.add(new Request(track.audioUrl, { mode: "cors" }));
        saved++;
      } catch {
        // пропускаем недоступный трек
      }
    }
  } catch {
    return { ok: false, saved, total: full.length };
  }
  return { ok: saved > 0, saved, total: full.length };
}

export function playNativeQueue(tracks: Track[], index: number, origin: string): boolean {
  const bridge = nativeBridge();
  if (!bridge?.playQueue) return false;
  try {
    bridge.playQueue(JSON.stringify(tracks.map((track) => absolute(track, origin))), index);
    return true;
  } catch {
    return false;
  }
}

export type NativePlaybackStatus = {
  active: boolean;
  playing: boolean;
  trackId?: string;
  index?: number;
  position?: number;
  duration?: number;
  loopMode?: number;
};

export function getNativePlaybackStatus(): NativePlaybackStatus | null {
  const bridge = nativeBridge();
  if (!bridge?.playbackStatus) return null;
  try {
    return JSON.parse(bridge.playbackStatus()) as NativePlaybackStatus;
  } catch {
    return null;
  }
}

export function setNativeLoopMode(mode: 0 | 1 | 2) {
  try {
    nativeBridge()?.setLoopMode?.(mode);
  } catch {
    // ignore
  }
}

export function keepNativePlaybackAlive() {
  try {
    nativeBridge()?.keepAlive?.();
  } catch {
    // ignore
  }
}

export function openNativeOfflineLibrary() {
  try {
    nativeBridge()?.openOffline?.();
  } catch {
    // ignore
  }
}

export type MediaHandlers = {
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
};

/** Медиасессия: уведомление и кнопки управления на экране блокировки (браузер). */
export function updateMediaSession(track: Track, handlers: MediaHandlers) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try {
    const artwork = track.artwork
      ? [{ src: track.artwork, sizes: "512x512", type: "image/png" }]
      : [{ src: "/images/wave-icon.svg", sizes: "512x512", type: "image/svg+xml" }];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album || "volna",
      artwork,
    });
    navigator.mediaSession.setActionHandler("play", handlers.onPlay);
    navigator.mediaSession.setActionHandler("pause", handlers.onPause);
    navigator.mediaSession.setActionHandler("nexttrack", handlers.onNext);
    navigator.mediaSession.setActionHandler("previoustrack", handlers.onPrevious);
    navigator.mediaSession.setActionHandler("stop", handlers.onPause);
  } catch {
    // часть браузеров не поддерживает отдельные действия
  }
}

export function setMediaPlaybackState(playing: boolean) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  } catch {
    // игнорируем
  }
}
