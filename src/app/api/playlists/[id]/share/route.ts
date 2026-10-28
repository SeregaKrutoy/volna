import { db } from "@/db";
import { playlists, playlistTracks, playlistShares } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getProfileId } from "@/lib/profile";
import { randomBytes } from "node:crypto";
import { buildSnapshot, makeQr, shareLinksText } from "@/lib/share";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function resolveOrigin(request: Request): string {
  const host = request.headers.get("host");
  if (!host) return "http://localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const profileId = await getProfileId(request);
    const [playlist] = await db
      .select()
      .from(playlists)
      .where(and(eq(playlists.id, id), eq(playlists.profileId, profileId)));
    if (!playlist) return Response.json({ error: "Плейлист не найден." }, { status: 404 });

    const rows = await db
      .select()
      .from(playlistTracks)
      .where(and(eq(playlistTracks.playlistId, id)));
    if (rows.length === 0) {
      return Response.json({ error: "В плейлисте пока нет треков — добавьте музыку и поделитесь снова." }, { status: 400 });
    }

    const origin = resolveOrigin(request);
    const snapshot = buildSnapshot(rows, origin);
    const shareId = randomBytes(6).toString("base64url");
    await db.insert(playlistShares).values({
      id: shareId,
      name: playlist.name,
      color: playlist.color,
      tracks: snapshot,
    });

    const pageUrl = `${origin}/share/${shareId}`;
    const linksText = shareLinksText(snapshot);
    const bytes = Buffer.byteLength(linksText, "utf8");
    const linksQr = bytes > 0 && bytes <= 1800 ? await makeQr(linksText, "L") : "";
    const pageQr = await makeQr(pageUrl, "M");
    const links = snapshot.filter((track) => track.url);

    return Response.json({
      id: shareId,
      url: pageUrl,
      name: playlist.name,
      tracks: snapshot,
      linksText,
      linkCount: links.length,
      missingCount: snapshot.length - links.length,
      qrLinks: linksQr,
      qrPage: pageQr,
      qrMode: linksQr ? "links" : "page",
    });
  } catch {
    return Response.json({ error: "Не удалось создать ссылку для плейлиста." }, { status: 500 });
  }
}
