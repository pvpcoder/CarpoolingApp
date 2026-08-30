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
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";
import { useTheme, Radius, Fonts } from "../lib/theme";
import { computeBasicSchedule } from "../lib/scheduling";
import { PrimaryButton, SecondaryButton, BackButton, FadeIn, Card, SunArc, ScaleIn } from "../components/UI";
import { track } from "../lib/analytics";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default function WeeklySchedule() {
  const router = useRouter();
  const c = useTheme();

  const { groupId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [schedule, setSchedule] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [parentMap, setParentMap] = useState<Record<string, string>>({});
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isParent, setIsParent] = useState(false);
  const [swapRequests, setSwapRequests] = useState<any[]>([]);
  const [swapVolunteers, setSwapVolunteers] = useState<any[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [justGenerated, setJustGenerated] = useState(false);

  useEffect(() => {
    if (!justGenerated) return;
    const timer = setTimeout(() => setJustGenerated(false), 1600);
    return () => clearTimeout(timer);
  }, [justGenerated]);

  useEffect(() => {
    setLoading(true);
    setSchedule(null);
    setSlots([]);
    setSwapRequests([]);
    setSwapVolunteers([]);
    loadSchedule(weekOffset);
  }, [weekOffset]);

  const getWeekStart = (offset: number) => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + offset * 7);
    return monday.toISOString().split("T")[0];
  };

  const getWeekLabel = (offset: number) => {
    if (offset === 0) return "This week";
    if (offset === -1) return "Last week";
    if (offset === 1) return "Next week";
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + offset * 7);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[monday.getMonth()]} ${monday.getDate()} – ${months[friday.getMonth()]} ${friday.getDate()}`;
  };

  const loadSchedule = async (offset: number = 0) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);
    const { data: parentRow } = await supabase.from("parents").select("id").eq("id", user.id).maybeSingle();
    setIsParent(!!parentRow);
    const { data: memberData } = await supabase.from("group_members").select(`id, student_id, parent_id, students ( name ), parents ( name )`).eq("group_id", groupId).eq("status", "active");
    setMembers(memberData || []);
    const pMap: Record<string, string> = {};
    (memberData || []).forEach((m: any) => { if (m.parent_id && m.parents) pMap[m.parent_id] = m.parents.name; });
    setParentMap(pMap);
    const weekStart = getWeekStart(offset);
    const { data: existing } = await supabase.from("weekly_schedules").select("id, status, week_start_date").eq("group_id", groupId).eq("week_start_date", weekStart).single();
    if (existing) {
      setSchedule(existing);
      const { data: slotData } = await supabase.from("schedule_slots").select("id, day_of_week, slot_type, driver_parent_id, departure_time, status").eq("schedule_id", existing.id).order("day_of_week").order("departure_time");
      setSlots(slotData || []);
      const slotIds = (slotData || []).map((s: any) => s.id);
      if (slotIds.length > 0) {
        const { data: swaps } = await supabase.from("swap_requests").select("id, slot_id, requesting_parent_id, covering_parent_id, status, message").in("slot_id", slotIds);
        setSwapRequests(swaps || []);
        const swapIds = (swaps || []).map((s: any) => s.id);
        if (swapIds.length > 0) {
          const { data: volunteers } = await supabase.from("swap_volunteers").select("id, swap_request_id, parent_id, created_at").in("swap_request_id", swapIds).order("created_at");
          setSwapVolunteers(volunteers || []);
        }
      }
    }
    setLoading(false);
  };

  const generateSchedule = async () => {
    setGenerating(true);
    setAiExplanation(null);
    const { data: availability } = await supabase.from("parent_availability").select("parent_id, day_of_week, can_drive_morning, can_drive_afternoon").eq("group_id", groupId);
    if (!availability || availability.length === 0) {
      setGenerating(false);
      Alert.alert("No availability set", "No parents have set their driving availability yet.");
      return;
    }
    const { data: exceptions } = await supabase.from("student_exceptions").select("student_id, day_of_week, exception_type, custom_pickup_time, reason").eq("group_id", groupId).eq("is_recurring", true);
    const { data: groupRow } = await supabase.from("carpool_groups").select("consolidate_late_pickups, morning_departure_time, afternoon_pickup_time").eq("id", groupId).single();
    const consolidate = !!groupRow?.consolidate_late_pickups;
    const morningTime = groupRow?.morning_departure_time ? groupRow.morning_departure_time.slice(0, 5) + ":00" : "07:30:00";
    const afternoonTime = groupRow?.afternoon_pickup_time ? groupRow.afternoon_pickup_time.slice(0, 5) + ":00" : "14:45:00";
    const formatClock = (t: string) => {
      const [h, m] = t.split(":");
      const hour = parseInt(h, 10);
      const ampm = hour >= 12 ? "PM" : "AM";
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      return `${displayHour}:${m} ${ampm}`;
    };
    const morningLabel = formatClock(morningTime);
    const afternoonLabel = formatClock(afternoonTime);
    const familyInfo = members.map((m: any) => ({ student_name: m.students?.name || "Unknown", parent_name: m.parents?.name || "Unknown", parent_id: m.parent_id, student_id: m.student_id }));
    const availabilityInfo = availability.map((a: any) => ({ parent_id: a.parent_id, parent_name: parentMap[a.parent_id] || "Parent", day: a.day_of_week, can_morning: a.can_drive_morning, can_afternoon: a.can_drive_afternoon }));
    const exceptionInfo = (exceptions || []).map((e: any) => { const family = familyInfo.find((f) => f.student_id === e.student_id); return { student_name: family?.student_name || "Student", parent_id: family?.parent_id || null, parent_name: family?.parent_name || "Unknown", day: e.day_of_week, type: e.exception_type, pickup_time: e.custom_pickup_time, reason: e.reason }; });
    const lateRule = consolidate
      ? `   - If ONE OR MORE students have a late_pickup exception that day (and the group has NOT consolidated for that student — see below) → add a SINGLE "late_afternoon" slot for the whole group (everyone waits together for one trip), assigned FAIRLY among available parents. Do NOT add a separate normal "afternoon" slot on top of it, and do NOT force it to be the late student's own parent — fairness applies.\n   - EXCEPTION: any student with a "needs_normal_pickup" exception that day opts OUT of the shared late trip — MANDATORY: assign that specific student's own parent as the driver for their own separate normal "afternoon" slot at ${afternoonLabel}, regardless of availability or fairness. They are then excluded from the shared late trip.`
      : `   - If EXACTLY ONE student has a late_pickup exception that day → MANDATORY: assign that student's own parent (use their parent_id from the exceptions list) as the driver for the "late_afternoon" slot — do not override this with fairness. Also add a normal "afternoon" slot for the remaining students, assigned fairly to other parents.\n   - If 2 OR MORE students have late_pickup exceptions that day → add a "late_afternoon" slot assigned fairly among all available parents based on driving count`;
    const prompt = `You are a carpool scheduling assistant. Create a fair weekly driving schedule for a carpool group.\n\nFAMILIES IN THE GROUP:\n${familyInfo.map((f) => `- ${f.student_name} (student) + ${f.parent_name} (parent, ID: ${f.parent_id})`).join("\n")}\n\nGROUP PREFERENCE: ${consolidate ? "This group PREFERS to consolidate late pickups into a single shared trip rather than splitting into two trips (see Rule 2)." : "This group prefers separate trips (does not consolidate late pickups)."}\n\nPARENT DRIVING AVAILABILITY:\n${availabilityInfo.map((a) => `- ${a.parent_name} (${a.parent_id}): ${a.day} — Morning: ${a.can_morning ? "YES" : "NO"}, Afternoon: ${a.can_afternoon ? "YES" : "NO"}`).join("\n")}\n\nSTUDENT SCHEDULE EXCEPTIONS:\n${exceptionInfo.length > 0 ? exceptionInfo.map((e) => `- ${e.student_name} (parent ID: ${e.parent_id}): ${e.day} — ${e.type}${e.pickup_time ? ` at ${e.pickup_time}` : ""}${e.reason ? ` (${e.reason})` : ""}`).join("\n") : "None"}\n\nRULES:\n1. Every weekday needs a morning slot (to school, departure_time ${morningTime}, ${morningLabel})\n2. For afternoon/late pickups, follow this logic EXACTLY:\n   - If NO students have a late_pickup exception that day → add ONE normal "afternoon" slot at departure_time ${afternoonTime} (${afternoonLabel}), assigned fairly\n${lateRule}\n   - If ALL students have a late_pickup exception that day (and the group does not consolidate) → add ONLY a "late_afternoon" slot (no regular afternoon slot)\n3. A parent can ONLY drive a slot if they marked it as available for that day. Exception: any MANDATORY forced-parent assignment in Rule 2 overrides availability — if that parent isn't available, still assign them (they agreed to pick up their own child).\n4. Split driving as FAIRLY as possible across all other slots — each parent should drive roughly the same number of slots\n5. If a student has a "no_ride" exception, they don't need ANY pickup that day (but others still do)\n6. If ALL students have "no_ride" on the same day, skip the afternoon slot entirely\n7. If no parent is available for a slot (and it's not a mandatory forced-parent case), mark driver_parent_id as null\n\nTOTAL STUDENTS IN GROUP: ${familyInfo.length}\n\nRespond with ONLY valid JSON in this exact format, no other text:\n{\n  "slots": [\n    {\n      "day_of_week": "Mon",\n      "slot_type": "morning",\n      "driver_parent_id": "parent-uuid-here",\n      "departure_time": "${morningTime}"\n    }\n  ],\n  "explanation": "Brief explanation of how you split the driving fairly"\n}`;
    try {
      const response = await supabase.functions.invoke("generate-schedule", { body: { prompt } });
      if (response.error) throw new Error(response.error.message);
      const data = response.data;
      if (data.error) throw new Error(data.error.message || "API error");
      const text = data.choices?.[0]?.message?.content || "";
      const cleaned = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (!parsed.slots || !Array.isArray(parsed.slots)) throw new Error("Invalid response format");
      setAiExplanation(parsed.explanation || null);
      const today = new Date();
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const weekStart = monday.toISOString().split("T")[0];
      const { data: oldSchedule } = await supabase.from("weekly_schedules").select("id").eq("group_id", groupId).eq("week_start_date", weekStart).single();
      if (oldSchedule) {
        await supabase.from("schedule_slots").delete().eq("schedule_id", oldSchedule.id);
        await supabase.from("weekly_schedules").delete().eq("id", oldSchedule.id);
      }
      const { data: newSchedule, error: schedError } = await supabase.from("weekly_schedules").insert({ group_id: groupId, week_start_date: weekStart, status: "published", generated_by: "ai" }).select("id").single();
      if (schedError || !newSchedule) throw new Error(schedError?.message || "Failed to create schedule");
      const slotsToInsert = parsed.slots.map((s: any) => ({ schedule_id: newSchedule.id, day_of_week: s.day_of_week, slot_type: s.slot_type, driver_parent_id: s.driver_parent_id || null, departure_time: s.departure_time, status: s.driver_parent_id ? "confirmed" : "needs_coverage" }));
      const { error: slotError } = await supabase.from("schedule_slots").insert(slotsToInsert);
      if (slotError) throw new Error(slotError.message);
      await supabase.from("carpool_groups").update({ status: "active" }).eq("id", groupId).eq("status", "forming");
      setGenerating(false);
      setJustGenerated(true);
      track(currentUserId, "schedule_generated", { group_id: groupId, method: "ai" });
      Alert.alert("Schedule generated", "A fair driving schedule has been created for your group.");
      loadSchedule();
    } catch (err: any) {
      setGenerating(false);
      Alert.alert("AI unavailable", "Couldn't reach the AI. Use the basic scheduler instead?", [
        { text: "Cancel" },
        { text: "Use basic", onPress: () => generateBasicSchedule() },
      ]);
    }
  };

  const generateBasicSchedule = async () => {
    setGenerating(true);
    const { data: availability } = await supabase.from("parent_availability").select("parent_id, day_of_week, can_drive_morning, can_drive_afternoon").eq("group_id", groupId);
    const { data: exceptions } = await supabase.from("student_exceptions").select("student_id, day_of_week, exception_type, custom_pickup_time").eq("group_id", groupId).eq("is_recurring", true);
    const { data: groupRow } = await supabase.from("carpool_groups").select("consolidate_late_pickups, morning_departure_time, afternoon_pickup_time").eq("id", groupId).single();
    const newSlots = computeBasicSchedule(
      DAYS,
      availability || [],
      exceptions || [],
      members,
      !!groupRow?.consolidate_late_pickups,
      groupRow?.morning_departure_time ? groupRow.morning_departure_time.slice(0, 5) + ":00" : "07:30:00",
      groupRow?.afternoon_pickup_time ? groupRow.afternoon_pickup_time.slice(0, 5) + ":00" : "14:45:00"
    );
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const weekStart = monday.toISOString().split("T")[0];
    const { data: oldSchedule } = await supabase.from("weekly_schedules").select("id").eq("group_id", groupId).eq("week_start_date", weekStart).single();
    if (oldSchedule) { await supabase.from("schedule_slots").delete().eq("schedule_id", oldSchedule.id); await supabase.from("weekly_schedules").delete().eq("id", oldSchedule.id); }
    const { data: newSchedule } = await supabase.from("weekly_schedules").insert({ group_id: groupId, week_start_date: weekStart, status: "published", generated_by: "manual" }).select("id").single();
    if (newSchedule) { await supabase.from("schedule_slots").insert(newSlots.map((s) => ({ ...s, schedule_id: newSchedule.id }))); }
    await supabase.from("carpool_groups").update({ status: "active" }).eq("id", groupId).eq("status", "forming");
    setGenerating(false);
    setJustGenerated(true);
    track(currentUserId, "schedule_generated", { group_id: groupId, method: "basic" });
    setAiExplanation("Generated using basic fair-split algorithm.");
    loadSchedule();
  };

  const handleRequestSwap = async (slotId: string) => {
    if (!currentUserId) return;
    Alert.alert("Request swap", "This will notify other parents that you need someone to cover this slot.", [
      { text: "Cancel" },
      { text: "Request swap", onPress: async () => {
        const { error } = await supabase.from("swap_requests").insert({ slot_id: slotId, requesting_parent_id: currentUserId, status: "open", message: "Can someone cover this slot?" });
        if (error) { Alert.alert("Error", error.message); return; }
        track(currentUserId, "swap_requested", { group_id: groupId, slot_id: slotId });
        notifyGroupMembers(groupId as string, currentUserId!, "Swap Request", `${parentMap[currentUserId!] || "A parent"} needs someone to cover a driving slot.`, "swap");
        Alert.alert("Swap requested", "Other parents will see your request.");
        loadSchedule();
      }},
    ]);
  };

  const handleClaimSlot = async (slot: any) => {
    if (!currentUserId) return;
    Alert.alert("Drive this slot", "You'll be assigned as the driver for this slot.", [
      { text: "Cancel" },
      { text: "I'll drive it", onPress: async () => {
        const { data, error } = await supabase
          .from("schedule_slots")
          .update({ driver_parent_id: currentUserId, status: "confirmed" })
          .eq("id", slot.id)
          .is("driver_parent_id", null)
          .select("id");
        if (error) { Alert.alert("Error", error.message); return; }
        if (!data || data.length === 0) {
          Alert.alert("Too late", "Another parent already claimed this slot.");
          loadSchedule();
          return;
        }
        track(currentUserId, "slot_claimed", { group_id: groupId, slot_id: slot.id });
        notifyGroupMembers(groupId as string, currentUserId!, "Slot Covered", `${parentMap[currentUserId!] || "A parent"} is now driving a slot that needed a driver.`, "swap");
        Alert.alert("Thanks!", "You've been assigned as the driver for this slot.");
        loadSchedule();
      }},
    ]);
  };

  const handleCoverSwap = async (swapId: string) => {
    if (!currentUserId) return;
    Alert.alert("Cover this slot", "You'll be assigned as the driver for this slot.", [
      { text: "Cancel" },
      { text: "I'll cover it", onPress: async () => {
        const { error } = await supabase.rpc("claim_swap", { swap_id: swapId });
        if (error) {
          if (error.message?.includes("already_covered")) {
            Alert.alert("Too late", "Another parent already covered this slot.");
          } else {
            Alert.alert("Error", error.message);
          }
          loadSchedule();
          return;
        }
        track(currentUserId, "swap_covered", { group_id: groupId, swap_id: swapId });
        notifyGroupMembers(groupId as string, currentUserId!, "Swap Covered", `${parentMap[currentUserId!] || "A parent"} is covering the slot.`, "swap");
        Alert.alert("Thanks!", "You've been assigned as the driver for this slot.");
        loadSchedule();
      }},
    ]);
  };

  const handleVolunteer = async (swapId: string) => {
    if (!currentUserId) return;
    const { error } = await supabase.from("swap_volunteers").insert({ swap_request_id: swapId, parent_id: currentUserId });
    if (error) { Alert.alert("Error", error.message); return; }
    Alert.alert("You're on the backup list", "If the current driver can't make it, you'll be assigned automatically.");
    loadSchedule();
  };

  const handleReleaseSwap = async (swapId: string) => {
    if (!currentUserId) return;
    Alert.alert("Can't drive anymore?", "If a backup volunteered, they'll be assigned automatically. Otherwise the slot goes back to needing coverage.", [
      { text: "Cancel" },
      { text: "Release slot", style: "destructive", onPress: async () => {
        const { error } = await supabase.rpc("release_swap", { swap_id: swapId });
        if (error) { Alert.alert("Error", error.message); return; }
        notifyGroupMembers(groupId as string, currentUserId!, "Swap Update", `${parentMap[currentUserId!] || "A parent"} can no longer cover a slot.`, "swap");
        loadSchedule();
      }},
    ]);
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${m} ${ampm}`;
  };

  const getSlotLabel = (type: string) => {
    switch (type) {
      case "morning": return "To school";
      case "afternoon": return "From school";
      case "late_afternoon": return "Late pickup";
      default: return type;
    }
  };

  const getSlotTag = (type: string) => {
    switch (type) { case "morning": return "AM"; case "afternoon": return "PM"; case "late_afternoon": return "Late"; default: return type; }
  };

  const isMorningSlot = (type: string) => type === "morning";

  const driverCounts: Record<string, number> = {};
  slots.forEach((s: any) => { if (s.driver_parent_id) driverCounts[s.driver_parent_id] = (driverCounts[s.driver_parent_id] || 0) + 1; });

  const renderSlotRow = (slot: any) => {
    const morning = isMorningSlot(slot.slot_type);
    const tagColor = morning ? c.dawn : c.dusk;
    const tagBg = morning ? c.dawnFaded : c.duskFaded;
    const needsCoverage = slot.status === "needs_coverage";
    return (
      <View key={slot.id} style={[styles.slotRow, { backgroundColor: needsCoverage ? c.rustFaded : c.paperElevated, borderColor: c.line }]}>
        <View style={styles.slotLeft}>
          <View style={[styles.slotTag, { backgroundColor: tagBg }]}>
            <Text style={[styles.slotTagText, { color: tagColor, fontFamily: Fonts.bodySemiBold }]}>{getSlotTag(slot.slot_type)}</Text>
          </View>
        </View>
        <View style={styles.slotMiddle}>
          <Text style={[styles.slotLabel, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>{getSlotLabel(slot.slot_type)}</Text>
          {slot.driver_parent_id ? (
            <Text style={[styles.driverName, { color: tagColor, fontFamily: Fonts.bodySemiBold }]}>{parentMap[slot.driver_parent_id] || "Assigned"}</Text>
          ) : (
            <Text style={[styles.needsDriver, { color: c.rust, fontFamily: Fonts.bodySemiBold }]}>Needs a driver</Text>
          )}
        </View>
        <Text style={[styles.slotTime, { color: c.textMuted, fontFamily: Fonts.mono }]}>{formatTime(slot.departure_time)}</Text>
      </View>
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.paper }]}
      contentContainerStyle={styles.content}
    >
      <BackButton onPress={() => router.back()} />

      <View style={styles.weekNav}>
        <Pressable
          onPress={() => setWeekOffset(prev => prev - 1)}
          style={styles.weekNavBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color={c.dawn} />
        </Pressable>
        <Text style={[styles.weekLabel, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>{getWeekLabel(weekOffset)}</Text>
        <Pressable
          onPress={() => setWeekOffset(prev => prev + 1)}
          style={styles.weekNavBtn}
          hitSlop={12}
        >
          <Ionicons name="chevron-forward" size={22} color={c.dawn} />
        </Pressable>
      </View>

      {loading ? (
        <View style={{ paddingTop: 40, alignItems: "center" }}>
          <ActivityIndicator color={c.dawn} />
        </View>
      ) : !schedule ? (
        <Card style={styles.emptyCard}>
          <Text style={[styles.emptyTitle, { color: c.textPrimary, fontFamily: Fonts.displaySemiBold }]}>No schedule yet</Text>
          <Text style={[styles.emptyText, { color: c.textSecondary, fontFamily: Fonts.body }]}>
            The app will analyse everyone's availability and create a fair driving rotation.
          </Text>
          {isParent ? (
            <PrimaryButton title="Generate schedule" onPress={generateSchedule} loading={generating} />
          ) : (
            <Text style={[styles.emptyText, { color: c.textMuted, fontFamily: Fonts.body }]}>
              Ask a parent in your group to generate the schedule.
            </Text>
          )}
        </Card>
      ) : (
        <>
          {justGenerated && (
            <ScaleIn style={styles.celebrationWrap}>
              <SunArc size={56} animated />
            </ScaleIn>
          )}

          {/* AI explanation */}
          {aiExplanation && (
            <View style={[styles.explanationCard, { backgroundColor: c.dawnFaded, borderColor: c.dawnBorder }]}>
              <Text style={[styles.explanationText, { color: c.textSecondary, fontFamily: Fonts.body }]}>{aiExplanation}</Text>
            </View>
          )}

          {/* Driving split */}
          {Object.keys(driverCounts).length > 0 && (
            <View style={[styles.splitCard, { backgroundColor: c.paperElevated, borderColor: c.line }]}>
              <Text style={[styles.splitLabel, { color: c.textMuted, fontFamily: Fonts.bodySemiBold }]}>DRIVING SPLIT</Text>
              {Object.entries(driverCounts).map(([parentId, count]) => (
                <View key={parentId} style={styles.splitRow}>
                  <Text style={[styles.splitName, { color: c.textSecondary, fontFamily: Fonts.body }]}>{parentMap[parentId] || "Parent"}</Text>
                  <View style={[styles.splitCount, { backgroundColor: c.dawnFaded }]}>
                    <Text style={[styles.splitCountText, { color: c.dawn, fontFamily: Fonts.mono }]}>{count}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Day-by-day */}
          {DAYS.map((day, i) => {
            const daySlots = slots.filter((s: any) => s.day_of_week === day);
            const amSlots = daySlots.filter((s: any) => isMorningSlot(s.slot_type));
            const pmSlots = daySlots.filter((s: any) => !isMorningSlot(s.slot_type));
            return (
              <FadeIn key={day} delay={Math.min(i, 6) * 40}>
                <View style={[styles.dayCard, { backgroundColor: c.paperElevated, borderColor: c.line }]}>
                  <Text style={[styles.dayTitle, { color: c.textPrimary, fontFamily: Fonts.displaySemiBold }]}>{day}</Text>
                  {daySlots.length === 0 ? (
                    <Text style={[styles.noSlots, { color: c.textMuted, fontFamily: Fonts.body }]}>No rides scheduled</Text>
                  ) : (
                    <>
                      {amSlots.map(renderSlotRow)}
                      {amSlots.length > 0 && pmSlots.length > 0 && (
                        <View style={styles.sunArcDivider}>
                          <SunArc size={20} />
                        </View>
                      )}
                      {pmSlots.map(renderSlotRow)}
                    </>
                  )}

                  {/* Swap actions per day */}
                  {daySlots.map((slot: any) => {
                    const swap = swapRequests.find((s: any) => s.slot_id === slot.id);
                    const isMySlot = slot.driver_parent_id === currentUserId;
                    if (swap && swap.status === "open") {
                      if (swap.requesting_parent_id === currentUserId) {
                        return (
                          <View key={`swap-${slot.id}`} style={[styles.swapNote, { backgroundColor: c.rustFaded }]}>
                            <Text style={[styles.swapNoteText, { color: c.rust, fontFamily: Fonts.bodyMedium }]}>Swap requested — waiting for coverage</Text>
                          </View>
                        );
                      } else {
                        return (
                          <TouchableOpacity key={`swap-${slot.id}`} style={[styles.coverBtn, { borderColor: c.dawn }]} onPress={() => handleCoverSwap(swap.id)} activeOpacity={0.7}>
                            <Text style={[styles.coverBtnText, { color: c.dawn, fontFamily: Fonts.bodySemiBold }]}>Cover {getSlotLabel(slot.slot_type)} on {slot.day_of_week}</Text>
                          </TouchableOpacity>
                        );
                      }
                    } else if (swap && swap.status === "covered") {
                      const covered = isMorningSlot(slot.slot_type);
                      const isCoveringParent = swap.covering_parent_id === currentUserId;
                      const iAmVolunteering = swapVolunteers.some((v: any) => v.swap_request_id === swap.id && v.parent_id === currentUserId);
                      const backupCount = swapVolunteers.filter((v: any) => v.swap_request_id === swap.id).length;
                      return (
                        <View key={`swap-${slot.id}`}>
                          <View style={[styles.swapNote, { backgroundColor: covered ? c.dawnFaded : c.duskFaded }]}>
                            <Text style={[styles.swapNoteText, { color: covered ? c.dawn : c.dusk, fontFamily: Fonts.bodyMedium }]}>Covered by {parentMap[swap.covering_parent_id] || "another parent"}</Text>
                          </View>
                          {isCoveringParent && (
                            <TouchableOpacity onPress={() => handleReleaseSwap(swap.id)} activeOpacity={0.7} style={{ paddingTop: 2, paddingBottom: 6 }}>
                              <Text style={[styles.cantDrive, { color: c.textMuted, fontFamily: Fonts.bodyMedium }]}>Can't drive this slot after all?</Text>
                            </TouchableOpacity>
                          )}
                          {!isCoveringParent && swap.requesting_parent_id !== currentUserId && (
                            iAmVolunteering ? (
                              <Text style={[styles.cantDrive, { color: c.textMuted, fontFamily: Fonts.bodyMedium, textDecorationLine: "none", paddingBottom: 6 }]}>
                                You're a backup{backupCount > 1 ? ` (${backupCount} on the list)` : ""}
                              </Text>
                            ) : (
                              <TouchableOpacity onPress={() => handleVolunteer(swap.id)} activeOpacity={0.7} style={{ paddingBottom: 6 }}>
                                <Text style={[styles.cantDrive, { color: c.textMuted, fontFamily: Fonts.bodyMedium }]}>Volunteer as backup</Text>
                              </TouchableOpacity>
                            )
                          )}
                        </View>
                      );
                    } else if (isMySlot && !swap) {
                      return (
                        <TouchableOpacity key={`swap-${slot.id}`} onPress={() => handleRequestSwap(slot.id)} activeOpacity={0.7} style={{ paddingTop: 6 }}>
                          <Text style={[styles.cantDrive, { color: c.textMuted, fontFamily: Fonts.bodyMedium }]}>Can't drive this slot?</Text>
                        </TouchableOpacity>
                      );
                    } else if (isParent && slot.status === "needs_coverage" && !slot.driver_parent_id) {
                      return (
                        <TouchableOpacity key={`claim-${slot.id}`} style={[styles.coverBtn, { borderColor: c.rust }]} onPress={() => handleClaimSlot(slot)} activeOpacity={0.7}>
                          <Text style={[styles.coverBtnText, { color: c.rust, fontFamily: Fonts.bodySemiBold }]}>I'll drive {getSlotLabel(slot.slot_type)} on {slot.day_of_week}</Text>
                        </TouchableOpacity>
                      );
                    }
                    return null;
                  })}
                </View>
              </FadeIn>
            );
          })}

          {isParent && (
            <SecondaryButton title="Regenerate schedule" onPress={generateSchedule} loading={generating} style={styles.regenerateBtn} />
          )}
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  weekNavBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  weekLabel: {
    fontSize: 17,
    letterSpacing: -0.3,
  },
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 48 },

  emptyCard: {
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },

  explanationCard: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 16,
    marginBottom: 16,
  },
  explanationText: { fontSize: 13, lineHeight: 19 },

  splitCard: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: 16,
    marginBottom: 16,
  },
  splitLabel: { fontSize: 10, letterSpacing: 0.8, marginBottom: 10 },
  splitRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  splitName: { fontSize: 14 },
  splitCount: { borderRadius: 6, paddingVertical: 2, paddingHorizontal: 10 },
  splitCountText: { fontSize: 13 },

  dayCard: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: 16,
    marginBottom: 12,
  },
  dayTitle: { fontSize: 15, letterSpacing: -0.2, marginBottom: 12 },
  noSlots: { fontSize: 13 },

  sunArcDivider: { alignItems: "center", marginVertical: 6 },

  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 10,
  },
  slotLeft: { alignItems: "center" },
  slotTag: { borderRadius: 5, paddingVertical: 3, paddingHorizontal: 8 },
  slotTagText: { fontSize: 10, letterSpacing: 0.4 },
  slotMiddle: { flex: 1 },
  slotLabel: { fontSize: 14, marginBottom: 2 },
  driverName: { fontSize: 12 },
  needsDriver: { fontSize: 12 },
  slotTime: { fontSize: 12 },

  swapNote: {
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
  },
  swapNoteText: { fontSize: 12, textAlign: "center" },
  coverBtn: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 4,
  },
  coverBtnText: { fontSize: 13 },
  cantDrive: { fontSize: 12, textDecorationLine: "underline", textAlign: "center" },

  regenerateBtn: { marginTop: 4 },

  celebrationWrap: { alignItems: "center", marginBottom: 16 },
});
