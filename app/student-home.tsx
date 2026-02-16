import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

export default function StudentHome() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pickupAddress, setPickupAddress] = useState<string | null>(null);

  useEffect(() => {
    checkProfile();
  }, []);

  const checkProfile = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/");
      return;
    }

    const { data: student } = await supabase
      .from("students")
      .select("saved_pickup_lat, saved_pickup_address")
      .eq("id", user.id)
      .single();

    if (student && !student.saved_pickup_lat) {
      // No pickup location set — redirect to setup
      router.replace("/setup-location");
      return;
    }

    setPickupAddress(student?.saved_pickup_address || null);
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00d4aa" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎒 Student Home</Text>
      <Text style={styles.subtitle}>Welcome! This is where you'll see your rides.</Text>

      {pickupAddress && (
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>📍 Your pickup spot</Text>
          <Text style={styles.infoText}>{pickupAddress}</Text>
        </View>
      )}

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
    marginBottom: 16,
  },
  infoBox: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  infoLabel: {
    color: "#00d4aa",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  infoText: {
    color: "#fff",
    fontSize: 15,
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