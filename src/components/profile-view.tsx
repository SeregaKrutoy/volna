"use client";

import { Heart, HeartCrack, LoaderCircle, Music2, Sparkles, User } from "lucide-react";
import { useEffect, useState } from "react";

type ProfileStats = {
  totalPlays: number;
  favoritesCount: number;
  historyCount: number;
  libraryCount: number;
  dislikedCount: number;
  topArtists: { key: string; score: number }[];
  topGenres: { slug: string; name: string; score: number }[];
  blockedGenres: { slug: string; name: string; source: string }[];
  blockedArtists: { key: string; name: string }[];
  allowedGenres: string[];
  dislikedTracks: { title: string; artist: string }[];
  recentlyPlayed: { title: string; artist: string; playCount: number }[];
  isNew: boolean;
};

function titleCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="profile-stat">
      <span className="profile-stat-label">{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export default function ProfileView() {
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: ProfileStats & { error?: string }) => {
        if (!cancelled) setStats(data.error ? null : data);
      })
      .catch(() => { if (!cancelled) setStats(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="profile-view">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" /> МОЙ ПРОФИЛЬ
          </div>
          <h1>Мой профиль <span className="welcome-sparkle">✳</span></h1>
          <p>Ваш музыкальный вкус, собранный из прослушиваний, любимых треков и медиатеки.</p>
        </div>
      </div>

      {loading ? (
        <div className="state-box">
          <LoaderCircle size={26} className="spin state-purple" />
          <strong>Собираем статистику...</strong>
        </div>
      ) : !stats ? (
        <div className="state-box">
          <Music2 size={28} className="state-purple" />
          <strong>Не удалось загрузить профиль</strong>
          <p>Попробуйте обновить страницу чуть позже.</p>
        </div>
      ) : stats.isNew ? (
        <div className="state-box profile-empty">
          <span className="empty-icon"><User size={28} /></span>
          <strong>Ваш профиль только начинается</strong>
          <p>
            Слушайте музыку, добавляйте треки в «Любимые» и загружайте свои файлы — здесь появится ваша
            персональная статистика: жанры, исполнители и нелюбимые треки.
          </p>
        </div>
      ) : (
        <>
          <div className="profile-stats-grid">
            <Stat label="ПРОСЛУШИВАНИЙ" value={String(stats.totalPlays)} hint="уникальных треков" />
            <Stat label="В ЛЮБИМЫХ" value={String(stats.favoritesCount)} hint="ваши открытия" />
            <Stat label="В МЕДИАТЕКЕ" value={String(stats.libraryCount)} hint="файлов с устройства" />
            <Stat label="НЕ НРАВИТСЯ" value={String(stats.dislikedCount)} hint="скрыто из рекомендаций" />
          </div>

          <div className="profile-grid">
            <section className="profile-card">
              <div className="profile-card-head">
                <span className="profile-card-icon likes"><Heart size={17} fill="currentColor" /></span>
                <div>
                  <h2>Ваш вкус</h2>
                  <p>Жанры, которые звучат чаще всего</p>
                </div>
              </div>
              {stats.topGenres.length > 0 ? (
                <div className="profile-genre-list">
                  {stats.topGenres.map((genre, index) => (
                    <div className="profile-genre-row" key={genre.slug}>
                      <span className="profile-rank">{index + 1}</span>
                      <span className="profile-genre-name">{genre.name}</span>
                      <span className="profile-genre-score">{genre.score} п.</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="profile-empty-note">Пока недостаточно данных — слушайте больше музыки.</p>
              )}

              <div className="profile-card-head profile-card-head--spaced">
                <span className="profile-card-icon artists"><Sparkles size={17} /></span>
                <div>
                  <h2>Топ исполнителей</h2>
                  <p>Кого вы включаете чаще всего</p>
                </div>
              </div>
              {stats.topArtists.length > 0 ? (
                <div className="profile-artist-list">
                  {stats.topArtists.slice(0, 3).map((artist, index) => (
                    <div className="profile-artist-row" key={artist.key}>
                      <span className="profile-rank">{index + 1}</span>
                      <span className="profile-artist-name">{titleCase(artist.key)}</span>
                      <span className="profile-artist-score">{artist.score}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="profile-empty-note">Исполнители появятся после первых прослушиваний.</p>
              )}
            </section>

            <section className="profile-card">
              <div className="profile-card-head">
                <span className="profile-card-icon dislikes"><HeartCrack size={17} /></span>
                <div>
                  <h2>Что не нравится</h2>
                  <p>Скрыто из рекомендаций и плейлистов</p>
                </div>
              </div>

              {stats.blockedGenres.length > 0 ? (
                <>
                  <p className="profile-card-subtitle">Жанры</p>
                  <div className="profile-chip-list">
                    {stats.blockedGenres.map((genre) => (
                      <span className="profile-chip" key={genre.slug}>
                        {genre.name}
                        {genre.source !== "вручную" && <small> · {genre.source}</small>}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="profile-empty-note">Жанры не скрыты.</p>
              )}

              {stats.blockedArtists.length > 0 ? (
                <>
                  <p className="profile-card-subtitle">Исполнители</p>
                  <div className="profile-chip-list">
                    {stats.blockedArtists.map((artist) => (
                      <span className="profile-chip" key={artist.key}>{titleCase(artist.name)}</span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="profile-empty-note">Исполнители не скрыты.</p>
              )}

              {stats.dislikedTracks.length > 0 && (
                <>
                  <p className="profile-card-subtitle">Нелюбимые треки</p>
                  <div className="profile-track-list">
                    {stats.dislikedTracks.map((track, index) => (
                      <div className="profile-track-row" key={`${track.title}-${index}`}>
                        <span className="profile-track-title">{track.title}</span>
                        <span className="profile-track-artist">{track.artist}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {stats.allowedGenres.length > 0 && (
                <>
                  <p className="profile-card-subtitle">Разрешены вручную</p>
                  <div className="profile-chip-list">
                    {stats.allowedGenres.map((slug) => (
                      <span className="profile-chip profile-chip--allowed" key={slug}>
                        {slug}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
