import { findLyrics } from "@/lib/lyrics";

export const dynamic = "force-dynamic";

/** GET /api/lyrics?artist=…&title=…&duration=… — текст песни (Genius, с запасными источниками). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const artist = (params.get("artist") || "").trim().slice(0, 200);
  const title = (params.get("title") || "").trim().slice(0, 200);
  const duration = Number(params.get("duration") || 0) || undefined;
  if (!title) return Response.json({ error: "Не указано название трека." }, { status: 400 });
  try {
    const result = await findLyrics(artist, title, duration);
    return Response.json(result, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch {
    return Response.json({ error: "Не удалось получить текст песни." }, { status: 502 });
  }
}
