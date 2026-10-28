import type { Track } from "@/lib/music";

export type SoundCloudPlaylistInfo = {
  title: string;
  artist: string;
  artwork: string;
  url: string;
  total: number;
};

type PublicTrack = {
  id?: number;
  urn?: string;
  title?: string;
  metadata_artist?: string;
  duration?: number;
  artwork_url?: string | null;
  permalink_url?: string;
  user?: { username?: string; permalink_url?: string };
};

type PublicPlaylist = {
  title?: string;
  permalink_url?: string;
  artwork_url?: string | null;
  track_count?: number;
  tracks?: PublicTrack[];
  user?: { username?: string };
};

type OEmbed = { title?: string; author_name?: string; thumbnail_url?: string };

const allowedHosts = new Set(["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com", "on.soundcloud.com"]);

/** Resolve public SoundCloud and official short links without following arbitrary hosts. */
export async function normalizeSoundCloudLink(input: string): Promise<string | null> {
  let url: URL;
  try {
    const value = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    url = new URL(value);
  } catch {
    return null;
  }
  if (!allowedHosts.has(url.hostname.toLowerCase()) || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return null;
  url.protocol = "https:";

  if (url.hostname.toLowerCase() === "on.soundcloud.com") {
    for (let i = 0; i < 4 && url.hostname.toLowerCase() === "on.soundcloud.com"; i++) {
      const response = await fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html,*/*" },
        signal: AbortSignal.timeout(8000),
      });
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) return null;
      const next = new URL(location, url);
      if (!allowedHosts.has(next.hostname.toLowerCase()) || next.protocol !== "https:" || next.username || next.password || next.port) return null;
      url = next;
    }
  }

  if (url.hostname.toLowerCase() === "on.soundcloud.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || parts[0] === "search") return null;
  url.hostname = "soundcloud.com";
  url.hash = "";
  return url.toString();
}

export function soundCloudWidgetUrl(target: string): string {
  const widget = new URL("https://w.soundcloud.com/player/");
  widget.searchParams.set("url", target);
  widget.searchParams.set("color", "7657ed");
  widget.searchParams.set("auto_play", "false");
  widget.searchParams.set("hide_related", "true");
  widget.searchParams.set("show_comments", "false");
  widget.searchParams.set("show_user", "true");
  widget.searchParams.set("show_reposts", "false");
  widget.searchParams.set("visual", "false");
  return widget.toString();
}

async function oEmbedForTrack(id: number, signal: AbortSignal): Promise<OEmbed | null> {
  const url = new URL("https://soundcloud.com/oembed");
  url.searchParams.set("format", "json");
  url.searchParams.set("url", `https://api.soundcloud.com/tracks/${id}`);
  try {
    const response = await fetch(url, { signal, next: { revalidate: 3600 } });
    return response.ok ? await response.json() as OEmbed : null;
  } catch {
    return null;
  }
}

/** Public set pages contain track IDs; official oEmbed fills in partial track metadata. */
export async function getPublicSoundCloudPlaylist(permalink: string): Promise<{ playlist: SoundCloudPlaylistInfo; tracks: Track[] } | null> {
  const page = await fetch(permalink, {
    headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36", Accept: "text/html" },
    redirect: "error",
    signal: AbortSignal.timeout(12000),
    next: { revalidate: 300 },
  });
  if (!page.ok) return null;
  const html = await page.text();
  const match = html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\])\s*;\s*<\/script>/);
  if (!match) return null;
  let data: PublicPlaylist | undefined;
  try {
    const hydration = JSON.parse(match[1]) as { hydratable?: string; data?: PublicPlaylist }[];
    data = hydration.find((item) => item.hydratable === "playlist")?.data;
  } catch {
    return null;
  }
  if (!data || !Array.isArray(data.tracks)) return null;

  const sourceTracks = data.tracks.slice(0, 500);
  const playlist: SoundCloudPlaylistInfo = {
    title: data.title || "Плейлист SoundCloud",
    artist: data.user?.username || "SoundCloud",
    artwork: data.artwork_url || "",
    url: permalink,
    total: data.track_count || sourceTracks.length,
  };

  // SoundCloud's public page contains full metadata for the first five tracks, and IDs for the rest.
  // Resolve up to 100 more with the official oEmbed endpoint; remaining tracks stay playable by ID.
  const missingIndices = sourceTracks.map((track, index) => (!track.title && track.id ? index : -1)).filter((index) => index >= 0).slice(0, 100);
  const details = new Map<number, OEmbed>();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  let cursor = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(12, missingIndices.length) }, async () => {
      while (cursor < missingIndices.length && !controller.signal.aborted) {
        const index = missingIndices[cursor++];
        const id = sourceTracks[index].id;
        if (!id) continue;
        const detail = await oEmbedForTrack(id, controller.signal);
        if (detail) details.set(index, detail);
      }
    }));
  } finally {
    clearTimeout(timer);
  }

  const tracks: Track[] = [];
  for (const [index, item] of sourceTracks.entries()) {
    if (!item.id) continue;
    const detail = details.get(index);
    const artist = item.metadata_artist || item.user?.username || detail?.author_name || playlist.artist;
    let title = item.title || detail?.title || `Трек ${index + 1}`;
    const byline = ` by ${detail?.author_name || ""}`;
    if (!item.title && detail?.author_name && title.endsWith(byline)) title = title.slice(0, -byline.length);
    const target = `https://api.soundcloud.com/tracks/${item.id}`;
    const embed = soundCloudWidgetUrl(target);
    const sourceUrl = item.permalink_url && /^https:\/\/soundcloud\.com\//i.test(item.permalink_url) ? item.permalink_url : permalink;
    tracks.push({
      id: `soundcloud:soundcloud:tracks:${item.id}`,
      title,
      artist,
      album: playlist.title,
      duration: Math.max(0, Math.round((item.duration || 0) / 1000)),
      artwork: item.artwork_url || detail?.thumbnail_url || playlist.artwork,
      audioUrl: embed,
      source: "soundcloud",
      archiveId: String(item.id),
      soundcloudUrl: sourceUrl,
      soundcloudEmbedUrl: embed,
    });
  }
  return { playlist, tracks };
}
