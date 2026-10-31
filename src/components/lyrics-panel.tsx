"use client";

import { ExternalLink, LoaderCircle, MicVocal, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "@/lib/music";

type LyricsPayload = {
  found: boolean;
  lyrics: string;
  source: "genius" | "lrclib" | "netease" | "lyrics.ovh" | "none";
  url: string;
  title: string;
  artist: string;
  syncedLyrics?: string;
  message?: string;
  error?: string;
};

type Props = {
  track: Track;
  elapsed: number;
  open: boolean;
  onClose: () => void;
};

type SyncedLine = { time: number; text: string };

function parseSynced(lrc?: string): SyncedLine[] {
  if (!lrc) return [];
  const lines: SyncedLine[] = [];
  for (const raw of lrc.split("\n")) {
    const match = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s?(.*)$/);
    if (!match) continue;
    lines.push({ time: Number(match[1]) * 60 + Number(match[2]), text: match[3].trim() });
  }
  return lines;
}

const SOURCE_LABEL: Record<LyricsPayload["source"], string> = {
  genius: "Genius",
  lrclib: "LRCLIB",
  netease: "NetEase Music",
  "lyrics.ovh": "lyrics.ovh",
  none: "",
};

export default function LyricsPanel({ track, elapsed, open, onClose }: Props) {
  const [data, setData] = useState<LyricsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const activeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    const params = new URLSearchParams({ artist: track.artist, title: track.title });
    if (track.duration) params.set("duration", String(track.duration));
    fetch(`/api/lyrics?${params.toString()}`)
      .then((response) => response.json())
      .then((payload: LyricsPayload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setData({ found: false, lyrics: "", source: "none", url: "", title: track.title, artist: track.artist, message: "Нет связи с сервером. Тексты доступны при подключении к интернету." });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, track.id, track.artist, track.title, track.duration, reloadKey]);

  const synced = useMemo(() => parseSynced(data?.syncedLyrics), [data?.syncedLyrics]);
  const activeIndex = useMemo(() => {
    if (!synced.length) return -1;
    let index = -1;
    for (let i = 0; i < synced.length; i++) {
      if (synced[i].time <= elapsed + 0.3) index = i;
      else break;
    }
    return index;
  }, [synced, elapsed]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  if (!open) return null;

  return (
    <aside className="lyrics-panel" aria-label="Текст песни">
      <div className="lyrics-head">
        <div className="lyrics-head-copy">
          <span className="eyebrow"><MicVocal size={12} /> ТЕКСТ ПЕСНИ</span>
          <strong>{track.title}</strong>
          <small>{track.artist}</small>
        </div>
        <div className="lyrics-head-actions">
          <button type="button" className="icon-button" title="Обновить" aria-label="Обновить текст" onClick={() => setReloadKey((v) => v + 1)} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} />
          </button>
          <button type="button" className="icon-button" title="Закрыть" aria-label="Закрыть текст" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="lyrics-body">
        {loading ? (
          <div className="state-box">
            <LoaderCircle size={24} className="spin state-purple" />
            <strong>Ищем текст песни…</strong>
          </div>
        ) : data?.found ? (<>
          {data.message && <p className="lyrics-note">{data.message}{data.artist ? ` Источник указывает: ${data.artist}.` : ""}</p>}
          {synced.length ? (
            <div className="lyrics-synced">
              {synced.map((line, index) => (
                <p key={`${line.time}-${index}`} ref={index === activeIndex ? activeRef : undefined} className={index === activeIndex ? "active" : index < activeIndex ? "passed" : ""}>
                  {line.text || "♪"}
                </p>
              ))}
            </div>
          ) : (
            <pre className="lyrics-text">{data.lyrics}</pre>
          )}
        </>) : (
          <div className="state-box">
            <MicVocal size={24} className="state-purple" />
            <strong>Текст не найден</strong>
            <p>{data?.message || data?.error || "Попробуйте позже."}</p>
            {data?.url && (
              <a className="solid-button" href={data.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Искать на Genius</a>
            )}
          </div>
        )}
      </div>

      {data?.found && (
        <div className="lyrics-foot">
          <span>Источник: {SOURCE_LABEL[data.source]}{synced.length ? " · синхронизировано" : ""}</span>
          {data.url && <a href={data.url} target="_blank" rel="noreferrer">{data.source === "genius" ? "Открыть на Genius" : "Открыть источник"} <ExternalLink size={12} /></a>}
        </div>
      )}
    </aside>
  );
}
