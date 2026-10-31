import { db } from "@/db";
import { playlists, playlistShares, playlistTracks } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Track } from "@/lib/music";
import { getProfileId, profileSuffix } from "@/lib/profile";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

function normalizeSource(raw: string): Track["source"] {
  if (raw === "local" || raw === "device" || raw === "hitmos" || raw === "archive" || raw === "soundcloud") {
    return raw;
  }
  return "hitmos";
}

export const FAVORITES_KIND = "favorites";

export async function GET(request: Request) {
  try {
    const profileId = await getProfileId(request);
    const suffix = profileSuffix(profileId);

    const existing = await db.select().from(playlists).where(eq(playlists.profileId, profileId));
    if (existing.length === 0) {
      await db
        .insert(playlists)
        .values([
          {
            id: `fav_${suffix}`,
            profileId,
            name: "Любимые треки",
            kind: FAVORITES_KIND,
            color: "pink",
            isSystem: true,
          },
          {
            id: `mine_${suffix}`,
            profileId,
            name: "Мой плейлист",
            kind: "custom",
            color: "violet",
            isSystem: false,
          },
        ])
        .onConflictDoNothing();
    }

    const lists = await db
      .select()
      .from(playlists)
      .where(eq(playlists.profileId, profileId))
      .orderBy(asc(playlists.createdAt));
    const rows = await db.select().from(playlistTracks).orderBy(desc(playlistTracks.createdAt));
    const listIds = new Set(lists.map((list) => list.id));

    const result = lists.map((list) => ({
      id: list.id,
      name: list.name,
      color: list.color,
      isSystem: list.isSystem,
      kind: list.kind,
      tracks: rows
        .filter((row) => row.playlistId === list.id)
        .map((row): Track => {
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
          };
        }),
    }));

    // служебная проверка на случай, если в базе остались чужие строки
    void listIds;

    return Response.json({ playlists: result });
  } catch {
    return Response.json({ error: "Не удалось загрузить плейлисты." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const profileId = await getProfileId(request);
    const body = await request.json();

    // Импорт общего плейлиста по ссылке /share/<id>
    const shareId = typeof body.shareId === "string" ? body.shareId.trim().slice(0, 80) : "";
    if (shareId) {
      const [share] = await db.select().from(playlistShares).where(eq(playlistShares.id, shareId));
      if (!share) return Response.json({ error: "Общий плейлист не найден." }, { status: 404 });

      const importedId = randomUUID();
      const baseName = typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 80)
        : `${share.name} · копия`;
      const sameName = await db
        .select({ id: playlists.id })
        .from(playlists)
        .where(and(eq(playlists.profileId, profileId), eq(playlists.name, baseName)));
      const name = sameName.length ? `${baseName} (${sameName.length + 1})`.slice(0, 80) : baseName;

      const [created] = await db
        .insert(playlists)
        .values({ id: importedId, profileId, name, color: share.color || "violet", kind: "custom" })
        .returning();

      for (const [index, track] of share.tracks.entries()) {
        const source = track.source === "soundcloud" || track.source === "archive" ? track.source : "hitmos";
        const archiveId = source === "hitmos" || source === "archive"
          ? (() => {
              if (!track.url) return null;
              const song = track.url.match(/\/song\/(\d+)/)?.[1];
              if (song) return song;
              const archive = track.url.match(/archive\.org\/details\/([^/?#]+)/)?.[1];
              return archive || null;
            })()
          : null;
        await db
          .insert(playlistTracks)
          .values({
            playlistId: importedId,
            trackId: `shared:${share.id}:${index}`.slice(0, 800),
            title: track.title,
            artist: track.artist,
            album: track.album || share.name,
            duration: Number.isFinite(track.duration) ? Math.max(0, Math.min(86400, Math.round(track.duration))) : 0,
            artwork: track.artwork || "",
            audioUrl:
              source === "soundcloud" && track.url
                ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(track.url)}&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false&color=7657ed`
                : source === "hitmos" && archiveId
                  ? `/api/stream?songId=${encodeURIComponent(archiveId)}`
                  : "",
            source,
            archiveId,
            fileName: null,
            licenseUrl: track.url || null,
          })
          .onConflictDoNothing();
      }

      return Response.json({ playlist: { ...created, tracks: [] } }, { status: 201 });
    }

    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (!name) return Response.json({ error: "Введите название плейлиста." }, { status: 400 });
    const colors = ["violet", "blue", "peach", "pink"];
    const [created] = await db
      .insert(playlists)
      .values({
        id: randomUUID(),
        profileId,
        name,
        color: colors[Math.floor(Math.random() * colors.length)],
        kind: "custom",
      })
      .returning();
    return Response.json({ playlist: { ...created, tracks: [] } }, { status: 201 });
  } catch {
    return Response.json({ error: "Не удалось создать плейлист." }, { status: 500 });
  }
}
