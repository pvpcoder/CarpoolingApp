import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

export default function StudentHome() {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎒 Student Home</Text>
      <Text style={styles.subtitle}>Welcome! This is where you'll see your rides.</Text>
      <Text style={styles.coming}>Coming soon: ride requests, matching, carpool groups</Text>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#00d4aa",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  coming: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginBottom: 48,
  },
  logoutButton: {
    backgroundColor: "#2a2a4a",
    borderRadius: 12,
    padding: 14,
    paddingHorizontal: 32,
  },
  logoutText: {
    color: "#ff6b6b",
    fontSize: 16,
    fontWeight: "bold",
  },
});