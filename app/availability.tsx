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
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function Availability() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Record<string, { morning: boolean; afternoon: boolean }>>({
    Mon: { morning: false, afternoon: false },
    Tue: { morning: false, afternoon: false },
    Wed: { morning: false, afternoon: false },
    Thu: { morning: false, afternoon: false },
    Fri: { morning: false, afternoon: false },
  });

  useEffect(() => {
    loadAvailability();
  }, []);

  const loadAvailability = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setParentId(user.id);

    // Load existing availability
    const { data: existing } = await supabase
      .from("parent_availability")
      .select("day_of_week, can_drive_morning, can_drive_afternoon")
      .eq("parent_id", user.id)
      .eq("group_id", groupId);

    if (existing && existing.length > 0) {
      const loaded = { ...schedule };
      existing.forEach((row: any) => {
        loaded[row.day_of_week] = {
          morning: row.can_drive_morning,
          afternoon: row.can_drive_afternoon,
        };
      });
      setSchedule(loaded);
    }

    setLoading(false);
  };

  const toggle = (day: string, slot: "morning" | "afternoon") => {
    setSchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [slot]: !prev[day][slot],
      },
    }));
  };

  const handleSave = async () => {
    if (!parentId) return;
    setSaving(true);

    // Delete existing and re-insert
    await supabase
      .from("parent_availability")
      .delete()
      .eq("parent_id", parentId)
      .eq("group_id", groupId);

    const rows = DAYS.map((day) => ({
      parent_id: parentId,
      group_id: groupId,
      day_of_week: day,
      can_drive_morning: schedule[day].morning,
      can_drive_afternoon: schedule[day].afternoon,
      morning_departure_time: "07:30:00",
      afternoon_pickup_time: "14:45:00",
    }));

    const { error } = await supabase.from("parent_availability").insert(rows);

    setSaving(false);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    const totalSlots = Object.values(schedule).reduce(
      (sum, day) => sum + (day.morning ? 1 : 0) + (day.afternoon ? 1 : 0),
      0
    );

    Alert.alert(
      "Saved! ✅",
      `You're available to drive ${totalSlots} ${totalSlots === 1 ? "slot" : "slots"} per week.`,
      [{ text: "OK", onPress: () => router.back() }]
    );
  };

  const totalSelected = Object.values(schedule).reduce(
    (sum, day) => sum + (day.morning ? 1 : 0) + (day.afternoon ? 1 : 0),
    0
  );

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

      <Text style={styles.title}>Driving Availability</Text>
      <Text style={styles.subtitle}>
        Tap the slots when you're available to drive. The app will split driving fairly across all parents in the group.
      </Text>

      <View style={styles.grid}>
        {/* Header */}
        <View style={styles.gridRow}>
          <View style={styles.dayLabel} />
          <View style={styles.slotHeader}>
            <Text style={styles.slotHeaderText}>🌅 AM</Text>
          </View>
          <View style={styles.slotHeader}>
            <Text style={styles.slotHeaderText}>🌆 PM</Text>
          </View>
        </View>

        {/* Days */}
        {DAYS.map((day) => (
          <View key={day} style={styles.gridRow}>
            <View style={styles.dayLabel}>
              <Text style={styles.dayText}>{day}</Text>
            </View>
            <TouchableOpacity
              style={[styles.slotButton, schedule[day].morning && styles.slotActive]}
              onPress={() => toggle(day, "morning")}
            >
              <Text style={[styles.slotButtonText, schedule[day].morning && styles.slotActiveText]}>
                {schedule[day].morning ? "✅" : "—"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.slotButton, schedule[day].afternoon && styles.slotActive]}
              onPress={() => toggle(day, "afternoon")}
            >
              <Text style={[styles.slotButtonText, schedule[day].afternoon && styles.slotActiveText]}>
                {schedule[day].afternoon ? "✅" : "—"}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <Text style={styles.summary}>
        {totalSelected === 0
          ? "You haven't selected any slots yet."
          : `You're available for ${totalSelected} ${totalSelected === 1 ? "slot" : "slots"} per week.`}
      </Text>

      <View style={styles.tipBox}>
        <Text style={styles.tipTitle}>💡 Tip</Text>
        <Text style={styles.tipText}>
          The more slots you're available, the more flexibility the scheduler has to create a fair rotation. You won't necessarily drive every slot you mark — it's just your availability.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>
          {saving ? "Saving..." : "Save Availability"}
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
  grid: {
    marginBottom: 20,
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  dayLabel: {
    width: 60,
  },
  dayText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  slotHeader: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  slotHeaderText: {
    color: "#999",
    fontSize: 14,
    fontWeight: "bold",
  },
  slotButton: {
    flex: 1,
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  slotActive: {
    backgroundColor: "#1a4a3a",
    borderColor: "#00d4aa",
  },
  slotButtonText: {
    color: "#666",
    fontSize: 18,
  },
  slotActiveText: {
    color: "#00d4aa",
  },
  summary: {
    color: "#ccc",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 20,
  },
  tipBox: {
    backgroundColor: "#16213e",
    borderRadius: 14,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  tipTitle: {
    color: "#00d4aa",
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 6,
  },
  tipText: {
    color: "#999",
    fontSize: 13,
    lineHeight: 18,
  },
  saveButton: {
    backgroundColor: "#00d4aa",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
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