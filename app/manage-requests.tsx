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

export default function ManageRequests() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<any[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get parent's ride offers
    const { data: offers } = await supabase
      .from("ride_offers")
      .select("id")
      .eq("parent_id", user.id);

    if (!offers || offers.length === 0) {
      setLoading(false);
      return;
    }

    const offerIds = offers.map((o: any) => o.id);

    // Get all match requests for those offers
    const { data: matches } = await supabase
      .from("ride_matches")
      .select(`
        id, status, requested_at, ride_offer_id,
        ride_requests (
          direction, target_time, recurring_days, pickup_address,
          students ( name, grade )
        ),
        ride_offers ( departure_time, recurring_days, seats_available )
      `)
      .in("ride_offer_id", offerIds)
      .order("requested_at", { ascending: false });

    setRequests(matches || []);
    setLoading(false);
  };

const handleResponse = async (matchId: string, status: "accepted" | "declined", offerId: string) => {
    setProcessing(matchId);

    const { error } = await supabase
      .from("ride_matches")
      .update({
        status,
        responded_at: new Date().toISOString(),
      })
      .eq("id", matchId);

    if (error) {
      setProcessing(null);
      Alert.alert("Error", error.message);
      return;
    }

    // If accepted, add student to carpool group (create group if it doesn't exist)
    if (status === "accepted") {
      // Check if a carpool group already exists for this offer
      let { data: group } = await supabase
        .from("carpool_groups")
        .select("id")
        .eq("ride_offer_id", offerId)
        .eq("status", "active")
        .single();

      // Create group if it doesn't exist
      if (!group) {
        const { data: newGroup, error: groupError } = await supabase
          .from("carpool_groups")
          .insert({
            ride_offer_id: offerId,
            name: "Carpool Group",
            status: "active",
            semester: "2025-26",
          })
          .select("id")
          .single();

        if (groupError) {
          setProcessing(null);
          Alert.alert("Error", groupError.message);
          return;
        }
        group = newGroup;
      }

      // Get the student id from the match
      const { data: match } = await supabase
        .from("ride_matches")
        .select("ride_requests ( student_id )")
        .eq("id", matchId)
        .single();

      const studentId = (match?.ride_requests as any)?.student_id;

      if (studentId && group) {
        // Check if student is already in the group
        const { data: existing } = await supabase
          .from("carpool_members")
          .select("id")
          .eq("carpool_group_id", group.id)
          .eq("student_id", studentId)
          .single();

        if (!existing) {
          await supabase.from("carpool_members").insert({
            carpool_group_id: group.id,
            student_id: studentId,
          });
        }
      }
    }

    setProcessing(null);

    Alert.alert(
      status === "accepted" ? "Accepted!" : "Declined",
      status === "accepted"
        ? "The student has been added to your carpool group."
        : "The request has been declined."
    );

    loadRequests();
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
        <Text style={styles.loadingText}>Loading requests...</Text>
      </View>
    );
  }

  const pending = requests.filter((r) => r.status === "pending");
  const responded = requests.filter((r) => r.status !== "pending");

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Ride Requests</Text>

      {requests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyTitle}>No requests yet</Text>
          <Text style={styles.emptyText}>
            When students request to join your ride, they'll appear here.
          </Text>
        </View>
      ) : (
        <>
          {pending.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pending ({pending.length})</Text>
              {pending.map((req) => (
                <View key={req.id} style={styles.requestCard}>
                  <Text style={styles.studentName}>
                    🎒 {req.ride_requests?.students?.name || "Student"}
                  </Text>
                  <Text style={styles.studentGrade}>
                    Grade {req.ride_requests?.students?.grade}
                  </Text>
                  <Text style={styles.requestDetail}>
                    {req.ride_requests?.direction === "to_school" ? "🏫 To School" : "🏠 From School"}
                    {" · "}
                    {formatTime(req.ride_requests?.target_time)}
                  </Text>
                  <Text style={styles.requestDetail}>
                    📍 {req.ride_requests?.pickup_address || "Location set"}
                  </Text>
                  <Text style={styles.requestDays}>
                    {req.ride_requests?.recurring_days?.join(", ")}
                  </Text>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.acceptButton, processing === req.id && styles.buttonDisabled]}
                      onPress={() => handleResponse(req.id, "accepted", req.ride_offer_id)}
                      disabled={processing === req.id}
                    >
                      <Text style={styles.acceptText}>✅ Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.declineButton, processing === req.id && styles.buttonDisabled]}
                    onPress={() => handleResponse(req.id, "declined", req.ride_offer_id)}
                      disabled={processing === req.id}
                    >
                      <Text style={styles.declineText}>❌ Decline</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {responded.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Past Requests</Text>
              {responded.map((req) => (
                <View key={req.id} style={styles.requestCard}>
                  <Text style={styles.studentName}>
                    🎒 {req.ride_requests?.students?.name || "Student"}
                  </Text>
                  <Text style={styles.requestDetail}>
                    {req.ride_requests?.direction === "to_school" ? "🏫 To School" : "🏠 From School"}
                    {" · "}
                    {formatTime(req.ride_requests?.target_time)}
                  </Text>
                  <View style={[styles.statusBadge,
                    req.status === "accepted" ? styles.statusAccepted : styles.statusDeclined
                  ]}>
                    <Text style={styles.statusText}>
                      {req.status === "accepted" ? "✅ Accepted" : "❌ Declined"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  requestCard: {
    backgroundColor: "#16213e",
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  studentName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  studentGrade: {
    color: "#00d4aa",
    fontSize: 14,
    marginBottom: 8,
  },
  requestDetail: {
    color: "#ccc",
    fontSize: 14,
    marginBottom: 4,
  },
  requestDays: {
    color: "#999",
    fontSize: 14,
    marginBottom: 14,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: "#1a4a3a",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#00d4aa",
  },
  declineButton: {
    flex: 1,
    backgroundColor: "#4a1a1a",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ff6b6b",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  acceptText: {
    color: "#00d4aa",
    fontSize: 15,
    fontWeight: "bold",
  },
  declineText: {
    color: "#ff6b6b",
    fontSize: 15,
    fontWeight: "bold",
  },
  statusBadge: {
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    marginTop: 8,
  },
  statusAccepted: {
    backgroundColor: "#1a4a3a",
  },
  statusDeclined: {
    backgroundColor: "#4a1a1a",
  },
  statusText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
});