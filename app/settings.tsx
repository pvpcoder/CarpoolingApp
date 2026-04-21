import { useEffect } from "react";
import { useRouter } from "expo-router";

// Redirect to profile tab — this file is deprecated
export default function SettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/(tabs)/profile");
  }, []);
  return null;
}
