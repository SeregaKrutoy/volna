import { db } from "@/db";
import { libraryTracks } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import type { Track } from "@/lib/music";
import { getProfileId } from "@/lib/profile";

export const dynamic = "force-dynamic";

type LibraryRow = typeof libraryTracks.$inferSelect;

function toTrack(row: LibraryRow): Track {
  return {
    id: row.trackId,
    title: row.title,
    artist: row.artist,
    album: row.album,
    duration: row.duration,
    artwork: row.artwork,
    audioUrl: row.audioUrl,
    source: row.source === "local" || row.source === "hitmos" || row.source === "archive" || row.source === "soundcloud" ? row.source : "device",
    archiveId: row.archiveId || undefined,
    fileName: row.fileName || undefined,
    downloadUrl: row.audioUrl ? `${row.audioUrl}${row.audioUrl.includes("?") ? "&" : "?"}download=1` : undefined,
  };
}

export async function GET(request: Request) {
  try {
    const profileId = await getProfileId(request);
    const rows = await db
      .select()
      .from(libraryTracks)
      .where(eq(libraryTracks.profileId, profileId))
      .orderBy(desc(libraryTracks.addedAt))
      .limit(500);
    return Response.json({ tracks: rows.map(toTrack), total: rows.length });
  } catch {
    return Response.json({ error: "Не удалось загрузить медиатеку." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const profileId = await getProfileId(request);
    const body = await request.json();
    const incoming: Track[] = Array.isArray(body.tracks) ? body.tracks : body.track ? [body.track] : [];
    const valid = incoming.filter(
      (track): track is Track =>
        Boolean(track) &&
        typeof track.id === "string" &&
        typeof track.title === "string" &&
        typeof track.artist === "string",
    );
    if (valid.length === 0) return Response.json({ error: "Нет треков для сохранения." }, { status: 400 });

    for (const track of valid.slice(0, 500)) {
      await db
        .insert(libraryTracks)
        .values({
          profileId,
          trackId: track.id.slice(0, 800),
          title: track.title.slice(0, 300),
          artist: track.artist.slice(0, 300),
          album: (track.album || "").slice(0, 300),
          duration: Number.isFinite(track.duration) ? Math.max(0, Math.min(86400, Math.round(track.duration))) : 0,
          artwork: (track.artwork || "").slice(0, 1000),
          audioUrl: (track.audioUrl || "").slice(0, 1600),
          source: track.source === "local" || track.source === "hitmos" || track.source === "archive" || track.source === "soundcloud" ? track.source : "device",
          archiveId: track.archiveId ? track.archiveId.slice(0, 200) : null,
          fileName: track.fileName ? track.fileName.slice(0, 500) : null,
          licenseUrl: track.licenseUrl ? track.licenseUrl.slice(0, 800) : null,
          addedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [libraryTracks.profileId, libraryTracks.trackId],
          set: {
            title: track.title.slice(0, 300),
            artist: track.artist.slice(0, 300),
            audioUrl: (track.audioUrl || "").slice(0, 1600),
            fileName: track.fileName ? track.fileName.slice(0, 500) : null,
            addedAt: new Date(),
          },
        });
    }
    return Response.json({ ok: true, saved: valid.length });
  } catch {
    return Response.json({ error: "Не удалось сохранить треки в медиатеку." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const profileId = await getProfileId(request);
    const trackId = new URL(request.url).searchParams.get("trackId");
    if (trackId) {
      await db
        .delete(libraryTracks)
        .where(and(eq(libraryTracks.profileId, profileId), eq(libraryTracks.trackId, trackId)));
    } else {
      await db.delete(libraryTracks).where(eq(libraryTracks.profileId, profileId));
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Не удалось обновить медиатеку." }, { status: 500 });
  }
}
