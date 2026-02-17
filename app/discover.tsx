import { sendPushNotification } from "../lib/notifications";
import { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { GOOGLE_API_KEY } from "../lib/config";
import { Colors, Spacing, Radius, FontSizes } from "../lib/theme";
import {
  FadeIn,
  PressableScale,
  BackButton,
  LoadingScreen,
} from "../components/UI";

const hasGoogleKey =
  GOOGLE_API_KEY && GOOGLE_API_KEY !== "YOUR_GOOGLE_API_KEY_HERE";

// Straight-line fallback
const getDistanceKm = (
  lat1: number, lng1: number, lat2: number, lng2: number
) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Fetch driving distances from Google Distance Matrix API
const fetchDrivingDistances = async (
  originLat: number,
  originLng: number,
  destinations: { id: string; lat: number; lng: number }[]
): Promise<Map<string, { km: number; mins: number }>> => {
  const results = new Map<string, { km: number; mins: number }>();
  if (!hasGoogleKey || destinations.length === 0) return results;

  const batchSize = 25;
  for (let i = 0; i < destinations.length; i += batchSize) {
    const batch = destinations.slice(i, i + batchSize);
    const destStr = batch.map((d) => `${d.lat},${d.lng}`).join("|");

    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destStr}&mode=driving&key=${GOOGLE_API_KEY}`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.status === "OK" && json.rows?.[0]?.elements) {
        json.rows[0].elements.forEach((el: any, idx: number) => {
          if (el.status === "OK") {
            results.set(batch[idx].id, {
              km: el.distance.value / 1000,
              mins: Math.round(el.duration.value / 60),
            });
          }
        });
      }
    } catch {
      // API failed — keep straight-line distances
    }
  }
  return results;
};

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

    const { data: membership } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("student_id", me.id)
      .eq("status", "active")
      .limit(1);
    if (membership && membership.length > 0)
      setMyGroupId(membership[0].group_id);

    const { data: others } = await supabase
      .from("students")
      .select("id, name, grade, saved_pickup_lat, saved_pickup_lng, saved_pickup_address")
      .eq("school_id", me.school_id)
      .neq("id", me.id)
      .not("saved_pickup_lat", "is", null);
    if (!others) { setLoading(false); return; }

    // Sort by straight-line first (instant)
    const withDistance = others.map((s: any) => ({
      ...s,
      distance_km: getDistanceKm(me.saved_pickup_lat, me.saved_pickup_lng, s.saved_pickup_lat, s.saved_pickup_lng),
      drive_mins: null as number | null,
    }));
    withDistance.sort((a: any, b: any) => a.distance_km - b.distance_km);

    // Get invite statuses
    const { data: sentInvites } = await supabase
      .from("group_invites")
      .select("invited_student_id, status")
      .eq("invited_by", me.id);
    const inviteMap = new Map(
      (sentInvites || []).map((i: any) => [i.invited_student_id, i.status])
    );
    const studentsWithInvites = withDistance.map((s: any) => ({
      ...s,
      invite_status: inviteMap.get(s.id) || null,
    }));

    // Show immediately with straight-line
    setNearbyStudents(studentsWithInvites);
    setLoading(false);

    // Fetch real driving distances in background
    if (hasGoogleKey && studentsWithInvites.length > 0) {
      const destinations = studentsWithInvites.map((s: any) => ({
        id: s.id,
        lat: s.saved_pickup_lat,
        lng: s.saved_pickup_lng,
      }));

      const drivingDistances = await fetchDrivingDistances(
        me.saved_pickup_lat, me.saved_pickup_lng, destinations
      );

      if (drivingDistances.size > 0) {
        const updated = studentsWithInvites.map((s: any) => {
          const driving = drivingDistances.get(s.id);
          return driving
            ? { ...s, distance_km: driving.km, drive_mins: driving.mins }
            : s;
        });
        updated.sort((a: any, b: any) => a.distance_km - b.distance_km);
        setNearbyStudents(updated);
      }
    }
  };

  const handleInvite = async (studentId: string) => {
    if (!myData) return;
    if (!myGroupId) {
      Alert.alert("Create a Group First", "You need to create a carpool group before inviting people.", [
        { text: "Cancel" },
        { text: "Create Group", onPress: () => router.push("/create-group") },
      ]);
      return;
    }
    setInviting(studentId);
    const { error } = await supabase.from("group_invites").insert({
      group_id: myGroupId, invited_by: myData.id,
      invited_student_id: studentId, status: "pending",
    });
    setInviting(null);
    if (error) { Alert.alert("Error", error.message); return; }
    sendPushNotification([studentId], "🎉 Carpool Invite!", `${myData.name} invited you to join their carpool group.`);
    Alert.alert("Invite Sent!", "They'll see your invite when they open the app.");
    loadData();
  };

  const formatDistance = (student: any) => {
    const km = student.distance_km;
    const mins = student.drive_mins;
    let distText = km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)} km`;
    if (mins !== null) {
      return `🚗 ${distText} · ${mins} min drive`;
    }
    return `${distText} away`;
  };

  if (loading) return <LoadingScreen message="Finding students near you..." />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => router.back()} />
      <FadeIn>
        <Text style={styles.title}>Nearby Students</Text>
        <Text style={styles.subtitle}>Students at your school sorted by driving distance</Text>
      </FadeIn>

      {!myGroupId && (
        <FadeIn delay={100}>
          <PressableScale onPress={() => router.push("/create-group")} style={styles.banner}>
            <View style={styles.bannerIcon}><Text style={{ fontSize: 22 }}>✨</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>Start a Carpool Group</Text>
              <Text style={styles.bannerDesc}>Create a group, then invite students below</Text>
            </View>
            <Text style={{ color: Colors.primary, fontSize: 18 }}>→</Text>
          </PressableScale>
        </FadeIn>
      )}

      {nearbyStudents.length === 0 ? (
        <FadeIn delay={200}>
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>🔍</Text>
            <Text style={styles.emptyTitle}>No students nearby yet</Text>
            <Text style={styles.emptyText}>You're one of the first from your school! Share the app with classmates to get started.</Text>
          </View>
        </FadeIn>
      ) : (
        nearbyStudents.map((student, i) => (
          <FadeIn key={student.id} delay={150 + i * 60}>
            <View style={styles.studentCard}>
              <View style={styles.studentInfo}>
                <Text style={styles.studentName}>{student.name}</Text>
                <Text style={styles.studentGrade}>Grade {student.grade}</Text>
                <Text style={[styles.studentDistance, student.drive_mins !== null && styles.drivingDistance]}>
                  {formatDistance(student)}
                </Text>
                {student.saved_pickup_address && (
                  <Text style={styles.studentArea}>📍 {student.saved_pickup_address}</Text>
                )}
              </View>
              {student.invite_status === "pending" ? (
                <View style={styles.badge}><Text style={styles.badgeText}>Invited</Text></View>
              ) : student.invite_status === "accepted" ? (
                <View style={[styles.badge, styles.badgeSuccess]}><Text style={[styles.badgeText, { color: Colors.success }]}>In Group</Text></View>
              ) : (
                <PressableScale onPress={() => handleInvite(student.id)} disabled={inviting === student.id} style={styles.inviteBtn}>
                  <Text style={styles.inviteBtnText}>{inviting === student.id ? "..." : "Invite"}</Text>
                </PressableScale>
              )}
            </View>
          </FadeIn>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.xl, paddingTop: 60, paddingBottom: 48 },
  title: { fontSize: FontSizes.xxl, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginBottom: Spacing.xl },
  banner: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.lg,
    marginBottom: Spacing.xl, borderWidth: 1, borderColor: Colors.primaryBorder,
    flexDirection: "row", alignItems: "center",
  },
  bannerIcon: { width: 44, height: 44, borderRadius: Radius.sm, backgroundColor: Colors.primaryFaded, alignItems: "center", justifyContent: "center", marginRight: Spacing.md },
  bannerTitle: { color: Colors.primary, fontSize: FontSizes.md, fontWeight: "700", marginBottom: 2 },
  bannerDesc: { color: Colors.textTertiary, fontSize: FontSizes.sm },
  emptyState: { alignItems: "center", marginTop: 48 },
  emptyTitle: { color: Colors.textPrimary, fontSize: FontSizes.lg, fontWeight: "700", marginBottom: 8 },
  emptyText: { color: Colors.textSecondary, fontSize: FontSizes.md, textAlign: "center", lineHeight: 22 },
  studentCard: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.lg,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    flexDirection: "row", alignItems: "center",
  },
  studentInfo: { flex: 1 },
  studentName: { color: Colors.textPrimary, fontSize: FontSizes.base, fontWeight: "700", marginBottom: 4 },
  studentGrade: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: "600", marginBottom: 4 },
  studentDistance: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginBottom: 2 },
  drivingDistance: { color: Colors.textPrimary, fontWeight: "600" },
  studentArea: { color: Colors.textTertiary, fontSize: FontSizes.xs, marginTop: 2 },
  inviteBtn: { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingVertical: 10, paddingHorizontal: 18 },
  inviteBtnText: { color: Colors.bg, fontSize: FontSizes.sm, fontWeight: "700" },
  badge: { backgroundColor: Colors.bgElevated, borderRadius: Radius.sm, paddingVertical: 10, paddingHorizontal: 14 },
  badgeText: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: "700" },
  badgeSuccess: { backgroundColor: Colors.successFaded },
});
