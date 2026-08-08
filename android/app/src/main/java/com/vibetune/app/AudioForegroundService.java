package com.vibetune.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import androidx.media.session.MediaButtonReceiver;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground media service for Vibetune.
 *
 * Hosts a MediaSession so the OS renders a rich "Now Playing" media
 * notification (with artwork, seek bar and transport controls), surfaces the
 * track on the lock screen, in the Android 13+ media output chip / Quick
 * Settings player, in Android Auto and on Bluetooth displays. On iOS the same
 * metadata is published through the web MediaSession API, which drives the
 * Now Playing / Dynamic Island live activity.
 */
public class AudioForegroundService extends Service {

    public static final String ACTION_PLAY = "com.vibetune.app.PLAY";
    public static final String ACTION_PAUSE = "com.vibetune.app.PAUSE";
    public static final String ACTION_NEXT = "com.vibetune.app.NEXT";
    public static final String ACTION_PREV = "com.vibetune.app.PREV";
    public static final String ACTION_STOP = "com.vibetune.app.STOP";
    public static final String ACTION_UPDATE = "com.vibetune.app.UPDATE";

    private static final String CHANNEL_ID = "vibetune_playback";
    private static final int NOTIFICATION_ID = 4711;

    private static AudioForegroundService instance;

    /** Set by AudioPlugin so native transport events reach the WebView. */
    private static ControlListener controlListener;

    public interface ControlListener {
        void onControl(String action);
    }

    // Current metadata / playback snapshot.
    private static String title = "Vibetune";
    private static String artist = "";
    private static String album = "Vibetune";
    private static String artworkUrl = "";
    private static boolean playing = false;
    private static long positionMs = 0;
    private static long durationMs = 0;

    private MediaSessionCompat session;
    private Bitmap artwork;
    private String artworkLoadedFor = "";
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    public static void setControlListener(ControlListener listener) {
        controlListener = listener;
    }

    public static void start(Context context) {
        Intent intent = new Intent(context, AudioForegroundService.class);
        intent.setAction(ACTION_UPDATE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void update(
        Context context,
        String newTitle,
        String newArtist,
        String newAlbum,
        String newArtwork,
        boolean isPlaying,
        long position,
        long duration
    ) {
        if (newTitle != null && !newTitle.isEmpty()) title = newTitle;
        if (newArtist != null) artist = newArtist;
        if (newAlbum != null && !newAlbum.isEmpty()) album = newAlbum;
        if (newArtwork != null) artworkUrl = newArtwork;
        playing = isPlaying;
        positionMs = position;
        durationMs = duration;
        start(context);
    }


    public static void stop(Context context) {
        Intent intent = new Intent(context, AudioForegroundService.class);
        intent.setAction(ACTION_STOP);
        context.startService(intent);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createNotificationChannel();
        initSession();
        startInForeground(buildNotification());
    }

    private void initSession() {
        session = new MediaSessionCompat(this, "VibetuneSession");
        session.setFlags(
            MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS
                | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        );
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                dispatch(ACTION_PLAY);
            }

            @Override
            public void onPause() {
                dispatch(ACTION_PAUSE);
            }

            @Override
            public void onSkipToNext() {
                dispatch(ACTION_NEXT);
            }

            @Override
            public void onSkipToPrevious() {
                dispatch(ACTION_PREV);
            }

            @Override
            public void onStop() {
                dispatch(ACTION_STOP);
            }

            @Override
            public void onSeekTo(long pos) {
                positionMs = pos;
                if (controlListener != null) controlListener.onControl("seek:" + pos);
                refresh();
            }
        });
        session.setActive(true);
    }

    private void dispatch(String action) {
        if (ACTION_STOP.equals(action)) {
            if (controlListener != null) controlListener.onControl("stop");
            stopSelf();
            return;
        }
        if (controlListener != null) {
            controlListener.onControl(action.substring(action.lastIndexOf('.') + 1).toLowerCase());
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (session != null) {
            MediaButtonReceiver.handleIntent(session, intent);
        }
        if (ACTION_STOP.equals(action)) {
            if (controlListener != null) controlListener.onControl("stop");
            stopForegroundCompat();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_PLAY.equals(action) || ACTION_PAUSE.equals(action)
            || ACTION_NEXT.equals(action) || ACTION_PREV.equals(action)) {
            dispatch(action);
        }
        loadArtworkIfNeeded();
        refresh();
        return START_STICKY;
    }

    private void startInForeground(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
    }

    /** Re-publishes metadata + playback state and refreshes the notification. */
    private void refresh() {
        if (session == null) return;

        MediaMetadataCompat.Builder meta = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "Vibetune")
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
        if (artwork != null) {
            meta.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork);
        }
        session.setMetadata(meta.build());

        session.setPlaybackState(
            new PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY
                        | PlaybackStateCompat.ACTION_PAUSE
                        | PlaybackStateCompat.ACTION_PLAY_PAUSE
                        | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                        | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                        | PlaybackStateCompat.ACTION_SEEK_TO
                        | PlaybackStateCompat.ACTION_STOP
                )
                .setState(
                    playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                    positionMs,
                    playing ? 1f : 0f
                )
                .build()
        );

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification());
        }
    }

    private void loadArtworkIfNeeded() {
        final String url = artworkUrl;
        if (url == null || url.isEmpty() || url.equals(artworkLoadedFor)) return;
        artworkLoadedFor = url;
        io.execute(() -> {
            Bitmap bmp = downloadBitmap(url);
            if (bmp != null) {
                artwork = bmp;
                refresh();
            }
        });
    }

    @Nullable
    private Bitmap downloadBitmap(String url) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoInput(true);
            conn.connect();
            InputStream in = conn.getInputStream();
            return BitmapFactory.decodeStream(in);
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private PendingIntent actionIntent(String action) {
        Intent intent = new Intent(this, AudioForegroundService.class).setAction(action);
        return PendingIntent.getService(
            this, action.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private Notification buildNotification() {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent contentIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        MediaStyle style = new MediaStyle().setShowActionsInCompactView(0, 1, 2);
        if (session != null) style.setMediaSession(session.getSessionToken());

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(artist)
            .setSmallIcon(R.drawable.ic_stat_vibetune)
            .setLargeIcon(artwork)
            .setContentIntent(contentIntent)
            .setDeleteIntent(actionIntent(ACTION_STOP))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(playing)
            .setStyle(style)
            .addAction(android.R.drawable.ic_media_previous, "Previous", actionIntent(ACTION_PREV))
            .addAction(
                playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "Pause" : "Play",
                actionIntent(playing ? ACTION_PAUSE : ACTION_PLAY)
            )
            .addAction(android.R.drawable.ic_media_next, "Next", actionIntent(ACTION_NEXT))
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", actionIntent(ACTION_STOP));

        return builder.build();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
        io.shutdownNow();
        instance = null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Playback",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Now playing controls for Vibetune");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }
}
