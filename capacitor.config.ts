import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.vibetune.app",
  appName: "Vibetune",
  webDir: "dist/client",
  // For local testing: set to your local network IP, e.g. http://192.168.1.x:3000
  // For production: set to your deployed URL, e.g. https://vibetune.vercel.app
  server: {
    url: process.env.CAPACITOR_SERVER_URL || "http://localhost:3000",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
};

export default config;
