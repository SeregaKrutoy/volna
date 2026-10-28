"use client";

import {
  ArrowRight,
  AudioLines,
  Check,
  ChevronRight,
  CloudUpload,
  ExternalLink,
  FileAudio,
  FolderOpen,
  FolderSync,
  FolderDown,
  Download,
  Globe2,
  HardDrive,
  Headphones,
  Heart,
  HeartCrack,
  History,
  House,
  LibraryBig,
  ListMusic,
  ListPlus,
  LoaderCircle,
  Menu,
  Music2,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Repeat,
  Repeat1,
  Search,
  Settings,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  User,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  buildLocalTrackFromFile,
  deleteLocalRecord,
  extractFilesFromDataTransfer,
  getLocalRecord,
  getLocalRecords,
  getSavedDirectoryHandle,
  isAudioFile,
  saveDirectoryHandle,
  saveLocalRecordsBatch,
  scanDirectoryHandleRecursive,
  type LocalRecord,
  type ScannedAudioFile,
} from "@/lib/local-library";
import { featuredTracks, formatTime, moods, type Playlist, type Track } from "@/lib/music";
import { Artwork, TrackTable } from "@/components/track-table";
import SettingsPanel from "@/components/settings-panel";
import SoundCloudPlayer, { type SoundCloudControls } from "@/components/soundcloud-player";
import RecommendationsView from "@/components/recommendations-view";
import DislikesView, { type ExclusionItem } from "@/components/dislikes-view";
import ProfileView from "@/components/profile-view";
import CopyLinksButton from "@/components/copy-links-button";
import ShareImportModal from "@/components/share-import-modal";
import { computeFingerprint } from "@/lib/fingerprint";
import {
  cacheTrackOffline,
  getNativeDeviceLibrary,
  getNativePlaybackStatus,
  isNativeApp,
  keepNativePlaybackAlive,
  nativeBridge,
  openNativeOfflineLibrary,
  playNativeQueue,
  savePlaylistOffline,
  setMediaPlaybackState,
  setNativeLoopMode,
  syncNativeLibrary,
  updateMediaSession,
} from "@/lib/native";
import { getGreeting } from "@/lib/greetings";
import type { SoundCloudPlaylistInfo } from "@/lib/soundcloud-public";
import {
  defaultPreferences,
  normalizePreferences,
  PREFERENCES_STORAGE_KEY,
  WAVE_ICON,
  type AppPreferences,
  type SearchPlatform,
} from "@/lib/preferences";

type View = {
  kind: "home" | "search" | "library" | "favorites" | "playlist" | "settings" | "recommendations" | "history" | "disliked" | "profile";
  id?: string;
};

type HistoryEntry = Track & { playedAt: string; playCount: number };

type ShareSnapshotTrack = {
  title: string;
  artist: string;
  album: string;
  duration: number;
  url: string | null;
  artwork: string;
  source: string;
};

type ShareState = {
  open: boolean;
  loading: boolean;
  error: string;
  name: string;
  url: string;
  tracks: ShareSnapshotTrack[];
  qrLinks: string;
  qrPage: string;
  qrMode: "links" | "page";
  linksText: string;
  linkCount: number;
  missingCount: number;
};

function pluralTracks(count: number) {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "треков";
  if (count % 10 === 1) return "трек";
  if (count % 10 >= 2 && count % 10 <= 4) return "трека";
  return "треков";
}

function isExperimentalTrack(track: Track) {
  return Boolean(track.recommendationReason?.trim().startsWith("🧪"));
}

export default function MusicApp() {
  const [view, setView] = useState<View>({ kind: "home" });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [nativeApp, setNativeApp] = useState(false);
  const [offlineSaving, setOfflineSaving] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [localRecords, setLocalRecords] = useState<LocalRecord[]>([]);
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);
  const [profileFingerprint, setProfileFingerprint] = useState("");
  const [scannedDirs, setScannedDirs] = useState<string[]>([]);
  const [connectedFolderName, setConnectedFolderName] = useState<string>("");
  const [homeTracks, setHomeTracks] = useState<Track[]>(featuredTracks);
  const [query, setQuery] = useState("");
  const [searchLabel, setSearchLabel] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [current, setCurrent] = useState<Track>(featuredTracks[0]);
  const [queue, setQueue] = useState<Track[]>(featuredTracks);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(featuredTracks[0].duration);
  const [volume, setVolume] = useState(0.72);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "playlist" | "track">("off");
  const [importing, setImporting] = useState(false);
  const [scanningDevice, setScanningDevice] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState("");
  const [trackToAdd, setTrackToAdd] = useState<Track | null>(null);
  const [creating, setCreating] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [saving, setSaving] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [share, setShare] = useState<ShareState>({
    open: false,
    loading: false,
    error: "",
    name: "",
    url: "",
    tracks: [],
    qrLinks: "",
    qrPage: "",
    qrMode: "links",
    linksText: "",
    linkCount: 0,
    missingCount: 0,
  });
  const [shareQrView, setShareQrView] = useState<"links" | "page">("links");
  const [shareImportLink, setShareImportLink] = useState("");
  const [shareImportLoading, setShareImportLoading] = useState(false);
  const [shareImportOpen, setShareImportOpen] = useState(false);
  const [greeting, setGreeting] = useState({ title: "Привет, меломан", subtitle: "Включайте любимые треки." });
  const [likeOverrides, setLikeOverrides] = useState<Record<string, boolean>>({});
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [soundcloudApiConfigured, setSoundcloudApiConfigured] = useState<boolean | null>(null);
  const [soundcloudExternalOnly, setSoundcloudExternalOnly] = useState(false);
  const [soundcloudSearchUrl, setSoundcloudSearchUrl] = useState("");
  const [soundcloudPlaylist, setSoundcloudPlaylist] = useState<SoundCloudPlaylistInfo | null>(null);
  const [soundcloudPlayingTrack, setSoundCloudPlayingTrack] = useState<Track | null>(null);
  const [soundcloudDockExpanded, setSoundcloudDockExpanded] = useState(false);

  // Состояние умных рекомендаций
  const [recommendations, setRecommendations] = useState<Track[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationMode, setRecommendationMode] = useState<"favorites" | "similar" | "mood">("favorites");
  const [continuationLoading, setContinuationLoading] = useState(false);
  const [recommendationSeedTrack, setRecommendationSeedTrack] = useState<Track | null>(null);
  const [recommendationMood, setRecommendationMood] = useState<string>("chill");
  const [recommendationTitle, setRecommendationTitle] = useState("Моя умная волна");
  const [recommendationSummary, setRecommendationSummary] = useState(
    "Анализ вашей медиатеки и любимых композиций"
  );
  const [recommendationFactors, setRecommendationFactors] = useState<
    { genres: { slug: string; name: string }[]; avgDuration: number; language: string; artists: string[] }
  >({ genres: [], avgDuration: 0, language: "mix", artists: [] });
  const [experimentalPercent, setExperimentalPercent] = useState(15);
  const [experimentalCount, setExperimentalCount] = useState(0);

  // История прослушиваний
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const lastRecordedId = useRef("");

  // «Не рекомендовать»
  const [dislikedTracks, setDislikedTracks] = useState<Track[]>([]);
  const [dislikeArtists, setDislikeArtists] = useState<ExclusionItem[]>([]);
  const [dislikeGenres, setDislikeGenres] = useState<ExclusionItem[]>([]);
  const [dislikeThresholds, setDislikeThresholds] = useState({ artist: 3, genre: 4 });
  const [dislikeLoading, setDislikeLoading] = useState(false);


  const soundcloudPlayerRef = useRef<SoundCloudControls>(null);
  const expReloadTimer = useRef<number | null>(null);
  const recoContinuation = useRef<{
    seeds: Track[];
    nextIndex: number;
    seen: Set<string>;
    mode: "favorites" | "similar" | "mood";
    mood: string;
    customMoodText?: string;
    experimentalPercent: number;
    active: boolean;
  } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const wantsPlay = useRef(false);
  const searchSequence = useRef(0);
  const togglePlaybackRef = useRef<() => void>(() => undefined);
  const skipRef = useRef<(direction: 1 | -1) => void>(() => undefined);

  useEffect(() => {
    setProfileFingerprint(computeFingerprint());
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
      if (stored) setPreferences(normalizePreferences(JSON.parse(stored)));
    } catch {
      // Use the default preferences when local storage is unavailable.
    }
    setPreferencesLoaded(true);
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    try {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Keep the current preferences for this session if storage is full or disabled.
    }
    const cleanName = preferences.siteName.trim() || "volna";
    document.title = `${cleanName} — музыка в вашем ритме`;
    let favicon = document.querySelector<HTMLLinkElement>("link[data-volna-favicon]");
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      favicon.setAttribute("data-volna-favicon", "true");
      document.head.appendChild(favicon);
    }
    if (preferences.iconDataUrl) {
      favicon.href = preferences.iconDataUrl;
    } else if (preferences.iconEmoji) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="19" fill="${preferences.colors.accent}"/><text x="32" y="44" text-anchor="middle" font-size="38">${preferences.iconEmoji}</text></svg>`;
      favicon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    } else {
      favicon.href = WAVE_ICON;
    }
    let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeColor) {
      themeColor = document.createElement("meta");
      themeColor.name = "theme-color";
      document.head.appendChild(themeColor);
    }
    themeColor.content = preferences.theme === "dark" || (preferences.theme === "custom" && preferences.customBase === "dark") ? "#171722" : preferences.theme === "custom" ? preferences.colors.background : "#f8f8fb";
  }, [preferences, preferencesLoaded]);

  useEffect(() => {
    if (folderRef.current) {
      folderRef.current.setAttribute("webkitdirectory", "");
      folderRef.current.setAttribute("directory", "");
    }
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((value) => (value === message ? "" : value)), 3600);
  }, []);

  const refreshPlaylists = useCallback(async () => {
    const response = await fetch("/api/playlists", { cache: "no-store" });
    if (!response.ok) throw new Error("Не удалось загрузить плейлисты");
    const data: { playlists: Playlist[] } = await response.json();
    setPlaylists(data.playlists);
  }, []);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/history", { cache: "no-store" });
      if (response.ok) {
        const data: { tracks?: HistoryEntry[] } = await response.json();
        setHistory(data.tracks || []);
      }
    } catch {
      // Не прерываем воспроизведение, если история временно недоступна.
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const refreshDislikes = useCallback(async () => {
    setDislikeLoading(true);
    try {
      const response = await fetch("/api/dislikes", { cache: "no-store" });
      if (response.ok) {
        const data: {
          tracks?: Track[];
          artists?: ExclusionItem[];
          genres?: ExclusionItem[];
          thresholds?: { artist: number; genre: number };
        } = await response.json();
        setDislikedTracks(data.tracks || []);
        setDislikeArtists(data.artists || []);
        setDislikeGenres(data.genres || []);
        if (data.thresholds) setDislikeThresholds(data.thresholds);
      }
    } catch {
      // Список дизлайков не критичен для воспроизведения
    } finally {
      setDislikeLoading(false);
    }
  }, []);

  const dislikeTrack = useCallback(
    async (track: Track) => {
      if (track.source === "local" && !localRecords.some((record) => record.id === track.id)) {
        notify("Локальный файл можно исключить только на устройстве, где он добавлен");
      }
      try {
        const response = await fetch("/api/dislikes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track }),
        });
        if (!response.ok) throw new Error();
        setDislikedTracks((prev) => [track, ...prev.filter((t) => t.id !== track.id)]);
        await refreshDislikes();
        notify("Трек добавлен в «Не рекомендовать» и больше не появится в волне");
      } catch {
        notify("Не удалось добавить трек в «Не рекомендовать»");
      }
    },
    [localRecords, notify, refreshDislikes]
  );

  const restoreDisliked = useCallback(
    async (track: Track) => {
      try {
        const response = await fetch(`/api/dislikes?trackId=${encodeURIComponent(track.id)}`, { method: "DELETE" });
        if (!response.ok) throw new Error();
        setDislikedTracks((prev) => prev.filter((t) => t.id !== track.id));
        await refreshDislikes();
        notify("Трек снова может попадать в рекомендации");
      } catch {
        notify("Не удалось вернуть трек");
      }
    },
    [notify, refreshDislikes]
  );

  const clearDislikes = useCallback(async () => {
    if (!window.confirm("Очистить список «Не рекомендовать» и все правила?")) return;
    try {
      const response = await fetch("/api/dislikes", { method: "DELETE" });
      if (!response.ok) throw new Error();
      setDislikedTracks([]);
      await refreshDislikes();
      notify("Список «Не рекомендовать» очищен");
    } catch {
      notify("Не удалось очистить список");
    }
  }, [notify, refreshDislikes]);

  const changeDislikeRule = useCallback(
    async (kind: "artist" | "genre", value: string, label: string, action: "block" | "allow" | "auto") => {
      try {
        const response = await fetch("/api/dislikes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, value, label, action }),
        });
        if (!response.ok) throw new Error();
        await refreshDislikes();
        notify(
          action === "allow"
            ? `Снова рекомендуем: ${label}`
            : action === "block"
              ? `Больше не рекомендуем: ${label}`
              : `Правило для ${label} возвращено к автоматике`
        );
      } catch {
        notify("Не удалось изменить правило");
      }
    },
    [notify, refreshDislikes]
  );

  const recordPlay = useCallback(async (track: Track) => {
    setHistory((previous) => {
      const existing = previous.find((item) => item.id === track.id);
      const rest = previous.filter((item) => item.id !== track.id);
      return [
        {
          ...track,
          playedAt: new Date().toISOString(),
          playCount: (existing?.playCount || 0) + 1,
        },
        ...rest,
      ].slice(0, 100);
    });
    try {
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track }),
      });
    } catch {
      // Локальная история уже обновлена.
    }
  }, []);

  const clearHistory = useCallback(async () => {
    if (!window.confirm("Очистить всю историю прослушиваний?")) return;
    try {
      const response = await fetch("/api/history", { method: "DELETE" });
      if (!response.ok) throw new Error();
      setHistory([]);
      notify("История прослушиваний очищена");
    } catch {
      notify("Не удалось очистить историю");
    }
  }, [notify]);

  const removeHistoryEntry = useCallback(
    async (track: Track) => {
      try {
        const response = await fetch(`/api/history?trackId=${encodeURIComponent(track.id)}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error();
        setHistory((previous) => previous.filter((item) => item.id !== track.id));
        notify("Трек удалён из истории");
      } catch {
        notify("Не удалось удалить трек из истории");
      }
    },
    [notify]
  );

  const importScannedAudioFiles = useCallback(
    async (scannedFiles: ScannedAudioFile[], switchToLibrary = true, silent = false) => {
      if (!scannedFiles.length) {
        if (!silent) notify("В выбранной папке аудиофайлы не найдены");
        return 0;
      }
      setImporting(true);
      try {
        const records = scannedFiles.map((file) => buildLocalTrackFromFile(file, profileFingerprint));
        await saveLocalRecordsBatch(records);
        const allSaved = await getLocalRecords();
        setLocalRecords(allSaved);
        if (switchToLibrary) {
          setView({ kind: "library" });
        }
        if (!silent) {
          notify(`Автоматически добавлено: ${records.length} ${pluralTracks(records.length)}`);
        }
        return records.length;
      } catch {
        const allSaved = await getLocalRecords().catch(() => []);
        setLocalRecords(allSaved);
        if (!silent) {
          notify("Не удалось сохранить часть файлов. Проверьте свободное место в браузере.");
        }
        return 0;
      } finally {
        setImporting(false);
        if (fileRef.current) fileRef.current.value = "";
        if (folderRef.current) folderRef.current.value = "";
      }
    },
    [notify, profileFingerprint],
  );

  const refreshLibrary = useCallback(async () => {
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      if (response.ok) {
        const data: { tracks?: Track[] } = await response.json();
        setLibraryTracks(data.tracks || []);
      }
    } catch {
      // Локальная медиатека остаётся доступной
    }
  }, []);

  const autoScanDeviceFolders = useCallback(
    async (showMessage = false) => {
      setScanningDevice(true);
      try {
        const res = await fetch("/api/device-music?sync=1", { cache: "no-store" });
        let serverCount = 0;
        if (res.ok) {
          const data: { tracks?: Track[]; scannedDirs?: string[]; saved?: number } = await res.json();
          setScannedDirs(data.scannedDirs || []);
          serverCount = data.saved || 0;
        }
        await refreshLibrary();

        let folderCount = 0;
        const savedHandle = await getSavedDirectoryHandle();
        if (savedHandle?.handle) {
          setConnectedFolderName(savedHandle.name);
          const handleWithPerm = savedHandle.handle as FileSystemDirectoryHandle & {
            queryPermission?: (opts: { mode: "read" }) => Promise<PermissionState>;
          };
          if (typeof handleWithPerm.queryPermission === "function") {
            const perm = await handleWithPerm.queryPermission({ mode: "read" }).catch(() => "prompt");
            if (perm === "granted") {
              const scanned = await scanDirectoryHandleRecursive(savedHandle.handle);
              if (scanned.length > 0) {
                folderCount = await importScannedAudioFiles(scanned, false, true);
              }
            }
          }
        }

        if (showMessage) {
          const total = serverCount + folderCount;
          notify(
            total > 0
              ? `Медиатека синхронизирована: добавлено ${total} ${pluralTracks(total)}`
              : "Новых файлов не найдено. Подключите папку с музыкой.",
          );
        }
      } catch {
        if (showMessage) notify("Не удалось просканировать папки устройства");
      } finally {
        setScanningDevice(false);
      }
    },
    [importScannedAudioFiles, notify, refreshLibrary],
  );

  useEffect(() => {
    if (view.kind !== "settings" || preferences.searchPlatform !== "soundcloud" || soundcloudApiConfigured !== null) return;
    fetch("/api/soundcloud/search")
      .then((response) => response.json())
      .then((data: { configured?: boolean }) => setSoundcloudApiConfigured(Boolean(data.configured)))
      .catch(() => setSoundcloudApiConfigured(false));
  }, [view.kind, preferences.searchPlatform, soundcloudApiConfigured]);

  useEffect(() => {
    refreshPlaylists().catch(() => notify("Не удалось загрузить плейлисты"));
    refreshHistory();
    refreshDislikes();
    try {
      const storedPercent = Number(window.localStorage.getItem("volna-experimental-percent"));
      if (Number.isFinite(storedPercent) && storedPercent >= 0 && storedPercent <= 30) {
        setExperimentalPercent(storedPercent);
      }
    } catch {
      // localStorage может быть недоступен
    }
    getLocalRecords()
      .then(setLocalRecords)
      .catch(() => undefined);
    void refreshLibrary();
    setGreeting(getGreeting());
    setNativeApp(isNativeApp());
    // Новый профиль начинает с пустой медиатекой: сканирование запускается только по команде.
    // Load live top tracks from Hitmos
    fetch("/api/search?q=top")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { tracks?: Track[] } | null) => {
        if (data?.tracks?.length) {
          setHomeTracks(data.tracks.slice(0, 12));
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // В APK показываем реальные аудиофайлы Android в «Моей медиатеке»
  useEffect(() => {
    if (!nativeApp) return;
    let attempts = 0;
    const load = () => {
      const tracks = getNativeDeviceLibrary(false);
      if (tracks.length > 0) setLibraryTracks(tracks);
      attempts++;
      if (tracks.length > 0 || attempts >= 8) window.clearInterval(timer);
    };
    const timer = window.setInterval(load, 1800);
    load();
    return () => window.clearInterval(timer);
  }, [nativeApp]);

  // Записываем трек в «Прослушанное» в момент реального старта воспроизведения
  useEffect(() => {
    if (!playing || !current?.id) return;
    if (lastRecordedId.current === current.id) return;
    lastRecordedId.current = current.id;
    void recordPlay(current);
  }, [playing, current, recordPlay]);

  // Уведомление Android: сохраняем прослушанный трек в кэш устройства
  useEffect(() => {
    if (!current?.id) return;
    if (typeof window === "undefined") return;
    void cacheTrackOffline(current, window.location.origin);
  }, [current]);

  // Медиасессия браузера: метаданные и кнопки на экране блокировки
  useEffect(() => {
    if (!current?.id) return;
    updateMediaSession(current, {
      onPlay: () => togglePlaybackRef.current(),
      onPause: () => togglePlaybackRef.current(),
      onNext: () => skipRef.current(1),
      onPrevious: () => skipRef.current(-1),
    });
  }, [current]);

  useEffect(() => {
    setMediaPlaybackState(playing);
  }, [playing]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const player = audio;
    let cancelled = false;
    let objectUrl = "";
    setElapsed(0);
    setDuration(current.duration || 0);

    async function load() {
      if (nativeApp && current.source !== "soundcloud" && current.source !== "local") {
        player.pause();
        player.removeAttribute("src");
        player.load();
        return;
      }
      if (current.source === "soundcloud") {
        player.pause();
        player.removeAttribute("src");
        player.load();
        return;
      }
      let src = current.audioUrl;
      if (current.source === "archive" && current.archiveId && current.fileName) {
        src = `/api/stream?id=${encodeURIComponent(current.archiveId)}&file=${encodeURIComponent(current.fileName)}`;
      } else if (current.source === "hitmos" && !src.startsWith("/api/stream")) {
        const rawStream = current.streamUrl || current.audioUrl;
        src = `/api/stream?url=${encodeURIComponent(rawStream)}&songId=${encodeURIComponent(current.archiveId || "")}`;
      } else if (current.source === "local") {
        const record = await getLocalRecord(current.id).catch(() => undefined);
        if (!record) {
          if (wantsPlay.current && !cancelled) {
            wantsPlay.current = false;
            notify("Этот файл есть только на устройстве, с которого он был добавлен");
          }
          return;
        }
        objectUrl = URL.createObjectURL(record.file);
        src = objectUrl;
      }

      if (cancelled) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        return;
      }
      player.src = src;
      player.volume = volume;
      player.load();
      if (wantsPlay.current) {
        player.play().catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          wantsPlay.current = false;
          notify("Не удалось воспроизвести трек. Попробуйте другой.");
        });
      }
    }

    load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // A new source is loaded only when the selected track changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, nativeApp, notify]);

  const favorites = playlists.find((playlist) => playlist.isSystem);
  const customPlaylists = playlists.filter((playlist) => !playlist.isSystem);
  const activePlaylist = playlists.find((playlist) => playlist.id === view.id);
  const likedIds = useMemo(() => {
    const ids = new Set((favorites?.tracks || []).map((track) => track.id));
    for (const [trackId, liked] of Object.entries(likeOverrides)) {
      if (liked) ids.add(trackId);
      else ids.delete(trackId);
    }
    return ids;
  }, [favorites, likeOverrides]);
  const localIds = useMemo(
    () => new Set(localRecords.map((record) => record.id)),
    [localRecords],
  );
  const dislikedIds = useMemo(() => new Set(dislikedTracks.map((track) => track.id)), [dislikedTracks]);

  // Combine browser-scanned local tracks and server-scanned device tracks without duplicates
  const allLibraryTracks = useMemo(() => {
    const localList = localRecords
      .filter((record) => record.profileId === profileFingerprint)
      .map((record) => record.track);
    const seenNames = new Set(
      localList.map((t) => `${t.artist.toLowerCase()}::${t.title.toLowerCase()}`),
    );
    const merged = [...localList];
    for (const libraryTrack of libraryTracks) {
      const key = `${libraryTrack.artist.toLowerCase()}::${libraryTrack.title.toLowerCase()}`;
      if (!seenNames.has(key)) {
        seenNames.add(key);
        merged.push(libraryTrack);
      }
    }
    return merged;
  }, [localRecords, libraryTracks, profileFingerprint]);

  // Синхронизация интерфейса с нативным фоновым сервисом APK
  useEffect(() => {
    if (!nativeApp) return;
    const timer = window.setInterval(() => {
      const status = getNativePlaybackStatus();
      if (!status?.active) return;
      setPlaying(Boolean(status.playing));
      if (typeof status.position === "number") setElapsed(status.position / 1000);
      if (typeof status.duration === "number" && status.duration > 0) setDuration(status.duration / 1000);
      if (typeof status.loopMode === "number") {
        setRepeatMode(status.loopMode === 2 ? "track" : status.loopMode === 1 ? "playlist" : "off");
      }
      if (status.trackId && status.trackId !== current.id) {
        const track = queue.find((item) => item.id === status.trackId);
        if (track) setCurrent(track);
      }
    }, 750);
    return () => window.clearInterval(timer);
  }, [nativeApp, queue, current.id]);

  const togglePlayback = () => {
    if (nativeApp && current.source !== "soundcloud" && current.source !== "local") {
      nativeBridge()?.pause?.();
      setPlaying((value) => !value);
      return;
    }
    if (current.source === "soundcloud") {
      if (!soundcloudPlayingTrack) {
        setSoundCloudPlayingTrack(current);
      } else if (playing) {
        soundcloudPlayerRef.current?.pause();
      } else {
        soundcloudPlayerRef.current?.play();
      }
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      wantsPlay.current = false;
      audio.pause();
    } else {
      wantsPlay.current = true;
      if (audio.src) {
        audio.play().catch(() => {
          wantsPlay.current = false;
          notify("Не удалось воспроизвести трек. Попробуйте другой.");
        });
      }
    }
  };

  const playTrack = (track: Track, list: Track[], keepContinuation = false) => {
    if (!keepContinuation) recoContinuation.current = null;
    if (nativeApp && track.source !== "soundcloud" && track.source !== "local") {
      const nativeQueue = list.length ? list : [track];
      const nativeIndex = Math.max(0, nativeQueue.findIndex((item) => item.id === track.id));
      audioRef.current?.pause();
      setSoundCloudPlayingTrack(null);
      setQueue(nativeQueue);
      setCurrent(track);
      setElapsed(0);
      setDuration(track.duration || 0);
      setPlaying(true);
      playNativeQueue(nativeQueue, nativeIndex, window.location.origin);
      keepNativePlaybackAlive();
      return;
    }
    if (track.source === "soundcloud") {
      setQueue(list.length ? list : [track]);
      if (track.id === current.id && soundcloudPlayingTrack) {
        togglePlayback();
        return;
      }
      wantsPlay.current = false;
      audioRef.current?.pause();
      setPlaying(false);
      setElapsed(0);
      setDuration(track.duration || 0);
      setSoundcloudDockExpanded(false);
      setSoundCloudPlayingTrack(track);
      setCurrent(track);
      return;
    }
    setSoundCloudPlayingTrack(null);
    setSoundcloudDockExpanded(false);
    if (track.source === "local" && !localIds.has(track.id)) {
      notify("Этот файл доступен только на устройстве, с которого он был добавлен");
      return;
    }
    setQueue(list.length ? list : [track]);
    if (track.id === current.id) {
      togglePlayback();
      return;
    }
    wantsPlay.current = true;
    setCurrent(track);
  };

  const skip = (direction: 1 | -1, fromEnd = false) => {
    if (!queue.length) return;
    const audio = audioRef.current;
    if (direction === -1 && elapsed > 3 && !fromEnd) {
      if (current.source === "soundcloud") soundcloudPlayerRef.current?.seekTo(0);
      else if (audio) audio.currentTime = 0;
      return;
    }
    if (nativeApp && current.source !== "soundcloud" && current.source !== "local") {
      const index = Math.max(0, queue.findIndex((track) => track.id === current.id));
      if (direction === 1 && !shuffle && index === queue.length - 1 && recoContinuation.current?.active) {
        void continueRecommendations(true);
        return;
      }
      const nextIndex = direction === 1
        ? (index + 1) % queue.length
        : (index - 1 + queue.length) % queue.length;
      nativeBridge()?.[direction === 1 ? "next" : "previous"]?.();
      setCurrent(queue[nextIndex]);
      setElapsed(0);
      setDuration(queue[nextIndex].duration || 0);
      setPlaying(true);
      return;
    }
    // When only the SoundCloud widget can expose a set, let it navigate its own playlist.
    if (current.source === "soundcloud" && current.album === "Плейлист SoundCloud") {
      if (direction === 1) soundcloudPlayerRef.current?.next();
      else soundcloudPlayerRef.current?.previous();
      return;
    }
    const index = Math.max(0, queue.findIndex((track) => track.id === current.id));
    if (direction === 1 && !shuffle && index === queue.length - 1 && recoContinuation.current?.active) {
      void continueRecommendations(true);
      return;
    }
    let next = (index + direction + queue.length) % queue.length;
    if (shuffle && queue.length > 1 && direction === 1) {
      next = (index + 1 + Math.floor(Math.random() * (queue.length - 1))) % queue.length;
    }
    const track = queue[next];
    if (track.id === current.id) {
      if (track.source === "soundcloud") {
        soundcloudPlayerRef.current?.seekTo(0);
        soundcloudPlayerRef.current?.play();
      } else if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => undefined);
      }
      return;
    }
    setElapsed(0);
    setDuration(track.duration || 0);
    if (track.source === "soundcloud") {
      wantsPlay.current = false;
      audio?.pause();
      setPlaying(false);
      setSoundCloudPlayingTrack(track);
      setCurrent(track);
    } else {
      setSoundCloudPlayingTrack(null);
      wantsPlay.current = true;
      setCurrent(track);
    }
  };

  // Синхронизация избранного и истории в память Android-приложения
  useEffect(() => {
    if (!nativeApp) return;
    const favoriteList = playlists.find((playlist) => playlist.isSystem);
    syncNativeLibrary(favoriteList?.tracks || [], history, window.location.origin);
  }, [nativeApp, playlists, history]);

  togglePlaybackRef.current = togglePlayback;
  skipRef.current = (direction: 1 | -1) => skip(direction);

  const downloadPlaylistOffline = async (name: string, tracks: Track[]) => {
    if (!tracks.length) {
      notify("В плейлисте пока нет треков");
      return;
    }
    setOfflineSaving(true);
    try {
      const result = await savePlaylistOffline(name, tracks, window.location.origin);
      notify(
        result.ok
          ? `Плейлист «${name}» сохранён офлайн: ${result.saved} из ${result.total} треков`
          : "Не удалось сохранить плейлист офлайн",
      );
    } finally {
      setOfflineSaving(false);
    }
  };

  const handleEnded = () => {
    if (repeatMode === "track") {
      if (current.source === "soundcloud") {
        soundcloudPlayerRef.current?.seekTo(0);
        soundcloudPlayerRef.current?.play();
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => undefined);
      }
    } else if (repeatMode === "playlist" || current.source !== "soundcloud" || current.album !== "Плейлист SoundCloud") {
      skip(1, true);
    }
  };

  const runSearch = async (value: string, label?: string, platformOverride?: SearchPlatform) => {
    const term = value.trim();
    const isSoundcloudLink = /^(?:https?:\/\/)?(?:www\.|m\.|on\.)?soundcloud\.com\//i.test(term);
    const searchPlatform: SearchPlatform = isSoundcloudLink ? "soundcloud" : platformOverride || preferences.searchPlatform;
    if (isSoundcloudLink && preferences.searchPlatform !== "soundcloud") setPreferences((prev) => ({ ...prev, searchPlatform: "soundcloud" }));
    if (!term) {
      setView({ kind: "search" });
      searchRef.current?.focus();
      return;
    }
    const sequence = ++searchSequence.current;
    setView({ kind: "search" });
    setQuery(term);
    setSearchLabel(label || term);
    setHasSearched(true);
    setSearchLoading(true);
    setSearchError("");
    setSoundcloudExternalOnly(false);
    setSoundcloudPlaylist(null);
    try {
      const endpoint = searchPlatform === "soundcloud" ? "/api/soundcloud/search" : "/api/search";
      const response = await fetch(`${endpoint}?q=${encodeURIComponent(term)}`);
      const data: {
        tracks?: Track[];
        error?: string;
        configured?: boolean;
        externalOnly?: boolean;
        searchUrl?: string;
        playlist?: SoundCloudPlaylistInfo;
      } = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось выполнить поиск");
      if (sequence === searchSequence.current) {
        setSearchResults(data.tracks || []);
        setSoundcloudApiConfigured(searchPlatform === "soundcloud" ? Boolean(data.configured) : null);
        setSoundcloudExternalOnly(searchPlatform === "soundcloud" && Boolean(data.externalOnly));
        setSoundcloudPlaylist(searchPlatform === "soundcloud" ? data.playlist || null : null);
        setSoundcloudSearchUrl(data.searchUrl || `https://m.soundcloud.com/search?q=${encodeURIComponent(term)}`);
      }
    } catch (error) {
      if (sequence === searchSequence.current) {
        setSearchResults([]);
        setSearchError(error instanceof Error ? error.message : "Ошибка поиска");
      }
    } finally {
      if (sequence === searchSequence.current) setSearchLoading(false);
    }
  };

  const openSearch = () => {
    setView({ kind: "search" });
    window.setTimeout(() => searchRef.current?.focus(), 50);
  };

  const searchArtist = (artist: string, track: Track) => {
    const name = artist.trim();
    if (!name || ["С устройства", "На устройстве", "Неизвестный исполнитель"].includes(name)) {
      notify("У этого трека не указан исполнитель");
      return;
    }
    let platform: SearchPlatform = track.source === "soundcloud" ? "soundcloud" : track.source === "hitmos" ? "hitmos" : preferences.searchPlatform;
    if (platform === "soundcloud" && soundcloudApiConfigured === false) {
      platform = "hitmos";
      notify("Ищем исполнителя в Hitmos: для поиска SoundCloud нужен API-ключ");
    }
    if (platform !== preferences.searchPlatform) setPreferences((prev) => ({ ...prev, searchPlatform: platform }));
    runSearch(name, undefined, platform);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const loadRecommendations = useCallback(
    async (opts?: {
      mode?: "favorites" | "similar" | "mood";
      seedTrack?: Track | null;
      mood?: string;
      customMoodText?: string;
    }) => {
      const targetMode = opts?.mode || recommendationMode;
      const targetSeed =
        opts?.seedTrack !== undefined
          ? opts.seedTrack
          : recommendationSeedTrack || (current ? current : null);
      const targetMood = opts?.mood || recommendationMood;
      const targetCustom = opts?.customMoodText;

      if (opts?.mode) setRecommendationMode(opts.mode);
      if (opts?.seedTrack !== undefined) setRecommendationSeedTrack(opts.seedTrack);
      if (opts?.mood) setRecommendationMood(opts.mood);

      setRecommendationsLoading(true);
      try {
        const userArtists = Array.from(
          new Set(
            allLibraryTracks
              .map((t) => t.artist)
              .filter(
                (a) =>
                  a &&
                  !/^(с устройства|на устройстве|неизвестный|hitmos|soundcloud)$/i.test(a)
              )
          )
        );

        // Взвешенный профиль вкуса: медиатека (2) + история с учётом числа прослушиваний
        const tasteEntries = [
          ...allLibraryTracks.slice(0, 80).map((t) => ({
            artist: t.artist,
            title: t.title,
            duration: t.duration || 0,
            weight: 2,
          })),
          ...history.slice(0, 60).map((h) => ({
            artist: h.artist,
            title: h.title,
            duration: h.duration || 0,
            weight: 1 + Math.min(h.playCount || 1, 6) * 0.4,
          })),
        ];

        const excludeIds = Array.from(likedIds);

        const res = await fetch("/api/recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: targetMode,
            currentTrack: targetSeed
              ? { id: targetSeed.id, title: targetSeed.title, artist: targetSeed.artist }
              : undefined,
            mood: targetMood,
            customMoodText: targetCustom,
            userArtists,
            tasteEntries,
            experimentalPercent,
            excludeIds,
          }),
        });

        if (!res.ok) throw new Error("Не удалось загрузить рекомендации");
        const data = await res.json();
        const initialTracks: Track[] = data.tracks || [];
        setRecommendations(initialTracks);
        const eligibleSeeds = initialTracks.filter((track) => !isExperimentalTrack(track) || likedIds.has(track.id));
        recoContinuation.current = {
          seeds: eligibleSeeds,
          nextIndex: 1,
          seen: new Set(initialTracks.map((track) => track.id)),
          mode: targetMode,
          mood: targetMood,
          customMoodText: targetCustom,
          experimentalPercent,
          active: false,
        };
        if (data.title) setRecommendationTitle(data.title);
        if (data.reasonSummary) setRecommendationSummary(data.reasonSummary);
        if (data.factors) setRecommendationFactors(data.factors);
        setExperimentalCount(data.experimentalCount || 0);
      } catch {
        notify("Не удалось сформировать рекомендации. Попробуйте обновить.");
      } finally {
        setRecommendationsLoading(false);
      }
    },
    [
      recommendationMode,
      recommendationSeedTrack,
      current,
      recommendationMood,
      allLibraryTracks,
      history,
      likedIds,
      experimentalPercent,
      notify,
    ]
  );

  const loadMoreFromRecommendations = useCallback(
    async (
      seedTrack: Track,
      seen: Set<string>,
      continuation: NonNullable<typeof recoContinuation.current>,
    ): Promise<Track[]> => {
      try {
        const tasteEntries = [
          ...allLibraryTracks.slice(0, 80).map((t) => ({
            artist: t.artist,
            title: t.title,
            duration: t.duration || 0,
            weight: 2,
          })),
          ...history.slice(0, 60).map((h) => ({
            artist: h.artist,
            title: h.title,
            duration: h.duration || 0,
            weight: 1 + Math.min(h.playCount || 1, 6) * 0.4,
          })),
        ];
        const response = await fetch("/api/recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: continuation.mode === "mood" ? "mood" : "similar",
            currentTrack: { id: seedTrack.id, title: seedTrack.title, artist: seedTrack.artist },
            mood: continuation.mood,
            customMoodText: continuation.customMoodText,
            tasteEntries,
            experimentalPercent: continuation.mode === "mood" ? 0 : continuation.experimentalPercent,
            excludeIds: [...Array.from(seen), ...Array.from(dislikedIds)],
          }),
        });
        if (!response.ok) return [];
        const data: { tracks?: Track[] } = await response.json();
        return data.tracks || [];
      } catch {
        return [];
      }
    },
    [allLibraryTracks, history, experimentalPercent, likedIds, dislikedIds]
  );

  // Если продолжение вызвано вручную до нажатия «Слушать волну»,
  // инициализируем очередь тем же исходным списком и начинаем со второго трека.
  const continueRecommendations = useCallback(async (switchTrack = false) => {
    if (continuationLoading) return false;
    let continuation = recoContinuation.current;
    if (!continuation && recommendations.length > 0) {
      const seeds = recommendations.filter((track) => !isExperimentalTrack(track) || likedIds.has(track.id));
      continuation = {
        seeds,
        nextIndex: 1,
        seen: new Set(recommendations.map((track) => track.id)),
        mode: recommendationMode,
        mood: recommendationMood,
        experimentalPercent,
        active: false,
      };
      recoContinuation.current = continuation;
    }
    if (!continuation || continuation.seeds.length < 2) {
      notify("Недостаточно треков в волне для продолжения. Обновите рекомендации.");
      return false;
    }

    const waveQueueIsActive = continuation.active;
    continuation.active = true;
    setContinuationLoading(true);
    try {
      // Берём следующую подходящую песню исходного списка. Нелайкнутые
      // экспериментальные треки не могут быть затравкой для новой части волны.
      let appended: Track[] = [];
      let seedTrack: Track | undefined;
      const attempts = Math.min(4, continuation.seeds.length);
      for (let attempt = 0; attempt < attempts; attempt++) {
        if (continuation.nextIndex >= continuation.seeds.length) break;
        const candidate = continuation.seeds[continuation.nextIndex++];
        if (isExperimentalTrack(candidate) && !likedIds.has(candidate.id)) continue;
        seedTrack = candidate;

        const more = await loadMoreFromRecommendations(candidate, continuation.seen, continuation);
        const fresh = more.filter((track) => {
          if (continuation.seen.has(track.id)) return false;
          if (dislikedIds.has(track.id)) return false;
          if (isExperimentalTrack(track) && !likedIds.has(track.id)) return false;
          return true;
        });
        if (fresh.length > 0) {
          appended = fresh;
          break;
        }
      }

      if (appended.length === 0 || !seedTrack) {
        notify("Новые треки закончились. Обновите волну, чтобы продолжить.");
        return false;
      }

      for (const track of appended) continuation.seen.add(track.id);
      // После исходных треков продолжим от ранее найденных, но не повторим уже пройденные id.
      continuation.seeds.push(...appended.filter((track) => !isExperimentalTrack(track) || likedIds.has(track.id)));
      setRecommendations((previous) => {
        const ids = new Set(previous.map((track) => track.id));
        return [...previous, ...appended.filter((track) => !ids.has(track.id))];
      });
      setQueue((previous) => {
        const base = waveQueueIsActive ? previous : [];
        const ids = new Set(base.map((track) => track.id));
        return [...base, ...appended.filter((track) => !ids.has(track.id))];
      });

      // Добавляем треки в очередь. Музыку переключаем только если список
      // действительно закончился (switchTrack = true), иначе текущий трек продолжает играть.
      if (switchTrack) {
        const next = appended[0];
        setElapsed(0);
        setDuration(next.duration || 0);
        if (nativeApp && next.source !== "soundcloud" && next.source !== "local") {
          setSoundCloudPlayingTrack(null);
          setPlaying(true);
          playNativeQueue(appended, 0, window.location.origin);
        } else if (next.source === "soundcloud") {
          wantsPlay.current = false;
          audioRef.current?.pause();
          setPlaying(false);
          setSoundCloudPlayingTrack(next);
        } else {
          setSoundCloudPlayingTrack(null);
          wantsPlay.current = true;
        }
        setCurrent(next);
      }
      notify(
        switchTrack
          ? `Волна продолжается: «${appended[0].title}»`
          : `Волна продлена: +${appended.length} ${pluralTracks(appended.length)} · похоже на «${seedTrack.title}»`
      );
      return true;
    } finally {
      setContinuationLoading(false);
    }
  }, [
    continuationLoading,
    recommendations,
    recommendationMode,
    recommendationMood,
    queue,
    likedIds,
    dislikedIds,
    loadMoreFromRecommendations,
    nativeApp,
    notify,
  ]);

  useEffect(() => {
    try {
      window.localStorage.setItem("volna-experimental-percent", String(experimentalPercent));
    } catch {
      // localStorage может быть недоступен
    }
  }, [experimentalPercent]);

  const prevExpPercent = useRef(experimentalPercent);

  // Смена доли экспериментов автоматически пересобирает волну (с debounce)
  useEffect(() => {
    if (prevExpPercent.current === experimentalPercent) return;
    prevExpPercent.current = experimentalPercent;
    if (view.kind !== "recommendations" || recommendations.length === 0) return;
    if (expReloadTimer.current) window.clearTimeout(expReloadTimer.current);
    expReloadTimer.current = window.setTimeout(() => {
      void loadRecommendations();
    }, 700);
  });

  const openRecommendations = useCallback(
    (opts?: {
      mode?: "favorites" | "similar" | "mood";
      seedTrack?: Track | null;
      mood?: string;
      customMoodText?: string;
    }) => {
      setView({ kind: "recommendations" });
      loadRecommendations(opts);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [loadRecommendations]
  );

  // Scan an entire folder (and all its subfolders) automatically with 1 click
  const scanFolderFromDevice = async () => {
    const win = window as Window & {
      showDirectoryPicker?: (options?: {
        id?: string;
        mode?: "read" | "readwrite";
      }) => Promise<FileSystemDirectoryHandle>;
    };

    if (typeof win.showDirectoryPicker === "function") {
      try {
        const dirHandle = await win.showDirectoryPicker({
          id: "volna-device-music",
          mode: "read",
        });
        setImporting(true);
        await saveDirectoryHandle(dirHandle);
        setConnectedFolderName(dirHandle.name || "Папка устройства");
        const scanned = await scanDirectoryHandleRecursive(dirHandle);
        await importScannedAudioFiles(scanned, true, false);
        return;
      } catch (err) {
        setImporting(false);
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        // Fallback to webkitdirectory input if showDirectoryPicker fails
      }
    }

    folderRef.current?.click();
  };

  const handleFileListImport = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(isAudioFile);
    if (!files.length) {
      notify("Аудиофайлы (MP3, WAV, FLAC, M4A, OGG) не найдены");
      return;
    }
    const scanned: ScannedAudioFile[] = files.map((file) => {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const parts = rel.split("/").filter(Boolean);
      const folderName = parts.length > 1 ? parts[parts.length - 2] : "С устройства";
      return {
        file,
        folderName,
        relativePath: rel,
      };
    });
    if (scanned[0]?.relativePath.includes("/")) {
      const rootFolder = scanned[0].relativePath.split("/")[0];
      if (rootFolder) setConnectedFolderName(rootFolder);
    }
    await importScannedAudioFiles(scanned, true, false);
  };

  const removeLocal = async (track: Track) => {
    if (track.source === "device") {
      try {
        const response = await fetch(`/api/library?trackId=${encodeURIComponent(track.id)}`, { method: "DELETE" });
        if (!response.ok) throw new Error();
        setLibraryTracks((prev) => prev.filter((item) => item.id !== track.id));
        notify("Трек удалён из медиатеки");
      } catch {
        notify("Не удалось удалить трек из медиатеки");
      }
      return;
    }
    try {
      await deleteLocalRecord(track.id);
      const affected = playlists.filter((playlist) =>
        playlist.tracks.some((item) => item.id === track.id),
      );
      await Promise.all(
        affected.map((playlist) =>
          fetch(
            `/api/playlists/${encodeURIComponent(playlist.id)}?trackId=${encodeURIComponent(track.id)}`,
            { method: "DELETE" },
          ),
        ),
      );
      setLocalRecords(await getLocalRecords());
      await refreshPlaylists();
      if (current.id === track.id) {
        wantsPlay.current = false;
        audioRef.current?.pause();
        setCurrent(homeTracks[0] || featuredTracks[0]);
        setQueue(homeTracks.length ? homeTracks : featuredTracks);
      }
      notify("Трек удалён из медиатеки");
    } catch {
      notify("Не удалось удалить трек");
    }
  };

  const changeFavorite = async (track: Track) => {
    const liked = likedIds.has(track.id);
    // Show the new heart state immediately, then confirm it with the server.
    setLikeOverrides((prev) => ({ ...prev, [track.id]: !liked }));
    const clearOverride = () =>
      setLikeOverrides((prev) => {
        const next = { ...prev };
        delete next[track.id];
        return next;
      });

    try {
      const response = await fetch(
        liked
          ? `/api/playlists/favorites?trackId=${encodeURIComponent(track.id)}`
          : "/api/playlists/favorites",
        {
          method: liked ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: liked ? undefined : JSON.stringify({ track }),
        },
      );
      if (!response.ok) throw new Error("Request failed");
      await refreshPlaylists();
      clearOverride();
      notify(liked ? "Убрано из любимых" : "Добавлено в любимые");
    } catch {
      clearOverride();
      notify("Не удалось сохранить трек. Проверьте подключение.");
    }
  };

  const addToPlaylist = async (playlistId: string, track: Track) => {
    try {
      const response = await fetch(`/api/playlists/${encodeURIComponent(playlistId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track }),
      });
      if (!response.ok) throw new Error();
      await refreshPlaylists();
      setTrackToAdd(null);
      notify("Трек добавлен в плейлист");
    } catch {
      notify("Не удалось добавить трек в плейлист");
    }
  };

  const createPlaylist = async (event: FormEvent) => {
    event.preventDefault();
    if (!playlistName.trim() || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: playlistName }),
      });
      const data: { playlist?: Playlist } = await response.json();
      if (!response.ok || !data.playlist) throw new Error();
      await refreshPlaylists();
      setCreating(false);
      setPlaylistName("");
      if (trackToAdd) {
        await addToPlaylist(data.playlist.id, trackToAdd);
      } else {
        setView({ kind: "playlist", id: data.playlist.id });
        notify("Плейлист создан");
      }
    } catch {
      notify("Не удалось создать плейлист");
    } finally {
      setSaving(false);
    }
  };

  const removeFromPlaylist = async (track: Track, id: string) => {
    try {
      const response = await fetch(
        `/api/playlists/${encodeURIComponent(id)}?trackId=${encodeURIComponent(track.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error();
      await refreshPlaylists();
      notify("Трек удалён из плейлиста");
    } catch {
      notify("Не удалось удалить трек");
    }
  };

  const deletePlaylist = async (playlist: Playlist) => {
    if (!window.confirm(`Удалить плейлист «${playlist.name}»?`)) return;
    try {
      const response = await fetch(`/api/playlists/${encodeURIComponent(playlist.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error();
      await refreshPlaylists();
      setView({ kind: "home" });
      notify("Плейлист удалён");
    } catch {
      notify("Не удалось удалить плейлист");
    }
  };

  const openShare = async (playlist: Playlist) => {
    setShareQrView("links");
    setShare((prev) => ({ ...prev, open: true, loading: true, error: "", name: playlist.name }));
    try {
      const response = await fetch(`/api/playlists/${encodeURIComponent(playlist.id)}/share`, { method: "POST" });
      const data: {
        url?: string;
        name?: string;
        tracks?: ShareSnapshotTrack[];
        linksText?: string;
        qrLinks?: string;
        qrPage?: string;
        qrMode?: "links" | "page";
        linkCount?: number;
        missingCount?: number;
        error?: string;
      } = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось поделиться плейлистом");
      setShare({
        open: true,
        loading: false,
        error: "",
        name: data.name || playlist.name,
        url: data.url || "",
        tracks: data.tracks || [],
        linksText: data.linksText || "",
        qrLinks: data.qrLinks || "",
        qrPage: data.qrPage || "",
        qrMode: data.qrPage ? (data.qrLinks ? "links" : "page") : "links",
        linkCount: data.linkCount || 0,
        missingCount: data.missingCount || 0,
      });
      setShareQrView(data.qrLinks ? "links" : "page");
    } catch (error) {
      setShare((prev) => ({ ...prev, loading: false, error: error instanceof Error ? error.message : "Ошибка шаринга" }));
    }
  };

  const importSharedPlaylist = async (value?: string) => {
    const raw = (value ?? shareImportLink).trim();
    if (!raw || shareImportLoading) return;
    let shareId = "";
    try {
      const normalized = /^https?:\/\//i.test(raw) ? raw : `http://localhost/${raw.replace(/^\/+/, "")}`;
      const url = new URL(normalized);
      const match = url.pathname.match(/\/share\/([\w-]{4,40})/);
      if (match) shareId = match[1];
    } catch {
      const match = raw.match(/(?:^|\/)share\/([\w-]{4,40})$/);
      if (match) shareId = match[1];
    }
    if (!shareId) {
      notify("Вставьте ссылку вида /share/... или откройте QR-код и скопируйте адрес");
      return;
    }
    setShareImportLoading(true);
    try {
      const response = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId }),
      });
      const data = await response.json();
      if (!response.ok || !data.playlist) throw new Error(data.error || "Не удалось импортировать плейлист");
      await refreshPlaylists();
      setShareImportLink("");
      setShareImportOpen(false);
      setView({ kind: "playlist", id: data.playlist.id });
      notify("Плейлист добавлен в вашу медиатеку");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось импортировать плейлист");
    } finally {
      setShareImportLoading(false);
    }
  };

  const renamePlaylist = async (playlist: Playlist) => {
    const name = window.prompt("Новое название плейлиста", playlist.name)?.trim();
    if (!name || name === playlist.name) return;
    try {
      const response = await fetch(`/api/playlists/${encodeURIComponent(playlist.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error();
      await refreshPlaylists();
      notify("Название изменено");
    } catch {
      notify("Не удалось переименовать плейлист");
    }
  };

  const downloadTrack = async (track: Track) => {
    if (track.source === "soundcloud") {
      if (track.soundcloudUrl) {
        window.open(track.soundcloudUrl, "_blank", "noopener,noreferrer");
        notify("Открыта страница трека SoundCloud — скачивание доступно, если его разрешил автор.");
      } else {
        notify("Для этого SoundCloud-трека доступен только встроенный плеер.");
      }
      return;
    }
    if (track.source === "local") {
      const record = await getLocalRecord(track.id).catch(() => undefined);
      if (!record) {
        notify("Файл недоступен на этом устройстве");
        return;
      }
      const url = URL.createObjectURL(record.file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = record.file.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }

    if (track.source === "device") {
      const dlHref = track.downloadUrl || `${track.audioUrl}&download=1`;
      const anchor = document.createElement("a");
      anchor.href = dlHref;
      anchor.download = track.fileName || `${track.artist} - ${track.title}.mp3`;
      anchor.click();
      notify("Скачивание файла началось");
      return;
    }

    if (track.source === "hitmos") {
      const rawUrl = track.downloadUrl || track.streamUrl || "";
      const songId = track.archiveId || "";
      const niceName = track.fileName || `${track.artist} - ${track.title}.mp3`;
      const anchor = document.createElement("a");
      anchor.href = `/api/download?url=${encodeURIComponent(rawUrl)}&songId=${encodeURIComponent(songId)}&name=${encodeURIComponent(niceName)}`;
      anchor.download = niceName;
      anchor.click();
      notify("Загрузка MP3 с Hitmos началась");
      return;
    }

    if (track.archiveId && track.fileName) {
      const anchor = document.createElement("a");
      anchor.href = `/api/download?id=${encodeURIComponent(track.archiveId)}&file=${encodeURIComponent(track.fileName)}`;
      anchor.download = track.fileName.split("/").pop() || "music.mp3";
      anchor.click();
      notify("Загрузка трека началась");
      return;
    }

    notify("Скачивание недоступно");
  };

  const tableProps = {
    current,
    playing,
    likedIds,
    localIds,
    onPlay: playTrack,
    onArtist: searchArtist,
    onLike: changeFavorite,
    onAdd: setTrackToAdd,
    onDownload: downloadTrack,
    onSimilar: (track: Track) => openRecommendations({ mode: "similar", seedTrack: track }),
    onDislike: dislikeTrack,
    dislikedIds,
  };

  const shownTracks =
    view.kind === "library"
      ? allLibraryTracks
      : view.kind === "favorites"
        ? favorites?.tracks || []
        : activePlaylist?.tracks || [];

  const seekPercent = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
  const activeTheme = preferences.theme === "custom" ? preferences.customBase : preferences.theme;
  const appStyle: CSSProperties | undefined = preferences.theme === "custom" ? {
    "--purple": preferences.colors.accent,
    "--purple-dark": preferences.colors.accent,
    "--background": preferences.colors.background,
    "--surface": preferences.colors.surface,
    "--ink": preferences.colors.text,
    "--muted": preferences.colors.muted,
    "--line": preferences.colors.border,
  } as CSSProperties : undefined;

  const dropFiles = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    setImporting(true);
    try {
      const scanned = await extractFilesFromDataTransfer(event.dataTransfer);
      await importScannedAudioFiles(scanned, true, false);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="app-shell" data-theme={activeTheme} style={appStyle}>
      <input
        ref={folderRef}
        type="file"
        multiple
        className="visually-hidden"
        onChange={(event) => {
          if (event.target.files?.length) handleFileListImport(event.target.files);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac"
        multiple
        className="visually-hidden"
        onChange={(event) => {
          if (event.target.files?.length) handleFileListImport(event.target.files);
        }}
      />

      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => setView({ kind: "home" })}
          aria-label={`${preferences.siteName} — на главную`}
        >
          <span className="brand-symbol">
            {preferences.iconDataUrl ? (
              <img src={preferences.iconDataUrl} alt="" />
            ) : preferences.iconEmoji ? (
              <span className="brand-emoji">{preferences.iconEmoji}</span>
            ) : (
              <img src={WAVE_ICON} alt="" className="wave-logo-img" />
            )}
          </span>
          <span className="brand-name">
            {preferences.siteName}<span>.</span>
          </span>
        </button>
        <button className="mobile-menu-trigger" type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Открыть меню" title="Меню">
          <Menu size={18} /> <span>Меню</span>
        </button>

        <div className="side-section side-main">
          <p className="side-label">МЕНЮ</p>
          <nav className="main-nav" aria-label="Основная навигация">
            <button
              title="Обзор"
              className={`nav-item ${view.kind === "home" ? "active" : ""}`}
              onClick={() => setView({ kind: "home" })}
            >
              <House size={19} />
              <span>Обзор</span>
            </button>
            <button
              title="Поиск"
              className={`nav-item ${view.kind === "search" ? "active" : ""}`}
              onClick={openSearch}
            >
              <Search size={19} />
              <span>Поиск ({preferences.searchPlatform === "soundcloud" ? "SoundCloud" : "Hitmos"})</span>
            </button>
            <button
              title="Моя медиатека"
              className={`nav-item ${view.kind === "library" ? "active" : ""}`}
              onClick={() => setView({ kind: "library" })}
            >
              <LibraryBig size={19} />
              <span>Моя медиатека</span>
            </button>
            <button
              title="Любимые треки"
              className={`nav-item ${view.kind === "favorites" ? "active" : ""}`}
              onClick={() => setView({ kind: "favorites" })}
            >
              <Heart size={19} />
              <span>Любимые треки</span>
            </button>
            <button
              title="Прослушанное"
              className={`nav-item ${view.kind === "history" ? "active" : ""}`}
              onClick={() => {
                setView({ kind: "history" });
                refreshHistory();
              }}
            >
              <History size={19} />
              <span>Прослушанное</span>
            </button>
            <button
              title="Не рекомендовать"
              className={`nav-item ${view.kind === "disliked" ? "active" : ""}`}
              onClick={() => {
                setView({ kind: "disliked" });
                refreshDislikes();
              }}
            >
              <HeartCrack size={19} />
              <span>Не рекомендовать</span>
            </button>
            <button
              title="Рекомендации"
              className={`nav-item ${view.kind === "recommendations" ? "active" : ""}`}
              onClick={() => openRecommendations({ mode: "favorites" })}
            >
              <Sparkles size={19} />
              <span>Рекомендации</span>
            </button>
            <button
              title="Настройки"
              className={`nav-item ${view.kind === "settings" ? "active" : ""}`}
              onClick={() => setView({ kind: "settings" })}
            >
              <Settings size={19} />
              <span>Настройки</span>
            </button>
                      <button
              title="Мой профиль"
              className={`nav-item ${view.kind === "profile" ? "active" : ""}`}
              onClick={() => setView({ kind: "profile" })}
            >
              <User size={19} />
              <span>Мой профиль</span>
            </button>
          </nav>
        </div>

        <div className="side-section side-playlists">
          <div className="side-section-title">
            <p className="side-label">ПЛЕЙЛИСТЫ</p>
            <button
              className="side-add"
              title="Создать плейлист"
              aria-label="Создать плейлист"
              onClick={() => {
                setTrackToAdd(null);
                setCreating(true);
              }}
            >
              <Plus size={17} />
            </button>
          </div>
          <div className="side-playlist-list">
            {customPlaylists.map((playlist) => (
              <button
                key={playlist.id}
                className={`playlist-link ${
                  view.kind === "playlist" && view.id === playlist.id ? "selected" : ""
                }`}
                onClick={() => setView({ kind: "playlist", id: playlist.id })}
              >
                <span className={`playlist-icon ${playlist.color}`}>
                  <Music2 size={14} />
                </span>
                <span>{playlist.name}</span>
              </button>
            ))}
          </div>
          <button
            className="create-link"
            onClick={() => {
              setTrackToAdd(null);
              setCreating(true);
            }}
          >
            <Plus size={16} />
            <span>Создать плейлист</span>
          </button>
        </div>

        <div className="side-footer">
          СДЕЛАНО ДЛЯ ВАШЕГО РИТМА <span>✳</span>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="mobile-menu-backdrop" onMouseDown={() => setMobileMenuOpen(false)}>
          <nav className="mobile-menu-panel" aria-label="Разделы приложения" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mobile-menu-heading"><span>РАЗДЕЛЫ</span><button type="button" aria-label="Закрыть меню" onClick={() => setMobileMenuOpen(false)}><X size={20} /></button></div>
            <button className={`mobile-menu-item ${view.kind === "home" ? "active" : ""}`} onClick={() => { setView({ kind: "home" }); setMobileMenuOpen(false); }}><House size={18} /><span>Обзор</span></button>
            <button className={`mobile-menu-item ${view.kind === "search" ? "active" : ""}`} onClick={() => { openSearch(); setMobileMenuOpen(false); }}><Search size={18} /><span>Поиск ({preferences.searchPlatform === "soundcloud" ? "SoundCloud" : "Hitmos"})</span></button>
            <button className={`mobile-menu-item ${view.kind === "library" ? "active" : ""}`} onClick={() => { setView({ kind: "library" }); setMobileMenuOpen(false); }}><LibraryBig size={18} /><span>Моя медиатека</span></button>
            <button className={`mobile-menu-item ${view.kind === "favorites" ? "active" : ""}`} onClick={() => { setView({ kind: "favorites" }); setMobileMenuOpen(false); }}><Heart size={18} /><span>Любимые треки</span></button>
            <button className={`mobile-menu-item ${view.kind === "history" ? "active" : ""}`} onClick={() => { setView({ kind: "history" }); refreshHistory(); setMobileMenuOpen(false); }}><History size={18} /><span>Прослушанное</span></button>
            <button className={`mobile-menu-item ${view.kind === "disliked" ? "active" : ""}`} onClick={() => { setView({ kind: "disliked" }); refreshDislikes(); setMobileMenuOpen(false); }}><HeartCrack size={18} /><span>Не рекомендовать</span></button>
            <button className={`mobile-menu-item ${view.kind === "recommendations" ? "active" : ""}`} onClick={() => { openRecommendations({ mode: "favorites" }); setMobileMenuOpen(false); }}><Sparkles size={18} /><span>Рекомендации</span></button>
            {customPlaylists.length > 0 && <div className="mobile-menu-subheading">МОИ ПЛЕЙЛИСТЫ</div>}
            {customPlaylists.map((playlist) => <button key={playlist.id} className={`mobile-menu-item mobile-menu-playlist ${view.kind === "playlist" && view.id === playlist.id ? "active" : ""}`} onClick={() => { setView({ kind: "playlist", id: playlist.id }); setMobileMenuOpen(false); }}><span className={`playlist-icon ${playlist.color}`}><Music2 size={15} /></span><span>{playlist.name}</span><small>{playlist.tracks.length}</small></button>)}
            <button className="mobile-menu-item" onClick={() => { setTrackToAdd(null); setCreating(true); setMobileMenuOpen(false); }}><Plus size={18} /><span>Создать плейлист</span></button>
            <button className={`mobile-menu-item ${view.kind === "settings" ? "active" : ""}`} onClick={() => { setView({ kind: "settings" }); setMobileMenuOpen(false); }}><Settings size={18} /><span>Настройки</span></button>
            <button className={`mobile-menu-item ${view.kind === "profile" ? "active" : ""}`} onClick={() => { setView({ kind: "profile" }); setMobileMenuOpen(false); }}><User size={18} /><span>Мой профиль</span></button>
            <button className="mobile-menu-item mobile-menu-scan" onClick={() => { setMobileMenuOpen(false); scanFolderFromDevice(); }}><FolderSync size={18} /><span>Сканировать папку музыки</span></button>
          </nav>
        </div>
      )}

      <div className="workspace">
        <header className="topbar">
          <form
            className="search-box"
            onSubmit={(event) => {
              event.preventDefault();
              runSearch(query);
            }}
          >
            <Search size={19} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={preferences.searchPlatform === "soundcloud" ? "Поиск на SoundCloud или вставьте ссылку на трек..." : "Поиск на Hitmos: артист, трек или жанр..."}
              aria-label="Поиск музыки"
            />
            <span className="search-shortcut">↵</span>
          </form>

          <div className="top-actions">
            <button
              className="top-upload"
              onClick={scanFolderFromDevice}
              title="Автоматически найти и загрузить все аудиофайлы из папки и подпапок"
            >
              <FolderSync size={17} />
              <span>Автопоиск по папке</span>
            </button>
            <span className="top-divider" />
            <button
              type="button"
              className={`profile ${view.kind === "profile" ? "profile--active" : ""}`}
              title="Открыть профиль"
              aria-label="Мой профиль"
              onClick={() => setView({ kind: "profile" })}
            >
              <span className="profile-copy">
                <strong>мой профиль</strong>
                <small>{allLibraryTracks.length} треков с устройства</small>
              </span>
              <ChevronRight size={15} />
            </button>
          </div>
        </header>

        <main className="main-content">
          {view.kind === "home" ? (
            <>
              <div className="welcome-row">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-dot" /> ВАШЕ МУЗЫКАЛЬНОЕ ПРОСТРАНСТВО
                  </div>
                  <h1>
                    {greeting.title} <span className="welcome-sparkle">✳</span>
                  </h1>
                  <p>{greeting.subtitle}</p>
                </div>
                <div className="welcome-date">
                  <Sparkles size={16} /> Hitmos + автосканер устройства
                </div>
              </div>

              <div className="hero-grid">
                <section className="hero-card">
                  <div className="hero-inner">
                    <div className="hero-kicker">
                      <AudioLines size={15} /> ПОЙМАЙТЕ СВОЮ ВОЛНУ
                    </div>
                    <h2>
                      Музыка звучит
                      <br />
                      <em>лучше с вами.</em>
                    </h2>
                    <p>
                      Ищите любые песни на Hitmos, слушайте онлайн,
                      <br />
                      сохраняйте в плейлисты и скачивайте в MP3.
                    </p>
                    <div className="hero-buttons">
                      <button
                        className="hero-primary"
                        onClick={() => openRecommendations({ mode: "favorites" })}
                      >
                        <Sparkles size={15} />
                        Слушать волну
                      </button>
                      <button className="hero-secondary" onClick={openSearch}>
                        Искать на Hitmos <ArrowRight size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="hero-decoration">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </section>

                <section
                  className={`library-card ${dragging ? "dragging" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={dropFiles}
                >
                  <div className="library-card-top">
                    <span className="small-kicker">АВТОСКАНЕР УСТРОЙСТВА</span>
                    <span className="library-top-icon">
                      <FolderOpen size={18} />
                    </span>
                  </div>
                  <h2>
                    Вся ваша музыка
                    <br /> под рукой<span>.</span>
                  </h2>
                  <p>
                    Папка «Музыка» сканируется автоматически. Или укажите любую папку — все треки из неё и вложенных папок добавятся сами.
                  </p>
                  <button
                    className="upload-zone"
                    onClick={scanFolderFromDevice}
                    disabled={importing || scanningDevice}
                  >
                    <span className="upload-icon">
                      {importing || scanningDevice ? (
                        <LoaderCircle size={18} className="spin" />
                      ) : (
                        <CloudUpload size={19} />
                      )}
                    </span>
                    <span>
                      <strong>
                        {importing || scanningDevice
                          ? "Сканируем папки..."
                          : "Сканировать папку целиком"}
                      </strong>
                      <small>все треки из всех подпапок сразу</small>
                    </span>
                    <Plus size={16} className="upload-plus" />
                  </button>
                  <div className="library-card-bottom">
                    <span>
                      Автонайдено: {allLibraryTracks.length} {pluralTracks(allLibraryTracks.length)}
                    </span>
                    <button onClick={() => setView({ kind: "library" })}>
                      Открыть медиатеку <ChevronRight size={13} />
                    </button>
                  </div>
                </section>
              </div>

              {allLibraryTracks.length > 0 && (
                <section className="content-section">
                  <div className="section-heading">
                    <div>
                      <h2>
                        Найдено на вашем устройстве <span>✳</span>
                      </h2>
                      <p>
                        Автоматически загружено из папок устройства ({allLibraryTracks.length}{" "}
                        {pluralTracks(allLibraryTracks.length)})
                      </p>
                    </div>
                    <button className="text-link" onClick={() => setView({ kind: "library" })}>
                      Вся медиатека <ArrowRight size={16} />
                    </button>
                  </div>
                  <TrackTable tracks={allLibraryTracks.slice(0, 5)} {...tableProps} />
                </section>
              )}

              {history.length > 0 && (
                <section className="content-section history-home-section">
                  <div className="section-heading">
                    <div>
                      <h2>
                        Недавно прослушано <span>✳</span>
                      </h2>
                      <p>Продолжите с того места, где остановились</p>
                    </div>
                    <button
                      className="text-link"
                      onClick={() => {
                        setView({ kind: "history" });
                        refreshHistory();
                      }}
                    >
                      Вся история <ArrowRight size={16} />
                    </button>
                  </div>
                  <TrackTable tracks={history.slice(0, 5)} {...tableProps} />
                </section>
              )}

              {/* Блок персональной умной волны */}
              <section className="content-section reco-promo-section">
                <div className="reco-promo-card">
                  <div className="reco-promo-left">
                    <span className="reco-promo-badge">
                      <Sparkles size={14} /> УМНЫЙ ПОДБОР МУЗЫКИ
                    </span>
                    <h2>Ваша персональная волна</h2>
                    <p>
                      Система изучает любимые треки и треки с вашего устройства, подбирая похожую музыку и свежие открытия.
                    </p>
                    <div className="reco-promo-actions">
                      <button
                        type="button"
                        className="solid-button"
                        onClick={() => openRecommendations({ mode: "favorites" })}
                      >
                        <Sparkles size={15} /> Открыть волну
                      </button>
                      {current && (
                        <button
                          type="button"
                          className="reco-promo-ghost"
                          onClick={() => openRecommendations({ mode: "similar", seedTrack: current })}
                        >
                          <Radio size={14} /> Похожее на «{current.title}»
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="reco-promo-moods">
                    <span className="small-kicker">БЫСТРЫЙ ВАЙБ</span>
                    <div className="reco-quick-mood-row">
                      <button
                        type="button"
                        onClick={() => openRecommendations({ mode: "mood", mood: "chill" })}
                      >
                        ☕ Чилл
                      </button>
                      <button
                        type="button"
                        onClick={() => openRecommendations({ mode: "mood", mood: "energy" })}
                      >
                        ⚡ Энергия
                      </button>
                      <button
                        type="button"
                        onClick={() => openRecommendations({ mode: "mood", mood: "focus" })}
                      >
                        🎯 Фокус
                      </button>
                      <button
                        type="button"
                        onClick={() => openRecommendations({ mode: "mood", mood: "rap" })}
                      >
                        🎤 Рэп
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="content-section moods-section">
                <div className="section-heading">
                  <div>
                    <h2>
                      Подборки под настроение <span>✳</span>
                    </h2>
                    <p>Найдите свой звук прямо сейчас</p>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => openRecommendations({ mode: "mood", mood: "chill" })}
                  >
                    Все настроения <ArrowRight size={16} />
                  </button>
                </div>
                <div className="mood-grid">
                  {moods.map((mood, index) => (
                    <button
                      className="mood-card"
                      key={mood.title}
                      onClick={() => openRecommendations({ mode: "mood", mood: mood.query })}
                    >
                      <div className="mood-image">
                        <img src={mood.image} alt="" />
                        <div className="mood-overlay" />
                        <span className="mood-label">
                          <AudioLines size={13} /> {mood.label}
                        </span>
                        <span className="mood-play">
                          <Play size={14} fill="currentColor" />
                        </span>
                        <span className="mood-number">0{index + 1}</span>
                      </div>
                      <div className="mood-copy">
                        <strong>{mood.title}</strong>
                        <small>{mood.subtitle}</small>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="content-section tracks-section">
                <div className="section-heading">
                  <div>
                    <h2>
                      Популярное на Hitmos <span>✳</span>
                    </h2>
                    <p>Топ-чарт треков, доступных для прослушивания и скачивания</p>
                  </div>
                  <button className="text-link" onClick={() => runSearch("Miyagi")}>
                    Больше музыки <ArrowRight size={16} />
                  </button>
                </div>
                <TrackTable tracks={homeTracks} {...tableProps} />
              </section>
            </>
          ) : view.kind === "recommendations" ? (
            <RecommendationsView
              tracks={recommendations}
              loading={recommendationsLoading}
              title={recommendationTitle}
              summary={recommendationSummary}
              mode={recommendationMode}
              currentTrack={current}
              seedTrack={recommendationSeedTrack}
              selectedMood={recommendationMood}
              factors={recommendationFactors}
              experimentalPercent={experimentalPercent}
              experimentalCount={experimentalCount}
              continuationLoading={continuationLoading}
              onContinueWave={() => { void continueRecommendations(); }}
              onExperimentalChange={(value) => {
                setExperimentalPercent(value);
              }}
              onSelectMode={(m) => loadRecommendations({ mode: m })}
              onSelectMood={(m, custom) =>
                loadRecommendations({ mode: "mood", mood: m, customMoodText: custom })
              }
              onRefresh={() => loadRecommendations()}
              onPlayAll={() => {
                if (recommendations.length > 0) {
                  const continuationSeeds = recommendations.filter((track) => !isExperimentalTrack(track) || likedIds.has(track.id));
                  recoContinuation.current = {
                    seeds: continuationSeeds,
                    nextIndex: 1,
                    seen: new Set(recommendations.map((track) => track.id)),
                    mode: recommendationMode,
                    mood: recommendationMood,
                    experimentalPercent,
                    active: true,
                  };
                  playTrack(recommendations[0], recommendations, true);
                }
              }}
              tableProps={tableProps}
            />
          ) : view.kind === "history" ? (
            <>
              <div className="page-heading library-heading">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-dot" /> ВАША ИСТОРИЯ
                  </div>
                  <h1>
                    Прослушанное <span className="welcome-sparkle">✳</span>
                  </h1>
                  <p>Все треки, которые вы включали — от новых до самых любимых.</p>
                </div>
                <div className="page-heading-actions">
                  {history.length > 0 && (
                    <>
                      <button className="outline-icon" title="Очистить историю" aria-label="Очистить историю" onClick={clearHistory}>
                        <Trash2 size={17} />
                      </button>
                      <button className="solid-button" onClick={() => playTrack(history[0], history)}>
                        <Play size={15} fill="currentColor" /> Слушать всё
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="collection-banner history-banner">
                <div className="collection-art history-art">
                  <History size={35} />
                </div>
                <div>
                  <span className="small-kicker">ЖУРНАЛ ПРОСЛУШИВАНИЙ</span>
                  <h2>История в вашем ритме</h2>
                  <p>
                    {history.length} {pluralTracks(history.length)} · новые записи появляются автоматически при воспроизведении
                  </p>
                </div>
              </div>

              <section className="content-section">
                <div className="section-heading">
                  <div>
                    <h2>Недавно слушали</h2>
                    <p>{history.length ? "Свежие треки сверху" : "Здесь пока тихо"}</p>
                  </div>
                </div>

                {historyLoading && !history.length ? (
                  <div className="state-box">
                    <LoaderCircle size={26} className="spin state-purple" />
                    <strong>Загружаем историю...</strong>
                  </div>
                ) : history.length ? (
                  <TrackTable
                    tracks={history}
                    {...tableProps}
                    onRemove={removeHistoryEntry}
                    removeLabel="Удалить из истории"
                  />
                ) : (
                  <div className="state-box collection-empty">
                    <span className="empty-icon">
                      <History size={28} />
                    </span>
                    <strong>Вы пока ничего не слушали</strong>
                    <p>Включите любой трек, и он автоматически появится в этом разделе.</p>
                    <button className="solid-button" onClick={() => setView({ kind: "home" })}>
                      <Play size={15} fill="currentColor" /> Перейти к музыке
                    </button>
                  </div>
                )}
              </section>
            </>
          ) : view.kind === "disliked" ? (
            <DislikesView
              tracks={dislikedTracks}
              artists={dislikeArtists}
              genres={dislikeGenres}
              loading={dislikeLoading}
              thresholds={dislikeThresholds}
              onRule={changeDislikeRule}
              onRestore={restoreDisliked}
              onClearAll={clearDislikes}
              tableProps={tableProps}
            />
          ) : view.kind === "profile" ? (
            <ProfileView />
          ) : view.kind === "settings" ? (
            <SettingsPanel
              preferences={preferences}
              onChange={setPreferences}
              soundcloudApiConfigured={soundcloudApiConfigured}
              onReset={() => {
                setPreferences(defaultPreferences);
                notify("Настройки возвращены к значениям по умолчанию");
              }}
            />
          ) : view.kind === "search" ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-dot" /> ПОИСК В ИНТЕРНЕТЕ
                  </div>
                  <h1>
                    Поиск музыки <span className="welcome-sparkle">✳</span>
                  </h1>
                  <p>
                    {preferences.searchPlatform === "soundcloud"
                      ? "Откройте трек или плейлист SoundCloud по ссылке и слушайте музыку в фоновом плеере."
                      : "Поиск песен и исполнителей через каталог Hitmos (hitmos.me) с прослушиванием и скачиванием MP3."}
                  </p>
                </div>
                <div className="source-pill">
                  <Globe2 size={16} /> {preferences.searchPlatform === "soundcloud" ? "SoundCloud" : "Hitmos (hitmos.me)"}
                </div>
              </div>

              <div className="search-platform-switch" role="group" aria-label="Выбрать площадку для поиска">
                <button type="button" className={preferences.searchPlatform === "hitmos" ? "active" : ""} onClick={() => { setPreferences((prev) => ({ ...prev, searchPlatform: "hitmos" })); setSoundcloudExternalOnly(false); if (query.trim()) runSearch(query, undefined, "hitmos"); }}><Headphones size={16} /> Hitmos</button>
                <button type="button" className={preferences.searchPlatform === "soundcloud" ? "active" : ""} onClick={() => { setPreferences((prev) => ({ ...prev, searchPlatform: "soundcloud" })); if (query.trim()) runSearch(query, undefined, "soundcloud"); }}><Globe2 size={16} /> SoundCloud</button>
              </div>

              <div className="search-intro">
                <div className="search-intro-icon">
                  <Search size={23} />
                </div>
                <div>
                  <strong>{preferences.searchPlatform === "soundcloud" ? "Что найти на SoundCloud?" : "Что хотите послушать?"}</strong>
                  <p>
                    {preferences.searchPlatform === "soundcloud"
                      ? "Вставьте ссылку на песню или плейлист, в том числе короткую on.soundcloud.com."
                      : "Введите название песни, русского или зарубежного исполнителя в строке поиска сверху и нажмите Enter."}
                  </p>
                </div>
              </div>

              <div className="quick-search">
                <span>ПОПУЛЯРНЫЕ ЗАПРОСЫ</span>
                {(preferences.searchPlatform === "soundcloud"
                  ? ["Miyagi", "Баста", "Lo-fi", "Chill", "The Weeknd", "Linkin Park"]
                  : ["Miyagi", "Баста", "Кино", "Король и Шут", "Macan", "Анна Асти", "The Weeknd", "Linkin Park"]
                ).map((term) => (
                  <button
                    className={
                      query.toLowerCase() === term.toLowerCase() && hasSearched ? "selected" : ""
                    }
                    key={term}
                    onClick={() => runSearch(term)}
                  >
                    {term}
                  </button>
                ))}
              </div>

              {soundcloudPlaylist && !searchLoading && searchResults.length > 0 && <section className="soundcloud-playlist-banner">
                <div className="soundcloud-playlist-art">{soundcloudPlaylist.artwork ? <img src={soundcloudPlaylist.artwork} alt="" /> : <ListMusic size={29} />}</div>
                <div className="soundcloud-playlist-copy"><span>ПЛЕЙЛИСТ SOUNDCLOUD</span><h2>{soundcloudPlaylist.title}</h2><p><button type="button" onClick={() => searchArtist(soundcloudPlaylist.artist, searchResults[0])}>{soundcloudPlaylist.artist}</button> · {soundcloudPlaylist.total || searchResults.length} {pluralTracks(soundcloudPlaylist.total || searchResults.length)}</p></div>
                <div className="soundcloud-playlist-actions"><button type="button" className="solid-button" onClick={() => playTrack(searchResults[0], searchResults)}><Play size={15} fill="currentColor" /> Слушать всё</button><a href={soundcloudPlaylist.url} target="_blank" rel="noreferrer" aria-label="Открыть плейлист в SoundCloud" title="Открыть в SoundCloud"><ExternalLink size={17} /></a></div>
              </section>}

              <section className="content-section search-results-section">
                <div className="section-heading">
                  <div>
                    <h2>
                      {soundcloudPlaylist ? "Треки плейлиста" : hasSearched
                        ? `Результаты: «${searchLabel}»`
                        : preferences.searchPlatform === "soundcloud"
                          ? "Популярное на SoundCloud"
                          : "Популярные треки на Hitmos"}
                    </h2>
                    <p>
                      {hasSearched
                        ? preferences.searchPlatform === "soundcloud"
                          ? "Выберите трек — музыка продолжит играть при переходе по сайту"
                          : "Нажмите на трек для воспроизведения или скачайте MP3"
                        : preferences.searchPlatform === "soundcloud"
                          ? "Популярная музыка в SoundCloud"
                          : "Актуальный чарт Hitmos"}
                    </p>
                  </div>
                  {hasSearched && !searchLoading && !searchError && (
                    <span className="result-count">
                      {searchResults.length} {pluralTracks(searchResults.length)}
                    </span>
                  )}
                </div>

                {searchLoading ? (
                  <div className="state-box">
                    <LoaderCircle size={26} className="spin state-purple" />
                    <strong>{preferences.searchPlatform === "soundcloud" ? "Ищем музыку на SoundCloud..." : "Ищем музыку на Hitmos..."}</strong>
                    <p>{preferences.searchPlatform === "soundcloud" ? "Загружаем результаты и готовим официальный SoundCloud-плеер" : "Загружаем список треков и прямые ссылки на MP3"}</p>
                  </div>
                ) : soundcloudExternalOnly ? (
                  <div className="state-box soundcloud-external-state">
                    <Globe2 size={29} className="state-purple" />
                    <strong>Официальный поиск SoundCloud</strong>
                    <p>SoundCloud требует зарегистрированный API-ключ для отображения выдачи внутри приложения. Откройте результаты на SoundCloud, а ссылку на выбранный трек скопируйте в строку поиска — сайт покажет его в официальном встроенном плеере.</p>
                    <a className="solid-button soundcloud-open-link" href={soundcloudSearchUrl || `https://m.soundcloud.com/search?q=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Открыть результаты SoundCloud</a>
                    <small className="soundcloud-api-hint">Ключи можно добавить в серверные переменные <code>SOUNDCLOUD_CLIENT_ID</code> и <code>SOUNDCLOUD_CLIENT_SECRET</code>.</small>
                  </div>
                ) : searchError ? (
                  <div className="state-box">
                    <Radio size={27} className="state-purple" />
                    <strong>Не удалось выполнить поиск</strong>
                    <p>{searchError}</p>
                    <button className="solid-button" onClick={() => runSearch(query)}>
                      Попробовать снова
                    </button>
                  </div>
                ) : hasSearched && !searchResults.length ? (
                  <div className="state-box">
                    <Search size={27} className="state-purple" />
                    <strong>Ничего не нашлось</strong>
                    <p>Попробуйте другое название песни или имя исполнителя.</p>
                  </div>
                ) : !hasSearched && preferences.searchPlatform === "soundcloud" ? (
                  <div className="state-box soundcloud-external-state">
                    <Globe2 size={29} className="state-purple" />
                    <strong>Готовы открыть SoundCloud</strong>
                    <p>Откройте SoundCloud и скопируйте ссылку на понравившийся публичный трек. Вставьте её в поиск выше — сайт откроет официальный встроенный плеер.</p>
                    <a className="solid-button soundcloud-open-link" href="https://m.soundcloud.com" target="_blank" rel="noreferrer"><ExternalLink size={15} /> Открыть SoundCloud</a>
                  </div>
                ) : (
                  <TrackTable
                    tracks={hasSearched ? searchResults : homeTracks}
                    {...tableProps}
                  />
                )}
              </section>
            </>
          ) : (
            <>
              <div className="page-heading library-heading">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-dot" />{" "}
                    {view.kind === "library" ? "ВАША МУЗЫКА С УСТРОЙСТВА" : "ВАША КОЛЛЕКЦИЯ"}
                  </div>
                  <h1>
                    {view.kind === "library"
                      ? "Моя медиатека"
                      : view.kind === "favorites"
                        ? "Любимые треки"
                        : activePlaylist?.name || "Плейлист"}{" "}
                    <span className="welcome-sparkle">✳</span>
                  </h1>
                  <p>
                    {view.kind === "library"
                      ? "Все аудиофайлы из папок вашего устройства собираются здесь автоматически."
                      : view.kind === "favorites"
                        ? "Всё, что отозвалось сердцу, в одном месте."
                        : "Ваше настроение, собранное в одном плейлисте."}
                  </p>
                </div>

                <div className="page-heading-actions">
                  {view.kind === "playlist" && activePlaylist && (
                    <>
                      <button
                        className="outline-icon"
                        title="Переименовать"
                        aria-label="Переименовать"
                        onClick={() => renamePlaylist(activePlaylist)}
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        className="outline-icon"
                        title="Удалить плейлист"
                        aria-label="Удалить плейлист"
                        onClick={() => deletePlaylist(activePlaylist)}
                      >
                        <Trash2 size={17} />
                      </button>
                      <button
                        className="solid-button"
                        title="Поделиться плейлистом"
                        aria-label="Поделиться плейлистом"
                        onClick={() => { void openShare(activePlaylist); }}
                      >
                        <Share2 size={16} /> Поделиться
                      </button>
                      <button
                        className="solid-button outline-download"
                        title="Сохранить плейлист для прослушивания офлайн"
                        aria-label="Сохранить плейлист офлайн"
                        disabled={offlineSaving}
                        onClick={() => { void downloadPlaylistOffline(activePlaylist.name, activePlaylist.tracks); }}
                      >
                        {offlineSaving ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />} Скачать офлайн
                      </button>
                    </>
                  )}
                  {view.kind === "library" ? (
                    <>
                      <button
                        className="outline-icon"
                        title="Автоматически пересканировать папки устройства"
                        aria-label="Автоматически пересканировать папки устройства"
                        onClick={() => autoScanDeviceFolders(true)}
                      >
                        <RefreshCw size={16} className={scanningDevice ? "spin" : ""} />
                      </button>
                      <button className="solid-button" onClick={scanFolderFromDevice}>
                        <FolderSync size={16} /> Сканировать папку
                      </button>
                      <button className="solid-button library-import-button" onClick={() => setShareImportOpen(true)}>
                        <Share2 size={16} /> Добавить по ссылке / QR
                      </button>
                    </>
                  ) : (
                    shownTracks.length > 0 && (
                      <>
                        <button
                          className="solid-button outline-download"
                          disabled={offlineSaving}
                          title="Сохранить все треки для прослушивания офлайн"
                          onClick={() => { void downloadPlaylistOffline(view.kind === "favorites" ? "Любимые треки" : view.kind === "library" ? "Моя медиатека" : "Плейлист", shownTracks); }}
                        >
                          {offlineSaving ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />} Скачать офлайн
                        </button>
                        <button
                          className="solid-button"
                          onClick={() => playTrack(shownTracks[0], shownTracks)}
                        >
                          <Play size={15} fill="currentColor" /> Слушать всё
                        </button>
                      </>
                    )
                  )}
                </div>
              </div>

              <div className="collection-banner">
                <div
                  className={`collection-art ${
                    view.kind === "favorites"
                      ? "favorite-art"
                      : view.kind === "library"
                        ? "local-art"
                        : "playlist-art"
                  }`}
                >
                  {view.kind === "favorites" ? (
                    <Heart size={35} fill="currentColor" />
                  ) : view.kind === "library" ? (
                    <HardDrive size={35} />
                  ) : (
                    <ListMusic size={35} />
                  )}
                </div>
                <div>
                  <span className="small-kicker">
                    {view.kind === "library" ? "АВТОСИНХРОНИЗАЦИЯ С УСТРОЙСТВОМ" : "МОЯ КОЛЛЕКЦИЯ"}
                  </span>
                  <h2>
                    {view.kind === "library"
                      ? "Все файлы с устройства"
                      : view.kind === "favorites"
                        ? "Музыка в самое сердце"
                        : activePlaylist?.name || "Ваш плейлист"}
                  </h2>
                  <p>
                    {shownTracks.length} {pluralTracks(shownTracks.length)}
                    {view.kind === "library"
                      ? connectedFolderName
                        ? ` · подключена папка «${connectedFolderName}» и системная папка Music`
                        : scannedDirs.length
                          ? ` · автосканирование: ${scannedDirs[0]}`
                          : " · автоматический обход папок устройства"
                      : " · слушайте в своём ритме"}
                  </p>
                </div>
              </div>

              {view.kind === "library" && (
                <section className="content-section user-playlists-section">
                  <div className="section-heading">
                    <div>
                      <h2>Мои плейлисты</h2>
                      <p>Ваша музыка, ваше настроение</p>
                    </div>
                    <button
                      className="text-link"
                      onClick={() => {
                        setTrackToAdd(null);
                        setCreating(true);
                      }}
                    >
                      <Plus size={15} /> Создать
                    </button>
                  </div>
                  <div className="user-playlists-grid">
                    {customPlaylists.map((playlist) => (
                      <button
                        className="user-playlist-card"
                        key={playlist.id}
                        onClick={() => setView({ kind: "playlist", id: playlist.id })}
                      >
                        <span className={`playlist-icon ${playlist.color}`}>
                          <Music2 size={17} />
                        </span>
                        <span>
                          <strong>{playlist.name}</strong>
                          <small>
                            {playlist.tracks.length} {pluralTracks(playlist.tracks.length)}
                          </small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                    <button
                      className="user-playlist-card new-playlist-card"
                      onClick={() => {
                        setTrackToAdd(null);
                        setCreating(true);
                      }}
                    >
                      <span className="playlist-icon">
                        <Plus size={18} />
                      </span>
                      <span>
                        <strong>Новый плейлист</strong>
                        <small>Соберите свой звук</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </section>
              )}

              <section className="content-section">
                <div className="section-heading">
                  <div>
                    <h2>Ваши треки</h2>
                    <p>
                      {shownTracks.length
                        ? "Все найденные аудиофайлы готовы к воспроизведению"
                        : "Здесь пока тихо"}
                    </p>
                  </div>
                  {view.kind === "library" && (
                    <button className="text-link" onClick={() => fileRef.current?.click()}>
                      <Plus size={15} /> Добавить отдельные файлы
                    </button>
                  )}
                </div>

                {shownTracks.length ? (
                  <TrackTable
                    tracks={shownTracks}
                    {...tableProps}
                    onRemove={
                      view.kind === "library"
                        ? removeLocal
                        : view.kind === "playlist" && activePlaylist
                          ? (track) => removeFromPlaylist(track, activePlaylist.id)
                          : undefined
                    }
                    removeLabel={
                      view.kind === "library" ? "Убрать из медиатеки" : "Убрать из плейлиста"
                    }
                  />
                ) : (
                  <div className="state-box collection-empty">
                    <span className="empty-icon">
                      {view.kind === "library" ? <FileAudio size={28} /> : <Music2 size={28} />}
                    </span>
                    <strong>
                      {view.kind === "library"
                        ? "Подключите папку с музыкой"
                        : "Пока здесь нет треков"}
                    </strong>
                    <p>
                      {view.kind === "library"
                        ? "Укажите папку с музыкой один раз — плеер сам обойдёт все вложенные папки и автоматически добавит все треки."
                        : "Найдите любимую музыку на Hitmos и добавьте её сюда."}
                    </p>
                    <button
                      className="solid-button"
                      onClick={view.kind === "library" ? scanFolderFromDevice : openSearch}
                    >
                      {view.kind === "library" ? (
                        <FolderSync size={16} />
                      ) : (
                        <Search size={16} />
                      )}
                      {view.kind === "library"
                        ? "Сканировать папку устройства"
                        : "Найти музыку"}
                    </button>
                  </div>
                )}
              </section>
            </>
          )}

          <footer className="content-footer">
            <span>
              {preferences.siteName}<span>.</span> <i>·</i> Музыка в вашем ритме
            </span>
            <span>
              Онлайн-каталог:{" "}
              <a href={preferences.searchPlatform === "soundcloud" ? "https://m.soundcloud.com" : "https://hitmos.me"} target="_blank" rel="noreferrer">
                {preferences.searchPlatform === "soundcloud" ? "SoundCloud ↗" : "Hitmos (hitmos.me) ↗"}
              </a>
            </span>
          </footer>
        </main>
      </div>

      {soundcloudPlayingTrack && <SoundCloudPlayer
        ref={soundcloudPlayerRef}
        track={soundcloudPlayingTrack}
        volume={volume}
        expanded={soundcloudDockExpanded}
        onCollapse={() => setSoundcloudDockExpanded(false)}
        onPlayingChange={setPlaying}
        onProgress={setElapsed}
        onDuration={setDuration}
        onSound={(sound) => {
          setCurrent((previous) => {
            if (previous.id !== soundcloudPlayingTrack.id) return previous;
            let sourceUrl = previous.soundcloudUrl;
            if (sound.permalink_url && /^https:\/\/soundcloud\.com\//i.test(sound.permalink_url)) sourceUrl = sound.permalink_url;
            return { ...previous, title: sound.title || previous.title, artist: sound.user?.username || previous.artist, artwork: sound.artwork_url || previous.artwork, duration: sound.duration ? Math.round(sound.duration / 1000) : previous.duration, soundcloudUrl: sourceUrl };
          });
        }}
        onFinish={handleEnded}
        onError={() => { setPlaying(false); setSoundcloudDockExpanded(true); notify("Не удалось воспроизвести этот трек SoundCloud. Проверьте доступность записи."); }}
      />}

      <div className="player-bar">
        <audio
          ref={audioRef}
          preload="none"
          onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => {
            if (Number.isFinite(event.currentTarget.duration)) {
              setDuration(event.currentTarget.duration);
            }
          }}
          onPlay={() => { if (current.source !== "soundcloud") setPlaying(true); }}
          onPause={() => { if (current.source !== "soundcloud") setPlaying(false); }}
          onEnded={handleEnded}
          onError={() => {
            if (wantsPlay.current) {
              wantsPlay.current = false;
              notify("Не удалось загрузить аудио. Попробуйте другой трек.");
            }
          }}
        />

        <div className="player-track">
          <Artwork track={current} className="player-art" />
          <div className="player-track-copy">
            <strong>{current.title}</strong>
            <button className="player-artist-button" type="button" title={`Найти музыку: ${current.artist}`} onClick={() => searchArtist(current.artist, current)}>{current.artist}</button>
          </div>
          {current.source === "soundcloud" && soundcloudPlayingTrack && <button className={`icon-button player-soundcloud-toggle ${soundcloudDockExpanded ? "control-active" : ""}`} title={soundcloudDockExpanded ? "Свернуть плеер SoundCloud" : "Показать плеер SoundCloud"} aria-label={soundcloudDockExpanded ? "Свернуть плеер SoundCloud" : "Показать плеер SoundCloud"} onClick={() => setSoundcloudDockExpanded((value) => !value)}><AudioLines size={18} /></button>}
          <button
            className="icon-button player-similar-button"
            title="Найти похожие треки"
            aria-label="Найти похожие треки"
            onClick={() => openRecommendations({ mode: "similar", seedTrack: current })}
          >
            <Sparkles size={17} />
          </button>
          <button
            className={`player-heart icon-button ${likedIds.has(current.id) ? "is-liked" : ""}`}
            title="В любимые"
            aria-label="В любимые"
            onClick={() => changeFavorite(current)}
          >
            <Heart size={18} fill={likedIds.has(current.id) ? "currentColor" : "none"} />
          </button>
          <button
            className="icon-button player-add-button"
            title="Добавить в плейлист"
            aria-label="Добавить в плейлист"
            onClick={() => setTrackToAdd(current)}
          >
            <ListPlus size={18} />
          </button>
          <button
            className={`icon-button player-dislike-button ${dislikedIds.has(current.id) ? "is-disliked" : ""}`}
            title={dislikedIds.has(current.id) ? "Уже в списке «Не рекомендовать»" : "Не нравится — не рекомендовать"}
            aria-label={dislikedIds.has(current.id) ? "Уже в списке «Не рекомендовать»" : "Не нравится"}
            onClick={() => dislikeTrack(current)}
          >
            <HeartCrack size={18} />
          </button>
        </div>

        <div className="player-center">
          <div className="player-controls">
            <button
              title="Перемешать"
              aria-label="Перемешать"
              className={shuffle ? "control-active" : ""}
              onClick={() => setShuffle(!shuffle)}
            >
              <Shuffle size={17} />
            </button>
            <button
              title="Предыдущий трек"
              aria-label="Предыдущий трек"
              onClick={() => skip(-1)}
            >
              <SkipBack size={19} fill="currentColor" />
            </button>
            <button
              className="main-play"
              title={playing ? "Пауза" : "Воспроизвести"}
              aria-label={playing ? "Пауза" : "Воспроизвести"}
              onClick={togglePlayback}
            >
              {playing ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" />
              )}
            </button>
            <button
              title="Следующий трек"
              aria-label="Следующий трек"
              onClick={() => skip(1)}
            >
              <SkipForward size={19} fill="currentColor" />
            </button>
            <button
              title={repeatMode === "playlist" ? "Зациклить плейлист: включено" : "Зациклить плейлист"}
              aria-label={repeatMode === "playlist" ? "Зациклить плейлист: включено" : "Зациклить плейлист"}
              className={`repeat-playlist-button ${repeatMode === "playlist" ? "control-active" : ""}`}
              onClick={() => {
                const next = repeatMode === "playlist" ? "off" : "playlist";
                setRepeatMode(next);
                if (nativeApp) setNativeLoopMode(next === "playlist" ? 1 : 0);
              }}
            >
              <Repeat size={17} />
            </button>
            <button
              title={repeatMode === "track" ? "Повтор трека: включено" : "Повторять один трек"}
              aria-label={repeatMode === "track" ? "Повтор трека: включено" : "Повторять один трек"}
              className={`repeat-track-button ${repeatMode === "track" ? "control-active" : ""}`}
              onClick={() => {
                const next = repeatMode === "track" ? "off" : "track";
                setRepeatMode(next);
                if (nativeApp) setNativeLoopMode(next === "track" ? 2 : 0);
              }}
            >
              <Repeat1 size={17} />
            </button>
          </div>

          <div className="player-timeline">
            <span>{formatTime(elapsed)}</span>
            <input
              aria-label="Позиция трека"
              type="range"
              min="0"
              max={duration || 1}
              step="0.1"
              value={Math.min(elapsed, duration || 1)}
              style={{ "--progress": `${seekPercent}%` } as CSSProperties}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (current.source === "soundcloud") soundcloudPlayerRef.current?.seekTo(value);
                else if (audioRef.current) audioRef.current.currentTime = value;
                setElapsed(value);
              }}
            />
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="player-right">
          <button
            className="icon-button queue-button"
            title="Очередь воспроизведения"
            aria-label="Очередь воспроизведения"
            onClick={() => setQueueOpen(true)}
          >
            <ListMusic size={19} />
          </button>
          <span className="player-divider" />
          <button
            className="icon-button volume-button"
            title={volume ? "Выключить звук" : "Включить звук"}
            aria-label={volume ? "Выключить звук" : "Включить звук"}
            onClick={() => {
              const next = volume ? 0 : 0.72;
              setVolume(next);
              if (audioRef.current) audioRef.current.volume = next;
            }}
          >
            {volume ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
          <input
            aria-label="Громкость"
            className="volume-slider"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            style={{ "--progress": `${volume * 100}%` } as CSSProperties}
            onChange={(event) => {
              const next = Number(event.target.value);
              setVolume(next);
              if (audioRef.current) audioRef.current.volume = next;
            }}
          />
          <span className="volume-label">{Math.round(volume * 100)}%</span>
        </div>
      </div>

      {toast && (
        <div className="toast">
          <Check size={16} /> {toast}
        </div>
      )}

      {(trackToAdd || creating || queueOpen) && (
        <div
          className="modal-backdrop"
          onMouseDown={() => {
            setTrackToAdd(null);
            setCreating(false);
            setQueueOpen(false);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="small-kicker">
                  {queueOpen ? "ВАША МУЗЫКА" : "ВАША КОЛЛЕКЦИЯ"}
                </span>
                <h2>
                  {creating ? "Новый плейлист" : queueOpen ? "Очередь воспроизведения" : "Добавить в плейлист"}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Закрыть"
                onClick={() => {
                  setTrackToAdd(null);
                  setCreating(false);
                  setQueueOpen(false);
                }}
              >
                <X size={20} />
              </button>
            </div>

            {creating ? (
              <form onSubmit={createPlaylist} className="create-form">
                <label htmlFor="playlist-name">Название плейлиста</label>
                <input
                  id="playlist-name"
                  autoFocus
                  maxLength={80}
                  placeholder="Например, для хорошего дня"
                  value={playlistName}
                  onChange={(event) => setPlaylistName(event.target.value)}
                />
                <p>Соберите здесь треки, которые хочется слушать снова.</p>
                <button className="solid-button" disabled={!playlistName.trim() || saving}>
                  {saving ? "Создаём..." : "Создать плейлист"}
                </button>
              </form>
            ) : queueOpen ? (
              <div className="modal-list queue-list">
                {queue.map((track) => (
                  <button
                    key={track.id}
                    onClick={() => {
                      playTrack(track, queue);
                      setQueueOpen(false);
                    }}
                  >
                    <Artwork track={track} className="modal-track-art" />
                    <span>
                      <strong>{track.title}</strong>
                      <small>{track.artist}</small>
                    </span>
                    {current.id === track.id ? (
                      <AudioLines size={18} className="state-purple" />
                    ) : (
                      <Play size={16} />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <p className="modal-description">
                  Выберите, куда добавить <strong>{trackToAdd?.title}</strong>
                </p>
                <div className="modal-list">
                  {customPlaylists.map((playlist) => (
                    <button
                      key={playlist.id}
                      onClick={() => trackToAdd && addToPlaylist(playlist.id, trackToAdd)}
                    >
                      <span className={`playlist-icon ${playlist.color}`}>
                        <Music2 size={16} />
                      </span>
                      <span>
                        <strong>{playlist.name}</strong>
                        <small>
                          {playlist.tracks.length} {pluralTracks(playlist.tracks.length)}
                        </small>
                      </span>
                      <Plus size={18} />
                    </button>
                  ))}
                  <button className="modal-create" onClick={() => setCreating(true)}>
                    <span className="modal-plus">
                      <Plus size={19} />
                    </span>
                    <span>
                      <strong>Создать плейлист</strong>
                      <small>Для новых музыкальных историй</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ShareImportModal
        open={shareImportOpen}
        loading={shareImportLoading}
        onClose={() => setShareImportOpen(false)}
        onImport={(value) => {
          setShareImportLink(value);
          void importSharedPlaylist(value);
        }}
      />

      {share.open && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setShare((prev) => ({ ...prev, open: false }))}
        >
          <div className="modal share-modal" role="dialog" aria-modal="true" aria-label="Поделиться плейлистом" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="small-kicker">ПОДЕЛИТЬСЯ ПЛЕЙЛИСТОМ</span>
                <h2>{share.name}</h2>
              </div>
              <button className="icon-button" aria-label="Закрыть" onClick={() => setShare((prev) => ({ ...prev, open: false }))}>
                <X size={20} />
              </button>
            </div>

            {share.loading ? (
              <div className="state-box" style={{ minHeight: 200 }}>
                <LoaderCircle size={26} className="spin state-purple" />
                <strong>Готовим QR-код...</strong>
                <p>Собираем ссылки на треки плейлиста</p>
              </div>
            ) : share.error ? (
              <div className="state-box" style={{ minHeight: 180 }}>
                <Share2 size={26} className="state-purple" />
                <strong>Не удалось поделиться</strong>
                <p>{share.error}</p>
                <button className="solid-button" onClick={() => setShare((prev) => ({ ...prev, open: false }))}>Закрыть</button>
              </div>
            ) : (
              <>
                <p className="share-summary">
                  {share.linkCount} из {share.tracks.length} треков со ссылками. Наведите камеру телефона на QR-код, чтобы открыть плейлист и все ссылки.
                  {share.missingCount > 0 ? ` Локальные файлы (${share.missingCount}) доступны только на вашем устройстве.` : ""}
                </p>

                <div className="share-qr-wrap">
                  <img
                    src={shareQrView === "links" && share.qrLinks ? share.qrLinks : share.qrPage}
                    alt="QR-код плейлиста"
                    width={220}
                    height={220}
                  />
                  <small>
                    {shareQrView === "links" && share.qrLinks
                      ? "В этом QR-коде зашиты все ссылки на треки"
                      : "В этом QR-коде — ссылка на страницу плейлиста со всеми ссылками"}
                  </small>
                  {share.qrLinks && (
                    <div className="share-qr-tabs">
                      <button type="button" className={shareQrView === "links" ? "active" : ""} onClick={() => setShareQrView("links")}>Все ссылки</button>
                      <button type="button" className={shareQrView === "page" ? "active" : ""} onClick={() => setShareQrView("page")}>Страница плейлиста</button>
                    </div>
                  )}
                </div>

                <div className="share-link-row">
                  <input readOnly value={share.url} aria-label="Ссылка на плейлист" onFocus={(event) => event.currentTarget.select()} />
                  <a className="solid-button" href={share.url} target="_blank" rel="noreferrer">Открыть</a>
                </div>

                <div className="share-tracks share-modal-tracks">
                  {share.tracks.map((track, index) => (
                    <div className="share-track" key={`${track.title}-${index}`}>
                      <span className="share-track-index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="share-track-copy">
                        <strong>{track.title}</strong>
                        {track.url ? <a href={track.url} target="_blank" rel="noreferrer">{track.url}</a> : <span>локальный файл — только на вашем устройстве</span>}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="share-actions">
                  <CopyLinksButton text={share.linksText || share.url} />
                  <a className="solid-button" href={share.url} target="_blank" rel="noreferrer">
                    Страница для друзей ↗
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
