import { db } from "@/db";
import { dislikedTracks, excludedEntities } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Track } from "@/lib/music";
import { getProfileId } from "@/lib/profile";
import {
  computeExclusions,
  DISLIKE_ARTIST_THRESHOLD,
  DISLIKE_GENRE_THRESHOLD,
  normalizeKey,
  type DislikedTrackRow,
} from "@/lib/dislikes";

export const dynamic = "force-dynamic";

function toTrack(row: DislikedTrackRow): Track {
  return {
    id: row.trackId,
    title: row.title,
    artist: row.artist,
    album: row.album,
    duration: row.duration,
    artwork: row.artwork,
    audioUrl: row.audioUrl,
    source: row.source === "local" || row.source === "device" || row.source === "archive" || row.source === "soundcloud" ? row.source : "hitmos",
    archiveId: row.archiveId || undefined,
    fileName: row.fileName || undefined,
    licenseUrl: row.source === "soundcloud" || row.source === "archive" ? row.licenseUrl || undefined : undefined,
    soundcloudUrl: row.source === "soundcloud" ? row.licenseUrl || undefined : undefined,
    soundcloudEmbedUrl: row.source === "soundcloud" ? row.audioUrl || undefined : undefined,
  };
}

export async function GET(request: Request) {
  try {
    const profileId = await getProfileId(request);
    const disliked = (await db
      .select()
      .from(dislikedTracks)
      .where(eq(dislikedTracks.profileId, profileId))
      .orderBy(desc(dislikedTracks.dislikedAt))
      .limit(300)) as DislikedTrackRow[];
    const overrides = await db
      .select()
      .from(excludedEntities)
      .where(eq(excludedEntities.profileId, profileId));
    const exclusions = computeExclusions(disliked, overrides);

    return Response.json({
      tracks: disliked.map(toTrack),
      artists: exclusions.artistItems,
      genres: exclusions.genreItems,
      excludedTrackIds: Array.from(exclusions.trackIds),
      thresholds: { artist: DISLIKE_ARTIST_THRESHOLD, genre: DISLIKE_GENRE_THRESHOLD },
    });
  } catch {
    return Response.json({ error: "Не удалось загрузить список «Не рекомендовать»." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const profileId = await getProfileId(request);
    const body = await request.json();
    const track = body.track;
    if (
      !track ||
      typeof track.id !== "string" ||
      typeof track.title !== "string" ||
      typeof track.artist !== "string" ||
      !["local", "device", "hitmos", "archive", "soundcloud"].includes(track.source)
    ) {
      return Response.json({ error: "Некорректный трек." }, { status: 400 });
    }
    const text = (value: unknown, max = 600) => (typeof value === "string" ? value.slice(0, max) : "");
    await db
      .insert(dislikedTracks)
      .values({
        profileId,
        trackId: text(track.id, 800),
        title: text(track.title, 300),
        artist: text(track.artist, 300),
        album: text(track.album, 300),
        duration: Number.isFinite(track.duration) ? Math.max(0, Math.min(86400, Math.round(track.duration))) : 0,
        artwork: text(track.artwork, 1000),
        audioUrl: text(track.audioUrl, 1600),
        source: track.source,
        archiveId: text(track.archiveId, 200) || null,
        fileName: text(track.fileName, 500) || null,
        licenseUrl: text(track.licenseUrl || track.soundcloudUrl, 1200) || null,
        dislikedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [dislikedTracks.profileId, dislikedTracks.trackId],
        set: {
          title: text(track.title, 300),
          artist: text(track.artist, 300),
          dislikedAt: new Date(),
        },
      });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Не удалось добавить трек в «Не рекомендовать»." }, { status: 500 });
  }
}

/** Ручное правило: block — запретить, allow — разрешить, auto — вернуть к автоматике. */
export async function PATCH(request: Request) {
  try {
    const profileId = await getProfileId(request);
    const body = await request.json();
    const kind = body.kind;
    const label = typeof body.label === "string" ? body.label.slice(0, 120) : "";
    const action = body.action;
    if (!["artist", "genre"].includes(kind) || !["block", "allow", "auto"].includes(action)) {
      return Response.json({ error: "Некорректное правило." }, { status: 400 });
    }
    const value = normalizeKey(typeof body.value === "string" ? body.value : label);
    if (!value) return Response.json({ error: "Некорректное значение." }, { status: 400 });

    if (action === "auto") {
      await db
        .delete(excludedEntities)
        .where(
          and(
            eq(excludedEntities.profileId, profileId),
            eq(excludedEntities.kind, kind),
            eq(excludedEntities.value, value),
          ),
        );
    } else {
      await db
        .insert(excludedEntities)
        .values({ profileId, kind, value, label: label || value, allowed: action === "allow" })
        .onConflictDoUpdate({
          target: [excludedEntities.profileId, excludedEntities.kind, excludedEntities.value],
          set: { label: label || value, allowed: action === "allow" },
        });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Не удалось сохранить правило." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const profileId = await getProfileId(request);
    const params = new URL(request.url).searchParams;
    const trackId = params.get("trackId");
    if (trackId) {
      await db
        .delete(dislikedTracks)
        .where(and(eq(dislikedTracks.profileId, profileId), eq(dislikedTracks.trackId, trackId)));
    } else {
      await db.delete(dislikedTracks).where(eq(dislikedTracks.profileId, profileId));
      await db.delete(excludedEntities).where(eq(excludedEntities.profileId, profileId));
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Не удалось обновить список." }, { status: 500 });
  }
}
