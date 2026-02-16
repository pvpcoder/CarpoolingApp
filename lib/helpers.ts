import { Alert } from "react-native";
import { supabase } from "./supabase";

// Check if user session is still valid
export async function getValidUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

// Wrap any async action with error handling
export async function safeAction<T>(
  action: () => Promise<T>,
  errorMessage?: string
): Promise<T | null> {
  try {
    return await action();
  } catch (err: any) {
    const message = err?.message || "Something went wrong. Please try again.";
    
    if (message.includes("Failed to fetch") || message.includes("Network request failed")) {
      Alert.alert("No Internet", "Please check your internet connection and try again.");
    } else {
      Alert.alert("Error", errorMessage || message);
    }
    
    return null;
  }
}

// Logout helper
export async function handleLogout(router: any) {
  await supabase.auth.signOut();
  router.replace("/");
}