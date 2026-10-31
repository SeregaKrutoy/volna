import type { Playlist, Track } from "@/lib/music";
import { nativeBridge } from "@/lib/native";

/**
 * Слой данных для Android-приложения.
 * Интерфейс внутри APK открывается с локального origin (https://app.volna.local), поэтому:
 *  - плейлисты, избранное, история, «не рекомендовать» и медиатека хранятся на устройстве
 *    (localStorage) и работают без интернета;
 *  - поиск, рекомендации, обложки и аудио запрашиваются у сервера volna.
 */

const STORAGE_KEY = "volna-offline-data-v1";
const SITE_URL_KEY = "volna-site-url";

type HistoryEntry = Track & { playedAt: string; playCount: number };
type Rule = { kind: "artist" | "genre"; value: string; label: string; allowed: boolean };
type OfflineData = {
  playlists: Playlist[];
  history: HistoryEntry[];
  disliked: (Track & { dislikedAt: string })[];
  rules: Rule[];
  library: Track[];
};

export function isNativeRuntime(): boolean {
  return Boolean(nativeBridge());
}

/** Базовый адрес сервера для сетевых запросов (пустая строка в браузере). */
export function apiOrigin(): string {
  if (typeof window === "undefined") return "";
  const bridge = nativeBridge();
  if (!bridge) return "";
  try {
    const stored = window.localStorage.getItem(SITE_URL_KEY);
    if (stored && /^https?:\/\//.test(stored)) return stored.replace(/\/$/, "");
  } catch {
    // ignore
  }
  try {
    const fromBridge = bridge.getSiteUrl?.() || "";
    return fromBridge.replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function setApiOrigin(url: string) {
  const clean = url.trim().replace(/\/$/, "");
  try {
    window.localStorage.setItem(SITE_URL_KEY, clean);
  } catch {
    // ignore
  }
  try {
    nativeBridge()?.setSiteUrl?.(clean);
  } catch {
    // ignore
  }
}

/** Абсолютный адрес для ресурсов (обложки, аудио) — нужен нативному плееру. */
export function absoluteApiUrl(url: string): string {
  if (!url || /^(https?:|blob:|data:|content:|file:)/.test(url)) return url;
  const origin = apiOrigin();
  return origin ? `${origin}${url.startsWith("/") ? "" : "/"}${url}` : url;
}

function emptyData(): OfflineData {
  return {
    playlists: [
      { id: "fav_local", name: "Любимые треки", color: "pink", isSystem: true, tracks: [] },
      { id: "mine_local", name: "Мой плейлист", color: "violet", isSystem: false, tracks: [] },
    ],
    history: [],
    disliked: [],
    rules: [],
    library: [],
  };
}

function load(): OfflineData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw) as Partial<OfflineData>;
    const base = emptyData();
    return {
      playlists: Array.isArray(parsed.playlists) && parsed.playlists.length ? parsed.playlists : base.playlists,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      disliked: Array.isArray(parsed.disliked) ? parsed.disliked : [],
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      library: Array.isArray(parsed.library) ? parsed.library : [],
    };
  } catch {
    return emptyData();
  }
}

function save(data: OfflineData) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // память переполнена — оставляем состояние в сессии
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function cleanTrack(input: unknown): Track | null {
  if (!input || typeof input !== "object") return null;
  const t = input as Partial<Track>;
  if (!t.id || !t.title) return null;
  return {
    id: String(t.id),
    title: String(t.title),
    artist: String(t.artist || "Неизвестный исполнитель"),
    album: String(t.album || ""),
    duration: Number(t.duration) || 0,
    artwork: String(t.artwork || ""),
    audioUrl: String(t.audioUrl || ""),
    source: (t.source as Track["source"]) || "hitmos",
    archiveId: t.archiveId,
    fileName: t.fileName,
    licenseUrl: t.licenseUrl,
    downloadUrl: t.downloadUrl,
    streamUrl: t.streamUrl,
    soundcloudUrl: t.soundcloudUrl,
    soundcloudEmbedUrl: t.soundcloudEmbedUrl,
  };
}

const normalizeKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const ARTIST_THRESHOLD = 3;
const GENRE_THRESHOLD = 4;

function dislikeSummary(data: OfflineData) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const track of data.disliked) {
    const key = normalizeKey(track.artist);
    if (!key) continue;
    const entry = counts.get(key) || { label: track.artist, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  const artists = Array.from(counts.entries()).map(([value, { label, count }]) => {
    const rule = data.rules.find((r) => r.kind === "artist" && r.value === value);
    const auto = count >= ARTIST_THRESHOLD;
    const blocked = rule ? !rule.allowed : auto;
    return { value, label, count, blocked, auto, manual: Boolean(rule) };
  });
  const genres = data.rules
    .filter((r) => r.kind === "genre")
    .map((r) => ({ value: r.value, label: r.label, count: 0, blocked: !r.allowed, auto: false, manual: true }));
  return { artists, genres };
}

async function readBody(init?: RequestInit): Promise<Record<string, unknown>> {
  try {
    if (!init?.body) return {};
    if (typeof init.body === "string") return JSON.parse(init.body);
    return {};
  } catch {
    return {};
  }
}

/** Локальная реализация API-маршрутов данных. Возвращает null, если маршрут сетевой. */
async function handleLocal(url: URL, init?: RequestInit): Promise<Response | null> {
  const method = (init?.method || "GET").toUpperCase();
  const path = url.pathname;
  const data = load();

  if (path === "/api/playlists") {
    if (method === "GET") return json({ playlists: data.playlists });
    if (method === "POST") {
      const body = await readBody(init);
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
      if (!name) return json({ error: "Введите название плейлиста." }, 400);
      const created: Playlist = { id: `pl_${Date.now().toString(36)}`, name, color: typeof body.color === "string" ? body.color : "violet", isSystem: false, tracks: [] };
      data.playlists.push(created);
      save(data);
      return json({ playlist: created }, 201);
    }
  }

  const playlistMatch = path.match(/^\/api\/playlists\/([^/]+)$/);
  if (playlistMatch) {
    const id = decodeURIComponent(playlistMatch[1]);
    // «favorites» — псевдоним системного плейлиста «Любимые треки» (так же, как на сервере).
    const playlist = id === "favorites" ? data.playlists.find((p) => p.isSystem) : data.playlists.find((p) => p.id === id);
    if (!playlist) return json({ error: "Плейлист не найден." }, 404);
    if (method === "POST") {
      const body = await readBody(init);
      const track = cleanTrack(body.track);
      if (!track) return json({ error: "Некорректный трек." }, 400);
      playlist.tracks = [track, ...playlist.tracks.filter((t) => t.id !== track.id)];
      save(data);
      return json({ ok: true });
    }
    if (method === "DELETE") {
      const trackId = url.searchParams.get("trackId");
      if (trackId) {
        playlist.tracks = playlist.tracks.filter((t) => t.id !== trackId);
      } else {
        if (playlist.isSystem) return json({ error: "Этот плейлист нельзя удалить." }, 400);
        data.playlists = data.playlists.filter((p) => p.id !== playlist.id);
      }
      save(data);
      return json({ ok: true });
    }
    if (method === "PATCH") {
      const body = await readBody(init);
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
      if (!name) return json({ error: "Введите название." }, 400);
      playlist.name = name;
      save(data);
      return json({ ok: true });
    }
  }

  if (path === "/api/history") {
    if (method === "GET") return json({ tracks: data.history, total: data.history.length });
    if (method === "POST") {
      const body = await readBody(init);
      const track = cleanTrack(body.track);
      if (!track) return json({ error: "Некорректный трек." }, 400);
      const existing = data.history.find((t) => t.id === track.id);
      data.history = [
        { ...track, playedAt: new Date().toISOString(), playCount: (existing?.playCount || 0) + 1 },
        ...data.history.filter((t) => t.id !== track.id),
      ].slice(0, 300);
      save(data);
      return json({ ok: true });
    }
    if (method === "DELETE") {
      const trackId = url.searchParams.get("trackId");
      data.history = trackId ? data.history.filter((t) => t.id !== trackId) : [];
      save(data);
      return json({ ok: true });
    }
  }

  if (path === "/api/dislikes") {
    if (method === "GET") {
      const { artists, genres } = dislikeSummary(data);
      return json({
        tracks: data.disliked,
        artists,
        genres,
        excludedTrackIds: data.disliked.map((t) => t.id),
        thresholds: { artist: ARTIST_THRESHOLD, genre: GENRE_THRESHOLD },
      });
    }
    if (method === "POST") {
      const body = await readBody(init);
      const track = cleanTrack(body.track);
      if (!track) return json({ error: "Некорректный трек." }, 400);
      data.disliked = [{ ...track, dislikedAt: new Date().toISOString() }, ...data.disliked.filter((t) => t.id !== track.id)].slice(0, 300);
      save(data);
      return json({ ok: true });
    }
    if (method === "PATCH") {
      const body = await readBody(init);
      const kind = body.kind === "genre" ? "genre" : "artist";
      const label = typeof body.label === "string" ? body.label.slice(0, 120) : "";
      const value = normalizeKey(typeof body.value === "string" ? body.value : label);
      if (!value) return json({ error: "Некорректное значение." }, 400);
      data.rules = data.rules.filter((r) => !(r.kind === kind && r.value === value));
      if (body.action === "allow") data.rules.push({ kind, value, label, allowed: true });
      else if (body.action === "block") data.rules.push({ kind, value, label, allowed: false });
      save(data);
      return json({ ok: true });
    }
    if (method === "DELETE") {
      const trackId = url.searchParams.get("trackId");
      if (trackId) data.disliked = data.disliked.filter((t) => t.id !== trackId);
      else {
        data.disliked = [];
        data.rules = [];
      }
      save(data);
      return json({ ok: true });
    }
  }

  if (path === "/api/library") {
    if (method === "GET") return json({ tracks: data.library, total: data.library.length });
    if (method === "POST") {
      const body = await readBody(init);
      const incoming = (Array.isArray(body.tracks) ? body.tracks : body.track ? [body.track] : []).map(cleanTrack).filter((t): t is Track => Boolean(t));
      if (!incoming.length) return json({ error: "Нет треков для сохранения." }, 400);
      const ids = new Set(incoming.map((t) => t.id));
      data.library = [...incoming, ...data.library.filter((t) => !ids.has(t.id))];
      save(data);
      return json({ ok: true, saved: incoming.length });
    }
    if (method === "DELETE") {
      const trackId = url.searchParams.get("trackId");
      data.library = trackId ? data.library.filter((t) => t.id !== trackId) : [];
      save(data);
      return json({ ok: true });
    }
  }

  if (path === "/api/profile") {
    const favorites = data.playlists.find((p) => p.isSystem)?.tracks || [];
    const totalPlays = data.history.reduce((sum, h) => sum + (h.playCount || 1), 0);
    const artistCounts = new Map<string, number>();
    for (const h of data.history) artistCounts.set(h.artist, (artistCounts.get(h.artist) || 0) + (h.playCount || 1));
    for (const f of favorites) artistCounts.set(f.artist, (artistCounts.get(f.artist) || 0) + 2);
    const topArtists = Array.from(artistCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
    const { artists, genres } = dislikeSummary(data);
    return json({
      totalPlays,
      favoritesCount: favorites.length,
      historyCount: data.history.length,
      libraryCount: data.library.length,
      dislikedCount: data.disliked.length,
      topArtists,
      topGenres: [],
      blockedGenres: genres.filter((g) => g.blocked).map((g) => g.label),
      blockedArtists: artists.filter((a) => a.blocked).map((a) => a.label),
      allowedGenres: genres.filter((g) => !g.blocked).map((g) => g.value),
      dislikedTracks: data.disliked.slice(0, 8).map((t) => ({ title: t.title, artist: t.artist })),
      recentlyPlayed: data.history.slice(0, 5).map((h) => ({ title: h.title, artist: h.artist, playCount: h.playCount })),
      isNew: totalPlays === 0 && favorites.length === 0 && data.library.length === 0,
    });
  }

  if (path === "/api/device-music") {
    // В APK файлы устройства читает нативный слой; серверное сканирование не нужно.
    return json({ tracks: [], scannedDirs: [], saved: 0 });
  }

  return null;
}

let installed = false;

/** Подменяет fetch в Android-приложении: локальные данные — на устройстве, остальное — на сервер. */
export function installNativeFetch() {
  if (installed || typeof window === "undefined" || !nativeBridge()) return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!raw.startsWith("/api/")) return original(input, init);
    const url = new URL(raw, window.location.origin);
    const local = await handleLocal(url, init);
    if (local) return local;
    const origin = apiOrigin();
    if (!origin) return json({ error: "Сервер недоступен" }, 503);
    const headers = new Headers(init?.headers || {});
    headers.delete("cookie");
    return original(`${origin}${url.pathname}${url.search}`, { ...init, headers, credentials: "omit", mode: "cors" });
  };
}
