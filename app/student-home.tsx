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
  const [activeRequests, setActiveRequests] = useState<any[]>([])
  const [carpoolGroups, setCarpoolGroups] = useState<any[]>([]);

  useEffect(() => {
    checkProfile();
  }, []);

  const checkProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/");
      return;
    }

    const { data: student } = await supabase
      .from("students")
      .select("id, saved_pickup_lat, saved_pickup_address")
      .eq("id", user.id)
      .single();

    if (student && !student.saved_pickup_lat) {
      router.replace("/setup-location");
      return;
    }

    setPickupAddress(student?.saved_pickup_address || null);

    // Load active ride requests
    const { data: requests } = await supabase
      .from("ride_requests")
      .select("*")
      .eq("student_id", student?.id)
      .eq("status", "active");

    setActiveRequests(requests || []);
    // Load carpool groups
    const { data: memberships } = await supabase
      .from("carpool_members")
      .select(`
        carpool_group_id,
        carpool_groups (
          id, name, status,
          ride_offers ( direction, departure_time, recurring_days )
        )
      `)
      .eq("student_id", student?.id);
8
    const activeGroups = (memberships || [])
      .filter((m: any) => m.carpool_groups?.status === "active")
      .map((m: any) => m.carpool_groups);

    setCarpoolGroups(activeGroups);
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
      <Text style={styles.title}>🎒 Student Home</Text>

      {pickupAddress && (
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>📍 Your pickup spot</Text>
          <Text style={styles.infoText}>{pickupAddress}</Text>
        </View>
      )}

      {carpoolGroups.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Carpool Groups</Text>
          {carpoolGroups.map((group: any) => (
            <TouchableOpacity
              key={group.id}
              style={styles.rideCard}
              onPress={() => router.push(`/carpool-group?groupId=${group.id}`)}
            >
              <Text style={styles.rideDirection}>
                {group.ride_offers?.direction === "to_school" ? "🏫 To School" : "🏠 From School"}
              </Text>
              <Text style={styles.rideTime}>
                {formatTime(group.ride_offers?.departure_time)}
              </Text>
              <Text style={styles.rideDays}>
                {group.ride_offers?.recurring_days?.join(", ")}
              </Text>
              <Text style={styles.tapHint}>Tap to manage group →</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {activeRequests.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Active Ride Requests</Text>
          {activeRequests.map((req) => (
            <View key={req.id} style={styles.rideCard}>
              <Text style={styles.rideDirection}>
                {req.direction === "to_school" ? "🏫 To School" : "🏠 From School"}
              </Text>
              <Text style={styles.rideTime}>{formatTime(req.target_time)}</Text>
              <Text style={styles.rideDays}>{req.recurring_days.join(", ")}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>No active ride requests yet.</Text>
      )}

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push("/request-ride")}
      >
        <Text style={styles.buttonText}>+ Request a Ride</Text>
      </TouchableOpacity>


      <TouchableOpacity
        style={styles.findButton}
        onPress={() => router.push("/find-rides")}
      >
        <Text style={styles.buttonText}>🔍 Find Available Rides</Text>
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

  findButton: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#00d4aa",
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
tapHint: {
    color: "#00d4aa", 
    fontSize: 13,
    marginTop: 8,
  },

  
});