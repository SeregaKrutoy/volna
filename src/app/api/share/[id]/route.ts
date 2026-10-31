import { db } from "@/db";
import { playlistShares } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!/^[\w-]{4,40}$/.test(id)) {
    return Response.json({ error: "Некорректная ссылка плейлиста." }, { status: 400 });
  }
  const [share] = await db.select().from(playlistShares).where(eq(playlistShares.id, id));
  if (!share) {
    return Response.json({ error: "Плейлист по этой ссылке не найден." }, { status: 404 });
  }
  return Response.json({
    id: share.id,
    name: share.name,
    color: share.color,
    tracks: share.tracks,
    createdAt: share.createdAt,
  });
}
