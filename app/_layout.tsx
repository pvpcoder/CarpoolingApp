import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useCallback } from "react";
import { View, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { useFonts, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { SpaceMono_400Regular, SpaceMono_700Bold } from "@expo-google-fonts/space-mono";
import { supabase } from "../lib/supabase";
import { linkParentToChildByEmail } from "../lib/parentLinking";
import { track } from "../lib/analytics";

SplashScreen.preventAutoHideAsync().catch(() => {});

if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: Constants.expoConfig?.extra?.appEnv ?? "production",
    sendDefaultPii: false,
    tracesSampleRate: 0.2,
  });
}

function RootLayout() {
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  const onLayout = useCallback(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    const handleDeepLink = async (url: string) => {
      // Supabase email confirmation arrives as schoolloop://#access_token=...&refresh_token=...
      const hash = url.split("#")[1];
      if (!hash) return;

      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken || !refreshToken) return;

      const { data } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (!data.user) return;

      // Create profile from signup metadata if this is the first login
      const userId = data.user.id;
      const meta = data.user.user_metadata;

      const { data: existingStudent } = await supabase.from("students").select("id").eq("id", userId).maybeSingle();
      const { data: existingParent } = await supabase.from("parents").select("id").eq("id", userId).maybeSingle();

      if (!existingStudent && !existingParent && meta?.role) {
        if (meta.role === "student") {
          const { data: school } = await supabase.from("schools").select("id").eq("pdsb_code", "PILOT01").single();
          await supabase.from("students").insert({
            id: userId,
            email: data.user.email,
            name: meta.name,
            grade: meta.grade,
            school_id: school?.id,
          });
        } else if (meta.role === "parent") {
          await supabase.from("parents").insert({
            id: userId,
            email: data.user.email,
            name: meta.name,
            phone: meta.phone,
          });
          if (meta.child_email) {
            await linkParentToChildByEmail(userId, meta.child_email);
          }
        }
        track(userId, "signup_completed", { role: meta.role });
      }

      router.replace("/(tabs)/home");
    };

    // App opened from a cold start via deep link
    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); });

    // App already open when deep link arrives
    const sub = Linking.addEventListener("url", ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // A stored session can outlive the account it belongs to (the account
    // was deleted, or the refresh token just expired after being offline
    // for a long time). Supabase's SDK tries to auto-refresh it on its own,
    // before any screen's code runs, and emits SIGNED_OUT when that fails -
    // without this listener that error surfaces as a raw uncaught
    // AuthApiError instead of just bouncing back to the login screen.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const routeFromNotification = (data: any) => {
      if (!data) return;
      if (data.type === "message" && data.groupId) {
        router.push(`/group-chat?groupId=${data.groupId}`);
      } else if (data.type === "swap" && data.groupId) {
        router.push(`/weekly-schedule?groupId=${data.groupId}`);
      } else if (data.type === "invite") {
        router.push("/(tabs)/home");
      }
    };

    // App opened from a killed state by tapping a notification
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) routeFromNotification(response.notification.request.content.data);
    });

    // App already open (foreground or backgrounded) when a notification is tapped
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      routeFromNotification(response.notification.request.content.data);
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <View style={{ flex: 1 }} onLayout={onLayout}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade_from_bottom",
          animationDuration: 250,
        }}
      >
        <Stack.Screen name="index" options={{ animation: "fade" }} />
        <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
        <Stack.Screen name="signup" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="setup-location" />
        <Stack.Screen name="discover" />
        <Stack.Screen name="create-group" />
        <Stack.Screen name="my-group" />
        <Stack.Screen name="availability" />
        <Stack.Screen name="student-schedule" />
        <Stack.Screen name="weekly-schedule" />
        <Stack.Screen name="group-chat" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="student-home" options={{ animation: "fade" }} />
        <Stack.Screen name="parent-home" options={{ animation: "fade" }} />
        <Stack.Screen name="settings" options={{ animation: "slide_from_right" }} />
      </Stack>
    </View>
    </GestureHandlerRootView>
  );
}

function ErrorFallback() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#14161C" }}>
      <Text style={{ color: "#F2F0EA", fontSize: 18, fontWeight: "700", marginBottom: 8, textAlign: "center" }}>
        Something went wrong
      </Text>
      <Text style={{ color: "#A7A498", fontSize: 14, textAlign: "center" }}>
        Please close and reopen the app. We've been notified.
      </Text>
    </View>
  );
}

function RootLayoutWithErrorBoundary() {
  return (
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <RootLayout />
    </Sentry.ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayoutWithErrorBoundary);
