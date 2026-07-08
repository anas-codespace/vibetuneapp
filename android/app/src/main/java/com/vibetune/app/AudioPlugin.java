package com.vibetune.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
    name = "AudioBackground",
    permissions = {}
)
public class AudioPlugin extends Plugin {

    @PluginMethod
    public void startForeground(PluginCall call) {
        AudioForegroundService.start(getContext());
        call.resolve(new JSObject().put("started", true));
    }

    @PluginMethod
    public void stopForeground(PluginCall call) {
        AudioForegroundService.stop(getContext());
        call.resolve(new JSObject().put("stopped", true));
    }
}
