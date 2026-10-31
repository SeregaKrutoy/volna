import type { Track } from "@/lib/music";
import { rankSearchResults } from "@/lib/search-rank";

/**
 * Поиск по SoundCloud без зарегистрированного ключа API.
 * Публичный client_id извлекается из скриптов сайта soundcloud.com (так же делает сам сайт),
 * после чего используется открытый эндпоинт api-v2.soundcloud.com/search/tracks.
 */

type CachedClientId = { id: string; fetchedAt: number };
const globalCache = globalThis as typeof globalThis & { __volnaScClientId?: CachedClientId };
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

type V2Track = {
  id?: number;
  urn?: string;
  title?: string;
  duration?: number;
  full_duration?: number;
  artwork_url?: string | null;
  permalink_url?: string;
  publisher_metadata?: { artist?: string } | null;
  user?: { username?: string; avatar_url?: string };
  streamable?: boolean;
  policy?: string;
  playback_count?: number;
  likes_count?: number;
};

type V2Playlist = {
  id?: number;
  title?: string;
  artwork_url?: string | null;
  permalink_url?: string;
  track_count?: number;
  user?: { username?: string };
  tracks?: V2Track[];
};

async function scrapeClientId(): Promise<string> {
  const home = await fetch("https://soundcloud.com/", {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!home.ok) throw new Error("SoundCloud homepage unavailable");
  const html = await home.text();
  const scripts = Array.from(html.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g))
    .map((m) => m[1])
    .reverse();
  for (const src of scripts.slice(0, 12)) {
    try {
      const js = await fetch(src, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12_000), cache: "no-store" });
      if (!js.ok) continue;
      const text = await js.text();
      const match = text.match(/client_id\s*[:=]\s*"([a-zA-Z0-9]{32})"/) || text.match(/[?&]client_id=([a-zA-Z0-9]{32})/);
      if (match) return match[1];
    } catch {
      // пробуем следующий скрипт
    }
  }
  throw new Error("client_id not found");
}

export async function getPublicClientId(force = false): Promise<string> {
  const cached = globalCache.__volnaScClientId;
  if (!force && cached && Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000) return cached.id;
  const id = await scrapeClientId();
  globalCache.__volnaScClientId = { id, fetchedAt: Date.now() };
  return id;
}

function widgetUrl(target: string): string {
  const url = new URL("https://w.soundcloud.com/player/");
  url.searchParams.set("url", target);
  url.searchParams.set("color", "7657ed");
  url.searchParams.set("auto_play", "false");
  url.searchParams.set("hide_related", "true");
  url.searchParams.set("show_comments", "false");
  url.searchParams.set("show_user", "true");
  url.searchParams.set("show_reposts", "false");
  url.searchParams.set("visual", "false");
  return url.toString();
}

export type V2Mapped = Track & { playbackCount?: number };

export function mapV2Track(track: V2Track, album = "SoundCloud"): V2Mapped | null {
  if (!track.id || !track.permalink_url) return null;
  const permalink = track.permalink_url;
  const embed = widgetUrl(permalink);
  const artist = track.publisher_metadata?.artist?.trim() || track.user?.username?.trim() || "SoundCloud";
  const title = track.title?.trim() || "Без названия";
  return {
    id: `soundcloud:soundcloud:tracks:${track.id}`,
    title,
    artist,
    album,
    duration: Math.max(0, Math.round((track.duration || track.full_duration || 0) / 1000)),
    artwork: (track.artwork_url || track.user?.avatar_url || "").replace("-large.", "-t500x500."),
    audioUrl: embed,
    source: "soundcloud",
    archiveId: String(track.id),
    fileName: `${artist} - ${title}.mp3`,
    soundcloudUrl: permalink,
    soundcloudEmbedUrl: embed,
    playbackCount: track.playback_count || 0,
  };
}

async function v2<T>(path: string, params: Record<string, string>, retry = true): Promise<T> {
  const clientId = await getPublicClientId();
  const url = new URL(`https://api-v2.soundcloud.com${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("app_locale", "ru");
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if ((response.status === 401 || response.status === 403) && retry) {
    await getPublicClientId(true);
    return v2<T>(path, params, false);
  }
  if (!response.ok) throw new Error(`SoundCloud v2 ${response.status}`);
  return (await response.json()) as T;
}

export async function searchSoundCloudPublic(query: string, limit = 100): Promise<Track[]> {
  const collection: V2Track[] = [];
  let offset = 0;
  while (collection.length < limit) {
    const page = await v2<{ collection?: V2Track[]; next_href?: string }>("/search/tracks", { q: query, limit: "50", offset: String(offset) });
    const items = page.collection || [];
    collection.push(...items);
    if (items.length < 50 || !page.next_href) break;
    offset += items.length;
  }
  const mapped = collection
    .filter((item) => item.streamable !== false && item.policy !== "BLOCK")
    .map((item) => mapV2Track(item))
    .filter((item): item is V2Mapped => Boolean(item));
  // Сначала наиболее похожие на запрос, при равной похожести — по числу прослушиваний.
  return rankSearchResults(query, mapped, (track) => track.playbackCount || 0).map((track) => {
    const { playbackCount: _omit, ...rest } = track;
    void _omit;
    return rest as Track;
  });
}

export async function resolveSoundCloudPlaylistPublic(permalink: string): Promise<{
  playlist: { title: string; artist: string; artwork: string; url: string; total: number };
  tracks: Track[];
} | null> {
  const data = await v2<V2Playlist>("/resolve", { url: permalink });
  if (!data || !Array.isArray(data.tracks)) return null;
  const title = data.title || "Плейлист SoundCloud";
  const full = new Map<number, V2Track>();
  const missing: number[] = [];
  for (const item of data.tracks) {
    if (!item.id) continue;
    if (item.permalink_url && item.title) full.set(item.id, item);
    else missing.push(item.id);
  }
  // Полные данные приходят только для первых треков; остальные догружаем пачками по 50 id.
  // Догружаем ВСЕ недостающие треки (без ограничения), по 50 id в запросе, до 6 запросов параллельно.
  const chunks: number[][] = [];
  for (let i = 0; i < missing.length; i += 50) chunks.push(missing.slice(i, i + 50));
  for (let i = 0; i < chunks.length; i += 6) {
    await Promise.all(
      chunks.slice(i, i + 6).map(async (chunk) => {
        try {
          const list = await v2<V2Track[]>("/tracks", { ids: chunk.join(",") });
          for (const item of list) if (item.id) full.set(item.id, item);
        } catch {
          // часть треков останется недоступной
        }
      }),
    );
  }
  const tracks: Track[] = [];
  for (const item of data.tracks) {
    if (!item.id) continue;
    const detail = full.get(item.id);
    const mapped = detail ? mapV2Track(detail, title) : null;
    if (mapped) tracks.push(mapped);
  }
  if (!tracks.length) return null;
  return {
    playlist: {
      title,
      artist: data.user?.username || "SoundCloud",
      artwork: (data.artwork_url || tracks[0]?.artwork || "").replace("-large.", "-t500x500."),
      url: permalink,
      total: data.track_count || tracks.length,
    },
    tracks,
  };
}
