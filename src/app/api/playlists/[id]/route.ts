import { db } from "@/db";
import { playlists, playlistTracks } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getProfileId } from "@/lib/profile";

type Context = { params: Promise<{ id: string }> };

function isSafeSoundCloudUrl(value: string, allowedHost: "soundcloud.com" | "w.soundcloud.com"): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.hostname !== allowedHost) return false;
    if (allowedHost === "w.soundcloud.com" && url.pathname !== "/player/") return false;
    return true;
  } catch {
    return false;
  }
}

async function resolvePlaylist(profileId: string, id: string) {
  if (id === "favorites") {
    const [favorite] = await db
      .select({ id: playlists.id })
      .from(playlists)
      .where(and(eq(playlists.profileId, profileId), eq(playlists.isSystem, true)));
    return favorite || null;
  }
  const [playlist] = await db
    .select({ id: playlists.id })
    .from(playlists)
    .where(and(eq(playlists.id, id), eq(playlists.profileId, profileId)));
  return playlist || null;
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const profileId = await getProfileId(request);
    const playlist = await resolvePlaylist(profileId, id);
    if (!playlist) return Response.json({ error: "Плейлист не найден." }, { status: 404 });

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

    const text = (value: unknown, max = 500) =>
      typeof value === "string" ? value.slice(0, max) : "";
    const archiveId = text(track.archiveId, 200);
    const fileName = text(track.fileName, 500);
    const soundcloudUrl = text(track.soundcloudUrl, 1000);
    const soundcloudEmbedUrl = text(track.soundcloudEmbedUrl, 1600);

    let audioUrl = text(track.audioUrl, 1600);
    if (track.source === "archive" && archiveId && fileName) {
      audioUrl = `https://archive.org/download/${encodeURIComponent(archiveId)}/${encodeURIComponent(fileName)}`;
    } else if (track.source === "local") {
      audioUrl = "";
    } else if (track.source === "soundcloud") {
      if (
        !isSafeSoundCloudUrl(soundcloudUrl, "soundcloud.com") ||
        !isSafeSoundCloudUrl(soundcloudEmbedUrl, "w.soundcloud.com")
      ) {
        return Response.json({ error: "Некорректная ссылка SoundCloud." }, { status: 400 });
      }
      audioUrl = soundcloudEmbedUrl;
    }

    const extraUrl =
      track.source === "hitmos"
        ? text(track.downloadUrl || track.streamUrl, 1000)
        : track.source === "soundcloud"
          ? soundcloudUrl
          : text(track.licenseUrl, 500);

    await db
      .insert(playlistTracks)
      .values({
        playlistId: playlist.id,
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
      })
      .onConflictDoNothing();

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Не удалось добавить трек." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const profileId = await getProfileId(request);
    const playlist = await resolvePlaylist(profileId, id);
    if (!playlist) return Response.json({ error: "Плейлист не найден." }, { status: 404 });
    const trackId = new URL(request.url).searchParams.get("trackId");
    if (trackId) {
      await db
        .delete(playlistTracks)
        .where(and(eq(playlistTracks.playlistId, playlist.id), eq(playlistTracks.trackId, trackId)));
    } else {
      if (playlist.id === "favorites" || id === "favorites") {
        return Response.json({ error: "Этот плейлист нельзя удалить." }, { status: 400 });
      }
      await db.delete(playlists).where(eq(playlists.id, playlist.id));
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Не удалось удалить." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const profileId = await getProfileId(request);
    const playlist = await resolvePlaylist(profileId, id);
    if (!playlist) return Response.json({ error: "Плейлист не найден." }, { status: 404 });
    if (id === "favorites") {
      return Response.json({ error: "Этот плейлист нельзя переименовать." }, { status: 400 });
    }
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (!name) return Response.json({ error: "Введите название." }, { status: 400 });
    await db.update(playlists).set({ name }).where(eq(playlists.id, playlist.id));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Не удалось переименовать плейлист." }, { status: 500 });
  }
}
