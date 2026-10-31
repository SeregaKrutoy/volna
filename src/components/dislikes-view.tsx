"use client";

import { Ban, Check, HeartCrack, LoaderCircle, Music2, RotateCcw, ShieldOff, Trash2, UserX, Tags } from "lucide-react";
import type { Track } from "@/lib/music";
import { TrackTable } from "@/components/track-table";

export type ExclusionItem = {
  kind: "artist" | "genre";
  value: string;
  label: string;
  count: number;
  source: "auto" | "manual";
  allowed: boolean;
};

type Props = {
  tracks: Track[];
  artists: ExclusionItem[];
  genres: ExclusionItem[];
  loading: boolean;
  thresholds: { artist: number; genre: number };
  onRule: (kind: "artist" | "genre", value: string, label: string, action: "block" | "allow" | "auto") => void;
  onRestore: (track: Track) => void;
  onClearAll: () => void;
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

function RuleList({
  items,
  kind,
  thresholds,
  onRule,
}: {
  items: ExclusionItem[];
  kind: "artist" | "genre";
  thresholds: number;
  onRule: Props["onRule"];
}) {
  if (items.length === 0) {
    return (
      <p className="dislike-rule-empty">
        {kind === "artist"
          ? "Пока нет нелюбимых исполнителей. Поставьте «разбитое сердце» нескольким трекам одного автора."
          : "Пока нет нелюбимых жанров. Жанр попадёт сюда, когда наберётся достаточно дизлайков."}
      </p>
    );
  }
  return (
    <div className="dislike-rule-list">
      {items.map((item) => {
        const blocked = !item.allowed;
        return (
          <div className={`dislike-rule ${blocked ? "is-blocked" : "is-allowed"}`} key={`${item.kind}:${item.value}`}>
            <div className="dislike-rule-copy">
              <strong>{item.label}</strong>
              <small>
                {item.count} {kind === "artist" ? "нелюбимых треков" : "нелюбимых треков жанра"}
                {item.source === "manual" ? " · запрещено вручную" : ` · автоматически (порог ${thresholds})`}
              </small>
            </div>
            <div className="dislike-rule-actions">
              {blocked ? (
                <>
                  <button
                    type="button"
                    className="dislike-rule-btn allow"
                    onClick={() => onRule(kind, item.value, item.label, "allow")}
                    title="Снова рекомендовать"
                  >
                    <Check size={13} /> Разрешить
                  </button>
                  {item.source === "manual" && (
                    <button
                      type="button"
                      className="dislike-rule-btn ghost"
                      onClick={() => onRule(kind, item.value, item.label, "auto")}
                      title="Вернуть автоматическое правило"
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="dislike-rule-btn block"
                    onClick={() => onRule(kind, item.value, item.label, "block")}
                    title="Не рекомендовать"
                  >
                    <Ban size={13} /> Не рекомендовать
                  </button>
                  <button
                    type="button"
                    className="dislike-rule-btn ghost"
                    onClick={() => onRule(kind, item.value, item.label, "auto")}
                    title="Снять ручное разрешение"
                  >
                    <RotateCcw size={13} />
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DislikesView({
  tracks,
  artists,
  genres,
  loading,
  thresholds,
  onRule,
  onRestore,
  onClearAll,
  tableProps,
}: Props) {
  return (
    <div className="dislikes-container">
      <div className="page-heading dislikes-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" /> НАСТРОЙКА ВКУСА
          </div>
          <h1>
            Не рекомендовать <span className="welcome-sparkle">✳</span>
          </h1>
          <p>
            Отмечайте музыку «разбитым сердцем» — рекомендации перестанут её предлагать и учтут нелюбимые жанры и авторов.
          </p>
        </div>
        <div className="page-heading-actions">
          {tracks.length > 0 && (
            <button type="button" className="dislike-clear" onClick={onClearAll}>
              <Trash2 size={15} /> Очистить всё
            </button>
          )}
        </div>
      </div>

      <div className="dislike-summary">
        <div className="dislike-summary-item">
          <span className="dislike-summary-icon"><HeartCrack size={18} /></span>
          <div><strong>{tracks.length}</strong><small>нелюбимых треков</small></div>
        </div>
        <div className="dislike-summary-item">
          <span className="dislike-summary-icon"><UserX size={18} /></span>
          <div><strong>{artists.filter((a) => !a.allowed).length}</strong><small>скрытых исполнителей</small></div>
        </div>
        <div className="dislike-summary-item">
          <span className="dislike-summary-icon"><Tags size={18} /></span>
          <div><strong>{genres.filter((g) => !g.allowed).length}</strong><small>скрытых жанров</small></div>
        </div>
      </div>

      <section className="content-section dislike-rules-section">
        <div className="section-heading">
          <div>
            <h2>Исключения</h2>
            <p>Что сейчас не попадает в рекомендации — снимите запрет, если передумали</p>
          </div>
        </div>
        <div className="dislike-rules-grid">
          <div className="dislike-rule-card">
            <div className="dislike-rule-card-head">
              <span><UserX size={16} /> Исполнители</span>
              <small>авто при {thresholds.artist}+ дизлайках</small>
            </div>
            <RuleList items={artists} kind="artist" thresholds={thresholds.artist} onRule={onRule} />
          </div>
          <div className="dislike-rule-card">
            <div className="dislike-rule-card-head">
              <span><Tags size={16} /> Жанры</span>
              <small>авто при {thresholds.genre}+ дизлайках</small>
            </div>
            <RuleList items={genres} kind="genre" thresholds={thresholds.genre} onRule={onRule} />
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>Нелюбимые треки</h2>
            <p>{tracks.length ? "Эти треки точно не появятся в волне" : "Список пока пуст"}</p>
          </div>
        </div>
        {loading && tracks.length === 0 ? (
          <div className="state-box">
            <LoaderCircle size={26} className="spin state-purple" />
            <strong>Загружаем список...</strong>
          </div>
        ) : tracks.length ? (
          <TrackTable tracks={tracks} {...tableProps} onRemove={onRestore} removeLabel="Вернуть в рекомендации" />
        ) : (
          <div className="state-box">
            <span className="empty-icon"><ShieldOff size={28} /></span>
            <strong>Вы пока всё любите</strong>
            <p>Нажмите «разбитое сердце» у трека в любом списке — он попадёт сюда и исчезнет из рекомендаций.</p>
          </div>
        )}
      </section>

      <p className="dislike-hint">
        <Music2 size={13} /> Совет: одного дизлайка достаточно, чтобы исключить трек. Исполнитель скрывается автоматически
        после {thresholds.artist} нелюбимых треков, жанр — после {thresholds.genre}. Любое правило можно изменить вручную.
      </p>
    </div>
  );
}
