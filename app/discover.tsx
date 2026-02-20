import { sendPushNotification } from "../lib/notifications";
import { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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

    // Get invite statuses — only for current group (ignore old/deleted group invites)
    let inviteMap = new Map<string, string>();
    if (myGroupId) {
      const { data: sentInvites } = await supabase
        .from("group_invites")
        .select("invited_student_id, status")
        .eq("invited_by", me.id)
        .eq("group_id", myGroupId);
      inviteMap = new Map(
        (sentInvites || []).map((i: any) => [i.invited_student_id, i.status])
      );
    }
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
      return `${distText} · ${mins} min`;
    }
    return `${distText} away`;
  };

  if (loading) return <LoadingScreen message="Finding students near you..." />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <BackButton onPress={() => router.back()} />
      <FadeIn>
        <Text style={styles.title}>Nearby Students</Text>
        <Text style={styles.subtitle}>
          Sorted by distance from your pickup location
        </Text>
      </FadeIn>

      {!myGroupId && (
        <FadeIn delay={100}>
          <PressableScale
            onPress={() => router.push("/create-group")}
            style={styles.banner}
          >
            <View style={styles.bannerContent}>
              <Text style={styles.bannerTitle}>Start a Carpool Group</Text>
              <Text style={styles.bannerDesc}>
                Create a group, then invite students below
              </Text>
            </View>
            <View style={styles.bannerArrow}>
              <Ionicons name="add-circle" size={20} color={Colors.primary} />
            </View>
          </PressableScale>
        </FadeIn>
      )}

      {nearbyStudents.length === 0 ? (
        <FadeIn delay={200}>
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="search-outline" size={26} color={Colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>No students nearby yet</Text>
            <Text style={styles.emptyText}>
              You're one of the first from your school. Share the app with
              classmates to get started.
            </Text>
          </View>
        </FadeIn>
      ) : (
        nearbyStudents.map((student, i) => (
          <FadeIn key={student.id} delay={150 + i * 60}>
            <View style={styles.studentCard}>
              <View style={styles.studentTop}>
                <View style={styles.studentMeta}>
                  <Text style={styles.studentName}>{student.name}</Text>
                  <View style={styles.gradePill}>
                    <Text style={styles.gradePillText}>
                      Grade {student.grade}
                    </Text>
                  </View>
                </View>

                {student.invite_status === "pending" ? (
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>Invited</Text>
                  </View>
                ) : student.invite_status === "accepted" ? (
                  <View style={[styles.statusBadge, styles.statusBadgeSuccess]}>
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: Colors.primary },
                      ]}
                    >
                      In Group
                    </Text>
                  </View>
                ) : (
                  <PressableScale
                    onPress={() => handleInvite(student.id)}
                    disabled={inviting === student.id}
                    style={styles.inviteBtn}
                  >
                    <Text style={styles.inviteBtnText}>
                      {inviting === student.id ? "..." : "Invite"}
                    </Text>
                  </PressableScale>
                )}
              </View>

              <View style={styles.studentDetails}>
                <Text
                  style={[
                    styles.studentDistance,
                    student.drive_mins !== null && styles.drivingDistance,
                  ]}
                >
                  {formatDistance(student)}
                </Text>
                {student.saved_pickup_address && (
                  <Text style={styles.studentArea} numberOfLines={1}>
                    <Text style={styles.dotPrefix}>·  </Text>
                    {student.saved_pickup_address}
                  </Text>
                )}
              </View>
            </View>
          </FadeIn>
        ))
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: {
    padding: Spacing.xl,
    paddingTop: 60,
    paddingBottom: 48,
  },

  /* Title */
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: "800",
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textTertiary,
    marginBottom: Spacing.xl,
  },

  /* Banner */
  banner: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    flexDirection: "row",
    alignItems: "center",
  },
  bannerContent: { flex: 1 },
  bannerTitle: {
    color: Colors.primary,
    fontSize: FontSizes.md,
    fontWeight: "700",
    marginBottom: 2,
  },
  bannerDesc: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
  },
  bannerArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primaryFaded,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.md,
  },

  /* Empty */
  emptyState: {
    alignItems: "center",
    marginTop: 56,
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.lg,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.md,
    textAlign: "center",
    lineHeight: 22,
  },

  /* Student Card */
  studentCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  studentTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  studentMeta: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: Spacing.md,
  },
  studentName: {
    color: Colors.textPrimary,
    fontSize: FontSizes.base,
    fontWeight: "700",
    marginRight: Spacing.sm,
  },
  gradePill: {
    backgroundColor: Colors.primaryFaded,
    borderRadius: Radius.xs,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  gradePillText: {
    color: Colors.primary,
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },

  /* Details row */
  studentDetails: {
    flexDirection: "row",
    alignItems: "center",
  },
  studentDistance: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  drivingDistance: {
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  studentArea: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
    flex: 1,
    marginLeft: Spacing.sm,
  },
  dotPrefix: {
    color: Colors.textMuted,
  },

  /* Invite button */
  inviteBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  inviteBtnText: {
    color: Colors.bg,
    fontSize: FontSizes.sm,
    fontWeight: "700",
  },

  /* Status badge */
  statusBadge: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  statusBadgeText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    fontWeight: "700",
  },
  statusBadgeSuccess: {
    backgroundColor: Colors.primaryFaded,
  },
});
