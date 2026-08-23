import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useCallback } from "react";
import { View, Text } from "react-native";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import * as Sentry from "@sentry/react-native";
import { useFonts, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { SpaceMono_400Regular, SpaceMono_700Bold } from "@expo-google-fonts/space-mono";
import { supabase } from "../lib/supabase";

SplashScreen.preventAutoHideAsync().catch(() => {});

if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
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
      // Supabase email confirmation arrives as hopin://#access_token=...&refresh_token=...
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
          let studentId = null;
          if (meta.child_email) {
            const { data: linked } = await supabase.from("students").select("id").eq("email", meta.child_email).single();
            if (linked) studentId = linked.id;
          }
          await supabase.from("parents").insert({
            id: userId,
            email: data.user.email,
            name: meta.name,
            phone: meta.phone,
            student_id: studentId,
          });
        }
      }

      router.replace("/(tabs)/home");
    };

    // App opened from a cold start via deep link
    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); });

    // App already open when deep link arrives
    const sub = Linking.addEventListener("url", ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) return null;

  return (
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
