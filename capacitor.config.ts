import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.vibetune.app",
  appName: "Vibetune",
  webDir: "dist/client",
  // Vibetune runs on a server (SSR + server functions), so the native shell
  // loads the deployed site. Override with CAPACITOR_SERVER_URL for local dev
  // (e.g. http://192.168.1.x:3000).
  server: {
    url: process.env.CAPACITOR_SERVER_URL || "https://vibetuneapp.lovable.app",
    cleartext: true,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true,
    backgroundColor: "#000000",
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#000000",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#000000",
      overlaysWebView: false,
    },
  },
};

export default config;
