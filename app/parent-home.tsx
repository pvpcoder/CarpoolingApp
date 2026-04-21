import { useEffect } from "react";
import { useRouter } from "expo-router";

// Redirect to tabbed home — this file is deprecated
export default function ParentHomeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/(tabs)/home");
  }, []);
  return null;
}
