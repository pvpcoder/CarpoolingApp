import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade_from_bottom",
          animationDuration: 250,
          contentStyle: { backgroundColor: "#0F1120" },
        }}
      >
        <Stack.Screen name="index" options={{ animation: "fade" }} />
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
        <Stack.Screen name="settings" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="student-home" options={{ animation: "fade" }} />
        <Stack.Screen name="parent-home" options={{ animation: "fade" }} />
      </Stack>
    </>
  );
}
