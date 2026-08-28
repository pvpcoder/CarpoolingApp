import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";
import { useTheme, Radius, Fonts } from "../lib/theme";
import { PrimaryButton, BackButton, LoadingScreen } from "../components/UI";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function StudentSchedule() {
  const router = useRouter();
  const c = useTheme();

  const { groupId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [exceptions, setExceptions] = useState<Record<string, { type: string; time: string; reason: string }>>({
    Mon: { type: "none", time: "", reason: "" }, Tue: { type: "none", time: "", reason: "" },
    Wed: { type: "none", time: "", reason: "" }, Thu: { type: "none", time: "", reason: "" },
    Fri: { type: "none", time: "", reason: "" },
  });

  useEffect(() => { loadExceptions(); }, []);

  const loadExceptions = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setStudentId(user.id);
    const { data: existing } = await supabase.from("student_exceptions").select("day_of_week, exception_type, custom_pickup_time, reason").eq("student_id", user.id).eq("group_id", groupId).eq("is_recurring", true);
    if (existing && existing.length > 0) {
      const loaded = { ...exceptions };
      existing.forEach((row: any) => { loaded[row.day_of_week] = { type: row.exception_type, time: row.custom_pickup_time || "", reason: row.reason || "" }; });
      setExceptions(loaded);
    }
    setLoading(false);
  };

  const setDayType = (day: string, type: string) => {
    setExceptions((prev) => ({ ...prev, [day]: { ...prev[day], type: type === prev[day].type ? "none" : type } }));
  };
  const setDayTime = (day: string, time: string) => { setExceptions((prev) => ({ ...prev, [day]: { ...prev[day], time } })); };
  const setDayReason = (day: string, reason: string) => { setExceptions((prev) => ({ ...prev, [day]: { ...prev[day], reason } })); };

  const handleSave = async () => {
    if (!studentId) return;
    setSaving(true);
    await supabase.from("student_exceptions").delete().eq("student_id", studentId).eq("group_id", groupId).eq("is_recurring", true);
    const rows = DAYS.filter((day) => exceptions[day].type !== "none").map((day) => ({
      student_id: studentId, group_id: groupId, day_of_week: day, exception_type: exceptions[day].type,
      custom_pickup_time: exceptions[day].type === "late_pickup" && exceptions[day].time ? exceptions[day].time + ":00" : null,
      reason: exceptions[day].reason || null, is_recurring: true,
    }));
    if (rows.length > 0) {
      const { error } = await supabase.from("student_exceptions").insert(rows);
      if (error) { setSaving(false); Alert.alert("Error", error.message); return; }
    }
    setSaving(false);
    Alert.alert("Saved", "Your weekly schedule has been updated.", [{ text: "OK", onPress: () => router.back() }]);
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.paper }]}
      contentContainerStyle={styles.content}
    >
      <BackButton onPress={() => router.back()} />

      <View style={styles.heading}>
        <Text style={[styles.title, { color: c.textPrimary, fontFamily: Fonts.display }]}>My Weekly Schedule</Text>
        <Text style={[styles.subtitle, { color: c.textMuted, fontFamily: Fonts.body }]}>
          Mark days where you have clubs, sports, or don't need a ride. This helps the scheduler plan around you.
        </Text>
      </View>

      <View style={[styles.dayList, { borderColor: c.line }]}>
        {DAYS.map((day, i) => (
          <View key={day} style={[styles.daySection, i < DAYS.length - 1 && { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.dayHeader}>
              <Text style={[styles.dayTitle, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>{day}</Text>
              {exceptions[day].type === "none" && (
                <Text style={[styles.normalLabel, { color: c.textMuted, fontFamily: Fonts.bodyMedium }]}>Normal</Text>
              )}
            </View>

            <View style={styles.pillRow}>
              <TouchableOpacity
                style={[styles.pill, { backgroundColor: exceptions[day].type === "late_pickup" ? c.duskFaded : c.paper, borderColor: exceptions[day].type === "late_pickup" ? c.dusk : c.line }]}
                onPress={() => setDayType(day, "late_pickup")}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, { color: exceptions[day].type === "late_pickup" ? c.dusk : c.textMuted, fontFamily: Fonts.bodySemiBold }]}>
                  Late pickup
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pill, { backgroundColor: exceptions[day].type === "no_ride" ? c.rustFaded : c.paper, borderColor: exceptions[day].type === "no_ride" ? c.rust : c.line }]}
                onPress={() => setDayType(day, "no_ride")}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, { color: exceptions[day].type === "no_ride" ? c.rust : c.textMuted, fontFamily: Fonts.bodySemiBold }]}>
                  No ride
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pill, { backgroundColor: exceptions[day].type === "needs_normal_pickup" ? c.dawnFaded : c.paper, borderColor: exceptions[day].type === "needs_normal_pickup" ? c.dawn : c.line }]}
                onPress={() => setDayType(day, "needs_normal_pickup")}
                activeOpacity={0.7}
              >
                <Text style={[styles.pillText, { color: exceptions[day].type === "needs_normal_pickup" ? c.dawn : c.textMuted, fontFamily: Fonts.bodySemiBold }]}>
                  Normal pickup
                </Text>
              </TouchableOpacity>
            </View>

            {exceptions[day].type === "needs_normal_pickup" && (
              <>
                <Text style={[styles.helperText, { color: c.textMuted, fontFamily: Fonts.body }]}>
                  Only matters if your group combines late pickups — this keeps your regular 2:45 PM pickup on this day instead of waiting for the shared late trip.
                </Text>
                <TextInput
                  style={[styles.detailInput, { backgroundColor: c.paper, color: c.textPrimary, borderColor: c.line, fontFamily: Fonts.body, marginTop: 10 }]}
                  placeholder="Reason (optional)"
                  placeholderTextColor={c.textMuted}
                  value={exceptions[day].reason}
                  onChangeText={(r) => setDayReason(day, r)}
                />
              </>
            )}

            {exceptions[day].type === "late_pickup" && (
              <View style={styles.detailGroup}>
                <TextInput
                  style={[styles.detailInput, { backgroundColor: c.paper, color: c.textPrimary, borderColor: c.line, fontFamily: Fonts.body }]}
                  placeholder="Pickup time (e.g. 16:30)"
                  placeholderTextColor={c.textMuted}
                  value={exceptions[day].time}
                  onChangeText={(t) => setDayTime(day, t)}
                  keyboardType="numbers-and-punctuation"
                />
                <TextInput
                  style={[styles.detailInput, { backgroundColor: c.paper, color: c.textPrimary, borderColor: c.line, fontFamily: Fonts.body }]}
                  placeholder="Reason (e.g. Robotics club)"
                  placeholderTextColor={c.textMuted}
                  value={exceptions[day].reason}
                  onChangeText={(r) => setDayReason(day, r)}
                />
              </View>
            )}

            {exceptions[day].type === "no_ride" && (
              <TextInput
                style={[styles.detailInput, { backgroundColor: c.paper, color: c.textPrimary, borderColor: c.line, fontFamily: Fonts.body, marginTop: 10 }]}
                placeholder="Reason (optional)"
                placeholderTextColor={c.textMuted}
                value={exceptions[day].reason}
                onChangeText={(r) => setDayReason(day, r)}
              />
            )}
          </View>
        ))}
      </View>

      <PrimaryButton title="Save schedule" onPress={handleSave} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 48 },

  heading: { marginBottom: 28 },
  title: {
    fontSize: 40,
    letterSpacing: -1.5,
    lineHeight: 42,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },

  dayList: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    overflow: "hidden",
    marginBottom: 24,
  },
  daySection: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  dayTitle: { fontSize: 15 },
  normalLabel: { fontSize: 12 },

  pillRow: { flexDirection: "row", gap: 10 },
  pill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 10,
  },
  pillText: { fontSize: 13 },

  detailGroup: { gap: 8, marginTop: 12 },
  detailInput: {
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
  },
});
