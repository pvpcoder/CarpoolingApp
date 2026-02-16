import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="setup-location" />
      <Stack.Screen name="discover" />
      <Stack.Screen name="create-group" />
      <Stack.Screen name="my-group" />
      <Stack.Screen name="availability" />
      <Stack.Screen name="student-schedule" />
      <Stack.Screen name="weekly-schedule" />
      <Stack.Screen name="group-chat" />
      <Stack.Screen name="student-home" />
      <Stack.Screen name="parent-home" />
    </Stack>
  );
}