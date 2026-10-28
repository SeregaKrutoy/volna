import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { Track } from "@/lib/music";
import { getProfileId } from "@/lib/profile";
import { db } from "@/db";
import { libraryTracks } from "@/db/schema";

export const dynamic = "force-dynamic";

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".m4a",
  ".aac",
  ".ogg",
  ".opus",
  ".webm",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".cache",
  ".npm",
  "Library",
  "AppData",
]);

export function getDefaultDeviceMusicDirs(): string[] {
  const home = os.homedir();
  const candidates = [
    path.join(home, "Music"),
    path.join(home, "Музыка"),
    path.join(home, "Downloads"),
    path.join(home, "Загрузки"),
    path.join(home, "Desktop"),
    path.join(home, "Рабочий стол"),
    path.join(process.cwd(), "music"),
    path.join(process.cwd(), "public", "music"),
    "/sdcard/Music",
    "/storage/emulated/0/Music",
  ];
  return Array.from(new Set(candidates.map((p) => path.resolve(p))));
}

async function scanDirectoryRecursive(
  dirPath: string,
  maxDepth = 3,
  currentDepth = 0,
  collected: string[] = [],
  maxFiles = 300,
): Promise<string[]> {
  if (currentDepth > maxDepth || collected.length >= maxFiles) return collected;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (collected.length >= maxFiles) break;
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await scanDirectoryRecursive(fullPath, maxDepth, currentDepth + 1, collected, maxFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTENSIONS.has(ext)) {
          collected.push(fullPath);
        }
      }
    }
  } catch {
    // Directory does not exist or is not readable
  }
  return collected;
}

function fileToTrack(filePath: string, sizeBytes: number): Track {
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext).replace(/_/g, " ").trim();
  const parentFolder = path.basename(path.dirname(filePath));
  const parts = baseName.split(/\s+[-—–]\s+/);
  const artist = parts.length > 1 ? parts[0].trim() : parentFolder && parentFolder !== "Music" ? parentFolder : "На устройстве";
  const title = parts.length > 1 ? parts.slice(1).join(" - ").trim() : baseName;
  const hash = crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 16);
  // Estimate duration from bitrate (~256 kbps for mp3) as initial fallback before metadata loads
  const estimatedDuration = ext.toLowerCase() === ".mp3" && sizeBytes > 0 ? Math.max(1, Math.round(sizeBytes / 32000)) : 0;

  return {
    id: `device:${hash}`,
    title: title || "Аудиофайл",
    artist: artist || "На устройстве",
    album: parentFolder ? `Папка: ${parentFolder}` : "Папка устройства",
    duration: estimatedDuration,
    artwork: "",
    audioUrl: `/api/device-music/stream?path=${encodeURIComponent(filePath)}`,
    downloadUrl: `/api/device-music/stream?path=${encodeURIComponent(filePath)}&download=1`,
    source: "device",
    fileName: path.basename(filePath),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const customDir = (url.searchParams.get("dir") || "").trim();
  const dirsToScan = customDir
    ? [path.resolve(customDir), ...getDefaultDeviceMusicDirs()]
    : getDefaultDeviceMusicDirs();

  const seenPaths = new Set<string>();
  const seenNames = new Set<string>();
  const tracks: Track[] = [];
  const scannedDirs: string[] = [];

  for (const dir of dirsToScan) {
    try {
      const stat = await fs.stat(dir);
      if (!stat.isDirectory()) continue;
      scannedDirs.push(dir);
      const files = await scanDirectoryRecursive(dir, 3, 0, [], 250);
      for (const filePath of files) {
        const resolved = path.resolve(filePath);
        const dedupeKey = path.basename(resolved).toLowerCase();
        if (seenPaths.has(resolved) || seenNames.has(dedupeKey)) continue;
        seenPaths.add(resolved);
        seenNames.add(dedupeKey);
        try {
          const fileStat = await fs.stat(resolved);
          tracks.push(fileToTrack(resolved, fileStat.size));
        } catch {
          tracks.push(fileToTrack(resolved, 0));
        }
      }
    } catch {
      // ignore non-existent directory
    }
  }

  // Файлы сохраняются в медиатеку только по явной команде пользователя (?sync=1),
  // поэтому у нового профиля раздел «Моя медиатека» пуст.
  let saved = 0;
  if (url.searchParams.get("sync") === "1" && tracks.length > 0) {
    try {
      const profileId = await getProfileId(request);
      for (const track of tracks.slice(0, 300)) {
        await db
          .insert(libraryTracks)
          .values({
            profileId,
            trackId: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album,
            duration: track.duration,
            artwork: "",
            audioUrl: track.audioUrl,
            source: "device",
            fileName: track.fileName || null,
            addedAt: new Date(),
          })
          .onConflictDoNothing();
        saved++;
      }
    } catch {
      // Сканирование остаётся доступным даже без сохранения
    }
  }

  return Response.json({
    tracks,
    scannedDirs,
    total: tracks.length,
    saved,
  });
}
