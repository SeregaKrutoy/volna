export type ThemeMode = "light" | "dark" | "custom";
export type SearchPlatform = "hitmos" | "soundcloud";

export type CustomColors = {
  accent: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
};

export type AppPreferences = {
  siteName: string;
  iconEmoji: string;
  iconDataUrl: string;
  theme: ThemeMode;
  customBase: "light" | "dark";
  colors: CustomColors;
  searchPlatform: SearchPlatform;
};

export const PREFERENCES_STORAGE_KEY = "volna-app-preferences-v2";

export const WAVE_ICON = "/images/wave-icon.svg";
export const ICON_OPTIONS = ["", "🎧", "♫", "✦", "🎵", "🔊"];

export const defaultPreferences: AppPreferences = {
  siteName: "volna",
  iconEmoji: "",
  iconDataUrl: "",
  theme: "light",
  customBase: "light",
  colors: {
    accent: "#7657ed",
    background: "#f8f8fb",
    surface: "#ffffff",
    text: "#252637",
    muted: "#9293a5",
    border: "#efeff4",
  },
  searchPlatform: "hitmos",
};

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function normalizePreferences(value: unknown): AppPreferences {
  if (!value || typeof value !== "object") return defaultPreferences;
  const raw = value as Partial<AppPreferences>;
  const rawColors = (raw.colors && typeof raw.colors === "object" ? raw.colors : {}) as Partial<CustomColors>;
  const themes: ThemeMode[] = ["light", "dark", "custom"];
  const platforms: SearchPlatform[] = ["hitmos", "soundcloud"];
  const emojis = ICON_OPTIONS;

  return {
    siteName:
      typeof raw.siteName === "string" && raw.siteName.trim()
        ? raw.siteName.trim().slice(0, 40)
        : defaultPreferences.siteName,
    iconEmoji: typeof raw.iconEmoji === "string" && emojis.includes(raw.iconEmoji) ? raw.iconEmoji : defaultPreferences.iconEmoji,
    iconDataUrl:
      typeof raw.iconDataUrl === "string" && raw.iconDataUrl.startsWith("data:image/")
        ? raw.iconDataUrl.slice(0, 1_500_000)
        : "",
    theme: themes.includes(raw.theme as ThemeMode) ? (raw.theme as ThemeMode) : "light",
    customBase: raw.customBase === "dark" ? "dark" : "light",
    colors: {
      accent: isHexColor(String(rawColors.accent || "")) ? String(rawColors.accent) : defaultPreferences.colors.accent,
      background: isHexColor(String(rawColors.background || "")) ? String(rawColors.background) : defaultPreferences.colors.background,
      surface: isHexColor(String(rawColors.surface || "")) ? String(rawColors.surface) : defaultPreferences.colors.surface,
      text: isHexColor(String(rawColors.text || "")) ? String(rawColors.text) : defaultPreferences.colors.text,
      muted: isHexColor(String(rawColors.muted || "")) ? String(rawColors.muted) : defaultPreferences.colors.muted,
      border: isHexColor(String(rawColors.border || "")) ? String(rawColors.border) : defaultPreferences.colors.border,
    },
    searchPlatform: platforms.includes(raw.searchPlatform as SearchPlatform)
      ? (raw.searchPlatform as SearchPlatform)
      : "hitmos",
  };
}
