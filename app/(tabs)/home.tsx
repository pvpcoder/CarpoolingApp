import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
  Pressable,
} from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { getValidUser, handleLogout } from "../../lib/helpers";
import { deletedGroups } from "../../lib/deletedGroups";
import { useTheme, Fonts, Shadows } from "../../lib/theme";
import { LoadingScreen, PressableScale, FadeIn, TimeBadge, EmptyState, Watermark, TitleRule, ListSection, ListRow } from "../../components/UI";
import { track } from "../../lib/analytics";

interface GroupInfo {
  id: string;
  name: string;
  status: string;
  memberCount: number;
  parentsJoined: number;
  isAdmin: boolean;
  hasAvailability?: boolean;
}

export default function HomeTab() {
  const router = useRouter();
  const c = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState<"student" | "parent" | null>(null);
  const [userName, setUserName] = useState("");
  const [linkedChildren, setLinkedChildren] = useState<{ id: string; name: string }[]>([]);
  const [pickupAddress, setPickupAddress] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [schedulesByGroup, setSchedulesByGroup] = useState<Record<string, any[]>>({});
  const [parentNames, setParentNames] = useState<Record<string, string>>({});
  const [todaySlot, setTodaySlot] = useState<any>(null);
  const [todayDriverName, setTodayDriverName] = useState<string | null>(null);
  const [todayAfternoonSlot, setTodayAfternoonSlot] = useState<any>(null);
  const [todayAfternoonDriverName, setTodayAfternoonDriverName] = useState<string | null>(null);
  const [todayParentSlots, setTodayParentSlots] = useState<any[]>([]);
  const [todayParentGroupName, setTodayParentGroupName] = useState<string | null>(null);
  const [nextDriveDay, setNextDriveDay] = useState<string | null>(null);
  const [nextDriveType, setNextDriveType] = useState<string | null>(null);
  const bodyOpacity = useSharedValue(0);
  const bodySlide = useSharedValue(16);
  const bodyStyle = useAnimatedStyle(() => ({
    opacity: bodyOpacity.value,
    transform: [{ translateY: bodySlide.value }],
  }));

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const user = await getValidUser();
      if (!user) {
        handleLogout(router);
        return;
      }

      const { data: student } = await supabase
        .from("students")
        .select("id, name, saved_pickup_lat, saved_pickup_address")
        .eq("id", user.id)
        .single();

      if (student) {
        setRole("student");
        if (!student.saved_pickup_lat) {
          router.replace("/setup-location");
          return;
        }
        setUserName(student.name?.split(" ")[0] || "");
        setPickupAddress(student.saved_pickup_address || null);
        await loadStudentData(student);
      } else {
        const { data: parent } = await supabase
          .from("parents")
          .select("id, name")
          .eq("id", user.id)
          .single();

        if (parent) {
          setRole("parent");
          setUserName(parent.name?.split(" ")[0] || "");
          await loadParentData(parent);
        }
      }

      setLoading(false);
      setRefreshing(false);
      if (!isRefresh) {
        bodyOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) });
        bodySlide.value = withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) });
      }
    } catch (err: any) {
      setLoading(false);
      setRefreshing(false);
      if (
        err?.message?.includes("Failed to fetch") ||
        err?.message?.includes("Network request failed")
      ) {
        Alert.alert("No Internet", "Please check your internet connection.", [
          { text: "Retry", onPress: () => loadData() },
        ]);
      } else {
        Alert.alert("Error", "Something went wrong.", [
          { text: "Retry", onPress: () => loadData() },
        ]);
      }
    }
  };

  const loadStudentData = async (student: any) => {
    const { data: memberships } = await supabase
      .from("group_members")
      .select(`group_id, role, carpool_groups ( id, name, status )`)
      .eq("student_id", student.id)
      .eq("status", "active");

    const localDeleted = deletedGroups.getAll();
    const groupList: GroupInfo[] = [];

    for (const membership of memberships || []) {
      const group = (membership as any).carpool_groups;
      if (!group || group.status === "deleted" || group.status === "archived") continue;
      if (localDeleted.includes(group.id)) continue;

      const { data: members } = await supabase
        .from("group_members")
        .select("id, parent_id")
        .eq("group_id", group.id)
        .eq("status", "active");

      groupList.push({
        id: group.id,
        name: group.name,
        status: group.status,
        memberCount: (members || []).length,
        parentsJoined: (members || []).filter((m: any) => m.parent_id).length,
        isAdmin: membership.role === "admin",
      });
    }

    const seen = new Set<string>();
    const uniqueGroups = groupList.filter((g) => {
      if (seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    });
    setGroups(uniqueGroups);

    const today = new Date();
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    const weekStart = monday.toISOString().split("T")[0];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const todayName = dayNames[today.getDay()];

    const schedMap: Record<string, any[]> = {};
    const pNames: Record<string, string> = {};

    for (const g of uniqueGroups) {
      const { data: sched } = await supabase
        .from("weekly_schedules")
        .select("id")
        .eq("group_id", g.id)
        .eq("week_start_date", weekStart)
        .single();

      if (sched) {
        const { data: slots } = await supabase
          .from("schedule_slots")
          .select("day_of_week, slot_type, driver_parent_id, departure_time, status")
          .eq("schedule_id", sched.id)
          .order("day_of_week");
        schedMap[g.id] = slots || [];

        const parentIds = (slots || [])
          .map((s: any) => s.driver_parent_id)
          .filter(Boolean);
        if (parentIds.length > 0) {
          const { data: parents } = await supabase
            .from("parents")
            .select("id, name")
            .in("id", parentIds);
          (parents || []).forEach((p: any) => { pNames[p.id] = p.name; });
        }

        const todaySlots = (slots || []).filter((s: any) => s.day_of_week === todayName);
        const morning = todaySlots.find((s: any) => s.slot_type === "morning");
        if (morning?.driver_parent_id && !todaySlot) {
          setTodaySlot(morning);
          setTodayDriverName(pNames[morning.driver_parent_id] || "Assigned");
        }
        const afternoon = todaySlots.find((s: any) => s.slot_type === "afternoon" || s.slot_type === "late_afternoon");
        if (afternoon?.driver_parent_id && !todayAfternoonSlot) {
          setTodayAfternoonSlot(afternoon);
          setTodayAfternoonDriverName(pNames[afternoon.driver_parent_id] || "Assigned");
        }
      }
    }
    setSchedulesByGroup(schedMap);
    setParentNames(pNames);

    const { data: invites } = await supabase
      .from("group_invites")
      .select(
        `id, group_id, status, carpool_groups ( name ), invited_by_student:students!group_invites_invited_by_fkey ( name )`
      )
      .eq("invited_student_id", student.id)
      .eq("status", "pending");

    setPendingInvites(invites || []);
  };

  const loadParentData = async (parent: any) => {
    const { data: links } = await supabase
      .from("parent_student_links")
      .select("students ( id, name )")
      .eq("parent_id", parent.id);

    const children = (links || [])
      .map((l: any) => l.students)
      .filter(Boolean) as { id: string; name: string }[];
    setLinkedChildren(children);
    if (children.length === 0) return;

    const localDeleted = deletedGroups.getAll();
    const groupList: GroupInfo[] = [];

    for (const child of children) {
      const { data: memberships } = await supabase
        .from("group_members")
        .select(`group_id, carpool_groups ( id, name, status )`)
        .eq("student_id", child.id)
        .eq("status", "active");

      for (const membership of memberships || []) {
        const group = (membership as any).carpool_groups;
        if (!group || group.status === "deleted" || group.status === "archived") continue;
        if (localDeleted.includes(group.id)) continue;

        const { data: existingMember } = await supabase
          .from("group_members")
          .select("id")
          .eq("group_id", group.id)
          .eq("student_id", child.id)
          .single();

        if (existingMember) {
          await supabase
            .from("group_members")
            .update({ parent_id: parent.id })
            .eq("id", existingMember.id);
        }

        const { data: members } = await supabase
          .from("group_members")
          .select("id, parent_id")
          .eq("group_id", group.id)
          .eq("status", "active");

        const { data: availability } = await supabase
          .from("parent_availability")
          .select("id")
          .eq("parent_id", parent.id)
          .eq("group_id", group.id)
          .limit(1);

        groupList.push({
          id: group.id,
          name: group.name,
          status: group.status,
          memberCount: (members || []).length,
          parentsJoined: (members || []).filter((m: any) => m.parent_id).length,
          isAdmin: false,
          hasAvailability: (availability || []).length > 0,
        });
      }
    }

    const seen = new Set<string>();
    const uniqueGroups = groupList.filter((g) => {
      if (seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    });
    setGroups(uniqueGroups);

    // Find if parent is driving today
    const today = new Date();
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    const weekStart = monday.toISOString().split("T")[0];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const todayName = dayNames[today.getDay()];

    const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const todayIdx = WEEKDAYS.indexOf(todayName);
    let foundToday = false;
    let foundNext = false;

    for (const g of uniqueGroups) {
      const { data: sched } = await supabase.from("weekly_schedules").select("id").eq("group_id", g.id).eq("week_start_date", weekStart).single();
      if (sched) {
        const { data: allSlots } = await supabase.from("schedule_slots").select("day_of_week, slot_type, driver_parent_id, departure_time").eq("schedule_id", sched.id);
        const mySlots = (allSlots || []).filter((s: any) => s.driver_parent_id === parent.id);

        if (!foundToday) {
          const myTodaySlots = mySlots.filter((s: any) => s.day_of_week === todayName);
          if (myTodaySlots.length > 0) {
            setTodayParentSlots(myTodaySlots);
            setTodayParentGroupName(g.name);
            foundToday = true;
          }
        }

        if (!foundNext) {
          for (const futureDay of WEEKDAYS.slice(todayIdx + 1)) {
            const futureDaySlots = mySlots.filter((s: any) => s.day_of_week === futureDay);
            if (futureDaySlots.length > 0) {
              setNextDriveDay(futureDay);
              setNextDriveType(futureDaySlots[0].slot_type);
              foundNext = true;
              break;
            }
          }
        }
      }
      if (foundToday && foundNext) break;
    }
  };

  const handleInviteResponse = async (
    inviteId: string,
    groupId: string,
    accept: boolean
  ) => {
    try {
      const user = await getValidUser();
      if (!user) {
        handleLogout(router);
        return;
      }
      await supabase
        .from("group_invites")
        .update({ status: accept ? "accepted" : "declined" })
        .eq("id", inviteId);
      if (accept) {
        const { error: joinError } = await supabase.from("group_members").insert({
          group_id: groupId,
          student_id: user.id,
          role: "member",
          status: "active",
        });
        if (joinError) {
          Alert.alert("Error", "Couldn't join the group: " + joinError.message);
          return;
        }
        track(user.id, "group_joined", { group_id: groupId });
        Alert.alert("Joined!", "You're now part of the carpool group.");
      }
      loadData();
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    }
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  if (loading) {
    return <LoadingScreen />;
  }

  const hasGroups = groups.length > 0;

  const studentSteps = [
    { title: "Create or join a carpool group", sub: "Open your group and tap Find Nearby Students" },
    { title: "Each student's parent signs up", sub: "They link to their child's account" },
    { title: "A fair weekly schedule gets built", sub: "Parents set availability, the app handles the rest" },
  ];

  const parentSteps = [
    { title: "Your child creates or joins a group", sub: "They can find nearby students in the Discover tab" },
    { title: "You'll see the group here", sub: "Once they join, your dashboard updates automatically" },
    { title: "Set availability and the app handles the rest", sub: "A fair weekly driving schedule is built automatically" },
  ];

  return (
    <View style={[styles.root, { backgroundColor: c.paper }]}>
      <Watermark />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            tintColor={c.dawn}
          />
        }
      >
      {/* ── Header ── */}
      <FadeIn>
        <View style={styles.header}>
          <Text style={[styles.greeting, { color: c.textMuted, fontFamily: Fonts.bodySemiBold }]}>{getGreeting()}</Text>
          <Text style={[styles.heroName, { color: c.textPrimary, fontFamily: Fonts.display }]}>
            {userName || (role === "student" ? "Student" : "Parent")}
          </Text>
          <TitleRule />
          {role === "parent" && linkedChildren.length > 0 && (
            <Text style={[styles.heroSub, { color: c.textSecondary, fontFamily: Fonts.body }]}>
              Linked to {linkedChildren.map((ch) => ch.name).join(", ")}
            </Text>
          )}
        </View>
      </FadeIn>

      <Animated.View style={[styles.body, bodyStyle]}>
        {/* ── Today's Ride (student: AM + PM) ── */}
        {role === "student" && (todaySlot || todayAfternoonSlot) && (
          <FadeIn>
            <View style={[styles.card, { backgroundColor: c.paperElevated, borderColor: c.line }]}>
              <Text style={[styles.cardLabel, { color: c.dawn, fontFamily: Fonts.bodyBold }]}>TODAY'S RIDE</Text>
              {todaySlot && (
                <View style={styles.todaySlotRow}>
                  <TimeBadge
                    time={todaySlot.departure_time ? todaySlot.departure_time.slice(0, 5) : "AM"}
                    period="morning"
                    pulse
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: c.textPrimary, fontFamily: Fonts.bodyBold }]}>{todayDriverName}</Text>
                    {todaySlot.departure_time && (
                      <Text style={[styles.cardSub, { color: c.textSecondary, fontFamily: Fonts.body }]}>{todaySlot.departure_time.slice(0, 5)} pickup</Text>
                    )}
                  </View>
                </View>
              )}
              {todayAfternoonSlot && (
                <>
                  {todaySlot && <View style={[styles.slotDivider, { backgroundColor: c.line }]} />}
                  <View style={styles.todaySlotRow}>
                    <TimeBadge
                      time={todayAfternoonSlot.departure_time ? todayAfternoonSlot.departure_time.slice(0, 5) : (todayAfternoonSlot.slot_type === "late_afternoon" ? "LATE" : "PM")}
                      period="afternoon"
                      pulse
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: c.textPrimary, fontFamily: Fonts.bodyBold }]}>{todayAfternoonDriverName}</Text>
                      {todayAfternoonSlot.departure_time && (
                        <Text style={[styles.cardSub, { color: c.textSecondary, fontFamily: Fonts.body }]}>{todayAfternoonSlot.departure_time.slice(0, 5)} pickup</Text>
                      )}
                    </View>
                  </View>
                </>
              )}
            </View>
          </FadeIn>
        )}

        {/* ── Parent: am I driving today? ── */}
        {role === "parent" && groups.length > 0 && (
          <FadeIn>
            <View style={[styles.card, {
              backgroundColor: todayParentSlots.length > 0 ? c.dawnFaded : c.paperElevated,
              borderColor: todayParentSlots.length > 0 ? c.dawnBorder : c.line,
            }]}>
              <Text style={[styles.cardLabel, { color: c.dawn, fontFamily: Fonts.bodyBold }]}>YOUR DRIVE TODAY</Text>
              {todayParentSlots.length > 0 ? (
                <>
                  {todayParentGroupName && (
                    <Text style={[styles.cardSub, { color: c.textSecondary, marginBottom: 8, fontFamily: Fonts.body }]}>{todayParentGroupName}</Text>
                  )}
                  {todayParentSlots.map((slot: any, i: number) => (
                    <View key={i} style={i > 0 ? { marginTop: 10 } : {}}>
                      <View style={styles.todaySlotRow}>
                        <TimeBadge
                          time={slot.departure_time ? slot.departure_time.slice(0, 5) : "--:--"}
                          period={slot.slot_type === "morning" ? "morning" : "afternoon"}
                          pulse
                        />
                        <Text style={[styles.cardTitle, { color: c.textPrimary, fontFamily: Fonts.bodyBold }]}>
                          {slot.slot_type === "morning" ? "To school" : slot.slot_type === "afternoon" ? "From school" : "Late pickup"}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              ) : (
                <Text style={[styles.cardTitle, { color: c.textSecondary, fontFamily: Fonts.bodyMedium }]}>Not your turn today</Text>
              )}
            </View>
          </FadeIn>
        )}

        {/* ── No child linked (parent) ── */}
        {role === "parent" && linkedChildren.length === 0 && (
          <FadeIn>
            <View style={[styles.card, { backgroundColor: c.rustFaded, borderColor: c.rustBorder }]}>
              <Text style={[styles.cardTitle, { color: c.textPrimary, fontFamily: Fonts.bodyBold }]}>No child linked</Text>
              <Text style={[styles.cardSub, { color: c.textSecondary, fontFamily: Fonts.body }]}>
                Your account isn't linked to a student yet. Make sure your child signs up first with their school email, then link them from Profile.
              </Text>
            </View>
          </FadeIn>
        )}

        {/* ── Pending Invites ── */}
        {pendingInvites.map((invite: any, idx: number) => (
          <FadeIn key={invite.id} delay={Math.min(idx, 6) * 40}>
            <View style={[styles.card, { backgroundColor: c.paperElevated, borderColor: c.line }]}>
              <View style={styles.inviteRow}>
                <View style={styles.inviteInfo}>
                  <Text style={[styles.cardLabel, { color: c.dawn, fontFamily: Fonts.bodyBold }]}>INVITE</Text>
                  <Text style={[styles.cardTitle, { color: c.textPrimary, fontFamily: Fonts.bodyBold }]}>
                    {invite.carpool_groups?.name || "Carpool Group"}
                  </Text>
                  <Text style={[styles.cardSub, { color: c.textSecondary, fontFamily: Fonts.body }]}>
                    from {(invite.invited_by_student as any)?.name || "a classmate"}
                  </Text>
                </View>
                <View style={styles.inviteActions}>
                  <PressableScale
                    onPress={() => handleInviteResponse(invite.id, invite.group_id, true)}
                    style={[styles.joinBtn, { backgroundColor: c.dawn }]}
                  >
                    <Text style={[styles.joinText, { fontFamily: Fonts.bodySemiBold }]}>Join</Text>
                  </PressableScale>
                  <Pressable
                    onPress={() => handleInviteResponse(invite.id, invite.group_id, false)}
                    hitSlop={12}
                  >
                    <Text style={[styles.declineText, { color: c.textMuted, fontFamily: Fonts.bodyMedium }]}>Decline</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </FadeIn>
        ))}

        {/* ── Next drive this week (parent, not driving today) ── */}
        {role === "parent" && hasGroups && todayParentSlots.length === 0 && nextDriveDay && (
          <FadeIn>
            <View style={[styles.card, { backgroundColor: c.paperElevated, borderColor: c.line }]}>
              <Text style={[styles.cardLabel, { color: nextDriveType === "morning" ? c.dawn : c.dusk, fontFamily: Fonts.bodyBold }]}>NEXT DRIVE</Text>
              <Text style={[styles.cardTitle, { color: c.textPrimary, fontFamily: Fonts.bodyBold }]}>
                {nextDriveDay} {nextDriveType === "morning" ? "morning" : nextDriveType === "afternoon" ? "afternoon" : "late pickup"}
              </Text>
              <Text style={[styles.cardSub, { color: c.textSecondary, fontFamily: Fonts.body }]}>Not your turn today</Text>
            </View>
          </FadeIn>
        )}

        {/* ── Group Cards ── */}
        {hasGroups ? (
          groups.map((g, idx) => (
            <FadeIn key={g.id} delay={Math.min(idx, 6) * 40}>
              <PressableScale
                onPress={() => router.push(`/my-group?groupId=${g.id}`)}
                style={[styles.card, styles.primaryCard, { backgroundColor: c.paperElevated, borderColor: c.line, borderLeftColor: c.dawn }, Shadows?.sm as object]}
              >
                <View style={styles.groupHeader}>
                  <View style={styles.groupMeta}>
                    <Text style={[styles.groupName, { color: c.textPrimary, fontFamily: Fonts.display }]}>{g.name}</Text>
                    <Text style={[styles.groupSub, { color: c.textSecondary, fontFamily: Fonts.body }]}>
                      {g.memberCount} {g.memberCount === 1 ? "family" : "families"}
                      {"  ·  "}
                      {g.parentsJoined} parent{g.parentsJoined !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  <View style={styles.groupRight}>
                    <View style={[
                      styles.statusBadge,
                      { backgroundColor: g.status === "active" ? c.dawnFaded : c.rustFaded },
                    ]}>
                      <Text style={[
                        styles.statusText,
                        { color: g.status === "active" ? c.dawn : c.rust, fontFamily: Fonts.bodyBold },
                      ]}>
                        {g.status === "forming" ? "Forming" : "Active"}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={c.textMuted} style={{ marginTop: 6 }} />
                  </View>
                </View>

                {role === "parent" && (
                  <View style={[styles.groupStatusRow, { borderTopColor: c.line }]}>
                    <Text style={[styles.statusLine, { color: g.hasAvailability ? c.dawn : c.rust, fontFamily: Fonts.bodyMedium }]}>
                      {g.hasAvailability ? "Availability set" : "Availability not set"}
                    </Text>
                    <Text style={[styles.statusLine, { color: g.parentsJoined >= g.memberCount ? c.dawn : c.rust, fontFamily: Fonts.bodyMedium }]}>
                      {g.parentsJoined >= g.memberCount
                        ? "All parents joined"
                        : `${g.memberCount - g.parentsJoined} still need a parent`}
                    </Text>
                  </View>
                )}

                {role === "parent" && !g.hasAvailability && (
                  <PressableScale
                    onPress={() => router.push(`/availability?groupId=${g.id}`)}
                    style={[styles.availCta, { backgroundColor: c.dawn }]}
                  >
                    <Text style={[styles.availCtaText, { fontFamily: Fonts.bodySemiBold }]}>Set your availability</Text>
                    <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
                  </PressableScale>
                )}
              </PressableScale>
            </FadeIn>
          ))
        ) : (
          <EmptyState
            icon="people-outline"
            title="No carpool group yet"
            message={
              role === "student"
                ? "Create a group and invite nearby students, or wait for an invite."
                : "Your child hasn't joined a carpool group yet. They can create or join one from their app."
            }
            actionLabel={role === "student" ? "Create group" : undefined}
            onAction={role === "student" ? () => router.push("/create-group") : undefined}
          />
        )}

        {/* ── Waiting on parents nudge (student) ── */}
        {role === "student" && hasGroups && groups.some((g) => g.parentsJoined < g.memberCount) && (
          <View style={[styles.notice, { borderColor: c.line, backgroundColor: c.paperElevated }]}>
            <Text style={[styles.noticeTitle, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>Waiting on parents</Text>
            <Text style={[styles.noticeText, { color: c.textSecondary, fontFamily: Fonts.body }]}>
              Some families still need a parent to join. Remind them to download the app.
            </Text>
          </View>
        )}

        {/* ── Quick actions (student) ── */}
        {role === "student" && (
          <ListSection style={{ marginTop: 4 }}>
            {groups.find((g) => g.isAdmin) && (
              <ListRow
                label="Find nearby students"
                onPress={() => router.push(`/discover?groupId=${groups.find((g) => g.isAdmin)!.id}`)}
              />
            )}
            <ListRow
              label={hasGroups ? "New group" : "Create a group"}
              onPress={() => router.push("/create-group")}
            />
            {hasGroups && (
              <ListRow
                label="Edit pickup location"
                onPress={() => router.push("/setup-location")}
              />
            )}
          </ListSection>
        )}

        {/* ── How HopIn works (student, no groups) ── */}
        {role === "student" && !hasGroups && (
          <View style={styles.linkSection}>
            <Text style={[styles.sectionLabel, { color: c.textMuted, fontFamily: Fonts.bodyBold }]}>HOW IT WORKS</Text>
            <View style={[styles.stepsCard, { backgroundColor: c.paperElevated, borderColor: c.line }]}>
              {studentSteps.map((step, i) => (
                <View key={i} style={[styles.stepRow, i < studentSteps.length - 1 && { borderBottomColor: c.line, borderBottomWidth: 1 }]}>
                  <Text style={[styles.stepNum, { color: c.dawn, fontFamily: Fonts.mono }]}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stepTitle, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>{step.title}</Text>
                    <Text style={[styles.stepSub, { color: c.textSecondary, fontFamily: Fonts.body }]}>{step.sub}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── What happens next (parent, no groups, child linked) ── */}
        {role === "parent" && !hasGroups && linkedChildren.length > 0 && (
          <View style={styles.linkSection}>
            <Text style={[styles.sectionLabel, { color: c.textMuted, fontFamily: Fonts.bodyBold }]}>WHAT HAPPENS NEXT</Text>
            <View style={[styles.stepsCard, { backgroundColor: c.paperElevated, borderColor: c.line }]}>
              {parentSteps.map((step, i) => (
                <View key={i} style={[styles.stepRow, i < parentSteps.length - 1 && { borderBottomColor: c.line, borderBottomWidth: 1 }]}>
                  <Text style={[styles.stepNum, { color: c.dawn, fontFamily: Fonts.mono }]}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stepTitle, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>{step.title}</Text>
                    <Text style={[styles.stepSub, { color: c.textSecondary, fontFamily: Fonts.body }]}>{step.sub}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 24 }} />
      </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  root: { flex: 1 },
  container: { flex: 1 },
  content: { paddingBottom: 40 },

  header: {
    paddingHorizontal: 28,
    paddingTop: 72,
    paddingBottom: 40,
  },
  greeting: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 6,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
  },
  heroName: {
    fontSize: 48,
    fontWeight: "900",
    letterSpacing: -2,
    lineHeight: 50,
  },
  heroSub: {
    fontSize: 13,
    fontWeight: "400",
    marginTop: 6,
  },

  body: {
    paddingHorizontal: 20,
  },

  card: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
  },
  primaryCard: {
    borderLeftWidth: 3,
  },
  groupStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    marginTop: 12,
  },
  todaySlotRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  slotPill: {
    borderRadius: 5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  slotPillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  slotDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 14,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginBottom: 3,
  },
  cardSub: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
  },

  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  inviteInfo: { flex: 1 },
  inviteActions: {
    alignItems: "center",
    gap: 8,
    marginLeft: 16,
  },
  joinBtn: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  joinText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  declineText: {
    fontSize: 13,
    fontWeight: "500",
  },

  groupHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  groupMeta: { flex: 1, marginRight: 12 },
  groupRight: { alignItems: "flex-end" },
  groupName: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  groupSub: {
    fontSize: 13,
    fontWeight: "400",
  },
  statusBadge: {
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 2,
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: "600",
    width: 52,
    letterSpacing: 0.2,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "400",
    flex: 1,
  },

  availCta: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 10,
    marginBottom: 4,
  },
  availCtaText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    flex: 1,
  },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 10,
    gap: 10,
  },
  actionBtn: {
    paddingVertical: 2,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "600",
  },
  actionDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
    marginBottom: 16,
  },
  primaryBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },

  notice: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  noticeText: {
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 19,
  },

  linkSection: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 2,
  },
  statusLine: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 20,
  },

  stepsCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: "hidden",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    gap: 14,
  },
  stepNum: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 22,
    width: 20,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 3,
    lineHeight: 19,
  },
  stepSub: {
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
  },
});
