import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

export default function Discover() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [nearbyStudents, setNearbyStudents] = useState<any[]>([]);
  const [myData, setMyData] = useState<any>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const [myGroupId, setMyGroupId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

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

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: me } = await supabase
      .from("students")
      .select("id, school_id, saved_pickup_lat, saved_pickup_lng, name")
      .eq("id", user.id)
      .single();

    if (!me) return;
    setMyData(me);

    // Check if I'm already in a group
    const { data: membership } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("student_id", me.id)
      .eq("status", "active")
      .limit(1);

    if (membership && membership.length > 0) {
      setMyGroupId(membership[0].group_id);
    }

    // Find other students at the same school who have set their location
    const { data: others } = await supabase
      .from("students")
      .select("id, name, grade, saved_pickup_lat, saved_pickup_lng, saved_pickup_address")
      .eq("school_id", me.school_id)
      .neq("id", me.id)
      .not("saved_pickup_lat", "is", null);

    if (!others) {
      setLoading(false);
      return;
    }

    // Calculate distances and sort
    const withDistance = others.map((s: any) => ({
      ...s,
      distance_km: getDistanceKm(
        me.saved_pickup_lat,
        me.saved_pickup_lng,
        s.saved_pickup_lat,
        s.saved_pickup_lng
      ),
    }));

    withDistance.sort((a: any, b: any) => a.distance_km - b.distance_km);

    // Check existing invites
    const { data: sentInvites } = await supabase
      .from("group_invites")
      .select("invited_student_id, status")
      .eq("invited_by", me.id);

    const inviteMap = new Map(
      (sentInvites || []).map((i: any) => [i.invited_student_id, i.status])
    );

    const enriched = withDistance.map((s: any) => ({
      ...s,
      invite_status: inviteMap.get(s.id) || null,
    }));

    setNearbyStudents(enriched);
    setLoading(false);
  };

  const handleInvite = async (studentId: string) => {
    if (!myData) return;

    // If no group yet, prompt to create one first
    if (!myGroupId) {
      Alert.alert(
        "Create a Group First",
        "You need to create a carpool group before inviting people.",
        [
          { text: "Cancel" },
          { text: "Create Group", onPress: () => router.push("/create-group") },
        ]
      );
      return;
    }

    setInviting(studentId);

    const { error } = await supabase.from("group_invites").insert({
      group_id: myGroupId,
      invited_by: myData.id,
      invited_student_id: studentId,
      status: "pending",
    });

    setInviting(null);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    Alert.alert("Invite Sent!", "They'll see your invite when they open the app.");
    loadData();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00d4aa" />
        <Text style={styles.loadingText}>Finding students near you...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Nearby Students</Text>
      <Text style={styles.subtitle}>Students at your school in your area</Text>

      {!myGroupId && (
        <TouchableOpacity
          style={styles.createGroupBanner}
          onPress={() => router.push("/create-group")}
        >
          <Text style={styles.bannerEmoji}>✨</Text>
          <View style={styles.bannerTextContainer}>
            <Text style={styles.bannerTitle}>Start a Carpool Group</Text>
            <Text style={styles.bannerDesc}>Create a group, then invite students below</Text>
          </View>
          <Text style={styles.bannerArrow}>→</Text>
        </TouchableOpacity>
      )}

      {nearbyStudents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🔍</Text>
          <Text style={styles.emptyTitle}>No students nearby yet</Text>
          <Text style={styles.emptyText}>
            You're one of the first from your school! Share the app with classmates to get started.
          </Text>
        </View>
      ) : (
        nearbyStudents.map((student) => (
          <View key={student.id} style={styles.studentCard}>
            <View style={styles.studentInfo}>
              <Text style={styles.studentName}>{student.name}</Text>
              <Text style={styles.studentGrade}>Grade {student.grade}</Text>
              <Text style={styles.studentDistance}>
                {student.distance_km < 1
                  ? `${Math.round(student.distance_km * 1000)}m away`
                  : `${student.distance_km.toFixed(1)}km away`}
              </Text>
              {student.saved_pickup_address && (
                <Text style={styles.studentArea}>📍 {student.saved_pickup_address}</Text>
              )}
            </View>

            {student.invite_status === "pending" ? (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingText}>⏳ Invited</Text>
              </View>
            ) : student.invite_status === "accepted" ? (
              <View style={styles.acceptedBadge}>
                <Text style={styles.acceptedText}>✅ In Group</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.inviteButton, inviting === student.id && styles.buttonDisabled]}
                onPress={() => handleInvite(student.id)}
                disabled={inviting === student.id}
              >
                <Text style={styles.inviteText}>
                  {inviting === student.id ? "..." : "Invite"}
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
  createGroupBanner: {
    backgroundColor: "#16213e",
    borderRadius: 14,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#00d4aa",
    flexDirection: "row",
    alignItems: "center",
  },
  bannerEmoji: {
    fontSize: 28,
    marginRight: 14,
  },
  bannerTextContainer: {
    flex: 1,
  },
  bannerTitle: {
    color: "#00d4aa",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 2,
  },
  bannerDesc: {
    color: "#999",
    fontSize: 13,
  },
  bannerArrow: {
    color: "#00d4aa",
    fontSize: 20,
    fontWeight: "bold",
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
  studentCard: {
    backgroundColor: "#16213e",
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2a2a4a",
    flexDirection: "row",
    alignItems: "center",
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
    marginBottom: 4,
  },
  studentGrade: {
    color: "#00d4aa",
    fontSize: 14,
    marginBottom: 4,
  },
  studentDistance: {
    color: "#ccc",
    fontSize: 13,
    marginBottom: 2,
  },
  studentArea: {
    color: "#999",
    fontSize: 12,
    marginTop: 2,
  },
  inviteButton: {
    backgroundColor: "#00d4aa",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  inviteText: {
    color: "#1a1a2e",
    fontSize: 15,
    fontWeight: "bold",
  },
  pendingBadge: {
    backgroundColor: "#2a2a4a",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  pendingText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
  },
  acceptedBadge: {
    backgroundColor: "#1a4a3a",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  acceptedText: {
    color: "#00d4aa",
    fontSize: 13,
    fontWeight: "bold",
  },
});