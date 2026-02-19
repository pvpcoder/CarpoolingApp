import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";
import { Colors, Spacing, Radius, FontSizes } from "../lib/theme";
import { FadeIn, PrimaryButton, BackButton, Card, Banner, LoadingScreen } from "../components/UI";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function Availability() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
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
    const { data: existing } = await supabase.from("parent_availability").select("day_of_week, can_drive_morning, can_drive_afternoon").eq("parent_id", user.id).eq("group_id", groupId);
    if (existing && existing.length > 0) {
      const loaded = { ...schedule };
      existing.forEach((row: any) => { loaded[row.day_of_week] = { morning: row.can_drive_morning, afternoon: row.can_drive_afternoon }; });
      setSchedule(loaded);
    }
    setLoading(false);
  };

  const toggle = (day: string, slot: "morning" | "afternoon") => {
    setSchedule((prev) => ({ ...prev, [day]: { ...prev[day], [slot]: !prev[day][slot] } }));
  };

  const handleSave = async () => {
    if (!parentId) return;
    setSaving(true);
    await supabase.from("parent_availability").delete().eq("parent_id", parentId).eq("group_id", groupId);
    const rows = DAYS.map((day) => ({ parent_id: parentId, group_id: groupId, day_of_week: day, can_drive_morning: schedule[day].morning, can_drive_afternoon: schedule[day].afternoon, morning_departure_time: "07:30:00", afternoon_pickup_time: "14:45:00" }));
    const { error } = await supabase.from("parent_availability").insert(rows);
    setSaving(false);
    if (error) { Alert.alert("Error", error.message); return; }
    const totalSlots = Object.values(schedule).reduce((sum, day) => sum + (day.morning ? 1 : 0) + (day.afternoon ? 1 : 0), 0);
    Alert.alert("Saved!", `You're available to drive ${totalSlots} ${totalSlots === 1 ? "slot" : "slots"} per week.`, [{ text: "OK", onPress: () => router.back() }]);
  };

  const totalSelected = Object.values(schedule).reduce((sum, day) => sum + (day.morning ? 1 : 0) + (day.afternoon ? 1 : 0), 0);

  if (loading) return <LoadingScreen />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => router.back()} />
      <FadeIn>
        <Text style={styles.title}>Driving Availability</Text>
        <Text style={styles.subtitle}>
          Tap the slots when you can drive. The scheduler will split driving fairly across all parents.
        </Text>
      </FadeIn>

      <FadeIn delay={150}>
        <View style={styles.grid}>
          {/* Column headers */}
          <View style={styles.gridHeader}>
            <View style={styles.dayLabelCell} />
            <View style={styles.headerCell}>
              <Text style={styles.headerLabel}>AM</Text>
            </View>
            <View style={styles.headerCell}>
              <Text style={styles.headerLabel}>PM</Text>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.gridDivider} />

          {/* Day rows */}
          {DAYS.map((day, i) => (
            <FadeIn key={day} delay={200 + i * 50}>
              <View style={styles.gridRow}>
                <View style={styles.dayLabelCell}>
                  <Text style={styles.dayText}>{day}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.slotCell, schedule[day].morning && styles.slotCellActive]}
                  onPress={() => toggle(day, "morning")}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.slotIndicator, schedule[day].morning && styles.slotIndicatorActive]}>
                    {schedule[day].morning ? "\u2713" : "\u2014"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.slotCell, schedule[day].afternoon && styles.slotCellActive]}
                  onPress={() => toggle(day, "afternoon")}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.slotIndicator, schedule[day].afternoon && styles.slotIndicatorActive]}>
                    {schedule[day].afternoon ? "\u2713" : "\u2014"}
                  </Text>
                </TouchableOpacity>
              </View>
            </FadeIn>
          ))}
        </View>
      </FadeIn>

      <FadeIn delay={500}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Selected</Text>
          <Text style={styles.summaryValue}>
            {totalSelected === 0 ? "None" : `${totalSelected} ${totalSelected === 1 ? "slot" : "slots"}`}
          </Text>
        </View>

        <Banner
          title="Tip"
          message="The more slots you're available, the more flexibility the scheduler has. You won't necessarily drive every slot — it's just your availability."
          variant="info"
        />
        <PrimaryButton title={saving ? "Saving..." : "Save Availability"} onPress={handleSave} loading={saving} />
      </FadeIn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    padding: Spacing.xl,
    paddingTop: 60,
    paddingBottom: 48,
  },
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: "800",
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.xxl,
  },

  // Grid
  grid: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    marginBottom: Spacing.xl,
  },
  gridHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Spacing.sm,
  },
  dayLabelCell: {
    width: 52,
  },
  headerCell: {
    flex: 1,
    alignItems: "center",
  },
  headerLabel: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  gridDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  dayText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.base,
    fontWeight: "700",
  },
  slotCell: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.sm,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  slotCellActive: {
    backgroundColor: Colors.primaryFaded,
    borderColor: Colors.primaryBorder,
  },
  slotIndicator: {
    color: Colors.textMuted,
    fontSize: 16,
    fontWeight: "500",
  },
  slotIndicatorActive: {
    color: Colors.primary,
    fontSize: 18,
    fontWeight: "700",
  },

  // Summary
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 14,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.md,
  },
  summaryLabel: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  summaryValue: {
    color: Colors.textPrimary,
    fontSize: FontSizes.md,
    fontWeight: "700",
  },
});
