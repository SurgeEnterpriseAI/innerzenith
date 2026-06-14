import type { CapacitorConfig } from "@capacitor/cli";

// dotit native shell (Capacitor). v1 loads the live web app inside a native
// container with native splash/status-bar/keyboard handling, so it feels like an
// app, not a bare webview. The bundled `mobile/www` page is the offline fallback.
// Hardening step (before App Store submission): switch to a bundled static export.
const config: CapacitorConfig = {
  appId: "in.surgesoftware.dotit",
  appName: "dotit",
  webDir: "mobile/www",
  server: {
    url: "https://innerzenith.vercel.app",
    cleartext: false,
    androidScheme: "https",
  },
  backgroundColor: "#2b2b2b",
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#2b2b2b",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#2b2b2b",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "native",
    },
  },
};

export default config;
