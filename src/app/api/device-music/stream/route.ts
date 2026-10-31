import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".webm": "audio/webm",
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawPath = params.get("path") || "";
  const isDownload = params.get("download") === "1";

  if (!rawPath) {
    return Response.json({ error: "Путь к файлу не указан." }, { status: 400 });
  }

  const resolved = path.resolve(rawPath);
  const ext = path.extname(resolved).toLowerCase();
  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) {
    return Response.json({ error: "Неподдерживаемый аудиоформат." }, { status: 400 });
  }

  try {
    const stat = await fsp.stat(resolved);
    if (!stat.isFile()) {
      return Response.json({ error: "Файл не найден." }, { status: 404 });
    }

    const totalSize = stat.size;
    const range = request.headers.get("range");
    const fileName = path.basename(resolved);

    if (range && !isDownload) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        return new Response(null, { status: 416 });
      }
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(parseInt(match[2], 10), totalSize - 1) : totalSize - 1;
      if (start >= totalSize || start > end) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${totalSize}` },
        });
      }

      const chunkSize = end - start + 1;
      const nodeStream = fs.createReadStream(resolved, { start, end });
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;

      return new Response(webStream, {
        status: 206,
        headers: {
          "Content-Type": mimeType,
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${totalSize}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    const nodeStream = fs.createReadStream(resolved);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    const headers = new Headers({
      "Content-Type": mimeType,
      "Content-Length": String(totalSize),
      "Accept-Ranges": "bytes",
    });

    if (isDownload) {
      headers.set(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      );
    }

    return new Response(webStream, { status: 200, headers });
  } catch {
    return Response.json({ error: "Не удалось прочитать файл с устройства." }, { status: 404 });
  }
}
