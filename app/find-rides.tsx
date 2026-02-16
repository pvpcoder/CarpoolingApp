import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

export default function FindRides() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rides, setRides] = useState<any[]>([]);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [studentData, setStudentData] = useState<any>(null);

  useEffect(() => {
    loadMatches();
  }, []);

  const loadMatches = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: student } = await supabase
      .from("students")
      .select("id, school_id, saved_pickup_lat, saved_pickup_lng")
      .eq("id", user.id)
      .single();

    if (!student) return;
    setStudentData(student);

    // Get the student's active ride requests to know their direction/time preferences
    const { data: requests } = await supabase
      .from("ride_requests")
      .select("id, direction, target_time, recurring_days")
      .eq("student_id", student.id)
      .eq("status", "active");

    // Find all active ride offers for the same school
    const { data: offers } = await supabase
      .from("ride_offers")
      .select(`
        id, direction, departure_time, seats_available, recurring_days, area_lat, area_lng,
        parents ( name, phone )
      `)
      .eq("school_id", student.school_id)
      .eq("status", "active");

    if (!offers) {
      setLoading(false);
      return;
    }

    // Check which offers the student has already requested
    const { data: existingMatches } = await supabase
      .from("ride_matches")
      .select("ride_offer_id, status")
      .eq("ride_request_id", requests?.[0]?.id || "");

    const requestedOfferIds = new Set(
      (existingMatches || []).map((m: any) => m.ride_offer_id)
    );

    // Calculate distance and filter/sort
    const withDistance = offers.map((offer: any) => {
      const dist = getDistanceKm(
        student.saved_pickup_lat,
        student.saved_pickup_lng,
        offer.area_lat,
        offer.area_lng
      );
      return {
        ...offer,
        distance_km: dist,
        already_requested: requestedOfferIds.has(offer.id),
        match_status: (existingMatches || []).find((m: any) => m.ride_offer_id === offer.id)?.status,
      };
    });

    // Sort by distance
    withDistance.sort((a: any, b: any) => a.distance_km - b.distance_km);

    setRides(withDistance);
    setLoading(false);
  };

  const getDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handleRequest = async (offerId: string) => {
    if (!studentData) return;

    // Get student's active request
    const { data: requests } = await supabase
      .from("ride_requests")
      .select("id")
      .eq("student_id", studentData.id)
      .eq("status", "active")
      .limit(1);

    if (!requests || requests.length === 0) {
      Alert.alert("Error", "You need to create a ride request first before requesting to join a ride.");
      return;
    }

    setRequesting(offerId);

    const { error } = await supabase.from("ride_matches").insert({
      ride_offer_id: offerId,
      ride_request_id: requests[0].id,
      status: "pending",
    });

    setRequesting(null);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    Alert.alert("Request Sent!", "The driver will be notified. You'll hear back soon.");
    loadMatches(); // Refresh to show updated status
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00d4aa" />
        <Text style={styles.loadingText}>Finding rides near you...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Available Rides</Text>
      <Text style={styles.subtitle}>Drivers in your area offering rides to school</Text>

      {rides.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🔍</Text>
          <Text style={styles.emptyTitle}>No rides available yet</Text>
          <Text style={styles.emptyText}>
            No parent drivers have posted rides for your school yet. Check back later — we'll notify you when a match appears.
          </Text>
        </View>
      ) : (
        rides.map((ride) => (
          <View key={ride.id} style={styles.rideCard}>
            <View style={styles.rideHeader}>
              <Text style={styles.rideDirection}>
                {ride.direction === "to_school" ? "🏫 To School" : "🏠 From School"}
              </Text>
              <Text style={styles.rideDistance}>
                {ride.distance_km < 1
                  ? `${Math.round(ride.distance_km * 1000)}m away`
                  : `${ride.distance_km.toFixed(1)}km away`}
              </Text>
            </View>

            <Text style={styles.driverName}>🚗 {ride.parents?.name || "Driver"}</Text>
            <Text style={styles.rideTime}>{formatTime(ride.departure_time)}</Text>
            <Text style={styles.rideDays}>{ride.recurring_days.join(", ")}</Text>
            <Text style={styles.rideSeats}>{ride.seats_available} seats available</Text>

            {ride.already_requested ? (
              <View style={[styles.statusBadge, 
                ride.match_status === "accepted" ? styles.statusAccepted : 
                ride.match_status === "declined" ? styles.statusDeclined : 
                styles.statusPending
              ]}>
                <Text style={styles.statusText}>
                  {ride.match_status === "accepted" ? "✅ Accepted" :
                   ride.match_status === "declined" ? "❌ Declined" :
                   "⏳ Request Pending"}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.requestButton, requesting === ride.id && styles.buttonDisabled]}
                onPress={() => handleRequest(ride.id)}
                disabled={requesting === ride.id}
              >
                <Text style={styles.requestButtonText}>
                  {requesting === ride.id ? "Sending..." : "Request to Join"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  content: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 48,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#ccc",
    marginTop: 16,
    fontSize: 16,
  },
  backText: {
    color: "#00d4aa",
    fontSize: 16,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#00d4aa",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#ccc",
    marginBottom: 24,
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: 48,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  emptyText: {
    color: "#999",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  rideCard: {
    backgroundColor: "#16213e",
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  rideHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  rideDirection: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  rideDistance: {
    color: "#00d4aa",
    fontSize: 13,
    fontWeight: "bold",
  },
  driverName: {
    color: "#fff",
    fontSize: 15,
    marginBottom: 6,
  },
  rideTime: {
    color: "#00d4aa",
    fontSize: 20,
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
    marginBottom: 14,
  },
  requestButton: {
    backgroundColor: "#00d4aa",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  requestButtonText: {
    color: "#1a1a2e",
    fontSize: 16,
    fontWeight: "bold",
  },
  statusBadge: {
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  statusPending: {
    backgroundColor: "#2a2a4a",
  },
  statusAccepted: {
    backgroundColor: "#1a4a3a",
  },
  statusDeclined: {
    backgroundColor: "#4a1a1a",
  },
  statusText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
  },
});