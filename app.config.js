require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

  module.exports = {
    expo: {
      name: "HopIn",
      slug: "CarpoolingApp",
      scheme: "hopin",
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
        bundleIdentifier: "com.pvpp.hopin",
        config: {
          googleMapsApiKey: process.env.GOOGLE_API_KEY,
        },
      },
      android: {
        package: "com.pvpp.hopin",
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
          eas: {
            projectId: process.env.EAS_PROJECT_ID,
          },
      },
    },
  };