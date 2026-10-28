package app.volna.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;

import java.util.ArrayList;
import java.util.List;

import org.json.JSONObject;

/** Фоновое воспроизведение с управлением из уведомления и поддержкой зацикливания. */
public class PlaybackService extends Service {
    public static final String CHANNEL_ID = "volna_playback";
    public static final int NOTIFICATION_ID = 7101;

    public static final String ACTION_START = "app.volna.music.START";
    public static final String ACTION_PLAY_PAUSE = "app.volna.music.PLAY_PAUSE";
    public static final String ACTION_NEXT = "app.volna.music.NEXT";
    public static final String ACTION_PREV = "app.volna.music.PREV";
    public static final String ACTION_LOOP = "app.volna.music.LOOP";
    public static final String ACTION_STOP = "app.volna.music.STOP";
    public static final String ACTION_KEEPALIVE = "app.volna.music.KEEPALIVE";
    public static final String ACTION_SET_LOOP = "app.volna.music.SET_LOOP";

    public static List<Track> pendingQueue = new ArrayList<>();
    public static int pendingIndex = 0;
    public static int pendingLoop = 0;
    private static volatile PlaybackService activeInstance;

    private MediaPlayer player;
    private MediaSession session;
    private List<Track> queue = new ArrayList<>();
    private int index = 0;
    private int loopMode = 0;
    private boolean preparing = false;

    public static void playQueue(Context context, List<Track> tracks, int startIndex) {
        if (tracks == null || tracks.isEmpty()) return;
        pendingQueue = new ArrayList<>(tracks);
        pendingIndex = Math.max(0, Math.min(startIndex, tracks.size() - 1));
        Intent intent = new Intent(context, PlaybackService.class);
        intent.setAction(ACTION_START);
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
        else context.startService(intent);
    }

    public static void command(Context context, String action) {
        Intent intent = new Intent(context, PlaybackService.class);
        intent.setAction(action);
        try {
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
            else context.startService(intent);
        } catch (Exception ignored) {
        }
    }

    public static void setLoopMode(Context context, int mode) {
        pendingLoop = Math.max(0, Math.min(2, mode));
        command(context, ACTION_SET_LOOP);
    }

    public static String statusJson() {
        PlaybackService service = activeInstance;
        JSONObject object = new JSONObject();
        try {
            if (service == null) {
                object.put("active", false);
                object.put("playing", false);
                return object.toString();
            }
            Track track = service.current();
            boolean playing = false;
            int position = 0;
            int duration = 0;
            try {
                playing = service.player != null && service.player.isPlaying();
                position = service.player != null ? service.player.getCurrentPosition() : 0;
                duration = service.player != null ? service.player.getDuration() : 0;
            } catch (Exception ignored) {
            }
            object.put("active", track != null);
            object.put("playing", playing);
            object.put("trackId", track != null ? track.id : "");
            object.put("index", service.index);
            object.put("position", position);
            object.put("duration", duration);
            object.put("loopMode", service.loopMode);
        } catch (Exception ignored) {
        }
        return object.toString();
    }

    @Override
    public void onCreate() {
        super.onCreate();
        activeInstance = this;
        createChannel();
        session = new MediaSession(this, "volna");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { resume(); }
            @Override public void onPause() { pause(); }
            @Override public void onSkipToNext() { next(); }
            @Override public void onSkipToPrevious() { previous(); }
            @Override public void onStop() { stopPlayback(); }
        });
        session.setActive(true);
        pushState();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Воспроизведение", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Управление музыкой volna");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null && intent.getAction() != null ? intent.getAction() : ACTION_START;
        startForeground(NOTIFICATION_ID, buildNotification());
        switch (action) {
            case ACTION_PLAY_PAUSE: toggle(); break;
            case ACTION_NEXT: next(); break;
            case ACTION_PREV: previous(); break;
            case ACTION_LOOP: cycleLoop(); break;
            case ACTION_STOP: stopPlayback(); return START_NOT_STICKY;
            case ACTION_START: startQueue(pendingQueue, pendingIndex); break;
            case ACTION_KEEPALIVE: break;
            case ACTION_SET_LOOP: loopMode = pendingLoop; updateNotification(); pushState(); break;
            default: break;
        }
        return START_STICKY;
    }

    private void startQueue(List<Track> tracks, int startIndex) {
        if (tracks == null || tracks.isEmpty()) return;
        queue = new LibraryStore(this).resolveForPlayback(new ArrayList<>(tracks));
        index = Math.max(0, Math.min(startIndex, queue.size() - 1));
        loadCurrent();
    }

    private Track current() {
        if (queue.isEmpty() || index < 0 || index >= queue.size()) return null;
        return queue.get(index);
    }

    private void loadCurrent() {
        Track track = current();
        if (track == null) return;
        releasePlayer();
        preparing = true;
        player = new MediaPlayer();
        try {
            String source = !track.localPath.isEmpty() ? track.localPath : track.audioUrl;
            if (source.startsWith("content://")) player.setDataSource(this, android.net.Uri.parse(source));
            else player.setDataSource(source);
            player.setOnPreparedListener(mp -> {
                preparing = false;
                mp.start();
                pushMetadata(track);
                pushState();
                updateNotification();
                LibraryStore store = new LibraryStore(PlaybackService.this);
                if (track.localPath.isEmpty()) store.addToHistory(track);
            });
            player.setOnCompletionListener(mp -> onFinished());
            player.setOnErrorListener((mp, what, extra) -> {
                preparing = false;
                pushState();
                return true;
            });
            player.prepareAsync();
        } catch (Exception e) {
            preparing = false;
            pushState();
        }
    }

    private void onFinished() {
        if (loopMode == 2) {
            seekToStartAndPlay();
            return;
        }
        if (index + 1 < queue.size()) {
            index++;
            loadCurrent();
            return;
        }
        if (loopMode == 1 && !queue.isEmpty()) {
            index = 0;
            loadCurrent();
            return;
        }
        pushState();
        updateNotification();
    }

    private void seekToStartAndPlay() {
        if (player != null) {
            try {
                player.seekTo(0);
                player.start();
                pushState();
            } catch (Exception ignored) {
            }
        }
    }

    private void resume() {
        if (player != null) {
            try {
                player.start();
                pushState();
                updateNotification();
            } catch (Exception ignored) {
            }
        } else if (!queue.isEmpty()) {
            loadCurrent();
        }
    }

    private void pause() {
        if (player != null && player.isPlaying()) {
            try {
                player.pause();
            } catch (Exception ignored) {
            }
        }
        pushState();
        updateNotification();
    }

    private void toggle() {
        if (player != null && player.isPlaying()) pause(); else resume();
    }

    private void next() {
        if (queue.isEmpty()) return;
        index = (index + 1) % queue.size();
        loadCurrent();
    }

    private void previous() {
        if (queue.isEmpty()) return;
        index = (index - 1 + queue.size()) % queue.size();
        loadCurrent();
    }

    private void cycleLoop() {
        loopMode = (loopMode + 1) % 3;
        updateNotification();
        pushState();
    }

    private void stopPlayback() {
        releasePlayer();
        stopForeground(true);
        stopSelf();
    }

    private void releasePlayer() {
        if (player != null) {
            try {
                player.stop();
            } catch (Exception ignored) {
            }
            player.release();
            player = null;
        }
    }

    private void pushMetadata(Track track) {
        MediaMetadata.Builder builder = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, track.title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, track.artist)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, track.album);
        if (track.duration > 0) builder.putLong(MediaMetadata.METADATA_KEY_DURATION, track.duration * 1000L);
        session.setMetadata(builder.build());
    }

    private void pushState() {
        if (session == null) return;
        boolean playing = player != null;
        try {
            playing = player != null && player.isPlaying();
        } catch (Exception ignored) {
        }
        PlaybackState.Builder builder = new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT
                        | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, 0, 1f);
        session.setPlaybackState(builder.build());
        session.setActive(true);
    }

    private PendingIntent actionIntent(String action, int requestCode) {
        Intent intent = new Intent(this, PlaybackService.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getService(this, requestCode, intent, flags);
    }

    private Notification buildNotification() {
        Track track = current();
        String title = track != null ? track.title : "volna";
        String subtitle = track != null ? track.artist : "Музыка из вашей медиатеки";
        boolean playing = false;
        try {
            playing = player != null && player.isPlaying();
        } catch (Exception ignored) {
        }
        String loopLabel = loopMode == 1 ? "Зациклен плейлист" : loopMode == 2 ? "Зациклен трек" : "Зацикливание выключено";

        Intent openIntent = new Intent(this, MainActivity.class);
        int openFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) openFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(this, 60, openIntent, openFlags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        builder.setContentTitle(title)
                .setContentText(subtitle + " · " + loopLabel)
                .setSmallIcon(R.drawable.ic_volna)
                .setContentIntent(contentIntent)
                .setOngoing(true)
                .setShowWhen(false)
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, "Назад", actionIntent(ACTION_PREV, 61)).build())
                .addAction(new Notification.Action.Builder(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Пауза" : "Играть", actionIntent(ACTION_PLAY_PAUSE, 62)).build())
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, "Вперёд", actionIntent(ACTION_NEXT, 63)).build())
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_rotate, loopLabel, actionIntent(ACTION_LOOP, 64)).build())
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Стоп", actionIntent(ACTION_STOP, 65)).build())
                .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        return builder.build();
    }

    private void updateNotification() {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification());
        } catch (Exception ignored) {
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        releasePlayer();
        if (activeInstance == this) activeInstance = null;
        if (session != null) {
            session.setActive(false);
            session.release();
        }
        super.onDestroy();
    }
}
