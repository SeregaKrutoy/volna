import { boolean, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  autoScan: boolean("auto_scan").notNull().default(false),
});

export const playlists = pgTable("playlists", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("custom"),
  color: text("color").notNull().default("violet"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playlistTracks = pgTable(
  "playlist_tracks",
  {
    id: serial("id").primaryKey(),
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    trackId: text("track_id").notNull(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    album: text("album").notNull().default(""),
    duration: integer("duration").notNull().default(0),
    artwork: text("artwork").notNull().default(""),
    audioUrl: text("audio_url").notNull().default(""),
    source: text("source").notNull(),
    archiveId: text("archive_id"),
    fileName: text("file_name"),
    licenseUrl: text("license_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("playlist_track_unique").on(table.playlistId, table.trackId)],
);

export const listenHistory = pgTable(
  "listen_history",
  {
    id: serial("id").primaryKey(),
    trackId: text("track_id").notNull().unique(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    album: text("album").notNull().default(""),
    duration: integer("duration").notNull().default(0),
    artwork: text("artwork").notNull().default(""),
    audioUrl: text("audio_url").notNull().default(""),
    profileId: text("profile_id").notNull(),
    source: text("source").notNull(),
    archiveId: text("archive_id"),
    fileName: text("file_name"),
    licenseUrl: text("license_url"),
    playCount: integer("play_count").notNull().default(1),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("listen_history_profile_track_unique").on(table.profileId, table.trackId)],
);

export const dislikedTracks = pgTable(
  "disliked_tracks",
  {
    id: serial("id").primaryKey(),
    trackId: text("track_id").notNull(),
    profileId: text("profile_id").notNull(),
    title: text("title").notNull(),
  artist: text("artist").notNull(),
  album: text("album").notNull().default(""),
  duration: integer("duration").notNull().default(0),
  artwork: text("artwork").notNull().default(""),
  audioUrl: text("audio_url").notNull().default(""),
  source: text("source").notNull(),
  archiveId: text("archive_id"),
  fileName: text("file_name"),
    licenseUrl: text("license_url"),
    dislikedAt: timestamp("disliked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("disliked_profile_track_unique").on(table.profileId, table.trackId)],
);

export const excludedEntities = pgTable(
  "excluded_entities",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    value: text("value").notNull(),
    label: text("label").notNull(),
    allowed: boolean("allowed").notNull().default(false),
    profileId: text("profile_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("excluded_entity_unique").on(table.profileId, table.kind, table.value)],
);

/** Персональная медиатека: файлы с устройства, сохранённые для конкретного профиля. */
export const libraryTracks = pgTable(
  "library_tracks",
  {
    id: serial("id").primaryKey(),
    profileId: text("profile_id").notNull(),
    trackId: text("track_id").notNull(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    album: text("album").notNull().default(""),
    duration: integer("duration").notNull().default(0),
    artwork: text("artwork").notNull().default(""),
    audioUrl: text("audio_url").notNull().default(""),
    source: text("source").notNull().default("device"),
    archiveId: text("archive_id"),
    fileName: text("file_name"),
    licenseUrl: text("license_url"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("library_profile_track_unique").on(table.profileId, table.trackId)],
);

export type ShareTrackSnapshot = {
  title: string;
  artist: string;
  album: string;
  duration: number;
  url: string | null;
  artwork: string;
  source: string;
};

export const playlistShares = pgTable("playlist_shares", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("violet"),
  tracks: jsonb("tracks").$type<ShareTrackSnapshot[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
