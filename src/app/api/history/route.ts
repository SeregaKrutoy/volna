import { db } from "@/db";
import { listenHistory } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Track } from "@/lib/music";
import { getProfileId } from "@/lib/profile";

export const dynamic = "force-dynamic";

function normalizeSource(raw: string): Track["source"] {
  if (raw === "local" || raw === "device" || raw === "hitmos" || raw === "archive" || raw === "soundcloud") {
    return raw;
  }
  return "hitmos";
}

export type HistoryEntry = Track & { playedAt: string; playCount: number };

export async function GET(request: Request) {
  try {
    const profileId = await getProfileId(request);
    const rows = await db
      .select()
      .from(listenHistory)
      .where(eq(listenHistory.profileId, profileId))
      .orderBy(desc(listenHistory.playedAt))
      .limit(100);

    const tracks: HistoryEntry[] = rows.map((row) => {
      const source = normalizeSource(row.source);
      return {
        id: row.trackId,
        title: row.title,
        artist: row.artist,
        album: row.album,
        duration: row.duration,
        artwork: row.artwork,
        audioUrl: row.audioUrl,
        source,
        archiveId: row.archiveId || undefined,
        fileName: row.fileName || undefined,
        licenseUrl: source === "archive" ? row.licenseUrl || undefined : undefined,
        downloadUrl:
          source === "hitmos"
            ? row.licenseUrl || undefined
            : source === "device" && row.audioUrl
              ? `${row.audioUrl}&download=1`
              : undefined,
        soundcloudUrl: source === "soundcloud" ? row.licenseUrl || undefined : undefined,
        soundcloudEmbedUrl: source === "soundcloud" ? row.audioUrl || undefined : undefined,
        playedAt: row.playedAt.toISOString(),
        playCount: row.playCount,
      };
    });

    return Response.json({ tracks, total: tracks.length });
  } catch {
    return Response.json({ error: "Не удалось загрузить историю прослушиваний." }, { status: 500 });
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

    const text = (value: unknown, max = 600) =>
      typeof value === "string" ? value.slice(0, max) : "";
    const archiveId = text(track.archiveId, 200);
    const fileName = text(track.fileName, 500);
    const soundcloudUrl = text(track.soundcloudUrl, 1000);
    const soundcloudEmbedUrl = text(track.soundcloudEmbedUrl, 1600);

    let audioUrl = text(track.audioUrl, 1600);
    let extraUrl = text(track.downloadUrl || track.streamUrl || track.licenseUrl, 1200);
    if (track.source === "archive" && archiveId && fileName) {
      audioUrl = `https://archive.org/download/${encodeURIComponent(archiveId)}/${encodeURIComponent(fileName)}`;
    } else if (track.source === "local") {
      audioUrl = "";
    } else if (track.source === "soundcloud") {
      audioUrl = soundcloudEmbedUrl || audioUrl;
      extraUrl = soundcloudUrl;
    }

    await db
      .insert(listenHistory)
      .values({
        profileId,
        trackId: text(track.id, 800),
        title: text(track.title, 300),
        artist: text(track.artist, 300),
        album: text(track.album, 300),
        duration: Number.isFinite(track.duration)
          ? Math.max(0, Math.min(86400, Math.round(track.duration)))
          : 0,
        artwork: text(track.artwork, 1000),
        audioUrl,
        source: track.source,
        archiveId: archiveId || null,
        fileName: fileName || null,
        licenseUrl: extraUrl || null,
        playCount: 1,
        playedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [listenHistory.profileId, listenHistory.trackId],
        set: {
          title: text(track.title, 300),
          artist: text(track.artist, 300),
          album: text(track.album, 300),
          duration: Number.isFinite(track.duration)
            ? Math.max(0, Math.min(86400, Math.round(track.duration)))
            : 0,
          artwork: text(track.artwork, 1000),
          audioUrl,
          source: track.source,
          archiveId: archiveId || null,
          fileName: fileName || null,
          licenseUrl: extraUrl || null,
          playCount: sql`${listenHistory.playCount} + 1`,
          playedAt: new Date(),
        },
      });

    await db.execute(
      sql`delete from ${listenHistory} where ${listenHistory.profileId} = ${profileId} and ${listenHistory.id} not in (select id from ${listenHistory} where ${listenHistory.profileId} = ${profileId} order by ${listenHistory.playedAt} desc limit 200)`,
    );

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Не удалось сохранить трек в историю." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const profileId = await getProfileId(request);
    const trackId = new URL(request.url).searchParams.get("trackId");
    if (trackId) {
      await db
        .delete(listenHistory)
        .where(and(eq(listenHistory.profileId, profileId), eq(listenHistory.trackId, trackId)));
    } else {
      await db.delete(listenHistory).where(eq(listenHistory.profileId, profileId));
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Не удалось очистить историю." }, { status: 500 });
  }
}
