import { createReadStream, existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

const DOWNLOAD_DIR = path.join(process.cwd(), "public", "download");

async function latestApk(): Promise<string | null> {
  if (!existsSync(DOWNLOAD_DIR)) return null;
  const files = (await readdir(DOWNLOAD_DIR)).filter((name) => name.endsWith(".apk"));
  if (!files.length) return null;
  files.sort((a, b) => statSync(path.join(DOWNLOAD_DIR, b)).mtimeMs - statSync(path.join(DOWNLOAD_DIR, a)).mtimeMs);
  return files[0];
}

/** Отдаёт собранный APK: GET /api/apk — скачивание, GET /api/apk?info=1 — сведения о файле. */
export async function GET(request: Request) {
  const name = await latestApk();
  const info = new URL(request.url).searchParams.get("info");
  if (!name) {
    return Response.json({ available: false, error: "APK ещё не собран. Запустите scripts/build-apk.sh." }, { status: info ? 200 : 404 });
  }
  const file = path.join(DOWNLOAD_DIR, name);
  const size = statSync(file).size;
  if (info) {
    return Response.json({ available: true, name, size, version: name.match(/(\d+\.\d+(?:\.\d+)?)/)?.[1] || "" });
  }
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
