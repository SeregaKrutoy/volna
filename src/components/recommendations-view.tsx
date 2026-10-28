"use client";

import {
  Sparkles,
  Play,
  RefreshCw,
  Radio,
  Heart,
  Smile,
  Zap,
  Coffee,
  Target,
  Frown,
  Mic,
  Flame,
  ArrowRight,
  Music2,
  LoaderCircle,
  HelpCircle,
  FlaskConical,
  SlidersHorizontal,
} from "lucide-react";
import { useState, type CSSProperties, type FormEvent } from "react";
import type { Track } from "@/lib/music";
import { TrackTable } from "@/components/track-table";

type Props = {
  tracks: Track[];
  loading: boolean;
  title: string;
  summary: string;
  mode: "favorites" | "similar" | "mood";
  currentTrack: Track;
  seedTrack: Track | null;
  selectedMood: string;
  factors: { genres: { slug: string; name: string }[]; avgDuration: number; language: string; artists: string[] };
  experimentalPercent: number;
  experimentalCount: number;
  continuationLoading: boolean;
  onContinueWave: () => void;
  onExperimentalChange: (value: number) => void;
  onSelectMode: (mode: "favorites" | "similar" | "mood") => void;
  onSelectMood: (moodKey: string, customText?: string) => void;
  onRefresh: () => void;
  onPlayAll: () => void;
  tableProps: {
    current: Track;
    playing: boolean;
    likedIds: Set<string>;
    localIds: Set<string>;
    onPlay: (track: Track, tracks: Track[]) => void;
    onArtist: (artist: string, track: Track) => void;
    onLike: (track: Track) => void;
    onAdd: (track: Track) => void;
    onDownload: (track: Track) => void;
    onSimilar: (track: Track) => void;
  };
};

const PRESET_MOODS = [
  { key: "chill", label: "Вечерний чилл", icon: Coffee, desc: "Lounge & Relax" },
  { key: "energy", label: "Драйв и заряд", icon: Zap, desc: "Club & Dance" },
  { key: "focus", label: "Фокус / Работа", icon: Target, desc: "Piano & Ambient" },
  { key: "sad", label: "Лирика / Меланхолия", icon: Frown, desc: "Акустика и душа" },
  { key: "rap", label: "Рэп и хип-хоп", icon: Mic, desc: "Биты и рифмы" },
  { key: "rock", label: "Рок-волна", icon: Flame, desc: "Драйв и гитары" },
];

export default function RecommendationsView({
  tracks,
  loading,
  title,
  summary,
  mode,
  currentTrack,
  seedTrack,
  selectedMood,
  factors,
  experimentalPercent,
  experimentalCount,
  continuationLoading,
  onContinueWave,
  onExperimentalChange,
  onSelectMode,
  onSelectMood,
  onRefresh,
  onPlayAll,
  tableProps,
}: Props) {
  const [customInput, setCustomInput] = useState("");

  const handleCustomSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    onSelectMood("custom", customInput.trim());
  };

  const activeSeed = seedTrack || currentTrack;

  return (
    <div className="recommendations-container">
      {/* Шапка рекомендаций */}
      <div className="page-heading recommendations-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" /> УМНЫЙ МУЗЫКАЛЬНЫЙ ИНТЕЛЛЕКТ
          </div>
          <h1>
            Умные рекомендации <span className="welcome-sparkle">✳</span>
          </h1>
          <p>
            Алгоритм анализирует треки из «Любимых» и «Моей медиатеки», подстраиваясь под ваш вкус, настроение или играющую песню.
          </p>
        </div>

        <div className="page-heading-actions">
          <button
            type="button"
            className="outline-icon"
            title="Обновить подборку"
            aria-label="Обновить подборку"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw size={17} className={loading ? "spin" : ""} />
          </button>
          {tracks.length > 0 && (
            <button
              type="button"
              className="solid-button reco-play-all"
              onClick={onPlayAll}
              disabled={loading}
            >
              <Play size={15} fill="currentColor" /> Слушать волну
            </button>
          )}
        </div>
      </div>

      {/* Переключатель режимов рекомендаций */}
      <div className="reco-mode-tabs" role="tablist" aria-label="Режимы рекомендаций">
        <button
          type="button"
          className={`reco-mode-tab ${mode === "favorites" ? "active" : ""}`}
          onClick={() => onSelectMode("favorites")}
        >
          <Sparkles size={16} />
          <span>Моя умная волна</span>
          <small>Любимые + медиатека</small>
        </button>

        <button
          type="button"
          className={`reco-mode-tab ${mode === "similar" ? "active" : ""}`}
          onClick={() => onSelectMode("similar")}
        >
          <Radio size={16} />
          <span>Похожее на трек</span>
          <small>{activeSeed ? `${activeSeed.artist}` : "Текущая песня"}</small>
        </button>

        <button
          type="button"
          className={`reco-mode-tab ${mode === "mood" ? "active" : ""}`}
          onClick={() => onSelectMode("mood")}
        >
          <Smile size={16} />
          <span>По настроению</span>
          <small>Чилл, энергия, лирика</small>
        </button>
      </div>

      {/* Панель настроек в зависимости от выбранного режима */}
      {mode === "similar" && (
        <div className="reco-context-card">
          <div className="reco-context-info">
            <span className="reco-context-badge">
              <Radio size={13} /> РАДИО ПО ТРЕКУ
            </span>
            <h3>
              {activeSeed ? `${activeSeed.artist} — ${activeSeed.title}` : "Текущий трек"}
            </h3>
            <p>
              Подбираем треки с похожей ритмикой, звучанием и исполнителей схожей волны.
            </p>
          </div>
          <button
            type="button"
            className="solid-button reco-similar-refresh"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} /> Обновить радио
          </button>
        </div>
      )}

      {mode === "mood" && (
        <div className="reco-mood-panel">
          <div className="reco-mood-grid">
            {PRESET_MOODS.map((item) => {
              const Icon = item.icon;
              const isSelected = selectedMood === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`reco-mood-card ${isSelected ? "selected" : ""}`}
                  onClick={() => onSelectMood(item.key)}
                >
                  <span className="reco-mood-icon">
                    <Icon size={19} />
                  </span>
                  <strong>{item.label}</strong>
                  <small>{item.desc}</small>
                </button>
              );
            })}
          </div>

          <form onSubmit={handleCustomSubmit} className="reco-custom-mood-form">
            <label htmlFor="custom-mood-input">
              <span>Или укажите своё настроение / ситуацию:</span>
            </label>
            <div className="reco-custom-input-wrap">
              <input
                id="custom-mood-input"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Например: ночная дорога, спорт, романтика, вечеринка 90-х..."
                maxLength={60}
              />
              <button
                type="submit"
                className="solid-button"
                disabled={!customInput.trim() || loading}
              >
                Подобрать <ArrowRight size={14} />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Информационный баннер с объяснением логики */}
      <div className="reco-summary-banner">
        <div className="reco-summary-art">
          {mode === "favorites" ? (
            <Sparkles size={28} />
          ) : mode === "similar" ? (
            <Radio size={28} />
          ) : (
            <Smile size={28} />
          )}
        </div>
        <div className="reco-summary-copy">
          <span className="small-kicker">УМНЫЙ ПОДБОР</span>
          <h2>{title}</h2>
          <p>{summary}</p>
        </div>
      </div>

      {/* Настройка волны: факторы вкуса + доля экспериментов */}
      <div className="reco-tune-panel">
        <div className="reco-tune-head">
          <span className="reco-tune-icon">
            <SlidersHorizontal size={17} />
          </span>
          <div>
            <strong>Настройка волны</strong>
            <small>Подбор учитывает жанр, настроение, длительность, язык и версии треков — не только исполнителя</small>
          </div>
        </div>
        {factors.genres.length > 0 && (
          <div className="reco-factor-chips" aria-label="Жанры вашего вкуса">
            {factors.genres.map((genre) => (
              <span key={genre.slug} className="reco-factor-chip" title="Жанр из вашей медиатеки и любимых">
                {genre.name}
              </span>
            ))}
          </div>
        )}
        {mode === "mood" ? (
          <p className="reco-tune-hint reco-mood-note">
            В режиме настроения эксперименты отключены: в волне только треки, которые действительно подходят под выбранное настроение.
          </p>
        ) : (
        <label className="reco-experiment-row" htmlFor="reco-experiment-range">
          <span className="reco-experiment-label">
            <FlaskConical size={15} />
            <span>
              Доля открытий: <b>{experimentalPercent}%</b>
              <small>
                {experimentalCount > 0
                  ? `Сейчас в волне ${experimentalCount} экспериментальных треков с пометкой 🧪`
                  : "Эксперименты выключены — только знакомый вкус"}
              </small>
            </span>
          </span>
          <input
            id="reco-experiment-range"
            type="range"
            min={0}
            max={30}
            step={5}
            value={experimentalPercent}
            style={{ "--range-progress": `${(experimentalPercent / 30) * 100}%` } as CSSProperties}
            onChange={(event) => onExperimentalChange(Number(event.target.value))}
            aria-label="Доля экспериментальных треков"
          />
        </label>
        )}
        <p className="reco-tune-hint">
          Эксперименты — треки из далёких от вашего вкуса жанров. Их немного, и они аккуратно вплетены в поток, чтобы расширять вкус и не надоедать.
        </p>
      </div>

      {/* Список рекомендованных треков */}
      <section className="content-section reco-results-section">
        <div className="section-heading">
          <div>
            <h2>
              Рекомендованные треки <span>✳</span>
            </h2>
            <p>
              {loading
                ? "Анализируем библиотеку и подбираем музыку..."
                : `Готово: ${tracks.length} треков в персональной подборке`}
            </p>
          </div>
          {tracks.length > 0 && !loading && (
            <span className="result-count">{tracks.length} треков</span>
          )}
        </div>

        {loading ? (
          <div className="state-box">
            <LoaderCircle size={28} className="spin state-purple" />
            <strong>Генерируем умную волну...</strong>
            <p>
              Анализируем предпочтения из любимых треков, исполнителей медиатеки и подбираем лучшие композиции
            </p>
          </div>
        ) : tracks.length > 0 ? (
          <TrackTable tracks={tracks} {...tableProps} />
        ) : (
          <div className="state-box reco-empty-state">
            <Music2 size={32} className="state-purple" />
            <strong>Не удалось подобрать треки</strong>
            <p>
              Попробуйте выбрать другое настроение или добавить пару треков в «Любимые», чтобы система точнее поняла ваш вкус.
            </p>
            <button
              type="button"
              className="solid-button"
              onClick={() => onSelectMode("favorites")}
            >
              Сгенерировать персональную волну
            </button>
          </div>
        )}
        {tracks.length > 0 && (
          <div className="reco-continuation-footer">
            <p>
              Очередь продолжится со следующего трека списка. Уже предложенные песни не повторятся, а случайные экспериментальные треки будут пропущены — кроме тех, которым вы поставили лайк.
            </p>
            <button
              type="button"
              className="solid-button reco-continue-button"
              onClick={onContinueWave}
              disabled={loading || continuationLoading}
            >
              {continuationLoading ? (
                <><LoaderCircle size={15} className="spin" /> Подбираем продолжение…</>
              ) : (
                <><ArrowRight size={15} /> Продолжить волну</>
              )}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
