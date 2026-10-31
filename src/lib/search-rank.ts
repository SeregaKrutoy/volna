import type { Track } from "@/lib/music";

/**
 * Ранжирование результатов поиска: сначала наиболее похожие на запрос
 * (совпадение по названию И исполнителю), при равной похожести — более популярные.
 * Популярность: явный счётчик (SoundCloud playback_count) либо позиция в исходной выдаче
 * (Hitmos сортирует свою выдачу по популярности).
 */

const SEPARATORS = /\s*(?:[-–—:|]|\bby\b)\s*/i;

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[(\[][^)\]]*[)\]]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return norm(value).split(" ").filter((t) => t.length > 1 || /\p{N}/u.test(t));
}

function levenshteinRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > Math.max(m, n) * 0.6) return 0;
  const prev = new Array<number>(n + 1);
  const cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return 1 - prev[n] / Math.max(m, n);
}

/** Похожесть текста на запрос: 0..1 (точное совпадение = 1). */
function textSimilarity(query: string, text: string): number {
  const q = norm(query);
  const t = norm(text);
  if (!q || !t) return 0;
  if (q === t) return 1;
  const qt = tokens(q);
  const tt = tokens(t);
  if (!qt.length || !tt.length) return 0;
  let matched = 0;
  for (const token of qt) {
    if (tt.includes(token)) matched += 1;
    else {
      const best = Math.max(0, ...tt.map((candidate) => levenshteinRatio(token, candidate)));
      if (best >= 0.8) matched += best;
      else if (tt.some((candidate) => candidate.startsWith(token) && token.length >= 3)) matched += 0.7;
    }
  }
  const coverage = matched / qt.length; // сколько слов запроса нашли
  const precision = matched / tt.length; // насколько текст состоит только из запроса
  let score = coverage * 0.7 + precision * 0.3;
  if (t.startsWith(q)) score = Math.max(score, 0.85);
  else if (t.includes(q)) score = Math.max(score, 0.8);
  return Math.min(1, score);
}

export type RankedTrack = Track & { searchScore?: number };

export function rankSearchResults<T extends Track>(query: string, tracks: T[], popularity?: (track: T, index: number) => number): T[] {
  const q = query.trim();
  if (!q || tracks.length < 2) return tracks;
  const total = tracks.length;
  const pop = (track: T, index: number) => {
    if (popularity) {
      const value = popularity(track, index);
      if (Number.isFinite(value) && value > 0) return Math.log10(value + 1) / 8; // 0..~1
    }
    return (total - index) / total; // позиция в исходной выдаче
  };

  // Запрос вида «исполнитель — название» или «название исполнитель» разбираем на части.
  const parts = q.split(SEPARATORS).map((p) => p.trim()).filter(Boolean);

  const scored = tracks.map((track, index) => {
    const title = track.title || "";
    const artist = track.artist || "";
    const full = `${artist} ${title}`;

    const titleSim = textSimilarity(q, title);
    const artistSim = textSimilarity(q, artist);
    const fullSim = textSimilarity(q, full);

    let similarity = Math.max(titleSim, artistSim * 0.95, fullSim);

    if (parts.length >= 2) {
      // «A — B»: проверяем обе ориентации (исполнитель/название).
      const [a, b] = parts;
      const direct = (textSimilarity(a, artist) + textSimilarity(b, title)) / 2;
      const swapped = (textSimilarity(b, artist) + textSimilarity(a, title)) / 2;
      similarity = Math.max(similarity, direct, swapped);
    } else {
      // Запрос из нескольких слов может содержать и исполнителя, и название:
      // «miyagi kosandra» → часть слов в названии, часть — в исполнителе.
      const qt = tokens(q);
      if (qt.length >= 2) {
        const tTokens = tokens(title);
        const aTokens = tokens(artist);
        const inTitle = qt.filter((t) => tTokens.includes(t)).length;
        const inArtist = qt.filter((t) => aTokens.includes(t)).length;
        const covered = qt.filter((t) => tTokens.includes(t) || aTokens.includes(t)).length / qt.length;
        if (inTitle > 0 && inArtist > 0) similarity = Math.max(similarity, 0.6 + covered * 0.4);
      }
    }

    // Точное совпадение названия + совпадение исполнителя — максимум.
    if (titleSim >= 0.95 && artistSim >= 0.5) similarity = 1;
    // Оригинал выше вариантов: любая приписка в скобках / после тире (remix, acoustic, 8D, cover, bass boost…)
    // или лишние слова в названии, которых нет в запросе, понижают похожесть.
    const rawTitle = title.toLowerCase();
    const hasSuffix = /[(\[].+[)\]]/.test(rawTitle) && !/[(\[]/.test(q);
    const variant = /\b(remix|ремикс|cover|кавер|speed ?up|slowed|nightcore|karaoke|минус|instrumental|live|acoustic|акустика|версия|version|8d|bass ?boost|mashup|edit|mix)\b/i.test(rawTitle);
    if (hasSuffix || variant) similarity -= 0.12;
    const extraWords = tokens(title).filter((t) => !tokens(q).includes(t) && !tokens(artist).includes(t)).length;
    if (extraWords > 0) similarity -= Math.min(0.1, extraWords * 0.03);
    // Запрос, в котором есть слова исполнителя, должен поднимать именно его треки, а не каверы на него.
    const queryHasArtistWord = tokens(q).some((t) => tokens(artist).includes(t));
    const titleContainsArtistOfQuery = parts.length >= 2 && tokens(title).some((t) => tokens(parts[0]).includes(t)) && !queryHasArtistWord;
    if (titleContainsArtistOfQuery) similarity -= 0.15;
    similarity = Math.max(0, similarity);

    const score = Math.round(similarity * 1000) / 1000;
    return { track, index, score, pop: pop(track, index) };
  });

  scored.sort((a, b) => {
    // Похожесть сравниваем с шагом 0.05, чтобы мелкие различия не перебивали популярность.
    const sa = Math.round(a.score * 20);
    const sb = Math.round(b.score * 20);
    if (sa !== sb) return sb - sa;
    if (a.pop !== b.pop) return b.pop - a.pop;
    return a.index - b.index;
  });

  return scored.map((item) => Object.assign(item.track, { searchScore: item.score }));
}
