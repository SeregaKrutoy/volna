import QRCode from "qrcode";
import type { ShareTrackSnapshot } from "@/db/schema";

type ShareRow = {
  title: string;
  artist: string;
  album: string;
  duration: number;
  artwork: string;
  source: string;
  archiveId: string | null;
  fileName: string | null;
  licenseUrl: string | null;
  audioUrl: string;
};

/** Публичная ссылка на трек: её можно открыть у другого пользователя. */
export function buildTrackLink(row: ShareRow, origin: string): string | null {
  const safeOrigin = origin.replace(/\/$/, "");
  if (row.source === "hitmos" && row.archiveId && /^\d+$/.test(row.archiveId)) {
    return `https://rus.hitmos.fm/song/${row.archiveId}`;
  }
  if (row.source === "soundcloud") {
    const url = row.licenseUrl || "";
    return /^https:\/\/soundcloud\.com\//i.test(url) ? url : null;
  }
  if (row.source === "archive" && row.archiveId) {
    return `https://archive.org/details/${encodeURIComponent(row.archiveId)}`;
  }
  if (row.source === "device" && row.audioUrl.startsWith("/api/device-music/stream")) {
    return `${safeOrigin}${row.audioUrl}`;
  }
  // Локальные файлы браузера живут только на устройстве владельца.
  return null;
}

export function buildSnapshot(rows: ShareRow[], origin: string): ShareTrackSnapshot[] {
  return rows.map((row) => ({
    title: row.title,
    artist: row.artist,
    album: row.album,
    duration: row.duration,
    artwork: row.artwork,
    source: row.source,
    url: buildTrackLink(row, origin),
  }));
}

export function shareLinksText(tracks: ShareTrackSnapshot[]): string {
  return tracks
    .filter((track) => track.url)
    .map((track) => `${track.artist} — ${track.title}: ${track.url}`)
    .join("\n");
}

export async function makeQr(content: string, errorCorrectionLevel: "L" | "M" = "M"): Promise<string> {
  return QRCode.toDataURL(content, {
    width: 640,
    margin: 1,
    errorCorrectionLevel,
    color: { dark: "#252637", light: "#ffffff" },
  });
}

export type QrTarget = { dataUrl: string; mode: "links" | "page"; totalBytes: number };

/**
 * QR со всеми ссылками на треки. Если ссылок слишком много для одного кода,
 * кодируем короткую страницу плейлиста, где перечислены все ссылки.
 */
export async function buildShareQr(tracks: ShareTrackSnapshot[], pageUrl: string): Promise<QrTarget> {
  const links = shareLinksText(tracks);
  const bytes = Buffer.byteLength(links, "utf8");
  const useLinks = bytes > 0 && bytes <= 1800;
  const content = useLinks ? links : pageUrl;
  const dataUrl = await QRCode.toDataURL(content, {
    width: 640,
    margin: 1,
    errorCorrectionLevel: useLinks ? "L" : "M",
    color: { dark: "#252637", light: "#ffffff" },
  });
  return { dataUrl, mode: useLinks ? "links" : "page", totalBytes: bytes };
}
