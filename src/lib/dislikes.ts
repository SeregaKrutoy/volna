import { classifyGenres, genreName } from "@/lib/genre-taxonomy";

export type DislikedTrackRow = {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  artwork: string;
  audioUrl: string;
  source: string;
  archiveId: string | null;
  fileName: string | null;
  licenseUrl: string | null;
  dislikedAt: Date;
};

export type ExclusionOverride = {
  kind: string;
  value: string;
  label: string;
  allowed: boolean;
};

export type ExclusionItem = {
  kind: "artist" | "genre";
  value: string;
  label: string;
  count: number;
  source: "auto" | "manual";
  allowed: boolean;
};

export const DISLIKE_ARTIST_THRESHOLD = 3;
export const DISLIKE_GENRE_THRESHOLD = 4;

export function normalizeKey(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitArtistNames(artistString: string): string[] {
  return (artistString || "")
    .split(/[,&/]|(?:\s+feat\.?\s+)|\s+ft\.?\s+|\s+x\s+/i)
    .map((a) => a.trim())
    .filter((a) => a.length > 1 && !/^(неизвестный|с устройства|на устройстве|hitmos|soundcloud)$/i.test(a));
}

export type ComputedExclusions = {
  trackIds: Set<string>;
  artists: Set<string>;
  genres: Set<string>;
  artistItems: ExclusionItem[];
  genreItems: ExclusionItem[];
};

/** Считает исключения: дизлайки треков + авто-блоки по порогам + ручные правила. */
export function computeExclusions(
  disliked: DislikedTrackRow[],
  overrides: ExclusionOverride[],
): ComputedExclusions {
  const trackIds = new Set(disliked.map((d) => d.trackId));
  const artistCounts = new Map<string, { label: string; count: number }>();
  const genreCounts = new Map<string, { label: string; count: number }>();

  for (const row of disliked) {
    for (const artist of splitArtistNames(row.artist)) {
      const key = normalizeKey(artist);
      if (!key) continue;
      const current = artistCounts.get(key);
      artistCounts.set(key, { label: current?.label || artist, count: (current?.count || 0) + 1 });
    }
    for (const slug of classifyGenres(row.artist, row.title)) {
      const current = genreCounts.get(slug);
      genreCounts.set(slug, { label: genreName(slug), count: (current?.count || 0) + 1 });
    }
  }

  const overrideMap = new Map(overrides.map((o) => [`${o.kind}:${o.value}`, o]));
  const artists = new Set<string>();
  const genres = new Set<string>();
  const artistItems: ExclusionItem[] = [];
  const genreItems: ExclusionItem[] = [];

  for (const [key, info] of artistCounts) {
    const override = overrideMap.get(`artist:${key}`);
    const autoBlocked = info.count >= DISLIKE_ARTIST_THRESHOLD;
    const manualBlocked = override && !override.allowed;
    const allowed = override?.allowed === true;
    const blocked = !allowed && (manualBlocked || autoBlocked);
    if (blocked) artists.add(key);
    if (blocked || override || autoBlocked) {
      artistItems.push({
        kind: "artist",
        value: key,
        label: override?.label || info.label,
        count: info.count,
        source: manualBlocked ? "manual" : "auto",
        allowed,
      });
    }
  }

  for (const [key, info] of genreCounts) {
    const override = overrideMap.get(`genre:${key}`);
    const autoBlocked = info.count >= DISLIKE_GENRE_THRESHOLD;
    const manualBlocked = override && !override.allowed;
    const allowed = override?.allowed === true;
    const blocked = !allowed && (manualBlocked || autoBlocked);
    if (blocked) genres.add(key);
    if (blocked || override || autoBlocked) {
      genreItems.push({
        kind: "genre",
        value: key,
        label: override?.label || info.label,
        count: info.count,
        source: manualBlocked ? "manual" : "auto",
        allowed,
      });
    }
  }

  artistItems.sort((a, b) => Number(b.source === "manual") - Number(a.source === "manual") || b.count - a.count);
  genreItems.sort((a, b) => Number(b.source === "manual") - Number(a.source === "manual") || b.count - a.count);

  return { trackIds, artists, genres, artistItems, genreItems };
}

/** Проверяет, попадает ли трек под исключения по исполнителю или жанру. */
export function isExcludedTrack(
  artist: string,
  title: string,
  exclusions: { artists: Set<string>; genres: Set<string> },
): boolean {
  for (const name of splitArtistNames(artist)) {
    if (exclusions.artists.has(normalizeKey(name))) return true;
  }
  for (const slug of classifyGenres(artist, title)) {
    if (exclusions.genres.has(slug)) return true;
  }
  return false;
}
