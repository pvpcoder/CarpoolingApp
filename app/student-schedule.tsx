import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function StudentSchedule() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [exceptions, setExceptions] = useState<Record<string, { type: string; time: string; reason: string }>>({
    Mon: { type: "none", time: "", reason: "" },
    Tue: { type: "none", time: "", reason: "" },
    Wed: { type: "none", time: "", reason: "" },
    Thu: { type: "none", time: "", reason: "" },
    Fri: { type: "none", time: "", reason: "" },
  });

  useEffect(() => {
    loadExceptions();
  }, []);

  const loadExceptions = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setStudentId(user.id);

    const { data: existing } = await supabase
      .from("student_exceptions")
      .select("day_of_week, exception_type, custom_pickup_time, reason")
      .eq("student_id", user.id)
      .eq("group_id", groupId)
      .eq("is_recurring", true);

    if (existing && existing.length > 0) {
      const loaded = { ...exceptions };
      existing.forEach((row: any) => {
        loaded[row.day_of_week] = {
          type: row.exception_type,
          time: row.custom_pickup_time || "",
          reason: row.reason || "",
        };
      });
      setExceptions(loaded);
    }

    setLoading(false);
  };

  const setDayType = (day: string, type: string) => {
    setExceptions((prev) => ({
      ...prev,
      [day]: { ...prev[day], type: type === prev[day].type ? "none" : type },
    }));
  };

  const setDayTime = (day: string, time: string) => {
    setExceptions((prev) => ({
      ...prev,
      [day]: { ...prev[day], time },
    }));
  };

  const setDayReason = (day: string, reason: string) => {
    setExceptions((prev) => ({
      ...prev,
      [day]: { ...prev[day], reason },
    }));
  };

  const handleSave = async () => {
    if (!studentId) return;
    setSaving(true);

    // Delete existing recurring exceptions
    await supabase
      .from("student_exceptions")
      .delete()
      .eq("student_id", studentId)
      .eq("group_id", groupId)
      .eq("is_recurring", true);

    // Insert new ones (only days with exceptions)
    const rows = DAYS
      .filter((day) => exceptions[day].type !== "none")
      .map((day) => ({
        student_id: studentId,
        group_id: groupId,
        day_of_week: day,
        exception_type: exceptions[day].type,
        custom_pickup_time: exceptions[day].type === "late_pickup" && exceptions[day].time
          ? exceptions[day].time + ":00"
          : null,
        reason: exceptions[day].reason || null,
        is_recurring: true,
      }));

    if (rows.length > 0) {
      const { error } = await supabase.from("student_exceptions").insert(rows);
      if (error) {
        setSaving(false);
        Alert.alert("Error", error.message);
        return;
      }
    }

    setSaving(false);
    Alert.alert("Saved! ✅", "Your weekly schedule has been updated.", [
      { text: "OK", onPress: () => router.back() },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00d4aa" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>My Weekly Schedule</Text>
      <Text style={styles.subtitle}>
        Mark days where you have clubs, sports, or don't need a ride. This helps the group plan around your schedule.
      </Text>

      {DAYS.map((day) => (
        <View key={day} style={styles.dayCard}>
          <Text style={styles.dayTitle}>{day}</Text>

          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[styles.optionButton, exceptions[day].type === "late_pickup" && styles.optionActive]}
              onPress={() => setDayType(day, "late_pickup")}
            >
              <Text style={styles.optionEmoji}>🕐</Text>
              <Text style={[styles.optionText, exceptions[day].type === "late_pickup" && styles.optionTextActive]}>
                Late Pickup
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionButton, exceptions[day].type === "no_ride" && styles.optionNoRide]}
              onPress={() => setDayType(day, "no_ride")}
            >
              <Text style={styles.optionEmoji}>🚫</Text>
              <Text style={[styles.optionText, exceptions[day].type === "no_ride" && styles.optionTextNoRide]}>
                No Ride
              </Text>
            </TouchableOpacity>
          </View>

          {exceptions[day].type === "late_pickup" && (
            <View style={styles.detailRow}>
              <TextInput
                style={styles.timeInput}
                placeholder="Pickup time (e.g. 16:30)"
                placeholderTextColor="#666"
                value={exceptions[day].time}
                onChangeText={(t) => setDayTime(day, t)}
                keyboardType="numbers-and-punctuation"
              />
              <TextInput
                style={styles.reasonInput}
                placeholder="Reason (e.g. Robotics club)"
                placeholderTextColor="#666"
                value={exceptions[day].reason}
                onChangeText={(r) => setDayReason(day, r)}
              />
            </View>
          )}

          {exceptions[day].type === "no_ride" && (
            <TextInput
              style={styles.reasonInputFull}
              placeholder="Reason (optional)"
              placeholderTextColor="#666"
              value={exceptions[day].reason}
              onChangeText={(r) => setDayReason(day, r)}
            />
          )}

          {exceptions[day].type === "none" && (
            <Text style={styles.normalText}>✅ Normal schedule</Text>
          )}
        </View>
      ))}

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>
          {saving ? "Saving..." : "Save Schedule"}
        </Text>
      </TouchableOpacity>
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
    lineHeight: 20,
    marginBottom: 24,
  },
  dayCard: {
    backgroundColor: "#16213e",
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  dayTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  optionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a2e",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#2a2a4a",
    gap: 6,
  },
  optionActive: {
    backgroundColor: "#1a3a4a",
    borderColor: "#00bcd4",
  },
  optionNoRide: {
    backgroundColor: "#4a1a1a",
    borderColor: "#ff6b6b",
  },
  optionEmoji: {
    fontSize: 16,
  },
  optionText: {
    color: "#999",
    fontSize: 14,
    fontWeight: "bold",
  },
  optionTextActive: {
    color: "#00bcd4",
  },
  optionTextNoRide: {
    color: "#ff6b6b",
  },
  detailRow: {
    gap: 8,
    marginTop: 8,
  },
  timeInput: {
    backgroundColor: "#1a1a2e",
    borderRadius: 10,
    padding: 12,
    color: "#fff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  reasonInput: {
    backgroundColor: "#1a1a2e",
    borderRadius: 10,
    padding: 12,
    color: "#fff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  reasonInputFull: {
    backgroundColor: "#1a1a2e",
    borderRadius: 10,
    padding: 12,
    color: "#fff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#2a2a4a",
    marginTop: 8,
  },
  normalText: {
    color: "#00d4aa",
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: "#00d4aa",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#1a1a2e",
    fontSize: 18,
    fontWeight: "bold",
  },
});