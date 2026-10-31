import { db } from "@/db";
import { dislikedTracks, excludedEntities, libraryTracks, playlistTracks, playlists } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { searchHitmos, getHitmosTopTracks, getHitmosGenreTracks } from "@/lib/hitmos";
import {
  GENRES,
  MOOD_GENRES,
  classifyGenres,
  detectLanguage,
  detectMoods,
  detectVersionTags,
  genreHitmosIds,
  genreName,
} from "@/lib/genre-taxonomy";
import { computeExclusions, isExcludedTrack, normalizeKey, type DislikedTrackRow } from "@/lib/dislikes";
import { getProfileId } from "@/lib/profile";
import type { Track } from "@/lib/music";

export const dynamic = "force-dynamic";

type Mode = "favorites" | "similar" | "mood" | "genre";

type TasteEntry = { artist: string; title: string; duration: number; weight: number };

type RecommendationRequest = {
  mode?: Mode;
  currentTrack?: { id?: string; title?: string; artist?: string };
  mood?: string;
  genre?: string;
  customMoodText?: string;
  userArtists?: string[];
  tasteEntries?: { artist?: string; title?: string; duration?: number; weight?: number }[];
  experimentalPercent?: number;
  excludeIds?: string[];
};

type MoodPreset = {
  queries: string[];
  label: string;
  moodKey?: "calm" | "energy" | "focus" | "sad";
  genreSlugs: string[];
  textKeywords: string[];
};

const MOOD_QUERIES: Record<string, MoodPreset> = {
  chill: {
    queries: ["Chillout", "Lounge", "Lo-Fi"],
    label: "Вечерний чилл и релакс",
    moodKey: "calm",
    genreSlugs: MOOD_GENRES.chill,
    textKeywords: ["chill", "чилл", "lounge", "лаунж", "lofi", "lo-fi", "лофай", "relax", "релакс", "calm", "спокойн", "ambient", "эмбиент", "rain", "дождь", "night", "ночь", "sleep", "сон", "coffee", "кофе", "dream"],
  },
  energy: {
    queries: ["Танцевальная", "Club", "Dance"],
    label: "Драйв и заряд энергии",
    moodKey: "energy",
    genreSlugs: MOOD_GENRES.energy,
    textKeywords: ["dance", "танц", "club", "клуб", "energy", "энерг", "драйв", "drive", "party", "вечерин", "workout", "спорт", "run", "бег", "fitness", "фитнес", "rave", "рейв", "bass", "bassboosted", "remix", "ремикс", "bpm"],
  },
  focus: {
    queries: ["Piano", "Ambient", "Instrumental"],
    label: "Концентрация и работа",
    moodKey: "focus",
    genreSlugs: MOOD_GENRES.focus,
    textKeywords: ["piano", "пианино", "фортепиано", "focus", "фокус", "classic", "классик", "instrumental", "инструментал", "study", "учёб", "work", "работ", "ambient", "эмбиент", "concentration", "концентрац", "neoclassic", "неоклассик", "minimal", "минимал", "nocturne", "ноктюрн", "sonata", "соната", "prelude", "прелюд", "etude", "этюд"],
  },
  sad: {
    queries: ["Лирика", "Акустика", "Меланхолия"],
    label: "Лирика и меланхолия",
    moodKey: "sad",
    genreSlugs: MOOD_GENRES.sad,
    textKeywords: ["груст", "sad", "меланхол", "лирик", "lonely", "одинок", "broken", "pain", "боль", "tears", "слез", "sorry", "прости", "goodbye", "прощай", "miss", "скуча", "alone", "один", "дождь", "rain", "piano", "акустик", "acoustic"],
  },
  rap: {
    queries: ["Русский рэп", "Хип-хоп", "Trap"],
    label: "Рэп и хип-хоп вайб",
    genreSlugs: MOOD_GENRES.rap,
    textKeywords: ["рэп", "rap", "хип-хоп", "hip hop", "trap", "трэп", "drill", "дрилл", "flow", "фристайл"],
  },
  rock: {
    queries: ["Русский рок", "Rock", "Альтернатива"],
    label: "Рок и живой звук",
    genreSlugs: MOOD_GENRES.rock,
    textKeywords: ["rock", "рок", "гитар", "guitar", "punk", "панк", "metal", "метал", "альтернатив", "grunge", "indie rock"],
  },
};

// Широкий набор «далёких» жанров — каждый раз выбираем случайные, чтобы эксперименты менялись
const EXPLORATION_GENRES = [
  "jazz",
  "classical",
  "reggae",
  "country",
  "soviet",
  "kpop",
  "anime",
  "blues",
  "soul",
  "disco",
  "techno",
  "metal",
  "french",
  "rnb",
  "trance",
  "dnb",
  "dubstep",
  "hardcore",
  "avtorskaya",
  "chanson",
  "spanish",
  "reggaeton",
  "latin",
  "gospel",
  "folk",
  "soundtrack",
  "jpop",
  "celtic",
  "afrobeat",
  "trip-hop",
];

function splitArtists(artistString?: string): string[] {
  if (!artistString) return [];
  return artistString
    .split(/[,&/;+]|\s+(?:feat\.?|ft\.?|featuring|x|×|и|and|vs\.?|при участии|prod\.?\s*by)\s+|\s*[(\[]\s*(?:feat\.?|ft\.?)\s*/i)
    .map((a) => a.replace(/[()\[\]]/g, ""))
    .map((a) => a.trim())
    .filter((a) => a.length > 1 && !/^(неизвестный|с устройства|на устройстве|hitmos|soundcloud)$/i.test(a));
}

function titleKeywords(title?: string): string[] {
  if (!title) return [];
  return title
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeIdentity(track: Track): string {
  const clean = (value: string) =>
    value.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
  return `${clean(track.artist)} :: ${clean(track.title)}`;
}

type TasteProfile = {
  artistLookup: Map<string, { name: string; value: number }>;
  genreScores: Map<string, number>;
  moodScores: Record<string, number>;
  langScores: Record<string, number>;
  tagScores: Map<string, number>;
  keywordScores: Map<string, number>;
  avgDuration: number;
  durationCount: number;
  topArtists: string[];
};

function buildProfile(entries: TasteEntry[]): TasteProfile {
  const artistLookup = new Map<string, { name: string; value: number }>();
  const genreScores = new Map<string, number>();
  const moodScores: Record<string, number> = { calm: 0, energy: 0, sad: 0, focus: 0 };
  const langScores: Record<string, number> = { ru: 0, en: 0, mix: 0, instrumental: 0 };
  const tagScores = new Map<string, number>();
  const keywordScores = new Map<string, number>();
  let durationSum = 0;
  let durationWeight = 0;

  for (const entry of entries) {
    const w = entry.weight > 0 ? entry.weight : 1;
    for (const artist of splitArtists(entry.artist)) {
      const key = normalizeKey(artist);
      if (!key) continue;
      const current = artistLookup.get(key);
      artistLookup.set(key, { name: current?.name || artist, value: (current?.value || 0) + w });
    }
    classifyGenres(entry.artist, entry.title).forEach((slug, index) => {
      genreScores.set(slug, (genreScores.get(slug) || 0) + w * (index === 0 ? 1 : 0.5));
    });
    for (const [mood, count] of Object.entries(detectMoods(entry.artist, entry.title))) {
      moodScores[mood] += count * w;
    }
    langScores[detectLanguage(entry.artist, entry.title)] += w;
    for (const tag of detectVersionTags(entry.title)) {
      tagScores.set(tag, (tagScores.get(tag) || 0) + w);
    }
    for (const word of titleKeywords(entry.title)) {
      keywordScores.set(word, (keywordScores.get(word) || 0) + w);
    }
    if (entry.duration > 30) {
      durationSum += entry.duration * w;
      durationWeight += w;
    }
  }

  const topArtists = Array.from(artistLookup.values())
    .sort((a, b) => b.value - a.value)
    .map((a) => a.name);

  return {
    artistLookup,
    genreScores,
    moodScores,
    langScores,
    tagScores,
    keywordScores,
    avgDuration: durationWeight > 0 ? Math.round(durationSum / durationWeight) : 0,
    durationCount: durationWeight,
    topArtists,
  };
}

function topKeys(map: Map<string, number>, limit: number): string[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

type ScoredTrack = { track: Track; score: number; reason: string };
type SeedContext = { artists: Set<string>; displayNames: Map<string, string>; genres: Set<string>; keywords: Set<string>; title: string };

/** Однофамильцы: имя совпало, но жанр и тематика названий совсем другие. */
function isDifferentArtistWithSameName(track: Track, seed: SeedContext): boolean {
  const artistNames = splitArtists(track.artist).map((a) => normalizeKey(a));
  const matchesSeedName = artistNames.some((name) => seed.artists.has(name));
  if (!matchesSeedName || seed.artists.size === 0) return false;
  const genres = classifyGenres(track.artist, track.title);
  const genreOverlap = genres.some((slug) => seed.genres.has(slug));
  if (genreOverlap) return false;
  if (seed.genres.size === 0 && seed.keywords.size === 0) return false;
  const keywordOverlap = titleKeywords(track.title).some((w) => seed.keywords.has(w));
  return !keywordOverlap;
}

function scoreCandidate(
  track: Track,
  profile: TasteProfile,
  maxArtist: number,
  maxGenre: number,
  seed: SeedContext,
  targetMood?: { key: "calm" | "energy" | "focus" | "sad"; label: string; genres: Set<string> },
  collaborators?: { keys: Set<string>; names: Map<string, string> },
): ScoredTrack {
  const parts: string[] = [];
  let score = 0;
  if (collaborators && collaborators.keys.size > 0) {
    const joint = splitArtists(track.artist).map((a) => normalizeKey(a)).find((a) => collaborators.keys.has(a));
    if (joint) {
      score += 20;
      parts.push(`совместные треки с ${collaborators.names.get(joint) || joint}`);
    }
  }
  const genres = classifyGenres(track.artist, track.title);
  const differentArtist = isDifferentArtistWithSameName(track, seed);

  // 1. Похожесть на текущий трек (радио по треку)
  if (seed.artists.size > 0) {
    const names = splitArtists(track.artist).map((a) => normalizeKey(a));
    const sameArtist = names.some((n) => seed.artists.has(n));
    if (sameArtist && !differentArtist) {
      score += 26;
      parts.push(`Похоже на ${seed.title}`);
    }
    const genreOverlap = genres.filter((slug) => seed.genres.has(slug));
    if (genreOverlap.length > 0) {
      score += 18;
      parts.push(`В духе ${seed.title}`);
    }
    const keywordHits = titleKeywords(track.title).filter((w) => seed.keywords.has(w)).length;
    if (keywordHits > 0) {
      score += Math.min(keywordHits * 5, 12);
      parts.push("похожее название");
    }
    if (sameArtist && differentArtist) score -= 22; // однофамилец из другого жанра
  }

  // 2. Исполнитель из профиля вкуса — до 28 баллов
  let artistHit = 0;
  let artistName = "";
  for (const artist of splitArtists(track.artist)) {
    const found = profile.artistLookup.get(normalizeKey(artist));
    if (found && found.value > artistHit) {
      artistHit = found.value;
      artistName = found.name;
    }
  }
  if (artistHit > 0 && maxArtist > 0) {
    score += (artistHit / maxArtist) * 28;
    parts.push(`В духе ${artistName}`);
  }

  // 3. Жанр — до 26 баллов
  let genreScore = 0;
  let genreNameHit = "";
  for (const slug of genres) {
    const value = profile.genreScores.get(slug) || 0;
    if (value > genreScore) {
      genreScore = value;
      genreNameHit = genreName(slug);
    }
  }
  if (genreScore > 0 && maxGenre > 0) {
    score += (genreScore / maxGenre) * 26;
    parts.push(`жанр «${genreNameHit}»`);
  }

  // 4. Настроение — до 24 баллов (в режиме настроения максимальный вес)
  const moods = detectMoods(track.artist, track.title);
  if (targetMood) {
    const raw = (moods[targetMood.key] || 0) + (genres.some((g) => targetMood.genres.has(g)) ? 2 : 0);
    if (raw > 0) {
      score += Math.min(raw * 6, 24);
      parts.unshift(`Подходит под настроение`);
    }
  } else {
    const profileMoodTotal =
      profile.moodScores.calm + profile.moodScores.energy + profile.moodScores.sad + profile.moodScores.focus;
    if (profileMoodTotal > 0) {
      let overlap = 0;
      for (const [mood, count] of Object.entries(moods)) {
        overlap += Math.min(count, 2) * (profile.moodScores[mood] / profileMoodTotal);
      }
      score += Math.min(overlap * 6, 10);
    }
  }

  // 5. Тематика названий из профиля — до 8
  let keywordHits = 0;
  for (const word of titleKeywords(track.title)) {
    if (profile.keywordScores.has(word)) keywordHits++;
  }
  score += Math.min(keywordHits * 2.5, 8);

  // 7. Язык — до 4
  const langTotal =
    profile.langScores.ru + profile.langScores.en + profile.langScores.mix + profile.langScores.instrumental;
  if (langTotal > 0) {
    score += ((profile.langScores[detectLanguage(track.artist, track.title)] || 0) / langTotal) * 4;
  }

  // 8. Версии — до 4
  for (const tag of detectVersionTags(track.title)) {
    if (profile.tagScores.has(tag)) {
      score += 4;
      parts.push(tag === "cover" ? "любите каверы" : tag === "remix" ? "любите ремиксы" : `версия ${tag}`);
      break;
    }
  }

  score += Math.random() * 3;
  const reason = parts.length > 0 ? Array.from(new Set(parts)).slice(0, 2).join(" · ") : "Может понравиться";
  return { track, score, reason };
}

async function collectPool(tasks: (() => Promise<Track[]>)[]): Promise<Track[]> {
  const settled = await Promise.allSettled(tasks.map((task) => task()));
  const merged = new Map<string, Track>();
  const seenIdentity = new Set<string>();
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const track of result.value) {
      if (merged.has(track.id)) continue;
      const identity = normalizeIdentity(track);
      if (seenIdentity.has(identity)) continue;
      seenIdentity.add(identity);
      merged.set(track.id, track);
    }
  }
  return Array.from(merged.values());
}

/** Разные исполнители: не более perArtist треков подряд от одного артиста. */
function diversify(tracks: ScoredTrack[], limit: number, perArtist = 2): ScoredTrack[] {
  const sorted = [...tracks].sort((a, b) => b.score - a.score);
  const picked: ScoredTrack[] = [];
  const counts = new Map<string, number>();
  for (const item of sorted) {
    if (picked.length >= limit) break;
    const key = normalizeKey(item.track.artist);
    const count = counts.get(key) || 0;
    if (count >= perArtist) continue;
    counts.set(key, count + 1);
    picked.push(item);
  }
  return picked;
}

/** Проход по разным исполнителям: чередует исполнителей, чтобы список не был однотипным. */
function interleaveByArtist(tracks: Track[]): Track[] {
  const buckets = new Map<string, Track[]>();
  for (const track of tracks) {
    const key = normalizeKey(track.artist);
    const list = buckets.get(key) || [];
    list.push(track);
    buckets.set(key, list);
  }
  const queues = shuffle(Array.from(buckets.values()));
  const result: Track[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        result.push(next);
        added = true;
      }
    }
  }
  return result;
}

function interleaveExperimental(normal: Track[], experimental: Track[]): Track[] {
  if (experimental.length === 0) return normal;
  const result: Track[] = [];
  const step = Math.max(2, Math.round(normal.length / experimental.length));
  let index = 0;
  normal.forEach((track, i) => {
    result.push(track);
    if ((i + 1) % step === 0 && index < experimental.length) result.push(experimental[index++]);
  });
  while (index < experimental.length) result.push(experimental[index++]);
  return result;
}

type Similarity = { score: number; reason: string } | null;

/**
 * Оценка реальной похожести трека на исходный (радио по треку).
 * Возвращает null, если трек не похож — тогда он не попадает в подборку.
 * Приоритет: тот же исполнитель → совместные треки → тот же жанр → похожие слова.
 */
function scoreSimilarity(
  track: Track,
  seed: SeedContext,
  collaboratorKeys: Set<string>,
  collaboratorNames: Map<string, string>,
): Similarity {
  const trackArtists = splitArtists(track.artist).map((a) => normalizeKey(a));
  const seedNames = Array.from(seed.artists);

  // 1. Ровно тот же исполнитель — максимальная похожесть
  const sameArtists = trackArtists.filter((a) => seed.artists.has(a));
  if (sameArtists.length > 0) {
    const names = sameArtists.map((a) => seed.displayNames.get(a) || seedNames.find((n) => n === a) || a);
    const bonus = Math.min(sameArtists.length - 1, 2) * 3; // трек сразу нескольких исходных авторов — ещё ближе
    return { score: 100 + bonus, reason: sameArtists.length > 1 ? `Те же исполнители — ${names.join(", ")}` : `Тот же исполнитель — ${names[0]}` };
  }

  // 2. Исполнитель, с которым у исходного есть совместные треки (любой из авторов трека)
  const joints = trackArtists.filter((a) => collaboratorKeys.has(a));
  if (joints.length > 0) {
    const partners = joints.map((key) => collaboratorNames.get(key) || key);
    return { score: 82 + Math.min(joints.length - 1, 2) * 3, reason: `Совместные треки с ${partners.slice(0, 2).join(", ")}` };
  }

  // 3. Тот же жанр
  const genres = classifyGenres(track.artist, track.title);
  const genreOverlap = genres.filter((slug) => seed.genres.has(slug));
  if (genreOverlap.length > 0) {
    const genreLabel = genreName(genreOverlap[0]);
    const bonus = Math.min(seed.keywords.size > 0 ? 4 : 0, 4);
    return { score: 62 + genreOverlap.length * 4 + bonus, reason: `Тот же жанр — ${genreLabel}` };
  }

  // 4. Похожие слова в названии (тема трека)
  if (seed.keywords.size > 0) {
    const words = titleKeywords(track.title);
    const hits = words.filter((word) => seed.keywords.has(word));
    if (hits.length >= 2) {
      return { score: 44 + hits.length * 3, reason: `Похожая тема — «${hits.slice(0, 2).join(", ")}»` };
    }
    if (hits.length === 1 && genres.length > 0 && genres[0] === Array.from(seed.genres)[0]) {
      return { score: 40, reason: `Похожая тема — «${hits[0]}»` };
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    let body: RecommendationRequest = {};
    try {
      body = await request.json();
    } catch {
      // пустое тело
    }

    const mode: Mode = body.mode === "similar" || body.mode === "mood" || body.mode === "genre" ? body.mode : "favorites";
    const requestedGenre = GENRES.find((g) => g.slug === String(body.genre || ""));
    const excludeSet = new Set<string>((body.excludeIds || []).filter((id) => typeof id === "string"));
    const experimentalPercent = Math.min(30, Math.max(0, body.experimentalPercent ?? 15));

    const profileId = await getProfileId(request);

    // --- Дизлайки: исключаем треки, исполнителей и жанры ---
    const dislikedRows = (await db
      .select()
      .from(dislikedTracks)
      .where(eq(dislikedTracks.profileId, profileId))
      .limit(500)) as DislikedTrackRow[];
    const overrides = await db
      .select()
      .from(excludedEntities)
      .where(eq(excludedEntities.profileId, profileId));
    const exclusions = computeExclusions(dislikedRows, overrides);
    for (const id of exclusions.trackIds) excludeSet.add(id);

    // --- Профиль вкуса ---
    const entries: TasteEntry[] = [];
    const [favoritesPlaylist] = await db
      .select({ id: playlists.id })
      .from(playlists)
      .where(and(eq(playlists.profileId, profileId), eq(playlists.isSystem, true)));
    const dbFavorites = favoritesPlaylist
      ? await db
          .select({
            artist: playlistTracks.artist,
            title: playlistTracks.title,
            trackId: playlistTracks.trackId,
            duration: playlistTracks.duration,
          })
          .from(playlistTracks)
          .where(eq(playlistTracks.playlistId, favoritesPlaylist.id))
      : [];
    for (const fav of dbFavorites) {
      excludeSet.add(fav.trackId);
      entries.push({ artist: fav.artist, title: fav.title, duration: fav.duration || 0, weight: 3 });
    }

    // Медиатека пользователя тоже формирует вкус
    const libraryRows = await db
      .select({ artist: libraryTracks.artist, title: libraryTracks.title, duration: libraryTracks.duration })
      .from(libraryTracks)
      .where(eq(libraryTracks.profileId, profileId))
      .limit(120);
    for (const row of libraryRows) {
      entries.push({ artist: row.artist, title: row.title, duration: row.duration || 0, weight: 2 });
    }
    for (const artist of body.userArtists || []) entries.push({ artist, title: "", duration: 0, weight: 2 });
    for (const entry of body.tasteEntries || []) {
      if (!entry || typeof entry.artist !== "string") continue;
      entries.push({
        artist: entry.artist.slice(0, 120),
        title: typeof entry.title === "string" ? entry.title.slice(0, 160) : "",
        duration: typeof entry.duration === "number" ? entry.duration : 0,
        weight: typeof entry.weight === "number" && entry.weight > 0 ? Math.min(entry.weight, 5) : 1,
      });
    }

    const profile = buildProfile(entries);
    const maxArtist = Math.max(1, ...Array.from(profile.artistLookup.values()).map((v) => v.value));
    const maxGenre = Math.max(1, ...Array.from(profile.genreScores.values()));

    // Сам исходный трек не должен попадать в собственные рекомендации
    if (body.currentTrack?.id) excludeSet.add(body.currentTrack.id);

    const seedTitle = body.currentTrack?.title?.trim() || "";
    const seedArtistRaw = body.currentTrack?.artist?.trim() || "";
    const seed: SeedContext = {
      artists: new Set(splitArtists(seedArtistRaw).map((a) => normalizeKey(a))),
      displayNames: new Map(splitArtists(seedArtistRaw).map((a) => [normalizeKey(a), a])),
      genres: new Set(seedArtistRaw ? classifyGenres(seedArtistRaw, seedTitle) : []),
      keywords: new Set(titleKeywords(seedTitle)),
      title: seedArtistRaw,
    };

    let pool: Track[] = [];
    let title = "Моя умная волна";
    let reasonSummary = "Персональная умная волна";
    let targetMood: { key: "calm" | "energy" | "focus" | "sad"; label: string; genres: Set<string> } | undefined;
    let moodFilter: ((track: Track) => number) | undefined;
    let moodLabel = "";

    let collaboratorKeys = new Set<string>();
    let collaboratorNames = new Map<string, string>();
    let genreChartIds = new Set<string>();

    if (mode === "similar" && seedArtistRaw) {
      const artists = splitArtists(seedArtistRaw);
      const primaryArtist = artists[0] || seedArtistRaw;
      title = `Радио по треку: ${seedArtistRaw} — ${seedTitle}`;
      reasonSummary = `Только похожие треки: тот же исполнитель, совместные фиты и тот же жанр`;

      // 1. Треки каждого исполнителя исходного трека (в песне может быть несколько авторов через «,»)
      const seedArtistList = artists.length ? artists.slice(0, 3) : [primaryArtist];
      const perArtistTracks = await Promise.all(
        seedArtistList.map((name) => searchHitmos(name, 24).catch(() => [] as Track[])),
      );
      const sameArtistTracks = perArtistTracks.flat();

      // 2. Совместные исполнители: все соавторы исходного трека + все, кто встречается
      //    в треках каждого из исходных исполнителей. Считаем число совместных треков.
      const jointCount = new Map<string, number>();
      const addCollaborator = (artist: string, weight: number) => {
        const key = normalizeKey(artist);
        if (!key || seed.artists.has(key)) return;
        collaboratorKeys.add(key);
        if (!collaboratorNames.has(key)) collaboratorNames.set(key, artist);
        jointCount.set(key, (jointCount.get(key) || 0) + weight);
      };
      for (const artist of artists) addCollaborator(artist, 5); // соавторы самого трека — самые близкие
      for (const track of sameArtistTracks) {
        const names = splitArtists(track.artist);
        const normalized = names.map((n) => normalizeKey(n));
        // Совместный трек: среди авторов есть исходный исполнитель и кто-то ещё.
        if (!normalized.some((n) => seed.artists.has(n))) continue;
        for (const name of names) addCollaborator(name, 1);
      }

      // 3. Треки соавторов — чаще всего совместных сначала
      const collaboratorList = Array.from(jointCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([key]) => collaboratorNames.get(key) || key);
      const collaboratorTracks = await Promise.all(
        collaboratorList.map((name) => searchHitmos(name, 12).catch(() => [])),
      );

      // 4. Чарты того же жанра
      const seedGenreIds = genreHitmosIds(Array.from(seed.genres));
      const genreTracks = await Promise.all(
        seedGenreIds.slice(0, 2).map((id) => getHitmosGenreTracks(id, 50).catch(() => [])),
      );

      pool = await collectPool([
        async () => sameArtistTracks,
        ...collaboratorTracks.map((tracks) => async () => tracks),
        ...genreTracks.map((tracks) => async () => tracks),
      ]);
    } else if (mode === "genre") {
      // Сравнение по жанру: берём жанровый чарт Hitmos и оставляем только треки этого жанра,
      // а внутри него ранжируем по вкусу пользователя (любимые исполнители, язык, длительность).
      const topGenres = topKeys(profile.genreScores, 1);
      const genre = requestedGenre || GENRES.find((g) => g.slug === topGenres[0]) || GENRES[0];
      title = `Жанр: ${genre.name}`;
      reasonSummary = `Треки жанра «${genre.name}», отсортированные по совпадению с вашим вкусом`;
      const chart = await getHitmosGenreTracks(genre.hitmosId, 100).catch(() => [] as Track[]);
      genreChartIds = new Set(chart.map((t) => t.id));
      const favoriteInGenre = profile.topArtists
        .filter((artist) => classifyGenres(artist, "").includes(genre.slug))
        .slice(0, 3);
      pool = await collectPool([
        async () => chart,
        () => searchHitmos(genre.name, 30),
        ...favoriteInGenre.map((artist) => () => searchHitmos(artist, 12)),
      ]);
      seed.genres.add(genre.slug);
    } else if (mode === "mood") {
      const moodKey = (body.mood || "chill").toLowerCase();
      const customText = (body.customMoodText || "").trim();
      const preset = MOOD_QUERIES[moodKey];
      const queries = customText ? [customText, `${customText} музыка`] : preset?.queries || ["Chillout"];
      moodLabel = customText ? `Настроение: «${customText}»` : preset?.label || "По вашему настроению";
      title = moodLabel;
      reasonSummary = `Реально подходящие треки под настроение: ${moodLabel}`;

      if (preset?.moodKey) {
        targetMood = { key: preset.moodKey, label: moodLabel, genres: new Set(preset.genreSlugs) };
      }
      const genreSlugs = preset?.genreSlugs || [];
      const genreIds = genreHitmosIds(genreSlugs);
      const textKeywords = customText
        ? customText.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
        : preset?.textKeywords || [];

      moodFilter = (track: Track) => {
        const moods = detectMoods(track.artist, track.title);
        const genres = classifyGenres(track.artist, track.title);
        const text = `${track.artist} ${track.title}`.toLowerCase().replace(/ё/g, "е");
        let fit = 0;
        if (targetMood) fit += (moods[targetMood.key] || 0) * 3;
        if (genres.some((g) => genreSlugs.includes(g))) fit += 4;
        for (const keyword of textKeywords) {
          if (text.includes(keyword)) fit += 3;
        }
        if (customText && text.includes(customText.toLowerCase())) fit += 4;
        return fit;
      };

      pool = await collectPool([
        ...queries.slice(0, 3).map((q) => () => searchHitmos(q, 30)),
        ...genreIds.slice(0, 5).map((id) => () => getHitmosGenreTracks(id, 60)),
      ]);
    } else {
      const topArtists = profile.topArtists.slice(0, 4);
      const topGenres = topKeys(profile.genreScores, 3);
      const genreIds = genreHitmosIds(topGenres);
      reasonSummary =
        profile.topArtists.length > 0
          ? `Анализ медиатеки и любимых: ${profile.topArtists.slice(0, 3).join(", ")} + жанры`
          : "Персональная умная волна: свежие новинки и рекомендации";

      const topArtistTracks = await Promise.all(topArtists.map((artist) => searchHitmos(artist, 18).catch(() => [] as Track[])));
      // Соавторы любимых исполнителей (учитываем несколько авторов в треке через «,», «feat.», «&»)
      const topKeys_ = new Set(topArtists.map((a) => normalizeKey(a)));
      const jointCount = new Map<string, { name: string; count: number; withArtist: string }>();
      topArtistTracks.forEach((tracks, index) => {
        for (const track of tracks) {
          const names = splitArtists(track.artist);
          if (!names.map((n) => normalizeKey(n)).some((n) => topKeys_.has(n))) continue;
          for (const name of names) {
            const key = normalizeKey(name);
            if (!key || topKeys_.has(key) || profile.artistLookup.has(key)) continue;
            const current = jointCount.get(key);
            jointCount.set(key, { name, count: (current?.count || 0) + 1, withArtist: current?.withArtist || topArtists[index] });
          }
        }
      });
      const collaborators = Array.from(jointCount.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 4);
      for (const [key, info] of collaborators) {
        collaboratorKeys.add(key);
        collaboratorNames.set(key, `${info.name} (с ${info.withArtist})`);
      }
      pool = await collectPool([
        ...topArtistTracks.map((tracks) => async () => tracks),
        ...collaborators.map(([, info]) => () => searchHitmos(info.name, 10)),
        ...genreIds.map((id) => () => getHitmosGenreTracks(id, 60)),
        () => getHitmosTopTracks(30),
      ]);
    }

    // Фильтрация: исключения, дизлайки, однофамильцы, соответствие настроению
    const candidates = pool.filter((track) => {
      if (excludeSet.has(track.id)) return false;
      if (isExcludedTrack(track.artist, track.title, exclusions)) return false;
      if (mode === "similar" && isDifferentArtistWithSameName(track, seed)) return false;
      return true;
    });

    let scored: ScoredTrack[] = candidates.map((track) =>
      scoreCandidate(track, profile, maxArtist, maxGenre, seed, targetMood, { keys: collaboratorKeys, names: collaboratorNames })
    );

    if (mode === "similar" && seedArtistRaw) {
      // Радио по треку: оставляем только реально похожие треки.
      // Трек без явной связи с исходным (исполнитель, фит, жанр, тема) отбрасывается.
      scored = candidates
        .map((track) => {
          const similarity = scoreSimilarity(track, seed, collaboratorKeys, collaboratorNames);
          return similarity ? { track, score: similarity.score, reason: similarity.reason } : null;
        })
        .filter((item): item is ScoredTrack => item !== null);
    }

    if (mode === "genre") {
      const genreSlug = Array.from(seed.genres)[0] || "";
      const label = genreName(genreSlug);
      scored = scored
        .filter((item) => genreChartIds.has(item.track.id) || classifyGenres(item.track.artist, item.track.title).includes(genreSlug))
        .map((item) => {
          const byTaste = item.reason && !item.reason.startsWith("Свежий") ? ` · ${item.reason}` : "";
          const inChart = genreChartIds.has(item.track.id);
          return {
            ...item,
            score: item.score + (inChart ? 20 : 8),
            reason: `Жанр «${label}»${inChart ? " · из жанрового чарта" : ""}${byTaste}`.slice(0, 140),
          };
        });
    }

    if (mode === "mood" && moodFilter) {
      // Строгий режим: оставляем только треки, которые реально подходят под настроение
      const fitScores = new Map(candidates.map((track) => [track.id, moodFilter(track)]));
      let matched = scored.filter((item) => (fitScores.get(item.track.id) || 0) > 0);
      if (matched.length < 12) {
        // Мягкий порог, если строгих совпадений мало — но всё равно только с ненулевым fit
        matched = scored.filter((item) => (fitScores.get(item.track.id) || 0) >= 1);
      }
      scored = matched.map((item) => ({
        ...item,
        score: item.score + (fitScores.get(item.track.id) || 0) * 5,
      }));
    }

    const targetTotal = 36;
    const expCount = mode === "mood" || mode === "similar" || mode === "genre" ? 0 : Math.round((targetTotal * experimentalPercent) / 100);
    const normalTarget = Math.max(8, targetTotal - expCount);

    const diversified = diversify(scored, normalTarget);
    // Самый подходящий трек всегда стоит первым, остальные чередуются по исполнителям.
    const topPick = diversified[0];
    const restPicks = interleaveByArtist(
      diversified.slice(1).map((item) => {
        item.track.recommendationReason = item.reason;
        return item.track;
      })
    );
    if (topPick) topPick.track.recommendationReason = topPick.reason;
    const normal = topPick ? [topPick.track, ...restPicks] : [];

    // --- Эксперименты: каждый раз новые жанры и новые треки ---
    let experimental: Track[] = [];
    if (expCount > 0) {
      const knownGenres = new Set([...profile.genreScores.keys(), ...seed.genres, ...(targetMood?.genres || [])]);
      for (const slug of exclusions.genres) knownGenres.add(slug);
      const knownSlugs = new Set(GENRES.map((g) => g.slug));
      const distant = shuffle(
        EXPLORATION_GENRES.filter((slug) => knownSlugs.has(slug) && !knownGenres.has(slug)),
      ).slice(0, 4);
      let distantIds = genreHitmosIds(distant);
      if (distantIds.length < 2) {
        const fallback = shuffle(GENRES.filter((g) => !knownGenres.has(g.slug)).map((g) => g.slug));
        distantIds = genreHitmosIds([...distant, ...fallback].slice(0, 4));
      }
      const slugById = new Map(distantIds.map((id) => [id, GENRES.find((g) => g.hitmosId === id)?.slug || ""]));

      const poolTasks: { label: string; task: () => Promise<Track[]> }[] = [
        ...distantIds.map((id) => ({
          label: genreName(slugById.get(id) || ""),
          task: () => getHitmosGenreTracks(id, 60),
        })),
        { label: "Хит-парад", task: () => getHitmosTopTracks(40) },
      ];
      const results = await Promise.allSettled(poolTasks.map((p) => p.task()));
      const pools = results.map((result, index) => ({
        label: poolTasks[index].label,
        tracks: shuffle(result.status === "fulfilled" ? result.value : []),
      }));

      const seenArtists = new Set(normal.map((t) => normalizeKey(t.artist)));
      const seenIdentity = new Set([...normal].map((t) => normalizeIdentity(t)));
      const picked: Track[] = [];
      let progress = true;
      while (picked.length < expCount && progress) {
        progress = false;
        for (const poolItem of pools) {
          if (picked.length >= expCount) break;
          const next = poolItem.tracks.find((track) => {
            if (excludeSet.has(track.id)) return false;
            if (isExcludedTrack(track.artist, track.title, exclusions)) return false;
            if (seenIdentity.has(normalizeIdentity(track))) return false;
            if (seenArtists.has(normalizeKey(track.artist))) return false;
            return true;
          });
          if (!next) continue;
          poolItem.tracks = poolItem.tracks.filter((t) => t.id !== next.id);
          seenArtists.add(normalizeKey(next.artist));
          seenIdentity.add(normalizeIdentity(next));
          next.recommendationReason = `🧪 Эксперимент · «${poolItem.label}»`;
          picked.push(next);
          progress = true;
        }
      }
      experimental = picked;
    }

    const tracks = interleaveExperimental(normal, experimental).slice(0, targetTotal);
    const langTotal =
      profile.langScores.ru + profile.langScores.en + profile.langScores.mix + profile.langScores.instrumental;
    const dominantLang =
      langTotal > 0 ? (Object.entries(profile.langScores).sort((a, b) => b[1] - a[1])[0][0] as string) : "mix";

    const profileTopGenres = new Set(topKeys(profile.genreScores, 5));
    const genreMatchCount = tracks.filter((track) =>
      genreChartIds.has(track.id) ||
      classifyGenres(track.artist, track.title).some((slug) => profileTopGenres.has(slug) || seed.genres.has(slug)),
    ).length;

    return Response.json({
      tracks,
      mode,
      genre: mode === "genre" ? Array.from(seed.genres)[0] : undefined,
      genreMatchCount,
      availableGenres: GENRES.map((g) => ({ slug: g.slug, name: g.name })),
      title,
      reasonSummary,
      count: tracks.length,
      experimentalCount: experimental.length,
      mood: body.mood,
      favoriteArtistsFound: profile.topArtists.slice(0, 5),
      factors: {
        genres: topKeys(profile.genreScores, 5).map((slug) => ({ slug, name: genreName(slug) })),
        avgDuration: profile.avgDuration,
        language: dominantLang,
        artists: profile.topArtists.slice(0, 5),
      },
    });
  } catch (err) {
    return Response.json(
      {
        error: "Не удалось собрать рекомендации. Попробуйте обновить страницу.",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
