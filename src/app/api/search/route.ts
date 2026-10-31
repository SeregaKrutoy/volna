import { getHitmosTopTracks, searchHitmos } from "@/lib/hitmos";
import { featuredTracks } from "@/lib/music";
import { rankSearchResults } from "@/lib/search-rank";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = (url.searchParams.get("q") || "").trim().slice(0, 120);

  try {
    if (!raw || raw.toLowerCase() === "top") {
      const topTracks = await getHitmosTopTracks(24);
      return Response.json({
        tracks: topTracks.length ? topTracks : featuredTracks,
        query: "top",
        total: topTracks.length || featuredTracks.length,
        source: "hitmos.me",
      });
    }

    // Hitmos отдаёт выдачу по популярности; пересортировываем: похожесть на запрос → популярность.
    const tracks = rankSearchResults(raw, await searchHitmos(raw, 120));
    return Response.json(
      { tracks, query: raw, total: tracks.length, source: "hitmos.me" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Не удалось выполнить поиск на Hitmos. Попробуйте ещё раз." },
      { status: 502 },
    );
  }
}
