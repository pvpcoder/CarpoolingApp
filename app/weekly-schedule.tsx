import { notifyGroupMembers } from "../lib/notifications";
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
import { Colors, Spacing, Radius, FontSizes } from "../lib/theme";
import { FadeIn, PrimaryButton, SecondaryButton, BackButton, Card, Banner, LoadingScreen } from "../components/UI";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function WeeklySchedule() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [schedule, setSchedule] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [parentMap, setParentMap] = useState<Record<string, string>>({});
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [swapRequests, setSwapRequests] = useState<any[]>([]);

  useEffect(() => {
    loadSchedule();
  }, []);

  const loadSchedule = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);
    const { data: memberData } = await supabase
      .from("group_members")
      .select(`
        id, student_id, parent_id,
        students ( name ),
        parents ( name )
      `)
      .eq("group_id", groupId)
      .eq("status", "active");

    setMembers(memberData || []);

    const pMap: Record<string, string> = {};
    (memberData || []).forEach((m: any) => {
      if (m.parent_id && m.parents) {
        pMap[m.parent_id] = m.parents.name;
      }
    });
    setParentMap(pMap);

    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const weekStart = monday.toISOString().split("T")[0];

    const { data: existing } = await supabase
      .from("weekly_schedules")
      .select("id, status, week_start_date")
      .eq("group_id", groupId)
      .eq("week_start_date", weekStart)
      .single();

    if (existing) {
      setSchedule(existing);

      const { data: slotData } = await supabase
        .from("schedule_slots")
        .select("id, day_of_week, slot_type, driver_parent_id, departure_time, status")
        .eq("schedule_id", existing.id)
        .order("day_of_week");

      setSlots(slotData || []);

      // Load swap requests for this group's current schedule
      const slotIds = (slotData || []).map((s: any) => s.id);
      if (slotIds.length > 0) {
        const { data: swaps } = await supabase
          .from("swap_requests")
          .select("id, slot_id, requesting_parent_id, covering_parent_id, status, message")
          .in("slot_id", slotIds);
        setSwapRequests(swaps || []);
      }
    }

    setLoading(false);
  };

  const generateSchedule = async () => {
    setGenerating(true);
    setAiExplanation(null);

    // Gather all data for Claude
    const { data: availability } = await supabase
      .from("parent_availability")
      .select("parent_id, day_of_week, can_drive_morning, can_drive_afternoon")
      .eq("group_id", groupId);

    if (!availability || availability.length === 0) {
      setGenerating(false);
      Alert.alert("No Availability", "No parents have set their driving availability yet.");
      return;
    }

    const { data: exceptions } = await supabase
      .from("student_exceptions")
      .select("student_id, day_of_week, exception_type, custom_pickup_time, reason")
      .eq("group_id", groupId)
      .eq("is_recurring", true);

    // Build readable data for Claude
    const familyInfo = members.map((m: any) => ({
      student_name: m.students?.name || "Unknown Student",
      parent_name: m.parents?.name || "Unknown Parent",
      parent_id: m.parent_id,
      student_id: m.student_id,
    }));

    const availabilityInfo = availability.map((a: any) => ({
      parent_id: a.parent_id,
      parent_name: parentMap[a.parent_id] || "Parent",
      day: a.day_of_week,
      can_morning: a.can_drive_morning,
      can_afternoon: a.can_drive_afternoon,
    }));

    const exceptionInfo = (exceptions || []).map((e: any) => {
      const family = familyInfo.find((f) => f.student_id === e.student_id);
      return {
        student_name: family?.student_name || "Student",
        day: e.day_of_week,
        type: e.exception_type,
        pickup_time: e.custom_pickup_time,
        reason: e.reason,
      };
    });

    const prompt = `You are a carpool scheduling assistant. Create a fair weekly driving schedule for a carpool group.

FAMILIES IN THE GROUP:
${familyInfo.map((f) => `- ${f.student_name} (student) + ${f.parent_name} (parent, ID: ${f.parent_id})`).join("\n")}

PARENT DRIVING AVAILABILITY:
${availabilityInfo.map((a) => `- ${a.parent_name} (${a.parent_id}): ${a.day} — Morning: ${a.can_morning ? "YES" : "NO"}, Afternoon: ${a.can_afternoon ? "YES" : "NO"}`).join("\n")}

STUDENT SCHEDULE EXCEPTIONS:
${exceptionInfo.length > 0
  ? exceptionInfo.map((e) => `- ${e.student_name}: ${e.day} — ${e.type}${e.pickup_time ? ` at ${e.pickup_time}` : ""}${e.reason ? ` (${e.reason})` : ""}`).join("\n")
  : "None"}

RULES:
1. Every weekday needs a morning slot (to school, 7:30 AM)
2. For afternoon pickups, use this logic:
   - If NO students have a late_pickup exception that day → add a normal "afternoon" slot (2:45 PM)
   - If SOME students have a late_pickup and some don't → add BOTH a normal "afternoon" slot AND a "late_afternoon" slot
   - If ALL students have a late_pickup exception on the same day → add ONLY a "late_afternoon" slot at their pickup time, do NOT add a regular "afternoon" slot
3. A parent can ONLY drive a slot if they marked it as available
4. Split driving as FAIRLY as possible — each parent should drive roughly the same number of slots
5. If a student has a "no_ride" exception, they don't need ANY pickup that day (but others still do)
6. If ALL students have "no_ride" on the same day, skip the afternoon slot entirely
7. If no parent is available for a slot, mark driver_parent_id as null

TOTAL STUDENTS IN GROUP: ${familyInfo.length}

Respond with ONLY valid JSON in this exact format, no other text:
{
  "slots": [
    {
      "day_of_week": "Mon",
      "slot_type": "morning",
      "driver_parent_id": "parent-uuid-here",
      "departure_time": "07:30:00"
    }
  ],
  "explanation": "Brief explanation of how you split the driving fairly"
}`;

    try {
      const response = await supabase.functions.invoke(
        "generate-schedule",
        { body: { prompt } }
      );

      console.log("Full response:", JSON.stringify(response));

      if (response.error) {
        // Try to read the error body
        const errorContext = response.error?.context;
        if (errorContext && errorContext.json) {
          const body = await errorContext.json();
          console.log("Error body:", JSON.stringify(body));
        }
        throw new Error(response.error.message);
      }

      const data = response.data;

      if (data.error) {
        throw new Error(data.error.message || "API error");
      }

      const text = data.content?.[0]?.text || "";

      // Parse JSON from response (handle possible markdown fences)
      const cleaned = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      if (!parsed.slots || !Array.isArray(parsed.slots)) {
        throw new Error("Invalid response format");
      }

      setAiExplanation(parsed.explanation || null);

      // Save to database
      const today = new Date();
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const weekStart = monday.toISOString().split("T")[0];

      // Delete existing schedule
      const { data: oldSchedule } = await supabase
        .from("weekly_schedules")
        .select("id")
        .eq("group_id", groupId)
        .eq("week_start_date", weekStart)
        .single();

      if (oldSchedule) {
        await supabase.from("schedule_slots").delete().eq("schedule_id", oldSchedule.id);
        await supabase.from("weekly_schedules").delete().eq("id", oldSchedule.id);
      }

      const { data: newSchedule, error: schedError } = await supabase
        .from("weekly_schedules")
        .insert({
          group_id: groupId,
          week_start_date: weekStart,
          status: "published",
          generated_by: "ai",
        })
        .select("id")
        .single();

      if (schedError || !newSchedule) {
        throw new Error(schedError?.message || "Failed to create schedule");
      }

      const slotsToInsert = parsed.slots.map((s: any) => ({
        schedule_id: newSchedule.id,
        day_of_week: s.day_of_week,
        slot_type: s.slot_type,
        driver_parent_id: s.driver_parent_id || null,
        departure_time: s.departure_time,
        status: s.driver_parent_id ? "confirmed" : "needs_coverage",
      }));

      const { error: slotError } = await supabase
        .from("schedule_slots")
        .insert(slotsToInsert);

      if (slotError) {
        throw new Error(slotError.message);
      }

      setGenerating(false);
      Alert.alert("Schedule Generated! 🎉", "Claude created a fair driving schedule for your group.");
      loadSchedule();

    } catch (err: any) {
      setGenerating(false);
      console.error("AI scheduling error:", err);

      // Fallback to simple algorithm
      Alert.alert(
        "AI Unavailable",
        "Couldn't reach Claude. Would you like to use the basic scheduler instead?",
        [
          { text: "Cancel" },
          { text: "Use Basic", onPress: () => generateBasicSchedule() },
        ]
      );
    }
  };

  const generateBasicSchedule = async () => {
    setGenerating(true);

    const { data: availability } = await supabase
      .from("parent_availability")
      .select("parent_id, day_of_week, can_drive_morning, can_drive_afternoon")
      .eq("group_id", groupId);

    const { data: exceptions } = await supabase
      .from("student_exceptions")
      .select("student_id, day_of_week, exception_type, custom_pickup_time")
      .eq("group_id", groupId)
      .eq("is_recurring", true);

    const availMap: Record<string, { morning: string[]; afternoon: string[] }> = {};
    DAYS.forEach((d) => { availMap[d] = { morning: [], afternoon: [] }; });

    (availability || []).forEach((a: any) => {
      if (a.can_drive_morning) availMap[a.day_of_week].morning.push(a.parent_id);
      if (a.can_drive_afternoon) availMap[a.day_of_week].afternoon.push(a.parent_id);
    });

    const assignCount: Record<string, number> = {};
    members.forEach((m: any) => {
      if (m.parent_id) assignCount[m.parent_id] = 0;
    });

    const newSlots: any[] = [];

    DAYS.forEach((day) => {
      // Morning
      const am = [...availMap[day].morning].sort((a, b) => (assignCount[a] || 0) - (assignCount[b] || 0));
      if (am.length > 0) {
        assignCount[am[0]] = (assignCount[am[0]] || 0) + 1;
        newSlots.push({ day_of_week: day, slot_type: "morning", driver_parent_id: am[0], departure_time: "07:30:00", status: "confirmed" });
      } else {
        newSlots.push({ day_of_week: day, slot_type: "morning", driver_parent_id: null, departure_time: "07:30:00", status: "needs_coverage" });
      }

      // Afternoon
      const pm = [...availMap[day].afternoon].sort((a, b) => (assignCount[a] || 0) - (assignCount[b] || 0));
      if (pm.length > 0) {
        assignCount[pm[0]] = (assignCount[pm[0]] || 0) + 1;
        newSlots.push({ day_of_week: day, slot_type: "afternoon", driver_parent_id: pm[0], departure_time: "14:45:00", status: "confirmed" });
      } else {
        newSlots.push({ day_of_week: day, slot_type: "afternoon", driver_parent_id: null, departure_time: "14:45:00", status: "needs_coverage" });
      }

      // Late afternoon
      const lateExceptions = (exceptions || []).filter((e: any) => e.day_of_week === day && e.exception_type === "late_pickup");
      if (lateExceptions.length > 0) {
        const late = [...availMap[day].afternoon].sort((a, b) => (assignCount[a] || 0) - (assignCount[b] || 0));
        if (late.length > 0) {
          assignCount[late[0]] = (assignCount[late[0]] || 0) + 1;
          newSlots.push({ day_of_week: day, slot_type: "late_afternoon", driver_parent_id: late[0], departure_time: lateExceptions[0].custom_pickup_time || "16:30:00", status: "confirmed" });
        }
      }
    });

    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const weekStart = monday.toISOString().split("T")[0];

    const { data: oldSchedule } = await supabase
      .from("weekly_schedules").select("id").eq("group_id", groupId).eq("week_start_date", weekStart).single();

    if (oldSchedule) {
      await supabase.from("schedule_slots").delete().eq("schedule_id", oldSchedule.id);
      await supabase.from("weekly_schedules").delete().eq("id", oldSchedule.id);
    }

    const { data: newSchedule } = await supabase
      .from("weekly_schedules")
      .insert({ group_id: groupId, week_start_date: weekStart, status: "published", generated_by: "manual" })
      .select("id").single();

    if (newSchedule) {
      await supabase.from("schedule_slots").insert(
        newSlots.map((s) => ({ ...s, schedule_id: newSchedule.id }))
      );
    }

    setGenerating(false);
    setAiExplanation("Generated using basic fair-split algorithm.");
    loadSchedule();
  };
  const handleRequestSwap = async (slotId: string) => {
    if (!currentUserId) return;

    Alert.alert(
      "Request Swap",
      "This will notify other parents that you need someone to cover this slot.",
      [
        { text: "Cancel" },
        {
          text: "Request Swap",
          onPress: async () => {
            const { error } = await supabase.from("swap_requests").insert({
              slot_id: slotId,
              requesting_parent_id: currentUserId,
              status: "open",
              message: "Can someone cover this slot?",
            });

            if (error) {
              Alert.alert("Error", error.message);
              return;
            }
            notifyGroupMembers(
              groupId as string,
              currentUserId!,
              "🔄 Swap Request",
              `${parentMap[currentUserId!] || "A parent"} needs someone to cover a driving slot.`
            );
            Alert.alert("Swap Requested! 🔄", "Other parents in the group will see your request.");
            loadSchedule();
          },
        },
      ]
    );
  };

  const handleCoverSwap = async (swapId: string, slotId: string) => {
    if (!currentUserId) return;

    Alert.alert(
      "Cover This Slot",
      "You'll be assigned as the driver for this slot.",
      [
        { text: "Cancel" },
        {
          text: "I'll Cover It",
          onPress: async () => {
            // Update swap request
            const { error: swapError } = await supabase
              .from("swap_requests")
              .update({
                covering_parent_id: currentUserId,
                status: "covered",
              })
              .eq("id", swapId);

            if (swapError) {
              Alert.alert("Error", swapError.message);
              return;
            }

            // Update the schedule slot driver
            const { error: slotError } = await supabase
              .from("schedule_slots")
              .update({
                driver_parent_id: currentUserId,
                status: "swapped",
              })
              .eq("id", slotId);

            if (slotError) {
              Alert.alert("Error", slotError.message);
              return;
            }
            notifyGroupMembers(
              groupId as string,
              currentUserId!,
              "✅ Swap Covered",
              `${parentMap[currentUserId!] || "A parent"} is covering the slot.`
            );

            Alert.alert("Thanks! 🙏", "You've been assigned as the driver for this slot.");
            loadSchedule();
          },
        },
      ]
    );
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${m} ${ampm}`;
  };

  const getSlotIcon = (type: string) => {
    switch (type) {
      case "morning": return "🌅";
      case "afternoon": return "🌆";
      case "late_afternoon": return "🌙";
      default: return "📍";
    }
  };

  const getSlotLabel = (type: string) => {
    switch (type) {
      case "morning": return "To School";
      case "afternoon": return "From School";
      case "late_afternoon": return "Late Pickup";
      default: return type;
    }
  };

  const getSlotTag = (type: string) => {
    switch (type) {
      case "morning": return "AM";
      case "afternoon": return "PM";
      case "late_afternoon": return "Late";
      default: return type;
    }
  };

  const getSlotAccentColor = (type: string) => {
    switch (type) {
      case "morning": return Colors.primary;
      case "afternoon": return Colors.info;
      case "late_afternoon": return Colors.warm;
      default: return Colors.textTertiary;
    }
  };

  const driverCounts: Record<string, number> = {};
  slots.forEach((s: any) => {
    if (s.driver_parent_id) {
      driverCounts[s.driver_parent_id] = (driverCounts[s.driver_parent_id] || 0) + 1;
    }
  });

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackButton onPress={() => router.back()} />

      <FadeIn>
        <Text style={styles.title}>Weekly Schedule</Text>
      </FadeIn>

      {!schedule ? (
        <FadeIn delay={150}>
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <Text style={styles.emptyIconText}>S</Text>
            </View>
            <Text style={styles.emptyTitle}>No schedule yet</Text>
            <Text style={styles.emptyText}>
              AI will analyze everyone's availability and create a fair driving rotation.
            </Text>
            <PrimaryButton
              title={generating ? "Generating..." : "Generate with AI"}
              onPress={generateSchedule}
              loading={generating}
              disabled={generating}
            />
          </View>
        </FadeIn>
      ) : (
        <>
          {/* AI Explanation */}
          {aiExplanation && (
            <FadeIn delay={100}>
              <View style={styles.aiCard}>
                <View style={styles.aiHeader}>
                  <View style={styles.aiDot} />
                  <Text style={styles.aiTitle}>AI Reasoning</Text>
                </View>
                <Text style={styles.aiText}>{aiExplanation}</Text>
              </View>
            </FadeIn>
          )}

          {/* Fairness Summary */}
          <FadeIn delay={150}>
            <View style={styles.fairnessCard}>
              <Text style={styles.fairnessTitle}>Driving Split</Text>
              <View style={styles.fairnessDivider} />
              {Object.entries(driverCounts).map(([parentId, count]) => (
                <View key={parentId} style={styles.fairnessRow}>
                  <Text style={styles.fairnessName}>{parentMap[parentId] || "Parent"}</Text>
                  <View style={styles.fairnessCountBadge}>
                    <Text style={styles.fairnessCount}>{count}</Text>
                  </View>
                </View>
              ))}
            </View>
          </FadeIn>

          {/* Day-by-day */}
          {DAYS.map((day, i) => {
            const daySlots = slots.filter((s: any) => s.day_of_week === day);
            return (
              <FadeIn key={day} delay={200 + i * 60}>
                <View style={styles.dayCard}>
                  <Text style={styles.dayTitle}>{day}</Text>
                  {daySlots.length === 0 ? (
                    <Text style={styles.noSlots}>No rides scheduled</Text>
                  ) : (
                    daySlots.map((slot: any) => (
                      <View key={slot.id}>
                        <View
                          style={[
                            styles.slotRow,
                            slot.status === "needs_coverage" && styles.slotNeedsCoverage,
                          ]}
                        >
                          {/* Left accent bar */}
                          <View style={[styles.slotAccent, { backgroundColor: getSlotAccentColor(slot.slot_type) }]} />
                          <View style={styles.slotContent}>
                            <View style={styles.slotTop}>
                              <View style={styles.slotLabelRow}>
                                <Text style={styles.slotTag}>{getSlotTag(slot.slot_type)}</Text>
                                <Text style={styles.slotLabel}>{getSlotLabel(slot.slot_type)}</Text>
                              </View>
                              <Text style={styles.slotTime}>{formatTime(slot.departure_time)}</Text>
                            </View>
                            <View style={styles.slotBottom}>
                              {slot.driver_parent_id ? (
                                <Text style={styles.driverName}>
                                  {parentMap[slot.driver_parent_id] || "Assigned"}
                                </Text>
                              ) : (
                                <Text style={styles.needsCoverage}>Needs driver</Text>
                              )}
                            </View>
                          </View>
                        </View>

                        {/* Swap actions */}
                        {(() => {
                          const swap = swapRequests.find((s: any) => s.slot_id === slot.id);
                          const isMySlot = slot.driver_parent_id === currentUserId;

                          if (swap && swap.status === "open") {
                            if (swap.requesting_parent_id === currentUserId) {
                              return (
                                <View style={styles.swapBanner}>
                                  <Text style={styles.swapBannerText}>Swap requested -- waiting for coverage</Text>
                                </View>
                              );
                            } else {
                              return (
                                <TouchableOpacity
                                  style={styles.coverButton}
                                  onPress={() => handleCoverSwap(swap.id, slot.id)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.coverButtonText}>I'll Cover This Slot</Text>
                                </TouchableOpacity>
                              );
                            }
                          } else if (swap && swap.status === "covered") {
                            return (
                              <View style={styles.swapCoveredBanner}>
                                <Text style={styles.swapCoveredText}>
                                  Covered by {parentMap[swap.covering_parent_id] || "another parent"}
                                </Text>
                              </View>
                            );
                          } else if (isMySlot && !swap) {
                            return (
                              <TouchableOpacity
                                style={styles.cantDriveButton}
                                onPress={() => handleRequestSwap(slot.id)}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.cantDriveText}>Can't drive this slot?</Text>
                              </TouchableOpacity>
                            );
                          }
                          return null;
                        })()}
                      </View>
                    ))
                  )}
                </View>
              </FadeIn>
            );
          })}

          <FadeIn delay={550}>
            <SecondaryButton
              title={generating ? "Generating..." : "Regenerate with AI"}
              onPress={generateSchedule}
              loading={generating}
              disabled={generating}
              style={{ marginTop: Spacing.sm }}
            />
          </FadeIn>
        </>
      )}
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
    marginBottom: Spacing.xl,
  },

  // Empty state
  emptyContainer: {
    alignItems: "center",
    marginTop: 40,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyIconText: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.textTertiary,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.lg,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.md,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
  },

  // AI Card
  aiCard: {
    backgroundColor: Colors.infoFaded,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.infoBorder,
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  aiDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.info,
    marginRight: 8,
  },
  aiTitle: {
    color: Colors.info,
    fontSize: FontSizes.md,
    fontWeight: "700",
  },
  aiText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },

  // Fairness Card
  fairnessCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fairnessTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.md,
    fontWeight: "700",
  },
  fairnessDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  fairnessRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  fairnessName: {
    color: Colors.textSecondary,
    fontSize: FontSizes.md,
  },
  fairnessCountBadge: {
    backgroundColor: Colors.primaryFaded,
    borderRadius: Radius.xs,
    paddingVertical: 2,
    paddingHorizontal: 10,
  },
  fairnessCount: {
    color: Colors.primary,
    fontSize: FontSizes.md,
    fontWeight: "700",
  },

  // Day cards
  dayCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dayTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.lg,
    fontWeight: "700",
    marginBottom: Spacing.md,
  },
  noSlots: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
  },

  // Slot rows
  slotRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 8,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgElevated,
    overflow: "hidden",
  },
  slotNeedsCoverage: {
    backgroundColor: Colors.accentFaded,
  },
  slotAccent: {
    width: 3,
  },
  slotContent: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  slotTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  slotLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  slotTag: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xs,
    paddingVertical: 2,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  slotLabel: {
    color: Colors.textPrimary,
    fontSize: FontSizes.md,
    fontWeight: "600",
  },
  slotTime: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
  },
  slotBottom: {
    marginTop: 2,
  },
  driverName: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  needsCoverage: {
    color: Colors.accent,
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },

  // Swap UI
  cantDriveButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: "center",
    marginBottom: 4,
  },
  cantDriveText: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
    textDecorationLine: "underline",
  },
  swapBanner: {
    backgroundColor: Colors.warmFaded,
    borderRadius: Radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.warmBorder,
  },
  swapBannerText: {
    color: Colors.warm,
    fontSize: FontSizes.sm,
    textAlign: "center",
    fontWeight: "500",
  },
  coverButton: {
    backgroundColor: Colors.infoFaded,
    borderRadius: Radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.infoBorder,
  },
  coverButtonText: {
    color: Colors.info,
    fontSize: FontSizes.sm,
    fontWeight: "700",
  },
  swapCoveredBanner: {
    backgroundColor: Colors.successFaded,
    borderRadius: Radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  swapCoveredText: {
    color: Colors.success,
    fontSize: FontSizes.sm,
    textAlign: "center",
    fontWeight: "500",
  },
});
