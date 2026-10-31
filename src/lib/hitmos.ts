import type { Track } from "@/lib/music";

const HITMOS_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const HITMOS_HEADERS = {
  "user-agent": HITMOS_USER_AGENT,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
};

const ALLOWED_HITMOS_HOSTS = [
  "hitmos.me",
  "hitmos.fm",
  "rus.hitmos.fm",
  "plc1.hitmos.fm",
  "dwc1.hitmos.fm",
  "static.hitmos.fm",
  "static-c1.hitmos.fm",
  "hitmotop.com",
  "rus.hitmotop.com",
  "eu.hitmoz.com",
  "hitmcdn.com",
  "statcore.hitmcdn.com",
];

export function isAllowedHitmosUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_HITMOS_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function extractRscText(html: string): string {
  const chunks: string[] = [];
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)) {
    try {
      chunks.push(JSON.parse(`"${match[1]}"`));
    } catch {
      chunks.push(match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
    }
  }
  return chunks.join("\n");
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

function parseDurationString(raw?: string): number {
  if (!raw) return 0;
  const parts = raw.trim().split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return Math.round(parts.reduce((acc, part) => acc * 60 + part, 0));
}

function toTrackObject(params: {
  id: string;
  title: string;
  artist: string;
  duration: number;
  playUrl: string;
  downloadUrl?: string;
  imageUrl?: string;
}): Track {
  const cleanTitle = decodeHtmlEntities(params.title || "Без названия");
  const cleanArtist = decodeHtmlEntities(params.artist || "Неизвестный исполнитель");
  const dl = params.downloadUrl || params.playUrl;
  const safeFile = `${cleanArtist} - ${cleanTitle}.mp3`.replace(/[/\\:*?"<>|]/g, "_");
  const artwork =
    params.imageUrl && isAllowedHitmosUrl(params.imageUrl)
      ? `/api/artwork?url=${encodeURIComponent(params.imageUrl)}`
      : "/images/mix-night.png";

  return {
    id: `hitmos:${params.id}`,
    title: cleanTitle,
    artist: cleanArtist,
    album: "Hitmos",
    duration: params.duration || 0,
    artwork,
    audioUrl: `/api/stream?url=${encodeURIComponent(params.playUrl)}&songId=${encodeURIComponent(params.id)}`,
    source: "hitmos",
    archiveId: params.id,
    fileName: safeFile,
    streamUrl: params.playUrl,
    downloadUrl: dl,
  };
}

function parseRscTracks(rsc: string, onlySearchSection = false): Track[] {
  const source =
    onlySearchSection && rsc.includes('"search_tracks"')
      ? rsc.slice(rsc.indexOf('"search_tracks"'))
      : rsc;

  const regex =
    /\{"id":(\d+),"title":"((?:[^"\\]|\\.)*)","artist":"((?:[^"\\]|\\.)*)","duration":(\d+),"play":"([^"]+)","download":"([^"]+)","image":"([^"]*)"/g;
  const results: Track[] = [];
  const seen = new Set<string>();

  for (const match of source.matchAll(regex)) {
    const songId = match[1];
    if (!songId || seen.has(songId)) continue;
    seen.add(songId);

    let title = match[2];
    let artist = match[3];
    try {
      title = JSON.parse(`"${match[2]}"`);
    } catch {
      // keep raw
    }
    try {
      artist = JSON.parse(`"${match[3]}"`);
    } catch {
      // keep raw
    }

    const duration = Number(match[4]) || 0;
    const playUrl = match[5];
    const downloadUrl = match[6] || playUrl;
    const imageUrl = match[7] || "";

    if (!playUrl || !isAllowedHitmosUrl(playUrl)) continue;
    results.push(
      toTrackObject({
        id: songId,
        title,
        artist,
        duration,
        playUrl,
        downloadUrl,
        imageUrl,
      }),
    );
  }

  return results;
}

function parseClassicHitmosHtml(html: string, baseOrigin = "https://hitmos.me"): Track[] {
  const results: Track[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/data-musmeta=(["'])([\s\S]*?)\1/g)) {
    try {
      const rawJson = decodeHtmlEntities(match[2]);
      const meta = JSON.parse(rawJson) as {
        id?: string | number;
        title?: string;
        artist?: string;
        url?: string;
        img?: string;
      };
      const rawUrl = meta.url ? new URL(meta.url, baseOrigin).href : "";
      if (!rawUrl || !isAllowedHitmosUrl(rawUrl)) continue;
      const id = String(meta.id || rawUrl.match(/(\d+)\.mp3/)?.[1] || results.length + 1);
      if (seen.has(id)) continue;
      seen.add(id);

      const afterSlice = html.slice(match.index || 0, (match.index || 0) + 1800);
      const timeMatch = afterSlice.match(/class="track__fulltime"[^>]*>([^<]+)</i);
      const duration = parseDurationString(timeMatch?.[1]);

      results.push(
        toTrackObject({
          id,
          title: meta.title || "Без названия",
          artist: meta.artist || "Неизвестный исполнитель",
          duration,
          playUrl: rawUrl,
          downloadUrl: rawUrl,
          imageUrl: meta.img ? new URL(meta.img, baseOrigin).href : "",
        }),
      );
    } catch {
      // ignore malformed entry
    }
  }

  return results;
}

async function fetchHitmosHtml(url: string, timeoutMs = 10000): Promise<{ html: string; finalUrl: string }> {
  const response = await fetch(url, {
    headers: {
      ...HITMOS_HEADERS,
      referer: "https://rus.hitmos.fm/",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    next: { revalidate: 300 },
  });
  if (!response.ok) {
    throw new Error(`Hitmos HTTP ${response.status}`);
  }
  const html = await response.text();
  return { html, finalUrl: response.url || url };
}

export async function searchHitmos(query: string, limit = 120): Promise<Track[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.toLowerCase() === "top") {
    return getHitmosTopTracks(limit);
  }

  const searchUrl = `https://rus.hitmos.fm/search?q=${encodeURIComponent(trimmed)}`;
  try {
    const { html, finalUrl } = await fetchHitmosHtml(searchUrl, 10000);
    const rsc = extractRscText(html);
    let tracks = parseRscTracks(rsc, true);
    if (!tracks.length) {
      tracks = parseRscTracks(rsc, false);
    }
    if (!tracks.length) {
      tracks = parseClassicHitmosHtml(html, new URL(finalUrl).origin);
    }

    // Check if the search matched a specific artist on Hitmos so artist queries (e.g. "Miyagi", "Баста")
    // include the artist's actual top tracks first.
    const queryLower = trimmed.toLowerCase();
    const searchSlice = rsc.includes('"search"') ? rsc.slice(rsc.indexOf('"search"')) : rsc;
    const artistMatches = [
      ...searchSlice.matchAll(/"href":"\/artist\/(\d+)","title":"((?:[^"\\]|\\.)*)"/g),
    ].map((m) => {
      let name = m[2];
      try {
        name = JSON.parse(`"${m[2]}"`);
      } catch {
        // keep raw
      }
      return { id: m[1], name };
    });

    const matchedArtist = artistMatches.find(
      (a) =>
        a.name.toLowerCase() === queryLower ||
        a.name.toLowerCase().includes(queryLower) ||
        queryLower.includes(a.name.toLowerCase()),
    );

    if (matchedArtist) {
      try {
        const artistPage = await fetchHitmosHtml(`https://rus.hitmos.fm/artist/${matchedArtist.id}`, 6500);
        const artistRsc = extractRscText(artistPage.html);
        const artistTracks = parseRscTracks(artistRsc, false);
        if (artistTracks.length > 0) {
          const directArtistTracks = tracks.filter((t) => t.artist.toLowerCase().includes(queryLower));
          const restTracks = tracks.filter((t) => !t.artist.toLowerCase().includes(queryLower));
          const merged = [...artistTracks, ...directArtistTracks, ...restTracks];
          const unique = new Map<string, Track>();
          for (const item of merged) {
            if (!unique.has(item.id)) unique.set(item.id, item);
          }
          tracks = Array.from(unique.values());
        }
      } catch {
        // Use search page tracks if artist page times out
      }
    } else {
      // Prioritize tracks where artist or title directly matches query
      tracks.sort((a, b) => {
        const aArtistMatch = a.artist.toLowerCase().includes(queryLower) ? 1 : 0;
        const bArtistMatch = b.artist.toLowerCase().includes(queryLower) ? 1 : 0;
        return bArtistMatch - aArtistMatch;
      });
    }

    return tracks.slice(0, limit);
  } catch {
    // Fallback to hitmos.me direct if reachable in local network
    const fallbackUrl = `https://hitmos.me/search?q=${encodeURIComponent(trimmed)}`;
    const { html, finalUrl } = await fetchHitmosHtml(fallbackUrl, 8000);
    const rsc = extractRscText(html);
    const tracks = parseRscTracks(rsc, false);
    if (tracks.length) return tracks.slice(0, limit);
    return parseClassicHitmosHtml(html, new URL(finalUrl).origin).slice(0, limit);
  }
}

export async function getHitmosTopTracks(limit = 24): Promise<Track[]> {
  const { html } = await fetchHitmosHtml("https://rus.hitmos.fm/", 9000);
  const rsc = extractRscText(html);
  const tracks = parseRscTracks(rsc, false);
  return tracks.slice(0, limit);
}

/** Жанровый чарт Hitmos: та же структура треков, что и в топе (до 100 позиций). */
export async function getHitmosGenreTracks(genreId: string, limit = 40): Promise<Track[]> {
  if (!/^\d+$/.test(genreId)) return [];
  const { html } = await fetchHitmosHtml(`https://rus.hitmos.fm/genre/${genreId}`, 9000);
  const rsc = extractRscText(html);
  const tracks = parseRscTracks(rsc, false);
  return tracks.slice(0, limit);
}

export async function resolveHitmosSongUrls(
  songId: string,
): Promise<{ playUrl: string; downloadUrl: string } | null> {
  if (!/^\d+$/.test(songId)) return null;
  try {
    const { html } = await fetchHitmosHtml(`https://rus.hitmos.fm/song/${songId}`, 8000);
    const rsc = extractRscText(html);
    const tracks = parseRscTracks(rsc, false);
    const exact = tracks.find((t) => t.archiveId === songId) || tracks[0];
    if (exact?.streamUrl) {
      return {
        playUrl: exact.streamUrl,
        downloadUrl: exact.downloadUrl || exact.streamUrl,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchHitmosAudioStream(
  rawUrl: string,
  songId?: string | null,
  range?: string | null,
): Promise<Response> {
  let targetUrl = rawUrl;
  if ((!targetUrl || !isAllowedHitmosUrl(targetUrl)) && songId) {
    const resolved = await resolveHitmosSongUrls(songId);
    if (resolved) targetUrl = resolved.playUrl;
  }

  if (!targetUrl || !isAllowedHitmosUrl(targetUrl)) {
    throw new Error("Invalid Hitmos audio URL");
  }

  const headers: Record<string, string> = {
    "user-agent": HITMOS_USER_AGENT,
    referer: "https://rus.hitmos.fm/",
  };
  if (range && /^bytes=\d*-\d*$/.test(range)) {
    headers.Range = range;
  }

  let response = await fetch(targetUrl, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
  });

  if (!response.ok && response.status !== 206 && songId) {
    await response.body?.cancel().catch(() => undefined);
    const resolved = await resolveHitmosSongUrls(songId);
    if (resolved && resolved.playUrl !== targetUrl) {
      response = await fetch(resolved.playUrl, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(25000),
        cache: "no-store",
      });
    }
  }

  return response;
}
