"use client";

import { Clock3, Download, ExternalLink, Heart, HeartCrack, ListPlus, Music2, Play, Sparkles, Trash2 } from "lucide-react";
import { formatTime, type Track } from "@/lib/music";

export function Artwork({ track, className = "" }: { track: Track; className?: string }) {
  return (
    <div className={`artwork ${className}`} aria-hidden="true">
      <Music2 size={19} strokeWidth={1.7} />
      {track.artwork && (
        <img
          src={track.artwork}
          alt=""
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </div>
  );
}

type Props = {
  tracks: Track[];
  current: Track;
  playing: boolean;
  likedIds: Set<string>;
  localIds: Set<string>;
  onPlay: (track: Track, tracks: Track[]) => void;
  onArtist: (artist: string, track: Track) => void;
  onLike: (track: Track) => void;
  onDislike?: (track: Track) => void;
  dislikedIds?: Set<string>;
  onAdd: (track: Track) => void;
  onDownload: (track: Track) => void;
  onSimilar?: (track: Track) => void;
  onRemove?: (track: Track) => void;
  removeLabel?: string;
};

export function TrackTable({
  tracks,
  current,
  playing,
  likedIds,
  localIds,
  onPlay,
  onArtist,
  onLike,
  onDislike,
  dislikedIds,
  onAdd,
  onDownload,
  onSimilar,
  onRemove,
  removeLabel,
}: Props) {
  return (
    <div className="track-table">
      <div className="track-table-head" aria-hidden="true">
        <span>#</span>
        <span>НАЗВАНИЕ</span>
        <span className="album-column">ИСТОЧНИК / ПАПКА</span>
        <span className="time-column">
          <Clock3 size={15} />
        </span>
        <span />
      </div>
      {tracks.map((track, index) => {
        const active = current.id === track.id;
        const missing = track.source === "local" && !localIds.has(track.id);
        return (
          <div className={`track-row ${active ? "current-row" : ""}`} key={track.id}>
            <button
              className="track-number"
              aria-label={`${active && playing ? "Приостановить" : "Воспроизвести"} ${track.title}`}
              onClick={() => onPlay(track, tracks)}
            >
              {active && playing ? (
                <span className="equalizer">
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                <>
                  <span className="row-index">{String(index + 1).padStart(2, "0")}</span>
                  <Play className="row-play" size={15} fill="currentColor" />
                </>
              )}
            </button>
            <div className="track-name">
              <button className="track-art-button" type="button" onClick={() => onPlay(track, tracks)} aria-label={`Воспроизвести ${track.title}`}><Artwork track={track} className="track-art" /></button>
              <span className="track-copy">
                <button className="track-title-button" type="button" onClick={() => onPlay(track, tracks)} title={track.title}>{track.title}</button>
                <div className="track-subline">
                  {missing ? <small>Файл доступен только на другом устройстве</small> : <button className="track-artist-button" type="button" onClick={() => onArtist(track.artist, track)} title={`Найти музыку: ${track.artist}`} aria-label={`Найти исполнителя ${track.artist}`}>{track.artist}</button>}
                  {track.recommendationReason && (
                    <span
                      className={`track-reason-pill${track.recommendationReason.startsWith("🧪") ? " track-reason-experiment" : ""}`}
                      title={track.recommendationReason}
                    >
                      <Sparkles size={10} /> {track.recommendationReason}
                    </span>
                  )}
                </div>
              </span>
            </div>
            {track.source === "hitmos" && track.archiveId ? (
              <a
                className="track-album album-column archive-link"
                href={`https://rus.hitmos.fm/song/${encodeURIComponent(track.archiveId)}`}
                target="_blank"
                rel="noreferrer"
                title="Открыть страницу трека на Hitmos"
              >
                Hitmos · MP3
              </a>
            ) : track.source === "soundcloud" && track.soundcloudUrl ? (
              <a
                className="track-album album-column archive-link"
                href={track.soundcloudUrl}
                target="_blank"
                rel="noreferrer"
                title="Открыть оригинальный трек SoundCloud"
              >
                SoundCloud · оригинал
              </a>
            ) : track.source === "archive" && track.archiveId ? (
              <a
                className="track-album album-column archive-link"
                href={`https://archive.org/details/${encodeURIComponent(track.archiveId)}`}
                target="_blank"
                rel="noreferrer"
                title="Страница записи"
              >
                {track.album || "Internet Archive"}
              </a>
            ) : (
              <span className="track-album album-column">
                {track.album || "Папка устройства"}
              </span>
            )}
            <span className="track-time time-column">
              {track.duration ? formatTime(track.duration) : "—:—"}
            </span>
            <div className="track-actions">
              <button
                className={`icon-button ${likedIds.has(track.id) ? "is-liked" : ""}`}
                title={likedIds.has(track.id) ? "Убрать из любимых" : "В любимые"}
                aria-label={likedIds.has(track.id) ? "Убрать из любимых" : "В любимые"}
                onClick={() => onLike(track)}
              >
                <Heart size={17} fill={likedIds.has(track.id) ? "currentColor" : "none"} />
              </button>
              {onSimilar && (
                <button
                  className="icon-button"
                  title="Найти похожие треки"
                  aria-label="Найти похожие треки"
                  onClick={() => onSimilar(track)}
                >
                  <Sparkles size={16} />
                </button>
              )}
              {onDislike && (
                <button
                  className={`icon-button dislike-button ${dislikedIds?.has(track.id) ? "is-disliked" : ""}`}
                  title={dislikedIds?.has(track.id) ? "Уже в списке «Не рекомендовать»" : "Не нравится — не рекомендовать"}
                  aria-label={dislikedIds?.has(track.id) ? "Уже в списке «Не рекомендовать»" : "Не нравится"}
                  onClick={() => onDislike(track)}
                >
                  <HeartCrack size={17} />
                </button>
              )}
              <button
                className="icon-button"
                title="Добавить в плейлист"
                aria-label="Добавить в плейлист"
                onClick={() => onAdd(track)}
              >
                <ListPlus size={18} />
              </button>
              <button
                className="icon-button"
                title={track.source === "soundcloud" ? "Открыть на SoundCloud" : "Скачать MP3"}
                aria-label={track.source === "soundcloud" ? "Открыть на SoundCloud" : "Скачать MP3"}
                onClick={() => onDownload(track)}
              >
                {track.source === "soundcloud" ? <ExternalLink size={16} /> : <Download size={17} />}
              </button>
              {onRemove && (
                <button
                  className="icon-button remove-button"
                  title={removeLabel || "Удалить"}
                  aria-label={removeLabel || "Удалить"}
                  onClick={() => onRemove(track)}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
