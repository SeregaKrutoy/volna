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
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private WebView webView;
    private LinearLayout offlinePanel;
    private LibraryStore store;
    private SharedPreferences prefs;
    private boolean mainFrameFailed = false;
    private boolean openedOfflineAutomatically = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new LibraryStore(this);
        prefs = getSharedPreferences("volna", MODE_PRIVATE);

        FrameLayout root = new FrameLayout(this);

        webView = new WebView(this);
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
        if (Build.VERSION.SDK_INT >= 21) {
            webView.setWebChromeClient(new android.webkit.WebChromeClient());
        }
        webView.addJavascriptInterface(new Bridge(), "VolnaAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl().toString());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    mainFrameFailed = true;
                    showOfflinePanel();
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                mainFrameFailed = true;
                showOfflinePanel();
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) {
                    mainFrameFailed = true;
                    showOfflinePanel();
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!mainFrameFailed && url != null && !url.startsWith("chrome-error:") && isNetworkAvailable()) {
                    hideOfflinePanel();
                } else {
                    showOfflinePanel();
                }
            }
        });

        offlinePanel = buildOfflinePanel();
        offlinePanel.setVisibility(View.GONE);

        root.addView(webView);
        root.addView(offlinePanel);
        setContentView(root);

        requestNotificationPermission();
        requestMediaPermission();
        if (isNetworkAvailable()) {
            reload();
        } else {
            showOfflinePanel();
            openOfflineLibrary();
        }
    }

    private boolean handleUrl(String url) {
        if (url == null) return false;
        String siteHost = siteHost();
        Uri uri = Uri.parse(url);
        String host = uri.getHost() == null ? "" : uri.getHost();
        if (host.equals(siteHost) || host.isEmpty()) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
        }
        return true;
    }

    private String siteHost() {
        try {
            return Uri.parse(siteUrl()).getHost();
        } catch (Exception e) {
            return "";
        }
    }

    private String siteUrl() {
        String saved = prefs.getString("site_url", "");
        return saved == null || saved.isEmpty() ? BuildConfig.SITE_URL : saved;
    }

    private void reload() {
        if (!isNetworkAvailable()) {
            mainFrameFailed = true;
            showOfflinePanel();
            return;
        }
        mainFrameFailed = false;
        hideOfflinePanel();
        webView.loadUrl(siteUrl());
    }

    private boolean isNetworkAvailable() {
        try {
            ConnectivityManager manager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (manager == null) return false;
            if (Build.VERSION.SDK_INT >= 23) {
                Network network = manager.getActiveNetwork();
                if (network == null) return false;
                NetworkCapabilities caps = manager.getNetworkCapabilities(network);
                return caps != null
                        && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
            }
            NetworkInfo info = manager.getActiveNetworkInfo();
            return info != null && info.isConnected();
        } catch (Exception e) {
            return false;
        }
    }

    private void openOfflineLibrary() {
        if (openedOfflineAutomatically) return;
        openedOfflineAutomatically = true;
        startActivity(new Intent(MainActivity.this, OfflineActivity.class));
    }

    private LinearLayout buildOfflinePanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setBackgroundColor(Color.parseColor("#171722"));
        panel.setPadding(48, 48, 48, 48);
        panel.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        TextView title = new TextView(this);
        title.setText("Нет подключения");
        title.setTextSize(24);
        title.setTextColor(Color.WHITE);
        title.setGravity(Gravity.CENTER);
        panel.addView(title);

        TextView hint = new TextView(this);
        hint.setText("Доступна офлайн-медиатека: любимые треки, прослушанное и сохранённые плейлисты.");
        hint.setTextSize(14);
        hint.setTextColor(Color.parseColor("#B9B5CB"));
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, 16, 0, 28);
        panel.addView(hint);

        Button offline = new Button(this);
        offline.setText("Открыть офлайн-медиатеку");
        offline.setOnClickListener(v -> startActivity(new Intent(MainActivity.this, OfflineActivity.class)));
        panel.addView(offline);

        Button retry = new Button(this);
        retry.setText("Повторить подключение");
        retry.setOnClickListener(v -> reload());
        panel.addView(retry);

        Button changeUrl = new Button(this);
        changeUrl.setText("Изменить адрес сайта");
        changeUrl.setOnClickListener(v -> showUrlDialog());
        panel.addView(changeUrl);
        return panel;
    }

    private void showUrlDialog() {
        final EditText input = new EditText(this);
        input.setText(siteUrl());
        input.setSelectAllOnFocus(true);
        new android.app.AlertDialog.Builder(this)
                .setTitle("Адрес сайта volna")
                .setMessage("Укажите адрес, по которому открывается сайт")
                .setView(input)
                .setPositiveButton("Сохранить", (dialog, which) -> {
                    String value = input.getText().toString().trim();
                    if (value.startsWith("http")) {
                        prefs.edit().putString("site_url", value).apply();
                        reload();
                    }
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    private void showOfflinePanel() {
        runOnUiThread(() -> {
            if (offlinePanel != null) offlinePanel.setVisibility(View.VISIBLE);
            if (webView != null) webView.setVisibility(View.GONE);
        });
    }

    private void hideOfflinePanel() {
        runOnUiThread(() -> {
            if (offlinePanel != null) offlinePanel.setVisibility(View.GONE);
            if (webView != null) webView.setVisibility(View.VISIBLE);
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (isNetworkAvailable()) {
            openedOfflineAutomatically = false;
            if (offlinePanel != null && offlinePanel.getVisibility() == View.VISIBLE) reload();
        } else if (offlinePanel != null) {
            showOfflinePanel();
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
            return "1.0";
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
