import { createHash } from "node:crypto";
import { db } from "@/db";
import { profiles } from "@/db/schema";

const SALT = process.env.PROFILE_SALT || "volna-profile-v1";
export const PROFILE_COOKIE = "volna_profile";

function hash(value: string): string {
  return createHash("sha256").update(`${SALT}|${value}`).digest("hex").slice(0, 40);
}

/**
 * Анонимный профиль по отпечатку браузера.
 * Клиент присылает отпечаток в cookie/заголовке; для запросов без него
 * используется отпечаток заголовков, чтобы данные не смешивались между браузерами.
 */
export function resolveProfileId(request: Request): string {
  const header = (request.headers.get("x-volna-fingerprint") || "").trim().slice(0, 300);
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieValue = cookieHeader.match(/(?:^|;\s*)volna_profile=([^;]+)/)?.[1] || "";
  const fromCookie = cookieValue ? decodeURIComponent(cookieValue).slice(0, 300) : "";
  const raw = header || fromCookie;
  if (raw) return hash(raw);
  const fallback = [
    request.headers.get("user-agent") || "unknown-agent",
    request.headers.get("accept-language") || "unknown-lang",
    request.headers.get("sec-ch-ua-platform") || "",
  ].join("||");
  return hash(fallback);
}

export async function getProfileId(request: Request): Promise<string> {
  const id = resolveProfileId(request);
  await db
    .insert(profiles)
    .values({ id })
    .onConflictDoUpdate({ target: profiles.id, set: { lastSeenAt: new Date() } });
  return id;
}

/** Короткий суффикс профиля для системных плейлистов. */
export function profileSuffix(profileId: string): string {
  return profileId.slice(0, 16);
}
