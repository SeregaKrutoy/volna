/**
 * Тексты песен. Основной источник — Genius (genius.com):
 *  1) официальный API (если задан GENIUS_ACCESS_TOKEN) или публичный поиск genius.com/api/search/multi;
 *  2) сам текст берётся со страницы песни (блоки data-lyrics-container).
 * Если Genius недоступен с сервера (Cloudflare / гео-блокировка), используются запасные
 * открытые источники LRCLIB и lyrics.ovh — пользователь всё равно получит текст.
 */

export type LyricsResult = {
  found: boolean;
  lyrics: string;
  source: "genius" | "lrclib" | "netease" | "lyrics.ovh" | "none";
  url: string;
  title: string;
  artist: string;
  syncedLyrics?: string;
  message?: string;
};

type CacheEntry = { value: LyricsResult; at: number };
const cache = (globalThis as typeof globalThis & { __volnaLyricsCache?: Map<string, CacheEntry> }).__volnaLyricsCache ??= new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000;
// Если Genius отвечает 403 (Cloudflare), не тратим время на него следующие 10 минут.
const geniusBlock = globalThis as typeof globalThis & { __volnaGeniusBlockedUntil?: number };
function geniusBlocked(): boolean {
  return (geniusBlock.__volnaGeniusBlockedUntil || 0) > Date.now();
}
function markGeniusBlocked() {
  geniusBlock.__volnaGeniusBlockedUntil = Date.now() + 10 * 60 * 1000;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[(\[][^)\]]*(feat\.?|ft\.?|prod\.?|remix|version|edit|live|official|lyrics|audio|video)[^)\]]*[)\]]/gi, "")
    .replace(/\s*[-–—]\s*(remix|official.*|lyrics.*|audio.*|video.*)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function primaryArtist(artist: string): string {
  const first = artist.split(/\s*(?:,|&|feat\.?|ft\.?|\sx\s|×|\/)\s*/i)[0]?.trim() || artist.trim();
  // Каталоги часто добавляют служебные слова: «Gruppa Skryptonite», «Группа Кино», «DJ …»
  return first.replace(/^(?:gruppa|группа|band|the band)\s+/i, "").trim() || first;
}

/** Все исполнители трека — для поиска по каждому отдельно. */
export function allArtists(artist: string): string[] {
  const list = artist
    .split(/\s*(?:,|&|feat\.?|ft\.?|\sx\s|×|\/|\sи\s|\sand\s)\s*/i)
    .map((a) => a.replace(/^(?:gruppa|группа)\s+/i, "").trim())
    .filter((a) => a.length > 1);
  return Array.from(new Set(list));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function similar(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const wa = new Set(na.split(" "));
  const wb = nb.split(" ");
  const common = wb.filter((w) => wa.has(w)).length;
  return common >= Math.max(1, Math.ceil(Math.min(wa.size, wb.length) * 0.6));
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------- Genius ----------

type GeniusHit = { result?: { id?: number; url?: string; title?: string; full_title?: string; primary_artist?: { name?: string }; artist_names?: string } };

async function geniusSearch(query: string): Promise<GeniusHit["result"][]> {
  const token = process.env.GENIUS_ACCESS_TOKEN?.trim();
  if (token) {
    const response = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": UA },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (response.ok) {
      const data = (await response.json()) as { response?: { hits?: GeniusHit[] } };
      return (data.response?.hits || []).map((hit) => hit.result).filter(Boolean);
    }
  }
  const response = await fetch(`https://genius.com/api/search/multi?per_page=5&q=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": UA, Accept: "application/json", "Accept-Language": "ru,en;q=0.8", Referer: "https://genius.com/" },
    signal: AbortSignal.timeout(5_000),
    cache: "no-store",
  });
  if (response.status === 403) markGeniusBlocked();
  if (!response.ok) throw new Error(`genius search ${response.status}`);
  const data = (await response.json()) as { response?: { sections?: { type?: string; hits?: GeniusHit[] }[] } };
  const hits: GeniusHit["result"][] = [];
  for (const section of data.response?.sections || []) {
    if (section.type === "song" || section.type === "top_hit") {
      for (const hit of section.hits || []) if (hit.result?.url) hits.push(hit.result);
    }
  }
  return hits;
}

export async function geniusLyricsFromUrl(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "ru,en;q=0.8" },
    signal: AbortSignal.timeout(6_000),
    cache: "no-store",
  });
  if (response.status === 403) markGeniusBlocked();
  if (!response.ok) throw new Error(`genius page ${response.status}`);
  const html = await response.text();
  const containers = Array.from(html.matchAll(/<div[^>]+data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g)).map((m) => m[1]);
  if (!containers.length) {
    const legacy = html.match(/<div class="lyrics">([\s\S]*?)<\/div>/);
    if (legacy) return htmlToText(legacy[1]);
    throw new Error("lyrics container not found");
  }
  const text = containers.map(htmlToText).join("\n\n").trim();
  // Удаляем служебные блоки «N Contributors … Lyrics» и «Embed».
  return text
    .replace(/^[\s\S]*?Contributors?[\s\S]*?Lyrics\s*/, (m) => (m.length < 400 ? "" : m))
    .replace(/\d*Embed$/m, "")
    .trim();
}

async function fromGenius(artist: string, title: string): Promise<LyricsResult | null> {
  if (geniusBlocked() && !process.env.GENIUS_ACCESS_TOKEN) throw new Error("genius blocked");
  const queries = [`${artist} ${title}`, `${primaryArtist(artist)} ${cleanTitle(title)}`, cleanTitle(title)];
  for (const query of Array.from(new Set(queries))) {
    const hits = await geniusSearch(query).catch(() => []);
    if (geniusBlocked()) throw new Error("genius blocked");
    const match = hits.find((hit) => hit?.url && similar(hit.title || "", cleanTitle(title)) && (similar(hit.primary_artist?.name || hit.artist_names || "", primaryArtist(artist)) || similar(hit.full_title || "", artist)))
      || hits.find((hit) => hit?.url && similar(hit.title || "", cleanTitle(title)));
    if (!match?.url) continue;
    const lyrics = await geniusLyricsFromUrl(match.url);
    if (lyrics.length > 20) {
      return { found: true, lyrics, source: "genius", url: match.url, title: match.title || title, artist: match.primary_artist?.name || match.artist_names || artist };
    }
  }
  return null;
}

async function fromGeniusTitleOnly(title: string): Promise<LyricsResult | null> {
  const clean = cleanTitle(title);
  if (!clean || geniusBlocked()) return null;
  const hits = await geniusSearch(clean).catch(() => []);
  const match = hits.find((hit) => hit?.url && similar(hit.title || "", clean));
  if (!match?.url) return null;
  const lyrics = await geniusLyricsFromUrl(match.url);
  if (lyrics.length < 20) return null;
  return { found: true, lyrics, source: "genius", url: match.url, title: match.title || title, artist: match.primary_artist?.name || match.artist_names || "", message: "Найдено только по названию — исполнитель может отличаться." };
}

async function fromLrclibTitleOnly(title: string, duration?: number): Promise<LyricsResult | null> {
  const clean = cleanTitle(title);
  if (!clean) return null;
  try {
    const headers = { "User-Agent": "volna music app (https://github.com/SeregaKrutoy/volna)" };
    let list: LrclibItem[] = [];
    for (const url of [
      `https://lrclib.net/api/search?track_name=${encodeURIComponent(clean)}`,
      `https://lrclib.net/api/search?q=${encodeURIComponent(clean)}`,
    ]) {
      try {
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(8_000), cache: "no-store" });
        if (!response.ok) continue;
        const data = (await response.json()) as LrclibItem[];
        if (Array.isArray(data) && data.length) {
          list = data;
          break;
        }
      } catch {
        // пробуем следующий вариант
      }
    }
    if (!list.length) return null;
    const candidates = list.filter((entry) => (entry.plainLyrics || entry.syncedLyrics) && similar(entry.trackName || "", clean));
    if (!candidates.length) return null;
    // При нескольких вариантах предпочитаем близкую длительность и наличие синхронизации.
    const withDuration = candidates as (LrclibItem & { duration?: number })[];
    withDuration.sort((a, b) => {
      const da = duration && a.duration ? Math.abs(a.duration - duration) : 999;
      const db = duration && b.duration ? Math.abs(b.duration - duration) : 999;
      if (Math.min(da, 999) !== Math.min(db, 999)) return da - db;
      return Number(Boolean(b.syncedLyrics)) - Number(Boolean(a.syncedLyrics));
    });
    // Среди нескольких исполнителей с таким названием предпочитаем того, кто встречается чаще
    // (это, как правило, оригинальный исполнитель), затем — ближайшую длительность.
    const artistFreq = new Map<string, number>();
    for (const entry of withDuration) {
      const key = (entry.artistName || "").toLowerCase().replace(/&amp;/g, "&").split(/\s*[&,]\s*/)[0];
      artistFreq.set(key, (artistFreq.get(key) || 0) + 1);
    }
    withDuration.sort((a, b) => {
      const fa = artistFreq.get((a.artistName || "").toLowerCase().replace(/&amp;/g, "&").split(/\s*[&,]\s*/)[0]) || 0;
      const fb = artistFreq.get((b.artistName || "").toLowerCase().replace(/&amp;/g, "&").split(/\s*[&,]\s*/)[0]) || 0;
      if (fa !== fb) return fb - fa;
      return 0;
    });
    const item = withDuration[0];
    const plain = item.plainLyrics || (item.syncedLyrics || "").replace(/\[\d+:\d+(?:\.\d+)?\]\s?/g, "");
    if (plain.trim().length < 20) return null;
    return {
      found: true,
      lyrics: plain.trim(),
      syncedLyrics: item.syncedLyrics || undefined,
      source: "lrclib",
      url: `https://lrclib.net/search/${encodeURIComponent(clean)}`,
      title: item.trackName || title,
      artist: item.artistName || "",
      message: "Найдено только по названию — исполнитель может отличаться.",
    };
  } catch {
    return null;
  }
}

// ---------- Запасные источники ----------

type LrclibItem = { trackName?: string; artistName?: string; plainLyrics?: string | null; syncedLyrics?: string | null; instrumental?: boolean };

async function fetchRetry(url: string, init: RequestInit, attempts = 2): Promise<Response | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, init);
      if (response.status === 503 || response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (i + 1)));
        continue;
      }
      return response;
    } catch {
      // сеть — пробуем ещё раз
    }
  }
  return null;
}

async function fromLrclib(artist: string, title: string, duration?: number): Promise<LyricsResult | null> {
  const headers = { "User-Agent": "volna music app (https://github.com/SeregaKrutoy/volna)" };
  const attempts: string[] = [];
  const params = new URLSearchParams({ track_name: cleanTitle(title), artist_name: primaryArtist(artist) });
  if (duration && duration > 0) params.set("duration", String(Math.round(duration)));
  attempts.push(`https://lrclib.net/api/get?${params.toString()}`);
  attempts.push(`https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanTitle(title))}&artist_name=${encodeURIComponent(primaryArtist(artist))}`);
  attempts.push(`https://lrclib.net/api/search?q=${encodeURIComponent(`${primaryArtist(artist)} ${cleanTitle(title)}`)}`);
  attempts.push(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle(title))}`);
  for (const url of attempts) {
    try {
      const response = await fetchRetry(url, { headers, signal: AbortSignal.timeout(8_000), cache: "no-store" });
      if (!response || !response.ok) continue;
      const data = (await response.json()) as LrclibItem | LrclibItem[];
      const list = Array.isArray(data) ? data : [data];
      const item = list.find((entry) => (entry.plainLyrics || entry.syncedLyrics) && similar(entry.trackName || "", cleanTitle(title)) && similar(entry.artistName || "", primaryArtist(artist)));
      if (!item) continue;
      const plain = item.plainLyrics || (item.syncedLyrics || "").replace(/\[\d+:\d+(?:\.\d+)?\]\s?/g, "");
      if (plain.trim().length < 20) continue;
      return {
        found: true,
        lyrics: plain.trim(),
        syncedLyrics: item.syncedLyrics || undefined,
        source: "lrclib",
        url: `https://lrclib.net/search/${encodeURIComponent(`${primaryArtist(artist)} ${cleanTitle(title)}`)}`,
        title: item.trackName || title,
        artist: item.artistName || artist,
      };
    } catch {
      // пробуем следующий вариант
    }
  }
  return null;
}

// ---------- NetEase Cloud Music (много русских и зарубежных треков, часто с синхронизацией) ----------

type NeteaseSong = { id?: number; name?: string; artists?: { name?: string }[]; duration?: number };

async function fromNetease(artist: string, title: string, duration?: number, titleOnly = false): Promise<LyricsResult | null> {
  const clean = cleanTitle(title);
  const queries = titleOnly ? [clean] : [`${primaryArtist(artist)} ${clean}`, `${clean} ${primaryArtist(artist)}`];
  for (const query of queries) {
    try {
      const search = await fetch(`https://music.163.com/api/search/get?s=${encodeURIComponent(query)}&type=1&limit=10`, {
        headers: { "User-Agent": UA, Referer: "https://music.163.com/" },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      });
      if (!search.ok) continue;
      const data = (await search.json()) as { result?: { songs?: NeteaseSong[] } };
      const songs = (data.result?.songs || []).filter((song) => song.id && similar(song.name || "", clean));
      const matched = titleOnly
        ? songs
        : songs.filter((song) => (song.artists || []).some((a) => similar(a.name || "", primaryArtist(artist)) || allArtists(artist).some((x) => similar(a.name || "", x))));
      const ordered = [...matched].sort((a, b) => {
        const da = duration && a.duration ? Math.abs(a.duration / 1000 - duration) : 999;
        const db = duration && b.duration ? Math.abs(b.duration / 1000 - duration) : 999;
        return da - db;
      });
      for (const song of ordered.slice(0, 3)) {
        const response = await fetch(`https://music.163.com/api/song/lyric?id=${song.id}&lv=1&tv=-1`, {
          headers: { "User-Agent": UA, Referer: "https://music.163.com/" },
          signal: AbortSignal.timeout(8_000),
          cache: "no-store",
        });
        if (!response.ok) continue;
        const payload = (await response.json()) as { lrc?: { lyric?: string }; nolyric?: boolean };
        const lrc = (payload.lrc?.lyric || "")
          .split("\n")
          // служебные строки NetEase: «作词 : …», «作曲 : …», «编曲 : …»
          .filter((line) => !/\]\s*(作词|作曲|编曲|制作人|混音|母带|出品|发行)\s*[:：]/.test(line))
          .join("\n")
          .trim();
        const plain = lrc.replace(/\[\d+:\d+(?:\.\d+)?\]\s?/g, "").replace(/\n{3,}/g, "\n\n").trim();
        if (plain.length < 20) continue;
        const synced = /\[\d+:\d+/.test(lrc) ? lrc : undefined;
        return {
          found: true,
          lyrics: plain,
          syncedLyrics: synced,
          source: "netease",
          url: `https://music.163.com/#/song?id=${song.id}`,
          title: song.name || title,
          artist: (song.artists || []).map((a) => a.name).filter(Boolean).join(", ") || artist,
          message: titleOnly ? "Найдено только по названию — исполнитель может отличаться." : undefined,
        };
      }
    } catch {
      // пробуем следующий запрос / источник
    }
  }
  return null;
}

/** Поиск страницы Genius через DuckDuckGo — когда прямой поиск genius.com закрыт. */
async function geniusUrlViaSearchEngine(artist: string, title: string): Promise<string | null> {
  try {
    const query = `site:genius.com ${primaryArtist(artist)} ${cleanTitle(title)} lyrics`;
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const html = await response.text();
    const links = Array.from(html.matchAll(/https?:\/\/genius\.com\/[A-Za-z0-9%-]+-lyrics/g)).map((m) => m[0]);
    return links[0] || null;
  } catch {
    return null;
  }
}

async function fromLyricsOvh(artist: string, title: string): Promise<LyricsResult | null> {
  try {
    const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(primaryArtist(artist))}/${encodeURIComponent(cleanTitle(title))}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { lyrics?: string };
    const text = (data.lyrics || "").replace(/^Paroles de la chanson.*\n/i, "").trim();
    if (text.length < 20) return null;
    return { found: true, lyrics: text, source: "lyrics.ovh", url: "https://lyrics.ovh", title, artist };
  } catch {
    return null;
  }
}

export function geniusSearchUrl(artist: string, title: string): string {
  return `https://genius.com/search?q=${encodeURIComponent(`${primaryArtist(artist)} ${cleanTitle(title)}`)}`;
}

export async function findLyrics(artist: string, title: string, duration?: number): Promise<LyricsResult> {
  const key = `${normalize(artist)}::${normalize(title)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.value;

  let result: LyricsResult | null = null;
  let geniusError = "";
  try {
    result = await fromGenius(artist, title);
  } catch (error) {
    geniusError = error instanceof Error ? error.message : String(error);
  }
  if (!result && geniusError && !geniusBlocked()) {
    const url = await geniusUrlViaSearchEngine(artist, title);
    if (url) {
      try {
        const lyrics = await geniusLyricsFromUrl(url);
        if (lyrics.length > 20) result = { found: true, lyrics, source: "genius", url, title, artist };
      } catch {
        // страница Genius тоже недоступна
      }
    }
  }
  // Параллельно опрашиваем открытые базы; берём первую, где текст нашёлся (приоритет: LRCLIB → NetEase → lyrics.ovh).
  if (!result) {
    const [lrclib, netease, ovh] = await Promise.all([
      fromLrclib(artist, title, duration),
      fromNetease(artist, title, duration),
      fromLyricsOvh(artist, title),
    ]);
    result = lrclib || netease || ovh;
  }
  // Несколько исполнителей: пробуем каждого по отдельности (feat., «,», «&»).
  if (!result) {
    const others = allArtists(artist).filter((a) => a.toLowerCase() !== primaryArtist(artist).toLowerCase()).slice(0, 2);
    for (const other of others) {
      const [lrclib, netease] = await Promise.all([fromLrclib(other, title, duration), fromNetease(other, title, duration)]);
      result = lrclib || netease;
      if (result) break;
    }
  }

  // Не нашли по исполнителю и названию — ищем только по названию
  // (исполнитель в каталоге может быть записан иначе: транслит, фит, лейбл).
  if (!result) {
    try {
      result = await fromGeniusTitleOnly(title);
    } catch {
      // Genius недоступен — ниже попробуем LRCLIB
    }
    if (!result) {
      const [lrclib, netease] = await Promise.all([fromLrclibTitleOnly(title, duration), fromNetease(artist, title, duration, true)]);
      result = lrclib || netease;
    }
  }

  const final: LyricsResult = result || {
    found: false,
    lyrics: "",
    source: "none",
    url: geniusSearchUrl(artist, title),
    title,
    artist,
    message: geniusError
      ? "Текст не найден. Genius сейчас недоступен с сервера — откройте страницу поиска Genius."
      : "Текст для этого трека не найден.",
  };
  cache.set(key, { value: final, at: Date.now() });
  return final;
}
