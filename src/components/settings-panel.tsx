"use client";

import { Check, Download, ExternalLink, Globe2, Headphones, ImagePlus, Palette, RotateCcw, Search, Settings2, Smartphone, Sun, Moon, Type } from "lucide-react";
import { useEffect, useState } from "react";
import { isNativeApp, nativeStats, openNativeOfflineLibrary } from "@/lib/native";
import { useRef } from "react";
import { WAVE_ICON, type AppPreferences, type SearchPlatform, type ThemeMode } from "@/lib/preferences";

const EMOJI_OPTIONS = ["🎧", "♫", "✦", "🎵", "🔊"];

type Props = {
  preferences: AppPreferences;
  onChange: (preferences: AppPreferences) => void;
  soundcloudApiConfigured: boolean | null;
  onReset: () => void;
};

export default function SettingsPanel({ preferences, onChange, soundcloudApiConfigured, onReset }: Props) {
  const imageRef = useRef<HTMLInputElement>(null);
  const [inApp, setInApp] = useState(false);
  const [appStats, setAppStats] = useState<{ favorites: number; history: number; playlists: number; files: number } | null>(null);

  useEffect(() => {
    setInApp(isNativeApp());
    setAppStats(nativeStats());
  }, []);
  const set = (patch: Partial<AppPreferences>) => onChange({ ...preferences, ...patch });
  const setColor = (key: keyof AppPreferences["colors"], color: string) => {
    onChange({ ...preferences, colors: { ...preferences.colors, [key]: color } });
  };
  const changeIconFile = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 1 * 1024 * 1024) {
      window.alert("Выберите изображение размером до 1 МБ.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set({ iconDataUrl: typeof reader.result === "string" ? reader.result : "" });
    reader.readAsDataURL(file);
  };

  const themes: { value: ThemeMode; title: string; description: string; icon: typeof Sun }[] = [
    { value: "light", title: "Светлая", description: "Чистая и воздушная", icon: Sun },
    { value: "dark", title: "Тёмная", description: "Комфорт для глаз", icon: Moon },
    { value: "custom", title: "Своя тема", description: "Ваши цвета и фон", icon: Palette },
  ];

  const platforms: { value: SearchPlatform; title: string; subtitle: string; icon: typeof Search }[] = [
    { value: "hitmos", title: "Hitmos", subtitle: "hitmos.me · Поиск и MP3", icon: Headphones },
    { value: "soundcloud", title: "SoundCloud", subtitle: "soundcloud.com · Оригинальный плеер", icon: Globe2 },
  ];

  const customColors: { key: keyof AppPreferences["colors"]; label: string; description: string }[] = [
    { key: "accent", label: "Основной акцент", description: "Кнопки и интерактивные элементы" },
    { key: "background", label: "Фон страницы", description: "Общее оформление рабочей области" },
    { key: "surface", label: "Фон карточек", description: "Панели, карточки и боковое меню" },
    { key: "text", label: "Основной текст", description: "Заголовки и подписи" },
    { key: "muted", label: "Вторичный текст", description: "Подсказки и вспомогательные подписи" },
    { key: "border", label: "Границы", description: "Разделители и контуры карточек" },
  ];

  return (
    <div className="settings-page">
      <div className="page-heading settings-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> ВАШЕ ПРОСТРАНСТВО</div>
          <h1>Настройки <span className="welcome-sparkle">✳</span></h1>
          <p>Настройте внешний вид и выберите музыкальную площадку для поиска.</p>
        </div>
        <button type="button" className="settings-reset" onClick={onReset}><RotateCcw size={15} /> Сбросить настройки</button>
      </div>

      <section className="settings-card">
        <div className="settings-card-heading">
          <span className="settings-section-icon"><Type size={18} /></span>
          <div><h2>Название и иконка</h2><p>Персонализируйте название сайта и значок во вкладке браузера.</p></div>
        </div>
        <div className="identity-settings">
          <label className="settings-field site-name-field">
            <span>Название сайта</span>
            <input aria-label="Название сайта" maxLength={40} value={preferences.siteName} onChange={(event) => set({ siteName: event.target.value.slice(0, 40) })} placeholder="Например, volna" />
            <small>Будет отображаться в логотипе и заголовке вкладки.</small>
          </label>
          <div className="settings-field">
            <span>Иконка сайта</span>
            <div className="icon-choice-row">
              <div className="favicon-preview" aria-label="Предпросмотр иконки">
                {preferences.iconDataUrl ? <img src={preferences.iconDataUrl} alt="Иконка сайта" /> : preferences.iconEmoji ? <span>{preferences.iconEmoji}</span> : <img src={WAVE_ICON} alt="Иконка волны" className="wave-logo-img" />}
              </div>
              <div className="icon-options">
                <div className="emoji-options" aria-label="Готовые иконки">
                  <button type="button" className={`emoji-option icon-wave-option ${!preferences.iconDataUrl && !preferences.iconEmoji ? "selected" : ""}`} aria-label="Выбрать иконку волны" title="Волна" onClick={() => set({ iconEmoji: "", iconDataUrl: "" })}><img src={WAVE_ICON} alt="" className="wave-logo-img" />{!preferences.iconDataUrl && !preferences.iconEmoji && <Check size={11} />}</button>
                  {EMOJI_OPTIONS.map((emoji) => <button type="button" key={emoji} className={`emoji-option ${!preferences.iconDataUrl && preferences.iconEmoji === emoji ? "selected" : ""}`} aria-label={`Выбрать значок ${emoji}`} onClick={() => set({ iconEmoji: emoji, iconDataUrl: "" })}>{emoji}{!preferences.iconDataUrl && preferences.iconEmoji === emoji && <Check size={11} />}</button>)}
                </div>
                <button type="button" className="upload-icon-button" onClick={() => imageRef.current?.click()}><ImagePlus size={15} /> Загрузить своё изображение</button>
                <input ref={imageRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="visually-hidden" onChange={(event) => changeIconFile(event.target.files?.[0])} />
              </div>
            </div>
            <small>Выберите значок или загрузите PNG, JPG, WebP или SVG (до 1 МБ).</small>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-heading">
          <span className="settings-section-icon"><Palette size={18} /></span>
          <div><h2>Тема оформления</h2><p>Светлая, тёмная или полностью настроенная цветовая палитра.</p></div>
        </div>
        <div className="theme-options">
          {themes.map(({ value, title, description, icon: Icon }) => <button type="button" key={value} className={`theme-option ${preferences.theme === value ? "selected" : ""}`} onClick={() => set({ theme: value })} aria-pressed={preferences.theme === value}><span className="theme-option-icon"><Icon size={19} /></span><span className="theme-option-copy"><strong>{title}</strong><small>{description}</small></span><span className="theme-radio">{preferences.theme === value && <i />}</span></button>)}
        </div>
        {preferences.theme === "custom" && <div className="custom-theme-panel">
          <div className="custom-theme-base"><div><strong>Основа своей темы</strong><small>Выберите светлый или тёмный режим, а затем задайте свои цвета.</small></div><div className="base-toggle" role="group" aria-label="Светлая или тёмная основа"><button type="button" className={preferences.customBase === "light" ? "active" : ""} onClick={() => set({ customBase: "light" })}><Sun size={14} /> Светлая</button><button type="button" className={preferences.customBase === "dark" ? "active" : ""} onClick={() => set({ customBase: "dark" })}><Moon size={14} /> Тёмная</button></div></div>
          <div className="custom-color-grid">{customColors.map(({ key, label, description }) => <label className="color-setting" key={key}><span className="color-swatch" style={{ backgroundColor: preferences.colors[key] }}><input aria-label={label} type="color" value={preferences.colors[key]} onChange={(event) => setColor(key, event.target.value)} /></span><span className="color-copy"><strong>{label}</strong><small>{description}</small></span><code>{preferences.colors[key].toUpperCase()}</code></label>)}</div>
          <button type="button" className="palette-reset" onClick={() => set({ colors: { accent: "#7657ed", background: preferences.customBase === "dark" ? "#171722" : "#f8f8fb", surface: preferences.customBase === "dark" ? "#20202e" : "#ffffff", text: preferences.customBase === "dark" ? "#f1f0f7" : "#252637", muted: preferences.customBase === "dark" ? "#aaa8bb" : "#9293a5", border: preferences.customBase === "dark" ? "#353544" : "#efeff4" } })}><RotateCcw size={13} /> Вернуть рекомендуемые цвета</button>
        </div>}
      </section>

      <section className="settings-card apk-card">
        <div className="settings-card-heading">
          <span className="settings-section-icon"><Smartphone size={18} /></span>
          <div><h2>Android-приложение</h2><p>Настоящее APK-приложение: работает офлайн, играет музыку в фоне и управляется из уведомлений.</p></div>
        </div>
        <div className="apk-panel">
          <div className="apk-panel-info">
            <strong>volna для Android · версия 1.1</strong>
            <ul>
              <li>офлайн: любимые треки, прослушанное и сохранённые плейлисты</li>
              <li>фоновое воспроизведение и уведомление с кнопками: назад, пауза, вперёд, зацикливание</li>
              <li>треки сохраняются в память устройства, прослушанное — в кэш</li>
              <li>при подключении к интернету доступны поиск, рекомендации и весь сайт</li>
            </ul>
          </div>
          <div className="apk-panel-actions">
            <a className="solid-button apk-download" href="/download/volna-offline-1.1.apk" download="volna-offline-1.1.apk">
              <Download size={16} /> Скачать APK
            </a>
            {inApp && (
              <button type="button" className="solid-button outline-download" onClick={openNativeOfflineLibrary}>
                <Smartphone size={16} /> Открыть офлайн-медиатеку
              </button>
            )}
            <small>Файл ~35 КБ · подписан, устанавливается сразу, без компиляции</small>
            <small>На Android разрешите установку из неизвестных источников. В приложении можно изменить адрес сайта, если он сменился.</small>
          </div>
        </div>
        {inApp && appStats && (
          <p className="apk-inapp-note">
            <Check size={14} /> Вы в приложении: в памяти устройства {appStats.favorites} любимых, {appStats.history} прослушанных, {appStats.playlists} плейлистов, {appStats.files} аудиофайлов.
          </p>
        )}
      </section>

      <section className="settings-card">
        <div className="settings-card-heading">
          <span className="settings-section-icon"><Globe2 size={18} /></span>
          <div><h2>Площадка для поиска</h2><p>Выберите, где искать музыку. Предпочтение сохранится на этом устройстве.</p></div>
        </div>
        <div className="platform-options">
          {platforms.map(({ value, title, subtitle, icon: Icon }) => <button type="button" key={value} className={`platform-option ${preferences.searchPlatform === value ? "selected" : ""}`} onClick={() => set({ searchPlatform: value })} aria-pressed={preferences.searchPlatform === value}><span className={`platform-brand-icon ${value}`}><Icon size={20} /></span><span className="platform-copy"><strong>{title}</strong><small>{subtitle}</small></span><span className="theme-radio">{preferences.searchPlatform === value && <i />}</span></button>)}
        </div>
        {preferences.searchPlatform === "soundcloud" && <div className={`soundcloud-status ${soundcloudApiConfigured ? "configured" : ""}`}><span className="soundcloud-status-dot" /><div><strong>{soundcloudApiConfigured ? "SoundCloud API подключён" : "SoundCloud доступен в режиме официального сайта"}</strong><p>{soundcloudApiConfigured ? "Можно искать треки здесь. Воспроизведение открывается во встроенном официальном плеере SoundCloud." : "Можно открывать поиск SoundCloud напрямую или вставить ссылку на трек в строку поиска — он откроется во встроенном плеере. Для списка результатов прямо на этом сайте SoundCloud требует ключ приложения."}</p><a href="https://m.soundcloud.com" target="_blank" rel="noreferrer"><ExternalLink size={14} /> Открыть SoundCloud</a></div></div>}
        <div className="settings-platform-footnote"><Settings2 size={14} /><span>Площадку также можно переключить на странице поиска. Любимые треки и плейлисты остаются общими для обеих площадок.</span></div>
      </section>

      <div className="settings-saved-note"><Check size={15} /> Все изменения сохраняются автоматически в этом браузере.</div>
    </div>
  );
}
