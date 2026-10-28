import type { Track } from "@/lib/music";
import { getPublicSoundCloudPlaylist, normalizeSoundCloudLink } from "@/lib/soundcloud-public";

export const dynamic = "force-dynamic";

type CachedToken = { accessToken: string; expiresAt: number };
type SoundCloudTrack = {
  id?: number;
  urn?: string;
  title?: string;
  metadata_artist?: string;
  duration?: number;
  artwork_url?: string | null;
  permalink_url?: string;
  user?: { username?: string };
  downloadable?: boolean;
};

type SoundCloudSearchResponse = { collection?: SoundCloudTrack[]; next_href?: string };
type OEmbedResponse = { title?: string; thumbnail_url?: string; author_name?: string; author_url?: string; html?: string };

const globalTokenCache = globalThis as typeof globalThis & { __volnaSoundCloudToken?: CachedToken };

function credentials() {
  return {
    clientId: process.env.SOUNDCLOUD_CLIENT_ID?.trim() || "",
    clientSecret: process.env.SOUNDCLOUD_CLIENT_SECRET?.trim() || "",
  };
}

function isSoundCloudUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    return /^https?:$/.test(url.protocol) && (host === "soundcloud.com" || host === "m.soundcloud.com") && url.pathname.split("/").filter(Boolean).length >= 2 && !url.pathname.startsWith("/search/");
  } catch {
    return false;
  }
}

function withSoundCloudEmbed(permalink: string, fallback?: string): string {
  const base = "https://w.soundcloud.com/player/";
  const url = new URL(base);
  url.searchParams.set("url", permalink);
  url.searchParams.set("color", "7657ed");
  url.searchParams.set("auto_play", "false");
  url.searchParams.set("hide_related", "true");
  url.searchParams.set("show_comments", "false");
  url.searchParams.set("show_user", "true");
  url.searchParams.set("show_reposts", "false");
  url.searchParams.set("visual", "false");
  if (fallback) {
    try {
      const embedded = new URL(fallback);
      if (embedded.hostname === "w.soundcloud.com" && embedded.pathname === "/player/") {
        for (const [key, value] of url.searchParams) {
          embedded.searchParams.set(key, value);
        }
        return embedded.toString();
      }
    } catch {
      // Construct a trusted widget URL from the validated SoundCloud track URL.
    }
  }
  return url.toString();
}

async function getSoundCloudToken(): Promise<string> {
  const cached = globalTokenCache.__volnaSoundCloudToken;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;

  const { clientId, clientSecret } = credentials();
  if (!clientId || !clientSecret) throw new Error("SoundCloud API credentials are not configured");

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const response = await fetch("https://secure.soundcloud.com/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json; charset=utf-8",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`SoundCloud authentication failed (${response.status})`);
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("SoundCloud did not return an access token");
  globalTokenCache.__volnaSoundCloudToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in || 3300) * 1000,
  };
  return data.access_token;
}

function mapTrack(track: SoundCloudTrack): Track | null {
  if (!track.permalink_url || !/^\d+$/.test(String(track.id || ""))) return null;
  const permalink = track.permalink_url;
  if (!isSoundCloudUrl(permalink)) return null;
  const identifier = track.urn || `soundcloud:tracks:${track.id}`;
  const embedUrl = withSoundCloudEmbed(permalink);
  return {
    id: `soundcloud:${identifier}`,
    title: track.title?.trim() || "Без названия",
    artist: track.metadata_artist?.trim() || track.user?.username?.trim() || "SoundCloud",
    album: "SoundCloud",
    duration: Math.max(0, Math.round((track.duration || 0) / 1000)),
    artwork: track.artwork_url || "",
    audioUrl: embedUrl,
    source: "soundcloud",
    archiveId: String(track.id),
    fileName: `${track.user?.username || "SoundCloud"} - ${track.title || "Track"}.mp3`,
    soundcloudUrl: permalink,
    soundcloudEmbedUrl: embedUrl,
  };
}

async function resolveSoundCloudUrl(query: string): Promise<Track | null> {
  let input: URL;
  try {
    input = new URL(query);
  } catch {
    return null;
  }
  if (!isSoundCloudUrl(input.toString())) return null;
  const permalink = `https://soundcloud.com${input.pathname.replace(/\/$/, "")}${input.search}`;
  const oEmbed = new URL("https://soundcloud.com/oembed");
  oEmbed.searchParams.set("format", "json");
  oEmbed.searchParams.set("url", permalink);
  oEmbed.searchParams.set("maxheight", "400");

  const response = await fetch(oEmbed, { signal: AbortSignal.timeout(10_000), next: { revalidate: 900 } });
  if (!response.ok) return null;
  const data = (await response.json()) as OEmbedResponse;
  if (!data.title) return null;
  const embedMatch = data.html?.match(/src=["'](https:\/\/w\.soundcloud\.com\/player\/[^"']*)["']/i);
  const embed = embedMatch?.[1] ? embedMatch[1].replaceAll("&amp;", "&") : undefined;
  const title = data.title;
  const author = data.author_name?.trim() || title.split(/\s+by\s+/i).pop() || "SoundCloud";
  return {
    id: `soundcloud:url:${encodeURIComponent(permalink)}`,
    title,
    artist: author,
    album: "SoundCloud",
    duration: 0,
    artwork: data.thumbnail_url || "",
    audioUrl: withSoundCloudEmbed(permalink, embed),
    source: "soundcloud",
    fileName: `${author} - ${title}.mp3`,
    soundcloudUrl: permalink,
    soundcloudEmbedUrl: withSoundCloudEmbed(permalink, embed),
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") || "").trim().slice(0, 1000);
  const { clientId, clientSecret } = credentials();
  const configured = Boolean(clientId && clientSecret);

  if (!query) {
    return Response.json({ tracks: [], configured, source: "soundcloud" });
  }

  const looksLikeLink = /^(?:https?:\/\/)?(?:www\.|m\.|on\.)?soundcloud\.com\//i.test(query);
  if (looksLikeLink) {
    try {
      const permalink = await normalizeSoundCloudLink(query);
      if (!permalink) {
        return Response.json({ error: "Не удалось открыть ссылку SoundCloud. Проверьте адрес и убедитесь, что запись доступна публично.", configured }, { status: 400 });
      }
      const isPlaylist = new URL(permalink).pathname.split("/").includes("sets");
      if (isPlaylist) {
        try {
          const result = await getPublicSoundCloudPlaylist(permalink);
          if (result?.tracks.length) {
            return Response.json({ ...result, configured, source: "soundcloud", mode: "playlist", total: result.tracks.length });
          }
        } catch {
          // SoundCloud can still make the set playable through its official widget.
        }
      }
      const pastedTrack = await resolveSoundCloudUrl(permalink);
      if (pastedTrack) {
        if (isPlaylist) {
          pastedTrack.album = "Плейлист SoundCloud";
          return Response.json({ tracks: [pastedTrack], configured, source: "soundcloud", mode: "playlist", playlist: { title: pastedTrack.title, artist: pastedTrack.artist, artwork: pastedTrack.artwork, url: permalink, total: 0 } });
        }
        return Response.json({ tracks: [pastedTrack], configured, source: "soundcloud", mode: "embed" });
      }
      return Response.json({ error: "Не удалось открыть эту запись SoundCloud. Возможно, ссылка неверна или плейлист закрыт.", configured }, { status: 404 });
    } catch {
      return Response.json({ error: "Не удалось связаться с SoundCloud. Попробуйте ещё раз.", configured }, { status: 502 });
    }
  }

  const searchUrl = `https://m.soundcloud.com/search?q=${encodeURIComponent(query)}`;
  if (!configured) {
    return Response.json({
      tracks: [],
      configured: false,
      source: "soundcloud",
      externalOnly: true,
      searchUrl,
      message: "Для выдачи результатов SoundCloud нужен зарегистрированный ключ API. Откройте поиск на SoundCloud или вставьте ссылку на конкретный трек для воспроизведения в официальном плеере.",
    });
  }

  try {
    const token = await getSoundCloudToken();
    const apiUrl = new URL("https://api.soundcloud.com/tracks");
    apiUrl.searchParams.set("q", query);
    apiUrl.searchParams.set("access", "playable");
    apiUrl.searchParams.set("limit", "30");
    apiUrl.searchParams.set("linked_partitioning", "true");
    const response = await fetch(apiUrl, {
      headers: { Authorization: `OAuth ${token}`, Accept: "application/json; charset=utf-8" },
      signal: AbortSignal.timeout(12_000),
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return Response.json({ error: "SoundCloud временно ограничил частоту поиска. Подождите немного и попробуйте снова.", configured: true }, { status: 429 });
      }
      if (status === 401 || status === 403) {
        globalTokenCache.__volnaSoundCloudToken = undefined;
        return Response.json({ error: "SoundCloud не принял ключ API. Проверьте настройки приложения.", configured: true }, { status: 502 });
      }
      return Response.json({ error: `SoundCloud API вернул ошибку ${status}.`, configured: true }, { status: 502 });
    }
    const data = (await response.json()) as SoundCloudSearchResponse;
    const tracks = (data.collection || []).map(mapTrack).filter((track): track is Track => Boolean(track));
    return Response.json({ tracks, configured: true, source: "soundcloud", total: tracks.length });
  } catch {
    return Response.json({
      tracks: [],
      configured: true,
      searchUrl,
      error: "Не удалось получить результаты SoundCloud. Попробуйте позже или откройте поиск на SoundCloud.",
    }, { status: 502 });
  }
}
