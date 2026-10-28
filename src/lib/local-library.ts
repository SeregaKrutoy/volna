import type { Track } from "@/lib/music";

export type LocalRecord = {
  id: string;
  track: Track;
  file: File;
  addedAt: number;
  fileKey?: string;
  profileId?: string;
};

export type SavedDirectoryHandle = {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  savedAt: number;
};

const AUDIO_FILE_REGEX = /\.(mp3|m4a|aac|wav|ogg|opus|flac|webm)$/i;

export function isAudioFile(file: File | { name: string; type?: string }): boolean {
  return Boolean(
    (file.type && file.type.startsWith("audio/")) || AUDIO_FILE_REGEX.test(file.name),
  );
}

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("volna-local-music", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("tracks")) {
        db.createObjectStore("tracks", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("handles")) {
        db.createObjectStore("handles", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Хранилище недоступно"));
  });
}

export async function getLocalRecords(): Promise<LocalRecord[]> {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("tracks", "readonly");
    const request = transaction.objectStore("tracks").getAll();
    request.onsuccess = () =>
      resolve((request.result as LocalRecord[]).sort((a, b) => b.addedAt - a.addedAt));
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function getLocalRecord(id: string): Promise<LocalRecord | undefined> {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("tracks", "readonly");
    const request = transaction.objectStore("tracks").get(id);
    request.onsuccess = () => resolve(request.result as LocalRecord | undefined);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function saveLocalRecord(record: LocalRecord): Promise<void> {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("tracks", "readwrite");
    transaction.objectStore("tracks").put(record);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function saveLocalRecordsBatch(records: LocalRecord[]): Promise<void> {
  if (!records.length) return;
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("tracks", "readwrite");
    const store = transaction.objectStore("tracks");
    for (const record of records) {
      store.put(record);
    }
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function deleteLocalRecord(id: string): Promise<void> {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("tracks", "readwrite");
    transaction.objectStore("tracks").delete(id);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openLibrary();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("handles", "readwrite");
      tx.objectStore("handles").put({
        id: "music-dir",
        name: handle.name || "Моя папка",
        handle,
        savedAt: Date.now(),
      } satisfies SavedDirectoryHandle);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Ignore if browser does not support serializing FileSystemDirectoryHandle
  }
}

export async function getSavedDirectoryHandle(): Promise<SavedDirectoryHandle | undefined> {
  try {
    const db = await openLibrary();
    return await new Promise<SavedDirectoryHandle | undefined>((resolve, reject) => {
      const tx = db.transaction("handles", "readonly");
      const req = tx.objectStore("handles").get("music-dir");
      req.onsuccess = () => resolve(req.result as SavedDirectoryHandle | undefined);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return undefined;
  }
}

export type ScannedAudioFile = {
  file: File;
  folderName: string;
  relativePath: string;
};

export async function scanDirectoryHandleRecursive(
  dirHandle: FileSystemDirectoryHandle,
  parentPath = "",
  maxFiles = 500,
  collected: ScannedAudioFile[] = [],
): Promise<ScannedAudioFile[]> {
  if (collected.length >= maxFiles) return collected;
  const currentFolder = dirHandle.name || "Папка устройства";
  const currentPath = parentPath ? `${parentPath}/${currentFolder}` : currentFolder;

  // Iterate entries in the directory handle
  const iterable = dirHandle as unknown as {
    values?: () => AsyncIterable<FileSystemHandle>;
    entries?: () => AsyncIterable<[string, FileSystemHandle]>;
  };

  if (typeof iterable.values === "function") {
    for await (const entry of iterable.values()) {
      if (collected.length >= maxFiles) break;
      if (entry.name.startsWith(".")) continue;
      if (entry.kind === "file") {
        if (AUDIO_FILE_REGEX.test(entry.name)) {
          try {
            const file = await (entry as FileSystemFileHandle).getFile();
            collected.push({
              file,
              folderName: currentFolder,
              relativePath: `${currentPath}/${file.name}`,
            });
          } catch {
            // skip unreadable file
          }
        }
      } else if (entry.kind === "directory") {
        try {
          await scanDirectoryHandleRecursive(
            entry as FileSystemDirectoryHandle,
            currentPath,
            maxFiles,
            collected,
          );
        } catch {
          // skip unreadable subdirectory
        }
      }
    }
  }
  return collected;
}

export async function extractFilesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<ScannedAudioFile[]> {
  const results: ScannedAudioFile[] = [];
  const items = Array.from(dataTransfer.items || []);

  async function traverseEntry(entry: FileSystemEntry, pathPrefix = ""): Promise<void> {
    if (results.length >= 500) return;
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      await new Promise<void>((resolve) => {
        fileEntry.file(
          (file) => {
            if (isAudioFile(file)) {
              const parts = pathPrefix.split("/").filter(Boolean);
              const folderName = parts[parts.length - 1] || "С устройства";
              results.push({
                file,
                folderName,
                relativePath: pathPrefix ? `${pathPrefix}/${file.name}` : file.name,
              });
            }
            resolve();
          },
          () => resolve(),
        );
      });
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();
      const nextPrefix = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
      const readAllEntries = async (): Promise<FileSystemEntry[]> => {
        const all: FileSystemEntry[] = [];
        while (true) {
          const batch = await new Promise<FileSystemEntry[]>((resolve) => {
            reader.readEntries(
              (entries) => resolve(entries || []),
              () => resolve([]),
            );
          });
          if (!batch.length) break;
          all.push(...batch);
        }
        return all;
      };
      const children = await readAllEntries();
      for (const child of children) {
        if (!child.name.startsWith(".")) {
          await traverseEntry(child, nextPrefix);
        }
      }
    }
  }

  const entries = items
    .map((item) =>
      typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null,
    )
    .filter((e): e is FileSystemEntry => Boolean(e));

  if (entries.length > 0) {
    for (const entry of entries) {
      await traverseEntry(entry, "");
    }
    if (results.length > 0) return results;
  }

  for (const file of Array.from(dataTransfer.files || [])) {
    if (isAudioFile(file)) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const parts = rel.split("/").filter(Boolean);
      const folderName = parts.length > 1 ? parts[parts.length - 2] : "С устройства";
      results.push({
        file,
        folderName,
        relativePath: rel,
      });
    }
  }

  return results;
}

export function buildLocalTrackFromFile(scanned: ScannedAudioFile, profileId?: string): LocalRecord {
  const { file, folderName, relativePath } = scanned;
  const cleanName = file.name.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
  const parts = cleanName.split(/\s+[-—–]\s+/);
  const title = parts.length > 1 ? parts.slice(1).join(" - ").trim() : cleanName;
  const artist =
    parts.length > 1
      ? parts[0].trim()
      : folderName && folderName !== "С устройства"
        ? folderName
        : "С устройства";
  const album =
    folderName && folderName !== "С устройства" ? `Папка: ${folderName}` : "Моя медиатека";

  const fileKey = `${relativePath || file.name}:${file.size}`;
  let hash = 2166136261;
  for (let i = 0; i < fileKey.length; i++) {
    hash ^= fileKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const id = `local:${(hash >>> 0).toString(16)}-${file.size}`;
  const isMp3 = /\.mp3$/i.test(file.name);
  const estimatedDuration = isMp3 && file.size > 0 ? Math.max(1, Math.round(file.size / 32000)) : 0;

  return {
    id,
    file,
    fileKey,
    profileId,
    addedAt: Date.now(),
    track: {
      id,
      title: title || "Аудиофайл",
      artist: artist || "С устройства",
      album,
      duration: estimatedDuration,
      artwork: "",
      audioUrl: "",
      source: "local",
      fileName: file.name,
    },
  };
}
