export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  artwork: string;
  audioUrl: string;
  source: "hitmos" | "local" | "device" | "archive" | "soundcloud";
  soundcloudUrl?: string;
  soundcloudEmbedUrl?: string;
  archiveId?: string;
  fileName?: string;
  licenseUrl?: string;
  downloadUrl?: string;
  streamUrl?: string;
  recommendationReason?: string;
};

export type Playlist = {
  id: string;
  name: string;
  color: string;
  isSystem: boolean;
  tracks: Track[];
};

export const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
};

function hitmosSeedTrack(
  songId: string,
  title: string,
  artist: string,
  duration: number,
  playUrl: string,
  downloadUrl: string,
  artwork: string,
): Track {
  const safeName = `${artist} - ${title}.mp3`.replace(/[/\\:*?"<>|]/g, "_");
  return {
    id: `hitmos:${songId}`,
    title,
    artist,
    album: "Hitmos",
    duration,
    artwork,
    source: "hitmos",
    archiveId: songId,
    fileName: safeName,
    streamUrl: playUrl,
    downloadUrl,
    audioUrl: `/api/stream?url=${encodeURIComponent(playUrl)}&songId=${encodeURIComponent(songId)}`,
  };
}

export const featuredTracks: Track[] = [
  hitmosSeedTrack(
    "17059595",
    "Династия",
    "Villian, Madk1d",
    150,
    "https://plc1.hitmos.fm/L21wMy8xMDAxNzI4Ny90cmFjay5tcDM=.mp3",
    "https://dwc1.hitmos.fm/L21wMy8xMDAxNzI4Ny9WaWxsaWFuLCBNYWRrMWQgLSDQlNC40L3QsNGB0YLQuNGPIChoaXRtb3MuZm0pLm1wMw==.mp3",
    "/images/mix-night.png",
  ),
  hitmosSeedTrack(
    "17059391",
    "Знак",
    "Toxi$, Дора",
    216,
    "https://plc1.hitmos.fm/L21wMy8xMDAxNzA4My90cmFjay5tcDM=.mp3",
    "https://dwc1.hitmos.fm/L21wMy8xMDAxNzA4My9Ub3hpJCwg0JTQvtGA0LAgLSDQl9C90LDQuiAoaGl0bW9zLmZtKS5tcDM=.mp3",
    "/images/mix-chill.png",
  ),
  hitmosSeedTrack(
    "10384585",
    "Captain",
    "Miyagi",
    214,
    "https://plc1.hitmos.fm/L21wMy8zMzQyMjc3L3RyYWNrLm1wMw==.mp3",
    "https://dwc1.hitmos.fm/L21wMy8zMzQyMjc3L01peWFnaSAtIENhcHRhaW4gKGhpdG1vcy5mbSkubXAz.mp3",
    "/images/mix-focus.png",
  ),
  hitmosSeedTrack(
    "10874958",
    "Marlboro",
    "Miyagi",
    243,
    "https://plc1.hitmos.fm/L21wMy8zODMyNjUwL3RyYWNrLm1wMw==.mp3",
    "https://dwc1.hitmos.fm/L21wMy8zODMyNjUwL01peWFnaSAtIE1hcmxib3JvIChoaXRtb3MuZm0pLm1wMw==.mp3",
    "/images/mix-energy.png",
  ),
  hitmosSeedTrack(
    "16771073",
    "ты в моих мыслях навсегда",
    "урал гайсин, снялцепи",
    117,
    "https://plc1.hitmos.fm/L21wMy85NzI4NzY1L3RyYWNrLm1wMw==.mp3",
    "https://dwc1.hitmos.fm/L21wMy85NzI4NzY1L9GD0YDQsNC7INCz0LDQudGB0LjQvSwg0YHQvdGP0LvRhtC10L/QuCAtINGC0Ysg0LIg0LzQvtC40YUg0LzRi9GB0LvRj9GFINC90LDQstGB0LXQs9C00LAgKGhpdG1vcy5mbSkubXAz.mp3",
    "/images/mix-night.png",
  ),
];

export const moods = [
  { title: "Вечерний вайб", subtitle: "Поймать настроение", query: "Miyagi", image: "/images/mix-night.png", label: "CHILL MIX" },
  { title: "На лёгкой волне", subtitle: "Выдохните и отдохните", query: "Chillout", image: "/images/mix-chill.png", label: "EASY LISTENING" },
  { title: "В фокусе", subtitle: "Музыка для концентрации", query: "Piano", image: "/images/mix-focus.png", label: "FOCUS FLOW" },
  { title: "Больше энергии", subtitle: "Ритм, который заряжает", query: "Танцевальная", image: "/images/mix-energy.png", label: "ENERGY BOOST" },
];
