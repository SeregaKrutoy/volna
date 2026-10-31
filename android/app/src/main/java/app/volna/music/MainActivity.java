package app.volna.music;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Главный экран: весь интерфейс volna упакован внутрь APK (папка assets/www) и
 * открывается с локального origin https://app.volna.local — поэтому приложение
 * запускается и работает без интернета. Сетевые запросы (/api/*) уходят на сервер.
 */
public class MainActivity extends Activity {
    public static final String APP_ORIGIN = "https://app.volna.local";
    private static volatile MainActivity instance;
    private android.webkit.ValueCallback<Uri[]> fileChooserCallback;
    private WebView webView;
    private LibraryStore store;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
        store = new LibraryStore(this);
        prefs = getSharedPreferences("volna", MODE_PRIVATE);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#171722"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#171722"));
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webView.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, android.webkit.ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("audio/*");
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    startActivityForResult(Intent.createChooser(intent, "Выберите аудиофайлы"), 93);
                    return true;
                } catch (Exception e) {
                    fileChooserCallback = null;
                    return false;
                }
            }
        });
        webView.addJavascriptInterface(new Bridge(), "VolnaAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl().toString());
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null || uri.getHost() == null || !uri.getHost().equals("app.volna.local")) return null;
                String path = uri.getPath() == null ? "/" : uri.getPath();
                if (path.startsWith("/api/") || path.startsWith("/_next/image")) {
                    return proxyToServer(uri, request);
                }
                return serveAsset(path);
            }
        });

        root.addView(webView);
        setContentView(root);

        requestNotificationPermission();
        requestMediaPermission();
        webView.loadUrl(APP_ORIGIN + "/");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 93 && fileChooserCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    result = new Uri[count];
                    for (int i = 0; i < count; i++) result[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
            }
            fileChooserCallback.onReceiveValue(result);
            fileChooserCallback = null;
        }
    }

    /** Команды из уведомления для веб-плеера (SoundCloud) и общих действий. */
    public static void dispatchWebCommand(String command) {
        MainActivity activity = instance;
        if (activity == null || activity.webView == null) return;
        String safe = command.replace("'", "");
        activity.runOnUiThread(() -> activity.webView.evaluateJavascript(
                "window.__volnaMediaCommand && window.__volnaMediaCommand('" + safe + "')", null));
    }

    @Override
    protected void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }

    /** Отдаёт файлы интерфейса из assets/www. */
    private WebResourceResponse serveAsset(String path) {
        String clean = path;
        if (clean.endsWith("/")) clean = clean + "index.html";
        if (clean.startsWith("/")) clean = clean.substring(1);
        if (clean.isEmpty()) clean = "index.html";
        try {
            InputStream stream = getAssets().open("www/" + clean);
            return new WebResourceResponse(mimeFor(clean), clean.endsWith(".html") || clean.endsWith(".js") || clean.endsWith(".css") ? "utf-8" : null, stream);
        } catch (Exception e) {
            // Маршруты без расширения (например /share/abc) открываем одностраничным приложением.
            if (!clean.contains(".")) {
                try {
                    InputStream stream = getAssets().open("www/index.html");
                    return new WebResourceResponse("text/html", "utf-8", stream);
                } catch (Exception ignored) {
                }
            }
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not found",
                    new HashMap<>(), new ByteArrayInputStream(new byte[0]));
        }
    }

    private static String mimeFor(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".ico")) return "image/x-icon";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".txt")) return "text/plain";
        if (p.endsWith(".webmanifest")) return "application/manifest+json";
        return "application/octet-stream";
    }

    /** GET-запросы к /api/* (обложки, аудио) проксируются на сервер volna. */
    private WebResourceResponse proxyToServer(Uri uri, WebResourceRequest request) {
        if (!"GET".equalsIgnoreCase(request.getMethod())) return null;
        String target = siteUrl().replaceAll("/$", "") + uri.getPath() + (uri.getEncodedQuery() != null ? "?" + uri.getEncodedQuery() : "");
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(target).openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            Map<String, String> headers = request.getRequestHeaders();
            if (headers != null) {
                for (Map.Entry<String, String> entry : headers.entrySet()) {
                    String key = entry.getKey();
                    if (key == null) continue;
                    String lower = key.toLowerCase();
                    if (lower.equals("host") || lower.equals("origin") || lower.equals("referer")) continue;
                    connection.setRequestProperty(key, entry.getValue());
                }
            }
            int status = connection.getResponseCode();
            String contentType = connection.getContentType();
            String mime = "application/octet-stream";
            String encoding = null;
            if (contentType != null) {
                String[] parts = contentType.split(";");
                mime = parts[0].trim();
                for (String part : parts) {
                    String piece = part.trim();
                    if (piece.toLowerCase().startsWith("charset=")) encoding = piece.substring(8);
                }
            }
            Map<String, String> responseHeaders = new HashMap<>();
            for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
                if (entry.getKey() == null || entry.getValue() == null || entry.getValue().isEmpty()) continue;
                String lower = entry.getKey().toLowerCase();
                if (lower.equals("content-length") || lower.equals("content-range") || lower.equals("accept-ranges")
                        || lower.equals("cache-control") || lower.equals("etag") || lower.equals("content-disposition")) {
                    responseHeaders.put(entry.getKey(), entry.getValue().get(0));
                }
            }
            responseHeaders.put("Access-Control-Allow-Origin", "*");
            InputStream body = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (body == null) body = new ByteArrayInputStream(new byte[0]);
            String reason = status == 206 ? "Partial Content" : status == 200 ? "OK" : status >= 400 ? "Error" : "OK";
            return new WebResourceResponse(mime, encoding, status, reason, responseHeaders, body);
        } catch (Exception e) {
            return new WebResourceResponse("application/json", "utf-8", 503, "Offline",
                    new HashMap<>(), new ByteArrayInputStream("{\"error\":\"offline\"}".getBytes()));
        }
    }

    private boolean handleUrl(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        String host = uri.getHost() == null ? "" : uri.getHost();
        if (host.equals("app.volna.local") || host.isEmpty()) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
        }
        return true;
    }

    private String siteUrl() {
        String saved = prefs.getString("site_url", "");
        return saved == null || saved.isEmpty() ? BuildConfig.SITE_URL : saved;
    }

    private void reload() {
        runOnUiThread(() -> { if (webView != null) webView.loadUrl(APP_ORIGIN + "/"); });
    }

    private boolean isNetworkAvailable() {
        try {
            ConnectivityManager manager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (manager == null) return false;
            if (Build.VERSION.SDK_INT >= 23) {
                Network network = manager.getActiveNetwork();
                if (network == null) return false;
                NetworkCapabilities caps = manager.getNetworkCapabilities(network);
                return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
            }
            NetworkInfo info = manager.getActiveNetworkInfo();
            return info != null && info.isConnected();
        } catch (Exception e) {
            return false;
        }
    }

    private void requestMediaPermission() {
        if (Build.VERSION.SDK_INT < 23) {
            new Thread(() -> store.scanDeviceMusic()).start();
            return;
        }
        String permission = Build.VERSION.SDK_INT >= 33
                ? Manifest.permission.READ_MEDIA_AUDIO
                : Manifest.permission.READ_EXTERNAL_STORAGE;
        if (checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
            new Thread(() -> store.scanDeviceMusic()).start();
        } else {
            requestPermissions(new String[]{permission}, 92);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 92 && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            new Thread(() -> store.scanDeviceMusic()).start();
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 91);
        }
    }

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }


    /** Мост между сайтом и нативным приложением. */
    private class Bridge {
        @JavascriptInterface
        public String getSiteUrl() {
            return siteUrl();
        }

        @JavascriptInterface
        public void setSiteUrl(String url) {
            if (url != null && url.startsWith("http")) {
                prefs.edit().putString("site_url", url).apply();
                runOnUiThread(MainActivity.this::reload);
            }
        }

        @JavascriptInterface
        public String getDeviceLibrary() {
            return Track.listToJson(store.getList("library")).toString();
        }

        @JavascriptInterface
        public int scanDeviceMusic() {
            return store.scanDeviceMusic();
        }

        @JavascriptInterface
        public String stats() {
            return store.stats();
        }

        @JavascriptInterface
        public void syncFavorites(String json) {
            final List<Track> tracks = Track.listFromJson(json);
            new Thread(() -> store.syncFavorites(tracks)).start();
        }

        @JavascriptInterface
        public void syncHistory(String json) {
            final List<Track> incoming = Track.listFromJson(json);
            new Thread(() -> store.syncHistory(incoming)).start();
        }

        @JavascriptInterface
        public void savePlaylist(String name, String json) {
            final String playlistName = name == null || name.isEmpty() ? "Плейлист" : name;
            final List<Track> tracks = Track.listFromJson(json);
            new Thread(() -> {
                String result = store.savePlaylist(playlistName, tracks, true);
                toast("Плейлист «" + playlistName + "» сохранён офлайн");
                android.util.Log.i("Volna", result);
            }).start();
        }

        @JavascriptInterface
        public void cacheTrack(String json) {
            final Track track = Track.fromJson(safeObject(json));
            new Thread(() -> store.cacheTrack(track)).start();
        }

        @JavascriptInterface
        public void playFavorites(int index) {
            PlaybackService.playQueue(MainActivity.this, store.getList("favorites"), index);
        }

        @JavascriptInterface
        public void playHistory(int index) {
            PlaybackService.playQueue(MainActivity.this, store.getList("history"), index);
        }

        @JavascriptInterface
        public void playPlaylist(String name, int index) {
            PlaybackService.playQueue(MainActivity.this, store.getPlaylist(name), index);
        }

        @JavascriptInterface
        public void playQueue(String json, int index) {
            PlaybackService.playQueue(MainActivity.this, Track.listFromJson(json), index);
        }

        @JavascriptInterface
        public void keepAlive() {
            PlaybackService.command(MainActivity.this, PlaybackService.ACTION_KEEPALIVE);
        }

        @JavascriptInterface
        public void pause() {
            PlaybackService.command(MainActivity.this, PlaybackService.ACTION_PLAY_PAUSE);
        }

        @JavascriptInterface
        public void next() {
            PlaybackService.command(MainActivity.this, PlaybackService.ACTION_NEXT);
        }

        @JavascriptInterface
        public void previous() {
            PlaybackService.command(MainActivity.this, PlaybackService.ACTION_PREV);
        }

        @JavascriptInterface
        public void toggleLoop() {
            PlaybackService.command(MainActivity.this, PlaybackService.ACTION_LOOP);
        }

        @JavascriptInterface
        public void updateWebPlayback(String json) {
            try {
                JSONObject object = new JSONObject(json);
                JSONObject trackJson = object.optJSONObject("track");
                if (trackJson != null) PlaybackService.webTrack = Track.fromJson(trackJson);
                PlaybackService.webPlaying = object.optBoolean("playing", false);
                PlaybackService.webLiked = object.optBoolean("liked", false);
                PlaybackService.webShuffle = object.optBoolean("shuffle", false);
                PlaybackService.webLoop = object.optInt("loopMode", 0);
            } catch (Exception ignored) {
            }
            PlaybackService.command(MainActivity.this, PlaybackService.ACTION_WEB_UPDATE);
        }

        @JavascriptInterface
        public void stopWebPlayback() {
            PlaybackService.command(MainActivity.this, PlaybackService.ACTION_WEB_STOP);
        }

        @JavascriptInterface
        public void setShuffle(boolean value) {
            PlaybackService.pendingShuffle = value;
            PlaybackService.command(MainActivity.this, PlaybackService.ACTION_SET_SHUFFLE);
        }

        @JavascriptInterface
        public void toggleShuffle() {
            PlaybackService.command(MainActivity.this, PlaybackService.ACTION_SHUFFLE);
        }

        @JavascriptInterface
        public void seekTo(int positionMs) {
            PlaybackService.seekTo(MainActivity.this, positionMs);
        }

        @JavascriptInterface
        public void setVolume(float volume) {
            PlaybackService.setVolume(MainActivity.this, volume);
        }

        @JavascriptInterface
        public boolean isOnline() {
            return isNetworkAvailable();
        }

        @JavascriptInterface
        public void setLoopMode(int mode) {
            PlaybackService.setLoopMode(MainActivity.this, mode);
        }

        @JavascriptInterface
        public String playbackStatus() {
            return PlaybackService.statusJson();
        }

        @JavascriptInterface
        public void openOffline() {
            runOnUiThread(() -> startActivity(new Intent(MainActivity.this, OfflineActivity.class)));
        }

        @JavascriptInterface
        public String version() {
            return "1.2";
        }

        private JSONObject safeObject(String json) {
            try {
                return new JSONObject(json);
            } catch (Exception e) {
                return new JSONObject();
            }
        }
    }
}
