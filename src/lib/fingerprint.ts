"use client";

const COOKIE_NAME = "volna_profile";

function hashParts(parts: string[]): string {
  const value = parts.join("|");
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = (Math.imul(h2, 33) + code) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

function readCookie(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

/**
 * Стабильный отпечаток браузера (без логина и пароля).
 * Совокупность параметров браузера/экрана/локали даёт один профиль на устройство.
 */
export function computeFingerprint(): string {
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem(COOKIE_NAME);
  if (stored) {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(stored)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    return stored;
  }
  const existing = readCookie();
  if (existing) {
    try {
      window.localStorage.setItem(COOKIE_NAME, existing);
    } catch {
      // localStorage может быть недоступен
    }
    return existing;
  }
  const nav = window.navigator;
  const scr = window.screen;
  const fingerprint = hashParts([
    nav.userAgent,
    nav.platform || "",
    nav.language || "",
    (nav.languages || []).join(","),
    String(nav.hardwareConcurrency || 0),
    String((nav as Navigator & { deviceMemory?: number }).deviceMemory || 0),
    String(nav.maxTouchPoints || 0),
    String(scr.width),
    String(scr.height),
    String(scr.colorDepth),
    String(window.devicePixelRatio || 1),
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    String(new Date().getTimezoneOffset()),
  ]);
  try {
    window.localStorage.setItem(COOKIE_NAME, fingerprint);
  } catch {
    // игнорируем
  }
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(fingerprint)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  return fingerprint;
}

export function ensureProfileCookie(): string {
  return computeFingerprint();
}

export function getProfileFingerprint(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(COOKIE_NAME) || readCookie() || "";
}
