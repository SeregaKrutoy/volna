import { fetchArchiveAudio } from "@/lib/archive-server";
import { fetchHitmosAudioStream } from "@/lib/hitmos";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const hitmosUrl = params.get("url") || "";
  const songId = params.get("songId") || "";
  const id = params.get("id") || "";
  const file = params.get("file") || "";
  const range = request.headers.get("range");

  if (range && !/^bytes=\d*-\d*$/.test(range)) {
    return new Response(null, { status: 416 });
  }

  // Hitmos streaming
  if (hitmosUrl || songId) {
    try {
      const response = await fetchHitmosAudioStream(hitmosUrl, songId, range);
      if ((!response.ok && response.status !== 206) || !response.body) {
        return new Response(null, { status: response.status === 416 ? 416 : 502 });
      }
      // Источник проигнорировал Range и вернул весь файл: отрезаем начало сами,
      // иначе браузер не сможет перематывать трек.
      if (range && response.status === 200) {
        const start = Number(range.match(/^bytes=(\d*)-/)?.[1] || 0);
        const total = Number(response.headers.get("content-length") || 0);
        if (start > 0 && total > 0 && start < total) {
          let skipped = 0;
          const sliced = response.body.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, controller) {
                if (skipped >= start) {
                  controller.enqueue(chunk);
                  return;
                }
                const remaining = start - skipped;
                if (chunk.byteLength <= remaining) {
                  skipped += chunk.byteLength;
                  return;
                }
                skipped = start;
                controller.enqueue(chunk.subarray(remaining));
              },
            }),
          );
          return new Response(sliced, {
            status: 206,
            headers: {
              "Content-Type": response.headers.get("content-type") || "audio/mpeg",
              "Accept-Ranges": "bytes",
              "Content-Range": `bytes ${start}-${total - 1}/${total}`,
              "Content-Length": String(total - start),
              "Cache-Control": "public, max-age=3600",
            },
          });
        }
      }
      const headers = new Headers({
        "Content-Type": response.headers.get("content-type") || "audio/mpeg",
        "Accept-Ranges": response.headers.get("accept-ranges") || "bytes",
        "Cache-Control": "public, max-age=3600",
      });
      for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
        const value = response.headers.get(name);
        if (value) headers.set(name, value);
      }
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return Response.json({ error: "Не удалось загрузить аудио с Hitmos." }, { status: 502 });
    }
  }

  // Internet Archive fallback streaming
  if (!/^[\w.-]{1,200}$/.test(id) || !file || file.length > 500 || !/\.mp3$/i.test(file)) {
    return Response.json({ error: "Некорректный адрес файла." }, { status: 400 });
  }
  try {
    const response = await fetchArchiveAudio(id, file, range);
    if ((!response.ok && response.status !== 206) || !response.body) {
      return new Response(null, { status: response.status === 416 ? 416 : 502 });
    }
    const headers = new Headers({
      "Content-Type": response.headers.get("content-type") || "audio/mpeg",
      "Accept-Ranges": response.headers.get("accept-ranges") || "bytes",
      "Cache-Control": "public, max-age=3600",
    });
    for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json({ error: "Не удалось загрузить аудио." }, { status: 502 });
  }
}
