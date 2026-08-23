import { sendPushNotification } from "../lib/notifications";
import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";
import { GOOGLE_API_KEY } from "../lib/config";
import { useTheme, Fonts } from "../lib/theme";
import { PressableScale, BackButton, FadeIn, EmptyState } from "../components/UI";

const hasGoogleKey = GOOGLE_API_KEY && GOOGLE_API_KEY !== "YOUR_GOOGLE_API_KEY_HERE";

const getDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const fetchDrivingDistances = async (
  originLat: number, originLng: number,
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
            results.set(batch[idx].id, { km: el.distance.value / 1000, mins: Math.round(el.duration.value / 60) });
          }
        });
      }
    } catch {}
  }
  return results;
};

export default function Discover() {
  const router = useRouter();
  const c = useTheme();

  const [loading, setLoading] = useState(true);
  const [nearbyStudents, setNearbyStudents] = useState<any[]>([]);
  const [myData, setMyData] = useState<any>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const { groupId } = useLocalSearchParams();
  const myGroupId = groupId as string;

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: me } = await supabase.from("students").select("id, school_id, saved_pickup_lat, saved_pickup_lng, name").eq("id", user.id).single();
    if (!me) { setLoading(false); return; }
    setMyData(me);

    let query = supabase.from("students").select("id, name, grade, saved_pickup_lat, saved_pickup_lng, saved_pickup_address").neq("id", me.id).not("saved_pickup_lat", "is", null);
    if (me.school_id) query = query.eq("school_id", me.school_id);
    const { data: others } = await query;
    if (!others) { setLoading(false); return; }

    const withDistance = others.map((s: any) => ({
      ...s,
      distance_km: getDistanceKm(me.saved_pickup_lat, me.saved_pickup_lng, s.saved_pickup_lat, s.saved_pickup_lng),
      drive_mins: null as number | null,
    }));
    withDistance.sort((a: any, b: any) => a.distance_km - b.distance_km);

    let inviteMap = new Map<string, string>();
    if (myGroupId) {
      const { data: sentInvites } = await supabase.from("group_invites").select("invited_student_id, status").eq("invited_by", me.id).eq("group_id", myGroupId);
      inviteMap = new Map((sentInvites || []).map((i: any) => [i.invited_student_id, i.status]));
    }
    const studentsWithInvites = withDistance.map((s: any) => ({ ...s, invite_status: inviteMap.get(s.id) || null }));
    setNearbyStudents(studentsWithInvites);
    setLoading(false);

    if (hasGoogleKey && studentsWithInvites.length > 0) {
      const destinations = studentsWithInvites.map((s: any) => ({ id: s.id, lat: s.saved_pickup_lat, lng: s.saved_pickup_lng }));
      const drivingDistances = await fetchDrivingDistances(me.saved_pickup_lat, me.saved_pickup_lng, destinations);
      if (drivingDistances.size > 0) {
        const updated = studentsWithInvites.map((s: any) => {
          const driving = drivingDistances.get(s.id);
          return driving ? { ...s, distance_km: driving.km, drive_mins: driving.mins } : s;
        });
        updated.sort((a: any, b: any) => a.distance_km - b.distance_km);
        setNearbyStudents(updated);
      }
    }
  };

  const handleInvite = async (studentId: string) => {
    if (!myData) return;
    if (!myGroupId) {
      Alert.alert("Create a group first", "You need a carpool group before inviting people.", [
        { text: "Cancel" },
        { text: "Create group", onPress: () => router.push("/create-group") },
      ]);
      return;
    }
    setInviting(studentId);
    const { error } = await supabase.from("group_invites").insert({ group_id: myGroupId, invited_by: myData.id, invited_student_id: studentId, status: "pending" });
    setInviting(null);
    if (error) { Alert.alert("Error", error.message); return; }
    sendPushNotification([studentId], "Carpool Invite", `${myData.name} invited you to join their carpool group.`, { type: "invite" });
    Alert.alert("Invite sent", "They'll see your invite when they open the app.");
    loadData();
  };

  const formatDistance = (student: any) => {
    const km = student.distance_km;
    const mins = student.drive_mins;
    const distText = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
    return mins !== null ? `${distText} · ${mins} min drive` : `${distText} away`;
  };

  if (loading) {
    return (
      <View style={[styles.loader, { backgroundColor: c.paper }]}>
        <ActivityIndicator color={c.dawn} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.paper }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ marginLeft: 20, marginTop: 64 }}>
        <BackButton onPress={() => router.back()} />
      </View>

      <FadeIn>
        <View style={styles.heading}>
          <Text style={[styles.title, { color: c.textPrimary, fontFamily: Fonts.display }]}>Nearby Students</Text>
          <Text style={[styles.subtitle, { color: c.textMuted, fontFamily: Fonts.body }]}>Sorted by distance from your pickup location</Text>
        </View>
      </FadeIn>

      {nearbyStudents.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState
            icon="people-outline"
            title="No students nearby yet"
            message="You're one of the first from your school. Invite classmates and their families to join HopIn."
            actionLabel="Share HopIn with classmates"
            onAction={() => Share.share({
              message: "Hey! I'm setting up a carpool for school using HopIn. Sign up so we can share driving duties: https://hopin.app",
              title: "Join my carpool on HopIn",
            })}
          />
        </View>
      ) : (
        <View style={[styles.list, { borderColor: c.line }]}>
          {nearbyStudents.map((student, i) => (
            <FadeIn key={student.id} delay={Math.min(i, 6) * 40}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: c.line }]} />}
              <View style={styles.studentRow}>
                <View style={styles.studentInfo}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.studentName, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>{student.name}</Text>
                    <View style={[styles.gradeBadge, { backgroundColor: c.dawnFaded }]}>
                      <Text style={[styles.gradeText, { color: c.dawn, fontFamily: Fonts.mono }]}>Gr. {student.grade}</Text>
                    </View>
                  </View>
                  <Text style={[styles.distanceText, { color: student.drive_mins !== null ? c.textPrimary : c.textSecondary, fontFamily: student.drive_mins !== null ? Fonts.monoBold : Fonts.mono }]}>
                    {formatDistance(student)}
                  </Text>
                  {student.saved_pickup_address && (
                    <Text style={[styles.addressText, { color: c.textMuted, fontFamily: Fonts.body }]} numberOfLines={1}>
                      {student.saved_pickup_address}
                    </Text>
                  )}
                </View>

                {student.invite_status === "pending" ? (
                  <View style={[styles.statusBadge, { backgroundColor: c.dawnFaded }]}>
                    <Text style={[styles.statusText, { color: c.dawn, fontFamily: Fonts.bodySemiBold }]}>Invited</Text>
                  </View>
                ) : student.invite_status === "accepted" ? (
                  <View style={[styles.statusBadge, { backgroundColor: c.dawnFaded }]}>
                    <Text style={[styles.statusText, { color: c.dawn, fontFamily: Fonts.bodySemiBold }]}>In group</Text>
                  </View>
                ) : myGroupId ? (
                  <PressableScale
                    onPress={() => handleInvite(student.id)}
                    disabled={inviting === student.id}
                    style={[styles.inviteBtn, { backgroundColor: c.dawn, opacity: inviting === student.id ? 0.7 : 1 }]}
                  >
                    <Text style={[styles.inviteBtnText, { fontFamily: Fonts.bodySemiBold }]}>{inviting === student.id ? "···" : "Invite"}</Text>
                  </PressableScale>
                ) : null}
              </View>
            </FadeIn>
          ))}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1 },
  content: { paddingBottom: 48 },

  heading: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  title: {
    fontSize: 42,
    letterSpacing: -1.8,
    lineHeight: 44,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },

  empty: {
    paddingHorizontal: 20,
    marginTop: 48,
  },

  list: {
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: "hidden",
    marginHorizontal: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  studentInfo: {
    flex: 1,
    marginRight: 12,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  studentName: {
    fontSize: 15,
    letterSpacing: -0.2,
  },
  gradeBadge: {
    borderRadius: 5,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  gradeText: {
    fontSize: 11,
  },
  distanceText: {
    fontSize: 13,
    lineHeight: 18,
  },
  addressText: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },

  statusBadge: {
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  statusText: {
    fontSize: 12,
  },
  inviteBtn: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  inviteBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
  },
});
