import { useEffect } from "react";
import { useRouter } from "expo-router";

// Redirect to tabbed home — this file is deprecated
export default function StudentHomeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/(tabs)/home");
  }, []);
  return null;
}
