package app.volna.music;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class Track {
    public String id = "";
    public String title = "";
    public String artist = "";
    public String album = "";
    public String artwork = "";
    public String audioUrl = "";
    public String source = "hitmos";
    public String localPath = "";
    public int duration = 0;

    public static Track fromJson(JSONObject o) {
        Track t = new Track();
        t.id = o.optString("id", "");
        t.title = o.optString("title", "Без названия");
        t.artist = o.optString("artist", "Неизвестный исполнитель");
        t.album = o.optString("album", "");
        t.artwork = o.optString("artwork", "");
        t.audioUrl = o.optString("audioUrl", "");
        t.source = o.optString("source", "hitmos");
        t.localPath = o.optString("localPath", "");
        t.duration = o.optInt("duration", 0);
        return t;
    }

    public JSONObject toJson() {
        JSONObject o = new JSONObject();
        try {
            o.put("id", id);
            o.put("title", title);
            o.put("artist", artist);
            o.put("album", album);
            o.put("artwork", artwork);
            o.put("audioUrl", audioUrl);
            o.put("source", source);
            o.put("localPath", localPath);
            o.put("duration", duration);
        } catch (Exception ignored) {
        }
        return o;
    }

    public boolean isPlayable() {
        if (!localPath.isEmpty()) return true;
        return audioUrl.startsWith("http://") || audioUrl.startsWith("https://");
    }

    public static List<Track> listFromJson(String json) {
        List<Track> out = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(json == null ? "[]" : json);
            for (int i = 0; i < array.length(); i++) {
                JSONObject o = array.optJSONObject(i);
                if (o != null) out.add(fromJson(o));
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    public static JSONArray listToJson(List<Track> tracks) {
        JSONArray array = new JSONArray();
        for (Track t : tracks) array.put(t.toJson());
        return array;
    }
}
