import { db } from "@/db";
import {
  dislikedTracks,
  excludedEntities,
  libraryTracks,
  listenHistory,
  playlistTracks,
  playlists,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { classifyGenres, genreName } from "@/lib/genre-taxonomy";
import { getProfileId } from "@/lib/profile";

export const dynamic = "force-dynamic";

function normalizeKey(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitArtists(artistString: string): string[] {
  return (artistString || "")
    .split(/[,&/]|(?:\s+feat\.?\s+)|\s+ft\.?\s+|\s+x\s+/i)
    .map((a) => a.trim())
    .filter((a) => a.length > 1 && !/^(неизвестный|с устройства|на устройстве|hitmos|soundcloud)$/i.test(a));
}

export async function GET(request: Request) {
  try {
    const profileId = await getProfileId(request);

    const [favoritesPlaylist] = await db
      .select({ id: playlists.id })
      .from(playlists)
      .where(and(eq(playlists.profileId, profileId), eq(playlists.isSystem, true)));

    // Любимые треки
    const favorites = favoritesPlaylist
      ? await db
          .select()
          .from(playlistTracks)
          .where(eq(playlistTracks.playlistId, favoritesPlaylist.id))
      : [];

    // История прослушиваний
    const history = await db
      .select()
      .from(listenHistory)
      .where(eq(listenHistory.profileId, profileId))
      .orderBy(desc(listenHistory.playCount))
      .limit(200);

    // Медиатека
    const library = await db
      .select()
      .from(libraryTracks)
      .where(eq(libraryTracks.profileId, profileId))
      .limit(200);

    // Дизлайки и правила исключений
    const disliked = await db
      .select()
      .from(dislikedTracks)
      .where(eq(dislikedTracks.profileId, profileId))
      .orderBy(desc(dislikedTracks.dislikedAt))
      .limit(200);
    const rules = await db
      .select()
      .from(excludedEntities)
      .where(eq(excludedEntities.profileId, profileId));

    // --- Популярность исполнителей ---
    const artistScores = new Map<string, number>();
    for (const row of history) {
      for (const artist of splitArtists(row.artist)) {
        const key = normalizeKey(artist);
        if (!key) continue;
        artistScores.set(key, (artistScores.get(key) || 0) + row.playCount);
      }
    }
    for (const row of favorites) {
      for (const artist of splitArtists(row.artist)) {
        const key = normalizeKey(artist);
        if (!key) continue;
        artistScores.set(key, (artistScores.get(key) || 0) + 5);
      }
    }
    const topArtists = Array.from(artistScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, score]) => ({ key, score }));

    // --- Любимые жанры ---
    const genreScores = new Map<string, number>();
    for (const row of history) {
      for (const slug of classifyGenres(row.artist, row.title)) {
        genreScores.set(slug, (genreScores.get(slug) || 0) + row.playCount);
      }
    }
    for (const row of favorites) {
      for (const slug of classifyGenres(row.artist, row.title)) {
        genreScores.set(slug, (genreScores.get(slug) || 0) + 5);
      }
    }
    for (const row of library) {
      for (const slug of classifyGenres(row.artist, row.title)) {
        genreScores.set(slug, (genreScores.get(slug) || 0) + 1);
      }
    }
    const topGenres = Array.from(genreScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([slug, score]) => ({ slug, name: genreName(slug), score }));

    // --- Нелюбимые жанры/исполнители (с учётом правил) ---
    const blockedGenres = rules
      .filter((rule) => rule.kind === "genre" && !rule.allowed)
      .map((rule) => ({ slug: rule.value, name: genreName(rule.value), source: rule.label || genreName(rule.value) }));
    const autoGenreCounts = new Map<string, number>();
    for (const row of disliked) {
      for (const slug of classifyGenres(row.artist, row.title)) {
        autoGenreCounts.set(slug, (autoGenreCounts.get(slug) || 0) + 1);
      }
    }
    for (const [slug] of autoGenreCounts) {
      if (!blockedGenres.some((item) => item.slug === slug) && autoGenreCounts.get(slug)! >= 4) {
        blockedGenres.push({ slug, name: genreName(slug), source: "автоматически" });
      }
    }

    const blockedArtists = rules
      .filter((rule) => rule.kind === "artist" && !rule.allowed)
      .map((rule) => ({ key: rule.value, name: rule.label || rule.value }));
    const autoArtistCounts = new Map<string, number>();
    for (const row of disliked) {
      for (const artist of splitArtists(row.artist)) {
        const key = normalizeKey(artist);
        autoArtistCounts.set(key, (autoArtistCounts.get(key) || 0) + 1);
      }
    }
    for (const [key, count] of autoArtistCounts) {
      if (count >= 3 && !blockedArtists.some((item) => item.key === key)) {
        blockedArtists.push({ key, name: key });
      }
    }

    const allowedGenres = rules.filter((rule) => rule.kind === "genre" && rule.allowed).map((rule) => rule.value);

    const totalPlays = history.reduce((sum, row) => sum + row.playCount, 0);

    return Response.json({
      totalPlays,
      favoritesCount: favorites.length,
      historyCount: history.length,
      libraryCount: library.length,
      dislikedCount: disliked.length,
      topArtists,
      topGenres,
      blockedGenres,
      blockedArtists,
      allowedGenres,
      dislikedTracks: disliked.slice(0, 8).map((row) => ({ title: row.title, artist: row.artist })),
      recentlyPlayed: history.slice(0, 5).map((row) => ({ title: row.title, artist: row.artist, playCount: row.playCount })),
      isNew: totalPlays === 0 && favorites.length === 0 && library.length === 0,
    });
  } catch (error) {
    return Response.json(
      { error: "Не удалось загрузить статистику профиля.", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
