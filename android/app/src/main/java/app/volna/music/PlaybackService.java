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
    public static final String ACTION_SEEK = "app.volna.music.SEEK";
    public static final String ACTION_SHUFFLE = "app.volna.music.SHUFFLE";
    public static final String ACTION_SET_SHUFFLE = "app.volna.music.SET_SHUFFLE";
    public static boolean pendingShuffle = false;
    public static final String ACTION_FAVORITE = "app.volna.music.FAVORITE";
    public static final String ACTION_WEB_UPDATE = "app.volna.music.WEB_UPDATE";
    public static final String ACTION_WEB_STOP = "app.volna.music.WEB_STOP";
    public static final String ACTION_SET_VOLUME = "app.volna.music.SET_VOLUME";

    public static List<Track> pendingQueue = new ArrayList<>();
    public static int pendingIndex = 0;
    public static int pendingLoop = 0;
    public static int pendingSeekMs = 0;
    /** Состояние веб-плеера (SoundCloud в WebView): уведомление показывается без MediaPlayer. */
    public static volatile Track webTrack;
    public static volatile boolean webPlaying = false;
    public static volatile boolean webLiked = false;
    public static volatile boolean webShuffle = false;
    public static volatile int webLoop = 0;
    public static float pendingVolume = 1f;
    private static volatile PlaybackService activeInstance;

    private MediaPlayer player;
    private MediaSession session;
    private List<Track> queue = new ArrayList<>();
    private int index = 0;
    private int loopMode = 0;
    private boolean preparing = false;
    private boolean queueEnded = false;
    private boolean webMode = false;
    private boolean shuffle = false;
    private final java.util.Random random = new java.util.Random();

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

    public static void seekTo(Context context, int positionMs) {
        pendingSeekMs = Math.max(0, positionMs);
        PlaybackService service = activeInstance;
        if (service != null) { service.applySeek(); return; }
        command(context, ACTION_SEEK);
    }

    public static void setVolume(Context context, float volume) {
        pendingVolume = Math.max(0f, Math.min(1f, volume));
        PlaybackService service = activeInstance;
        if (service != null) { service.applyVolume(); return; }
        command(context, ACTION_SET_VOLUME);
    }

    private void applySeek() {
        try {
            if (player != null && !preparing) { player.seekTo(pendingSeekMs); pushState(); }
        } catch (Exception ignored) {
        }
    }

    private void applyVolume() {
        try {
            if (player != null) player.setVolume(pendingVolume, pendingVolume);
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
            object.put("ended", service.queueEnded);
            object.put("shuffle", service.shuffle);
            object.put("webMode", service.webMode);
            if (service.webMode) object.put("active", false);
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
            @Override public void onPlay() { if (webMode) MainActivity.dispatchWebCommand("play"); else resume(); }
            @Override public void onPause() { if (webMode) MainActivity.dispatchWebCommand("pause"); else pause(); }
            @Override public void onSkipToNext() { if (webMode) MainActivity.dispatchWebCommand("next"); else next(); }
            @Override public void onSkipToPrevious() { if (webMode) MainActivity.dispatchWebCommand("previous"); else previous(); }
            @Override public void onStop() { if (webMode) MainActivity.dispatchWebCommand("pause"); else stopPlayback(); }
            @Override public void onSeekTo(long pos) { if (webMode) MainActivity.dispatchWebCommand("seek:" + pos); else { pendingSeekMs = (int) pos; applySeek(); } }
            @Override public void onCustomAction(String action, android.os.Bundle extras) {
                command(PlaybackService.this, action);
            }
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
            case ACTION_PLAY_PAUSE: if (webMode) MainActivity.dispatchWebCommand("play_pause"); else toggle(); break;
            case ACTION_NEXT: if (webMode) MainActivity.dispatchWebCommand("next"); else next(); break;
            case ACTION_PREV: if (webMode) MainActivity.dispatchWebCommand("previous"); else previous(); break;
            case ACTION_LOOP: if (webMode) MainActivity.dispatchWebCommand("loop"); else cycleLoop(); break;
            case ACTION_STOP: stopPlayback(); return START_NOT_STICKY;
            case ACTION_START: webMode = false; startQueue(pendingQueue, pendingIndex); break;
            case ACTION_KEEPALIVE: break;
            case ACTION_SET_LOOP: loopMode = pendingLoop; updateNotification(); pushState(); break;
            case ACTION_SEEK: applySeek(); break;
            case ACTION_SHUFFLE:
                if (webMode) MainActivity.dispatchWebCommand("shuffle");
                else { shuffle = !shuffle; updateNotification(); pushState(); }
                break;
            case ACTION_SET_SHUFFLE:
                if (!webMode && shuffle != pendingShuffle) { shuffle = pendingShuffle; updateNotification(); pushState(); }
                break;
            case ACTION_FAVORITE:
                MainActivity.dispatchWebCommand("favorite");
                break;
            case ACTION_WEB_UPDATE:
                webMode = true;
                releasePlayer();
                if (webTrack != null) pushMetadata(webTrack);
                pushState();
                updateNotification();
                break;
            case ACTION_WEB_STOP:
                if (webMode) { webMode = false; stopPlayback(); return START_NOT_STICKY; }
                break;
            case ACTION_SET_VOLUME: applyVolume(); break;
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
        queueEnded = false;
        releasePlayer();
        preparing = true;
        player = new MediaPlayer();
        try {
            String source = !track.localPath.isEmpty() ? track.localPath : track.audioUrl;
            if (source.startsWith("content://")) player.setDataSource(this, android.net.Uri.parse(source));
            else player.setDataSource(source);
            player.setOnPreparedListener(mp -> {
                preparing = false;
                try { mp.setVolume(pendingVolume, pendingVolume); } catch (Exception ignored) {}
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
        if (shuffle && queue.size() > 1) {
            next();
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
        // Конец очереди без зацикливания: останавливаемся и сообщаем интерфейсу.
        queueEnded = true;
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
        if (shuffle && queue.size() > 1) {
            int candidate;
            do { candidate = random.nextInt(queue.size()); } while (candidate == index);
            index = candidate;
        } else {
            index = (index + 1) % queue.size();
        }
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
        boolean playing = webMode ? webPlaying : player != null;
        try {
            playing = player != null && player.isPlaying();
        } catch (Exception ignored) {
        }
        PlaybackState.Builder builder = new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT
                        | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, 0, 1f);
        int loop = webMode ? webLoop : loopMode;
        boolean shuffled = webMode ? webShuffle : shuffle;
        boolean liked = webMode ? webLiked : isLiked(webMode ? webTrack : current());
        builder.addCustomAction(new PlaybackState.CustomAction.Builder(ACTION_SHUFFLE, shuffled ? "Перемешано" : "Перемешать", shuffled ? R.drawable.ic_shuffle_on : R.drawable.ic_shuffle).build());
        builder.addCustomAction(new PlaybackState.CustomAction.Builder(ACTION_LOOP, loop == 2 ? "Повтор трека" : loop == 1 ? "Повтор плейлиста" : "Повтор", loop == 2 ? R.drawable.ic_repeat_one : loop == 1 ? R.drawable.ic_repeat_on : R.drawable.ic_repeat).build());
        builder.addCustomAction(new PlaybackState.CustomAction.Builder(ACTION_FAVORITE, liked ? "В любимых" : "В любимые", liked ? R.drawable.ic_heart_on : R.drawable.ic_heart).build());
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
        Track track = webMode ? webTrack : current();
        String title = track != null ? track.title : "volna";
        String subtitle = track != null ? track.artist : "Музыка из вашей медиатеки";
        boolean playing = false;
        if (webMode) {
            playing = webPlaying;
        } else {
            try {
                playing = player != null && player.isPlaying();
            } catch (Exception ignored) {
            }
        }
        int loop = webMode ? webLoop : loopMode;
        boolean shuffled = webMode ? webShuffle : shuffle;
        boolean liked = webMode ? webLiked : isLiked(track);
        String loopLabel = loop == 1 ? "Повтор плейлиста" : loop == 2 ? "Повтор трека" : "Повтор выключен";

        Intent openIntent = new Intent(this, MainActivity.class);
        int openFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) openFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(this, 60, openIntent, openFlags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        builder.setContentTitle(title)
                .setContentText(subtitle)
                .setSubText((webMode ? "SoundCloud · " : "") + loopLabel + (shuffled ? " · перемешано" : ""))
                .setSmallIcon(R.drawable.ic_volna)
                .setContentIntent(contentIntent)
                .setOngoing(playing)
                .setShowWhen(false)
                .addAction(new Notification.Action.Builder(shuffled ? R.drawable.ic_shuffle_on : R.drawable.ic_shuffle, shuffled ? "Перемешано" : "Перемешать", actionIntent(ACTION_SHUFFLE, 66)).build())
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, "Назад", actionIntent(ACTION_PREV, 61)).build())
                .addAction(new Notification.Action.Builder(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Пауза" : "Играть", actionIntent(ACTION_PLAY_PAUSE, 62)).build())
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, "Вперёд", actionIntent(ACTION_NEXT, 63)).build())
                .addAction(new Notification.Action.Builder(loop == 2 ? R.drawable.ic_repeat_one : loop == 1 ? R.drawable.ic_repeat_on : R.drawable.ic_repeat, loopLabel, actionIntent(ACTION_LOOP, 64)).build())
                .addAction(new Notification.Action.Builder(liked ? R.drawable.ic_heart_on : R.drawable.ic_heart, liked ? "В любимых" : "В любимые", actionIntent(ACTION_FAVORITE, 67)).build())
                .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(1, 2, 3));
        return builder.build();
    }

    private boolean isLiked(Track track) {
        if (track == null) return false;
        try {
            for (Track item : new LibraryStore(this).favorites()) {
                if (track.id.equals(item.id)) return true;
            }
        } catch (Exception ignored) {
        }
        return false;
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
