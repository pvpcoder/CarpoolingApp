import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";
import { Colors, Spacing, Radius, FontSizes } from "../lib/theme";
import { FadeIn, PrimaryButton, BackButton, Card, LoadingScreen } from "../components/UI";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function StudentSchedule() {
  const router = useRouter();
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

  const setDayType = (day: string, type: string) => { setExceptions((prev) => ({ ...prev, [day]: { ...prev[day], type: type === prev[day].type ? "none" : type } })); };
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
    if (rows.length > 0) { const { error } = await supabase.from("student_exceptions").insert(rows); if (error) { setSaving(false); Alert.alert("Error", error.message); return; } }
    setSaving(false);
    Alert.alert("Saved!", "Your weekly schedule has been updated.", [{ text: "OK", onPress: () => router.back() }]);
  };

  if (loading) return <LoadingScreen />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => router.back()} />
      <FadeIn>
        <Text style={styles.title}>My Weekly Schedule</Text>
        <Text style={styles.subtitle}>Mark days where you have clubs, sports, or don't need a ride.</Text>
      </FadeIn>

      {DAYS.map((day, i) => (
        <FadeIn key={day} delay={150 + i * 60}>
          <Card>
            <Text style={styles.dayTitle}>{day}</Text>
            <View style={styles.optionRow}>
              <TouchableOpacity style={[styles.optionBtn, exceptions[day].type === "late_pickup" && styles.optionActive]} onPress={() => setDayType(day, "late_pickup")} activeOpacity={0.7}>
                <Text style={styles.optionEmoji}>🕐</Text>
                <Text style={[styles.optionText, exceptions[day].type === "late_pickup" && { color: Colors.info }]}>Late Pickup</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.optionBtn, exceptions[day].type === "no_ride" && styles.optionNoRide]} onPress={() => setDayType(day, "no_ride")} activeOpacity={0.7}>
                <Text style={styles.optionEmoji}>🚫</Text>
                <Text style={[styles.optionText, exceptions[day].type === "no_ride" && { color: Colors.accent }]}>No Ride</Text>
              </TouchableOpacity>
            </View>
            {exceptions[day].type === "late_pickup" && (
              <View style={{ gap: 8, marginTop: 8 }}>
                <TextInput style={styles.detailInput} placeholder="Pickup time (e.g. 16:30)" placeholderTextColor={Colors.textTertiary} value={exceptions[day].time} onChangeText={(t) => setDayTime(day, t)} keyboardType="numbers-and-punctuation" />
                <TextInput style={styles.detailInput} placeholder="Reason (e.g. Robotics club)" placeholderTextColor={Colors.textTertiary} value={exceptions[day].reason} onChangeText={(r) => setDayReason(day, r)} />
              </View>
            )}
            {exceptions[day].type === "no_ride" && (
              <TextInput style={[styles.detailInput, { marginTop: 8 }]} placeholder="Reason (optional)" placeholderTextColor={Colors.textTertiary} value={exceptions[day].reason} onChangeText={(r) => setDayReason(day, r)} />
            )}
            {exceptions[day].type === "none" && <Text style={styles.normalText}>Normal schedule</Text>}
          </Card>
        </FadeIn>
      ))}

      <FadeIn delay={550}>
        <PrimaryButton title={saving ? "Saving..." : "Save Schedule"} onPress={handleSave} loading={saving} style={{ marginTop: Spacing.sm }} />
      </FadeIn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.xl, paddingTop: 60, paddingBottom: 48 },
  title: { fontSize: FontSizes.xxl, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.5, marginBottom: 8 },
  subtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.xl },
  dayTitle: { color: Colors.textPrimary, fontSize: FontSizes.lg, fontWeight: "700", marginBottom: 12 },
  optionRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  optionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: Colors.bgInput, borderRadius: Radius.sm, padding: 12, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  optionActive: { backgroundColor: Colors.infoFaded, borderColor: Colors.infoBorder },
  optionNoRide: { backgroundColor: Colors.accentFaded, borderColor: Colors.accentBorder },
  optionEmoji: { fontSize: 16 },
  optionText: { color: Colors.textTertiary, fontSize: FontSizes.sm, fontWeight: "700" },
  detailInput: { backgroundColor: Colors.bgInput, borderRadius: Radius.sm, padding: 12, color: Colors.textPrimary, fontSize: FontSizes.sm, borderWidth: 1, borderColor: Colors.border },
  normalText: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: "600" },
});
