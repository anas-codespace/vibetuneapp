package com.vibetune.app;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/**
 * Bridges the web player to the native media session / foreground service so
 * playback continues in the background with a full "Now Playing" notification.
 */
@CapacitorPlugin(
    name = "AudioBackground",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class AudioPlugin extends Plugin {

    @Override
    public void load() {
        AudioForegroundService.setControlListener(action -> {
            JSObject data = new JSObject();
            if (action.startsWith("seek:")) {
                data.put("action", "seek");
                data.put("position", Long.parseLong(action.substring(5)));
            } else {
                data.put("action", action);
            }
            notifyListeners("mediaControl", data);
        });
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState("notifications") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "permissionCallback");
            return;
        }
        call.resolve(new JSObject().put("granted", true));
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void permissionCallback(PluginCall call) {
        call.resolve(new JSObject().put("granted", getPermissionState("notifications") == com.getcapacitor.PermissionState.GRANTED));
    }

    @PluginMethod
    public void startForeground(PluginCall call) {
        AudioForegroundService.update(
            getContext(),
            call.getString("title", "Vibetune"),
            call.getString("artist", ""),
            call.getString("artwork", ""),
            Boolean.TRUE.equals(call.getBoolean("isPlaying", true)),
            call.getLong("position", 0L),
            call.getLong("duration", 0L)
        );
        call.resolve(new JSObject().put("started", true));
    }

    @PluginMethod
    public void updateNowPlaying(PluginCall call) {
        AudioForegroundService.update(
            getContext(),
            call.getString("title", "Vibetune"),
            call.getString("artist", ""),
            call.getString("artwork", ""),
            Boolean.TRUE.equals(call.getBoolean("isPlaying", true)),
            call.getLong("position", 0L),
            call.getLong("duration", 0L)
        );
        call.resolve(new JSObject().put("updated", true));
    }

    @PluginMethod
    public void stopForeground(PluginCall call) {
        AudioForegroundService.stop(getContext());
        call.resolve(new JSObject().put("stopped", true));
    }
}
