// APP_ENV=staging npm start points the app at the staging Supabase project
// (.env.staging) instead of production (.env) — see .env.staging.example.
const envFile = process.env.APP_ENV === "staging" ? ".env.staging" : ".env";
require("dotenv").config({ path: require("path").resolve(__dirname, envFile) });

  module.exports = {
    expo: {
      name: "SchoolLoop",
      slug: "CarpoolingApp",
      scheme: "schoolloop",
      version: "1.0.0",
      orientation: "portrait",
      icon: "./assets/icon.png",
      userInterfaceStyle: "automatic",
      newArchEnabled: true,
      splash: {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#0A0E17",
      },
      ios: {
        supportsTablet: true,
        bundleIdentifier: "com.pvpp.schoolloop",
        config: {
          googleMapsApiKey: process.env.GOOGLE_API_KEY,
        },
      },
      android: {
        package: "com.pvpp.schoolloop",
        adaptiveIcon: {
          foregroundImage: "./assets/adaptive-icon.png",
          backgroundColor: "#0A0E17",
        },
        edgeToEdgeEnabled: true,
        predictiveBackGestureEnabled: false,
        config: {
          googleMaps: {
            apiKey: process.env.GOOGLE_API_KEY,
          },
        },
      },
      web: {
        favicon: "./assets/favicon.png",
      },
      plugins: ["expo-router", "expo-secure-store", "expo-font", "@sentry/react-native/expo"],
      extra: {
          googleApiKey: process.env.GOOGLE_API_KEY,
          debug_googleKey: process.env.GOOGLE_API_KEY ? "LOADED" : "MISSING",
          appEnv: process.env.APP_ENV === "staging" ? "staging" : "production",
          eas: {
            projectId: process.env.EAS_PROJECT_ID,
          },
      },
    },
  };