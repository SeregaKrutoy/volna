import { fetchArchiveAudio } from "@/lib/archive-server";
import { fetchHitmosAudioStream } from "@/lib/hitmos";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const hitmosUrl = params.get("url") || "";
  const songId = params.get("songId") || "";
  const customName = params.get("name") || "";
  const id = params.get("id") || "";
  const file = params.get("file") || "";

  if (hitmosUrl || songId) {
    try {
      const response = await fetchHitmosAudioStream(hitmosUrl, songId);
      if (!response.ok || !response.body) {
        throw new Error("Hitmos file unavailable");
      }
      const cleanFilename =
        (customName || "track.mp3")
          .replace(/[/\\:*?"<>|]/g, "_")
          .replace(/\s+/g, " ")
          .trim() || "track.mp3";
      const finalName = cleanFilename.toLowerCase().endsWith(".mp3")
        ? cleanFilename
        : `${cleanFilename}.mp3`;

      const headers = new Headers({
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(finalName)}`,
        "Cache-Control": "private, no-store",
      });
      const length = response.headers.get("content-length");
      if (length) headers.set("Content-Length", length);
      return new Response(response.body, { headers });
    } catch {
      return Response.json(
        { error: "Не удалось скачать трек с Hitmos. Попробуйте позже." },
        { status: 502 },
      );
    }
  }

  if (!/^[\w.-]{1,200}$/.test(id) || !file || file.length > 500 || !/\.mp3$/i.test(file)) {
    return Response.json({ error: "Некорректный адрес файла." }, { status: 400 });
  }
  try {
    const response = await fetchArchiveAudio(id, file);
    if (!response.ok || !response.body) throw new Error("File unavailable");
    const filename = file.split("/").pop() || "music.mp3";
    const headers = new Headers({
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    });
    const length = response.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    return new Response(response.body, { headers });
  } catch {
    return Response.json({ error: "Не удалось скачать файл. Попробуйте позже." }, { status: 502 });
  }
}
