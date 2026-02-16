import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="setup-location" />
      <Stack.Screen name="request-ride" />
      <Stack.Screen name="offer-ride" />
      <Stack.Screen name="find-rides" />
      <Stack.Screen name="manage-requests" />
      <Stack.Screen name="student-home" />
      <Stack.Screen name="parent-home" />
    </Stack>
  );
}