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

export default function ParentHome() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeOffers, setActiveOffers] = useState<any[]>([]);
  const [childName, setChildName] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/");
      return;
    }

    const { data: parent } = await supabase
      .from("parents")
      .select("id, student_id")
      .eq("id", user.id)
      .single();

    if (parent?.student_id) {
      const { data: student } = await supabase
        .from("students")
        .select("name")
        .eq("id", parent.student_id)
        .single();

      setChildName(student?.name || null);
    }

    // Load active ride offers
    const { data: offers } = await supabase
      .from("ride_offers")
      .select("*")
      .eq("parent_id", parent?.id)
      .eq("status", "active");

    setActiveOffers(offers || []);
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  const formatTime = (timeStr: string) => {
    const [h, m] = timeStr.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${m} ${ampm}`;
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
      <Text style={styles.title}>🚗 Parent Home</Text>

      {childName && (
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>👤 Linked to</Text>
          <Text style={styles.infoText}>{childName}</Text>
        </View>
      )}

      {activeOffers.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Active Ride Offers</Text>
          {activeOffers.map((offer) => (
            <View key={offer.id} style={styles.rideCard}>
              <Text style={styles.rideDirection}>
                {offer.direction === "to_school" ? "🏫 To School" : "🏠 From School"}
              </Text>
              <Text style={styles.rideTime}>{formatTime(offer.departure_time)}</Text>
              <Text style={styles.rideDays}>{offer.recurring_days.join(", ")}</Text>
              <Text style={styles.rideSeats}>{offer.seats_available} seats available</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>No active ride offers yet.</Text>
      )}

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push("/offer-ride")}
      >
        <Text style={styles.buttonText}>+ Offer a Ride</Text>
      </TouchableOpacity>


    <TouchableOpacity
        style={styles.requestsButton}
        onPress={() => router.push("/manage-requests")}
      >
        <Text style={styles.buttonText}>📋 View Ride Requests</Text>
      </TouchableOpacity>

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
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#00d4aa",
    marginBottom: 20,
  },
  infoBox: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
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
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  rideCard: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  rideDirection: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  rideTime: {
    color: "#00d4aa",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  rideDays: {
    color: "#999",
    fontSize: 14,
    marginBottom: 4,
  },
  rideSeats: {
    color: "#ccc",
    fontSize: 14,
  },
  emptyText: {
    color: "#999",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 20,
    marginTop: 12,
  },
  button: {
    backgroundColor: "#00d4aa",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonText: {
    color: "#1a1a2e",
    fontSize: 18,
    fontWeight: "bold",
  },
  logoutButton: {
    backgroundColor: "#2a2a4a",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  logoutText: {
    color: "#ff6b6b",
    fontSize: 16,
    fontWeight: "bold",
  },
  requestsButton: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#00d4aa",
  },
});