import { useState, useEffect } from "react";
import * as Haptics from "expo-haptics";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { useTheme, Radius, Fonts } from "../lib/theme";
import { PrimaryButton, BackButton, LoadingScreen, ToggleSwitch } from "../components/UI";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function Availability() {
  const router = useRouter();
  const c = useTheme();

  const { groupId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [schedule, setSchedule] = useState<Record<string, { morning: boolean; afternoon: boolean }>>({
    Mon: { morning: false, afternoon: false }, Tue: { morning: false, afternoon: false },
    Wed: { morning: false, afternoon: false }, Thu: { morning: false, afternoon: false },
    Fri: { morning: false, afternoon: false },
  });

  useEffect(() => { loadAvailability(); }, []);

  const loadAvailability = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setParentId(user.id);
    const { data: existing } = await supabase.from("parent_availability").select("day_of_week, can_drive_morning, can_drive_afternoon, is_recurring").eq("parent_id", user.id).eq("group_id", groupId);
    if (existing && existing.length > 0) {
      const loaded = { ...schedule };
      existing.forEach((row: any) => { loaded[row.day_of_week] = { morning: row.can_drive_morning, afternoon: row.can_drive_afternoon }; });
      setSchedule(loaded);
      setIsRecurring(!!existing[0].is_recurring);
    }
    setLoading(false);
  };

  const toggle = (day: string, slot: "morning" | "afternoon") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSchedule((prev) => ({ ...prev, [day]: { ...prev[day], [slot]: !prev[day][slot] } }));
  };

  const handleSave = async () => {
    if (!parentId) return;
    setSaving(true);
    await supabase.from("parent_availability").delete().eq("parent_id", parentId).eq("group_id", groupId);
    const rows = DAYS.map((day) => ({ parent_id: parentId, group_id: groupId, day_of_week: day, can_drive_morning: schedule[day].morning, can_drive_afternoon: schedule[day].afternoon, morning_departure_time: "07:30:00", afternoon_pickup_time: "14:45:00", is_recurring: isRecurring }));
    const { error } = await supabase.from("parent_availability").insert(rows);
    setSaving(false);
    if (error) { Alert.alert("Error", error.message); return; }
    const totalSlots = Object.values(schedule).reduce((sum, day) => sum + (day.morning ? 1 : 0) + (day.afternoon ? 1 : 0), 0);
    Alert.alert("Saved", `You're available to drive ${totalSlots} ${totalSlots === 1 ? "slot" : "slots"} per week.`, [{ text: "OK", onPress: () => router.back() }]);
  };

  const totalSelected = Object.values(schedule).reduce((sum, day) => sum + (day.morning ? 1 : 0) + (day.afternoon ? 1 : 0), 0);

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
        <Text style={[styles.title, { color: c.textPrimary, fontFamily: Fonts.display }]}>Driving Availability</Text>
        <Text style={[styles.subtitle, { color: c.textMuted, fontFamily: Fonts.body }]}>
          Tap the slots when you can drive. The scheduler splits driving fairly across all parents.
        </Text>
      </View>

      {/* Grid */}
      <View style={[styles.grid, { backgroundColor: c.paperElevated, borderColor: c.line }]}>
        {/* Header row */}
        <View style={[styles.gridHeader, { borderBottomColor: c.line }]}>
          <View style={styles.dayCol} />
          <View style={styles.slotHeader}>
            <Text style={[styles.slotHeaderText, { color: c.dawn, fontFamily: Fonts.bodySemiBold }]}>MORNING</Text>
          </View>
          <View style={styles.slotHeader}>
            <Text style={[styles.slotHeaderText, { color: c.dusk, fontFamily: Fonts.bodySemiBold }]}>AFTERNOON</Text>
          </View>
        </View>

        {DAYS.map((day, i) => (
          <View key={day} style={[styles.gridRow, i < DAYS.length - 1 && { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.dayCol}>
              <Text style={[styles.dayText, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>{day}</Text>
            </View>
            {(["morning", "afternoon"] as const).map((slot) => {
              const active = schedule[day][slot];
              const activeColor = slot === "morning" ? c.dawn : c.dusk;
              return (
                <TouchableOpacity
                  key={slot}
                  style={styles.slotCell}
                  onPress={() => toggle(day, slot)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.slotBox, { borderColor: active ? activeColor : c.line, backgroundColor: active ? activeColor : c.paper, transform: [{ scale: active ? 1.05 : 1 }] }]}>
                    {active && (
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* Summary */}
      <View style={[styles.summaryRow, { borderColor: c.line, backgroundColor: c.paperElevated }]}>
        <Text style={[styles.summaryLabel, { color: c.textSecondary, fontFamily: Fonts.bodyMedium }]}>Selected</Text>
        <Text style={[styles.summaryValue, { color: c.textPrimary, fontFamily: Fonts.mono }]}>
          {totalSelected === 0 ? "None" : `${totalSelected} ${totalSelected === 1 ? "slot" : "slots"}`}
        </Text>
      </View>

      {/* Recurring toggle */}
      <View
        style={[styles.recurringRow, { borderColor: c.line, backgroundColor: c.paperElevated }]}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={[styles.recurringLabel, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>Keep this the same every week</Text>
          <Text style={[styles.recurringCaption, { color: c.textMuted, fontFamily: Fonts.body }]}>
            Otherwise your availability resets every Sunday and you'll need to set it again.
          </Text>
        </View>
        <ToggleSwitch value={isRecurring} onValueChange={setIsRecurring} />
      </View>

      {/* Tip */}
      <Text style={[styles.tip, { color: c.textMuted, fontFamily: Fonts.body }]}>
        The more slots you're available, the more flexibility the scheduler has. You won't drive every slot — it's just your availability window.
      </Text>

      <PrimaryButton title="Save availability" onPress={handleSave} loading={saving} />
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

  grid: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    overflow: "hidden",
    marginBottom: 12,
  },
  gridHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  dayCol: {
    width: 52,
  },
  slotHeader: {
    flex: 1,
    alignItems: "center",
  },
  slotHeaderText: {
    fontSize: 9,
    letterSpacing: 0.8,
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dayText: {
    fontSize: 14,
  },
  slotCell: {
    flex: 1,
    alignItems: "center",
  },
  slotBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },

  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14 },

  recurringRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  recurringLabel: { fontSize: 14, marginBottom: 4 },
  recurringCaption: { fontSize: 12, lineHeight: 17 },

  tip: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 24,
  },
});
