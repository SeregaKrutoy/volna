package app.volna.music;

import android.content.Context;
import android.content.ContentUris;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

/** Локальное хранилище приложения: любимые, история, офлайн-плейлисты и файлы треков. */
public class LibraryStore {
    private final Context context;
    private final File root;
    private final File audioDir;

    public LibraryStore(Context context) {
        this.context = context.getApplicationContext();
        this.root = new File(this.context.getFilesDir(), "library.json");
        this.audioDir = new File(this.context.getFilesDir(), "audio");
        if (!audioDir.exists()) audioDir.mkdirs();
    }

    public synchronized JSONObject read() {
        try {
            if (!root.exists()) return newRoot();
            byte[] data = new byte[(int) root.length()];
            java.io.FileInputStream in = new java.io.FileInputStream(root);
            int read = in.read(data);
            in.close();
            if (read <= 0) return newRoot();
            return new JSONObject(new String(data, "UTF-8"));
        } catch (Exception e) {
            return newRoot();
        }
    }

    private JSONObject newRoot() {
        JSONObject root = new JSONObject();
        try {
            root.put("favorites", new JSONArray());
            root.put("history", new JSONArray());
            root.put("playlists", new JSONObject());
        } catch (Exception ignored) {
        }
        return root;
    }

    public synchronized void write(JSONObject object) {
        try {
            FileOutputStream out = new FileOutputStream(root);
            out.write(object.toString().getBytes("UTF-8"));
            out.close();
        } catch (Exception ignored) {
        }
    }

    public synchronized List<Track> getList(String key) {
        return Track.listFromJson(read().optJSONArray(key) == null ? "[]" : read().optJSONArray(key).toString());
    }

    public synchronized void replaceList(String key, List<Track> tracks) {
        JSONObject data = read();
        try {
            data.put(key, Track.listToJson(tracks));
        } catch (Exception ignored) {
        }
        write(data);
    }

    private String existingLocalPath(String id) {
        if (id == null || id.isEmpty()) return "";
        for (Track track : getList("favorites")) {
            if (id.equals(track.id) && localExists(track.localPath)) return track.localPath;
        }
        for (Track track : getList("history")) {
            if (id.equals(track.id) && localExists(track.localPath)) return track.localPath;
        }
        JSONObject playlists = read().optJSONObject("playlists");
        if (playlists != null) {
            java.util.Iterator<String> keys = playlists.keys();
            while (keys.hasNext()) {
                JSONArray array = playlists.optJSONArray(keys.next());
                for (Track track : Track.listFromJson(array == null ? "[]" : array.toString())) {
                    if (id.equals(track.id) && localExists(track.localPath)) return track.localPath;
                }
            }
        }
        return "";
    }

    private boolean localExists(String path) {
        return path != null && (!path.isEmpty()) && (path.startsWith("content://") || new File(path).exists());
    }

    private Track preserveLocal(Track incoming) {
        if (incoming.localPath.isEmpty()) incoming.localPath = existingLocalPath(incoming.id);
        return incoming;
    }

    /** Любимые сохраняются в память устройства, а не только как метаданные. */
    public synchronized void syncFavorites(List<Track> incoming) {
        List<Track> saved = new ArrayList<>();
        for (Track track : incoming) {
            preserveLocal(track);
            if (track.localPath.isEmpty()) {
                String path = download(track);
                if (!path.isEmpty()) track.localPath = path;
            }
            saved.add(track);
        }
        replaceList("favorites", saved);
    }

    /** Обновляет историю, сохраняя локальные пути ранее закэшированных треков. */
    public synchronized void syncHistory(List<Track> incoming) {
        List<Track> old = getList("history");
        List<Track> merged = new ArrayList<>();
        for (Track track : incoming) {
            preserveLocal(track);
            merged.add(track);
        }
        for (Track track : old) {
            boolean exists = false;
            for (Track item : merged) {
                if (item.id.equals(track.id)) {
                    if (item.localPath.isEmpty() && !track.localPath.isEmpty()) item.localPath = track.localPath;
                    exists = true;
                    break;
                }
            }
            if (!exists && merged.size() < 200) merged.add(track);
        }
        replaceList("history", merged);
    }

    public synchronized void addToHistory(Track track) {
        preserveLocal(track);
        List<Track> history = getList("history");
        List<Track> next = new ArrayList<>();
        next.add(track);
        for (Track t : history) {
            if (!t.id.equals(track.id) && next.size() < 200) next.add(t);
        }
        replaceList("history", next);
    }

    public synchronized JSONObject getPlaylists() {
        return read().optJSONObject("playlists") == null ? new JSONObject() : read().optJSONObject("playlists");
    }

    public synchronized List<Track> getPlaylist(String name) {
        JSONObject all = read().optJSONObject("playlists");
        if (all == null) return new ArrayList<>();
        JSONArray array = all.optJSONArray(name);
        return Track.listFromJson(array == null ? "[]" : array.toString());
    }

    public synchronized List<String> playlistNames() {
        List<String> names = new ArrayList<>();
        JSONObject all = read().optJSONObject("playlists");
        if (all == null) return names;
        java.util.Iterator<String> keys = all.keys();
        while (keys.hasNext()) names.add(keys.next());
        return names;
    }

    /** Читает реальную музыку Android через MediaStore и сохраняет в «Мою медиатеку». */
    public synchronized int scanDeviceMusic() {
        List<Track> tracks = new ArrayList<>();
        String[] projection = {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.DISPLAY_NAME
        };
        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
        try (Cursor cursor = context.getContentResolver().query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                null,
                MediaStore.Audio.Media.DATE_ADDED + " DESC")) {
            if (cursor != null) {
                int idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                int titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                int artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                int albumCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                int durationCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                int nameCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME);
                while (cursor.moveToNext() && tracks.size() < 1000) {
                    long id = cursor.getLong(idCol);
                    Uri uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id);
                    Track track = new Track();
                    track.id = "android:" + id;
                    track.title = cursor.getString(titleCol);
                    track.artist = cursor.getString(artistCol);
                    track.album = cursor.getString(albumCol);
                    track.duration = (int) (cursor.getLong(durationCol) / 1000L);
                    track.source = "device";
                    track.localPath = uri.toString();
                    track.audioUrl = uri.toString();
                    if (track.title == null || track.title.isEmpty()) track.title = cursor.getString(nameCol);
                    if (track.artist == null || track.artist.equals("<unknown>")) track.artist = "На устройстве";
                    if (track.album == null) track.album = "Моя медиатека";
                    tracks.add(track);
                }
            }
        } catch (Exception ignored) {
        }
        replaceList("library", tracks);
        return tracks.size();
    }

    /** Подставляет локальные пути перед передачей очереди фоновому плееру. */
    public synchronized List<Track> resolveForPlayback(List<Track> incoming) {
        List<Track> out = new ArrayList<>();
        for (Track track : incoming) out.add(preserveLocal(track));
        return out;
    }

    /** Сохраняет офлайн-копию плейлиста: скачивает аудио в память приложения. */
    public synchronized String savePlaylist(String name, List<Track> tracks, boolean downloadAudio) {
        int downloaded = 0;
        for (Track track : tracks) {
            if (track.localPath.isEmpty() && downloadAudio) {
                String path = download(track);
                if (!path.isEmpty()) {
                    track.localPath = path;
                    downloaded++;
                }
            }
        }
        JSONObject data = read();
        JSONObject playlists = data.optJSONObject("playlists");
        if (playlists == null) playlists = new JSONObject();
        try {
            playlists.put(name, Track.listToJson(tracks));
            data.put("playlists", playlists);
        } catch (Exception ignored) {
        }
        write(data);
        return "saved:" + tracks.size() + ":downloaded:" + downloaded;
    }

    /** Кэширует прослушанный трек в памяти приложения. */
    public String cacheTrack(Track track) {
        preserveLocal(track);
        String path = download(track);
        if (!path.isEmpty()) track.localPath = path;
        addToHistory(track);
        return path;
    }

    private String safeName(Track track) {
        String base = (track.artist + "-" + track.title).replaceAll("[^\\p{L}\\p{N}]+", "_");
        if (base.length() > 60) base = base.substring(0, 60);
        return (base.isEmpty() ? "track" : base) + "-" + Math.abs(track.id.hashCode()) + ".mp3";
    }

    /** Скачивает аудио в память устройства и возвращает локальный путь. */
    public String download(Track track) {
        if (localExists(track.localPath)) return track.localPath;
        String url = track.audioUrl;
        if (url.startsWith("content://")) return url;
        if (!url.startsWith("http")) return "";
        File target = new File(audioDir, safeName(track));
        if (target.exists() && target.length() > 4096) return target.getAbsolutePath();
        HttpURLConnection connection = null;
        try {
            URL parsed = new URL(url);
            connection = (HttpURLConnection) parsed.openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("User-Agent", "VolnaAndroid/1.0");
            connection.setInstanceFollowRedirects(true);
            int code = connection.getResponseCode();
            if (code != 200 && code != 206) return "";
            InputStream in = connection.getInputStream();
            FileOutputStream out = new FileOutputStream(target);
            byte[] buffer = new byte[16384];
            int read;
            while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
            out.close();
            in.close();
            if (target.length() < 4096) {
                target.delete();
                return "";
            }
            return target.getAbsolutePath();
        } catch (Exception e) {
            return "";
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    public String stats() {
        JSONObject data = read();
        int favorites = data.optJSONArray("favorites") == null ? 0 : data.optJSONArray("favorites").length();
        int history = data.optJSONArray("history") == null ? 0 : data.optJSONArray("history").length();
        JSONObject playlists = data.optJSONObject("playlists");
        int playlistsCount = playlists == null ? 0 : playlists.length();
        int files = audioDir.listFiles() == null ? 0 : audioDir.listFiles().length;
        return "{\"favorites\":" + favorites + ",\"history\":" + history + ",\"playlists\":" + playlistsCount + ",\"files\":" + files + "}";
    }
}
